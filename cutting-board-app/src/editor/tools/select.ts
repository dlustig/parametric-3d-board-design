// SPEC §7.3–§7.4 (Select): which objects are selectable in the current edit
// context, their world painted bounds (proxy rects), click hit-testing from
// domain geometry, and the translate/rotate gestures that write previews.
// Gestures always recompute from the committed `project` with the cumulative
// pointer arguments (never frame-on-frame) and map world deltas into the
// entered context through `invert(contextMatrix)`.

import { deletePoint, insertPoint, rotateObjects, setPoint, translateObjects } from '@/domain/commands'
import { stepKey, stepObjectId } from '@/domain/keys'
import type { Band, Id, MotifInstance, Project, Region, RepeatField, Step } from '@/domain/model'
import { childrenOf } from '@/domain/project'
import { apply, invert, isMirrored } from '@/geometry/affine'
import type { Box } from '@/geometry/bounds'
import { paintedBounds, unionBoxes } from '@/geometry/bounds'
import type { Occurrence } from '@/geometry/expand'
import { expand, segmentsOf } from '@/geometry/expand'
import type { Mat } from '@/geometry/affine'
import type { SnapSources } from '@/geometry/snap'
import { boundsTargets, dist, snapDelta, snapPoint } from '@/geometry/snap'
import { screenToWorld } from '../camera.ts'
import type { EditContextLevel } from '../selection.ts'
import { contextMatrix, useEditor } from '../store.ts'
import { gestureSnapTargets, toleranceMm } from './draw.ts'

type XY = { x: number; y: number }

/** The world path of the entered occurrence: each level's path is relative to the previous level. */
export function contextPrefix(editContext: EditContextLevel[]): Step[] {
  return editContext.flatMap((level) => level.path)
}

/** The top-level object of the current context that `o` belongs to, or `null` if `o` is outside the context. */
function ownerIn(o: Occurrence, prefix: Step[], prefixKeys: string[]): Id | null {
  if (o.path.length < prefix.length) return null
  for (let k = 0; k < prefix.length; k++) if (stepKey(o.path[k]!) !== prefixKeys[k]) return null
  const next = o.path[prefix.length]
  if (next === undefined) return o.sourceId
  return stepObjectId(next)
}

function occurrencesByOwner(p: Project, editContext: EditContextLevel[]): Array<{ id: Id; o: Occurrence }> {
  const prefix = contextPrefix(editContext)
  const keys = prefix.map(stepKey)
  const out: Array<{ id: Id; o: Occurrence }> = []
  for (const o of expand(p)) {
    const id = ownerIn(o, prefix, keys)
    if (id !== null) out.push({ id, o })
  }
  return out
}

/** World painted bounds of every top-level object in the current context (SPEC §7.3 proxies), in paint order. */
export function selectableBounds(p: Project, editContext: EditContextLevel[]): Array<{ id: Id; box: Box }> {
  const boxes = new Map<Id, Box[]>()
  for (const { id, o } of occurrencesByOwner(p, editContext)) {
    const list = boxes.get(id)
    if (list === undefined) boxes.set(id, [paintedBounds(o)])
    else list.push(paintedBounds(o))
  }
  const out: Array<{ id: Id; box: Box }> = []
  const ctx = editContext[editContext.length - 1]?.motifId ?? null
  for (const id of childrenOf(p, ctx)) {
    const box = unionBoxes(boxes.get(id) ?? [])
    if (box !== null) out.push({ id, box })
  }
  return out
}

function distanceToSegment(q: XY, a: XY, b: XY): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const t = Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(q.x - (a.x + t * dx), q.y - (a.y + t * dy))
}

/** Nonzero winding (SPEC §4.3 `fill-rule="nonzero"`). */
function polygonContains(points: XY[], q: XY): boolean {
  let winding = 0
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!
    const b = points[(i + 1) % points.length]!
    const cross = (b.x - a.x) * (q.y - a.y) - (q.x - a.x) * (b.y - a.y)
    if (a.y <= q.y) {
      if (b.y > q.y && cross > 0) winding++
    } else if (b.y <= q.y && cross < 0) {
      winding--
    }
  }
  return winding !== 0
}

function hits(o: Occurrence, q: XY): boolean {
  if (o.kind === 'region') return polygonContains(o.worldPoints, q)
  return segmentsOf(o).some((seg) => distanceToSegment(q, seg.a, seg.b) <= o.worldWidth / 2)
}

/** The topmost occurrence under the world point that belongs to the context `editContext` enters, with its top-level owner there. */
function occurrenceAt(p: Project, editContext: EditContextLevel[], world: XY): { id: Id; o: Occurrence } | null {
  const owned = occurrencesByOwner(p, editContext)
  for (let k = owned.length - 1; k >= 0; k--) {
    if (hits(owned[k]!.o, world)) return owned[k]!
  }
  return null
}

/** SPEC §7.3: the topmost occurrence under the world point, mapped to its top-level object in the current context. */
export function objectAt(p: Project, editContext: EditContextLevel[], world: XY): Id | null {
  return occurrenceAt(p, editContext, world)?.id ?? null
}

/** The edit-context level entering the instance or repeat cell under the world point, relative to `editContext`'s innermost level (SPEC §7.6). */
function levelAt(p: Project, editContext: EditContextLevel[], world: XY): EditContextLevel | null {
  const hit = occurrenceAt(p, editContext, world)
  const step = hit?.o.path[contextPrefix(editContext).length]
  if (step === undefined) return null // nothing, or a plain Band/Region
  const placed = p.objects[stepObjectId(step)] as MotifInstance | RepeatField
  return { motifId: placed.motifId, path: [step] }
}

/** SPEC §7.6 double-tap: enters the instance or repeat cell under the client point, if any. */
export function enterAt(svg: SVGSVGElement, client: XY): boolean {
  const s = useEditor.getState()
  const level = levelAt(s.project, s.editContext, screenToWorld(svg, client))
  if (level === null) return false
  s.enterContext(level)
  s.select([])
  return true
}

/**
 * SPEC §7.6 re-targeting: a tap outside the entered occurrence, on another
 * occurrence of the same definition placed in the parent context, moves the
 * innermost level's path onto it.
 */
export function retargetAt(svg: SVGSVGElement, client: XY): boolean {
  const s = useEditor.getState()
  const current = s.editContext[s.editContext.length - 1]
  if (current === undefined) return false
  const parent = s.editContext.slice(0, -1)
  const world = screenToWorld(svg, client)
  if (objectAt(s.project, s.editContext, world) !== null) return false
  const level = levelAt(s.project, parent, world)
  if (level === null || level.motifId !== current.motifId) return false
  useEditor.setState({ editContext: [...parent, level], selection: [] })
  return true
}

/**
 * SPEC §7.4 tap: the topmost object replaces the selection (nothing clears it);
 * with `toggle` (Shift or Add-to-selection) the object is added or removed and
 * a tap on nothing keeps the selection.
 */
export function toggleSelection(selection: Id[], id: Id | null, toggle: boolean): Id[] {
  if (!toggle) return id === null ? [] : [id]
  if (id === null) return selection
  return selection.includes(id) ? selection.filter((x) => x !== id) : [...selection, id]
}

/** Click/tap select at a client point, from domain geometry. */
export function clickSelect(svg: SVGSVGElement, client: XY, toggle: boolean): void {
  const s = useEditor.getState()
  s.select(toggleSelection(s.selection, objectAt(s.project, s.editContext, screenToWorld(svg, client)), toggle))
}

export interface Gesture {
  /** `noSnap`: Alt held (SPEC §7.7). */
  move(client: XY, noSnap: boolean): void
}

/** SPEC §7.7 sources of the selection, in the context's space: every occurrence vertex/endpoint, and each object's painted-bounds edges and centre. */
function moveSources(p: Project, editContext: EditContextLevel[], selection: Id[], toContext: Mat): SnapSources {
  const chosen = new Set(selection)
  const points: XY[] = []
  const lines: SnapSources['lines'] = []
  for (const { id, o } of occurrencesByOwner(p, editContext)) if (chosen.has(id)) for (const v of o.worldPoints) points.push(apply(toContext, v))
  for (const { id, box } of selectableBounds(p, editContext)) {
    if (!chosen.has(id)) continue
    const t = boundsTargets(box, toContext)
    lines.push(...t.lines)
    points.push(t.centre)
  }
  return { points, lines }
}

/**
 * SPEC §7.4 drag: Δ from the pointer's client positions through the CTM,
 * mapped into the context, then snapped (SPEC §7.7): targets and sources are
 * frozen at gesture start and the nearest source–target pair adjusts Δ.
 */
export function startTranslate(svg: SVGSVGElement, startClient: XY): Gesture {
  const s = useEditor.getState()
  const { project, selection, editContext } = s
  const toContext = invert(contextMatrix(s))
  const start = apply(toContext, screenToWorld(svg, startClient))
  const snap = s.snapEnabled ? { sources: moveSources(project, editContext, selection, toContext), targets: gestureSnapTargets(s, selection), tol: toleranceMm(s) } : null
  return {
    move(client, noSnap) {
      const now = apply(toContext, screenToWorld(svg, client))
      const raw = { x: now.x - start.x, y: now.y - start.y }
      const snapped = snap === null || noSnap ? null : snapDelta(snap.sources, snap.targets, raw, snap.tol)
      const d = snapped?.delta ?? raw
      useEditor.getState().setPreview(translateObjects(project, selection, d.x, d.y), 'cancel')
      useEditor.setState({ snapGuide: snapped?.guide == null ? null : snapped })
    },
  }
}

/** A vertex or segment-midpoint handle of the single selected Band/Region (SPEC §7.4); `at` is in the context's space. */
export type Handle = { kind: 'vertex'; objectId: Id; pointId: Id; at: XY } | { kind: 'midpoint'; objectId: Id; afterPointId: Id; at: XY }

/** Handles for exactly one selected Band or Region of the current context: its vertices, then its segment midpoints (the closing one too). */
export function handlesFor(p: Project, editContext: EditContextLevel[], selection: Id[]): Handle[] {
  const id = selection.length === 1 ? selection[0]! : null
  const shape = id === null ? undefined : p.objects[id]
  if (id === null || (shape?.type !== 'band' && shape?.type !== 'region')) return []
  if (!childrenOf(p, editContext[editContext.length - 1]?.motifId ?? null).includes(id)) return []
  const pts = shape.points
  const segments = shape.type === 'region' || shape.closed ? pts.length : pts.length - 1
  return [
    ...pts.map((q): Handle => ({ kind: 'vertex', objectId: id, pointId: q.id, at: { x: q.x, y: q.y } })),
    ...pts.slice(0, segments).map((a, k): Handle => {
      const b = pts[(k + 1) % pts.length]!
      return { kind: 'midpoint', objectId: id, afterPointId: a.id, at: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } }
    }),
  ]
}

/**
 * SPEC §7.4 vertex drag (a midpoint handle first inserts its point into the
 * preview, then drags it): the pointer maps into the context and snaps to
 * targets frozen now, excluding the object (SPEC §7.7); within snap tolerance
 * of a neighbour the point is deleted instead. Every frame recomputes from the
 * press-time project, so the whole drag commits as one history entry.
 */
export function startHandleDrag(svg: SVGSVGElement, handle: Handle): Gesture {
  const s = useEditor.getState()
  const id = handle.objectId
  let base = s.project
  let moving: Id
  if (handle.kind === 'vertex') {
    moving = handle.pointId
  } else {
    const r = insertPoint(base, id, handle.afterPointId, handle.at)
    if (!r.ok) return { move: () => {} }
    base = r.project
    const pts = (base.objects[id] as Band | Region).points
    moving = pts[pts.findIndex((q) => q.id === handle.afterPointId) + 1]!.id
    s.setPreview(base, 'cancel')
  }
  const shape = base.objects[id] as Band | Region
  const k = shape.points.findIndex((q) => q.id === moving)
  const n = shape.points.length
  const closes = shape.type === 'region' || shape.closed
  const neighbours = [...(closes || k > 0 ? [shape.points[(k - 1 + n) % n]!] : []), ...(closes || k < n - 1 ? [shape.points[(k + 1) % n]!] : [])]
  const toContext = invert(contextMatrix(s))
  const targets = s.snapEnabled ? gestureSnapTargets(s, [id]) : null
  const tol = toleranceMm(s)
  return {
    move(client, noSnap) {
      const raw = apply(toContext, screenToWorld(svg, client))
      const merge = neighbours.find((q) => dist(q, raw) <= tol)
      const deleted = merge === undefined ? null : deletePoint(base, id, moving)
      if (merge !== undefined && deleted?.ok === true) {
        useEditor.getState().setPreview(deleted.project, 'cancel')
        useEditor.setState({ snapGuide: { point: { x: merge.x, y: merge.y }, guide: 'point', line: null } })
        return
      }
      const snap = targets === null || noSnap ? null : snapPoint(raw, targets, tol)
      const r = setPoint(base, id, moving, snap?.point ?? raw)
      if (r.ok) useEditor.getState().setPreview(r.project, 'cancel')
      useEditor.setState({ snapGuide: snap?.guide == null ? null : snap })
    },
  }
}

/** SPEC §7.3 rotate: angle from pointer positions about a centre fixed at gesture start. */
export function startRotate(svg: SVGSVGElement, startClient: XY, centreWorld: XY): Gesture {
  const s = useEditor.getState()
  const { project, selection } = s
  const m = contextMatrix(s)
  const sign = isMirrored(m) ? -1 : 1
  const centre = apply(invert(m), centreWorld)
  const angleOf = (client: XY): number => {
    const w = screenToWorld(svg, client)
    return Math.atan2(w.y - centreWorld.y, w.x - centreWorld.x)
  }
  const a0 = angleOf(startClient)
  return {
    move(client) {
      const deg = ((angleOf(client) - a0) * 180) / Math.PI
      useEditor.getState().setPreview(rotateObjects(project, selection, sign * deg, centre), 'cancel')
    },
  }
}

/** SPEC §7.2: commit only when the gesture moved and did not end in `touchcancel`. */
export function endGesture(isDrag: boolean, inputEvent: Event | null | undefined): void {
  const s = useEditor.getState()
  if (isDrag && inputEvent?.type !== 'touchcancel') s.commit()
  else s.cancelPreview()
}
