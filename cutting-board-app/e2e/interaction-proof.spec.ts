// SPEC §15: the Slice-1 interaction proof. Each assertion (a)–(j) is its own
// test. Mouse tests run in chromium/firefox/webkit; touch tests (f, g-touch,
// j) run in chromium-touch through CDP Input.dispatchTouchEvent.

import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import type { Band, MotifInstance, Project } from '../src/domain/model.ts'
import { objectBounds } from '../src/geometry/bounds.ts'
import type { XY } from './helpers.ts'
import {
  cameraShowing,
  expectClose,
  getProject,
  history,
  moveableBox,
  mouseDrag,
  nextFrame,
  seed,
  seededProject,
  select,
  setCamera,
  snapOff,
  toClient,
  toWorld,
  Touch,
} from './helpers.ts'

function bandPoints(p: Project, id: string): Array<{ x: number; y: number }> {
  return (p.objects[id] as Band).points.map(({ x, y }) => ({ x, y }))
}

function round(p: XY): XY {
  return { x: Math.round(p.x), y: Math.round(p.y) }
}

async function state<T>(page: Page, read: string): Promise<T> {
  return page.evaluate((expr) => new Function('s', `return ${expr}`)(window.__cbpd!.getState()) as T, read)
}

/** SPEC §15(b): Moveable's box vs the object's domain bounds projected through the CTM, ±1 px. */
async function expectBoxMatchesDomain(page: Page, id: string): Promise<void> {
  await nextFrame(page)
  const box = objectBounds(await getProject(page), id)!
  const tl = await toClient(page, { x: box.minX, y: box.minY })
  const br = await toClient(page, { x: box.maxX, y: box.maxY })
  const mv = await moveableBox(page)
  expectClose(mv.left, tl.x, 1)
  expectClose(mv.top, tl.y, 1)
  expectClose(mv.right, br.x, 1)
  expectClose(mv.bottom, br.y, 1)
}

test.describe('mouse', () => {
  test.skip(({ isMobile }) => isMobile, 'mouse assertions run in the desktop projects')

  test('(a) drag N px commits Δ = N/zoom mm through getScreenCTM at zoom 0.5, 1, 7.3 with a panned camera', async ({ page }) => {
    for (const zoom of [0.5, 1, 7.3]) {
      await seed(page)
      await setCamera(page, cameraShowing({ x: 80, y: 40 }, { x: 437.3, y: 311.7 }, zoom))
      await select(page, ['b1'])
      const before = bandPoints(await getProject(page), 'b1')
      const start = round(await toClient(page, { x: 80, y: 40 }))
      const end = { x: start.x + 60, y: start.y - 25 }
      await mouseDrag(page, start, end)
      const after = bandPoints(await getProject(page), 'b1')
      const w0 = await toWorld(page, start)
      const w1 = await toWorld(page, end)
      for (const [k, p] of after.entries()) {
        expectClose(p.x - before[k]!.x, 60 / zoom, 1e-6)
        expectClose(p.y - before[k]!.y, -25 / zoom, 1e-6)
        expectClose(p.x - before[k]!.x, w1.x - w0.x, 1e-6)
        expectClose(p.y - before[k]!.y, w1.y - w0.y, 1e-6)
      }
      expect(await history(page)).toEqual({ past: 1, future: 0 })
    }
  })

  test('(b) Moveable box equals projected domain bounds after commit, undo, redo, zoom, resize', async ({ page }) => {
    await seed(page)
    await select(page, ['i1'])
    await expectBoxMatchesDomain(page, 'i1')

    const start = round(await toClient(page, { x: 209.96, y: 95.75 })) // on the instance's first band: definition (11.5, 0) rotated 30° about (200, 90)
    await mouseDrag(page, start, { x: start.x + 40, y: start.y + 30 })
    expect(await history(page)).toEqual({ past: 1, future: 0 })
    await expectBoxMatchesDomain(page, 'i1')

    await page.evaluate(() => window.__cbpd!.getState().undo())
    await expectBoxMatchesDomain(page, 'i1')
    await page.evaluate(() => window.__cbpd!.getState().redo())
    await expectBoxMatchesDomain(page, 'i1')

    await page.getByRole('button', { name: 'Zoom in' }).click()
    await expectBoxMatchesDomain(page, 'i1')
    await page.mouse.move(500, 400)
    await page.keyboard.down('Control')
    await page.mouse.wheel(0, -120)
    await page.keyboard.up('Control')
    await expectBoxMatchesDomain(page, 'i1')

    await page.setViewportSize({ width: 820, height: 640 })
    await expectBoxMatchesDomain(page, 'i1')
  })

  test('(c) no SVG element or proxy carries a transform attribute or style.transform', async ({ page }) => {
    await seed(page)
    await select(page, ['i1', 'b1'])
    const transformed = (): Promise<string[]> =>
      page.evaluate(() =>
        [document.querySelector('svg.canvas-svg')!, ...document.querySelectorAll('svg.canvas-svg *')]
          .filter((el) => el.hasAttribute('transform') || (el as SVGElement).style.transform !== '')
          .map((el) => el.outerHTML.slice(0, 80)),
      )
    expect(await transformed()).toEqual([])

    // Mid-drag, after commit, after a rotate, and after zoom.
    const start = round(await toClient(page, { x: 80, y: 40 }))
    await page.mouse.move(start.x, start.y)
    await page.mouse.down()
    await page.mouse.move(start.x + 30, start.y + 20, { steps: 5 })
    expect(await transformed()).toEqual([])
    await page.mouse.up()
    const rot = await page.locator('.moveable-rotation-control').boundingBox()
    await mouseDrag(page, round({ x: rot!.x + rot!.width / 2, y: rot!.y + rot!.height / 2 }), round({ x: rot!.x + 120, y: rot!.y + 80 }))
    await page.getByRole('button', { name: 'Zoom in' }).click()
    expect(await transformed()).toEqual([])
    expect(await history(page)).toEqual({ past: 2, future: 0 })
  })

  test('(d) 20 drag+undo cycles return a deep-equal project', async ({ page }) => {
    await seed(page)
    await select(page, ['b1'])
    const original = await getProject(page)
    for (let k = 0; k < 20; k++) {
      const start = round(await toClient(page, { x: 80, y: 40 }))
      await mouseDrag(page, start, { x: start.x + 13 + k, y: start.y + 7 - k }, 3)
      expect(await history(page)).toEqual({ past: 1, future: 0 })
      await page.evaluate(() => window.__cbpd!.getState().undo())
      expect(await history(page)).toEqual({ past: 0, future: 1 })
    }
    expect(await getProject(page)).toEqual(original)
  })

  test('(e) history +1 per gesture, +0 for click-without-move', async ({ page }) => {
    await seed(page)
    await select(page, ['b1'])
    const p0 = await getProject(page)
    const onBand = round(await toClient(page, { x: 80, y: 40 }))

    await page.mouse.click(onBand.x, onBand.y) // selected object, no move
    expect(await history(page)).toEqual({ past: 0, future: 0 })
    expect(await getProject(page)).toEqual(p0)
    expect(await state<string[]>(page, 's.selection')).toEqual(['b1'])

    await mouseDrag(page, onBand, { x: onBand.x + 25, y: onBand.y })
    expect(await history(page)).toEqual({ past: 1, future: 0 })

    const rot = await page.locator('.moveable-rotation-control').boundingBox()
    const h = round({ x: rot!.x + rot!.width / 2, y: rot!.y + rot!.height / 2 })
    await page.mouse.click(h.x, h.y) // rotation handle, no move
    expect(await history(page)).toEqual({ past: 1, future: 0 })
    await mouseDrag(page, h, { x: h.x + 60, y: h.y + 40 })
    expect(await history(page)).toEqual({ past: 2, future: 0 })

    const empty = round(await toClient(page, { x: 250, y: 200 }))
    await page.mouse.click(empty.x, empty.y) // empty space: deselects, no history
    expect(await history(page)).toEqual({ past: 2, future: 0 })
    expect(await state<string[]>(page, 's.selection')).toEqual([])
    expect(await state<unknown>(page, 's.preview')).toBeNull()
  })

  test('(g) marquee over a rotated instance selects by domain bounds (mouse)', async ({ page }) => {
    await seed(page)
    const b = objectBounds(await getProject(page), 'i1')!
    // Overlaps the bounds' top-left corner, where the X-shaped instance paints nothing.
    const from = round(await toClient(page, { x: b.minX - 12, y: b.minY - 12 }))
    const into = round(await toClient(page, { x: b.minX + 4, y: b.minY + 4 }))
    await mouseDrag(page, from, into)
    expect(await state<string[]>(page, 's.selection')).toEqual(['i1'])

    await select(page, [])
    const short = round(await toClient(page, { x: b.minX - 2, y: b.minY - 2 }))
    await mouseDrag(page, from, short)
    expect(await state<string[]>(page, 's.selection')).toEqual([])
  })

  test('(h) drag inside a rotated, mirrored, 1.5× edit context moves the child by the inverse-mapped delta', async ({ page }) => {
    await seed(page, seededProject({ x: 200, y: 90, rotationDeg: 30, mirrorX: true, scale: 1.5 }))
    await page.evaluate(() => window.__cbpd!.getState().enterContext({ motifId: 'm1', path: [{ instanceId: 'i1' }] }))
    const zoom = 2
    await setCamera(page, cameraShowing({ x: 200, y: 90 }, { x: 500, y: 380 }, zoom))
    await select(page, ['mb1'])
    await snapOff(page)
    const before = bandPoints(await getProject(page), 'mb1')

    // A point on mb1 at definition (28, 0): world = T·R(30)·S(1.5)·Mx · (28, 0).
    const c = Math.cos(Math.PI / 6)
    const s = Math.sin(Math.PI / 6)
    const onChild = round(await toClient(page, { x: 200 - 1.5 * 28 * c, y: 90 - 1.5 * 28 * s }))
    const n = { x: 50, y: 20 }
    await mouseDrag(page, onChild, { x: onChild.x + n.x, y: onChild.y + n.y })

    // Δdef = Mx · S(1/1.5) · R(−30) · Δworld
    const dw = { x: n.x / zoom, y: n.y / zoom }
    const r = { x: c * dw.x + s * dw.y, y: -s * dw.x + c * dw.y }
    const expected = { x: -r.x / 1.5, y: r.y / 1.5 }
    const after = bandPoints(await getProject(page), 'mb1')
    for (const [k, p] of after.entries()) {
      expectClose(p.x - before[k]!.x, expected.x, 1e-6)
      expectClose(p.y - before[k]!.y, expected.y, 1e-6)
    }
    expect((await getProject(page)).objects['i1'] as MotifInstance).toEqual(seededProject({ x: 200, y: 90, rotationDeg: 30, mirrorX: true, scale: 1.5 }).objects['i1'])
    expect(await history(page)).toEqual({ past: 1, future: 0 })
  })

  test('(i) mouse drag works while use-gesture is bound (wheel, ctrl-wheel, middle and Space drags pan)', async ({ page }) => {
    await seed(page)
    await select(page, ['b1'])
    const cam0 = await state<{ x: number; y: number; zoom: number }>(page, 's.camera')

    // Plain wheel pans.
    await page.mouse.move(500, 400)
    await page.mouse.wheel(40, 80)
    await expect.poll(() => state<number>(page, 's.camera.y')).not.toBe(cam0.y)
    const cam1 = await state<{ x: number; y: number; zoom: number }>(page, 's.camera')
    expect(cam1.zoom).toBe(cam0.zoom)

    // Ctrl+wheel zooms about the cursor.
    const anchor = await toWorld(page, { x: 500, y: 400 })
    await page.keyboard.down('Control')
    await page.mouse.wheel(0, -100)
    await page.keyboard.up('Control')
    await expect.poll(() => state<number>(page, 's.camera.zoom')).toBeGreaterThan(cam1.zoom)
    await nextFrame(page)
    const anchorAfter = await toWorld(page, { x: 500, y: 400 })
    expectClose(anchorAfter.x, anchor.x, 1e-3)
    expectClose(anchorAfter.y, anchor.y, 1e-3)

    // Middle-button drag pans and leaves the project alone.
    const cam2 = await state<{ x: number; y: number; zoom: number }>(page, 's.camera')
    await page.mouse.move(600, 500)
    await page.mouse.down({ button: 'middle' })
    await page.mouse.move(660, 530, { steps: 5 })
    await page.mouse.up({ button: 'middle' })
    const cam3 = await state<{ x: number; y: number; zoom: number }>(page, 's.camera')
    expectClose(cam3.x, cam2.x - 60 / cam2.zoom, 1e-6)
    expectClose(cam3.y, cam2.y - 30 / cam2.zoom, 1e-6)

    // Space+drag on the selected object pans instead of dragging it.
    await setCamera(page, cameraShowing({ x: 80, y: 40 }, { x: 400, y: 300 }, 2))
    const cam3b = await state<{ x: number; y: number; zoom: number }>(page, 's.camera')
    const p0 = await getProject(page)
    const onBand = round(await toClient(page, { x: 80, y: 40 }))
    await page.keyboard.down('Space')
    await mouseDrag(page, onBand, { x: onBand.x + 40, y: onBand.y + 10 })
    await page.keyboard.up('Space')
    const cam4 = await state<{ x: number; y: number; zoom: number }>(page, 's.camera')
    expectClose(cam4.x, cam3b.x - 40 / cam3b.zoom, 1e-6)
    expectClose(cam4.y, cam3b.y - 10 / cam3b.zoom, 1e-6)
    expect(await getProject(page)).toEqual(p0)
    expect(await history(page)).toEqual({ past: 0, future: 0 })

    // Hand tool drag pans too.
    await page.getByRole('button', { name: 'Hand' }).click()
    const onBandHand = round(await toClient(page, { x: 80, y: 40 }))
    await mouseDrag(page, onBandHand, { x: onBandHand.x - 20, y: onBandHand.y + 15 })
    const cam5 = await state<{ x: number; y: number; zoom: number }>(page, 's.camera')
    expectClose(cam5.x, cam4.x + 20 / cam4.zoom, 1e-6)
    expectClose(cam5.y, cam4.y - 15 / cam4.zoom, 1e-6)
    expect(await history(page)).toEqual({ past: 0, future: 0 })
    await page.getByRole('button', { name: 'Select' }).click()

    // And a plain mouse drag of the selection still commits.
    const again = round(await toClient(page, { x: 80, y: 40 }))
    await mouseDrag(page, again, { x: again.x + 30, y: again.y })
    expect(await history(page)).toEqual({ past: 1, future: 0 })
    expectClose(bandPoints(await getProject(page), 'b1')[0]!.x - 30, 30 / cam5.zoom, 1e-6)
  })
})

test.describe('touch', () => {
  test.skip(({ isMobile }) => !isMobile, 'touch assertions run in chromium-touch (isMobile + hasTouch)')

  test('(f) touchcancel mid-drag leaves project and history unchanged', async ({ page }) => {
    await seed(page)
    await select(page, ['b1'])
    const p0 = await getProject(page)
    const touch = await Touch.attach(page)
    const on = round(await toClient(page, { x: 80, y: 40 }))
    await touch.start([on])
    await touch.slide(on, { x: on.x + 60, y: on.y + 30 }, 6)
    expect(await state<unknown>(page, 's.preview')).not.toBeNull() // the drag really was live
    await touch.cancel()
    await nextFrame(page)
    expect(await getProject(page)).toEqual(p0)
    expect(await history(page)).toEqual({ past: 0, future: 0 })
    expect(await state<unknown>(page, 's.preview')).toBeNull()
  })

  test('(f) a second finger mid-drag leaves project and history unchanged', async ({ page }) => {
    await seed(page)
    await select(page, ['b1'])
    const p0 = await getProject(page)
    const touch = await Touch.attach(page)
    const on = round(await toClient(page, { x: 80, y: 40 }))
    await touch.start([on])
    const mid = { x: on.x + 40, y: on.y + 20 }
    await touch.slide(on, mid, 4)
    expect(await state<unknown>(page, 's.preview')).not.toBeNull()
    const second = { x: 700, y: 600 }
    const cam0 = await state<{ x: number; y: number; zoom: number }>(page, 's.camera')
    await touch.start([mid, second])
    await touch.slide(mid, { x: mid.x + 50, y: mid.y + 50 }, 4, [second])
    expect(await state<{ x: number; y: number; zoom: number }>(page, 's.camera')).not.toEqual(cam0) // two fingers pan/zoom
    await touch.end([second])
    await touch.end([])
    await nextFrame(page)
    expect(await getProject(page)).toEqual(p0)
    expect(await history(page)).toEqual({ past: 0, future: 0 })
    expect(await state<unknown>(page, 's.preview')).toBeNull()
    expect(await state<string[]>(page, 's.selection')).toEqual(['b1'])

    // One-finger drag still works afterwards.
    const again = round(await toClient(page, { x: 80, y: 40 }))
    await touch.start([again])
    await touch.slide(again, { x: again.x + 30, y: again.y }, 4)
    await touch.end([])
    expect(await history(page)).toEqual({ past: 1, future: 0 })
  })

  test('(g) marquee over a rotated instance selects by domain bounds (touch)', async ({ page }) => {
    await seed(page)
    const b = objectBounds(await getProject(page), 'i1')!
    const touch = await Touch.attach(page)
    const from = round(await toClient(page, { x: b.minX - 12, y: b.minY - 12 }))
    const into = round(await toClient(page, { x: b.minX + 4, y: b.minY + 4 }))
    await touch.start([from])
    await touch.slide(from, into, 6)
    await touch.end([])
    await nextFrame(page)
    expect(await state<string[]>(page, 's.selection')).toEqual(['i1'])
  })

  test('(j) a second finger aborts the Selecto marquee', async ({ page }) => {
    await seed(page)
    const b = objectBounds(await getProject(page), 'i1')!
    const touch = await Touch.attach(page)
    const from = round(await toClient(page, { x: b.minX - 12, y: b.minY - 12 }))
    const into = round(await toClient(page, { x: b.minX + 4, y: b.minY + 4 }))
    await touch.start([from])
    await touch.slide(from, into, 6)
    await expect(page.locator('.selecto-selection')).toBeVisible()

    const second = { x: 700, y: 600 }
    await touch.start([into, second])
    await expect(page.locator('.selecto-selection')).toHaveCount(0)
    await touch.slide(into, { x: into.x + 20, y: into.y + 20 }, 3, [second])
    await touch.end([second])
    await touch.end([])
    await nextFrame(page)
    expect(await state<string[]>(page, 's.selection')).toEqual([])

    // Selecto is back after the fingers lift: a fresh marquee selects.
    const from2 = round(await toClient(page, { x: b.minX - 12, y: b.minY - 12 }))
    const into2 = round(await toClient(page, { x: b.minX + 4, y: b.minY + 4 }))
    await touch.start([from2])
    await touch.slide(from2, into2, 6)
    await touch.end([])
    await nextFrame(page)
    expect(await state<string[]>(page, 's.selection')).toEqual(['i1'])
  })
})
