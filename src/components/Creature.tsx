import { Creature as CreatureT } from '../engine/store'

/** A creature at a given evolution form: bigger, glowing, and crowned as it evolves. */
export default function Creature({ creature, form, size = 'md' }: { creature: CreatureT; form: 1 | 2 | 3; size?: 'md' | 'lg' }) {
  return (
    <span className={`creature-sprite f${form} ${size}`} aria-label={creature.name}>
      <span className="creature-glyph">{creature.forms[form - 1]}</span>
      {form === 3 && <span className="crown">👑</span>}
    </span>
  )
}
