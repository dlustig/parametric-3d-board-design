// SPEC §4.1: matrix composition and inversion. Hand-written 2×3 affine math
// (Flatten's `Matrix` has no inverse, and inversion is needed for
// edit-context input mapping) — no second matrix type.

import type { RepeatField, Transform } from '../domain/model.ts'

/** SVG convention: x' = a·x + c·y + e; y' = b·x + d·y + f. */
export type Mat = readonly [a: number, b: number, c: number, d: number, e: number, f: number]

export const IDENTITY: Mat = [1, 0, 0, 1, 0, 0]

/** `m · n`: applying the result to a point applies `n` first, then `m`. */
export function multiply(m: Mat, n: Mat): Mat {
  const [a1, b1, c1, d1, e1, f1] = m
  const [a2, b2, c2, d2, e2, f2] = n
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ]
}

function translation(x: number, y: number): Mat {
  return [1, 0, 0, 1, x, y]
}

/** `R(θ)` in y-down space: `[[cos θ, −sin θ], [sin θ, cos θ]]` (positive θ clockwise on screen). */
function rotation(degrees: number): Mat {
  const rad = (degrees * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  return [cos, sin, -sin, cos, 0, 0]
}

function uniformScale(scale: number): Mat {
  return [scale, 0, 0, scale, 0, 0]
}

function mirror(mirrorX: boolean, mirrorY: boolean): Mat {
  return [mirrorX ? -1 : 1, 0, 0, mirrorY ? -1 : 1, 0, 0]
}

/** `M(t) = T(x, y) · R(rotationDeg) · S(scale) · Mirror(mirrorX, mirrorY)` per SPEC §4.1. */
export function fromTransform(t: Transform): Mat {
  return multiply(translation(t.x, t.y), multiply(rotation(t.rotationDeg), multiply(uniformScale(t.scale), mirror(t.mirrorX, t.mirrorY))))
}

/** SPEC §4.4 `Cell(r, c)`: the per-cell offset within a `RepeatField`, no scale term. */
export function cell(r: RepeatField, row: number, col: number): Mat {
  const tx = col * r.stepXMm + (row % 2 !== 0 ? r.rowOffsetMm : 0)
  const ty = row * r.stepYMm + (col % 2 !== 0 ? r.columnOffsetMm : 0)
  const rotationDeg = (row + col) % 2 !== 0 ? r.alternateRotationDeg : 0
  const mirrorX = r.alternateMirrorX && col % 2 !== 0
  const mirrorY = r.alternateMirrorY && row % 2 !== 0

  return multiply(translation(tx, ty), multiply(rotation(rotationDeg), mirror(mirrorX, mirrorY)))
}

/** The inverse of `m`, such that `apply(invert(m), apply(m, p)) ≈ p`. */
export function invert(m: Mat): Mat {
  const [a, b, c, d, e, f] = m
  const det = a * d - b * c
  return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det]
}

export function apply(m: Mat, p: { x: number; y: number }): { x: number; y: number } {
  const [a, b, c, d, e, f] = m
  return { x: a * p.x + c * p.y + e, y: b * p.x + d * p.y + f }
}

/** `sqrt(|det|)` — the uniform scale factor a matrix applies, ignoring mirroring. */
export function scaleOf(m: Mat): number {
  const [a, b, c, d] = m
  return Math.sqrt(Math.abs(a * d - b * c))
}

/** `det < 0` — whether `m` flips orientation (an odd number of mirror axes). */
export function isMirrored(m: Mat): boolean {
  const [a, b, c, d] = m
  return a * d - b * c < 0
}
