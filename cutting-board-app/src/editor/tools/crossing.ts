// SPEC §7.4 Crossing tool: tap the nearest marker centre within the hit
// radius (12 px mouse/pen, 22 px touch). An eligible marker toggles per §5.4
// with the options bar's scope ("All instances" only where the pair has a
// common motif ancestor, else this occurrence); an unsupported one shows its
// class and reason in the options bar; an unresolved ring explains itself
// (an explicit toggle of the pair rebinds it, §5.5). Taps follow the drawing
// tools' rule: movement under TAP_SLOP_PX and no second pointer.

import { toggleCrossing } from '@/domain/commands/crossings'
import { commonPrefix } from '@/domain/crossings'
import type { SceneIntersection } from '@/geometry/scene'
import { TAP_SLOP_PX } from '@/geometry/tolerance'
import { worldToScreen } from '@/editor/camera'
import { editorScene } from '@/editor/scene'
import { useEditor } from '@/editor/store'

type XY = { x: number; y: number }

export const HIT_RADIUS_MOUSE_PX = 12
export const HIT_RADIUS_TOUCH_PX = 22

/** Index of the centre nearest `at` within `radius` (all in screen px), or null. */
export function pickNearest(centres: XY[], at: XY, radius: number): number | null {
  let best: number | null = null
  let bestDistance = radius
  for (const [k, c] of centres.entries()) {
    const d = Math.hypot(c.x - at.x, c.y - at.y)
    if (d <= bestDistance) {
      best = k
      bestDistance = d
    }
  }
  return best
}

/** Whether the pair's occurrences share a motif ancestor, so "All instances" can apply (SPEC §5.3). */
export function hasCommonAncestor(i: SceneIntersection): boolean {
  return commonPrefix(i.a.occ.path, i.b.occ.path).length > 0
}

/** SPEC §5.4 toggle with the store's scope; 'all' falls back to 'occurrence' (with a notice) for a pair with no common ancestor. */
export function toggleAt(i: SceneIntersection): void {
  const s = useEditor.getState()
  const all = s.crossingScope === 'all' && hasCommonAncestor(i)
  const notice = s.crossingScope === 'all' && !all ? 'No common motif: toggled this occurrence only' : null
  s.run((p) => toggleCrossing(p, i, all ? 'all' : 'occurrence'))
  useEditor.setState({ crossingNotice: notice })
}

export function describeUnsupported(i: SceneIntersection): string {
  return `${i.cls}: ${i.reason}`
}

function tap(svg: SVGSVGElement, client: XY, pointerType: string): void {
  const scene = editorScene(useEditor.getState())
  const listed = scene.intersections
  const centres = [...listed.map((i) => i.point), ...scene.unresolved.map((u) => u.worldHint)].map((w) => worldToScreen(svg, w))
  const k = pickNearest(centres, client, pointerType === 'touch' ? HIT_RADIUS_TOUCH_PX : HIT_RADIUS_MOUSE_PX)
  if (k === null) {
    useEditor.setState({ crossingNotice: null })
    return
  }
  const i = listed[k]
  if (i === undefined) {
    useEditor.setState({ crossingNotice: 'Unresolved crossing record: toggle a crossing of the same pair to rebind it, or Remove it in the inspector' })
    return
  }
  if (i.cls === 'eligible') toggleAt(i)
  else useEditor.setState({ crossingNotice: describeUnsupported(i) })
}

// Pointer bookkeeping, valid while the Canvas has the crossing listeners bound.
const down = new Set<number>()
let press: { id: number; start: XY; spoiled: boolean } | null = null

export function resetCrossingInput(): void {
  down.clear()
  press = null
}

export function crossingPointerDown(e: PointerEvent, panning: boolean): void {
  down.add(e.pointerId)
  if (down.size > 1) {
    if (press !== null) press.spoiled = true
    return
  }
  if (panning || e.button !== 0) return
  press = { id: e.pointerId, start: { x: e.clientX, y: e.clientY }, spoiled: false }
}

export function crossingPointerMove(e: PointerEvent): void {
  if (press?.id === e.pointerId && Math.hypot(e.clientX - press.start.x, e.clientY - press.start.y) >= TAP_SLOP_PX) press.spoiled = true
}

export function crossingPointerUp(svg: SVGSVGElement, e: PointerEvent): void {
  down.delete(e.pointerId)
  const p = press
  if (p === null || p.id !== e.pointerId) return
  press = null
  if (!p.spoiled) tap(svg, { x: e.clientX, y: e.clientY }, e.pointerType)
}

export function crossingPointerCancel(e: PointerEvent): void {
  down.delete(e.pointerId)
  if (press?.id === e.pointerId) press = null
}
