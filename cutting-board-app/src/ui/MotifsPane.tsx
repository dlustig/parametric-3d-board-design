// Shell SPEC §6.2: one row per motif definition, in document order — a
// thumbnail of the definition alone, the name (renamed inline, V1 §7.5
// text-field rules), "Used N times" / "Not placed", and Edit motif, which
// enters the first occurrence (§6.4). The pane reads the committed project,
// so a drag frame never rebuilds the thumbnails.

import { PencilLine } from 'lucide-react'
import type { JSX } from 'react'
import { useState } from 'react'
import { renameMotif } from '@/domain/commands'
import type { Id, Project } from '@/domain/model'
import { objectBounds } from '@/geometry/bounds'
import { buildScene, occurrencePaths } from '@/geometry/scene'
import { contextLevelsForPath } from '@/editor/selection'
import { useEditor } from '@/editor/store'
import { SceneSvg } from '@/render/SceneSvg'
import { Hint } from './Hint.tsx'
import { MotifIcon } from './icons.tsx'

const THUMB_ID = 'motif-thumbnail'

/** The definition's painted bounds, drawn from a throwaway copy whose root holds one identity instance of it and no root crossing records. */
function Thumbnail({ project, motifId }: { project: Project; motifId: Id }): JSX.Element {
  const copy: Project = {
    ...project,
    objects: { ...project.objects, [THUMB_ID]: { type: 'motif-instance', id: THUMB_ID, motifId, transform: { x: 0, y: 0, rotationDeg: 0, mirrorX: false, mirrorY: false, scale: 1 } } },
    rootChildren: [THUMB_ID],
    crossings: [],
  }
  const box = objectBounds(copy, THUMB_ID) // null for a definition that paints nothing
  return (
    <svg className="motif-thumb" width={40} height={40} aria-hidden="true" {...(box === null ? {} : { viewBox: `${box.minX} ${box.minY} ${box.maxX - box.minX} ${box.maxY - box.minY}` })}>
      {box !== null && <SceneSvg scene={buildScene(copy, 0)} materials={project.materials} clipPrefix={`thumb-${motifId}`} />}
    </svg>
  )
}

function MotifRow({ project, motifId }: { project: Project; motifId: Id }): JSX.Element {
  const name = project.motifs[motifId]!.name
  const [text, setText] = useState<string | null>(null) // null while not renaming
  const paths = occurrencePaths(project, motifId)
  const n = paths.length

  const commit = (): void => {
    if (text !== null && text !== name) useEditor.getState().run((p) => renameMotif(p, motifId, text))
    setText(null)
  }
  const edit = (): void => useEditor.getState().setEditContext(contextLevelsForPath(project, paths[0]!))

  return (
    <li className="motif-row" aria-label={name}>
      <Thumbnail project={project} motifId={motifId} />
      {text === null ? (
        <span className="motif-name" title={name}>
          {name}
        </span>
      ) : (
        <input
          className="motif-name"
          aria-label="Motif name"
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
            else if (e.key === 'Escape') {
              e.stopPropagation()
              setText(null)
            }
          }}
        />
      )}
      <span className="motif-usage">{n === 0 ? 'Not placed' : n === 1 ? 'Used 1 time' : `Used ${n} times`}</span>
      <div className="motif-actions">
        <Hint label="Edit motif" side="bottom" disabledReason={n === 0 ? 'Not placed on the board' : undefined}>
          <button type="button" className="icon-button" aria-label="Edit motif" disabled={n === 0} onClick={edit}>
            <MotifIcon size={18} />
          </button>
        </Hint>
        <Hint label="Rename motif" side="bottom">
          <button type="button" className="icon-button" aria-label="Rename motif" onClick={() => setText(name)}>
            <PencilLine size={18} strokeWidth={1.6} />
          </button>
        </Hint>
      </div>
    </li>
  )
}

export function MotifsPane(): JSX.Element {
  const project = useEditor((s) => s.project)
  const ids = Object.keys(project.motifs)
  return (
    <div className="motifs-pane">
      {ids.length === 0 && <p className="pane-note">No motifs yet. Select objects and choose Make motif.</p>}
      <ul className="motif-list">
        {ids.map((id) => (
          <MotifRow key={id} project={project} motifId={id} />
        ))}
      </ul>
    </div>
  )
}
