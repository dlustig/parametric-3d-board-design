import type { JSX } from 'react'
import { Canvas } from '@/render/Canvas'
import { Inspector } from './Inspector/Inspector.tsx'
import { Toolbar } from './Toolbar.tsx'

function App(): JSX.Element {
  return (
    <div className="app">
      <div className="app-body">
        <Toolbar />
        <main className="canvas-host">
          <Canvas />
        </main>
        <Inspector />
      </div>
    </div>
  )
}

export default App
