// SPEC §7.4 Band / Polygon / Rectangle tools over raw Pointer Events (SPEC
// §7.2: Moveable and Selecto are unmounted while these are active; two-finger
// pan/zoom stays with use-gesture). Plain functions over the store's
// `drawing` field; pointer coordinates map into the current context through
// `invert(contextMatrix)` (SPEC §7.6) and snap per SPEC §7.7.
//
// Band/Polygon: a press becomes a point on pointerup when it moved less than
// TAP_SLOP_PX and no second pointer arrived (a second pointer cancels the
// pending point, not the drawing). A second tap within DOUBLE_TAP_MS and
// 10 px of the first finishes and is itself discarded. Rectangle: press, drag,
// release → a 4-point Region.

import { addBand, addRegion } from '@/domain/commands'
import { apply, invert, scaleOf } from '@/geometry/affine'
import { expand } from '@/geometry/expand'
import { findIntersections } from '@/geometry/intersections'
import type { Id } from '@/domain/model'
import type { SegmentSnap, SnapTargets } from '@/geometry/snap'
import { collectSnapTargets, dist, segmentMeasure, snapPoint, snapSegmentEnd } from '@/geometry/snap'
import { DOUBLE_TAP_MS, MIN_SEGMENT_MM, SNAP_TOLERANCE_PX, TAP_SLOP_PX } from '@/geometry/tolerance'
import { screenToWorld } from '../camera.ts'
import type { EditorState, Tool } from '../store.ts'
import { contextMatrix, currentContext, useEditor } from '../store.ts'

type XY = { x: number; y: number }

export type DrawTool = 'band' | 'polygon' | 'rect'

const DOUBLE_TAP_PX = 10

export function isDrawTool(t: Tool): t is DrawTool {
  return t === 'band' || t === 'polygon' || t === 'rect'
}

/** Snap targets are computed once per project/context/grid, i.e. at gesture start in effect (SPEC §7.7). */
let targetCache: { key: [EditorState['project'], EditorState['editContext'], number]; targets: SnapTargets } | null = null

/** SPEC §7.7 targets from the committed `project` in the current context, excluding `exclude` (the moving objects); callers compute them once per gesture. */
export function gestureSnapTargets(s: EditorState, exclude: Id[]): SnapTargets {
  const occurrences = expand(s.project)
  return collectSnapTargets(s.project, currentContext(s), contextMatrix(s), exclude, occurrences, findIntersections(occurrences), s.gridMm)
}

function snapTargets(s: EditorState): SnapTargets {
  const c = targetCache
  if (c !== null && c.key[0] === s.project && c.key[1] === s.editContext && c.key[2] === s.gridMm) return c.targets
  const targets = gestureSnapTargets(s, [])
  targetCache = { key: [s.project, s.editContext, s.gridMm], targets }
  return targets
}

/** SNAP_TOLERANCE_PX in the current context's mm (SPEC §4.6, §7.6). */
export function toleranceMm(s: EditorState): number {
  return SNAP_TOLERANCE_PX / s.camera.zoom / scaleOf(contextMatrix(s))
}

function toContext(s: EditorState, svg: SVGSVGElement, e: PointerEvent): XY {
  return apply(invert(contextMatrix(s)), screenToWorld(svg, { x: e.clientX, y: e.clientY }))
}

/** The snapped cursor for a raw context-space point. Alt held or Snap off: no snapping (SPEC §7.7). */
function cursorFor(s: EditorState, tool: DrawTool, raw: XY, altKey: boolean): SegmentSnap {
  const placed = s.drawing?.points ?? []
  const from = placed[placed.length - 1]
  const measure = (point: XY): { angleDeg: number; lengthMm: number } => (from === undefined ? { angleDeg: 0, lengthMm: 0 } : segmentMeasure(from, point))
  if (!s.snapEnabled || altKey) return { point: raw, guide: null, line: null, ...measure(raw) }
  const base = snapTargets(s)
  // Only the first pending point is a target, and only once it can close the shape (≥ 3 points).
  const first = placed[0]
  const targets = first !== undefined && placed.length >= 3 ? { ...base, points: [...base.points, first] } : base
  const tol = toleranceMm(s)
  if (from === undefined || tool === 'rect') {
    const r = snapPoint(raw, targets, tol)
    return { ...r, ...measure(r.point) }
  }
  return snapSegmentEnd(from, raw, targets, tol, true)
}

function setDrawing(tool: DrawTool, points: XY[], cursor: SegmentSnap | null): void {
  useEditor.setState({ drawing: { tool, points, cursor } })
}

// --- Finishing -------------------------------------------------------------

/** Adds the Band/Region; the drawing ends only when the command succeeds (else `message` shows why). */
function commitShape(tool: DrawTool, points: XY[], closed: boolean): void {
  const s = useEditor.getState()
  const ctx = currentContext(s)
  let ok = false
  s.run((p) => {
    const r =
      tool === 'band'
        ? addBand(p, { ctx, materialId: s.currentMaterialId, widthMm: s.lastBandWidthMm, points, closed })
        : addRegion(p, { ctx, materialId: s.currentMaterialId, points })
    ok = r.ok
    return r
  })
  if (ok) useEditor.setState({ drawing: null })
}

/** Finish (button, Enter, double-tap): a Band needs ≥ 2 points, a polygon ≥ 3. */
export function finishDrawing(): void {
  const d = useEditor.getState().drawing
  if (d === null || d.tool === 'rect') return
  const min = d.tool === 'band' ? 2 : 3
  if (d.points.length < min) {
    useEditor.setState({ message: `A ${d.tool === 'band' ? 'band' : 'polygon'} needs at least ${min} points.` })
    return
  }
  commitShape(d.tool, d.points, false)
}

export function undoPoint(): void {
  const d = useEditor.getState().drawing
  if (d === null || d.points.length === 0) return
  setDrawing(d.tool, d.points.slice(0, -1), d.cursor)
}

export function cancelDrawing(): void {
  resetDrawInput()
  useEditor.setState({ drawing: null })
}

// --- Placing points --------------------------------------------------------

/**
 * A tapped point: merged (ignored) within tolerance of the previous point;
 * on the first point it closes the polygon or Band with ≥ 3 points, and is
 * ignored with fewer (it could only double back onto the first point).
 */
function placeTapped(tool: 'band' | 'polygon', cursor: SegmentSnap): void {
  const s = useEditor.getState()
  const points = s.drawing?.points ?? []
  const tol = toleranceMm(s)
  const last = points[points.length - 1]
  if (last !== undefined && dist(last, cursor.point) <= tol) return
  const first = points[0]
  if (first !== undefined && dist(first, cursor.point) <= tol) {
    if (points.length >= 3) commitShape(tool, points, true)
    return
  }
  setDrawing(tool, [...points, cursor.point], cursor)
}

/** Places the next point from typed Length/Angle (context mm and degrees) off the last point (SPEC §7.4 options bar). */
export function placeTyped(lengthMm: number, angleDeg: number): void {
  const d = useEditor.getState().drawing
  if (d === null || d.tool === 'rect' || lengthMm < MIN_SEGMENT_MM) return
  const last = d.points[d.points.length - 1]
  if (last === undefined) return
  const rad = (angleDeg * Math.PI) / 180
  const point = { x: last.x + lengthMm * Math.cos(rad), y: last.y + lengthMm * Math.sin(rad) }
  setDrawing(d.tool, [...d.points, point], null)
}

// --- Pointer events --------------------------------------------------------

// Pointer bookkeeping, valid only while the Canvas's draw listeners are
// bound: the Canvas calls `resetDrawInput` when it unbinds them (tool switch),
// so a pointer lifted while no listener was bound cannot stay "down".
const down = new Map<number, XY>() // active pointers, client px
let press: { id: number; start: XY; maxMove: number; spoiled: boolean } | null = null
let lastTap: { time: number; at: XY } | null = null

export function resetDrawInput(): void {
  down.clear()
  press = null
  lastTap = null
}

// The handlers below are bound by the Canvas only while `tool` is a draw tool.

export function drawPointerDown(svg: SVGSVGElement, e: PointerEvent, tool: DrawTool, panning: boolean): void {
  const client = { x: e.clientX, y: e.clientY }
  down.set(e.pointerId, client)
  const s = useEditor.getState()
  if (down.size > 1) {
    // A second pointer: use-gesture pans/zooms; the pending point (or rectangle) is dropped.
    if (press !== null) press.spoiled = true
    if (s.drawing?.tool === 'rect') useEditor.setState({ drawing: null })
    return
  }
  if (panning || e.button !== 0) return
  press = { id: e.pointerId, start: client, maxMove: 0, spoiled: false }
  if (tool === 'rect') {
    const cursor = cursorFor({ ...s, drawing: null }, 'rect', toContext(s, svg, e), e.altKey)
    setDrawing('rect', [cursor.point], cursor)
  }
}

export function drawPointerMove(svg: SVGSVGElement, e: PointerEvent, tool: DrawTool): void {
  const client = { x: e.clientX, y: e.clientY }
  if (down.has(e.pointerId)) down.set(e.pointerId, client)
  if (press !== null && press.id === e.pointerId) press.maxMove = Math.max(press.maxMove, dist(press.start, client))
  if (down.size > 1) return
  const s = useEditor.getState()
  const d = s.drawing
  if (tool === 'rect' && (d === null || press === null)) return // hover before a drag: nothing to show
  setDrawing(tool, d?.points ?? [], cursorFor(s, tool, toContext(s, svg, e), e.altKey))
}

export function drawPointerUp(svg: SVGSVGElement, e: PointerEvent, tool: DrawTool): void {
  down.delete(e.pointerId)
  const p = press
  if (p === null || p.id !== e.pointerId) return
  press = null
  if (p.spoiled) return
  const s = useEditor.getState()

  if (tool === 'rect') {
    const d = s.drawing
    const a = d?.points[0]
    useEditor.setState({ drawing: null })
    if (a === undefined || p.maxMove < TAP_SLOP_PX) return
    const b = cursorFor(s, 'rect', toContext(s, svg, e), e.altKey).point
    if (Math.abs(b.x - a.x) < MIN_SEGMENT_MM || Math.abs(b.y - a.y) < MIN_SEGMENT_MM) return
    commitShape('rect', [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }], true)
    return
  }

  if (p.maxMove >= TAP_SLOP_PX) return
  const now = performance.now()
  const client = { x: e.clientX, y: e.clientY }
  if (lastTap !== null && now - lastTap.time <= DOUBLE_TAP_MS && dist(lastTap.at, client) <= DOUBLE_TAP_PX) {
    lastTap = null // the second tap of a double-tap finishes and is discarded
    if ((s.drawing?.points.length ?? 0) > 0) finishDrawing()
    return
  }
  lastTap = { time: now, at: client }
  placeTapped(tool, cursorFor(s, tool, toContext(s, svg, e), e.altKey))
}

export function drawPointerCancel(e: PointerEvent): void {
  down.delete(e.pointerId)
  if (press?.id === e.pointerId) press = null
  if (useEditor.getState().drawing?.tool === 'rect') useEditor.setState({ drawing: null })
}
