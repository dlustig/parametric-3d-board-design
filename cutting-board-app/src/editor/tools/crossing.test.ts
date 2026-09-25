import { describe, expect, it } from 'vitest'
import { pickNearest } from './crossing.ts'

describe('pickNearest', () => {
  const centres = [
    { x: 0, y: 0 },
    { x: 20, y: 0 },
  ]

  it('picks the nearest centre within the radius', () => {
    expect(pickNearest(centres, { x: 12, y: 0 }, 12)).toBe(1)
    expect(pickNearest(centres, { x: 9, y: 0 }, 12)).toBe(0)
  })

  it('includes the radius boundary and nothing beyond it', () => {
    expect(pickNearest(centres, { x: 0, y: 12 }, 12)).toBe(0)
    expect(pickNearest(centres, { x: 0, y: 12.01 }, 12)).toBeNull()
    expect(pickNearest(centres, { x: 0, y: 20 }, 22)).toBe(0)
  })

  it('keeps the earlier centre on a tie (listed crossings precede unresolved rings)', () => {
    expect(pickNearest([{ x: 5, y: 0 }, { x: 5, y: 0 }], { x: 0, y: 0 }, 12)).toBe(0)
  })

  it('returns null with no centres', () => {
    expect(pickNearest([], { x: 0, y: 0 }, 22)).toBeNull()
  })
})
