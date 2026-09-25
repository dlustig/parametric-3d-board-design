// SPEC §4.6 tolerances and constants. `MIN_SEGMENT_MM` and `MAX_OCCURRENCES`
// are domain invariants owned by `src/domain/limits.ts`; re-exported here so
// geometry code imports one module for every SPEC §4.6 constant.

export { MAX_OCCURRENCES, MIN_SEGMENT_MM } from '../domain/limits.ts'

/** Point equality and parameter-interior test tolerance, in mm. */
export const EPS_GEOMETRY = 1e-6

/** Relative tolerance for unit-free comparisons: directions whose normalised cross product is below it are parallel, a miter whose `1 + n₁·n₂` is below it is a reversal, a scale this close to 1 is 1. */
export const EPS_RELATIVE = 1e-9

/** Below this angle an intersection is classified `near-parallel`, in degrees. */
export const MIN_CROSSING_ANGLE_DEG = 10

/** Minimum footprint penetration to count as overlap, in mm. */
export const EPS_OVERLAP_MM = 0.01

/** Rebind radius around a crossing's `hint` during rematch (SPEC §5.5), in mm. */
export const REMATCH_TOLERANCE_MM = 3

/** Region same-colour seam stroke width (SPEC §4.3), in mm. */
export const REGION_SEAM_MM = 0.1

/** Conservative-bounds padding factor: the miter-limit-10 tip extent (SPEC §4.5). */
export const MITER_EXTENT_FACTOR = 2.5

/** Upper bound of any renderer's patch clip enlargement, in mm; also used by `near-joint` (SPEC §5.2). */
export const MAX_CLIP_EXTEND_MM = 0.5

/** SPEC §6.2 patch clip enlargement in export, in mm. */
export const EXPORT_CLIP_EXTEND_MM = 0.2

/** SPEC §6.2 patch clip enlargement in the editor, in px (converted via zoom). */
export const EDITOR_CLIP_EXTEND_PX = 1.5

/** Snap tolerance, in px (converted to mm through zoom and occurrence scale). */
export const SNAP_TOLERANCE_PX = 8

/** Angle snap step while drawing segments, in degrees. */
export const ANGLE_SNAP_DEG = 15

/** Angle snap capture window around each step, in degrees. */
export const ANGLE_SNAP_CAPTURE_DEG = 4

/** Tap-vs-drag slop, in px. */
export const TAP_SLOP_PX = 6

/** Double-tap detection window, in ms. */
export const DOUBLE_TAP_MS = 300

/** Double-tap detection radius: the second tap lands within this distance of the first, in px. */
export const DOUBLE_TAP_PX = 10
