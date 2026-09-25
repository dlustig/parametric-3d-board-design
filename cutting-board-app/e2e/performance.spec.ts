// SPEC §13 G9: performance on Fixture F's performance variant
// (`interlacePerformance()`, ≥ 1000 occurrences) plus one root band across
// the field. Chromium only; run with `--workers=1 --repeat-each 3` and take
// the median of each run's medians. Each run prints one `G9 {json}` line.
// The targets (drag frame median ≤ 16 ms, p95 ≤ 50 ms) are reported, not
// asserted — a miss is a finding (SPEC §13); only the measurement's own
// sanity is checked.
//
// Every event is timed by an in-page probe: `start` at the event's capture
// phase on window (before the app's listeners), `end` at the bubble phase on
// window of the event that ends the app's handling (after every handler and
// React's re-render, synchronous here: Moveable renders through flushSync),
// then `raf` in the next animation frame and `painted` in a task queued from
// that frame's rAF, which runs after its style/layout/paint.
//
//   frame work    = (end − start) + (painted − raf): main-thread time one
//                   drag update costs, independent of vsync — the gate metric
//   frame shown   = painted − the last rAF before `start`: what the display
//                   shows, quantised to the 16.7 ms vsync
//   latency       = painted − start (commit, nudge, inspector keystroke)
//
// PERF_PROFILE=<path> records a CDP CPU profile of 10 drag moves instead.
//
// The suite's dev server runs development React; G9's recorded numbers come
// from a production build with the test hook (installed in any mode but
// 'production'):
//   pnpm exec vite build --mode perf --outDir dist/perf
//   pnpm exec vite preview --outDir dist/perf --port 4173 --strictPort &
//   PERF_BASE_URL=http://localhost:4173 pnpm test:e2e --project=chromium --workers=1 --repeat-each 3 e2e/performance.spec.ts

import { writeFileSync } from 'node:fs'
import os from 'node:os'
import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { band } from '../src/domain/test-builders.ts'
import type { XY } from './helpers.ts'
import { open, select, toClient } from './helpers.ts'

test.skip(({ browserName, isMobile }) => browserName !== 'chromium' || isMobile, 'G9 is measured in desktop chromium only')
// PERF_BASE_URL: measure a production build instead of the dev server (see the header).
const perfBaseUrl = process.env.PERF_BASE_URL
if (perfBaseUrl !== undefined) test.use({ baseURL: perfBaseUrl })

const DRAG_MOVES = 60
const ROOT_BAND = 'perf-root'

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

test('G9: interlace performance fixture', async ({ page }) => {
  test.setTimeout(3_600_000)

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

  await select(page, [ROOT_BAND])
  await afterPaint(page)

  // --- Drag: one move per frame. Moveable follows mouse events, so a sample runs pointermove → mousemove. ---
  const grab: XY = await toClient(page, { x: 120, y: 201.3 })
  await page.mouse.move(grab.x, grab.y)
  await page.mouse.down()
  await page.mouse.move(grab.x + 1, grab.y) // starts the drag; not measured
  await afterPaint(page)

  const profilePath = process.env.PERF_PROFILE
  const cdp = profilePath === undefined ? null : await page.context().newCDPSession(page)
  if (cdp !== null) {
    await cdp.send('Profiler.enable')
    await cdp.send('Profiler.setSamplingInterval', { interval: 200 })
    await cdp.send('Profiler.start')
  }
  const moves = cdp === null ? DRAG_MOVES : 10
  await startProbe(page, 'pointermove', 'mousemove')
  for (let k = 1; k <= moves; k++) {
    await page.mouse.move(grab.x + 1 + k * 2, grab.y + (k % 2))
    await afterPaint(page)
  }
  const drag = await stopProbe(page, moves)
  if (cdp !== null) {
    const { profile } = await cdp.send('Profiler.stop')
    writeFileSync(profilePath!, JSON.stringify(profile))
  }
  expect(drag.samples).toHaveLength(moves)
  const work = drag.samples.map((s) => s.end - s.start + (s.painted - s.raf))
  const shown = drag.samples.map((s) => s.painted - (drag.frames.findLast((f) => f <= s.start) ?? s.start))
  expect(await page.evaluate(() => window.__cbpd!.getState().preview !== null)).toBe(true)

  // --- Drag commit: pointerup → mouseup (Moveable's drag end: commit() rematches the preview) → paint. ---
  await startProbe(page, 'pointerup', 'mouseup')
  await page.mouse.up()
  const [dragCommit] = (await stopProbe(page, 1)).samples
  expect(await page.evaluate(() => window.__cbpd!.getHistoryLengths().past)).toBe(1)

  // --- Commit: an arrow nudge is `run(translateObjects)`. ---
  await page.locator('.canvas').focus()
  await startProbe(page, 'keydown', 'keydown')
  await page.keyboard.press('ArrowRight')
  const [nudge] = (await stopProbe(page, 1)).samples
  expect(await page.evaluate(() => window.__cbpd!.getHistoryLengths().past)).toBe(2)

  // --- Inspector: one keystroke in the selected band's Width → its preview on screen. ---
  const width = page.getByLabel('Width', { exact: true })
  await width.focus()
  await width.selectText()
  await afterPaint(page)
  await startProbe(page, 'input', 'input')
  await page.keyboard.type('5')
  const [inspector] = (await stopProbe(page, 1)).samples
  expect(await page.evaluate(() => window.__cbpd!.getState().preview !== null)).toBe(true)
  await page.keyboard.press('Escape')
  await afterPaint(page)

  const cpu = os.cpus()
  const result = {
    machine: `${cpu[0]?.model ?? 'unknown'}, ${cpu.length} logical cores, ${os.platform()} ${os.release()}`,
    ...counts,
    dragMoves: work.length,
    dragWorkMedianMs: round(median(work)),
    dragWorkP95Ms: round(percentile(work, 95)),
    dragShownMedianMs: round(median(shown)),
    dragShownP95Ms: round(percentile(shown, 95)),
    dragCommitMs: round(dragCommit!.painted - dragCommit!.start),
    nudgeDispatchMs: round(nudge!.end - nudge!.start),
    nudgeToPaintMs: round(nudge!.painted - nudge!.start),
    inspectorDispatchMs: round(inspector!.end - inspector!.start),
    inspectorToPaintMs: round(inspector!.painted - inspector!.start),
  }
  console.log(`G9 ${JSON.stringify(result)}`)
})
