// SPEC §7.4 keyboard dispatch: one window `keydown` listener for tool
// switching, undo/redo, and the selection commands (Delete, Duplicate,
// Copy/Paste, arrow nudge) and drawing keys (Enter/Backspace/Esc while
// drawing — moved here from the temporary listener in ToolOptions.tsx).
// Ignores events whose target is an input, textarea, select, or
// contenteditable: Esc on a field is excepted only in the sense that the
// field's own handler already reverted it and stopped the event from
// bubbling here, so this dispatcher takes no further action either way.
//
// `Space` stays owned by Canvas.tsx (pan-vs-drag input ownership, SPEC
// §7.2) — a second, narrowly-scoped listener, not folded in here, so there
// is still exactly one owner per key.
//
// Mirror X/Y, Rotate 90°/by, the order buttons, and Offset copy have no
// keyboard shortcut in SPEC §7.4 — only a toolbar/inspector button, already
// wired (SelectionPanel, BandPanel) straight to the same domain commands
// this dispatcher calls, so nothing here duplicates them. `Ctrl/Cmd+G`
// (Create Motif) is reserved for Task 13: swallowed, no action yet.

import type { Clipboard } from '@/domain/commands'
import { copyObjects, deleteObjects, pasteObjects, translateObjects } from '@/domain/commands'
import { duplicateObjects } from '@/domain/commands/duplicate.ts'
import type { Id } from '@/domain/model'
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
    newIds = result.newIds
    return result.project
  })
  useEditor.setState({ selection: newIds })
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
  s.run((p) => pasteObjects(p, ctx, clip))
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

    const mod = e.ctrlKey || e.metaKey
    const key = e.key
    const lower = key.toLowerCase()

    if (useEditor.getState().drawing !== null) {
      if (key === 'Enter') {
        finishDrawing()
        e.preventDefault()
        return
      }
      const undoChord = mod && !e.shiftKey && !e.altKey && lower === 'z'
      if (key === 'Backspace' || undoChord) {
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
      if (lower === 'd') {
        duplicateSelection()
        e.preventDefault()
        return
      }
      if (lower === 'g') {
        e.preventDefault() // Create Motif — reserved for Task 13
        return
      }
      if (lower === 'c') {
        copySelection()
        return
      }
      if (lower === 'v') {
        pasteClipboard()
        return
      }
      return // an unrecognized modified chord: never falls through to a plain-key binding
    }

    if (!e.altKey && !e.shiftKey) {
      const tool = TOOL_KEYS[lower]
      if (tool !== undefined) {
        useEditor.getState().setTool(tool)
        e.preventDefault()
        return
      }
    }

    if (!e.altKey && (key === 'Delete' || key === 'Backspace')) {
      deleteSelection()
      e.preventDefault()
      return
    }

    if (!e.altKey && (key === 'ArrowUp' || key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowRight')) {
      const dx = key === 'ArrowLeft' ? -1 : key === 'ArrowRight' ? 1 : 0
      const dy = key === 'ArrowUp' ? -1 : key === 'ArrowDown' ? 1 : 0
      nudge(dx, dy, e.shiftKey)
      e.preventDefault()
    }
  }

  window.addEventListener('keydown', onKeyDown)
  return () => window.removeEventListener('keydown', onKeyDown)
}
