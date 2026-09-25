// SPEC §13 G9: performance on Fixture F's performance variant
// (`interlacePerformance()`, ≥ 1000 occurrences) plus one root band across
// the field. Run it with `pnpm perf`: a production build (`vite build --mode
// perf`, which keeps the test hook: it installs in any mode but
// 'production') served by `vite preview`, chromium, one worker, three
// repeats (`playwright.perf.config.ts`). The suite's own dev server runs
// development React, which overstates rendering several times, so plain
// `pnpm test:e2e` skips this spec unless PERF=1.
//
// Two tests, each printing one JSON line per run (take the median of the
// three runs' values). The targets (drag frame median ≤ 16 ms, p95 ≤ 50 ms)
// are reported, not asserted — a miss is a finding (SPEC §13); only the
// measurement's own sanity is checked.
//   `G9 {…}`       typical: drag the root band (one occurrence moves), drag
//                  commit, arrow nudge, one Width keystroke on it
//   `G9-worst {…}` worst case: drag the repeat field (every occurrence
//                  moves), one Width keystroke on a lattice-motif band
//                  (every cell's occurrence changes)
//
// Every event is timed by an in-page probe: `start` at the event's capture
// phase on window (before the app's listeners), `end` at the bubble phase on
// window of the event that ends the app's handling (after every handler and
// React's re-render, synchronous here: Moveable renders through flushSync),
// then `raf` in the next animation frame and `painted` in a task queued from
// that frame's rAF, which runs after its style/layout/paint.
//
//   frame work    = (end − start) + (painted − raf): main-thread time one
//                   drag update costs, not counting any wait for the next
//                   frame — the gate metric
//   frame shown   = painted − the last rAF timestamp at or before `start`:
//                   from the start of the frame the input arrived in to the
//                   paint that shows it, so it includes the wait for the
//                   next frame; never below one refresh interval
//   latency       = painted − start (commit, nudge, inspector keystroke)
//
// PERF_PROFILE=<path> records a CDP CPU profile of 10 typical drag moves instead.

import { writeFileSync } from 'node:fs'
import os from 'node:os'
import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { band } from '../src/domain/test-builders.ts'
import type { XY } from './helpers.ts'
import { open, select, snapOff, toClient } from './helpers.ts'

test.skip(process.env.PERF !== '1', 'G9 performance runs with `pnpm perf` (PERF=1, production build), not in the default e2e suite')
test.skip(({ browserName, isMobile }) => browserName !== 'chromium' || isMobile, 'G9 is measured in desktop chromium only')

const DRAG_MOVES = 60
const ROOT_BAND = 'perf-root'
const FIELD = 'interlace-field'

type Sample = { start: number; end: number; raf: number; painted: number }
type Probe = { samples: Array<Partial<Sample>>; frames: number[]; running: boolean }
type PerfWindow = Window & { __perf?: Probe }

function median(xs: number[]): number {
  const s = xs.toSorted((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2
}

/** Nearest-rank p-th percentile. */
function percentile(xs: number[], p: number): number {
  const s = xs.toSorted((a, b) => a - b)
  return s[Math.max(0, Math.ceil((p / 100) * s.length) - 1)]!
}

function round(n: number): number {
  return Math.round(n * 10) / 10
}

/** Resolves after the next frame has painted. */
async function afterPaint(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((r) =>
        requestAnimationFrame(() => {
          const ch = new MessageChannel()
          ch.port1.onmessage = () => r()
          ch.port2.postMessage(null)
        }),
      ),
  )
}

/** Starts sampling every `startType` … `endType` pair (see the header), and recording rAF timestamps. */
async function startProbe(page: Page, startType: string, endType: string): Promise<void> {
  await page.evaluate(
    ({ startT, endT }) => {
      const perf: Probe = { samples: [], frames: [], running: true }
      ;(window as PerfWindow).__perf = perf
      let open: Partial<Sample> | null = null
      window.addEventListener(
        startT,
        () => {
          if (!perf.running) return
          const sample: Partial<Sample> = { start: performance.now() }
          open = sample
          perf.samples.push(sample)
          requestAnimationFrame(() => {
            sample.raf = performance.now()
            const ch = new MessageChannel()
            ch.port1.onmessage = () => (sample.painted = performance.now())
            ch.port2.postMessage(null)
          })
        },
        true,
      )
      window.addEventListener(endT, () => {
        if (open !== null) open.end = performance.now()
        open = null
      })
      const tick = (t: number): void => {
        if (!perf.running) return
        perf.frames.push(t)
        requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    },
    { startT: startType, endT: endType },
  )
}

/** Stops the probe once every sample is complete. */
async function stopProbe(page: Page, count: number): Promise<{ samples: Sample[]; frames: number[] }> {
  await page.waitForFunction(
    (n) => {
      const s = (window as PerfWindow).__perf!.samples
      return s.length >= n && s.every((x) => x.end !== undefined && x.painted !== undefined)
    },
    count,
    { timeout: 600_000 },
  )
  return page.evaluate(() => {
    const perf = (window as PerfWindow).__perf!
    perf.running = false
    return { samples: perf.samples as Sample[], frames: perf.frames }
  })
}

/** Loads the fixture plus the root band, fits the view, and returns the scene's counts. */
async function seedFixture(page: Page): Promise<{ occurrences: number; listed: number; eligible: number; patches: number; sceneDomElements: number }> {
  await open(page)
  // A root band across the field, painted last: dragging it moves its crossings with every lattice strand it passes, so each drag frame has crossings to re-find and patches to rebuild.
  const rootBand = band(ROOT_BAND, [[15, 201.3], [384, 201.3]], { widthMm: 6, materialId: 'walnut' })
  await page.evaluate((b) => {
    const p = window.__cbpd!.performanceFixture()
    p.objects[b.id] = b
    p.rootChildren.push(b.id)
    window.__cbpd!.replaceProject(p)
  }, rootBand)
  await page.getByRole('button', { name: 'Fit', exact: true }).click()
  await snapOff(page) // see measureDrag
  await afterPaint(page)

  const counts = await page.evaluate(() => {
    const s = window.__cbpd!.getScene()
    return {
      occurrences: s.elements.filter((e) => e.kind !== 'patch').length,
      listed: s.intersections.length,
      eligible: s.intersections.filter((i) => i.cls === 'eligible').length,
      patches: s.elements.filter((e) => e.kind === 'patch').length,
      sceneDomElements: document.querySelectorAll('svg.canvas-svg g.scene *').length,
    }
  })
  expect(counts.occurrences).toBeGreaterThanOrEqual(1000)
  return counts
}

type DragResult = { work: number[]; shown: number[] }

/**
 * Presses at `grab` on the selected object, drags `moves` frames (one move
 * per frame; a sample runs pointermove → mousemove, as Moveable follows mouse
 * events), and leaves the button down. Snapping must be off: a snapped drag
 * repeats the previous frame's geometry for most 2 px moves (26 distinct of
 * 60 in a check), and a repeated frame costs almost nothing once
 * classification is incremental, so it would understate the frame time.
 * Each measured frame is checked to change the preview.
 */
async function measureDrag(page: Page, grab: XY, moves: number, profilePath?: string): Promise<DragResult> {
  expect(await page.evaluate(() => window.__cbpd!.getState().snapEnabled)).toBe(false)
  await page.mouse.move(grab.x, grab.y)
  await page.mouse.down()
  await page.mouse.move(grab.x + 1, grab.y) // starts the drag; not measured
  await afterPaint(page)

  const cdp = profilePath === undefined ? null : await page.context().newCDPSession(page)
  if (cdp !== null) {
    await cdp.send('Profiler.enable')
    await cdp.send('Profiler.setSamplingInterval', { interval: 200 })
    await cdp.send('Profiler.start')
  }
  await startProbe(page, 'pointermove', 'mousemove')
  const previews = new Set<string>()
  for (let k = 1; k <= moves; k++) {
    await page.mouse.move(grab.x + 1 + k * 2, grab.y + (k % 2))
    await afterPaint(page)
    previews.add(await page.evaluate(() => {
      const s = window.__cbpd!.getState()
      return JSON.stringify(s.preview?.next.objects[s.selection[0]!])
    }))
  }
  const drag = await stopProbe(page, moves)
  expect(previews.size, 'every measured frame moves the selection').toBe(moves)
  if (cdp !== null) {
    const { profile } = await cdp.send('Profiler.stop')
    writeFileSync(profilePath!, JSON.stringify(profile))
  }
  expect(drag.samples).toHaveLength(moves)
  expect(await page.evaluate(() => window.__cbpd!.getState().preview !== null)).toBe(true)
  return {
    work: drag.samples.map((s) => s.end - s.start + (s.painted - s.raf)),
    shown: drag.samples.map((s) => s.painted - (drag.frames.findLast((f) => f <= s.start) ?? s.start)),
  }
}

/** Mouse up on the dragged selection: pointerup → mouseup (Moveable's drag end: commit() rematches the preview) → paint. */
async function measureDragCommit(page: Page): Promise<Sample> {
  await startProbe(page, 'pointerup', 'mouseup')
  await page.mouse.up()
  return (await stopProbe(page, 1)).samples[0]!
}

/** One keystroke replacing the selected band's Width → its preview on screen; then Esc. */
async function measureWidthKeystroke(page: Page): Promise<Sample> {
  const width = page.getByLabel('Width', { exact: true })
  await width.focus()
  await width.selectText()
  await afterPaint(page)
  await startProbe(page, 'input', 'input')
  await page.keyboard.type('5')
  const [sample] = (await stopProbe(page, 1)).samples
  expect(await page.evaluate(() => window.__cbpd!.getState().preview !== null)).toBe(true)
  await page.keyboard.press('Escape')
  await afterPaint(page)
  return sample!
}

function machine(): string {
  const cpu = os.cpus()
  return `${cpu[0]?.model ?? 'unknown'}, ${cpu.length} logical cores, ${os.platform()} ${os.release()}`
}

function dragStats(drag: DragResult): Record<string, number> {
  return {
    dragMoves: drag.work.length,
    dragWorkMedianMs: round(median(drag.work)),
    dragWorkP95Ms: round(percentile(drag.work, 95)),
    dragShownMedianMs: round(median(drag.shown)),
    dragShownP95Ms: round(percentile(drag.shown, 95)),
  }
}

function toPaint(s: Sample): number {
  return round(s.painted - s.start)
}

test('G9: interlace performance fixture', async ({ page }) => {
  test.setTimeout(3_600_000)
  const counts = await seedFixture(page)

  await select(page, [ROOT_BAND])
  await afterPaint(page)
  const profilePath = process.env.PERF_PROFILE
  const drag = await measureDrag(page, await toClient(page, { x: 120, y: 201.3 }), profilePath === undefined ? DRAG_MOVES : 10, profilePath)
  expect(await page.evaluate(() => window.__cbpd!.getState().selection)).toEqual([ROOT_BAND])
  const dragCommit = await measureDragCommit(page)
  expect(await page.evaluate(() => window.__cbpd!.getHistoryLengths().past)).toBe(1)

  // --- Commit: an arrow nudge is `run(translateObjects)`. ---
  await page.locator('.canvas').focus()
  await startProbe(page, 'keydown', 'keydown')
  await page.keyboard.press('ArrowRight')
  const [nudge] = (await stopProbe(page, 1)).samples
  expect(await page.evaluate(() => window.__cbpd!.getHistoryLengths().past)).toBe(2)

  const inspector = await measureWidthKeystroke(page)

  const result = {
    machine: machine(),
    ...counts,
    ...dragStats(drag),
    dragCommitMs: toPaint(dragCommit),
    nudgeDispatchMs: round(nudge!.end - nudge!.start),
    nudgeToPaintMs: toPaint(nudge!),
    inspectorDispatchMs: round(inspector.end - inspector.start),
    inspectorToPaintMs: toPaint(inspector),
  }
  console.log(`G9 ${JSON.stringify(result)}`)
})

test('G9 worst case: every occurrence changes', async ({ page }) => {
  test.setTimeout(3_600_000)
  const counts = await seedFixture(page)

  // --- Drag the repeat field itself: all 3150 field occurrences move every frame. Grab a lattice band in cell (0, 0), well away from the root band. ---
  await select(page, [FIELD])
  await afterPaint(page)
  const grabWorld = await page.evaluate((field) => {
    const s = window.__cbpd!.getScene()
    const el = s.elements.find((e) => e.kind === 'band' && JSON.stringify(e.occurrence.path) === JSON.stringify([{ repeatId: field, row: 0, column: 0 }]))
    if (el === undefined || el.kind !== 'band') throw new Error('no band in cell (0, 0)')
    const pts = el.occurrence.worldPoints
    const a = pts[pts.length - 2]!
    const b = pts[pts.length - 1]!
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  }, FIELD)
  const drag = await measureDrag(page, await toClient(page, grabWorld), DRAG_MOVES)
  expect(await page.evaluate(() => window.__cbpd!.getState().selection)).toEqual([FIELD])
  const dragCommit = await measureDragCommit(page)
  expect(await page.evaluate(() => window.__cbpd!.getHistoryLengths().past)).toBe(1)

  // --- One Width keystroke on a lattice-motif band: every cell's occurrence of it changes. ---
  await page.evaluate((field) => {
    const s = window.__cbpd!.getState()
    s.enterContext({ motifId: 'lat-unit', path: [{ repeatId: field, row: 0, column: 0 }] })
    s.select(['p1'])
  }, FIELD)
  await afterPaint(page)
  const inspector = await measureWidthKeystroke(page)

  const result = {
    machine: machine(),
    ...counts,
    ...dragStats(drag),
    dragCommitMs: toPaint(dragCommit),
    inspectorDispatchMs: round(inspector.end - inspector.start),
    inspectorToPaintMs: toPaint(inspector),
  }
  console.log(`G9-worst ${JSON.stringify(result)}`)
})
