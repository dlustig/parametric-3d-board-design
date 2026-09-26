// Shell SPEC §6.1, §6.2, §6.4 and Review Focus 5: the Layers list's two-way
// selection sync and double-click entry, the edit-context title row, Motifs →
// Edit motif for a motif placed only inside another, long names, and the
// performance fixture.

import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import type { Project } from '../src/domain/model.ts'
import { band, instance, project } from '../src/domain/test-builders.ts'
import { cameraShowing, getProject, history, openPane, seed, seededProject, select, setCamera, toClient } from './helpers.ts'

async function state<T>(page: Page, read: (s: ReturnType<NonNullable<Window['__cbpd']>['getState']>) => T): Promise<T> {
  return page.evaluate(`(${read.toString()})(window.__cbpd.getState())`) as Promise<T>
}

/** `outer` placed at the root holds an instance of `inner`; `unused` is never placed. */
function nested(): Project {
  return project(
    [instance('iO', 'outer', { x: 100, y: 100 })],
    [
      { id: 'outer', children: [band('ob', [[0, 0], [40, 0]]), instance('iI', 'inner', { x: 0, y: 30 })] },
      { id: 'inner', children: [band('ib', [[0, 0], [20, 0]], { materialId: 'walnut' })] },
      { id: 'unused', children: [band('ub', [[0, 0], [20, 0]])] },
    ],
  )
}

const LONG = 'A motif with a deliberately long name that keeps going well past the pane width'

test.describe('layers and motifs panes', () => {
  test.skip(({ isMobile }) => isMobile, 'mouse tests run in the desktop projects')

  test('rows list the root topmost first, and selection syncs both ways', async ({ page }) => {
    await seed(page)
    await setCamera(page, cameraShowing({ x: 0, y: 0 }, { x: 60, y: 120 }, 2))
    const list = page.getByRole('listbox', { name: 'Board' })
    await expect(list.getByRole('option')).toHaveText([/m2.*2 × 2/, /m1.*Instance/, /Region.*Maple/, /Band.*Maple/])

    await list.getByRole('option', { name: 'Band, Maple' }).click()
    expect(await state(page, (s) => s.selection)).toEqual(['b1'])
    await list.getByRole('option', { name: 'Region, Maple' }).click({ modifiers: ['Shift'] })
    expect(await state(page, (s) => s.selection)).toEqual(['b1', 'r1'])
    await expect(list.getByRole('option', { name: 'Band, Maple' })).toHaveAttribute('aria-selected', 'true')
    await list.getByRole('option', { name: 'Band, Maple' }).click({ modifiers: ['ControlOrMeta'] })
    expect(await state(page, (s) => s.selection)).toEqual(['r1'])

    await select(page, ['i1'])
    await expect(list.getByRole('option', { name: 'm1, Instance' })).toHaveAttribute('aria-selected', 'true')
    await expect(list.getByRole('option', { name: 'Region, Maple' })).toHaveAttribute('aria-selected', 'false')

    const c = await toClient(page, { x: 80, y: 40 }) // on b1
    await page.mouse.click(Math.round(c.x), Math.round(c.y))
    await expect(list.getByRole('option', { name: 'Band, Maple' })).toHaveAttribute('aria-selected', 'true')
    await expect(list.getByRole('option', { name: 'm1, Instance' })).toHaveAttribute('aria-selected', 'false')
  })

  test('arrow keys move focus between rows without moving geometry; Enter and Space select', async ({ page }) => {
    await seed(page)
    const list = page.getByRole('listbox', { name: 'Board' })
    const row = (name: string) => list.getByRole('option', { name, exact: true })
    await row('Region, Maple').click()
    const before = await getProject(page)

    await page.keyboard.press('ArrowDown')
    await expect(row('Band, Maple')).toBeFocused()
    expect(await getProject(page)).toEqual(before)
    expect(await history(page)).toEqual({ past: 0, future: 0 })
    expect(await state(page, (s) => s.selection)).toEqual(['r1']) // focus moves, the selection doesn't

    await page.keyboard.press('Enter')
    expect(await state(page, (s) => s.selection)).toEqual(['b1'])
    await page.keyboard.press('ArrowUp')
    await expect(row('Region, Maple')).toBeFocused()
    await page.keyboard.press('Space')
    expect(await state(page, (s) => s.selection)).toEqual(['r1'])

    await page.keyboard.press('Home')
    await expect(row('m2, 2 × 2')).toBeFocused()
    await page.keyboard.press('End')
    await expect(row('Band, Maple')).toBeFocused()
    await page.keyboard.press('ArrowDown') // no wrap at the last row
    await expect(row('Band, Maple')).toBeFocused()
    expect(await getProject(page)).toEqual(before)
    await expect(list.locator('[tabindex="0"]')).toHaveCount(1) // one Tab stop: the focused row
  })

  test('double-clicking a repeat row enters its definition; the back button pops out', async ({ page }) => {
    await seed(page)
    await page.getByRole('option', { name: 'm2, 2 × 2' }).dblclick()
    expect(await state(page, (s) => s.editContext)).toEqual([{ motifId: 'm2', path: [{ repeatId: 'rp1', row: 0, column: 0 }] }])
    expect(await state(page, (s) => s.selection)).toEqual([])
    await expect(page.getByRole('navigation', { name: 'Edit context' })).toBeVisible()
    await expect(page.getByText('Changes apply to all 4 occurrences')).toBeVisible()
    await expect(page.getByRole('listbox', { name: 'm2' }).getByRole('option')).toHaveText([/Region.*Maple/]) // the definition's own children
    await expect(page.locator('.left-pane').getByText('Board', { exact: true })).toHaveCount(0)

    await page.getByRole('button', { name: 'Back to Test' }).click()
    expect(await state(page, (s) => s.editContext)).toEqual([])
    await expect(page.getByRole('navigation', { name: 'Edit context' })).toHaveCount(0)
    await expect(page.getByRole('listbox', { name: 'Board' })).toBeVisible()
  })

  test('a single occurrence has no occurrence note', async ({ page }) => {
    await seed(page)
    await page.getByRole('option', { name: 'm1, Instance' }).dblclick()
    expect(await state(page, (s) => s.editContext)).toEqual([{ motifId: 'm1', path: [{ instanceId: 'i1' }] }])
    await expect(page.getByRole('listbox', { name: 'm1' }).getByRole('option')).toHaveText([/Band.*Walnut/, /Band.*Maple/])
    await expect(page.getByText(/Changes apply to all/)).toHaveCount(0)
  })

  test('Motifs → Edit motif enters a motif placed only inside another motif', async ({ page }) => {
    await seed(page, nested())
    await openPane(page, 'Motifs')
    await expect(page.getByRole('listitem', { name: 'inner' })).toContainText('Used 1 time')
    const unused = page.getByRole('listitem', { name: 'unused' })
    await expect(unused).toContainText('Not placed')
    await expect(unused.getByRole('button', { name: 'Edit motif' })).toBeDisabled()

    await page.getByRole('listitem', { name: 'inner' }).getByRole('button', { name: 'Edit motif' }).click()
    expect(await state(page, (s) => s.editContext)).toEqual([
      { motifId: 'outer', path: [{ instanceId: 'iO' }] },
      { motifId: 'inner', path: [{ instanceId: 'iI' }] },
    ])
    await expect(page.getByRole('navigation', { name: 'Edit context' })).toBeVisible()
    await openPane(page, 'Layers')
    await expect(page.getByRole('button', { name: 'Back to outer' })).toBeVisible()
    await expect(page.getByRole('listbox').getByRole('option')).toHaveText([/Band.*Walnut/])
  })

  test('Rename in the Motifs pane renames the definition in one history entry; Esc reverts', async ({ page }) => {
    await seed(page, nested())
    await openPane(page, 'Motifs')
    const row = page.getByRole('listitem', { name: 'inner' })
    await row.getByRole('button', { name: 'Rename motif' }).click()
    const field = page.getByRole('textbox', { name: 'Motif name' })
    await field.fill('Draft')
    await field.press('Escape')
    await expect(field).toHaveCount(0)
    expect(await page.evaluate(() => window.__cbpd!.getProject().motifs['inner']!.name)).toBe('inner')

    await row.getByRole('button', { name: 'Rename motif' }).click()
    await field.fill('Knot')
    await field.press('Enter')
    expect(await page.evaluate(() => window.__cbpd!.getProject().motifs['inner']!.name)).toBe('Knot')
    expect(await page.evaluate(() => window.__cbpd!.getHistoryLengths().past)).toBe(1)
  })

  test('an empty or blank motif name reverts, as the project Rename does', async ({ page }) => {
    await seed(page, nested())
    await openPane(page, 'Motifs')
    const row = page.getByRole('listitem', { name: 'inner' })
    await row.getByRole('button', { name: 'Rename motif' }).click()
    const field = page.getByRole('textbox', { name: 'Motif name' })
    await field.fill('   ')
    await field.press('Enter')
    await expect(field).toHaveCount(0)
    expect(await page.evaluate(() => window.__cbpd!.getProject().motifs['inner']!.name)).toBe('inner')

    await select(page, ['iO'])
    const inspectorField = page.getByLabel('Motif name', { exact: true })
    await inspectorField.fill('')
    await inspectorField.press('Enter')
    await expect(inspectorField).toHaveValue('outer')
    expect(await page.evaluate(() => window.__cbpd!.getProject().motifs['outer']!.name)).toBe('outer')
    expect(await history(page)).toEqual({ past: 0, future: 0 })
  })

  test('Review Focus 5: an 80-character motif name truncates with its full text as a title, with no horizontal overflow', async ({ page }) => {
    const p = seededProject()
    p.motifs['m1']!.name = LONG
    await seed(page, p)
    const name = page.locator('.layer-row .layer-name', { hasText: LONG })
    await expect(name).toHaveAttribute('title', LONG)
    expect(await name.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true)
    expect(await page.locator('.layers-pane').evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)

    await openPane(page, 'Motifs')
    const motifName = page.locator('.motif-name', { hasText: LONG })
    await expect(motifName).toHaveAttribute('title', LONG)
    expect(await motifName.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true)
    expect(await page.locator('.motifs-pane').evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })

  test('with the performance fixture loaded, Layers renders and a row click selects the field', async ({ page }) => {
    await seed(page)
    await page.evaluate(() => window.__cbpd!.replaceProject(window.__cbpd!.performanceFixture()))
    const row = page.getByRole('option', { name: 'Lattice unit, 15 × 15' })
    await row.click()
    await expect(row).toHaveAttribute('aria-selected', 'true')
    expect(await state(page, (s) => s.selection)).toEqual(['interlace-field'])
    await openPane(page, 'Motifs')
    await expect(page.getByRole('listitem', { name: 'Lattice unit' })).toContainText('Used 225 times')
  })
})
