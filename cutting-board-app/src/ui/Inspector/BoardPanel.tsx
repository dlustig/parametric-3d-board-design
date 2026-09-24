// SPEC §7.5 Board panel: shown when nothing is selected. Name, width,
// height, background material, display units, grid spacing.

import type { JSX } from 'react'
import { useEffect, useState } from 'react'
import { setBoardBackground, setBoardSize, setDisplayUnits, setProjectName } from '@/domain/commands'
import { useEditor } from '@/editor/store'
import { NumberField } from './NumberField.tsx'

const NONE = ''

function NameField(): JSX.Element {
  const name = useEditor((s) => s.project.name)
  const [text, setText] = useState(name)
  useEffect(() => setText(name), [name])

  const commit = (): void => {
    if (text === name) return
    if (text.trim() === '') {
      setText(name)
      return
    }
    useEditor.getState().run((p) => setProjectName(p, text))
  }

  return (
    <div className="field">
      <label htmlFor="board-name">Name</label>
      <input
        id="board-name"
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          else if (e.key === 'Escape') {
            e.stopPropagation()
            setText(name)
          }
        }}
      />
    </div>
  )
}

export function BoardPanel(): JSX.Element {
  const project = useEditor((s) => s.project)
  const gridMm = useEditor((s) => s.gridMm)
  const unit = project.displayUnits

  return (
    <section className="panel" aria-label="Board">
      <h2>Board</h2>
      <NameField />
      <NumberField
        label="Width"
        value={project.board.widthMm}
        unit={unit}
        policy="positive"
        onPreview={(v) => useEditor.getState().setPreview(setBoardSize(project, v, project.board.heightMm), 'commit')}
        onCommit={() => useEditor.getState().commit()}
      />
      <NumberField
        label="Height"
        value={project.board.heightMm}
        unit={unit}
        policy="positive"
        onPreview={(v) => useEditor.getState().setPreview(setBoardSize(project, project.board.widthMm, v), 'commit')}
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
        onPreview={(v) => useEditor.getState().setGridMm(v)}
        onCommit={(v) => useEditor.getState().setGridMm(v)}
      />
    </section>
  )
}
