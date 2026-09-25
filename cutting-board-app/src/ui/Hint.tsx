// Shell spec §12.3: a Radix Tooltip showing a label, keycaps, an optional
// toggle state, and a hint line (or, for a disabled control, the reason —
// the trigger is then wrapped in a span, since a disabled button gets no
// pointer events). Radix ignores touch, so a touch press held for 500 ms
// opens the tooltip itself, suppresses that press's click, and closes on
// the next pointerdown anywhere.

import * as Tooltip from '@radix-ui/react-tooltip'
import type { JSX, MouseEvent, PointerEvent, ReactElement } from 'react'
import { Fragment, useEffect, useRef, useState } from 'react'
import type { Shortcut, ShortcutId } from '@/editor/shortcuts'
import { SHORTCUTS } from '@/editor/shortcuts'
import { ChordKeys } from './Keycap.tsx'

const LONG_PRESS_MS = 500

export interface HintProps {
  children: ReactElement
  shortcut?: ShortcutId
  label?: string
  keys?: readonly string[]
  hint?: string
  state?: 'on' | 'off'
  disabledReason?: string | undefined // undefined: enabled (callers pass `cond ? reason : undefined`)
  side?: 'top' | 'right' | 'bottom' | 'left'
}

export function Hint({ children, shortcut, label, keys, hint, state, disabledReason, side = 'top' }: HintProps): JSX.Element {
  const entry: Shortcut | undefined = shortcut === undefined ? undefined : SHORTCUTS[shortcut]
  const text = label ?? entry?.label ?? ''
  const chords = keys ?? entry?.keys ?? []
  const line = disabledReason ?? hint ?? entry?.hint
  const [open, setOpen] = useState(false)
  const [touchOpen, setTouchOpen] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  const longPressed = useRef(false)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  useEffect(() => {
    if (!touchOpen) return
    const close = (): void => {
      setTouchOpen(false)
      setOpen(false)
    }
    document.addEventListener('pointerdown', close, { capture: true, once: true })
    return () => document.removeEventListener('pointerdown', close, { capture: true })
  }, [touchOpen])

  const onPointerDown = (e: PointerEvent): void => {
    longPressed.current = false
    if (e.pointerType !== 'touch') return
    timer.current = window.setTimeout(() => {
      longPressed.current = true
      setOpen(true)
      setTouchOpen(true)
    }, LONG_PRESS_MS)
  }
  const endPress = (): void => window.clearTimeout(timer.current)
  // Capture phase: runs before the button's own onClick and before Radix closes the tooltip on click.
  const onClickCapture = (e: MouseEvent): void => {
    if (!longPressed.current) return
    longPressed.current = false
    e.preventDefault()
    e.stopPropagation()
  }

  return (
    <Tooltip.Root open={open} onOpenChange={(o) => !touchOpen && setOpen(o)}>
      <Tooltip.Trigger asChild className="hint-trigger" onPointerDown={onPointerDown} onPointerUp={endPress} onPointerCancel={endPress} onPointerLeave={endPress} onClickCapture={onClickCapture}>
        {disabledReason === undefined ? children : <span className="hint-disabled">{children}</span>}
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className="hint" side={side} sideOffset={6} collisionPadding={8}>
          <div className="hint-row">
            <span className="hint-label">{text}</span>
            {state !== undefined && <span className={state === 'on' ? 'hint-state hint-on' : 'hint-state'}>{state === 'on' ? 'On' : 'Off'}</span>}
            {chords.length > 0 && (
              <span className="hint-keys">
                {chords.map((c, i) => (
                  <Fragment key={c}>
                    {i > 0 && <span className="hint-or">or</span>}
                    <ChordKeys chord={c} />
                  </Fragment>
                ))}
              </span>
            )}
          </div>
          {line !== undefined && <div className="hint-line">{line}</div>}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  )
}
