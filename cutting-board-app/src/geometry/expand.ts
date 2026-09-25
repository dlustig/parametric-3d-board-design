// SPEC §4.4: expansion — flattens the semantic Project into the world-space
// occurrence list, in paint order.

import type { Band, ContextId, Id, MotifInstance, Point, Project, Region, RepeatField, Step } from '@/domain/model'
import { childrenOf } from '@/domain/project'
import { occurrenceKey } from '@/domain/keys'
import type { Mat } from './affine.ts'
import { apply, cell, fromTransform, IDENTITY, multiply, scaleOf } from './affine.ts'

export type BandOccurrence = {
  kind: 'band'
  key: string
  sourceId: Id
  path: Step[]
  matrix: Mat
  materialId: Id
  worldPoints: Point[]
  worldWidth: number
  closed: boolean
}

export type RegionOccurrence = {
  kind: 'region'
  key: string
  sourceId: Id
  path: Step[]
  matrix: Mat
  materialId: Id
  worldPoints: Point[]
}

export type Occurrence = BandOccurrence | RegionOccurrence

function worldPointsOf(points: Point[], matrix: Mat): Point[] {
  return points.map((point) => ({ id: point.id, ...apply(matrix, point) }))
}

/**
 * Occurrences already built, by source object and occurrence key. Project
 * objects are never mutated, so the same object at the same key under an
 * equal matrix yields an equal occurrence: returning the earlier one keeps
 * an unchanged occurrence the same object from one project version to the
 * next (a drag frame re-expands thousands of occurrences to move one), which
 * lets classification and rendering skip it by identity (packet §22: exploit
 * motif/repeat reuse).
 */
const built = new WeakMap<Band | Region, Map<string, Occurrence>>()

function sameMatrix(m: Mat, n: Mat): boolean {
  return m === n || m.every((v, k) => v === n[k])
}

function reuse<O extends Occurrence>(source: Band | Region, path: Step[], matrix: Mat, build: (key: string) => O): O {
  const key = occurrenceKey(path, source.id)
  let byKey = built.get(source)
  if (byKey === undefined) {
    byKey = new Map()
    built.set(source, byKey)
  }
  const hit = byKey.get(key)
  if (hit !== undefined && sameMatrix(hit.matrix, matrix)) return hit as O
  const o = build(key)
  byKey.set(key, o)
  return o
}

function bandOccurrence(band: Band, path: Step[], matrix: Mat): BandOccurrence {
  return reuse(band, path, matrix, (key) => ({
    kind: 'band',
    key,
    sourceId: band.id,
    path,
    matrix,
    materialId: band.materialId,
    worldPoints: worldPointsOf(band.points, matrix),
    worldWidth: band.widthMm * scaleOf(matrix),
    closed: band.closed,
  }))
}

function regionOccurrence(region: Region, path: Step[], matrix: Mat): RegionOccurrence {
  return reuse(region, path, matrix, (key) => ({
    kind: 'region',
    key,
    sourceId: region.id,
    path,
    matrix,
    materialId: region.materialId,
    worldPoints: worldPointsOf(region.points, matrix),
  }))
}

function expandChildren(p: Project, ctx: ContextId, path: Step[], matrix: Mat): Occurrence[] {
  const occurrences: Occurrence[] = []

  for (const childId of childrenOf(p, ctx)) {
    const child = p.objects[childId]!

    if (child.type === 'band') {
      occurrences.push(bandOccurrence(child, path, matrix))
    } else if (child.type === 'region') {
      occurrences.push(regionOccurrence(child, path, matrix))
    } else if (child.type === 'motif-instance') {
      const childMatrix = multiply(matrix, fromTransform(child.transform))
      const childPath = [...path, { instanceId: child.id }]
      occurrences.push(...expandChildren(p, child.motifId, childPath, childMatrix))
    } else {
      const baseMatrix = multiply(matrix, fromTransform(child.transform))
      for (let row = 0; row < child.rows; row++) {
        for (let column = 0; column < child.columns; column++) {
          const cellMatrix = multiply(baseMatrix, cell(child, row, column))
          const childPath = [...path, { repeatId: child.id, row, column }]
          occurrences.push(...expandChildren(p, child.motifId, childPath, cellMatrix))
        }
      }
    }
  }

  return occurrences
}

/** SPEC §4.4: the flat world occurrence list for the whole project, in paint order. */
export function expand(p: Project): Occurrence[] {
  return expandChildren(p, null, [], IDENTITY)
}

/** Like `expand`, but rooted at `ctx` with the identity matrix — `expandContext(p, null)` equals `expand(p)`. */
export function expandContext(p: Project, ctx: ContextId): Occurrence[] {
  return expandChildren(p, ctx, [], IDENTITY)
}

/**
 * Maps the last step's definition space into the space of the context `path`
 * starts in. Same per-step composition as `expandChildren`, which builds it
 * incrementally while walking.
 */
export function pathMatrix(p: Project, path: Step[]): Mat {
  let matrix = IDENTITY
  for (const step of path) {
    if ('instanceId' in step) {
      const instance = p.objects[step.instanceId] as MotifInstance
      matrix = multiply(matrix, fromTransform(instance.transform))
    } else {
      const field = p.objects[step.repeatId] as RepeatField
      matrix = multiply(matrix, multiply(fromTransform(field.transform), cell(field, step.row, step.column)))
    }
  }
  return matrix
}

/** A Band occurrence's segments; a closed band's closing segment is keyed by the last point's id (SPEC §4.2). */
export function segmentsOf(o: BandOccurrence): Array<{ startId: Id; a: Point; b: Point }> {
  const points = o.worldPoints
  const segments: Array<{ startId: Id; a: Point; b: Point }> = []

  for (let i = 0; i < points.length - 1; i++) {
    segments.push({ startId: points[i]!.id, a: points[i]!, b: points[i + 1]! })
  }
  if (o.closed) {
    const last = points[points.length - 1]!
    segments.push({ startId: last.id, a: last, b: points[0]! })
  }

  return segments
}
