// SPEC §7.4 Duplicate (`Ctrl/Cmd+D`): copies with fresh ids (objects and
// points), offset by `offset` (the editor passes one grid step in +X and +Y,
// so the action is visible); definition-internal records are untouched —
// arrays are what Repeat is for. Adding copies cannot unbind a record, so no
// rematch. Refused over the occurrence cap, same as any other command that
// adds occurrences.

import type { ContextId, DesignObject, Id, Project } from '@/domain/model'
import { childrenOf } from '@/domain/project'
import type { IdsResult } from './shared.ts'
import { cloneObjectFreshIds, okIds, withChildren, withinCap } from './shared.ts'

type XY = { x: number; y: number }

function shifted(obj: DesignObject, d: XY): DesignObject {
  if (obj.type === 'band' || obj.type === 'region') return { ...obj, points: obj.points.map((q) => ({ ...q, x: q.x + d.x, y: q.y + d.y })) }
  return { ...obj, transform: { ...obj.transform, x: obj.transform.x + d.x, y: obj.transform.y + d.y } }
}

export function duplicateObjects(p: Project, ctx: ContextId, ids: Id[], offset: XY): IdsResult {
  // Cloned in the originals' own paint order, not `ids`' (arbitrary selection/click) order.
  const idSet = new Set(ids)
  const ordered = childrenOf(p, ctx).filter((id) => idSet.has(id))

  let objects = p.objects
  const newIds: Id[] = []
  for (const id of ordered) {
    const copy = shifted(cloneObjectFreshIds(p.objects[id]!), offset)
    objects = { ...objects, [copy.id]: copy }
    newIds.push(copy.id)
  }
  const withObjects: Project = { ...p, objects }
  const project = withChildren(withObjects, ctx, [...childrenOf(withObjects, ctx), ...newIds])

  const capped = withinCap(project)
  return capped.ok ? okIds(capped.project, newIds) : capped
}
