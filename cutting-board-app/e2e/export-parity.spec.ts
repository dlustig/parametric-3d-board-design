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
import { open } from './helpers.ts'
import type { Raster, Side } from './raster.ts'
import {
  blendDistance,
  capMarginMm,
  colorEquals,
  edgeDistances,
  hex,
  interiorSamples,
  materialColors,
  maxPixelDifference,
  pixelAt,
  pxPerMmOf,
  rasterizeEditorBoard,
  rasterizeSvg,
  sampleMarginPx,
  samplePixel,
  sides,
} from './raster.ts'

const WIDTH_PX = 800 // fixed pixel size for both rasters, not DPR-dependent
const INSIDE_TOL = 3 // 3/255, SPEC §13 G5
const BLEND_TOL = 6 // 6/255, as in crossing-proof
const MAX_DIFF_TOL = 8 // 8/255, SPEC §13 G5
// Fixture F's real (non-crafted) geometry has exactly two quirks these checks must account for
// (footprint overlap between two DIFFERENT eligible intersections is exactly zero on Fixture F, so no
// exclusion is needed for that — an earlier round of this gate wrongly suspected it):
//  - Same-material O/U pairs: `blendDistance` (`raster.ts`) degenerates cleanly to "distance to that
//    one colour" rather than NaN, so these are simply checked like any other pair, not skipped.
//  - SPEC §6.1's butt-end case (amended after this gate's review): the plain footprint is the
//    intersection of two infinite strips, so near a butt end it can reach past where a band's own
//    (finite) real paint has stopped — the near-joint class (SPEC §5.2) only guards interior joints,
//    not an open terminus. Fixture F's accent motif (SPEC §12 F) is short and butt-capped, and at
//    least one crossing has its far end only 0.146 mm inside the lattice band it crosses: close
//    enough, at this gate's fixed 800 px raster, for a sample point to land past it, where a third
//    colour is real, not a defect. The two constants below skip a sample there.
const SAMPLE_MARGIN_PX = 1.0 // skip an interior-offset sample this close to (footprint ∩ O's real extent)'s boundary: a pixel's half-diagonal (≈0.71px) plus slack
const SEGMENT_END_CLEARANCE_MM = 1 // skip an edge-band pixel this close to O's own segment end
const MIN_EDGES_WITH_SAMPLES = 1000 // of 425 × 4 = 1700 footprint edges, a sanity floor so the edge-band scan can't go vacuous unnoticed

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

/**
 * Every pixel in the 1-px band along a footprint edge (SPEC §13 G5), ≥2 px
 * from that footprint's other edges (as `crossing-proof.spec.ts` does, to
 * stay clear of a real corner) and ≥`SEGMENT_END_CLEARANCE_MM` from O's own
 * segment end (SPEC §6.1's butt-end case): blend distance to the O–U line,
 * in `raster`. Same-material O/U pairs are still scanned — `blendDistance`
 * degenerates cleanly to "how close to that one colour" rather than NaN.
 */
function footprintEdgeStats(
  raster: Raster,
  k: number,
  eligible: SceneIntersection[],
  colorOf: (side: Side) => string,
): { failures: string[]; maxDistance: number; sampled: number; edgesWithSamples: number; edgesTotal: number } {
  const failures: string[] = []
  let maxDistance = 0
  let sampled = 0
  let edgesWithSamples = 0
  let edgesTotal = 0
  for (const i of eligible) {
    const { over, under } = sides(i)
    const cO = colorOf(over)
    const cU = colorOf(under)
    const footprint = i.footprint!
    const minX = Math.max(0, Math.floor(Math.min(...footprint.map((p) => p.x)) * k) - 2)
    const maxX = Math.min(raster.width - 1, Math.ceil(Math.max(...footprint.map((p) => p.x)) * k) + 2)
    const minY = Math.max(0, Math.floor(Math.min(...footprint.map((p) => p.y)) * k) - 2)
    const maxY = Math.min(raster.height - 1, Math.ceil(Math.max(...footprint.map((p) => p.y)) * k) + 2)
    const perEdge = footprint.map(() => 0)
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const c = { x: (x + 0.5) / k, y: (y + 0.5) / k }
        if (capMarginMm(over.seg, c) < SEGMENT_END_CLEARANCE_MM) continue // SPEC §6.1: past O's butt end
        const d = edgeDistances(footprint, c).map((v) => v * k)
        for (const [e, de] of d.entries()) {
          if (de < 0 || de >= 1) continue
          if (!d.every((v, j) => j === e || v >= 2)) continue
          const got = samplePixel(raster, x, y)
          const { distance, t } = blendDistance(got, cO, cU)
          sampled++
          perEdge[e]!++
          maxDistance = Math.max(maxDistance, distance)
          if (distance > BLEND_TOL) failures.push(`${i.overKey} over ${under.occ.key}, edge ${e}, px (${x}, ${y}): ${hex(got)} is ${distance.toFixed(1)} from ${cO}–${cU} (t=${t.toFixed(2)})`)
        }
      }
    }
    edgesTotal += perEdge.length
    edgesWithSamples += perEdge.filter((n) => n > 0).length
  }
  return { failures, maxDistance, sampled, edgesWithSamples, edgesTotal }
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
      const { over } = sides(i)
      const want = colorOf(over)
      for (const p of interiorSamples(i)) {
        for (const [label, raster, k] of [
          ['editor', editorRaster, kEditor],
          ['export', exportRaster, kExport],
        ] as const) {
          // Skip a sample pixel within anti-aliasing reach of (footprint ∩ O's real extent)'s
          // boundary rather than assert on it: SPEC §6.1's butt-end case (see the constants' comment
          // above) is the only reason this is ever needed on Fixture F.
          if (sampleMarginPx(i.footprint!, over.seg, k, p) < SAMPLE_MARGIN_PX) {
            skipped++
            continue
          }
          checked++
          const got = pixelAt(raster, k, p)
          if (!colorEquals(got, want, INSIDE_TOL)) failures.push(`${label} ${i.overKey} at (${p.x.toFixed(2)}, ${p.y.toFixed(2)}): ${hex(got)} ≠ ${want}`)
        }
      }
    }
    console.log(`[${test.info().project.name}] export-parity samples: ${eligible.length} eligible intersections, ${checked} point samples checked, ${skipped} skipped (< ${SAMPLE_MARGIN_PX}px of footprint ∩ O's real extent)`)
    expect(failures.slice(0, 20)).toEqual([])
  })

  test('per-intersection: footprint edges hold only blends of the two band colours, in both rasters', async ({ page }) => {
    const { scene, editorRaster, exportRaster, colorOf, kEditor, kExport } = await render(page)
    const eligible = scene.intersections.filter((i) => i.cls === 'eligible')

    const editorStats = footprintEdgeStats(editorRaster, kEditor, eligible, colorOf)
    const exportStats = footprintEdgeStats(exportRaster, kExport, eligible, colorOf)
    console.log(
      `[${test.info().project.name}] footprint edges: editor max ${editorStats.maxDistance.toFixed(1)}/255 over ${editorStats.sampled} px (${editorStats.edgesWithSamples}/${editorStats.edgesTotal} edges sampled); ` +
        `export max ${exportStats.maxDistance.toFixed(1)}/255 over ${exportStats.sampled} px (${exportStats.edgesWithSamples}/${exportStats.edgesTotal} edges sampled)`,
    )
    // Guard against the scan silently going vacuous (an overly tight corner or segment-end
    // clearance): most footprint edges at this gate's fixed 800px resolution contribute at least
    // one valid pixel, as `crossing-proof.spec.ts`'s per-edge `n > 10` asserts for its two patches.
    expect(editorStats.edgesWithSamples, 'footprint edges with ≥1 sampled pixel (editor)').toBeGreaterThan(MIN_EDGES_WITH_SAMPLES)
    expect(exportStats.edgesWithSamples, 'footprint edges with ≥1 sampled pixel (export)').toBeGreaterThan(MIN_EDGES_WITH_SAMPLES)
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
