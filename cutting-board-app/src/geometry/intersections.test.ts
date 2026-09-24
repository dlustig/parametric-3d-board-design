import { describe, expect, it } from 'vitest'
import type { Band, DesignObject, MotifInstance, Point, Project, Region, RepeatField, Transform } from '../domain/model.ts'
import { newId } from '../domain/ids.ts'
import { refKey } from '../domain/keys.ts'
import { newProject } from '../domain/project.ts'
import { expand, expandContext } from './expand.ts'
import type { Intersection } from './intersections.ts'
import { findIntersections } from './intersections.ts'
import { footprint } from './footprint.ts'

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

  // Perpendicular 6.35 mm crossing: halfDiagonal(classification footprint) = 7.35·√2/2 ≈ 5.20.
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
  // Crossing at (50,50), perpendicular 6.35 mm bands: the classification footprint spans 50 ± 3.675.
  const a = (): Band => bandAt(50, 50, 0)
  const b = (): Band => bandAt(50, 50, 90)

  it('region painted between A and B entering the classification footprint → occluded', () => {
    const r = region([
      [52, 52],
      [60, 52],
      [60, 60],
      [52, 60],
    ])

    expect(classes(classify([a(), r, b()]))).toEqual(['occluded'])
  })

  it('region 1 mm outside the classification footprint → eligible', () => {
    const r = region([
      [54.675, 54.675],
      [60, 54.675],
      [60, 60],
      [54.675, 60],
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

  it('the same 30° band without its joint (two separate arms) → eligible', () => {
    const v = 50 + 15 / Math.SQRT2
    const arm = (deg: number): [number, number] => [v + 40 * Math.cos((deg * Math.PI) / 180), v + 40 * Math.sin((deg * Math.PI) / 180)]
    const arm30 = band([[v, v], arm(30)])
    const arm60 = band([[v, v], arm(60)])

    expect(classes(classify([a(), arm30, arm60, b()]))).toEqual(['eligible'])
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
  // crossing pair (`occluded` still uses the enlarged classification footprint).
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
