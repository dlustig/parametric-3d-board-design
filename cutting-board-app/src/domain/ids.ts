import type { Id } from './model.ts'

/** Generates a fresh object id (SPEC §2: `crypto.randomUUID()`). */
export function newId(): Id {
  return crypto.randomUUID()
}
