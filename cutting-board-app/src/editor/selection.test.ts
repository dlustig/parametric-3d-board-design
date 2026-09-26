// SPEC §6.4 (shell): splitting a world path into per-level edit-context levels.

import { describe, expect, it } from 'vitest'
import type { Step } from '@/domain/model'
import { band, instance, project, repeat } from '@/domain/test-builders'
import { contextLevelsForPath, contextPrefix, pruneEditContext } from './selection.ts'

const p = project(
  [instance('iO', 'O'), repeat('rp', 'M')],
  [
    { id: 'M', children: [band('A', [[0, 0], [10, 0]])] },
    { id: 'O', children: [instance('iM', 'M'), repeat('rin', 'M', { rows: 2, columns: 2 })] },
  ],
)

describe('contextLevelsForPath', () => {
  it('is empty for the root path', () => {
    expect(contextLevelsForPath(p, [])).toEqual([])
  })

  it('a root-level instance or repeat cell is one level entering its motif', () => {
    expect(contextLevelsForPath(p, [{ instanceId: 'iO' }])).toEqual([{ motifId: 'O', path: [{ instanceId: 'iO' }] }])
    expect(contextLevelsForPath(p, [{ repeatId: 'rp', row: 2, column: 1 }])).toEqual([{ motifId: 'M', path: [{ repeatId: 'rp', row: 2, column: 1 }] }])
  })

  it('a nested instance is one level per step, each relative to the previous context', () => {
    expect(contextLevelsForPath(p, [{ instanceId: 'iO' }, { instanceId: 'iM' }])).toEqual([
      { motifId: 'O', path: [{ instanceId: 'iO' }] },
      { motifId: 'M', path: [{ instanceId: 'iM' }] },
    ])
  })

  it('a repeat cell inside an instance keeps its row and column', () => {
    expect(contextLevelsForPath(p, [{ instanceId: 'iO' }, { repeatId: 'rin', row: 1, column: 0 }])).toEqual([
      { motifId: 'O', path: [{ instanceId: 'iO' }] },
      { motifId: 'M', path: [{ repeatId: 'rin', row: 1, column: 0 }] },
    ])
  })

  it('round-trips through contextPrefix, and every level resolves', () => {
    const path: Step[] = [{ instanceId: 'iO' }, { repeatId: 'rin', row: 1, column: 1 }]
    const levels = contextLevelsForPath(p, path)
    expect(contextPrefix(levels)).toEqual(path)
    expect(pruneEditContext(p, levels)).toBe(levels)
  })
})
