// SPEC §7.4 Crossing tool markers, sized in screen px through zoom: filled
// for eligible crossings, filled with a badge ring for overrides, hatched for
// unsupported classes, and a ring at each unresolved record's world hint.

import type { JSX } from 'react'
import type { Scene } from '@/geometry/scene'

interface Props {
  scene: Scene
  zoom: number
}

const INK = '#1a1a1a'
const ACCENT = '#d9480f'

export function CrossingMarkers({ scene, zoom }: Props): JSX.Element {
  const r = 6 / zoom
  const line = 1.5 / zoom
  return (
    <g className="crossing-markers" pointerEvents="none">
      <defs>
        <pattern id="cbpd-hatch" patternUnits="userSpaceOnUse" width={3 / zoom} height={3 / zoom} patternTransform="rotate(45)">
          <rect width={3 / zoom} height={3 / zoom} fill="#ffffff" />
          <rect width={1.2 / zoom} height={3 / zoom} fill={INK} />
        </pattern>
      </defs>
      {scene.intersections.map((i, k) => {
        const eligible = i.cls === 'eligible'
        return (
          <g key={k} data-crossing-class={i.cls} data-source={i.source}>
            <circle cx={i.point.x} cy={i.point.y} r={r} fill={eligible ? INK : 'url(#cbpd-hatch)'} stroke="#ffffff" strokeWidth={line} strokeDasharray={eligible ? undefined : `${2 / zoom} ${1.5 / zoom}`} />
            {i.source === 'override' && <circle cx={i.point.x} cy={i.point.y} r={r + 2.5 / zoom} fill="none" stroke={ACCENT} strokeWidth={2 / zoom} />}
          </g>
        )
      })}
      {scene.unresolved.map((u) => (
        <circle
          key={`${u.record.id}@${u.occurrenceKey}`}
          data-crossing-class="unresolved"
          cx={u.worldHint.x}
          cy={u.worldHint.y}
          r={r}
          fill="none"
          stroke={ACCENT}
          strokeWidth={2 / zoom}
        />
      ))}
    </g>
  )
}
