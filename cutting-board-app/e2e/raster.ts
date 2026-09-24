// Pixel sampling for the crossing-compositing proof (SPEC §13 G5): rasterise an
// SVG string, or the editor's Board region, into RGBA pixels through an
// <img> drawn on an offscreen <canvas> in a blank page, then sample it in
// world mm. Also holds the geometric sampling helpers shared by
// `crossing-proof.spec.ts` and `export-parity.spec.ts`: footprint-relative
// sample points, edge distances, and the over/under split of a scene
// intersection.

import type { Page } from '@playwright/test'
import type { Project } from '../src/domain/model.ts'
import type { SceneIntersection } from '../src/geometry/scene.ts'
import type { XY } from './helpers.ts'
import { nextFrame, setCamera, toClient } from './helpers.ts'

export type RGB = [number, number, number]

/** RGBA rows, top to bottom, like `ImageData`. */
export interface Raster {
  width: number
  height: number
  data: Uint8Array
}

/** Draws `src` (an image URL) over white at `w`×`h` (or its natural size) and returns the pixels base64-encoded. */
async function decodeInPage(page: Page, src: { url: string } | { svgText: string; widthPx: number }): Promise<Raster> {
  const out = await page.evaluate(async (s) => {
    let url: string
    let w: number | null = null
    let h: number | null = null
    if ('svgText' in s) {
      // Give the SVG its target pixel size so every engine rasterises the vector at that size.
      const doc = new DOMParser().parseFromString(s.svgText, 'image/svg+xml')
      const svg = doc.documentElement
      const [, , vw, vh] = svg.getAttribute('viewBox')!.split(/\s+/).map(Number) as [number, number, number, number]
      w = s.widthPx
      h = Math.round((s.widthPx * vh) / vw)
      svg.setAttribute('width', `${w}px`)
      svg.setAttribute('height', `${h}px`)
      url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(doc)], { type: 'image/svg+xml' }))
    } else {
      url = s.url
    }
    const img = new Image()
    img.src = url
    await img.decode()
    const width = w ?? img.naturalWidth
    const height = h ?? img.naturalHeight
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(img, 0, 0, width, height)
    const data = ctx.getImageData(0, 0, width, height).data
    let bin = ''
    for (let k = 0; k < data.length; k += 0x8000) bin += String.fromCharCode(...data.subarray(k, k + 0x8000))
    return { width, height, b64: btoa(bin) }
  }, src)
  return { width: out.width, height: out.height, data: new Uint8Array(Buffer.from(out.b64, 'base64')) }
}

/** Rasterises `svgText` at `widthPx` wide (height from its viewBox) in a fresh blank document on `page`. */
export async function rasterizeSvg(page: Page, svgText: string, widthPx: number): Promise<Raster> {
  await page.goto('about:blank')
  return decodeInPage(page, { svgText, widthPx })
}

/**
 * The editor's Board region at `pxPerMm` CSS px per mm, overlays and mat
 * hidden, as device pixels (`raster.width / boardWidthMm` px per mm). The
 * screenshot is decoded on `scratch` (navigated to about:blank).
 */
export async function rasterizeEditorBoard(editor: Page, scratch: Page, pxPerMm: number): Promise<Raster> {
  const board = await editor.evaluate(() => window.__cbpd!.getProject().board)
  const top = await editor.evaluate(() => document.querySelector('svg.canvas-svg')!.getBoundingClientRect())
  // Put the Board's top-left at a whole client pixel so the clip is pixel-aligned.
  const local = { x: Math.ceil(top.left) + 8 - top.left, y: Math.ceil(top.top) + 8 - top.top }
  await setCamera(editor, { zoom: pxPerMm, x: -local.x / pxPerMm, y: -local.y / pxPerMm })
  await editor.evaluate(() => window.__cbpd!.setTestFlags({ hideChrome: true }))
  await nextFrame(editor)
  const tl = await toClient(editor, { x: 0, y: 0 })
  const clip = { x: Math.round(tl.x), y: Math.round(tl.y), width: Math.round(board.widthMm * pxPerMm), height: Math.round(board.heightMm * pxPerMm) }
  const png = await editor.screenshot({ clip, animations: 'disabled', caret: 'hide' })
  await scratch.goto('about:blank')
  return decodeInPage(scratch, { url: `data:image/png;base64,${png.toString('base64')}` })
}

export function samplePixel(img: Raster, x: number, y: number): RGB {
  const k = (y * img.width + x) * 4
  return [img.data[k]!, img.data[k + 1]!, img.data[k + 2]!]
}

export function hexToRgb(hex: string): RGB {
  const n = Number.parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Every channel within `tol` (in 0–255 units). */
export function colorEquals(rgb: RGB, hex: string, tol: number): boolean {
  const c = hexToRgb(hex)
  return rgb.every((v, k) => Math.abs(v - c[k]!) <= tol)
}

/** Euclidean RGB distance from `rgb` to the segment between `hexA` and `hexB`, and the blend parameter (0 = A, 1 = B). */
export function blendDistance(rgb: RGB, hexA: string, hexB: string): { distance: number; t: number } {
  const a = hexToRgb(hexA)
  const b = hexToRgb(hexB)
  const d = b.map((v, k) => v - a[k]!)
  const len2 = d.reduce((s, v) => s + v * v, 0)
  const t = Math.min(1, Math.max(0, d.reduce((s, v, k) => s + v * (rgb[k]! - a[k]!), 0) / len2))
  const distance = Math.hypot(...rgb.map((v, k) => v - (a[k]! + t * d[k]!)))
  return { distance, t }
}

/** Pixels per world mm for a raster of the Board `boardWidthMm` wide. */
export function pxPerMmOf(img: Raster, boardWidthMm: number): number {
  return img.width / boardWidthMm
}

/** The pixel containing world point `p` (mm) at `k` px per mm. */
export function pixelAt(img: Raster, k: number, p: XY): RGB {
  return samplePixel(img, Math.floor(p.x * k), Math.floor(p.y * k))
}

// --- Geometric sampling helpers shared across the pixel-proof specs (SPEC §13 G5) ---

/** Unit vector from `s.a` to `s.b`. */
export function unit(s: { a: XY; b: XY }): XY {
  const l = Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y)
  return { x: (s.b.x - s.a.x) / l, y: (s.b.y - s.a.y) / l }
}

/** Whether `p` and `q` are within `tol` mm of each other. */
export function near(p: XY, q: XY, tol = 0.01): boolean {
  return Math.hypot(p.x - q.x, p.y - q.y) <= tol
}

/** Signed distances (positive inside), in mm, from `c` to each edge line of the convex polygon `poly`. */
export function edgeDistances(poly: XY[], c: XY): number[] {
  const centroid = { x: poly.reduce((s, p) => s + p.x, 0) / poly.length, y: poly.reduce((s, p) => s + p.y, 0) / poly.length }
  return poly.map((p, k) => {
    const q = poly[(k + 1) % poly.length]!
    const u = unit({ a: p, b: q })
    const n = { x: -u.y, y: u.x }
    const sign = Math.sign((centroid.x - p.x) * n.x + (centroid.y - p.y) * n.y)
    return sign * ((c.x - p.x) * n.x + (c.y - p.y) * n.y)
  })
}

/** The pixel `pixelAt` would sample for world point `p` at `k` px/mm: its centre, in world mm. */
export function pixelCenterAt(k: number, p: XY): XY {
  return { x: (Math.floor(p.x * k) + 0.5) / k, y: (Math.floor(p.y * k) + 0.5) / k }
}

/** The sample pixel's minimum distance, in px, to any edge of the convex polygon `poly` (SPEC §6.1 footprint), at `k` px/mm. */
export function footprintMarginPx(poly: XY[], k: number, p: XY): number {
  return Math.min(...edgeDistances(poly, pixelCenterAt(k, p))) * k
}

/** The intersection point, and ±25% of the footprint's extent along each band's direction from it. */
export function interiorSamples(i: SceneIntersection): XY[] {
  const uA = unit(i.a.seg)
  const uB = unit(i.b.seg)
  const sin = Math.abs(uA.x * uB.y - uA.y * uB.x)
  const alongA = i.b.occ.worldWidth / 2 / sin // half-extent of the footprint along A through the point
  const alongB = i.a.occ.worldWidth / 2 / sin
  const p = i.point
  return [
    p,
    { x: p.x + 0.5 * alongA * uA.x, y: p.y + 0.5 * alongA * uA.y },
    { x: p.x - 0.5 * alongA * uA.x, y: p.y - 0.5 * alongA * uA.y },
    { x: p.x + 0.5 * alongB * uB.x, y: p.y + 0.5 * alongB * uB.y },
    { x: p.x - 0.5 * alongB * uB.x, y: p.y - 0.5 * alongB * uB.y },
  ]
}

/** The side of a scene intersection whose occurrence key matches `overKey` (and the other side). */
export type Side = SceneIntersection['a']
export function sides(i: SceneIntersection): { over: Side; under: Side } {
  return i.a.occ.key === i.overKey ? { over: i.a, under: i.b } : { over: i.b, under: i.a }
}

/** `rgb` formatted as `#rrggbb`. */
export function hex(rgb: RGB): string {
  return `#${rgb.map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

/** Colour hex by material id, from the project's materials palette. */
export function materialColors(p: Project): Map<string, string> {
  return new Map(p.materials.map((m) => [m.id, m.color]))
}

// --- Whole-image parity (SPEC §13 G5: editor Board region vs. standalone export) ---

/** Whether `(x, y)`'s 3×3 neighbourhood in `img` (clamped at the edges) contains more than one distinct colour, each channel quantised to 8-wide bins. */
export function isEdgeNeighborhood(img: Raster, x: number, y: number): boolean {
  let first: string | null = null
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || ny < 0 || nx >= img.width || ny >= img.height) continue
      const q = samplePixel(img, nx, ny)
        .map((v) => Math.floor(v / 8))
        .join(',')
      if (first === null) first = q
      else if (q !== first) return true
    }
  }
  return false
}

/**
 * The max per-channel absolute difference between corresponding pixels of
 * `a` and `b` (same size), skipping any pixel masked by `isEdgeNeighborhood`
 * in either image (an anti-aliased edge in either raster).
 */
export function maxPixelDifference(a: Raster, b: Raster): { max: number; at: XY | null; masked: number; sampled: number } {
  if (a.width !== b.width || a.height !== b.height) throw new Error(`raster size mismatch: ${a.width}x${a.height} vs ${b.width}x${b.height}`)
  let max = 0
  let at: XY | null = null
  let masked = 0
  let sampled = 0
  for (let y = 0; y < a.height; y++) {
    for (let x = 0; x < a.width; x++) {
      if (isEdgeNeighborhood(a, x, y) || isEdgeNeighborhood(b, x, y)) {
        masked++
        continue
      }
      sampled++
      const pa = samplePixel(a, x, y)
      const pb = samplePixel(b, x, y)
      const d = Math.max(Math.abs(pa[0] - pb[0]), Math.abs(pa[1] - pb[1]), Math.abs(pa[2] - pb[2]))
      if (d > max) {
        max = d
        at = { x, y }
      }
    }
  }
  return { max, at, masked, sampled }
}
