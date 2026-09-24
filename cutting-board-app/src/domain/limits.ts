// Numeric limits shared by domain validation. `src/geometry/tolerance.ts`
// re-exports both constants so geometry code imports one module; this file
// stays their single source of truth (SPEC §4.6 lists them, but they are
// domain invariants validation depends on independent of geometry).

/** SPEC §2.1 invariant 3: minimum distance between consecutive points, in mm. */
export const MIN_SEGMENT_MM = 0.01

/** SPEC §2.1 invariant 5: maximum total expanded occurrence count. */
export const MAX_OCCURRENCES = 5000
