// SPEC §7.5 Region panel: material, bounds width/height (scales the polygon
// about the bounds origin), per-point X/Y with insert-after and delete.

import type { JSX } from 'react'
import { deletePoint, insertPoint, setMaterial, setPoints } from '@/domain/commands'
import type { Region } from '@/domain/model'
import { objectBounds } from '@/geometry/bounds'
import { useEditor } from '@/editor/store'
import { NumberField } from './NumberField.tsx'
import { insertAfterXY, previewSetPoint } from './shared.ts'

interface Props {
  region: Region
}

const MIN_SIZE_MM = 1e-6

export function RegionPanel({ region }: Props): JSX.Element {
  const project = useEditor((s) => s.project)
  const unit = project.displayUnits
  const commit = (): void => useEditor.getState().commit()

  const bounds = objectBounds(project, region.id)
  const width = bounds === null ? 0 : bounds.maxX - bounds.minX
  const height = bounds === null ? 0 : bounds.maxY - bounds.minY

  const previewScale = (axis: 'x' | 'y', newSize: number): void => {
    if (bounds === null) return
    const size = axis === 'x' ? width : height
    if (size < MIN_SIZE_MM) return
    const factor = newSize / size
    const points = region.points.map((p) => ({
      x: axis === 'x' ? bounds.minX + (p.x - bounds.minX) * factor : p.x,
      y: axis === 'y' ? bounds.minY + (p.y - bounds.minY) * factor : p.y,
    }))
    useEditor.getState().setPreview(setPoints(project, region.id, points), 'commit')
  }

  return (
    <section className="panel" aria-label="Region">
      <h2>Region</h2>
      <div className="field">
        <label htmlFor="region-material">Material</label>
        <select
          id="region-material"
          value={region.materialId}
          onChange={(e) => useEditor.getState().run((p) => setMaterial(p, [region.id], e.target.value))}
        >
          {project.materials.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>
      <NumberField label="Width" value={width} unit={unit} policy="positive" onPreview={(v) => previewScale('x', v)} onCommit={commit} />
      <NumberField label="Height" value={height} unit={unit} policy="positive" onPreview={(v) => previewScale('y', v)} onCommit={commit} />

      <h3>Points</h3>
      {region.points.map((pt, k) => (
        <div className="point-row" key={pt.id}>
          <NumberField
            label={`Point ${k + 1} X`}
            value={pt.x}
            unit={unit}
            policy="any"
            onPreview={(v) => previewSetPoint(project, region.id, pt.id, { x: v, y: pt.y })}
            onCommit={commit}
          />
          <NumberField
            label={`Point ${k + 1} Y`}
            value={pt.y}
            unit={unit}
            policy="any"
            onPreview={(v) => previewSetPoint(project, region.id, pt.id, { x: pt.x, y: v })}
            onCommit={commit}
          />
          <button
            type="button"
            onClick={() => useEditor.getState().run((p) => insertPoint(p, region.id, pt.id, insertAfterXY(region.points, true, k)))}
          >
            Insert after
          </button>
          <button type="button" onClick={() => useEditor.getState().run((p) => deletePoint(p, region.id, pt.id))}>
            Delete
          </button>
        </div>
      ))}
    </section>
  )
}
