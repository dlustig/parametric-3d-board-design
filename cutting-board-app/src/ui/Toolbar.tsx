// Minimal top bar for Slice 1: Select/Hand tools and −, +, Fit (SPEC §7.2).

import type { JSX } from 'react'
import { fitView, zoomViewBy } from '@/editor/input'
import type { Tool } from '@/editor/store'
import { useEditor } from '@/editor/store'

const ZOOM_STEP = 1.25

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
      <button type="button" aria-label="Zoom out" onClick={() => zoomViewBy(1 / ZOOM_STEP)}>
        −
      </button>
      <button type="button" aria-label="Zoom in" onClick={() => zoomViewBy(ZOOM_STEP)}>
        +
      </button>
      <button type="button" onClick={fitView}>
        Fit
      </button>
    </header>
  )
}
