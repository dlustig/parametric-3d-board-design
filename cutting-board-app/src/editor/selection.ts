// SPEC §7.1: after undo, redo, or import, drop selection ids that no longer
// exist and pop edit-context levels whose occurrence no longer resolves.
// Pure helpers over a Project; no store dependency.

import type { Id, Project, Step } from '@/domain/model'

export interface EditContextLevel {
  motifId: Id
  path: Step[]
}

/** Whether every step of `path` resolves: the instance/repeat exists, and a repeat step's row/column is within its grid. */
export function pathIsValid(p: Project, path: Step[]): boolean {
  for (const step of path) {
    if ('instanceId' in step) {
      if (p.objects[step.instanceId]?.type !== 'motif-instance') return false
    } else {
      const field = p.objects[step.repeatId]
      if (field === undefined || field.type !== 'repeat') return false
      if (step.row < 0 || step.row >= field.rows || step.column < 0 || step.column >= field.columns) return false
    }
  }
  return true
}

/** Whether an edit-context level still resolves: its motif exists and its path validates. */
function levelIsValid(p: Project, level: EditContextLevel): boolean {
  return Object.hasOwn(p.motifs, level.motifId) && pathIsValid(p, level.path)
}

/** Pops trailing levels off `editContext` until the deepest remaining one validates against `p` (or it's empty). */
export function pruneEditContext(p: Project, editContext: EditContextLevel[]): EditContextLevel[] {
  let end = editContext.length
  while (end > 0 && !levelIsValid(p, editContext[end - 1]!)) end--
  return end === editContext.length ? editContext : editContext.slice(0, end)
}

/** Drops selection ids that no longer exist in `p.objects`. */
export function pruneSelection(p: Project, selection: Id[]): Id[] {
  const next = selection.filter((id) => Object.hasOwn(p.objects, id))
  return next.length === selection.length ? selection : next
}
