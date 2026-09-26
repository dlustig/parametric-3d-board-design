// Shell §6: the left pane — a 40 px title row (the tab's name and its own
// controls; inside a definition, Layers shows Back and the motif name) over
// the tab's scrolling body.

import type { JSX } from 'react'
import type { LeftTab } from '@/editor/layout'
import { useLayout } from '@/editor/layout'
import { useEditor } from '@/editor/store'
import { LayersPane, LayersTitle } from './LayersPane.tsx'
import { MaterialEditor } from './MaterialEditor.tsx'
import { MotifsPane } from './MotifsPane.tsx'
import { WoodPane } from './WoodPane.tsx'

const TITLES: Record<LeftTab, string> = { layers: 'Layers', motifs: 'Motifs', wood: 'Wood' }

export function LeftPane(): JSX.Element {
  const tab = useLayout((s) => s.leftTab)
  const project = useEditor((s) => s.project)
  return (
    <aside className="left-pane" aria-label={TITLES[tab]}>
      <header className="pane-title">
        {tab === 'layers' ? <LayersTitle /> : <h2>{TITLES[tab]}</h2>}
        {tab === 'wood' && <MaterialEditor project={project} />}
      </header>
      <div className="pane-body">
        {tab === 'layers' && <LayersPane />}
        {tab === 'motifs' && <MotifsPane />}
        {tab === 'wood' && <WoodPane />}
      </div>
    </aside>
  )
}
