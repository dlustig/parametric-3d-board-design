// Paint-order commands, applied within each context that owns a listed id.

import type { ContextId, Id, Project } from '../model.ts'
import { withChildren } from './shared.ts'

function reordered(children: Id[], selected: Set<Id>, how: 'forward' | 'backward' | 'front' | 'back'): Id[] {
  const isSelected = (id: Id): boolean => selected.has(id)
  if (how === 'front') return [...children.filter((id) => !isSelected(id)), ...children.filter(isSelected)]
  if (how === 'back') return [...children.filter(isSelected), ...children.filter((id) => !isSelected(id))]

  const out = [...children]
  const swapIfMoving = (k: number, other: number): void => {
    if (isSelected(out[k]!) && !isSelected(out[other]!)) [out[k], out[other]] = [out[other]!, out[k]!]
  }
  if (how === 'forward') for (let k = out.length - 2; k >= 0; k--) swapIfMoving(k, k + 1)
  else for (let k = 1; k < out.length; k++) swapIfMoving(k, k - 1)
  return out
}

export function reorder(p: Project, ids: Id[], how: 'forward' | 'backward' | 'front' | 'back'): Project {
  const selected = new Set(ids)
  const contexts: Array<[ContextId, Id[]]> = [[null, p.rootChildren], ...Object.values(p.motifs).map((m): [ContextId, Id[]] => [m.id, m.children])]
  let next = p
  for (const [ctx, children] of contexts) {
    if (children.some((id) => selected.has(id))) next = withChildren(next, ctx, reordered(children, selected, how))
  }
  return next
}
