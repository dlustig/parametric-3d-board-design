// Shell SPEC §9.6: the Inspector while the Crossing tool is active and
// nothing is selected — the crossing count; Needs attention (unresolved
// records, each with Show and Remove); Swapped (the overridden crossings);
// Can't swap (a count, grouped by reason). Show enters the record's context
// (§6.4) at its first placement and selects the top-level object of the
// record's first band reference there — which validation guarantees is a
// child of that context (V1 §2.1).

import { TriangleAlert } from 'lucide-react'
import type { JSX } from 'react'
import { removeRecord } from '@/domain/commands'
import { stepObjectId } from '@/domain/keys'
import type { Id } from '@/domain/model'
import { formatLength } from '@/domain/units'
import type { UnresolvedMarker } from '@/geometry/scene'
import { occurrencePaths } from '@/geometry/scene'
import { useScene } from '@/editor/scene'
import { contextLevelsForPath } from '@/editor/selection'
import { useEditor } from '@/editor/store'
import { uniqueUnresolved } from './CrossingList.tsx'

export function CrossingsPanel(): JSX.Element {
  const scene = useScene()
  const shown = useEditor((s) => s.preview?.next ?? s.project)
  const unit = shown.displayUnits
  const name = (id: Id): string => shown.materials.find((m) => m.id === id)!.name // V1 §2.1 invariant 2
  const where = (pt: { x: number; y: number }): string => `${formatLength(pt.x, unit)}, ${formatLength(pt.y, unit)}`

  const attention = uniqueUnresolved(scene, () => true)
  const swapped = scene.intersections.filter((i) => i.source === 'override')
  const unsupported = scene.intersections.filter((i) => i.cls !== 'eligible')
  const reasons = new Map<string, number>()
  for (const i of unsupported) reasons.set(i.reason, (reasons.get(i.reason) ?? 0) + 1)
  const total = scene.intersections.length

  const show = (u: UnresolvedMarker): void => {
    const s = useEditor.getState()
    s.setEditContext(u.contextId === null ? [] : contextLevelsForPath(s.project, occurrencePaths(s.project, u.contextId)[0]!))
    const first = u.record.a.path[0]
    s.select([first === undefined ? u.record.a.bandId : stepObjectId(first)])
  }

  return (
    <section className="panel crossings-panel" aria-label="Crossings">
      <h2>Crossings</h2>
      <p className="panel-note">{total === 1 ? '1 crossing' : `${total} crossings`}</p>
      {attention.length > 0 && (
        <div className="needs-attention">
          <h3>
            <TriangleAlert size={14} strokeWidth={1.6} aria-hidden="true" /> Needs attention
          </h3>
          <ul className="overrides">
            {attention.map((u) => (
              <li key={u.record.id}>
                Unresolved at {where(u.worldHint)}
                <button type="button" onClick={() => show(u)}>
                  Show
                </button>
                <button type="button" onClick={() => useEditor.getState().run((p) => removeRecord(p, u.contextId, u.record.id))}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <h3>Swapped</h3>
      {swapped.length === 0 ? (
        <p className="panel-note">None</p>
      ) : (
        <ul className="overrides swapped">
          {swapped.map((i) => {
            const over = i.a.occ.key === i.overKey ? i.a : i.b
            const under = over === i.a ? i.b : i.a
            return (
              <li key={`${i.a.occ.key}@${i.a.segmentStart}|${i.b.occ.key}@${i.b.segmentStart}`}>
                {name(over.occ.materialId)} over {name(under.occ.materialId)} at {where(i.point)}
              </li>
            )
          })}
        </ul>
      )}
      <h3>Can't swap</h3>
      <div className="cant-swap">
        <p className="panel-note">{unsupported.length}</p>
        {reasons.size > 0 && (
          <ul className="overrides">
            {[...reasons].map(([reason, count]) => (
              <li key={reason}>
                {reason}: {count}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
