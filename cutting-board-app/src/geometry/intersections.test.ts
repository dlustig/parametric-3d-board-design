import { describe, expect, it } from 'vitest'
import type { Band, DesignObject, MotifInstance, Point, Project, Region, RepeatField, Transform } from '../domain/model.ts'
import { newId } from '../domain/ids.ts'
import { refKey } from '../domain/keys.ts'
import { newProject } from '../domain/project.ts'
import { reorder, setBandWidth, setMaterial, translateObjects } from '../domain/commands/index.ts'
import { fixtures } from '../fixtures/index.ts'
import { expand, expandContext } from './expand.ts'
import type { Intersection } from './intersections.ts'
import { findIntersections } from './intersections.ts'
import { footprint } from './footprint.ts'
import { conservativeBounds } from './bounds.ts'

const MATERIAL = newId()

function pt(x: number, y: number): Point {
  return { id: newId(), x, y }
}

function band(coords: Array<[number, number]>, widthMm = 6.35, closed = false): Band {
  return { type: 'band', id: newId(), materialId: MATERIAL, widthMm, closed, points: coords.map(([x, y]) => pt(x, y)) }
}

function region(coords: Array<[number, number]>): Region {
  return { type: 'region', id: newId(), materialId: MATERIAL, points: coords.map(([x, y]) => pt(x, y)) }
}

function transform(overrides: Partial<Transform> = {}): Transform {
  return { x: 0, y: 0, rotationDeg: 0, mirrorX: false, mirrorY: false, scale: 1, ...overrides }
}

/** A project whose root children are `objects`, in paint order. */
function rootProject(objects: DesignObject[]): Project {
  const base = newProject('mm')
  return {
    ...base,
    materials: [{ id: MATERIAL, name: 'Maple', color: '#E8D4A8' }],
    objects: Object.fromEntries(objects.map((o) => [o.id, o])),
    rootChildren: objects.map((o) => o.id),
  }
}

/** A project with one motif (children `children`) placed at the root by `placement`. */
function motifProject(children: DesignObject[], placement: (motifId: string) => MotifInstance | RepeatField, extraRoot: DesignObject[] = []): { p: Project; motifId: string } {
  const motifId = newId()
  const placed = placement(motifId)
  const p = rootProject([placed, ...extraRoot])
  return {
    motifId,
    p: {
      ...p,
      objects: { ...p.objects, ...Object.fromEntries(children.map((o) => [o.id, o])) },
      motifs: { [motifId]: { id: motifId, name: 'motif', children: children.map((o) => o.id), crossings: [] } },
    },
  }
}

function classify(objects: DesignObject[]): Intersection[] {
  return findIntersections(expand(rootProject(objects)))
}

function classes(list: Intersection[]): string[] {
  return list.map((i) => i.cls)
}

/** A band through (cx, cy) at `deg` degrees, 200 mm long. */
function bandAt(cx: number, cy: number, deg: number, widthMm = 6.35): Band {
  const r = (deg * Math.PI) / 180
  const dx = 100 * Math.cos(r)
  const dy = 100 * Math.sin(r)
  return band(
    [
      [cx - dx, cy - dy],
      [cx + dx, cy + dy],
    ],
    widthMm,
  )
}

describe('findIntersections — basic classes', () => {
  it('plain X crossing → one eligible at (50,50), canonical a/b order, empty reason', () => {
    const list = classify([
      band([
        [0, 0],
        [100, 100],
      ]),
      band([
        [0, 100],
        [100, 0],
      ]),
    ])

    expect(classes(list)).toEqual(['eligible'])
    const x = list[0]!
    // Task 6 rebuilds the clip polygon from the Intersection's sides with its own enlargement.
    expect(footprint(x.a.seg, x.a.occ.worldWidth, x.b.seg, x.b.occ.worldWidth)).toEqual(x.footprint)
    expect(x.point.x).toBeCloseTo(50, 9)
    expect(x.point.y).toBeCloseTo(50, 9)
    expect(x.reason).toBe('')
    expect(x.footprint).toHaveLength(4)
    const keyA = refKey({ path: x.a.occ.path, bandId: x.a.occ.sourceId, segmentStart: x.a.segmentStart })
    const keyB = refKey({ path: x.b.occ.path, bandId: x.b.occ.sourceId, segmentStart: x.b.segmentStart })
    expect(keyA < keyB).toBe(true)
  })

  it('T-junction (one segment ends on the other) → endpoint', () => {
    const list = classify([
      band([
        [0, 50],
        [100, 50],
      ]),
      band([
        [50, 0],
        [50, 50],
      ]),
    ])

    expect(classes(list)).toEqual(['endpoint'])
    expect(list[0]!.reason).not.toBe('')
    expect(list[0]!.footprint).toBeNull()
  })

  it('both ends meet (collinear seam) → not listed (ignored)', () => {
    const list = classify([
      band([
        [0, 50],
        [50, 50],
      ]),
      band([
        [50, 50],
        [100, 50],
      ]),
    ])

    expect(list).toEqual([])
  })

  it('collinear overlap → collinear', () => {
    const list = classify([
      band([
        [0, 50],
        [100, 50],
      ]),
      band([
        [50, 50],
        [150, 50],
      ]),
    ])

    expect(classes(list)).toEqual(['collinear'])
    expect(list[0]!.footprint).toBeNull()
  })

  it('5° → near-parallel', () => {
    expect(classes(classify([bandAt(50, 50, 0), bandAt(50, 50, 5)]))).toEqual(['near-parallel'])
  })

  it('0° vs 175° → near-parallel (the 180 − θ side)', () => {
    expect(classes(classify([bandAt(50, 50, 0), bandAt(50, 50, 175)]))).toEqual(['near-parallel'])
  })

  it('10° exactly is not near-parallel', () => {
    expect(classes(classify([bandAt(50, 50, 0), bandAt(50, 50, 10)]))).toEqual(['eligible'])
  })

  it('self-crossing polyline → no intersection listed', () => {
    const list = classify([
      band([
        [0, 0],
        [100, 100],
        [100, 0],
        [0, 100],
      ]),
    ])

    expect(list).toEqual([])
  })
})

describe('findIntersections — near-joint', () => {
  const horizontal = (): Band =>
    band([
      [0, 50],
      [100, 50],
    ])

  it('polyline joint 1 mm from the crossing → near-joint', () => {
    const list = classify([
      horizontal(),
      band([
        [50, 0],
        [50, 51],
        [100, 100],
      ]),
    ])

    expect(classes(list)).toEqual(['near-joint'])
  })

  // Perpendicular 6.35 mm crossing: halfDiagonal(both-enlarged footprint) = 7.35·√2/2 ≈ 5.20.
  it('90° joint 8 mm away → near-joint through its miter extent (6.35 / (2 sin 45°) ≈ 4.49)', () => {
    const list = classify([
      horizontal(),
      band([
        [50, 0],
        [50, 58],
        [100, 58],
      ]),
    ])

    expect(classes(list)).toEqual(['near-joint'])
  })

  it('90° joint 12 mm away → eligible (beyond 5.20 + 4.49)', () => {
    const list = classify([
      horizontal(),
      band([
        [50, 0],
        [50, 62],
        [100, 62],
      ]),
    ])

    expect(classes(list)).toEqual(['eligible'])
  })

  it('sharp 14° joint 30 mm away → near-joint (miter extent ≈ 25.98)', () => {
    const list = classify([
      band([
        [0, 50],
        [55, 50],
      ]),
      band([
        [50, 0],
        [50, 80],
        [70, 0],
      ]),
    ])

    expect(classes(list)).toEqual(['near-joint'])
  })

  it('10° crossing, w = 10: U joint (miter extent 20) 78 mm along U → near-joint via the both-enlarged half-diagonal', () => {
    // Plain half-diagonal = 5/sin10° · 2cos5° ≈ 57.36 (radius 77.36 < 78, would pass);
    // both widths + 2·MAX_CLIP_EXTEND_MM: 5.5/sin10° · 2cos5° ≈ 63.10 (radius 83.10 ≥ 78, caught).
    const theta = (10 * Math.PI) / 180
    const phi = 2 * Math.asin(0.25) // 10 / (2 sin(φ/2)) = 20
    const vertex: [number, number] = [78 * Math.cos(theta), 78 * Math.sin(theta)]
    const back = Math.PI + theta - phi // turns away from O, so U does not cross it again
    const list = classify([
      band(
        [
          [-100, 0],
          [100, 0],
        ],
        10,
      ),
      band(
        [
          [-100 * Math.cos(theta), -100 * Math.sin(theta)],
          vertex,
          [vertex[0] + 30 * Math.cos(back), vertex[1] + 30 * Math.sin(back)],
        ],
        10,
      ),
    ])

    expect(classes(list)).toEqual(['near-joint'])
  })

  it('joint 40 mm away with 6.35 mm bands → eligible', () => {
    const list = classify([
      horizontal(),
      band([
        [50, 0],
        [50, 90],
        [100, 120],
      ]),
    ])

    expect(classes(list)).toEqual(['eligible'])
  })
})

describe('findIntersections — occluded', () => {
  // Crossing at (50,50), perpendicular 6.35 mm bands: the plain footprint spans 50 ± 3.175.
  const a = (): Band => bandAt(50, 50, 0)
  const b = (): Band => bandAt(50, 50, 90)

  it('region painted between A and B entering the footprint → occluded', () => {
    const r = region([
      [52, 52],
      [60, 52],
      [60, 60],
      [52, 60],
    ])

    expect(classes(classify([a(), r, b()]))).toEqual(['occluded'])
  })

  it('region painted between A and B, 0.5 mm outside the footprint → eligible', () => {
    const r = region([
      [53.675, 53.675],
      [60, 53.675],
      [60, 60],
      [53.675, 60],
    ])

    expect(classes(classify([a(), r, b()]))).toEqual(['eligible'])
  })

  it('band painted between O and U whose 30° miter tip (not its rectangles) enters the footprint → occluded', () => {
    // Footprint: [46.825, 53.175]². V's vertex sits 15 mm out along the diagonal with arms at
    // 30° and 60°; its rectangles stay beyond x, y ≥ 57.8, but the miter tip reaches
    // 15 − 6.35 / (2 sin 15°) ≈ 2.73 mm from the crossing.
    const v = 50 + 15 / Math.SQRT2
    const arm = (deg: number): [number, number] => [v + 40 * Math.cos((deg * Math.PI) / 180), v + 40 * Math.sin((deg * Math.PI) / 180)]
    const joint = band([arm(30), [v, v], arm(60)])

    expect(classes(classify([a(), joint, b()]))).toEqual(['occluded'])
  })

  it('band painted between O and U whose 20° miter tip, 2.5w–5w from its vertex, enters the footprint → occluded; conservative bounds cover the tip', () => {
    // Footprint: [46.825, 53.175]². V's vertex is at (50, 70), 16.8 mm = 2.65w beyond the
    // footprint, with arms at ±10° from +y; the miter tip reaches 6.35 / (2 sin 10°) ≈ 18.28 mm
    // = 2.88w toward the crossing, to (50, 51.72). U stops at y = 58, clear of V's centreline.
    const w = 6.35
    const arm = (deg: number): [number, number] => [50 + 40 * Math.cos((deg * Math.PI) / 180), 70 + 40 * Math.sin((deg * Math.PI) / 180)]
    const joint = band([arm(80), [50, 70], arm(100)], w)
    const u = band([[50, 20], [50, 58]], w)
    const list = classify([a(), joint, u])

    expect(classes(list)).toEqual(['occluded']) // the crossing is listed, and occluded by the tip
    const tipY = 70 - w / (2 * Math.sin((10 * Math.PI) / 180))
    expect(tipY).toBeLessThan(53.175 - 1)
    const bounds = conservativeBounds(expand(rootProject([joint]))[0]!)
    expect(bounds.minY).toBeLessThanOrEqual(tipY) // 5w pad; 2.5w (54.1) would stop short of the tip
  })

  it('the same 30° band without its joint (two separate arms) → eligible', () => {
    const v = 50 + 15 / Math.SQRT2
    const arm = (deg: number): [number, number] => [v + 40 * Math.cos((deg * Math.PI) / 180), v + 40 * Math.sin((deg * Math.PI) / 180)]
    const arm30 = band([[v, v], arm(30)])
    const arm60 = band([[v, v], arm(60)])

    expect(classes(classify([a(), arm30, arm60, b()]))).toEqual(['eligible'])
  })

  it('the same region painted below both bands → eligible', () => {
    const r = region([
      [52, 52],
      [60, 52],
      [60, 60],
      [52, 60],
    ])

    expect(classes(classify([r, a(), b()]))).toEqual(['eligible'])
  })

  it('the same region painted above both bands → eligible', () => {
    const r = region([
      [52, 52],
      [60, 52],
      [60, 60],
      [52, 60],
    ])

    expect(classes(classify([a(), b(), r]))).toEqual(['eligible'])
  })
})

describe('findIntersections — crowded', () => {
  it('three bands through one point → none eligible; the outer pair is occluded by the middle band (precedence), the others crowded', () => {
    // Spec §5.2 precedence puts `occluded` before `crowded`, so the (first, last) pair —
    // with the middle band painted between them over the point — is occluded.
    const [b0, b1, b2] = [bandAt(50, 50, 0), bandAt(50, 50, 60), bandAt(50, 50, 120)]
    const list = classify([b0, b1, b2])

    expect(list).toHaveLength(3)
    const clsOf = (x: Band, y: Band): string =>
      list.find((i) => [i.a.occ.sourceId, i.b.occ.sourceId].sort().join() === [x.id, y.id].sort().join())!.cls
    expect(clsOf(b0, b1)).toBe('crowded')
    expect(clsOf(b1, b2)).toBe('crowded')
    expect(clsOf(b0, b2)).toBe('occluded')
  })

  it('a 1° near-parallel pair does not crowd an eligible crossing 100 mm along the band (disc proxy)', () => {
    // The 1° plain footprint would reach ≈ 3.175 / sin 1° ≈ 182 mm along A; B itself is only 40 mm long.
    const c = Math.cos(Math.PI / 180)
    const s = Math.sin(Math.PI / 180)
    const list = classify([
      band([
        [-300, 0],
        [300, 0],
      ]),
      band([
        [-20 * c, -20 * s],
        [20 * c, 20 * s],
      ]),
      band([
        [100, -50],
        [100, 50],
      ]),
    ])

    expect(classes(list)).toEqual(['near-parallel', 'eligible'])
  })

  it('two crossings 1 mm apart on 6.35 mm bands → both crowded', () => {
    // B1, A, B2 in paint order so nothing lies between either crossing pair.
    const list = classify([bandAt(50, 50, 90), bandAt(50, 50, 0), bandAt(51, 50, 90)])

    expect(classes(list)).toEqual(['crowded', 'crowded'])
  })

  it('an eligible-looking crossing near an endpoint contact is crowded by the endpoint disc proxy', () => {
    // A T-junction at (50,50) and a crossing at (55,50): the disc of radius 6.35 reaches it.
    // T, A, V in paint order so nothing lies between A and V.
    const list = classify([
      band([
        [50, 0],
        [50, 50],
      ]),
      bandAt(50, 50, 0),
      bandAt(55, 50, 90),
    ])

    expect(list.map((i) => i.cls).sort()).toEqual(['crowded', 'endpoint'])
  })
})

describe('findIntersections — lattice with touching footprints (G4)', () => {
  // Spec §5.2 (rev 4): `crowded` compares plain footprints; they touch exactly when the
  // centreline step equals the width. Paint order B1, A, B2 so nothing lies between either
  // crossing pair.
  const w = 6.35
  const lattice = (step: number): Band[] => [
    band([
      [0, -50],
      [0, 50],
    ]),
    band([
      [-50, 0],
      [50, 0],
    ]),
    band([
      [step, -50],
      [step, 50],
    ]),
  ]
  const rotatedInstance = (step: number): { p: Project; motifId: string } =>
    motifProject(lattice(step), (id) => ({ type: 'motif-instance', id: newId(), motifId: id, transform: transform({ x: 100, y: 100, rotationDeg: 30 }) }))

  it('definition space: spacing = width, footprints touch, penetration 0 → both eligible', () => {
    const { p, motifId } = rotatedInstance(w)

    expect(classes(findIntersections(expandContext(p, motifId)))).toEqual(['eligible', 'eligible'])
  })

  it('world space, rotated 30° via an instance → same classes', () => {
    const { p } = rotatedInstance(w)

    expect(classes(findIntersections(expand(p)))).toEqual(['eligible', 'eligible'])
  })

  it('spacing slightly less than width (plain footprints overlap by 0.05 mm) → both crowded', () => {
    expect(classes(classify(lattice(w - 0.05)))).toEqual(['crowded', 'crowded'])
  })
})

describe('findIntersections — stacked cells (Review Focus 2)', () => {
  it('repeat with stepXMm 0, columns 3 → no eligible intersections, returns within 100 ms', () => {
    const inner = bandAt(0, 0, 0)
    const crossing = bandAt(0, 0, 90)
    const { p } = motifProject(
      [inner],
      (id) => ({
        type: 'repeat',
        id: newId(),
        motifId: id,
        transform: transform(),
        rows: 1,
        columns: 3,
        stepXMm: 0,
        stepYMm: 10,
        rowOffsetMm: 0,
        columnOffsetMm: 0,
        alternateMirrorX: false,
        alternateMirrorY: false,
        alternateRotationDeg: 0,
      }),
      [crossing],
    )
    const occurrences = expand(p)

    const start = performance.now()
    const list = findIntersections(occurrences)
    const elapsed = performance.now() - start

    expect(elapsed).toBeLessThan(100)
    expect(list.filter((i) => i.a.occ.sourceId === inner.id && i.b.occ.sourceId === inner.id).map((i) => i.cls)).toEqual(['collinear', 'collinear', 'collinear'])
    expect(list.filter((i) => i.cls === 'eligible')).toEqual([])
  })
})

describe('findIntersections — reclassifying from a previous list', () => {
  /** The list for `after` seeded from `before`'s first pass, and a full classification of it. */
  function both(before: Project, after: Project): { incremental: Intersection[]; full: Intersection[] } {
    const previous = expand(before)
    findIntersections(previous)
    return { incremental: findIntersections(expand(after), previous), full: findIntersections(expand(after)) }
  }

  // Fixture F with a root band across its lattice, painted last.
  const across = band([
    [15, 201.3],
    [384, 201.3],
  ])
  const interlace: Project = { ...fixtures.interlace, objects: { ...fixtures.interlace.objects, [across.id]: across }, rootChildren: [...fixtures.interlace.rootChildren, across.id] }
  const strand = 'p1' // a lattice-motif band: every cell's occurrence changes

  it.each([
    ['a moved root band', (p: Project): Project => translateObjects(p, [across.id], 7.3, 2.1)],
    ['a motif band in every cell', (p: Project): Project => setBandWidth(p, strand, 4)],
    ['a new paint order', (p: Project): Project => reorder(p, [across.id], 'back')],
    ['a material only', (p: Project): Project => setMaterial(p, [across.id, strand], 'cherry')],
  ])('equals a full classification after %s', (_, edit) => {
    const { incremental, full } = both(interlace, edit(interlace))
    expect(full.length).toBeGreaterThan(0)
    expect(incremental).toEqual(full)
  })

  it('reclassifies an unmoved pair when an element painted between them moves into or out of its footprint', () => {
    const a = bandAt(50, 50, 0)
    const b = bandAt(50, 50, 90)
    const r = region([
      [52, 52],
      [60, 52],
      [60, 60],
      [52, 60],
    ])
    const inside = rootProject([a, r, b])
    const outside = translateObjects(inside, [r.id], 20, 20)

    const moved = both(inside, outside)
    expect(classes(moved.incremental)).toEqual(['eligible'])
    expect(moved.incremental).toEqual(moved.full)
    const back = both(outside, inside)
    expect(classes(back.incremental)).toEqual(['occluded'])
    expect(back.incremental).toEqual(back.full)
  })

  it('recomputes the crowded result of an unmoved crossing when a moved one comes near it', () => {
    const a = bandAt(50, 50, 0)
    const b = bandAt(50, 50, 90)
    const c = bandAt(80, 50, 90) // crosses a 30 mm away: not crowding (a, b)
    const far = rootProject([c, a, b])
    const near = translateObjects(far, [c.id], -26, 0) // 4 mm from b: the footprints overlap

    const moved = both(far, near)
    expect(classes(moved.incremental)).toEqual(['crowded', 'crowded'])
    expect(moved.incremental).toEqual(moved.full)
  })
})
