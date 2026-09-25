// Document model — exactly the shapes in SPEC §2 (schemaVersion: 1).
// This module is pure data types: no React, no DOM, no geometry library.

export type Id = string // newId(): 32 random hex chars; validated as /^[A-Za-z0-9_-]{1,64}$/

/** An object's owning context: a Motif definition id, or `null` for the Project root. */
export type ContextId = Id | null

export interface Project {
  schemaVersion: 1
  id: Id
  name: string
  displayUnits: 'in' | 'mm'
  board: { widthMm: number; heightMm: number; backgroundMaterialId: Id | null }
  materials: Material[] // palette order
  objects: Record<Id, DesignObject> // all source objects, any context
  rootChildren: Id[] // paint order, back to front
  motifs: Record<Id, MotifDefinition>
  crossings: Crossing[] // records whose context is root
}

export interface Material {
  id: Id
  name: string
  color: string // matches /^#[0-9a-fA-F]{6}$/
}

export interface Point {
  id: Id
  x: number
  y: number // in the owning context's space
}

export interface Band {
  type: 'band'
  id: Id
  materialId: Id
  widthMm: number
  closed: boolean
  points: Point[] // >= 2 points; closed needs >= 3
}

export interface Region {
  type: 'region'
  id: Id
  materialId: Id
  points: Point[] // >= 3 points
}

export interface Transform {
  x: number
  y: number
  rotationDeg: number
  mirrorX: boolean
  mirrorY: boolean
  scale: number // > 0
}

export interface MotifInstance {
  type: 'motif-instance'
  id: Id
  motifId: Id
  transform: Transform
}

export interface RepeatField {
  type: 'repeat'
  id: Id
  motifId: Id
  transform: Transform
  rows: number // integer 1..50
  columns: number // integer 1..50
  stepXMm: number // any finite value
  stepYMm: number
  rowOffsetMm: number // X shift on odd rows
  columnOffsetMm: number // Y shift on odd columns
  alternateMirrorX: boolean // mirror X on odd columns
  alternateMirrorY: boolean // mirror Y on odd rows
  alternateRotationDeg: 0 | 90 | 180 // rotation where (row + column) is odd
}

export type DesignObject = Band | Region | MotifInstance | RepeatField

export interface MotifDefinition {
  id: Id
  name: string
  children: Id[]
  crossings: Crossing[]
}

export interface Crossing {
  id: Id
  a: BandRef
  b: BandRef // stored in canonical order: refKey(a) < refKey(b)
  over: 'a' | 'b'
  hint: { x: number; y: number } // last resolved intersection point, in the record's context space
}

export interface BandRef {
  path: Step[]
  bandId: Id
  segmentStart: Id
}

export type Step = { instanceId: Id } | { repeatId: Id; row: number; column: number }
