// The tool rail (SPEC §7.4): Select, Hand, Band, Rectangle, Polygon, Crossing; the Snap
// and Show grid toggles (SPEC §7.7); and −, +, Fit (SPEC §7.2).

import type { ChangeEvent, JSX } from 'react'
import { createMotifFromSelection, pasteClipboard, repeatSelection } from '@/editor/keyboard'
import { fitView, zoomViewBy } from '@/editor/input'
import type { Tool } from '@/editor/store'
import { useEditor } from '@/editor/store'
import { fixtures } from '@/fixtures'

const ZOOM_STEP = 1.25

type FixtureKey = keyof typeof fixtures

const FIXTURE_OPTIONS: Array<[FixtureKey, string]> = [
  ['stripes', 'Stripes'],
  ['checker', 'Checker'],
  ['basketWeave', 'Basket weave'],
  ['chevronDiamond', 'Chevron diamond'],
  ['isometric', 'Isometric'],
  ['interlace', 'Interlace'],
]

/** Dev-only manual-inspection aid (SPEC §12 fixtures); never bundled into a production build. */
function FixtureLoader(): JSX.Element {
  const replaceProject = useEditor((s) => s.replaceProject)
  const onChange = (e: ChangeEvent<HTMLSelectElement>): void => {
    const key = e.target.value
    if (key === '') return
    replaceProject(structuredClone(fixtures[key as FixtureKey]))
    e.target.value = ''
  }
  return (
    <label className="toolbar-fixture-loader">
      Load fixture
      <select aria-label="Load fixture" defaultValue="" onChange={onChange}>
        <option value="" disabled>
          Load fixture…
        </option>
        {FIXTURE_OPTIONS.map(([key, label]) => (
          <option key={key} value={key}>
            {label}
          </option>
        ))}
      </select>
    </label>
  )
}

export function Toolbar(): JSX.Element {
  const tool = useEditor((s) => s.tool)
  const setTool = useEditor((s) => s.setTool)
  const snapEnabled = useEditor((s) => s.snapEnabled)
  const showGrid = useEditor((s) => s.showGrid)
  const hasSelection = useEditor((s) => s.selection.length > 0)
  const toolButton = (t: Tool, label: string, key: string): JSX.Element => (
    <button type="button" aria-pressed={tool === t} title={`${label} (${key})`} onClick={() => setTool(t)}>
      {label}
    </button>
  )
  return (
    <header className="toolbar">
      {toolButton('select', 'Select', 'V')}
      {toolButton('hand', 'Hand', 'H')}
      {toolButton('band', 'Band', 'B')}
      {toolButton('rect', 'Rectangle', 'R')}
      {toolButton('polygon', 'Polygon', 'P')}
      {toolButton('crossing', 'Crossing', 'X')}
      <button type="button" aria-pressed={snapEnabled} onClick={() => useEditor.setState({ snapEnabled: !snapEnabled })}>
        Snap
      </button>
      <button type="button" aria-pressed={showGrid} onClick={() => useEditor.setState({ showGrid: !showGrid })}>
        Show grid
      </button>
      <button type="button" onClick={pasteClipboard}>
        Paste
      </button>
      <button type="button" disabled={!hasSelection} onClick={createMotifFromSelection}>
        Create Motif
      </button>
      <button type="button" disabled={!hasSelection} onClick={repeatSelection}>
        Repeat
      </button>
      <span className="toolbar-gap" />
      <button type="button" aria-label="Zoom out" onClick={() => zoomViewBy(1 / ZOOM_STEP)}>
        −
      </button>
      <button type="button" aria-label="Zoom in" onClick={() => zoomViewBy(ZOOM_STEP)}>
        +
      </button>
      <button type="button" onClick={fitView}>
        Fit
      </button>
      {import.meta.env.DEV && <FixtureLoader />}
    </header>
  )
}
