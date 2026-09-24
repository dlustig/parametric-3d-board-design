// SPEC §7.4 drawing tools and §7.7 snapping, end to end: mouse placement and
// Finish, typed Length/Angle, double-click finish, and touch taps with a
// two-finger pan mid-draw. The camera is 2 px/mm, so the 8 px snap tolerance
// is 4 mm and every free tap lands on the 5 mm grid.

import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import type { Band, Region } from '../src/domain/model.ts'
import { project } from '../src/domain/test-builders.ts'
import type { XY } from './helpers.ts'
import { cameraShowing, expectClose, getProject, history, nextFrame, seed, setCamera, toClient, Touch } from './helpers.ts'

async function start(page: Page, tool: 'Band' | 'Polygon' | 'Rectangle'): Promise<void> {
  await seed(page, project([]))
  await setCamera(page, cameraShowing({ x: 0, y: 0 }, { x: 60, y: 120 }, 2))
  await page.getByRole('button', { name: tool, exact: true }).click()
}

async function at(page: Page, world: XY): Promise<XY> {
  const c = await toClient(page, world)
  return { x: Math.round(c.x), y: Math.round(c.y) }
}

async function drawnPoints(page: Page): Promise<XY[]> {
  return page.evaluate(() => window.__cbpd!.getState().drawing?.points ?? [])
}

async function onlyBand(page: Page): Promise<Band> {
  const p = await getProject(page)
  expect(p.rootChildren).toHaveLength(1)
  const b = p.objects[p.rootChildren[0]!]!
  expect(b.type).toBe('band')
  return b as Band
}

function expectPoints(actual: XY[], expected: XY[], tol = 1e-6): void {
  expect(actual).toHaveLength(expected.length)
  actual.forEach((p, k) => {
    expectClose(p.x, expected[k]!.x, tol)
    expectClose(p.y, expected[k]!.y, tol)
  })
}

test.describe('mouse', () => {
  test.skip(({ isMobile }) => isMobile, 'mouse tests run in the desktop projects')

  test('two clicks and Finish draw one band in one history entry', async ({ page }) => {
    await start(page, 'Band')
    const a = await at(page, { x: 50.8, y: 49.3 })
    const b = await at(page, { x: 99.2, y: 50.6 })
    await page.mouse.click(a.x, a.y)
    await page.mouse.click(b.x, b.y)
    await page.getByRole('button', { name: 'Finish' }).click()

    const band = await onlyBand(page)
    expectPoints(band.points, [{ x: 50, y: 50 }, { x: 100, y: 50 }]) // snapped to the grid
    expect(band.closed).toBe(false)
    expect(band.widthMm).toBe(6.35)
    expect(await history(page)).toEqual({ past: 1, future: 0 })
    expect(await page.evaluate(() => window.__cbpd!.getState().drawing)).toBeNull()
  })

  test('typed Length 4 and Angle 30 place the next point from the last one', async ({ page }) => {
    await start(page, 'Band')
    const a = await at(page, { x: 50, y: 50 })
    await page.mouse.click(a.x, a.y)
    await page.getByLabel('Length').fill('4')
    await page.getByLabel('Angle').fill('30')
    await page.getByLabel('Angle').press('Enter')

    // 4·(cos 30°, sin 30°) = (3.4641…, 2) in y-down space.
    expectPoints(await drawnPoints(page), [{ x: 50, y: 50 }, { x: 50 + 2 * Math.sqrt(3), y: 52 }])
    await page.getByRole('button', { name: 'Finish' }).click()
    expectPoints((await onlyBand(page)).points, [{ x: 50, y: 50 }, { x: 50 + 2 * Math.sqrt(3), y: 52 }])
    expect(await history(page)).toEqual({ past: 1, future: 0 })
  })

  test('a double-click finishes without a duplicate point', async ({ page }) => {
    await start(page, 'Band')
    for (const w of [{ x: 50, y: 50 }, { x: 100, y: 50 }]) {
      const c = await at(page, w)
      await page.mouse.click(c.x, c.y)
    }
    const c = await at(page, { x: 100, y: 100 })
    await page.mouse.dblclick(c.x, c.y)

    expectPoints((await onlyBand(page)).points, [{ x: 50, y: 50 }, { x: 100, y: 50 }, { x: 100, y: 100 }])
    expect(await history(page)).toEqual({ past: 1, future: 0 })
  })

  test('a band tapped back onto its first point becomes closed', async ({ page }) => {
    await start(page, 'Band')
    for (const w of [{ x: 50, y: 50 }, { x: 100, y: 50 }, { x: 100, y: 100 }, { x: 51, y: 49 }]) {
      const c = await at(page, w)
      await page.mouse.click(c.x, c.y)
    }
    const band = await onlyBand(page)
    expect(band.closed).toBe(true)
    expectPoints(band.points, [{ x: 50, y: 50 }, { x: 100, y: 50 }, { x: 100, y: 100 }])
    expect(await history(page)).toEqual({ past: 1, future: 0 })
  })

  test('with two points, a tap on the first point adds no point on top of it', async ({ page }) => {
    await start(page, 'Band')
    for (const w of [{ x: 50, y: 50 }, { x: 100, y: 50 }, { x: 51, y: 49 }]) {
      const c = await at(page, w)
      await page.mouse.click(c.x, c.y)
    }
    expectPoints(await drawnPoints(page), [{ x: 50, y: 50 }, { x: 100, y: 50 }])
    expect((await getProject(page)).rootChildren).toHaveLength(0)
  })

  test('a polygon closes on its first point; a rectangle drags corner to corner', async ({ page }) => {
    await start(page, 'Polygon')
    for (const w of [{ x: 50, y: 50 }, { x: 100, y: 50 }, { x: 100, y: 100 }, { x: 51, y: 51 }]) {
      const c = await at(page, w)
      await page.mouse.click(c.x, c.y)
      await page.waitForTimeout(350) // keep taps apart from double-tap detection
    }
    let p = await getProject(page)
    expect(p.rootChildren).toHaveLength(1)
    const polygon = p.objects[p.rootChildren[0]!]!
    expect(polygon.type).toBe('region')
    expectPoints((polygon as Region).points, [
      { x: 50, y: 50 },
      { x: 100, y: 50 },
      { x: 100, y: 100 },
    ])

    await page.getByRole('button', { name: 'Rectangle', exact: true }).click()
    const from = await at(page, { x: 20, y: 150 })
    const to = await at(page, { x: 60, y: 200 })
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(to.x, to.y, { steps: 6 })
    await page.mouse.up()
    p = await getProject(page)
    expect(p.rootChildren).toHaveLength(2)
    const rect = p.objects[p.rootChildren[1]!]!
    expect(rect.type).toBe('region')
    expectPoints((rect as Region).points, [{ x: 20, y: 150 }, { x: 60, y: 150 }, { x: 60, y: 200 }, { x: 20, y: 200 }])
    expect(await history(page)).toEqual({ past: 2, future: 0 })
  })
})

test.describe('touch', () => {
  test.skip(({ isMobile }) => !isMobile, 'touch tests run in chromium-touch (isMobile + hasTouch)')

  test('tap, tap, Finish draws a band', async ({ page }) => {
    await start(page, 'Band')
    for (const w of [{ x: 50, y: 50 }, { x: 100, y: 50 }]) {
      const c = await at(page, w)
      await page.touchscreen.tap(c.x, c.y)
    }
    await page.getByRole('button', { name: 'Finish' }).tap()
    expectPoints((await onlyBand(page)).points, [{ x: 50, y: 50 }, { x: 100, y: 50 }])
    expect(await history(page)).toEqual({ past: 1, future: 0 })
  })

  test('a finger lifted after a tool switch mid-press does not block later taps', async ({ page }) => {
    await start(page, 'Band')
    const touch = await Touch.attach(page)
    await touch.start([await at(page, { x: 80, y: 80 })])
    // Switch tools while the finger is still down, lift it with no draw listener bound, switch back.
    await page.getByRole('button', { name: 'Select', exact: true }).click()
    await touch.end([])
    await page.getByRole('button', { name: 'Band', exact: true }).click()

    const a = await at(page, { x: 50, y: 50 })
    await page.touchscreen.tap(a.x, a.y)
    expectPoints(await drawnPoints(page), [{ x: 50, y: 50 }])
  })

  test('a two-finger pan/pinch mid-draw places no point', async ({ page }) => {
    await start(page, 'Band')
    const a = await at(page, { x: 50, y: 50 })
    await page.touchscreen.tap(a.x, a.y)
    expect(await drawnPoints(page)).toHaveLength(1)
    const camera0 = await page.evaluate(() => window.__cbpd!.getState().camera)

    const touch = await Touch.attach(page)
    const f1 = await at(page, { x: 80, y: 80 })
    const f2 = { x: f1.x + 80, y: f1.y }
    await touch.start([f1])
    await touch.start([f1, f2])
    // The first finger stays put, so only the second-pointer rule (not tap slop) can stop it becoming a point.
    for (let k = 1; k <= 6; k++) await touch.move([f1, { x: f2.x + 8 * k, y: f2.y + 5 * k }])
    await touch.end([{ x: f2.x + 48, y: f2.y + 30 }])
    await touch.end([])
    await nextFrame(page)

    expect(await drawnPoints(page)).toHaveLength(1)
    expect(await page.evaluate(() => window.__cbpd!.getState().camera)).not.toEqual(camera0)

    // No finger is left "down": the next tap still places a point.
    await page.waitForTimeout(350)
    const b = await at(page, { x: 100, y: 50 })
    await page.touchscreen.tap(b.x, b.y)
    expectPoints(await drawnPoints(page), [{ x: 50, y: 50 }, { x: 100, y: 50 }])
    expect(await history(page)).toEqual({ past: 0, future: 0 })
  })
})
