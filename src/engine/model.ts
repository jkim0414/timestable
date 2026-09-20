// Shared data model + conflict-free merge, used by both the app and the /api/sync function.
// Every device only ever edits its own "contrib" entry and the cards it has reviewed,
// so merging copies from several devices never loses progress.

import { repairCard, type Card } from './scheduler.js'
import type { FactId } from './facts.js'

export interface Contrib {
  xp: number
  correct: number
  answered: number
  /** quests finished per day, YYYY-MM-DD -> count */
  quests: Record<string, number>
}

export interface Settings {
  sound: boolean
  dailyGoal: number
  answerMode: 'auto' | 'choice' | 'type'
}

export interface SessionSummary {
  date: string
  correct: number
  total: number
  xp: number
  stars: number
  avgSeconds: number
  /** "I don't know" answers on first asking. */
  idk?: number
  /** Wrong guesses on first asking. */
  wrong?: number
  /** Set for placement checks; they don't count as quests. */
  kind?: 'placement'
  table?: number
}

export interface State {
  version: 2
  /** Bumped by "reset progress"; copies from an older epoch are discarded on merge. */
  epoch: number
  deviceId: string
  familyCode: string
  name: string | null
  profileUpdated: number
  settings: Settings
  cards: Record<FactId, Card>
  stagesOpen: number
  badges: string[]
  contrib: Record<string, Contrib>
  history: SessionSummary[]
  /** High-water marks of the garden; drives creature evolution so creatures never regress. */
  gardenBest: { flowers: number; golden: number }
  // ---- local-only bookkeeping (never merged from other devices) ----
  /** Stage rank already celebrated on this device, per fact, so growth is announced exactly once. */
  celebrated: Record<string, number>
  syncRev: number
  mutationCount: number
  syncedMutation: number
  lastSync: number | null
}

export const emptyContrib = (): Contrib => ({ xp: 0, correct: 0, answered: 0, quests: {} })

export const dateKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export const LEVEL_XP = 150

/** XP needed to go from `level` to `level + 1`. Flat early on, then climbs 25 per level. */
export const xpForLevel = (level: number) => (level <= 11 ? LEVEL_XP : LEVEL_XP + 25 * (level - 11))

export function levelFromXp(xp: number) {
  let level = 1, remaining = xp
  while (remaining >= xpForLevel(level)) { remaining -= xpForLevel(level); level++ }
  const need = xpForLevel(level)
  return { level, into: remaining, need, progress: remaining / need }
}

export interface Derived {
  xp: number
  level: number
  levelProgress: number
  xpToNext: number
  totalCorrect: number
  totalAnswered: number
  questsToday: number
  streakDays: number
  practiceDays: Set<string>
  /** Streak savers in hand: earned every FREEZE_EVERY practice days, spent automatically on a missed day. */
  freezes: number
  freezeCap: number
  /** Most recent missed day that a saver covered, if any (YYYY-MM-DD). */
  lastFrozenDay: string | null
}

/** Earn one streak saver for every this many days of the streak. */
export const FREEZE_EVERY = 3
/** Hold up to 3 savers; one more for every 30 days practised, up to 5. */
export const freezeCapFor = (totalPracticeDays: number) => Math.min(5, 3 + Math.floor(totalPracticeDays / 30))

/** Totals derived from every device's contributions. */
export function derive(state: Pick<State, 'contrib'>, today = dateKey()): Derived {
  let xp = 0, totalCorrect = 0, totalAnswered = 0, questsToday = 0
  const practiceDays = new Set<string>()
  for (const c of Object.values(state.contrib ?? {})) {
    xp += c.xp; totalCorrect += c.correct; totalAnswered += c.answered
    for (const [d, n] of Object.entries(c.quests ?? {})) {
      if (n > 0) practiceDays.add(d)
      if (d === today) questsToday += n
    }
  }
  // Streak with savers: walk every day from the first practice day to today. A practice day extends the
  // streak and every FREEZE_EVERY days earns a saver; a missed day spends a saver if there is one, otherwise
  // the streak resets. Today doesn't count as missed until it's over.
  const freezeCap = freezeCapFor(practiceDays.size)
  let streakDays = 0, freezes = 0
  let lastFrozenDay: string | null = null
  const sorted = [...practiceDays].sort()
  if (sorted.length) {
    const cursor = new Date(sorted[0] + 'T12:00:00')
    for (let k = dateKey(cursor); k <= today; cursor.setDate(cursor.getDate() + 1), k = dateKey(cursor)) {
      if (practiceDays.has(k)) {
        streakDays++
        if (streakDays % FREEZE_EVERY === 0 && freezes < freezeCap) freezes++
      } else if (k === today) {
        // still in progress
      } else if (freezes > 0 && streakDays > 0) {
        freezes--
        lastFrozenDay = k
      } else {
        streakDays = 0
      }
    }
  }
  const lv = levelFromXp(xp)
  return {
    xp, level: lv.level, levelProgress: lv.progress, xpToNext: lv.need - lv.into,
    totalCorrect, totalAnswered, questsToday, streakDays, practiceDays, freezes, freezeCap, lastFrozenDay
  }
}

/** Merge several copies of a family's state. Pure; local-only fields come from the first copy. */
export function mergeStates(states: State[]): State {
  const epoch = Math.max(...states.map((s) => s.epoch ?? 1))
  const ss = states.filter((s) => (s.epoch ?? 1) === epoch)
  const base = ss[0]

  const contrib: Record<string, Contrib> = {}
  for (const s of ss) {
    for (const [dev, c] of Object.entries(s.contrib ?? {})) {
      const cur = contrib[dev]
      if (!cur || c.answered > cur.answered || (c.answered === cur.answered && c.xp > cur.xp)) contrib[dev] = c
    }
  }
  const practiceDays = derive({ contrib }).practiceDays.size

  const cards: Record<string, Card> = {}
  for (const s of ss) {
    for (const [id, c] of Object.entries(s.cards ?? {})) {
      const cur = cards[id]
      if (!cur || (c.last ?? 0) > (cur.last ?? 0) || ((c.last ?? 0) === (cur.last ?? 0) && c.reps > cur.reps)) cards[id] = repairCard(c, practiceDays)
    }
  }

  const profile = ss.reduce((a, b) => ((b.profileUpdated ?? 0) > (a.profileUpdated ?? 0) ? b : a), base)
  const historyMap = new Map<string, SessionSummary>()
  for (const s of ss) for (const h of s.history ?? []) historyMap.set(h.date, h)
  const history = [...historyMap.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-60)

  return {
    version: 2,
    epoch,
    deviceId: base.deviceId,
    familyCode: base.familyCode,
    name: profile.name ?? null,
    profileUpdated: profile.profileUpdated ?? 0,
    settings: profile.settings ?? base.settings,
    cards,
    stagesOpen: Math.max(...ss.map((s) => s.stagesOpen ?? 1)),
    badges: [...new Set(ss.flatMap((s) => s.badges ?? []))],
    contrib,
    history,
    gardenBest: {
      flowers: Math.max(0, ...ss.map((s) => s.gardenBest?.flowers ?? 0)),
      golden: Math.max(0, ...ss.map((s) => s.gardenBest?.golden ?? 0))
    },
    celebrated: base.celebrated ?? {},
    syncRev: base.syncRev ?? 0,
    mutationCount: base.mutationCount ?? 0,
    syncedMutation: base.syncedMutation ?? 0,
    lastSync: base.lastSync ?? null
  }
}

/** Strip local-only fields before sending to the server. */
export function forUpload(s: State): State {
  return { ...s, celebrated: {}, syncRev: 0, mutationCount: 0, syncedMutation: 0, lastSync: null }
}

// ---- Family codes ---------------------------------------------------------

const WORDS = (
  'apple banana cherry mango lemon peach grape melon berry plum kiwi ' +
  'tiger lion zebra panda koala otter bunny puppy kitten fox wolf bear moose deer owl duck swan frog ' +
  'turtle whale shark dolphin crab octopus penguin parrot eagle robin ' +
  'red blue green gold pink purple orange silver violet coral mint ' +
  'sunny rainy snowy windy cloudy starry misty breezy ' +
  'rocket comet planet moon star sun cloud river ocean island forest meadow garden castle bridge ' +
  'happy jolly brave clever speedy sparkly bouncy giggly cozy mighty tiny giant ' +
  'cookie muffin pancake waffle pretzel noodle pickle taco pizza'
).split(/\s+/).filter(Boolean)

export function makeCode(): string {
  const pick = () => WORDS[Math.floor(Math.random() * WORDS.length)]
  const n = String(Math.floor(Math.random() * 100)).padStart(2, '0')
  return `${pick()}-${pick()}-${pick()}-${n}`
}

export const normalizeCode = (s: string) => s.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
export const isValidCode = (s: unknown): s is string =>
  typeof s === 'string' && /^[a-z]{2,12}-[a-z]{2,12}-[a-z]{2,12}-\d{2}$/.test(s)
