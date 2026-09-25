// Shell spec §3, §11: theme resolution and the persisted layout store,
// including Review Focus 1 (corrupt/foreign prefs) and 2 (throwing storage).
// `localStorage` is stubbed per test; the store's storage reads it lazily.
//
// The fallback tests seed the store to NON-default values before rehydrating
// with corrupt/foreign or throwing storage, then assert the result is the
// literal defaults (`useLayout.getInitialState()`'s values) — not just
// "whatever the store already held" — so a merge that quietly keeps the
// seeded state would fail these tests.

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

const DEFAULTS = { theme: 'dark', leftTab: 'layers', toolsDocked: true }

// Differs from DEFAULTS in every field, so a merge that falls back to
// "whatever is currently in the store" instead of the literal defaults
// produces a result that visibly fails the `toEqual(DEFAULTS)` assertions.
const SEEDED = { theme: 'light', leftTab: 'motifs', toolsDocked: false } as const

function prefs(s: LayoutState): { theme: string; leftTab: string; toolsDocked: boolean } {
  return { theme: s.theme, leftTab: s.leftTab, toolsDocked: s.toolsDocked }
}

function withStored(raw: string): MemoryStorage {
  const s = new MemoryStorage()
  s.setItem(PREFS_KEY, raw)
  vi.stubGlobal('localStorage', s)
  return s
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
  ])('falls back to the defaults for %s', async (_name, raw) => {
    vi.spyOn(console, 'error').mockImplementation(() => {}) // zustand reports the unmigratable version
    useLayout.setState(SEEDED) // prove rehydrate produced the defaults, not the pre-rehydrate state
    withStored(raw)
    await useLayout.persist.rehydrate()
    expect(prefs(useLayout.getState())).toEqual(DEFAULTS)
    expect(prefs(useLayout.getState())).toEqual(prefs(useLayout.getInitialState()))
  })

  it('keeps working when storage throws: hydration falls back, setters apply for the session', async () => {
    useLayout.setState(SEEDED) // as above: prove the throw produced the defaults, not the seeded state
    vi.stubGlobal('localStorage', throwingStorage)
    await useLayout.persist.rehydrate()
    expect(prefs(useLayout.getState())).toEqual(DEFAULTS)
    expect(() => useLayout.getState().setTheme('light')).not.toThrow()
    expect(useLayout.getState().theme).toBe('light')
  })
})
