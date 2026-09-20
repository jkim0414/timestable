# Times Garden 🌻

A gamified, offline-capable PWA that teaches the times tables (1–12) to young children.

## Learning design
- **Spaced repetition** — each of the 78 unordered facts (3×4 and 4×3 share a card) is scheduled with a
  simplified SM-2. Fast, correct answers grow the interval (hours → days → weeks); misses reset it.
  Repeat answers within the same sitting don't inflate the schedule.
- **Retrieval practice with expanding spacing** — a missed fact is re-asked 3 questions later in the
  same quest (flipped orientation, typed), then again the next day.
- **Concrete → recognition → recall** — new facts are introduced with a dot-array model and multiple choice,
  then move to typed recall once they've taken root. Wrong answers show the array and the commutative partner.
- **Mastery-based unlocking** — tables open in the order 2, 10, 5, 3, 4, 6, 11, 7, 8, 9, 12 once ~75% of all open
  facts *and* two-thirds of the most recently opened table have taken root; at most 3–5 new facts per quest.
- **Speed can only help** — retrieval latency (seconds until the child *starts* answering) is recorded, but a
  slow correct answer is graded exactly like any correct answer: a distracted six-year-old is slow on facts he
  knows cold. A fast answer (<4 s) earns a small ease bump and XP bonus, and "golden" requires a *median*
  recall under 4 s across the last five correct answers, so a distraction or two doesn't block it.
- **Slips aren't misses** — a wrong first answer offers one "that was a slip, let me try again" before the answer
  is revealed; a correct retry counts as correct, a second miss counts as a miss. A recorded miss costs two days of
  consistency credit (flower → bud), not all of it. Parents can mark a fact (press-and-hold in the garden) or a
  whole table (dashboard) as known; misses after that still drop it back.
- **"I don't know" is a first-class answer** — recorded apart from wrong guesses (a missing memory, not a
  misconception): scheduled like a miss with a smaller ease penalty, taught on the spot, re-asked later, and paid
  a small honesty bonus so guessing never dominates. It doesn't count against accuracy but caps a quest at 2 stars.
  The parent dashboard shows wrong vs. "don't know" counts per fact and per week.
- **Honest spacing** — repeat answers within a 6-hour sitting don't move the schedule, and a fact reviewed
  before it was due only grows by the fraction of the wait that actually elapsed.
- **Short, frequent sessions** — 10-question quests, default daily goal of 2.

## Gamification
XP and levels (150 XP per level for the first 11, then +25 per level), 1–3 stars per quest, daily streak with
**streak savers** (one earned every 3 streak days, hold up to 3, +1 capacity per 30 practice days; a missed day
spends one automatically instead of breaking the streak; derived from practice history so it syncs and applies
retroactively),
badges, and a 12×12 garden where every fact grows from seed → sprout → bud → flower → golden. Bud and flower can be
earned two ways: by retention (schedule reaches 3 / 7 days) **or by consistency** (correct on 2 / 4 distinct days
with no miss in between), because for a six-year-old the motivational value of visible progress outweighs the
stricter retention signal. Golden stays strict (21-day schedule, quick recall). Growth that arrives outside a quest
(another device's play, a scheduler change) is announced once on next open with a "Your garden grew!" screen.
Repeat answers within a sitting pay only 3 XP and shrink the completion bonus, so levels track learning
rather than grinding. Hitting the daily quest goal pays a one-time +25 XP bonus per day (shared across devices).
Creature evolution reads the garden's high-water marks, so a wilted flower never devolves a creature.
36 creatures hatch one per level; creature *n* evolves to its "Big" form at 2n flowers and to "Mega" at
2n golden flowers, so the last evolutions need an almost fully golden garden.

## Placement check
For children who already know some tables, the grown-ups dashboard offers a per-table **placement check**:
every fact asked once, typed, no hints. Correct answers seed the card as already learned (2–4 day review,
"Growing"); misses are taught and seeded as due now. The table unlocks when the check finishes. Placements earn XP but don't count as quests.

## Cross-device sync
Every install gets a **family code** (e.g. `sunny-fox-mango-42`). Progress syncs to a private
Vercel Blob store under that code via `api/sync.ts`; opening the share link (`/?join=CODE`) or typing the
code on another device joins the same garden. Merging is conflict-free: each device owns its own
contribution record (XP, quests, answer counts) and per-fact cards resolve to the most recent review,
so two devices can be used offline and combined later. "Reset progress" bumps an epoch that every device
adopts on its next sync. Local state is cached in localStorage so the app works offline.

## Grown-ups
Press and hold the ⚙️ on the home screen for the parent dashboard: accuracy, weakest facts,
name/goal/sound/answer-mode settings, sync code + share link, manual table unlock, and reset.

## Develop
```bash
npm install
vercel dev          # app + /api/sync against the real Blob store (needs .env.local from `vercel env pull`)
npm run build
vercel deploy --prod
```
