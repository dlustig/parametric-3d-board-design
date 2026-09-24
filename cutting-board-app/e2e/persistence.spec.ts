// SPEC §9, G8 browser part: quota-failure status + recovery, startup
// corruption recovery, a failed Open leaving project/history untouched,
// New's confirmation on a non-blank project, the pagehide flush, and
// multi-tab detection via the `storage` event.

import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { band, project } from '../src/domain/test-builders.ts'
import { PROJECT_KEY, RECOVERED_KEY } from '../src/storage/local.ts'
import { getProject, history, open, seed } from './helpers.ts'

declare global {
  interface Window {
    __setStorageThrowing?: (throwing: boolean) => void
  }
}

/** Installed before navigation: makes every `localStorage.setItem` throw until `window.__setStorageThrowing(false)` is called. */
async function installThrowingStorage(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem
    let throwing = true
    window.__setStorageThrowing = (v: boolean) => {
      throwing = v
    }
    Storage.prototype.setItem = function (key, value) {
      if (throwing) throw new Error('simulated quota exceeded')
      original.call(this, key, value)
    }
  })
}

test.describe('autosave failure and recovery', () => {
  test('a setItem failure shows unsaved with a working Download, then clears once storage is restored', async ({ page }) => {
    await installThrowingStorage(page)
    await seed(page, project([band('b1', [[0, 40], [80, 40]])]))

    await page.waitForFunction(() => window.__cbpd!.getState().saveStatus === 'unsaved')
    await expect(page.getByText('Not saved in this browser')).toBeVisible()

    const downloadButton = page.locator('.status-bar').getByRole('button', { name: 'Download' })
    const [download] = await Promise.all([page.waitForEvent('download'), downloadButton.click()])
    expect(download.suggestedFilename()).toBe('Test.cbpd.json') // test-builders' project() names it "Test"

    await page.evaluate(() => window.__setStorageThrowing!(false))
    await page.evaluate(() => window.__cbpd!.run((p) => ({ ...p, name: 'Renamed' })))

    await page.waitForFunction(() => window.__cbpd!.getState().saveStatus === 'saved')
    await expect(page.getByText('Not saved in this browser')).toBeHidden()
  })
})

test.describe('startup recovery', () => {
  test('a corrupt key shows the recovery banner; the recovered text survives later edits byte-identical', async ({ page }) => {
    const corrupt = '{ this is not valid JSON'
    await page.addInitScript(
      (arg: { key: string; text: string }) => localStorage.setItem(arg.key, arg.text),
      { key: PROJECT_KEY, text: corrupt },
    )
    await open(page)

    await expect(page.getByRole('alert')).toContainText("couldn't be loaded")
    expect(await page.evaluate((key) => localStorage.getItem(key), PROJECT_KEY)).toBeNull()
    expect(await page.evaluate((key) => localStorage.getItem(key), RECOVERED_KEY)).toBe(corrupt)

    // An edit on the fresh blank project autosaves to PROJECT_KEY; RECOVERED_KEY must be untouched by it.
    await page.evaluate(() => window.__cbpd!.run((p) => ({ ...p, name: 'After recovery' })))
    await page.waitForFunction(() => window.__cbpd!.getState().saveStatus === 'saved')

    expect(await page.evaluate((key) => localStorage.getItem(key), RECOVERED_KEY)).toBe(corrupt)
  })
})

test.describe('Open Project', () => {
  test('a malformed file shows an error and leaves project and both history stacks unchanged', async ({ page }) => {
    const seeded = project([band('b1', [[0, 40], [80, 40]])])
    await seed(page, seeded)
    const before = await getProject(page)
    const historyBefore = await history(page)

    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('not json{') })

    await expect(page.locator('.project-menu-message')).toContainText('not valid JSON')
    expect(await getProject(page)).toEqual(before)
    expect(await history(page)).toEqual(historyBefore)
  })
})

test.describe('New Project confirmation', () => {
  test('New on a non-blank project asks to confirm; cancelling leaves the project untouched', async ({ page }) => {
    const seeded = project([band('b1', [[0, 40], [80, 40]])])
    await seed(page, seeded)
    const before = await getProject(page)

    await page.getByRole('button', { name: 'New Project', exact: true }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByText('Start a new project?')).toBeVisible()

    await page.getByRole('button', { name: 'Cancel', exact: true }).click()

    await expect(page.getByRole('dialog')).toBeHidden()
    expect(await getProject(page)).toEqual(before)
  })

  test('New on a blank project replaces it without a confirmation', async ({ page }) => {
    await seed(page, project([]))
    const before = await getProject(page)

    await page.getByRole('button', { name: 'New Project', exact: true }).click()

    await expect(page.getByRole('dialog')).toBeHidden()
    const after = await getProject(page)
    expect(after.id).not.toBe(before.id) // a fresh project, not the same instance
    expect(after.objects).toEqual({})
  })
})

test.describe('pagehide flush', () => {
  test('reloading within 100ms of an edit still persists it', async ({ page }) => {
    await seed(page, project([band('b1', [[0, 40], [80, 40]])]))

    await page.evaluate(() => window.__cbpd!.run((p) => ({ ...p, name: 'Flushed on pagehide' })))
    await page.reload() // no wait: exercises the pagehide flush, not the 500ms debounce

    await page.waitForFunction(() => window.__cbpd !== undefined && document.querySelector('svg.canvas-svg') !== null)
    const reloaded = await getProject(page)
    expect(reloaded.name).toBe('Flushed on pagehide')
  })
})

test.describe('multi-tab detection', () => {
  test('another same-origin page writing PROJECT_KEY suspends autosave here as other-tab', async ({ page, context }) => {
    await seed(page, project([band('b1', [[0, 40], [80, 40]])]))

    const otherPage = await context.newPage()
    await open(otherPage)
    await otherPage.evaluate((key) => localStorage.setItem(key, JSON.stringify({ from: 'other tab' })), PROJECT_KEY)

    await page.waitForFunction(() => window.__cbpd!.getState().saveStatus === 'other-tab')
    await expect(page.getByText('Project changed in another tab')).toBeVisible()

    await otherPage.close()
  })
})
