import type { JSX } from 'react'
import { useEffect } from 'react'
import { installKeyboardDispatcher } from '@/editor/keyboard'
import { Canvas } from '@/render/Canvas'
import { Inspector } from './Inspector/Inspector.tsx'
import { Toolbar } from './Toolbar.tsx'
import { ToolOptions } from './ToolOptions.tsx'

function App(): JSX.Element {
  useEffect(() => installKeyboardDispatcher(), [])

  return (
    <div className="app">
      <div className="app-body">
        <Toolbar />
        <main className="canvas-host">
          <Canvas />
          <ToolOptions />
        </main>
        <Inspector />
      </div>
    </div>
  )
}

export default App
