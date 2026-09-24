// SPEC §3 materials palette and §7.4 keyboard dispatch, end to end.

import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import type { Band, Material, Project } from '../src/domain/model.ts'
import { band, instance, MAT2, project } from '../src/domain/test-builders.ts'
import { getProject, history, seed, select } from './helpers.ts'

function bandOf(p: Project, id: string): Band {
  return p.objects[id] as Band
}

function materialId(p: Project, name: string): string {
  return p.materials.find((m) => m.name === name)!.id
}

async function tool(page: Page): Promise<string> {
  return page.evaluate(() => window.__cbpd!.getState().tool)
}

async function selection(page: Page): Promise<string[]> {
  return page.evaluate(() => window.__cbpd!.getState().selection)
}

/** Maple + Walnut (test-builders' default palette) plus a Cherry material, for the Replace test. */
function projectWithCherry(root: Band[]): Project {
  const base = project(root)
  const cherry: Material = { id: 'cherry', name: 'Cherry', color: '#A8543A' }
  return { ...base, materials: [...base.materials, cherry] }
}

test.describe('materials palette', () => {
  test('clicking a swatch with two Bands selected recolours both in one history entry', async ({ page }) => {
    await seed(page, project([band('b1', [[0, 40], [80, 40]]), band('b2', [[0, 80], [80, 80]])]))
    await select(page, ['b1', 'b2'])

    await page.getByRole('button', { name: 'Walnut', exact: true }).click()

    const p = await getProject(page)
    const walnut = materialId(p, 'Walnut')
    expect(bandOf(p, 'b1').materialId).toBe(walnut)
    expect(bandOf(p, 'b2').materialId).toBe(walnut)
    expect(await history(page)).toEqual({ past: 1, future: 0 })
  })

  test('clicking a swatch with an empty selection sets the current material instead', async ({ page }) => {
    await seed(page, project([]))
    const before = await page.evaluate(() => window.__cbpd!.getState().currentMaterialId)

    await page.getByRole('button', { name: 'Walnut', exact: true }).click()

    const p = await getProject(page)
    const walnut = materialId(p, 'Walnut')
    const after = await page.evaluate(() => window.__cbpd!.getState().currentMaterialId)
    expect(after).toBe(walnut)
    expect(after).not.toBe(before)
    expect(await history(page)).toEqual({ past: 0, future: 0 }) // setting the current material is not a project edit
  })

  test('Replace everywhere updates every occurrence of the source material in one history entry', async ({ page }) => {
    const seeded = projectWithCherry([band('b1', [[0, 40], [80, 40]]), band('b2', [[0, 80], [80, 80]], { materialId: MAT2 })])
    await seed(page, seeded)

    await page.getByRole('button', { name: 'Edit Maple', exact: true }).click()
    await page.getByLabel('Replace everywhere with').selectOption({ label: 'Cherry' })
    await page.getByRole('button', { name: 'Replace', exact: true }).click()

    const p = await getProject(page)
    expect(bandOf(p, 'b1').materialId).toBe('cherry') // was Maple
    expect(bandOf(p, 'b2').materialId).toBe(MAT2) // unaffected: was already Walnut
    expect(await history(page)).toEqual({ past: 1, future: 0 })
  })

  test('a selection of only instances/repeats shows the recolour hint and swatches do nothing', async ({ page }) => {
    const seeded = project([instance('i1', 'm1')], [{ id: 'm1', children: [band('mb1', [[-10, 0], [10, 0]])] }])
    await seed(page, seeded)
    await select(page, ['i1'])

    await expect(page.getByText('Edit the motif to recolour')).toBeVisible()
    // The swatch is disabled outright — clicking it is a no-op by construction.
    await expect(page.getByRole('button', { name: 'Walnut', exact: true })).toBeDisabled()
  })
})

test.describe('keyboard dispatch ignores fields', () => {
  test('typing "b" in the project-name field does not switch tools', async ({ page }) => {
    await seed(page, project([]))
    expect(await tool(page)).toBe('select')

    const name = page.getByLabel('Name', { exact: true })
    await name.click()
    await name.press('b')

    expect(await tool(page)).toBe('select')
    await expect(name).toHaveValue(/b/)
  })

  test('Backspace in a field does not delete the selection', async ({ page }) => {
    await seed(page, project([band('b1', [[0, 40], [80, 40]])]))
    await select(page, ['b1'])

    const width = page.getByLabel('Width', { exact: true })
    await width.click()
    await width.press('Backspace')

    expect(await selection(page)).toEqual(['b1'])
    const p = await getProject(page)
    expect(p.objects.b1).toBeDefined()
    expect(await history(page)).toEqual({ past: 0, future: 0 })
  })
})

test.describe('selection commands', () => {
  test('Delete removes the selected objects and clears the selection', async ({ page }) => {
    await seed(page, project([band('b1', [[0, 40], [80, 40]]), band('b2', [[0, 80], [80, 80]])]))
    await select(page, ['b1'])
    await page.keyboard.press('Delete')

    const p = await getProject(page)
    expect(p.objects.b1).toBeUndefined()
    expect(p.rootChildren).toEqual(['b2'])
    expect(await selection(page)).toEqual([])
    expect(await history(page)).toEqual({ past: 1, future: 0 })
  })

  test('Ctrl/Cmd+D duplicates the selection in place and selects the copies', async ({ page }) => {
    await seed(page, project([band('b1', [[0, 40], [80, 40]])]))
    await select(page, ['b1'])
    await page.keyboard.press('ControlOrMeta+d')

    const p = await getProject(page)
    expect(p.rootChildren).toHaveLength(2)
    const newId = p.rootChildren[1]!
    const sel = await selection(page)
    expect(sel).toEqual([newId])
    expect(bandOf(p, newId).points.map((pt) => [pt.x, pt.y])).toEqual(bandOf(p, 'b1').points.map((pt) => [pt.x, pt.y]))
  })

  test('Ctrl/Cmd+C then Ctrl/Cmd+V pastes a copy in place', async ({ page }) => {
    await seed(page, project([band('b1', [[0, 40], [80, 40]])]))
    await select(page, ['b1'])
    await page.keyboard.press('ControlOrMeta+c')
    await page.keyboard.press('ControlOrMeta+v')

    const p = await getProject(page)
    expect(p.rootChildren).toHaveLength(2)
    const pastedId = p.rootChildren[1]!
    expect(pastedId).not.toBe('b1')
    expect(bandOf(p, pastedId).points.map((pt) => [pt.x, pt.y])).toEqual([[0, 40], [80, 40]])
  })

  test('Escape order: clears the selection before popping the edit context or changing tool', async ({ page }) => {
    await seed(page, project([band('b1', [[0, 40], [80, 40]])]))
    await select(page, ['b1'])
    await page.getByRole('button', { name: 'Band', exact: true }).click()
    await page.getByRole('button', { name: 'Select', exact: true }).click()
    await select(page, ['b1'])

    await page.keyboard.press('Escape')
    expect(await selection(page)).toEqual([])
    expect(await tool(page)).toBe('select')
  })

  test('tool keys switch tools, and arrow nudge moves the selection by one grid step', async ({ page }) => {
    await seed(page, project([band('b1', [[0, 40], [80, 40]])]))
    await page.getByRole('button', { name: 'Select', exact: true }).click()
    await page.keyboard.press('b')
    expect(await tool(page)).toBe('band')
    await page.keyboard.press('v')
    expect(await tool(page)).toBe('select')

    await select(page, ['b1'])
    const gridMm = await page.evaluate(() => window.__cbpd!.getState().gridMm)
    const before = bandOf(await getProject(page), 'b1').points[0]!
    await page.keyboard.press('ArrowRight')
    const after = bandOf(await getProject(page), 'b1').points[0]!
    expect(after.x - before.x).toBeCloseTo(gridMm, 6)
    expect(after.y - before.y).toBeCloseTo(0, 6)
  })
})
