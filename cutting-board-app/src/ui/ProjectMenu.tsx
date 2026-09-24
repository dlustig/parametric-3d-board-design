// SPEC §9: New / Open / Download Project. New and Open confirm (Radix
// Dialog) unless the current project is blank; Open reads a `<input
// type="file">` via `File.text()` and `importProject`, leaving project and
// history untouched on failure. Export SVG is a placeholder, wired in
// Task 17.

import * as Dialog from '@radix-ui/react-dialog'
import type { ChangeEvent, JSX } from 'react'
import { useRef, useState } from 'react'
import { importProject } from '@/domain/migrate'
import type { Project } from '@/domain/model'
import { newProject } from '@/domain/project'
import { useEditor } from '@/editor/store'
import { downloadText } from '@/export/download'

/** SPEC §9: the blank starter — no objects (root or definition-owned) — is silently replaceable. */
export function isBlankProject(project: Project): boolean {
  return Object.keys(project.objects).length === 0
}

export function downloadProject(project: Project): void {
  downloadText(`${project.name}.cbpd.json`, JSON.stringify(project, null, 2), 'application/json')
}

type PendingAction = 'new' | 'open' | null

export function ProjectMenu(): JSX.Element {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<PendingAction>(null)
  const message = useEditor((s) => s.message)

  const startNew = (): void => {
    const displayUnits = useEditor.getState().project.displayUnits
    useEditor.getState().replaceProject(newProject(displayUnits))
    useEditor.setState({ message: null }) // clear a stale Open-file error, if any
  }

  const onNewClick = (): void => {
    if (isBlankProject(useEditor.getState().project)) startNew()
    else setPending('new')
  }

  const onOpenClick = (): void => {
    if (isBlankProject(useEditor.getState().project)) fileInputRef.current?.click()
    else setPending('open')
  }

  const onConfirm = (): void => {
    if (pending === 'new') startNew()
    else if (pending === 'open') fileInputRef.current?.click()
    setPending(null)
  }

  const onFileChange = (e: ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow reselecting the same filename after a failure
    if (file === undefined) return
    void file.text().then((text) => {
      const result = importProject(text)
      if (!result.ok) {
        useEditor.setState({ message: result.error.path === '' ? result.error.message : `${result.error.path}: ${result.error.message}` })
        return
      }
      useEditor.getState().replaceProject(result.project)
      useEditor.setState({ message: null })
    })
  }

  const onDownload = (): void => {
    downloadProject(useEditor.getState().project)
  }

  return (
    <div className="project-menu">
      <button type="button" onClick={onNewClick}>
        New Project
      </button>
      <button type="button" onClick={onOpenClick}>
        Open Project
      </button>
      <input ref={fileInputRef} type="file" accept=".json,application/json" className="visually-hidden" aria-label="Open project file" onChange={onFileChange} />
      <button type="button" onClick={onDownload}>
        Download Project
      </button>
      <button type="button" disabled title="Coming in a later release">
        Export SVG
      </button>
      {message !== null && (
        <span className="project-menu-message" role="status">
          {message}
        </span>
      )}
      <Dialog.Root open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog-content" aria-describedby="project-menu-confirm-description">
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
