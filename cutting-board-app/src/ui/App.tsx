import type { JSX } from 'react'
import { Canvas } from '@/render/Canvas'
import { Inspector } from './Inspector/Inspector.tsx'
import { Toolbar } from './Toolbar.tsx'
import { ToolOptions } from './ToolOptions.tsx'

function App(): JSX.Element {
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
