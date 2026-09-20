import { sfx } from '../engine/audio'

export default function Numpad({ value, onChange, onSubmit, disabled }: {
  value: string; onChange: (v: string) => void; onSubmit: () => void; disabled?: boolean
}) {
  const press = (d: string) => {
    if (disabled) return
    sfx.tap()
    if (d === '⌫') onChange(value.slice(0, -1))
    else if (value.length < 3) onChange(value === '0' ? d : value + d)
  }
  return (
    <div className="numpad">
      {['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0'].map((k) => (
        <button key={k} className={`key ${k === '⌫' ? 'muted' : ''}`} onClick={() => press(k)} disabled={disabled}>{k}</button>
      ))}
      <button className="key go" onClick={() => { if (value && !disabled) onSubmit() }} disabled={disabled || !value}>✓</button>
    </div>
  )
}
