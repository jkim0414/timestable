import { Dispatch, useEffect, useState } from 'react'
import { Action, State } from '../engine/store'
import { isValidCode, normalizeCode } from '../engine/model'
import { probeCode } from '../engine/sync'

export default function Onboarding({ state, dispatch, initialCode, onDone }: {
  state: State; dispatch: Dispatch<Action>; initialCode: string | null; onDone: () => void
}) {
  const [name, setName] = useState('')
  const [mode, setMode] = useState<'new' | 'join'>(initialCode ? 'join' : 'new')
  const [code, setCode] = useState(initialCode ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const join = async (raw: string) => {
    const c = normalizeCode(raw)
    if (!isValidCode(c)) { setError('That code doesn\'t look right. It should be like "sunny-fox-mango-42".'); return }
    setBusy(true); setError(null)
    try {
      const found = await probeCode(c, state.deviceId)
      if (!found) { setError('No garden found with that code. Check the spelling on the other device.'); return }
      dispatch({ type: 'applySync', state: found, syncedMutation: 0, code: c })
      onDone()
    } catch {
      setError(navigator.onLine ? 'Could not reach the garden. Try again in a moment.' : 'You\'re offline. Connect to the internet to join.')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => { if (initialCode) void join(initialCode) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="screen center">
      <div className="hero">🌻</div>
      <h1>Times Garden</h1>
      <p className="lead">Grow a garden by learning your times tables!</p>

      {mode === 'new' ? (
        <form className="stack" onSubmit={(e) => { e.preventDefault(); dispatch({ type: 'setName', name: name || 'Champ' }); onDone() }}>
          <label className="label" htmlFor="name">What's your name?</label>
          <input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" autoComplete="off" maxLength={16} />
          <button className="btn primary big" type="submit">Let's grow! 🌱</button>
          <button className="link-btn" type="button" onClick={() => setMode('join')}>Already have a garden on another device?</button>
        </form>
      ) : (
        <form className="stack" onSubmit={(e) => { e.preventDefault(); void join(code) }}>
          <label className="label" htmlFor="code">Type your family code</label>
          <input id="code" className="input code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="sunny-fox-mango-42" autoComplete="off" autoCapitalize="none" spellCheck={false} />
          {error && <div className="error">{error}</div>}
          <button className="btn primary big" type="submit" disabled={busy}>{busy ? 'Connecting…' : 'Join my garden 🔗'}</button>
          <button className="link-btn" type="button" onClick={() => { setMode('new'); setError(null); onDone() }}>Start a new garden instead</button>
        </form>
      )}
    </div>
  )
}
