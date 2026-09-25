// SPEC §7.4 Select tool behaviour on top of the §15 proof: press-drag of an
// unselected object, taps inside a selected object's bounds, Shift-marquee
// and Shift-drag. Presses are decided by domain geometry, not by proxies.

import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import type { Band } from '../src/domain/model.ts'
import { band, project } from '../src/domain/test-builders.ts'
import type { XY } from './helpers.ts'
import { expectClose, getProject, history, mouseDrag, seed, select, snapOff, toClient, Touch } from './helpers.ts'

async function selection(page: Page): Promise<string[]> {
  return page.evaluate(() => window.__cbpd!.getState().selection)
}

async function zoom(page: Page): Promise<number> {
  return page.evaluate(() => window.__cbpd!.getState().camera.zoom)
}

async function at(page: Page, world: XY): Promise<XY> {
  const c = await toClient(page, world)
  return { x: Math.round(c.x), y: Math.round(c.y) }
}

async function firstX(page: Page, id: string): Promise<number> {
  return ((await getProject(page)).objects[id] as Band).points[0]!.x
}

/** A diagonal band `a` whose bounds (40..160 × 150..250, ±3) are mostly empty, and a short band `b` inside them. */
const nested = project([band('a', [[40, 150], [160, 250]]), band('b', [[120, 160], [150, 160]])])

test.describe('mouse', () => {
  test.skip(({ isMobile }) => isMobile, 'mouse tests run in the desktop projects')

  test('press-and-drag an unselected band selects and moves it in one gesture', async ({ page }) => {
    await seed(page)
    await snapOff(page)
    const x0 = await firstX(page, 'b1')
    const from = await at(page, { x: 50, y: 40 })
    await mouseDrag(page, from, { x: from.x + 40, y: from.y })
    expect(await selection(page)).toEqual(['b1'])
    // Task 10's three-column layout changes the default fitView() zoom, which shifts this
    // mouse-pixel round trip into a different (still sub-micron) floating-point rounding case.
    expectClose((await firstX(page, 'b1')) - x0, 40 / (await zoom(page)), 1e-4)
    expect(await history(page)).toEqual({ past: 1, future: 0 })
  })

  test('taps inside a selected object’s bounds re-select from domain geometry', async ({ page }) => {
    await seed(page, nested)
    await select(page, ['a'])
    const onB = await at(page, { x: 135, y: 160 })
    await page.mouse.click(onB.x, onB.y)
    expect(await selection(page)).toEqual(['b'])

    await select(page, ['a'])
    const emptyInA = await at(page, { x: 60, y: 240 })
    await page.mouse.click(emptyInA.x, emptyInA.y)
    expect(await selection(page)).toEqual([])

    // Shift-tap on a selected object removes it.
    await select(page, ['a', 'b'])
    await page.keyboard.down('Shift')
    await page.mouse.click(onB.x, onB.y)
    await page.keyboard.up('Shift')
    expect(await selection(page)).toEqual(['a'])
    expect(await history(page)).toEqual({ past: 0, future: 0 })
  })

  test('a press on empty space inside a selected object’s bounds starts a marquee', async ({ page }) => {
    await seed(page, nested)
    await select(page, ['a'])
    const p0 = await getProject(page)
    const from = await at(page, { x: 110, y: 155 }) // empty, inside a's bounds
    const to = await at(page, { x: 125, y: 170 })
    await mouseDrag(page, from, to)
    // A marquee, not a drag of `a`: it selects by painted bounds, which includes `a` itself.
    expect((await selection(page)).toSorted()).toEqual(['a', 'b'])
    expect(await getProject(page)).toEqual(p0)
    expect(await history(page)).toEqual({ past: 0, future: 0 })

    // Same inside a multi-selection's group box: no group drag starts.
    await mouseDrag(page, await at(page, { x: 60, y: 240 }), await at(page, { x: 75, y: 245 }))
    expect(await getProject(page)).toEqual(p0)
    expect(await history(page)).toEqual({ past: 0, future: 0 })
    expect(await selection(page)).toEqual(['a'])
  })

  test('Shift-marquee toggles each hit object once', async ({ page }) => {
    await seed(page)
    await select(page, ['b1'])
    const marquee = async (from: XY, to: XY): Promise<void> => {
      await page.keyboard.down('Shift')
      await mouseDrag(page, await at(page, from), await at(page, to))
      await page.keyboard.up('Shift')
    }
    await marquee({ x: 20, y: 60 }, { x: 40, y: 80 }) // over r1 only
    expect(await selection(page)).toEqual(['b1', 'r1'])
    await marquee({ x: 20, y: 25 }, { x: 40, y: 50 }) // over b1 only
    expect(await selection(page)).toEqual(['r1'])
  })

  test('the rotate handle turns in 15° steps with Shift held (SPEC §7.3)', async ({ page }) => {
    await seed(page)
    await snapOff(page)
    await select(page, ['b1'])
    const angle = async (): Promise<number> => {
      const [a, b] = ((await getProject(page)).objects['b1'] as Band).points
      return (Math.atan2(b!.y - a!.y, b!.x - a!.x) * 180) / Math.PI
    }
    const rot = (await page.locator('.moveable-rotation-control').boundingBox())!
    const handle = { x: Math.round(rot.x + rot.width / 2), y: Math.round(rot.y + rot.height / 2) }
    const to = { x: handle.x + 97, y: handle.y + 41 }

    await mouseDrag(page, handle, to)
    const free = await angle()
    expect(Math.abs(free - Math.round(free / 15) * 15)).toBeGreaterThan(0.5)
    await page.evaluate(() => window.__cbpd!.getState().undo())

    await page.keyboard.down('Shift')
    await mouseDrag(page, handle, to)
    await page.keyboard.up('Shift')
    const stepped = await angle()
    expectClose(stepped, Math.round(free / 15) * 15, 1e-6)
    expect(await history(page)).toEqual({ past: 1, future: 0 })
  })

  test('Shift-drag on a selected object drags the selection and keeps it', async ({ page }) => {
    await seed(page)
    await select(page, ['b1', 'r1'])
    await snapOff(page)
    const b0 = await firstX(page, 'b1')
    const r0 = ((await getProject(page)).objects['r1'] as Band).points[0]!.x
    const from = await at(page, { x: 50, y: 40 })
    await page.keyboard.down('Shift')
    await mouseDrag(page, from, { x: from.x + 30, y: from.y })
    await page.keyboard.up('Shift')
    const z = await zoom(page)
    expect(await selection(page)).toEqual(['b1', 'r1'])
    // See the tolerance note above: Task 10's layout shifts the default fitView() zoom.
    expectClose((await firstX(page, 'b1')) - b0, 30 / z, 1e-4)
    expectClose(((await getProject(page)).objects['r1'] as Band).points[0]!.x - r0, 30 / z, 1e-4)
    expect(await history(page)).toEqual({ past: 1, future: 0 })
    await expect(page.locator('.selecto-selection')).toBeHidden()
  })
})

test.describe('touch', () => {
  test.skip(({ isMobile }) => !isMobile, 'touch tests run in chromium-touch')

  test('press-and-drag an unselected band with one finger selects and moves it', async ({ page }) => {
    await seed(page)
    await snapOff(page)
    const x0 = await firstX(page, 'b1')
    const touch = await Touch.attach(page)
    const from = await at(page, { x: 50, y: 40 })
    await touch.start([from])
    await touch.slide(from, { x: from.x + 40, y: from.y }, 5)
    await touch.end([])
    expect(await selection(page)).toEqual(['b1'])
    expectClose((await firstX(page, 'b1')) - x0, 40 / (await zoom(page)), 1e-6)
    expect(await history(page)).toEqual({ past: 1, future: 0 })
  })
})
