// Shell SPEC §9.6 (V1 §7.4): Crossing tool markers, sized in screen px
// through zoom, over an 18% pasteboard wash so they read on any wood.
// Eligible: an 18 px accent disc with a 2 px white ring. Overridden: the same
// plus a 2 px attention outer ring. Unsupported: a hatched disc (muted on
// white). Unresolved: a hollow 2.5 px attention ring at the record's hint.
// The hovered marker (fine pointer, Canvas) grows to 26 px; an eligible one
// shows the swap glyph. Hit radii are the tool's, unchanged.

import { ArrowLeftRight } from 'lucide-react'
import type { JSX } from 'react'
import type { Scene } from '@/geometry/scene'

interface Props {
  scene: Scene
  zoom: number
  view: { x: number; y: number; w: number; h: number } // visible viewBox, world mm
  hovered: number | null // index into [...intersections, ...unresolved]
}

export function CrossingMarkers({ scene, zoom, view, hovered }: Props): JSX.Element {
  const px = 1 / zoom
  const radius = (k: number): number => (k === hovered ? 13 : 9) * px
  const listed = scene.intersections.length
  return (
    <g className="crossing-markers" pointerEvents="none">
      <defs>
        <pattern id="cbpd-hatch" patternUnits="userSpaceOnUse" width={3 * px} height={3 * px} patternTransform="rotate(45)">
          <rect width={3 * px} height={3 * px} fill="#ffffff" />
          <rect width={1.2 * px} height={3 * px} style={{ fill: 'var(--muted)' }} />
        </pattern>
      </defs>
      <rect className="crossing-wash" x={view.x} y={view.y} width={view.w} height={view.h} />
      {scene.intersections.map((i, k) => {
        const r = radius(k)
        const eligible = i.cls === 'eligible'
        return (
          <g key={k} data-crossing-class={i.cls} data-source={i.source}>
            {i.source === 'override' && <circle cx={i.point.x} cy={i.point.y} r={r + 2 * px} fill="none" style={{ stroke: 'var(--attn)' }} strokeWidth={2 * px} />}
            {eligible ? (
              <circle cx={i.point.x} cy={i.point.y} r={r} style={{ fill: 'var(--acc)' }} stroke="#ffffff" strokeWidth={2 * px} />
            ) : (
              <circle cx={i.point.x} cy={i.point.y} r={r} fill="url(#cbpd-hatch)" style={{ stroke: 'var(--muted)' }} strokeWidth={px} />
            )}
            {eligible && k === hovered && <ArrowLeftRight x={i.point.x - 7 * px} y={i.point.y - 7 * px} size={14 * px} strokeWidth={1.6} color="#ffffff" />}
          </g>
        )
      })}
      {scene.unresolved.map((u, k) => (
        <circle
          key={`${u.record.id}@${u.occurrenceKey}`}
          data-crossing-class="unresolved"
          cx={u.worldHint.x}
          cy={u.worldHint.y}
          r={radius(listed + k)}
          fill="none"
          style={{ stroke: 'var(--attn)' }}
          strokeWidth={2.5 * px}
        />
      ))}
    </g>
  )
}
