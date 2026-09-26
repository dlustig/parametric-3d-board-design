// Shell §7.1: the undocked tool bar, centred 14 px above the canvas's bottom
// edge. It holds Select and Hand | Band, Rectangle, Polygon and Crossing |
// the current-wood chip with the next Band's width | Dock tools.

import { PanelLeft } from 'lucide-react'
import type { JSX } from 'react'
import { useLayout } from '@/editor/layout'
import { Hint } from './Hint.tsx'
import { ToolButtons, WoodChip } from './ToolButtons.tsx'

export function ToolBar(): JSX.Element {
  return (
    <div className="tool-bar" role="toolbar" aria-label="Tools">
      <ToolButtons variant="bar" />
      <span className="bar-divider" aria-hidden="true" />
      <WoodChip variant="bar" />
      <span className="bar-divider" aria-hidden="true" />
      <Hint shortcut="toggleDock" label="Dock tools" side="top">
        <button type="button" className="icon-button" aria-label="Dock tools" onClick={() => useLayout.getState().setToolsDocked(true)}>
          <PanelLeft size={18} strokeWidth={1.6} />
        </button>
      </Hint>
    </div>
  )
}
