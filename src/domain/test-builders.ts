// Deterministic builders for small hand-made projects, shared by the crossing
// and command tests. Ids are readable strings so assertions can name them.

import type { Band, BandRef, Crossing, DesignObject, Id, MotifInstance, Project, Region, RepeatField, Step, Transform } from './model.ts'

export const MAT = 'maple'
export const MAT2 = 'walnut'

/** A Band whose point ids are `${id}0`, `${id}1`, … */
export function band(id: Id, coords: Array<[number, number]>, extra: Partial<Pick<Band, 'widthMm' | 'closed' | 'materialId'>> = {}): Band {
  return {
    type: 'band',
    id,
    materialId: MAT,
    widthMm: 6,
    closed: false,
    points: coords.map(([x, y], k) => ({ id: `${id}${k}`, x, y })),
    ...extra,
  }
}

export function region(id: Id, coords: Array<[number, number]>): Region {
  return { type: 'region', id, materialId: MAT, points: coords.map(([x, y], k) => ({ id: `${id}${k}`, x, y })) }
}

export function transform(overrides: Partial<Transform> = {}): Transform {
  return { x: 0, y: 0, rotationDeg: 0, mirrorX: false, mirrorY: false, scale: 1, ...overrides }
}

export function instance(id: Id, motifId: Id, t: Partial<Transform> = {}): MotifInstance {
  return { type: 'motif-instance', id, motifId, transform: transform(t) }
}

export function repeat(id: Id, motifId: Id, overrides: Partial<Omit<RepeatField, 'type' | 'id' | 'motifId'>> = {}): RepeatField {
  return {
    type: 'repeat',
    id,
    motifId,
    transform: transform(),
    rows: 3,
    columns: 3,
    stepXMm: 50,
    stepYMm: 50,
    rowOffsetMm: 0,
    columnOffsetMm: 0,
    alternateMirrorX: false,
    alternateMirrorY: false,
    alternateRotationDeg: 0,
    ...overrides,
  }
}

export function ref(bandId: Id, segmentStart: Id, path: Step[] = []): BandRef {
  return { path, bandId, segmentStart }
}

export function record(id: Id, a: BandRef, b: BandRef, over: 'a' | 'b', hint: { x: number; y: number }): Crossing {
  return { id, a, b, over, hint }
}

export interface MotifSpec {
  id: Id
  children: DesignObject[]
  crossings?: Crossing[]
}

/** A project with `root` as root children (paint order) and the given motif definitions. */
export function project(root: DesignObject[], motifs: MotifSpec[] = [], crossings: Crossing[] = []): Project {
  const all = [...root, ...motifs.flatMap((m) => m.children)]
  return {
    schemaVersion: 1,
    id: 'project',
    name: 'Test',
    displayUnits: 'mm',
    board: { widthMm: 300, heightMm: 450, backgroundMaterialId: null },
    materials: [
      { id: MAT, name: 'Maple', color: '#E8D4A8' },
      { id: MAT2, name: 'Walnut', color: '#5C3A21' },
    ],
    objects: Object.fromEntries(all.map((o) => [o.id, o])),
    rootChildren: root.map((o) => o.id),
    motifs: Object.fromEntries(
      motifs.map((m) => [m.id, { id: m.id, name: m.id, children: m.children.map((c) => c.id), crossings: m.crossings ?? [] }]),
    ),
    crossings,
  }
}
