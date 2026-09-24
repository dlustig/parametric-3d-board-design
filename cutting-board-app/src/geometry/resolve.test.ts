// SPEC §13 gates G1 (crossing identity) and G2 (occurrence scope), at unit level.

import { describe, expect, it } from 'vitest'
import type { CommandResult } from '../domain/commands/index.ts'
import { deletePoint, insertPoint, setBandWidth, setPoint, setRepeatParams, setTransform, toggleCrossing, translateObjects } from '../domain/commands/index.ts'
import { canonicalize } from '../domain/crossings.ts'
import type { Crossing, Project, Step } from '../domain/model.ts'
import { importProject } from '../domain/migrate.ts'
import { band, instance, project, record, ref, repeat } from '../domain/test-builders.ts'
import { validateProject } from '../domain/validate.ts'
import { expand } from './expand.ts'
import type { Intersection } from './intersections.ts'
import { findIntersections } from './intersections.ts'
import { isRecordResolved, paintIndexOf, resolveIntersection } from './resolve.ts'

function ok(r: CommandResult): Project {
  if (!r.ok) throw new Error(r.message)
  return r.project
}

const paintIndex = paintIndexOf

/** The listed world intersection at (x, y). */
function at(p: Project, x: number, y: number): Intersection {
  const hit = findIntersections(expand(p)).find((i) => Math.hypot(i.point.x - x, i.point.y - y) < 1e-6)
  if (hit === undefined) throw new Error(`no intersection at (${x}, ${y})`)
  return hit
}

/** The band id of the effective over side at (x, y). */
function overBandAt(p: Project, x: number, y: number): string {
  const i = at(p, x, y)
  return i[resolveIntersection(p, i, paintIndex(p)).over].occ.sourceId
}

function rootRecord(p: Project, id: string): Crossing {
  return p.crossings.find((c) => c.id === id)!
}

function expectHint(c: Crossing, x: number, y: number): void {
  expect(c.hint.x).toBeCloseTo(x, 9)
  expect(c.hint.y).toBeCloseTo(y, 9)
}

// ---------------------------------------------------------------------------
// G1 — two polylines crossing twice. A is straight with a collinear middle
// vertex (segments A0: 0..50, A1: 50..100); B is a V crossing A at x=35 (B0)
// and x=65 (B1). B is painted over A by default.
// ---------------------------------------------------------------------------

const R1 = record('r1', ref('A', 'A0'), ref('B', 'B0'), 'a', { x: 35, y: 0 }) // A over at x=35
const R2 = record('r2', ref('A', 'A1'), ref('B', 'B1'), 'b', { x: 65, y: 0 }) // B over at x=65

function twoCrossings(crossings: Crossing[] = [R1, R2]): Project {
  const a = band('A', [[0, 0], [50, 0], [100, 0]])
  const b = band('B', [[20, -30], [50, 30], [80, -30]])
  return project([a, b], [], crossings)
}

describe('G1 crossing identity', () => {
  it('two crossings with opposite records each resolve to their own intersection', () => {
    const p = twoCrossings()
    expect(validateProject(p)).toBeNull()
    expect(overBandAt(p, 35, 0)).toBe('A')
    expect(overBandAt(p, 65, 0)).toBe('B')
    expect(resolveIntersection(p, at(p, 35, 0), paintIndex(p))).toEqual({ over: 'a', source: 'definition', record: R1, contextId: null })
    expect(resolveIntersection(twoCrossings([]), at(p, 35, 0), paintIndex(p)).source).toBe('default')
  })

  it('moving an endpoint slides a crossing along its segment: still resolved, hint updated', () => {
    const p = ok(setPoint(twoCrossings(), 'B', 'B0', { x: 10, y: -30 }))
    expect(isRecordResolved(p, null, rootRecord(p, 'r1'))).toBe(true)
    expectHint(rootRecord(p, 'r1'), 30, 0)
    expect(overBandAt(p, 30, 0)).toBe('A')
    expect(rootRecord(p, 'r2')).toEqual(R2)
  })

  it('a vertex inserted on the near half keeps the record by id', () => {
    const p = ok(insertPoint(twoCrossings(), 'A', 'A0', { x: 40, y: 0 }))
    expect(rootRecord(p, 'r1')).toEqual(R1)
    expect(isRecordResolved(p, null, R1)).toBe(true)
    expect(overBandAt(p, 35, 0)).toBe('A')
  })

  it('a vertex inserted on the far half rebinds the record by hint to the new segment', () => {
    const p = ok(insertPoint(twoCrossings(), 'A', 'A0', { x: 20, y: 0 }))
    const a = p.objects.A!
    const inserted = a.type === 'band' ? a.points[1]!.id : ''
    const r1 = rootRecord(p, 'r1')
    expect(r1.a).toEqual(ref('A', inserted))
    expect(r1.b).toEqual(R1.b)
    expectHint(r1, 35, 0)
    expect(isRecordResolved(p, null, r1)).toBe(true)
    expect(overBandAt(p, 35, 0)).toBe('A')
    expect(overBandAt(p, 65, 0)).toBe('B')
    expect(validateProject(p)).toBeNull()
  })

  it('deleting the referenced start point rewrites segmentStart to the previous point, resolved', () => {
    const p = ok(deletePoint(twoCrossings(), 'A', 'A1'))
    expect(rootRecord(p, 'r2').a).toEqual(ref('A', 'A0'))
    expect(isRecordResolved(p, null, rootRecord(p, 'r2'))).toBe(true)
    expect(overBandAt(p, 35, 0)).toBe('A')
    expect(overBandAt(p, 65, 0)).toBe('B')
    expect(validateProject(p)).toBeNull()
  })

  it('a width change keeps both records resolved and unchanged', () => {
    const p = setBandWidth(twoCrossings(), 'A', 12)
    expect(p.crossings).toEqual([R1, R2])
    expect(isRecordResolved(p, null, R1)).toBe(true)
    expect(isRecordResolved(p, null, R2)).toBe(true)
  })

  it('a crossing that disappears leaves its record unresolved and untouched, and resolves again when it returns', () => {
    const gone = ok(setPoint(twoCrossings(), 'B', 'B0', { x: 20, y: 10 }))
    expect(gone.crossings).toEqual([R1, R2])
    expect(isRecordResolved(gone, null, R1)).toBe(false)

    const back = ok(setPoint(gone, 'B', 'B0', { x: 20, y: -30 }))
    expect(back.crossings).toEqual([R1, R2])
    expect(isRecordResolved(back, null, R1)).toBe(true)
    expect(overBandAt(back, 35, 0)).toBe('A')
  })

  it('hairpin: a lost record does not rebind onto an intersection owned by another record', () => {
    // A is a hairpin whose return leg (segment A1) stops short of B. r1 is
    // resolved on leg A0; r2 names leg A1 and is unresolved. Moving the tip
    // A1 loses r1 and brings leg A1 across B at (50, 1.75), within r1's
    // rematch radius — but that intersection is r2's.
    const a = band('A', [[0, 0], [60, 0], [55, 3]])
    const b = band('B', [[50, -50], [50, 50]])
    const r1 = record('r1', ref('A', 'A0'), ref('B', 'B0'), 'a', { x: 50, y: 0 })
    const r2 = record('r2', ref('A', 'A1'), ref('B', 'B0'), 'b', { x: 50, y: 2 })
    const before = project([a, b], [], [r1, r2])
    expect(isRecordResolved(before, null, r1)).toBe(true)
    expect(isRecordResolved(before, null, r2)).toBe(false)

    const p = ok(setPoint(before, 'A', 'A1', { x: 45, y: 0.5 }))
    expect(rootRecord(p, 'r1')).toEqual(r1)
    expect(isRecordResolved(p, null, r1)).toBe(false)
    expect(isRecordResolved(p, null, rootRecord(p, 'r2'))).toBe(true)
    expect(overBandAt(p, 50, 1.75)).toBe('B')
    expect(validateProject(p)).toBeNull()
  })

  it('hairpin: a lost record does not rebind onto an intersection that already existed', () => {
    // A turns back sharply at (60, 0); its return leg A1 crosses B at
    // (50, 0.33), within r1's rematch radius, with no record on it.
    const a = band('A', [[0, 0], [60, 0], [0, 2]])
    const b = band('B', [[50, -50], [50, 50]])
    const r1 = record('r1', ref('A', 'A0'), ref('B', 'B0'), 'a', { x: 50, y: 0 })
    const p = ok(setPoint(project([a, b], [], [r1]), 'A', 'A0', { x: 55, y: -1 }))
    expect(p.crossings).toEqual([r1])
    expect(isRecordResolved(p, null, r1)).toBe(false)
  })

  it('a record already unresolved before the command is not auto-rebound', () => {
    // r3 names segment A1, which never meets B0; inserting a vertex at x=20
    // creates a new intersection (A@new, B@B0) right on r3's hint.
    const r3 = record('r3', ref('A', 'A1'), ref('B', 'B0'), 'a', { x: 35, y: 0 })
    const before = twoCrossings([r3, R2])
    expect(isRecordResolved(before, null, r3)).toBe(false)

    const p = ok(insertPoint(before, 'A', 'A0', { x: 20, y: 0 }))
    expect(p.crossings).toEqual([r3, R2])
    expect(isRecordResolved(p, null, r3)).toBe(false)
  })

  it('an instance transform change then an unrelated edit keeps a root record resolved with a fresh hint', () => {
    const m = { id: 'M', children: [band('H', [[-20, 0], [20, 0]]), band('V', [[0, -20], [0, 20]])] }
    const rec = record('r', ref('R', 'R0'), ref('H', 'H0', [{ instanceId: 'I' }]), 'a', { x: 110, y: 100 })
    const before = project([instance('I', 'M', { x: 100, y: 100 }), band('R', [[110, 50], [110, 150]]), band('U', [[0, 300], [50, 300]])], [m], [rec])
    expect(isRecordResolved(before, null, rec)).toBe(true)

    const moved = setTransform(before, 'I', { y: 105 })
    expectHint(rootRecord(moved, 'r'), 110, 105)
    expect(isRecordResolved(moved, null, rootRecord(moved, 'r'))).toBe(true)

    const edited = translateObjects(moved, ['U'], 5, 5)
    expect(isRecordResolved(edited, null, rootRecord(edited, 'r'))).toBe(true)
    expectHint(rootRecord(edited, 'r'), 110, 105)
    expect(overBandAt(edited, 110, 105)).toBe('R')
  })
})

// ---------------------------------------------------------------------------
// G2 — motif M is a plus sign (H then V, so V is over by default), placed by a
// 3×3 repeat F at (100, 100) with 50 mm steps. Definition record D puts H
// over everywhere; root override O puts V over in cell (1, 2) only.
// ---------------------------------------------------------------------------

const CELL_12: Step = { repeatId: 'F', row: 1, column: 2 }
const D = record('d', ref('H', 'H0'), ref('V', 'V0'), 'a', { x: 0, y: 0 })
const O = record('o', ref('H', 'H0', [CELL_12]), ref('V', 'V0', [CELL_12]), 'b', { x: 200, y: 150 })

function plusMotif(crossings: Crossing[] = []): { id: string; children: ReturnType<typeof band>[]; crossings: Crossing[] } {
  return { id: 'M', children: [band('H', [[-20, 0], [20, 0]]), band('V', [[0, -20], [0, 20]])], crossings }
}

function field(rootCrossings: Crossing[] = [O]): Project {
  return project([repeat('F', 'M', { transform: { x: 100, y: 100, rotationDeg: 0, mirrorX: false, mirrorY: false, scale: 1 } })], [plusMotif([D])], rootCrossings)
}

function cellOf(i: Intersection): [number, number] {
  const step = i.a.occ.path[0]!
  return 'repeatId' in step ? [step.row, step.column] : [-1, -1]
}

describe('G2 occurrence scope', () => {
  it('a root override applies to its cell only; the definition record everywhere else', () => {
    const p = field()
    expect(validateProject(p)).toBeNull()
    const list = findIntersections(expand(p))
    expect(list).toHaveLength(9)
    for (const i of list) {
      const [row, column] = cellOf(i)
      const resolved = resolveIntersection(p, i, paintIndex(p))
      const overridden = row === 1 && column === 2
      expect(resolved.source).toBe(overridden ? 'override' : 'definition')
      expect(resolved.contextId).toBe(overridden ? null : 'M')
      expect(resolved.record).toEqual(overridden ? O : D)
      expect(i[resolved.over].occ.sourceId).toBe(overridden ? 'V' : 'H')
    }
  })

  it('JSON round-trip preserves both records', () => {
    const p = field()
    const reopened = importProject(JSON.stringify(p))
    expect(reopened).toEqual({ ok: true, project: p })
  })

  it('shrinking rows to 1 removes the override record and keeps the definition record', () => {
    const p = ok(setRepeatParams(field(), 'F', { rows: 1 }))
    expect(p.crossings).toEqual([])
    expect(p.motifs.M!.crossings).toEqual([D])
    expect(validateProject(p)).toBeNull()
  })

  it('a record in an outer definition with a non-empty path resolves for each of its occurrences', () => {
    const inner = { id: 'N', children: [band('H', [[-20, 0], [20, 0]]), band('V', [[0, -20], [0, 20]])] }
    const nested = record('n', ref('H', 'H0', [{ instanceId: 'I' }]), ref('V', 'V0', [{ instanceId: 'I' }]), 'a', { x: 5, y: 0 })
    const outer = { id: 'O', children: [instance('I', 'N', { x: 5 })], crossings: [nested] }
    const p = project([instance('J1', 'O', { x: 100, y: 100 }), instance('J2', 'O', { x: 200, y: 100 })], [outer, inner])
    expect(validateProject(p)).toBeNull()
    expect(isRecordResolved(p, 'O', nested)).toBe(true)

    const list = findIntersections(expand(p))
    expect(list).toHaveLength(2)
    for (const i of list) {
      expect(resolveIntersection(p, i, paintIndex(p))).toMatchObject({ source: 'definition', contextId: 'O', record: nested })
      expect(i[resolveIntersection(p, i, paintIndex(p)).over].occ.sourceId).toBe('H')
    }
  })

  it('"All instances" in an overridden cell removes the override and flips the effective value there', () => {
    const p = toggleCrossing(field(), at(field(), 200, 150), 'all')
    expect(p.crossings).toEqual([])
    expect(p.motifs.M!.crossings).toEqual([D])
    for (const i of findIntersections(expand(p))) {
      expect(resolveIntersection(p, i, paintIndex(p)).source).toBe('definition')
      expect(i[resolveIntersection(p, i, paintIndex(p)).over].occ.sourceId).toBe('H')
    }
    expect(validateProject(p)).toBeNull()
  })

  it('"All instances" flips the definition record in a cell without an override', () => {
    const p = toggleCrossing(field(), at(field(), 100, 100), 'all')
    expect(p.motifs.M!.crossings).toEqual([{ ...D, over: 'b' }])
    expect(p.crossings).toEqual([O]) // the override is for another cell's key
    expect(overBandAt(p, 150, 150)).toBe('V')
  })

  it('"This occurrence" toggled back to the outer value deletes the root record', () => {
    const p = toggleCrossing(field(), at(field(), 200, 150), 'occurrence')
    expect(p.crossings).toEqual([])
    expect(p.motifs.M!.crossings).toEqual([D])
    expect(overBandAt(p, 200, 150)).toBe('H')
  })

  it('"This occurrence" on a plain cell writes a root override with the world hint', () => {
    const p = toggleCrossing(field([]), at(field([]), 100, 100), 'occurrence')
    const cell00: Step = { repeatId: 'F', row: 0, column: 0 }
    expect(p.crossings).toHaveLength(1)
    expect(p.crossings[0]).toMatchObject(canonicalize({ ...O, id: p.crossings[0]!.id, a: ref('H', 'H0', [cell00]), b: ref('V', 'V0', [cell00]), hint: { x: 100, y: 100 } }))
    expect(overBandAt(p, 100, 100)).toBe('V')
    expect(overBandAt(p, 150, 100)).toBe('H')
    expect(validateProject(p)).toBeNull()
  })

  it('toggling a pair with no common motif ancestor writes a root record even for "all", and deletes it on return to paint order', () => {
    const p0 = twoCrossings([])
    const once = toggleCrossing(p0, at(p0, 65, 0), 'all')
    expect(once.crossings).toHaveLength(1)
    expect(overBandAt(once, 65, 0)).toBe('A')
    const twice = toggleCrossing(once, at(once, 65, 0), 'all')
    expect(twice.crossings).toEqual([])
  })

  it('a toggle rebinds an unresolved record of the same pair in the target context', () => {
    const stale = record('s', ref('A', 'A1'), ref('B', 'B0'), 'b', { x: 36, y: 0 })
    const p0 = twoCrossings([stale])
    const p = toggleCrossing(p0, at(p0, 35, 0), 'occurrence')
    expect(p.crossings).toEqual([record('s', ref('A', 'A0'), ref('B', 'B0'), 'a', { x: 35, y: 0 })])
  })
})
