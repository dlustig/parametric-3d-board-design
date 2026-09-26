// SPEC §7.5 Region panel, shell spec §13: Material and bounds W/H (scaling
// the polygon about the bounds origin), then the Points table.

import type { JSX } from 'react'
import { setMaterial } from '@/domain/commands'
import type { Region } from '@/domain/model'
import { objectBounds } from '@/geometry/bounds'
import { EPS_GEOMETRY } from '@/geometry/tolerance'
import { useEditor } from '@/editor/store'
import type { PreviewOutcome } from './NumberField.tsx'
import { NumberField } from './NumberField.tsx'
import { PointsTable } from './PointRow.tsx'
import { Section } from './Section.tsx'
import { previewSetPoints } from './shared.ts'

interface Props {
  region: Region
}

export function RegionPanel({ region }: Props): JSX.Element {
  const project = useEditor((s) => s.project)
  const unit = project.displayUnits

  const bounds = objectBounds(project, region.id)! // a Region has ≥ 3 points
  const width = bounds.maxX - bounds.minX
  const height = bounds.maxY - bounds.minY

  const previewScale = (axis: 'x' | 'y', newSize: number): PreviewOutcome => {
    const size = axis === 'x' ? width : height
    if (size < EPS_GEOMETRY) return undefined // collinear points: no extent to scale
    const factor = newSize / size
    const points = region.points.map((p) => ({
      x: axis === 'x' ? bounds.minX + (p.x - bounds.minX) * factor : p.x,
      y: axis === 'y' ? bounds.minY + (p.y - bounds.minY) * factor : p.y,
    }))
    return previewSetPoints(project, region.id, points)
  }

  return (
    <section className="panel" aria-label="Region">
      <Section title="Region">
        <div className="field">
          <label htmlFor="region-material" className="field-label">
            Material
          </label>
          <select id="region-material" value={region.materialId} onChange={(e) => useEditor.getState().run((p) => setMaterial(p, [region.id], e.target.value))}>
            {project.materials.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field-grid">
          <NumberField label="Width" prefix="W" value={width} unit={unit} policy="positive" onPreview={(v) => previewScale('x', v)} onCommit={() => useEditor.getState().commit()} />
          <NumberField label="Height" prefix="H" value={height} unit={unit} policy="positive" onPreview={(v) => previewScale('y', v)} onCommit={() => useEditor.getState().commit()} />
        </div>
      </Section>
      <Section title="Points" collapsible>
        <PointsTable project={project} objectId={region.id} points={region.points} wraps unit={unit} />
      </Section>
    </section>
  )
}
