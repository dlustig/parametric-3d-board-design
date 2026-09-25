// Shell spec §12.1: the shortcut table, display data only. It feeds Hint
// tooltips and the shortcuts sheet; keyboard.ts keeps its V1 dispatch
// logic, and shortcuts.test.ts checks that every entry it dispatches has
// the entry's effect. Chords are platform-neutral ('Mod' is Ctrl or ⌘),
// joined with '+'; `keys` lists alternatives.

export type ShortcutGroup = 'Tools' | 'Selection' | 'Drawing' | 'View' | 'Project' | 'Panels'

export interface Shortcut {
  readonly label: string
  readonly keys: readonly string[]
  readonly hint?: string
  readonly group: ShortcutGroup
}

export const SHORTCUTS = {
  select: { label: 'Select', keys: ['V'], hint: 'Tap to select. Drag empty space to box-select.', group: 'Tools' },
  hand: { label: 'Hand', keys: ['H', 'Space'], hint: 'Drag to pan. Or hold Space.', group: 'Tools' },
  band: { label: 'Band', keys: ['B'], hint: 'Draw a strip of wood. Tap to place points.', group: 'Tools' },
  rect: { label: 'Rectangle', keys: ['R'], hint: 'Drag corner to corner.', group: 'Tools' },
  polygon: { label: 'Polygon', keys: ['P'], hint: 'Tap to place corners. Tap the first to close.', group: 'Tools' },
  crossing: { label: 'Crossing', keys: ['X'], hint: 'Choose which band is on top where two cross.', group: 'Tools' },
  duplicate: { label: 'Duplicate', keys: ['Mod+D'], group: 'Selection' },
  copy: { label: 'Copy', keys: ['Mod+C'], group: 'Selection' },
  paste: { label: 'Paste', keys: ['Mod+V'], group: 'Selection' },
  delete: { label: 'Delete', keys: ['Delete', 'Backspace'], group: 'Selection' },
  makeMotif: { label: 'Make motif', keys: ['Mod+G'], group: 'Selection' },
  nudge: { label: 'Nudge', keys: ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'], hint: 'One grid step. Hold Shift for ×10.', group: 'Selection' },
  selectNext: { label: 'Select next object', keys: [']'], group: 'Selection' },
  selectPrevious: { label: 'Select previous object', keys: ['['], group: 'Selection' },
  escape: { label: 'Deselect, or leave the motif', keys: ['Escape'], hint: 'Also cancels a drag in progress.', group: 'Selection' },
  finish: { label: 'Finish', keys: ['Enter'], group: 'Drawing' },
  undoPoint: { label: 'Undo point', keys: ['Backspace', 'Mod+Z'], group: 'Drawing' },
  cancelDrawing: { label: 'Cancel', keys: ['Escape'], group: 'Drawing' },
  snapOff: { label: 'Snap off while held', keys: ['Alt'], group: 'Drawing' },
  undo: { label: 'Undo', keys: ['Mod+Z'], group: 'Project' },
  redo: { label: 'Redo', keys: ['Mod+Shift+Z', 'Mod+Y'], group: 'Project' },
  shortcuts: { label: 'Keyboard shortcuts', keys: ['?'], group: 'Project' },
} as const satisfies Record<string, Shortcut>

export type ShortcutId = keyof typeof SHORTCUTS

/**
 * Entries whose effect keyboard.ts does not dispatch: Space (hand's
 * alternative) is owned by Canvas.tsx, Alt by snapping (V1 §7.2, §7.7).
 * Hand's own H key is dispatched and tested separately.
 */
export const DISPLAY_ONLY: readonly ShortcutId[] = ['hand', 'snapOff']

export type Platform = 'mac' | 'other'

export function detectPlatform(): Platform {
  const nav: Navigator & { userAgentData?: { platform: string } } = navigator
  return /mac|iphone|ipad/i.test(nav.userAgentData?.platform ?? nav.platform) ? 'mac' : 'other'
}

const MODIFIERS: Record<Platform, Readonly<Record<string, string>>> = {
  mac: { Mod: '⌘', Alt: '⌥', Shift: '⇧' },
  other: { Mod: 'Ctrl', Alt: 'Alt', Shift: 'Shift' },
}

const KEY_NAMES: Readonly<Record<string, string>> = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Escape: 'Esc' }

/** 'Mod+Shift+E' → ['Ctrl', 'Shift', 'E'] or ['⌘', '⇧', 'E']; 'ArrowUp' → ['↑']; 'Escape' → ['Esc']. */
export function formatChord(chord: string, platform: Platform): string[] {
  return chord.split('+').map((part) => MODIFIERS[platform][part] ?? KEY_NAMES[part] ?? part)
}
