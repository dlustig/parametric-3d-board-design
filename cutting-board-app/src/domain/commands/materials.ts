// Material palette commands (SPEC §3).

import { newId } from '@/domain/ids'
import type { Id, Material, Project } from '@/domain/model'
import type { CommandResult } from './index.ts'
import { fail, mapObjects, ok } from './shared.ts'

/** Assigns `materialId` to the listed Bands and Regions; instances and repeats are left alone. */
export function setMaterial(p: Project, ids: Id[], materialId: Id): Project {
  return mapObjects(p, ids, (obj) => (obj.type === 'band' || obj.type === 'region' ? { ...obj, materialId } : obj))
}

export function addMaterial(p: Project, material: Omit<Material, 'id'>): Project {
  return { ...p, materials: [...p.materials, { id: newId(), name: material.name, color: material.color }] }
}

export function updateMaterial(p: Project, id: Id, patch: Partial<Omit<Material, 'id'>>): Project {
  return { ...p, materials: p.materials.map((m) => (m.id === id ? { ...m, ...patch } : m)) }
}

function usageCount(p: Project, id: Id): number {
  const shapes = Object.values(p.objects).filter((o) => (o.type === 'band' || o.type === 'region') && o.materialId === id)
  return shapes.length + (p.board.backgroundMaterialId === id ? 1 : 0)
}

/** Deletes a material; refused while anything (including the Board background) uses it. */
export function deleteMaterial(p: Project, id: Id): CommandResult {
  const used = usageCount(p, id)
  if (used > 0) return fail(`This material is used ${used} time${used === 1 ? '' : 's'}`)
  return ok({ ...p, materials: p.materials.filter((m) => m.id !== id) })
}

/** Replaces every reference to `fromId` (objects and the Board background) with `toId`. */
export function replaceMaterial(p: Project, fromId: Id, toId: Id): Project {
  const usingFrom = Object.values(p.objects)
    .filter((o) => (o.type === 'band' || o.type === 'region') && o.materialId === fromId)
    .map((o) => o.id)
  const replaced = setMaterial(p, usingFrom, toId)
  const background = p.board.backgroundMaterialId === fromId ? toId : p.board.backgroundMaterialId
  return { ...replaced, board: { ...p.board, backgroundMaterialId: background } }
}
