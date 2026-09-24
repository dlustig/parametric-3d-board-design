// SPEC §7.3–§7.4 (Select): which objects are selectable in the current edit
// context, their world painted bounds (proxy rects), click hit-testing from
// domain geometry, and the translate/rotate gestures that write previews.
// Gestures always recompute from the committed `project` with the cumulative
// pointer arguments (never frame-on-frame) and map world deltas into the
// entered context through `invert(contextMatrix)`.

import { rotateObjects, translateObjects } from '@/domain/commands'
import { stepKey, stepObjectId } from '@/domain/keys'
import type { Id, MotifInstance, Project, RepeatField, Step } from '@/domain/model'
import { childrenOf } from '@/domain/project'
import { apply, invert, isMirrored } from '@/geometry/affine'
import type { Box } from '@/geometry/bounds'
import { paintedBounds, unionBoxes } from '@/geometry/bounds'
import type { Occurrence } from '@/geometry/expand'
import { expand, segmentsOf } from '@/geometry/expand'
import { screenToWorld } from '../camera.ts'
import type { EditContextLevel } from '../selection.ts'
import { contextMatrix, useEditor } from '../store.ts'

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
  move(client: XY): void
}

/** SPEC §7.4 drag: Δ from the pointer's client positions through the CTM, mapped into the context. */
export function startTranslate(svg: SVGSVGElement, startClient: XY): Gesture {
  const s = useEditor.getState()
  const { project, selection } = s
  const toContext = invert(contextMatrix(s))
  const start = apply(toContext, screenToWorld(svg, startClient))
  return {
    move(client) {
      const now = apply(toContext, screenToWorld(svg, client))
      useEditor.getState().setPreview(translateObjects(project, selection, now.x - start.x, now.y - start.y), 'cancel')
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
