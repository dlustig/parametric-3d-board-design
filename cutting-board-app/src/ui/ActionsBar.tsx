// Shell §9.4: the Select tool's actions bar, centred 12 px below the
// canvas's top edge; hidden while drawing and for the other tools.
// - With a selection: a count, then Duplicate / Copy / Paste; Mirror X / Y
//   and Rotate 90° CCW / CW; the Order menu; Make motif / Repeat; Edit motif
//   (one Instance or Repeat); Detach (one Instance only, V1 §5.6); Delete.
// - With nothing selected: Paste only.
// Groups wrap on a narrow canvas.

import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { ArrowUpDown, ClipboardPaste, Copy, CopyPlus, FlipHorizontal2, FlipVertical2, RotateCcw, RotateCw, Trash2, Unlink } from 'lucide-react'
import type { JSX, ReactElement } from 'react'
import { mirrorObjects, reorder, rotateObjects } from '@/domain/commands'
import type { DesignObject } from '@/domain/model'
import { copySelection, createMotifFromSelection, deleteSelection, duplicateSelection, pasteClipboard, repeatSelection } from '@/editor/keyboard'
import { useEditor } from '@/editor/store'
import { selectionBounds } from '@/editor/tools/select'
import type { HintProps } from './Hint.tsx'
import { Hint } from './Hint.tsx'
import { MotifIcon, RepeatIcon } from './icons.tsx'
import { detachInstanceAndSelect, enterMotif } from './Inspector/InstancePanel.tsx'

const ICON = { size: 18, strokeWidth: 1.6 } as const

const TYPE_NAME: Record<DesignObject['type'], string> = { band: 'band', region: 'region', 'motif-instance': 'instance', repeat: 'repeat' }

const ORDER: ReadonlyArray<['forward' | 'backward' | 'front' | 'back', string]> = [
  ['forward', 'Bring forward'],
  ['backward', 'Send backward'],
  ['front', 'Bring to front'],
  ['back', 'Send to back'],
]

function ActionButton({ label, icon, onClick, hint }: { label: string; icon: ReactElement; onClick(): void; hint: Omit<HintProps, 'children'> }): JSX.Element {
  return (
    <Hint side="bottom" {...hint}>
      <button type="button" className="icon-button" aria-label={label} disabled={hint.disabledReason !== undefined} onClick={onClick}>
        {icon}
      </button>
    </Hint>
  )
}

export function ActionsBar(): JSX.Element | null {
  const tool = useEditor((s) => s.tool)
  const drawing = useEditor((s) => s.drawing)
  const project = useEditor((s) => s.project)
  const selection = useEditor((s) => s.selection)
  const editContext = useEditor((s) => s.editContext)
  const clipboardEmpty = useEditor((s) => s.clipboard === null)
  if (tool !== 'select' || drawing !== null) return null

  const paste = (
    <ActionButton
      label="Paste"
      icon={<ClipboardPaste {...ICON} />}
      onClick={pasteClipboard}
      hint={clipboardEmpty ? { shortcut: 'paste', disabledReason: 'Copy something first' } : { shortcut: 'paste' }}
    />
  )

  if (selection.length === 0) {
    return (
      <div className="actions-bar floating-top" role="toolbar" aria-label="Selection actions">
        {paste}
      </div>
    )
  }

  const single = selection.length === 1 ? project.objects[selection[0]!] : undefined
  const bounds = selectionBounds(project, editContext, selection)
  const centre = bounds === null ? null : { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 }
  const run = useEditor.getState().run

  return (
    <div className="actions-bar floating-top" role="toolbar" aria-label="Selection actions">
      <span className="actions-count">{single === undefined ? `${selection.length} objects` : `1 ${TYPE_NAME[single.type]}`}</span>
      <span className="actions-group">
        <ActionButton label="Duplicate" icon={<CopyPlus {...ICON} />} onClick={duplicateSelection} hint={{ shortcut: 'duplicate' }} />
        <ActionButton label="Copy" icon={<Copy {...ICON} />} onClick={copySelection} hint={{ shortcut: 'copy' }} />
        {paste}
      </span>
      {centre !== null && (
        <span className="actions-group">
          <span className="bar-divider" aria-hidden="true" />
          <ActionButton label="Mirror X" icon={<FlipHorizontal2 {...ICON} />} onClick={() => run((p) => mirrorObjects(p, selection, 'x', centre))} hint={{ label: 'Mirror X' }} />
          <ActionButton label="Mirror Y" icon={<FlipVertical2 {...ICON} />} onClick={() => run((p) => mirrorObjects(p, selection, 'y', centre))} hint={{ label: 'Mirror Y' }} />
          <ActionButton label="Rotate 90° CCW" icon={<RotateCcw {...ICON} />} onClick={() => run((p) => rotateObjects(p, selection, -90, centre))} hint={{ label: 'Rotate 90° CCW' }} />
          <ActionButton label="Rotate 90° CW" icon={<RotateCw {...ICON} />} onClick={() => run((p) => rotateObjects(p, selection, 90, centre))} hint={{ label: 'Rotate 90° CW' }} />
        </span>
      )}
      <span className="actions-group">
        <DropdownMenu.Root modal={false}>
          <Hint label="Order" side="bottom">
            <DropdownMenu.Trigger asChild>
              <button type="button" className="icon-button" aria-label="Order">
                <ArrowUpDown {...ICON} />
              </button>
            </DropdownMenu.Trigger>
          </Hint>
          <DropdownMenu.Portal>
            <DropdownMenu.Content className="menu" sideOffset={6} onEscapeKeyDown={(e) => e.stopPropagation()}>
              {ORDER.map(([how, label]) => (
                <DropdownMenu.Item key={how} className="menu-item" onSelect={() => run((p) => reorder(p, selection, how))}>
                  <span className="menu-item-label">{label}</span>
                </DropdownMenu.Item>
              ))}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
        <span className="bar-divider" aria-hidden="true" />
        <ActionButton label="Make motif" icon={<MotifIcon />} onClick={createMotifFromSelection} hint={{ shortcut: 'makeMotif' }} />
        <ActionButton label="Repeat" icon={<RepeatIcon />} onClick={repeatSelection} hint={{ shortcut: 'repeat' }} />
        {(single?.type === 'motif-instance' || single?.type === 'repeat') && (
          <ActionButton label="Edit motif" icon={<MotifIcon />} onClick={() => enterMotif(single)} hint={{ label: 'Edit motif', hint: 'Changes apply to every occurrence' }} />
        )}
        {single?.type === 'motif-instance' && (
          <ActionButton label="Detach" icon={<Unlink {...ICON} />} onClick={() => detachInstanceAndSelect(single.id)} hint={{ label: 'Detach', hint: 'Replace this instance with editable copies' }} />
        )}
      </span>
      <span className="actions-group">
        <span className="bar-divider" aria-hidden="true" />
        <ActionButton label="Delete" icon={<Trash2 {...ICON} />} onClick={deleteSelection} hint={{ shortcut: 'delete' }} />
      </span>
    </div>
  )
}
