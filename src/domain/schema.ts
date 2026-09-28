import { z } from 'zod'
import type { Project } from './model.ts'

// Zod mirror of SPEC §2's type shapes: structure, enums, and the inline
// format constraints (id/colour regex, rows/columns integer range). The
// business invariants of §2.1 (positivity, acyclic graph, canonical
// crossing order, ...) are checked separately by `validateProject` — they
// apply just as much to hand-built `Project` objects that never pass
// through this schema.

const idSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/)
const colorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/)

const pointSchema = z.object({
  id: idSchema,
  x: z.number(),
  y: z.number(),
})

const materialSchema = z.object({
  id: idSchema,
  name: z.string(),
  color: colorSchema,
})

const bandSchema = z.object({
  type: z.literal('band'),
  id: idSchema,
  materialId: idSchema,
  widthMm: z.number(),
  closed: z.boolean(),
  points: z.array(pointSchema),
})

const regionSchema = z.object({
  type: z.literal('region'),
  id: idSchema,
  materialId: idSchema,
  points: z.array(pointSchema),
})

const transformSchema = z.object({
  x: z.number(),
  y: z.number(),
  rotationDeg: z.number(),
  mirrorX: z.boolean(),
  mirrorY: z.boolean(),
  scale: z.number(),
})

const motifInstanceSchema = z.object({
  type: z.literal('motif-instance'),
  id: idSchema,
  motifId: idSchema,
  transform: transformSchema,
})

const repeatFieldSchema = z.object({
  type: z.literal('repeat'),
  id: idSchema,
  motifId: idSchema,
  transform: transformSchema,
  rows: z.number().int().min(1).max(50),
  columns: z.number().int().min(1).max(50),
  stepXMm: z.number(),
  stepYMm: z.number(),
  rowOffsetMm: z.number(),
  columnOffsetMm: z.number(),
  alternateMirrorX: z.boolean(),
  alternateMirrorY: z.boolean(),
  alternateRotationDeg: z.literal([0, 90, 180]),
})

const designObjectSchema = z.discriminatedUnion('type', [
  bandSchema,
  regionSchema,
  motifInstanceSchema,
  repeatFieldSchema,
])

const stepSchema = z.union([
  z.object({ instanceId: idSchema }),
  z.object({ repeatId: idSchema, row: z.number().int(), column: z.number().int() }),
])

const bandRefSchema = z.object({
  path: z.array(stepSchema),
  bandId: idSchema,
  segmentStart: idSchema,
})

const crossingSchema = z.object({
  id: idSchema,
  a: bandRefSchema,
  b: bandRefSchema,
  over: z.literal(['a', 'b']),
  hint: z.object({ x: z.number(), y: z.number() }),
})

const motifDefinitionSchema = z.object({
  id: idSchema,
  name: z.string(),
  children: z.array(idSchema),
  crossings: z.array(crossingSchema),
})

export const projectSchema: z.ZodType<Project> = z.object({
  schemaVersion: z.literal(1),
  id: idSchema,
  name: z.string(),
  displayUnits: z.literal(['in', 'mm']),
  board: z.object({
    widthMm: z.number(),
    heightMm: z.number(),
    backgroundMaterialId: idSchema.nullable(),
  }),
  materials: z.array(materialSchema),
  objects: z.record(idSchema, designObjectSchema),
  rootChildren: z.array(idSchema),
  motifs: z.record(idSchema, motifDefinitionSchema),
  crossings: z.array(crossingSchema),
})
