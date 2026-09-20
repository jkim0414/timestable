import type { VercelRequest, VercelResponse } from '@vercel/node'
import { get, list, put } from '@vercel/blob'
import { isValidCode, mergeStates, type State } from '../src/engine/model.js'

const DEVICE_RE = /^[a-z0-9-]{8,64}$/
const MAX_BYTES = 300_000

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  const body = (typeof req.body === 'string' ? safeJson(req.body) : req.body) ?? {}
  const { code, deviceId, state, push = true, pull = true } = body as {
    code?: unknown; deviceId?: unknown; state?: State | null; push?: boolean; pull?: boolean
  }
  if (!isValidCode(code)) return res.status(400).json({ error: 'bad code' })
  if (typeof deviceId !== 'string' || !DEVICE_RE.test(deviceId)) return res.status(400).json({ error: 'bad device' })

  const prefix = `families/${code}/`
  const mine = `${prefix}${deviceId}.json`

  try {
    if (push && state && typeof state === 'object') {
      const json = JSON.stringify(state)
      if (json.length > MAX_BYTES) return res.status(413).json({ error: 'too large' })
      await put(mine, json, {
        access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json'
      })
    }
    if (!pull) return res.json({ ok: true })

    const { blobs } = await list({ prefix, limit: 50 })
    const others = await Promise.all(
      blobs.filter((b) => b.pathname !== mine).map(async (b) => {
        try {
          const r = await get(b.pathname, { access: 'private', useCache: false })
          if (!r || r.statusCode !== 200) return null
          return JSON.parse(await new Response(r.stream).text()) as State
        } catch { return null }
      })
    )
    const states: State[] = [...others.filter((s): s is State => !!s && typeof s === 'object'), ...(state ? [state] : [])]
    if (states.length === 0) return res.json({ ok: true, found: false, state: null, devices: 0 })
    return res.json({ ok: true, found: others.some(Boolean), devices: blobs.length, state: mergeStates(states) })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: 'sync failed' })
  }
}

function safeJson(s: string) { try { return JSON.parse(s) } catch { return null } }
