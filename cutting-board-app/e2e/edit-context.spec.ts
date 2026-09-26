// Shell spec §9.7 and §8: the edit-context pill (Editing <name>, the
// occurrence count, Done), the 2 px accent frame, the top-of-canvas stack
// (a bar 8 px under the pill), the --paste scrim at 62%, the entered
// occurrence's dashed outline, and the top-bar breadcrumb.

import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import type { Project, Step } from '../src/domain/model.ts'
import { band, instance, project } from '../src/domain/test-builders.ts'
import { expectClose, nextFrame, seed, seededProject } from './helpers.ts'

/** i1 (motif m1) at the root; m1 holds i2 (motif m2) and a band; m2 holds one band. */
function nestedProject(): Project {
  return project(
    [instance('i1', 'm1', { x: 100, y: 100 })],
    [
      { id: 'm1', children: [instance('i2', 'm2', { x: 20, y: 0 }), band('m1b', [[-40, 0], [0, 0]])] },
      { id: 'm2', children: [band('m2b', [[0, -20], [0, 20]], { materialId: 'walnut' })] },
    ],
  )
}

async function enter(page: Page, levels: Array<{ motifId: string; path: Step[] }>): Promise<void> {
  await page.evaluate((ls) => {
    const s = window.__cbpd!.getState()
    for (const l of ls) s.enterContext(l)
  }, levels)
  await nextFrame(page)
}

async function editContext(page: Page): Promise<unknown> {
  return page.evaluate(() => window.__cbpd!.getState().editContext)
}

async function token(page: Page, name: string): Promise<string> {
  return page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name)
}

/** '#3d9bff' → 'rgb(61, 155, 255)', the form getComputedStyle reports. */
function rgbOf(hex: string): string {
  return `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`
}

const REPEAT_CELL = [{ motifId: 'm2', path: [{ repeatId: 'rp1', row: 0, column: 1 }] }]

test.describe('edit context', () => {
  test('the pill names the motif, counts a repeat’s occurrences, and Done pops one level', async ({ page }) => {
    await seed(page, seededProject())
    await enter(page, REPEAT_CELL)
    const pill = page.getByRole('navigation', { name: 'Edit context' })
    await expect(pill).toContainText('Editing m2')
    await expect(pill).toContainText('· 4 occurrences') // rp1 is 2 × 2
    await pill.getByRole('button', { name: 'Done' }).click()
    expect(await editContext(page)).toEqual([])
    await expect(pill).toHaveCount(0)
  })

  test('a motif placed once shows no occurrence count', async ({ page }) => {
    await seed(page, seededProject())
    await enter(page, [{ motifId: 'm1', path: [{ instanceId: 'i1' }] }])
    const pill = page.getByRole('navigation', { name: 'Edit context' })
    await expect(pill).toContainText('Editing m1')
    await expect(pill).not.toContainText('occurrences')
  })

  test('the canvas has a 2 px inset accent frame only inside a definition', async ({ page }) => {
    await seed(page, seededProject())
    const host = page.locator('main.canvas-host')
    await expect(host).not.toHaveClass(/\bin-context\b/)
    await enter(page, REPEAT_CELL)
    await expect(host).toHaveClass(/\bin-context\b/)
    const shadow = await host.evaluate((el) => getComputedStyle(el, '::after').boxShadow)
    expect(shadow).toContain(rgbOf(await token(page, '--acc')))
    expect(shadow).toContain('0px 0px 0px 2px inset')
  })

  test('the scrim is --paste at 62% and the entered cell has a dashed accent outline of its painted bounds', async ({ page }) => {
    await seed(page, seededProject())
    await enter(page, REPEAT_CELL)
    const scrim = await page.locator('.context-scrim-rect').evaluate((el) => ({ fill: getComputedStyle(el).fill, opacity: getComputedStyle(el).opacity }))
    expect(scrim).toEqual({ fill: rgbOf(await token(page, '--paste')), opacity: '0.62' })

    const outline = page.locator('.context-outline')
    await expect(outline).toHaveCount(1)
    // m2 is a 40 mm square at the cell origin; rp1 sits at (40, 250) with step 60, so cell (0, 1) spans x 100..140, y 250..290.
    const [x, y, w, h] = await outline.evaluate((el) => ['x', 'y', 'width', 'height'].map((a) => Number(el.getAttribute(a))))
    expectClose(x!, 100, 1e-9)
    expectClose(y!, 250, 1e-9)
    expectClose(w!, 40, 1e-9)
    expectClose(h!, 40, 1e-9)
    expect(await outline.evaluate((el) => getComputedStyle(el).stroke)).toBe(rgbOf(await token(page, '--acc')))
    expect(await outline.getAttribute('stroke-dasharray')).not.toBeNull()
  })

  test('the actions bar sits 8 px below the pill, centred with it', async ({ page }) => {
    await seed(page, seededProject())
    await enter(page, REPEAT_CELL)
    const pill = (await page.getByRole('navigation', { name: 'Edit context' }).boundingBox())!
    const bar = (await page.getByRole('toolbar', { name: 'Selection actions' }).boundingBox())!
    expectClose(bar.y - (pill.y + pill.height), 8, 1)
    expectClose(bar.x + bar.width / 2, pill.x + pill.width / 2, 1)
  })

  test('top-bar breadcrumb: an earlier level pops to it, the project name pops to the root, the menu stays reachable', async ({ page }) => {
    await seed(page, nestedProject())
    await enter(page, [{ motifId: 'm1', path: [{ instanceId: 'i1' }] }, { motifId: 'm2', path: [{ instanceId: 'i2' }] }])
    const crumbs = page.getByRole('navigation', { name: 'Breadcrumb' })
    await expect(crumbs).toContainText('Test')
    await expect(crumbs).toContainText('m1')
    await expect(crumbs).toContainText('m2')
    await expect(crumbs.getByRole('button', { name: 'm2', exact: true })).toHaveCount(0) // the last level is plain text

    await crumbs.getByRole('button', { name: 'm1', exact: true }).click()
    expect(await editContext(page)).toEqual([{ motifId: 'm1', path: [{ instanceId: 'i1' }] }])

    await page.getByRole('button', { name: 'Project menu', exact: true }).click()
    await expect(page.getByRole('menuitem', { name: /^New project/ })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('menuitem', { name: /^New project/ })).toHaveCount(0)

    await enter(page, [{ motifId: 'm2', path: [{ instanceId: 'i2' }] }])
    await crumbs.getByRole('button', { name: 'Test', exact: true }).click()
    expect(await editContext(page)).toEqual([])
    await expect(crumbs).toHaveCount(0)
    await expect(page.locator('main.canvas-host')).not.toHaveClass(/\bin-context\b/)
  })

  test('a long motif name truncates in the pill and never scrolls the page sideways', async ({ page }) => {
    const p = nestedProject()
    const long = 'Herringbone with a walnut border and maple accents, version seven, final final (really)'
    p.motifs.m2 = { ...p.motifs.m2!, name: long }
    await seed(page, p)
    await enter(page, [{ motifId: 'm1', path: [{ instanceId: 'i1' }] }, { motifId: 'm2', path: [{ instanceId: 'i2' }] }])
    const pill = page.getByRole('navigation', { name: 'Edit context' })
    await expect(pill.locator('.edit-pill-name')).toHaveAttribute('title', `Editing ${long}`)
    const host = (await page.locator('main.canvas-host').boundingBox())!
    const box = (await pill.boundingBox())!
    expect(box.width).toBeLessThanOrEqual(host.width - 24)
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0)
  })
})
