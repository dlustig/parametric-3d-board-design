// Shell SPEC §9.3 (V1 §7.4): the drawing bar, floating top-centre of the
// canvas in the actions bar's slot (the two never show together: this one is
// for the drawing tools and Crossing, that one for Select). Band: wood chip,
// Width, Length, Angle, Undo point, Cancel, Finish. Polygon: the same without
// Width. Rectangle: the chip and a hint. Length/Angle are the pending segment's
// live snapped values; a typed value places the point on Enter. The drawing
// keys (Enter/Backspace/Ctrl+Z/Esc) are dispatched by `editor/keyboard.ts`, not
// here. Alt keyup is preventDefault'ed (V1 §7.7) — unrelated to that dispatch,
// so it stays a small listener of its own. The store's `message` shows only in
// the top bar; this bar shows tool-specific state.

import { TriangleAlert, X } from 'lucide-react'
import type { JSX, KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useEffect, useRef, useState } from 'react'
import { useScene } from '@/editor/scene'
import { useEditor } from '@/editor/store'
import { scopeControlShown } from '@/editor/tools/crossing'
import { cancelDrawing, finishDrawing, isDrawTool, placeTyped, undoPoint } from '@/editor/tools/draw'
import { Hint } from './Hint.tsx'
import { NumberField } from './Inspector/NumberField.tsx'
import { WoodChip } from './ToolButtons.tsx'

function useAltKeyupGuard(): void {
  useEffect(() => {
    const up = (e: KeyboardEvent): void => {
      if (e.key === 'Alt') e.preventDefault()
    }
    window.addEventListener('keyup', up)
    return () => window.removeEventListener('keyup', up)
  }, [])
}

export function DrawingBar(): JSX.Element | null {
  const tool = useEditor((s) => s.tool)
  const drawing = useEditor((s) => s.drawing)
  const unit = useEditor((s) => s.project.displayUnits)
  const bandWidth = useEditor((s) => s.lastBandWidthMm)
  useAltKeyupGuard()

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

  if (tool === 'crossing') return <CrossingOptions />
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
    <div className="drawing-bar floating-top" role="toolbar" aria-label="Drawing options">
      <WoodChip variant="bar" />
      {!segmenting && <span className="drawing-bar-hint">Drag corner to corner</span>}
      {tool === 'band' && (
        <div className="drawing-bar-fields">
          <NumberField label="Width" value={bandWidth} unit={unit} policy="positive" onPreview={() => undefined} onCommit={(v) => useEditor.setState({ lastBandWidthMm: v })} />
        </div>
      )}
      {segmenting && (
        <>
          <div className="drawing-bar-fields" onKeyDown={onKeyDown}>
            <NumberField label="Length" value={typed.length ?? liveLength} unit={unit} policy="positive" onPreview={() => undefined} onCommit={(v) => setTypedBoth({ ...typedRef.current, length: v })} />
            <NumberField label="Angle" value={typed.angle ?? liveAngle} unit="deg" policy="any" onPreview={() => undefined} onCommit={(v) => setTypedBoth({ ...typedRef.current, angle: v })} />
          </div>
          <button type="button" className="drawing-bar-button" onClick={undoPoint} disabled={points === 0}>
            Undo point
          </button>
          <Hint label="Cancel" keys={['Escape']} side="bottom">
            <button type="button" className="icon-button" aria-label="Cancel" onClick={cancelDrawing} disabled={drawing === null}>
              <X size={18} strokeWidth={1.6} />
            </button>
          </Hint>
          <button type="button" className="drawing-bar-button drawing-bar-primary" onClick={finishDrawing} disabled={points === 0}>
            Finish
          </button>
        </>
      )}
    </div>
  )
}

/** Shell SPEC §9.6 (V1 §7.4): the scope control (only when some pair has a common motif ancestor), the marker legend, and the tapped marker's read-out. */
function CrossingOptions(): JSX.Element {
  const scope = useEditor((s) => s.crossingScope)
  const notice = useEditor((s) => s.crossingNotice)
  const scene = useScene()
  const scoped = scopeControlShown(scene)
  const unresolved = new Set(scene.unresolved.map((u) => u.record.id)).size
  const scopeButton = (value: 'all' | 'occurrence', label: string): JSX.Element => (
    <button type="button" aria-pressed={scope === value} onClick={() => useEditor.setState({ crossingScope: value })}>
      {label}
    </button>
  )
  return (
    <div className="drawing-bar floating-top" role="toolbar" aria-label="Crossing options">
      {scoped && (
        <div className="segmented" role="group" aria-label="Scope">
          {scopeButton('all', 'All instances')}
          {scopeButton('occurrence', 'This occurrence')}
        </div>
      )}
      <ul className="crossing-legend" aria-label="Legend">
        <li>
          <span className="legend-mark legend-eligible" aria-hidden="true" />
          Can swap
        </li>
        <li>
          <span className="legend-mark legend-swapped" aria-hidden="true" />
          Swapped
        </li>
        <li>
          <span className="legend-mark legend-unsupported" aria-hidden="true" />
          Can't swap
        </li>
        {unresolved > 0 && (
          <li className="legend-attn">
            <TriangleAlert size={14} strokeWidth={1.6} aria-hidden="true" />
            {unresolved} unresolved
          </li>
        )}
      </ul>
      <span className="drawing-bar-hint" role="status">
        {notice ?? 'Tap a crossing to swap which band is on top'}
      </span>
    </div>
  )
}
