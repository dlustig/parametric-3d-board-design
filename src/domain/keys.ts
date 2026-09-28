// SPEC §5.1: canonical string keys for occurrences and band references.
// Ids cannot contain `:/#@|` (validated), so these are unambiguous encodings
// of a path through the document.

import type { BandRef, Id, Step } from './model.ts'

export function stepKey(step: Step): string {
  return 'instanceId' in step ? `i:${step.instanceId}` : `r:${step.repeatId}:${step.row}:${step.column}`
}

export function occurrenceKey(path: Step[], sourceId: Id): string {
  return `${path.map(stepKey).join('/')}#${sourceId}`
}

/** Whether the step keys `keys` begin with the step keys `prefixKeys`. */
export function hasKeyPrefix(keys: string[], prefixKeys: string[]): boolean {
  return keys.length >= prefixKeys.length && prefixKeys.every((k, n) => keys[n] === k)
}

/** A canonical string key for a `BandRef`, used to order and dedupe crossings. */
export function refKey(ref: BandRef): string {
  return `${occurrenceKey(ref.path, ref.bandId)}@${ref.segmentStart}`
}

/** The instance or repeat a step passes through. */
export function stepObjectId(step: Step): Id {
  return 'instanceId' in step ? step.instanceId : step.repeatId
}
