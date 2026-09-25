// Shell spec §3 theme and §2.1 tokens: dark by default, persisted preference,
// the inline pre-paint script on its own, `system` following the media query,
// and Review Focus 1/2 — corrupt prefs and a throwing localStorage never
// blank the app, and prefs writes never touch saveStatus.

import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { PREFS_KEY } from '../src/editor/layout.ts'
import { open } from './helpers.ts'

const LAYOUT_MODULE = '/src/editor/layout.ts' // the dev server's URL for the same module instance the app uses

async function openWithPrefs(page: Page, raw: string): Promise<void> {
  await page.goto('/')
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [PREFS_KEY, raw] as const)
  await open(page)
}

async function token(page: Page, name: string): Promise<string> {
  return page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name)
}

async function setThemeInApp(page: Page, theme: 'dark' | 'light' | 'system'): Promise<void> {
  await page.evaluate(
    async ([url, t]) => {
      const m = (await import(/* @vite-ignore */ url)) as typeof import('../src/editor/layout.ts')
      m.useLayout.getState().setTheme(t)
    },
    [LAYOUT_MODULE, theme] as const,
  )
}

function collectErrors(page: Page): Error[] {
  const errors: Error[] = []
  page.on('pageerror', (e) => errors.push(e))
  return errors
}

const html = (page: Page) => page.locator('html')

test('dark by default, with the dark token set and the IBM Plex Sans face', async ({ page }) => {
  await open(page)
  await expect(html(page)).toHaveAttribute('data-theme', 'dark')
  expect(await page.evaluate(() => document.documentElement.style.colorScheme)).toBe('dark')
  expect(await token(page, '--panel')).toBe('#202328')
  expect(await token(page, '--acc')).toBe('#3d9bff')
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(32, 35, 40)')
  expect(await page.evaluate(async () => (await document.fonts.ready, document.fonts.check('400 13px "IBM Plex Sans"')))).toBe(true)
})

test('a stored light preference applies the light token set', async ({ page }) => {
  await openWithPrefs(page, JSON.stringify({ state: { theme: 'light' }, version: 1 }))
  await expect(html(page)).toHaveAttribute('data-theme', 'light')
  expect(await token(page, '--panel')).toBe('#ffffff')
  expect(await token(page, '--acc')).toBe('#1f6fe5')
})

test('a theme change applies live and persists across reload', async ({ page }) => {
  await open(page)
  await setThemeInApp(page, 'light')
  await expect(html(page)).toHaveAttribute('data-theme', 'light')
  await page.reload()
  await expect(html(page)).toHaveAttribute('data-theme', 'light')
  expect(JSON.parse((await page.evaluate((k) => localStorage.getItem(k), PREFS_KEY))!)).toMatchObject({ state: { theme: 'light' }, version: 1 })
})

test('the inline script alone sets data-theme before the app runs', async ({ page }) => {
  await page.goto('/')
  await page.evaluate((k) => localStorage.setItem(k, JSON.stringify({ state: { theme: 'light' }, version: 1 })), PREFS_KEY)
  await page.route('**/src/main.tsx', (r) => r.abort())
  await page.goto('/')
  await expect(html(page)).toHaveAttribute('data-theme', 'light')
  expect(await page.evaluate(() => document.documentElement.style.colorScheme)).toBe('light')
  await expect(page.locator('svg.canvas-svg')).toHaveCount(0) // the app really did not run
})

test('the inline script resolves system through the media query', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/')
  await page.evaluate((k) => localStorage.setItem(k, JSON.stringify({ state: { theme: 'system' }, version: 1 })), PREFS_KEY)
  await page.route('**/src/main.tsx', (r) => r.abort())
  await page.goto('/')
  await expect(html(page)).toHaveAttribute('data-theme', 'light')
})

test('system follows the colour-scheme media query live', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await openWithPrefs(page, JSON.stringify({ state: { theme: 'system' }, version: 1 }))
  await expect(html(page)).toHaveAttribute('data-theme', 'light')
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(html(page)).toHaveAttribute('data-theme', 'dark')
  await page.emulateMedia({ colorScheme: 'light' })
  await expect(html(page)).toHaveAttribute('data-theme', 'light')
})

for (const [name, raw] of [
  ['a foreign theme', JSON.stringify({ state: { theme: 'blue', leftTab: 'nope', toolsDocked: 'yes' }, version: 1 })],
  ['non-JSON text', 'not json{'],
  ['another version', JSON.stringify({ state: { theme: 'light' }, version: 7 })],
] as const) {
  test(`corrupt prefs (${name}) load dark without an error`, async ({ page }) => {
    const errors = collectErrors(page)
    await openWithPrefs(page, raw)
    await expect(html(page)).toHaveAttribute('data-theme', 'dark')
    await expect(page.locator('svg.canvas-svg')).toBeVisible()
    expect(errors).toEqual([])
  })
}

test('a throwing localStorage for prefs: loads dark, theme still changes, saveStatus untouched', async ({ page }) => {
  const errors = collectErrors(page)
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
  }, PREFS_KEY)
  await open(page)
  await expect(html(page)).toHaveAttribute('data-theme', 'dark')
  await setThemeInApp(page, 'light')
  await expect(html(page)).toHaveAttribute('data-theme', 'light')
  expect(await page.evaluate(() => window.__cbpd!.getState().saveStatus)).toBe('saved')
  expect(errors).toEqual([])
})
