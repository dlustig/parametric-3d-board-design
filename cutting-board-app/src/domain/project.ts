import type { ContextId, Id, Material, Project } from './model.ts'
import { newId } from './ids.ts'

// SPEC §3 starter palette, in order.
const STARTER_PALETTE: ReadonlyArray<Omit<Material, 'id'>> = [
  { name: 'Maple', color: '#E8D4A8' },
  { name: 'Walnut', color: '#5C3A21' },
  { name: 'Cherry', color: '#A8543A' },
  { name: 'Purpleheart', color: '#6B2E6B' },
  { name: 'Padauk', color: '#C8402A' },
  { name: 'Ash', color: '#DED2B4' },
  { name: 'Oak', color: '#C19A6B' },
  { name: 'Wenge', color: '#3B2A20' },
]

/** A fresh, empty Project: SPEC §3 starter palette, no objects. */
export function newProject(displayUnits: 'in' | 'mm'): Project {
  const board =
    displayUnits === 'in'
      ? { widthMm: 304.8, heightMm: 457.2, backgroundMaterialId: null }
      : { widthMm: 300, heightMm: 450, backgroundMaterialId: null }

  return {
    schemaVersion: 1,
    id: newId(),
    name: 'Untitled',
    displayUnits,
    board,
    materials: STARTER_PALETTE.map((material) => ({ id: newId(), ...material })),
    objects: {},
    rootChildren: [],
    motifs: {},
    crossings: [],
  }
}

/** The ordered child ids of a context: the Project root, or one Motif definition. */
export function childrenOf(p: Project, ctx: ContextId): Id[] {
  if (ctx === null) return p.rootChildren
  const motif = p.motifs[ctx]
  if (motif === undefined) throw new Error(`No motif definition with id "${ctx}"`)
  return motif.children
}

/** The context that owns `objectId`: `null` for the root, a motif id otherwise. Throws if unowned. */
export function contextOf(p: Project, objectId: Id): ContextId {
  if (p.rootChildren.includes(objectId)) return null
  for (const motifId of Object.keys(p.motifs)) {
    const motif = p.motifs[motifId]
    if (motif !== undefined && motif.children.includes(objectId)) return motifId
  }
  throw new Error(`Object "${objectId}" is not owned by any context`)
}
