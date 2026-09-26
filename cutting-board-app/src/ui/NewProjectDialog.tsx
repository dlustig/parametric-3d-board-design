// Shell spec §10.2: New Project — a blank board or one of the six sample
// patterns (SPEC §12 fixtures, shipped in production), with its size and
// units. It is New's confirmation (V1 §9's "Start a new project?" is gone).
// Sizes are held in mm; the unit toggle only re-renders the fields. Create
// builds the project (Blank: newProject(units); a sample: a deep clone, then
// setDisplayUnits if the units differ), runs setBoardSize if W or H differs,
// and opens it with one replaceProject, which clears history. Cancel changes
// nothing. The form lives inside Dialog.Content, which unmounts on close, so
// each opening starts fresh and renders the seven thumbnails once.

import * as Dialog from '@radix-ui/react-dialog'
import type { JSX } from 'react'
import { useState } from 'react'
import { setBoardSize, setDisplayUnits } from '@/domain/commands'
import type { Project } from '@/domain/model'
import { isBlankProject, newProject } from '@/domain/project'
import type { Unit } from '@/domain/units'
import { editorClipExtendMm } from '@/editor/camera'
import { useEditor } from '@/editor/store'
import { downloadProject } from '@/export/download'
import { fixtures } from '@/fixtures'
import type { Scene } from '@/geometry/scene'
import { buildScene } from '@/geometry/scene'
import { SceneSvg } from '@/render/SceneSvg'
import { NumberField } from './Inspector/NumberField.tsx'

/** Card order, as §10.2 lists them. */
const SAMPLES = ['stripes', 'checker', 'basketWeave', 'chevronDiamond', 'isometric', 'interlace'] as const satisfies ReadonlyArray<keyof typeof fixtures>
const UNITS: Unit[] = ['mm', 'in']
const THUMB_PX = 88

interface Card {
  key: string
  label: string
  blank: boolean
  project: Project
  scene: Scene
}

function NewProjectForm({ onDone }: { onDone(): void }): JSX.Element {
  const current = useEditor((s) => s.project)
  const [cards] = useState<Card[]>(() => {
    const specs: Array<{ key: string; label: string; blank: boolean; project: Project }> = [
      { key: 'blank', label: 'Blank', blank: true, project: newProject(current.displayUnits) },
      ...SAMPLES.map((k) => ({ key: k, label: fixtures[k].name, blank: false, project: fixtures[k] })),
    ]
    // Each thumbnail's scene is built once here, at zoom = THUMB_PX per the board's longer side.
    return specs.map((s) => {
      const { widthMm, heightMm } = s.project.board
      return { ...s, scene: buildScene(s.project, editorClipExtendMm(THUMB_PX / Math.max(widthMm, heightMm))) }
    })
  })
  const [chosen, setChosen] = useState(cards[0]!)
  const [units, setUnits] = useState<Unit>(current.displayUnits)
  const [size, setSize] = useState({ widthMm: chosen.project.board.widthMm, heightMm: chosen.project.board.heightMm })

  const choose = (c: Card): void => {
    setChosen(c)
    setSize({ widthMm: c.project.board.widthMm, heightMm: c.project.board.heightMm })
  }

  const create = (): void => {
    let p = chosen.blank ? newProject(units) : structuredClone(chosen.project)
    if (p.displayUnits !== units) p = setDisplayUnits(p, units)
    if (p.board.widthMm !== size.widthMm || p.board.heightMm !== size.heightMm) p = setBoardSize(p, size.widthMm, size.heightMm)
    useEditor.getState().replaceProject(p)
    onDone()
  }

  return (
    <>
      <div className="new-project-cards" role="group" aria-label="Start from">
        {cards.map((c) => {
          const { widthMm: w, heightMm: h, backgroundMaterialId } = c.project.board
          // A Board with no background is drawn white, as Canvas.tsx draws it: document rendering, not theme.
          const fill = c.project.materials.find((m) => m.id === backgroundMaterialId)?.color ?? '#ffffff'
          return (
            <button key={c.key} type="button" className="new-project-card" aria-pressed={c === chosen} onClick={() => choose(c)}>
              <svg className="new-project-thumb" viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
                <rect width={w} height={h} fill={fill} />
                <SceneSvg scene={c.scene} materials={c.project.materials} clipPrefix={`cbpd-np-${c.key}`} />
              </svg>
              <span className="new-project-card-name">{c.label}</span>
            </button>
          )
        })}
      </div>
      <div className="new-project-size">
        <NumberField
          label="Width"
          prefix="W"
          value={size.widthMm}
          unit={units}
          policy="positive"
          onPreview={(widthMm) => {
            setSize((s) => ({ ...s, widthMm }))
            return undefined
          }}
          onCommit={(widthMm) => setSize((s) => ({ ...s, widthMm }))}
        />
        <NumberField
          label="Height"
          prefix="H"
          value={size.heightMm}
          unit={units}
          policy="positive"
          onPreview={(heightMm) => {
            setSize((s) => ({ ...s, heightMm }))
            return undefined
          }}
          onCommit={(heightMm) => setSize((s) => ({ ...s, heightMm }))}
        />
        <div className="segmented" role="group" aria-label="Units">
          {UNITS.map((u) => (
            <button key={u} type="button" className="segment" aria-pressed={units === u} onClick={() => setUnits(u)}>
              {u}
            </button>
          ))}
        </div>
      </div>
      {!isBlankProject(current) && (
        <p className="new-project-warning">
          This replaces the current project. Download it first to keep a copy.{' '}
          <button type="button" className="inspector-button" onClick={() => downloadProject(current)}>
            Download project
          </button>
        </p>
      )}
      <div className="dialog-actions">
        <Dialog.Close asChild>
          <button type="button" className="inspector-button">
            Cancel
          </button>
        </Dialog.Close>
        <button type="button" className="new-project-create" onClick={create}>
          Create
        </button>
      </div>
    </>
  )
}

export function NewProjectDialog({ open, onOpenChange }: { open: boolean; onOpenChange(o: boolean): void }): JSX.Element {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content new-project" onEscapeKeyDown={(e) => e.stopPropagation()}>
          <Dialog.Title className="new-project-title">New project</Dialog.Title>
          <Dialog.Description className="new-project-lede">Start from a blank board or one of the sample patterns. You can change the size later.</Dialog.Description>
          <NewProjectForm onDone={() => onOpenChange(false)} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
