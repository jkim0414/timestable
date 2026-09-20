import { Dispatch, useState } from 'react'
import { FACTS, FACT_BY_ID, isFactUnlocked, TABLE_ORDER } from '../engine/facts'
import { avgTime, newCard, Stage, stageOf } from '../engine/scheduler'
import { Action, derive, State } from '../engine/store'
import { isValidCode, normalizeCode } from '../engine/model'
import { probeCode, SyncStatus } from '../engine/sync'
import { STAGE_EMOJI } from './Garden'

export default function Parent({ state, dispatch, sync, onBack, onPlacement }: {
  state: State; dispatch: Dispatch<Action>; sync: { status: SyncStatus; syncNow: () => void }; onBack: () => void
  onPlacement: (table: number) => void
}) {
  const nextTable = TABLE_ORDER[state.stagesOpen] ?? null
  const d = derive(state)
  const recent = state.history.filter((h) => h.kind !== 'placement').slice(-7)
  const acc = recent.reduce((s, h) => s + h.correct, 0) / Math.max(1, recent.reduce((s, h) => s + h.total, 0))
  const avgSec = recent.length ? recent.reduce((s, h) => s + h.avgSeconds, 0) / recent.length : 0

  const unlocked = FACTS.filter((f) => isFactUnlocked(f, state.stagesOpen))
  const counts: Record<Stage, number> = { seed: 0, sprout: 0, bud: 0, flower: 0, golden: 0 }
  for (const f of unlocked) counts[stageOf(state.cards[f.id] ?? newCard(f.id))]++

  const misses = (c: { lapses: number; idk?: number }) => c.lapses + (c.idk ?? 0)
  const weakest = unlocked
    .map((f) => state.cards[f.id])
    .filter((c): c is NonNullable<typeof c> => !!c && c.reps > 0 && misses(c) > 0)
    .sort((a, b) => (misses(b) / b.reps - misses(a) / a.reps) || (avgTime(b) - avgTime(a)))
    .slice(0, 6)
  const idkTotal = recent.reduce((s, h) => s + (h.idk ?? 0), 0)
  const wrongTotal = recent.reduce((s, h) => s + (h.wrong ?? 0), 0)

  const set = (s: Partial<State['settings']>) => dispatch({ type: 'settings', settings: s })

  return (
    <div className="screen parent">
      <header className="topbar">
        <button className="icon-btn" onClick={onBack} aria-label="Back">←</button>
        <h2>Grown-ups</h2>
        <span />
      </header>

      <section className="card">
        <h3>How it works</h3>
        <p>Each of the 78 facts (1–12, with 3×4 and 4×3 treated as one) is a card in a <b>spaced-repetition</b> schedule.
          Correct, fast answers push a fact further into the future; a miss brings it back within the same quest and again tomorrow.
          New facts are introduced with a dot-array picture and multiple choice, then move to typed recall.
          Tables unlock in the order 2, 10, 5, 3, 4, 6, 11, 7, 8, 9, 12 once most current facts have taken root.
          Two short quests a day beats one long one. Every 3 days of streak earns a <b>streak saver</b> 🛡️ (up to 3, more with
          long-term practice); a missed day spends one automatically instead of breaking the streak.</p>
      </section>

      <section className="card">
        <h3>Progress</h3>
        <div className="kv"><span>Last 7 quests accuracy</span><b>{recent.length ? `${Math.round(acc * 100)}%` : '—'}</b></div>
        <div className="kv"><span>Avg. time to start answering</span><b>{recent.length ? `${avgSec.toFixed(1)}s` : '—'}</b></div>
        <div className="kv"><span>Misses, last 7 quests</span><b>{recent.length ? `${wrongTotal} wrong · ${idkTotal} "don't know"` : '—'}</b></div>
        <div className="kv"><span>Total answered</span><b>{d.totalAnswered}</b></div>
        <div className="kv"><span>Day streak</span><b>{d.streakDays}</b></div>
        <div className="kv"><span>Streak savers</span><b>{d.freezes} of {d.freezeCap}</b></div>
        <div className="kv"><span>Tables open</span><b>{TABLE_ORDER.slice(0, state.stagesOpen).join(', ')}</b></div>
        <div className="stage-counts">
          {(Object.keys(counts) as Stage[]).map((s) => <span key={s}>{STAGE_EMOJI[s]} {counts[s]}</span>)}
        </div>
        {weakest.length > 0 && (
          <>
            <h4>Needs practice</h4>
            <div className="grown-list">
              {weakest.map((c) => <span key={c.id} className="grown">{FACT_BY_ID[c.id].a}×{FACT_BY_ID[c.id].b} ({c.lapses} wrong, {c.idk ?? 0} don't know)</span>)}
            </div>
          </>
        )}
      </section>

      <section className="card">
        <h3>Already knows some tables?</h3>
        <p className="tiny">Run a quick <b>placement check</b> instead of waiting for tables to unlock. Every fact in the table is asked once,
          typed, no hints. Correct answers start as Growing 🌿 with a review in a few days; misses get taught and come back tomorrow.
          Speed is shown but never counts against him. The table opens when the check finishes. About 2 minutes per table; sit with him for it.</p>
        {nextTable ? (
          <button className="btn primary" onClick={() => onPlacement(nextTable)}>🔍 Check the {nextTable}s</button>
        ) : <p className="tiny">All tables are open.</p>}
        <p className="tiny">Tables open in this order: {TABLE_ORDER.map((t) => (TABLE_ORDER.indexOf(t) < state.stagesOpen ? `✅${t}` : `${t}`)).join(' · ')}</p>
        <h4>Already knows a whole table cold?</h4>
        <p className="tiny">Mark it as known: every fact in it goes straight to bloom 🌸 with a week before its next review, the table opens
          (along with any earlier ones), and creatures evolve accordingly. Facts he then misses drop back and get re-taught, so nothing is
          lost by being generous. Individual facts can also be marked in the garden by pressing and holding "I know this one".</p>
        <div className="row">
          {TABLE_ORDER.map((t) => (
            <button key={t} className="btn small-btn" onClick={() => { if (confirm(`Mark every ${t}× fact as known?`)) dispatch({ type: 'markTableKnown', table: t }) }}>
              {t}s
            </button>
          ))}
        </div>
      </section>

      <SyncSection state={state} dispatch={dispatch} sync={sync} />

      <section className="card">
        <h3>Settings</h3>
        <label className="kv">
          <span>Child's name</span>
          <input className="input small" defaultValue={state.name ?? ''} onBlur={(e) => dispatch({ type: 'setName', name: e.target.value })} />
        </label>
        <label className="kv">
          <span>Daily goal (quests)</span>
          <select className="input small" value={state.settings.dailyGoal} onChange={(e) => set({ dailyGoal: Number(e.target.value) })}>
            {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <label className="kv">
          <span>Answer mode</span>
          <select className="input small" value={state.settings.answerMode} onChange={(e) => set({ answerMode: e.target.value as State['settings']['answerMode'] })}>
            <option value="auto">Auto (choice → typing)</option>
            <option value="choice">Multiple choice only</option>
            <option value="type">Typing only</option>
          </select>
        </label>
        <label className="kv">
          <span>Sound</span>
          <input type="checkbox" checked={state.settings.sound} onChange={(e) => set({ sound: e.target.checked })} />
        </label>
      </section>

      <section className="card">
        <h3>Controls</h3>
        <div className="row">
          <button className="btn" disabled={state.stagesOpen >= TABLE_ORDER.length} onClick={() => dispatch({ type: 'unlockTable' })}>
            Unlock next table
          </button>
          <button className="btn danger" onClick={() => { if (confirm('Reset all progress on every device? This cannot be undone.')) dispatch({ type: 'reset' }) }}>
            Reset progress
          </button>
        </div>
        <p className="tiny">On iPhone, tap Share → “Add to Home Screen” to install the app.</p>
      </section>
    </div>
  )
}

function SyncSection({ state, dispatch, sync }: { state: State; dispatch: Dispatch<Action>; sync: { status: SyncStatus; syncNow: () => void } }) {
  const [code, setCode] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const link = `${window.location.origin}/?join=${state.familyCode}`
  const devices = Object.keys(state.contrib).length

  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: 'Times Garden', text: `Join our Times Garden with code ${state.familyCode}`, url: link })
      else { await navigator.clipboard.writeText(link); setMsg('Link copied!') }
    } catch { /* cancelled */ }
  }

  const join = async () => {
    const c = normalizeCode(code)
    if (!isValidCode(c)) { setMsg('That code doesn\'t look right.'); return }
    if (c === state.familyCode) { setMsg('This device is already on that code.'); return }
    setBusy(true); setMsg(null)
    try {
      const found = await probeCode(c, state.deviceId)
      if (!found) { setMsg('No garden found with that code.'); return }
      if (!confirm(`Join garden "${c}"? Progress on this device will be combined with it.`)) return
      dispatch({ type: 'applySync', state: found, syncedMutation: 0, code: c })
      dispatch({ type: 'join', code: c })
      setCode(''); setMsg('Joined! Progress will now sync.')
    } catch { setMsg('Could not reach the server. Try again later.') } finally { setBusy(false) }
  }

  const statusText: Record<SyncStatus, string> = {
    idle: 'Not synced yet', syncing: 'Syncing…', ok: state.lastSync ? `Synced ${timeAgo(state.lastSync)}` : 'Synced',
    offline: 'Offline — will sync when back online', error: 'Sync failed — will retry'
  }

  return (
    <section className="card">
      <h3>Sync across devices</h3>
      <p className="tiny">Progress syncs to the cloud under your family code. Open the link (or type the code) on another phone or tablet to share one garden.</p>
      <div className="code-box" onClick={() => { navigator.clipboard?.writeText(state.familyCode); setMsg('Code copied!') }}>{state.familyCode}</div>
      <div className="kv"><span>Status</span><b>{statusText[sync.status]}</b></div>
      <div className="kv"><span>Devices</span><b>{devices || 1}</b></div>
      <div className="row">
        <button className="btn" onClick={share}>📤 Share link</button>
        <button className="btn" onClick={sync.syncNow} disabled={sync.status === 'syncing'}>🔄 Sync now</button>
      </div>
      <h4>Join a different garden</h4>
      <div className="row">
        <input className="input small code" placeholder="sunny-fox-mango-42" value={code} onChange={(e) => setCode(e.target.value)} autoCapitalize="none" spellCheck={false} />
        <button className="btn" onClick={join} disabled={busy || !code}>Join</button>
      </div>
      {msg && <div className="tiny">{msg}</div>}
    </section>
  )
}

function timeAgo(t: number) {
  const s = Math.round((Date.now() - t) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  if (s < 86400) return `${Math.round(s / 3600)} h ago`
  return `${Math.round(s / 86400)} d ago`
}
