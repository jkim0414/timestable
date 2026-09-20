import { useEffect } from 'react'
import { BADGES, CREATURES, formName, State, pendingGrowth } from '../engine/store'
import { FACT_BY_ID } from '../engine/facts'
import { sfx } from '../engine/audio'
import Confetti from './Confetti'
import Creature from './Creature'
import { STAGE_EMOJI } from './Garden'

/** Shown on open when the garden grew outside a quest (another device, or a scheduler change). */
export default function Celebration({ state, onDone }: { state: State; onDone: () => void }) {
  const { bloomed, evolutions, newBadges } = pendingGrowth(state)
  useEffect(() => { sfx.hatch() }, [])
  const golden = bloomed.filter((b) => b.stage === 'golden')
  const flowers = bloomed.filter((b) => b.stage === 'flower')
  return (
    <div className="screen center results">
      <Confetti count={160} />
      <div className="hero">🌻</div>
      <h1>{bloomed.length || evolutions.length ? 'Your garden grew!' : 'Look what you earned!'}</h1>
      <p className="lead">While you were away, {state.name}…</p>

      {newBadges.map((b) => (
        <div key={b} className="card badge-card">
          <div className="hatch-emoji">{BADGES[b]?.emoji}</div>
          <div><b>Badge: {BADGES[b]?.title}</b><br />{BADGES[b]?.desc}</div>
        </div>
      ))}

      {flowers.length > 0 && (
        <div className="card">
          <div><b>{flowers.length} {flowers.length === 1 ? 'flower' : 'flowers'} bloomed! 🌸</b></div>
          <div className="grown-list">
            {flowers.map(({ id }) => <span key={id} className="grown bloom-pop">{STAGE_EMOJI.flower} {FACT_BY_ID[id].a}×{FACT_BY_ID[id].b}</span>)}
          </div>
        </div>
      )}
      {golden.length > 0 && (
        <div className="card">
          <div><b>{golden.length} turned golden! 🌟</b></div>
          <div className="grown-list">
            {golden.map(({ id }) => <span key={id} className="grown bloom-pop">{STAGE_EMOJI.golden} {FACT_BY_ID[id].a}×{FACT_BY_ID[id].b}</span>)}
          </div>
        </div>
      )}
      {evolutions.map(({ id, form }) => {
        const c = CREATURES.find((x) => x.id === id)!
        return (
          <div key={id} className="card evolve">
            <div className="hatch-emoji"><Creature creature={c} form={form} size="lg" /></div>
            <div><b>{formName(c, (form - 1) as 1 | 2)} evolved!</b><br />Say hello to <b>{formName(c, form)}</b></div>
          </div>
        )
      })}
      <button className="btn primary big" onClick={() => { sfx.tap(); onDone() }}>Wow! 🎉</button>
    </div>
  )
}
