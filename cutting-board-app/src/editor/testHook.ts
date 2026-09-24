// Test-only hook for the Playwright proofs (SPEC §13, §15), installed as
// `window.__cbpd` outside production builds:
//   getProject()         the committed project (not the preview)
//   getHistoryLengths()  zundo past/future depths
//   run(cmd)             run a command through the store, as the UI does
//   replaceProject(p)    seed a project (clears history, selection, context)
//   getState()           the whole store, for camera/selection/context setup
//   getScene()           the committed project's scene at the editor's current clip enlargement
//   exportSvg()          the standalone SVG export of the committed project
//   setTestFlags(f)      hideChrome: hide the board mat and editor overlays (pixel comparison)

import type { Project } from '@/domain/model'
import { exportSvg } from '@/export/svg'
import type { Scene } from '@/geometry/scene'
import { buildScene } from '@/geometry/scene'
import { editorClipExtendMm } from './camera.ts'
import type { EditorState } from './store.ts'
import { useEditor } from './store.ts'

export interface TestFlags {
  hideChrome: boolean
}

export interface TestHook {
  getProject(): Project
  getHistoryLengths(): { past: number; future: number }
  run: EditorState['run']
  replaceProject(p: Project): void
  getState(): EditorState
  getScene(): Scene
  exportSvg(): string
  setTestFlags(flags: TestFlags): void
}

declare global {
  interface Window {
    __cbpd?: TestHook
  }
}

const HIDE_CHROME_ID = 'cbpd-test-hide-chrome'
const HIDE_CHROME_CSS = '.board-mat, .proxies, .selection-overlay, .moveable-control-box, .grid, .draw-preview, .snap-guide { display: none !important; }'

function setHideChrome(hide: boolean): void {
  document.getElementById(HIDE_CHROME_ID)?.remove()
  if (!hide) return
  const style = document.createElement('style')
  style.id = HIDE_CHROME_ID
  style.textContent = HIDE_CHROME_CSS
  document.head.append(style)
}

export function installTestHook(): void {
  if (import.meta.env.MODE === 'production') return
  window.__cbpd = {
    getProject: () => useEditor.getState().project,
    getHistoryLengths: () => {
      const t = useEditor.temporal.getState()
      return { past: t.pastStates.length, future: t.futureStates.length }
    },
    run: (cmd) => useEditor.getState().run(cmd),
    replaceProject: (p) => useEditor.getState().replaceProject(p),
    getState: () => useEditor.getState(),
    getScene: () => {
      const { project, camera } = useEditor.getState()
      return buildScene(project, editorClipExtendMm(camera.zoom))
    },
    exportSvg: () => exportSvg(useEditor.getState().project),
    setTestFlags: (flags) => setHideChrome(flags.hideChrome),
  }
}
