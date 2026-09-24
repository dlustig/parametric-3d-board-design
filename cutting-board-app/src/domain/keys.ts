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

/** A canonical string key for a `BandRef`, used to order and dedupe crossings. */
export function refKey(ref: BandRef): string {
  return `${occurrenceKey(ref.path, ref.bandId)}@${ref.segmentStart}`
}
