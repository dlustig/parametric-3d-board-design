// SPEC §7.4 Create Motif / Repeat, §7.5 Repeat panel, §7.6 edit context, end
// to end: two drawn bands become a motif (world render unchanged), a 2×2
// then 3×3 repeat, in-place editing of one cell updates every cell, and undo
// walks all the way back.

import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import type { Band, RepeatField } from '../src/domain/model.ts'
import { project } from '../src/domain/test-builders.ts'
import type { XY } from './helpers.ts'
import { cameraShowing, getProject, history, mouseDrag, nextFrame, seed, seededProject, setCamera, toClient, Touch } from './helpers.ts'
import type { Raster } from './raster.ts'
import { rasterizeEditorBoard } from './raster.ts'

const CAMERA = cameraShowing({ x: 0, y: 0 }, { x: 60, y: 120 }, 2)

async function at(page: Page, world: XY): Promise<XY> {
  const c = await toClient(page, world)
  return { x: Math.round(c.x), y: Math.round(c.y) }
}

async function drawBand(page: Page, from: XY, to: XY): Promise<void> {
  const a = await at(page, from)
  const b = await at(page, to)
  await page.mouse.click(a.x, a.y)
  await page.mouse.click(b.x, b.y)
  await page.getByRole('button', { name: 'Finish' }).click()
}

async function boardRaster(page: Page): Promise<Raster> {
  const scratch = await page.context().newPage()
  const raster = await rasterizeEditorBoard(page, scratch, 1) // 1 px/mm: the whole Board fits inside the canvas
  await scratch.close()
  await page.evaluate(() => window.__cbpd!.setTestFlags({ hideChrome: false }))
  await setCamera(page, CAMERA)
  return raster
}

/** Pixels whose channels differ by more than an anti-aliasing blend would. */
function differingPixels(a: Raster, b: Raster): number {
  expect([a.width, a.height]).toEqual([b.width, b.height])
  let n = 0
  for (let k = 0; k < a.data.length; k += 4) {
    if ([0, 1, 2].some((c) => Math.abs(a.data[k + c]! - b.data[k + c]!) > 24)) n++
  }
  return n
}

async function editContext(page: Page): Promise<unknown> {
  return page.evaluate(() => window.__cbpd!.getState().editContext)
}

const mainScenePaths = (page: Page) => page.locator('svg.canvas-svg > g.scene > path')

test.describe('motifs', () => {
  test.skip(({ isMobile }) => isMobile, 'mouse tests run in the desktop projects')

  test('create motif, repeat, edit in place, and undo back to two bands', async ({ page }) => {
    await seed(page, project([]))
    await setCamera(page, CAMERA)
    await page.getByRole('button', { name: 'Band', exact: true }).click()
    await drawBand(page, { x: 40, y: 40 }, { x: 100, y: 40 })
    await drawBand(page, { x: 70, y: 20 }, { x: 70, y: 70 })
    await page.keyboard.press('v')
    expect(await history(page)).toEqual({ past: 2, future: 0 })
    const before = await boardRaster(page)

    // Marquee both bands, then Ctrl+G: one instance, selected; the world render is unchanged.
    await mouseDrag(page, await at(page, { x: 20, y: 5 }), await at(page, { x: 120, y: 90 }))
    expect((await getProject(page)).rootChildren).toHaveLength(2)
    expect(await page.evaluate(() => window.__cbpd!.getState().selection.length)).toBe(2)
    await page.keyboard.press('Control+g')
    let p = await getProject(page)
    expect(p.rootChildren).toHaveLength(1)
    const instanceId = p.rootChildren[0]!
    expect(p.objects[instanceId]!.type).toBe('motif-instance')
    expect(Object.keys(p.motifs)).toHaveLength(1)
    expect(await page.evaluate(() => window.__cbpd!.getState().selection)).toEqual([instanceId])
    expect(await history(page)).toEqual({ past: 3, future: 0 })
    expect(differingPixels(await boardRaster(page), before)).toBe(0)

    // Repeat → 2×2, same id, still selected.
    await page.getByRole('button', { name: 'Repeat', exact: true }).click()
    p = await getProject(page)
    expect(p.objects[instanceId]).toMatchObject({ type: 'repeat', rows: 2, columns: 2 })
    await expect(mainScenePaths(page)).toHaveCount(8)
    expect(await history(page)).toEqual({ past: 4, future: 0 })

    // Rows 3, then Columns 3: live preview before the commit.
    await page.getByLabel('Rows').fill('3')
    await expect(mainScenePaths(page)).toHaveCount(12)
    await page.getByLabel('Columns').fill('3')
    await expect(mainScenePaths(page)).toHaveCount(18)
    await page.getByLabel('Columns').press('Enter')
    expect(await getProject(page).then((q) => q.objects[instanceId])).toMatchObject({ rows: 3, columns: 3 })
    expect(await history(page)).toEqual({ past: 6, future: 0 })

    // Double-click cell (1, 1) → breadcrumb, scrim, and that cell drawn again above it.
    const field = (await getProject(page)).objects[instanceId] as RepeatField
    const cellCentre = { x: field.transform.x + field.stepXMm, y: field.transform.y + field.stepYMm }
    const target = await at(page, cellCentre)
    await page.mouse.dblclick(target.x, target.y)
    const motifName = Object.values((await getProject(page)).motifs)[0]!.name
    await expect(page.getByRole('navigation', { name: 'Edit context' })).toContainText(`Board / Motif: ${motifName}`)
    expect(await editContext(page)).toEqual([{ motifId: field.motifId, path: [{ repeatId: instanceId, row: 1, column: 1 }] }])
    await expect(page.locator('.context-scrim > g.scene > path')).toHaveCount(2)

    // Select the vertical band inside and widen it: all 9 cells follow.
    const vertical = await at(page, { x: cellCentre.x, y: cellCentre.y + 15 })
    await page.mouse.click(vertical.x, vertical.y)
    const selected = await page.evaluate(() => window.__cbpd!.getState().selection)
    expect(selected).toHaveLength(1)
    await page.getByLabel('Width', { exact: true }).fill('10')
    await page.getByLabel('Width', { exact: true }).press('Enter')
    const widths = await page.evaluate(
      (id) => window.__cbpd!.getScene().elements.flatMap((el) => (el.kind === 'band' && el.occurrence.sourceId === id ? [el.occurrence.worldWidth] : [])),
      selected[0]!,
    )
    expect(widths).toEqual(Array(9).fill(10))
    expect(await history(page)).toEqual({ past: 7, future: 0 })

    await page.getByRole('button', { name: 'Done' }).click()
    expect(await editContext(page)).toEqual([])
    await expect(page.getByRole('navigation', { name: 'Edit context' })).toHaveCount(0)

    // Width, columns, rows, Repeat, Create Motif.
    for (let k = 0; k < 5; k++) await page.keyboard.press('Control+z')
    p = await getProject(page)
    expect(await history(page)).toEqual({ past: 2, future: 5 })
    expect(p.motifs).toEqual({})
    expect(p.rootChildren.map((id) => (p.objects[id] as Band).type)).toEqual(['band', 'band'])
  })

  test('Edit Motif enters the instance; tapping another occurrence re-targets; Esc pops', async ({ page }) => {
    await seed(page, project([]))
    await setCamera(page, CAMERA)
    await page.getByRole('button', { name: 'Band', exact: true }).click()
    await drawBand(page, { x: 40, y: 40 }, { x: 100, y: 40 })
    await page.keyboard.press('v')
    await mouseDrag(page, await at(page, { x: 20, y: 5 }), await at(page, { x: 120, y: 90 }))
    await page.getByRole('button', { name: 'Repeat', exact: true }).click() // Create Motif, then Repeat
    const p = await getProject(page)
    const fieldId = p.rootChildren[0]!
    const field = p.objects[fieldId] as RepeatField
    expect(field).toMatchObject({ type: 'repeat', rows: 2, columns: 2 })
    expect(await history(page)).toEqual({ past: 2, future: 0 })

    await page.getByRole('button', { name: 'Edit Motif' }).click()
    expect(await editContext(page)).toEqual([{ motifId: field.motifId, path: [{ repeatId: fieldId, row: 0, column: 0 }] }])

    // Tap the band of cell (1, 0): outside the entered cell, same definition.
    const other = await at(page, { x: field.transform.x, y: field.transform.y + field.stepYMm })
    await page.mouse.click(other.x, other.y)
    await nextFrame(page)
    expect(await editContext(page)).toEqual([{ motifId: field.motifId, path: [{ repeatId: fieldId, row: 1, column: 0 }] }])

    await page.keyboard.press('Escape')
    expect(await editContext(page)).toEqual([])
  })
})

test.describe('motifs (touch)', () => {
  test.skip(({ isMobile }) => !isMobile, 'touch tests run in chromium-touch')

  test('a double-tap on a repeat cell enters it', async ({ page }) => {
    await seed(page, seededProject())
    await setCamera(page, CAMERA)
    const touch = await Touch.attach(page)
    // Repeat rp1 (motif m2, a 40 mm square region) at (40, 250), step 60: cell (0, 1) spans x 100..140.
    const cell = await at(page, { x: 120, y: 270 })
    for (let k = 0; k < 2; k++) {
      await touch.start([cell])
      await touch.end([])
    }
    await nextFrame(page)
    expect(await editContext(page)).toEqual([{ motifId: 'm2', path: [{ repeatId: 'rp1', row: 0, column: 1 }] }])
    await expect(page.getByRole('navigation', { name: 'Edit context' })).toContainText('Board / Motif: m2')
  })
})
