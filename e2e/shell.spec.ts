// Shell spec §4, §4.1, §8, §10.1, §12.2 (Task 3): the side panes toggled by
// button, shortcut, active tab and wood chip; pane sizes and collapsed state
// surviving a reload; Rename; the project shortcuts; Escape inside the
// project menu and its Open confirmation; the narrow (< 1024 px) overlay
// layout; and Review Focus pins 1 (a corrupt or unreadable layout record),
// 3 (shortcuts typed in a field), 4 (crossing the breakpoint) and 5 (a long
// project name).

import type { Locator, Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import type { Project } from '../src/domain/model.ts'
import { band, project } from '../src/domain/test-builders.ts'
import type { Camera } from './helpers.ts'
import { expectClose, getProject, history, open, openPane, projectMenuItem, seed, select } from './helpers.ts'

declare global {
  interface Window {
    __blobs?: number
  }
}

const LAYOUT_KEY = 'react-resizable-panels:cbpd-shell'

function sidebarToggle(page: Page): Locator {
  return page.getByRole('button', { name: 'Toggle sidebar', exact: true })
}

function inspectorToggle(page: Page): Locator {
  return page.getByRole('button', { name: 'Toggle inspector', exact: true })
}

function nonBlank(): Project {
  return project([band('b1', [[0, 40], [80, 40]])])
}

async function widthOf(locator: Locator): Promise<number> {
  const box = await locator.boundingBox()
  expect(box, 'the element is laid out').not.toBeNull()
  return box!.width
}

async function cameraOf(page: Page): Promise<Camera> {
  return page.evaluate(() => window.__cbpd!.getState().camera)
}

async function selectionOf(page: Page): Promise<string[]> {
  return page.evaluate(() => window.__cbpd!.getState().selection)
}

/** Drags the sidebar's separator (the first one) right by `dx` px with the mouse. */
async function dragSidebarEdge(page: Page, dx: number): Promise<void> {
  const box = await page.locator('.pane-separator').first().boundingBox()
  expect(box, 'the sidebar separator is laid out').not.toBeNull()
  const x = box!.x + box!.width / 2
  const y = box!.y + box!.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + dx, y, { steps: 6 })
  await page.mouse.up()
}

async function expectDefaultWidths(page: Page, errors: string[]): Promise<void> {
  expectClose(await widthOf(page.locator('.left-pane')), 240, 1)
  expectClose(await widthOf(page.locator('.inspector')), 280, 1)
  expect(errors).toEqual([])
}

test.describe('side panes (desktop 1440 × 900)', () => {
  test('the top-bar buttons toggle the sidebar and the inspector; aria-pressed follows', async ({ page }) => {
    await open(page)
    await expect(sidebarToggle(page)).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('.left-pane')).toBeVisible()
    await sidebarToggle(page).click()
    await expect(sidebarToggle(page)).toHaveAttribute('aria-pressed', 'false')
    await expect(page.locator('.left-pane')).toHaveCount(0)
    await sidebarToggle(page).click()
    await expect(page.locator('.left-pane')).toBeVisible()

    await expect(inspectorToggle(page)).toHaveAttribute('aria-pressed', 'true')
    await inspectorToggle(page).click()
    await expect(inspectorToggle(page)).toHaveAttribute('aria-pressed', 'false')
    await expect(page.locator('.inspector')).toHaveCount(0)
    await inspectorToggle(page).click()
    await expect(page.locator('.inspector')).toBeVisible()
  })

  test('Mod+\\ toggles the sidebar and Mod+Shift+\\ the inspector', async ({ page }) => {
    await open(page)
    await page.keyboard.press('ControlOrMeta+Backslash')
    await expect(page.locator('.left-pane')).toHaveCount(0)
    await page.keyboard.press('ControlOrMeta+Backslash')
    await expect(page.locator('.left-pane')).toBeVisible()
    await page.keyboard.press('ControlOrMeta+Shift+Backslash')
    await expect(page.locator('.inspector')).toHaveCount(0)
    await expect(page.locator('.left-pane')).toBeVisible()
    await page.keyboard.press('ControlOrMeta+Shift+Backslash')
    await expect(page.locator('.inspector')).toBeVisible()
  })

  test('clicking the active tab toggles the sidebar; the wood chip reopens it on Wood', async ({ page }) => {
    await open(page)
    const layers = page.getByRole('button', { name: 'Layers', exact: true }) // the default tab (§11)
    await expect(layers).toHaveAttribute('aria-pressed', 'true')
    await layers.click()
    await expect(page.locator('.left-pane')).toHaveCount(0)
    await expect(layers).toHaveAttribute('aria-pressed', 'false')
    await layers.click()
    await expect(page.locator('.left-pane')).toBeVisible()
    await expect(page.getByRole('complementary', { name: 'Layers' })).toBeVisible()

    await layers.click()
    await expect(page.locator('.left-pane')).toHaveCount(0)
    await page.getByRole('button', { name: /^Current wood: / }).click()
    await expect(page.getByRole('region', { name: 'Wood' })).toBeVisible()
  })

  test('a dragged sidebar width and a closed inspector survive a reload', async ({ page }) => {
    await open(page)
    await dragSidebarEdge(page, 60)
    expectClose(await widthOf(page.locator('.left-pane')), 300, 2)
    await inspectorToggle(page).click()
    await page.waitForFunction((key) => (JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, number>)['pane-right'] === 0, LAYOUT_KEY)

    await open(page)
    expectClose(await widthOf(page.locator('.left-pane')), 300, 2)
    await expect(page.locator('.inspector')).toHaveCount(0)
    await expect(inspectorToggle(page)).toHaveAttribute('aria-pressed', 'false')
  })

  for (const [what, stored] of [
    ['not JSON', '{not json'],
    ['JSON null', 'null'],
    ['for other panels', JSON.stringify({ sidebar: 50, main: 50 })],
  ] as const) {
    test(`a stored layout that is ${what} loads the default widths (Review Focus 1)`, async ({ page }) => {
      const errors: string[] = []
      page.on('pageerror', (e) => errors.push(e.message))
      await page.addInitScript((arg: { key: string; value: string }) => localStorage.setItem(arg.key, arg.value), { key: LAYOUT_KEY, value: stored })
      await open(page)
      await expectDefaultWidths(page, errors)
    })
  }

  test('a layout storage read that throws loads the default widths, and resizing still works (Review Focus 1)', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.addInitScript((key) => {
      const get = Storage.prototype.getItem
      const set = Storage.prototype.setItem
      Storage.prototype.getItem = function (k: string): string | null {
        if (k === key) throw new DOMException('denied', 'SecurityError')
        return get.call(this, k)
      }
      Storage.prototype.setItem = function (k: string, v: string): void {
        if (k === key) throw new DOMException('full', 'QuotaExceededError')
        set.call(this, k, v)
      }
    }, LAYOUT_KEY)
    await open(page)
    await expectDefaultWidths(page, errors)
    await dragSidebarEdge(page, 60)
    expectClose(await widthOf(page.locator('.left-pane')), 300, 2)
    await sidebarToggle(page).click()
    await expect(page.locator('.left-pane')).toHaveCount(0)
    expect(errors).toEqual([])
  })

  test('an out-of-range stored layout is clamped to the pane limits (Review Focus 1)', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    const stored = JSON.stringify({ 'pane-left': 60, 'pane-canvas': 10, 'pane-right': 30 })
    await page.addInitScript((arg: { key: string; value: string }) => localStorage.setItem(arg.key, arg.value), { key: LAYOUT_KEY, value: stored })
    await open(page)
    const left = await widthOf(page.locator('.left-pane'))
    const right = await widthOf(page.locator('.inspector'))
    expect(left).toBeGreaterThanOrEqual(199.5)
    expect(left).toBeLessThanOrEqual(400.5)
    expect(right).toBeGreaterThanOrEqual(247.5)
    expect(right).toBeLessThanOrEqual(440.5)
    expect(await widthOf(page.locator('.canvas-host'))).toBeGreaterThan(300)
    expect(errors).toEqual([])
  })

  test('Rename edits the name in place: Enter commits, Esc and an empty name revert', async ({ page }) => {
    await seed(page, nonBlank())
    await expect(page.getByRole('region', { name: 'Board' }).getByLabel('Name', { exact: true })).toHaveCount(0)

    await projectMenuItem(page, 'Rename')
    const name = page.getByLabel('Name', { exact: true })
    await expect(name).toBeFocused()
    await name.fill('Basket weave')
    await name.press('Enter')
    await expect(page.locator('.project-name-text')).toHaveText('Basket weave')
    expect((await getProject(page)).name).toBe('Basket weave')
    expect(await history(page)).toEqual({ past: 1, future: 0 })

    await projectMenuItem(page, 'Rename')
    await name.fill('Discarded')
    await name.press('Escape')
    await expect(page.locator('.project-name-text')).toHaveText('Basket weave')

    await projectMenuItem(page, 'Rename')
    await name.fill('   ')
    await name.press('Enter')
    await expect(page.locator('.project-name-text')).toHaveText('Basket weave')
    expect(await history(page)).toEqual({ past: 1, future: 0 })
  })

  test('Escape closes the project menu, the Open confirmation and the material popover without clearing the selection', async ({ page }) => {
    await seed(page, nonBlank())
    await select(page, ['b1'])

    await page.locator('.project-name').click()
    await expect(page.getByRole('menu')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('menu')).toHaveCount(0)
    expect(await selectionOf(page)).toEqual(['b1'])

    await projectMenuItem(page, 'Open project…')
    await expect(page.getByText('Open a project?')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    expect(await selectionOf(page)).toEqual(['b1'])

    await openPane(page, 'Wood')
    await page.getByRole('button', { name: 'Edit Walnut', exact: true }).click()
    const popover = page.getByRole('dialog', { name: 'Edit Walnut' })
    await expect(popover).toBeVisible()
    await popover.getByRole('button', { name: 'Save', exact: true }).focus() // off the Name field, which the dispatcher already ignores
    await page.keyboard.press('Escape')
    await expect(popover).toHaveCount(0)
    expect(await selectionOf(page)).toEqual(['b1'])

    // The same Escape outside a Radix layer does clear it, so the checks above can fail.
    await page.keyboard.press('Escape')
    expect(await selectionOf(page)).toEqual([])
  })

  test('Mod+O asks to open, Mod+S downloads the project and Mod+Shift+E exports the SVG', async ({ page }) => {
    await seed(page, nonBlank())
    await page.keyboard.press('ControlOrMeta+o')
    await expect(page.getByText('Open a project?')).toBeVisible()
    await page.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)

    const [json] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('ControlOrMeta+s')])
    expect(json.suggestedFilename()).toBe('Test.cbpd.json')
    const [svg] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('ControlOrMeta+Shift+e')])
    expect(svg.suggestedFilename()).toBe('Test.svg')
  })

  test('the pane and project shortcuts typed in a field do nothing (Review Focus 3)', async ({ page }) => {
    await page.addInitScript(() => {
      const create = URL.createObjectURL.bind(URL)
      window.__blobs = 0
      URL.createObjectURL = (obj: Blob | MediaSource): string => {
        window.__blobs = (window.__blobs ?? 0) + 1
        return create(obj)
      }
    })
    await seed(page, nonBlank()) // non-blank: a live Mod+O would open "Open a project?"
    const field = page.getByLabel('Width', { exact: true }) // the Board panel's Width (nothing selected)
    await field.focus()
    for (const chord of ['ControlOrMeta+Backslash', 'ControlOrMeta+Shift+Backslash', 'ControlOrMeta+o', 'ControlOrMeta+s', 'ControlOrMeta+Shift+e']) {
      await field.press(chord)
    }
    await expect(field).toBeFocused()
    await expect(sidebarToggle(page)).toHaveAttribute('aria-pressed', 'true')
    await expect(inspectorToggle(page)).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    expect(await page.evaluate(() => window.__blobs)).toBe(0)

    // The same chord outside the field does act, so the checks above can fail.
    await field.blur()
    const [download] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('ControlOrMeta+s')])
    expect(download.suggestedFilename()).toBe('Test.cbpd.json')
    expect(await page.evaluate(() => window.__blobs)).toBe(1)
  })

  test('crossing 1024 px keeps the desktop widths, never shows two overlays and never moves the camera (Review Focus 4)', async ({ page }) => {
    await open(page)
    await dragSidebarEdge(page, 60)
    expectClose(await widthOf(page.locator('.left-pane')), 300, 2)
    const before = await cameraOf(page)

    await page.setViewportSize({ width: 820, height: 900 })
    await expect(sidebarToggle(page)).toHaveAttribute('aria-pressed', 'false') // entering narrow closes both
    await expect(page.locator('.pane-overlay-left, .pane-overlay-right')).toHaveCount(0)
    expect(await cameraOf(page)).toEqual(before)
    await sidebarToggle(page).click()
    expectClose(await widthOf(page.locator('.pane-overlay-left')), 300, 2)
    await inspectorToggle(page).click()
    await expect(page.locator('.pane-overlay-left, .pane-overlay-right')).toHaveCount(1)

    await page.setViewportSize({ width: 1440, height: 900 })
    await expect(sidebarToggle(page)).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('.pane-overlay-left, .pane-overlay-right')).toHaveCount(0)
    expectClose(await widthOf(page.locator('.left-pane')), 300, 2)
    expectClose(await widthOf(page.locator('.inspector')), 280, 2)
    expect(await cameraOf(page)).toEqual(before)
  })

  test('a 90-character project name truncates with its full text in the title, without horizontal overflow (Review Focus 5)', async ({ page }) => {
    const long = 'Walnut maple '.repeat(7).trim() // 90 characters
    await seed(page, { ...project([]), name: long })
    for (const width of [1440, 820]) {
      await page.setViewportSize({ width, height: 900 })
      const text = page.locator('.project-name-text')
      await expect(text).toHaveText(long)
      expect(await text.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true)
      await expect(page.locator('.project-name')).toHaveAttribute('title', long)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    }
  })
})

test.describe('narrow viewport (820 × 1180)', () => {
  test.use({ viewport: { width: 820, height: 1180 } })

  test('both panes start closed, open as overlays without resizing the canvas, and opening one closes the other', async ({ page }) => {
    await open(page)
    await expect(page.locator('.pane-overlay-left, .pane-overlay-right')).toHaveCount(0)
    await expect(sidebarToggle(page)).toHaveAttribute('aria-pressed', 'false')
    await expect(inspectorToggle(page)).toHaveAttribute('aria-pressed', 'false')
    const canvasWidth = await widthOf(page.locator('.canvas-host'))
    expectClose(canvasWidth + (await widthOf(page.locator('.icon-column'))), 820, 1) // the canvas fills the body beside the column

    await sidebarToggle(page).click()
    await expect(page.locator('.pane-overlay-left .left-pane')).toBeVisible()
    expect(await widthOf(page.locator('.canvas-host'))).toBe(canvasWidth)

    await inspectorToggle(page).click()
    await expect(page.locator('.pane-overlay-right .inspector')).toBeVisible()
    await expect(page.locator('.pane-overlay-left')).toHaveCount(0)
    expect(await widthOf(page.locator('.canvas-host'))).toBe(canvasWidth)

    await page.keyboard.press('ControlOrMeta+Backslash')
    await expect(page.locator('.pane-overlay-left .left-pane')).toBeVisible()
    await expect(page.locator('.pane-overlay-right')).toHaveCount(0)
  })
})
