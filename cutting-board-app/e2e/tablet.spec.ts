// SPEC §13 G7 (tablet gate): Playwright Chromium with CDP touch. Every
// assertion here runs only in the `chromium-touch` project (isMobile +
// hasTouch), like the touch half of `interaction-proof.spec.ts` — reuses the
// same `Touch` CDP driver and seeded project from `helpers.ts`. Taps are
// `page.touchscreen.tap`; multi-touch pan/pinch needs the CDP driver
// (Playwright has no multi-finger API).

import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import type { Band } from '../src/domain/model.ts'
import { project } from '../src/domain/test-builders.ts'
import type { XY } from './helpers.ts'
import { cameraShowing, getProject, history, nextFrame, seed, select, setCamera, toClient, Touch } from './helpers.ts'

test.describe('tablet gate (G7)', () => {
  test.skip(({ isMobile }) => !isMobile, 'G7 runs in chromium-touch (isMobile + hasTouch)')

  async function state<T>(page: Page, read: string): Promise<T> {
    return page.evaluate((expr) => new Function('s', `return ${expr}`)(window.__cbpd!.getState()) as T, read)
  }

  function round(p: XY): XY {
    return { x: Math.round(p.x), y: Math.round(p.y) }
  }

  test('tap, tap, Finish tap-creates a Band', async ({ page }) => {
    await seed(page, project([]))
    await setCamera(page, cameraShowing({ x: 0, y: 0 }, { x: 60, y: 120 }, 2))
    await page.getByRole('button', { name: 'Band', exact: true }).tap()

    const a = round(await toClient(page, { x: 20, y: 20 }))
    const b = round(await toClient(page, { x: 80, y: 20 }))
    await page.touchscreen.tap(a.x, a.y)
    await page.touchscreen.tap(b.x, b.y)
    await page.getByRole('button', { name: 'Finish' }).tap()

    const p = await getProject(page)
    expect(p.rootChildren).toHaveLength(1)
    const band = p.objects[p.rootChildren[0]!] as Band
    expect(band.type).toBe('band')
    expect(band.points).toHaveLength(2)
    expect(await history(page)).toEqual({ past: 1, future: 0 })
  })

  test('a tap selects an object', async ({ page }) => {
    await seed(page)
    const on = round(await toClient(page, { x: 80, y: 40 })) // on band b1
    await page.touchscreen.tap(on.x, on.y)
    expect(await state<string[]>(page, 's.selection')).toEqual(['b1'])
    expect(await history(page)).toEqual({ past: 0, future: 0 })
  })

  test('a one-finger drag of a selected object commits one history entry', async ({ page }) => {
    await seed(page)
    await select(page, ['b1'])
    const before = await getProject(page)
    const touch = await Touch.attach(page)
    const on = round(await toClient(page, { x: 55, y: 40 })) // clear of b1's vertex/midpoint handles
    await touch.start([on])
    await touch.slide(on, { x: on.x + 40, y: on.y + 20 }, 6)
    await touch.end([])
    await nextFrame(page)

    expect(await history(page)).toEqual({ past: 1, future: 0 })
    expect(await getProject(page)).not.toEqual(before)
  })

  test('touchcancel mid-drag leaves project and history unchanged', async ({ page }) => {
    await seed(page)
    await select(page, ['b1'])
    const before = await getProject(page)
    const touch = await Touch.attach(page)
    const on = round(await toClient(page, { x: 55, y: 40 }))
    await touch.start([on])
    await touch.slide(on, { x: on.x + 60, y: on.y + 30 }, 6)
    expect(await state<unknown>(page, 's.preview')).not.toBeNull() // the drag really was live
    await touch.cancel()
    await nextFrame(page)

    expect(await getProject(page)).toEqual(before)
    expect(await history(page)).toEqual({ past: 0, future: 0 })
    expect(await state<unknown>(page, 's.preview')).toBeNull()
  })

  test('two-finger pan then pinch changes the camera and never the page', async ({ page }) => {
    await seed(page)
    const before = await getProject(page)
    const cam0 = await state<{ x: number; y: number; zoom: number }>(page, 's.camera')

    const touch = await Touch.attach(page)
    const centre = { x: 500, y: 400 }
    const halfStart = 100
    let f1 = { x: centre.x - halfStart, y: centre.y }
    let f2 = { x: centre.x + halfStart, y: centre.y }
    await touch.start([f1, f2])

    // Pan: both fingers slide by the same delta, so the distance between them (and so the zoom) is unchanged.
    const panSteps = 6
    const panDelta = { x: 60, y: 40 }
    for (let k = 1; k <= panSteps; k++) {
      const t = k / panSteps
      await touch.move([
        { x: f1.x + panDelta.x * t, y: f1.y + panDelta.y * t },
        { x: f2.x + panDelta.x * t, y: f2.y + panDelta.y * t },
      ])
    }
    f1 = { x: f1.x + panDelta.x, y: f1.y + panDelta.y }
    f2 = { x: f2.x + panDelta.x, y: f2.y + panDelta.y }
    await nextFrame(page)
    const camAfterPan = await state<{ x: number; y: number; zoom: number }>(page, 's.camera')
    expect(camAfterPan).not.toEqual(cam0) // panned
    expect(camAfterPan.zoom).toBeCloseTo(cam0.zoom, 6) // a pure pan does not zoom

    // Pinch out: fingers move apart symmetrically about their current centroid.
    const pinchSteps = 6
    const halfEnd = 180
    for (let k = 1; k <= pinchSteps; k++) {
      const t = k / pinchSteps
      const h = halfStart + (halfEnd - halfStart) * t
      const cx = (f1.x + f2.x) / 2
      const cy = (f1.y + f2.y) / 2
      await touch.move([{ x: cx - h, y: cy }, { x: cx + h, y: cy }])
    }
    await touch.end([])
    await nextFrame(page)

    const camAfterPinch = await state<{ x: number; y: number; zoom: number }>(page, 's.camera')
    expect(camAfterPinch.zoom).toBeGreaterThan(camAfterPan.zoom) // pinched out: zoomed in

    // The gesture is camera-only: project and history are untouched.
    expect(await getProject(page)).toEqual(before)
    expect(await history(page)).toEqual({ past: 0, future: 0 })

    // SPEC §7.2/§13: touch-action: none and the disabled-zoom viewport meta keep the
    // browser itself from panning/zooming the page — only the app's camera moves.
    const page1 = await page.evaluate(() => ({ scrollY: window.scrollY, vvScale: window.visualViewport?.scale }))
    expect(page1.scrollY).toBe(0)
    expect(page1.vvScale).toBe(1)
  })

  test('Add to selection toggled on, then two taps, selects two objects', async ({ page }) => {
    await seed(page)
    const toggle = page.getByRole('button', { name: 'Add to selection', exact: true })
    await toggle.tap()
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')

    const onBand = round(await toClient(page, { x: 80, y: 40 })) // b1
    const onRegion = round(await toClient(page, { x: 60, y: 95 })) // r1
    await page.touchscreen.tap(onBand.x, onBand.y)
    await page.touchscreen.tap(onRegion.x, onRegion.y)

    const sel = await state<string[]>(page, 's.selection')
    expect(new Set(sel)).toEqual(new Set(['b1', 'r1']))
    expect(sel).toHaveLength(2)
  })

  test('every rail button meets the 44×44 px touch target', async ({ page }) => {
    await seed(page)
    const buttons = page.locator('.toolbar button')
    const count = await buttons.count()
    expect(count).toBeGreaterThan(0)
    const undersized: string[] = []
    for (let k = 0; k < count; k++) {
      const btn = buttons.nth(k)
      const box = await btn.boundingBox()
      const label = (await btn.getAttribute('aria-label')) ?? (await btn.innerText())
      if (box === null || box.width < 44 || box.height < 44) undersized.push(`${label} (${box?.width}×${box?.height})`)
    }
    expect(undersized, `rail buttons under 44×44 px: ${undersized.join(', ')}`).toEqual([])
  })

  test('the selection outline draws both strokes', async ({ page }) => {
    await seed(page)
    await select(page, ['b1'])
    await nextFrame(page)
    const strokes = await page.locator('.selection-overlay rect').evaluateAll((els) => els.map((el) => el.getAttribute('stroke')))
    expect(new Set(strokes)).toEqual(new Set(['#1a1a1a', '#ffffff']))
  })
})
