// SPEC §11 (amended): `cycleSelection`'s wraparound and multi-selection
// semantics — plain state logic, no DOM/keyboard event needed, unlike the
// rest of `keyboard.ts`'s dispatcher (that stays covered at the Playwright
// level: `e2e/a11y.spec.ts`, `e2e/crossings.spec.ts`, `e2e/materials.spec.ts`).

import { describe, expect, it } from 'vitest'
import type { Project } from '../domain/model.ts'
import { band, project } from '../domain/test-builders.ts'
import { copySelection, cycleSelection, pasteClipboard } from './keyboard.ts'
import { useEditor } from './store.ts'

/** Four root Bands, in paint order a, b, c, d. */
function fourObjectProject(): Project {
  return project([
    band('a', [[0, 0], [10, 0]]),
    band('b', [[0, 10], [10, 10]]),
    band('c', [[0, 20], [10, 20]]),
    band('d', [[0, 30], [10, 30]]),
  ])
}

function resetStore(p: Project, selection: string[] = []): void {
  useEditor.setState({ project: p, selection, editContext: [] })
  useEditor.temporal.getState().clear()
}

function selection(): string[] {
  return useEditor.getState().selection
}

describe('cycleSelection: single selection or none', () => {
  it('] with nothing selected selects the first object', () => {
    resetStore(fourObjectProject(), [])
    cycleSelection(1)
    expect(selection()).toEqual(['a'])
  })

  it('[ with nothing selected selects the last object', () => {
    resetStore(fourObjectProject(), [])
    cycleSelection(-1)
    expect(selection()).toEqual(['d'])
  })

  it('] steps forward from a single selection, wrapping past the last object to the first', () => {
    resetStore(fourObjectProject(), ['c'])
    cycleSelection(1)
    expect(selection()).toEqual(['d'])
    cycleSelection(1)
    expect(selection()).toEqual(['a']) // wrap
  })

  it('[ steps backward from a single selection, wrapping past the first object to the last', () => {
    resetStore(fourObjectProject(), ['b'])
    cycleSelection(-1)
    expect(selection()).toEqual(['a'])
    cycleSelection(-1)
    expect(selection()).toEqual(['d']) // wrap
  })

  it('a selected object from a different context (not found here) starts fresh, same as nothing selected', () => {
    resetStore(fourObjectProject(), ['not-in-this-context'])
    cycleSelection(1)
    expect(selection()).toEqual(['a'])
  })
})

describe('cycleSelection: multi-selection', () => {
  it('] continues from the object after the LAST selected one in paint order', () => {
    resetStore(fourObjectProject(), ['b', 'd']) // last in paint order: d (index 3)
    cycleSelection(1)
    expect(selection()).toEqual(['a']) // wraps past d
  })

  it('[ continues from the object before the FIRST selected one in paint order', () => {
    resetStore(fourObjectProject(), ['b', 'd']) // first in paint order: b (index 1)
    cycleSelection(-1)
    expect(selection()).toEqual(['a'])
  })

  it('] from a multi-selection not touching either end steps just past the last member', () => {
    resetStore(fourObjectProject(), ['a', 'c']) // last: c (index 2)
    cycleSelection(1)
    expect(selection()).toEqual(['d'])
  })

  it('selection order does not matter — only paint-order position does', () => {
    resetStore(fourObjectProject(), ['d', 'b']) // same pair as above, reversed in the array
    cycleSelection(1)
    expect(selection()).toEqual(['a'])
  })

  it('a multi-selection with some ids outside this context still cycles from the ones that are in it', () => {
    resetStore(fourObjectProject(), ['b', 'not-in-this-context', 'c'])
    cycleSelection(1) // last found: c (index 2)
    expect(selection()).toEqual(['d'])
  })
})

describe('cycleSelection: an empty context', () => {
  it('does nothing when the current context has no objects', () => {
    resetStore(project([]), ['stale'])
    cycleSelection(1)
    expect(selection()).toEqual(['stale']) // unchanged
  })
})

describe('the clipboard lives in the store (shell §9.4)', () => {
  it('Copy writes it, replaceProject keeps it, Paste reads it', () => {
    resetStore(fourObjectProject(), ['a'])
    useEditor.setState({ clipboard: null })
    copySelection()
    expect(useEditor.getState().clipboard?.objects.map((o) => o.type)).toEqual(['band'])

    useEditor.getState().replaceProject(project([]))
    expect(useEditor.getState().clipboard).not.toBeNull()

    pasteClipboard()
    const pasted = useEditor.getState().project.rootChildren
    expect(pasted).toHaveLength(1)
    expect(useEditor.getState().selection).toEqual(pasted)
  })

  it('Paste with nothing copied changes nothing', () => {
    resetStore(fourObjectProject())
    useEditor.setState({ clipboard: null })
    const before = useEditor.getState().project
    pasteClipboard()
    expect(useEditor.getState().project).toBe(before)
    expect(useEditor.temporal.getState().pastStates).toHaveLength(0)
  })
})
