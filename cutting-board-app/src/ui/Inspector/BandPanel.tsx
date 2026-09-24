// SPEC §7.5 Band panel: material, width, closed, per-point X/Y with
// per-segment length/angle (editing a segment moves its end point and
// translates the points after it), insert-after and delete.

import type { JSX } from 'react'
import { deletePoint, insertPoint, setBandClosed, setBandWidth, setMaterial, setPoints } from '@/domain/commands'
import type { Band } from '@/domain/model'
import { useEditor } from '@/editor/store'
import { NumberField } from './NumberField.tsx'
import { insertAfterXY, previewSetPoint } from './shared.ts'

type XY = { x: number; y: number }

interface Props {
  band: Band
}

function segmentCount(band: Band): number {
  return band.closed ? band.points.length : band.points.length - 1
}

function endpointIndex(i: number, n: number): number {
  return (i + 1) % n
}

/** Points strictly between the segment's end and its (fixed) start, walking forward with wraparound when closed. */
function pointsAfter(n: number, closed: boolean, start: number, end: number): number[] {
  if (!closed) return Array.from({ length: n - end - 1 }, (_, k) => end + 1 + k)
  const out: number[] = []
  for (let k = (end + 1) % n; k !== start; k = (k + 1) % n) out.push(k)
  return out
}

function length(a: XY, b: XY): number {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

function angleDeg(a: XY, b: XY): number {
  return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI
}

/** Moves segment `i`'s end point to `newEnd`, rigidly translating the points after it (SPEC §7.5). */
function movedPoints(band: Band, i: number, newEnd: XY): XY[] {
  const n = band.points.length
  const end = endpointIndex(i, n)
  const old = band.points[end]!
  const dx = newEnd.x - old.x
  const dy = newEnd.y - old.y
  const after = new Set(pointsAfter(n, band.closed, i, end))
  return band.points.map((p, k) => {
    if (k === end) return newEnd
    if (after.has(k)) return { x: p.x + dx, y: p.y + dy }
    return { x: p.x, y: p.y }
  })
}

export function BandPanel({ band }: Props): JSX.Element {
  const project = useEditor((s) => s.project)
  const unit = project.displayUnits
  const commit = (): void => useEditor.getState().commit()
  const previewPoints = (points: XY[]): void => {
    useEditor.getState().setPreview(setPoints(project, band.id, points), 'commit')
  }

  const n = band.points.length

  return (
    <section className="panel" aria-label="Band">
      <h2>Band</h2>
      <div className="field">
        <label htmlFor="band-material">Material</label>
        <select
          id="band-material"
          value={band.materialId}
          onChange={(e) => useEditor.getState().run((p) => setMaterial(p, [band.id], e.target.value))}
        >
          {project.materials.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>
      <NumberField
        label="Width"
        value={band.widthMm}
        unit={unit}
        policy="positive"
        onPreview={(v) => useEditor.getState().setPreview(setBandWidth(project, band.id, v), 'commit')}
        onCommit={commit}
      />
      <div className="field field-checkbox">
        <label htmlFor="band-closed">Closed</label>
        <input
          id="band-closed"
          type="checkbox"
          checked={band.closed}
          onChange={(e) => useEditor.getState().run((p) => setBandClosed(p, band.id, e.target.checked))}
        />
      </div>

      <h3>Points</h3>
      {band.points.map((pt, k) => (
        <div className="point-row" key={pt.id}>
          <NumberField
            label={`Point ${k + 1} X`}
            value={pt.x}
            unit={unit}
            policy="any"
            onPreview={(v) => previewSetPoint(project, band.id, pt.id, { x: v, y: pt.y })}
            onCommit={commit}
          />
          <NumberField
            label={`Point ${k + 1} Y`}
            value={pt.y}
            unit={unit}
            policy="any"
            onPreview={(v) => previewSetPoint(project, band.id, pt.id, { x: pt.x, y: v })}
            onCommit={commit}
          />
          <button
            type="button"
            onClick={() => useEditor.getState().run((p) => insertPoint(p, band.id, pt.id, insertAfterXY(band.points, band.closed, k)))}
          >
            Insert after
          </button>
          <button type="button" onClick={() => useEditor.getState().run((p) => deletePoint(p, band.id, pt.id))}>
            Delete
          </button>
        </div>
      ))}

      <h3>Segments</h3>
      {Array.from({ length: segmentCount(band) }, (_, i) => i).map((i) => {
        const start = band.points[i]!
        const end = band.points[endpointIndex(i, n)]!
        const segLength = length(start, end)
        const segAngle = angleDeg(start, end)
        const endpointAt = (l: number, a: number): XY => {
          const rad = (a * Math.PI) / 180
          return { x: start.x + l * Math.cos(rad), y: start.y + l * Math.sin(rad) }
        }
        return (
          <div className="segment-row" key={`segment-${i}`}>
            <span className="segment-label">Segment {i + 1}</span>
            <NumberField
              label={`Segment ${i + 1} length`}
              value={segLength}
              unit={unit}
              policy="positive"
              onPreview={(v) => previewPoints(movedPoints(band, i, endpointAt(v, segAngle)))}
              onCommit={commit}
            />
            <NumberField
              label={`Segment ${i + 1} angle`}
              value={segAngle}
              unit="deg"
              policy="any"
              onPreview={(deg) => previewPoints(movedPoints(band, i, endpointAt(segLength, deg)))}
              onCommit={commit}
            />
          </div>
        )
      })}
    </section>
  )
}
