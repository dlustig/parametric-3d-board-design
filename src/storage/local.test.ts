// SPEC §9: startup load (valid / corrupt / missing) and the debounced
// autosave (write, failure/retry, suspend on another tab's write), against a
// fake `Storage` and fake timers so no DOM is needed.

import { describe, expect, it, vi } from 'vitest'
import type { SaveStatus } from '@/editor/store'
import { newProject } from '@/domain/project'
import { createAutosave, loadAtStartup, openStorage, PROJECT_KEY, RECOVERED_KEY } from './local.ts'

interface FakeStorage extends Storage {
  setThrowing(throwing: boolean): void
}

function createFakeStorage(initial: Record<string, string> = {}): FakeStorage {
  const map = new Map(Object.entries(initial))
  let throwing = false
  const storage: FakeStorage = {
    get length() {
      return map.size
    },
    clear() {
      map.clear()
    },
    getItem(key) {
      return map.get(key) ?? null
    },
    key(index) {
      return Array.from(map.keys())[index] ?? null
    },
    removeItem(key) {
      map.delete(key)
    },
    setItem(key, value) {
      if (throwing) throw new Error('quota exceeded')
      map.set(key, value)
    },
    setThrowing(v) {
      throwing = v
    },
  }
  return storage
}

describe('loadAtStartup', () => {
  it('returns none when the key is missing', () => {
    const storage = createFakeStorage()
    expect(loadAtStartup(storage)).toEqual({ kind: 'none' })
  })

  it('returns the project when the key holds a valid document', () => {
    const project = newProject('mm')
    const storage = createFakeStorage({ [PROJECT_KEY]: JSON.stringify(project) })

    expect(loadAtStartup(storage)).toEqual({ kind: 'project', project })
  })

  it('moves an invalid document to RECOVERED_KEY and removes the main key', () => {
    const storage = createFakeStorage({ [PROJECT_KEY]: '{not json' })

    const result = loadAtStartup(storage)

    expect(result).toEqual({ kind: 'recovered', text: '{not json', moved: true })
    expect(storage.getItem(RECOVERED_KEY)).toBe('{not json')
    expect(storage.getItem(PROJECT_KEY)).toBeNull()
  })

  it('moves a well-formed but schema-invalid document (e.g. a newer schemaVersion) to RECOVERED_KEY too', () => {
    const text = JSON.stringify({ schemaVersion: 2 })
    const storage = createFakeStorage({ [PROJECT_KEY]: text })

    const result = loadAtStartup(storage)

    expect(result).toEqual({ kind: 'recovered', text, moved: true })
    expect(storage.getItem(RECOVERED_KEY)).toBe(text)
    expect(storage.getItem(PROJECT_KEY)).toBeNull()
  })
})

describe('storage failures at startup', () => {
  it('openStorage returns null when reading localStorage throws (site data blocked)', () => {
    const storage = createFakeStorage()
    expect(openStorage(() => storage)).toBe(storage)
    expect(
      openStorage(() => {
        throw new DOMException('The operation is insecure.', 'SecurityError')
      }),
    ).toBeNull()
  })

  it('leaves the corrupt main key in place when the recovered copy does not fit', () => {
    const storage = createFakeStorage({ [PROJECT_KEY]: '{not json' })
    storage.setThrowing(true)

    expect(loadAtStartup(storage)).toEqual({ kind: 'recovered', text: '{not json', moved: false })
    expect(storage.getItem(PROJECT_KEY)).toBe('{not json')
    expect(storage.getItem(RECOVERED_KEY)).toBeNull()
  })
})

describe('createAutosave', () => {
  it('debounces rapid schedule() calls into a single write, 500ms after the last one', () => {
    vi.useFakeTimers()
    const storage = createFakeStorage()
    const project = newProject('mm')
    const statuses: SaveStatus[] = []
    const autosave = createAutosave(storage, () => project, (s) => statuses.push(s))

    autosave.schedule()
    vi.advanceTimersByTime(300)
    autosave.schedule() // resets the debounce window
    vi.advanceTimersByTime(300)
    autosave.schedule()
    vi.advanceTimersByTime(499)
    expect(storage.getItem(PROJECT_KEY)).toBeNull()

    vi.advanceTimersByTime(1)
    expect(storage.getItem(PROJECT_KEY)).toBe(JSON.stringify(project))
    expect(statuses).toEqual(['saved'])

    vi.useRealTimers()
  })

  it('reports unsaved when setItem throws, then saved on a later successful write', () => {
    vi.useFakeTimers()
    const storage = createFakeStorage()
    storage.setThrowing(true)
    let project = newProject('mm')
    const statuses: SaveStatus[] = []
    const autosave = createAutosave(storage, () => project, (s) => statuses.push(s))

    autosave.schedule()
    vi.advanceTimersByTime(500)
    expect(statuses).toEqual(['unsaved'])
    expect(storage.getItem(PROJECT_KEY)).toBeNull()

    storage.setThrowing(false)
    project = { ...project, name: 'Renamed' }
    autosave.schedule() // retry on the next schedule(), per SPEC §9
    vi.advanceTimersByTime(500)

    expect(statuses).toEqual(['unsaved', 'saved'])
    expect(storage.getItem(PROJECT_KEY)).toBe(JSON.stringify(project))

    vi.useRealTimers()
  })

  it('suspend() reports other-tab immediately and stops all further writes', () => {
    vi.useFakeTimers()
    const storage = createFakeStorage()
    const project = newProject('mm')
    const statuses: SaveStatus[] = []
    const autosave = createAutosave(storage, () => project, (s) => statuses.push(s))

    autosave.schedule() // a write is pending when the other tab's write arrives
    autosave.suspend()
    expect(statuses).toEqual(['other-tab'])

    vi.advanceTimersByTime(1000) // the pending debounced write must not fire
    expect(storage.getItem(PROJECT_KEY)).toBeNull()

    autosave.schedule()
    vi.advanceTimersByTime(1000)
    autosave.flush()
    expect(storage.getItem(PROJECT_KEY)).toBeNull()
    expect(statuses).toEqual(['other-tab'])

    vi.useRealTimers()
  })

  it('flush() writes immediately and cancels a pending debounced write', () => {
    vi.useFakeTimers()
    const storage = createFakeStorage()
    const project = newProject('mm')
    const statuses: SaveStatus[] = []
    const autosave = createAutosave(storage, () => project, (s) => statuses.push(s))

    autosave.schedule()
    autosave.flush()
    expect(storage.getItem(PROJECT_KEY)).toBe(JSON.stringify(project))
    expect(statuses).toEqual(['saved'])

    vi.advanceTimersByTime(1000) // the debounced write must not fire a second time
    expect(statuses).toEqual(['saved'])

    vi.useRealTimers()
  })

  it('dispose() cancels a pending debounced write without writing', () => {
    vi.useFakeTimers()
    const storage = createFakeStorage()
    const project = newProject('mm')
    const statuses: SaveStatus[] = []
    const autosave = createAutosave(storage, () => project, (s) => statuses.push(s))

    autosave.schedule()
    autosave.dispose()
    vi.advanceTimersByTime(1000)

    expect(storage.getItem(PROJECT_KEY)).toBeNull()
    expect(statuses).toEqual([])

    vi.useRealTimers()
  })
})
