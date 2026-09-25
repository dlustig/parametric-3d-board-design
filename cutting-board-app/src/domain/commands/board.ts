// Board-level and project-level commands for the Board inspector panel
// (SPEC §7.5). Field policies (positive board dimensions) are enforced by
// the inspector's NumberField before the command ever runs, so these stay
// plain, always-succeeding transforms.

import type { Id, Project } from '@/domain/model'

export function setProjectName(p: Project, name: string): Project {
  return { ...p, name }
}

export function setBoardSize(p: Project, widthMm: number, heightMm: number): Project {
  return { ...p, board: { ...p.board, widthMm, heightMm } }
}

export function setBoardBackground(p: Project, backgroundMaterialId: Id | null): Project {
  return { ...p, board: { ...p.board, backgroundMaterialId } }
}

export function setDisplayUnits(p: Project, displayUnits: 'in' | 'mm'): Project {
  return { ...p, displayUnits }
}
