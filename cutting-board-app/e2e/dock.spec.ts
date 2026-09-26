// Shell §7.1, §7.2 (Task 4): Undock / Dock tools by button and by Shift+T;
// the choice persists across a reload; the canvas controls move to a
// vertical bar at the top-right while the tools are undocked.

import type { Locator, Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { project } from '../src/domain/test-builders.ts'
import { open, seed } from './helpers.ts'

function column(page: Page): Locator {
  return page.locator('.icon-column')
}

function toolBar(page: Page): Locator {
  return page.getByRole('toolbar', { name: 'Tools' })
}

async function box(locator: Locator): Promise<{ x: number; y: number; width: number; height: number }> {
  const b = await locator.boundingBox()
  expect(b, 'the element is laid out').not.toBeNull()
  return b!
}

test('Undock tools floats them in a bottom bar with the wood chip; Dock tools returns them; the canvas controls follow', async ({ page }) => {
  await seed(page, project([])) // current wood: Maple; next Band width 6.35 mm
  const host = await box(page.locator('.canvas-host'))
  await expect(column(page).getByRole('button', { name: 'Select', exact: true })).toBeVisible()
  let controls = await box(page.locator('.canvas-controls'))
  expect(host.y + host.height - (controls.y + controls.height)).toBeLessThan(40) // bottom-right while docked

  await column(page).getByRole('button', { name: 'Undock tools', exact: true }).click()
  await expect(toolBar(page).getByRole('button', { name: 'Select', exact: true })).toBeVisible()
  await expect(toolBar(page).getByRole('button', { name: 'Current wood: Maple', exact: true })).toContainText('Maple · 6.35 mm')
  await expect(column(page).getByRole('button', { name: 'Select', exact: true })).toHaveCount(0)
  await expect(column(page).getByRole('button', { name: 'Undock tools', exact: true })).toHaveCount(0)
  const bottomBar = await box(toolBar(page))
  expect(host.y + host.height - (bottomBar.y + bottomBar.height)).toBeLessThan(30) // 14 px above the canvas bottom
  controls = await box(page.locator('.canvas-controls'))
  expect(controls.y - host.y).toBeLessThan(30) // top …
  expect(host.x + host.width - (controls.x + controls.width)).toBeLessThan(30) // … right
  expect(controls.height).toBeGreaterThan(controls.width) // vertical

  await toolBar(page).getByRole('button', { name: 'Dock tools', exact: true }).click()
  await expect(toolBar(page)).toHaveCount(0)
  await expect(column(page).getByRole('button', { name: 'Select', exact: true })).toBeVisible()
  controls = await box(page.locator('.canvas-controls'))
  expect(host.y + host.height - (controls.y + controls.height)).toBeLessThan(40)
})

test('Shift+T toggles the dock, and the choice survives a reload', async ({ page }) => {
  await open(page)
  await page.keyboard.press('Shift+T')
  await expect(toolBar(page)).toBeVisible()
  await open(page)
  await expect(toolBar(page)).toBeVisible()
  await expect(column(page).getByRole('button', { name: 'Select', exact: true })).toHaveCount(0)
  await page.keyboard.press('Shift+T')
  await expect(toolBar(page)).toHaveCount(0)
  await open(page)
  await expect(column(page).getByRole('button', { name: 'Select', exact: true })).toBeVisible()
})
