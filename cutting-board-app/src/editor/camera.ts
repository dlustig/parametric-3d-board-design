// SPEC §7.2: the camera. `camera = { x, y, zoom }` is the world point (mm) at
// the viewport's top-left and the scale in px per mm. The root <svg>'s viewBox
// is derived from it at the wrapper's client aspect, so screen→world is the
// svg's `getScreenCTM().inverse()` with no letterboxing.

import type { Camera } from './store.ts'

type XY = { x: number; y: number }

export const MIN_ZOOM = 0.05
export const MAX_ZOOM = 50
/** Fit margin on each side, as a fraction of the Board dimension (SPEC §7.2 "Board bounds + 5% margin"). */
const FIT_MARGIN = 0.05

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))
}

export function viewBoxFor(camera: Camera, viewportPx: { w: number; h: number }): string {
  return `${camera.x} ${camera.y} ${viewportPx.w / camera.zoom} ${viewportPx.h / camera.zoom}`
}

export function screenToWorld(svg: SVGSVGElement, client: XY): XY {
  const p = new DOMPoint(client.x, client.y).matrixTransform(svg.getScreenCTM()!.inverse())
  return { x: p.x, y: p.y }
}

export function worldToScreen(svg: SVGSVGElement, world: XY): XY {
  const p = new DOMPoint(world.x, world.y).matrixTransform(svg.getScreenCTM()!)
  return { x: p.x, y: p.y }
}

/** Multiplies zoom by `factor` (clamped) keeping `worldAnchor` at the same screen position. */
export function zoomAbout(camera: Camera, factor: number, worldAnchor: XY): Camera {
  const zoom = clampZoom(camera.zoom * factor)
  const k = camera.zoom / zoom
  return { zoom, x: worldAnchor.x - (worldAnchor.x - camera.x) * k, y: worldAnchor.y - (worldAnchor.y - camera.y) * k }
}

/** The camera at `zoom` (clamped) that shows `world` at viewport-local px `local`. */
export function placeAt(world: XY, local: XY, zoom: number): Camera {
  const z = clampZoom(zoom)
  return { zoom: z, x: world.x - local.x / z, y: world.y - local.y / z }
}

/** The Board centred with a 5% margin on each side of the tighter axis. */
export function fitBoard(board: { widthMm: number; heightMm: number }, viewportPx: { w: number; h: number }): Camera {
  const spanW = board.widthMm * (1 + 2 * FIT_MARGIN)
  const spanH = board.heightMm * (1 + 2 * FIT_MARGIN)
  const zoom = clampZoom(Math.min(viewportPx.w / spanW, viewportPx.h / spanH))
  return placeAt({ x: board.widthMm / 2, y: board.heightMm / 2 }, { x: viewportPx.w / 2, y: viewportPx.h / 2 }, zoom)
}
