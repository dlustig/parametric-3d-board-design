import { describe, expect, it } from 'vitest'
import type {
  Band,
  BandRef,
  Crossing,
  DesignObject,
  Id,
  MotifDefinition,
  MotifInstance,
  Point,
  Project,
  Region,
  RepeatField,
  Transform,
} from './model.ts'
import { newId } from './ids.ts'
import { importProject } from './migrate.ts'
import { newProject } from './project.ts'
import { countOccurrences, refKey, validateProject } from './validate.ts'

// ---------------------------------------------------------------------------
// Small hand-built object factories (per the task brief: build small
// projects by hand with `newProject` and object literals).
// ---------------------------------------------------------------------------

function pt(x: number, y: number): Point {
  return { id: newId(), x, y }
}

function identityTransform(): Transform {
  return { x: 0, y: 0, rotationDeg: 0, mirrorX: false, mirrorY: false, scale: 1 }
}

function band(materialId: Id, points: Point[], overrides: Partial<Omit<Band, 'type' | 'id' | 'materialId' | 'points'>> = {}): Band {
  return { type: 'band', id: newId(), materialId, widthMm: 6, closed: false, points, ...overrides }
}

function region(materialId: Id, points: Point[]): Region {
  return { type: 'region', id: newId(), materialId, points }
}

function makeInstance(motifId: Id): MotifInstance {
  return { type: 'motif-instance', id: newId(), motifId, transform: identityTransform() }
}

function repeatField(
  motifId: Id,
  overrides: Partial<Omit<RepeatField, 'type' | 'id' | 'motifId'>> = {},
): RepeatField {
  return {
    type: 'repeat',
    id: newId(),
    motifId,
    transform: identityTransform(),
    rows: 1,
    columns: 1,
    stepXMm: 10,
    stepYMm: 10,
    rowOffsetMm: 0,
    columnOffsetMm: 0,
    alternateMirrorX: false,
    alternateMirrorY: false,
    alternateRotationDeg: 0,
    ...overrides,
  }
}

function addRoot(p: Project, obj: DesignObject): Project {
  return { ...p, objects: { ...p.objects, [obj.id]: obj }, rootChildren: [...p.rootChildren, obj.id] }
}

/** Orders two refs canonically (SPEC §5.3) into a partial Crossing. */
function canonicalPair(a: BandRef, b: BandRef): Pick<Crossing, 'a' | 'b' | 'over'> {
  return refKey(a) < refKey(b) ? { a, b, over: 'a' } : { a: b, b: a, over: 'b' }
}

// ---------------------------------------------------------------------------

describe('validateProject — blank project', () => {
  it('accepts a freshly created blank project', () => {
    expect(validateProject(newProject('mm'))).toBeNull()
    expect(validateProject(newProject('in'))).toBeNull()
  })
})

describe('validateProject — invariant 1: ownership', () => {
  it('rejects an object id owned by two contexts', () => {
    const p = newProject('mm')
    const materialId = p.materials[0]!.id
    const b = band(materialId, [pt(0, 0), pt(10, 0)])
    const motifId = newId()
    const motif: MotifDefinition = { id: motifId, name: 'M', children: [b.id], crossings: [] }
    const next: Project = {
      ...p,
      objects: { [b.id]: b },
      rootChildren: [b.id],
      motifs: { [motifId]: motif },
    }
    const err = validateProject(next)
    expect(err?.path).toBe(`motifs.${motifId}.children`)
  })

  it('rejects an object whose key does not match its own id', () => {
    const p = newProject('mm')
    const materialId = p.materials[0]!.id
    const obj = band(materialId, [pt(0, 0), pt(10, 0)])
    // Stored key 'zzz' is also claimed via rootChildren, so — absent the
    // key === id check — ownership alone would consider this project valid;
    // only the id-mismatch itself should reject it.
    const next: Project = { ...p, objects: { zzz: { ...obj, id: 'b2' } }, rootChildren: ['zzz'] }
    expect(validateProject(next)?.path).toBe('objects.zzz')
  })

  it('rejects a motif whose key does not match its own id', () => {
    const p = newProject('mm')
    const next: Project = { ...p, motifs: { zzz: { id: 'm2', name: 'M', children: [], crossings: [] } } }
    expect(validateProject(next)?.path).toBe('motifs.zzz')
  })
})

describe('validateProject — invariant 2: references', () => {
  it('rejects a dangling materialId', () => {
    const p = newProject('mm')
    const b = band('not-a-real-material', [pt(0, 0), pt(10, 0)])
    const next = addRoot(p, b)
    const err = validateProject(next)
    expect(err?.path).toBe(`objects.${b.id}.materialId`)
  })
})

describe('validateProject — invariant 3: point geometry', () => {
  it('rejects a band with fewer than 2 points', () => {
    const p = newProject('mm')
    const materialId = p.materials[0]!.id
    const b = band(materialId, [pt(0, 0)])
    const next = addRoot(p, b)
    expect(validateProject(next)?.path).toBe(`objects.${b.id}.points`)
  })

  it('rejects a region with fewer than 3 points', () => {
    const p = newProject('mm')
    const materialId = p.materials[0]!.id
    const r = region(materialId, [pt(0, 0), pt(10, 0)])
    const next = addRoot(p, r)
    expect(validateProject(next)?.path).toBe(`objects.${r.id}.points`)
  })

  it('rejects consecutive points closer than MIN_SEGMENT_MM', () => {
    const p = newProject('mm')
    const materialId = p.materials[0]!.id
    const b = band(materialId, [pt(0, 0), pt(0.001, 0), pt(10, 0)])
    const next = addRoot(p, b)
    expect(validateProject(next)?.path).toBe(`objects.${b.id}.points`)
  })
})

describe('validateProject — invariant 4: acyclic motifs', () => {
  it('rejects a cyclic motif reference graph', () => {
    const p = newProject('mm')
    const motifAId = newId()
    const motifBId = newId()
    const instanceOfB = makeInstance(motifBId)
    const instanceOfA = makeInstance(motifAId)
    const next: Project = {
      ...p,
      objects: { [instanceOfB.id]: instanceOfB, [instanceOfA.id]: instanceOfA },
      motifs: {
        [motifAId]: { id: motifAId, name: 'A', children: [instanceOfB.id], crossings: [] },
        [motifBId]: { id: motifBId, name: 'B', children: [instanceOfA.id], crossings: [] },
      },
    }
    expect(validateProject(next)?.path).toBe('motifs')
  })
})

describe('validateProject — invariant 5: numeric limits', () => {
  it('rejects a band with widthMm 0', () => {
    const p = newProject('mm')
    const materialId = p.materials[0]!.id
    const b = band(materialId, [pt(0, 0), pt(10, 0)], { widthMm: 0 })
    const next = addRoot(p, b)
    expect(validateProject(next)?.path).toBe(`objects.${b.id}.widthMm`)
  })

  it('rejects a transform with scale 0', () => {
    const p = newProject('mm')
    const motifId = newId()
    const instance: MotifInstance = { ...makeInstance(motifId), transform: { ...identityTransform(), scale: 0 } }
    const next: Project = {
      ...p,
      objects: { [instance.id]: instance },
      rootChildren: [instance.id],
      motifs: { [motifId]: { id: motifId, name: 'M', children: [], crossings: [] } },
    }
    expect(validateProject(next)?.path).toBe(`objects.${instance.id}.transform.scale`)
  })

  it('rejects a repeat with rows above 50', () => {
    const p = newProject('mm')
    const motifId = newId()
    const repeat = repeatField(motifId, { rows: 51 })
    const next: Project = {
      ...p,
      objects: { [repeat.id]: repeat },
      rootChildren: [repeat.id],
      motifs: { [motifId]: { id: motifId, name: 'M', children: [], crossings: [] } },
    }
    expect(validateProject(next)?.path).toBe(`objects.${repeat.id}.rows`)
  })

  it('rejects a non-integer rows value', () => {
    const p = newProject('mm')
    const motifId = newId()
    const repeat = repeatField(motifId, { rows: 2.5 })
    const next: Project = {
      ...p,
      objects: { [repeat.id]: repeat },
      rootChildren: [repeat.id],
      motifs: { [motifId]: { id: motifId, name: 'M', children: [], crossings: [] } },
    }
    expect(validateProject(next)?.path).toBe(`objects.${repeat.id}.rows`)
  })

  it('rejects a NaN point coordinate', () => {
    const p = newProject('mm')
    const materialId = p.materials[0]!.id
    const b = band(materialId, [pt(0, 0), pt(NaN, 0)])
    const next = addRoot(p, b)
    expect(validateProject(next)?.path).toBe(`objects.${b.id}.points[1].x`)
  })

  it('rejects occurrence counts beyond MAX_OCCURRENCES via nested repeats (G8)', () => {
    const p = newProject('mm')
    const materialId = p.materials[0]!.id

    const leafBand = band(materialId, [pt(0, 0), pt(10, 0)])
    const motifCId = newId()
    const repeat2 = repeatField(motifCId, { rows: 50, columns: 1 })
    const motifBId = newId()
    const repeat1 = repeatField(motifBId, { rows: 50, columns: 1 })
    const motifAId = newId()
    const instances = [makeInstance(motifAId), makeInstance(motifAId), makeInstance(motifAId)]

    const next: Project = {
      ...p,
      objects: {
        [leafBand.id]: leafBand,
        [repeat2.id]: repeat2,
        [repeat1.id]: repeat1,
        ...Object.fromEntries(instances.map((i) => [i.id, i])),
      },
      rootChildren: instances.map((i) => i.id),
      motifs: {
        [motifCId]: { id: motifCId, name: 'C', children: [leafBand.id], crossings: [] },
        [motifBId]: { id: motifBId, name: 'B', children: [repeat2.id], crossings: [] },
        [motifAId]: { id: motifAId, name: 'A', children: [repeat1.id], crossings: [] },
      },
    }

    expect(countOccurrences(next)).toBe(7500)
    expect(validateProject(next)?.path).toBe('objects')
  })
})

describe('countOccurrences', () => {
  it('multiplies shape count by both rows and columns', () => {
    const p = newProject('mm')
    const materialId = p.materials[0]!.id
    const leafBand = band(materialId, [pt(0, 0), pt(10, 0)])
    const motifId = newId()
    const repeat = repeatField(motifId, { rows: 3, columns: 4 })
    const next: Project = {
      ...p,
      objects: { [leafBand.id]: leafBand, [repeat.id]: repeat },
      rootChildren: [repeat.id],
      motifs: { [motifId]: { id: motifId, name: 'M', children: [leafBand.id], crossings: [] } },
    }
    expect(countOccurrences(next)).toBe(12)
  })
})

describe('validateProject — crossing records', () => {
  function crossingFixture(): {
    base: Project
    b1: Band
    b2: Band
    r1: Region
    repeat: RepeatField
    refA: BandRef
    refB: BandRef
    foreignBand: Band
    foreignInstance: MotifInstance
  } {
    const p = newProject('mm')
    const materialId = p.materials[0]!.id
    const b1 = band(materialId, [pt(0, 0), pt(10, 0)])
    const b2 = band(materialId, [pt(0, 5), pt(10, 5)])
    const r1 = region(materialId, [pt(0, 20), pt(10, 20), pt(5, 30)])
    const motifId = newId()
    const repeat = repeatField(motifId, { rows: 2, columns: 2 })
    const motif: MotifDefinition = { id: motifId, name: 'M', children: [], crossings: [] }

    // Real, correctly-typed objects owned by a *different* context than the
    // root crossings below will reference them from — for the "not in the
    // context" / "unknown bandId" tests, so a weakened membership check
    // (e.g. `id in p.objects` instead of `children.includes(id)`) would
    // still fail them.
    const targetMotifId = newId()
    const targetMotif: MotifDefinition = { id: targetMotifId, name: 'Target', children: [], crossings: [] }
    const foreignBand = band(materialId, [pt(0, 40), pt(10, 40)])
    const foreignInstance = makeInstance(targetMotifId)
    const motifOwnerId = newId()
    const motifOwner: MotifDefinition = {
      id: motifOwnerId,
      name: 'Owner',
      children: [foreignBand.id, foreignInstance.id],
      crossings: [],
    }

    const base: Project = {
      ...p,
      objects: {
        [b1.id]: b1,
        [b2.id]: b2,
        [r1.id]: r1,
        [repeat.id]: repeat,
        [foreignBand.id]: foreignBand,
        [foreignInstance.id]: foreignInstance,
      },
      rootChildren: [b1.id, b2.id, r1.id, repeat.id],
      motifs: { [motifId]: motif, [targetMotifId]: targetMotif, [motifOwnerId]: motifOwner },
    }

    const refA: BandRef = { path: [], bandId: b1.id, segmentStart: b1.points[0]!.id }
    const refB: BandRef = { path: [], bandId: b2.id, segmentStart: b2.points[0]!.id }

    return { base, b1, b2, r1, repeat, refA, refB, foreignBand, foreignInstance }
  }

  it('accepts the bare fixture (no crossings yet)', () => {
    expect(validateProject(crossingFixture().base)).toBeNull()
  })

  it('rejects a crossing record living inside a motif definition', () => {
    const p = newProject('mm')
    const materialId = p.materials[0]!.id
    const b1 = band(materialId, [pt(0, 0), pt(10, 0)])
    const b2 = band(materialId, [pt(0, 5), pt(10, 5)])
    const refA: BandRef = { path: [], bandId: b1.id, segmentStart: b1.points[0]!.id }
    const refB: BandRef = { path: [], bandId: b2.id, segmentStart: b2.points[0]!.id }
    const badRef: BandRef = { ...refA, bandId: newId() }
    const { a, b, over } = canonicalPair(badRef, refB)
    const motifId = newId()
    const motif: MotifDefinition = {
      id: motifId,
      name: 'M',
      children: [b1.id, b2.id],
      crossings: [{ id: newId(), a, b, over, hint: { x: 0, y: 0 } }],
    }
    const next: Project = {
      ...p,
      objects: { [b1.id]: b1, [b2.id]: b2 },
      motifs: { [motifId]: motif },
    }
    expect(validateProject(next)?.path).toMatch(
      new RegExp(`^motifs\\.${motifId}\\.crossings\\[0\\]\\.(a|b)\\.bandId$`),
    )
  })

  it('rejects a bandId that exists only in a different context', () => {
    const { base, foreignBand, refA, refB } = crossingFixture()
    const badRef: BandRef = { ...refA, bandId: foreignBand.id }
    const { a, b, over } = canonicalPair(badRef, refB)
    const next: Project = { ...base, crossings: [{ id: newId(), a, b, over, hint: { x: 0, y: 0 } }] }
    expect(validateProject(next)?.path).toMatch(/^crossings\[0\]\.(a|b)\.bandId$/)
  })

  it('rejects a bandId that points at a Region', () => {
    const { base, r1, refA, refB } = crossingFixture()
    const badRef: BandRef = { ...refA, bandId: r1.id }
    const { a, b, over } = canonicalPair(badRef, refB)
    const next: Project = { ...base, crossings: [{ id: newId(), a, b, over, hint: { x: 0, y: 0 } }] }
    expect(validateProject(next)?.path).toMatch(/^crossings\[0\]\.(a|b)\.bandId$/)
  })

  it('rejects a path step naming an instance owned by a different context', () => {
    const { base, foreignInstance, refA, refB } = crossingFixture()
    const badRef: BandRef = { ...refA, path: [{ instanceId: foreignInstance.id }] }
    const { a, b, over } = canonicalPair(badRef, refB)
    const next: Project = { ...base, crossings: [{ id: newId(), a, b, over, hint: { x: 0, y: 0 } }] }
    expect(validateProject(next)?.path).toMatch(/^crossings\[0\]\.(a|b)\.path\[0\]$/)
  })

  it('rejects a repeat step whose row is out of range', () => {
    const { base, repeat, refA, refB } = crossingFixture()
    const badRef: BandRef = { ...refA, path: [{ repeatId: repeat.id, row: 99, column: 0 }] }
    const { a, b, over } = canonicalPair(badRef, refB)
    const next: Project = { ...base, crossings: [{ id: newId(), a, b, over, hint: { x: 0, y: 0 } }] }
    expect(validateProject(next)?.path).toMatch(/^crossings\[0\]\.(a|b)\.path\[0\]$/)
  })

  it('rejects a segmentStart that is not a point of the band', () => {
    const { base, refA, refB } = crossingFixture()
    const badRef: BandRef = { ...refA, segmentStart: newId() }
    const { a, b, over } = canonicalPair(badRef, refB)
    const next: Project = { ...base, crossings: [{ id: newId(), a, b, over, hint: { x: 0, y: 0 } }] }
    expect(validateProject(next)?.path).toMatch(/^crossings\[0\]\.(a|b)\.segmentStart$/)
  })

  it('rejects a duplicate canonical key within one context', () => {
    const { base, refA, refB } = crossingFixture()
    const { a, b, over } = canonicalPair(refA, refB)
    const next: Project = {
      ...base,
      crossings: [
        { id: newId(), a, b, over, hint: { x: 0, y: 0 } },
        { id: newId(), a, b, over, hint: { x: 0, y: 0 } },
      ],
    }
    expect(validateProject(next)?.path).toBe('crossings[1]')
  })

  it('rejects a crossing where a and b refer to the same occurrence', () => {
    const { base, refA } = crossingFixture()
    const next: Project = {
      ...base,
      crossings: [{ id: newId(), a: refA, b: refA, over: 'a', hint: { x: 0, y: 0 } }],
    }
    expect(validateProject(next)?.path).toBe('crossings[0]')
  })

  it('rejects a crossing stored out of canonical order', () => {
    const { base, refA, refB } = crossingFixture()
    const sorted = canonicalPair(refA, refB)
    const inverted: Crossing = {
      id: newId(),
      a: sorted.b,
      b: sorted.a,
      over: sorted.over === 'a' ? 'b' : 'a',
      hint: { x: 0, y: 0 },
    }
    const next: Project = { ...base, crossings: [inverted] }
    expect(validateProject(next)?.path).toBe('crossings[0]')
  })
})

describe('importProject — schema enum and format rejections', () => {
  function expectRejectedAt(raw: unknown, path: string): void {
    const result = importProject(JSON.stringify(raw))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.path).toBe(path)
  }

  it('rejects an invalid displayUnits value', () => {
    const raw = { ...newProject('mm'), displayUnits: 'cm' }
    expectRejectedAt(raw, 'displayUnits')
  })

  it('rejects an invalid alternateRotationDeg value', () => {
    const p = newProject('mm')
    const motifId = newId()
    const repeat = { ...repeatField(motifId), alternateRotationDeg: 45 }
    const raw = {
      ...p,
      objects: { [repeat.id]: repeat },
      rootChildren: [repeat.id],
      motifs: { [motifId]: { id: motifId, name: 'M', children: [], crossings: [] } },
    }
    expectRejectedAt(raw, `objects.${repeat.id}.alternateRotationDeg`)
  })

  it('rejects an invalid material colour', () => {
    const p = newProject('mm')
    const [first, ...rest] = p.materials
    const raw = { ...p, materials: [{ ...first!, color: '#GGGGGG' }, ...rest] }
    expectRejectedAt(raw, 'materials[0].color')
  })

  it('rejects an id containing a colon', () => {
    const p = newProject('mm')
    const [first, ...rest] = p.materials
    const raw = { ...p, materials: [{ ...first!, id: 'bad:id' }, ...rest] }
    expectRejectedAt(raw, 'materials[0].id')
  })
})
