// Pixel sampling for the crossing-compositing proof (SPEC §13 G5): rasterise an
// SVG string, or the editor's Board region, into RGBA pixels through an
// <img> drawn on an offscreen <canvas> in a blank page, then sample it in
// world mm.

import type { Page } from '@playwright/test'
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
