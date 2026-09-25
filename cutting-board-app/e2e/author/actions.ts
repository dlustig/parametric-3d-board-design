// SPEC §13 G6 authoring helpers: each method is ONE user action through the
// real UI (a click, a key, one field typed and entered, a drag), counted.
// Canvas clicks land on whole client pixels, as a person's would, so exact
// geometry has to come from snapping, typed values, or commands, never from
// pointer precision. The test hook is used only to start blank (`blank`)
// and, elsewhere, to read the result — never to author.

import type { Locator, Page } from '@playwright/test'
import { expect } from '@playwright/test'
import { newProject } from '../../src/domain/project.ts'
import type { XY } from '../helpers.ts'
import { nextFrame, open, toClient } from '../helpers.ts'

export type ToolName = 'Select' | 'Hand' | 'Band' | 'Rectangle' | 'Polygon'
type PanelName = 'Selection' | 'Band' | 'Region' | 'Instance' | 'Repeat' | 'Board'

export class Author {
  readonly page: Page
  readonly fixture: string
  private count = 0
  private readonly started: number
  private readonly notes: string[] = []
  private lastTap = 0

  private constructor(page: Page, fixture: string) {
    this.page = page
    this.fixture = fixture
    this.started = Date.now()
  }

  /** Setup, not authoring: open the app and replace the project with a blank mm project. */
  static async blank(page: Page, fixture: string): Promise<Author> {
    await open(page)
    await page.evaluate((p) => window.__cbpd!.replaceProject(p), newProject('mm'))
    await nextFrame(page)
    return new Author(page, fixture)
  }

  get actions(): number {
    return this.count
  }

  /** Records a step that needed a workaround (logged with the result line). */
  workaround(text: string): void {
    this.notes.push(text)
  }

  /** `G6 <name>: <actions> actions, <ms> ms` plus any workarounds, printed to the test output. */
  report(): string {
    const line = `G6 ${this.fixture}: ${this.count} actions, ${Date.now() - this.started} ms`
    const full = [line, ...this.notes.map((n) => `  workaround: ${n}`)].join('\n')
    console.log(full)
    return line
  }

  private async tick(): Promise<void> {
    this.count++
    await nextFrame(this.page)
  }

  /**
   * Separate taps are kept further apart than DOUBLE_TAP_MS (300 ms), as a
   * person's are: automation is fast enough that a tap, a field edit and
   * another tap at the same spot would otherwise read as a double-tap.
   */
  private async tap(c: XY, shift = false): Promise<void> {
    const wait = this.lastTap + 350 - Date.now()
    if (wait > 0) await this.page.waitForTimeout(wait)
    if (shift) await this.page.keyboard.down('Shift')
    await this.page.mouse.click(c.x, c.y)
    if (shift) await this.page.keyboard.up('Shift')
    this.lastTap = Date.now()
  }

  private async at(world: XY): Promise<XY> {
    const c = await toClient(this.page, world)
    return { x: Math.round(c.x), y: Math.round(c.y) }
  }

  private panel(name: PanelName): Locator {
    return this.page.getByRole('region', { name, exact: true })
  }

  // --- View ---

  async fit(): Promise<void> {
    await this.page.getByRole('button', { name: 'Fit', exact: true }).click()
    await this.tick()
  }

  // --- Tools ---

  async tool(name: ToolName): Promise<void> {
    await this.page.getByRole('button', { name, exact: true }).click()
    await this.tick()
  }

  /** The Crossing tool has no rail button in V1: its key is `X` (SPEC §7.4). */
  async crossingTool(): Promise<void> {
    await this.page.keyboard.press('x')
    await expect(this.page.getByRole('toolbar', { name: 'Crossing options' })).toBeVisible()
    await this.tick()
  }

  // --- Canvas ---

  /** A tap at a world point (whole client pixels); what it does depends on the tool. */
  async click(world: XY): Promise<void> {
    await this.tap(await this.at(world))
    await this.tick()
  }

  async shiftClick(world: XY): Promise<void> {
    await this.tap(await this.at(world), true)
    await this.tick()
  }

  async dblclick(world: XY): Promise<void> {
    const c = await this.at(world)
    await this.page.mouse.dblclick(c.x, c.y)
    this.lastTap = Date.now()
    await this.tick()
  }

  /** A press-drag-release: a Rectangle corner to corner, or a Select marquee from empty space. */
  async drag(from: XY, to: XY): Promise<void> {
    const a = await this.at(from)
    const b = await this.at(to)
    await this.page.mouse.move(a.x, a.y)
    await this.page.mouse.down()
    await this.page.mouse.move(b.x, b.y, { steps: 8 })
    await this.page.mouse.up()
    await this.tick()
  }

  async marquee(from: XY, to: XY): Promise<void> {
    await this.drag(from, to)
  }

  // --- Drawing options bar ---

  /** Types the pending segment's Length (one action; placed by `angleEnter`). */
  async length(text: string): Promise<void> {
    await this.page.getByRole('toolbar', { name: 'Drawing options' }).getByLabel('Length', { exact: true }).fill(text)
    await this.tick()
  }

  /** Types the pending segment's Angle and presses Enter, placing the point from the typed values. */
  async angleEnter(text: string): Promise<void> {
    const angle = this.page.getByRole('toolbar', { name: 'Drawing options' }).getByLabel('Angle', { exact: true })
    await angle.fill(text)
    await angle.press('Enter')
    await this.tick()
  }

  async finish(): Promise<void> {
    await this.page.getByRole('button', { name: 'Finish', exact: true }).click()
    await this.tick()
  }

  // --- Fields and buttons ---

  /** Types `text` into the field labelled `label` (optionally inside one inspector panel) and presses Enter. */
  async setField(label: string, text: string, panel?: PanelName): Promise<void> {
    const scope = panel === undefined ? this.page : this.panel(panel)
    const field = scope.getByLabel(label, { exact: true })
    await field.fill(text)
    await field.press('Enter')
    await this.tick()
  }

  async button(name: string, panel?: PanelName): Promise<void> {
    const scope = panel === undefined ? this.page : this.panel(panel)
    await scope.getByRole('button', { name, exact: true }).click()
    await this.tick()
  }

  async check(label: string, on: boolean): Promise<void> {
    const box = this.page.getByLabel(label, { exact: true })
    if (on) await box.check()
    else await box.uncheck()
    await this.tick()
  }

  async choose(label: string, option: string): Promise<void> {
    await this.page.getByLabel(label, { exact: true }).selectOption({ label: option })
    await this.tick()
  }

  async key(key: string): Promise<void> {
    await this.page.keyboard.press(key)
    await this.tick()
  }

  // --- Named commands (each one action) ---

  /** A palette swatch: sets the current material with nothing selected, else assigns it (SPEC §3). */
  async swatch(material: string): Promise<void> {
    await this.button(material)
  }

  async duplicate(): Promise<void> {
    await this.key('ControlOrMeta+d')
  }

  async mirror(axis: 'X' | 'Y'): Promise<void> {
    await this.button(`Mirror ${axis}`, 'Selection')
  }

  async rotate90(direction: 'CW' | 'CCW'): Promise<void> {
    await this.button(`Rotate 90° ${direction}`, 'Selection')
  }

  async rotateBy(deg: string): Promise<void> {
    await this.setField('Rotate by', deg, 'Selection')
  }

  async createMotif(): Promise<void> {
    await this.key('ControlOrMeta+g')
  }

  /** Toolbar Repeat: Create Motif then a 2×2 field, or 2×2 of one selected instance (SPEC §7.4). */
  async repeat(): Promise<void> {
    await this.page.getByRole('banner').getByRole('button', { name: 'Repeat', exact: true }).click()
    await this.tick()
  }

  async enterMotif(): Promise<void> {
    await this.button('Edit Motif')
  }

  async done(): Promise<void> {
    await this.page.getByRole('navigation', { name: 'Edit context' }).getByRole('button', { name: 'Done' }).click()
    await this.tick()
  }

  async offsetCopyWidth(width: string): Promise<void> {
    await this.setField('Offset copy width', width, 'Band')
  }

  async offsetCopy(side: 'left' | 'right'): Promise<void> {
    await this.button(`Offset copy ${side}`, 'Band')
  }

  async nudge(direction: 'Left' | 'Right' | 'Up' | 'Down', shift = false): Promise<void> {
    await this.key(`${shift ? 'Shift+' : ''}Arrow${direction}`)
  }

  async scope(which: 'All instances' | 'This occurrence'): Promise<void> {
    await this.button(which)
  }

  /** Crossing tool: tap the marker at a world intersection point. */
  async toggleCrossingAt(world: XY): Promise<void> {
    await this.click(world)
  }

  async setBoardSize(width: string, height: string): Promise<void> {
    await this.setField('Width', width, 'Board')
    await this.setField('Height', height, 'Board')
  }

  async setBackground(material: string): Promise<void> {
    await this.choose('Background material', material)
  }

  async setGrid(text: string): Promise<void> {
    await this.setField('Grid spacing', text, 'Board')
  }
}
