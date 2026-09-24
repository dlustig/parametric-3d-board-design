import { describe, expect, it } from 'vitest'
import { newId } from './ids.ts'
import { importProject } from './migrate.ts'
import { newProject } from './project.ts'

describe('importProject', () => {
  it('passes schemaVersion 1 through unchanged', () => {
    const project = newProject('mm')
    const result = importProject(JSON.stringify(project))
    expect(result).toEqual({ ok: true, project })
  })

  // Regression: `id in record` / `record[id] !== undefined` resolve inherited
  // `Object.prototype` members for a matching id, so a reference to e.g.
  // "toString" or "constructor" would silently "resolve" even though
  // `p.objects`/`p.motifs` have no such *own* key. `Object.hasOwn` fixed
  // this in checkOwnership/checkReferences/childrenOf.
  it('rejects a rootChildren entry that only matches an inherited key', () => {
    const raw = { ...newProject('mm'), rootChildren: ['toString'] }
    const result = importProject(JSON.stringify(raw))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.path).toBe('rootChildren')
    }
  })

  it('rejects a motifId that only matches an inherited key', () => {
    const project = newProject('mm')
    const instance = {
      type: 'motif-instance',
      id: newId(),
      motifId: 'constructor',
      transform: { x: 0, y: 0, rotationDeg: 0, mirrorX: false, mirrorY: false, scale: 1 },
    }
    const raw = {
      ...project,
      objects: { [instance.id]: instance },
      rootChildren: [instance.id],
    }
    const result = importProject(JSON.stringify(raw))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.path).toBe(`objects.${instance.id}.motifId`)
    }
  })

  it('rejects a newer schemaVersion, naming it in the message', () => {
    const result = importProject(JSON.stringify({ schemaVersion: 2 }))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.message).toContain('2')
    }
  })

  it('rejects text that is not valid JSON', () => {
    const result = importProject('not json{')
    expect(result.ok).toBe(false)
  })

  it('rejects a JSON array', () => {
    const result = importProject('[]')
    expect(result.ok).toBe(false)
  })
})
