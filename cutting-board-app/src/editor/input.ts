// SPEC §7.2 input ownership, the use-gesture rows: plain wheel pans;
// Ctrl/Cmd+wheel, trackpad pinch, Safari gesture* and two-finger pinch zoom
// about the cursor/centroid (two fingers also pan); middle-button, Space+drag
// and Hand-tool drags pan. Bound to the canvas wrapper with
// `eventOptions: { passive: false }` so ctrl-wheel and gesture* can be
// preventDefault'ed (use-gesture does that itself for pinch). No handler here
// preventDefaults pointerdown: Moveable and Selecto rely on the compatibility
// mouse events.

import type { RefObject } from 'react'
import { useGesture } from '@use-gesture/react'
import { placeAt, screenToWorld } from './camera.ts'
import type { Camera } from './store.ts'
import { useEditor } from './store.ts'

type XY = { x: number; y: number }

const MIDDLE_BUTTON = 4 // MouseEvent.buttons bit

function localOf(svg: SVGSVGElement, client: XY): XY {
  const r = svg.getBoundingClientRect()
  return { x: client.x - r.left, y: client.y - r.top }
}

export function useCanvasGestures(ref: RefObject<HTMLDivElement | null>, svgRef: RefObject<SVGSVGElement | null>, spaceHeld: RefObject<boolean>): void {
  useGesture(
    {
      onWheel: ({ event }) => {
        if (event.ctrlKey || event.metaKey) return // pinch owns modified wheel
        event.preventDefault()
        const { camera, setCamera } = useEditor.getState()
        setCamera({ ...camera, x: camera.x + event.deltaX / camera.zoom, y: camera.y + event.deltaY / camera.zoom })
      },
      onPinch: ({ first, origin, movement, memo }) => {
        const svg = svgRef.current
        if (svg === null) return memo
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
          const pan = tool === 'hand' || spaceHeld.current || (buttons & MIDDLE_BUTTON) !== 0
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
      target: ref,
      eventOptions: { passive: false },
      drag: { pointer: { buttons: -1, capture: false } },
      pinch: { modifierKey: ['ctrlKey', 'metaKey'] },
    },
  )
}
