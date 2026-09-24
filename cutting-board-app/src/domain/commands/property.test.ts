// SPEC §2.1: every command preserves the invariants. A small in-test corpus
// until the fixtures arrive (Task 15 extends this test with them).

import { describe, expect, it } from 'vitest'
import { expand } from '../../geometry/expand.ts'
import { findIntersections } from '../../geometry/intersections.ts'
import type { Band, Id, Project, Step } from '../model.ts'
import { newProject } from '../project.ts'
import { band, instance, MAT, MAT2, project, record, ref, repeat } from '../test-builders.ts'
import { validateProject } from '../validate.ts'
import type { CommandResult } from './index.ts'
import * as commands from './index.ts'

const cell: Step = { repeatId: 'F', row: 1, column: 2 }

const stripes = project(
  [
    ...Array.from({ length: 7 }, (_, k) => band(`S${k}`, [[0, k * 6], [80, k * 6], [120, k * 6]], { materialId: k % 2 === 0 ? MAT : MAT2 })),
    band('X', [[60, -10], [60, 50], [70, 60]]),
  ],
  [],
  [record('r0', ref('S0', 'S00'), ref('X', 'X0'), 'a', { x: 60, y: 0 }), record('r3', ref('S3', 'S30'), ref('X', 'X0'), 'a', { x: 60, y: 18 })],
)

const field = project(
  [repeat('F', 'M', { transform: { x: 100, y: 100, rotationDeg: 0, mirrorX: false, mirrorY: false, scale: 1 } })],
  [{ id: 'M', children: [band('H', [[-20, 0], [10, 0], [20, 0]]), band('V', [[0, -20], [0, 10], [0, 20]])], crossings: [record('d', ref('H', 'H0'), ref('V', 'V0'), 'a', { x: 0, y: 0 })] }],
  [record('o', ref('H', 'H0', [cell]), ref('V', 'V0', [cell]), 'b', { x: 200, y: 150 })],
)

const inI: Step = { instanceId: 'I' }
const nested = project(
  [repeat('F', 'O', { rows: 2, columns: 2, stepXMm: 80, stepYMm: 80 }), band('R', [[-30, 5], [0, 6], [30, 5]])],
  [
    {
      id: 'O',
      children: [instance('I', 'N', { x: 5, rotationDeg: 30 }), band('Z', [[-25, -10], [10, 4], [25, 10]])],
      crossings: [
        record('n', ref('H', 'H0', [inI]), ref('V', 'V0', [inI]), 'a', { x: 5, y: 0 }),
        record('z', ref('Z', 'Z0'), ref('H', 'H0', [inI]), 'a', { x: 0, y: 0 }),
      ],
    },
    { id: 'N', children: [band('H', [[-20, 0], [10, 0], [20, 0]]), band('V', [[0, -20], [0, 10], [0, 20]])] },
  ],
)

const corpus: Array<[string, Project]> = [
  ['blank', newProject('mm')],
  ['stripes-like', stripes],
  ['3×3 repeat with records', field],
  ['nested motif', nested],
]

type Command = [string, (p: Project) => Project | CommandResult]

function firstOfType<T extends Project['objects'][string]['type']>(p: Project, type: T): Id | undefined {
  return Object.values(p.objects).find((o) => o.type === type)?.id
}

/** Representative calls of every command, with targets picked from `p`; empty where `p` has no target. */
function commandsFor(p: Project): Command[] {
  const m0 = p.materials[0]!.id
  const m1 = p.materials[1]!.id
  const root = p.rootChildren
  const out: Command[] = [
    ['addBand', (q) => commands.addBand(q, { ctx: null, materialId: m0, widthMm: 5, points: [{ x: -5, y: -5 }, { x: 90, y: 70 }] })],
    ['addRegion', (q) => commands.addRegion(q, { ctx: null, materialId: m0, points: [{ x: 0, y: 0 }, { x: 9, y: 0 }, { x: 9, y: 9 }] })],
    ['translate', (q) => commands.translateObjects(q, root, 3, -2)],
    ['rotate', (q) => commands.rotateObjects(q, root, 30, { x: 10, y: 10 })],
    ['mirror x', (q) => commands.mirrorObjects(q, root, 'x', { x: 40, y: 0 })],
    ['mirror y', (q) => commands.mirrorObjects(q, root, 'y', { x: 0, y: 40 })],
    ['setMaterial', (q) => commands.setMaterial(q, Object.keys(q.objects), m1)],
    ['addMaterial', (q) => commands.addMaterial(q, { name: 'Oak', color: '#C19A6B' })],
    ['updateMaterial', (q) => commands.updateMaterial(q, m0, { name: 'Renamed', color: '#000000' })],
    ['replaceMaterial', (q) => commands.replaceMaterial(q, m0, m1)],
    ...p.materials.map((m): Command => [`deleteMaterial ${m.name}`, (q) => commands.deleteMaterial(q, m.id)]),
    ...(['forward', 'backward', 'front', 'back'] as const).map((how): Command => [`reorder ${how}`, (q) => commands.reorder(q, root.slice(0, 1), how)]),
    ...root.map((id): Command => [`delete ${id}`, (q) => commands.deleteObjects(q, [id])]),
    ...Object.keys(p.motifs).map((m): Command => [`addBand in ${m}`, (q) => commands.addBand(q, { ctx: m, materialId: m0, widthMm: 2, points: [{ x: -9, y: -9 }, { x: 9, y: 9 }] })]),
    ...p.crossings.map((c): Command => [`removeRecord ${c.id}`, (q) => commands.removeRecord(q, null, c.id)]),
  ]

  for (const b of Object.values(p.objects).filter((o): o is Band => o.type === 'band')) {
    const [p0, p1] = [b.points[0]!, b.points[1]!]
    out.push(
      [`delete band ${b.id}`, (q) => commands.deleteObjects(q, [b.id])],
      [`setBandWidth ${b.id}`, (q) => commands.setBandWidth(q, b.id, 1.5)],
      [`setPoint ${b.id}`, (q) => commands.setPoint(q, b.id, p1.id, { x: p1.x + 4, y: p1.y - 3 })],
      [`setPoint merge ${b.id}`, (q) => commands.setPoint(q, b.id, p1.id, { x: p0.x + 0.001, y: p0.y })],
      [`insertPoint ${b.id}`, (q) => commands.insertPoint(q, b.id, p0.id, { x: (p0.x + p1.x) / 2 + 1, y: (p0.y + p1.y) / 2 + 1 })],
      ...b.points.map((pt): Command => [`deletePoint ${b.id}/${pt.id}`, (q) => commands.deletePoint(q, b.id, pt.id)]),
    )
  }

  const placed = firstOfType(p, 'motif-instance') ?? firstOfType(p, 'repeat')
  if (placed !== undefined) out.push(['setTransform', (q) => commands.setTransform(q, placed, { rotationDeg: 45, scale: 1.5, mirrorX: true })])
  const field = firstOfType(p, 'repeat')
  if (field !== undefined) {
    out.push(
      ['rows 1', (q) => commands.setRepeatParams(q, field, { rows: 1 })],
      ['columns 1', (q) => commands.setRepeatParams(q, field, { columns: 1 })],
      ['over cap', (q) => commands.setRepeatParams(q, field, { rows: 50, columns: 50 })],
      ['grid params', (q) => commands.setRepeatParams(q, field, { stepXMm: 7, rowOffsetMm: 3, alternateRotationDeg: 90, alternateMirrorX: true })],
    )
  }

  findIntersections(expand(p)).forEach((i, k) => {
    out.push([`toggle all #${k}`, (q) => commands.toggleCrossing(q, i, 'all')], [`toggle occurrence #${k}`, (q) => commands.toggleCrossing(q, i, 'occurrence')])
  })
  return out
}

describe('every command preserves the §2.1 invariants', () => {
  for (const [name, p] of corpus) {
    it(name, () => {
      expect(validateProject(p)).toBeNull()
      for (const [label, run] of commandsFor(p)) {
        const result = run(p)
        const next = 'ok' in result ? (result.ok ? result.project : p) : result
        expect({ label, error: validateProject(next) }).toEqual({ label, error: null })
      }
    })
  }
})
