import { Dispatch, useEffect, useMemo, useRef, useState } from 'react'
import { Action, AnswerEvent, PlacementResult } from '../engine/store'
import { Fact, factsForTable, shuffle, TABLE_ORDER } from '../engine/facts'
import { PlacementVerdict } from '../engine/scheduler'
import { sfx } from '../engine/audio'
import ArrayModel from './ArrayModel'
import Numpad from './Numpad'

type Phase = 'intro' | 'ask' | 'right' | 'wrong' | 'idk' | 'slip' | 'done'
interface Q { fact: Fact; flipped: boolean; reask: boolean }

const FAST = 4

/** One-table placement check: every fact once, typed, no hints. Seeds the schedule from the result. */
export default function Placement({ table, dispatch, onExit, onNext }: {
  table: number; dispatch: Dispatch<Action>; onExit: () => void; onNext: (table: number) => void
}) {
  const [queue, setQueue] = useState<Q[]>(() =>
    shuffle(factsForTable(table)).map((fact) => ({ fact, flipped: fact.a !== fact.b && Math.random() < 0.5, reask: false }))
  )
  const [index, setIndex] = useState(0)
  const [phase, setPhase] = useState<Phase>('intro')
  const [typed, setTyped] = useState('')
  const [verdicts, setVerdicts] = useState<Record<string, PlacementVerdict>>({})
  const [answers, setAnswers] = useState<AnswerEvent[]>([])
  const [xp, setXp] = useState(0)
  const [gain, setGain] = useState(0)
  const startedAt = useRef(Date.now())
  const firstKeyAt = useRef<number | null>(null)
  const finished = useRef(false)
  const slipUsed = useRef(false)
  const pendingSeconds = useRef(0)

  const q = queue[index]
  const total = useMemo(() => factsForTable(table).length, [table])
  const nextTable = TABLE_ORDER[TABLE_ORDER.indexOf(table) + 1]

  useEffect(() => { startedAt.current = Date.now(); firstKeyAt.current = null; setTyped('') }, [index, phase])
  useEffect(() => { slipUsed.current = false }, [index])
  const onTyped = (v: string) => { if (firstKeyAt.current === null && v) firstKeyAt.current = Date.now(); setTyped(v) }

  useEffect(() => {
    if (phase !== 'intro' && index >= queue.length && !finished.current) {
      finished.current = true
      const counts = { known: 0, shaky: 0, idk: 0, wrong: 0 }
      for (const v of Object.values(verdicts)) counts[v]++
      const result: PlacementResult = { table, ...counts, xpEarned: xp, answers }
      dispatch({ type: 'placementDone', result })
      sfx.unlock()
      setPhase('done')
    }
  }, [index, queue.length, phase, verdicts, xp, answers, table, dispatch])

  const submit = (value: number | 'idk') => {
    if (phase !== 'ask' || !q) return
    const seconds = ((firstKeyAt.current ?? Date.now()) - startedAt.current) / 1000
    const idk = value === 'idk'
    const correct = value === q.fact.product
    if (!correct && !idk && !q.reask && !slipUsed.current) {
      pendingSeconds.current = seconds
      sfx.tap(); setPhase('slip'); return
    }
    record(correct, seconds, idk)
  }

  const record = (correct: boolean, seconds: number, idk: boolean) => {
    setAnswers((a) => [...a, { factId: q.fact.id, correct, seconds, firstTry: !q.reask, repeat: false, idk }])
    let earned = 0
    if (!q.reask) {
      dispatch({ type: 'place', factId: q.fact.id, correct, seconds, idk })
      const v: PlacementVerdict = correct ? (seconds < FAST ? 'known' : 'shaky') : idk ? 'idk' : 'wrong'
      setVerdicts((m) => ({ ...m, [q.fact.id]: v }))
      earned = correct ? 10 + (seconds < FAST ? 5 : 0) : idk ? 2 : 0
    } else {
      // Practice re-ask after a miss: graded normally so it comes back soon.
      dispatch({ type: 'answer', event: { factId: q.fact.id, correct, seconds, firstTry: false, repeat: false, idk } })
      earned = correct ? 5 : 0
    }
    if (correct) {
      setGain(earned); setXp((x) => x + earned); sfx.correct(); setPhase('right')
      window.setTimeout(() => { setPhase('ask'); setIndex((i) => i + 1) }, 800)
    } else {
      if (idk) { setXp((x) => x + earned); sfx.tap(); setPhase('idk') } else { sfx.wrong(); setPhase('wrong') }
      if (!q.reask) setQueue((qq) => { const c = [...qq]; c.splice(Math.min(c.length, index + 3), 0, { ...q, reask: true, flipped: !q.flipped && q.fact.a !== q.fact.b }); return c })
    }
  }

  if (phase === 'intro') {
    return (
      <div className="screen center">
        <div className="hero">🔍</div>
        <h1>Show what you know</h1>
        <p className="lead">The <b>{table}s</b> table. {total} questions, type the answer as fast as you can. No hints this time!</p>
        <p className="tiny">Every fact you get right starts as Growing 🌿 and comes back in a few days. Misses get taught properly and come back tomorrow.</p>
        <button className="btn primary big" onClick={() => { sfx.tap(); setPhase('ask') }}>Ready! 🚀</button>
        <button className="link-btn" onClick={onExit}>Not now</button>
      </div>
    )
  }

  if (phase === 'done') {
    const counts = { known: 0, shaky: 0, idk: 0, wrong: 0 }
    for (const v of Object.values(verdicts)) counts[v]++
    const toLearn = Object.entries(verdicts).filter(([, v]) => v === 'idk' || v === 'wrong')
    return (
      <div className="screen center results">
        <h1>{table}s checked!</h1>
        <div className="score">+{xp} ✨</div>
        <div className="card unlock">
          <div className="hatch-emoji">🔓</div>
          <div><b>The {table}s are open!</b><br />They'll show up in your quests from now on.</div>
        </div>
        <div className="card">
          <div className="kv"><span>🌿 Knew it (quick)</span><b>{counts.known}</b></div>
          <div className="kv"><span>🌿 Knew it (took a moment)</span><b>{counts.shaky}</b></div>
          <div className="kv"><span>🤔 Didn't know yet</span><b>{counts.idk}</b></div>
          <div className="kv"><span>❌ Mixed up</span><b>{counts.wrong}</b></div>
          {toLearn.length > 0 && (
            <div className="grown-list">
              {toLearn.map(([id, v]) => <span key={id} className="grown">{v === 'idk' ? '🤔' : '❌'} {id.replace('x', '×')}</span>)}
            </div>
          )}
        </div>
        <div className="row">
          <button className="btn" onClick={() => { sfx.tap(); onExit() }}>Done</button>
          {nextTable && <button className="btn primary" onClick={() => { sfx.tap(); onNext(nextTable) }}>Check the {nextTable}s →</button>}
        </div>
      </div>
    )
  }

  if (!q) return null
  const left = q.flipped ? q.fact.b : q.fact.a
  const right = q.flipped ? q.fact.a : q.fact.b
  const progress = Math.min(1, index / queue.length)

  return (
    <div className={`screen quiz ${phase}`}>
      <header className="quiz-top">
        <button className="icon-btn" onClick={() => { sfx.tap(); onExit() }} aria-label="Quit">✕</button>
        <div className="bar big-bar"><div className="bar-fill" style={{ width: `${progress * 100}%` }} /></div>
        <div className="xp-pill">🔍 {index + 1}/{queue.length}</div>
      </header>
      <div className="question">
        <span>{left}</span><span className="op">×</span><span>{right}</span><span className="op">=</span>
        <span className={`answer-box ${typed ? '' : 'empty'}`}>{phase === 'wrong' || phase === 'idk' || phase === 'right' ? q.fact.product : phase === 'slip' ? '?' : (typed || '?')}</span>
      </div>
      {phase === 'right' && <div className="gain">+{gain} ✨</div>}
      {phase === 'ask' && <div className="hint-row"><button className="idk-btn" onClick={() => submit('idk')}>🤔 I don't know</button></div>}
      {phase === 'ask' && <Numpad value={typed} onChange={onTyped} onSubmit={() => submit(parseInt(typed, 10))} />}
      {phase === 'slip' && (
        <div className="feedback">
          <div className="feedback-title">Not quite… was that a slip? 🙈</div>
          <button className="btn primary big" onClick={() => { slipUsed.current = true; setTyped(''); firstKeyAt.current = null; sfx.tap(); setPhase('ask') }}>I know it, let me try again ✋</button>
          <button className="btn big" onClick={() => { sfx.tap(); record(false, pendingSeconds.current, false) }}>Show me 👀</button>
        </div>
      )}
      {phase === 'idk' && (
        <div className="feedback">
          <div className="feedback-title">Good call! {left} × {right} = <b>{q.fact.product}</b></div>
          <ArrayModel rows={left} cols={right} />
          <div className="feedback-sub">{left} {left === 1 ? 'row' : 'rows'} of {right}. {q.fact.a !== q.fact.b && <>And {right} × {left} = {q.fact.product} too!</>} <b>+2 ✨ for being honest.</b></div>
          <button className="btn primary big" onClick={() => { sfx.tap(); setPhase('ask'); setIndex((i) => i + 1) }}>Got it! 👍</button>
        </div>
      )}
      {phase === 'wrong' && (
        <div className="feedback">
          <div className="feedback-title">{left} × {right} = <b>{q.fact.product}</b></div>
          <ArrayModel rows={left} cols={right} />
          <div className="feedback-sub">{left} {left === 1 ? 'row' : 'rows'} of {right}. {q.fact.a !== q.fact.b && <>And {right} × {left} = {q.fact.product} too!</>}</div>
          <button className="btn primary big" onClick={() => { sfx.tap(); setPhase('ask'); setIndex((i) => i + 1) }}>Got it! 👍</button>
        </div>
      )}
    </div>
  )
}
