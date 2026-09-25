import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/ibm-plex-sans/400.css'
import '@fontsource/ibm-plex-sans/500.css'
import '@fontsource/ibm-plex-sans/600.css'
import './index.css'
import { installTestHook } from './editor/testHook.ts'
import App from './ui/App.tsx'

// §2.2: nothing renders weight 500 until later tasks' tooltips (spec §12.3),
// so the browser would otherwise never fetch that face. Load all three
// explicitly so "self-hosted... works offline" holds from first paint.
void Promise.all([400, 500, 600].map((weight) => document.fonts.load(`${weight} 13px "IBM Plex Sans"`)))

installTestHook()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
