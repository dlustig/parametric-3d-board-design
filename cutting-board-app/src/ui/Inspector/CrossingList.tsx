// SPEC §7.5: the Band panel's crossings list — every listed world
// intersection of the selected Band's occurrences in the current context,
// with an Over/Under toggle button for eligible ones (the keyboard path for
// crossings, SPEC §11) — and the unresolved-records list with Remove shared
// by the Band, Instance, and Repeat panels (SPEC §5.5).

import type { JSX } from 'react'
import { removeRecord } from '@/domain/commands'
import { hasKeyPrefix, stepKey } from '@/domain/keys'
import type { Id } from '@/domain/model'
import { formatLength } from '@/domain/units'
import type { UnresolvedMarker } from '@/geometry/scene'
import { useScene } from '@/editor/scene'
import { useEditor } from '@/editor/store'
import { toggleAt } from '@/editor/tools/crossing'
import { contextPrefix } from '@/editor/selection'

export function CrossingList({ bandId }: { bandId: Id }): JSX.Element {
  const scene = useScene()
  const project = useEditor((s) => s.project)
  const editContext = useEditor((s) => s.editContext)
  const prefixKeys = contextPrefix(editContext).map(stepKey)
  const unit = project.displayUnits
  const materialName = (id: Id): string => project.materials.find((m) => m.id === id)?.name ?? id

  const rows = scene.intersections.flatMap((i) => {
    const mine = [i.a, i.b].find((side) => side.occ.sourceId === bandId && side.occ.path.length === prefixKeys.length && hasKeyPrefix(side.occ.path.map(stepKey), prefixKeys))
    if (mine === undefined) return []
    const partner = mine === i.a ? i.b : i.a
    return [{ i, over: i.overKey === mine.occ.key, partner }]
  })

  return (
    <>
      <h3>Crossings</h3>
      {rows.length === 0 && <p className="panel-note">None</p>}
      <ul className="overrides">
        {rows.map(({ i, over, partner }, k) => {
          const where = `${formatLength(i.point.x, unit)}, ${formatLength(i.point.y, unit)}`
          const label = `with ${materialName(partner.occ.materialId)} at ${where}`
          return (
            <li key={k}>
              <span>
                {label}
                {i.cls !== 'eligible' && ` (${i.cls})`}
                {i.source === 'override' && ' (override)'}
              </span>
              {i.cls === 'eligible' && (
                <button type="button" aria-label={`${over ? 'Over' : 'Under'}: toggle crossing ${label}`} onClick={() => toggleAt(i)}>
                  {over ? 'Over' : 'Under'}
                </button>
              )}
            </li>
          )
        })}
      </ul>
      <UnresolvedList matches={(u) => u.record.a.bandId === bandId || u.record.b.bandId === bandId} />
    </>
  )
}

/** SPEC §5.5: unresolved records matching `matches`, once per record, each with Remove. */
export function UnresolvedList({ matches }: { matches: (u: UnresolvedMarker) => boolean }): JSX.Element | null {
  const scene = useScene()
  const unit = useEditor((s) => s.project.displayUnits)
  const byId = new Map<Id, UnresolvedMarker>()
  for (const u of scene.unresolved) if (!byId.has(u.record.id) && matches(u)) byId.set(u.record.id, u)
  if (byId.size === 0) return null
  return (
    <>
      <h3>Unresolved crossings</h3>
      <ul className="overrides">
        {[...byId.values()].map((u) => (
          <li key={u.record.id}>
            Unresolved at {formatLength(u.worldHint.x, unit)}, {formatLength(u.worldHint.y, unit)}
            <button type="button" onClick={() => useEditor.getState().run((p) => removeRecord(p, u.contextId, u.record.id))}>
              Remove
            </button>
          </li>
        ))}
      </ul>
    </>
  )
}
