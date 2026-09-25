// SPEC §7.1: the editor store — the Project wrapped in bounded zundo history,
// a gesture/field preview that never itself enters history, and ephemeral
// editor state (tool, selection, camera, edit context, drawing).
//
// zundo v2.3.0 options, verified against node_modules/zundo/README.md:
//   partialize?: (state: TState) => PartialTState
//   limit?: number
//   equality?: (pastState: PartialTState, currentState: PartialTState) => boolean
// "The equality is required: without it camera and selection writes push
// duplicate entries and clear redo." (SPEC §7.1) — a state snapshot is only
// stored when a zustand setter is called AND equality(past, current) is
// falsy, so an `equality` that only compares `project` skips every write
// that doesn't change it.

import { create } from 'zustand'
import type { StoreApi, UseBoundStore } from 'zustand'
import { temporal } from 'zundo'
import type { TemporalState } from 'zundo'
import type { CommandResult } from '@/domain/commands'
import type { ContextId, Id, Project } from '@/domain/model'
import { freezeInDev } from '@/domain/freeze'
import { newProject } from '@/domain/project'
import { validateProject } from '@/domain/validate'
import type { Mat } from '@/geometry/affine'
import { IDENTITY, multiply } from '@/geometry/affine'
import { pathMatrix } from '@/geometry/expand'
import type { SegmentSnap, SnapResult } from '@/geometry/snap'
import { fitBoard } from './camera.ts'
import type { EditContextLevel } from './selection.ts'
import { pruneCurrentMaterial, pruneEditContext, pruneSelection } from './selection.ts'

export type Tool = 'select' | 'hand' | 'band' | 'rect' | 'polygon' | 'crossing'

/** SPEC §9: local autosave status, surfaced by `StatusBar` (`storage/local.ts` drives it). */
export type SaveStatus = 'saved' | 'unsaved' | 'other-tab'

export interface Preview {
  next: Project
  onInterrupt: 'commit' | 'cancel'
}

/**
 * Drawing-tool progress (Band/Polygon points placed so far; Rectangle's first
 * corner while dragging) and the live snapped cursor with the pending segment's length/angle, all in the current
 * context's space. Plain field: tool code (`tools/draw.ts`) reads/writes it
 * directly, no dedicated actions.
 */
export type Drawing = { tool: 'band' | 'polygon' | 'rect'; points: Array<{ x: number; y: number }>; cursor: SegmentSnap | null } | null

export interface Camera {
  x: number
  y: number
  zoom: number // px per mm
}

export interface EditorState {
  project: Project
  preview: Preview | null
  tool: Tool
  selection: Id[]
  editContext: EditContextLevel[]
  camera: Camera
  viewportPx: { w: number; h: number } // canvas client size, kept by the canvas ResizeObserver
  snapEnabled: boolean
  showGrid: boolean
  gridMm: number
  addToSelection: boolean
  crossingScope: 'all' | 'occurrence'
  crossingNotice: string | null // Crossing tool read-out: an unsupported marker's reason, a scope fallback (SPEC §7.4)
  currentMaterialId: Id
  saveStatus: SaveStatus
  message: string | null // last command failure / notice
  drawing: Drawing
  lastBandWidthMm: number // width for new Bands: the last one set (SPEC §7.4)
  /** The active snap of a Select gesture (move, vertex drag), in the current context's space; cleared with its preview (SPEC §7.7 guide). */
  snapGuide: SnapResult | null
  /** Canvas.tsx's gesture-abort hook (stops Moveable, cancels a gesture preview), registered while it's mounted — null otherwise. SPEC §7.4 Esc's "cancel gesture" step calls it. */
  abortGesture: (() => void) | null

  run(cmd: (p: Project) => Project | CommandResult): void
  setPreview(next: Project, onInterrupt: 'commit' | 'cancel'): void
  commit(): void
  cancelPreview(): void
  settlePreview(): void
  undo(): void
  redo(): void
  /** Opens `p` (startup load, New, Open): clears history, selection and context, and fits the camera to its Board. */
  replaceProject(p: Project): void
  select(ids: Id[]): void
  setTool(t: Tool): void
  enterContext(c: EditContextLevel): void
  popContext(): void
  setCamera(c: Camera): void
  setViewport(v: { w: number; h: number }): void
  setGridMm(mm: number): void
  setAbortGesture(fn: (() => void) | null): void
}

type Temporal = StoreApi<TemporalState<{ project: Project }>>

function isCommandResult(r: Project | CommandResult): r is CommandResult {
  return 'ok' in r
}

/** SPEC §7.7: grid spacing default — 3.175 mm for inch projects, else 5 mm. */
function gridMmFor(p: Project): number {
  return p.displayUnits === 'in' ? 3.175 : 5
}

/** SPEC §7.7: the grid resets to the default for the display units when they change; a user's spacing lasts until then. */
function gridAfter(before: Project, after: Project, gridMm: number): number {
  return after.displayUnits === before.displayUnits ? gridMm : gridMmFor(after)
}

/**
 * Dev and test builds only: a project the store takes in (a command's result,
 * a committed preview, an opened file) must satisfy SPEC §2.1, so a command
 * that breaks an invariant throws where it happens instead of reaching
 * history and autosave. Production skips the check (it walks the project).
 */
function assertValidInDev(p: Project): Project {
  if (import.meta.env.DEV) {
    const error = validateProject(p)
    if (error !== null) throw new Error(`Invalid project at ${error.path}: ${error.message}`)
  }
  return p
}

const INITIAL_PROJECT = newProject('mm')

export const useEditor: UseBoundStore<StoreApi<EditorState>> & { temporal: Temporal } = create<EditorState>()(
  temporal(
    (set, get) => ({
      project: freezeInDev(INITIAL_PROJECT),
      preview: null,
      tool: 'select',
      selection: [],
      editContext: [],
      camera: { x: 0, y: 0, zoom: 2 },
      viewportPx: { w: 1, h: 1 },
      snapEnabled: true,
      showGrid: true,
      gridMm: gridMmFor(INITIAL_PROJECT),
      addToSelection: false,
      crossingScope: 'all',
      crossingNotice: null,
      currentMaterialId: INITIAL_PROJECT.materials[0]!.id,
      saveStatus: 'saved',
      message: null,
      drawing: null,
      lastBandWidthMm: 6.35,
      snapGuide: null,
      abortGesture: null,

      run(cmd) {
        get().settlePreview()
        const { project, currentMaterialId, gridMm } = get()
        const result = cmd(project)
        if (isCommandResult(result) && !result.ok) {
          set({ message: result.message })
          return
        }
        const next = isCommandResult(result) ? result.project : result
        set({
          project: freezeInDev(assertValidInDev(next)),
          message: null,
          currentMaterialId: pruneCurrentMaterial(next, currentMaterialId),
          gridMm: gridAfter(project, next, gridMm),
        })
      },

      setPreview(next, onInterrupt) {
        set({ preview: { next: freezeInDev(next), onInterrupt } })
      },

      // A preview is always a command's result, and commands already rematch
      // (SPEC §7.1): the store never rematches, so no preview frame pays twice.
      commit() {
        const { preview } = get()
        if (preview === null) return
        set({ project: freezeInDev(assertValidInDev(preview.next)), preview: null, snapGuide: null })
      },

      cancelPreview() {
        set({ preview: null, snapGuide: null })
      },

      settlePreview() {
        const { preview } = get()
        if (preview === null) return
        if (preview.onInterrupt === 'commit') get().commit()
        else get().cancelPreview()
      },

      undo() {
        get().settlePreview()
        const before = get().project
        useEditor.temporal.getState().undo()
        repairAfterHistoryChange(set, get, before)
      },

      redo() {
        get().settlePreview()
        const before = get().project
        useEditor.temporal.getState().redo()
        repairAfterHistoryChange(set, get, before)
      },

      replaceProject(p) {
        get().settlePreview()
        set({ project: freezeInDev(assertValidInDev(p)), selection: [], editContext: [], drawing: null, currentMaterialId: pruneCurrentMaterial(p, get().currentMaterialId), message: null, gridMm: gridMmFor(p), camera: fitBoard(p.board, get().viewportPx) })
        useEditor.temporal.getState().clear()
      },

      select(ids) {
        set({ selection: ids })
      },

      setTool(t) {
        set({ tool: t, drawing: null, crossingNotice: null, message: null })
      },

      enterContext(c) {
        set((s) => ({ editContext: [...s.editContext, c] }))
      },

      popContext() {
        set((s) => ({ editContext: s.editContext.slice(0, -1) }))
      },

      setCamera(c) {
        set({ camera: c })
      },

      setViewport(v) {
        set({ viewportPx: v })
      },

      setGridMm(mm) {
        set({ gridMm: mm })
      },

      setAbortGesture(fn) {
        set({ abortGesture: fn })
      },
    }),
    {
      partialize: (s) => ({ project: s.project }),
      equality: (a, b) => a.project === b.project,
      limit: 100,
    },
  ),
)

/** Drops selection ids, edit-context levels, and a dangling `currentMaterialId` invalidated by the undo/redo that just ran from `before` (SPEC §7.1); cancels drawing; resets the grid if the units changed back. */
function repairAfterHistoryChange(set: StoreApi<EditorState>['setState'], get: StoreApi<EditorState>['getState'], before: Project): void {
  const { project, selection, editContext, currentMaterialId, gridMm } = get()
  set({
    selection: pruneSelection(project, selection),
    editContext: pruneEditContext(project, editContext),
    currentMaterialId: pruneCurrentMaterial(project, currentMaterialId),
    drawing: null,
    gridMm: gridAfter(before, project, gridMm),
  })
}

/** The innermost entered definition, or `null` at the Project root (SPEC §7.6). */
export function currentContext(s: EditorState): ContextId {
  const last = s.editContext[s.editContext.length - 1]
  return last === undefined ? null : last.motifId
}

/** World matrix of the current edit context: the product of each entered level's occurrence matrix, in order. */
export function contextMatrix(s: EditorState): Mat {
  let matrix: Mat = IDENTITY
  for (const level of s.editContext) {
    matrix = multiply(matrix, pathMatrix(s.project, level.path))
  }
  return matrix
}
