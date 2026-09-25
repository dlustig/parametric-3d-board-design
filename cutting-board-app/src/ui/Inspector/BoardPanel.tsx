// SPEC §7.5 Board panel: shown when nothing is selected. Width, height,
// background material, display units, grid spacing. The project name is
// edited from the top bar's Rename (shell §10.1).

import type { JSX } from 'react'
import { setBoardBackground, setBoardSize, setDisplayUnits } from '@/domain/commands'
import { useEditor } from '@/editor/store'
import { NumberField } from './NumberField.tsx'

const NONE = ''

export function BoardPanel(): JSX.Element {
  const project = useEditor((s) => s.project)
  const gridMm = useEditor((s) => s.gridMm)
  const unit = project.displayUnits

  return (
    <section className="panel" aria-label="Board">
      <h2>Board</h2>
      <NumberField
        label="Width"
        value={project.board.widthMm}
        unit={unit}
        policy="positive"
        onPreview={(v) => {
          useEditor.getState().setPreview(setBoardSize(project, v, project.board.heightMm), 'commit')
          return undefined
        }}
        onCommit={() => useEditor.getState().commit()}
      />
      <NumberField
        label="Height"
        value={project.board.heightMm}
        unit={unit}
        policy="positive"
        onPreview={(v) => {
          useEditor.getState().setPreview(setBoardSize(project, project.board.widthMm, v), 'commit')
          return undefined
        }}
        onCommit={() => useEditor.getState().commit()}
      />
      <div className="field">
        <label htmlFor="board-material">Background material</label>
        <select
          id="board-material"
          value={project.board.backgroundMaterialId ?? NONE}
          onChange={(e) => useEditor.getState().run((p) => setBoardBackground(p, e.target.value === NONE ? null : e.target.value))}
        >
          <option value={NONE}>None</option>
          {project.materials.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="board-units">Display units</label>
        <select
          id="board-units"
          value={unit}
          onChange={(e) => useEditor.getState().run((p) => setDisplayUnits(p, e.target.value as 'in' | 'mm'))}
        >
          <option value="in">in</option>
          <option value="mm">mm</option>
        </select>
      </div>
      <NumberField
        label="Grid spacing"
        value={gridMm}
        unit={unit}
        policy="positive"
        onPreview={(v) => {
          useEditor.getState().setGridMm(v)
          return undefined
        }}
        onCommit={(v) => useEditor.getState().setGridMm(v)}
      />
    </section>
  )
}
