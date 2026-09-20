import { useEffect } from 'react'
import { FinishedQuest } from '../App'
import { BADGES, CREATURES, derive, formName } from '../engine/store'
import Creature from './Creature'
import { stageOf } from '../engine/scheduler'
import { FACT_BY_ID } from '../engine/facts'
import { sfx } from '../engine/audio'
import Confetti from './Confetti'
import { STAGE_EMOJI } from './Garden'

export default function Results({ data, onHome, onAgain }: { data: FinishedQuest; onHome: () => void; onAgain: () => void }) {
  const { result, before, after } = data
  const firstTries = result.answers.filter((a) => a.firstTry)
  const correct = firstTries.filter((a) => a.correct).length
  const d = derive(after)

  const grown = Object.keys(after.cards).filter((id) => {
    const b = before.cards[id] ? stageOf(before.cards[id]) : 'seed'
    const a = stageOf(after.cards[id])
    return a !== b && ['bud', 'flower', 'golden'].includes(a) && result.answers.some((x) => x.factId === id)
  })

  useEffect(() => {
    if (result.newCreatures.length || result.evolutions.length) sfx.hatch()
    else if (result.unlockedTable) sfx.unlock()
    else sfx.fanfare()
  }, [result])

  return (
    <div className="screen center results">
      {result.stars >= 2 && <Confetti count={result.stars === 3 ? 160 : 80} />}
      <h1>Quest complete!</h1>
      <div className="stars">
        {[1, 2, 3].map((s) => <span key={s} className={`star ${s <= result.stars ? 'on' : ''}`} style={{ animationDelay: `${s * 0.2}s` }}>⭐</span>)}
      </div>
      <div className="score">{correct} / {firstTries.length} right &nbsp;·&nbsp; +{result.xpEarned} ✨</div>
      <div className="to-next">⭐ Level {d.level} &nbsp;·&nbsp; {d.xpToNext} ✨ to level {d.level + 1}</div>

      {result.freezeEarned && (
        <div className="card goal">
          <div className="hatch-emoji">🛡️</div>
          <div><b>Streak saver earned!</b><br />If you miss a day, it keeps your streak alive.</div>
        </div>
      )}

      {result.goalBonus > 0 && (
        <div className="card goal">
          <div className="hatch-emoji">🏅</div>
          <div><b>Daily goal reached!</b><br />+{result.goalBonus} ✨ bonus</div>
        </div>
      )}

      {result.newCreatures.map(({ id, form }) => {
        const c = CREATURES.find((x) => x.id === id)!
        return (
          <div key={id} className="card hatch">
            <div className="hatch-emoji"><Creature creature={c} form={form} size="lg" /></div>
            <div><b>A new friend hatched!</b><br />Meet <b>{formName(c, form)}</b></div>
          </div>
        )
      })}

      {result.evolutions.map(({ id, form }) => {
        const c = CREATURES.find((x) => x.id === id)!
        return (
          <div key={`evo-${id}`} className="card evolve">
            <div className="hatch-emoji"><Creature creature={c} form={form} size="lg" /></div>
            <div><b>{formName(c, (form - 1) as 1 | 2)} evolved!</b><br />Say hello to <b>{formName(c, form)}</b></div>
          </div>
        )
      })}

      {result.unlockedTable && (
        <div className="card unlock">
          <div className="hatch-emoji">🔓</div>
          <div><b>New table unlocked!</b><br />You're ready for the <b>{after.stagesOpen > 0 ? tableName(after.stagesOpen) : ''}</b></div>
        </div>
      )}

      {result.newBadges.map((b) => (
        <div key={b} className="card badge-card">
          <div className="hatch-emoji">{BADGES[b]?.emoji}</div>
          <div><b>Badge: {BADGES[b]?.title}</b><br />{BADGES[b]?.desc}</div>
        </div>
      ))}

      {grown.length > 0 && (
        <div className="card">
          <div><b>Your garden grew!</b></div>
          <div className="grown-list">
            {grown.map((id) => (
              <span key={id} className="grown">{STAGE_EMOJI[stageOf(after.cards[id])]} {FACT_BY_ID[id].a}×{FACT_BY_ID[id].b}</span>
            ))}
          </div>
        </div>
      )}

      <div className="row">
        <button className="btn" onClick={() => { sfx.tap(); onHome() }}>🏠 Home</button>
        <button className="btn primary" onClick={() => { sfx.tap(); onAgain() }}>Play again 🚀</button>
      </div>
    </div>
  )
}

function tableName(stagesOpen: number) {
  const order = [2, 10, 5, 3, 4, 6, 11, 7, 8, 9, 12]
  return `${order[stagesOpen - 1]}s table`
}
