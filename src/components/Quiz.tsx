import { Dispatch, useEffect, useMemo, useRef, useState } from 'react'
import { Action, AnswerEvent, QuestPartial, State } from '../engine/store'
import { buildSession, isRepeatReview, Question } from '../engine/scheduler'
import { distractors, shuffle } from '../engine/facts'
import { sfx } from '../engine/audio'
import ArrayModel from './ArrayModel'
import Numpad from './Numpad'

type Phase = 'ask' | 'right' | 'wrong' | 'idk' | 'slip'

/** Small reward for saying "I don't know" instead of guessing. */
const IDK_XP = 2

const MAX_REASKS = 2
const MAX_QUESTIONS = 14

export default function Quiz({ state, dispatch, onFinish, onQuit }: {
  state: State
  dispatch: Dispatch<Action>
  onFinish: (r: QuestPartial) => void
  onQuit: () => void
}) {
  const [queue, setQueue] = useState<Question[]>(() => buildSession(state.cards, state.stagesOpen, state.settings.answerMode).questions)
  const [index, setIndex] = useState(0)
  const [phase, setPhase] = useState<Phase>('ask')
  const [typed, setTyped] = useState('')
  const [answers, setAnswers] = useState<AnswerEvent[]>([])
  const [xp, setXp] = useState(0)
  const [gain, setGain] = useState(0)
  const [runStreak, setRunStreak] = useState(0)
  const [fastCount, setFastCount] = useState(0)
  const reasks = useRef<Record<string, number>>({})
  const startedAt = useRef(Date.now())
  const firstKeyAt = useRef<number | null>(null)
  const finishedRef = useRef(false)
  /** One "that was a slip, let me try again" per question, before the answer is revealed. */
  const slipUsed = useRef(false)
  const pendingWrong = useRef<{ seconds: number; repeat: boolean } | null>(null)

  const q = queue[index]
  const options = useMemo(() => (q ? shuffle([q.fact.product, ...distractors(q.fact)]) : []), [q])
  const [showHint, setShowHint] = useState(false)

  useEffect(() => {
    startedAt.current = Date.now()
    firstKeyAt.current = null
    slipUsed.current = false
    pendingWrong.current = null
    setTyped('')
    setShowHint(false)
  }, [index])

  const onTyped = (v: string) => {
    if (firstKeyAt.current === null && v) firstKeyAt.current = Date.now()
    setTyped(v)
  }

  // Finish when we run out of questions.
  useEffect(() => {
    if (index >= queue.length && !finishedRef.current) {
      finishedRef.current = true
      // Stars: accuracy over answered questions. "I don't know" isn't a wrong guess, so it doesn't
      // count against accuracy, but a quest with any unknowns can't be perfect.
      const firstTries = answers.filter((a) => a.firstTry)
      const answered = firstTries.filter((a) => !a.idk)
      const anyIdk = firstTries.some((a) => a.idk)
      const acc = answered.length ? answered.filter((a) => a.correct).length / answered.length : 0
      const stars = Math.min(anyIdk ? 2 : 3, acc === 1 ? 3 : acc >= 0.75 ? 2 : 1)
      // Completion bonus scales with how much of the quest was fresh material.
      const freshShare = firstTries.length ? firstTries.filter((a) => !a.repeat).length / firstTries.length : 0
      const bonus = Math.round((stars === 3 ? 20 : stars === 2 ? 10 : 0) * freshShare)
      onFinish({ answers, xpEarned: xp + bonus, stars, fastCount })
    }
  }, [index, queue.length, answers, xp, fastCount, onFinish])

  if (!q) return <div className="screen center"><div className="hero">🌱</div></div>

  const left = q.flipped ? q.fact.b : q.fact.a
  const right = q.flipped ? q.fact.a : q.fact.b

  const submit = (value: number | 'idk') => {
    if (phase !== 'ask') return
    // Retrieval latency: time until he started answering, so typing speed doesn't count against him.
    const seconds = ((firstKeyAt.current ?? Date.now()) - startedAt.current) / 1000
    const idk = value === 'idk'
    const correct = value === q.fact.product
    const firstTry = !q.reask
    // Already reviewed this sitting: still good practice, but it's not new learning, so it pays less.
    // (A re-ask inherits the flag from its first asking, since the miss itself updated the card.)
    const repeat = q.reask ? !!q.wasRepeat : isRepeatReview(state.cards[q.fact.id])
    // A wrong answer on a first asking gets one chance to be called a slip (misclick) and retried
    // before the answer is revealed. Nothing is recorded until he chooses or retries.
    if (!correct && !idk && firstTry && !slipUsed.current) {
      pendingWrong.current = { seconds, repeat }
      sfx.tap()
      setPhase('slip')
      return
    }

    const ev: AnswerEvent = { factId: q.fact.id, correct, seconds, firstTry, repeat, idk }
    dispatch({ type: 'answer', event: ev })
    setAnswers((a) => [...a, ev])

    if (correct) {
      const fast = seconds < 4
      const earned = !firstTry ? (repeat ? 2 : 5) : repeat ? 3 : 10 + (fast ? 5 : 0) + Math.min(runStreak, 5) * 2
      setGain(earned)
      setXp((x) => x + earned)
      setRunStreak((s) => s + 1)
      if (fast && firstTry && !repeat) setFastCount((n) => n + 1)
      sfx.correct()
      setPhase('right')
      window.setTimeout(() => { setPhase('ask'); setIndex((i) => i + 1) }, 900)
    } else {
      setRunStreak(0)
      if (idk) { setGain(IDK_XP); setXp((x) => x + IDK_XP); sfx.tap(); setPhase('idk') }
      else { sfx.wrong(); setPhase('wrong') }
      scheduleReask(repeat)
    }
  }

  /** Re-ask a missed fact a few questions later (expanding retrieval within the session). */
  const scheduleReask = (repeat: boolean) => {
    const n = reasks.current[q.fact.id] ?? 0
    if (n < MAX_REASKS && queue.length < MAX_QUESTIONS) {
      reasks.current[q.fact.id] = n + 1
      setQueue((qq) => {
        const copy = [...qq]
        const at = Math.min(copy.length, index + 3)
        copy.splice(at, 0, { ...q, reask: true, wasRepeat: repeat, isNew: false, flipped: !q.flipped && q.fact.a !== q.fact.b, format: 'type' })
        return copy
      })
    }
  }

  /** He chose "show me" on the slip screen: record the miss as usual. */
  const revealWrong = () => {
    const p = pendingWrong.current ?? { seconds: 0, repeat: false }
    const ev: AnswerEvent = { factId: q.fact.id, correct: false, seconds: p.seconds, firstTry: true, repeat: p.repeat, idk: false }
    dispatch({ type: 'answer', event: ev })
    setAnswers((a) => [...a, ev])
    setRunStreak(0)
    sfx.wrong()
    setPhase('wrong')
    scheduleReask(p.repeat)
  }

  /** He says it was a slip: one fresh attempt, answer still hidden. A second miss counts. */
  const retrySlip = () => {
    slipUsed.current = true
    setTyped('')
    firstKeyAt.current = null
    sfx.tap()
    setPhase('ask')
  }

  const progress = Math.min(1, index / queue.length)

  return (
    <div className={`screen quiz ${phase}`}>
      <header className="quiz-top">
        <button className="icon-btn" onClick={() => { sfx.tap(); onQuit() }} aria-label="Quit">✕</button>
        <div className="bar big-bar"><div className="bar-fill" style={{ width: `${progress * 100}%` }} /></div>
        <div className="xp-pill">✨ {xp}</div>
      </header>

      {q.isNew && phase === 'ask' && (
        <div className="callout">
          <div className="callout-title">🌱 New fact!</div>
          <div>{left} × {right} means <b>{left} {left === 1 ? 'group' : 'groups'} of {right}</b></div>
          <ArrayModel rows={left} cols={right} small />
        </div>
      )}

      <div className="question">
        <span>{left}</span><span className="op">×</span><span>{right}</span>
        <span className="op">=</span>
        <span className={`answer-box ${typed ? '' : 'empty'}`}>
          {phase === 'wrong' || phase === 'idk' ? q.fact.product : phase === 'slip' ? '?' : (q.format === 'type' ? (typed || '?') : (phase === 'right' ? q.fact.product : '?'))}
        </span>
      </div>

      {phase === 'right' && <div className="gain">+{gain} ✨ {runStreak >= 3 ? `🔥 ${runStreak} in a row!` : ''}</div>}

      {phase === 'ask' && (
        <div className="hint-row">
          {q.format === 'type' && !q.isNew && !showHint && (
            <button className="hint-btn" onClick={() => { sfx.tap(); setShowHint(true) }}>💡 Show me</button>
          )}
          <button className="idk-btn" onClick={() => submit('idk')}>🤔 I don't know</button>
        </div>
      )}

      {phase === 'ask' && q.format === 'choice' && (
        <div className="choices">
          {options.map((o) => (
            <button key={o} className="btn choice" onClick={() => submit(o)}>{o}</button>
          ))}
        </div>
      )}

      {phase === 'ask' && q.format === 'type' && (
        <>
          {showHint && <div className="hint"><ArrayModel rows={left} cols={right} small /></div>}
          <Numpad value={typed} onChange={onTyped} onSubmit={() => submit(parseInt(typed, 10))} />
        </>
      )}

      {phase === 'idk' && (
        <div className="feedback">
          <div className="feedback-title">Good call! Let's learn it: {left} × {right} = <b>{q.fact.product}</b></div>
          <ArrayModel rows={left} cols={right} />
          <div className="feedback-sub">{left} {left === 1 ? 'row' : 'rows'} of {right} {left === 1 ? 'makes' : 'make'} {q.fact.product}.
            {q.fact.a !== q.fact.b && <> And {right} × {left} = {q.fact.product} too!</>} <b>+{IDK_XP} ✨ for being honest.</b>
          </div>
          <button className="btn primary big" onClick={() => { sfx.tap(); setPhase('ask'); setIndex((i) => i + 1) }}>Got it! 👍</button>
        </div>
      )}

      {phase === 'slip' && (
        <div className="feedback">
          <div className="feedback-title">Not quite… was that a slip? 🙈</div>
          <div className="feedback-sub">If you know it, try once more. Otherwise let's look at it together.</div>
          <button className="btn primary big" onClick={retrySlip}>I know it, let me try again ✋</button>
          <button className="btn big" onClick={() => { sfx.tap(); revealWrong() }}>Show me 👀</button>
        </div>
      )}

      {phase === 'wrong' && (
        <div className="feedback">
          <div className="feedback-title">Not quite! {left} × {right} = <b>{q.fact.product}</b></div>
          <ArrayModel rows={left} cols={right} />
          <div className="feedback-sub">{left} {left === 1 ? 'row' : 'rows'} of {right} {left === 1 ? 'makes' : 'make'} {q.fact.product}.
            {q.fact.a !== q.fact.b && <> And {right} × {left} = {q.fact.product} too!</>}
          </div>
          <button className="btn primary big" onClick={() => { sfx.tap(); setPhase('ask'); setIndex((i) => i + 1) }}>Got it! 👍</button>
        </div>
      )}
    </div>
  )
}
