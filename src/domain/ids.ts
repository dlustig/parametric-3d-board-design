import type { Id } from './model.ts'

/**
 * Generates a fresh id: 128 random bits as 32 hex chars. Uses
 * `crypto.getRandomValues`, not `crypto.randomUUID`, because the latter is
 * missing in insecure contexts (plain HTTP over a LAN, e.g. a tablet on `vite --host`).
 */
export function newId(): Id {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join('')
}
