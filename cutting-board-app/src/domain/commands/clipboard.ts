// SPEC §7.4 copy/paste (`Ctrl/Cmd+C/V`, in place): an in-app clipboard — a
// plain value, not the system clipboard; the keyboard dispatcher is the sole
// caller and holds the current one as a module variable (SPEC: "the
// clipboard is a module variable"). `objects` holds both the copied
// top-level selection and, so a definition can be restored even after every
// instance/repeat of it is deleted from the project, every design object a
// referenced `MotifDefinition` lists as a child, transitively through nested
// motifs. `motifs` holds every `MotifDefinition` reached the same way.

import type { ContextId, DesignObject, Id, MotifDefinition, MotifInstance, Project, RepeatField } from '@/domain/model'
import { childrenOf } from '@/domain/project'
import type { CommandResult } from './index.ts'
import { cloneObjectFreshIds, fail, ok, withChildren } from './shared.ts'

export type Clipboard = { objects: DesignObject[]; motifs: MotifDefinition[] }

function isPlaced(obj: DesignObject): obj is MotifInstance | RepeatField {
  return obj.type === 'motif-instance' || obj.type === 'repeat'
}

/** Copies `ids` plus every `MotifDefinition` they (transitively) reference, and that definition's own children objects. */
export function copyObjects(p: Project, ids: Id[]): Clipboard {
  const objects = ids.map((id) => p.objects[id]!)
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

/**
 * Pastes `clip` into `ctx`, in place. The top-level objects (everything in
 * `clip.objects` that no `clip.motifs` entry lists as a child) get fresh ids,
 * same as Duplicate. Any referenced `MotifDefinition` missing from the
 * project is restored from `clip.motifs` under its original id, along with
 * its children from `clip.objects` — refused if a referenced definition is
 * in neither the project nor the clipboard, or the clipboard's copy of it is
 * incomplete (a listed child missing from `clip.objects`).
 */
export function pasteObjects(p: Project, ctx: ContextId, clip: Clipboard): Project | CommandResult {
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

  const referencedMotifIds = (list: DesignObject[]): Id[] => list.filter(isPlaced).map((o) => o.motifId)
  const allPasted = [...topLevel, ...clip.motifs.flatMap((m) => m.children.map((id) => byId.get(id)).filter((o): o is DesignObject => o !== undefined))]
  for (const motifId of referencedMotifIds(allPasted)) {
    if (!Object.hasOwn(motifs, motifId)) return fail('Cannot paste: a referenced motif no longer exists')
  }

  const cloned = topLevel.map(cloneObjectFreshIds)
  for (const obj of cloned) objects = { ...objects, [obj.id]: obj }

  const withObjectsAndMotifs: Project = { ...p, objects, motifs }
  const children = [...childrenOf(withObjectsAndMotifs, ctx), ...cloned.map((o) => o.id)]
  return ok(withChildren(withObjectsAndMotifs, ctx, children))
}
