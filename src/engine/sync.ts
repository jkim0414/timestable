import { Dispatch, useCallback, useEffect, useRef, useState } from 'react'
import { Action, forUpload, isDirty, State } from './store.js'

export type SyncStatus = 'idle' | 'syncing' | 'ok' | 'offline' | 'error'

interface SyncResponse { ok: boolean; found?: boolean; devices?: number; state?: State | null; error?: string }

async function call(body: unknown, keepalive = false): Promise<SyncResponse> {
  const res = await fetch('/api/sync', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), keepalive
  })
  if (!res.ok) throw new Error(`sync ${res.status}`)
  return res.json()
}

/** Look up a family code without uploading anything. Returns the merged state if the code exists. */
export async function probeCode(code: string, deviceId: string): Promise<State | null> {
  const r = await call({ code, deviceId, state: null, push: false, pull: true })
  return r.found && r.state ? r.state : null
}

export function useSync(state: State, dispatch: Dispatch<Action>) {
  const [status, setStatus] = useState<SyncStatus>('idle')
  const stateRef = useRef(state)
  stateRef.current = state
  const inFlight = useRef(false)
  const lastPull = useRef(0)

  const run = useCallback(async (opts: { push?: boolean; pull?: boolean } = {}) => {
    const s = stateRef.current
    const push = opts.push ?? isDirty(s)
    const pull = opts.pull ?? true
    if (!push && !pull) return
    if (inFlight.current) return
    if (!navigator.onLine) { setStatus('offline'); return }
    inFlight.current = true
    setStatus('syncing')
    const at = s.mutationCount
    try {
      const r = await call({ code: s.familyCode, deviceId: s.deviceId, state: push ? forUpload(s) : null, push, pull })
      if (pull) lastPull.current = Date.now()
      dispatch({ type: 'applySync', state: pull ? r.state ?? null : null, syncedMutation: push ? at : 0 })
      setStatus('ok')
    } catch {
      setStatus(navigator.onLine ? 'error' : 'offline')
    } finally {
      inFlight.current = false
    }
  }, [dispatch])

  // On open: pull (and push if there are unsynced changes).
  useEffect(() => { run() }, [run])

  // After a quest / profile change / join / reset: push + pull, lightly debounced.
  const lastRev = useRef(state.syncRev)
  useEffect(() => {
    if (state.syncRev === lastRev.current) return
    lastRev.current = state.syncRev
    const t = window.setTimeout(() => run({ push: true, pull: true }), 800)
    return () => window.clearTimeout(t)
  }, [state.syncRev, run])

  useEffect(() => {
    const onOnline = () => run()
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        if (Date.now() - lastPull.current > 2 * 60_000 || isDirty(stateRef.current)) run()
      } else if (isDirty(stateRef.current)) {
        // Flush partial progress when the app is backgrounded.
        const s = stateRef.current
        call({ code: s.familyCode, deviceId: s.deviceId, state: forUpload(s), push: true, pull: false }, true)
          .then(() => dispatch({ type: 'applySync', state: null, syncedMutation: s.mutationCount }))
          .catch(() => undefined)
      }
    }
    window.addEventListener('online', onOnline)
    document.addEventListener('visibilitychange', onVisible)
    return () => { window.removeEventListener('online', onOnline); document.removeEventListener('visibilitychange', onVisible) }
  }, [run, dispatch])

  return { status, syncNow: () => run({ push: true, pull: true }) }
}
