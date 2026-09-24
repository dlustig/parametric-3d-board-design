// SPEC §7.4: the drawing tools' options bar — the pending segment's Length and
// Angle (live snapped values; typed values place the point on Enter), Finish,
// Undo point, Cancel, and the last command message. Also the drawing keys
// until keyboard dispatch lands: Enter finishes, Backspace / Ctrl+Z removes
// the last point, Esc cancels; Alt keyup is preventDefault'ed (SPEC §7.7).

import type { JSX, KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useEffect, useRef, useState } from 'react'
import { useEditor } from '@/editor/store'
import { cancelDrawing, finishDrawing, isDrawTool, placeTyped, undoPoint } from '@/editor/tools/draw'
import { NumberField } from './Inspector/NumberField.tsx'

function isTextTarget(t: EventTarget | null): boolean {
  return t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))
}

function useDrawingKeys(): void {
  useEffect(() => {
    const down = (e: KeyboardEvent): void => {
      if (isTextTarget(e.target)) return
      if (useEditor.getState().drawing === null) return
      const undoChord = (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'z'
      if (e.key === 'Enter') finishDrawing()
      else if (e.key === 'Backspace' || undoChord) undoPoint()
      else if (e.key === 'Escape') cancelDrawing()
      else return
      e.preventDefault()
    }
    const up = (e: KeyboardEvent): void => {
      if (e.key === 'Alt') e.preventDefault()
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])
}

export function ToolOptions(): JSX.Element | null {
  const tool = useEditor((s) => s.tool)
  const drawing = useEditor((s) => s.drawing)
  const unit = useEditor((s) => s.project.displayUnits)
  const message = useEditor((s) => s.message)
  useDrawingKeys()

  // Typed values: state for display, refs for the synchronous read on Enter
  // (the field's own Enter blurs and commits just before the bar sees the key).
  const [typed, setTyped] = useState<{ length: number | null; angle: number | null }>({ length: null, angle: null })
  const typedRef = useRef(typed)
  const setTypedBoth = (next: { length: number | null; angle: number | null }): void => {
    typedRef.current = next
    setTyped(next)
  }
  const points = drawing?.points.length ?? 0
  // A new segment (tapped, undone, or a new drawing) starts from the live values again.
  useEffect(() => setTypedBoth({ length: null, angle: null }), [points])

  if (!isDrawTool(tool)) return null
  const segmenting = tool !== 'rect'
  const liveLength = drawing?.cursor?.lengthMm ?? 0
  const liveAngle = drawing?.cursor?.angleDeg ?? 0

  const onKeyDown = (e: ReactKeyboardEvent): void => {
    if (e.key !== 'Enter') return
    e.stopPropagation() // Enter in these fields places a point; it does not finish
    const t = typedRef.current
    placeTyped(t.length ?? liveLength, t.angle ?? liveAngle)
    setTypedBoth({ length: null, angle: null })
  }

  return (
    <div className="tool-options" role="toolbar" aria-label="Drawing options">
      {segmenting && (
        <div className="tool-options-fields" onKeyDown={onKeyDown}>
          <NumberField
            label="Length"
            value={typed.length ?? liveLength}
            unit={unit}
            policy="positive"
            onPreview={() => undefined}
            onCommit={(v) => setTypedBoth({ ...typedRef.current, length: v })}
          />
          <NumberField
            label="Angle"
            value={typed.angle ?? liveAngle}
            unit="deg"
            policy="any"
            onPreview={() => undefined}
            onCommit={(v) => setTypedBoth({ ...typedRef.current, angle: v })}
          />
        </div>
      )}
      {segmenting && (
        <>
          <button type="button" onClick={finishDrawing} disabled={points === 0}>
            Finish
          </button>
          <button type="button" onClick={undoPoint} disabled={points === 0}>
            Undo point
          </button>
          <button type="button" onClick={cancelDrawing} disabled={drawing === null}>
            Cancel
          </button>
        </>
      )}
      {!segmenting && <span className="tool-options-hint">Drag corner to corner</span>}
      {message !== null && (
        <span className="tool-options-message" role="status">
          {message}
        </span>
      )}
    </div>
  )
}
