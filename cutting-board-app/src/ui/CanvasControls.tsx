// Shell §7.2: the canvas controls — the Snap, Show grid and Add to selection
// toggles, then Zoom out, the zoom read-out (camera zoom relative to the Fit
// zoom; clicking it fits), Zoom in and Fit. Bottom-right while the tools are
// docked (the undocked position arrives in Task 4).

import { Grid3x3, Magnet, Scan, SquarePlus, ZoomIn, ZoomOut } from 'lucide-react'
import type { JSX } from 'react'
import { fitBoard } from '@/editor/camera'
import { fitView, zoomViewBy } from '@/editor/input'
import { useEditor } from '@/editor/store'
import { Hint } from './Hint.tsx'

const ZOOM_STEP = 1.25
const ICON = { size: 18, strokeWidth: 1.6 } as const

export function CanvasControls(): JSX.Element {
  const snapEnabled = useEditor((s) => s.snapEnabled)
  const showGrid = useEditor((s) => s.showGrid)
  const addToSelection = useEditor((s) => s.addToSelection)
  const zoom = useEditor((s) => s.camera.zoom)
  const fitZoom = useEditor((s) => fitBoard(s.project.board, s.viewportPx).zoom)
  const side = 'top'

  return (
    <div className="canvas-controls" role="toolbar" aria-label="View">
      <Hint label="Snap" hint="Hold Alt to drag without snapping" state={snapEnabled ? 'on' : 'off'} side={side}>
        <button type="button" className="icon-button" aria-label="Snap" aria-pressed={snapEnabled} onClick={() => useEditor.setState({ snapEnabled: !snapEnabled })}>
          <Magnet {...ICON} />
        </button>
      </Hint>
      <Hint label="Show grid" state={showGrid ? 'on' : 'off'} side={side}>
        <button type="button" className="icon-button" aria-label="Show grid" aria-pressed={showGrid} onClick={() => useEditor.setState({ showGrid: !showGrid })}>
          <Grid3x3 {...ICON} />
        </button>
      </Hint>
      <Hint label="Add to selection" hint="Each tap adds to or removes from the selection" state={addToSelection ? 'on' : 'off'} side={side}>
        <button type="button" className="icon-button" aria-label="Add to selection" aria-pressed={addToSelection} onClick={() => useEditor.setState({ addToSelection: !addToSelection })}>
          <SquarePlus {...ICON} />
        </button>
      </Hint>
      <span className="bar-divider" aria-hidden="true" />
      <Hint label="Zoom out" side={side}>
        <button type="button" className="icon-button" aria-label="Zoom out" onClick={() => zoomViewBy(1 / ZOOM_STEP)}>
          <ZoomOut {...ICON} />
        </button>
      </Hint>
      <Hint label="Zoom" hint="Click to fit the board" side={side}>
        <button type="button" className="zoom-readout" onClick={fitView}>
          {Math.round((zoom / fitZoom) * 100)}%
        </button>
      </Hint>
      <Hint label="Zoom in" side={side}>
        <button type="button" className="icon-button" aria-label="Zoom in" onClick={() => zoomViewBy(ZOOM_STEP)}>
          <ZoomIn {...ICON} />
        </button>
      </Hint>
      <Hint label="Fit" hint="Fit the board in view" side={side}>
        <button type="button" className="icon-button" aria-label="Fit" onClick={fitView}>
          <Scan {...ICON} />
        </button>
      </Hint>
    </div>
  )
}
