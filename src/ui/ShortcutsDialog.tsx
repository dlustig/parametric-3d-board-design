// Shell spec §10.3: every SHORTCUTS entry, grouped, with the tooltips' keycaps.
// Opened by `?` (keyboard.ts) or the project menu through useLayout.

import * as Dialog from '@radix-ui/react-dialog'
import type { JSX } from 'react'
import { Fragment, useRef } from 'react'
import { useLayout } from '@/editor/layout'
import type { Shortcut, ShortcutGroup } from '@/editor/shortcuts'
import { SHORTCUTS } from '@/editor/shortcuts'
import { ChordKeys } from './Keycap.tsx'

const GROUPS: readonly ShortcutGroup[] = ['Tools', 'Selection', 'Drawing', 'View', 'Project', 'Panels']

export function ShortcutsDialog(): JSX.Element {
  const open = useLayout((s) => s.shortcutsOpen)
  const setOpen = useLayout((s) => s.setShortcutsOpen)
  const entries: Array<[string, Shortcut]> = Object.entries(SHORTCUTS)
  const returnTo = useRef<Element | null>(null)
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className="dialog-content shortcuts-dialog"
          aria-describedby={undefined}
          // Radix's DismissableLayer handles Escape on `document` at capture with
          // preventDefault() but no stopPropagation(); keyboard.ts's global dispatcher
          // listens on `window` at bubble and never checks defaultPrevented, so without
          // this the sheet's own Escape-to-close also runs the app's Escape cascade
          // (clearing the selection, or cancelling an in-progress drawing).
          onEscapeKeyDown={(e) => e.stopPropagation()}
          onOpenAutoFocus={() => {
            returnTo.current = document.activeElement
          }}
          // Opened from the project menu, the element focused at open is a menu
          // item that is gone by now: return focus to the menu's trigger instead
          // of letting it fall to <body>.
          onCloseAutoFocus={(e) => {
            if (returnTo.current?.isConnected === true) return
            e.preventDefault()
            document.querySelector<HTMLElement>('.project-menu [aria-haspopup="menu"]')?.focus()
          }}
        >
          <Dialog.Title className="dialog-title">Keyboard shortcuts</Dialog.Title>
          {GROUPS.map((group) => {
            const rows = entries.filter(([, s]) => s.group === group)
            if (rows.length === 0) return null
            return (
              <section key={group} className="shortcuts-group">
                <h3>{group}</h3>
                <dl>
                  {rows.map(([id, s]) => (
                    <div key={id} className="shortcuts-row">
                      <dt>{s.label}</dt>
                      <dd>
                        {s.keys.map((k, i) => (
                          <Fragment key={k}>
                            {i > 0 && <span className="hint-or">or</span>}
                            <ChordKeys chord={k} />
                          </Fragment>
                        ))}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            )
          })}
          <div className="button-row">
            <Dialog.Close asChild>
              <button type="button">Close</button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
