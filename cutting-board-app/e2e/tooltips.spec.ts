// Shell spec §12.3 Hint and §10.3 shortcuts sheet: hovering a tool shows its
// label, keycap and hint line; `?` opens the sheet; a touch long-press shows
// the tooltip without activating the tool and the next press closes it.

import { expect, test } from '@playwright/test'
import { project } from '../src/domain/test-builders.ts'
import { cameraShowing, nextFrame, open, seed, select, setCamera, toClient, Touch } from './helpers.ts'

test('hovering the Band tool shows its label, keycap and hint', async ({ page, isMobile }) => {
  test.skip(isMobile, 'hover is a fine-pointer interaction')
  await open(page)
  await page.getByRole('button', { name: 'Band', exact: true }).hover()
  await expect(page.locator('.hint')).toBeVisible()
  const tip = page.getByRole('tooltip')
  await expect(tip).toContainText('Band')
  await expect(tip).toContainText('Draw a strip of wood. Tap to place points.')
  await expect(tip.locator('.keycap')).toHaveText('B')
})

test('every tool button has a Hint naming it', async ({ page, isMobile }) => {
  test.skip(isMobile, 'hover is a fine-pointer interaction')
  await open(page)
  for (const [name, key] of [['Select', 'V'], ['Hand', 'H'], ['Band', 'B'], ['Rectangle', 'R'], ['Polygon', 'P'], ['Crossing', 'X']] as const) {
    await page.getByRole('button', { name, exact: true }).hover()
    const tip = page.getByRole('tooltip')
    await expect(tip).toContainText(name)
    await expect(tip.locator('.keycap').first()).toHaveText(key)
  }
})

test('? opens the keyboard shortcuts sheet', async ({ page }) => {
  await open(page)
  await page.keyboard.press('?')
  const sheet = page.getByRole('dialog', { name: 'Keyboard shortcuts' })
  await expect(sheet).toBeVisible()
  await expect(sheet).toContainText('Make motif')
  await expect(sheet.getByRole('heading', { name: 'Tools' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(sheet).toBeHidden()
})

test('closing the sheet opened from the project menu returns focus to the project name', async ({ page }) => {
  await seed(page)
  await page.locator('.project-name').click()
  await page.getByRole('menuitem', { name: 'Keyboard shortcuts' }).click()
  const sheet = page.getByRole('dialog', { name: 'Keyboard shortcuts' })
  await expect(sheet).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(sheet).toBeHidden()
  await expect(page.locator('.project-name')).toBeFocused()
})

test('the zoom read-out is named for what it does, whatever the zoom', async ({ page }) => {
  await open(page)
  await expect(page.getByRole('button', { name: /^Zoom \d+%, fit to board$/ })).toBeVisible()
})

test('Escape closes the sheet without clearing the selection', async ({ page }) => {
  // Radix's DismissableLayer handles Escape on `document` in the capture phase with
  // preventDefault() but no stopPropagation(); keyboard.ts's global dispatcher listens
  // on `window` at bubble and never checks defaultPrevented, so without
  // ShortcutsDialog stopping propagation, closing the sheet also runs the app's
  // Escape cascade (clearing the selection here).
  await seed(page) // b1, r1, i1, rp1
  await select(page, ['b1'])
  await page.keyboard.press('?')
  const sheet = page.getByRole('dialog', { name: 'Keyboard shortcuts' })
  await expect(sheet).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(sheet).toBeHidden()
  expect(await page.evaluate(() => window.__cbpd!.getState().selection)).toEqual(['b1'])
})

test('Escape closes the sheet without cancelling an in-progress drawing', async ({ page, isMobile }) => {
  test.skip(isMobile, 'drawing setup here is mouse-based, matching drawing.spec.ts')
  await seed(page, project([]))
  await setCamera(page, cameraShowing({ x: 0, y: 0 }, { x: 60, y: 120 }, 2))
  await page.getByRole('button', { name: 'Band', exact: true }).click()
  const a = await toClient(page, { x: 50, y: 50 })
  const b = await toClient(page, { x: 100, y: 50 })
  await page.mouse.click(Math.round(a.x), Math.round(a.y))
  await page.mouse.click(Math.round(b.x), Math.round(b.y))
  expect(await page.evaluate(() => window.__cbpd!.getState().drawing?.points.length)).toBe(2)

  await page.keyboard.press('?')
  const sheet = page.getByRole('dialog', { name: 'Keyboard shortcuts' })
  await expect(sheet).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(sheet).toBeHidden()
  expect(await page.evaluate(() => window.__cbpd!.getState().drawing?.points.length)).toBe(2) // still drawing, not cancelled
})

test('a touch long-press shows the tooltip without activating the tool', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'touch long-press runs in chromium-touch')
  await open(page)
  const button = page.getByRole('button', { name: 'Band', exact: true })
  const box = (await button.boundingBox())!
  const at = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  const touch = await Touch.attach(page)
  await touch.start([at])
  await expect(page.locator('.hint')).toBeVisible() // appears while held: the 500 ms timer
  await expect(page.getByRole('tooltip')).toContainText('Band')
  await touch.end([])
  await nextFrame(page)
  expect(await page.evaluate(() => window.__cbpd!.getState().tool)).toBe('select')
  await expect(page.locator('.hint')).toBeVisible() // stays after release
  const canvas = (await page.locator('.canvas').boundingBox())!
  await page.touchscreen.tap(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2)
  await expect(page.locator('.hint')).toBeHidden() // the next pointerdown anywhere closes it
})
