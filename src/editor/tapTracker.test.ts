import { describe, expect, it } from 'vitest'
import { createTapTracker, isTap } from './tapTracker.ts'

const at = (pointerId: number, clientX: number, clientY: number): { pointerId: number; clientX: number; clientY: number; isPrimary: boolean } => ({
  pointerId,
  clientX,
  clientY,
  isPrimary: pointerId === 1,
})

describe('tapTracker', () => {
  it('a press that stays under TAP_SLOP_PX is a tap; one that ever moved further is not, even if it returns', () => {
    const t = createTapTracker()
    expect(t.down(at(1, 0, 0))).toBe(true)
    t.begin(at(1, 0, 0))
    t.move(at(1, 5, 0))
    expect(isTap(t.up(at(1, 5, 0))!)).toBe(true)

    t.down(at(1, 0, 0))
    t.begin(at(1, 0, 0))
    t.move(at(1, 6, 0))
    t.move(at(1, 0, 0))
    expect(isTap(t.up(at(1, 0, 0))!)).toBe(false)
  })

  it('a second pointer spoils the press; the press still ends on its own pointer, and other pointers end nothing', () => {
    const t = createTapTracker()
    t.down(at(1, 0, 0))
    t.begin(at(1, 0, 0))
    expect(t.down(at(2, 50, 0))).toBe(false)
    expect(t.pointers).toBe(2)
    expect(t.move(at(2, 60, 0))).toBeNull()
    expect(t.up(at(2, 60, 0))).toBeNull()
    const press = t.up(at(1, 0, 0))!
    expect(press.spoiled).toBe(true)
    expect(isTap(press)).toBe(false)
    expect(t.pointers).toBe(0)
  })

  it('a primary pointer forgets a pointer whose up was missed', () => {
    const t = createTapTracker()
    t.down(at(1, 0, 0))
    t.down(at(2, 0, 0)) // its up never arrives
    t.up(at(1, 0, 0))
    expect(t.down(at(1, 0, 0))).toBe(true)
  })

  it('cancel ends the press without a result; reset forgets pointers', () => {
    const t = createTapTracker()
    t.down(at(1, 0, 0))
    t.begin(at(1, 0, 0))
    t.cancel(at(1, 0, 0))
    expect(t.up(at(1, 0, 0))).toBeNull()
    t.down(at(3, 0, 0))
    t.reset()
    expect(t.down(at(4, 0, 0))).toBe(true)
  })

  it('double-tap: within DOUBLE_TAP_MS and DOUBLE_TAP_PX; the pair is consumed, so a third tap starts afresh', () => {
    const t = createTapTracker()
    expect(t.doubleTap({ x: 0, y: 0 }, 1000)).toBe(false)
    expect(t.doubleTap({ x: 10, y: 0 }, 1300)).toBe(true)
    expect(t.doubleTap({ x: 10, y: 0 }, 1400)).toBe(false)
    expect(t.doubleTap({ x: 21, y: 0 }, 1500)).toBe(false) // 11 px away
    expect(t.doubleTap({ x: 21, y: 0 }, 1801)).toBe(false) // 301 ms later
  })
})
