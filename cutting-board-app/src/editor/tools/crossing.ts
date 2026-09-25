// SPEC §7.4 Crossing tool: tap the nearest marker centre within the hit
// radius (12 px mouse/pen, 22 px touch). An eligible marker toggles per §5.4
// with the options bar's scope ("All instances" only where the pair has a
// common motif ancestor, else this occurrence); an unsupported one shows its
// class and reason in the options bar; an unresolved ring explains itself
// (an explicit toggle of the pair rebinds it, §5.5). Taps are recognised by
// `tapTracker.ts`, like the drawing tools'.

import { toggleCrossing } from '@/domain/commands/crossings'
import { commonPrefix } from '@/domain/crossings'
import type { Scene, SceneIntersection } from '@/geometry/scene'
import { worldToScreen } from '@/editor/camera'
import { editorScene } from '@/editor/scene'
import { useEditor } from '@/editor/store'
import { createTapTracker, isTap } from '../tapTracker.ts'

type XY = { x: number; y: number }

export const HIT_RADIUS_MOUSE_PX = 12
export const HIT_RADIUS_TOUCH_PX = 22

/** Index of the centre nearest `at` within `radius` (all in screen px), or null; on a tie the earlier centre wins. */
export function pickNearest(centres: XY[], at: XY, radius: number): number | null {
  let best: number | null = null
  let bestDistance = Infinity
  for (const [k, c] of centres.entries()) {
    const d = Math.hypot(c.x - at.x, c.y - at.y)
    if (d <= radius && d < bestDistance) {
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

/** Whether the options bar shows the scope control: some eligible pair in `scene` has a common motif ancestor (SPEC §5.4). */
export function scopeControlShown(scene: Scene): boolean {
  return scene.intersections.some((i) => i.cls === 'eligible' && hasCommonAncestor(i))
}

/**
 * SPEC §5.4 toggle with the store's scope; 'all' falls back to 'occurrence'
 * for a pair with no common ancestor, with a notice only where the visible
 * scope control said "All instances" about a pair inside some motif.
 */
export function toggleAt(i: SceneIntersection): void {
  const s = useEditor.getState()
  const all = s.crossingScope === 'all' && hasCommonAncestor(i)
  const inMotif = i.a.occ.path.length > 0 || i.b.occ.path.length > 0
  const fellBack = s.crossingScope === 'all' && !all && inMotif && scopeControlShown(editorScene(s))
  const notice = fellBack ? 'No common motif: toggled this occurrence only' : null
  s.run((p) => toggleCrossing(p, i, all ? 'all' : 'occurrence'))
  useEditor.setState({ crossingNotice: notice })
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
  else useEditor.setState({ crossingNotice: `${i.cls}: ${i.reason}` })
}

// Pointer bookkeeping, valid while the Canvas has the crossing listeners bound.
const taps = createTapTracker()

export function resetCrossingInput(): void {
  taps.reset()
}

export function crossingPointerDown(e: PointerEvent, panning: boolean): void {
  if (!taps.down(e) || panning || e.button !== 0) return
  taps.begin(e)
}

export function crossingPointerMove(e: PointerEvent): void {
  taps.move(e)
}

export function crossingPointerUp(svg: SVGSVGElement, e: PointerEvent): void {
  const p = taps.up(e)
  if (p !== null && isTap(p)) tap(svg, { x: e.clientX, y: e.clientY }, e.pointerType)
}

export function crossingPointerCancel(e: PointerEvent): void {
  taps.cancel(e)
}
