import { Dispatch, useRef, useState } from 'react'
import { Action } from '../engine/store'
import { factId, FACT_BY_ID, isFactUnlocked, TABLE_ORDER, unlockedTables } from '../engine/facts'
import { newCard, Stage, stageOf, tableProgress } from '../engine/scheduler'
import { State } from '../engine/store'
import { sfx } from '../engine/audio'
import ArrayModel from './ArrayModel'

export const STAGE_EMOJI: Record<Stage, string> = {
  seed: '·', sprout: '🌱', bud: '🌿', flower: '🌸', golden: '🌟'
}
const STAGE_NAME: Record<Stage, string> = {
  seed: 'Not planted yet', sprout: 'Sprouting', bud: 'Growing', flower: 'In bloom!', golden: 'Golden — super fast!'
}

export default function Garden({ state, dispatch, onBack }: { state: State; dispatch: Dispatch<Action>; onBack: () => void }) {
  const [sel, setSel] = useState<string | null>(null)
  const holdTimer = useRef<number | null>(null)
  const [holding, setHolding] = useState(false)
  const startHold = (id: string) => {
    setHolding(true)
    holdTimer.current = window.setTimeout(() => {
      setHolding(false)
      dispatch({ type: 'markKnown', factId: id })
      sfx.hatch()
    }, 1200)
  }
  const cancelHold = () => { setHolding(false); if (holdTimer.current) window.clearTimeout(holdTimer.current) }
  const open = unlockedTables(state.stagesOpen)
  const nums = Array.from({ length: 12 }, (_, i) => i + 1)

  const selFact = sel ? FACT_BY_ID[sel] : null
  const selCard = sel ? (state.cards[sel] ?? newCard(sel)) : null

  return (
    <div className="screen">
      <header className="topbar">
        <button className="icon-btn" onClick={() => { sfx.tap(); onBack() }} aria-label="Back">←</button>
        <h2>🌻 My Garden</h2>
        <span />
      </header>

      <div className="legend">
        {(['sprout', 'bud', 'flower', 'golden'] as Stage[]).map((s) => (
          <span key={s}>{STAGE_EMOJI[s]} {STAGE_NAME[s].split(' —')[0]}</span>
        ))}
      </div>

      <div className="grid-wrap">
        <div className="grid">
          <div className="cell head">×</div>
          {nums.map((n) => <div key={`h${n}`} className={`cell head ${open.includes(n) || n === 1 ? '' : 'locked'}`}>{n}</div>)}
          {nums.map((r) => (
            <FragmentRow key={r} r={r} nums={nums} state={state} sel={sel} setSel={setSel} />
          ))}
        </div>
      </div>

      {selFact && selCard && (
        <div className="card fact-card">
          <div className="fact-big">{selFact.a} × {selFact.b} = {isFactUnlocked(selFact, state.stagesOpen) ? selFact.product : '🔒'}</div>
          <div>{STAGE_EMOJI[stageOf(selCard)]} {STAGE_NAME[stageOf(selCard)]}</div>
          {isFactUnlocked(selFact, state.stagesOpen) && <ArrayModel rows={selFact.a} cols={selFact.b} small />}
          {isFactUnlocked(selFact, state.stagesOpen) && stageOf(selCard) !== 'flower' && stageOf(selCard) !== 'golden' && (
            <button
              className={`btn hold-btn ${holding ? 'holding' : ''}`}
              onPointerDown={() => startHold(selFact.id)}
              onPointerUp={cancelHold} onPointerLeave={cancelHold} onPointerCancel={cancelHold}
              onContextMenu={(e) => e.preventDefault()}
            >✅ I know this one! <span className="tiny">(press and hold)</span></button>
          )}
          <button className="link-btn" onClick={() => setSel(null)}>Close</button>
        </div>
      )}

      <h3>Tables</h3>
      <div className="tables">
        {TABLE_ORDER.map((t) => {
          const unlocked = open.includes(t)
          const p = tableProgress(state.cards, t)
          return (
            <div key={t} className={`table-row ${unlocked ? '' : 'locked'}`}>
              <div className="table-name">{unlocked ? (p.mastered ? '🌸' : '🌱') : '🔒'} {t}s</div>
              <div className="bar"><div className="bar-fill" style={{ width: `${unlocked ? p.score * 100 : 0}%` }} /></div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function FragmentRow({ r, nums, state, sel, setSel }: {
  r: number; nums: number[]; state: State; sel: string | null; setSel: (s: string | null) => void
}) {
  return (
    <>
      <div className="cell head">{r}</div>
      {nums.map((c) => {
        const id = factId(r, c)
        const f = FACT_BY_ID[id]
        const unlocked = isFactUnlocked(f, state.stagesOpen)
        const st = stageOf(state.cards[id] ?? newCard(id))
        return (
          <button
            key={id}
            className={`cell ${unlocked ? '' : 'locked'} s-${st} ${sel === id ? 'sel' : ''}`}
            onClick={() => { sfx.tap(); setSel(sel === id ? null : id) }}
            aria-label={`${r} times ${c}`}
          >{unlocked ? STAGE_EMOJI[st] : ''}</button>
        )
      })}
    </>
  )
}
