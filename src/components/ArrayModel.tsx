/** Concrete representation: `rows` groups of `cols` dots. */
export default function ArrayModel({ rows, cols, small = false }: { rows: number; cols: number; small?: boolean }) {
  const max = Math.max(rows, cols)
  const size = small ? Math.min(12, 150 / max) : Math.min(22, 260 / max)
  const gap = size / 3
  return (
    <div className="array" aria-label={`${rows} rows of ${cols}`}>
      {Array.from({ length: rows }).map((_, r) => (
        <div className="array-row" key={r} style={{ gap }}>
          {Array.from({ length: cols }).map((_, c) => (
            <span
              key={c}
              className="dot"
              style={{ width: size, height: size, background: `hsl(${(r * 37) % 360} 80% 60%)`, animationDelay: `${(r * cols + c) * 12}ms` }}
            />
          ))}
        </div>
      ))}
    </div>
  )
}
