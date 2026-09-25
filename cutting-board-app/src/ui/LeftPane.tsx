// Shell §6: the left pane — a 40 px title row (the tab's name and its own
// controls) over the tab's scrolling body. Only Wood exists until Task 5
// adds Layers and Motifs; the default tab is 'wood' until then.

import type { JSX } from 'react'
import type { LeftTab } from '@/editor/layout'
import { useLayout } from '@/editor/layout'
import { useEditor } from '@/editor/store'
import { MaterialEditor } from './MaterialEditor.tsx'
import { WoodPane } from './WoodPane.tsx'

const TITLES: Record<LeftTab, string> = { layers: 'Layers', motifs: 'Motifs', wood: 'Wood' }

export function LeftPane(): JSX.Element {
  const tab = useLayout((s) => s.leftTab)
  const project = useEditor((s) => s.project)
  return (
    <aside className="left-pane" aria-labelledby="left-pane-title">
      <header className="pane-title">
        <h2 id="left-pane-title">{TITLES[tab]}</h2>
        {tab === 'wood' && <MaterialEditor project={project} />}
      </header>
      <div className="pane-body">{tab === 'wood' && <WoodPane />}</div>
    </aside>
  )
}
