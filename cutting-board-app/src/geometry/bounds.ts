// SPEC §4.5: painted vs. conservative bounds.

import type { Id, Project } from '../domain/model.ts'
import { stepObjectId } from '../domain/keys.ts'
import { contextOf } from '../domain/project.ts'
import type { Occurrence } from './expand.ts'
import { expandContext, segmentsOf } from './expand.ts'
import { MITER_EXTENT_FACTOR } from './tolerance.ts'

export type Box = {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

function boxOfPoints(points: ReadonlyArray<{ x: number; y: number }>): Box {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const point of points) {
    minX = Math.min(minX, point.x)
    minY = Math.min(minY, point.y)
    maxX = Math.max(maxX, point.x)
    maxY = Math.max(maxY, point.y)
  }

  return { minX, minY, maxX, maxY }
}

/** The bounding box of one segment's stroke rectangle: endpoints offset ±w/2 along the segment normal. */
function segmentStrokeBox(a: { x: number; y: number }, b: { x: number; y: number }, width: number): Box {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const length = Math.hypot(dx, dy)
  const half = width / 2
  const nx = (-dy / length) * half
  const ny = (dx / length) * half

  return boxOfPoints([
    { x: a.x + nx, y: a.y + ny },
    { x: a.x - nx, y: a.y - ny },
    { x: b.x + nx, y: b.y + ny },
    { x: b.x - nx, y: b.y - ny },
  ])
}

/** SPEC §4.5: union of a Band's segment stroke rectangles; a Region's polygon bounds. */
export function paintedBounds(o: Occurrence): Box {
  if (o.kind === 'region') return boxOfPoints(o.worldPoints)

  // A Band always has >= 2 points (validated), so segmentsOf(o) is never empty.
  return unionBoxes(segmentsOf(o).map((segment) => segmentStrokeBox(segment.a, segment.b, o.worldWidth)))!
}

/** SPEC §4.5: a Band's polyline bounds expanded by MITER_EXTENT_FACTOR (5) × width, which contains every miter tip; a Region's painted bounds. */
export function conservativeBounds(o: Occurrence): Box {
  const box = boxOfPoints(o.worldPoints)
  if (o.kind === 'region') return box

  const pad = MITER_EXTENT_FACTOR * o.worldWidth
  return { minX: box.minX - pad, minY: box.minY - pad, maxX: box.maxX + pad, maxY: box.maxY + pad }
}

export function unionBoxes(boxes: Box[]): Box | null {
  if (boxes.length === 0) return null

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const box of boxes) {
    minX = Math.min(minX, box.minX)
    minY = Math.min(minY, box.minY)
    maxX = Math.max(maxX, box.maxX)
    maxY = Math.max(maxY, box.maxY)
  }

  return { minX, minY, maxX, maxY }
}

/** SPEC §4.5: the painted bounds of `objectId`'s occurrences, in its own context's space. */
export function objectBounds(p: Project, objectId: Id): Box | null {
  const ctx = contextOf(p, objectId)
  const obj = p.objects[objectId]!
  const occurrences = expandContext(p, ctx)
  const boxes: Box[] = []

  for (const occurrence of occurrences) {
    if (obj.type === 'band' || obj.type === 'region') {
      if (occurrence.sourceId === objectId) boxes.push(paintedBounds(occurrence))
      continue
    }

    const firstStep = occurrence.path[0]
    if (firstStep === undefined) continue

    if (stepObjectId(firstStep) === objectId) boxes.push(paintedBounds(occurrence))
  }

  return unionBoxes(boxes)
}
