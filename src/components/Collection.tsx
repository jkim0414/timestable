import { BADGES, CREATURES, creatureForm, creaturesFor, derive, evolveTarget, formName, State } from '../engine/store'
import { sfx } from '../engine/audio'
import Creature from './Creature'

export default function Collection({ state, onBack }: { state: State; onBack: () => void }) {
  const d = derive(state)
  const owned = creaturesFor(d.level)
  const garden = state.gardenBest
  const allHatched = owned.length >= CREATURES.length
  return (
    <div className="screen">
      <header className="topbar">
        <button className="icon-btn" onClick={() => { sfx.tap(); onBack() }} aria-label="Back">←</button>
        <h2>🥚 My Creatures</h2>
        <span />
      </header>
      <p className="lead small">
        {allHatched
          ? <>Level {d.level}. Every creature has hatched! Keep growing your garden to evolve them.</>
          : <>Level {d.level}. Earn <b>{d.xpToNext} ✨</b> more to hatch your next egg!</>}
      </p>
      <p className="tiny center-text">Creatures evolve as your garden blooms: best so far 🌸 {garden.flowers} flowers · 🌟 {garden.golden} golden</p>
      <div className="creatures">
        {CREATURES.map((c, i) => {
          const have = owned.includes(c.id)
          const form = have ? creatureForm(i, garden) : 1
          const t = evolveTarget(i)
          const next = !have ? `Level ${i + 2}` : form === 1 ? `🌸 ${Math.min(garden.flowers, t)}/${t}` : form === 2 ? `🌟 ${Math.min(garden.golden, t)}/${t}` : 'MAX ✨'
          return (
            <div key={c.id} className={`creature ${have ? '' : 'egg'}`}>
              <div className="creature-emoji">{have ? <Creature creature={c} form={form} /> : '🥚'}</div>
              <div className="creature-name">{have ? formName(c, form) : '???'}</div>
              <div className="creature-next">{next}</div>
            </div>
          )
        })}
      </div>

      <h3>Badges</h3>
      <div className="badges">
        {Object.entries(BADGES).map(([id, b]) => {
          const have = state.badges.includes(id)
          return (
            <div key={id} className={`badge ${have ? '' : 'off'}`} title={b.desc}>
              <div className="badge-emoji">{have ? b.emoji : '🔒'}</div>
              <div className="badge-title">{b.title}</div>
              <div className="badge-desc">{b.desc}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
