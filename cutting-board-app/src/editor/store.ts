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
import { newProject } from '@/domain/project'
import type { Mat } from '@/geometry/affine'
import { IDENTITY, multiply } from '@/geometry/affine'
import { pathMatrix } from '@/geometry/expand'
import { rematchCrossings } from '@/geometry/resolve'
import type { SegmentSnap } from '@/geometry/snap'
import type { EditContextLevel } from './selection.ts'
import { pruneEditContext, pruneSelection } from './selection.ts'

export type Tool = 'select' | 'hand' | 'band' | 'rect' | 'polygon' | 'crossing'

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
  currentMaterialId: Id
  saveStatus: 'saved' | 'saving' | 'unsaved' | 'other-tab'
  message: string | null // last command failure / notice
  drawing: Drawing
  lastBandWidthMm: number // width for new Bands: the last one set (SPEC §7.4)

  run(cmd: (p: Project) => Project | CommandResult): void
  setPreview(next: Project, onInterrupt: 'commit' | 'cancel'): void
  commit(): void
  cancelPreview(): void
  settlePreview(): void
  undo(): void
  redo(): void
  replaceProject(p: Project): void
  select(ids: Id[]): void
  setTool(t: Tool): void
  enterContext(c: EditContextLevel): void
  popContext(): void
  setCamera(c: Camera): void
  setViewport(v: { w: number; h: number }): void
  setGridMm(mm: number): void
}

type Temporal = StoreApi<TemporalState<{ project: Project }>>

function isCommandResult(r: Project | CommandResult): r is CommandResult {
  return 'ok' in r
}

/** SPEC §7.7: grid spacing default — 3.175 mm for inch projects, else 5 mm. */
function gridMmFor(p: Project): number {
  return p.displayUnits === 'in' ? 3.175 : 5
}

const INITIAL_PROJECT = newProject('mm')

export const useEditor: UseBoundStore<StoreApi<EditorState>> & { temporal: Temporal } = create<EditorState>()(
  temporal(
    (set, get) => ({
      project: INITIAL_PROJECT,
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
      currentMaterialId: INITIAL_PROJECT.materials[0]!.id,
      saveStatus: 'saved',
      message: null,
      drawing: null,
      lastBandWidthMm: 6.35,

      run(cmd) {
        get().settlePreview()
        const result = cmd(get().project)
        if (isCommandResult(result)) {
          if (result.ok) set({ project: result.project, message: null })
          else set({ message: result.message })
          return
        }
        set({ project: result, message: null })
      },

      setPreview(next, onInterrupt) {
        set({ preview: { next, onInterrupt } })
      },

      commit() {
        const { preview, project } = get()
        if (preview === null) return
        set({ project: rematchCrossings(project, preview.next), preview: null })
      },

      cancelPreview() {
        set({ preview: null })
      },

      settlePreview() {
        const { preview } = get()
        if (preview === null) return
        if (preview.onInterrupt === 'commit') get().commit()
        else get().cancelPreview()
      },

      undo() {
        get().settlePreview()
        useEditor.temporal.getState().undo()
        repairAfterHistoryChange(set, get)
      },

      redo() {
        get().settlePreview()
        useEditor.temporal.getState().redo()
        repairAfterHistoryChange(set, get)
      },

      replaceProject(p) {
        get().settlePreview()
        set({ project: p, selection: [], editContext: [], drawing: null })
        useEditor.temporal.getState().clear()
      },

      select(ids) {
        set({ selection: ids })
      },

      setTool(t) {
        set({ tool: t, drawing: null })
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
    }),
    {
      partialize: (s) => ({ project: s.project }),
      equality: (a, b) => a.project === b.project,
      limit: 100,
    },
  ),
)

/** Drops selection ids and edit-context levels invalidated by the undo/redo that just ran (SPEC §7.1); cancels drawing. */
function repairAfterHistoryChange(set: StoreApi<EditorState>['setState'], get: StoreApi<EditorState>['getState']): void {
  const { project, selection, editContext } = get()
  set({ selection: pruneSelection(project, selection), editContext: pruneEditContext(project, editContext), drawing: null })
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
