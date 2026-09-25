// Shell spec §12.3 keycaps, shared by tooltips, the shortcuts sheet and
// menus (muted there).

import type { JSX } from 'react'
import { detectPlatform, formatChord } from '@/editor/shortcuts'

export function Keycap({ label, muted }: { label: string; muted?: boolean }): JSX.Element {
  return <kbd className={muted === true ? 'keycap keycap-muted' : 'keycap'}>{label}</kbd>
}

export function ChordKeys({ chord, muted }: { chord: string; muted?: boolean }): JSX.Element {
  return (
    <span className="chord">
      {formatChord(chord, detectPlatform()).map((k, i) => (
        <Keycap key={i} label={k} muted={muted === true} />
      ))}
    </span>
  )
}
