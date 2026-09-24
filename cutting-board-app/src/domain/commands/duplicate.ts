// SPEC §7.4 Duplicate (`Ctrl/Cmd+D`, in place): fresh ids for the copies
// (objects and points); definition-internal records are untouched — arrays
// are what Repeat is for. Always succeeds (no refusal path), so this returns
// the new project and the fresh ids directly rather than a `CommandResult`.

import type { ContextId, Id, Project } from '@/domain/model'
import { childrenOf } from '@/domain/project'
import { cloneObjectFreshIds, withChildren } from './shared.ts'

export function duplicateObjects(p: Project, ctx: ContextId, ids: Id[]): { project: Project; newIds: Id[] } {
  let objects = p.objects
  const newIds: Id[] = []
  for (const id of ids) {
    const copy = cloneObjectFreshIds(p.objects[id]!)
    objects = { ...objects, [copy.id]: copy }
    newIds.push(copy.id)
  }
  const withObjects: Project = { ...p, objects }
  const project = withChildren(withObjects, ctx, [...childrenOf(withObjects, ctx), ...newIds])
  return { project, newIds }
}
