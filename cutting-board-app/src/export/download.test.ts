// The project/SVG download filename rule, moved here from ProjectMenu (shell Task 3).

import { describe, expect, it } from 'vitest'
import { sanitizeFilenamePart } from './download.ts'

describe('sanitizeFilenamePart', () => {
  it('replaces every character outside [A-Za-z0-9 _-] with _', () => {
    expect(sanitizeFilenamePart('My/Project: "Board" #1?')).toBe('My_Project_ _Board_ _1_')
  })

  it('falls back to "project" for an empty name', () => {
    expect(sanitizeFilenamePart('')).toBe('project')
  })
})
