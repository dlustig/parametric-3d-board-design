// Minimal top bar for Slice 1: Select/Hand tools and −, +, Fit (SPEC §7.2).

import type { JSX } from 'react'
import { fitBoard, zoomAbout } from '@/editor/camera'
import type { Tool } from '@/editor/store'
import { useEditor } from '@/editor/store'

const ZOOM_STEP = 1.25

/** Zoom about the viewport centre; the canvas element supplies the viewport size. */
function zoomBy(factor: number): void {
  const { camera, setCamera } = useEditor.getState()
  const el = document.querySelector('.canvas')
  if (el === null) return
  const centre = { x: camera.x + el.clientWidth / 2 / camera.zoom, y: camera.y + el.clientHeight / 2 / camera.zoom }
  setCamera(zoomAbout(camera, factor, centre))
}

function fit(): void {
  const { project, setCamera } = useEditor.getState()
  const el = document.querySelector('.canvas')
  if (el !== null) setCamera(fitBoard(project.board, { w: el.clientWidth, h: el.clientHeight }))
}

export function Toolbar(): JSX.Element {
  const tool = useEditor((s) => s.tool)
  const setTool = useEditor((s) => s.setTool)
  const toolButton = (t: Tool, label: string): JSX.Element => (
    <button type="button" aria-pressed={tool === t} onClick={() => setTool(t)}>
      {label}
    </button>
  )
  return (
    <header className="toolbar">
      {toolButton('select', 'Select')}
      {toolButton('hand', 'Hand')}
      <span className="toolbar-gap" />
      <button type="button" aria-label="Zoom out" onClick={() => zoomBy(1 / ZOOM_STEP)}>
        −
      </button>
      <button type="button" aria-label="Zoom in" onClick={() => zoomBy(ZOOM_STEP)}>
        +
      </button>
      <button type="button" onClick={fit}>
        Fit
      </button>
    </header>
  )
}
