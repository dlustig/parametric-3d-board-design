// SPEC §9: shown at startup when `PROJECT_KEY` existed but failed to load —
// its text has already been moved to `RECOVERED_KEY` by `loadAtStartup` so
// autosave can never overwrite or destroy it. Download saves it to a file;
// Discard removes `RECOVERED_KEY` and dismisses the banner.

import type { JSX } from 'react'
import { RECOVERED_KEY } from '@/storage/local'
import { downloadText } from '@/export/download'

interface Props {
  text: string
  onDiscard: () => void
}

export function RecoveryBanner({ text, onDiscard }: Props): JSX.Element {
  const onDownload = (): void => {
    downloadText('recovered.cbpd.json', text, 'application/json')
  }

  const discard = (): void => {
    window.localStorage.removeItem(RECOVERED_KEY)
    onDiscard()
  }

  return (
    <div className="recovery-banner" role="alert">
      <span>A previous project couldn&apos;t be loaded. It hasn&apos;t been lost — download it below, or discard it.</span>
      <button type="button" onClick={onDownload}>
        Download recovered file
      </button>
      <button type="button" onClick={discard}>
        Discard
      </button>
    </div>
  )
}
