// The editor's one scene (SPEC §6.3): derived from the shown project (the
// preview, else the committed one) at the camera's clip enlargement (SPEC
// §6.2), cached on those two inputs so the canvas, the options bar, and the
// inspector panels read the same object without rebuilding it.

import type { Project } from '@/domain/model'
import type { Scene } from '@/geometry/scene'
import { buildScene } from '@/geometry/scene'
import { editorClipExtendMm } from './camera.ts'
import type { EditorState } from './store.ts'
import { useEditor } from './store.ts'

let cached: { project: Project; clipExtendMm: number; scene: Scene } | null = null

function sceneFor(project: Project, clipExtendMm: number): Scene {
  if (cached === null || cached.project !== project || cached.clipExtendMm !== clipExtendMm) {
    cached = { project, clipExtendMm, scene: buildScene(project, clipExtendMm) }
  }
  return cached.scene
}

/** The scene of `s` as the canvas draws it; for non-React callers (tool handlers). */
export function editorScene(s: Pick<EditorState, 'project' | 'preview' | 'camera'>): Scene {
  return sceneFor(s.preview?.next ?? s.project, editorClipExtendMm(s.camera.zoom))
}

export function useScene(): Scene {
  const shown = useEditor((s) => s.preview?.next ?? s.project)
  const zoom = useEditor((s) => s.camera.zoom)
  return sceneFor(shown, editorClipExtendMm(zoom))
}
