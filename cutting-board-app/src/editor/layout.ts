// Shell spec §11: the layout store — UI preferences that outlive a project
// and never enter undo history. Persisted with zustand `persist` under
// PREFS_KEY; every storage access is guarded, so a private window, a full
// quota, or JSON it cannot parse leaves prefs at their defaults for the
// session and never touches the editor store's saveStatus. Stored values
// are validated on the way in (`merge`): anything foreign falls back to the
// literal default, not to whatever the live store already held (Review
// Focus 1). `createJSONStorage` is not used here because its `JSON.parse`
// is unguarded and would otherwise throw hydration off the rails entirely
// on non-JSON text; `guardedStorage` below performs that parse itself.

import { create } from 'zustand'
import type { PersistStorage, StorageValue } from 'zustand/middleware'
import { persist } from 'zustand/middleware'

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
}

type Prefs = Pick<LayoutState, 'theme' | 'leftTab' | 'toolsDocked'>

const DEFAULTS: Prefs = { theme: 'dark', leftTab: 'layers', toolsDocked: true }

const guardedStorage: PersistStorage<Prefs> = {
  getItem: (name) => {
    let raw: string | null
    try {
      raw = localStorage.getItem(name)
    } catch {
      return null
    }
    if (raw === null) return null
    try {
      return JSON.parse(raw) as StorageValue<Prefs>
    } catch {
      return null
    }
  },
  setItem: (name, value) => {
    try {
      localStorage.setItem(name, JSON.stringify(value))
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
      ...DEFAULTS,
      setTheme: (theme) => set({ theme }),
      setLeftTab: (leftTab) => set({ leftTab }),
      setToolsDocked: (toolsDocked) => set({ toolsDocked }),
    }),
    {
      name: PREFS_KEY,
      version: 1,
      storage: guardedStorage,
      partialize: (s) => ({ theme: s.theme, leftTab: s.leftTab, toolsDocked: s.toolsDocked }),
      merge: (persisted, current) => {
        const read = (key: string): unknown => (typeof persisted === 'object' && persisted !== null ? Reflect.get(persisted, key) : undefined)
        const docked = read('toolsDocked')
        return {
          ...current,
          theme: oneOf(THEMES, read('theme'), DEFAULTS.theme),
          leftTab: oneOf(TABS, read('leftTab'), DEFAULTS.leftTab),
          toolsDocked: typeof docked === 'boolean' ? docked : DEFAULTS.toolsDocked,
        }
      },
    },
  ),
)
