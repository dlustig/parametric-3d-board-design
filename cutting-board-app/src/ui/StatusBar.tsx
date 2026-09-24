// SPEC §9: the autosave status text, and a Download button when the status
// is 'unsaved' (save failure) or 'other-tab' (suspended: another tab owns
// the key now). Review ruling (Task 16 fix round 1): this is also the one
// and only place the store's `message` (last command failure / notice) is
// rendered — always visible at the App level, instead of leaking into
// per-tool or per-menu regions that may not be on screen when it's set.

import type { JSX } from 'react'
import type { SaveStatus } from '@/editor/store'
import { useEditor } from '@/editor/store'
import { downloadProject } from './ProjectMenu.tsx'

const STATUS_TEXT: Record<SaveStatus, string> = {
  saved: 'Saved',
  saving: 'Saving…',
  unsaved: 'Not saved in this browser — download your project',
  'other-tab': 'Project changed in another tab',
}

export function StatusBar(): JSX.Element {
  const status = useEditor((s) => s.saveStatus)
  const project = useEditor((s) => s.project)
  const message = useEditor((s) => s.message)
  const showDownload = status === 'unsaved' || status === 'other-tab'

  return (
    <div className="status-bar" role="status">
      <span>{STATUS_TEXT[status]}</span>
      {showDownload && (
        <button type="button" onClick={() => downloadProject(project)}>
          Download
        </button>
      )}
      {message !== null && <span className="status-bar-message">{message}</span>}
    </div>
  )
}
