import { useEffect, useRef, useState } from 'react'
import { Action, creatureForm, CREATURES, creaturesFor, derive, pendingGrowth, QuestPartial, QuestResult, reducer, State, useStore } from './engine/store'
import Celebration from './components/Celebration'
import { isValidCode, normalizeCode } from './engine/model'
import { useSync } from './engine/sync'
import { setSoundEnabled } from './engine/audio'
import Home from './components/Home'
import Quiz from './components/Quiz'
import Results from './components/Results'
import Garden from './components/Garden'
import Collection from './components/Collection'
import Parent from './components/Parent'
import Onboarding from './components/Onboarding'
import Placement from './components/Placement'

export type Screen = 'home' | 'quiz' | 'results' | 'garden' | 'collection' | 'parent' | 'placement'

export interface FinishedQuest {
  result: QuestResult
  before: State
  after: State
}

/** A ?join=CODE link from another device. */
function joinParam(): string | null {
  const p = new URLSearchParams(window.location.search)
  const code = normalizeCode(p.get('join') ?? '')
  return isValidCode(code) ? code : null
}

export default function App() {
  const [state, dispatch] = useStore()
  const [screen, setScreen] = useState<Screen>('home')
  const [finished, setFinished] = useState<FinishedQuest | null>(null)
  const [pendingJoin, setPendingJoin] = useState<string | null>(() => joinParam())
  const [placementTable, setPlacementTable] = useState<number | null>(null)
  const stateRef = useRef(state)
  stateRef.current = state
  const sync = useSync(state, dispatch)
  const startQuest = () => setScreen('quiz')

  useEffect(() => { setSoundEnabled(state.settings.sound) }, [state.settings.sound])

  useEffect(() => {
    if (pendingJoin) window.history.replaceState({}, '', window.location.pathname)
  }, [pendingJoin])

  if (!state.name || pendingJoin) {
    return (
      <Onboarding
        state={state}
        dispatch={dispatch}
        initialCode={pendingJoin}
        onDone={() => setPendingJoin(null)}
      />
    )
  }

  const finishQuest = (partial: QuestPartial) => {
    const before = stateRef.current
    const action: Action = { type: 'finishQuest', result: partial }
    const after = reducer(before, action)
    dispatch(action)
    const b = derive(before), a = derive(after)
    const gb = before.gardenBest, ga = after.gardenBest
    const ownedBefore = creaturesFor(b.level), owned = creaturesFor(a.level)
    const evolutions = CREATURES
      .map((c, i) => ({ id: c.id, i }))
      .filter(({ id, i }) => ownedBefore.includes(id) && creatureForm(i, ga) > creatureForm(i, gb))
      .map(({ id, i }) => ({ id, form: creatureForm(i, ga) as 2 | 3 }))
    const goalBonus = derive(after).xp - derive(before).xp - partial.xpEarned
    const result: QuestResult = {
      ...partial,
      xpEarned: partial.xpEarned + goalBonus,
      goalBonus,
      freezeEarned: a.freezes > b.freezes,
      newBadges: after.badges.filter((x) => !before.badges.includes(x)),
      newCreatures: CREATURES.map((c, i) => ({ id: c.id, form: creatureForm(i, ga) }))
        .filter(({ id }) => owned.includes(id) && !ownedBefore.includes(id)),
      evolutions,
      unlockedTable: after.stagesOpen > before.stagesOpen ? after.stagesOpen : null,
      leveledUp: a.level > b.level
    }
    setFinished({ result, before, after })
    setScreen('results')
  }

  switch (screen) {
    case 'quiz':
      return <Quiz state={state} dispatch={dispatch} onFinish={finishQuest} onQuit={() => setScreen('home')} />
    case 'results':
      return finished ? <Results data={finished} onHome={() => setScreen('home')} onAgain={startQuest} /> : null
    case 'garden':
      return <Garden state={state} dispatch={dispatch} onBack={() => setScreen('home')} />
    case 'collection':
      return <Collection state={state} onBack={() => setScreen('home')} />
    case 'parent':
      return (
        <Parent
          state={state} dispatch={dispatch} sync={sync} onBack={() => setScreen('home')}
          onPlacement={(t) => { setPlacementTable(t); setScreen('placement') }}
        />
      )
    case 'placement':
      return placementTable ? (
        <Placement
          key={placementTable}
          table={placementTable}
          dispatch={dispatch}
          onExit={() => setScreen('home')}
          onNext={(t) => setPlacementTable(t)}
        />
      ) : null
    default:
      if (pendingGrowth(state).any) return <Celebration state={state} onDone={() => dispatch({ type: 'celebrated' })} />
      return <Home state={state} go={(s) => (s === 'quiz' ? startQuest() : setScreen(s))} />
  }
}
