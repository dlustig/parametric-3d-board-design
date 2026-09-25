// SPEC §8: the length/angle grammar, formatter, and field policies. No
// fraction library: the fraction and decimal parts are combined as a single
// integer numerator/denominator, and only the final `× 25.4` (for inches) is
// a floating-point operation — this is what "integer arithmetic" buys: the
// rounding happens once, at the very end, not at each intermediate step.

export type Unit = 'in' | 'mm'

export type FieldPolicy = 'positive' | 'nonneg' | 'any' | 'integer1to50'

export type ParseResult = { ok: true; mm: number } | { ok: false; error: string }
export type AngleParseResult = { ok: true; deg: number } | { ok: false; error: string }

const MM_PER_INCH = 25.4

// SPEC §8, verbatim: sign, then either a decimal or a fraction with an
// optional whole number that must be separated from it by whitespace or a
// hyphen (so `13/16` is thirteen sixteenths, never 1 3/16), then an optional
// unit.
const LENGTH_RE = /^([+-])?\s*(?:(\d+(?:[.,]\d*)?|[.,]\d+)|(?:(\d+)(?:\s+|-))?(\d+)\s*\/\s*(\d+))\s*(in|"|”|″|mm)?$/i

const ANGLE_RE = /^([+-])?\s*(\d+(?:[.,]\d*)?|[.,]\d+)\s*$/

function gcd(a: number, b: number): number {
  let x = Math.abs(a)
  let y = Math.abs(b)
  while (y !== 0) [x, y] = [y, x % y]
  return x
}

/** A decimal literal (already comma-normalised) as an exact numerator/denominator, e.g. "1.125" → 1125/1000. */
function decimalToFraction(text: string): { num: number; den: number } {
  const [whole, frac = ''] = text.split('.')
  const den = 10 ** frac.length
  const num = Number(whole === '' ? '0' : whole) * den + Number(frac === '' ? '0' : frac)
  return { num, den }
}

function unitOf(suffix: string | undefined): Unit | undefined {
  if (suffix === undefined) return undefined
  return suffix.toLowerCase() === 'mm' ? 'mm' : 'in' // in, ", ”, ″ all mean inches
}

/** SPEC §8: `parseLength`. Rejects empty text, exponents, feet, two units, `1 - 1/8`, and a zero denominator. */
export function parseLength(text: string, defaultUnit: Unit): ParseResult {
  const match = LENGTH_RE.exec(text.trim())
  if (match === null) return { ok: false, error: 'Not a valid length' }
  const [, signStr, decStr, wholeStr, numStr, denStr, unitStr] = match

  if (denStr !== undefined && Number(denStr) === 0) return { ok: false, error: 'Denominator cannot be zero' }
  const { num, den } =
    decStr !== undefined
      ? decimalToFraction(decStr.replace(',', '.'))
      : { num: Number(wholeStr ?? '0') * Number(denStr) + Number(numStr), den: Number(denStr) }

  const sign = signStr === '-' ? -1 : 1
  const unit = unitOf(unitStr) ?? defaultUnit
  const mm = unit === 'in' ? (sign * num * MM_PER_INCH) / den : (sign * num) / den
  return { ok: true, mm }
}

/** SPEC §8: `parseAngle` — plain decimal degrees, no fraction, no unit suffix. */
export function parseAngle(text: string): AngleParseResult {
  const match = ANGLE_RE.exec(text.trim())
  if (match === null) return { ok: false, error: 'Not a valid angle' }
  const [, signStr, decStr] = match
  const { num, den } = decimalToFraction(decStr!.replace(',', '.'))
  const sign = signStr === '-' ? -1 : 1
  return { ok: true, deg: (sign * num) / den }
}

/** Rounds to `decimals` places, correcting for the double-rounding a plain `toFixed` would inherit (e.g. 3.175 → "3.17"). */
function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals
  const nudged = value + Math.sign(value || 1) * 1e-9
  const rounded = Math.round(nudged * factor) / factor
  return Object.is(rounded, -0) ? 0 : rounded
}

/** `value` rounded to `decimals` places, formatted with trailing zeros (and a bare trailing point) trimmed. */
function trimmedDecimal(value: number, decimals: number): string {
  return roundTo(value, decimals)
    .toFixed(decimals)
    .replace(/\.?0+$/, '')
}

function reduceFraction(num: number, den: number): { num: number; den: number } {
  const g = gcd(num, den) || 1
  return { num: num / g, den: den / g }
}

/** A reduced mixed fraction of `k`/`denominator`, e.g. 72/64 → "1 1/8", 12/64 → "3/16", 128/64 → "2". */
function mixedFraction(k: number, denominator: number, sign: string): string {
  const whole = Math.floor(k / denominator)
  const remainder = k % denominator
  if (remainder === 0) return `${sign}${whole}`
  const { num, den } = reduceFraction(remainder, denominator)
  return whole === 0 ? `${sign}${num}/${den}` : `${sign}${whole} ${num}/${den}`
}

const SIXTY_FOURTHS = 64
const FRACTION_TOLERANCE_IN = 0.0005

/** SPEC §8: `formatLength`. Inches near a 64th print as a reduced mixed fraction; mm trims to two decimals. */
export function formatLength(mm: number, unit: Unit): string {
  if (unit === 'mm') return trimmedDecimal(mm, 2)

  const inches = mm / MM_PER_INCH
  const absInches = Math.abs(inches)
  const k = Math.round(absInches * SIXTY_FOURTHS)
  const sign = inches < 0 && k > 0 ? '-' : '' // a value that rounds to 0 never prints "-0"
  if (Math.abs(absInches - k / SIXTY_FOURTHS) <= FRACTION_TOLERANCE_IN) return mixedFraction(k, SIXTY_FOURTHS, sign)
  return `${inches < 0 ? '-' : ''}${absInches.toFixed(3)}`
}

/** SPEC §8: `formatAngle` — one decimal, trailing zero trimmed. */
export function formatAngle(deg: number): string {
  return trimmedDecimal(deg, 1)
}
