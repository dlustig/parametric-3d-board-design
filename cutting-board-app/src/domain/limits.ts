// Numeric limits shared by domain validation. Task 3 re-exports these from
// `src/geometry/tolerance.ts`; this is the single source of truth until then.

/** SPEC §2.1 invariant 3: minimum distance between consecutive points, in mm. */
export const MIN_SEGMENT_MM = 0.01

/** SPEC §2.1 invariant 5: maximum total expanded occurrence count. */
export const MAX_OCCURRENCES = 5000
