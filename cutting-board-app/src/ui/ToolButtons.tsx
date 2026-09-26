// Shell §5, §7.1: the six tool buttons and the current-wood chip, shared by
// the icon column (docked) and the floating tool bar (undocked).

import { Hand, MousePointer2, Pentagon, Square } from 'lucide-react'
import type { JSX } from 'react'
import { Fragment } from 'react'
import { formatLength } from '@/domain/units'
import { useLayout } from '@/editor/layout'
import type { Tool } from '@/editor/store'
import { useEditor } from '@/editor/store'
import { emptyBoardHintShown } from './EmptyBoardHint.tsx'
import { Hint } from './Hint.tsx'
import { BandIcon, CrossingIcon } from './icons.tsx'

type Variant = 'column' | 'bar'

const ICON = { size: 18, strokeWidth: 1.6 } as const

const TOOLS: ReadonlyArray<{ tool: Tool; label: string; icon: JSX.Element }> = [
  { tool: 'select', label: 'Select', icon: <MousePointer2 {...ICON} /> },
  { tool: 'hand', label: 'Hand', icon: <Hand {...ICON} /> },
  { tool: 'band', label: 'Band', icon: <BandIcon /> },
  { tool: 'rect', label: 'Rectangle', icon: <Square {...ICON} /> },
  { tool: 'polygon', label: 'Polygon', icon: <Pentagon {...ICON} /> },
  { tool: 'crossing', label: 'Crossing', icon: <CrossingIcon /> },
]

export function ToolButtons({ variant }: { variant: Variant }): JSX.Element {
  const tool = useEditor((s) => s.tool)
  const setTool = useEditor((s) => s.setTool)
  const invite = useEditor(emptyBoardHintShown)
  return (
    <>
      {TOOLS.map(({ tool: t, label, icon }) => (
        <Fragment key={t}>
          {variant === 'bar' && t === 'band' && <span className="bar-divider" aria-hidden="true" />}
          <Hint shortcut={t} side={variant === 'column' ? 'right' : 'top'}>
            <button
              type="button"
              className="icon-button"
              aria-label={label}
              aria-pressed={tool === t}
              data-invite={t === 'band' && invite ? '' : undefined}
              onClick={() => setTool(t)}
            >
              {icon}
            </button>
          </Hint>
        </Fragment>
      ))}
    </>
  )
}

/** Shell §5 item 4 / §7.1 item 3: the current material; opens the Wood pane. The bar variant also shows the next Band's width. */
export function WoodChip({ variant }: { variant: Variant }): JSX.Element {
  const material = useEditor((s) => s.project.materials.find((m) => m.id === s.currentMaterialId))
  const widthMm = useEditor((s) => s.lastBandWidthMm)
  const unit = useEditor((s) => s.project.displayUnits)
  const name = material?.name ?? 'None' // the schema allows an empty materials list, and the last unused material can be deleted
  return (
    <Hint label="Current wood" hint="Opens the Wood pane" side={variant === 'column' ? 'right' : 'top'}>
      <button
        type="button"
        className={`wood-chip wood-chip-${variant}`}
        aria-label={`Current wood: ${name}`}
        onClick={() => useLayout.getState().uiActions?.openLeft('wood')}
      >
        <span className="wood-chip-swatch" style={{ background: material?.color ?? 'transparent' }} aria-hidden="true" />
        {variant === 'bar' && (
          <span className="wood-chip-text">
            {name} · {formatLength(widthMm, unit)} {unit}
          </span>
        )}
      </button>
    </Hint>
  )
}
