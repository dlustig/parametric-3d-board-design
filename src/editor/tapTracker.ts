// Tap recognition shared by the drawing tools, the Crossing tool and the
// vertex/midpoint handles (SPEC §7.2, §7.4): the pointers down, the press
// (the one pointer that went down alone) with its furthest move, and
// double-tap detection over completed taps.
//
// Second pointer, one rule for all three: a pointer going down while another
// is already down spoils the press. A spoiled press never becomes a tap or
// commits a drag, but the gesture it belongs to is kept (a drawing in
// progress, the selection, the tool), and the two-finger pan/zoom is
// use-gesture's as usual.

import { DOUBLE_TAP_MS, DOUBLE_TAP_PX, TAP_SLOP_PX } from '@/geometry/tolerance'

type XY = { x: number; y: number }
type PointerLike = Pick<PointerEvent, 'pointerId' | 'clientX' | 'clientY' | 'isPrimary'>

export interface Press {
  readonly id: number
  readonly start: XY
  /** Furthest distance from `start` so far, in client px. */
  maxMove: number
  spoiled: boolean
}

export interface TapTracker {
  /** Pointers currently down. */
  readonly pointers: number
  /** Records a pointer going down; `false` when another is already down (and the press, if any, is spoiled). A primary pointer has none down with it, so it also forgets any pointer whose up was missed. */
  down(e: PointerLike): boolean
  /** Starts the press for the pointer that just went down alone. */
  begin(e: PointerLike): void
  /** Tracks the press pointer's furthest move; the press when `e` is its pointer, else `null`. */
  move(e: PointerLike): Press | null
  /** A pointer lifted: the press it ends, or `null` when `e` was not the press pointer. */
  up(e: PointerLike): Press | null
  /** `pointercancel`: forgets the pointer and ends its press, if any. */
  cancel(e: PointerLike): void
  /** Forgets every pointer, the press and the last tap (listeners unbound). */
  reset(): void
  /** A completed tap at `client` is the second of a double-tap (within DOUBLE_TAP_MS and DOUBLE_TAP_PX of the previous one, which is then forgotten). */
  doubleTap(client: XY, now?: number): boolean
}

/** A completed press that is a tap: not spoiled, and never moved TAP_SLOP_PX. */
export function isTap(press: Press): boolean {
  return !press.spoiled && press.maxMove < TAP_SLOP_PX
}

export function createTapTracker(): TapTracker {
  const down = new Set<number>()
  let press: Press | null = null
  let lastTap: { time: number; at: XY } | null = null

  return {
    get pointers() {
      return down.size
    },
    down(e) {
      if (e.isPrimary) down.clear()
      down.add(e.pointerId)
      if (down.size === 1) return true
      if (press !== null) press.spoiled = true
      return false
    },
    begin(e) {
      press = { id: e.pointerId, start: { x: e.clientX, y: e.clientY }, maxMove: 0, spoiled: false }
    },
    move(e) {
      if (press === null || press.id !== e.pointerId) return null
      press.maxMove = Math.max(press.maxMove, Math.hypot(e.clientX - press.start.x, e.clientY - press.start.y))
      return press
    },
    up(e) {
      down.delete(e.pointerId)
      const ended = press
      if (ended === null || ended.id !== e.pointerId) return null
      press = null
      return ended
    },
    cancel(e) {
      down.delete(e.pointerId)
      if (press?.id === e.pointerId) press = null
    },
    reset() {
      down.clear()
      press = null
      lastTap = null
    },
    doubleTap(client, now = performance.now()) {
      const double = lastTap !== null && now - lastTap.time <= DOUBLE_TAP_MS && Math.hypot(client.x - lastTap.at.x, client.y - lastTap.at.y) <= DOUBLE_TAP_PX
      lastTap = double ? null : { time: now, at: client }
      return double
    },
  }
}
