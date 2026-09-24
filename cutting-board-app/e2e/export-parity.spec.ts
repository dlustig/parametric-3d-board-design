// SPEC §10, §13 G5: Export SVG (the Project Menu action) and the export
// parity gate — Fixture F, exported standalone and compared against the
// editor's Board region in chromium, firefox and webkit. Per-intersection
// sampling reuses the crossing-compositing proof's helpers (Task 9,
// `e2e/raster.ts`); the whole-image comparison excludes an anti-aliased-edge
// mask (SPEC §13 G5).
//
// Fixture F is loaded through `window.__cbpd.loadFixture('interlace')`
// rather than imported here: this file runs under Playwright's plain Node
// ESM loader (no Vite JSON handling), and `src/fixtures/*.json` needs one.

import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import type { Project } from '../src/domain/model.ts'
import type { SceneIntersection } from '../src/geometry/scene.ts'
import type { XY } from './helpers.ts'
import { open } from './helpers.ts'
import type { Raster, Side } from './raster.ts'
import {
  blendDistance,
  colorEquals,
  edgeDistances,
  footprintMarginPx,
  hex,
  interiorSamples,
  materialColors,
  maxPixelDifference,
  pixelAt,
  pxPerMmOf,
  rasterizeEditorBoard,
  rasterizeSvg,
  sides,
  unit,
} from './raster.ts'

const WIDTH_PX = 800 // fixed pixel size for both rasters, not DPR-dependent
const INSIDE_TOL = 3 // 3/255, SPEC §13 G5
const BLEND_TOL = 6 // 6/255, as in crossing-proof
const MAX_DIFF_TOL = 8 // 8/255, SPEC §13 G5
// Fixture F's real (non-crafted) geometry puts some eligible crossings close to a place the plain
// footprint (SPEC §6.1, a strip×strip intersection with no notion of a band's own finite length)
// doesn't faithfully model the actual paint:
//  - `accent-a`/`accent-b` (SPEC §12 F's 2-Band accent motif) are short, open (butt-capped) bands, and
//    some cross a lattice band close to their own far end — the near-joint class only guards interior
//    joints (SPEC §5.2), not an open band's terminus, so the footprint can reach past where O (or U)
//    has actually stopped painting; a third colour there is real, not a defect.
//  - the accent motif's own two bands cross each other right beside where each crosses the lattice, so
//    a footprint's edge can sit within a px or two of a DIFFERENT eligible intersection's footprint,
//    where which crossing's colour legitimately shows is ambiguous.
// Skip a sample in either situation rather than assert on it.
const SAMPLE_MARGIN_PX = 1.5 // as in crossing-proof: skip an interior-offset sample this close to an edge
const EDGE_BAND_INSET_PX = 0.5 // within the 1-px band, at each edge's midpoint
const OTHER_FOOTPRINT_CLEARANCE_MM = 0.5 // skip an edge-band sample this close to a different intersection's footprint
const SEGMENT_END_CLEARANCE_MM = 2 // skip a sample this close to O's or U's own (possibly open) segment endpoint

/** Loads Fixture F through the test hook. */
async function seedFixtureF(page: Page): Promise<void> {
  await open(page)
  await page.evaluate(() => window.__cbpd!.loadFixture('interlace'))
}

interface Rendered {
  project: Project
  scene: { intersections: SceneIntersection[] }
  editorRaster: Raster
  exportRaster: Raster
  colorOf: (side: Side) => string
  kEditor: number
  kExport: number
}

async function render(page: Page): Promise<Rendered> {
  await seedFixtureF(page)
  const project = await page.evaluate(() => window.__cbpd!.getProject())
  const boardWidthMm = project.board.widthMm
  const colors = materialColors(project)
  const scratch = await page.context().newPage()
  try {
    const editorRaster = await rasterizeEditorBoard(page, scratch, WIDTH_PX / boardWidthMm)
    const scene = await page.evaluate(() => window.__cbpd!.getScene())
    const svg = await page.evaluate(() => window.__cbpd!.exportSvg())
    const exportRaster = await rasterizeSvg(scratch, svg, WIDTH_PX)
    return {
      project,
      scene,
      editorRaster,
      exportRaster,
      colorOf: (side) => colors.get(side.occ.materialId)!,
      kEditor: pxPerMmOf(editorRaster, boardWidthMm),
      kExport: pxPerMmOf(exportRaster, boardWidthMm),
    }
  } finally {
    await scratch.close()
  }
}

/** The midpoint of each edge of convex polygon `poly`, offset `insetPx` inward (the farthest point on that edge from either corner). */
function edgeMidpointsInward(poly: XY[], insetPx: number, k: number): XY[] {
  const centroid = { x: poly.reduce((s, p) => s + p.x, 0) / poly.length, y: poly.reduce((s, p) => s + p.y, 0) / poly.length }
  const insetMm = insetPx / k
  return poly.map((p, i) => {
    const q = poly[(i + 1) % poly.length]!
    const mid = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }
    const u = unit({ a: p, b: q })
    const n = { x: -u.y, y: u.x }
    const sign = Math.sign((centroid.x - p.x) * n.x + (centroid.y - p.y) * n.y)
    return { x: mid.x + sign * n.x * insetMm, y: mid.y + sign * n.y * insetMm }
  })
}

/** Whether `p` lies within `marginMm` of being inside any footprint in `footprints` other than `exclude`. */
function nearAnotherFootprint(footprints: XY[][], exclude: XY[], p: XY): boolean {
  return footprints.some((f) => f !== exclude && edgeDistances(f, p).every((d) => d >= -OTHER_FOOTPRINT_CLEARANCE_MM))
}

/** Distance from `p` to the nearer of `seg`'s two endpoints. */
function distanceToSegmentEnds(seg: { a: XY; b: XY }, p: XY): number {
  return Math.min(Math.hypot(p.x - seg.a.x, p.y - seg.a.y), Math.hypot(p.x - seg.b.x, p.y - seg.b.y))
}

/** Each footprint edge's midpoint, `EDGE_BAND_INSET_PX` inside the line: blend distance to the O–U line, in `raster`. */
function footprintEdgeStats(raster: Raster, k: number, eligible: SceneIntersection[], colorOf: (side: Side) => string): { failures: string[]; maxDistance: number; sampled: number; skipped: number } {
  const failures: string[] = []
  let maxDistance = 0
  let sampled = 0
  let skipped = 0
  const footprints = eligible.map((i) => i.footprint!)
  for (const i of eligible) {
    const { over, under } = sides(i)
    const cO = colorOf(over)
    const cU = colorOf(under)
    for (const [e, p] of edgeMidpointsInward(i.footprint!, EDGE_BAND_INSET_PX, k).entries()) {
      // Skip a sample near another intersection's footprint, or near O's/U's own segment endpoint:
      // in both cases the footprint's geometry outruns what's actually painted there (see the
      // constants' comment above), so a third colour is legitimate, not a rendering defect. Also skip
      // when O and U share a material: the blend line is degenerate (a single point), so there is
      // nothing this check can distinguish from a defect.
      if (
        cO === cU ||
        nearAnotherFootprint(footprints, i.footprint!, p) ||
        distanceToSegmentEnds(over.seg, p) < SEGMENT_END_CLEARANCE_MM ||
        distanceToSegmentEnds(under.seg, p) < SEGMENT_END_CLEARANCE_MM
      ) {
        skipped++
        continue
      }
      const got = pixelAt(raster, k, p)
      const { distance, t } = blendDistance(got, cO, cU)
      sampled++
      maxDistance = Math.max(maxDistance, distance)
      if (distance > BLEND_TOL) failures.push(`${i.overKey} over ${under.occ.key}, edge ${e} midpoint (${p.x.toFixed(2)}, ${p.y.toFixed(2)}): ${hex(got)} is ${distance.toFixed(1)} from ${cO}–${cU} (t=${t.toFixed(2)})`)
    }
  }
  return { failures, maxDistance, sampled, skipped }
}

test.describe('export parity (Fixture F)', () => {
  test.skip(({ isMobile }) => isMobile, 'pixel proof runs in the desktop chromium/firefox/webkit projects')
  // Wide enough that the 800×800 Board clip (Fixture F is 399mm square) stays inside the canvas
  // area after the fixed toolbar/inspector chrome (~516px), with margin. `deviceScaleFactor: 1`
  // keeps the editor screenshot at 800×800 CSS px too — the webkit project's device profile
  // defaults to 2, which would otherwise capture it at 1600×1600 (the SVG raster, drawn to an
  // explicitly-sized canvas, always comes out at the requested width regardless of DPR).
  test.use({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 })

  test('export: no class/style, no external url(, dimensions match the viewBox, unique single-prefix ids', async ({ page }) => {
    await seedFixtureF(page)
    const svg = await page.evaluate(() => window.__cbpd!.exportSvg())

    expect(svg).not.toMatch(/\bclass=/)
    expect(svg).not.toMatch(/\bstyle=/)
    for (const m of svg.matchAll(/url\(([^)]*)\)/g)) expect(m[1], `${m[0]} is an internal reference`).toMatch(/^#/)

    const viewBox = svg.match(/viewBox="0 0 ([0-9.]+) ([0-9.]+)"/)
    expect(viewBox, 'viewBox present').not.toBeNull()
    const [, vw, vh] = viewBox!
    expect(svg).toContain(`width="${vw}mm"`)
    expect(svg).toContain(`height="${vh}mm"`)

    const ids = [...svg.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]!)
    expect(ids.length).toBeGreaterThan(0)
    expect(new Set(ids).size, 'ids are unique').toBe(ids.length)
    const prefixes = new Set(ids.map((id) => id.split('-')[0]))
    expect(prefixes.size, `one id prefix, got ${[...prefixes].join(', ')}`).toBe(1)
  })

  test('per-intersection: point and footprint-interior offsets show the effective over colour, in both rasters', async ({ page }) => {
    const { scene, editorRaster, exportRaster, colorOf, kEditor, kExport } = await render(page)
    const eligible = scene.intersections.filter((i) => i.cls === 'eligible')
    expect(eligible.length).toBeGreaterThan(0)

    const failures: string[] = []
    let checked = 0
    let skipped = 0
    for (const i of eligible) {
      const want = colorOf(sides(i).over)
      for (const p of interiorSamples(i)) {
        for (const [label, raster, k] of [
          ['editor', editorRaster, kEditor],
          ['export', exportRaster, kExport],
        ] as const) {
          // Skip a sample pixel within anti-aliasing reach of the footprint's own edge (as in
          // crossing-proof's sanity check) rather than assert on it: Fixture F's real geometry, at
          // this gate's fixed 800px raster, occasionally puts an offset sample this close.
          if (footprintMarginPx(i.footprint!, k, p) < SAMPLE_MARGIN_PX) {
            skipped++
            continue
          }
          checked++
          const got = pixelAt(raster, k, p)
          if (!colorEquals(got, want, INSIDE_TOL)) failures.push(`${label} ${i.overKey} at (${p.x.toFixed(2)}, ${p.y.toFixed(2)}): ${hex(got)} ≠ ${want}`)
        }
      }
    }
    console.log(`[${test.info().project.name}] export-parity samples: ${eligible.length} eligible intersections, ${checked} point samples checked, ${skipped} skipped (< ${SAMPLE_MARGIN_PX}px footprint margin)`)
    expect(failures.slice(0, 20)).toEqual([])
  })

  test('per-intersection: footprint edges hold only blends of the two band colours, in both rasters', async ({ page }) => {
    const { scene, editorRaster, exportRaster, colorOf, kEditor, kExport } = await render(page)
    const eligible = scene.intersections.filter((i) => i.cls === 'eligible')

    const editorStats = footprintEdgeStats(editorRaster, kEditor, eligible, colorOf)
    const exportStats = footprintEdgeStats(exportRaster, kExport, eligible, colorOf)
    console.log(
      `[${test.info().project.name}] footprint edges: editor max ${editorStats.maxDistance.toFixed(1)}/255 over ${editorStats.sampled} px (${editorStats.skipped} skipped); ` +
        `export max ${exportStats.maxDistance.toFixed(1)}/255 over ${exportStats.sampled} px (${exportStats.skipped} skipped)`,
    )
    expect([...editorStats.failures, ...exportStats.failures].slice(0, 20)).toEqual([])
  })

  test('whole-image: max per-pixel difference between the editor Board region and the export, excluding the edge mask, ≤ 8/255', async ({ page }) => {
    const { editorRaster, exportRaster } = await render(page)
    const { max, at, masked, sampled } = maxPixelDifference(editorRaster, exportRaster)
    console.log(
      `[${test.info().project.name}] export parity: max diff ${max}/255${at ? ` at (${at.x}, ${at.y})` : ''}; ${sampled} unmasked / ${masked} masked of ${editorRaster.width * editorRaster.height} px`,
    )
    expect(max, `max per-pixel diff ≤ ${MAX_DIFF_TOL}/255${at ? ` (worst at ${at.x},${at.y})` : ''}`).toBeLessThanOrEqual(MAX_DIFF_TOL)
  })

  test('Project Menu: Export SVG downloads <name>.svg starting with <svg', async ({ page }) => {
    await seedFixtureF(page)
    const project = await page.evaluate(() => window.__cbpd!.getProject())
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export SVG' }).click()])
    expect(download.suggestedFilename()).toBe(`${project.name}.svg`)
    const stream = await download.createReadStream()
    const chunks: Buffer[] = []
    for await (const chunk of stream) chunks.push(chunk as Buffer)
    const content = Buffer.concat(chunks).toString('utf8')
    expect(content.startsWith('<svg')).toBe(true)
  })
})
