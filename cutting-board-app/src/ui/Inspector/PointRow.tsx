// SPEC §7.5, shell spec §13: a Band's or Region's points as a table (#, X, Y)
// whose rows each have a More menu with Insert after and Delete — identical
// for Band and Region, so both panels share it. The field labels ("Point N
// X/Y") stay the accessible names; the column headers are the visible labels.

import type { JSX } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Ellipsis } from 'lucide-react'
import { deletePoint, insertPoint } from '@/domain/commands'
import type { Id, Point, Project } from '@/domain/model'
import type { Unit } from '@/domain/units'
import { useEditor } from '@/editor/store'
import { Hint } from '../Hint.tsx'
import { NumberField } from './NumberField.tsx'
import { insertAfterXY, previewSetPoint } from './shared.ts'

interface Props {
  project: Project
  objectId: Id
  points: readonly Point[]
  wraps: boolean
  unit: Unit
}

export function PointsTable({ project, objectId, points, wraps, unit }: Props): JSX.Element {
  const commit = (): void => useEditor.getState().commit()
  const run = useEditor.getState().run
  return (
    <table className="data-table">
      <thead>
        <tr>
          <th scope="col" className="col-index">
            #
          </th>
          <th scope="col">X</th>
          <th scope="col">Y</th>
          <th scope="col" className="col-menu">
            <span className="visually-hidden">Actions</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {points.map((pt, index) => {
          const label = `Point ${index + 1}`
          return (
            <tr key={pt.id}>
              <td className="col-index">{index + 1}</td>
              <td>
                <NumberField label={`${label} X`} prefix={null} value={pt.x} unit={unit} policy="any" onPreview={(v) => previewSetPoint(project, objectId, pt.id, { x: v, y: pt.y })} onCommit={commit} />
              </td>
              <td>
                <NumberField label={`${label} Y`} prefix={null} value={pt.y} unit={unit} policy="any" onPreview={(v) => previewSetPoint(project, objectId, pt.id, { x: pt.x, y: v })} onCommit={commit} />
              </td>
              <td className="col-menu">
                <DropdownMenu.Root modal={false}>
                  <Hint label={`${label} actions`} side="left">
                    <DropdownMenu.Trigger asChild>
                      <button type="button" className="row-menu-trigger" aria-label={`${label} actions`}>
                        <Ellipsis size={16} strokeWidth={1.6} aria-hidden="true" />
                      </button>
                    </DropdownMenu.Trigger>
                  </Hint>
                  <DropdownMenu.Portal>
                    <DropdownMenu.Content className="menu" align="end" sideOffset={4} onEscapeKeyDown={(e) => e.stopPropagation()}>
                      <DropdownMenu.Item className="menu-item" onSelect={() => run((p) => insertPoint(p, objectId, pt.id, insertAfterXY(points, wraps, index)))}>
                        Insert after
                      </DropdownMenu.Item>
                      <DropdownMenu.Item className="menu-item" onSelect={() => run((p) => deletePoint(p, objectId, pt.id))}>
                        Delete
                      </DropdownMenu.Item>
                    </DropdownMenu.Content>
                  </DropdownMenu.Portal>
                </DropdownMenu.Root>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
