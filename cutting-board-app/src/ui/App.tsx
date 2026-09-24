import * as Tooltip from '@radix-ui/react-tooltip'
import type { JSX } from 'react'
import { useEffect, useState } from 'react'
import { installKeyboardDispatcher } from '@/editor/keyboard'
import { useEditor } from '@/editor/store'
import { Canvas } from '@/render/Canvas'
import { createAutosave, loadAtStartup, PROJECT_KEY } from '@/storage/local'
import { Breadcrumb } from './Breadcrumb.tsx'
import { Inspector } from './Inspector/Inspector.tsx'
import { ProjectMenu } from './ProjectMenu.tsx'
import { RecoveryBanner } from './RecoveryBanner.tsx'
import { StatusBar } from './StatusBar.tsx'
import { Toolbar } from './Toolbar.tsx'
import { ToolOptions } from './ToolOptions.tsx'

/** SPEC §9: startup load, debounced autosave on every project change, flush on hide, suspend on another tab's write. */
function usePersistence(): { recoveredText: string | null; dismissRecovery: () => void } {
  const [recoveredText, setRecoveredText] = useState<string | null>(null)

  useEffect(() => {
    const startup = loadAtStartup(window.localStorage)
    if (startup.kind === 'project') useEditor.getState().replaceProject(startup.project)
    else if (startup.kind === 'recovered') setRecoveredText(startup.text)

    const autosave = createAutosave(
      window.localStorage,
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

function App(): JSX.Element {
  useEffect(() => installKeyboardDispatcher(), [])
  const { recoveredText, dismissRecovery } = usePersistence()

  return (
    <Tooltip.Provider delayDuration={400}>
      <div className="app">
        {recoveredText !== null && <RecoveryBanner text={recoveredText} onDiscard={dismissRecovery} />}
        <div className="app-top-bar">
          <ProjectMenu />
          <StatusBar />
        </div>
        <div className="app-body">
          <Toolbar />
          <main className="canvas-host">
            <Canvas />
            <ToolOptions />
            <Breadcrumb />
          </main>
          <Inspector />
        </div>
      </div>
    </Tooltip.Provider>
  )
}

export default App
