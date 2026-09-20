// Tiny synth so the app needs no audio assets and works offline.
let ctx: AudioContext | null = null
let enabled = true

export const setSoundEnabled = (on: boolean) => { enabled = on }

function ac() {
  if (!ctx) ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', vol = 0.18) {
  const c = ac()
  const o = c.createOscillator()
  const g = c.createGain()
  o.type = type
  o.frequency.value = freq
  g.gain.setValueAtTime(0, c.currentTime + start)
  g.gain.linearRampToValueAtTime(vol, c.currentTime + start + 0.01)
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + start + dur)
  o.connect(g).connect(c.destination)
  o.start(c.currentTime + start)
  o.stop(c.currentTime + start + dur + 0.02)
}

const safe = (fn: () => void) => { if (!enabled) return; try { fn() } catch { /* no audio */ } }

export const sfx = {
  tap: () => safe(() => tone(600, 0, 0.05, 'square', 0.05)),
  correct: () => safe(() => { tone(660, 0, 0.12); tone(880, 0.1, 0.18) }),
  wrong: () => safe(() => { tone(220, 0, 0.25, 'triangle', 0.12) }),
  fanfare: () => safe(() => { [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.12, 0.3)) }),
  hatch: () => safe(() => { [392, 523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.09, 0.35, 'triangle')) }),
  unlock: () => safe(() => { [440, 554, 659, 880].forEach((f, i) => tone(f, i * 0.1, 0.4)) })
}
