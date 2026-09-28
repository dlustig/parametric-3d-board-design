// Shell §9.4 (Task 4): the Select tool's actions bar — contents by selection,
// Paste's disabled reason until Copy, the Order menu, Edit motif, and Detach
// for an instance only; §12.2 Mod+R; and Review Focus 3 for Shift+T and Mod+R
// typed into a field.

import type { Locator, Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import type { Project } from '../src/domain/model.ts'
import { band, MAT2, project } from '../src/domain/test-builders.ts'
import { getProject, history, seed, seededProject, select } from './helpers.ts'

function bar(page: Page): Locator {
  return page.getByRole('toolbar', { name: 'Selection actions' })
}

function twoBands(): Project {
  return project([band('b1', [[0, 40], [80, 40]]), band('b2', [[0, 80], [80, 80]], { materialId: MAT2 })])
}

test('shows only Paste with nothing selected, and the full set with a count once something is', async ({ page }) => {
  await seed(page, twoBands())
  await expect(bar(page).getByRole('button')).toHaveCount(1)
  await expect(bar(page).getByRole('button', { name: 'Paste', exact: true })).toBeDisabled()

  await select(page, ['b1'])
  await expect(bar(page)).toContainText('1 band')
  for (const name of ['Duplicate', 'Copy', 'Paste', 'Mirror X', 'Mirror Y', 'Rotate 90° CCW', 'Rotate 90° CW', 'Order', 'Make motif', 'Repeat', 'Delete']) {
    await expect(bar(page).getByRole('button', { name, exact: true })).toBeVisible()
  }
  await expect(bar(page).getByRole('button', { name: 'Edit motif', exact: true })).toHaveCount(0)
  await expect(bar(page).getByRole('button', { name: 'Detach', exact: true })).toHaveCount(0)

  await select(page, ['b1', 'b2'])
  await expect(bar(page)).toContainText('2 objects')
})

test.describe('Paste', () => {
  test.skip(({ isMobile }) => isMobile, 'hover tooltips are for fine pointers')

  test('is disabled with the reason "Copy something first" until Copy, then pastes', async ({ page }) => {
    await seed(page, twoBands())
    await select(page, ['b1'])
    const paste = bar(page).getByRole('button', { name: 'Paste', exact: true })
    await expect(paste).toBeDisabled()
    await paste.locator('..').hover() // Hint wraps a disabled trigger so its tooltip can still open
    await expect(page.getByRole('tooltip')).toContainText('Copy something first')

    await bar(page).getByRole('button', { name: 'Copy', exact: true }).click()
    await expect(paste).toBeEnabled()
    await paste.click()
    expect((await getProject(page)).rootChildren).toHaveLength(3)
    expect(await history(page)).toEqual({ past: 1, future: 0 })
  })
})

test('Order → Send to back changes the paint order in one history step', async ({ page }) => {
  await seed(page, twoBands())
  await select(page, ['b2'])
  await bar(page).getByRole('button', { name: 'Order', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Send to back', exact: true }).click()
  expect((await getProject(page)).rootChildren).toEqual(['b2', 'b1'])
  expect(await history(page)).toEqual({ past: 1, future: 0 })
})

test('Order menu: Escape closes it without clearing the selection', async ({ page }) => {
  await seed(page, twoBands())
  await select(page, ['b1'])
  await bar(page).getByRole('button', { name: 'Order', exact: true }).click()
  await expect(page.getByRole('menu')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('menu')).toHaveCount(0)
  expect(await page.evaluate(() => window.__cbpd!.getState().selection)).toEqual(['b1'])
})

// Radix menus preventDefault their navigation keys but don't stop them, so
// keyboard.ts's window listener must ignore keys aimed at a menu: arrows would
// otherwise nudge the selection and typeahead letters switch the tool.
test('arrow keys move through the Order menu without nudging the selection', async ({ page }) => {
  await seed(page, twoBands())
  await select(page, ['b2'])
  const before = await getProject(page)
  await bar(page).getByRole('button', { name: 'Order', exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('menuitem', { name: 'Bring forward', exact: true })).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('menuitem', { name: 'Send backward', exact: true })).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('menuitem', { name: 'Bring to front', exact: true })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('menu')).toHaveCount(0)
  expect(await getProject(page)).toEqual(before)
  expect(await history(page)).toEqual({ past: 0, future: 0 })
})

test('a letter typed in an open menu does not switch the tool', async ({ page }) => {
  await seed(page, twoBands())
  await select(page, ['b2'])
  await bar(page).getByRole('button', { name: 'Order', exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('menu')).toBeVisible()
  await page.keyboard.press('s') // typeahead: Send backward
  await expect(page.getByRole('menuitem', { name: 'Send backward', exact: true })).toBeFocused()
  await page.keyboard.press('b')
  expect(await page.evaluate(() => window.__cbpd!.getState().tool)).toBe('select')
  await expect(page.getByRole('menu')).toBeVisible()
})

test('Edit motif enters an instance; Detach is offered for an instance, never for a repeat', async ({ page }) => {
  await seed(page, seededProject()) // i1: an instance of m1; rp1: a 2×2 repeat of m2
  await select(page, ['rp1'])
  await expect(bar(page)).toContainText('1 repeat')
  await expect(bar(page).getByRole('button', { name: 'Edit motif', exact: true })).toBeVisible()
  await expect(bar(page).getByRole('button', { name: 'Detach', exact: true })).toHaveCount(0)

  await select(page, ['i1'])
  await expect(bar(page)).toContainText('1 instance')
  await expect(bar(page).getByRole('button', { name: 'Detach', exact: true })).toBeVisible()
  await bar(page).getByRole('button', { name: 'Edit motif', exact: true }).click()
  expect(await page.evaluate(() => window.__cbpd!.getState().editContext)).toEqual([{ motifId: 'm1', path: [{ instanceId: 'i1' }] }])
  expect(await page.evaluate(() => window.__cbpd!.getState().selection)).toEqual([])
})

test('Mod+R repeats the selection', async ({ page }) => {
  await seed(page, twoBands())
  await select(page, ['b1', 'b2'])
  await page.keyboard.press('ControlOrMeta+r')
  const p = await getProject(page)
  expect(p.rootChildren).toHaveLength(1)
  expect(p.objects[p.rootChildren[0]!]!.type).toBe('repeat')
})

test('Shift+T and Mod+R typed into a field do nothing', async ({ page }) => {
  await seed(page, twoBands())
  await select(page, ['b1', 'b2'])
  const x = page.getByRole('region', { name: 'Selection' }).getByLabel('X', { exact: true })
  await x.focus()
  await x.press('Shift+T')
  await x.press('ControlOrMeta+r')
  await expect(x).toBeFocused()
  await expect(page.getByRole('toolbar', { name: 'Tools' })).toHaveCount(0) // still docked
  expect((await getProject(page)).rootChildren).toEqual(['b1', 'b2'])
})
