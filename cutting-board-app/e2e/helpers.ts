// Playwright helpers for the Slice-1 interaction proof (SPEC §15): a seeded
// project, camera/selection control through the test hook, and coordinate
// mapping through the live svg's getScreenCTM.

import type { CDPSession, Page } from '@playwright/test'
import { expect } from '@playwright/test'
import type { Project, Transform } from '../src/domain/model.ts'
import { band, instance, project, region, repeat } from '../src/domain/test-builders.ts'

export type XY = { x: number; y: number }
export type Camera = { x: number; y: number; zoom: number }

/** One band, one region, one rotated instance (a motif of two bands, 30°), one 2×2 repeat. */
export function seededProject(instanceTransform: Partial<Transform> = { x: 200, y: 90, rotationDeg: 30 }): Project {
  return project(
    [
      band('b1', [[30, 40], [130, 40]]),
      region('r1', [[30, 70], [90, 70], [90, 120], [30, 120]]),
      instance('i1', 'm1', instanceTransform),
      repeat('rp1', 'm2', { transform: { x: 40, y: 250, rotationDeg: 0, mirrorX: false, mirrorY: false, scale: 1 }, rows: 2, columns: 2, stepXMm: 60, stepYMm: 60 }),
    ],
    [
      { id: 'm1', children: [band('mb1', [[-30, 0], [30, 0]]), band('mb2', [[0, -30], [0, 30]], { materialId: 'walnut' })] },
      { id: 'm2', children: [region('mr1', [[0, 0], [40, 0], [40, 40], [0, 40]])] },
    ],
  )
}

export async function open(page: Page): Promise<void> {
  await page.goto('/')
  await page.waitForFunction(() => window.__cbpd !== undefined && document.querySelector('svg.canvas-svg') !== null)
}

export async function seed(page: Page, p: Project = seededProject()): Promise<void> {
  await open(page)
  await page.evaluate((proj) => window.__cbpd!.replaceProject(proj), p)
}

export async function setCamera(page: Page, camera: Camera): Promise<void> {
  await page.evaluate((c) => window.__cbpd!.getState().setCamera(c), camera)
  await nextFrame(page)
}

/** The camera that puts world `p` at viewport-local px `local` at `zoom`. */
export function cameraShowing(p: XY, local: XY, zoom: number): Camera {
  return { zoom, x: p.x - local.x / zoom, y: p.y - local.y / zoom }
}

export async function select(page: Page, ids: string[]): Promise<void> {
  await page.evaluate((s) => window.__cbpd!.getState().select(s), ids)
  await nextFrame(page)
}

/** Turns snapping off with the rail's Snap toggle, for tests asserting raw pointer deltas (SPEC §7.7 would snap them). */
export async function snapOff(page: Page): Promise<void> {
  const toggle = page.getByRole('button', { name: 'Snap', exact: true })
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
}

export async function nextFrame(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))))
}

export async function getProject(page: Page): Promise<Project> {
  return page.evaluate(() => window.__cbpd!.getProject())
}

export async function history(page: Page): Promise<{ past: number; future: number }> {
  return page.evaluate(() => window.__cbpd!.getHistoryLengths())
}

export async function toClient(page: Page, world: XY): Promise<XY> {
  return page.evaluate((w) => {
    const svg = document.querySelector('svg.canvas-svg') as SVGSVGElement
    const q = new DOMPoint(w.x, w.y).matrixTransform(svg.getScreenCTM()!)
    return { x: q.x, y: q.y }
  }, world)
}

export async function toWorld(page: Page, client: XY): Promise<XY> {
  return page.evaluate((c) => {
    const svg = document.querySelector('svg.canvas-svg') as SVGSVGElement
    const q = new DOMPoint(c.x, c.y).matrixTransform(svg.getScreenCTM()!.inverse())
    return { x: q.x, y: q.y }
  }, client)
}

/** Mouse drag by whole px in `steps` moves. */
export async function mouseDrag(page: Page, from: XY, to: XY, steps = 8): Promise<void> {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps })
  await page.mouse.up()
}

/** Client rect of Moveable's control box: the union of its four default (non-rotation) lines. */
export async function moveableBox(page: Page): Promise<{ left: number; top: number; right: number; bottom: number }> {
  return page.evaluate(() => {
    const lines = [...document.querySelectorAll('.moveable-control-box .moveable-line.moveable-direction')]
    if (lines.length === 0) throw new Error('no Moveable control box')
    const rects = lines.map((l) => l.getBoundingClientRect())
    return {
      left: Math.min(...rects.map((r) => r.left)),
      top: Math.min(...rects.map((r) => r.top)),
      right: Math.max(...rects.map((r) => r.right)),
      bottom: Math.max(...rects.map((r) => r.bottom)),
    }
  })
}

/** CDP touch driver for multi-touch (Playwright has no multi-finger API). */
export class Touch {
  private readonly cdp: CDPSession

  private constructor(cdp: CDPSession) {
    this.cdp = cdp
  }

  static async attach(page: Page): Promise<Touch> {
    return new Touch(await page.context().newCDPSession(page))
  }

  async start(points: XY[]): Promise<void> {
    await this.send('touchStart', points)
  }
  async move(points: XY[]): Promise<void> {
    await this.send('touchMove', points)
  }
  async end(points: XY[] = []): Promise<void> {
    await this.send('touchEnd', points)
  }
  async cancel(): Promise<void> {
    await this.send('touchCancel', [])
  }

  /** Moves `from` → `to` in `steps` touchMoves, keeping any `still` fingers in place. */
  async slide(from: XY, to: XY, steps: number, still: XY[] = []): Promise<void> {
    for (let k = 1; k <= steps; k++) {
      const t = k / steps
      await this.move([{ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }, ...still])
    }
  }

  private async send(type: 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel', points: XY[]): Promise<void> {
    await this.cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map((p, id) => ({ x: p.x, y: p.y, id })) })
  }
}

export function expectClose(actual: number, expected: number, tol: number): void {
  expect(Math.abs(actual - expected), `|${actual} − ${expected}| ≤ ${tol}`).toBeLessThanOrEqual(tol)
}
