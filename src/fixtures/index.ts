// SPEC §12: the six original acceptance fixtures, loaded as JSON (committed,
// hand-generated data). Each round-trips
// through `importProject` (fixtures.test.ts); the cast below only bridges
// the JSON module's structurally-inferred type to the exact domain type.

import type { Project, RepeatField } from '@/domain/model'
import basketWeaveJson from './basket-weave.json'
import checkerJson from './checker.json'
import chevronDiamondJson from './chevron-diamond.json'
import interlaceJson from './interlace.json'
import isometricJson from './isometric.json'
import stripesJson from './stripes.json'

function asProject(json: unknown): Project {
  return json as Project
}

export const fixtures: Record<'stripes' | 'checker' | 'basketWeave' | 'chevronDiamond' | 'isometric' | 'interlace', Project> = {
  stripes: asProject(stripesJson),
  checker: asProject(checkerJson),
  basketWeave: asProject(basketWeaveJson),
  chevronDiamond: asProject(chevronDiamondJson),
  isometric: asProject(isometricJson),
  interlace: asProject(interlaceJson),
}

/**
 * Fixture F (`interlace`) repeated to a bigger grid so `countOccurrences`
 * lands in [1000, 5000] — SPEC §12, §13 G9's performance variant. Only the
 * repeat field's rows/columns change; the cell design (and so every crossing
 * record, which addresses bands directly, not specific cells outside the two
 * root overrides) stays valid at any grid size.
 */
export function interlacePerformance(): Project {
  const p = structuredClone(fixtures.interlace)
  const field = Object.values(p.objects).find((o): o is RepeatField => o.type === 'repeat')
  if (field === undefined) throw new Error('interlace fixture has no repeat field')
  field.rows = 15
  field.columns = 15
  return p
}
