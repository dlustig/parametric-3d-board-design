// SPEC §7.5 Board panel, shell spec §13: shown when nothing is selected.
// Size (W, H), Background (a menu of the materials, each with its swatch),
// Units & grid (a mm/in segmented control, grid spacing). The project name is
// edited from the top bar's Rename (shell §10.1).

import type { JSX } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { ChevronDown } from 'lucide-react'
import { setBoardBackground, setBoardSize, setDisplayUnits } from '@/domain/commands'
import type { Unit } from '@/domain/units'
import { useEditor } from '@/editor/store'
import { NumberField } from './NumberField.tsx'
import { Section } from './Section.tsx'

const NONE = ''
const UNITS: Unit[] = ['mm', 'in']

export function BoardPanel(): JSX.Element {
  const project = useEditor((s) => s.project)
  const gridMm = useEditor((s) => s.gridMm)
  const unit = project.displayUnits
  const background = project.materials.find((m) => m.id === project.board.backgroundMaterialId)

  return (
    <section className="panel" aria-label="Board">
      <Section title="Size">
        <div className="field-grid">
          <NumberField
            label="Width"
            prefix="W"
            value={project.board.widthMm}
            unit={unit}
            policy="positive"
            onPreview={(v) => {
              useEditor.getState().setPreview(setBoardSize(project, v, project.board.heightMm), 'commit')
              return undefined
            }}
            onCommit={() => useEditor.getState().commit()}
          />
          <NumberField
            label="Height"
            prefix="H"
            value={project.board.heightMm}
            unit={unit}
            policy="positive"
            onPreview={(v) => {
              useEditor.getState().setPreview(setBoardSize(project, project.board.widthMm, v), 'commit')
              return undefined
            }}
            onCommit={() => useEditor.getState().commit()}
          />
        </div>
      </Section>
      <Section title="Background">
        <DropdownMenu.Root modal={false}>
          <DropdownMenu.Trigger asChild>
            <button type="button" className="menu-select" aria-label={`Background material: ${background?.name ?? 'None'}`}>
              {background === undefined ? <span className="inspector-swatch inspector-swatch-none" /> : <span className="inspector-swatch" style={{ background: background.color }} />}
              <span className="menu-select-name">{background?.name ?? 'None'}</span>
              <ChevronDown size={14} strokeWidth={1.6} aria-hidden="true" />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content className="menu" align="start" sideOffset={4} onEscapeKeyDown={(e) => e.stopPropagation()}>
              <DropdownMenu.RadioGroup
                value={project.board.backgroundMaterialId ?? NONE}
                onValueChange={(v) => useEditor.getState().run((p) => setBoardBackground(p, v === NONE ? null : v))}
              >
                <DropdownMenu.RadioItem className="menu-item" value={NONE}>
                  <span className="inspector-swatch inspector-swatch-none" />
                  None
                </DropdownMenu.RadioItem>
                {project.materials.map((m) => (
                  <DropdownMenu.RadioItem key={m.id} className="menu-item" value={m.id}>
                    <span className="inspector-swatch" style={{ background: m.color }} />
                    {m.name}
                  </DropdownMenu.RadioItem>
                ))}
              </DropdownMenu.RadioGroup>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </Section>
      <Section title="Units & grid">
        <div className="field">
          <span className="field-label" aria-hidden="true">
            Units
          </span>
          <div className="segmented" role="group" aria-label="Display units">
            {UNITS.map((u) => (
              <button
                key={u}
                type="button"
                aria-pressed={unit === u}
                onClick={() => {
                  // setDisplayUnits always returns a new project: without this guard a click on the
                  // pressed segment would push a history entry that changes nothing.
                  if (u !== unit) useEditor.getState().run((p) => setDisplayUnits(p, u))
                }}
              >
                {u}
              </button>
            ))}
          </div>
        </div>
        <NumberField
          label="Grid spacing"
          value={gridMm}
          unit={unit}
          policy="positive"
          onPreview={(v) => {
            useEditor.getState().setGridMm(v)
            return undefined
          }}
          onCommit={(v) => useEditor.getState().setGridMm(v)}
        />
      </Section>
    </section>
  )
}
