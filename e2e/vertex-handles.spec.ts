// SPEC §7.4 vertex and midpoint handles on a single selected Band/Region:
// vertex drag with snapping (one history entry), midpoint insert, and
// neighbour-merge delete; touch presses hit within 22 px. Camera 3 px/mm, so
// the 8 px snap tolerance is 2.67 mm.

import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import type { Band, Region } from '../src/domain/model.ts'
import { band, instance, project, region } from '../src/domain/test-builders.ts'
import type { XY } from './helpers.ts'
import { cameraShowing, expectClose, getProject, history, mouseDrag, seed, select, setCamera, toClient, Touch } from './helpers.ts'

/** b1 to edit (its end off the grid); b2 ends at the off-grid (151.7, 72.3); r1 for touch. */
const scene = project([
  band('b1', [[30, 40], [80, 40], [131.3, 40.2]]),
  band('b2', [[151.7, 72.3], [200, 72.3]]),
  region('r1', [[30, 90], [90, 90], [90, 130], [30, 130]]),
])

async function at(page: Page, world: XY): Promise<XY> {
  const c = await toClient(page, world)
  return { x: Math.round(c.x), y: Math.round(c.y) }
}

async function points(page: Page, id: string): Promise<Array<{ id: string } & XY>> {
  return ((await getProject(page)).objects[id] as Band | Region).points
}

function expectXY(actual: XY, expected: XY): void {
  expectClose(actual.x, expected.x, 1e-6)
  expectClose(actual.y, expected.y, 1e-6)
}

async function setup(page: Page, selected: string): Promise<void> {
  await seed(page, scene)
  await setCamera(page, cameraShowing({ x: 20, y: 20 }, { x: 40, y: 40 }, 3))
  await select(page, [selected])
}

test.describe('mouse', () => {
  test.skip(({ isMobile }) => isMobile, 'mouse tests run in the desktop projects')

  test('shows a handle per vertex and per segment midpoint, only for a single Band/Region', async ({ page }) => {
    await setup(page, 'b1')
    await expect(page.locator('[data-handle="vertex"]')).toHaveCount(3)
    await expect(page.locator('[data-handle="midpoint"]')).toHaveCount(2)
    await select(page, ['r1'])
    await expect(page.locator('[data-handle="vertex"]')).toHaveCount(4)
    await expect(page.locator('[data-handle="midpoint"]')).toHaveCount(4) // the closing segment too
    await select(page, ['b1', 'r1'])
    await expect(page.locator('[data-handle]')).toHaveCount(0)
  })

  test('a vertex drag snaps to another band’s endpoint and commits one history entry', async ({ page }) => {
    await setup(page, 'b1')
    const from = await at(page, { x: 131.3, y: 40.2 })
    const to = await at(page, { x: 151.7, y: 72.3 })
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(to.x, to.y, { steps: 8 })
    await expect(page.locator('.snap-guide[data-guide="point"]')).toBeVisible()
    await page.mouse.up()

    const pts = await points(page, 'b1')
    expect(pts.map((q) => q.id)).toEqual(['b10', 'b11', 'b12'])
    expectXY(pts[2]!, { x: 151.7, y: 72.3 })
    expectXY(pts[1]!, { x: 80, y: 40 })
    expect(await getProject(page).then((p) => p.objects['b2'])).toEqual(scene.objects['b2'])
    expect(await history(page)).toEqual({ past: 1, future: 0 })
    expect(await page.evaluate(() => window.__cbpd!.getState().selection)).toEqual(['b1'])
  })

  test('a midpoint drag inserts a vertex (snapped to the grid) in one history entry', async ({ page }) => {
    await setup(page, 'b1')
    const from = await at(page, { x: 55, y: 40 })
    const to = await at(page, { x: 55.3, y: 60.2 })
    await mouseDrag(page, from, to)

    const pts = await points(page, 'b1')
    expect(pts).toHaveLength(4)
    expect([pts[0]!.id, pts[2]!.id, pts[3]!.id]).toEqual(['b10', 'b11', 'b12'])
    expectXY(pts[1]!, { x: 55, y: 60 })
    expect(await history(page)).toEqual({ past: 1, future: 0 })
  })

  test('a tap on a midpoint handle changes nothing', async ({ page }) => {
    await setup(page, 'b1')
    const mid = await at(page, { x: 55, y: 40 })
    await page.mouse.click(mid.x, mid.y)
    expect(await points(page, 'b1')).toHaveLength(3)
    expect(await history(page)).toEqual({ past: 0, future: 0 })
  })

  for (const kind of ['vertex', 'midpoint'] as const) {
    test(`a pending inspector Width commits before a ${kind} handle drag, which then keeps it`, async ({ page }) => {
      await setup(page, 'b1')
      await page.getByLabel('Width', { exact: true }).fill('10') // previewed, not blurred
      expect(await history(page)).toEqual({ past: 0, future: 0 })
      const from = await at(page, kind === 'vertex' ? { x: 131.3, y: 40.2 } : { x: 55, y: 40 })
      await mouseDrag(page, from, { x: from.x, y: from.y + 60 })

      const b = (await getProject(page)).objects['b1'] as Band
      expect(b.widthMm).toBe(10)
      expect(b.points).toHaveLength(kind === 'vertex' ? 3 : 4)
      expect(await history(page)).toEqual({ past: 2, future: 0 }) // the width, then the drag
      await page.evaluate(() => window.__cbpd!.getState().undo())
      const undone = (await getProject(page)).objects['b1'] as Band
      expect(undone.widthMm).toBe(10)
      expect(undone.points).toEqual((scene.objects['b1'] as Band).points)
    })
  }

  test('a vertex dragged back to where it started commits nothing', async ({ page }) => {
    await setup(page, 'b1')
    const from = await at(page, { x: 80, y: 40 })
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(from.x + 40, from.y + 30, { steps: 4 })
    await page.mouse.move(from.x, from.y, { steps: 4 })
    await page.mouse.up()
    expect(await getProject(page)).toEqual(scene)
    expect(await history(page)).toEqual({ past: 0, future: 0 })
  })

  test('dropping a vertex within snap tolerance of its neighbour deletes it', async ({ page }) => {
    await setup(page, 'b1')
    const from = await at(page, { x: 80, y: 40 })
    // ≈ 1.4 mm from the neighbour (131.3, 40.2), inside the 2.67 mm tolerance; unmerged it would snap to the grid point (130, 40).
    const to = await at(page, { x: 130.3, y: 41.2 })
    await mouseDrag(page, from, to)

    const pts = await points(page, 'b1')
    expect(pts.map((q) => q.id)).toEqual(['b10', 'b12'])
    expectXY(pts[1]!, { x: 131.3, y: 40.2 })
    expect(await history(page)).toEqual({ past: 1, future: 0 })
  })
})

test.describe('touch', () => {
  test.skip(({ isMobile }) => !isMobile, 'touch tests run in chromium-touch')

  test('a touch press within 22 px of a vertex drags it', async ({ page }) => {
    await setup(page, 'r1')
    const vertex = await at(page, { x: 90, y: 90 })
    const from = { x: vertex.x + 18, y: vertex.y } // outside the 12 px mouse radius, inside 22 px
    const touch = await Touch.attach(page)
    await touch.start([from])
    await touch.slide(from, { x: from.x + 39, y: from.y + 27 }, 6)
    await touch.end()

    const pts = await points(page, 'r1')
    expectXY(pts[0]!, { x: 30, y: 90 })
    // The vertex goes to the finger: (90 + 6 + 13, 90 + 9) snaps to the grid point (110, 100).
    expectClose(pts[1]!.x, 110, 1e-6)
    expectClose(pts[1]!.y, 100, 1e-6)
    expect(await history(page)).toEqual({ past: 1, future: 0 })
  })
})

test.describe('inside a rotated, scaled edit context', () => {
  test.skip(({ isMobile }) => isMobile, 'mouse tests run in the desktop projects')

  // Instance i1 of motif m at (150, 100), rotated 30°, scale 1.5; entered, so
  // handles, snapping and the stored points are all in definition space.
  const place = { x: 150, y: 100, rotationDeg: 30, scale: 1.5 }
  const nested = project(
    [instance('i1', 'm', place)],
    [{ id: 'm', children: [band('a', [[0, 0], [20, 0]], { widthMm: 2 }), band('b', [[31.3, 10.7], [40, 17.3]], { widthMm: 2 })] }],
  )
  const world = (q: XY): XY => {
    const r = (place.rotationDeg * Math.PI) / 180
    return { x: place.x + place.scale * (q.x * Math.cos(r) - q.y * Math.sin(r)), y: place.y + place.scale * (q.x * Math.sin(r) + q.y * Math.cos(r)) }
  }
  const client = async (page: Page, q: XY): Promise<XY> => at(page, world(q))

  async function enter(page: Page): Promise<void> {
    await seed(page, nested)
    await setCamera(page, cameraShowing({ x: 120, y: 80 }, { x: 40, y: 40 }, 3))
    await page.evaluate(() => window.__cbpd!.getState().enterContext({ motifId: 'm', path: [{ instanceId: 'i1' }] }))
    await select(page, ['a'])
  }

  test('a vertex handle drag snaps onto a sibling’s off-grid endpoint in definition space', async ({ page }) => {
    await enter(page)
    await mouseDrag(page, await client(page, { x: 20, y: 0 }), await client(page, { x: 31.3, y: 10.7 }))
    const [p0, p1] = await points(page, 'a')
    expectXY(p0!, { x: 0, y: 0 })
    expectXY(p1!, { x: 31.3, y: 10.7 })
    expect(await history(page)).toEqual({ past: 1, future: 0 })
  })

  test('a move snaps the selection’s endpoint onto a sibling’s endpoint in definition space', async ({ page }) => {
    await enter(page)
    await mouseDrag(page, await client(page, { x: 5, y: 0 }), await client(page, { x: 5 + 11.3, y: 10.7 }))
    const [p0, p1] = await points(page, 'a')
    expectXY(p0!, { x: 11.3, y: 10.7 })
    expectXY(p1!, { x: 31.3, y: 10.7 })
    expect(await history(page)).toEqual({ past: 1, future: 0 })
  })
})
