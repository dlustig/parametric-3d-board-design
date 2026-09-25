import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { installTestHook } from './editor/testHook.ts'
import App from './ui/App.tsx'

installTestHook()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
