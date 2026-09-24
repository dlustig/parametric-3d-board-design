import type { JSX } from 'react'
import { Canvas } from '@/render/Canvas'
import { Toolbar } from './Toolbar.tsx'

function App(): JSX.Element {
  return (
    <div className="app">
      <Toolbar />
      <main className="canvas-host">
        <Canvas />
      </main>
    </div>
  )
}

export default App
