// SPEC §6.2–§6.3: the scene — the single derivation both the React renderer
// and the SVG exporter draw: occurrences in paint order with crossing patches
// inserted, every listed world intersection, and unresolved records.

import { canonicalKey, recordsOf } from '@/domain/crossings'
import { stepKey, stepObjectId } from '@/domain/keys'
import type { ContextId, Crossing, Project, Step } from '@/domain/model'
import { apply } from './affine.ts'
import type { BandOccurrence, Occurrence, RegionOccurrence } from './expand.ts'
import { pathMatrix } from './expand.ts'
import type { XY } from './footprint.ts'
import { footprint } from './footprint.ts'
import type { Intersection } from './intersections.ts'
import type { Resolved } from './resolve.ts'
import { contextListing, listedKeys, resolveIntersection } from './resolve.ts'

export type PatchElement = { kind: 'patch'; over: BandOccurrence; segment: [XY, XY]; clip: XY[] }

export type SceneElement = { kind: 'region'; occurrence: RegionOccurrence } | { kind: 'band'; occurrence: BandOccurrence } | PatchElement

/** A listed world intersection plus its effective over occurrence key and record source. */
export type SceneIntersection = Intersection & { overKey: string; source: Resolved['source'] }

export type UnresolvedMarker = { record: Crossing; contextId: ContextId; occurrenceKey: string; worldHint: XY }

export type Scene = {
  elements: SceneElement[]
  intersections: SceneIntersection[]
  unresolved: UnresolvedMarker[]
}

function xy(pt: XY): XY {
  return { x: pt.x, y: pt.y }
}

/**
 * SPEC §6.2: patches for eligible world intersections whose over occurrence
 * is painted before the under one, keyed by the under occurrence's key and
 * ordered by the intersection's canonical key.
 */
function patchesByUnder(intersections: Array<{ i: Intersection; key: string; over: 'a' | 'b' }>, paintIndex: (key: string) => number, clipExtendMm: number): Map<string, PatchElement[]> {
  const keyed: Array<{ underKey: string; key: string; patch: PatchElement }> = []
  for (const { i, key, over } of intersections) {
    if (i.cls !== 'eligible') continue
    const o = over === 'a' ? i.a : i.b
    const u = over === 'a' ? i.b : i.a
    if (paintIndex(o.occ.key) > paintIndex(u.occ.key)) continue
    const clip = footprint(o.seg, o.occ.worldWidth + 2 * clipExtendMm, u.seg, u.occ.worldWidth)
    keyed.push({ underKey: u.occ.key, key, patch: { kind: 'patch', over: o.occ, segment: [xy(o.seg.a), xy(o.seg.b)], clip } })
  }
  keyed.sort((m, n) => (m.key < n.key ? -1 : m.key > n.key ? 1 : 0))

  const byUnder = new Map<string, PatchElement[]>()
  for (const { underKey, patch } of keyed) {
    const list = byUnder.get(underKey)
    if (list === undefined) byUnder.set(underKey, [patch])
    else list.push(patch)
  }
  return byUnder
}

/** The distinct world paths at which `motifId`'s definition is placed, in paint order. */
function placementsOf(p: Project, occurrences: Occurrence[], motifId: string): Step[][] {
  const seen = new Map<string, Step[]>()
  for (const o of occurrences) {
    for (const [k, step] of o.path.entries()) {
      const placed = p.objects[stepObjectId(step)]!
      if (placed.type !== 'motif-instance' && placed.type !== 'repeat') continue
      if (placed.motifId !== motifId) continue
      const prefix = o.path.slice(0, k + 1)
      const key = prefix.map(stepKey).join('/')
      if (!seen.has(key)) seen.set(key, prefix)
    }
  }
  return [...seen.values()]
}

/** SPEC §5.5: every record not bound to a listed intersection of its context, once per world occurrence of that context. */
function unresolvedMarkers(p: Project, occurrences: Occurrence[]): UnresolvedMarker[] {
  const markers: UnresolvedMarker[] = []
  for (const ctx of [null, ...Object.keys(p.motifs)]) {
    const records = recordsOf(p, ctx)
    if (records.length === 0) continue
    const listed = new Set(listedKeys(p, ctx))
    const lost = records.filter((c) => !listed.has(canonicalKey(c)))
    if (lost.length === 0) continue

    const placements = ctx === null ? [[]] : placementsOf(p, occurrences, ctx)
    for (const record of lost) {
      for (const path of placements) {
        const worldHint = apply(pathMatrix(p, path), record.hint)
        markers.push({ record, contextId: ctx, occurrenceKey: path.map(stepKey).join('/'), worldHint })
      }
    }
  }
  return markers
}

/** SPEC §6.3. `clipExtendMm` enlarges only the patch clip polygons (SPEC §6.2); classification never uses it. */
export function buildScene(p: Project, clipExtendMm: number): Scene {
  const { occurrences, intersections } = contextListing(p, null)
  const paintIndex = new Map(occurrences.map((o, index) => [o.key, index]))
  const byKey = (key: string): number => paintIndex.get(key)!

  const keys = listedKeys(p, null)
  const resolved = intersections.map((i, n) => {
    const key = keys[n]!
    const { over, source } = resolveIntersection(p, i, byKey, key)
    return { i, key, over, source }
  })
  const patches = patchesByUnder(resolved, byKey, clipExtendMm)

  const elements: SceneElement[] = []
  for (const o of occurrences) {
    elements.push(o.kind === 'band' ? { kind: 'band', occurrence: o } : { kind: 'region', occurrence: o })
    elements.push(...(patches.get(o.key) ?? []))
  }

  return {
    elements,
    intersections: resolved.map(({ i, over, source }) => ({ ...i, overKey: i[over].occ.key, source })),
    unresolved: unresolvedMarkers(p, occurrences),
  }
}

/** Formats a coordinate with at most 4 decimals, trailing zeros trimmed (and no `-0`). */
export function formatNumber(n: number): string {
  const rounded = Number(n.toFixed(4))
  return String(rounded === 0 ? 0 : rounded)
}

/** An SVG path `d`: `M x y L x y …`, with `Z` when closed. */
export function pathD(points: XY[], closed: boolean): string {
  const parts = points.map((pt, k) => `${k === 0 ? 'M' : 'L'} ${formatNumber(pt.x)} ${formatNumber(pt.y)}`)
  if (closed) parts.push('Z')
  return parts.join(' ')
}
