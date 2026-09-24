// SPEC §7.4 copy/paste (`Ctrl/Cmd+C/V`, in place): an in-app clipboard — a
// plain value, not the system clipboard; the keyboard dispatcher is the sole
// caller and holds the current one as a module variable (SPEC: "the
// clipboard is a module variable"). `objects` holds both the copied
// top-level selection and, so a definition can be restored even after every
// instance/repeat of it is deleted from the project, every design object a
// referenced `MotifDefinition` lists as a child, transitively through nested
// motifs. `motifs` holds every `MotifDefinition` reached the same way.

import type { ContextId, DesignObject, Id, MotifDefinition, MotifInstance, Project, RepeatField } from '@/domain/model'
import { childrenOf, contextOf } from '@/domain/project'
import type { IdsResult } from './shared.ts'
import { cloneObjectFreshIds, fail, okIds, withChildren, withinCap } from './shared.ts'

export type Clipboard = { objects: DesignObject[]; motifs: MotifDefinition[] }

function isPlaced(obj: DesignObject): obj is MotifInstance | RepeatField {
  return obj.type === 'motif-instance' || obj.type === 'repeat'
}

/** Copies `ids` plus every `MotifDefinition` they (transitively) reference, and that definition's own children objects. */
export function copyObjects(p: Project, ids: Id[]): Clipboard {
  // Captured in the originals' own paint order, not `ids`' (arbitrary selection/click) order.
  const idSet = new Set(ids)
  const ctx = ids.length === 0 ? null : contextOf(p, ids[0]!)
  const objects = childrenOf(p, ctx).filter((id) => idSet.has(id)).map((id) => p.objects[id]!)

  const motifs: MotifDefinition[] = []
  const extraObjects: DesignObject[] = []
  const seenMotifs = new Set<Id>()
  const seenObjects = new Set<Id>(objects.map((o) => o.id))

  function captureMotif(motifId: Id): void {
    if (seenMotifs.has(motifId)) return
    seenMotifs.add(motifId)
    const motif = p.motifs[motifId]
    if (motif === undefined) return // dangling reference: nothing more to capture
    motifs.push(motif)
    for (const childId of motif.children) {
      const child = p.objects[childId]
      if (child === undefined) continue
      if (!seenObjects.has(childId)) {
        seenObjects.add(childId)
        extraObjects.push(child)
      }
      if (isPlaced(child)) captureMotif(child.motifId)
    }
  }

  for (const obj of objects) if (isPlaced(obj)) captureMotif(obj.motifId)

  return { objects: [...objects, ...extraObjects], motifs }
}

/** Whether motif `from`'s reference graph reaches `target`, directly or through nested motifs — pasting an instance/repeat of `from` into `target` would close this into a cycle. */
function motifReaches(motifs: Project['motifs'], objects: Project['objects'], from: Id, target: Id, seen: Set<Id> = new Set()): boolean {
  if (from === target) return true
  if (seen.has(from)) return false
  seen.add(from)
  const def = motifs[from]
  if (def === undefined) return false
  for (const childId of def.children) {
    const child = objects[childId]
    if (child !== undefined && isPlaced(child) && motifReaches(motifs, objects, child.motifId, target, seen)) return true
  }
  return false
}

/**
 * Pastes `clip` into `ctx`, in place, in the copied objects' own relative
 * paint order. The top-level objects (everything in `clip.objects` that no
 * `clip.motifs` entry lists as a child) get fresh ids, same as Duplicate; the
 * caller selects `newIds`, mirroring Duplicate. Any referenced
 * `MotifDefinition` missing from the project is restored from `clip.motifs`
 * under its original id, along with its children from `clip.objects`.
 * Refused (SPEC §2.1 invariants 2 and 4) if: a referenced definition is in
 * neither the project nor the clipboard; the clipboard's copy of one is
 * incomplete (a listed child missing from `clip.objects`); pasting into `ctx`
 * would close a cycle (SPEC §2.1 invariant 4) — a motif-instance/repeat being
 * pasted whose own definition reaches `ctx`, most directly a motif's own
 * instance pasted back into itself; or the occurrence cap is exceeded.
 */
export function pasteObjects(p: Project, ctx: ContextId, clip: Clipboard): IdsResult {
  const internalIds = new Set(clip.motifs.flatMap((m) => m.children))
  const byId = new Map(clip.objects.map((o) => [o.id, o]))
  const topLevel = clip.objects.filter((o) => !internalIds.has(o.id))

  let objects = p.objects
  let motifs = p.motifs
  for (const def of clip.motifs) {
    if (Object.hasOwn(motifs, def.id)) continue // already present: reuse the project's own (possibly since-edited) copy
    const children: DesignObject[] = []
    for (const childId of def.children) {
      const child = byId.get(childId)
      if (child === undefined) return fail(`Cannot paste: "${def.name}" is missing from the clipboard`)
      children.push(child)
    }
    motifs = { ...motifs, [def.id]: def }
    for (const child of children) objects = { ...objects, [child.id]: child }
  }

  const allPasted = [...topLevel, ...clip.motifs.flatMap((m) => m.children.map((id) => byId.get(id)).filter((o): o is DesignObject => o !== undefined))]
  for (const obj of allPasted) {
    if (isPlaced(obj) && !Object.hasOwn(motifs, obj.motifId)) return fail('Cannot paste: a referenced motif no longer exists')
  }

  if (ctx !== null) {
    for (const obj of topLevel) {
      if (isPlaced(obj) && motifReaches(motifs, objects, obj.motifId, ctx)) {
        return fail('Cannot paste: this motif contains the definition being pasted into')
      }
    }
  }

  const cloned = topLevel.map(cloneObjectFreshIds)
  for (const obj of cloned) objects = { ...objects, [obj.id]: obj }

  const withObjectsAndMotifs: Project = { ...p, objects, motifs }
  const children = [...childrenOf(withObjectsAndMotifs, ctx), ...cloned.map((o) => o.id)]
  const capped = withinCap(withChildren(withObjectsAndMotifs, ctx, children))
  return capped.ok ? okIds(capped.project, cloned.map((o) => o.id)) : capped
}
