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
//
// A single selected Band/Region also shows vertex/midpoint handles (SPEC
// §7.4). Their presses are caught on pointerdown (capture, before Selecto's
// mousedown/touchstart) by the nearest handle centre within the hit radius,
// run as a gesture over raw Pointer Events, and stop Selecto so Moveable's
// drag never starts from a handle. Handle taps and the Select tool's
// double-tap go through `tapTracker.ts`, like the drawing and Crossing tools.

import type { JSX } from 'react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import Moveable from 'react-moveable'
import type { OnDragEnd, OnRotateEnd } from 'react-moveable'
import Selecto from 'react-selecto'
import type { OnDragStart as OnSelectoDragStart, OnSelectEnd } from 'react-selecto'
import { useShallow } from 'zustand/react/shallow'
import { unionBoxes } from '@/geometry/bounds'
import { apply } from '@/geometry/affine'
import { TAP_SLOP_PX } from '@/geometry/tolerance'
import { screenToWorld, viewBoxFor, worldToScreen } from '@/editor/camera'
import { fitView, useCanvasGestures } from '@/editor/input'
import { useScene } from '@/editor/scene'
import { contextMatrix, useEditor } from '@/editor/store'
import { createTapTracker, isTap } from '@/editor/tapTracker'
import {
  crossingPointerCancel,
  crossingPointerDown,
  crossingPointerMove,
  crossingPointerUp,
  HIT_RADIUS_MOUSE_PX,
  HIT_RADIUS_TOUCH_PX,
  pickNearest,
  resetCrossingInput,
} from '@/editor/tools/crossing'
import { drawPointerCancel, drawPointerDown, drawPointerMove, drawPointerUp, isDrawTool, resetDrawInput } from '@/editor/tools/draw'
import type { Gesture } from '@/editor/tools/select'
import {
  clickSelect,
  contextPrefix,
  endGesture,
  enterAt,
  handlesFor,
  objectAt,
  pointsChanged,
  retargetAt,
  selectableBounds,
  startHandleDrag,
  startRotate,
  startTranslate,
  toggleSelection,
} from '@/editor/tools/select'
import { Proxies } from './Proxies.tsx'
import { SceneSvg } from './SceneSvg.tsx'
import { ContextScrim } from './overlays/ContextScrim.tsx'
import { CrossingMarkers } from './overlays/CrossingMarkers.tsx'
import { DrawPreview } from './overlays/DrawPreview.tsx'
import { Grid } from './overlays/Grid.tsx'
import { PivotMarkers } from './overlays/Pivot.tsx'
import { SelectionOverlay } from './overlays/Selection.tsx'
import { SnapGuide } from './overlays/SnapGuide.tsx'
import { VertexHandles } from './overlays/VertexHandles.tsx'

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
  const snapGuide = useEditor((s) => s.snapGuide)
  const gridMm = useEditor((s) => s.gridMm)
  const ctxMatrix = useEditor(useShallow(contextMatrix))

  const [wrapper, setWrapper] = useState<HTMLDivElement | null>(null)
  const [svgEl, setSvgEl] = useState<SVGSVGElement | null>(null)
  const moveableRef = useRef<Moveable>(null)
  const gestureRef = useRef<Gesture | null>(null)
  /** The current press selected its object itself, so its tap must not toggle it again. */
  const pressSelectedRef = useRef(false)
  /** Select-tool pointers: vertex/midpoint handle presses and double-tap detection. */
  const [taps] = useState(createTapTracker)
  /** The vertex/midpoint handle gesture of the press in `taps` (also in `gestureRef` so aborts reach it). */
  const handleRef = useRef<{ gesture: Gesture; objectId: string } | null>(null)
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

  // Registers the abort hook in the store so keyboard.ts's Esc "cancel
  // gesture" step can reach it too — one stable wrapper over the always-fresh
  // abortRef, so it stays correct across re-renders without re-registering.
  useEffect(() => {
    useEditor.getState().setAbortGesture(() => abortRef.current())
    return () => useEditor.getState().setAbortGesture(null)
  }, [])

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
  const onMove = (e: { clientX: number; clientY: number; inputEvent?: unknown }): void => {
    const input = e.inputEvent as MouseEvent | TouchEvent | undefined
    gestureRef.current?.move(clientOf(e), { altKey: input?.altKey === true, shiftKey: input?.shiftKey === true })
  }
  const finish = (e: OnDragEnd | OnRotateEnd): void => {
    setRotating(false)
    if (gestureRef.current === null) return
    gestureRef.current = null
    endGesture(e.isDrag, e.inputEvent as Event | undefined)
  }
  /** A drag that never moved is a tap on the selection: re-select from domain geometry (SPEC §7.4); a double-tap enters the instance/cell (SPEC §7.6). */
  const onDragEnd = (e: OnDragEnd): void => {
    finish(e)
    if (e.isDrag) return
    if (taps.doubleTap(clientOf(e)) && enterAt(svg(), clientOf(e))) return
    if (pressSelectedRef.current) return
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
    if (handleRef.current !== null || moveable.isMoveableElement(input.target as Element)) {
      e.stop() // a vertex/midpoint or Moveable handle owns this press
      return
    }
    // An inspector field's pending preview commits now: its blur arrives after this press.
    useEditor.getState().settlePreview()
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
  /** A Select tap that no object press owned: double-tap entry, re-targeting, else tap-select (SPEC §7.4, §7.6). */
  const tapAt = (client: XY, toggle: boolean): void => {
    if (taps.doubleTap(client) && enterAt(svg(), client)) return
    if (retargetAt(svg(), client)) return
    clickSelect(svg(), client, toggle)
  }
  const tapRef = useRef(tapAt)
  tapRef.current = tapAt
  const onSelectEnd = (e: OnSelectEnd): void => {
    const s = useEditor.getState()
    const input = e.inputEvent as MouseEvent | TouchEvent
    const toggle = input.shiftKey || s.addToSelection
    if (e.isClick) {
      tapAt(clientOf(e.inputEvent as { clientX: number; clientY: number }), toggle)
      return
    }
    const ids = e.selected.map((el) => el.getAttribute('data-object-id')!)
    s.select(toggle ? [...s.selection.filter((id) => !ids.includes(id)), ...ids.filter((id) => !s.selection.includes(id))] : ids)
  }

  const scene = useScene()
  const { widthMm: bw, heightMm: bh, backgroundMaterialId } = project.board
  const boardFill = project.materials.find((m) => m.id === backgroundMaterialId)?.color ?? '#ffffff'
  const vx = camera.x
  const vy = camera.y
  const vw = view.w / camera.zoom
  const vh = view.h / camera.zoom
  const matD = `M ${vx - vw} ${vy - vh} H ${vx + 2 * vw} V ${vy + 2 * vh} H ${vx - vw} Z M 0 0 H ${bw} V ${bh} H 0 Z`
  const selecting = tool === 'select' && wrapper !== null && svgEl !== null

  // Drawing tools own single-pointer input (SPEC §7.2). Ups and cancels are
  // read on window so a pointer released off the canvas is never left "down";
  // unbinding (any tool switch) resets the tool's pointer bookkeeping.
  const spaceRef = useRef(spaceDown)
  spaceRef.current = spaceDown
  useEffect(() => {
    if (!isDrawTool(tool) || wrapper === null || svgEl === null) return
    const onDown = (e: PointerEvent): void => drawPointerDown(svgEl, e, tool, spaceRef.current)
    const onMove = (e: PointerEvent): void => drawPointerMove(svgEl, e, tool)
    const onUp = (e: PointerEvent): void => drawPointerUp(svgEl, e, tool)
    wrapper.addEventListener('pointerdown', onDown)
    wrapper.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', drawPointerCancel)
    return () => {
      wrapper.removeEventListener('pointerdown', onDown)
      wrapper.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', drawPointerCancel)
      resetDrawInput()
    }
  }, [tool, wrapper, svgEl])

  // Vertex/midpoint handle presses (SPEC §7.4): a drag past TAP_SLOP_PX
  // commits once on release; a tap cancels and acts as a plain Select tap
  // there; a second pointer (spoiling the press) or pointercancel cancels.
  useEffect(() => {
    if (!selecting || wrapper === null || svgEl === null) return
    const drop = (): void => {
      if (handleRef.current === null) return
      handleRef.current = null
      abortRef.current()
    }
    const onDown = (e: PointerEvent): void => {
      if (!taps.down(e)) {
        drop()
        return
      }
      if (e.button !== 0 || spaceRef.current || gestureRef.current !== null || moveableRef.current?.isMoveableElement(e.target as Element) === true) return
      // An inspector field's pending preview commits first (its blur arrives after this press), so the drag starts from it.
      useEditor.getState().settlePreview()
      const s = useEditor.getState()
      const handles = handlesFor(s.project, s.editContext, s.selection)
      const m = contextMatrix(s)
      const client = clientOf(e)
      const radius = e.pointerType === 'touch' ? HIT_RADIUS_TOUCH_PX : HIT_RADIUS_MOUSE_PX
      const k = pickNearest(handles.map((h) => worldToScreen(svgEl, apply(m, h.at))), client, radius)
      if (k === null) return
      const handle = handles[k]!
      const gesture = startHandleDrag(svgEl, handle)
      gestureRef.current = gesture
      taps.begin(e)
      handleRef.current = { gesture, objectId: handle.objectId }
    }
    const onMove = (e: PointerEvent): void => {
      const press = taps.move(e)
      const h = handleRef.current
      if (press === null || h === null || gestureRef.current !== h.gesture) return
      if (press.maxMove >= TAP_SLOP_PX) h.gesture.move(clientOf(e), e)
    }
    const onUp = (e: PointerEvent): void => {
      const press = taps.up(e)
      const h = handleRef.current
      if (press === null || h === null) return
      handleRef.current = null
      if (gestureRef.current !== h.gesture) return // aborted meanwhile
      gestureRef.current = null
      const tapped = isTap(press)
      endGesture(!tapped && pointsChanged(useEditor.getState(), h.objectId), e)
      if (tapped) tapRef.current(clientOf(e), e.shiftKey || useEditor.getState().addToSelection)
    }
    const onCancel = (e: PointerEvent): void => {
      taps.cancel(e)
      drop()
    }
    wrapper.addEventListener('pointerdown', onDown, { capture: true })
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    return () => {
      wrapper.removeEventListener('pointerdown', onDown, { capture: true })
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      taps.reset()
      drop()
    }
  }, [selecting, wrapper, svgEl, taps])

  // The Crossing tool owns single-pointer taps the same way (SPEC §7.4).
  useEffect(() => {
    if (tool !== 'crossing' || wrapper === null || svgEl === null) return
    const onDown = (e: PointerEvent): void => crossingPointerDown(e, spaceRef.current)
    const onUp = (e: PointerEvent): void => crossingPointerUp(svgEl, e)
    wrapper.addEventListener('pointerdown', onDown)
    wrapper.addEventListener('pointermove', crossingPointerMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', crossingPointerCancel)
    return () => {
      wrapper.removeEventListener('pointerdown', onDown)
      wrapper.removeEventListener('pointermove', crossingPointerMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', crossingPointerCancel)
      resetCrossingInput()
    }
  }, [tool, wrapper, svgEl])

  return (
    <div className="canvas" ref={setWrapper} tabIndex={0}>
      <svg ref={setSvgEl} className="canvas-svg" viewBox={viewBoxFor(camera, view)} width={view.w} height={view.h}>
        <rect className="board" width={bw} height={bh} fill={boardFill} />
        <SceneSvg scene={scene} materials={shown.materials} clipPrefix="cbpd-clip" />
        {editContext.length > 0 && <ContextScrim scene={scene} materials={shown.materials} prefix={contextPrefix(editContext)} view={{ x: vx, y: vy, w: vw, h: vh }} />}
        <path className="board-mat" d={matD} fillRule="evenodd" pointerEvents="none" />
        {showGrid && <Grid gridMm={gridMm} matrix={ctxMatrix} zoom={camera.zoom} view={{ x: vx, y: vy, w: vw, h: vh }} />}
        <Proxies bounds={bounds} />
        <SelectionOverlay boxes={selectedBoxes} zoom={camera.zoom} />
        {tool === 'select' && <VertexHandles handles={handlesFor(shown, editContext, selection)} matrix={ctxMatrix} zoom={camera.zoom} />}
        <PivotMarkers project={shown} selection={selection} matrix={ctxMatrix} zoom={camera.zoom} />
        {drawing !== null && <DrawPreview drawing={drawing} matrix={ctxMatrix} zoom={camera.zoom} unit={project.displayUnits} />}
        {tool === 'crossing' && <CrossingMarkers scene={scene} zoom={camera.zoom} />}
        {drawing?.cursor != null && <SnapGuide snap={drawing.cursor} matrix={ctxMatrix} zoom={camera.zoom} />}
        {snapGuide !== null && <SnapGuide snap={snapGuide} matrix={ctxMatrix} zoom={camera.zoom} />}
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
