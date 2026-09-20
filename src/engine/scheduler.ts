// Spaced-repetition scheduler. A simplified SM-2 with two additions that
// matter for fact fluency in young children:
//  1. Response time feeds the grade (fast + correct = stronger memory).
//  2. Intervals grow from hours -> days -> weeks; lapses reset to short.

import { FACTS, Fact, FactId, FACT_BY_ID, isFactUnlocked, shuffle, TABLE_ORDER } from './facts.js'

export interface Card {
  id: FactId
  interval: number // days
  ease: number
  due: number // epoch ms
  reps: number
  lapses: number // wrong answers
  idk: number // "I don't know" answers (honest gaps, tracked apart from guesses)
  streak: number // consecutive correct
  times: number[] // last few retrieval latencies (seconds to start answering), correct answers only
  /** Consecutive distinct days with a correct answer and no miss in between (consistency credit). */
  days: number
  /** Local date (YYYY-MM-DD) of the last correct answer, for counting distinct days. */
  lastDay: string
  /** Card schema version; cards without it get a one-time repair (see repairCard). */
  v?: number
  last: number // epoch ms of last review
}

export type Stage = 'seed' | 'sprout' | 'bud' | 'flower' | 'golden'

const DAY = 86_400_000
const HOUR = 3_600_000
/**
 * Speed thresholds are on retrieval latency: seconds until the child starts answering
 * (first digit typed, or option tapped), not until the answer is submitted.
 */
const FAST_SECONDS = 4 // "automatic": counts toward golden and the ease bump
/** Reviews closer together than this count as the same sitting and don't grow the interval. */
export const SAME_SITTING = 6 * HOUR

/** True when this card was already reviewed in the current sitting (repeat practice, not new evidence). */
export const isRepeatReview = (card: Card | undefined, now = Date.now()) =>
  !!card && card.last > 0 && now - card.last < SAME_SITTING

export type PlacementVerdict = 'known' | 'shaky' | 'idk' | 'wrong'

/**
 * Seed a card from a one-off placement answer. Correct = already learned (starts at "Growing" with a
 * real gap to survive; a fact that was actually shaky will miss within a review or two and come back);
 * wrong = not yet learned. Speed is recorded but never counts against the child.
 */
export function placeCard(id: FactId, correct: boolean, seconds: number, now = Date.now(), idk = false): { card: Card; verdict: PlacementVerdict } {
  const base = newCard(id)
  if (correct) {
    const interval = Math.round((3 + Math.random() * 2) * 10) / 10 // 3–5 days, staggered (≥3 shows as Growing)
    return {
      verdict: seconds < FAST_SECONDS ? 'known' : 'shaky',
      card: { ...base, interval, ease: 2.5, due: now + interval * DAY, reps: 2, streak: 2, times: [Math.min(seconds, 30)], last: now, days: 1, lastDay: localDay(now) }
    }
  }
  if (idk) return { verdict: 'idk', card: { ...base, interval: 0, due: now, reps: 1, idk: 1, streak: 0, ease: 2.2, last: now } }
  return { verdict: 'wrong', card: { ...base, interval: 0, due: now, reps: 1, lapses: 1, streak: 0, ease: 2.1, last: now } }
}

/** Parent/child override: treat a fact as known. Puts it in bloom via the consistency path with a week's gap. */
export function markKnown(card: Card | undefined, id: FactId, now = Date.now()): Card {
  const c = card ?? newCard(id)
  const interval = Math.max(c.interval, 7)
  return {
    ...c, v: CARD_VERSION,
    reps: Math.max(c.reps, 1), streak: Math.max(c.streak, 3), days: Math.max(c.days ?? 0, FLOWER_DAYS),
    ease: Math.max(c.ease, 2.0), interval, due: Math.max(c.due, now + interval * DAY), last: now, lastDay: localDay(now)
  }
}

/** Garden totals used for creature evolution. */
export function gardenCounts(cards: Record<FactId, Card>) {
  let flowers = 0, golden = 0
  for (const c of Object.values(cards)) {
    const st = stageOf(c)
    if (st === 'golden') { golden++; flowers++ } else if (st === 'flower') flowers++
  }
  return { flowers, golden }
}

export const newCard = (id: FactId): Card => ({
  id, interval: 0, ease: 2.3, due: 0, reps: 0, lapses: 0, idk: 0, streak: 0, times: [], last: 0, days: 0, lastDay: '', v: CARD_VERSION
})

export const CARD_VERSION = 3

export const localDay = (ms: number) => {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * One-time repair for cards graded by the first scheduler, whose speed thresholds were calibrated
 * for adults: a 6-year-old typing on a touchscreen looked "slow" on every answer, so ease sank to
 * the floor and half-day intervals never promoted. Idempotent: cards already at CARD_VERSION are untouched.
 */
export function repairCard(c: Card, practiceDays = 0): Card {
  if ((c.v ?? 0) >= CARD_VERSION) return c
  const r: Card = { ...c, idk: c.idk ?? 0, days: c.days ?? 0, lastDay: c.lastDay ?? '' }
  if ((c.v ?? 0) < 2) {
    r.ease = Math.max(r.ease, Math.max(1.3, 2.0 - 0.2 * r.lapses - 0.1 * r.idk))
    if (r.interval > 0 && r.interval < 1 && r.streak >= 2) {
      r.interval = 1
      r.due = Math.max(r.due, r.last + DAY)
    }
  }
  if ((c.v ?? 0) < 3) {
    // Retroactive consistency credit. Per-day history wasn't recorded, so estimate the run of correct
    // days as the smallest of: the correct streak, the number of reviews, and the days practised so far.
    r.days = Math.min(r.streak, r.reps, practiceDays)
    // Only the device knows the child's local date; on the server leave it blank (the next correct
    // answer then counts as a new day, which errs on the generous side).
    r.lastDay = r.last && typeof window !== 'undefined' ? localDay(r.last) : ''
  }
  r.v = CARD_VERSION
  return r
}

export const avgTime = (c: Card) =>
  c.times.length ? c.times.reduce((s, t) => s + t, 0) / c.times.length : Infinity

/** Median recall time: tolerant of a distracted answer or two. */
export const medianTime = (c: Card) => {
  if (!c.times.length) return Infinity
  const t = [...c.times].sort((a, b) => a - b)
  return t[Math.floor(t.length / 2)]
}

/** Days of consistent correct answers that earn bud and flower, regardless of the calendar gap. */
export const BUD_DAYS = 2
export const FLOWER_DAYS = 4

export function stageOf(c: Card): Stage {
  if (c.reps === 0) return 'seed'
  // Golden stays strict: it is the true mark of long-term mastery.
  if (c.interval >= 21 && c.streak >= 4 && medianTime(c) < FAST_SECONDS) return 'golden'
  // Bloom rewards either retention across a real gap or consistency across days.
  if ((c.interval >= 7 && c.streak >= 3) || (c.days ?? 0) >= FLOWER_DAYS) return 'flower'
  if ((c.interval >= 3 && c.streak >= 2) || (c.days ?? 0) >= BUD_DAYS) return 'bud'
  return 'sprout'
}

export const STAGE_RANK: Record<Stage, number> = { seed: 0, sprout: 1, bud: 2, flower: 3, golden: 4 }

/**
 * Apply one answer to a card.
 * @param firstTry false when this is an in-session re-ask after a miss
 * @param idk true when the child said "I don't know" instead of answering. Scheduled like a miss,
 *   but recorded separately: an honest gap isn't a misconception, so the ease penalty is smaller.
 */
export function grade(card: Card, correct: boolean, seconds: number, firstTry: boolean, now = Date.now(), idk = false): Card {
  const c: Card = { ...card, times: [...card.times], idk: card.idk ?? 0, days: card.days ?? 0, lastDay: card.lastDay ?? '' }
  const sinceLast = now - (card.last || 0)
  c.last = now
  if (!correct) {
    if (idk) c.idk += 1
    else c.lapses += 1
    c.streak = 0
    // A miss costs two days of consistency credit rather than all of it: a flower drops to a bud,
    // not to a sprout, so one slip doesn't erase a week of good answers.
    c.days = Math.max(0, c.days - 2)
    c.lastDay = ''
    c.reps += 1
    c.interval = 0
    c.ease = Math.max(1.3, c.ease - (idk ? 0.1 : 0.2))
    c.due = now // stays due; the session will re-ask it
    return c
  }
  c.reps += 1
  c.streak += 1
  c.times = [...c.times, Math.min(seconds, 30)].slice(-5)
  // Consistency: one credit per distinct day answered correctly (a retry after a miss doesn't count).
  if (firstTry && localDay(now) !== c.lastDay) {
    c.days += 1
    c.lastDay = localDay(now)
  }

  if (!firstTry) {
    // Got it on the retry: schedule a short interval so it comes back soon.
    c.interval = 0.5
    c.due = now + 0.5 * DAY
    return c
  }

  // Speed can only help, never hurt: a young child who hasn't been told timing matters, and who gets
  // distracted mid-quest, produces slow answers on facts he knows cold. A fast answer is still evidence
  // of automaticity, so it earns a small ease bump.
  const fast = seconds < FAST_SECONDS

  // Answered again within the same sitting: good practice, but not evidence of
  // long-term retention, so keep the schedule where it is.
  if (c.interval >= 1 && sinceLast < SAME_SITTING) {
    c.due = Math.max(c.due, now + SAME_SITTING)
    return c
  }

  if (fast) c.ease = Math.min(2.8, c.ease + 0.1)

  let full: number
  if (c.interval < 1) full = 1
  else if (c.interval < 3) full = fast ? 4 : 3
  else full = c.interval * c.ease

  // Reviewed before it was due? Only credit the fraction of the wait that actually passed,
  // so a fact has to survive a real gap before its schedule grows.
  if (c.interval >= 1 && card.last) {
    const elapsedDays = sinceLast / DAY
    const fraction = Math.min(1, elapsedDays / c.interval)
    full = c.interval + (full - c.interval) * fraction
  }
  c.interval = Math.min(Math.round(full * 10) / 10, 60)
  // ±10% jitter so facts learned together drift apart (interleaving).
  const jitter = 0.9 + Math.random() * 0.2
  c.due = now + c.interval * DAY * jitter
  return c
}

export type Format = 'choice' | 'type'

export interface Question {
  fact: Fact
  /** Which way round to show it (a×b or b×a). */
  flipped: boolean
  format: Format
  isNew: boolean
  reask: boolean
  /** For re-asks: whether the original asking was a same-sitting repeat. */
  wasRepeat?: boolean
}

export interface SessionPlan {
  questions: Question[]
}

export const NEW_PER_SESSION = 3
const MAX_NEW_SMALL = 5
export const SESSION_LENGTH = 10

function pickFormat(card: Card, mode: 'auto' | 'choice' | 'type'): Format {
  if (mode !== 'auto') return mode
  // Recognition first, recall once the fact has taken root.
  return stageOf(card) === 'seed' || stageOf(card) === 'sprout' ? 'choice' : 'type'
}

/** Build a session: due reviews first, a few new facts, then weakest-ahead. */
export function buildSession(
  cards: Record<FactId, Card>,
  stagesOpen: number,
  mode: 'auto' | 'choice' | 'type',
  now = Date.now(),
  length = SESSION_LENGTH
): SessionPlan {
  const unlocked = FACTS.filter((f) => isFactUnlocked(f, stagesOpen))
  const get = (f: Fact) => cards[f.id] ?? newCard(f.id)

  const due = unlocked.filter((f) => get(f).reps > 0 && get(f).due <= now)
    .sort((x, y) => get(x).due - get(y).due)
  const fresh = unlocked.filter((f) => get(f).reps === 0)
    .sort((x, y) => TABLE_ORDER.indexOf(x.stage) - TABLE_ORDER.indexOf(y.stage) || x.product - y.product)
  const ahead = unlocked.filter((f) => get(f).reps > 0 && get(f).due > now)
    // weakest first: low ease, slow, then soonest due
    .sort((x, y) => (get(x).ease - get(y).ease) || (avgTime(get(y)) - avgTime(get(x))) || (get(x).due - get(y).due))

  const chosen: Fact[] = []
  // Normally introduce 3 new facts; when the garden is still small, allow up to 5 so
  // the first sessions aren't just the same two facts over and over.
  const room = length - due.length - ahead.length
  const want = Math.max(NEW_PER_SESSION, Math.min(MAX_NEW_SMALL, room))
  const newCount = Math.min(fresh.length, want, Math.max(0, length - due.length))
  chosen.push(...due.slice(0, length - newCount))
  chosen.push(...fresh.slice(0, newCount))
  for (const f of ahead) {
    if (chosen.length >= length) break
    if (!chosen.includes(f)) chosen.push(f)
  }
  // If the garden is still tiny, allow repeats so the session isn't 3 questions long.
  const base = [...chosen]
  let i = 0
  while (chosen.length < length && base.length > 0) {
    chosen.push(base[i % base.length]); i++
  }

  // Shuffle but keep new facts out of the very first slot and avoid adjacent repeats.
  let order = shuffle(chosen)
  for (let attempt = 0; attempt < 20; attempt++) {
    const bad = order.some((f, k) => k > 0 && order[k - 1].id === f.id) || get(order[0]).reps === 0
    if (!bad) break
    order = shuffle(chosen)
  }

  const questions: Question[] = order.map((fact) => {
    const card = get(fact)
    return {
      fact,
      flipped: fact.a !== fact.b && Math.random() < 0.5,
      format: pickFormat(card, mode),
      isNew: card.reps === 0,
      reask: false
    }
  })
  return { questions }
}

/**
 * Should the next table unlock? Most unlocked facts have taken root, few are unseen, and the most
 * recently opened table has itself taken root (otherwise a big pool of old mastered facts would
 * wave through table after table before the new one is learned).
 */
export function shouldUnlockNext(cards: Record<FactId, Card>, stagesOpen: number): boolean {
  if (stagesOpen >= TABLE_ORDER.length) return false
  const unlocked = FACTS.filter((f) => isFactUnlocked(f, stagesOpen))
  const cs = unlocked.map((f) => cards[f.id] ?? newCard(f.id))
  const rooted = (list: Card[]) => list.filter((c) => STAGE_RANK[stageOf(c)] >= STAGE_RANK.bud).length
  const unseen = cs.filter((c) => c.reps === 0).length
  const latest = FACTS.filter((f) => f.stage === TABLE_ORDER[stagesOpen - 1]).map((f) => cards[f.id] ?? newCard(f.id))
  const latestUnseen = latest.filter((c) => c.reps === 0).length
  return unseen <= 2 && rooted(cs) / cs.length >= 0.75 && latestUnseen === 0 && rooted(latest) / latest.length >= 2 / 3
}

export function tableProgress(cards: Record<FactId, Card>, table: number) {
  const fs = FACTS.filter((f) => f.a === table || f.b === table)
  const ranks = fs.map((f) => STAGE_RANK[stageOf(cards[f.id] ?? newCard(f.id))])
  const total = ranks.reduce((s, r) => s + r, 0)
  return { facts: fs.length, score: total / (fs.length * 4), mastered: ranks.every((r) => r >= 3) }
}

export const factLabel = (id: FactId) => {
  const f = FACT_BY_ID[id]
  return `${f.a} × ${f.b}`
}
