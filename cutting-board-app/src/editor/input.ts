// SPEC §7.2 input ownership, the use-gesture rows: plain wheel pans;
// Ctrl/Cmd+wheel, trackpad pinch, Safari gesture* and two-finger pinch zoom
// about the cursor/centroid (two fingers also pan); middle-button, Space+drag
// and Hand-tool drags pan. Bound to the canvas wrapper with
// `eventOptions: { passive: false }` so ctrl-wheel and gesture* can be
// preventDefault'ed (use-gesture does that itself for pinch). No handler here
// preventDefaults pointerdown: Moveable and Selecto rely on the compatibility
// mouse events. Also the toolbar's view commands (zoom about centre, Fit).
//
// Wheel and wheel-driven pinch have no native end event: use-gesture emits
// their `last` state from a 140 ms timeout, re-sending the last wheel event
// and the unchanged pinch movement. That emission carries no new input, so
// both handlers ignore it; applying it would pan the last wheel delta twice
// and snap the camera back to the zoom's result over any pan or setCamera
// made in the meantime.

import { useGesture } from '@use-gesture/react'
import { fitBoard, placeAt, screenToWorld, zoomAbout } from './camera.ts'
import type { Camera } from './store.ts'
import { useEditor } from './store.ts'

type XY = { x: number; y: number }

const MIDDLE_BUTTON = 4 // MouseEvent.buttons bit

function localOf(svg: SVGSVGElement, client: XY): XY {
  const r = svg.getBoundingClientRect()
  return { x: client.x - r.left, y: client.y - r.top }
}

/** SPEC §7.2 Fit: Board bounds + 5% margin in the current viewport. */
export function fitView(): void {
  const { project, viewportPx, setCamera } = useEditor.getState()
  setCamera(fitBoard(project.board, viewportPx))
}

/** Zoom about the viewport centre (toolbar − / +). */
export function zoomViewBy(factor: number): void {
  const { camera, viewportPx, setCamera } = useEditor.getState()
  setCamera(zoomAbout(camera, factor, { x: camera.x + viewportPx.w / 2 / camera.zoom, y: camera.y + viewportPx.h / 2 / camera.zoom }))
}

export function useCanvasGestures(wrapper: HTMLDivElement | null, svg: SVGSVGElement | null, spaceDown: boolean): void {
  useGesture(
    {
      onWheel: ({ event, last }) => {
        if (last || event.ctrlKey || event.metaKey) return // pinch owns modified wheel
        event.preventDefault()
        const { camera, setCamera } = useEditor.getState()
        setCamera({ ...camera, x: camera.x + event.deltaX / camera.zoom, y: camera.y + event.deltaY / camera.zoom })
      },
      onPinch: ({ first, last, origin, movement, memo }) => {
        if (svg === null || last) return memo
        const start = (first ? undefined : (memo as { camera: Camera; anchor: XY } | undefined)) ?? {
          camera: useEditor.getState().camera,
          anchor: screenToWorld(svg, { x: origin[0], y: origin[1] }),
        }
        // Keep the world point under the gesture's starting origin under its current origin: zoom about the cursor, pan with two fingers.
        useEditor.getState().setCamera(placeAt(start.anchor, localOf(svg, { x: origin[0], y: origin[1] }), start.camera.zoom * movement[0]))
        return start
      },
      onDrag: ({ first, buttons, touches, movement, memo, cancel }) => {
        if (first) {
          const { tool, camera } = useEditor.getState()
          const pan = tool === 'hand' || spaceDown || (buttons & MIDDLE_BUTTON) !== 0
          if (!pan) {
            cancel()
            return undefined
          }
          return camera
        }
        const start = memo as Camera | undefined
        if (start === undefined || touches > 1) return start // two fingers: pinch owns it
        useEditor.getState().setCamera({ ...start, x: start.x - movement[0] / start.zoom, y: start.y - movement[1] / start.zoom })
        return start
      },
    },
    {
      target: { current: wrapper }, // a null element binds nothing until the wrapper mounts
      eventOptions: { passive: false },
      drag: { pointer: { buttons: -1, capture: false } },
      pinch: { modifierKey: ['ctrlKey', 'metaKey'] },
    },
  )
}
