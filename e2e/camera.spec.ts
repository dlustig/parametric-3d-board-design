// Regression for use-gesture's delayed `last` replay (Task 23): wheel and
// wheel-driven pinch have no native end event, so use-gesture re-emits their
// state from a 140 ms `wheelEnd` timeout. The camera handlers must ignore that
// replay. Each test waits well past the timeout (250 ms) on purpose: the bug is
// a late write, so the assertion is that nothing happens afterwards.

import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import type { Camera } from './helpers.ts'
import { cameraShowing, expectClose, seed } from './helpers.ts'

const SETTLE_MS = 250 // > use-gesture's 140 ms wheelEnd timeout (@use-gesture/core 10.3.1)

async function camera(page: Page): Promise<Camera> {
  return page.evaluate(() => window.__cbpd!.getState().camera)
}

test.describe('camera: no delayed wheel-end replay', () => {
  test.skip(({ isMobile }) => isMobile, 'mouse wheel tests run in the desktop projects')

  test('one plain wheel notch pans exactly one notch', async ({ page }) => {
    await seed(page)
    await page.mouse.move(500, 400)
    const cam0 = await camera(page)
    await page.mouse.wheel(30, 80)
    await expect.poll(async () => (await camera(page)).y).not.toBe(cam0.y)
    await page.waitForTimeout(SETTLE_MS)
    const cam1 = await camera(page)
    expect(cam1.zoom).toBe(cam0.zoom)
    expectClose(cam1.x, cam0.x + 30 / cam0.zoom, 1e-9)
    expectClose(cam1.y, cam0.y + 80 / cam0.zoom, 1e-9)
  })

  test('a camera change right after a Ctrl+wheel zoom is not undone', async ({ page }) => {
    await seed(page)
    await page.mouse.move(500, 400)
    const cam0 = await camera(page)
    await page.keyboard.down('Control')
    await page.mouse.wheel(0, -100)
    await page.keyboard.up('Control')
    // Set the camera within the replay window (one evaluate, a few ms), then outlast it.
    const target = cameraShowing({ x: 80, y: 40 }, { x: 400, y: 300 }, 2)
    const zoomed = await page.evaluate((c) => {
      const s = window.__cbpd!.getState()
      const z = s.camera
      s.setCamera(c)
      return z
    }, target)
    expect(zoomed.zoom).toBeGreaterThan(cam0.zoom) // the zoom really happened first
    await page.waitForTimeout(SETTLE_MS)
    expect(await camera(page)).toEqual(target)
  })

  test('a middle-button pan right after a Ctrl+wheel zoom is not undone', async ({ page }) => {
    await seed(page)
    await page.mouse.move(500, 400)
    await page.keyboard.down('Control')
    await page.mouse.wheel(0, -100)
    await page.keyboard.up('Control')
    const zoomed = await camera(page)
    await page.mouse.down({ button: 'middle' })
    await page.mouse.move(540, 420)
    await page.mouse.up({ button: 'middle' })
    await page.waitForTimeout(SETTLE_MS)
    const cam = await camera(page)
    expect(cam.zoom).toBe(zoomed.zoom)
    expectClose(cam.x, zoomed.x - 40 / zoomed.zoom, 1e-9)
    expectClose(cam.y, zoomed.y - 20 / zoomed.zoom, 1e-9)
  })
})
