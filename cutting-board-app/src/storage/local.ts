// SPEC §9: local autosave (debounced writes to `localStorage`), startup load
// with corruption recovery, and the pieces a multi-tab `storage` listener
// needs. DOM-free except for the `Storage` type itself — callers pass their
// own `Storage` instance (the browser's `localStorage` in the app; a fake in
// tests) and register `pagehide`, `visibilitychange`, and `storage`
// listeners themselves (App.tsx), so this module never touches `window` and
// stays testable with fake timers.

import type { Project } from '@/domain/model'
import { importProject } from '@/domain/migrate'
import type { SaveStatus } from '@/editor/store'

export const PROJECT_KEY = 'cbpd:project:v1'
export const RECOVERED_KEY = 'cbpd:recovered'

const AUTOSAVE_DEBOUNCE_MS = 500

/** `recovered.moved`: the text now lives under RECOVERED_KEY; when false (no room for the copy) it is still under PROJECT_KEY, and nothing may autosave over it. */
export type LoadResult = { kind: 'project'; project: Project } | { kind: 'recovered'; text: string; moved: boolean } | { kind: 'none' }

/** The browser's `Storage`, or `null` where merely reading it throws (a `SecurityError` when site data is blocked). */
export function openStorage(get: () => Storage): Storage | null {
  try {
    return get()
  } catch {
    return null
  }
}

/**
 * Reads `PROJECT_KEY` at startup. A document that fails to parse, migrate,
 * or validate is moved verbatim to `RECOVERED_KEY` — so autosave can never
 * silently overwrite or destroy it — and the main key is removed; the
 * caller starts blank and offers the recovered text for download (SPEC §9).
 * If the copy cannot be written (quota), the main key is left as it is.
 */
export function loadAtStartup(storage: Storage): LoadResult {
  const text = storage.getItem(PROJECT_KEY)
  if (text === null) return { kind: 'none' }

  const result = importProject(text)
  if (result.ok) return { kind: 'project', project: result.project }

  try {
    storage.setItem(RECOVERED_KEY, text)
  } catch {
    return { kind: 'recovered', text, moved: false }
  }
  storage.removeItem(PROJECT_KEY)
  return { kind: 'recovered', text, moved: true }
}

export interface Autosave {
  /** Debounces a write `AUTOSAVE_DEBOUNCE_MS` out; repeated calls coalesce into one write. A no-op while suspended. */
  schedule(): void
  /** Writes immediately, cancelling any pending debounced write. A no-op while suspended. */
  flush(): void
  /** Reports 'other-tab' and stops every future write (until the caller disposes and recreates this on reload). */
  suspend(): void
  /** Cancels a pending debounced write. Does not itself write or change status. */
  dispose(): void
}

/**
 * Debounced `localStorage` autosave (SPEC §9). The caller calls `schedule()`
 * after every commit/undo/redo, `flush()` on `pagehide` and
 * `visibilitychange: hidden`, and `suspend()` from its own `storage` event
 * listener when another tab writes `PROJECT_KEY`.
 */
export function createAutosave(storage: Storage, get: () => Project, onStatus: (status: SaveStatus) => void): Autosave {
  let timer: ReturnType<typeof setTimeout> | null = null
  let suspended = false

  function cancelTimer(): void {
    if (timer === null) return
    clearTimeout(timer)
    timer = null
  }

  function writeNow(): void {
    cancelTimer()
    try {
      storage.setItem(PROJECT_KEY, JSON.stringify(get()))
      onStatus('saved')
    } catch {
      onStatus('unsaved') // retried on the next schedule()/flush()
    }
  }

  return {
    schedule() {
      if (suspended) return
      cancelTimer()
      timer = setTimeout(writeNow, AUTOSAVE_DEBOUNCE_MS)
    },
    flush() {
      if (suspended) return
      writeNow()
    },
    suspend() {
      suspended = true
      cancelTimer()
      onStatus('other-tab')
    },
    dispose() {
      cancelTimer()
    },
  }
}
