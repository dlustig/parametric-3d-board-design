// Shell §5: the icon column, with these parts:
// - pane tabs: Layers, Motifs, Wood;
// - a separator;
// - the docked tools and the current-wood chip;
// - after flexible space, Undock tools. It is hidden while undocked, when the
//   tools live in the floating ToolBar instead.
// Clicking the active tab toggles the left pane; an inactive tab opens the
// pane on that tab (§4.1).

import { Layers, Palette, PictureInPicture2 } from 'lucide-react'
import type { JSX } from 'react'
import type { LeftTab } from '@/editor/layout'
import { useLayout } from '@/editor/layout'
import { Hint } from './Hint.tsx'
import { MotifIcon } from './icons.tsx'
import { ToolButtons, WoodChip } from './ToolButtons.tsx'

const TABS: ReadonlyArray<{ tab: LeftTab; label: string; icon: JSX.Element }> = [
  { tab: 'layers', label: 'Layers', icon: <Layers size={18} strokeWidth={1.6} /> },
  { tab: 'motifs', label: 'Motifs', icon: <MotifIcon size={18} /> },
  { tab: 'wood', label: 'Wood', icon: <Palette size={18} strokeWidth={1.6} /> },
]

export function IconColumn(): JSX.Element {
  const leftTab = useLayout((s) => s.leftTab)
  const leftOpen = useLayout((s) => s.leftOpen)
  const docked = useLayout((s) => s.toolsDocked)

  const onTab = (tab: LeftTab): void => {
    const ui = useLayout.getState().uiActions
    if (tab === leftTab) ui?.toggleLeft()
    else ui?.openLeft(tab)
  }

  return (
    <div className="icon-column">
      {TABS.map(({ tab, label, icon }) => (
        <Hint key={tab} label={label} side="right">
          <button type="button" className="icon-button" aria-label={label} aria-pressed={leftOpen && leftTab === tab} onClick={() => onTab(tab)}>
            {icon}
          </button>
        </Hint>
      ))}
      <div className="icon-column-separator" role="separator" />
      {docked && (
        <>
          <ToolButtons variant="column" />
          <WoodChip variant="column" />
          <span className="icon-column-fill" />
          <Hint shortcut="toggleDock" label="Undock tools" side="right">
            <button type="button" className="icon-button undock-button" aria-label="Undock tools" onClick={() => useLayout.getState().setToolsDocked(false)}>
              <PictureInPicture2 size={18} strokeWidth={1.6} />
            </button>
          </Hint>
        </>
      )}
    </div>
  )
}
