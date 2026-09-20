# Times Garden 🌻

A gamified, offline-capable PWA that teaches the times tables (1–12) to young children. No accounts: every
install gets a family code, and progress syncs across devices under it.

## Learning design
- **Spaced repetition** — each of the 78 unordered facts (3×4 and 4×3 share a card) is a card in a simplified
  SM-2 schedule. A correct answer moves the next review out (1 day → 3–4 days → ×ease, capped at 60 days);
  a miss brings it back to "due now". Ease moves gently (+0.1 for a quick answer, otherwise unchanged; −0.2 for a
  miss, −0.1 for "I don't know") because a young child's timing is noisy.
- **Retrieval practice with expanding spacing** — a missed fact is re-asked 3 questions later in the same quest
  (flipped orientation, typed), then again about half a day later.
- **Concrete → recognition → recall** — new facts are introduced with a dot-array model and multiple choice, then
  move to typed recall once they've taken root. Misses show the array and the commutative partner.
- **Mastery-based unlocking** — tables open in the order 2, 10, 5, 3, 4, 6, 11, 7, 8, 9, 12 once ~75% of all open
  facts *and* two-thirds of the most recently opened table have taken root, with at most 2 unseen facts. Quests
  introduce 3 new facts (up to 5 while the pool is small).
- **Honest spacing** — answers within a 6-hour sitting don't move the schedule, and a fact reviewed before it was
  due only grows by the fraction of the wait that actually elapsed, so a fact must survive a real gap to advance.
- **Speed can only help** — retrieval latency (seconds until the child *starts* answering, not until ✓) is recorded,
  but a slow correct answer is graded exactly like any correct answer. A quick answer (<4 s) earns the ease bump
  and an XP bonus; "golden" requires a *median* recall under 4 s across the last five correct answers.
- **Slips aren't misses** — a wrong first answer offers one "that was a slip, let me try again" before the answer
  is revealed; a correct retry counts as correct, a second miss counts as a miss. A recorded miss costs two days of
  consistency credit (flower → bud), not all of it.
- **"I don't know" is a first-class answer** — recorded apart from wrong guesses (a missing memory, not a
  misconception): scheduled like a miss with the smaller ease penalty, taught on the spot, re-asked later, and paid
  2 XP so guessing never dominates. It doesn't count against accuracy but caps a quest at 2 stars.
- **Parents can override** — press-and-hold "I know this one" on a fact in the garden, or mark a whole table as
  known from the dashboard; either puts the facts in bloom with a week before their next review. Later misses still
  drop them back and re-teach.
- **Short, frequent sessions** — 10-question quests (up to 14 with re-asks), default daily goal of 2.

## Gamification
- **XP and levels** — 10 XP per correct answer, +5 if quick, +2 per answer of an in-quest run (max +10); 5 XP for a
  correct retry; 3 XP for a fact already answered this sitting; 2 XP for "I don't know". Levels cost 150 XP through
  level 11, then 25 more per level.
- **Stars** — 3 for a perfect quest, 2 for ≥75% on first tries, else 1. Any "I don't know" caps the quest at 2.
  The completion bonus (+20 / +10) scales with the share of fresh (non-repeat) questions, so grinding doesn't pay.
- **Daily goal** — a one-time +25 XP bonus on the quest that reaches the goal, counting every device.
- **Streak and streak savers** — one saver is earned every 3 streak days (hold 3; +1 capacity per 30 practice
  days, max 5). A missed day spends one automatically instead of breaking the streak. Today never counts as missed
  until it's over. Days are the device's local calendar days; the streak is derived from practice history, so it
  syncs and applies retroactively.
- **Badges** — first quest, perfect, lightning (8 quick answers), 3/7/30-day streaks, saved streak, 100/500 correct,
  one per mastered table, golden garden. Badges implied by state (streaks, totals, tables) are awarded on open, not
  only at the end of a quest.
- **The garden** — a 12×12 grid where every fact grows seed → sprout → bud → flower → golden. Bud and flower are
  earned by retention (schedule reaches 3 / 7 days) *or* by consistency (correct on 2 / 4 distinct days with no
  miss between), because for a six-year-old visible progress matters more than the stricter signal. Golden stays
  strict: 21-day schedule, 4 in a row, quick median recall.
- **Creatures** — 36 hatch one per level. Creature *n* evolves to "Big" at 2n flowers and to "Mega" at 2n golden
  flowers, read from the garden's high-water marks so a wilted flower never devolves a creature.
- **Celebrations** — quest results announce XP, level, stars, hatches, evolutions, unlocks, badges, and savers
  earned. Growth that arrives outside a quest (another device's play, a scheduler change, a parent override) is
  announced once per device on next open with a "Your garden grew!" screen.

## Placement check
- For children who already know some tables. Run from the grown-ups dashboard, one table at a time, ~2 minutes each,
  with a "check the next table" chain.
- Every fact in the table is asked once, typed, no hints. Slips and "I don't know" work as in quests.
- Correct answers seed the fact as already learned (3–5 day review, shown as Growing); misses are taught and
  seeded as due now. Results split quick / took a moment / didn't know yet / mixed up.
- The table opens when the check finishes. Placements earn XP but don't count as quests.

## Cross-device sync
- Every install generates a **family code** (e.g. `sunny-fox-mango-42`). Opening the share link (`/?join=CODE`)
  or typing the code on another device joins the same garden.
- Progress is stored per device in a private Vercel Blob store under `families/<code>/<device>.json` and merged by
  `api/sync.ts` on every sync: on open, after each quest or setting change, when the app is backgrounded with
  unsynced answers, and when the device comes back online.
- Merging is conflict-free: each device owns its own contribution record (XP, quests per day, answer counts);
  per-fact cards resolve to the most recent review; badges union; name and settings take the latest edit; the
  garden's high-water marks take the max. Two devices can be used offline and combined later.
- "Reset progress" bumps an epoch that every device adopts on its next sync.
- Local state is cached in localStorage, so the app works offline. The family code is the only key.

## Grown-ups
- Press and hold the ⚙️ on the home screen.
- **Progress** — last-7-quest accuracy, average time to start answering, wrong vs. "don't know" counts, streak and
  savers, tables open, facts per stage, and the facts that need practice.
- **Placement check** and **mark a table as known**.
- **Sync** — family code, share link, status, device count, sync now, join a different garden.
- **Settings** — child's name, daily goal, answer mode (auto / choice only / typing only), sound.
- **Controls** — unlock the next table manually, reset progress (all devices).

## Develop
- Vite + React + TypeScript, `vite-plugin-pwa`; no UI library. The engine lives in `src/engine/`
  (`facts`, `scheduler`, `model`, `store`, `sync`), the screens in `src/components/`, the sync function in `api/`.
- Relative imports inside `src/engine/` and `api/` use explicit `.js` extensions: the Vercel function runs as an
  ES module and Node's loader needs them (a bare `./x` import deploys fine and then fails at runtime).
- Cards carry a schema version (`v`); `repairCard` migrates older cards once, on load and during merge.
- Typecheck the function with `npx tsc -p tsconfig.api.json`. After any deploy that touches `api/` or
  `src/engine/`, POST to `/api/sync` with `push:false` and a throwaway code to confirm it answers `{"ok":true}`.

```bash
npm install
vercel blob create-store times-garden-sync --access private --yes   # once; links BLOB_READ_WRITE_TOKEN to the project
vercel env pull .env.local
vercel dev          # app + /api/sync against the real Blob store
npm run build
vercel deploy --prod
```
