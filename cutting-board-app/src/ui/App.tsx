// Shell spec §4: the app grid.
// - Rows: top bar, optional recovery banner, body.
// - Body: the icon column, then a react-resizable-panels Group laid out as
//   [sidebar | canvas | inspector].
// - Narrow viewports (< 1024 px): the side panes leave the Group and become
//   overlays. Only one overlay is open at a time, and both start closed.
//   The canvas Panel stays at the same child position, so the Canvas never
//   remounts (its mount re-fits the camera).
// - App registers the pane and project `uiActions` in the layout store, and
//   mirrors leftOpen/rightOpen from the panel resize callbacks.

import * as Tooltip from '@radix-ui/react-tooltip'
import type { JSX } from 'react'
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { LayoutStorage, PanelImperativeHandle } from 'react-resizable-panels'
import { Group, Panel, Separator, useDefaultLayout } from 'react-resizable-panels'
import { installKeyboardDispatcher } from '@/editor/keyboard'
import { useLayout } from '@/editor/layout'
import { useEditor } from '@/editor/store'
import { Canvas } from '@/render/Canvas'
import { createAutosave, loadAtStartup, openStorage, PROJECT_KEY } from '@/storage/local'
import { ActionsBar } from './ActionsBar.tsx'
import { Breadcrumb } from './Breadcrumb.tsx'
import { CanvasControls } from './CanvasControls.tsx'
import { DrawingBar } from './DrawingBar.tsx'
import { EmptyBoardHint } from './EmptyBoardHint.tsx'
import { IconColumn } from './IconColumn.tsx'
import { Inspector } from './Inspector/Inspector.tsx'
import { LeftPane } from './LeftPane.tsx'
import { RecoveryBanner } from './RecoveryBanner.tsx'
import { ShortcutsDialog } from './ShortcutsDialog.tsx'
import { useThemeSync } from './theme.ts'
import { ToolBar } from './ToolBar.tsx'
import { TopBar } from './TopBar.tsx'

/** SPEC §9: startup load, debounced autosave on every project change, flush on hide, suspend on another tab's write. */
function usePersistence(): { recoveredText: string | null; dismissRecovery: () => void } {
  const [recoveredText, setRecoveredText] = useState<string | null>(null)

  useEffect(() => {
    const storage = openStorage(() => window.localStorage)
    const startup = storage === null ? null : loadAtStartup(storage)
    if (startup?.kind === 'project') useEditor.getState().replaceProject(startup.project)
    else if (startup?.kind === 'recovered') setRecoveredText(startup.text)

    // No usable storage, or a corrupt document it had no room to move aside:
    // work continues unsaved (the top bar offers Download), never over it.
    if (storage === null || (startup?.kind === 'recovered' && !startup.moved)) {
      useEditor.setState({ saveStatus: 'unsaved' })
      return
    }

    const autosave = createAutosave(
      storage,
      () => useEditor.getState().project,
      (status) => useEditor.setState({ saveStatus: status }),
    )

    // Registered here (not in storage/local.ts) so the module stays DOM-free
    // and testable with fake timers.
    const unsubscribe = useEditor.subscribe((state, prev) => {
      if (state.project !== prev.project) autosave.schedule()
    })
    const onPageHide = (): void => autosave.flush()
    const onVisibilityChange = (): void => {
      if (document.visibilityState === 'hidden') autosave.flush()
    }
    const onStorage = (e: StorageEvent): void => {
      if (e.key === PROJECT_KEY) autosave.suspend()
    }
    window.addEventListener('pagehide', onPageHide)
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('storage', onStorage)

    return () => {
      unsubscribe()
      window.removeEventListener('pagehide', onPageHide)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('storage', onStorage)
      autosave.dispose()
    }
  }, [])

  return { recoveredText, dismissRecovery: () => setRecoveredText(null) }
}

/**
 * Shell §4 persistence goes through a storage object that never throws. The
 * library reads without a guard (docs/decisions/2026-09-25-shell-spike.md):
 * a throwing `getItem`, text that isn't JSON, or JSON `null` (it calls
 * `Object.values` on the parsed value) crashes the Group's render. So a
 * blocked `localStorage` (Review Focus 2), unparseable text or a parsed
 * `null` (Review Focus 1) reads as "nothing stored", and the defaults apply.
 * Other shapes (a number, an array, non-numeric sizes, other panel ids,
 * out-of-range sizes) are left to the library's own fallback and clamping.
 * A failed write just doesn't persist.
 */
const layoutStorage: LayoutStorage = {
  getItem(key) {
    try {
      const text = window.localStorage.getItem(key)
      return text !== null && JSON.parse(text) !== null ? text : null
    } catch {
      return null
    }
  },
  setItem(key, value) {
    try {
      window.localStorage.setItem(key, value)
    } catch {
      // Storage blocked or full: pane sizes don't persist this session.
    }
  },
}

const narrowQuery = window.matchMedia('(max-width: 1023.98px)')

function subscribeNarrow(onChange: () => void): () => void {
  narrowQuery.addEventListener('change', onChange)
  return () => narrowQuery.removeEventListener('change', onChange)
}

function App(): JSX.Element {
  useEffect(() => installKeyboardDispatcher(), [])
  useThemeSync()
  const { recoveredText, dismissRecovery } = usePersistence()
  const narrow = useSyncExternalStore(subscribeNarrow, () => narrowQuery.matches)
  const leftOpen = useLayout((s) => s.leftOpen)
  const rightOpen = useLayout((s) => s.rightOpen)
  const toolsDocked = useLayout((s) => s.toolsDocked)
  const leftRef = useRef<PanelImperativeHandle | null>(null)
  const rightRef = useRef<PanelImperativeHandle | null>(null)
  const openProjectRef = useRef<() => void>(() => {})
  /** The last desktop pane widths this session, in px: the narrow overlays open at these. A ref, so a separator drag doesn't re-render the shell every frame. */
  const widths = useRef({ left: 240, right: 280 })
  /**
   * True only while a toggle's collapse()/expand() runs: a button or shortcut
   * is a user action, so the layout change it causes (reported synchronously
   * from inside the call) is saved like a drag. Cleared as soon as the call
   * returns, so a call that changes nothing can't mark a later window-resize
   * recomputation as the user's.
   */
  const toggled = useRef(false)
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({ id: 'cbpd-shell', onlySaveAfterUserInteractions: true, storage: layoutStorage })

  // Shell §4: entering the narrow layout (or starting in it) closes both overlays.
  useLayoutEffect(() => {
    if (!narrow) return
    const { setPaneOpen } = useLayout.getState()
    setPaneOpen('left', false)
    setPaneOpen('right', false)
  }, [narrow])

  useEffect(() => {
    const toggle = (side: 'left' | 'right'): void => {
      const { leftOpen: l, rightOpen: r, setPaneOpen } = useLayout.getState()
      if (narrow) {
        const opening = !(side === 'left' ? l : r)
        setPaneOpen(side, opening)
        if (opening) setPaneOpen(side === 'left' ? 'right' : 'left', false)
        return
      }
      const panel = (side === 'left' ? leftRef : rightRef).current! // mounted whenever the layout is not narrow
      toggled.current = true
      if (panel.isCollapsed()) panel.expand()
      else panel.collapse()
      toggled.current = false
    }
    useLayout.getState().setUiActions({
      toggleLeft: () => toggle('left'),
      toggleRight: () => toggle('right'),
      openLeft: (tab) => {
        useLayout.getState().setLeftTab(tab)
        if (!useLayout.getState().leftOpen) toggle('left')
      },
      openProject: () => openProjectRef.current(),
    })
    return () => useLayout.getState().setUiActions(null)
  }, [narrow])

  // disableHoverableContent: Hint tooltips are read-only (no content to move the mouse onto), and
  // Radix's default hoverable grace-area polygon can get stuck open — it's cleared by a document
  // pointermove listener attached only after the trigger-leave that creates it, so if the pointer
  // comes to rest (as synthetic input from Playwright/CDP does) with no further move, the previous
  // tooltip never closes and every later trigger stays blocked.
  return (
    <Tooltip.Provider delayDuration={400} skipDelayDuration={300} disableHoverableContent>
      <div className="app">
        <TopBar openProjectRef={openProjectRef} />
        {recoveredText !== null && <RecoveryBanner text={recoveredText} onDiscard={dismissRecovery} />}
        <div className="app-body">
          <IconColumn />
          <Group
            id="cbpd-shell"
            className="shell-group"
            defaultLayout={defaultLayout}
            onLayoutChanged={(layout, meta) => onLayoutChanged(layout, { isUserInteraction: meta.isUserInteraction || toggled.current })}
          >
            {!narrow && (
              <>
                <Panel
                  id="pane-left"
                  className="pane"
                  panelRef={leftRef}
                  collapsible
                  collapsedSize="0px"
                  minSize="200px"
                  maxSize="400px"
                  defaultSize="240px"
                  groupResizeBehavior="preserve-pixel-size"
                  onResize={(size) => {
                    useLayout.getState().setPaneOpen('left', size.asPercentage > 0)
                    if (size.inPixels > 0) widths.current.left = size.inPixels
                  }}
                >
                  {leftOpen && <LeftPane />}
                </Panel>
                <Separator className="pane-separator" />
              </>
            )}
            <Panel id="pane-canvas" className="canvas-pane">
              <main className="canvas-host">
                <Canvas />
                <EmptyBoardHint />
                <ActionsBar />
                <CanvasControls />
                {!toolsDocked && <ToolBar />}
                <DrawingBar />
                <Breadcrumb />
              </main>
            </Panel>
            {!narrow && (
              <>
                <Separator className="pane-separator" />
                <Panel
                  id="pane-right"
                  className="pane"
                  panelRef={rightRef}
                  collapsible
                  collapsedSize="0px"
                  minSize="248px"
                  maxSize="440px"
                  defaultSize="280px"
                  groupResizeBehavior="preserve-pixel-size"
                  onResize={(size) => {
                    useLayout.getState().setPaneOpen('right', size.asPercentage > 0)
                    if (size.inPixels > 0) widths.current.right = size.inPixels
                  }}
                >
                  {rightOpen && <Inspector />}
                </Panel>
              </>
            )}
          </Group>
          {narrow && leftOpen && (
            <div className="pane-overlay pane-overlay-left" style={{ width: widths.current.left }}>
              <LeftPane />
            </div>
          )}
          {narrow && rightOpen && (
            <div className="pane-overlay pane-overlay-right" style={{ width: widths.current.right }}>
              <Inspector />
            </div>
          )}
        </div>
      </div>
      <ShortcutsDialog />
    </Tooltip.Provider>
  )
}

export default App
