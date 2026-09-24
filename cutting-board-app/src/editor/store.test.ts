// SPEC §7.1: the editor store's history/preview bookkeeping and its
// undo/redo repair of ephemeral state (selection, edit context).

import { describe, expect, it } from 'vitest'
import { IDENTITY } from '../geometry/affine.ts'
import { pathMatrix } from '../geometry/expand.ts'
import { deleteObjects } from '../domain/commands/index.ts'
import type { Project } from '../domain/model.ts'
import { newProject } from '../domain/project.ts'
import { band, instance, project } from '../domain/test-builders.ts'
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
