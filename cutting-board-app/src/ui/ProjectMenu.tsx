// Shell §10.1: the project menu, a Radix DropdownMenu on the top bar's
// project-name button.
//
// - New project… keeps V1 §9's confirm-unless-blank flow until Task 10's
//   dialog.
// - Open project… keeps V1 §9's "Open a project?" confirmation and its
//   failure behaviour: project and history untouched, and the error goes to
//   the store's `message`, which only TopBar renders. `replaceProject` clears
//   a stale message on success.
// - Rename turns the name button into a text field labelled Name, under the
//   V1 §7.5 rules: Enter or blur commits, Esc reverts, and an empty name
//   reverts.
// - Escape in the menu or the confirmation closes that layer only: Radix
//   preventDefaults it without stopping it, and the app's keyboard dispatcher
//   would otherwise also clear the selection.
//
// Mod+O reaches the Open flow through `openProjectRef`, which App's
// `uiActions.openProject` calls.

import * as Dialog from '@radix-ui/react-dialog'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { ChevronDown, ChevronRight, Download, FileOutput, FilePlus, FolderOpen, Keyboard, PencilLine } from 'lucide-react'
import type { ChangeEvent, JSX, ReactElement, RefObject } from 'react'
import { Fragment, useEffect, useRef, useState } from 'react'
import { setProjectName } from '@/domain/commands'
import { importProject } from '@/domain/migrate'
import type { Project } from '@/domain/model'
import { newProject } from '@/domain/project'
import { useLayout } from '@/editor/layout'
import type { ShortcutId } from '@/editor/shortcuts'
import { SHORTCUTS } from '@/editor/shortcuts'
import { useEditor } from '@/editor/store'
import { downloadExportSvg, downloadProject } from '@/export/download'
import { fixtures } from '@/fixtures'
import { Hint } from './Hint.tsx'
import { ChordKeys } from './Keycap.tsx'

const ICON = { size: 16, strokeWidth: 1.6 } as const

/** Dev-only manual-inspection aid (V1 SPEC §12 fixtures), until Task 10's New project dialog ships them; never bundled into production. */
const SAMPLES: ReadonlyArray<[keyof typeof fixtures, string]> = [
  ['stripes', 'Stripes'],
  ['checker', 'Checker'],
  ['basketWeave', 'Basket weave'],
  ['chevronDiamond', 'Chevron diamond'],
  ['isometric', 'Isometric'],
  ['interlace', 'Interlace'],
]

/** SPEC §9: the blank starter — no objects (root or definition-owned) — is silently replaceable. */
export function isBlankProject(project: Project): boolean {
  return Object.keys(project.objects).length === 0
}

function MenuItem({ icon, label, shortcut, onSelect }: { icon: ReactElement; label: string; shortcut?: ShortcutId; onSelect(): void }): JSX.Element {
  return (
    <DropdownMenu.Item className="menu-item" onSelect={onSelect}>
      {icon}
      <span className="menu-item-label">{label}</span>
      {shortcut !== undefined && (
        <span className="menu-item-keys" aria-hidden="true">
          <ChordKeys chord={SHORTCUTS[shortcut].keys[0]!} muted />
        </span>
      )}
    </DropdownMenu.Item>
  )
}

type PendingAction = 'new' | 'open' | null

export function ProjectMenu({ openProjectRef }: { openProjectRef: RefObject<() => void> }): JSX.Element {
  const name = useEditor((s) => s.project.name)
  const editContext = useEditor((s) => s.editContext)
  const motifs = useEditor((s) => s.project.motifs)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<PendingAction>(null)
  const [renaming, setRenaming] = useState(false)
  const [text, setText] = useState('')
  // Refs, not state: the menu's close-autofocus handler and the field's blur
  // run before a re-render could show them the new value.
  const renamingRef = useRef(false)
  const reverted = useRef(false)

  /** Shell spec §8: pops the edit context to `depth` levels (0 = the root). The breadcrumb's own crumb clicks. */
  const popTo = (depth: number): void => useEditor.getState().setEditContext(editContext.slice(0, depth))

  const startNew = (): void => {
    const displayUnits = useEditor.getState().project.displayUnits
    useEditor.getState().replaceProject(newProject(displayUnits))
  }

  const onNewClick = (): void => {
    if (isBlankProject(useEditor.getState().project)) startNew()
    else setPending('new')
  }

  const onOpenClick = (): void => {
    if (isBlankProject(useEditor.getState().project)) fileInputRef.current?.click()
    else setPending('open')
  }

  useEffect(() => {
    openProjectRef.current = onOpenClick
  })

  const onConfirm = (): void => {
    if (pending === 'new') startNew()
    else if (pending === 'open') fileInputRef.current?.click()
    setPending(null)
  }

  const onFileChange = (e: ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow reselecting the same filename after a failure
    if (file === undefined) return
    void file.text().then((fileText) => {
      const result = importProject(fileText)
      if (!result.ok) {
        useEditor.setState({ message: result.error.path === '' ? result.error.message : `${result.error.path}: ${result.error.message}` })
        return
      }
      useEditor.getState().replaceProject(result.project)
    })
  }

  const startRename = (): void => {
    renamingRef.current = true
    reverted.current = false
    setText(name)
    setRenaming(true)
  }

  const finishRename = (): void => {
    if (!reverted.current && text.trim() !== '' && text !== name) useEditor.getState().run((p) => setProjectName(p, text))
    renamingRef.current = false
    setRenaming(false)
  }

  return (
    <div className="project-menu">
      <DropdownMenu.Root modal={false}>
        {renaming ? (
          <input
            ref={nameInputRef}
            className="project-name-input"
            aria-label="Name"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={finishRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
              else if (e.key === 'Escape') {
                e.stopPropagation()
                reverted.current = true
                e.currentTarget.blur()
              }
            }}
          />
        ) : editContext.length === 0 ? (
          <DropdownMenu.Trigger asChild>
            <button type="button" className="project-name" title={name}>
              <span className="project-name-text">{name}</span>
              <ChevronDown {...ICON} />
            </button>
          </DropdownMenu.Trigger>
        ) : (
          <nav className="crumbs" aria-label="Breadcrumb">
            <button type="button" className="crumb" title={name} onClick={() => popTo(0)}>
              {name}
            </button>
            <Hint label="Project menu" side="bottom">
              <DropdownMenu.Trigger asChild>
                <button type="button" className="crumb-menu" aria-label="Project menu">
                  <ChevronDown size={14} strokeWidth={1.6} aria-hidden="true" />
                </button>
              </DropdownMenu.Trigger>
            </Hint>
            {editContext.map((level, k) => {
              const motifName = motifs[level.motifId]!.name
              return (
                <Fragment key={k}>
                  <ChevronRight className="crumb-sep" size={14} strokeWidth={1.6} aria-hidden="true" />
                  {k < editContext.length - 1 ? (
                    <button type="button" className="crumb" title={motifName} onClick={() => popTo(k + 1)}>
                      {motifName}
                    </button>
                  ) : (
                    <span className="crumb crumb-current" title={motifName} aria-current="location">
                      {motifName}
                    </span>
                  )}
                </Fragment>
              )
            })}
          </nav>
        )}
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            className="menu"
            align="start"
            sideOffset={6}
            onEscapeKeyDown={(e) => e.stopPropagation()}
            onCloseAutoFocus={(e) => {
              if (!renamingRef.current) return
              e.preventDefault() // the trigger is gone: focus the Name field instead
              nameInputRef.current?.focus()
            }}
          >
            <MenuItem icon={<FilePlus {...ICON} />} label="New project…" onSelect={onNewClick} />
            <MenuItem icon={<FolderOpen {...ICON} />} label="Open project…" shortcut="openProject" onSelect={onOpenClick} />
            <MenuItem icon={<Download {...ICON} />} label="Download project" shortcut="downloadProject" onSelect={() => downloadProject(useEditor.getState().project)} />
            <DropdownMenu.Separator className="menu-separator" />
            <MenuItem icon={<PencilLine {...ICON} />} label="Rename" onSelect={startRename} />
            <MenuItem icon={<FileOutput {...ICON} />} label="Export SVG" shortcut="exportSvg" onSelect={() => downloadExportSvg(useEditor.getState().project)} />
            <DropdownMenu.Separator className="menu-separator" />
            <MenuItem icon={<Keyboard {...ICON} />} label="Keyboard shortcuts" shortcut="shortcuts" onSelect={() => useLayout.getState().setShortcutsOpen(true)} />
            {import.meta.env.DEV && (
              <>
                <DropdownMenu.Separator className="menu-separator" />
                <DropdownMenu.Sub>
                  <DropdownMenu.SubTrigger className="menu-item">
                    <span className="menu-item-label">Load sample (dev)</span>
                    <ChevronRight {...ICON} />
                  </DropdownMenu.SubTrigger>
                  <DropdownMenu.Portal>
                    <DropdownMenu.SubContent className="menu" sideOffset={4} onEscapeKeyDown={(e) => e.stopPropagation()}>
                      {SAMPLES.map(([key, label]) => (
                        <DropdownMenu.Item key={key} className="menu-item" onSelect={() => useEditor.getState().replaceProject(structuredClone(fixtures[key]))}>
                          <span className="menu-item-label">{label}</span>
                        </DropdownMenu.Item>
                      ))}
                    </DropdownMenu.SubContent>
                  </DropdownMenu.Portal>
                </DropdownMenu.Sub>
              </>
            )}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      <input ref={fileInputRef} type="file" accept=".json,application/json" className="visually-hidden" aria-label="Open project file" onChange={onFileChange} />
      <Dialog.Root open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog-content" aria-describedby="project-menu-confirm-description" onEscapeKeyDown={(e) => e.stopPropagation()}>
            <Dialog.Title>{pending === 'new' ? 'Start a new project?' : 'Open a project?'}</Dialog.Title>
            <Dialog.Description id="project-menu-confirm-description">This replaces the current project. Download it first if you want to keep it.</Dialog.Description>
            <div className="button-row">
              <button type="button" onClick={onConfirm}>
                {pending === 'new' ? 'Start new project' : 'Choose file…'}
              </button>
              <Dialog.Close asChild>
                <button type="button">Cancel</button>
              </Dialog.Close>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  )
}
