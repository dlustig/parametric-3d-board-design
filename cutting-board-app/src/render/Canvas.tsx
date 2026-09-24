// SPEC §7.2–§7.3, §7.8: the canvas. Wrapper <div> (touch-action: none) →
// <svg viewBox> at the wrapper's client aspect → scene → board mat → proxies →
// selection overlay; Moveable drives drag/rotate on the selected proxies and
// Selecto the marquee. Input ownership follows the SPEC §7.2 table.

import type { JSX } from 'react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import Moveable from 'react-moveable'
import type { OnDragEnd, OnRotateEnd } from 'react-moveable'
import Selecto from 'react-selecto'
import type { OnDragStart as OnSelectoDragStart, OnSelectEnd } from 'react-selecto'
import type { Box } from '@/geometry/bounds'
import { unionBoxes } from '@/geometry/bounds'
import { EDITOR_CLIP_EXTEND_PX, MAX_CLIP_EXTEND_MM } from '@/geometry/tolerance'
import { fitBoard, viewBoxFor, worldToScreen } from '@/editor/camera'
import { useCanvasGestures } from '@/editor/input'
import { useEditor } from '@/editor/store'
import type { Gesture } from '@/editor/tools/select'
import { clickSelect, endGesture, selectableBounds, startRotate, startTranslate } from '@/editor/tools/select'
import { Proxies } from './Proxies.tsx'
import { SceneSvg } from './SceneSvg.tsx'
import { SelectionOverlay } from './overlays/Selection.tsx'

type XY = { x: number; y: number }

const proxySelector = (id: string): string => `[data-object-id="${id}"]`

function isTextInput(t: EventTarget | null): boolean {
  return t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))
}

function clientOf(e: { clientX: number; clientY: number }): XY {
  return { x: e.clientX, y: e.clientY }
}

export function Canvas(): JSX.Element {
  const project = useEditor((s) => s.project)
  const preview = useEditor((s) => s.preview)
  const camera = useEditor((s) => s.camera)
  const selection = useEditor((s) => s.selection)
  const tool = useEditor((s) => s.tool)
  const editContext = useEditor((s) => s.editContext)

  const wrapperRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const moveableRef = useRef<Moveable>(null)
  const gestureRef = useRef<Gesture | null>(null)
  const spaceHeld = useRef(false)
  const [wrapper, setWrapper] = useState<HTMLDivElement | null>(null)
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  const [spaceDown, setSpaceDown] = useState(false)
  const [multiTouch, setMultiTouch] = useState(false)
  const [rotating, setRotating] = useState(false)

  useCanvasGestures(wrapperRef, svgRef, spaceHeld)

  /** Second pointer, Space, or pointercancel: stop Moveable, drop the gesture preview. */
  const abortGesture = (): void => {
    moveableRef.current?.stopDrag()
    if (gestureRef.current !== null) {
      gestureRef.current = null
      setRotating(false)
      useEditor.getState().cancelPreview()
    }
  }
  const abortRef = useRef(abortGesture)
  abortRef.current = abortGesture

  // Viewport size → viewBox (ResizeObserver); fit the Board on mount.
  useLayoutEffect(() => {
    const el = wrapperRef.current!
    const measure = (): void => setSize({ w: el.clientWidth, h: el.clientHeight })
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    measure()
    setWrapper(el)
    const { project: p, setCamera } = useEditor.getState()
    setCamera(fitBoard(p.board, { w: el.clientWidth, h: el.clientHeight }))
    return () => ro.disconnect()
  }, [])

  // Space held: pan instead of drag (SPEC §7.2).
  useEffect(() => {
    const down = (e: KeyboardEvent): void => {
      if (e.code !== 'Space' || isTextInput(e.target)) return
      e.preventDefault()
      if (spaceHeld.current) return
      spaceHeld.current = true
      setSpaceDown(true)
      abortRef.current()
    }
    const up = (e: KeyboardEvent): void => {
      if (e.code !== 'Space') return
      spaceHeld.current = false
      setSpaceDown(false)
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  // Second finger: abort Moveable and unmount Selecto (it has no mid-drag abort) until all fingers lift.
  useEffect(() => {
    const el = wrapperRef.current!
    const start = (e: TouchEvent): void => {
      if (e.touches.length < 2) return
      abortRef.current()
      setMultiTouch(true)
    }
    const end = (e: TouchEvent): void => {
      if (e.touches.length === 0) setMultiTouch(false)
    }
    const cancel = (): void => abortRef.current()
    el.addEventListener('touchstart', start, { passive: true })
    el.addEventListener('pointercancel', cancel)
    window.addEventListener('touchend', end)
    window.addEventListener('touchcancel', end)
    return () => {
      el.removeEventListener('touchstart', start)
      el.removeEventListener('pointercancel', cancel)
      window.removeEventListener('touchend', end)
      window.removeEventListener('touchcancel', end)
    }
  }, [])

  const shown = preview?.next ?? project
  // During a rotate the proxies stay at the gesture-start rect (SPEC §7.3).
  const shownBounds = selectableBounds(shown, editContext)
  const bounds = rotating ? selectableBounds(project, editContext) : shownBounds
  const boundsById = new Map(bounds.map((b) => [b.id, b.box]))
  const boundsRef = useRef(boundsById)
  boundsRef.current = boundsById
  const selectedBoxes = shownBounds.filter((b) => selection.includes(b.id)).map((b) => b.box)

  // Moveable does not observe attribute changes on SVG targets: re-read the rect after every render.
  useLayoutEffect(() => {
    moveableRef.current?.updateRect()
  })

  const svg = (): SVGSVGElement => svgRef.current!

  const onDragStart = (e: { clientX: number; clientY: number }): void => {
    gestureRef.current = startTranslate(svg(), clientOf(e))
  }
  const onMove = (e: { clientX: number; clientY: number }): void => {
    gestureRef.current?.move(clientOf(e))
  }
  const onEnd = (e: OnDragEnd | OnRotateEnd): void => {
    setRotating(false)
    if (gestureRef.current === null) return
    gestureRef.current = null
    endGesture(e.isDrag, e.inputEvent as Event | undefined)
  }
  const onRotateStart = (e: { clientX: number; clientY: number }): void => {
    const box = unionBoxes(selectableBounds(project, editContext).filter((b) => selection.includes(b.id)).map((b) => b.box))
    if (box === null) return
    setRotating(true)
    gestureRef.current = startRotate(svg(), clientOf(e), { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 })
  }

  const getElementRect = (el: HTMLElement | SVGElement): { pos1: number[]; pos2: number[]; pos3: number[]; pos4: number[] } => {
    const box: Box | undefined = boundsRef.current.get(el.getAttribute('data-object-id') ?? '')
    if (box === undefined) {
      const r = el.getBoundingClientRect()
      return { pos1: [r.left, r.top], pos2: [r.right, r.top], pos3: [r.left, r.bottom], pos4: [r.right, r.bottom] }
    }
    const tl = worldToScreen(svg(), { x: box.minX, y: box.minY })
    const br = worldToScreen(svg(), { x: box.maxX, y: box.maxY })
    return { pos1: [tl.x, tl.y], pos2: [br.x, tl.y], pos3: [tl.x, br.y], pos4: [br.x, br.y] }
  }

  const onSelectoDragStart = (e: OnSelectoDragStart): void => {
    const target = e.inputEvent.target as Element
    const id = target.getAttribute('data-object-id')
    const onSelected = id !== null && useEditor.getState().selection.includes(id)
    if (moveableRef.current?.isMoveableElement(target) || (onSelected && !e.inputEvent.shiftKey)) e.stop()
  }
  const onSelectEnd = (e: OnSelectEnd): void => {
    const s = useEditor.getState()
    const toggle = e.inputEvent.shiftKey === true || s.addToSelection
    if (e.isClick) {
      clickSelect(svg(), { x: e.rect.left, y: e.rect.top }, toggle)
      return
    }
    const ids = e.selected.map((el) => el.getAttribute('data-object-id')!).filter((id) => id !== null)
    s.select(toggle ? [...s.selection.filter((id) => !ids.includes(id)), ...ids.filter((id) => !s.selection.includes(id))] : ids)
  }

  const clipExtendMm = Math.min(EDITOR_CLIP_EXTEND_PX / camera.zoom, MAX_CLIP_EXTEND_MM)
  const view = size ?? { w: 1, h: 1 }
  const { widthMm: bw, heightMm: bh, backgroundMaterialId } = project.board
  const boardFill = project.materials.find((m) => m.id === backgroundMaterialId)?.color ?? '#ffffff'
  const vx = camera.x
  const vy = camera.y
  const vw = view.w / camera.zoom
  const vh = view.h / camera.zoom
  const matD = `M ${vx - vw} ${vy - vh} H ${vx + 2 * vw} V ${vy + 2 * vh} H ${vx - vw} Z M 0 0 H ${bw} V ${bh} H 0 Z`
  const targets = selection.map(proxySelector)
  const selecting = tool === 'select'

  return (
    <div className="canvas" ref={wrapperRef}>
      <svg ref={svgRef} className="canvas-svg" viewBox={viewBoxFor(camera, view)} width={view.w} height={view.h}>
        <rect className="board" width={bw} height={bh} fill={boardFill} />
        <SceneSvg project={shown} clipExtendMm={clipExtendMm} />
        <path className="board-mat" d={matD} fillRule="evenodd" pointerEvents="none" />
        <Proxies bounds={bounds} selection={selection} />
        <SelectionOverlay boxes={selectedBoxes} zoom={camera.zoom} />
      </svg>
      {selecting && wrapper !== null && selection.length > 0 && (
        <Moveable
          ref={moveableRef}
          target={targets.length === 1 ? targets[0]! : targets}
          container={wrapper}
          flushSync={flushSync}
          draggable={!spaceDown}
          rotatable
          resizable={false}
          scalable={false}
          snappable={false}
          origin={false}
          onDragStart={onDragStart}
          onDrag={onMove}
          onDragEnd={onEnd}
          onDragGroupStart={onDragStart}
          onDragGroup={onMove}
          onDragGroupEnd={onEnd}
          onRotateStart={onRotateStart}
          onRotate={onMove}
          onRotateEnd={onEnd}
          onRotateGroupStart={onRotateStart}
          onRotateGroup={onMove}
          onRotateGroupEnd={onEnd}
        />
      )}
      {selecting && wrapper !== null && !multiTouch && (
        <Selecto
          container={wrapper}
          dragContainer={wrapper}
          selectableTargets={['[data-object-id]']}
          selectByClick
          selectFromInside
          hitRate={0}
          toggleContinueSelect="shift"
          getElementRect={getElementRect}
          dragCondition={() => !spaceHeld.current}
          onDragStart={onSelectoDragStart}
          onSelectEnd={onSelectEnd}
        />
      )}
    </div>
  )
}
