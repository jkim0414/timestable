import { useEffect, useReducer } from 'react'
import { Card, gardenCounts, grade, markKnown, newCard, placeCard, repairCard, shouldUnlockNext, stageOf, STAGE_RANK, tableProgress } from './scheduler.js'
import { factsForTable } from './facts.js'
import type { FactId } from './facts.js'
import { FACTS, TABLE_ORDER } from './facts.js'
import {
  Contrib, dateKey, derive, emptyContrib, forUpload, LEVEL_XP, levelFromXp, makeCode, mergeStates, Settings, SessionSummary, State
} from './model.js'

export type { State, Settings, SessionSummary, Contrib }
export { derive, LEVEL_XP, forUpload }

export const STORAGE_KEY = 'times-garden.v2'
const DEVICE_KEY = 'times-garden.device'

export const today = dateKey

function deviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY)
    if (!id) {
      id = (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36)).toLowerCase()
      localStorage.setItem(DEVICE_KEY, id)
    }
    return id
  } catch {
    return 'device-' + Math.random().toString(36).slice(2)
  }
}

export const initialState = (): State => ({
  version: 2,
  epoch: 1,
  deviceId: deviceId(),
  familyCode: makeCode(),
  name: null,
  profileUpdated: 0,
  settings: { sound: true, dailyGoal: 2, answerMode: 'auto' },
  cards: {},
  stagesOpen: 1,
  badges: [],
  contrib: {},
  history: [],
  gardenBest: { flowers: 0, golden: 0 },
  celebrated: {},
  syncRev: 0,
  mutationCount: 0,
  syncedMutation: 0,
  lastSync: null
})

export function load(): State {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return initialState()
    const parsed = JSON.parse(raw) as State
    if (parsed.version !== 2) return initialState()
    const base = initialState()
    const practiceDays = derive({ contrib: parsed.contrib ?? {} }).practiceDays.size
    const cards = Object.fromEntries(Object.entries(parsed.cards ?? {}).map(([id, c]) => [id, repairCard(c, practiceDays)]))
    return {
      ...base, ...parsed, deviceId: base.deviceId, cards,
      settings: { ...base.settings, ...parsed.settings },
      gardenBest: { ...base.gardenBest, ...(parsed.gardenBest ?? {}) }
    }
  } catch {
    return initialState()
  }
}

export const isDirty = (s: State) => s.mutationCount > s.syncedMutation

// ---- Levels, creatures, badges -------------------------------------------

export const levelOf = (xp: number) => levelFromXp(xp).level

export interface Creature { id: string; name: string; forms: [string, string, string] }

/** 36 creatures, one hatching per level. Each evolves twice as the garden blooms. */
export const CREATURES: Creature[] = [
  { id: 'chick', name: 'Pip', forms: ['🐣', '🐥', '🐓'] },
  { id: 'frog', name: 'Hopper', forms: ['🐸', '🐸', '🐸'] },
  { id: 'caterpillar', name: 'Wiggles', forms: ['🐛', '🦋', '🦋'] },
  { id: 'fox', name: 'Ember', forms: ['🦊', '🦊', '🦊'] },
  { id: 'seedling', name: 'Sprout', forms: ['🌱', '🌿', '🌳'] },
  { id: 'penguin', name: 'Waddles', forms: ['🐧', '🐧', '🐧'] },
  { id: 'pony', name: 'Clover', forms: ['🐴', '🐎', '🦄'] },
  { id: 'owl', name: 'Professor Hoot', forms: ['🦉', '🦉', '🦉'] },
  { id: 'fish', name: 'Bubbles', forms: ['🐟', '🐠', '🐡'] },
  { id: 'turtle', name: 'Sheldon', forms: ['🐢', '🐢', '🐢'] },
  { id: 'monkey', name: 'Bongo', forms: ['🐵', '🐒', '🦍'] },
  { id: 'panda', name: 'Bamboo', forms: ['🐼', '🐼', '🐼'] },
  { id: 'puppy', name: 'Biscuit', forms: ['🐶', '🐕', '🐩'] },
  { id: 'octopus', name: 'Inky', forms: ['🐙', '🐙', '🐙'] },
  { id: 'kitten', name: 'Mittens', forms: ['🐱', '🐈', '🐈‍⬛'] },
  { id: 'bee', name: 'Buzz', forms: ['🐝', '🐝', '🐝'] },
  { id: 'dino', name: 'Rex', forms: ['🦎', '🦖', '🐉'] },
  { id: 'koala', name: 'Snoozy', forms: ['🐨', '🐨', '🐨'] },
  { id: 'whale', name: 'Big Blue', forms: ['🐬', '🐳', '🐋'] },
  { id: 'lion', name: 'Rory', forms: ['🐱', '🦁', '🦁'] },
  { id: 'bear', name: 'Bruno', forms: ['🐻', '🐻‍❄️', '🐻‍❄️'] },
  { id: 'parrot', name: 'Polly', forms: ['🐦', '🦜', '🦜'] },
  { id: 'crab', name: 'Pinchy', forms: ['🦐', '🦀', '🦞'] },
  { id: 'dragon', name: 'Blaze', forms: ['🥚', '🐲', '🐉'] },
  { id: 'snail', name: 'Zoom', forms: ['🐌', '🐌', '🐌'] },
  { id: 'hedgehog', name: 'Prickles', forms: ['🦔', '🦔', '🦔'] },
  { id: 'flamingo', name: 'Pinky', forms: ['🦩', '🦩', '🦩'] },
  { id: 'shark', name: 'Chomp', forms: ['🐟', '🦈', '🦈'] },
  { id: 'tiger', name: 'Stripes', forms: ['🐯', '🐅', '🐅'] },
  { id: 'elephant', name: 'Trunk', forms: ['🐘', '🐘', '🦣'] },
  { id: 'alien', name: 'Zorp', forms: ['👾', '👽', '🛸'] },
  { id: 'robot', name: 'Bolt', forms: ['🤖', '🤖', '🤖'] },
  { id: 'ghost', name: 'Boo', forms: ['👻', '👻', '👻'] },
  { id: 'wizard', name: 'Merlin', forms: ['🧙', '🧙', '🧙'] },
  { id: 'phoenix', name: 'Phoenix', forms: ['🔥', '🐦‍🔥', '🐦‍🔥'] },
  { id: 'star', name: 'Twinkle', forms: ['⭐', '🌟', '💫'] }
]

/** One creature hatches per level gained. */
export const creaturesFor = (level: number) => CREATURES.slice(0, Math.max(0, level - 1)).map((c) => c.id)

/** Creature #i (0-based) evolves when the garden has 2(i+1) flowers, and again at 2(i+1) golden flowers. */
export const evolveTarget = (index: number) => 2 * (index + 1)
export function creatureForm(index: number, garden: { flowers: number; golden: number }): 1 | 2 | 3 {
  const t = evolveTarget(index)
  return garden.golden >= t ? 3 : garden.flowers >= t ? 2 : 1
}
export const formName = (c: Creature, form: 1 | 2 | 3) => (form === 3 ? `Mega ${c.name}` : form === 2 ? `Big ${c.name}` : c.name)

export const BADGES: Record<string, { emoji: string; title: string; desc: string }> = {
  first_quest: { emoji: '🎒', title: 'First Quest', desc: 'Finished your very first quest' },
  perfect: { emoji: '💯', title: 'Perfect!', desc: 'Got every answer right in a quest' },
  speedy: { emoji: '⚡', title: 'Lightning', desc: '8 fast answers in one quest' },
  streak3: { emoji: '🔥', title: 'On Fire', desc: 'Practised 3 days in a row' },
  streak7: { emoji: '🌟', title: 'Week Warrior', desc: 'Practised 7 days in a row' },
  streak30: { emoji: '👑', title: 'Garden King', desc: 'Practised 30 days in a row' },
  saver: { emoji: '🛡️', title: 'Saved!', desc: 'A streak saver rescued your streak' },
  correct100: { emoji: '💎', title: 'Century', desc: '100 correct answers' },
  correct500: { emoji: '🏆', title: 'Legend', desc: '500 correct answers' },
  ...Object.fromEntries(TABLE_ORDER.map((t) => [`table${t}`, { emoji: '🌸', title: `${t}s Master`, desc: `Every ${t}× fact is in bloom` }])),
  all_golden: { emoji: '🌈', title: 'Golden Garden', desc: 'Every fact is a golden flower' }
}

// ---- Actions --------------------------------------------------------------

export interface AnswerEvent {
  factId: FactId
  correct: boolean
  seconds: number
  firstTry: boolean
  /** Already reviewed this sitting when asked (practice, not new learning). */
  repeat: boolean
  /** Child chose "I don't know" rather than answering. */
  idk?: boolean
}

/** Bonus for hitting the daily quest goal (once per day, shared across devices). */
export const DAILY_GOAL_BONUS = 25

export interface QuestResult {
  answers: AnswerEvent[]
  xpEarned: number
  stars: number
  fastCount: number
  goalBonus: number
  /** A streak saver was earned by this quest. */
  freezeEarned: boolean
  newBadges: string[]
  newCreatures: { id: string; form: 1 | 2 | 3 }[]
  evolutions: { id: string; form: 2 | 3 }[]
  unlockedTable: number | null
  leveledUp: boolean
}

export type QuestPartial = Omit<QuestResult, 'goalBonus' | 'freezeEarned' | 'newBadges' | 'newCreatures' | 'evolutions' | 'unlockedTable' | 'leveledUp'>

export interface PlacementResult {
  table: number
  known: number
  shaky: number
  idk: number
  wrong: number
  xpEarned: number
  answers: AnswerEvent[]
}

export type Action =
  | { type: 'setName'; name: string }
  | { type: 'place'; factId: FactId; correct: boolean; seconds: number; idk?: boolean }
  | { type: 'placementDone'; result: PlacementResult }
  | { type: 'answer'; event: AnswerEvent }
  | { type: 'finishQuest'; result: QuestPartial }
  | { type: 'settings'; settings: Partial<Settings> }
  | { type: 'reset' }
  | { type: 'unlockTable' }
  | { type: 'join'; code: string }
  | { type: 'celebrated' }
  | { type: 'markKnown'; factId: FactId }
  | { type: 'markTableKnown'; table: number }
  | { type: 'applySync'; state: State | null; syncedMutation: number; code?: string }

const touch = (s: State, bumpRev = true): State => ({
  ...s, mutationCount: s.mutationCount + 1, syncRev: bumpRev ? s.syncRev + 1 : s.syncRev
})

const myContrib = (s: State): Contrib => s.contrib[s.deviceId] ?? emptyContrib()

/** Badges implied by the current state alone (not by a particular quest's result). */
export function earnedBadges(state: Pick<State, 'contrib' | 'cards' | 'stagesOpen' | 'history'>, today = dateKey()): string[] {
  const d = derive(state, today)
  const out: string[] = []
  if (state.history.some((h) => h.kind !== 'placement')) out.push('first_quest')
  if (d.streakDays >= 3) out.push('streak3')
  if (d.streakDays >= 7) out.push('streak7')
  if (d.streakDays >= 30) out.push('streak30')
  if (d.lastFrozenDay) out.push('saver')
  if (d.totalCorrect >= 100) out.push('correct100')
  if (d.totalCorrect >= 500) out.push('correct500')
  for (const tb of TABLE_ORDER.slice(0, state.stagesOpen)) if (tableProgress(state.cards, tb).mastered) out.push(`table${tb}`)
  if (FACTS.every((f) => state.cards[f.id] && stageOf(state.cards[f.id]) === 'golden')) out.push('all_golden')
  return out
}

export const ranksOf = (cards: Record<FactId, Card>): Record<string, number> =>
  Object.fromEntries(Object.entries(cards).map(([id, c]) => [id, STAGE_RANK[stageOf(c)]]))

/** Growth not yet celebrated on this device: facts newly in bloom/golden, and creatures that can evolve. */
export function pendingGrowth(state: State) {
  const bloomed = Object.entries(state.cards)
    .filter(([id, c]) => STAGE_RANK[stageOf(c)] >= STAGE_RANK.flower && STAGE_RANK[stageOf(c)] > (state.celebrated[id] ?? 0))
    .map(([id, c]) => ({ id, stage: stageOf(c) }))
  const g = gardenCounts(state.cards)
  const best = { flowers: Math.max(state.gardenBest.flowers, g.flowers), golden: Math.max(state.gardenBest.golden, g.golden) }
  const owned = creaturesFor(derive(state).level)
  const evolutions = CREATURES
    .map((c, i) => ({ id: c.id, i }))
    .filter(({ id, i }) => owned.includes(id) && creatureForm(i, best) > creatureForm(i, state.gardenBest))
    .map(({ id, i }) => ({ id, form: creatureForm(i, best) as 2 | 3 }))
  const newBadges = earnedBadges(state).filter((b) => !state.badges.includes(b))
  return { bloomed, evolutions, newBadges, any: bloomed.length > 0 || evolutions.length > 0 || newBadges.length > 0 }
}

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'setName':
      return touch({ ...state, name: action.name.trim() || 'Champ', profileUpdated: Date.now() })
    case 'answer': {
      const { factId, correct, seconds, firstTry, idk } = action.event
      const card: Card = state.cards[factId] ?? newCard(factId)
      const me = myContrib(state)
      return touch({
        ...state,
        cards: { ...state.cards, [factId]: grade(card, correct, seconds, firstTry, Date.now(), !!idk) },
        contrib: { ...state.contrib, [state.deviceId]: { ...me, answered: me.answered + 1, correct: me.correct + (correct ? 1 : 0) } }
      }, false)
    }
    case 'finishQuest': {
      const r = action.result
      const t = today()
      const me = myContrib(state)
      // Daily goal bonus: awarded on the quest that reaches the goal (counting every device).
      const before = derive(state, t)
      const goalBonus = before.questsToday + 1 === state.settings.dailyGoal ? DAILY_GOAL_BONUS : 0
      const contrib = {
        ...state.contrib,
        [state.deviceId]: { ...me, xp: me.xp + r.xpEarned + goalBonus, quests: { ...me.quests, [t]: (me.quests[t] ?? 0) + 1 } }
      }
      const g = gardenCounts(state.cards)
      const gardenBest = {
        flowers: Math.max(state.gardenBest.flowers, g.flowers),
        golden: Math.max(state.gardenBest.golden, g.golden)
      }
      const summary: SessionSummary = {
        date: new Date().toISOString(),
        correct: r.answers.filter((a) => a.correct && a.firstTry).length,
        total: r.answers.filter((a) => a.firstTry).length,
        xp: r.xpEarned,
        stars: r.stars,
        avgSeconds: r.answers.length ? r.answers.reduce((s, a) => s + a.seconds, 0) / r.answers.length : 0,
        idk: r.answers.filter((a) => a.firstTry && a.idk).length,
        wrong: r.answers.filter((a) => a.firstTry && !a.correct && !a.idk).length
      }
      const badges = new Set([...state.badges, ...earnedBadges({ ...state, contrib }, t)])
      badges.add('first_quest')
      if (r.stars === 3) badges.add('perfect')
      if (r.fastCount >= 8) badges.add('speedy')

      let stagesOpen = state.stagesOpen
      if (shouldUnlockNext(state.cards, stagesOpen)) stagesOpen += 1

      return touch({
        ...state, contrib, badges: [...badges], stagesOpen, gardenBest, celebrated: ranksOf(state.cards),
        history: [...state.history, summary].slice(-60)
      })
    }
    case 'place': {
      const me = myContrib(state)
      const { card } = placeCard(action.factId, action.correct, action.seconds, Date.now(), !!action.idk)
      return touch({
        ...state,
        cards: { ...state.cards, [action.factId]: card },
        contrib: { ...state.contrib, [state.deviceId]: { ...me, answered: me.answered + 1, correct: me.correct + (action.correct ? 1 : 0) } }
      }, false)
    }
    case 'placementDone': {
      const r = action.result
      const me = myContrib(state)
      const summary: SessionSummary = {
        date: new Date().toISOString(), kind: 'placement', table: r.table,
        correct: r.known + r.shaky, total: r.known + r.shaky + r.idk + r.wrong, xp: r.xpEarned, stars: 0, idk: r.idk, wrong: r.wrong,
        avgSeconds: r.answers.length ? r.answers.reduce((s, a) => s + a.seconds, 0) / r.answers.length : 0
      }
      return touch({
        ...state,
        contrib: { ...state.contrib, [state.deviceId]: { ...me, xp: me.xp + r.xpEarned } },
        stagesOpen: Math.max(state.stagesOpen, TABLE_ORDER.indexOf(r.table) + 1),
        history: [...state.history, summary].slice(-60)
      })
    }
    case 'celebrated': {
      // Growth that arrived outside a quest (sync from another device, a scheduler change) has been shown.
      const g = gardenCounts(state.cards)
      const gardenBest = { flowers: Math.max(state.gardenBest.flowers, g.flowers), golden: Math.max(state.gardenBest.golden, g.golden) }
      const badges = [...new Set([...state.badges, ...earnedBadges(state)])]
      return { ...state, gardenBest, badges, celebrated: ranksOf(state.cards) }
    }
    case 'markKnown':
      return touch({ ...state, cards: { ...state.cards, [action.factId]: markKnown(state.cards[action.factId], action.factId) } })
    case 'markTableKnown': {
      const cards = { ...state.cards }
      for (const f of factsForTable(action.table)) cards[f.id] = markKnown(cards[f.id], f.id)
      return touch({ ...state, cards, stagesOpen: Math.max(state.stagesOpen, TABLE_ORDER.indexOf(action.table) + 1) })
    }
    case 'settings':
      return touch({ ...state, settings: { ...state.settings, ...action.settings }, profileUpdated: Date.now() })
    case 'unlockTable':
      return touch({ ...state, stagesOpen: Math.min(TABLE_ORDER.length, state.stagesOpen + 1) })
    case 'join':
      return touch({ ...state, familyCode: action.code })
    case 'reset':
      return touch({
        ...state, epoch: state.epoch + 1, cards: {}, badges: [], contrib: {}, history: [], stagesOpen: 1,
        gardenBest: { flowers: 0, golden: 0 }
      })
    case 'applySync': {
      let next = state
      if (action.state) {
        const incoming: State = { ...action.state, deviceId: state.deviceId, familyCode: action.code ?? state.familyCode }
        next = mergeStates([state, incoming])
        next.deviceId = state.deviceId
        next.familyCode = action.code ?? state.familyCode
      } else if (action.code) {
        next = { ...state, familyCode: action.code }
      }
      return { ...next, syncedMutation: Math.max(state.syncedMutation, action.syncedMutation), lastSync: Date.now() }
    }
    default:
      return state
  }
}

export function useStore() {
  const [state, dispatch] = useReducer(reducer, undefined, load)
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) } catch { /* ignore */ }
  }, [state])
  return [state, dispatch] as const
}
