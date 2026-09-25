// Shell §8: the top bar. From left to right:
// - the sidebar toggle and the project menu;
// - the save status, with an inline Download when unsaved or changed in
//   another tab;
// - the store's `message`, truncated with the full text in its title. This
//   is the only place `message` renders;
// - Undo and Redo, disabled with empty history (their Hint gives the reason);
// - Theme, Export SVG, and the inspector toggle.
// It replaces V1's ProjectMenu button row and StatusBar.

import { Moon, PanelLeft, PanelRight, Redo2, Sun, SunMoon, Undo2 } from 'lucide-react'
import type { JSX, RefObject } from 'react'
import { useStore } from 'zustand'
import type { ThemePref } from '@/editor/layout'
import { nextTheme, useLayout } from '@/editor/layout'
import type { SaveStatus } from '@/editor/store'
import { useEditor } from '@/editor/store'
import { downloadExportSvg, downloadProject } from '@/export/download'
import { Hint } from './Hint.tsx'
import { ProjectMenu } from './ProjectMenu.tsx'

const ICON = { size: 18, strokeWidth: 1.6 } as const

const STATUS_TEXT: Record<SaveStatus, string> = {
  saved: 'Saved',
  unsaved: 'Not saved in this browser',
  'other-tab': 'Project changed in another tab',
}

const THEME_NAME: Record<ThemePref, string> = { dark: 'Dark', light: 'Light', system: 'System' }
const THEME_ICON: Record<ThemePref, JSX.Element> = { dark: <Moon {...ICON} />, light: <Sun {...ICON} />, system: <SunMoon {...ICON} /> }

export function TopBar({ openProjectRef }: { openProjectRef: RefObject<() => void> }): JSX.Element {
  const status = useEditor((s) => s.saveStatus)
  const message = useEditor((s) => s.message)
  const canUndo = useStore(useEditor.temporal, (t) => t.pastStates.length > 0)
  const canRedo = useStore(useEditor.temporal, (t) => t.futureStates.length > 0)
  const theme = useLayout((s) => s.theme)
  const leftOpen = useLayout((s) => s.leftOpen)
  const rightOpen = useLayout((s) => s.rightOpen)

  return (
    <header className="top-bar">
      <Hint shortcut="toggleLeft" side="bottom">
        <button type="button" className="icon-button" aria-label="Toggle sidebar" aria-pressed={leftOpen} onClick={() => useLayout.getState().uiActions?.toggleLeft()}>
          <PanelLeft {...ICON} />
        </button>
      </Hint>
      <ProjectMenu openProjectRef={openProjectRef} />
      <div className="top-bar-status" role="status">
        <span className="save-status" data-status={status}>
          <span className="save-dot" aria-hidden="true" />
          {STATUS_TEXT[status]}
        </span>
        {status !== 'saved' && (
          <button type="button" className="text-button" onClick={() => downloadProject(useEditor.getState().project)}>
            Download
          </button>
        )}
        {message !== null && (
          <span className="top-bar-notice" title={message}>
            {message}
          </span>
        )}
      </div>
      <span className="top-bar-spacer" />
      <Hint shortcut="undo" side="bottom" disabledReason={canUndo ? undefined : 'Nothing to undo'}>
        <button type="button" className="icon-button" aria-label="Undo" disabled={!canUndo} onClick={() => useEditor.getState().undo()}>
          <Undo2 {...ICON} />
        </button>
      </Hint>
      <Hint shortcut="redo" side="bottom" disabledReason={canRedo ? undefined : 'Nothing to redo'}>
        <button type="button" className="icon-button" aria-label="Redo" disabled={!canRedo} onClick={() => useEditor.getState().redo()}>
          <Redo2 {...ICON} />
        </button>
      </Hint>
      <span className="top-bar-divider" aria-hidden="true" />
      <Hint label={`Theme: ${THEME_NAME[theme]} · Click for ${THEME_NAME[nextTheme(theme)]}`} side="bottom">
        <button type="button" className="icon-button" aria-label="Theme" onClick={() => useLayout.getState().setTheme(nextTheme(theme))}>
          {THEME_ICON[theme]}
        </button>
      </Hint>
      <Hint shortcut="exportSvg" side="bottom">
        <button type="button" className="primary-button" onClick={() => downloadExportSvg(useEditor.getState().project)}>
          Export SVG
        </button>
      </Hint>
      <Hint shortcut="toggleRight" side="bottom">
        <button type="button" className="icon-button" aria-label="Toggle inspector" aria-pressed={rightOpen} onClick={() => useLayout.getState().uiActions?.toggleRight()}>
          <PanelRight {...ICON} />
        </button>
      </Hint>
    </header>
  )
}
