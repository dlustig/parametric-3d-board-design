// SPEC §7.5 Band panel, shell spec §13: Band (material, width, Closed as a
// switch); Offset copy (width, Left, Right); Points and Segments tables
// (editing a segment moves its end point and translates the points after
// it); the crossings list with unresolved records (CrossingList.tsx).

import type { JSX } from 'react'
import { useState } from 'react'
import { offsetCopyBand, setBandClosed, setBandWidth, setMaterial } from '@/domain/commands'
import type { Band } from '@/domain/model'
import { useEditor } from '@/editor/store'
import { Hint } from '../Hint.tsx'
import { CrossingList } from './CrossingList.tsx'
import { NumberField } from './NumberField.tsx'
import { PointsTable } from './PointRow.tsx'
import { Section } from './Section.tsx'
import { previewSetPoints } from './shared.ts'
import { Switch } from './Switch.tsx'

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

  // SPEC §7.4 Offset copy (Band only): a width field defaulting to this
  // band's own width. Inspector.tsx keys this panel on the selected object's
  // id, so React remounts it (re-running this initializer) on every band
  // change instead of a `band.widthMm` edit clobbering a width already typed
  // here.
  const [offsetWidth, setOffsetWidth] = useState(band.widthMm)

  const n = band.points.length

  return (
    <section className="panel" aria-label="Band">
      <Section title="Band">
        <div className="field">
          <label htmlFor="band-material" className="field-label">
            Material
          </label>
          <select id="band-material" value={band.materialId} onChange={(e) => useEditor.getState().run((p) => setMaterial(p, [band.id], e.target.value))}>
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
          onPreview={(v) => {
            useEditor.getState().setPreview(setBandWidth(project, band.id, v), 'commit')
            return undefined
          }}
          onCommit={(v) => {
            commit()
            useEditor.setState({ lastBandWidthMm: v })
          }}
        />
        <Switch label="Closed" checked={band.closed} onChange={(closed) => useEditor.getState().run((p) => setBandClosed(p, band.id, closed))} />
      </Section>

      <Section title="Offset copy">
        <div className="field-with-button">
          <NumberField label="Offset copy width" prefix="W" value={offsetWidth} unit={unit} policy="positive" onPreview={() => undefined} onCommit={setOffsetWidth} />
          <Hint label="Offset copy left">
            <button type="button" className="inspector-button" aria-label="Offset copy left" onClick={() => useEditor.getState().run((p) => offsetCopyBand(p, band.id, 'left', offsetWidth))}>
              Left
            </button>
          </Hint>
          <Hint label="Offset copy right">
            <button type="button" className="inspector-button" aria-label="Offset copy right" onClick={() => useEditor.getState().run((p) => offsetCopyBand(p, band.id, 'right', offsetWidth))}>
              Right
            </button>
          </Hint>
        </div>
      </Section>

      <Section title="Points" collapsible>
        <PointsTable project={project} objectId={band.id} points={band.points} wraps={band.closed} unit={unit} />
      </Section>

      <Section title="Segments" collapsible>
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col" className="col-index">
                #
              </th>
              <th scope="col">Length</th>
              <th scope="col">Angle</th>
            </tr>
          </thead>
          <tbody>
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
                <tr key={`segment-${i}`}>
                  <td className="col-index">{i + 1}</td>
                  <td>
                    <NumberField
                      label={`Segment ${i + 1} length`}
                      prefix={null}
                      value={segLength}
                      unit={unit}
                      policy="positive"
                      onPreview={(v) => previewSetPoints(project, band.id, movedPoints(band, i, endpointAt(v, segAngle)))}
                      onCommit={commit}
                    />
                  </td>
                  <td>
                    <NumberField
                      label={`Segment ${i + 1} angle`}
                      prefix={null}
                      value={segAngle}
                      unit="deg"
                      policy="any"
                      onPreview={(deg) => previewSetPoints(project, band.id, movedPoints(band, i, endpointAt(segLength, deg)))}
                      onCommit={commit}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Section>

      <CrossingList bandId={band.id} />
    </section>
  )
}
