// Shell spec §3, §11: theme resolution and the persisted layout store,
// including Review Focus 1 (corrupt/foreign prefs) and 2 (throwing storage).
// `localStorage` is stubbed per test; the store's storage reads it lazily.
//
// The corrupt/foreign/throwing cases model a real boot: `localStorage` is
// seeded before the module is (re-)imported, since that's the only time
// `persist` hydrates in this app (`persist.rehydrate()` is never called by
// the running app — hydration happens once, synchronously, as the module's
// top-level `create(...)` runs). `vi.resetModules()` plus a dynamic
// `import('./layout.ts')` gets a fresh store instance for each of those
// cases so the "current state" merge falls back to is genuinely the
// module's own defaults, not something a previous test left behind.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LayoutState } from './layout.ts'
import { nextTheme, PREFS_KEY, resolveTheme, useLayout } from './layout.ts'

class MemoryStorage {
  readonly data = new Map<string, string>()
  getItem(k: string): string | null {
    return this.data.get(k) ?? null
  }
  setItem(k: string, v: string): void {
    this.data.set(k, v)
  }
  removeItem(k: string): void {
    this.data.delete(k)
  }
}

const throwingStorage = {
  getItem(): never {
    throw new DOMException('denied', 'SecurityError')
  },
  setItem(): never {
    throw new DOMException('full', 'QuotaExceededError')
  },
  removeItem(): never {
    throw new DOMException('denied', 'SecurityError')
  },
}

function prefs(s: LayoutState): { theme: string; leftTab: string; toolsDocked: boolean } {
  return { theme: s.theme, leftTab: s.leftTab, toolsDocked: s.toolsDocked }
}

function withStored(raw: string): MemoryStorage {
  const s = new MemoryStorage()
  s.setItem(PREFS_KEY, raw)
  vi.stubGlobal('localStorage', s)
  return s
}

/** A fresh module instance, so hydration runs from scratch against whatever `localStorage` is stubbed to right now — the same as a real page load. */
async function freshLayoutModule(): Promise<typeof import('./layout.ts')> {
  vi.resetModules()
  return import('./layout.ts')
}

beforeEach(() => {
  vi.unstubAllGlobals()
  useLayout.setState({ theme: 'dark', leftTab: 'layers', toolsDocked: true })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('resolveTheme', () => {
  it.each([
    ['dark', true, 'dark'],
    ['dark', false, 'dark'],
    ['light', true, 'light'],
    ['light', false, 'light'],
    ['system', true, 'dark'],
    ['system', false, 'light'],
  ] as const)('%s with prefersDark=%s is %s', (pref, prefersDark, expected) => {
    expect(resolveTheme(pref, prefersDark)).toBe(expected)
  })
})

describe('nextTheme', () => {
  it('cycles dark → light → system → dark', () => {
    expect(nextTheme('dark')).toBe('light')
    expect(nextTheme('light')).toBe('system')
    expect(nextTheme('system')).toBe('dark')
  })
})

describe('useLayout persistence', () => {
  it('writes exactly theme, leftTab and toolsDocked under PREFS_KEY at version 1', () => {
    const s = new MemoryStorage()
    vi.stubGlobal('localStorage', s)
    useLayout.getState().setLeftTab('wood')
    expect(JSON.parse(s.getItem(PREFS_KEY)!)).toEqual({ state: { theme: 'dark', leftTab: 'wood', toolsDocked: true }, version: 1 })
  })

  it('restores stored prefs', async () => {
    withStored(JSON.stringify({ state: { theme: 'light', leftTab: 'motifs', toolsDocked: false }, version: 1 }))
    await useLayout.persist.rehydrate()
    expect(prefs(useLayout.getState())).toEqual({ theme: 'light', leftTab: 'motifs', toolsDocked: false })
  })

  it.each([
    ['foreign values', JSON.stringify({ state: { theme: 'blue', leftTab: 'nope', toolsDocked: 'yes' }, version: 1 })],
    ['non-JSON text', 'not json{'],
    ['another version', JSON.stringify({ state: { theme: 'light' }, version: 7 })],
    ['a non-object', '42'],
  ])('boots to the defaults for %s, without throwing', async (_name, raw) => {
    vi.spyOn(console, 'error').mockImplementation(() => {}) // zustand reports the unmigratable version
    withStored(raw)
    const modulePromise = freshLayoutModule()
    await expect(modulePromise).resolves.toBeTruthy() // the bad value never throws out of module load
    const fresh = await modulePromise
    expect(prefs(fresh.useLayout.getState())).toEqual(prefs(fresh.useLayout.getInitialState()))
  })

  it('boots to the defaults when storage throws, and setters still apply for the session', async () => {
    vi.stubGlobal('localStorage', throwingStorage)
    const modulePromise = freshLayoutModule()
    await expect(modulePromise).resolves.toBeTruthy()
    const fresh = await modulePromise
    expect(prefs(fresh.useLayout.getState())).toEqual(prefs(fresh.useLayout.getInitialState()))
    expect(() => fresh.useLayout.getState().setTheme('light')).not.toThrow()
    expect(fresh.useLayout.getState().theme).toBe('light')
  })
})
