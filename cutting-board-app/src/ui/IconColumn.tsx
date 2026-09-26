// Shell §5: the icon column, with these parts:
// - pane tabs (Wood only until Task 5);
// - a separator;
// - the docked tools and the current-wood chip;
// - after flexible space, Undock tools. It is hidden while undocked, when the
//   tools live in the floating ToolBar instead.
// Clicking the active tab toggles the left pane; an inactive tab opens the
// pane on that tab (§4.1).

import { Palette, PictureInPicture2 } from 'lucide-react'
import type { JSX } from 'react'
import type { LeftTab } from '@/editor/layout'
import { useLayout } from '@/editor/layout'
import { Hint } from './Hint.tsx'
import { ToolButtons, WoodChip } from './ToolButtons.tsx'

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
      <Hint label="Wood" side="right">
        <button type="button" className="icon-button" aria-label="Wood" aria-pressed={leftOpen && leftTab === 'wood'} onClick={() => onTab('wood')}>
          <Palette size={18} strokeWidth={1.6} />
        </button>
      </Hint>
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
