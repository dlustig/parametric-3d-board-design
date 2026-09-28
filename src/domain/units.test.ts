// SPEC §8: units grammar, formatting, and field policies. Every case is from
// the Task 10 brief.

import { describe, expect, it } from 'vitest'
import { formatAngle, formatLength, parseAngle, parseLength } from './units.ts'

function mm(text: string, defaultUnit: 'in' | 'mm' = 'in'): number {
  const r = parseLength(text, defaultUnit)
  if (!r.ok) throw new Error(`expected "${text}" to parse, got error: ${r.error}`)
  return r.mm
}

function rejected(text: string, defaultUnit: 'in' | 'mm' = 'in'): void {
  const r = parseLength(text, defaultUnit)
  expect(r.ok, `expected "${text}" to be rejected`).toBe(false)
}

describe('parseLength: accepted forms (defaultUnit "in" unless noted)', () => {
  it('plain decimals', () => {
    expect(mm('0.25')).toBeCloseTo(6.35, 9)
    expect(mm('.5')).toBeCloseTo(12.7, 9)
    expect(mm('5.', 'mm')).toBeCloseTo(5, 9)
  })

  it('fractions', () => {
    expect(mm('1/4')).toBeCloseTo(6.35, 9)
    expect(mm('3/16')).toBeCloseTo(4.7625, 9)
  })

  it('a fraction with no separator is never split into whole + fraction (SPEC §8)', () => {
    expect(mm('13/16')).toBeCloseTo(20.6375, 9)
    expect(mm('11/8')).toBeCloseTo(34.925, 9)
    expect(mm('15/32')).toBeCloseTo(11.90625, 9)
    expect(mm('12/64')).toBeCloseTo(4.7625, 9)
    expect(mm('113/16') / 25.4).toBeCloseTo(7.0625, 9)
  })

  it('mixed whole + fraction, space or dash separated', () => {
    expect(mm('1 13/16')).toBeCloseTo(46.0375, 9)
    expect(mm('1-13/16')).toBeCloseTo(46.0375, 9)
    expect(mm('1 1/8')).toBeCloseTo(28.575, 9)
    expect(mm('1-1/8')).toBeCloseTo(28.575, 9)
  })

  it('leading sign applies to the whole value', () => {
    expect(mm('-1-1/8')).toBeCloseTo(-28.575, 9)
  })

  it('a unit suffix overrides defaultUnit', () => {
    expect(mm('1 1/2 mm', 'in')).toBeCloseTo(1.5, 9)
    expect(mm('25.4mm', 'in')).toBeCloseTo(25.4, 9)
    expect(mm('1.125in', 'mm')).toBeCloseTo(28.575, 9)
    expect(mm('1"', 'mm')).toBeCloseTo(25.4, 9)
  })

  it('smart-quote and prime inch marks', () => {
    expect(mm('1 1/8”', 'mm')).toBeCloseTo(28.575, 9) // ”
    expect(mm('1″', 'mm')).toBeCloseTo(25.4, 9) // ″
  })

  it('comma as decimal separator', () => {
    expect(mm('1,5', 'mm')).toBeCloseTo(1.5, 9)
  })
})

describe('parseLength: rejected forms', () => {
  it('empty text', () => rejected(''))
  it('space-and-dash between whole and fraction', () => rejected('1 - 1/8'))
  it('zero denominator', () => rejected('1/0'))
  it('feet', () => rejected('2ft'))
  it('exponents', () => rejected('1e3'))
  it('two units', () => rejected('1in mm'))
  it('garbage text', () => rejected('abc'))
})

describe('formatLength', () => {
  it('inches: within 0.0005" of k/64 → reduced mixed fraction', () => {
    expect(formatLength(28.575, 'in')).toBe('1 1/8')
    expect(formatLength(4.7625, 'in')).toBe('3/16')
    expect(formatLength(50.8, 'in')).toBe('2')
    expect(formatLength(25, 'in')).toBe('63/64')
  })

  it('inches: otherwise three decimals', () => {
    expect(formatLength(7.62, 'in')).toBe('0.300')
  })

  it('mm: up to two decimals, trailing zeros trimmed', () => {
    expect(formatLength(25.4, 'mm')).toBe('25.4')
    expect(formatLength(25, 'mm')).toBe('25')
    expect(formatLength(3.175, 'mm')).toBe('3.18')
  })

  it('never prints -0', () => {
    expect(formatLength(-0.001, 'in')).toBe('0')
    expect(formatLength(-0.001, 'mm')).toBe('0')
    expect(formatLength(0, 'mm')).toBe('0')
  })
})

describe('angles', () => {
  it('formatAngle: one decimal, trailing zero trimmed', () => {
    expect(formatAngle(30)).toBe('30')
    expect(formatAngle(22.5)).toBe('22.5')
  })

  it('parseAngle: plain decimal degrees', () => {
    expect(parseAngle('30')).toEqual({ ok: true, deg: 30 })
    expect(parseAngle('-22.5')).toEqual({ ok: true, deg: -22.5 })
    expect(parseAngle('7,5')).toEqual({ ok: true, deg: 7.5 })
    expect(parseAngle('abc').ok).toBe(false)
    expect(parseAngle('').ok).toBe(false)
    expect(parseAngle('1/4').ok).toBe(false)
  })
})
