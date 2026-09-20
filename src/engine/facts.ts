// The 78 unordered multiplication facts for 1..12 (a <= b).
// Unlocking a table (e.g. the 2s) opens every fact containing that factor.
// Commutative pairs share one card: learning 3×4 and 4×3 together is
// both more efficient and teaches the "turnaround" idea explicitly.

export type FactId = string

export interface Fact {
  id: FactId
  a: number // a <= b
  b: number
  product: number
  /** Which table's unlock makes this fact available (the later-unlocked factor). */
  stage: number
}

/**
 * Order in which tables are introduced. Starts with the easiest patterns
 * (2s, 10s, 5s), then builds. 1s are always available and attach to the other factor.
 */
export const TABLE_ORDER = [2, 10, 5, 3, 4, 6, 11, 7, 8, 9, 12]

/** Position of a table in the unlock order. 1s ride along with whichever table they pair with. */
export const tableIndex = (n: number) => (n === 1 ? 99 : TABLE_ORDER.indexOf(n))

export const factId = (a: number, b: number): FactId => {
  const [x, y] = a <= b ? [a, b] : [b, a]
  return `${x}x${y}`
}

export const FACTS: Fact[] = (() => {
  const out: Fact[] = []
  for (let a = 1; a <= 12; a++) {
    for (let b = a; b <= 12; b++) {
      const idx = Math.min(tableIndex(a), tableIndex(b))
      const stage = idx >= 99 ? TABLE_ORDER[0] : TABLE_ORDER[idx]
      out.push({ id: factId(a, b), a, b, product: a * b, stage })
    }
  }
  return out
})()

export const FACT_BY_ID: Record<FactId, Fact> = Object.fromEntries(FACTS.map((f) => [f.id, f]))

export const factsForTable = (t: number) => FACTS.filter((f) => f.a === t || f.b === t)
export const factsForStage = (t: number) => FACTS.filter((f) => f.stage === t)

/** Tables unlocked given how many stages the learner has opened. */
export const unlockedTables = (stagesOpen: number) => TABLE_ORDER.slice(0, Math.max(1, stagesOpen))

/** A fact is available once the table it belongs to has been unlocked. */
export const isFactUnlocked = (f: Fact, stagesOpen: number) => TABLE_ORDER.indexOf(f.stage) < Math.max(1, stagesOpen)

/** Plausible wrong answers: off-by-one-row errors, neighbouring products, add-instead-of-multiply. */
export function distractors(f: Fact, count = 3): number[] {
  const { a, b, product } = f
  const pool = new Set<number>()
  const add = (n: number) => {
    if (n !== product && n > 0 && n <= 150) pool.add(n)
  }
  add((a + 1) * b); add((a - 1) * b); add(a * (b + 1)); add(a * (b - 1))
  add(product + a); add(product - a); add(product + b); add(product - b)
  add(a + b)
  add(product + 1); add(product - 1); add(product + 10); add(product - 10)
  const arr = shuffle([...pool])
  // Prefer the "structural" errors (first 4) but keep variety.
  const structural = arr.filter((n) => [(a + 1) * b, (a - 1) * b, a * (b + 1), a * (b - 1)].includes(n))
  const rest = arr.filter((n) => !structural.includes(n))
  const picked: number[] = []
  for (const n of [...structural, ...rest]) {
    if (picked.length >= count) break
    if (!picked.includes(n)) picked.push(n)
  }
  return picked
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
