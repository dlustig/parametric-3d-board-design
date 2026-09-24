// SPEC §7.2–§7.3, §7.8: the canvas. Wrapper <div> (touch-action: none) →
// <svg viewBox> at the wrapper's client aspect → scene → board mat → proxies →
// selection overlay; Moveable drives drag/rotate on the selected proxies and
// Selecto the marquee. Input ownership follows the SPEC §7.2 table.
//
// Every single-pointer press in Select goes through Selecto's dragStart and
// is decided by domain hit-testing (SPEC §7.3), not by which proxy the DOM
// hit: proxies have `pointer-events: none`. A press on an object stops
// Selecto, selects the object if needed, and hands the same press to
// Moveable (`waitToChangeTarget` → `dragStart`, the Selecto+Moveable recipe);
// a press on nothing starts a marquee, even inside a selected object's bounds.

import type { JSX } from 'react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import Moveable from 'react-moveable'
import type { OnDragEnd, OnRotateEnd } from 'react-moveable'
import Selecto from 'react-selecto'
import type { OnDragStart as OnSelectoDragStart, OnSelectEnd } from 'react-selecto'
import { useShallow } from 'zustand/react/shallow'
import { unionBoxes } from '@/geometry/bounds'
import { editorClipExtendMm, screenToWorld, viewBoxFor, worldToScreen } from '@/editor/camera'
import { fitView, useCanvasGestures } from '@/editor/input'
import { contextMatrix, useEditor } from '@/editor/store'
import { drawPointerCancel, drawPointerDown, drawPointerMove, drawPointerUp, isDrawTool } from '@/editor/tools/draw'
import type { Gesture } from '@/editor/tools/select'
import { clickSelect, endGesture, objectAt, selectableBounds, startRotate, startTranslate, toggleSelection } from '@/editor/tools/select'
import { Proxies } from './Proxies.tsx'
import { SceneSvg } from './SceneSvg.tsx'
import { DrawPreview } from './overlays/DrawPreview.tsx'
import { Grid } from './overlays/Grid.tsx'
import { SelectionOverlay } from './overlays/Selection.tsx'
import { SnapGuide } from './overlays/SnapGuide.tsx'

type XY = { x: number; y: number }

const proxySelector = (id: string): string => `[data-object-id="${id}"]`

/** Space on these must keep its own meaning (typing, activating a button). */
function ownsSpace(t: EventTarget | null): boolean {
  return t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(t.tagName))
}

function clientOf(e: { clientX: number; clientY: number }): XY {
  return { x: e.clientX, y: e.clientY }
}

export function Canvas(): JSX.Element {
  const project = useEditor((s) => s.project)
  const preview = useEditor((s) => s.preview)
  const camera = useEditor((s) => s.camera)
  const view = useEditor((s) => s.viewportPx)
  const selection = useEditor((s) => s.selection)
  const tool = useEditor((s) => s.tool)
  const editContext = useEditor((s) => s.editContext)
  const drawing = useEditor((s) => s.drawing)
  const showGrid = useEditor((s) => s.showGrid)
  const gridMm = useEditor((s) => s.gridMm)
  const ctxMatrix = useEditor(useShallow(contextMatrix))

  const [wrapper, setWrapper] = useState<HTMLDivElement | null>(null)
  const [svgEl, setSvgEl] = useState<SVGSVGElement | null>(null)
  const moveableRef = useRef<Moveable>(null)
  const gestureRef = useRef<Gesture | null>(null)
  /** The current press selected its object itself, so its tap must not toggle it again. */
  const pressSelectedRef = useRef(false)
  const [spaceDown, setSpaceDown] = useState(false)
  const [multiTouch, setMultiTouch] = useState(false)
  const [rotating, setRotating] = useState(false)

  useCanvasGestures(wrapper, svgEl, spaceDown)

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

  // Viewport size → store (viewBox, toolbar zoom/Fit); fit the Board on mount.
  useLayoutEffect(() => {
    if (wrapper === null) return
    const { setViewport } = useEditor.getState()
    const measure = (): void => setViewport({ w: wrapper.clientWidth, h: wrapper.clientHeight })
    const ro = new ResizeObserver(measure)
    ro.observe(wrapper)
    measure()
    fitView()
    return () => ro.disconnect()
  }, [wrapper])

  // Space held: pan instead of drag (SPEC §7.2).
  useEffect(() => {
    const down = (e: KeyboardEvent): void => {
      if (e.code !== 'Space' || ownsSpace(e.target)) return
      e.preventDefault()
      if (e.repeat) return
      setSpaceDown(true)
      abortRef.current()
    }
    const up = (e: KeyboardEvent): void => {
      if (e.code === 'Space') setSpaceDown(false)
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
    if (wrapper === null) return
    const start = (e: TouchEvent): void => {
      if (e.touches.length < 2) return
      abortRef.current()
      setMultiTouch(true)
    }
    const end = (e: TouchEvent): void => {
      if (e.touches.length === 0) setMultiTouch(false)
    }
    const cancel = (): void => abortRef.current()
    wrapper.addEventListener('touchstart', start, { passive: true })
    wrapper.addEventListener('pointercancel', cancel)
    window.addEventListener('touchend', end)
    window.addEventListener('touchcancel', end)
    return () => {
      wrapper.removeEventListener('touchstart', start)
      wrapper.removeEventListener('pointercancel', cancel)
      window.removeEventListener('touchend', end)
      window.removeEventListener('touchcancel', end)
    }
  }, [wrapper])

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

  const svg = (): SVGSVGElement => svgEl!

  const onDragStart = (e: { clientX: number; clientY: number }): void => {
    gestureRef.current = startTranslate(svg(), clientOf(e))
  }
  const onMove = (e: { clientX: number; clientY: number }): void => {
    gestureRef.current?.move(clientOf(e))
  }
  const finish = (e: OnDragEnd | OnRotateEnd): void => {
    setRotating(false)
    if (gestureRef.current === null) return
    gestureRef.current = null
    endGesture(e.isDrag, e.inputEvent as Event | undefined)
  }
  /** A drag that never moved is a tap on the selection: re-select from domain geometry (SPEC §7.4). */
  const onDragEnd = (e: OnDragEnd): void => {
    finish(e)
    if (e.isDrag || pressSelectedRef.current) return
    const input = e.inputEvent as MouseEvent | TouchEvent | undefined
    clickSelect(svg(), clientOf(e), input?.shiftKey === true || useEditor.getState().addToSelection)
  }
  const onRotateStart = (e: { clientX: number; clientY: number }): void => {
    const box = unionBoxes(selectableBounds(project, editContext).filter((b) => selection.includes(b.id)).map((b) => b.box))
    if (box === null) return
    setRotating(true)
    gestureRef.current = startRotate(svg(), clientOf(e), { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 })
  }

  const getElementRect = (el: HTMLElement | SVGElement): { pos1: number[]; pos2: number[]; pos3: number[]; pos4: number[] } => {
    const box = boundsRef.current.get(el.getAttribute('data-object-id')!)!
    const tl = worldToScreen(svg(), { x: box.minX, y: box.minY })
    const br = worldToScreen(svg(), { x: box.maxX, y: box.maxY })
    return { pos1: [tl.x, tl.y], pos2: [br.x, tl.y], pos3: [tl.x, br.y], pos4: [br.x, br.y] }
  }

  const onSelectoDragStart = (e: OnSelectoDragStart): void => {
    const moveable = moveableRef.current!
    const input = e.inputEvent as MouseEvent | TouchEvent
    if (moveable.isMoveableElement(input.target as Element)) {
      e.stop() // a Moveable handle owns this press
      return
    }
    const s = useEditor.getState()
    const id = objectAt(s.project, s.editContext, screenToWorld(svg(), clientOf(e)))
    if (id === null) return // empty space: marquee
    e.stop()
    const proxy = svg().querySelector(proxySelector(id))
    pressSelectedRef.current = !s.selection.includes(id)
    if (!pressSelectedRef.current) {
      moveable.dragStart(input, proxy)
      return
    }
    s.select(toggleSelection(s.selection, id, input.shiftKey || s.addToSelection))
    void moveable.waitToChangeTarget().then(() => moveable.dragStart(input, proxy))
  }
  const onSelectEnd = (e: OnSelectEnd): void => {
    const s = useEditor.getState()
    const input = e.inputEvent as MouseEvent | TouchEvent
    const toggle = input.shiftKey || s.addToSelection
    if (e.isClick) {
      clickSelect(svg(), clientOf(e.inputEvent as { clientX: number; clientY: number }), toggle)
      return
    }
    const ids = e.selected.map((el) => el.getAttribute('data-object-id')!)
    s.select(toggle ? [...s.selection.filter((id) => !ids.includes(id)), ...ids.filter((id) => !s.selection.includes(id))] : ids)
  }

  const clipExtendMm = editorClipExtendMm(camera.zoom)
  const { widthMm: bw, heightMm: bh, backgroundMaterialId } = project.board
  const boardFill = project.materials.find((m) => m.id === backgroundMaterialId)?.color ?? '#ffffff'
  const vx = camera.x
  const vy = camera.y
  const vw = view.w / camera.zoom
  const vh = view.h / camera.zoom
  const matD = `M ${vx - vw} ${vy - vh} H ${vx + 2 * vw} V ${vy + 2 * vh} H ${vx - vw} Z M 0 0 H ${bw} V ${bh} H 0 Z`
  const selecting = tool === 'select' && wrapper !== null && svgEl !== null
  const drawTool = isDrawTool(tool) && svgEl !== null

  // Drawing tools own single-pointer input (SPEC §7.2). Ups and cancels are
  // read on window so a pointer released off the canvas is never left "down".
  const spaceRef = useRef(spaceDown)
  spaceRef.current = spaceDown
  useEffect(() => {
    if (!drawTool || wrapper === null || svgEl === null) return
    const onDown = (e: PointerEvent): void => drawPointerDown(svgEl, e, spaceRef.current)
    const onMove = (e: PointerEvent): void => drawPointerMove(svgEl, e)
    const onUp = (e: PointerEvent): void => drawPointerUp(svgEl, e)
    wrapper.addEventListener('pointerdown', onDown)
    wrapper.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', drawPointerCancel)
    return () => {
      wrapper.removeEventListener('pointerdown', onDown)
      wrapper.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', drawPointerCancel)
    }
  }, [drawTool, wrapper, svgEl])

  return (
    <div className="canvas" ref={setWrapper}>
      <svg ref={setSvgEl} className="canvas-svg" viewBox={viewBoxFor(camera, view)} width={view.w} height={view.h}>
        <rect className="board" width={bw} height={bh} fill={boardFill} />
        <SceneSvg project={shown} clipExtendMm={clipExtendMm} />
        <path className="board-mat" d={matD} fillRule="evenodd" pointerEvents="none" />
        {showGrid && <Grid gridMm={gridMm} matrix={ctxMatrix} zoom={camera.zoom} view={{ x: vx, y: vy, w: vw, h: vh }} />}
        <Proxies bounds={bounds} />
        <SelectionOverlay boxes={selectedBoxes} zoom={camera.zoom} />
        {drawing !== null && <DrawPreview drawing={drawing} matrix={ctxMatrix} zoom={camera.zoom} unit={project.displayUnits} />}
        {drawing?.cursor != null && <SnapGuide snap={drawing.cursor} matrix={ctxMatrix} zoom={camera.zoom} />}
      </svg>
      {selecting && (
        <Moveable
          ref={moveableRef}
          target={selection.map(proxySelector)}
          container={wrapper}
          flushSync={flushSync}
          draggable={!spaceDown}
          rotatable
          resizable={false}
          snappable={false}
          origin={false}
          onDragStart={onDragStart}
          onDrag={onMove}
          onDragEnd={onDragEnd}
          onDragGroupStart={onDragStart}
          onDragGroup={onMove}
          onDragGroupEnd={onDragEnd}
          onRotateStart={onRotateStart}
          onRotate={onMove}
          onRotateEnd={finish}
          onRotateGroupStart={onRotateStart}
          onRotateGroup={onMove}
          onRotateGroupEnd={finish}
        />
      )}
      {selecting && !multiTouch && (
        <Selecto
          container={wrapper}
          dragContainer={wrapper}
          selectableTargets={['[data-object-id]']}
          selectByClick
          selectFromInside
          hitRate={0}
          getElementRect={getElementRect}
          dragCondition={() => !spaceDown}
          onDragStart={onSelectoDragStart}
          onSelectEnd={onSelectEnd}
        />
      )}
    </div>
  )
}
