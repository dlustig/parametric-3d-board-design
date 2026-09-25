// Shell §5: the icon column — pane tabs (Wood only until Task 5), a
// separator, the docked tools and the current-wood chip. Clicking the active
// tab toggles the left pane; an inactive tab opens the pane on that tab
// (§4.1). The Undock button arrives in Task 4.

import { Palette } from 'lucide-react'
import type { JSX } from 'react'
import type { LeftTab } from '@/editor/layout'
import { useLayout } from '@/editor/layout'
import { Hint } from './Hint.tsx'
import { ToolButtons, WoodChip } from './ToolButtons.tsx'

export function IconColumn(): JSX.Element {
  const leftTab = useLayout((s) => s.leftTab)
  const leftOpen = useLayout((s) => s.leftOpen)

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
      <ToolButtons variant="column" />
      <WoodChip variant="column" />
    </div>
  )
}
