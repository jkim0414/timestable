import { useEffect, useRef, useState } from 'react'
import { Screen } from '../App'
import { FACTS, isFactUnlocked, unlockedTables } from '../engine/facts'
import { derive, State } from '../engine/store'
import { sfx } from '../engine/audio'

interface BeforeInstallPromptEvent extends Event { prompt: () => Promise<void> }

export default function Home({ state, go }: { state: State; go: (s: Screen) => void }) {
  const d = derive(state)
  const now = Date.now()
  const due = FACTS.filter((f) => isFactUnlocked(f, state.stagesOpen)).filter((f) => {
    const c = state.cards[f.id]
    return !c || c.due <= now
  }).length
  const goalDone = d.questsToday
  const goal = state.settings.dailyGoal
  const tables = unlockedTables(state.stagesOpen)

  // Parent gear: press and hold to open
  const holdTimer = useRef<number | null>(null)
  const [holding, setHolding] = useState(false)
  const startHold = () => {
    setHolding(true)
    holdTimer.current = window.setTimeout(() => { setHolding(false); go('parent') }, 1200)
  }
  const cancelHold = () => {
    setHolding(false)
    if (holdTimer.current) window.clearTimeout(holdTimer.current)
  }

  const [installEvt, setInstallEvt] = useState<BeforeInstallPromptEvent | null>(null)
  useEffect(() => {
    const h = (e: Event) => { e.preventDefault(); setInstallEvt(e as BeforeInstallPromptEvent) }
    window.addEventListener('beforeinstallprompt', h)
    return () => window.removeEventListener('beforeinstallprompt', h)
  }, [])

  return (
    <div className="screen home">
      <header className="topbar">
        <div>
          <div className="hello">Hi, {state.name}! 👋</div>
          <div className="sub">Now learning: {tables.map((t) => `${t}s`).join(', ')}</div>
        </div>
        <button
          className={`gear ${holding ? 'holding' : ''}`}
          aria-label="Grown-ups (press and hold)"
          onPointerDown={startHold}
          onPointerUp={cancelHold}
          onPointerLeave={cancelHold}
          onPointerCancel={cancelHold}
          onContextMenu={(e) => e.preventDefault()}
        >⚙️</button>
      </header>

      <section className="stats">
        <div className="stat">
          <div className="stat-big">⭐ {d.level}</div>
          <div className="stat-label">Level</div>
          <div className="bar"><div className="bar-fill" style={{ width: `${d.levelProgress * 100}%` }} /></div>
          <div className="stat-sub">{d.xpToNext} ✨ to go</div>
        </div>
        <div className="stat">
          <div className="stat-big">🔥 {d.streakDays}</div>
          <div className="stat-label">Day streak</div>
          <div className="stat-sub" title="Streak savers: a missed day uses one instead of breaking the streak">🛡️ {d.freezes} saver{d.freezes === 1 ? '' : 's'}</div>
        </div>
        <div className="stat">
          <div className="stat-big">{goalDone >= goal ? '🏅' : '🎯'} {Math.min(goalDone, goal)}/{goal}</div>
          <div className="stat-label">Quests today</div>
        </div>
      </section>

      {d.lastFrozenDay && isRecent(d.lastFrozenDay) && (
        <div className="notice">🛡️ A streak saver kept your {d.streakDays}-day streak alive!</div>
      )}

      <button className="btn play" onClick={() => { sfx.tap(); go('quiz') }}>
        <span className="play-icon">🚀</span>
        <span>
          <span className="play-title">Play a Quest!</span>
          <span className="play-sub">{due > 0 ? `${due} flower${due === 1 ? '' : 's'} need watering` : 'Your garden is happy! Practise anyway?'}</span>
        </span>
      </button>

      <div className="tiles">
        <button className="tile" onClick={() => { sfx.tap(); go('garden') }}>
          <span className="tile-icon">🌻</span><span>My Garden</span>
        </button>
        <button className="tile" onClick={() => { sfx.tap(); go('collection') }}>
          <span className="tile-icon">🥚</span><span>My Creatures</span>
        </button>
      </div>

      {installEvt && (
        <button className="chip" onClick={() => installEvt.prompt()}>📲 Add to home screen</button>
      )}
    </div>
  )
}


/** Within the last two days. */
function isRecent(day: string) {
  const d = new Date(day + 'T12:00:00')
  return Date.now() - d.getTime() < 2.5 * 86400000
}
