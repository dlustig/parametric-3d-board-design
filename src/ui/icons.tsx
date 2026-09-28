// Shell §2.4: the four domain glyphs Lucide lacks, on Lucide's 24-unit,
// currentColor, 1.6-stroke, round-cap grid (paths from the approved mockups).

import type { JSX, ReactNode } from 'react'

type IconProps = { size?: number }

function Glyph({ size, children }: { size: number; children: ReactNode }): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  )
}

export function BandIcon({ size = 18 }: IconProps): JSX.Element {
  return (
    <Glyph size={size}>
      <path d="M3 17L10 8l5 6 6-9" strokeWidth={3.2} />
    </Glyph>
  )
}

export function CrossingIcon({ size = 18 }: IconProps): JSX.Element {
  return (
    <Glyph size={size}>
      <path d="M4 20L20 4" strokeWidth={3} />
      <path d="M4 4l6 6M14 14l6 6" strokeWidth={3} />
    </Glyph>
  )
}

export function MotifIcon({ size = 18 }: IconProps): JSX.Element {
  return (
    <Glyph size={size}>
      <rect x="4" y="4" width="7" height="7" rx="1" />
      <rect x="13" y="4" width="7" height="7" rx="1" />
      <rect x="4" y="13" width="7" height="7" rx="1" />
      <rect x="13" y="13" width="7" height="7" rx="1" />
    </Glyph>
  )
}

export function RepeatIcon({ size = 18 }: IconProps): JSX.Element {
  return (
    <Glyph size={size}>
      <rect x="3" y="3" width="8" height="8" rx="1" />
      <rect x="13" y="3" width="8" height="8" rx="1" strokeDasharray="2 2" />
      <rect x="3" y="13" width="8" height="8" rx="1" strokeDasharray="2 2" />
      <rect x="13" y="13" width="8" height="8" rx="1" strokeDasharray="2 2" />
    </Glyph>
  )
}
