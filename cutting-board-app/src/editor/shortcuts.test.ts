// @vitest-environment jsdom
// Shell spec §12.1, §16: every SHORTCUTS entry that keyboard.ts dispatches
// produces its effect when its first chord is pressed (Space and Alt are
// display-only: Canvas and snapping own them), formatChord per platform,
// and Review Focus 3 — `?` typed in a field never opens the sheet. The pane
// and project chords (Task 3) call the registered `uiActions` and the
// (mocked) download helpers.

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { translateObjects } from '@/domain/commands'
import type { Band } from '@/domain/model'
import { band, MAT, project } from '@/domain/test-builders'
import { downloadExportSvg, downloadProject } from '@/export/download'
import { copySelection, installKeyboardDispatcher, pasteClipboard } from './keyboard.ts'
import { useLayout } from './layout.ts'
import type { Shortcut, ShortcutId } from './shortcuts.ts'
import { detectPlatform, DISPLAY_ONLY, formatChord, SHORTCUTS } from './shortcuts.ts'
import { useEditor } from './store.ts'

vi.mock('@/export/download', () => ({ downloadProject: vi.fn(), downloadExportSvg: vi.fn() }))

const table: Readonly<Record<string, Shortcut>> = SHORTCUTS

const ui = { toggleLeft: vi.fn(), toggleRight: vi.fn(), openLeft: vi.fn(), openProject: vi.fn() }

function reset(selection: string[] = ['a']): void {
  useEditor.setState({
    project: project([band('a', [[0, 0], [100, 0]]), band('b', [[0, 10], [100, 10]], { widthMm: 9 })]),
    selection,
    editContext: [],
    tool: 'select',
    drawing: null,
    preview: null,
    gridMm: 5,
    currentMaterialId: MAT,
    message: null,
  })
  useEditor.temporal.getState().clear()
  useLayout.setState({ shortcutsOpen: false, uiActions: ui })
  vi.clearAllMocks()
}

/** Named keys' physical `code` (KeyboardEvent.code), for chords this table doesn't spell out letter-by-letter. */
const NAMED_CODES: Readonly<Record<string, string>> = {
  ArrowUp: 'ArrowUp',
  ArrowDown: 'ArrowDown',
  ArrowLeft: 'ArrowLeft',
  ArrowRight: 'ArrowRight',
  Escape: 'Escape',
  Enter: 'Enter',
  Backspace: 'Backspace',
  Delete: 'Delete',
  Space: 'Space',
  '?': 'Slash',
  '[': 'BracketLeft',
  ']': 'BracketRight',
  '\\': 'Backslash',
}

/** A chord's last part → its physical `code`: `KeyX` for letters, `DigitN` for digits, else a lookup. */
function deriveCode(rawKey: string): string {
  if (/^[a-zA-Z]$/.test(rawKey)) return `Key${rawKey.toUpperCase()}`
  if (/^[0-9]$/.test(rawKey)) return `Digit${rawKey}`
  return NAMED_CODES[rawKey] ?? rawKey
}

/**
 * Presses a platform-neutral chord as a real keydown on `target` (it
 * bubbles to window). Derives a full `KeyboardEventInit`, including `code`,
 * so a `\` chord matches Task 3's `e.code === 'Backslash'` dispatch rule
 * (shell spec §12.1) — with Shift held, `key` is `|`, as it is on a real US
 * keyboard, since `code` alone doesn't determine `key`.
 */
function press(chord: string, target: EventTarget = document.body): void {
  const parts = chord.split('+')
  const rawKey = parts[parts.length - 1]!
  const shiftKey = parts.includes('Shift') || rawKey === '?'
  const key = rawKey === '\\' ? (shiftKey ? '|' : '\\') : rawKey.length === 1 ? rawKey.toLowerCase() : rawKey
  target.dispatchEvent(
    new KeyboardEvent('keydown', {
      key,
      code: deriveCode(rawKey),
      ctrlKey: parts.includes('Mod'),
      shiftKey,
      altKey: parts.includes('Alt'),
      bubbles: true,
      cancelable: true,
    }),
  )
}

const s = () => useEditor.getState()
const bandAt = (id: string): Band => s().project.objects[id] as Band
const drawing = (): void => useEditor.setState({ tool: 'band', drawing: { tool: 'band', points: [{ x: 0, y: 40 }, { x: 50, y: 40 }], cursor: null } })

interface Case {
  setup?: () => void
  check: () => void
}

const CASES: Record<Exclude<ShortcutId, 'hand' | 'snapOff'>, Case> = {
  select: { setup: () => s().setTool('band'), check: () => expect(s().tool).toBe('select') },
  band: { check: () => expect(s().tool).toBe('band') },
  rect: { check: () => expect(s().tool).toBe('rect') },
  polygon: { check: () => expect(s().tool).toBe('polygon') },
  crossing: { check: () => expect(s().tool).toBe('crossing') },
  undo: {
    setup: () => s().run((p) => translateObjects(p, ['a'], 10, 0)),
    check: () => expect(bandAt('a').points[0]!.x).toBe(0),
  },
  redo: {
    setup: () => {
      s().run((p) => translateObjects(p, ['a'], 10, 0))
      s().undo()
    },
    check: () => expect(bandAt('a').points[0]!.x).toBe(10),
  },
  duplicate: {
    check: () => {
      expect(s().project.rootChildren).toHaveLength(3)
      expect(s().selection).not.toEqual(['a'])
    },
  },
  copy: {
    setup: () => s().select(['b']),
    check: () => {
      pasteClipboard()
      expect(s().project.rootChildren).toHaveLength(3)
      expect(bandAt(s().selection[0]!).widthMm).toBe(9) // a copy of b, not of any earlier clipboard
    },
  },
  paste: {
    setup: () => copySelection(),
    check: () => expect(s().project.rootChildren).toHaveLength(3),
  },
  delete: { check: () => expect(s().project.rootChildren).toEqual(['b']) },
  makeMotif: {
    check: () => {
      expect(Object.keys(s().project.motifs)).toHaveLength(1)
      expect(s().project.objects[s().selection[0]!]!.type).toBe('motif-instance')
    },
  },
  nudge: { check: () => expect(bandAt('a').points[0]!.y).toBe(-5) },
  selectNext: { check: () => expect(s().selection).toEqual(['b']) },
  selectPrevious: { setup: () => s().select(['b']), check: () => expect(s().selection).toEqual(['a']) },
  escape: { check: () => expect(s().selection).toEqual([]) },
  finish: {
    setup: drawing,
    check: () => {
      expect(s().project.rootChildren).toHaveLength(3)
      expect(s().drawing).toBeNull()
    },
  },
  undoPoint: {
    setup: drawing,
    check: () => {
      expect(s().drawing!.points).toHaveLength(1)
      expect(s().project.rootChildren).toHaveLength(2) // Backspace did not delete the selection
    },
  },
  cancelDrawing: {
    setup: drawing,
    check: () => {
      expect(s().drawing).toBeNull()
      expect(s().selection).toEqual(['a']) // Esc cancelled drawing only, not the selection
    },
  },
  shortcuts: { check: () => expect(useLayout.getState().shortcutsOpen).toBe(true) },
  toggleLeft: {
    check: () => {
      expect(ui.toggleLeft).toHaveBeenCalledOnce()
      expect(ui.toggleRight).not.toHaveBeenCalled()
    },
  },
  toggleRight: {
    check: () => {
      expect(ui.toggleRight).toHaveBeenCalledOnce()
      expect(ui.toggleLeft).not.toHaveBeenCalled()
    },
  },
  openProject: { check: () => expect(ui.openProject).toHaveBeenCalledOnce() },
  downloadProject: {
    check: () => {
      expect(downloadProject).toHaveBeenCalledExactlyOnceWith(s().project)
      expect(downloadExportSvg).not.toHaveBeenCalled()
    },
  },
  exportSvg: {
    check: () => {
      expect(downloadExportSvg).toHaveBeenCalledExactlyOnceWith(s().project)
      expect(downloadProject).not.toHaveBeenCalled()
    },
  },
}

describe('SHORTCUTS → keyboard.ts dispatch', () => {
  let uninstall: () => void = () => {}
  beforeAll(() => {
    uninstall = installKeyboardDispatcher()
  })
  afterAll(() => uninstall())
  beforeEach(() => reset())

  it('has a case for every dispatched entry', () => {
    const displayOnly: readonly string[] = DISPLAY_ONLY
    expect(Object.keys(CASES).sort()).toEqual(Object.keys(SHORTCUTS).filter((id) => !displayOnly.includes(id)).sort())
  })

  it.each(Object.entries(CASES))('%s: its first chord has its effect', (id, c) => {
    c.setup?.()
    press(table[id]!.keys[0]!)
    c.check()
  })

  it("hand's H selects the Hand tool (its Space alternative is Canvas-owned)", () => {
    press(table.hand!.keys[0]!)
    expect(s().tool).toBe('hand')
  })

  it('? typed in a text field does not open the sheet', () => {
    const input = document.createElement('input')
    document.body.append(input)
    press('?', input)
    input.remove()
    expect(useLayout.getState().shortcutsOpen).toBe(false)
  })
})

describe('formatChord', () => {
  it.each([
    ['Mod+Shift+E', 'other', ['Ctrl', 'Shift', 'E']],
    ['Mod+Shift+E', 'mac', ['⌘', '⇧', 'E']],
    ['Alt', 'mac', ['⌥']],
    ['Alt', 'other', ['Alt']],
    ['Mod+\\', 'other', ['Ctrl', '\\']],
    ['ArrowUp', 'other', ['↑']],
    ['ArrowDown', 'mac', ['↓']],
    ['ArrowLeft', 'other', ['←']],
    ['ArrowRight', 'other', ['→']],
    ['Escape', 'mac', ['Esc']],
    ['?', 'other', ['?']],
    ['B', 'mac', ['B']],
  ] as const)('%s on %s', (chord, platform, expected) => {
    expect(formatChord(chord, platform)).toEqual(expected)
  })
})

describe('detectPlatform', () => {
  it('reads userAgentData.platform first, then navigator.platform', () => {
    vi.stubGlobal('navigator', { platform: 'MacIntel' })
    expect(detectPlatform()).toBe('mac')
    vi.stubGlobal('navigator', { platform: 'iPad' })
    expect(detectPlatform()).toBe('mac')
    vi.stubGlobal('navigator', { platform: 'MacIntel', userAgentData: { platform: 'Windows' } })
    expect(detectPlatform()).toBe('other')
    vi.stubGlobal('navigator', { platform: 'Linux x86_64' })
    expect(detectPlatform()).toBe('other')
    vi.unstubAllGlobals()
  })
})
