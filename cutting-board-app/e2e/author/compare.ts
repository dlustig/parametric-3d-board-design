// SPEC §13 G6: the one comparison between an authored project's scene and a
// fixture's. Ids never match (the UI mints fresh ones), so occurrences are
// grouped by kind and material name, paired greedily by nearest geometry,
// and the pairing then maps each fixture intersection's two occurrences and
// its effective over occurrence onto the authored scene.

import { readFileSync } from 'node:fs'
import type { Page } from '@playwright/test'
import type { Project } from '../../src/domain/model.ts'
import type { Scene } from '../../src/geometry/scene.ts'
import { buildScene } from '../../src/geometry/scene.ts'

type XY = { x: number; y: number }

export type FixtureFile = 'stripes' | 'checker' | 'basket-weave' | 'chevron-diamond' | 'isometric' | 'interlace'

export interface OccurrenceSummary {
  key: string
  kind: 'band' | 'region'
  material: string
  points: XY[]
  width: number | null
  closed: boolean
}

export interface IntersectionSummary {
  point: XY
  cls: string
  aKey: string
  bKey: string
  overKey: string
}

export interface SceneSummary {
  occurrences: OccurrenceSummary[]
  intersections: IntersectionSummary[]
  unresolved: number
}

export const POINT_TOLERANCE_MM = 0.05
const WIDTH_TOLERANCE_MM = 1e-6

export function summarize(project: Project, scene: Scene): SceneSummary {
  const names = new Map(project.materials.map((m) => [m.id, m.name]))
  const occurrences: OccurrenceSummary[] = []
  for (const el of scene.elements) {
    if (el.kind === 'patch') continue
    const o = el.occurrence
    occurrences.push({
      key: o.key,
      kind: o.kind,
      material: names.get(o.materialId) ?? `?${o.materialId}`,
      points: o.worldPoints.map((p) => ({ x: p.x, y: p.y })),
      width: o.kind === 'band' ? o.worldWidth : null,
      closed: o.kind === 'band' ? o.closed : true,
    })
  }
  const intersections = scene.intersections.map((i) => ({ point: { x: i.point.x, y: i.point.y }, cls: i.cls, aKey: i.a.occ.key, bKey: i.b.occ.key, overKey: i.overKey }))
  return { occurrences, intersections, unresolved: scene.unresolved.length }
}

export function loadFixture(name: FixtureFile): Project {
  return JSON.parse(readFileSync(new URL(`../../src/fixtures/${name}.json`, import.meta.url), 'utf8')) as Project
}

/** The fixture's scene, after `edit` applies the same source edits the test made through the UI. */
export function fixtureSummary(name: FixtureFile, edit: (p: Project) => void = () => undefined): SceneSummary {
  const p = loadFixture(name)
  edit(p)
  return summarize(p, buildScene(p, 0))
}

/** The committed project's scene, read (never written) through the test hook. */
export async function authoredSummary(page: Page): Promise<SceneSummary> {
  const { project, scene } = await page.evaluate(() => ({ project: window.__cbpd!.getProject(), scene: window.__cbpd!.getScene() }))
  return summarize(project, scene)
}

function dist(a: XY, b: XY): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function maxDist(a: XY[], b: XY[]): number {
  return Math.max(...a.map((p, k) => dist(p, b[k]!)))
}

/** Point sequences of the same geometry: open bands may run either way; closed bands and regions may also start anywhere. */
function shapeDistance(a: OccurrenceSummary, b: OccurrenceSummary): number {
  if (a.points.length !== b.points.length) return Infinity
  const n = b.points.length
  const candidates: XY[][] = [b.points, [...b.points].reverse()]
  if (a.closed) {
    for (const seq of [b.points, [...b.points].reverse()]) {
      for (let s = 1; s < n; s++) candidates.push([...seq.slice(s), ...seq.slice(0, s)])
    }
  }
  return Math.min(...candidates.map((c) => maxDist(a.points, c)))
}

/**
 * Every mismatch between `actual` and `expected`, as readable lines (empty
 * when they match): occurrence counts by kind and material; each expected
 * occurrence paired with an unused actual one within `POINT_TOLERANCE_MM`
 * (with equal width and closed flag); each expected intersection matched to
 * the actual one between the paired occurrences nearest its point, with the
 * same class and the same (paired) effective over occurrence; unresolved counts.
 */
export function compareSummaries(actual: SceneSummary, expected: SceneSummary): string[] {
  const errors: string[] = []
  const group = (o: OccurrenceSummary): string => `${o.kind}:${o.material}`
  const counts = (s: SceneSummary): Map<string, number> => {
    const m = new Map<string, number>()
    for (const o of s.occurrences) m.set(group(o), (m.get(group(o)) ?? 0) + 1)
    return m
  }
  const ca = counts(actual)
  const ce = counts(expected)
  for (const g of new Set([...ca.keys(), ...ce.keys()])) {
    if (ca.get(g) !== ce.get(g)) errors.push(`occurrences ${g}: authored ${ca.get(g) ?? 0}, fixture ${ce.get(g) ?? 0}`)
  }

  const pair = new Map<string, string>() // fixture occurrence key -> authored occurrence key
  const used = new Set<string>()
  for (const e of expected.occurrences) {
    let best: OccurrenceSummary | null = null
    let bestD = Infinity
    for (const a of actual.occurrences) {
      if (used.has(a.key) || group(a) !== group(e) || a.closed !== e.closed) continue
      const d = shapeDistance(e, a)
      if (d < bestD) {
        best = a
        bestD = d
      }
    }
    if (best === null || bestD > POINT_TOLERANCE_MM) {
      errors.push(`no authored ${group(e)} within ${POINT_TOLERANCE_MM} mm of fixture ${e.key} (${JSON.stringify(e.points.map((p) => [round(p.x), round(p.y)]))}); nearest ${bestD.toFixed(4)} mm`)
      continue
    }
    used.add(best.key)
    pair.set(e.key, best.key)
    if (e.width !== null && (best.width === null || Math.abs(best.width - e.width) > WIDTH_TOLERANCE_MM)) {
      errors.push(`width of ${e.key}: authored ${best.width}, fixture ${e.width}`)
    }
  }

  if (actual.intersections.length !== expected.intersections.length) {
    errors.push(`intersections: authored ${actual.intersections.length}, fixture ${expected.intersections.length}`)
  }
  const usedX = new Set<IntersectionSummary>()
  for (const e of expected.intersections) {
    const a = pair.get(e.aKey)
    const b = pair.get(e.bKey)
    if (a === undefined || b === undefined) continue // already reported as an unpaired occurrence
    let best: IntersectionSummary | null = null
    let bestD = Infinity
    for (const x of actual.intersections) {
      if (usedX.has(x) || !((x.aKey === a && x.bKey === b) || (x.aKey === b && x.bKey === a))) continue
      const d = dist(x.point, e.point)
      if (d < bestD) {
        best = x
        bestD = d
      }
    }
    const where = `(${round(e.point.x)}, ${round(e.point.y)})`
    if (best === null || bestD > POINT_TOLERANCE_MM) {
      errors.push(`no authored intersection near fixture ${where} between ${e.aKey} and ${e.bKey}`)
      continue
    }
    usedX.add(best)
    if (best.cls !== e.cls) errors.push(`class at ${where}: authored ${best.cls}, fixture ${e.cls}`)
    if (best.overKey !== pair.get(e.overKey)) errors.push(`over at ${where}: authored ${best.overKey}, fixture ${e.overKey} (paired ${pair.get(e.overKey)})`)
  }

  if (actual.unresolved !== expected.unresolved) errors.push(`unresolved records: authored ${actual.unresolved}, fixture ${expected.unresolved}`)
  return errors
}

function round(v: number): number {
  return Math.round(v * 1000) / 1000
}
