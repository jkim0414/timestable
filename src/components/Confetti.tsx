import { useEffect, useRef } from 'react'

export default function Confetti({ count = 120 }: { count?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current!
    const ctx = canvas.getContext('2d')!
    const dpr = window.devicePixelRatio || 1
    const W = (canvas.width = window.innerWidth * dpr)
    const H = (canvas.height = window.innerHeight * dpr)
    const colors = ['#ff7b7b', '#ffd166', '#63c76a', '#5b8def', '#c77dff', '#ff9f43']
    const parts = Array.from({ length: count }).map(() => ({
      x: Math.random() * W, y: -Math.random() * H * 0.5,
      vx: (Math.random() - 0.5) * 3 * dpr, vy: (2 + Math.random() * 3) * dpr,
      r: (4 + Math.random() * 5) * dpr, rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.2,
      c: colors[Math.floor(Math.random() * colors.length)]
    }))
    let frame = 0
    let raf = 0
    const draw = () => {
      ctx.clearRect(0, 0, W, H)
      for (const p of parts) {
        p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.vy += 0.02 * dpr
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot)
        ctx.fillStyle = p.c; ctx.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * 0.6)
        ctx.restore()
      }
      if (frame++ < 240) raf = requestAnimationFrame(draw)
      else ctx.clearRect(0, 0, W, H)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [count])
  return <canvas ref={ref} className="confetti" />
}
