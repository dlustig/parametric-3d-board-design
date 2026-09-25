// Shell spec §11: the layout store — UI preferences that outlive a project
// and never enter undo history. Persisted with zustand `persist` under
// PREFS_KEY; every storage access is guarded, so a private window or a full
// quota leaves prefs working for the session and never touches the editor
// store's saveStatus. Stored values are validated on the way in (`merge`):
// anything foreign falls back to the default (Review Focus 1). Hydration
// runs synchronously at module load (`guardedStorage`'s calls are plain,
// synchronous `localStorage` calls, and zustand's persist middleware
// resolves a synchronous storage's hydration inline before `create()`
// returns) — so `current` in `merge` is still `configResult`, the literal
// defaults, on every real boot; corrupt/foreign/throwing storage never
// reaches a later, already-changed state.

import { create } from 'zustand'
import type { StateStorage } from 'zustand/middleware'
import { createJSONStorage, persist } from 'zustand/middleware'

export type ThemePref = 'dark' | 'light' | 'system'
export type LeftTab = 'layers' | 'motifs' | 'wood'

export const PREFS_KEY = 'cbpd:prefs'

const THEMES: readonly ThemePref[] = ['dark', 'light', 'system']
const TABS: readonly LeftTab[] = ['layers', 'motifs', 'wood']

export function resolveTheme(pref: ThemePref, prefersDark: boolean): 'dark' | 'light' {
  if (pref === 'system') return prefersDark ? 'dark' : 'light'
  return pref
}

/** The theme button's cycle (§3): dark → light → system → dark. */
export function nextTheme(pref: ThemePref): ThemePref {
  return pref === 'dark' ? 'light' : pref === 'light' ? 'system' : 'dark'
}

export interface LayoutState {
  theme: ThemePref
  leftTab: LeftTab
  toolsDocked: boolean
  setTheme(t: ThemePref): void
  setLeftTab(t: LeftTab): void
  setToolsDocked(d: boolean): void
  shortcutsOpen: boolean // not persisted
  setShortcutsOpen(o: boolean): void
}

const guardedStorage: StateStorage = {
  getItem: (name) => {
    try {
      return localStorage.getItem(name)
    } catch {
      return null
    }
  },
  setItem: (name, value) => {
    try {
      localStorage.setItem(name, value)
    } catch {
      // Best-effort: the preference still applies for this session.
    }
  },
  removeItem: (name) => {
    try {
      localStorage.removeItem(name)
    } catch {
      // As setItem.
    }
  },
}

function oneOf<T extends string>(options: readonly T[], value: unknown, fallback: T): T {
  return options.find((o) => o === value) ?? fallback
}

export const useLayout = create<LayoutState>()(
  persist(
    (set) => ({
      theme: 'dark',
      leftTab: 'layers',
      toolsDocked: true,
      setTheme: (theme) => set({ theme }),
      setLeftTab: (leftTab) => set({ leftTab }),
      setToolsDocked: (toolsDocked) => set({ toolsDocked }),
      shortcutsOpen: false,
      setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
    }),
    {
      name: PREFS_KEY,
      version: 1,
      storage: createJSONStorage(() => guardedStorage),
      partialize: (s) => ({ theme: s.theme, leftTab: s.leftTab, toolsDocked: s.toolsDocked }),
      merge: (persisted, current) => {
        const read = (key: string): unknown => (typeof persisted === 'object' && persisted !== null ? Reflect.get(persisted, key) : undefined)
        const docked = read('toolsDocked')
        return {
          ...current,
          theme: oneOf(THEMES, read('theme'), current.theme),
          leftTab: oneOf(TABS, read('leftTab'), current.leftTab),
          toolsDocked: typeof docked === 'boolean' ? docked : current.toolsDocked,
        }
      },
    },
  ),
)
