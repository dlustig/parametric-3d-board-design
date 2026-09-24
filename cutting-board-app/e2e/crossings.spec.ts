// SPEC §5.4, §7.4, §7.5: the Crossing tool and the inspector's crossing list,
// end to end on a basket-weave motif (two horizontal and two vertical bands)
// repeated 3×3: "All instances" flips every cell, "This occurrence" overrides
// one cell and toggling it back removes the root record, an unsupported
// marker shows its reason, the touch hit radius, and the keyboard path.

import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import type { Project } from '../src/domain/model.ts'
import { band, project, repeat, transform } from '../src/domain/test-builders.ts'
import type { SceneIntersection } from '../src/geometry/scene.ts'
import type { XY } from './helpers.ts'
import { cameraShowing, getProject, history, nextFrame, seed, setCamera, toClient } from './helpers.ts'
import { colorEquals, pixelAt, pxPerMmOf, rasterizeEditorBoard } from './raster.ts'

const WALNUT = '#5C3A21'
const MAPLE = '#E8D4A8'
const CAMERA = cameraShowing({ x: 0, y: 0 }, { x: 40, y: 80 }, 2.5)
const TAN5 = Math.tan((5 * Math.PI) / 180)

/** Cells at transform (10, 10), step 50: h1 at y 10, v1 at x 10 inside each 40 mm cell. Plus a root pair crossing at 5° near (50, 160). */
function weave(): Project {
  const p = project(
    [
      repeat('rp', 'mw', { transform: transform({ x: 10, y: 10 }) }),
      band('p1', [[10, 160], [90, 160]], { materialId: 'walnut' }),
      band('p2', [[10, 160 + 40 * TAN5], [90, 160 - 40 * TAN5]]),
    ],
    [
      {
        id: 'mw',
        children: [
          band('h1', [[0, 10], [40, 10]], { materialId: 'walnut' }),
          band('h2', [[0, 30], [40, 30]], { materialId: 'walnut' }),
          band('v1', [[10, 0], [10, 40]]),
          band('v2', [[30, 0], [30, 40]]),
        ],
      },
    ],
  )
  return { ...p, board: { widthMm: 170, heightMm: 175, backgroundMaterialId: null } }
}

/** World point of the h1×v1 crossing in cell (row, column). */
function h1v1(row: number, column: number): XY {
  return { x: 20 + 50 * column, y: 20 + 50 * row }
}

const CELLS: Array<[number, number]> = [0, 1, 2].flatMap((r) => [0, 1, 2].map((c): [number, number] => [r, c]))

async function intersections(page: Page): Promise<SceneIntersection[]> {
  return page.evaluate(() => window.__cbpd!.getScene().intersections)
}

/** The over band's source id at the intersection nearest `p`. */
async function overAt(page: Page, p: XY): Promise<string> {
  const all = await intersections(page)
  const i = all.find((c) => Math.hypot(c.point.x - p.x, c.point.y - p.y) < 0.01)
  if (i === undefined) throw new Error(`no intersection at ${p.x}, ${p.y}`)
  return i.overKey.split('#')[1]!
}

async function oversOfH1V1(page: Page): Promise<string[]> {
  const out: string[] = []
  for (const [r, c] of CELLS) out.push(await overAt(page, h1v1(r, c)))
  return out
}

async function clientAt(page: Page, world: XY, offset: XY = { x: 0, y: 0 }): Promise<XY> {
  const c = await toClient(page, world)
  return { x: Math.round(c.x + offset.x), y: Math.round(c.y + offset.y) }
}

async function start(page: Page): Promise<void> {
  await seed(page, weave())
  await setCamera(page, CAMERA)
  await page.keyboard.press('x')
  await expect(page.getByRole('toolbar', { name: 'Crossing options' })).toBeVisible()
  await nextFrame(page)
}

test.describe('crossing tool (mouse)', () => {
  test.skip(({ isMobile }) => isMobile, 'mouse tests run in the desktop projects')

  test('all instances flips every cell; this occurrence overrides one; toggling back removes the root record', async ({ page }) => {
    await start(page)
    expect(await oversOfH1V1(page)).toEqual(Array(9).fill('v1')) // paint order: verticals over
    await expect(page.locator('.crossing-markers [data-crossing-class="eligible"]')).toHaveCount(36)
    await expect(page.locator('.crossing-markers [data-crossing-class="near-parallel"]')).toHaveCount(1)

    // Beyond the 12 px mouse radius: nothing happens.
    const far = await clientAt(page, h1v1(0, 0), { x: -16, y: 0 })
    await page.mouse.click(far.x, far.y)
    expect(await history(page)).toEqual({ past: 0, future: 0 })

    // "All instances" (the default), tapped 8 px off the centre of cell (0,0).
    await expect(page.getByRole('button', { name: 'All instances' })).toHaveAttribute('aria-pressed', 'true')
    const near = await clientAt(page, h1v1(0, 0), { x: -8, y: 0 })
    await page.mouse.click(near.x, near.y)
    expect(await oversOfH1V1(page)).toEqual(Array(9).fill('h1'))
    expect(await overAt(page, { x: 40, y: 40 })).toBe('v2') // h2×v2 untouched
    let p = await getProject(page)
    expect(p.motifs.mw!.crossings).toHaveLength(1)
    expect(p.crossings).toHaveLength(0)

    // Pixels at three cells: h1×v1 shows walnut (h1), h2×v2 still maple (v2).
    const scratch = await page.context().newPage()
    const raster = await rasterizeEditorBoard(page, scratch, 2)
    await scratch.close()
    await page.evaluate(() => window.__cbpd!.setTestFlags({ hideChrome: false }))
    await setCamera(page, CAMERA)
    const k = pxPerMmOf(raster, 170)
    for (const [r, c] of [[0, 0], [1, 2], [2, 1]] as const) {
      const at = h1v1(r, c)
      expect(colorEquals(pixelAt(raster, k, at), WALNUT, 3), `h1 over v1 in cell ${r},${c}`).toBe(true)
      expect(colorEquals(pixelAt(raster, k, { x: at.x + 20, y: at.y + 20 }), MAPLE, 3), `v2 over h2 in cell ${r},${c}`).toBe(true)
    }

    // "This occurrence" on cell (1,2): only that cell differs, badged as an override.
    await page.getByRole('button', { name: 'This occurrence' }).click()
    const cell12 = await clientAt(page, h1v1(1, 2))
    await page.mouse.click(cell12.x, cell12.y)
    expect(await oversOfH1V1(page)).toEqual(CELLS.map(([r, c]) => (r === 1 && c === 2 ? 'v1' : 'h1')))
    await expect(page.locator('.crossing-markers [data-source="override"]')).toHaveCount(1)
    p = await getProject(page)
    expect(p.crossings).toHaveLength(1)

    // Toggling it back deletes the root record instead of shadowing the definition.
    await page.mouse.click(cell12.x, cell12.y)
    expect(await oversOfH1V1(page)).toEqual(Array(9).fill('h1'))
    expect(await page.evaluate(() => window.__cbpd!.getProject().crossings.length)).toBe(0)
    await expect(page.locator('.crossing-markers [data-source="override"]')).toHaveCount(0)
  })

  test('an unsupported marker shows its reason in the options bar', async ({ page }) => {
    await start(page)
    const before = await history(page)
    const at = await clientAt(page, { x: 50, y: 160 })
    await page.mouse.click(at.x, at.y)
    await expect(page.getByRole('toolbar', { name: 'Crossing options' }).getByRole('status')).toContainText('near-parallel')
    expect(await history(page)).toEqual(before)
  })

  test('keyboard: Tab to the band crossing list button and toggle', async ({ page }) => {
    await seed(page, weave())
    await setCamera(page, CAMERA)
    await page.evaluate(() => {
      const s = window.__cbpd!.getState()
      s.enterContext({ motifId: 'mw', path: [{ repeatId: 'rp', row: 0, column: 0 }] })
      s.select(['h1'])
    })
    const toggle = page.getByRole('button', { name: /^Under: toggle crossing with Maple at 20, 20$/ })
    await expect(toggle).toBeVisible()
    await page.getByLabel('Segment 1 angle').focus()
    await page.keyboard.press('Tab')
    await expect(toggle).toBeFocused()
    const before = await history(page)
    await page.keyboard.press('Enter')
    expect(await history(page)).toEqual({ past: before.past + 1, future: 0 })
    expect(await oversOfH1V1(page)).toEqual(Array(9).fill('h1'))
    await expect(page.getByRole('button', { name: /^Over: toggle crossing with Maple at 20, 20$/ })).toBeFocused()
  })
})

test.describe('crossing tool (touch)', () => {
  test.skip(({ isMobile }) => !isMobile, 'touch tests run in chromium-touch')

  test('a tap within the 22 px touch radius toggles the nearest crossing', async ({ page }) => {
    await start(page)
    const at = await clientAt(page, h1v1(0, 0), { x: -18, y: 0 })
    await page.touchscreen.tap(at.x, at.y)
    expect(await oversOfH1V1(page)).toEqual(Array(9).fill('h1'))
    expect(await history(page)).toEqual({ past: 1, future: 0 })
  })
})
