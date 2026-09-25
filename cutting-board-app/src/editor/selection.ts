// SPEC §7.1: after undo, redo, or import, drop selection ids that no longer
// exist and pop edit-context levels whose occurrence no longer resolves.
// Pure helpers over a Project; no store dependency.

import type { ContextId, Id, Project, Step } from '@/domain/model'
import { stepObjectId } from '@/domain/keys'
import { childrenOf } from '@/domain/project'

export interface EditContextLevel {
  motifId: Id
  path: Step[]
}

/**
 * Walks `path` from context `from`, one step at a time: each step's object
 * must exist as a CHILD of the context reached so far (`from` for the first
 * step, the previous step's `motifId` for the rest), and a repeat step's
 * row/column must be within its current grid. Returns the context the whole
 * path reaches, or `undefined` if any step fails to resolve.
 */
function walkPath(p: Project, from: ContextId, path: Step[]): ContextId | undefined {
  let ctx = from
  for (const step of path) {
    const id = stepObjectId(step)
    if (!childrenOf(p, ctx).includes(id)) return undefined
    const obj = p.objects[id]
    if (obj === undefined) return undefined
    if ('instanceId' in step) {
      if (obj.type !== 'motif-instance') return undefined
    } else if (obj.type !== 'repeat' || step.row < 0 || step.row >= obj.rows || step.column < 0 || step.column >= obj.columns) {
      return undefined
    }
    ctx = obj.motifId
  }
  return ctx
}

/**
 * Validates one edit-context level against the context reached by the levels
 * before it (`from`): its path must walk validly from `from`, and must land
 * on exactly the motif the level claims to enter. Returns that motif id, or
 * `undefined` if the level no longer resolves.
 */
function enterLevel(p: Project, from: ContextId, level: EditContextLevel): Id | undefined {
  const reached = walkPath(p, from, level.path)
  return reached === level.motifId && Object.hasOwn(p.motifs, level.motifId) ? level.motifId : undefined
}

/**
 * Walks `editContext` from the root forward, threading the context reached
 * so far into each next level, and keeps the longest prefix of consecutively
 * valid levels — truncating at the first level that no longer resolves (a
 * level nested under an invalid one is unreachable and dropped with it, even
 * if its own path would otherwise still resolve against the live project).
 */
export function pruneEditContext(p: Project, editContext: EditContextLevel[]): EditContextLevel[] {
  let ctx: ContextId = null
  let end = 0
  for (const level of editContext) {
    const next = enterLevel(p, ctx, level)
    if (next === undefined) break
    ctx = next
    end++
  }
  return end === editContext.length ? editContext : editContext.slice(0, end)
}

/** Drops selection ids that no longer exist in `p.objects`. */
export function pruneSelection(p: Project, selection: Id[]): Id[] {
  const next = selection.filter((id) => Object.hasOwn(p.objects, id))
  return next.length === selection.length ? selection : next
}

/** `currentMaterialId` if it still names a material in `p`; else the first remaining one (or, with none left, left as-is — nothing valid to fall back to). */
export function pruneCurrentMaterial(p: Project, currentMaterialId: Id): Id {
  if (p.materials.some((m) => m.id === currentMaterialId)) return currentMaterialId
  return p.materials[0]?.id ?? currentMaterialId
}
