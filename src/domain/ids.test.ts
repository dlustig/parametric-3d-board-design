import { expect, it } from 'vitest'
import { newId } from './ids.ts'

it('generates distinct ids that satisfy the id pattern', () => {
  const first = newId()
  const second = newId()
  expect(first).not.toBe(second)
  expect(first).toMatch(/^[A-Za-z0-9_-]{1,64}$/)
  expect(second).toMatch(/^[A-Za-z0-9_-]{1,64}$/)
})
