// SPEC §7.1: the editor store's history/preview bookkeeping and its
// undo/redo repair of ephemeral state (selection, edit context).

import { describe, expect, it } from 'vitest'
import { IDENTITY, multiply } from '../geometry/affine.ts'
import { pathMatrix } from '../geometry/expand.ts'
import { addMaterial, deleteMaterial, deleteObjects } from '../domain/commands/index.ts'
import type { Project } from '../domain/model.ts'
import { newProject } from '../domain/project.ts'
import { band, instance, MAT, MAT2, project } from '../domain/test-builders.ts'
import { contextMatrix, currentContext, useEditor } from './store.ts'

/** Resets the shared store singleton to a known baseline before each test. */
function resetStore(p: Project): void {
  useEditor.setState({
    project: p,
    preview: null,
    tool: 'select',
    selection: [],
    editContext: [],
    camera: { x: 0, y: 0, zoom: 2 },
    currentMaterialId: p.materials[0]?.id ?? '',
    message: null,
    drawing: null,
  })
  useEditor.temporal.getState().clear()
}

describe('history bookkeeping', () => {
  it('camera, selection, and preview writes push no history; commit pushes exactly one entry', () => {
    const p0 = project([band('b1', [[0, 0], [10, 0]])])
    resetStore(p0)

    for (let i = 0; i < 60; i++) {
      useEditor.getState().setPreview({ ...p0, name: `preview-${i}` }, 'cancel')
    }
    useEditor.getState().setCamera({ x: 5, y: 5, zoom: 3 })
    useEditor.getState().select(['b1'])

    expect(useEditor.temporal.getState().pastStates.length).toBe(0)

    useEditor.getState().commit()

    expect(useEditor.temporal.getState().pastStates.length).toBe(1)
  })

  it('a camera change between undo and redo does not clear the redo stack', () => {
    const p0 = project([band('b1', [[0, 0], [10, 0]])])
    resetStore(p0)

    useEditor.getState().run((p) => deleteObjects(p, ['b1']))
    expect(useEditor.getState().project.objects['b1']).toBeUndefined()

    useEditor.getState().undo()
    expect(useEditor.getState().project.objects['b1']).toBeDefined()
    expect(useEditor.temporal.getState().futureStates.length).toBe(1)

    useEditor.getState().setCamera({ x: 1, y: 1, zoom: 4 })
    expect(useEditor.temporal.getState().futureStates.length).toBe(1)

    useEditor.getState().redo()
    expect(useEditor.getState().project.objects['b1']).toBeUndefined()
    expect(useEditor.temporal.getState().futureStates.length).toBe(0)
  })
})

describe('run settles an active preview first', () => {
  it('cancels a gesture preview, then applies the command as one history entry', () => {
    const p0 = project([band('b1', [[0, 0], [10, 0]])])
    resetStore(p0)

    useEditor.getState().setPreview({ ...p0, name: 'gesture' }, 'cancel')
    useEditor.getState().run((p) => deleteObjects(p, ['b1']))

    expect(useEditor.getState().preview).toBeNull()
    expect(useEditor.getState().project.name).toBe('Test') // preview discarded, not merged in
    expect(useEditor.getState().project.objects['b1']).toBeUndefined()
    expect(useEditor.temporal.getState().pastStates.length).toBe(1)
  })

  it('commits a field preview, then applies the command as two history entries', () => {
    const p0 = project([band('b1', [[0, 0], [10, 0]])])
    resetStore(p0)

    useEditor.getState().setPreview({ ...p0, name: 'field-edit' }, 'commit')
    useEditor.getState().run((p) => deleteObjects(p, ['b1']))

    expect(useEditor.getState().preview).toBeNull()
    expect(useEditor.getState().project.name).toBe('field-edit') // preview committed first
    expect(useEditor.getState().project.objects['b1']).toBeUndefined()
    expect(useEditor.temporal.getState().pastStates.length).toBe(2)
  })

  it('a failing command sets message and adds no history entry', () => {
    const p0 = project([band('b1', [[0, 0], [10, 0]])])
    resetStore(p0)
    const before = useEditor.getState().project

    useEditor.getState().run(() => ({ ok: false, message: 'nope' }))

    expect(useEditor.getState().message).toBe('nope')
    expect(useEditor.getState().project).toBe(before)
    expect(useEditor.temporal.getState().pastStates.length).toBe(0)
  })

  it('a later successful command clears a stale failure message', () => {
    const p0 = project([band('b1', [[0, 0], [10, 0]])])
    resetStore(p0)

    useEditor.getState().run(() => ({ ok: false, message: 'nope' }))
    expect(useEditor.getState().message).toBe('nope')

    useEditor.getState().run((p) => deleteObjects(p, ['b1']))

    expect(useEditor.getState().message).toBeNull()
  })
})

describe('undo() during a gesture preview', () => {
  it('cancels the preview and undoes the last committed change', () => {
    const p0 = project([band('b1', [[0, 0], [10, 0]])])
    resetStore(p0)

    useEditor.getState().run((p) => deleteObjects(p, ['b1']))
    useEditor.getState().setPreview({ ...useEditor.getState().project, name: 'gesture' }, 'cancel')

    useEditor.getState().undo()

    expect(useEditor.getState().preview).toBeNull()
    expect(useEditor.getState().project.objects['b1']).toBeDefined()
    const rendererSource = useEditor.getState().preview?.next ?? useEditor.getState().project
    expect(rendererSource).toBe(useEditor.getState().project)
  })
})

describe('undo() during a field (commit) preview', () => {
  it('settles the preview (two history entries), then undoes back to the pre-preview project', () => {
    const p0 = project([band('b1', [[0, 0], [10, 0]])])
    resetStore(p0)

    useEditor.getState().run((p) => deleteObjects(p, ['b1'])) // entry #1
    const prePreviewProject = useEditor.getState().project
    expect(useEditor.temporal.getState().pastStates.length).toBe(1)

    useEditor.getState().setPreview({ ...prePreviewProject, name: 'field-edit' }, 'commit')
    useEditor.getState().undo() // settlePreview() commits (entry #2), then undoes it

    expect(useEditor.getState().preview).toBeNull()
    expect(useEditor.getState().project).toBe(prePreviewProject) // back to the pre-preview project, not the preview
    // Two entries were pushed (run, then the settled commit); undo() consumed the second one.
    expect(useEditor.temporal.getState().pastStates.length).toBe(1)
    expect(useEditor.temporal.getState().futureStates.length).toBe(1)
  })
})

describe('replaceProject', () => {
  it('clears both history stacks and resets selection/editContext', () => {
    const p0 = project(
      [band('b1', [[0, 0], [10, 0]]), band('b2', [[20, 0], [30, 0]])],
      [{ id: 'm1', children: [band('c1', [[0, 0], [5, 5]])] }],
    )
    resetStore(p0)

    useEditor.getState().run((p) => deleteObjects(p, ['b1']))
    useEditor.getState().run((p) => deleteObjects(p, ['b2']))
    useEditor.getState().undo()
    expect(useEditor.temporal.getState().pastStates.length).toBe(1)
    expect(useEditor.temporal.getState().futureStates.length).toBe(1)

    useEditor.getState().select(['b1'])
    useEditor.getState().enterContext({ motifId: 'm1', path: [] })

    const fresh = newProject('mm')
    useEditor.getState().replaceProject(fresh)

    expect(useEditor.getState().project).toBe(fresh)
    expect(useEditor.getState().selection).toEqual([])
    expect(useEditor.getState().editContext).toEqual([])
    expect(useEditor.temporal.getState().pastStates.length).toBe(0)
    expect(useEditor.temporal.getState().futureStates.length).toBe(0)
  })

  // Controller ruling (Task 16): replaceProject must repair a dangling
  // currentMaterialId too, the same way undo/redo and deleteMaterial do —
  // an imported/new project may not contain the id the editor had selected.
  it('repairs a dangling currentMaterialId to the first material of the replacement project', () => {
    const p0 = project([band('b1', [[0, 0], [10, 0]])])
    resetStore(p0)
    useEditor.setState({ currentMaterialId: 'not-a-real-material-id' })

    const fresh = newProject('mm')
    useEditor.getState().replaceProject(fresh)

    expect(useEditor.getState().currentMaterialId).toBe(fresh.materials[0]!.id)
  })

  it('leaves currentMaterialId alone when it still names a material in the replacement project', () => {
    const p0 = project([band('b1', [[0, 0], [10, 0]])])
    resetStore(p0)
    useEditor.setState({ currentMaterialId: MAT2 })

    const replacement = project([band('b2', [[0, 0], [20, 0]])])
    useEditor.getState().replaceProject(replacement)

    expect(useEditor.getState().currentMaterialId).toBe(MAT2)
  })

  // Review ruling (Task 16 fix round 1): message is shown in exactly one
  // place (StatusBar) now, so a stale failure/notice must not survive a
  // project replacement (New/Open/fixture load) that has nothing to do
  // with it.
  it('clears a stale message', () => {
    const p0 = project([band('b1', [[0, 0], [10, 0]])])
    resetStore(p0)
    useEditor.setState({ message: 'stale error' })

    useEditor.getState().replaceProject(newProject('mm'))

    expect(useEditor.getState().message).toBeNull()
  })
})

describe('setTool', () => {
  // Review ruling (Task 16 fix round 1): same reasoning as replaceProject —
  // a message from one tool/context must not linger after switching away.
  it('clears a stale message', () => {
    const p0 = project([band('b1', [[0, 0], [10, 0]])])
    resetStore(p0)
    useEditor.setState({ message: 'stale error' })

    useEditor.getState().setTool('band')

    expect(useEditor.getState().message).toBeNull()
  })
})

describe('undo that removes a definition', () => {
  it('pops edit context to a valid level and drops missing selection ids', () => {
    const p0 = project([band('root-band', [[0, 0], [10, 0]])])
    resetStore(p0)

    // History entry: introduce motif "m1" (instance "inst1", child "c1").
    useEditor.getState().run((p) => ({
      ...p,
      objects: { ...p.objects, c1: band('c1', [[0, 0], [5, 5]]), inst1: instance('inst1', 'm1') },
      rootChildren: [...p.rootChildren, 'inst1'],
      motifs: { ...p.motifs, m1: { id: 'm1', name: 'm1', children: ['c1'], crossings: [] } },
    }))
    expect(useEditor.getState().project.motifs['m1']).toBeDefined()

    useEditor.getState().enterContext({ motifId: 'm1', path: [{ instanceId: 'inst1' }] })
    useEditor.getState().select(['c1'])

    useEditor.getState().undo()

    expect(useEditor.getState().project.motifs['m1']).toBeUndefined()
    expect(useEditor.getState().editContext).toEqual([])
    expect(useEditor.getState().selection).toEqual([])
  })
})

describe('currentContext and contextMatrix', () => {
  it('is null/identity at the root, and follows the entered path otherwise', () => {
    const inst = instance('inst1', 'm1', { x: 10, y: 20 })
    const p0 = project([inst], [{ id: 'm1', children: [band('c1', [[0, 0], [1, 1]])] }])
    resetStore(p0)

    expect(currentContext(useEditor.getState())).toBeNull()
    expect(contextMatrix(useEditor.getState())).toEqual(IDENTITY)

    useEditor.getState().enterContext({ motifId: 'm1', path: [{ instanceId: 'inst1' }] })

    expect(currentContext(useEditor.getState())).toBe('m1')
    expect(contextMatrix(useEditor.getState())).toEqual(pathMatrix(p0, [{ instanceId: 'inst1' }]))
  })
})

describe('two-level editContext repair', () => {
  // Root has two instances of motif A (instA1, instA2); A's definition holds
  // an instance of motif B (instB). Entering A via instA1, then B via instB,
  // mirrors the review's reproduction: instA1 is deletable without deleting A
  // (instA2 keeps it alive) or B (instB is untouched), so a naive "check only
  // the deepest level" repair leaves a dangling outer level behind.
  const PATH_A = [{ instanceId: 'instA1' }]
  const PATH_B = [{ instanceId: 'instB' }]

  function twoLevelProject(): Project {
    return project(
      [instance('instA1', 'A', { x: 100, y: 0 }), instance('instA2', 'A')],
      [
        { id: 'A', children: [band('bandA', [[0, 0], [1, 1]]), instance('instB', 'B', { x: 0, y: 50 })] },
        { id: 'B', children: [band('bandB', [[2, 2], [3, 3]])] },
      ],
    )
  }

  it('keeps both levels, and contextMatrix multiplies both path matrices, when nothing invalidates them', () => {
    const p0 = twoLevelProject()
    resetStore(p0)

    useEditor.getState().enterContext({ motifId: 'A', path: PATH_A })
    useEditor.getState().enterContext({ motifId: 'B', path: PATH_B })

    // No history to undo, but undo() always runs the post-undo repair against
    // the (here unchanged) current project — nothing invalidates either level.
    useEditor.getState().undo()

    expect(useEditor.getState().editContext).toHaveLength(2)
    const expected = multiply(pathMatrix(p0, PATH_A), pathMatrix(p0, PATH_B))
    expect(contextMatrix(useEditor.getState())).toEqual(expected)
  })

  it("deleting the outer level's entering instance clears the whole editContext, even though the inner level would still resolve on its own", () => {
    const p0 = twoLevelProject()
    resetStore(p0)

    useEditor.getState().enterContext({ motifId: 'A', path: PATH_A })
    useEditor.getState().enterContext({ motifId: 'B', path: PATH_B })

    useEditor.getState().run((p) => deleteObjects(p, ['instA1'])) // entry #1: instA1 gone
    useEditor.getState().run((p) => deleteObjects(p, ['bandB'])) // entry #2: unrelated further change
    expect(useEditor.getState().project.motifs['A']).toBeDefined() // instA2 keeps A alive
    expect(useEditor.getState().project.objects['instB']).toBeDefined() // B untouched

    useEditor.getState().undo() // reverts entry #2 only; lands back on the instA1-missing project

    expect(useEditor.getState().project.objects['instA1']).toBeUndefined()
    expect(useEditor.getState().editContext).toEqual([])
  })
})

describe('currentMaterialId repair', () => {
  it('deleteMaterial resets currentMaterialId to the first remaining material when the current one is deleted', () => {
    const p0 = project([band('b1', [[0, 0], [10, 0]])]) // materials: [Maple (MAT), Walnut (MAT2)]; b1 uses Maple, so Walnut is unused
    resetStore(p0)
    useEditor.setState({ currentMaterialId: MAT2 })

    useEditor.getState().run((p) => deleteMaterial(p, MAT2))

    expect(useEditor.getState().project.materials.map((m) => m.id)).toEqual([MAT])
    expect(useEditor.getState().currentMaterialId).toBe(MAT)
  })

  it('leaves currentMaterialId alone when a run() succeeds without touching materials', () => {
    const p0 = project([band('b1', [[0, 0], [10, 0]])])
    resetStore(p0)
    useEditor.setState({ currentMaterialId: MAT2 })

    useEditor.getState().run((p) => deleteObjects(p, ['b1']))

    expect(useEditor.getState().currentMaterialId).toBe(MAT2)
  })

  it('undo of an Add repairs currentMaterialId after selecting the new material', () => {
    const p0 = project([band('b1', [[0, 0], [10, 0]])])
    resetStore(p0)

    useEditor.getState().run((p) => addMaterial(p, { name: 'Oak', color: '#C19A6B' }))
    const added = useEditor.getState().project.materials.at(-1)!.id
    useEditor.setState({ currentMaterialId: added }) // simulates clicking the new swatch

    useEditor.getState().undo()

    expect(useEditor.getState().project.materials.map((m) => m.id)).toEqual([MAT, MAT2])
    expect(useEditor.getState().currentMaterialId).toBe(MAT)
  })
})

describe('immutability outside production (the geometry caches key on identity)', () => {
  const pointsOf = (p: Project, id: string): Array<{ x: number; y: number }> => (p.objects[id] as { points: Array<{ x: number; y: number }> }).points

  it('every project the store takes in is frozen: an in-place write to a band point throws', () => {
    useEditor.getState().replaceProject(project([band('b1', [[0, 0], [10, 0]])]))
    const replaced = useEditor.getState().project
    expect(() => {
      pointsOf(replaced, 'b1')[0]!.x = 5
    }).toThrow(TypeError)

    useEditor.getState().setPreview(project([band('b1', [[0, 0], [20, 0]])]), 'commit')
    expect(() => pointsOf(useEditor.getState().preview!.next, 'b1').push({ x: 1, y: 1 })).toThrow(TypeError)
    useEditor.getState().commit()
    expect(() => {
      pointsOf(useEditor.getState().project, 'b1')[1]!.y = 3
    }).toThrow(TypeError)

    useEditor.getState().run((p) => ({ ...p, name: 'renamed' }))
    expect(() => {
      useEditor.getState().project.name = 'mutated'
    }).toThrow(TypeError)
  })
})
