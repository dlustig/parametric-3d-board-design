import { describe, expect, it } from 'vitest'
import { importProject } from './migrate.ts'
import { newProject } from './project.ts'

describe('importProject', () => {
  it('passes schemaVersion 1 through unchanged', () => {
    const project = newProject('mm')
    const result = importProject(JSON.stringify(project))
    expect(result).toEqual({ ok: true, project })
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
