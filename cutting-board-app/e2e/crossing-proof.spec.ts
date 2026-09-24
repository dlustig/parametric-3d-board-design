// SPEC §6.2, §13 G5 (Task 9 gate): crossing compositing, proved by pixel
// sampling in chromium, firefox and webkit, for the editor's Board region and
// for the standalone export. At every eligible crossing the footprint shows
// the effective over colour; a 1-px band inside every patch clip edge holds
// only blends of the two band colours (the accepted U-edge residual is such a
// blend); the occluded crossing renders by paint order.

import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { canonicalize } from '../src/domain/crossings.ts'
import type { Project } from '../src/domain/model.ts'
import { band, project, record, ref, region } from '../src/domain/test-builders.ts'
import type { Scene, SceneIntersection } from '../src/geometry/scene.ts'
import { MAX_CLIP_EXTEND_MM } from '../src/geometry/tolerance.ts'
import type { XY } from './helpers.ts'
import { seed } from './helpers.ts'
import type { Raster, Side } from './raster.ts'
import { blendDistance, colorEquals, edgeDistances, hex, interiorSamples, near, pixelAt, pxPerMmOf, rasterizeEditorBoard, rasterizeSvg, samplePixel, sides, unit } from './raster.ts'

const WALNUT = '#5C3A21'
const MAPLE = '#E8D4A8'
const CHERRY = '#9B4A2C'
const W_WIDE = 6.35
const W_NARROW = 3.175
const PX_PER_MM = 8 // CSS px per mm in both rasters (≥ 4 required)
const INSIDE_TOL = 3
const BLEND_TOL = 6

const deg = Math.PI / 180
const B_TURN: XY = { x: 20 + 50 * Math.cos(30 * deg), y: 35 - 50 * Math.sin(30 * deg) }
const D_HALF: XY = { x: 40 * Math.cos(15 * deg), y: 40 * Math.sin(15 * deg) }

/** Expected crossings: A×B at 90° (A over, A painted first → patch), A×B at 30° (B over), C×D at 15° (C over, C first → patch), E×F occluded by R. */
const EXPECTED = {
  ab90: { x: 20, y: 20 },
  ab30: { x: 20 + 15 / Math.tan(30 * deg), y: 20 },
  cd15: { x: 50, y: 55 },
  ef: { x: 30, y: 85 },
}

function crossingProject(): Project {
  const p = project(
    [
      band('bA', [[5, 20], [95, 20]], { materialId: 'walnut', widthMm: W_WIDE }),
      band('bB', [[20, 4], [20, 35], [B_TURN.x, B_TURN.y]], { materialId: 'maple', widthMm: W_NARROW }),
      band('bC', [[5, 55], [95, 55]], { materialId: 'walnut', widthMm: W_WIDE }),
      band('bD', [[50 - D_HALF.x, 55 + D_HALF.y], [50 + D_HALF.x, 55 - D_HALF.y]], { materialId: 'maple', widthMm: W_NARROW }),
      band('bE', [[5, 85], [60, 85]], { materialId: 'walnut', widthMm: W_WIDE }),
      { ...region('rR', [[25, 80], [35, 80], [35, 90], [25, 90]]), materialId: 'cherry' },
      band('bF', [[30, 70], [30, 98]], { materialId: 'maple', widthMm: W_NARROW }),
    ],
    [],
    [
      record('x90', ref('bB', 'bB0'), ref('bA', 'bA0'), 'b', EXPECTED.ab90), // A over
      record('x30', ref('bA', 'bA0'), ref('bB', 'bB1'), 'b', EXPECTED.ab30), // B over
      record('x15', ref('bD', 'bD0'), ref('bC', 'bC0'), 'b', EXPECTED.cd15), // C over
      record('xef', ref('bF', 'bF0'), ref('bE', 'bE0'), 'b', EXPECTED.ef), // E over, but occluded
    ].map(canonicalize),
  )
  return {
    ...p,
    board: { widthMm: 100, heightMm: 100, backgroundMaterialId: null },
    materials: [...p.materials, { id: 'cherry', name: 'Cherry', color: CHERRY }],
  }
}

const COLORS: Record<string, string> = { maple: MAPLE, walnut: WALNUT, cherry: CHERRY }

function colorOf(side: Side): string {
  return COLORS[side.occ.materialId]!
}

type Source = 'editor' | 'export'

interface Rendered {
  scene: Scene
  raster: Raster
  k: number // px per mm in the raster
  clips: XY[][] // patch clip polygons as drawn by this source
}

/** Parses the patch clipPath polygons out of an exported SVG. */
function exportClips(svg: string): XY[][] {
  return [...svg.matchAll(/<clipPath id="[^"]*-c\d+"[^>]*><polygon points="([^"]+)"\/>/g)].map((m) =>
    m[1]!.split(' ').map((pair) => {
      const [x, y] = pair.split(',').map(Number) as [number, number]
      return { x, y }
    }),
  )
}

async function render(page: Page, source: Source): Promise<Rendered> {
  await seed(page, crossingProject())
  const scratch = await page.context().newPage()
  try {
    if (source === 'editor') {
      const raster = await rasterizeEditorBoard(page, scratch, PX_PER_MM)
      const scene = await page.evaluate(() => window.__cbpd!.getScene())
      const clips = scene.elements.flatMap((el) => (el.kind === 'patch' ? [el.clip] : []))
      return { scene, raster, k: pxPerMmOf(raster, 100), clips }
    }
    const scene = await page.evaluate(() => window.__cbpd!.getScene())
    const svg = await page.evaluate(() => window.__cbpd!.exportSvg())
    const raster = await rasterizeSvg(scratch, svg, 100 * PX_PER_MM)
    return { scene, raster, k: pxPerMmOf(raster, 100), clips: exportClips(svg) }
  } finally {
    await scratch.close()
  }
}

test.describe('crossing compositing proof', () => {
  test.skip(({ isMobile }) => isMobile, 'pixel proof runs in the desktop chromium/firefox/webkit projects')
  test.use({ viewport: { width: 1200, height: 1000 } })

  test('scene: classes, over keys and patches', async ({ page }) => {
    await seed(page, crossingProject())
    const scene = await page.evaluate(() => window.__cbpd!.getScene())
    const at = (p: XY): SceneIntersection => {
      const found = scene.intersections.filter((i) => near(i.point, p))
      expect(found, `one intersection at ${p.x},${p.y}`).toHaveLength(1)
      return found[0]!
    }
    expect(scene.intersections).toHaveLength(4)
    expect(at(EXPECTED.ab90)).toMatchObject({ cls: 'eligible', overKey: '#bA' })
    expect(at(EXPECTED.ab30)).toMatchObject({ cls: 'eligible', overKey: '#bB' })
    expect(at(EXPECTED.cd15)).toMatchObject({ cls: 'eligible', overKey: '#bC' })
    expect(at(EXPECTED.ef).cls).toBe('occluded')
    const patches = scene.elements.flatMap((el) => (el.kind === 'patch' ? [el.over.key] : []))
    expect(patches.sort()).toEqual(['#bA', '#bC'])
  })

  for (const source of ['editor', 'export'] as const) {
    test(`${source}: effective over colour fills every eligible footprint, and only it`, async ({ page }) => {
      const { scene, raster, k } = await render(page, source)
      const eligible = scene.intersections.filter((i) => i.cls === 'eligible')
      expect(eligible).toHaveLength(3)
      const failures: string[] = []
      for (const i of eligible) {
        const want = colorOf(sides(i).over)
        for (const p of interiorSamples(i)) {
          // Sanity: the sample pixel lies ≥ 1.5 px inside the plain footprint.
          const px = { x: (Math.floor(p.x * k) + 0.5) / k, y: (Math.floor(p.y * k) + 0.5) / k }
          expect(Math.min(...edgeDistances(i.footprint!, px)) * k).toBeGreaterThanOrEqual(1.5)
          const got = pixelAt(raster, k, p)
          if (!colorEquals(got, want, INSIDE_TOL)) failures.push(`${i.overKey} at (${p.x.toFixed(2)}, ${p.y.toFixed(2)}): ${hex(got)} ≠ ${want}`)
        }
        // Just beyond the (enlarged) patch clip on U's centreline, U shows: the patch does not leak.
        const { over, under } = sides(i)
        const uU = unit(under.seg)
        const sin = Math.abs(uU.x * unit(over.seg).y - uU.y * unit(over.seg).x)
        const reach = over.occ.worldWidth / 2 / sin + MAX_CLIP_EXTEND_MM + 3 / k
        for (const sign of [1, -1]) {
          const p = { x: i.point.x + sign * reach * uU.x, y: i.point.y + sign * reach * uU.y }
          const got = pixelAt(raster, k, p)
          if (!colorEquals(got, colorOf(under), INSIDE_TOL)) failures.push(`under ${under.occ.key} at (${p.x.toFixed(2)}, ${p.y.toFixed(2)}): ${hex(got)} ≠ ${colorOf(under)}`)
        }
      }
      expect(failures).toEqual([])
    })

    test(`${source}: patch clip edges hold only blends of the two band colours`, async ({ page }) => {
      const { scene, raster, k, clips } = await render(page, source)
      expect(clips).toHaveLength(2)
      const failures: string[] = []
      const stats: string[] = []
      for (const clip of clips) {
        const owners = scene.intersections.filter((i) => i.cls === 'eligible' && Math.min(...edgeDistances(clip, i.point)) > 0)
        expect(owners).toHaveLength(1)
        const i = owners[0]!
        const { over, under } = sides(i)
        const [cO, cU] = [colorOf(over), colorOf(under)]
        const uU = unit(under.seg)
        const minX = Math.floor(Math.min(...clip.map((p) => p.x)) * k) - 2
        const maxX = Math.ceil(Math.max(...clip.map((p) => p.x)) * k) + 2
        const minY = Math.floor(Math.min(...clip.map((p) => p.y)) * k) - 2
        const maxY = Math.ceil(Math.max(...clip.map((p) => p.y)) * k) + 2
        const perEdge = clip.map(() => ({ n: 0, worstDistance: 0, maxUnder: 0 }))
        const residual = { n: 0, maxUnder: 0 } // pixels straddling U's edges, both sides
        for (let y = minY; y <= maxY; y++) {
          for (let x = minX; x <= maxX; x++) {
            const c = { x: (x + 0.5) / k, y: (y + 0.5) / k }
            const d = edgeDistances(clip, c).map((v) => v * k)
            const dPlain = edgeDistances(i.footprint!, c).map((v) => v * k)
            for (const [e, de] of d.entries()) {
              // Stay ≥ 2 px from the other clip edges and from the bands' real edges there (the plain
              // footprint, same corner order): near a corner, U's edge meets the background, not O.
              const othersClear = d.every((v, j) => j === e || (v >= 2 && dPlain[j]! >= 2))
              if (!othersClear) continue
              const p = clip[e]!
              const q = clip[(e + 1) % clip.length]!
              const u = unit({ a: p, b: q })
              const alongU = Math.abs(u.x * uU.y - u.y * uU.x) < 1e-6
              const { distance, t } = blendDistance(samplePixel(raster, x, y), cO, cU)
              if (alongU && de > -1 && de < 1) {
                residual.n++
                residual.maxUnder = Math.max(residual.maxUnder, t)
              }
              if (de < 0 || de >= 1) continue
              const s = perEdge[e]!
              s.n++
              s.worstDistance = Math.max(s.worstDistance, distance)
              s.maxUnder = Math.max(s.maxUnder, t)
              if (distance > BLEND_TOL) failures.push(`${i.overKey} over ${under.occ.key}, edge ${e}${alongU ? ' (U edge)' : ' (O edge)'}, px (${x}, ${y}): ${hex(samplePixel(raster, x, y))} is ${distance.toFixed(1)} from ${cO}–${cU}`)
            }
          }
        }
        for (const [e, s] of perEdge.entries()) expect(s.n, `pixels sampled on edge ${e} of ${i.overKey}'s patch`).toBeGreaterThan(10)
        stats.push(
          `${i.overKey}/${under.occ.key}: edges ${perEdge.map((s) => `n=${s.n} dist≤${s.worstDistance.toFixed(1)} U≤${(100 * s.maxUnder).toFixed(0)}%`).join('; ')}; U-edge residual max ${(100 * residual.maxUnder).toFixed(0)}% U over ${residual.n} px`,
        )
      }
      console.log(`[${test.info().project.name}] ${source} clip edges: ${stats.join(' | ')}`)
      expect(failures.slice(0, 20)).toEqual([])
    })

    test(`${source}: the occluded crossing renders by paint order`, async ({ page }) => {
      const { scene, raster, k } = await render(page, source)
      const i = scene.intersections.find((c) => near(c.point, EXPECTED.ef))!
      expect(i.cls).toBe('occluded')
      const got = pixelAt(raster, k, i.point)
      expect(colorEquals(got, MAPLE, INSIDE_TOL), `${hex(got)} ≈ ${MAPLE}`).toBe(true)
      // Region R (between E and F) covers E beside F: no patch punched through it.
      const beside = pixelAt(raster, k, { x: EXPECTED.ef.x + 3, y: EXPECTED.ef.y })
      expect(colorEquals(beside, CHERRY, INSIDE_TOL), `${hex(beside)} ≈ ${CHERRY}`).toBe(true)
    })
  }
})
