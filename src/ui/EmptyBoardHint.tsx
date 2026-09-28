// Shell SPEC §9.5: on a Board with nothing on it (root context, no root
// objects, nothing being drawn), the Board itself says how to start. The
// same condition gives the Band tool button its inset accent outline
// (ToolButtons), so it is one exported predicate. Placed over the Board's
// projected rectangle: the canvas svg fills the canvas host from its top-left,
// so a world point maps to (world − camera) × zoom there. Never takes input.

import type { JSX } from 'react'
import type { EditorState } from '@/editor/store'
import { useEditor } from '@/editor/store'
import { Keycap } from './Keycap.tsx'

export function emptyBoardHintShown(s: EditorState): boolean {
  return s.editContext.length === 0 && s.project.rootChildren.length === 0 && s.drawing === null
}

export function EmptyBoardHint(): JSX.Element | null {
  const shown = useEditor(emptyBoardHintShown)
  const board = useEditor((s) => s.project.board)
  const camera = useEditor((s) => s.camera)
  if (!shown) return null
  return (
    <div
      className="empty-board-hint"
      style={{ left: -camera.x * camera.zoom, top: -camera.y * camera.zoom, width: board.widthMm * camera.zoom, height: board.heightMm * camera.zoom }}
    >
      <p className="empty-board-title">Draw your first band</p>
      <p>
        Press <Keycap label="B" />, then tap to place points. Double-tap to finish.
      </p>
    </div>
  )
}
