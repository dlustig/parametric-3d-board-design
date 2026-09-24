// Test-only hook for the Playwright proof (SPEC §15), installed as
// `window.__cbpd` outside production builds:
//   getProject()         the committed project (not the preview)
//   getHistoryLengths()  zundo past/future depths
//   run(cmd)             run a command through the store, as the UI does
//   replaceProject(p)    seed a project (clears history, selection, context)
//   getState()           the whole store, for camera/selection/context setup

import type { Project } from '@/domain/model'
import type { EditorState } from './store.ts'
import { useEditor } from './store.ts'

export interface TestHook {
  getProject(): Project
  getHistoryLengths(): { past: number; future: number }
  run: EditorState['run']
  replaceProject(p: Project): void
  getState(): EditorState
}

declare global {
  interface Window {
    __cbpd?: TestHook
  }
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
  }
}
