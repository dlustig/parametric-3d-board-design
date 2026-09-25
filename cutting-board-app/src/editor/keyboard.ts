// SPEC §7.4 keyboard dispatch: one window `keydown` listener for tool
// switching, undo/redo, and the selection commands (Delete, Duplicate,
// Copy/Paste, arrow nudge) and drawing keys (Enter/Backspace/Esc while
// drawing — moved here from the temporary listener in ToolOptions.tsx).
// Ignores events whose target is an input, textarea, select, or
// contenteditable: Esc on a field is excepted only in the sense that the
// field's own handler already reverted it and stopped the event from
// bubbling here, so this dispatcher takes no further action either way.
//
// SPEC §11 (amended): `]`/`[` cycle the selection through the current
// context's objects (`cycleSelection`), the no-pointer path to an object's
// Inspector panel and crossing list — but only while focus hasn't already
// landed on a more specific control (`cyclingOwnsFocus`: the body, nothing
// focused yet, or the canvas wrapper itself), so a toolbar/inspector
// control's own keys are never hijacked. Tab is excluded from cycling
// entirely and always keeps its ordinary, native focus-movement behaviour —
// including moving focus out of the canvas — so there is still exactly one
// owner per key and Tab is never "stolen".
//
// `Space` stays owned by Canvas.tsx (pan-vs-drag input ownership, SPEC
// §7.2) — a second, narrowly-scoped listener, not folded in here, so there
// is still exactly one owner per key.
//
// Mirror X/Y, Rotate 90°/by, the order buttons, and Offset copy have no
// keyboard shortcut in SPEC §7.4 — only a toolbar/inspector button, already
// wired (SelectionPanel, BandPanel) straight to the same domain commands
// this dispatcher calls, so nothing here duplicates them. `Ctrl/Cmd+G` is
// Create Motif.

import type { Clipboard } from '@/domain/commands'
import { copyObjects, createMotif, deleteObjects, duplicateObjects, makeRepeat, pasteObjects, translateObjects } from '@/domain/commands'
import type { Id } from '@/domain/model'
import { childrenOf } from '@/domain/project'
import { apply, invert } from '@/geometry/affine'
import { cancelDrawing, finishDrawing, undoPoint } from './tools/draw.ts'
import type { EditorState, Tool } from './store.ts'
import { contextMatrix, currentContext, useEditor } from './store.ts'

type XY = { x: number; y: number }

const TOOL_KEYS: Record<string, Tool> = { v: 'select', h: 'hand', b: 'band', r: 'rect', p: 'polygon', x: 'crossing' }

function isFieldTarget(t: EventTarget | null): boolean {
  return t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))
}

/** The clipboard: a module variable, not the system clipboard (SPEC §7.4). */
let clipboard: Clipboard | null = null

// --- Selection command actions, shared by this dispatcher and the toolbar/inspector buttons ---

export function deleteSelection(): void {
  const s = useEditor.getState()
  if (s.selection.length === 0) return
  s.run((p) => deleteObjects(p, s.selection))
  useEditor.setState({ selection: [] })
}

export function duplicateSelection(): void {
  const s = useEditor.getState()
  if (s.selection.length === 0) return
  const ctx = currentContext(s)
  let newIds: Id[] = []
  s.run((p) => {
    const result = duplicateObjects(p, ctx, s.selection)
    if (!result.ok) return result
    newIds = result.newIds
    return result.project
  })
  if (newIds.length > 0) useEditor.setState({ selection: newIds })
}

export function copySelection(): void {
  const s = useEditor.getState()
  if (s.selection.length === 0) return
  clipboard = copyObjects(s.project, s.selection)
}

export function pasteClipboard(): void {
  if (clipboard === null) return
  const s = useEditor.getState()
  const ctx = currentContext(s)
  const clip = clipboard
  let newIds: Id[] = []
  s.run((p) => {
    const result = pasteObjects(p, ctx, clip)
    if (!result.ok) return result
    newIds = result.newIds
    return result.project
  })
  if (newIds.length > 0) useEditor.setState({ selection: newIds })
}

/** SPEC §7.4 Create Motif (`Ctrl/Cmd+G`): the selection becomes a motif; the new instance is selected. */
export function createMotifFromSelection(): void {
  const s = useEditor.getState()
  if (s.selection.length === 0) return
  const ctx = currentContext(s)
  let instanceId: Id | null = null
  s.run((p) => {
    const created = createMotif(p, ctx, s.selection)
    instanceId = created.instanceId
    return created.project
  })
  if (instanceId !== null) useEditor.setState({ selection: [instanceId] })
}

/** SPEC §7.4 Repeat: one selected instance becomes a 2×2 field; any other selection is made a motif first (one history step). */
export function repeatSelection(): void {
  const s = useEditor.getState()
  if (s.selection.length === 0) return
  const ctx = currentContext(s)
  const only = s.selection.length === 1 ? s.project.objects[s.selection[0]!] : undefined
  let fieldId: Id | null = null
  s.run((p) => {
    if (only?.type === 'motif-instance') {
      fieldId = only.id
      return makeRepeat(p, only.id)
    }
    const created = createMotif(p, ctx, s.selection)
    fieldId = created.instanceId
    return makeRepeat(created.project, created.instanceId)
  })
  if (fieldId !== null && Object.hasOwn(useEditor.getState().project.objects, fieldId)) useEditor.setState({ selection: [fieldId] })
}

/**
 * SPEC §11: `]`/`[` cycle the selection through the current context's
 * objects (its `childrenOf` order — paint order), wrapping at either end.
 *
 * With exactly one selected object found in this context, the cycle steps
 * from it. With a MULTI-selection, `]` continues from the object after the
 * LAST selected one in paint order and `[` from the object before the
 * FIRST — cycling always extends outward from the current selection's span,
 * never picks an arbitrary member of it to step from, and always leaves a
 * single object selected. With nothing selected, or a selection with no
 * member in this context (a different context, or all ids stale), the cycle
 * starts fresh: the first object (`]`) or the last (`[`).
 *
 * Exported for its own unit test (`keyboard.test.ts`) — it's plain state
 * logic with no DOM dependency, unlike the rest of this dispatcher.
 */
export function cycleSelection(direction: 1 | -1): void {
  const s = useEditor.getState()
  const children = childrenOf(s.project, currentContext(s))
  if (children.length === 0) return
  const found = s.selection.map((id) => children.indexOf(id)).filter((i) => i !== -1)
  const at = found.length === 0 ? -1 : direction === 1 ? Math.max(...found) : Math.min(...found)
  const next = at === -1 ? (direction === 1 ? 0 : children.length - 1) : (at + direction + children.length) % children.length
  s.select([children[next]!])
}

/**
 * `]`/`[` only cycle the selection while nothing more specific already owns
 * focus — the body (nothing focused yet) or the canvas wrapper itself — so
 * a toolbar/inspector control's own keys are never hijacked (SPEC §11).
 * Field targets (inputs, textareas, selects) are already excluded before
 * this dispatcher gets this far. Tab is deliberately NOT scoped by this: it
 * never cycles the selection at all, and always keeps its native,
 * browser-default focus-movement behaviour everywhere, canvas included.
 */
function cyclingOwnsFocus(target: EventTarget | null): boolean {
  return target === document.body || (target instanceof HTMLElement && target.classList.contains('canvas'))
}

/** Maps a world-space delta vector into the current context's space (a vector, not a point: no translation term). */
function mapDelta(s: EditorState, dx: number, dy: number): XY {
  const inv = invert(contextMatrix(s))
  const origin = apply(inv, { x: 0, y: 0 })
  const shifted = apply(inv, { x: dx, y: dy })
  return { x: shifted.x - origin.x, y: shifted.y - origin.y }
}

/** Arrow nudge: one grid step in screen/world axes (Shift ×10), mapped into the context (SPEC §7.4). */
function nudge(dx: number, dy: number, shift: boolean): void {
  const s = useEditor.getState()
  if (s.selection.length === 0) return
  const step = s.gridMm * (shift ? 10 : 1)
  const delta = mapDelta(s, dx * step, dy * step)
  s.run((p) => translateObjects(p, s.selection, delta.x, delta.y))
}

// --- Escape cascade: cancel gesture -> cancel drawing -> clear selection -> pop edit context -> Select tool ---

function handleEscape(): void {
  const s = useEditor.getState()
  if (s.preview !== null) {
    s.abortGesture?.() // stops Moveable's own drag tracking (Canvas.tsx), not just the store's preview
    s.cancelPreview()
    return
  }
  if (s.drawing !== null) {
    cancelDrawing()
    return
  }
  if (s.selection.length > 0) {
    s.select([])
    return
  }
  if (s.editContext.length > 0) {
    s.popContext()
    return
  }
  if (s.tool !== 'select') s.setTool('select')
}

export function installKeyboardDispatcher(): () => void {
  const onKeyDown = (e: KeyboardEvent): void => {
    if (isFieldTarget(e.target)) return

    // "do not treat Ctrl+Meta as mod": exactly one of Ctrl/Meta, never both
    // together, never neither. `noModifiers` is its own independent check —
    // holding both Ctrl and Meta makes `mod` false but must not look "plain".
    const ctrlOrMeta = e.ctrlKey || e.metaKey
    const mod = e.ctrlKey !== e.metaKey
    const noModifiers = !ctrlOrMeta && !e.altKey && !e.shiftKey
    const key = e.key
    const lower = key.toLowerCase()

    if (useEditor.getState().drawing !== null) {
      if (noModifiers && key === 'Enter') {
        finishDrawing()
        e.preventDefault()
        return
      }
      const undoChord = mod && !e.shiftKey && !e.altKey && lower === 'z'
      if ((noModifiers && key === 'Backspace') || undoChord) {
        undoPoint()
        e.preventDefault()
        return
      }
      if (key === 'Escape') {
        cancelDrawing()
        e.preventDefault()
        return
      }
    }

    if (key === 'Escape') {
      handleEscape()
      e.preventDefault()
      return
    }

    if (mod && !e.altKey) {
      if (!e.shiftKey && lower === 'z') {
        useEditor.getState().undo()
        e.preventDefault()
        return
      }
      if ((e.shiftKey && lower === 'z') || (!e.shiftKey && lower === 'y')) {
        useEditor.getState().redo()
        e.preventDefault()
        return
      }
      if (!e.shiftKey && lower === 'd') {
        duplicateSelection()
        e.preventDefault()
        return
      }
      if (!e.shiftKey && lower === 'g') {
        createMotifFromSelection()
        e.preventDefault()
        return
      }
      if (!e.shiftKey && lower === 'c') {
        copySelection()
        return
      }
      if (!e.shiftKey && lower === 'v') {
        pasteClipboard()
        return
      }
      return // an unrecognized modified chord: never falls through to a plain-key binding
    }

    if (!ctrlOrMeta && !e.altKey && (key === ']' || key === '[') && cyclingOwnsFocus(e.target)) {
      cycleSelection(key === ']' ? 1 : -1)
      e.preventDefault()
      return
    }

    if (noModifiers) {
      const tool = TOOL_KEYS[lower]
      if (tool !== undefined) {
        useEditor.getState().setTool(tool)
        e.preventDefault()
        return
      }
    }

    if (noModifiers && (key === 'Delete' || key === 'Backspace')) {
      deleteSelection()
      e.preventDefault()
      return
    }

    if (!ctrlOrMeta && !e.altKey && (key === 'ArrowUp' || key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowRight')) {
      const dx = key === 'ArrowLeft' ? -1 : key === 'ArrowRight' ? 1 : 0
      const dy = key === 'ArrowUp' ? -1 : key === 'ArrowDown' ? 1 : 0
      nudge(dx, dy, e.shiftKey)
      e.preventDefault()
    }
  }

  window.addEventListener('keydown', onKeyDown)
  return () => window.removeEventListener('keydown', onKeyDown)
}
