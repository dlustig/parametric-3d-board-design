// Shell spec §10.2: the New Project dialog, which is New's confirmation. A
// sample with other units and size creates exactly that project with history
// cleared; Cancel leaves project and history untouched; a non-blank project
// shows the warning with a working Download; a blank one shows none; the
// seven cards have thumbnails; the V1 dev sample loader is gone.

import type { Locator, Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { band, project } from '../src/domain/test-builders.ts'
import { expectClose, getProject, history, seed, select } from './helpers.ts'

const WARNING = 'This replaces the current project. Download it first to keep a copy.'

/** Project menu (the project-name button, §8) → New project…; returns the dialog. */
async function openNewProject(page: Page): Promise<Locator> {
  const name = (await getProject(page)).name
  await page.getByRole('button', { name, exact: true }).click()
  await page.getByRole('menuitem', { name: 'New project…', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'New project' })
  await expect(dialog).toBeVisible()
  return dialog
}

test.describe('New Project dialog', () => {
  test('Checker in inches with a new width: that project, units and size, with history cleared', async ({ page }) => {
    await seed(page, project([band('b1', [[0, 40], [80, 40]])]))
    await page.evaluate(() => window.__cbpd!.run((p) => ({ ...p, name: 'Edited' })))
    expect(await history(page)).toEqual({ past: 1, future: 0 })

    const dialog = await openNewProject(page)
    const checker = dialog.getByRole('button', { name: 'Checker', exact: true })
    await checker.click()
    await expect(checker).toHaveAttribute('aria-pressed', 'true')
    await dialog.getByRole('group', { name: 'Units' }).getByRole('button', { name: 'in', exact: true }).click()
    const width = dialog.getByLabel('Width', { exact: true })
    await expect(width).toHaveValue('11.811') // Checker's 300 mm, re-rendered in inches; the mm value is unchanged
    await width.fill('12')
    await width.press('Enter')
    await dialog.getByRole('button', { name: 'Create', exact: true }).click()

    await expect(dialog).toBeHidden()
    const p = await getProject(page)
    expect(p.name).toBe('Checker')
    expect(p.displayUnits).toBe('in')
    expectClose(p.board.widthMm, 304.8, 1e-9)
    expect(p.board.heightMm).toBe(450)
    expect(Object.keys(p.objects)).toHaveLength(3)
    expect(await history(page)).toEqual({ past: 0, future: 0 })
  })

  test('Cancel leaves the project and its history untouched', async ({ page }) => {
    await seed(page, project([band('b1', [[0, 40], [80, 40]])]))
    await page.evaluate(() => window.__cbpd!.run((p) => ({ ...p, name: 'Edited' })))
    const before = await getProject(page)
    const historyBefore = await history(page)

    const dialog = await openNewProject(page)
    await dialog.getByRole('button', { name: 'Interlace', exact: true }).click()
    await dialog.getByRole('group', { name: 'Units' }).getByRole('button', { name: 'in', exact: true }).click()
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()

    await expect(dialog).toBeHidden()
    expect(await getProject(page)).toEqual(before)
    expect(await history(page)).toEqual(historyBefore)
  })

  test('a non-blank project gets the warning, whose Download saves it without closing the dialog', async ({ page }) => {
    await seed(page, { ...project([band('b1', [[0, 40], [80, 40]])]), name: 'Walnut board' })
    const dialog = await openNewProject(page)
    await expect(dialog).toContainText(WARNING)
    const [download] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: 'Download project', exact: true }).click()])
    expect(download.suggestedFilename()).toBe('Walnut board.cbpd.json')
    await expect(dialog).toBeVisible()
  })

  test('a blank project gets no warning; Blank is chosen and creates a fresh blank project; seven cards have thumbnails', async ({ page }) => {
    await seed(page, project([]))
    const before = await getProject(page)
    const dialog = await openNewProject(page)
    await expect(dialog).not.toContainText(WARNING)
    await expect(dialog.getByRole('button', { name: 'Blank', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(dialog.locator('.new-project-card svg')).toHaveCount(7)
    expect(await dialog.getByRole('button', { name: 'Checker', exact: true }).locator('g.scene path').count()).toBeGreaterThan(0)

    await dialog.getByRole('button', { name: 'Create', exact: true }).click()
    const after = await getProject(page)
    expect(after.id).not.toBe(before.id)
    expect(after.objects).toEqual({})
    expect(after.displayUnits).toBe('mm')
    expect(after.board).toMatchObject({ widthMm: 300, heightMm: 450 })
  })

  test('the project menu has no dev sample loader', async ({ page }) => {
    await seed(page, project([]))
    await page.getByRole('button', { name: 'Test', exact: true }).click()
    await expect(page.getByRole('menuitem', { name: 'New project…', exact: true })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: /Load sample/ })).toHaveCount(0)
  })

  // Controller ruling 3: Escape in the dialog must not also run the app's own
  // Escape cascade (SPEC's clear-selection step) — `onEscapeKeyDown` stops the
  // event from reaching keyboard.ts's window-level dispatcher, the same pattern
  // as every other Radix layer on this branch.
  test('Escape closes the dialog without touching the selection', async ({ page }) => {
    await seed(page, project([band('b1', [[0, 40], [80, 40]])]))
    await select(page, ['b1'])
    const dialog = await openNewProject(page)

    await page.keyboard.press('Escape')

    await expect(dialog).toBeHidden()
    expect(await page.evaluate(() => window.__cbpd!.getState().selection)).toEqual(['b1'])
  })

  test('editor shortcuts do nothing behind the open dialog', async ({ page }) => {
    await seed(page, project([band('b1', [[0, 40], [80, 40]])]))
    await select(page, ['b1'])
    const before = await getProject(page)
    const dialog = await openNewProject(page)
    await dialog.getByRole('button', { name: 'Checker', exact: true }).focus()

    await page.keyboard.press('Delete')
    await page.keyboard.press('Backspace')
    await page.keyboard.press('b')

    expect(await getProject(page)).toEqual(before)
    expect(await history(page)).toEqual({ past: 0, future: 0 })
    expect(await page.evaluate(() => window.__cbpd!.getState().tool)).toBe('select')
    await expect(dialog).toBeVisible()
  })
})
