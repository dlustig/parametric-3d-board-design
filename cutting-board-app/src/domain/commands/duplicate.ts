// SPEC §7.4 Duplicate (`Ctrl/Cmd+D`, in place): fresh ids for the copies
// (objects and points); definition-internal records are untouched — arrays
// are what Repeat is for. Refused over the occurrence cap, same as any other
// command that adds occurrences.

import type { ContextId, Id, Project } from '@/domain/model'
import { childrenOf } from '@/domain/project'
import type { IdsResult } from './shared.ts'
import { cloneObjectFreshIds, okIds, withChildren, withinCap } from './shared.ts'

export function duplicateObjects(p: Project, ctx: ContextId, ids: Id[]): IdsResult {
  // Cloned in the originals' own paint order, not `ids`' (arbitrary selection/click) order.
  const idSet = new Set(ids)
  const ordered = childrenOf(p, ctx).filter((id) => idSet.has(id))

  let objects = p.objects
  const newIds: Id[] = []
  for (const id of ordered) {
    const copy = cloneObjectFreshIds(p.objects[id]!)
    objects = { ...objects, [copy.id]: copy }
    newIds.push(copy.id)
  }
  const withObjects: Project = { ...p, objects }
  const project = withChildren(withObjects, ctx, [...childrenOf(withObjects, ctx), ...newIds])

  const capped = withinCap(project)
  return capped.ok ? okIds(capped.project, newIds) : capped
}
