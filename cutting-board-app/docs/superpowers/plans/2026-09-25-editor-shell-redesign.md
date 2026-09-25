# Editor Shell Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the V1 editor's mechanical chrome with the approved Workbench shell:
- dark-first theming;
- resizable, collapsible side panes;
- an icon column with dockable tools;
- Layers / Motifs / Wood panes;
- contextual floating bars;
- tooltips with styled hotkeys;
- a New Project dialog.

The document model and editing behaviour do not change.

**Architecture:** Presentation-only rebuild of `src/ui` and the overlay colours in `src/render/overlays`.
- A second Zustand store (`src/editor/layout.ts`, persisted) holds theme, tab and dock preference.
- `react-resizable-panels` owns pane sizing.
- A display-only shortcut table (`src/editor/shortcuts.ts`) feeds tooltips and the shortcuts sheet, while `keyboard.ts` keeps its V1 dispatch logic.
- Editor-store changes are limited to `clipboard` and `setEditContext`.

**Tech Stack:**
- React 19, TypeScript (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), Vite 8, Zustand 5 (+ `persist`)
- Radix (Tooltip, Popover, Dialog, DropdownMenu), `react-resizable-panels` ^4.13, `lucide-react`, `@fontsource/ibm-plex-sans`
- Vitest, Playwright (chromium, firefox, webkit, chromium-touch)

**Spec:** `docs/superpowers/specs/2026-09-25-editor-shell-redesign-design.md`, the "shell spec". It is a companion to `docs/superpowers/specs/2026-09-24-cutting-board-pattern-designer-design.md`, "V1". Read both. Section numbers below are shell-spec sections unless prefixed "V1".

## Global Constraints

**Tooling and code style**
- pnpm only; Node 22.12+. Never `npm`.
- Before every commit, run `pnpm typecheck && pnpm test` plus the affected e2e specs (`pnpm exec playwright test e2e/<spec>`).
- Commit with `FSH_NO_TTY=1 git commit -m "..."`. The subject is imperative and at most 50 characters, and the body says why. No agent-authorship trailers.
- TypeScript is strict. No `any`. Exported functions have explicit return types. Use `import type` for types and the `@/` alias, never deep relative paths.
- Layering (AGENTS.md):
  - `src/domain` never imports React, the DOM, or UI.
  - `src/editor` never imports from `src/ui` or `src/render`.
  - `src/ui` and `src/render` are React.
- Keep it small (AGENTS.md): no registries, no framework layers, no single-caller helpers, no defensive branches for states that validation excludes, and no memoisation without a measured reason recorded in the G9 section of `docs/decisions/2026-09-24-gates.md`.
- Tests sit beside their source as `*.test.ts`; e2e specs live in `e2e/`. A new test must fail when the code it guards breaks. E2E waits only for real timers; no retries, no loosened tolerances.

**Design tokens and visual rules**
- Tokens: exactly the §2.1 table. Components and overlays use `var(--token)`. The only hex literals allowed in overlays are `#ffffff` and `#1a1a1a` (§2.1, §9.8).
- Font: IBM Plex Sans 400/500/600 via `@fontsource/ibm-plex-sans`. Numeric fields use `font-variant-numeric: tabular-nums`. Sentence case throughout; no all-caps labels.
- Icons: `lucide-react` at `strokeWidth={1.6}`, 18 px in toolbars. The only custom glyphs are Band, Crossing, Motif and Repeat, in `src/ui/icons.tsx` (§2.4).
- Theme: `data-theme` always holds `dark` or `light`. The default preference is `'dark'`. The prefs key is `cbpd:prefs`, in Zustand `persist` format `{ "state": {...}, "version": 1 }`.
- Pane ranges:
  - left: min 200px, max 400px, default 240px;
  - inspector: min 248px, max 440px, default 280px;
  - icon column: 52px, or 56px on `(pointer: coarse)`;
  - top bar: 44px;
  - narrow breakpoint: `(max-width: 1023.98px)`.
- Touch targets: at least 44 × 44 px hit area on `(pointer: coarse)` for every icon button (V1 §7.4).

**Accessible names**
- Accessible names tests rely on stay stable, unless a task explicitly renames them:
  - Tools: `Select`, `Hand`, `Band`, `Rectangle`, `Polygon`, `Crossing`.
  - Toggles: `Snap`, `Show grid`, `Add to selection`.
  - View: `Zoom in`, `Zoom out`, `Fit`.
  - Drawing: `Finish`, `Undo point`, `Cancel`.
  - Fields: `Width`, `Length`, `Angle`, `Point N X`, `Segment N length`, `Rows`, `Columns`.
  - Crossings: `All instances`, `This occurrence`.
  - Material swatches: the material name, and `Edit <name>`.
  - `Offset copy left` and `Offset copy right`.
  - The edit-context landmark: `nav` named `Edit context`.
- "Create Motif" is renamed **Make motif** everywhere (§9.4).
- The e2e baseline viewport for all four Playwright projects is 1440×900. The narrow layout is tested explicitly at 820×1180.

## Review Focus

The five failure modes most likely to bite a person, which the spec implies but no feature test exercises. Each has a pinning test in the task named.

1. **Corrupt or foreign persisted UI state.** Examples: a `cbpd:prefs` value with `theme: "blue"`, a non-JSON string, or a stale `react-resizable-panels` layout with out-of-range sizes. Expected: the app loads, falls back to defaults, and never blanks or throws. Pinned in **Task 1** (prefs) and **Task 3** (layout).
2. **Storage that throws.** Examples: a private window, quota exceeded, or `localStorage` access denied. Expected: the editor works, prefs changes apply for the session and silently don't persist, and `saveStatus` is untouched by prefs writes. Pinned in **Task 1**.
3. **New shortcuts pressed while typing.** Examples: `Mod+S`, `Mod+O`, `?`, `Shift+T` or `Mod+\` pressed in an inspector field, the rename field or a dialog input. Expected: they type or do nothing, never trigger. Esc keeps its V1 field behaviour. Pinned in **Task 2** (`?`), **Task 3** (`Mod+\`, `Mod+O/S/Shift+E`) and **Task 4** (`Shift+T`, `Mod+R`).
4. **Crossing the 1024 px breakpoint with panes open**, in both directions. Expected:
   - no pane is lost or stuck;
   - never both overlays open at once;
   - desktop widths survive the round trip;
   - the camera is not reset by the viewport change.

   Pinned in **Task 3**.
5. **Long names and big projects.** Examples: a project, material or motif name of 80+ characters, and the Interlace fixture's full layer list. Expected: names truncate with an ellipsis and a full-text tooltip or title, the layout never overflows horizontally, and the Layers pane stays responsive with the performance fixture (1000+ occurrences). Pinned in **Task 3** (top bar), **Task 5** (panes) and **Task 10** (perf).

---

## File map

| File | Status | Responsibility | Task |
| --- | --- | --- | --- |
| `docs/decisions/2026-09-25-shell-spike.md` | new | Spike result for `react-resizable-panels` | 0 |
| `src/index.css` | rewrite | Tokens (§2.1), base type, component styles | 1, then each UI task appends its section |
| `index.html` | modify | Pre-paint theme script (§3) | 1 |
| `src/main.tsx` | modify | Font imports | 1 |
| `src/editor/layout.ts` (+ `.test.ts`) | new | Persisted layout store | 1, extended in 2, 3 |
| `src/ui/theme.ts` | new | `useThemeSync()` | 1 |
| `src/render/overlays/*.tsx` | modify | Token colours (§9.8) | 1, 6, 7, 8 |
| `playwright.config.ts` | modify | Viewport 1440×900 | 1 |
| `src/editor/shortcuts.ts` (+ `.test.ts`) | new | `SHORTCUTS`, `formatChord`, `detectPlatform` | 2, entries added in 3, 4 |
| `src/ui/Keycap.tsx` | new | `Keycap`, `ChordKeys` | 2 |
| `src/ui/Hint.tsx` | new | Tooltip with keycaps, state, reason, touch long-press | 2 |
| `src/ui/ShortcutsDialog.tsx` | new | Keyboard shortcuts sheet (§10.3) | 2 |
| `src/editor/keyboard.ts` | modify | New bindings only; V1 logic kept | 2, 3, 4 |
| `src/ui/App.tsx` | rewrite | Shell grid, panes, narrow mode | 3 |
| `src/ui/TopBar.tsx` | new | Top bar (§8); absorbs StatusBar | 3, breadcrumb in 8 |
| `src/ui/ProjectMenu.tsx` | rewrite | DropdownMenu (§10.1), Open confirm, Rename | 3, New dialog in 10 |
| `src/export/download.ts` | modify | Gains `downloadProject`, `downloadExportSvg`, `sanitizeFilenamePart` (moved from ProjectMenu) | 3 |
| `src/ui/icons.tsx` | new | Band, Crossing, Motif, Repeat glyphs | 3 |
| `src/ui/IconColumn.tsx` | new | §5 | 3, tabs in 5, undock in 4 |
| `src/ui/ToolButtons.tsx` | new | Tool buttons + `WoodChip`, shared by column and floating bar | 3 |
| `src/ui/LeftPane.tsx` | new | Pane frame + tab switch | 3, Layers/Motifs in 5 |
| `src/ui/WoodPane.tsx` | new | §6.3 (from MaterialPalette) | 3 |
| `src/ui/MaterialPalette.tsx` | delete | Replaced by WoodPane | 3 |
| `src/ui/CanvasControls.tsx` | new | §7.2 | 3, repositioned in 4 |
| `src/ui/Toolbar.tsx` | shrink, then delete | Transitional Paste / Make motif / Repeat strip, then removed | 3, 4 |
| `src/ui/StatusBar.tsx` | delete | Absorbed into TopBar | 3 |
| `src/editor/store.ts` | modify | `clipboard` (4), `setEditContext` (5) | 4, 5 |
| `src/ui/ActionsBar.tsx` | new | §9.4 | 4 |
| `src/ui/ToolBar.tsx` | new | Undocked floating tool bar (§7.1) | 4 |
| `src/ui/Inspector/SelectionPanel.tsx` | modify | Buttons removed (moved to ActionsBar) | 4 |
| `src/geometry/scene.ts` (+ `.test.ts`) | modify | Export `occurrencePaths` | 5 |
| `src/editor/selection.ts` (+ `.test.ts`) | modify | `contextLevelsForPath` | 5 |
| `src/ui/LayersPane.tsx`, `src/ui/MotifsPane.tsx` | new | §6.1, §6.2 | 5 |
| `src/ui/DrawingBar.tsx` | new (from ToolOptions) | §9.3 | 6 |
| `src/ui/ToolOptions.tsx` | delete | Replaced by DrawingBar | 6 |
| `src/render/overlays/DrawPreview.tsx` | modify | True-width preview | 6 |
| `src/render/overlays/BoardDimensions.tsx` | new | §9.1 | 6 |
| `src/render/overlays/Grid.tsx` | modify | Clip to Board | 6 |
| `src/ui/EmptyBoardHint.tsx` | new | §9.5 | 6 |
| `src/render/overlays/CrossingMarkers.tsx` | modify | §9.6 markers | 7 |
| `src/ui/CrossingHover.tsx` | new | Marker hover tooltip | 7 |
| `src/ui/Inspector/CrossingsPanel.tsx` | new | §9.6 inspector panel | 7 |
| `src/ui/EditPill.tsx` | new (replaces Breadcrumb) | §9.7 | 8 |
| `src/ui/Breadcrumb.tsx` | delete | Replaced by EditPill | 8 |
| `src/ui/Inspector/*.tsx` | restyle | §13 | 9 |
| `src/ui/Inspector/Section.tsx` | new | `<details>`/plain section wrapper | 9 |
| `src/ui/NewProjectDialog.tsx` | new | §10.2 | 10 |
| `e2e/*.spec.ts` | modify/new | Per task | each |

## Interface contract

The names later tasks rely on. A task may add private helpers, but must not rename these.

**Task 1: `src/editor/layout.ts`**

```ts
export type ThemePref = 'dark' | 'light' | 'system'
export type LeftTab = 'layers' | 'motifs' | 'wood'
export const PREFS_KEY = 'cbpd:prefs'
export function resolveTheme(pref: ThemePref, prefersDark: boolean): 'dark' | 'light'
export function nextTheme(pref: ThemePref): ThemePref            // dark → light → system → dark
export interface LayoutState {
  theme: ThemePref; leftTab: LeftTab; toolsDocked: boolean
  setTheme(t: ThemePref): void; setLeftTab(t: LeftTab): void; setToolsDocked(d: boolean): void
}
export const useLayout: UseBoundStore<StoreApi<LayoutState>>     // persist({ name: PREFS_KEY, version: 1, partialize: theme/leftTab/toolsDocked })
```

- Task 2 adds `shortcutsOpen: boolean; setShortcutsOpen(o: boolean): void`. It is not persisted.
- Task 3 adds the following. None of them is persisted.

```ts
export interface UiActions { toggleLeft(): void; toggleRight(): void; openLeft(tab: LeftTab): void; openProject(): void }
leftOpen: boolean; rightOpen: boolean; uiActions: UiActions | null
setPaneOpen(side: 'left' | 'right', open: boolean): void; setUiActions(a: UiActions | null): void
```

**Task 1: `src/ui/theme.ts`.** `export function useThemeSync(): void`. It keeps `<html data-theme>` and `style.colorScheme` equal to `resolveTheme(useLayout.theme, matchMedia)`.

**Task 2: `src/editor/shortcuts.ts`**

```ts
export type ShortcutGroup = 'Tools' | 'Selection' | 'Drawing' | 'View' | 'Project' | 'Panels'
export interface Shortcut { readonly label: string; readonly keys: readonly string[]; readonly hint?: string; readonly group: ShortcutGroup }
export const SHORTCUTS: { readonly [id: string]: Shortcut }   // declared `as const satisfies Record<string, Shortcut>`
export type ShortcutId = keyof typeof SHORTCUTS
export type Platform = 'mac' | 'other'
export function detectPlatform(): Platform
export function formatChord(chord: string, platform: Platform): string[]   // 'Mod+Shift+E' → ['Ctrl','Shift','E'] | ['⌘','⇧','E']; 'ArrowUp' → ['↑']; 'Escape' → ['Esc']
```

- Chords join with `+`.
- `keys` holds alternatives, rendered with "or" between them.
- Display-only entries (their effect is not dispatched by `keyboard.ts`): `hand` (for `Space`) and `snapOff` (`Alt`). They are listed in `DISPLAY_ONLY: readonly ShortcutId[]`.

**Task 2: `src/ui/Keycap.tsx`.** `export function Keycap({ label, muted }: { label: string; muted?: boolean }): JSX.Element` and `export function ChordKeys({ chord, muted }: { chord: string; muted?: boolean }): JSX.Element`.

**Task 2: `src/ui/Hint.tsx`**

```ts
export interface HintProps {
  children: ReactElement            // the trigger (a button); wrapped in a <span> when disabledReason is set
  shortcut?: ShortcutId             // supplies label/keys/hint defaults
  label?: string; keys?: readonly string[]; hint?: string
  state?: 'on' | 'off'; disabledReason?: string
  side?: 'top' | 'right' | 'bottom' | 'left'
}
export function Hint(props: HintProps): JSX.Element
```

**Task 2: `src/ui/ShortcutsDialog.tsx`.** `export function ShortcutsDialog(): JSX.Element`, bound to `useLayout.shortcutsOpen`.

**Task 3.**
- `src/export/download.ts` gains:
  - `export function sanitizeFilenamePart(name: string): string`
  - `export function downloadProject(p: Project): void`
  - `export function downloadExportSvg(p: Project): void`
- `src/ui/ToolButtons.tsx`: `export function ToolButtons({ variant }: { variant: 'column' | 'bar' }): JSX.Element` and `export function WoodChip({ variant }: { variant: 'column' | 'bar' }): JSX.Element`.
- `src/ui/icons.tsx`: `export function BandIcon(p: IconProps)`, and likewise `CrossingIcon`, `MotifIcon`, `RepeatIcon`, where `type IconProps = { size?: number }`.

**Task 4.**
- Editor store adds `clipboard: Clipboard | null` (type from `@/domain/commands/clipboard`). The module variable in `keyboard.ts` is removed. `copySelection` and `pasteClipboard` read and write the store.
- `src/ui/ToolBar.tsx`: `export function ToolBar(): JSX.Element`.
- `src/ui/ActionsBar.tsx`: `export function ActionsBar(): JSX.Element | null`, a `role="toolbar"` named `Selection actions`.

**Task 5.**
- `src/geometry/scene.ts`: `export function occurrencePaths(p: Project, scene: Scene, motifId: Id): Step[][]`. It is built by exporting the private `placementsOf` logic over the band and region occurrences in `scene.elements`. Every repeat cell counts.
- `src/editor/selection.ts`: `export function contextLevelsForPath(p: Project, path: Step[]): EditContextLevel[]`. It satisfies `contextPrefix(contextLevelsForPath(p, path))` deep-equal to `path`.
- Editor store adds `setEditContext(levels: EditContextLevel[]): void`. It settles the preview, clears the selection, cancels drawing, and sets `editContext`.

**Task 6.** `src/ui/DrawingBar.tsx`: `export function DrawingBar(): JSX.Element | null`, which also renders the Crossing variant, restyled in 7.

**Task 7.** `src/ui/Inspector/CrossingsPanel.tsx`: `export function CrossingsPanel(): JSX.Element`.

**Task 8.** `src/ui/EditPill.tsx`: `export function EditPill(): JSX.Element | null`.

**Task 9.** `src/ui/Inspector/Section.tsx`: `export function Section({ title, collapsible, children }: { title: string; collapsible?: boolean; children: ReactNode }): JSX.Element`.

**Task 10.** `src/ui/NewProjectDialog.tsx`: `export function NewProjectDialog({ open, onOpenChange }: { open: boolean; onOpenChange(o: boolean): void }): JSX.Element`.

---

## Reconciliation notes (read before executing)

Four agents drafted the tasks below in parallel against the interface contract above, and the drafts were then cross-checked. The notes that follow **override the task text** wherever the two conflict.

1. **Shortcut ids are consistent across tasks.**
   - Task 2 defines: `select`, `hand`, `band`, `rect`, `polygon`, `crossing`, `undo`, `redo`, `duplicate`, `copy`, `paste`, `delete`, `makeMotif`, `nudge`, `selectNext`, `selectPrevious`, `escape`, `finish`, `undoPoint`, `cancelDrawing`, `snapOff`, `shortcuts`.
   - Tasks 3–4 add: `toggleLeft`, `toggleRight`, `openProject`, `downloadProject`, `exportSvg`, `repeat`, `toggleDock`.
2. **Colour tokens.** The spec's §2.1 is authoritative and was updated after drafting:
   - light `--muted` is `#5f6773`;
   - light `--attn` is `#945800`;
   - light `--ok` is `#1e8049`;
   - the tooltip hint line uses a new token, `--tip-hint` (`#a9b0ba`), instead of `--muted`.

   Wherever a task's CSS pastes the §2.1 table or styles the Hint hint line, use these values. Task 10's contrast step then expects every text pair to be at least 4.5:1, with `--line-strong` exempt as decorative.
3. **`react-resizable-panels` v4.**
   - `groupResizeBehavior="preserve-pixel-size"` is set on the two side `Panel`s, not on the `Group`.
   - Task 3 marks its own collapse/expand calls so that `onlySaveAfterUserInteractions` still persists them.
   - It passes a storage wrapper that never throws.
   - Task 0 must confirm all three. If the spike contradicts any of them, stop and report before Task 3.
4. **Default left tab.** `leftTab` defaults to `'wood'` from Task 3 and changes to `'layers'` in Task 5. Task 5 adds the `openPane` e2e helper for specs that click Wood swatches.
5. **Breadcrumb (Task 8).**
   - At the root, the project name is the menu trigger.
   - Inside an edit context, the project name is the root crumb and pops to the root, and the menu moves to an adjacent chevron button labelled "Project menu".
6. **`render/Canvas.tsx` imports `ui/CrossingHover` (Task 7).** This is accepted, because the hover index is local Canvas state and the editor store must not gain fields beyond `clipboard` and `setEditContext`.
7. **Grid clipping (Task 6).** The grid is a Board-sized pattern rect rather than a `clipPath`, which gives the same visual result.
8. **Tasks 8–10 assume the state that Tasks 3–7 leave behind.** They were drafted blind, so each dependent edit begins with a grep step that checks its assumption; if the check fails, adapt the edit to the actual code. The assumptions are:
   - the project-name trigger lives in `ProjectMenu`;
   - `.floating-top` positions the floating bars;
   - `Inspector` routes to `CrossingsPanel`.
9. **`jsdom` is added as a dev dependency in Task 2**, for the dispatcher test file only (`// @vitest-environment jsdom`).
10. **Manual checks stay open until the owner runs them:**
    - `Mod+R` does not reload the page (Task 10 records "not run" until then);
    - touch long-press click suppression on an iPad.

---

> **Notes on the contract (not contract breaks).**
>
> - **`useLayout`'s type.** It is declared without an explicit annotation, so it keeps its inferred `UseBoundStore<Mutate<StoreApi<LayoutState>, [['zustand/persist', …]]>>` type. That type is a superset of the contract's `UseBoundStore<StoreApi<LayoutState>>` and is assignable to it. The `.persist` API (`rehydrate`) is what `layout.test.ts` needs to pin Review Focus 1 and 2 at unit level.
> - **`groupResizeBehavior` goes on `Panel`, not `Group`.** In the v4 docs it is a `Panel` prop (`"preserve-relative-size" | "preserve-pixel-size"`, and at least one panel per group must preserve relative size). Shell spec §4 says "the Group uses" it. Task 0 records which one is correct, so Task 3 can use it.
> - **`onlySaveAfterUserInteractions: true` ignores imperative `collapse()`/`expand()`.** The docs say `isUserInteraction` is false for the imperative API. Collapsing a pane with the top-bar button would then not survive a reload, which conflicts with shell spec §16 ("Reload restores … collapsed state"). Task 0 observes and records the behaviour; Task 3 must act on it.
> - **The `hand` entry.** `hand` is in `DISPLAY_ONLY` because its `Space` alternative belongs to the Canvas. Its `H` key *is* dispatched, so `shortcuts.test.ts` checks `H` with a separate test instead of the table.
> - **The shortcut dispatch test needs a DOM.** It uses Vitest's `jsdom` environment for that one file (`// @vitest-environment jsdom`), because the Node environment has no `KeyboardEvent`, `HTMLElement` or element tree. That needs `jsdom` as a dev dependency (Task 2, Step 1).

---

### Task 0: react-resizable-panels spike

**Files:**
- Create (throwaway, deleted in Step 6): `spike.html`, `src/spike.tsx`, `e2e/spike.spec.ts`
- Create (kept): `docs/decisions/2026-09-25-shell-spike.md`
- Modify: `package.json`, `pnpm-lock.yaml` (via `pnpm add`)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - the `react-resizable-panels@^4.13` dependency;
  - the decision record, which answers for Task 3: where `groupResizeBehavior` goes, whether imperative collapse persists under `onlySaveAfterUserInteractions`, and the stored layout format.

**Gate:** if any check in Step 4 fails in chromium or webkit, **stop.** Do not commit anything except the decision record describing the failure. Report to the orchestrator before any shell work (shell spec §17 step 0). The observation test (5b) is *not* a gate; its result is recorded either way.

- [ ] **Step 1: Install the library.**

  ```bash
  pnpm add react-resizable-panels@^4.13
  ```

  Expected: `package.json` `dependencies` gains `"react-resizable-panels": "^4.13.x"`, and `pnpm-lock.yaml` changes.

- [ ] **Step 2: Write the spike page.** Vite's dev server serves any `.html` file in the root, so `/spike.html` works without config.

  `spike.html`:

  ```html
  <!doctype html>
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <title>Panels spike</title>
    </head>
    <body style="margin: 0">
      <div id="root"></div>
      <script type="module" src="/src/spike.tsx"></script>
    </body>
  </html>
  ```

  `src/spike.tsx`:

  ```tsx
  // THROWAWAY (shell spec §17 step 0): deleted before the spike commits.
  import type { JSX } from 'react'
  import { StrictMode } from 'react'
  import { createRoot } from 'react-dom/client'
  import { Group, Panel, Separator, useDefaultLayout, usePanelRef } from 'react-resizable-panels'

  function Spike(): JSX.Element {
    const left = usePanelRef()
    const { defaultLayout, onLayoutChanged } = useDefaultLayout({ id: 'spike', onlySaveAfterUserInteractions: true })
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
        <div>
          <button type="button" onClick={() => left.current?.collapse()}>
            Collapse left
          </button>
          <button type="button" onClick={() => left.current?.expand()}>
            Expand left
          </button>
        </div>
        <Group id="spike" defaultLayout={defaultLayout} onLayoutChanged={onLayoutChanged} style={{ flex: 1 }}>
          <Panel id="left" panelRef={left} collapsible collapsedSize="0px" minSize="200px" maxSize="400px" defaultSize="240px" groupResizeBehavior="preserve-pixel-size">
            L
          </Panel>
          <Separator id="sep-left" style={{ width: 4, background: '#888' }} />
          <Panel id="canvas">C</Panel>
          <Separator id="sep-right" style={{ width: 4, background: '#888' }} />
          <Panel id="right" collapsible collapsedSize="0px" minSize="248px" maxSize="440px" defaultSize="280px" groupResizeBehavior="preserve-pixel-size">
            R
          </Panel>
        </Group>
      </div>
    )
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <Spike />
    </StrictMode>,
  )
  ```

  If `pnpm typecheck` rejects `groupResizeBehavior` on `Panel`, move it to `Group` (the shell spec's wording) and record that in the decision record. Then run `pnpm typecheck`. Expected: exit 0.

- [ ] **Step 3: Write the spike checks.** Create `e2e/spike.spec.ts`:

  ```ts
  // THROWAWAY (shell spec §17 step 0): deleted before the spike commits.
  import type { Page } from '@playwright/test'
  import { expect, test } from '@playwright/test'
  import { expectClose } from './helpers.ts'

  test.skip(({ browserName, isMobile }) => isMobile || browserName === 'firefox', 'spike runs in chromium and webkit')

  async function openSpike(page: Page): Promise<void> {
    await page.goto('/spike.html')
    await expect(page.getByTestId('canvas')).toBeVisible()
  }

  async function width(page: Page, id: string): Promise<number> {
    const box = await page.getByTestId(id).boundingBox()
    return box === null ? 0 : box.width
  }

  async function drag(page: Page, separator: string, dx: number): Promise<void> {
    const box = await page.getByTestId(separator).boundingBox()
    if (box === null) throw new Error(`${separator} not rendered`)
    const x = box.x + box.width / 2
    const y = box.y + box.height / 2
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x + dx, y, { steps: 8 })
    await page.mouse.up()
  }

  test.use({ viewport: { width: 1440, height: 900 } })

  test('1. px defaults', async ({ page }) => {
    await openSpike(page)
    expectClose(await width(page, 'left'), 240, 1)
    expectClose(await width(page, 'right'), 280, 1)
  })

  test('2. px min/max clamping', async ({ page }) => {
    await openSpike(page)
    await drag(page, 'sep-left', 400)
    expectClose(await width(page, 'left'), 400, 1)
    await drag(page, 'sep-left', -230) // to 170: under min, above the collapse threshold
    expectClose(await width(page, 'left'), 200, 1)
    await drag(page, 'sep-right', -300)
    expectClose(await width(page, 'right'), 440, 1)
    await drag(page, 'sep-right', 220) // to 220: under min, above the collapse threshold
    expectClose(await width(page, 'right'), 248, 1)
  })

  test('3. preserve-pixel-size across window resize', async ({ page }) => {
    await openSpike(page)
    await drag(page, 'sep-left', 60)
    expectClose(await width(page, 'left'), 300, 1)
    for (const w of [1000, 1800, 1440]) {
      await page.setViewportSize({ width: w, height: 900 })
      await expect.poll(() => width(page, 'left')).toBeGreaterThan(299)
      expectClose(await width(page, 'left'), 300, 1)
      expectClose(await width(page, 'right'), 280, 1)
    }
  })

  test('4. imperative collapse and expand through usePanelRef', async ({ page }) => {
    await openSpike(page)
    await drag(page, 'sep-left', 60)
    await page.getByRole('button', { name: 'Collapse left' }).click()
    expectClose(await width(page, 'left'), 0, 1)
    await page.getByRole('button', { name: 'Expand left' }).click()
    expectClose(await width(page, 'left'), 300, 1) // "most recent size"
  })

  test('5a. useDefaultLayout persists a dragged size across reload', async ({ page }) => {
    await openSpike(page)
    await drag(page, 'sep-left', 60)
    await page.waitForFunction(() => localStorage.getItem('react-resizable-panels:spike') !== null)
    console.log('stored layout:', await page.evaluate(() => localStorage.getItem('react-resizable-panels:spike')))
    await page.reload()
    await expect(page.getByTestId('canvas')).toBeVisible()
    expectClose(await width(page, 'left'), 300, 1)
  })

  test('5b. OBSERVATION: imperative collapse under onlySaveAfterUserInteractions', async ({ page }) => {
    await openSpike(page)
    await page.getByRole('button', { name: 'Collapse left' }).click()
    await page.reload()
    await expect(page.getByTestId('canvas')).toBeVisible()
    // Documented v4 behaviour: imperative calls are not user interactions, so nothing is saved.
    expectClose(await width(page, 'left'), 240, 1)
  })
  ```

- [ ] **Step 4: Run the spike in both engines.**

  ```bash
  pnpm exec playwright test e2e/spike.spec.ts --project=chromium --project=webkit
  ```

  Expected: tests 1–5a pass in both projects (10 passes). 5b passes if the docs are right. The list reporter prints the `stored layout:` line.
  - **Gate.** If any of 1–5a fails in either engine, stop here. Write the decision record (Step 5) with the failure and its output. Delete the spike files (Step 6). Commit only the record, with the subject `Record failed panels spike`. Report and do not start Task 1.

- [ ] **Step 5: Write the decision record.** Create `docs/decisions/2026-09-25-shell-spike.md`. Fill every result cell from the Step 4 output: the pass/fail status and the measured px where a check failed.

  ```markdown
  # Shell spike: react-resizable-panels (shell spec §17 step 0)

  Date: 2026-09-25. Library: react-resizable-panels <exact installed version from pnpm-lock.yaml>.

  ## What was run

  A throwaway page (`spike.html` + `src/spike.tsx`) with a horizontal `Group`:

  - a left `Panel`: collapsible, `collapsedSize="0px"`, 200–400 px, default 240 px;
  - a relative canvas `Panel`;
  - a right `Panel`: collapsible, 248–440 px, default 280 px;
  - both side panels `groupResizeBehavior="preserve-pixel-size"`;
  - `useDefaultLayout({ id: 'spike', onlySaveAfterUserInteractions: true })`.

  Checked by `e2e/spike.spec.ts` at 1440×900:

      pnpm add react-resizable-panels@^4.13
      pnpm exec playwright test e2e/spike.spec.ts --project=chromium --project=webkit

  The spike files were deleted afterwards.

  ## Results

  | Check | chromium | webkit |
  | --- | --- | --- |
  | 1. px defaults 240 / 280 | <pass/fail> | <pass/fail> |
  | 2. px clamping (400, 200, 440, 248) | <pass/fail> | <pass/fail> |
  | 3. preserve-pixel-size at 1000 / 1800 / 1440 wide | <pass/fail> | <pass/fail> |
  | 4. `usePanelRef` collapse → 0, expand → last size | <pass/fail> | <pass/fail> |
  | 5a. dragged size survives reload | <pass/fail> | <pass/fail> |
  | 5b. imperative collapse survives reload (observation) | <yes/no> | <yes/no> |

  Stored value (5a): `<the printed stored layout line>`, under the key `react-resizable-panels:spike`.

  ## Findings for Task 3

  - `groupResizeBehavior` is a `<Panel|Group>` prop. Shell spec §4's "the Group uses" is corrected to match.
  - Imperative `collapse()`/`expand()` <is/is not> persisted with `onlySaveAfterUserInteractions: true`. If it is not, Task 3 persists the button/shortcut toggles itself: `useDefaultLayout` without `onlySaveAfterUserInteractions`, keeping the stale-layout guard from Review Focus 1.
  - The layout is stored as <percentages/pixels> keyed by panel id.

  Verdict: <PASS: adopt for Task 3 | FAIL: stop, see above>.
  ```

  Only if 5b showed imperative collapse is not persisted, also add a row to the shell spec's §18 table in `docs/superpowers/specs/2026-09-25-editor-shell-redesign-design.md`:

  ```markdown
  | Spike §17.0 | `onlySaveAfterUserInteractions` ignores imperative collapse, so toggled panes would not survive reload | §4 persistence drops `onlySaveAfterUserInteractions`; see `docs/decisions/2026-09-25-shell-spike.md` |
  ```

  In the same file, change §4's "and the Group uses `groupResizeBehavior="preserve-pixel-size"`" to "and each side Panel sets `groupResizeBehavior="preserve-pixel-size"`" (if Step 2 confirmed it is a Panel prop). Also change §4's `useDefaultLayout({ id: 'cbpd-shell', onlySaveAfterUserInteractions: true })` to `useDefaultLayout({ id: 'cbpd-shell' })` if 5b said so.

- [ ] **Step 6: Delete the spike code and verify.**

  ```bash
  rm spike.html src/spike.tsx e2e/spike.spec.ts
  pnpm typecheck && pnpm test
  git status --short
  ```

  Expected: typecheck and the unit tests pass. Status shows only `package.json`, `pnpm-lock.yaml` and `docs/decisions/2026-09-25-shell-spike.md`, plus the spec file if Step 5 edited it. The plan file is untracked and not part of this commit.

- [ ] **Step 7: Commit.**

  ```bash
  git add package.json pnpm-lock.yaml docs/decisions/2026-09-25-shell-spike.md docs/superpowers/specs/2026-09-25-editor-shell-redesign-design.md
  FSH_NO_TTY=1 git commit -m "Add react-resizable-panels after shell spike" -m "Shell spec 17.0 requires proving px clamping, preserve-pixel-size, imperative collapse and persistence in chromium and webkit before the shell is built on the library. The spike code is deleted; the record keeps the results and the two API facts Task 3 depends on."
  ```

---

### Task 1: Theme foundation: tokens, font, theme store, pre-paint script, overlay colours

**Files:**
- Create:
  - `src/editor/layout.ts`
  - `src/editor/layout.test.ts`
  - `src/ui/theme.ts`
  - `e2e/theme.spec.ts`
- Modify:
  - `src/index.css`: the `:root` block (lines 1–23) is rewritten, and every `--ink` / `--page-bg` use is replaced.
  - `index.html`: head.
  - `src/main.tsx`: lines 1–3.
  - `src/ui/App.tsx`: lines 1–5 and 67–69.
  - `src/render/overlays/Selection.tsx`: lines 1–2 and 20–21.
  - `src/render/overlays/VertexHandles.tsx`: line 19.
  - `src/render/overlays/SnapGuide.tsx`: lines 23–38.
  - `src/render/overlays/DrawPreview.tsx`: lines 30, 50 and 62.
  - `src/render/overlays/Grid.tsx`: line 25.
  - `playwright.config.ts`
  - `e2e/tablet.spec.ts`: lines 172–178.
  - `e2e/a11y.spec.ts`: lines 191–197.
  - `package.json` and `pnpm-lock.yaml`: font dependency.

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:

  ```ts
  // src/editor/layout.ts
  export type ThemePref = 'dark' | 'light' | 'system'
  export type LeftTab = 'layers' | 'motifs' | 'wood'
  export const PREFS_KEY = 'cbpd:prefs'
  export function resolveTheme(pref: ThemePref, prefersDark: boolean): 'dark' | 'light'
  export function nextTheme(pref: ThemePref): ThemePref
  export interface LayoutState { theme; leftTab; toolsDocked; setTheme; setLeftTab; setToolsDocked }
  export const useLayout   // persist({ name: PREFS_KEY, version: 1 }); inferred type ⊇ UseBoundStore<StoreApi<LayoutState>>
  // src/ui/theme.ts
  export function useThemeSync(): void
  ```

  - The CSS tokens of §2.1, defined on `:root[data-theme=dark|light]`. The tooltip classes `.tooltip` and `.hint` always take the dark set.

- [ ] **Step 1: Write the failing layout unit test.** Create `src/editor/layout.test.ts`:

  ```ts
  // Shell spec §3, §11: theme resolution and the persisted layout store,
  // including Review Focus 1 (corrupt/foreign prefs) and 2 (throwing storage).
  // `localStorage` is stubbed per test; the store's storage reads it lazily.

  import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
  import type { LayoutState } from './layout.ts'
  import { nextTheme, PREFS_KEY, resolveTheme, useLayout } from './layout.ts'

  class MemoryStorage {
    readonly data = new Map<string, string>()
    getItem(k: string): string | null {
      return this.data.get(k) ?? null
    }
    setItem(k: string, v: string): void {
      this.data.set(k, v)
    }
    removeItem(k: string): void {
      this.data.delete(k)
    }
  }

  const throwingStorage = {
    getItem(): never {
      throw new DOMException('denied', 'SecurityError')
    },
    setItem(): never {
      throw new DOMException('full', 'QuotaExceededError')
    },
    removeItem(): never {
      throw new DOMException('denied', 'SecurityError')
    },
  }

  const DEFAULTS = { theme: 'dark', leftTab: 'layers', toolsDocked: true }

  function prefs(s: LayoutState): { theme: string; leftTab: string; toolsDocked: boolean } {
    return { theme: s.theme, leftTab: s.leftTab, toolsDocked: s.toolsDocked }
  }

  function withStored(raw: string): MemoryStorage {
    const s = new MemoryStorage()
    s.setItem(PREFS_KEY, raw)
    vi.stubGlobal('localStorage', s)
    return s
  }

  beforeEach(() => {
    vi.unstubAllGlobals()
    useLayout.setState({ theme: 'dark', leftTab: 'layers', toolsDocked: true })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  describe('resolveTheme', () => {
    it.each([
      ['dark', true, 'dark'],
      ['dark', false, 'dark'],
      ['light', true, 'light'],
      ['light', false, 'light'],
      ['system', true, 'dark'],
      ['system', false, 'light'],
    ] as const)('%s with prefersDark=%s is %s', (pref, prefersDark, expected) => {
      expect(resolveTheme(pref, prefersDark)).toBe(expected)
    })
  })

  describe('nextTheme', () => {
    it('cycles dark → light → system → dark', () => {
      expect(nextTheme('dark')).toBe('light')
      expect(nextTheme('light')).toBe('system')
      expect(nextTheme('system')).toBe('dark')
    })
  })

  describe('useLayout persistence', () => {
    it('writes exactly theme, leftTab and toolsDocked under PREFS_KEY at version 1', () => {
      const s = new MemoryStorage()
      vi.stubGlobal('localStorage', s)
      useLayout.getState().setLeftTab('wood')
      expect(JSON.parse(s.getItem(PREFS_KEY)!)).toEqual({ state: { theme: 'dark', leftTab: 'wood', toolsDocked: true }, version: 1 })
    })

    it('restores stored prefs', async () => {
      withStored(JSON.stringify({ state: { theme: 'light', leftTab: 'motifs', toolsDocked: false }, version: 1 }))
      await useLayout.persist.rehydrate()
      expect(prefs(useLayout.getState())).toEqual({ theme: 'light', leftTab: 'motifs', toolsDocked: false })
    })

    it.each([
      ['foreign values', JSON.stringify({ state: { theme: 'blue', leftTab: 'nope', toolsDocked: 'yes' }, version: 1 })],
      ['non-JSON text', 'not json{'],
      ['another version', JSON.stringify({ state: { theme: 'light' }, version: 7 })],
      ['a non-object', '42'],
    ])('falls back to the defaults for %s', async (_name, raw) => {
      vi.spyOn(console, 'error').mockImplementation(() => {}) // zustand reports the unmigratable version
      withStored(raw)
      await useLayout.persist.rehydrate()
      expect(prefs(useLayout.getState())).toEqual(DEFAULTS)
    })

    it('keeps working when storage throws: hydration falls back, setters apply for the session', async () => {
      vi.stubGlobal('localStorage', throwingStorage)
      await useLayout.persist.rehydrate()
      expect(prefs(useLayout.getState())).toEqual(DEFAULTS)
      expect(() => useLayout.getState().setTheme('light')).not.toThrow()
      expect(useLayout.getState().theme).toBe('light')
    })
  })
  ```

- [ ] **Step 2: Run it and see it fail.**

  ```bash
  pnpm test src/editor/layout.test.ts
  ```

  Expected: FAIL, with `Failed to resolve import "./layout.ts"` (or `Cannot find module`).

- [ ] **Step 3: Implement the layout store.** Create `src/editor/layout.ts`:

  ```ts
  // Shell spec §11: the layout store — UI preferences that outlive a project
  // and never enter undo history. Persisted with zustand `persist` under
  // PREFS_KEY; every storage access is guarded, so a private window or a full
  // quota leaves prefs working for the session and never touches the editor
  // store's saveStatus. Stored values are validated on the way in (`merge`):
  // anything foreign falls back to the default (Review Focus 1).

  import { create } from 'zustand'
  import type { StateStorage } from 'zustand/middleware'
  import { createJSONStorage, persist } from 'zustand/middleware'

  export type ThemePref = 'dark' | 'light' | 'system'
  export type LeftTab = 'layers' | 'motifs' | 'wood'

  export const PREFS_KEY = 'cbpd:prefs'

  const THEMES: readonly ThemePref[] = ['dark', 'light', 'system']
  const TABS: readonly LeftTab[] = ['layers', 'motifs', 'wood']

  export function resolveTheme(pref: ThemePref, prefersDark: boolean): 'dark' | 'light' {
    if (pref === 'system') return prefersDark ? 'dark' : 'light'
    return pref
  }

  /** The theme button's cycle (§3): dark → light → system → dark. */
  export function nextTheme(pref: ThemePref): ThemePref {
    return pref === 'dark' ? 'light' : pref === 'light' ? 'system' : 'dark'
  }

  export interface LayoutState {
    theme: ThemePref
    leftTab: LeftTab
    toolsDocked: boolean
    setTheme(t: ThemePref): void
    setLeftTab(t: LeftTab): void
    setToolsDocked(d: boolean): void
  }

  const guardedStorage: StateStorage = {
    getItem: (name) => {
      try {
        return localStorage.getItem(name)
      } catch {
        return null
      }
    },
    setItem: (name, value) => {
      try {
        localStorage.setItem(name, value)
      } catch {
        // Best-effort: the preference still applies for this session.
      }
    },
    removeItem: (name) => {
      try {
        localStorage.removeItem(name)
      } catch {
        // As setItem.
      }
    },
  }

  function oneOf<T extends string>(options: readonly T[], value: unknown, fallback: T): T {
    return options.find((o) => o === value) ?? fallback
  }

  export const useLayout = create<LayoutState>()(
    persist(
      (set) => ({
        theme: 'dark',
        leftTab: 'layers',
        toolsDocked: true,
        setTheme: (theme) => set({ theme }),
        setLeftTab: (leftTab) => set({ leftTab }),
        setToolsDocked: (toolsDocked) => set({ toolsDocked }),
      }),
      {
        name: PREFS_KEY,
        version: 1,
        storage: createJSONStorage(() => guardedStorage),
        partialize: (s) => ({ theme: s.theme, leftTab: s.leftTab, toolsDocked: s.toolsDocked }),
        merge: (persisted, current) => {
          const read = (key: string): unknown => (typeof persisted === 'object' && persisted !== null ? Reflect.get(persisted, key) : undefined)
          const docked = read('toolsDocked')
          return {
            ...current,
            theme: oneOf(THEMES, read('theme'), current.theme),
            leftTab: oneOf(TABS, read('leftTab'), current.leftTab),
            toolsDocked: typeof docked === 'boolean' ? docked : current.toolsDocked,
          }
        },
      },
    ),
  )
  ```

- [ ] **Step 4: Run the unit test and see it pass.**

  ```bash
  pnpm test src/editor/layout.test.ts
  ```

  Expected: PASS, 15 tests.

- [ ] **Step 5: Write the failing theme e2e spec.** Create `e2e/theme.spec.ts`:

  ```ts
  // Shell spec §3 theme and §2.1 tokens: dark by default, persisted preference,
  // the inline pre-paint script on its own, `system` following the media query,
  // and Review Focus 1/2 — corrupt prefs and a throwing localStorage never
  // blank the app, and prefs writes never touch saveStatus.

  import type { Page } from '@playwright/test'
  import { expect, test } from '@playwright/test'
  import { PREFS_KEY } from '../src/editor/layout.ts'
  import { open } from './helpers.ts'

  const LAYOUT_MODULE = '/src/editor/layout.ts' // the dev server's URL for the same module instance the app uses

  async function openWithPrefs(page: Page, raw: string): Promise<void> {
    await page.goto('/')
    await page.evaluate(([k, v]) => localStorage.setItem(k, v), [PREFS_KEY, raw] as const)
    await open(page)
  }

  async function token(page: Page, name: string): Promise<string> {
    return page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name)
  }

  async function setThemeInApp(page: Page, theme: 'dark' | 'light' | 'system'): Promise<void> {
    await page.evaluate(
      async ([url, t]) => {
        const m = (await import(/* @vite-ignore */ url)) as typeof import('../src/editor/layout.ts')
        m.useLayout.getState().setTheme(t)
      },
      [LAYOUT_MODULE, theme] as const,
    )
  }

  function collectErrors(page: Page): Error[] {
    const errors: Error[] = []
    page.on('pageerror', (e) => errors.push(e))
    return errors
  }

  const html = (page: Page) => page.locator('html')

  test('dark by default, with the dark token set and the IBM Plex Sans face', async ({ page }) => {
    await open(page)
    await expect(html(page)).toHaveAttribute('data-theme', 'dark')
    expect(await page.evaluate(() => document.documentElement.style.colorScheme)).toBe('dark')
    expect(await token(page, '--panel')).toBe('#202328')
    expect(await token(page, '--acc')).toBe('#3d9bff')
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(32, 35, 40)')
    expect(await page.evaluate(async () => (await document.fonts.ready, document.fonts.check('500 13px "IBM Plex Sans"')))).toBe(true)
  })

  test('a stored light preference applies the light token set', async ({ page }) => {
    await openWithPrefs(page, JSON.stringify({ state: { theme: 'light' }, version: 1 }))
    await expect(html(page)).toHaveAttribute('data-theme', 'light')
    expect(await token(page, '--panel')).toBe('#ffffff')
    expect(await token(page, '--acc')).toBe('#1f6fe5')
  })

  test('a theme change applies live and persists across reload', async ({ page }) => {
    await open(page)
    await setThemeInApp(page, 'light')
    await expect(html(page)).toHaveAttribute('data-theme', 'light')
    await page.reload()
    await expect(html(page)).toHaveAttribute('data-theme', 'light')
    expect(JSON.parse((await page.evaluate((k) => localStorage.getItem(k), PREFS_KEY))!)).toMatchObject({ state: { theme: 'light' }, version: 1 })
  })

  test('the inline script alone sets data-theme before the app runs', async ({ page }) => {
    await page.goto('/')
    await page.evaluate((k) => localStorage.setItem(k, JSON.stringify({ state: { theme: 'light' }, version: 1 })), PREFS_KEY)
    await page.route('**/src/main.tsx', (r) => r.abort())
    await page.goto('/')
    await expect(html(page)).toHaveAttribute('data-theme', 'light')
    expect(await page.evaluate(() => document.documentElement.style.colorScheme)).toBe('light')
    await expect(page.locator('svg.canvas-svg')).toHaveCount(0) // the app really did not run
  })

  test('the inline script resolves system through the media query', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' })
    await page.goto('/')
    await page.evaluate((k) => localStorage.setItem(k, JSON.stringify({ state: { theme: 'system' }, version: 1 })), PREFS_KEY)
    await page.route('**/src/main.tsx', (r) => r.abort())
    await page.goto('/')
    await expect(html(page)).toHaveAttribute('data-theme', 'light')
  })

  test('system follows the colour-scheme media query live', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' })
    await openWithPrefs(page, JSON.stringify({ state: { theme: 'system' }, version: 1 }))
    await expect(html(page)).toHaveAttribute('data-theme', 'light')
    await page.emulateMedia({ colorScheme: 'dark' })
    await expect(html(page)).toHaveAttribute('data-theme', 'dark')
    await page.emulateMedia({ colorScheme: 'light' })
    await expect(html(page)).toHaveAttribute('data-theme', 'light')
  })

  for (const [name, raw] of [
    ['a foreign theme', JSON.stringify({ state: { theme: 'blue', leftTab: 'nope', toolsDocked: 'yes' }, version: 1 })],
    ['non-JSON text', 'not json{'],
    ['another version', JSON.stringify({ state: { theme: 'light' }, version: 7 })],
  ] as const) {
    test(`corrupt prefs (${name}) load dark without an error`, async ({ page }) => {
      const errors = collectErrors(page)
      await openWithPrefs(page, raw)
      await expect(html(page)).toHaveAttribute('data-theme', 'dark')
      await expect(page.locator('svg.canvas-svg')).toBeVisible()
      expect(errors).toEqual([])
    })
  }

  test('a throwing localStorage for prefs: loads dark, theme still changes, saveStatus untouched', async ({ page }) => {
    const errors = collectErrors(page)
    await page.addInitScript((key) => {
      const get = Storage.prototype.getItem
      const set = Storage.prototype.setItem
      Storage.prototype.getItem = function (k: string): string | null {
        if (k === key) throw new DOMException('denied', 'SecurityError')
        return get.call(this, k)
      }
      Storage.prototype.setItem = function (k: string, v: string): void {
        if (k === key) throw new DOMException('full', 'QuotaExceededError')
        set.call(this, k, v)
      }
    }, PREFS_KEY)
    await open(page)
    await expect(html(page)).toHaveAttribute('data-theme', 'dark')
    await setThemeInApp(page, 'light')
    await expect(html(page)).toHaveAttribute('data-theme', 'light')
    expect(await page.evaluate(() => window.__cbpd!.getState().saveStatus)).toBe('saved')
    expect(errors).toEqual([])
  })
  ```

- [ ] **Step 6: Run the e2e spec and see it fail.**

  ```bash
  pnpm exec playwright test e2e/theme.spec.ts --project=chromium
  ```

  Expected: FAIL. `data-theme` is missing (`Expected "dark", Received: null`) in every test that reads it.

- [ ] **Step 7: Install the font and import it.**

  ```bash
  pnpm add @fontsource/ibm-plex-sans
  ```

  In `src/main.tsx`, replace

  ```ts
  import { StrictMode } from 'react'
  import { createRoot } from 'react-dom/client'
  import './index.css'
  ```

  with

  ```ts
  import { StrictMode } from 'react'
  import { createRoot } from 'react-dom/client'
  import '@fontsource/ibm-plex-sans/400.css'
  import '@fontsource/ibm-plex-sans/500.css'
  import '@fontsource/ibm-plex-sans/600.css'
  import './index.css'
  ```

- [ ] **Step 8: Add the pre-paint script.** In `index.html`, replace

  ```html
      <title>Cutting Board Pattern Designer</title>
    </head>
  ```

  with

  ```html
      <title>Cutting Board Pattern Designer</title>
      <script>
        // Shell spec §3: set the resolved theme before first paint. Mirrors
        // resolveTheme and the prefs validation in src/editor/layout.ts;
        // anything unreadable (no storage, bad JSON, foreign values) is dark.
        ;(function () {
          var theme = 'dark'
          try {
            var prefs = JSON.parse(localStorage.getItem('cbpd:prefs'))
            var pref = prefs && prefs.version === 1 && prefs.state ? prefs.state.theme : undefined
            if (pref === 'light') theme = 'light'
            else if (pref === 'system' && !matchMedia('(prefers-color-scheme: dark)').matches) theme = 'light'
          } catch (e) {}
          document.documentElement.dataset.theme = theme
          document.documentElement.style.colorScheme = theme
        })()
      </script>
    </head>
  ```

- [ ] **Step 9: Add `useThemeSync`.** Create `src/ui/theme.ts`:

  ```ts
  // Shell spec §3: after the pre-paint script, keep <html data-theme> and
  // color-scheme equal to the resolved preference, following the OS setting
  // live while the preference is 'system'.

  import { useEffect } from 'react'
  import { resolveTheme, useLayout } from '@/editor/layout'

  export function useThemeSync(): void {
    const pref = useLayout((s) => s.theme)
    useEffect(() => {
      const media = window.matchMedia('(prefers-color-scheme: dark)')
      const apply = (): void => {
        const theme = resolveTheme(pref, media.matches)
        document.documentElement.dataset.theme = theme
        document.documentElement.style.colorScheme = theme
      }
      apply()
      media.addEventListener('change', apply)
      return () => media.removeEventListener('change', apply)
    }, [pref])
  }
  ```

  In `src/ui/App.tsx`, add the import after `import { Toolbar } from './Toolbar.tsx'`:

  ```ts
  import { useThemeSync } from './theme.ts'
  ```

  Then replace

  ```tsx
  function App(): JSX.Element {
    useEffect(() => installKeyboardDispatcher(), [])
  ```

  with

  ```tsx
  function App(): JSX.Element {
    useEffect(() => installKeyboardDispatcher(), [])
    useThemeSync()
  ```

- [ ] **Step 10: Rewrite the tokens and base type in `src/index.css`.** Replace lines 1–23, from `:root {` through the `html, body { … }` block, with:

  ```css
  /* Shell spec §2.1 colour tokens. `data-theme` on <html> always holds the
     resolved theme (§3). Tooltips are dark in both themes (--tip-bg), so the
     tooltip surfaces take the dark set too. */
  :root[data-theme='dark'],
  .tooltip,
  .hint {
    color-scheme: dark;
    --paste: #1a1c20;
    --panel: #202328;
    --raised: #2a2e34;
    --line: #32363d;
    --line-strong: #4a5059;
    --text: #e7e9ec;
    --muted: #8e96a1;
    --acc: #3d9bff;
    --acc-ink: #06121f;
    --acc-soft: rgb(61 155 255 / 16%);
    --attn: #f5b042;
    --ok: #46c07a;
    --danger: #ff6b5e;
    --tip-bg: #2e3238;
    --shadow: 0 8px 24px rgb(0 0 0 / 35%);
  }

  :root[data-theme='light'] {
    color-scheme: light;
    --paste: #e9ebee;
    --panel: #ffffff;
    --raised: #f0f2f4;
    --line: #dfe2e6;
    --line-strong: #c3c8cf;
    --text: #1c1f24;
    --muted: #6b7380;
    --acc: #1f6fe5;
    --acc-ink: #ffffff;
    --acc-soft: rgb(31 111 229 / 11%);
    --attn: #b86e00;
    --ok: #2fb36a;
    --danger: #c0392b;
    --tip-bg: #2e3238;
    --shadow: 0 8px 24px rgb(20 30 50 / 12%);
  }

  /* §2.2 type: IBM Plex Sans (self-hosted, src/main.tsx), 13 px in the UI. The
     root stays 16 px so the existing rem-based sizes are unchanged. */
  :root {
    font: 400 16px/1.5 'IBM Plex Sans', system-ui, sans-serif;
  }

  html,
  body {
    margin: 0;
    height: 100%;
    overflow: hidden;
    overscroll-behavior: none;
    background: var(--panel);
    color: var(--text);
  }

  body {
    font-size: 13px;
  }

  button,
  input,
  select,
  textarea {
    font: inherit;
  }

  input[type='number'] {
    font-variant-numeric: tabular-nums;
  }

  /* §2.3 focus and motion. */
  :focus-visible {
    outline: 2px solid var(--acc);
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
      transition: none !important;
      animation: none !important;
    }
  }
  ```

- [ ] **Step 11: Replace the old colour variables in the rest of `src/index.css`.** Use replace-all edits, in this order:

  | Find (every occurrence) | Replace with |
  | --- | --- |
  | `color-mix(in srgb, var(--ink) 20%, transparent)` | `var(--line)` |
  | `color-mix(in srgb, var(--ink) 25%, transparent)` | `var(--line)` |
  | `color-mix(in srgb, var(--ink) 30%, transparent)` | `var(--line-strong)` |
  | `box-shadow: 0 4px 16px color-mix(in srgb, black 25%, transparent);` | `box-shadow: var(--shadow);` |
  | `fill: var(--page-bg);` in `.board-mat` and `.context-scrim-rect` | `fill: var(--paste);` |
  | `fill: var(--page-bg);` in `.popover-arrow` | `fill: var(--panel);` |
  | `background: var(--page-bg);` | `background: var(--panel);` |
  | `outline: 2px solid var(--ink);` | `outline: 2px solid var(--acc);` |
  | `color: #c0392b;` | `color: var(--danger);` |

  Then make four single edits.

  1. `.tooltip`. Replace

     ```css
       background: var(--ink);
       color: var(--page-bg);
     ```

     with

     ```css
       background: var(--tip-bg);
       color: var(--text);
     ```

  2. `.recovery-banner`. Replace

     ```css
       background: color-mix(in srgb, orange 20%, var(--page-bg));
     ```

     with

     ```css
       background: var(--raised);
       border-left: 3px solid var(--attn);
     ```

  3. `.canvas-host`. After `min-height: 0;`, inside its rule, add

     ```css
       background: var(--paste);
     ```

  4. The dialog. Append to `.dialog-content`'s rule:

     ```css
       color: var(--text);
     ```

  Verify nothing remains:

  ```bash
  grep -nE "\-\-ink|\-\-page-bg|#c0392b|orange" src/index.css
  ```

  Expected: no output. The `#c0392b` in the light token block is written as `--danger: #c0392b;` and is expected. Run `grep -n "#c0392b" src/index.css` and expect exactly one line, the `--danger` declaration.

- [ ] **Step 12: Retoken the overlays (§9.8).** Colours go through `style`, so `var()` resolves in every engine and follows `data-theme` without re-rendering.

  `src/render/overlays/Selection.tsx`: replace lines 1–2 with

  ```ts
  // SPEC §7.8 / shell spec §9.8: the selection outline — a dashed double
  // stroke, #ffffff over the accent, so it reads on any material. Widths are
  // screen px converted through zoom.
  ```

  and replace

  ```tsx
              <rect {...rect} stroke="#1a1a1a" strokeWidth={3 * px} />
  ```

  with

  ```tsx
              <rect {...rect} style={{ stroke: 'var(--acc)' }} strokeWidth={3 * px} />
  ```

  `src/render/overlays/VertexHandles.tsx`: replace

  ```ts
    const stroke = { fill: '#ffffff', stroke: '#1a1a1a', strokeWidth: 1.5 * px }
  ```

  with

  ```ts
    const stroke = { fill: '#ffffff', style: { stroke: 'var(--acc)' }, strokeWidth: 1.5 * px }
  ```

  `src/render/overlays/SnapGuide.tsx`: delete the line `  const color = '#d93025'`. Then replace

  ```tsx
      line = <line x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke={color} strokeWidth={px} strokeDasharray={`${6 * px} ${4 * px}`} />
  ```

  with

  ```tsx
      line = <line x1={p.x} y1={p.y} x2={q.x} y2={q.y} style={{ stroke: 'var(--attn)' }} strokeWidth={px} strokeDasharray={`${6 * px} ${4 * px}`} />
  ```

  and replace

  ```tsx
        <rect x={at.x - r} y={at.y - r} width={2 * r} height={2 * r} fill="none" stroke={color} strokeWidth={1.5 * px} />
  ```

  with

  ```tsx
        <rect x={at.x - r} y={at.y - r} width={2 * r} height={2 * r} fill="none" style={{ stroke: 'var(--attn)' }} strokeWidth={1.5 * px} />
  ```

  `src/render/overlays/DrawPreview.tsx`: Task 6 replaces this with the true-width preview. For now only its current colours change. Replace

  ```ts
    const stroke = { fill: 'none', stroke: '#1a73e8', strokeWidth: 1.5 * px }
  ```

  with

  ```ts
    const stroke = { fill: 'none', style: { stroke: 'var(--acc)' }, strokeWidth: 1.5 * px }
  ```

  Replace

  ```tsx
          <text x={end.x + 10 * px} y={end.y - 10 * px} fontSize={12 * px} fill="#1a73e8" stroke="#ffffff" strokeWidth={3 * px} paintOrder="stroke">
  ```

  with

  ```tsx
          <text x={end.x + 10 * px} y={end.y - 10 * px} fontSize={12 * px} style={{ fill: 'var(--acc)' }} stroke="#ffffff" strokeWidth={3 * px} paintOrder="stroke">
  ```

  Replace

  ```tsx
          <circle key={k} cx={p.x} cy={p.y} r={3 * px} fill="#ffffff" stroke="#1a73e8" strokeWidth={1.5 * px} />
  ```

  with

  ```tsx
          <circle key={k} cx={p.x} cy={p.y} r={3 * px} fill="#ffffff" style={{ stroke: 'var(--acc)' }} strokeWidth={1.5 * px} />
  ```

  `src/render/overlays/Grid.tsx`: replace

  ```tsx
            <path d={`M ${gridMm} 0 H 0 V ${gridMm}`} fill="none" stroke="#808080" strokeOpacity={0.35} strokeWidth={px} />
  ```

  with

  ```tsx
            <path d={`M ${gridMm} 0 H 0 V ${gridMm}`} fill="none" style={{ stroke: 'var(--muted)' }} strokeOpacity={0.3} strokeWidth={px} />
  ```

  Verify:

  ```bash
  grep -nE "#[0-9a-fA-F]{3,6}" src/render/overlays/{Selection,VertexHandles,SnapGuide,DrawPreview,Grid}.tsx
  ```

  Expected: only `#ffffff` lines. `CrossingMarkers.tsx` keeps its colours until Task 7, and `Pivot.tsx`'s `#1a1a1a`/`#ffffff` are allowed (§9.8).

- [ ] **Step 13: Move the e2e baseline to 1440×900.** Replace the whole of `playwright.config.ts` with:

  ```ts
  import { defineConfig, devices } from '@playwright/test'

  // Shell spec §16: 1440×900 fits both panes beside a usable canvas; the
  // narrow (<1024 px) layout is tested explicitly at 820×1180.
  const viewport = { width: 1440, height: 900 }

  export default defineConfig({
    testDir: 'e2e',
    fullyParallel: true,
    reporter: 'list',
    use: {
      baseURL: 'http://localhost:5173',
      viewport,
    },
    webServer: {
      command: 'pnpm dev',
      port: 5173,
      reuseExistingServer: true,
    },
    projects: [
      { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport } },
      { name: 'firefox', use: { ...devices['Desktop Firefox'], viewport } },
      { name: 'webkit', use: { ...devices['Desktop Safari'], viewport } },
      { name: 'chromium-touch', use: { ...devices['Desktop Chrome'], viewport, hasTouch: true, isMobile: true } },
    ],
  })
  ```

- [ ] **Step 14: Fix the two selection-stroke assertions.** The dark stroke is now the resolved accent, set through `style`.

  In `e2e/tablet.spec.ts`, replace lines 172–178:

  ```ts
    test('the selection outline draws both strokes', async ({ page }) => {
      await seed(page)
      await select(page, ['b1'])
      await nextFrame(page)
      const strokes = await page.locator('.selection-overlay rect').evaluateAll((els) => els.map((el) => el.getAttribute('stroke')))
      expect(new Set(strokes)).toEqual(new Set(['#1a1a1a', '#ffffff']))
    })
  ```

  with

  ```ts
    test('the selection outline draws both strokes: #ffffff over the accent', async ({ page }) => {
      await seed(page)
      await select(page, ['b1'])
      await nextFrame(page)
      const strokes = await page.locator('.selection-overlay rect').evaluateAll((els) => els.map((el) => getComputedStyle(el).stroke))
      expect(new Set(strokes)).toEqual(new Set(['rgb(255, 255, 255)', 'rgb(61, 155, 255)'])) // --acc, dark theme (shell spec §2.1)
    })
  ```

  In `e2e/a11y.spec.ts`, replace

  ```ts
      const strokes = await page.locator('.selection-overlay rect').evaluateAll((els) => els.map((el) => el.getAttribute('stroke')))
      expect(new Set(strokes)).toEqual(new Set(['#1a1a1a', '#ffffff']))
  ```

  with

  ```ts
      const strokes = await page.locator('.selection-overlay rect').evaluateAll((els) => els.map((el) => getComputedStyle(el).stroke))
      expect(new Set(strokes)).toEqual(new Set(['rgb(255, 255, 255)', 'rgb(61, 155, 255)'])) // #ffffff over --acc (shell spec §9.8)
  ```

- [ ] **Step 15: Run the new spec in every engine.**

  ```bash
  pnpm exec playwright test e2e/theme.spec.ts
  ```

  Expected: PASS, 10 tests × 4 projects.

- [ ] **Step 16: Run the whole suite at the new viewport.**

  ```bash
  pnpm typecheck && pnpm test && pnpm test:e2e
  ```

  Expected: all pass. Hard-coded client points in `camera.spec.ts` (500, 400 and 540, 420), `interaction-proof.spec.ts` (500, 400) and `tablet.spec.ts` (500 ± 180, 400) all still fall inside the canvas at 1440×900: the canvas spans roughly x ∈ [110, 1160] and y ∈ [50, 900]. Everything else maps world points through `toClient`.
  - If a spec fails, find the cause with `superpowers:systematic-debugging` before editing it. Never loosen a tolerance.

- [ ] **Step 17: Commit.**

  ```bash
  git add package.json pnpm-lock.yaml index.html src/main.tsx src/index.css src/editor/layout.ts src/editor/layout.test.ts src/ui/theme.ts src/ui/App.tsx src/render/overlays/Selection.tsx src/render/overlays/VertexHandles.tsx src/render/overlays/SnapGuide.tsx src/render/overlays/DrawPreview.tsx src/render/overlays/Grid.tsx playwright.config.ts e2e/theme.spec.ts e2e/tablet.spec.ts e2e/a11y.spec.ts
  FSH_NO_TTY=1 git commit -m "Add theme tokens, layout store and dark default" -m "Shell spec 2-3 and 11: every later UI task styles against the token set, and the persisted layout store holds prefs that must survive corrupt or unwritable storage without blanking the app or touching saveStatus. The pre-paint script avoids a theme flash. The e2e baseline moves to 1440x900 so both panes fit beside the canvas."
  ```

---

### Task 2: Shortcut table, Keycap, Hint and the shortcuts sheet

**Files:**
- Create:
  - `src/editor/shortcuts.ts`
  - `src/editor/shortcuts.test.ts`
  - `src/ui/Keycap.tsx`
  - `src/ui/Hint.tsx`
  - `src/ui/ShortcutsDialog.tsx`
  - `e2e/tooltips.spec.ts`
- Modify:
  - `src/editor/layout.ts`: `LayoutState` and the store body.
  - `src/editor/layout.test.ts`: the reset and the partialize test.
  - `src/editor/keyboard.ts`: imports (lines 30–37), and the new `?` block after the Escape block (lines 239–243).
  - `src/ui/Toolbar.tsx`: imports, and `toolButton` (lines 58–70).
  - `src/ui/App.tsx`: imports, and the `Tooltip.Provider` line with its children.
  - `src/index.css`: appends the section "Shell spec §12.3 tooltips, keycaps, shortcuts sheet".
  - `package.json` and `pnpm-lock.yaml`: `jsdom` as a dev dependency.

**Interfaces:**
- Consumes (Task 1): `useLayout`, `LayoutState` from `@/editor/layout`; the `.hint` dark token scope in `src/index.css`.
- Produces:

  ```ts
  // src/editor/shortcuts.ts
  export type ShortcutGroup = 'Tools' | 'Selection' | 'Drawing' | 'View' | 'Project' | 'Panels'
  export interface Shortcut { readonly label: string; readonly keys: readonly string[]; readonly hint?: string; readonly group: ShortcutGroup }
  export const SHORTCUTS  // as const satisfies Record<string, Shortcut>; ids include the Tool names 'select' | 'hand' | 'band' | 'rect' | 'polygon' | 'crossing'
  export type ShortcutId = keyof typeof SHORTCUTS
  export const DISPLAY_ONLY: readonly ShortcutId[]   // ['hand', 'snapOff']
  export type Platform = 'mac' | 'other'
  export function detectPlatform(): Platform
  export function formatChord(chord: string, platform: Platform): string[]
  // src/editor/layout.ts (added, not persisted)
  shortcutsOpen: boolean; setShortcutsOpen(o: boolean): void
  // src/ui/Keycap.tsx
  export function Keycap({ label, muted }: { label: string; muted?: boolean }): JSX.Element
  export function ChordKeys({ chord, muted }: { chord: string; muted?: boolean }): JSX.Element
  // src/ui/Hint.tsx
  export interface HintProps { children: ReactElement; shortcut?: ShortcutId; label?: string; keys?: readonly string[]; hint?: string; state?: 'on' | 'off'; disabledReason?: string; side?: 'top' | 'right' | 'bottom' | 'left' }
  export function Hint(props: HintProps): JSX.Element   // side defaults to 'top'
  // src/ui/ShortcutsDialog.tsx
  export function ShortcutsDialog(): JSX.Element
  ```

  - `App.tsx` renders `<ShortcutsDialog />` inside `<Tooltip.Provider delayDuration={400} skipDelayDuration={300}>`. **Task 3's App rewrite must keep both.**
  - Tasks 3 and 4 add `SHORTCUTS` entries. Each new dispatched entry needs a row in `CASES` in `shortcuts.test.ts`; the exhaustiveness test fails until it has one.

- [ ] **Step 1: Add jsdom for the dispatcher test.**

  ```bash
  pnpm add -D jsdom
  ```

  Expected: `devDependencies` gains `jsdom`.

- [ ] **Step 2: Write the failing shortcut test.** Create `src/editor/shortcuts.test.ts`:

  ```ts
  // @vitest-environment jsdom
  // Shell spec §12.1, §16: every SHORTCUTS entry that keyboard.ts dispatches
  // produces its effect when its first chord is pressed (Space and Alt are
  // display-only: Canvas and snapping own them), formatChord per platform,
  // and Review Focus 3 — `?` typed in a field never opens the sheet.

  import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
  import { translateObjects } from '@/domain/commands'
  import type { Band } from '@/domain/model'
  import { band, MAT, project } from '@/domain/test-builders'
  import { copySelection, installKeyboardDispatcher, pasteClipboard } from './keyboard.ts'
  import { useLayout } from './layout.ts'
  import type { Shortcut, ShortcutId } from './shortcuts.ts'
  import { detectPlatform, DISPLAY_ONLY, formatChord, SHORTCUTS } from './shortcuts.ts'
  import { useEditor } from './store.ts'

  const table: Readonly<Record<string, Shortcut>> = SHORTCUTS

  function reset(selection: string[] = ['a']): void {
    useEditor.setState({
      project: project([band('a', [[0, 0], [100, 0]]), band('b', [[0, 10], [100, 10]], { widthMm: 9 })]),
      selection,
      editContext: [],
      tool: 'select',
      drawing: null,
      preview: null,
      gridMm: 5,
      currentMaterialId: MAT,
      message: null,
    })
    useEditor.temporal.getState().clear()
    useLayout.setState({ shortcutsOpen: false })
  }

  /** Presses a platform-neutral chord as a real keydown on `target` (it bubbles to window). */
  function press(chord: string, target: EventTarget = document.body): void {
    const parts = chord.split('+')
    const key = parts[parts.length - 1]!
    target.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: key.length === 1 ? key.toLowerCase() : key,
        ctrlKey: parts.includes('Mod'),
        shiftKey: parts.includes('Shift') || key === '?',
        altKey: parts.includes('Alt'),
        bubbles: true,
        cancelable: true,
      }),
    )
  }

  const s = () => useEditor.getState()
  const bandAt = (id: string): Band => s().project.objects[id] as Band
  const drawing = (): void => useEditor.setState({ tool: 'band', drawing: { tool: 'band', points: [{ x: 0, y: 40 }, { x: 50, y: 40 }], cursor: null } })

  interface Case {
    setup?: () => void
    check: () => void
  }

  const CASES: Record<Exclude<ShortcutId, 'hand' | 'snapOff'>, Case> = {
    select: { setup: () => s().setTool('band'), check: () => expect(s().tool).toBe('select') },
    band: { check: () => expect(s().tool).toBe('band') },
    rect: { check: () => expect(s().tool).toBe('rect') },
    polygon: { check: () => expect(s().tool).toBe('polygon') },
    crossing: { check: () => expect(s().tool).toBe('crossing') },
    undo: {
      setup: () => s().run((p) => translateObjects(p, ['a'], 10, 0)),
      check: () => expect(bandAt('a').points[0]!.x).toBe(0),
    },
    redo: {
      setup: () => {
        s().run((p) => translateObjects(p, ['a'], 10, 0))
        s().undo()
      },
      check: () => expect(bandAt('a').points[0]!.x).toBe(10),
    },
    duplicate: {
      check: () => {
        expect(s().project.rootChildren).toHaveLength(3)
        expect(s().selection).not.toEqual(['a'])
      },
    },
    copy: {
      setup: () => s().select(['b']),
      check: () => {
        pasteClipboard()
        expect(s().project.rootChildren).toHaveLength(3)
        expect(bandAt(s().selection[0]!).widthMm).toBe(9) // a copy of b, not of any earlier clipboard
      },
    },
    paste: {
      setup: () => copySelection(),
      check: () => expect(s().project.rootChildren).toHaveLength(3),
    },
    delete: { check: () => expect(s().project.rootChildren).toEqual(['b']) },
    makeMotif: {
      check: () => {
        expect(Object.keys(s().project.motifs)).toHaveLength(1)
        expect(s().project.objects[s().selection[0]!]!.type).toBe('motif-instance')
      },
    },
    nudge: { check: () => expect(bandAt('a').points[0]!.y).toBe(-5) },
    selectNext: { check: () => expect(s().selection).toEqual(['b']) },
    selectPrevious: { setup: () => s().select(['b']), check: () => expect(s().selection).toEqual(['a']) },
    escape: { check: () => expect(s().selection).toEqual([]) },
    finish: {
      setup: drawing,
      check: () => {
        expect(s().project.rootChildren).toHaveLength(3)
        expect(s().drawing).toBeNull()
      },
    },
    undoPoint: {
      setup: drawing,
      check: () => {
        expect(s().drawing!.points).toHaveLength(1)
        expect(s().project.rootChildren).toHaveLength(2) // Backspace did not delete the selection
      },
    },
    cancelDrawing: {
      setup: drawing,
      check: () => {
        expect(s().drawing).toBeNull()
        expect(s().selection).toEqual(['a']) // Esc cancelled drawing only, not the selection
      },
    },
    shortcuts: { check: () => expect(useLayout.getState().shortcutsOpen).toBe(true) },
  }

  describe('SHORTCUTS → keyboard.ts dispatch', () => {
    let uninstall: () => void = () => {}
    beforeAll(() => {
      uninstall = installKeyboardDispatcher()
    })
    afterAll(() => uninstall())
    beforeEach(() => reset())

    it('has a case for every dispatched entry', () => {
      const displayOnly: readonly string[] = DISPLAY_ONLY
      expect(Object.keys(CASES).sort()).toEqual(Object.keys(SHORTCUTS).filter((id) => !displayOnly.includes(id)).sort())
    })

    it.each(Object.entries(CASES))('%s: its first chord has its effect', (id, c) => {
      c.setup?.()
      press(table[id]!.keys[0]!)
      c.check()
    })

    it("hand's H selects the Hand tool (its Space alternative is Canvas-owned)", () => {
      press(table.hand!.keys[0]!)
      expect(s().tool).toBe('hand')
    })

    it('? typed in a text field does not open the sheet', () => {
      const input = document.createElement('input')
      document.body.append(input)
      press('?', input)
      input.remove()
      expect(useLayout.getState().shortcutsOpen).toBe(false)
    })
  })

  describe('formatChord', () => {
    it.each([
      ['Mod+Shift+E', 'other', ['Ctrl', 'Shift', 'E']],
      ['Mod+Shift+E', 'mac', ['⌘', '⇧', 'E']],
      ['Alt', 'mac', ['⌥']],
      ['Alt', 'other', ['Alt']],
      ['Mod+\\', 'other', ['Ctrl', '\\']],
      ['ArrowUp', 'other', ['↑']],
      ['ArrowDown', 'mac', ['↓']],
      ['ArrowLeft', 'other', ['←']],
      ['ArrowRight', 'other', ['→']],
      ['Escape', 'mac', ['Esc']],
      ['?', 'other', ['?']],
      ['B', 'mac', ['B']],
    ] as const)('%s on %s', (chord, platform, expected) => {
      expect(formatChord(chord, platform)).toEqual(expected)
    })
  })

  describe('detectPlatform', () => {
    it('reads userAgentData.platform first, then navigator.platform', () => {
      vi.stubGlobal('navigator', { platform: 'MacIntel' })
      expect(detectPlatform()).toBe('mac')
      vi.stubGlobal('navigator', { platform: 'iPad' })
      expect(detectPlatform()).toBe('mac')
      vi.stubGlobal('navigator', { platform: 'MacIntel', userAgentData: { platform: 'Windows' } })
      expect(detectPlatform()).toBe('other')
      vi.stubGlobal('navigator', { platform: 'Linux x86_64' })
      expect(detectPlatform()).toBe('other')
      vi.unstubAllGlobals()
    })
  })
  ```

- [ ] **Step 3: Run it and see it fail.**

  ```bash
  pnpm test src/editor/shortcuts.test.ts
  ```

  Expected: FAIL, with `Failed to resolve import "./shortcuts.ts"`.

- [ ] **Step 4: Implement the table.** Create `src/editor/shortcuts.ts`:

  ```ts
  // Shell spec §12.1: the shortcut table, display data only. It feeds Hint
  // tooltips and the shortcuts sheet; keyboard.ts keeps its V1 dispatch
  // logic, and shortcuts.test.ts checks that every entry it dispatches has
  // the entry's effect. Chords are platform-neutral ('Mod' is Ctrl or ⌘),
  // joined with '+'; `keys` lists alternatives.

  export type ShortcutGroup = 'Tools' | 'Selection' | 'Drawing' | 'View' | 'Project' | 'Panels'

  export interface Shortcut {
    readonly label: string
    readonly keys: readonly string[]
    readonly hint?: string
    readonly group: ShortcutGroup
  }

  export const SHORTCUTS = {
    select: { label: 'Select', keys: ['V'], hint: 'Tap to select. Drag empty space to box-select.', group: 'Tools' },
    hand: { label: 'Hand', keys: ['H', 'Space'], hint: 'Drag to pan. Or hold Space.', group: 'Tools' },
    band: { label: 'Band', keys: ['B'], hint: 'Draw a strip of wood. Tap to place points.', group: 'Tools' },
    rect: { label: 'Rectangle', keys: ['R'], hint: 'Drag corner to corner.', group: 'Tools' },
    polygon: { label: 'Polygon', keys: ['P'], hint: 'Tap to place corners. Tap the first to close.', group: 'Tools' },
    crossing: { label: 'Crossing', keys: ['X'], hint: 'Choose which band is on top where two cross.', group: 'Tools' },
    duplicate: { label: 'Duplicate', keys: ['Mod+D'], group: 'Selection' },
    copy: { label: 'Copy', keys: ['Mod+C'], group: 'Selection' },
    paste: { label: 'Paste', keys: ['Mod+V'], group: 'Selection' },
    delete: { label: 'Delete', keys: ['Delete', 'Backspace'], group: 'Selection' },
    makeMotif: { label: 'Make motif', keys: ['Mod+G'], group: 'Selection' },
    nudge: { label: 'Nudge', keys: ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'], hint: 'One grid step. Hold Shift for ×10.', group: 'Selection' },
    selectNext: { label: 'Select next object', keys: [']'], group: 'Selection' },
    selectPrevious: { label: 'Select previous object', keys: ['['], group: 'Selection' },
    escape: { label: 'Deselect, or leave the motif', keys: ['Escape'], hint: 'Also cancels a drag in progress.', group: 'Selection' },
    finish: { label: 'Finish', keys: ['Enter'], group: 'Drawing' },
    undoPoint: { label: 'Undo point', keys: ['Backspace', 'Mod+Z'], group: 'Drawing' },
    cancelDrawing: { label: 'Cancel', keys: ['Escape'], group: 'Drawing' },
    snapOff: { label: 'Snap off while held', keys: ['Alt'], group: 'Drawing' },
    undo: { label: 'Undo', keys: ['Mod+Z'], group: 'Project' },
    redo: { label: 'Redo', keys: ['Mod+Shift+Z', 'Mod+Y'], group: 'Project' },
    shortcuts: { label: 'Keyboard shortcuts', keys: ['?'], group: 'Project' },
  } as const satisfies Record<string, Shortcut>

  export type ShortcutId = keyof typeof SHORTCUTS

  /**
   * Entries whose effect keyboard.ts does not dispatch: Space (hand's
   * alternative) is owned by Canvas.tsx, Alt by snapping (V1 §7.2, §7.7).
   * Hand's own H key is dispatched and tested separately.
   */
  export const DISPLAY_ONLY: readonly ShortcutId[] = ['hand', 'snapOff']

  export type Platform = 'mac' | 'other'

  export function detectPlatform(): Platform {
    const nav: Navigator & { userAgentData?: { platform: string } } = navigator
    return /mac|iphone|ipad/i.test(nav.userAgentData?.platform ?? nav.platform) ? 'mac' : 'other'
  }

  const MODIFIERS: Record<Platform, Readonly<Record<string, string>>> = {
    mac: { Mod: '⌘', Alt: '⌥', Shift: '⇧' },
    other: { Mod: 'Ctrl', Alt: 'Alt', Shift: 'Shift' },
  }

  const KEY_NAMES: Readonly<Record<string, string>> = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Escape: 'Esc' }

  /** 'Mod+Shift+E' → ['Ctrl', 'Shift', 'E'] or ['⌘', '⇧', 'E']; 'ArrowUp' → ['↑']; 'Escape' → ['Esc']. */
  export function formatChord(chord: string, platform: Platform): string[] {
    return chord.split('+').map((part) => MODIFIERS[platform][part] ?? KEY_NAMES[part] ?? part)
  }
  ```

- [ ] **Step 5: Add `shortcutsOpen` to the layout store.** In `src/editor/layout.ts`, replace

  ```ts
    setToolsDocked(d: boolean): void
  }
  ```

  with

  ```ts
    setToolsDocked(d: boolean): void
    shortcutsOpen: boolean // not persisted
    setShortcutsOpen(o: boolean): void
  }
  ```

  Then replace

  ```ts
        setToolsDocked: (toolsDocked) => set({ toolsDocked }),
      }),
  ```

  with

  ```ts
        setToolsDocked: (toolsDocked) => set({ toolsDocked }),
        shortcutsOpen: false,
        setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
      }),
  ```

  `partialize` already lists only the three persisted fields. Pin it in `src/editor/layout.test.ts`: replace

  ```ts
      useLayout.getState().setLeftTab('wood')
      expect(JSON.parse(s.getItem(PREFS_KEY)!)).toEqual({ state: { theme: 'dark', leftTab: 'wood', toolsDocked: true }, version: 1 })
  ```

  with

  ```ts
      useLayout.getState().setLeftTab('wood')
      useLayout.getState().setShortcutsOpen(true)
      expect(JSON.parse(s.getItem(PREFS_KEY)!)).toEqual({ state: { theme: 'dark', leftTab: 'wood', toolsDocked: true }, version: 1 })
  ```

  and replace

  ```ts
    useLayout.setState({ theme: 'dark', leftTab: 'layers', toolsDocked: true })
  })
  ```

  with

  ```ts
    useLayout.setState({ theme: 'dark', leftTab: 'layers', toolsDocked: true, shortcutsOpen: false })
  })
  ```

- [ ] **Step 6: Add the `?` binding to `keyboard.ts`.** `TOOL_KEYS` stays as it is: deriving it from `SHORTCUTS` would not be a direct substitution. The per-tool rows in `CASES` and the Hand test assert that the two agree.

  Add the import after `import { cancelDrawing, finishDrawing, undoPoint } from './tools/draw.ts'`:

  ```ts
  import { useLayout } from './layout.ts'
  ```

  Replace

  ```ts
      if (key === 'Escape') {
        handleEscape()
        e.preventDefault()
        return
      }

      if (mod && !e.altKey) {
  ```

  with

  ```ts
      if (key === 'Escape') {
        handleEscape()
        e.preventDefault()
        return
      }

      // Shell spec §12.1: `?` matches e.key with Shift ignored (it is Shift+/ on most layouts).
      if (key === '?' && !ctrlOrMeta && !e.altKey) {
        useLayout.getState().setShortcutsOpen(true)
        e.preventDefault()
        return
      }

      if (mod && !e.altKey) {
  ```

  Also add this line to the header comment, after the line `// Create Motif.`:

  ```ts
  // `?` opens the keyboard shortcuts sheet (shell spec §10.3).
  ```

- [ ] **Step 7: Run the unit tests and see them pass.**

  ```bash
  pnpm test src/editor/shortcuts.test.ts src/editor/layout.test.ts
  ```

  Expected: PASS.
  - **Mutation check** (testing.md). Temporarily change `'?'` to `'/'` in the new keyboard.ts block. Expect `shortcuts: its first chord has its effect` to fail. Restore it.

- [ ] **Step 8: Write the failing tooltip e2e spec.** Create `e2e/tooltips.spec.ts`:

  ```ts
  // Shell spec §12.3 Hint and §10.3 shortcuts sheet: hovering a tool shows its
  // label, keycap and hint line; `?` opens the sheet; a touch long-press shows
  // the tooltip without activating the tool and the next press closes it.

  import { expect, test } from '@playwright/test'
  import { nextFrame, open, Touch } from './helpers.ts'

  test('hovering the Band tool shows its label, keycap and hint', async ({ page, isMobile }) => {
    test.skip(isMobile, 'hover is a fine-pointer interaction')
    await open(page)
    await page.getByRole('button', { name: 'Band', exact: true }).hover()
    await expect(page.locator('.hint')).toBeVisible()
    const tip = page.getByRole('tooltip')
    await expect(tip).toContainText('Band')
    await expect(tip).toContainText('Draw a strip of wood. Tap to place points.')
    await expect(tip.locator('.keycap')).toHaveText('B')
  })

  test('every tool button has a Hint naming it', async ({ page, isMobile }) => {
    test.skip(isMobile, 'hover is a fine-pointer interaction')
    await open(page)
    for (const [name, key] of [['Select', 'V'], ['Hand', 'H'], ['Band', 'B'], ['Rectangle', 'R'], ['Polygon', 'P'], ['Crossing', 'X']] as const) {
      await page.getByRole('button', { name, exact: true }).hover()
      const tip = page.getByRole('tooltip')
      await expect(tip).toContainText(name)
      await expect(tip.locator('.keycap').first()).toHaveText(key)
    }
  })

  test('? opens the keyboard shortcuts sheet', async ({ page }) => {
    await open(page)
    await page.keyboard.press('?')
    const sheet = page.getByRole('dialog', { name: 'Keyboard shortcuts' })
    await expect(sheet).toBeVisible()
    await expect(sheet).toContainText('Make motif')
    await expect(sheet.getByRole('heading', { name: 'Tools' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(sheet).toBeHidden()
  })

  test('a touch long-press shows the tooltip without activating the tool', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'touch long-press runs in chromium-touch')
    await open(page)
    const button = page.getByRole('button', { name: 'Band', exact: true })
    const box = (await button.boundingBox())!
    const at = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    const touch = await Touch.attach(page)
    await touch.start([at])
    await expect(page.locator('.hint')).toBeVisible() // appears while held: the 500 ms timer
    await expect(page.getByRole('tooltip')).toContainText('Band')
    await touch.end([])
    await nextFrame(page)
    expect(await page.evaluate(() => window.__cbpd!.getState().tool)).toBe('select')
    await expect(page.locator('.hint')).toBeVisible() // stays after release
    const canvas = (await page.locator('.canvas').boundingBox())!
    await page.touchscreen.tap(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2)
    await expect(page.locator('.hint')).toBeHidden() // the next pointerdown anywhere closes it
  })
  ```

  **Limitation.** Chromium's touch emulation may not fire `click` after a 500 ms or longer hold (it treats the hold as a long-press gesture). If so, the "tool not activated" assertion also holds without the click suppression. The visible-while-held and close-on-next-press assertions are the parts that fail if `Hint`'s touch path breaks. The click suppression is covered by the iPad checklist in `docs/decisions/` (Task 10's final report).

- [ ] **Step 9: Run it and see it fail.**

  ```bash
  pnpm exec playwright test e2e/tooltips.spec.ts --project=chromium --project=chromium-touch
  ```

  Expected: FAIL. `.hint` is never visible, and the `dialog` named "Keyboard shortcuts" is not found.

- [ ] **Step 10: Implement `Keycap`.** Create `src/ui/Keycap.tsx`:

  ```tsx
  // Shell spec §12.3 keycaps, shared by tooltips, the shortcuts sheet and
  // menus (muted there).

  import type { JSX } from 'react'
  import { detectPlatform, formatChord } from '@/editor/shortcuts'

  export function Keycap({ label, muted }: { label: string; muted?: boolean }): JSX.Element {
    return <kbd className={muted === true ? 'keycap keycap-muted' : 'keycap'}>{label}</kbd>
  }

  export function ChordKeys({ chord, muted }: { chord: string; muted?: boolean }): JSX.Element {
    return (
      <span className="chord">
        {formatChord(chord, detectPlatform()).map((k, i) => (
          <Keycap key={i} label={k} muted={muted === true} />
        ))}
      </span>
    )
  }
  ```

- [ ] **Step 11: Implement `Hint`.** Create `src/ui/Hint.tsx`:

  ```tsx
  // Shell spec §12.3: a Radix Tooltip showing a label, keycaps, an optional
  // toggle state, and a hint line (or, for a disabled control, the reason —
  // the trigger is then wrapped in a span, since a disabled button gets no
  // pointer events). Radix ignores touch, so a touch press held for 500 ms
  // opens the tooltip itself, suppresses that press's click, and closes on
  // the next pointerdown anywhere.

  import * as Tooltip from '@radix-ui/react-tooltip'
  import type { JSX, MouseEvent, PointerEvent, ReactElement } from 'react'
  import { Fragment, useEffect, useRef, useState } from 'react'
  import type { Shortcut, ShortcutId } from '@/editor/shortcuts'
  import { SHORTCUTS } from '@/editor/shortcuts'
  import { ChordKeys } from './Keycap.tsx'

  const LONG_PRESS_MS = 500

  export interface HintProps {
    children: ReactElement
    shortcut?: ShortcutId
    label?: string
    keys?: readonly string[]
    hint?: string
    state?: 'on' | 'off'
    disabledReason?: string
    side?: 'top' | 'right' | 'bottom' | 'left'
  }

  export function Hint({ children, shortcut, label, keys, hint, state, disabledReason, side = 'top' }: HintProps): JSX.Element {
    const entry: Shortcut | undefined = shortcut === undefined ? undefined : SHORTCUTS[shortcut]
    const text = label ?? entry?.label ?? ''
    const chords = keys ?? entry?.keys ?? []
    const line = disabledReason ?? hint ?? entry?.hint
    const [open, setOpen] = useState(false)
    const [touchOpen, setTouchOpen] = useState(false)
    const timer = useRef<number | undefined>(undefined)
    const longPressed = useRef(false)

    useEffect(() => () => window.clearTimeout(timer.current), [])

    useEffect(() => {
      if (!touchOpen) return
      const close = (): void => {
        setTouchOpen(false)
        setOpen(false)
      }
      document.addEventListener('pointerdown', close, { capture: true, once: true })
      return () => document.removeEventListener('pointerdown', close, { capture: true })
    }, [touchOpen])

    const onPointerDown = (e: PointerEvent): void => {
      longPressed.current = false
      if (e.pointerType !== 'touch') return
      timer.current = window.setTimeout(() => {
        longPressed.current = true
        setOpen(true)
        setTouchOpen(true)
      }, LONG_PRESS_MS)
    }
    const endPress = (): void => window.clearTimeout(timer.current)
    // Capture phase: runs before the button's own onClick and before Radix closes the tooltip on click.
    const onClickCapture = (e: MouseEvent): void => {
      if (!longPressed.current) return
      longPressed.current = false
      e.preventDefault()
      e.stopPropagation()
    }

    return (
      <Tooltip.Root open={open} onOpenChange={(o) => !touchOpen && setOpen(o)}>
        <Tooltip.Trigger asChild className="hint-trigger" onPointerDown={onPointerDown} onPointerUp={endPress} onPointerCancel={endPress} onPointerLeave={endPress} onClickCapture={onClickCapture}>
          {disabledReason === undefined ? children : <span className="hint-disabled">{children}</span>}
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content className="hint" side={side} sideOffset={6} collisionPadding={8}>
            <div className="hint-row">
              <span className="hint-label">{text}</span>
              {state !== undefined && <span className={state === 'on' ? 'hint-state hint-on' : 'hint-state'}>{state === 'on' ? 'On' : 'Off'}</span>}
              {chords.length > 0 && (
                <span className="hint-keys">
                  {chords.map((c, i) => (
                    <Fragment key={c}>
                      {i > 0 && <span className="hint-or">or</span>}
                      <ChordKeys chord={c} />
                    </Fragment>
                  ))}
                </span>
              )}
            </div>
            {line !== undefined && <div className="hint-line">{line}</div>}
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    )
  }
  ```

- [ ] **Step 12: Implement `ShortcutsDialog`.** Create `src/ui/ShortcutsDialog.tsx`:

  ```tsx
  // Shell spec §10.3: every SHORTCUTS entry, grouped, with the tooltips' keycaps.
  // Opened by `?` (keyboard.ts) or the project menu (Task 3) through useLayout.

  import * as Dialog from '@radix-ui/react-dialog'
  import type { JSX } from 'react'
  import { Fragment } from 'react'
  import { useLayout } from '@/editor/layout'
  import type { Shortcut, ShortcutGroup } from '@/editor/shortcuts'
  import { SHORTCUTS } from '@/editor/shortcuts'
  import { ChordKeys } from './Keycap.tsx'

  const GROUPS: readonly ShortcutGroup[] = ['Tools', 'Selection', 'Drawing', 'View', 'Project', 'Panels']

  export function ShortcutsDialog(): JSX.Element {
    const open = useLayout((s) => s.shortcutsOpen)
    const setOpen = useLayout((s) => s.setShortcutsOpen)
    const entries: Array<[string, Shortcut]> = Object.entries(SHORTCUTS)
    return (
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog-content shortcuts-dialog" aria-describedby={undefined}>
            <Dialog.Title className="dialog-title">Keyboard shortcuts</Dialog.Title>
            {GROUPS.map((group) => {
              const rows = entries.filter(([, s]) => s.group === group)
              if (rows.length === 0) return null
              return (
                <section key={group} className="shortcuts-group">
                  <h3>{group}</h3>
                  <dl>
                    {rows.map(([id, s]) => (
                      <div key={id} className="shortcuts-row">
                        <dt>{s.label}</dt>
                        <dd>
                          {s.keys.map((k, i) => (
                            <Fragment key={k}>
                              {i > 0 && <span className="hint-or">or</span>}
                              <ChordKeys chord={k} />
                            </Fragment>
                          ))}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </section>
              )
            })}
            <div className="button-row">
              <Dialog.Close asChild>
                <button type="button">Close</button>
              </Dialog.Close>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    )
  }
  ```

- [ ] **Step 13: Mount the sheet and set the tooltip timing in `App.tsx`.** Add the import after `import { useThemeSync } from './theme.ts'`:

  ```ts
  import { ShortcutsDialog } from './ShortcutsDialog.tsx'
  ```

  Replace

  ```tsx
      <Tooltip.Provider delayDuration={400}>
  ```

  with

  ```tsx
      <Tooltip.Provider delayDuration={400} skipDelayDuration={300}>
  ```

  and replace

  ```tsx
          </div>
        </div>
      </Tooltip.Provider>
  ```

  with

  ```tsx
          </div>
        </div>
        <ShortcutsDialog />
      </Tooltip.Provider>
  ```

- [ ] **Step 14: Put Hints on the rail's tool buttons.** `Toolbar.tsx` is replaced in Task 3; this makes Hint testable now. The buttons' accessible names are unchanged, and the `title` attributes go, since the Hint replaces them.

  In `src/ui/Toolbar.tsx`, add the imports after `import { useEditor } from '@/editor/store'`:

  ```ts
  import { SHORTCUTS } from '@/editor/shortcuts'
  import { Hint } from './Hint.tsx'
  ```

  Replace

  ```tsx
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
  ```

  with

  ```tsx
    const toolButton = (t: Tool): JSX.Element => (
      <Hint shortcut={t} side="right">
        <button type="button" aria-pressed={tool === t} onClick={() => setTool(t)}>
          {SHORTCUTS[t].label}
        </button>
      </Hint>
    )
    return (
      <header className="toolbar">
        {toolButton('select')}
        {toolButton('hand')}
        {toolButton('band')}
        {toolButton('rect')}
        {toolButton('polygon')}
        {toolButton('crossing')}
  ```

- [ ] **Step 15: Style the tooltip, keycaps and sheet.** Append to `src/index.css`:

  ```css
  /* Shell spec §12.3 tooltips, keycaps, shortcuts sheet. `.hint` takes the
     dark token set in both themes (top of this file). */
  .hint-trigger {
    -webkit-touch-callout: none;
    user-select: none;
    -webkit-user-select: none;
  }

  .hint-disabled {
    display: inline-flex;
  }

  .hint {
    z-index: 6;
    max-width: 280px;
    padding: 6px 8px;
    border-radius: 8px;
    background: var(--tip-bg);
    color: var(--text);
    box-shadow: var(--shadow);
    font-size: 12px;
    font-weight: 500;
    line-height: 1.4;
    animation: hint-fade 100ms ease-out;
  }

  @keyframes hint-fade {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .hint-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .hint-label {
    flex: 1;
  }

  .hint-state {
    color: var(--muted);
  }

  .hint-on {
    color: var(--ok);
  }

  .hint-keys,
  .shortcuts-row dd {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .hint-or {
    color: var(--muted);
    font-size: 11px;
    font-weight: 400;
  }

  .hint-line {
    margin-top: 2px;
    color: var(--muted);
    font-weight: 400;
  }

  .chord {
    display: inline-flex;
    gap: 2px;
  }

  /* Keycap fill and edge are fixed values from §12.3, not theme tokens. */
  .keycap {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    min-width: 19px;
    height: 19px;
    padding: 0 4px;
    border: 1px solid #4a5059;
    border-bottom-width: 2px;
    border-radius: 5px;
    background: #3a3f47;
    color: #e7e9ec;
    font-family: inherit;
    font-size: 10.5px;
    font-weight: 600;
    line-height: 1;
  }

  .keycap-muted {
    border-color: var(--line-strong);
    background: var(--raised);
    color: var(--muted);
  }

  .dialog-title {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
  }

  .shortcuts-dialog {
    width: min(560px, calc(100vw - 32px));
    max-height: calc(100vh - 64px);
    overflow-y: auto;
    box-sizing: border-box;
  }

  .shortcuts-group h3 {
    margin: 12px 0 4px;
    color: var(--muted);
    font-size: 12px;
    font-weight: 600;
  }

  .shortcuts-group dl {
    margin: 0;
  }

  .shortcuts-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 4px 0;
    border-bottom: 1px solid var(--line);
  }

  .shortcuts-row dt,
  .shortcuts-row dd {
    margin: 0;
  }
  ```

  Note on `.keycap { color: #e7e9ec }`: the keycap fill is a fixed dark (`#3a3f47`) in both themes, so its text is the dark theme's `--text` value, written literally. A `var(--text)` would turn near-black inside the light-theme sheet.

- [ ] **Step 16: Run the e2e spec and see it pass.**

  ```bash
  pnpm exec playwright test e2e/tooltips.spec.ts
  ```

  Expected: PASS in all four projects, with the skips as written. The hover tests are skipped in chromium-touch, and the long-press test runs only there.

- [ ] **Step 17: Run the gates and the suites that press tool buttons.**

  ```bash
  pnpm typecheck && pnpm test && pnpm test:e2e
  ```

  Expected: all pass. Nothing in `e2e/` reads the removed `title` attributes (`grep -rn "title" e2e/*.spec.ts` finds none about tools). Clicking a tool button never opens its tooltip: Radix cancels the pending open on pointerdown, and does not reopen without another pointermove. So `page.mouse.click` on the canvas right after a tool click is not intercepted.
  - If a spec fails because a `.hint` covers a click target, find the cause first with `superpowers:systematic-debugging`. Do not add waits.

- [ ] **Step 18: Commit.**

  ```bash
  git add package.json pnpm-lock.yaml src/editor/shortcuts.ts src/editor/shortcuts.test.ts src/editor/layout.ts src/editor/layout.test.ts src/editor/keyboard.ts src/ui/Keycap.tsx src/ui/Hint.tsx src/ui/ShortcutsDialog.tsx src/ui/Toolbar.tsx src/ui/App.tsx src/index.css e2e/tooltips.spec.ts
  FSH_NO_TTY=1 git commit -m "Add shortcut table, Hint tooltips and sheet" -m "Shell spec 12 and 10.3: every icon must explain itself with its hotkey, so tooltips and the shortcuts sheet read one display table. keyboard.ts keeps its V1 dispatch; a table-driven test checks each dispatched entry has its effect, and that ? typed in a field never opens the sheet."
  ```

---

# Tasks 3–4 (draft)

## Notes for the plan editor (read before Tasks 3–4)

No CONTRACT ISSUE: every contract name and signature below is used as written. These points are assumptions, or resolve spec wording:

1. **Task 2 shortcut ids (assumption).** Tasks 3–4 pass these `SHORTCUTS` ids to `Hint shortcut=…`:
   - the six tool ids equal the `Tool` values: `select`, `hand`, `band`, `rect`, `polygon`, `crossing`;
   - `undo`, `redo`, `duplicate`, `copy`, `paste`, `delete`, `makeMotif` (Mod+G), `shortcuts` (`?`).

   If Task 2 chose other ids, `pnpm typecheck` flags each call site. Rename it to Task 2's id; nothing else changes.
2. **`groupResizeBehavior` is a `Panel` prop in v4, not a `Group` prop** (Context7, `/bvaughn/react-resizable-panels`: `Panel({ …, groupResizeBehavior = "preserve-relative-size" })`, and "at least one panel per group must preserve relative size"). Spec §4 says "the Group uses". Resolved: both side Panels set `groupResizeBehavior="preserve-pixel-size"`, and the canvas Panel keeps the default.
3. **Button and shortcut toggles must persist collapsed state** (§16 "Reload restores … collapsed state"). `onlySaveAfterUserInteractions: true` would skip imperative `collapse()`/`expand()`, because Context7 documents `LayoutChangedMeta.isUserInteraction` as false for "imperative resize". Resolved: App sets a `toggled` ref just before its own `collapse()`/`expand()`. Its `onLayoutChanged` wrapper forwards `isUserInteraction: meta.isUserInteraction || toggled.current` to the hook's saver. Window-resize recomputations and narrow-mode layouts stay unsaved.
4. **Narrow overlay width** ("at their persisted widths", §4). The library stores percentages of a desktop group width that doesn't exist below 1024 px. Resolved: overlays open at the last desktop pixel width seen this session, taken from `Panel onResize`, or the default (240 / 280) on a narrow-first load.
5. **The canvas never remounts across the breakpoint** (Review Focus 4: `Canvas` calls `fitView()` on mount). The Group is always rendered. In narrow mode only its side Panels and Separators are left out, as `{!narrow && <>…</>}` slots. The canvas Panel keeps its child position, so React keeps its subtree.
6. **`leftTab` default.** Task 3 changes the `layout.ts` default from `'layers'` to `'wood'`, and Task 5 changes it back to `'layers'` when the Layers pane exists. Until Task 5, `LeftPane` renders a body only for `'wood'`. A stale persisted `'layers'`/`'motifs'` shows that title with an empty body until the Wood tab is clicked. If Task 1's `layout.test.ts` or its corrupt-prefs test asserts the default `'layers'`, Task 3 updates that expectation to `'wood'` (Step 3.3).
7. **Pane-specific title-row controls.** `LeftPane` renders the 40 px title row: the tab name, plus that tab's controls (Wood: Add material). The pane component renders only the body.
8. **Fixture loader.** Task 3 keeps it in the transitional canvas strip. Task 4 moves it into the project menu as a DEV-only submenu, **Load sample (dev)**. Task 10 deletes it.
9. **Wood tab `aria-pressed`** is `leftOpen && leftTab === 'wood'`. A collapsed pane shows no pressed tab.
10. **`uiActions.openProject`** must reach ProjectMenu's file input and confirm dialog. App creates `openProjectRef` and passes it through `TopBar` to `ProjectMenu`. `ProjectMenu` points it at its Open handler. App's `uiActions.openProject` calls the ref.
11. **G6 action counts** (`e2e/author/*`) are only printed by `Author.report()`; no spec asserts them. Task 4's `order()` helper counts two actions, opening the menu and choosing the item (§16 "G6 action counts rise").

---

### Task 3: Shell frame

**Files:**
- Create:
  - `src/ui/icons.tsx`, `src/ui/ToolButtons.tsx`, `src/ui/IconColumn.tsx`, `src/ui/LeftPane.tsx`, `src/ui/WoodPane.tsx`, `src/ui/CanvasControls.tsx`, `src/ui/TopBar.tsx`
  - `src/export/download.test.ts`
  - `e2e/shell.spec.ts`
- Rewrite:
  - `src/ui/App.tsx` (all 93 lines)
  - `src/ui/ProjectMenu.tsx` (all 124 lines)
  - `src/ui/Toolbar.tsx` (all 102 lines; it becomes the transitional strip)
- Modify:
  - `src/export/download.ts`: gains 3 functions.
  - `src/editor/layout.ts`: new fields; default `leftTab`.
  - `src/editor/layout.test.ts`: append a `describe`.
  - `src/editor/shortcuts.ts`: 5 entries.
  - `src/editor/keyboard.ts`: imports near l.30–37; mod block l.266–274; header comment.
  - `src/editor/store.ts`: l.34 comment.
  - `src/editor/testHook.ts`: l.49.
  - `src/ui/MaterialEditor.tsx`: l.5–8 and l.61–76.
  - `src/ui/Inspector/Inspector.tsx`: all.
  - `src/ui/Inspector/BoardPanel.tsx`: l.1–55.
  - `src/ui/ToolOptions.tsx`: l.9–13 comment.
  - `src/index.css`: remove the V1 chrome rules, then append the "Shell frame" section.
  - `package.json`, `pnpm-lock.yaml`.
  - e2e: `e2e/helpers.ts`, `e2e/persistence.spec.ts`, `e2e/materials.spec.ts`, `e2e/a11y.spec.ts`, `e2e/tablet.spec.ts`, `e2e/motifs.spec.ts`, `e2e/author/actions.ts`.
- Delete: `src/ui/StatusBar.tsx`, `src/ui/MaterialPalette.tsx`
- Test:
  - `src/export/download.test.ts`
  - `src/editor/layout.test.ts`
  - `e2e/shell.spec.ts`
  - the e2e specs listed above

**Interfaces:**
- Consumes:
  - Task 1: `useLayout`, `LayoutState`, `LeftTab`, `ThemePref`, `nextTheme(pref)`, `useThemeSync()`, and the persisted `theme`, `leftTab` and `toolsDocked`.
  - Task 2:
    - `SHORTCUTS`, `ShortcutId`;
    - `Hint(props: HintProps)`, `HintProps`;
    - `ChordKeys({ chord, muted })`;
    - `ShortcutsDialog()`;
    - `useLayout.shortcutsOpen` and `setShortcutsOpen(o)`.
  - Task 0: `react-resizable-panels` ^4.13 is installed.
- Produces:
  - `src/export/download.ts`: `sanitizeFilenamePart(name: string): string`, `downloadProject(p: Project): void`, `downloadExportSvg(p: Project): void`.
  - `src/ui/ToolButtons.tsx`: `ToolButtons({ variant }: { variant: 'column' | 'bar' }): JSX.Element`, `WoodChip({ variant }: { variant: 'column' | 'bar' }): JSX.Element`.
  - `src/ui/icons.tsx`: `BandIcon`, `CrossingIcon`, `MotifIcon`, `RepeatIcon`, each `(p: IconProps) => JSX.Element` with `type IconProps = { size?: number }`.
  - `src/editor/layout.ts`: `UiActions`, `leftOpen`, `rightOpen`, `uiActions`, `setPaneOpen(side, open)`, `setUiActions(a)` (none persisted), and the default `leftTab: 'wood'`.
  - `SHORTCUTS` entries: `toggleLeft`, `toggleRight`, `openProject`, `downloadProject`, `exportSvg`.
  - DOM hooks later tasks and specs use:
    - classes: `.top-bar`, `.project-name`, `.project-name-text`, `.icon-column`, `.left-pane`, `.pane-title`, `.pane-body`, `.pane-separator`, `.pane-overlay-left`, `.pane-overlay-right`, `.canvas-host`, `.canvas-controls`, `.canvas-actions`, `.inspector`;
    - e2e helper: `projectMenuItem(page, item)`.

- [ ] **Step 3.1: Add the dependencies**

```bash
pnpm add lucide-react @radix-ui/react-dropdown-menu
```

Expected: both appear under `dependencies` in `package.json`, and `pnpm-lock.yaml` updates.

- [ ] **Step 3.2: Write the failing test for the moved download helpers**

Create `src/export/download.test.ts`:

```ts
// The project/SVG download filename rule, moved here from ProjectMenu (shell Task 3).

import { describe, expect, it } from 'vitest'
import { sanitizeFilenamePart } from './download.ts'

describe('sanitizeFilenamePart', () => {
  it('replaces every character outside [A-Za-z0-9 _-] with _', () => {
    expect(sanitizeFilenamePart('My/Project: "Board" #1?')).toBe('My_Project_ _Board_ _1_')
  })

  it('falls back to "project" for an empty name', () => {
    expect(sanitizeFilenamePart('')).toBe('project')
  })
})
```

Run: `pnpm test src/export/download.test.ts`
Expected: FAIL. `download.ts` has no `sanitizeFilenamePart` export yet, so the error is "sanitizeFilenamePart is not a function" (or a missing-export error).

- [ ] **Step 3.3: Move the helpers into `src/export/download.ts`**

Replace the whole file with:

```ts
// Browser downloads: generated text, the project file and the SVG export.
// The project/SVG helpers moved here from ProjectMenu (shell Task 3), so the
// top bar, the project menu and the keyboard dispatcher share them. DOM
// code; only the filename rule is unit-tested.

import type { Project } from '@/domain/model'
import { exportSvg } from './svg.ts'

export function downloadText(filename: string, text: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: mime }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

/** Replaces characters a filesystem might reject with `_`; an empty name falls back to "project". */
export function sanitizeFilenamePart(name: string): string {
  const sanitized = name.replace(/[^A-Za-z0-9 _-]/g, '_')
  return sanitized === '' ? 'project' : sanitized
}

export function downloadProject(p: Project): void {
  downloadText(`${sanitizeFilenamePart(p.name)}.cbpd.json`, JSON.stringify(p, null, 2), 'application/json')
}

export function downloadExportSvg(p: Project): void {
  downloadText(`${sanitizeFilenamePart(p.name)}.svg`, exportSvg(p), 'image/svg+xml')
}
```

Run: `pnpm test src/export/download.test.ts`. Expected: PASS (2 tests).

The copies still in `ProjectMenu.tsx` and the `StatusBar` import go away in Steps 3.11 and 3.13.

- [ ] **Step 3.4: Write the failing layout-store tests**

Append to `src/editor/layout.test.ts`. Add `import { useLayout } from './layout.ts'` if Task 1's file doesn't already import it.

```ts
describe('pane state (shell §4, Task 3)', () => {
  it('starts with both panes open, no ui actions, and the Wood tab (Task 5 restores Layers)', () => {
    const s = useLayout.getInitialState()
    expect([s.leftOpen, s.rightOpen, s.uiActions, s.leftTab]).toEqual([true, true, null, 'wood'])
  })

  it('setPaneOpen changes one side only', () => {
    useLayout.getState().setPaneOpen('left', false)
    expect([useLayout.getState().leftOpen, useLayout.getState().rightOpen]).toEqual([false, true])
    useLayout.getState().setPaneOpen('left', true)
  })

  it('persists only theme, leftTab and toolsDocked — never pane state or ui actions', () => {
    useLayout.getState().setUiActions({ toggleLeft() {}, toggleRight() {}, openLeft() {}, openProject() {} })
    useLayout.getState().setPaneOpen('right', false)
    const persisted = useLayout.persist.getOptions().partialize!(useLayout.getState())
    expect(Object.keys(persisted).sort()).toEqual(['leftTab', 'theme', 'toolsDocked'])
    useLayout.getState().setUiActions(null)
    useLayout.getState().setPaneOpen('right', true)
  })
})
```

Run: `pnpm test src/editor/layout.test.ts`
Expected: FAIL. `leftOpen` is `undefined`, `leftTab` is `'layers'`, and `setPaneOpen is not a function`.

- [ ] **Step 3.5: Extend `src/editor/layout.ts`**

1. Add the exported type next to `LeftTab`:

   ```ts
   /** Shell §4.1: pane and project actions App registers while the shell is mounted; the icon column, top bar, wood chip and keyboard.ts call them. */
   export interface UiActions {
     toggleLeft(): void
     toggleRight(): void
     openLeft(tab: LeftTab): void
     openProject(): void
   }
   ```

2. Add these members to `interface LayoutState`:

   ```ts
     /** Shell §4: the left pane / inspector is open — mirrored from the panel library on desktop, the overlay state when narrow. Not persisted. */
     leftOpen: boolean
     rightOpen: boolean
     /** Registered by App (null before it mounts). Not persisted. */
     uiActions: UiActions | null
     setPaneOpen(side: 'left' | 'right', open: boolean): void
     setUiActions(a: UiActions | null): void
   ```

3. In the store initializer passed to `persist(…)`:
   - change `leftTab: 'layers',` to `leftTab: 'wood', // Task 5 restores 'layers' with the Layers pane`
   - add:

   ```ts
       leftOpen: true,
       rightOpen: true,
       uiActions: null,
       setPaneOpen: (side, open) => set(side === 'left' ? { leftOpen: open } : { rightOpen: open }),
       setUiActions: (a) => set({ uiActions: a }),
   ```

4. Leave the `partialize` alone: it already picks `theme`, `leftTab` and `toolsDocked` explicitly, so the new fields are excluded.
5. If an existing Task 1 test in `layout.test.ts` (or Task 1's corrupt-prefs e2e case) expects the default `leftTab` to be `'layers'`, change that expected value to `'wood'`.

Run: `pnpm test src/editor/layout.test.ts`. Expected: PASS.

- [ ] **Step 3.6: Add the Task 3 shortcut entries**

In `src/editor/shortcuts.ts`, add these to the `SHORTCUTS` object literal, before `} as const satisfies Record<string, Shortcut>`:

```ts
  toggleLeft: { label: 'Toggle sidebar', keys: ['Mod+\\'], group: 'Panels' },
  toggleRight: { label: 'Toggle inspector', keys: ['Mod+Shift+\\'], group: 'Panels' },
  openProject: { label: 'Open project…', keys: ['Mod+O'], group: 'Project' },
  downloadProject: { label: 'Download project', keys: ['Mod+S'], group: 'Project' },
  exportSvg: { label: 'Export SVG', keys: ['Mod+Shift+E'], group: 'Project' },
```

Task 2's `shortcuts.test.ts` checks that every dispatched (non-`DISPLAY_ONLY`) entry has its effect. Add these five rows to its effect table:

| Entry | Chord dispatched | Effect asserted |
| --- | --- | --- |
| `toggleLeft` | `ctrlKey`, `code: 'Backslash'`, `key: '\\'` | a `vi.fn()` registered as `useLayout.getState().uiActions.toggleLeft` is called once |
| `toggleRight` | the same chord with `shiftKey: true` and `key: '|'` | `uiActions.toggleRight` is called once |
| `openProject` | `ctrlKey`, `key: 'o'` | `uiActions.openProject` is called once |
| `downloadProject` | `ctrlKey`, `key: 's'` | the mocked `downloadProject` from `vi.mock('@/export/download', …)` is called with the store's `project` |
| `exportSvg` | `ctrlKey`, `shiftKey`, `key: 'E'` | the mocked `downloadExportSvg` is called with the store's `project` |

Run: `pnpm test src/editor/shortcuts.test.ts`
Expected: FAIL on the five new rows, because the dispatcher doesn't have the bindings yet. If Task 2's table is keyed by hand, not generated from `SHORTCUTS`, it passes, and the e2e shortcut tests in Step 3.8 are the failing tests for Step 3.7.

- [ ] **Step 3.7: Add the dispatcher bindings in `src/editor/keyboard.ts`**

1. **Imports.** After `import { childrenOf } from '@/domain/project'`, add:

   ```ts
   import { downloadExportSvg, downloadProject } from '@/export/download'
   ```

   Also add `import { useLayout } from './layout.ts'` with the other `./` imports, unless Task 2 already added it for `?`.

2. **Header comment.** After the paragraph ending "`Ctrl/Cmd+G` is Create Motif." (l.24–28), append:

   ```ts
   //
   // Shell §12.2: Mod+\ and Mod+Shift+\ toggle the sidebar and inspector
   // (matched on `e.code === 'Backslash'`, so the Shift form works where
   // `e.key` is '|'), Mod+O opens a project, Mod+S downloads it and
   // Mod+Shift+E exports the SVG — all preventDefault'ed, and all skipped in
   // fields like every other binding here.
   ```

3. **Bindings.** In the `if (mod && !e.altKey) { … }` block, before:

   ```ts
         if (!e.shiftKey && lower === 'v') {
           pasteClipboard()
           return
         }
         return // an unrecognized modified chord: never falls through to a plain-key binding
   ```

   change it to:

   ```ts
         if (!e.shiftKey && lower === 'v') {
           pasteClipboard()
           return
         }
         if (e.code === 'Backslash') {
           if (e.shiftKey) useLayout.getState().uiActions?.toggleRight()
           else useLayout.getState().uiActions?.toggleLeft()
           e.preventDefault()
           return
         }
         if (!e.shiftKey && lower === 'o') {
           useLayout.getState().uiActions?.openProject()
           e.preventDefault()
           return
         }
         if (!e.shiftKey && lower === 's') {
           downloadProject(useEditor.getState().project)
           e.preventDefault()
           return
         }
         if (e.shiftKey && lower === 'e') {
           downloadExportSvg(useEditor.getState().project)
           e.preventDefault()
           return
         }
         return // an unrecognized modified chord: never falls through to a plain-key binding
   ```

   The `?.` is for the real `null` state: `uiActions` is null until App mounts, for example in unit tests.

Run: `pnpm test`. Expected: PASS, including Task 2's `shortcuts.test.ts` rows from Step 3.6.

- [ ] **Step 3.8: Write the failing shell e2e spec**

Add to `e2e/helpers.ts`, after `select`:

```ts
/** Opens the top bar's project menu and chooses `item` (shell §10.1). */
export async function projectMenuItem(page: Page, item: string): Promise<void> {
  await page.locator('.project-name').click()
  await page.getByRole('menuitem', { name: item, exact: true }).click()
}
```

Create `e2e/shell.spec.ts`:

```ts
// Shell spec §4, §4.1, §8, §10.1, §12.2 (Task 3): the side panes toggled by
// button, shortcut, active tab and wood chip; pane sizes and collapsed state
// surviving a reload; Rename; the project shortcuts; the narrow (< 1024 px)
// overlay layout; and Review Focus pins 1 (a corrupt layout record), 3
// (shortcuts typed in a field), 4 (crossing the breakpoint) and 5 (a long
// project name).

import type { Locator, Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import type { Project } from '../src/domain/model.ts'
import { band, project } from '../src/domain/test-builders.ts'
import type { Camera } from './helpers.ts'
import { expectClose, getProject, history, open, projectMenuItem, seed } from './helpers.ts'

declare global {
  interface Window {
    __blobs?: number
  }
}

const LAYOUT_KEY = 'react-resizable-panels:cbpd-shell'

function sidebarToggle(page: Page): Locator {
  return page.getByRole('button', { name: 'Toggle sidebar', exact: true })
}

function inspectorToggle(page: Page): Locator {
  return page.getByRole('button', { name: 'Toggle inspector', exact: true })
}

function nonBlank(): Project {
  return project([band('b1', [[0, 40], [80, 40]])])
}

async function widthOf(locator: Locator): Promise<number> {
  const box = await locator.boundingBox()
  expect(box, 'the element is laid out').not.toBeNull()
  return box!.width
}

async function cameraOf(page: Page): Promise<Camera> {
  return page.evaluate(() => window.__cbpd!.getState().camera)
}

/** Drags the sidebar's separator (the first one) right by `dx` px with the mouse. */
async function dragSidebarEdge(page: Page, dx: number): Promise<void> {
  const box = await page.locator('.pane-separator').first().boundingBox()
  expect(box, 'the sidebar separator is laid out').not.toBeNull()
  const x = box!.x + box!.width / 2
  const y = box!.y + box!.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + dx, y, { steps: 6 })
  await page.mouse.up()
}

test.describe('side panes (desktop 1440 × 900)', () => {
  test('the top-bar buttons toggle the sidebar and the inspector; aria-pressed follows', async ({ page }) => {
    await open(page)
    await expect(sidebarToggle(page)).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('.left-pane')).toBeVisible()
    await sidebarToggle(page).click()
    await expect(sidebarToggle(page)).toHaveAttribute('aria-pressed', 'false')
    await expect(page.locator('.left-pane')).toHaveCount(0)
    await sidebarToggle(page).click()
    await expect(page.locator('.left-pane')).toBeVisible()

    await expect(inspectorToggle(page)).toHaveAttribute('aria-pressed', 'true')
    await inspectorToggle(page).click()
    await expect(inspectorToggle(page)).toHaveAttribute('aria-pressed', 'false')
    await expect(page.locator('.inspector')).toHaveCount(0)
    await inspectorToggle(page).click()
    await expect(page.locator('.inspector')).toBeVisible()
  })

  test('Mod+\\ toggles the sidebar and Mod+Shift+\\ the inspector', async ({ page }) => {
    await open(page)
    await page.keyboard.press('ControlOrMeta+Backslash')
    await expect(page.locator('.left-pane')).toHaveCount(0)
    await page.keyboard.press('ControlOrMeta+Backslash')
    await expect(page.locator('.left-pane')).toBeVisible()
    await page.keyboard.press('ControlOrMeta+Shift+Backslash')
    await expect(page.locator('.inspector')).toHaveCount(0)
    await expect(page.locator('.left-pane')).toBeVisible()
    await page.keyboard.press('ControlOrMeta+Shift+Backslash')
    await expect(page.locator('.inspector')).toBeVisible()
  })

  test('clicking the active tab toggles the sidebar; the wood chip reopens it on Wood', async ({ page }) => {
    await open(page)
    const wood = page.getByRole('button', { name: 'Wood', exact: true })
    await expect(wood).toHaveAttribute('aria-pressed', 'true')
    await wood.click()
    await expect(page.locator('.left-pane')).toHaveCount(0)
    await expect(wood).toHaveAttribute('aria-pressed', 'false')
    await wood.click()
    await expect(page.locator('.left-pane')).toBeVisible()

    await wood.click()
    await expect(page.locator('.left-pane')).toHaveCount(0)
    await page.getByRole('button', { name: /^Current wood: / }).click()
    await expect(page.getByRole('region', { name: 'Wood' })).toBeVisible()
  })

  test('a dragged sidebar width and a closed inspector survive a reload', async ({ page }) => {
    await open(page)
    await dragSidebarEdge(page, 60)
    expectClose(await widthOf(page.locator('.left-pane')), 300, 2)
    await inspectorToggle(page).click()
    await page.waitForFunction((key) => (JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, number>)['pane-right'] === 0, LAYOUT_KEY)

    await open(page)
    expectClose(await widthOf(page.locator('.left-pane')), 300, 2)
    await expect(page.locator('.inspector')).toHaveCount(0)
    await expect(inspectorToggle(page)).toHaveAttribute('aria-pressed', 'false')
  })

  for (const [what, stored] of [
    ['not JSON', '{not json'],
    ['for other panels', JSON.stringify({ sidebar: 50, main: 50 })],
  ] as const) {
    test(`a stored layout that is ${what} loads the default widths (Review Focus 1)`, async ({ page }) => {
      const errors: string[] = []
      page.on('pageerror', (e) => errors.push(e.message))
      await page.addInitScript((arg: { key: string; value: string }) => localStorage.setItem(arg.key, arg.value), { key: LAYOUT_KEY, value: stored })
      await open(page)
      expectClose(await widthOf(page.locator('.left-pane')), 240, 1)
      expectClose(await widthOf(page.locator('.inspector')), 280, 1)
      expect(errors).toEqual([])
    })
  }

  test('an out-of-range stored layout is clamped to the pane limits (Review Focus 1)', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    const stored = JSON.stringify({ 'pane-left': 60, 'pane-canvas': 10, 'pane-right': 30 })
    await page.addInitScript((arg: { key: string; value: string }) => localStorage.setItem(arg.key, arg.value), { key: LAYOUT_KEY, value: stored })
    await open(page)
    const left = await widthOf(page.locator('.left-pane'))
    const right = await widthOf(page.locator('.inspector'))
    expect(left).toBeGreaterThanOrEqual(199.5)
    expect(left).toBeLessThanOrEqual(400.5)
    expect(right).toBeGreaterThanOrEqual(247.5)
    expect(right).toBeLessThanOrEqual(440.5)
    expect(await widthOf(page.locator('.canvas-host'))).toBeGreaterThan(300)
    expect(errors).toEqual([])
  })

  test('Rename edits the name in place: Enter commits, Esc and an empty name revert', async ({ page }) => {
    await seed(page, nonBlank())
    await expect(page.getByRole('region', { name: 'Board' }).getByLabel('Name', { exact: true })).toHaveCount(0)

    await projectMenuItem(page, 'Rename')
    const name = page.getByLabel('Name', { exact: true })
    await expect(name).toBeFocused()
    await name.fill('Basket weave')
    await name.press('Enter')
    await expect(page.locator('.project-name-text')).toHaveText('Basket weave')
    expect((await getProject(page)).name).toBe('Basket weave')
    expect(await history(page)).toEqual({ past: 1, future: 0 })

    await projectMenuItem(page, 'Rename')
    await name.fill('Discarded')
    await name.press('Escape')
    await expect(page.locator('.project-name-text')).toHaveText('Basket weave')

    await projectMenuItem(page, 'Rename')
    await name.fill('   ')
    await name.press('Enter')
    await expect(page.locator('.project-name-text')).toHaveText('Basket weave')
    expect(await history(page)).toEqual({ past: 1, future: 0 })
  })

  test('Mod+O asks to open, Mod+S downloads the project and Mod+Shift+E exports the SVG', async ({ page }) => {
    await seed(page, nonBlank())
    await page.keyboard.press('ControlOrMeta+o')
    await expect(page.getByText('Open a project?')).toBeVisible()
    await page.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)

    const [json] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('ControlOrMeta+s')])
    expect(json.suggestedFilename()).toBe('Test.cbpd.json')
    const [svg] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('ControlOrMeta+Shift+e')])
    expect(svg.suggestedFilename()).toBe('Test.svg')
  })

  test('the pane and project shortcuts typed in a field do nothing (Review Focus 3)', async ({ page }) => {
    await page.addInitScript(() => {
      const create = URL.createObjectURL.bind(URL)
      window.__blobs = 0
      URL.createObjectURL = (obj: Blob | MediaSource): string => {
        window.__blobs = (window.__blobs ?? 0) + 1
        return create(obj)
      }
    })
    await seed(page, nonBlank()) // non-blank: a live Mod+O would open "Open a project?"
    const field = page.getByLabel('Width', { exact: true }) // the Board panel's Width (nothing selected)
    await field.focus()
    for (const chord of ['ControlOrMeta+Backslash', 'ControlOrMeta+Shift+Backslash', 'ControlOrMeta+o', 'ControlOrMeta+s', 'ControlOrMeta+Shift+e']) {
      await field.press(chord)
    }
    await expect(field).toBeFocused()
    await expect(sidebarToggle(page)).toHaveAttribute('aria-pressed', 'true')
    await expect(inspectorToggle(page)).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    expect(await page.evaluate(() => window.__blobs)).toBe(0)

    // The same chord outside the field does act, so the checks above can fail.
    await field.blur()
    const [download] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('ControlOrMeta+s')])
    expect(download.suggestedFilename()).toBe('Test.cbpd.json')
    expect(await page.evaluate(() => window.__blobs)).toBe(1)
  })

  test('crossing 1024 px keeps the desktop widths, never shows two overlays and never moves the camera (Review Focus 4)', async ({ page }) => {
    await open(page)
    await dragSidebarEdge(page, 60)
    expectClose(await widthOf(page.locator('.left-pane')), 300, 2)
    const before = await cameraOf(page)

    await page.setViewportSize({ width: 820, height: 900 })
    await expect(sidebarToggle(page)).toHaveAttribute('aria-pressed', 'false') // entering narrow closes both
    await expect(page.locator('.pane-overlay-left, .pane-overlay-right')).toHaveCount(0)
    expect(await cameraOf(page)).toEqual(before)
    await sidebarToggle(page).click()
    expectClose(await widthOf(page.locator('.pane-overlay-left')), 300, 2)
    await inspectorToggle(page).click()
    await expect(page.locator('.pane-overlay-left, .pane-overlay-right')).toHaveCount(1)

    await page.setViewportSize({ width: 1440, height: 900 })
    await expect(sidebarToggle(page)).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('.pane-overlay-left, .pane-overlay-right')).toHaveCount(0)
    expectClose(await widthOf(page.locator('.left-pane')), 300, 2)
    expectClose(await widthOf(page.locator('.inspector')), 280, 2)
    expect(await cameraOf(page)).toEqual(before)
  })

  test('a 90-character project name truncates with its full text in the title, without horizontal overflow (Review Focus 5)', async ({ page }) => {
    const long = 'Walnut maple '.repeat(7).trim() // 90 characters
    await seed(page, { ...project([]), name: long })
    for (const width of [1440, 820]) {
      await page.setViewportSize({ width, height: 900 })
      const text = page.locator('.project-name-text')
      await expect(text).toHaveText(long)
      expect(await text.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true)
      await expect(page.locator('.project-name')).toHaveAttribute('title', long)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    }
  })
})

test.describe('narrow viewport (820 × 1180)', () => {
  test.use({ viewport: { width: 820, height: 1180 } })

  test('both panes start closed, open as overlays without resizing the canvas, and opening one closes the other', async ({ page }) => {
    await open(page)
    await expect(page.locator('.pane-overlay-left, .pane-overlay-right')).toHaveCount(0)
    await expect(sidebarToggle(page)).toHaveAttribute('aria-pressed', 'false')
    await expect(inspectorToggle(page)).toHaveAttribute('aria-pressed', 'false')
    const canvasWidth = await widthOf(page.locator('.canvas-host'))
    expectClose(canvasWidth + (await widthOf(page.locator('.icon-column'))), 820, 1) // the canvas fills the body beside the column

    await sidebarToggle(page).click()
    await expect(page.locator('.pane-overlay-left .left-pane')).toBeVisible()
    expect(await widthOf(page.locator('.canvas-host'))).toBe(canvasWidth)

    await inspectorToggle(page).click()
    await expect(page.locator('.pane-overlay-right .inspector')).toBeVisible()
    await expect(page.locator('.pane-overlay-left')).toHaveCount(0)
    expect(await widthOf(page.locator('.canvas-host'))).toBe(canvasWidth)

    await page.keyboard.press('ControlOrMeta+Backslash')
    await expect(page.locator('.pane-overlay-left .left-pane')).toBeVisible()
    await expect(page.locator('.pane-overlay-right')).toHaveCount(0)
  })
})
```

Run: `pnpm exec playwright test e2e/shell.spec.ts --project=chromium`
Expected: FAIL. Every test times out waiting for `getByRole('button', { name: 'Toggle sidebar' })`, `.left-pane` or `.pane-separator`, which don't exist yet.

- [ ] **Step 3.9: Create `src/ui/icons.tsx`**

```tsx
// Shell §2.4: the four domain glyphs Lucide lacks, on Lucide's 24-unit,
// currentColor, 1.6-stroke, round-cap grid (paths from the approved mockups).

import type { JSX, ReactNode } from 'react'

type IconProps = { size?: number }

function Glyph({ size, children }: { size: number; children: ReactNode }): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  )
}

export function BandIcon({ size = 18 }: IconProps): JSX.Element {
  return (
    <Glyph size={size}>
      <path d="M3 17L10 8l5 6 6-9" strokeWidth={3.2} />
    </Glyph>
  )
}

export function CrossingIcon({ size = 18 }: IconProps): JSX.Element {
  return (
    <Glyph size={size}>
      <path d="M4 20L20 4" strokeWidth={3} />
      <path d="M4 4l6 6M14 14l6 6" strokeWidth={3} />
    </Glyph>
  )
}

export function MotifIcon({ size = 18 }: IconProps): JSX.Element {
  return (
    <Glyph size={size}>
      <rect x="4" y="4" width="7" height="7" rx="1" />
      <rect x="13" y="4" width="7" height="7" rx="1" />
      <rect x="4" y="13" width="7" height="7" rx="1" />
      <rect x="13" y="13" width="7" height="7" rx="1" />
    </Glyph>
  )
}

export function RepeatIcon({ size = 18 }: IconProps): JSX.Element {
  return (
    <Glyph size={size}>
      <rect x="3" y="3" width="8" height="8" rx="1" />
      <rect x="13" y="3" width="8" height="8" rx="1" strokeDasharray="2 2" />
      <rect x="3" y="13" width="8" height="8" rx="1" strokeDasharray="2 2" />
      <rect x="13" y="13" width="8" height="8" rx="1" strokeDasharray="2 2" />
    </Glyph>
  )
}
```

- [ ] **Step 3.10: Create `src/ui/ToolButtons.tsx`**

```tsx
// Shell §5, §7.1: the six tool buttons and the current-wood chip, shared by
// the icon column (docked) and the floating tool bar (undocked, Task 4).

import { Hand, MousePointer2, Pentagon, Square } from 'lucide-react'
import type { JSX } from 'react'
import { Fragment } from 'react'
import { formatLength } from '@/domain/units'
import { useLayout } from '@/editor/layout'
import type { Tool } from '@/editor/store'
import { useEditor } from '@/editor/store'
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
  return (
    <>
      {TOOLS.map(({ tool: t, label, icon }) => (
        <Fragment key={t}>
          {variant === 'bar' && t === 'band' && <span className="bar-divider" aria-hidden="true" />}
          <Hint shortcut={t} side={variant === 'column' ? 'right' : 'top'}>
            <button type="button" className="icon-button" aria-label={label} aria-pressed={tool === t} onClick={() => setTool(t)}>
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
  const name = material?.name ?? 'None' // a project may have no materials at all
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
```

- [ ] **Step 3.11: Create `WoodPane`, `LeftPane` and `IconColumn`, and restyle the `MaterialEditor` trigger**

`src/ui/WoodPane.tsx`:

```tsx
// Shell §6.3: the Wood pane, with the V1 materials palette's behaviour
// unchanged (V1 SPEC §3): the current material highlighted; an empty
// selection + click sets `currentMaterialId`; Bands/Regions selected + click
// assigns (`run(setMaterial)`, one history entry); only instances/repeats
// selected: "Edit the motif to recolour" and the swatches are disabled.
// One row per material: swatch + name (the button's accessible name is the
// material name), usage count, Edit <name>.

import type { JSX } from 'react'
import { materialUsageCount, setMaterial } from '@/domain/commands'
import type { Id, Project } from '@/domain/model'
import { useEditor } from '@/editor/store'
import { MaterialEditor } from './MaterialEditor.tsx'

type Mode = 'empty' | 'assignable' | 'instances-only'

function selectionMode(project: Project, selection: Id[]): Mode {
  if (selection.length === 0) return 'empty'
  const assignable = selection.some((id) => {
    const obj = project.objects[id]!
    return obj.type === 'band' || obj.type === 'region'
  })
  return assignable ? 'assignable' : 'instances-only'
}

export function WoodPane(): JSX.Element {
  const project = useEditor((s) => s.project)
  const selection = useEditor((s) => s.selection)
  const currentMaterialId = useEditor((s) => s.currentMaterialId)
  const mode = selectionMode(project, selection)

  const onSwatchClick = (materialId: Id): void => {
    if (mode === 'empty') {
      useEditor.setState({ currentMaterialId: materialId })
      return
    }
    if (mode === 'assignable') useEditor.getState().run((p) => setMaterial(p, selection, materialId))
  }

  return (
    <section className="wood-pane" aria-label="Wood">
      {mode === 'instances-only' && <p className="pane-note">Edit the motif to recolour</p>}
      <ul className="wood-list">
        {project.materials.map((m) => {
          const used = materialUsageCount(project, m.id)
          return (
            <li className="wood-row" key={m.id}>
              <button
                type="button"
                className="wood-swatch"
                aria-pressed={m.id === currentMaterialId}
                disabled={mode === 'instances-only'}
                title={m.name}
                onClick={() => onSwatchClick(m.id)}
              >
                <span className="wood-swatch-color" style={{ background: m.color }} aria-hidden="true" />
                <span className="wood-swatch-name">{m.name}</span>
              </button>
              <span className="wood-usage" title={`Used ${used} time${used === 1 ? '' : 's'}`}>
                {used}
              </span>
              <MaterialEditor project={project} material={m} />
            </li>
          )
        })}
      </ul>
    </section>
  )
}
```

`src/ui/LeftPane.tsx`:

```tsx
// Shell §6: the left pane — a 40 px title row (the tab's name and its own
// controls) over the tab's scrolling body. Only Wood exists until Task 5
// adds Layers and Motifs; the default tab is 'wood' until then.

import type { JSX } from 'react'
import type { LeftTab } from '@/editor/layout'
import { useLayout } from '@/editor/layout'
import { useEditor } from '@/editor/store'
import { MaterialEditor } from './MaterialEditor.tsx'
import { WoodPane } from './WoodPane.tsx'

const TITLES: Record<LeftTab, string> = { layers: 'Layers', motifs: 'Motifs', wood: 'Wood' }

export function LeftPane(): JSX.Element {
  const tab = useLayout((s) => s.leftTab)
  const project = useEditor((s) => s.project)
  return (
    <aside className="left-pane" aria-labelledby="left-pane-title">
      <header className="pane-title">
        <h2 id="left-pane-title">{TITLES[tab]}</h2>
        {tab === 'wood' && <MaterialEditor project={project} />}
      </header>
      <div className="pane-body">{tab === 'wood' && <WoodPane />}</div>
    </aside>
  )
}
```

`src/ui/IconColumn.tsx`:

```tsx
// Shell §5: the icon column — pane tabs (Wood only until Task 5), a
// separator, the docked tools and the current-wood chip. Clicking the active
// tab toggles the left pane; an inactive tab opens the pane on that tab
// (§4.1). The Undock button arrives in Task 4.

import { Palette } from 'lucide-react'
import type { JSX } from 'react'
import type { LeftTab } from '@/editor/layout'
import { useLayout } from '@/editor/layout'
import { Hint } from './Hint.tsx'
import { ToolButtons, WoodChip } from './ToolButtons.tsx'

export function IconColumn(): JSX.Element {
  const leftTab = useLayout((s) => s.leftTab)
  const leftOpen = useLayout((s) => s.leftOpen)

  const onTab = (tab: LeftTab): void => {
    const ui = useLayout.getState().uiActions
    if (tab === leftTab) ui?.toggleLeft()
    else ui?.openLeft(tab)
  }

  return (
    <div className="icon-column">
      <Hint label="Wood" side="right">
        <button type="button" className="icon-button" aria-label="Wood" aria-pressed={leftOpen && leftTab === 'wood'} onClick={() => onTab('wood')}>
          <Palette size={18} strokeWidth={1.6} />
        </button>
      </Hint>
      <div className="icon-column-separator" role="separator" />
      <ToolButtons variant="column" />
      <WoodChip variant="column" />
    </div>
  )
}
```

`src/ui/MaterialEditor.tsx`: the trigger becomes a Lucide icon button inside a `Hint`.

1. Replace the imports on l.5–9:

   ```tsx
   import * as Popover from '@radix-ui/react-popover'
   import * as Tooltip from '@radix-ui/react-tooltip'
   import type { JSX } from 'react'
   // Tooltip.Provider is hoisted to App.tsx (one per app, not one per trigger).
   import { useEffect, useState } from 'react'
   ```

   with:

   ```tsx
   import * as Popover from '@radix-ui/react-popover'
   import { PencilLine, Plus } from 'lucide-react'
   import type { JSX } from 'react'
   import { useEffect, useState } from 'react'
   ```

2. Add `import { Hint } from './Hint.tsx'` after the `@/editor/store` import.
3. Replace l.63–76, from `<Tooltip.Root>` through `</Tooltip.Root>`, with:

   ```tsx
         <Hint label={triggerLabel}>
           <Popover.Trigger asChild>
             <button type="button" className="icon-button material-editor-trigger" aria-label={triggerLabel}>
               {material === undefined ? <Plus size={16} strokeWidth={1.6} /> : <PencilLine size={16} strokeWidth={1.6} />}
             </button>
           </Popover.Trigger>
         </Hint>
   ```

4. In the header comment (l.2–3), change "from the palette's "+" (add) button or a swatch's own edit button" to "from the Wood pane's Add material button or a row's Edit <name> button".

Remove the palette from the Inspector. Replace `src/ui/Inspector/Inspector.tsx` with:

```tsx
// SPEC §7.5: the right-hand inspector panel, routed by selection. Nothing
// selected → Board. Any non-empty selection → the Selection panel, plus the
// type-specific panel when exactly one Band, Region, Instance, or Repeat is
// selected. Multi-selection gets the Selection panel only. The materials
// palette moved to the Wood pane (shell §6.3).

import type { JSX } from 'react'
import { useEditor } from '@/editor/store'
import { BandPanel } from './BandPanel.tsx'
import { BoardPanel } from './BoardPanel.tsx'
import { InstancePanel } from './InstancePanel.tsx'
import { RegionPanel } from './RegionPanel.tsx'
import { RepeatPanel } from './RepeatPanel.tsx'
import { SelectionPanel } from './SelectionPanel.tsx'

export function Inspector(): JSX.Element {
  const project = useEditor((s) => s.project)
  const selection = useEditor((s) => s.selection)

  if (selection.length === 0) {
    return (
      <aside className="inspector" aria-label="Inspector">
        <BoardPanel />
      </aside>
    )
  }

  const single = selection.length === 1 ? project.objects[selection[0]!] : undefined

  return (
    <aside className="inspector" aria-label="Inspector">
      <SelectionPanel />
      {single?.type === 'band' && <BandPanel key={single.id} band={single} />}
      {single?.type === 'region' && <RegionPanel region={single} />}
      {single?.type === 'motif-instance' && <InstancePanel key={single.id} instance={single} />}
      {single?.type === 'repeat' && <RepeatPanel key={single.id} field={single} />}
    </aside>
  )
}
```

Delete the palette: `git rm src/ui/MaterialPalette.tsx`.

In `src/ui/Inspector/BoardPanel.tsx`, remove the Name field, which moves to the top-bar Rename:
1. Replace l.1–10:

   ```tsx
   // SPEC §7.5 Board panel: shown when nothing is selected. Name, width,
   // height, background material, display units, grid spacing.

   import type { JSX } from 'react'
   import { useEffect, useState } from 'react'
   import { setBoardBackground, setBoardSize, setDisplayUnits, setProjectName } from '@/domain/commands'
   import { useEditor } from '@/editor/store'
   import { NumberField } from './NumberField.tsx'

   const NONE = ''
   ```

   with:

   ```tsx
   // SPEC §7.5 Board panel: shown when nothing is selected. Width, height,
   // background material, display units, grid spacing. The project name is
   // edited from the top bar's Rename (shell §10.1).

   import type { JSX } from 'react'
   import { setBoardBackground, setBoardSize, setDisplayUnits } from '@/domain/commands'
   import { useEditor } from '@/editor/store'
   import { NumberField } from './NumberField.tsx'

   const NONE = ''
   ```

2. Delete `function NameField(): JSX.Element { … }`, l.12–45 including the blank line after it.
3. Delete the line `      <NameField />` (old l.55).

- [ ] **Step 3.12: Create `CanvasControls` and shrink `Toolbar` into the transitional strip**

`src/ui/CanvasControls.tsx`:

```tsx
// Shell §7.2: the canvas controls — the Snap, Show grid and Add to selection
// toggles, then Zoom out, the zoom read-out (camera zoom relative to the Fit
// zoom; clicking it fits), Zoom in and Fit. Bottom-right while the tools are
// docked (the undocked position arrives in Task 4).

import { Grid3x3, Magnet, Scan, SquarePlus, ZoomIn, ZoomOut } from 'lucide-react'
import type { JSX } from 'react'
import { fitBoard } from '@/editor/camera'
import { fitView, zoomViewBy } from '@/editor/input'
import { useEditor } from '@/editor/store'
import { Hint } from './Hint.tsx'

const ZOOM_STEP = 1.25
const ICON = { size: 18, strokeWidth: 1.6 } as const

export function CanvasControls(): JSX.Element {
  const snapEnabled = useEditor((s) => s.snapEnabled)
  const showGrid = useEditor((s) => s.showGrid)
  const addToSelection = useEditor((s) => s.addToSelection)
  const zoom = useEditor((s) => s.camera.zoom)
  const fitZoom = useEditor((s) => fitBoard(s.project.board, s.viewportPx).zoom)
  const side = 'top'

  return (
    <div className="canvas-controls" role="toolbar" aria-label="View">
      <Hint label="Snap" hint="Hold Alt to drag without snapping" state={snapEnabled ? 'on' : 'off'} side={side}>
        <button type="button" className="icon-button" aria-label="Snap" aria-pressed={snapEnabled} onClick={() => useEditor.setState({ snapEnabled: !snapEnabled })}>
          <Magnet {...ICON} />
        </button>
      </Hint>
      <Hint label="Show grid" state={showGrid ? 'on' : 'off'} side={side}>
        <button type="button" className="icon-button" aria-label="Show grid" aria-pressed={showGrid} onClick={() => useEditor.setState({ showGrid: !showGrid })}>
          <Grid3x3 {...ICON} />
        </button>
      </Hint>
      <Hint label="Add to selection" hint="Each tap adds to or removes from the selection" state={addToSelection ? 'on' : 'off'} side={side}>
        <button type="button" className="icon-button" aria-label="Add to selection" aria-pressed={addToSelection} onClick={() => useEditor.setState({ addToSelection: !addToSelection })}>
          <SquarePlus {...ICON} />
        </button>
      </Hint>
      <span className="bar-divider" aria-hidden="true" />
      <Hint label="Zoom out" side={side}>
        <button type="button" className="icon-button" aria-label="Zoom out" onClick={() => zoomViewBy(1 / ZOOM_STEP)}>
          <ZoomOut {...ICON} />
        </button>
      </Hint>
      <Hint label="Zoom" hint="Click to fit the board" side={side}>
        <button type="button" className="zoom-readout" onClick={fitView}>
          {Math.round((zoom / fitZoom) * 100)}%
        </button>
      </Hint>
      <Hint label="Zoom in" side={side}>
        <button type="button" className="icon-button" aria-label="Zoom in" onClick={() => zoomViewBy(ZOOM_STEP)}>
          <ZoomIn {...ICON} />
        </button>
      </Hint>
      <Hint label="Fit" hint="Fit the board in view" side={side}>
        <button type="button" className="icon-button" aria-label="Fit" onClick={fitView}>
          <Scan {...ICON} />
        </button>
      </Hint>
    </div>
  )
}
```

(`side` is a local constant because Task 4 makes it depend on the dock state.)

Replace `src/ui/Toolbar.tsx` with the transitional strip:

```tsx
// TRANSITIONAL (shell Task 3; deleted in Task 4): Paste, Create Motif and
// Repeat, floating top-right over the canvas while the Select tool is active,
// plus the DEV-only fixture loader. Task 4's actions bar replaces the buttons
// and moves the loader into the project menu.

import type { ChangeEvent, JSX } from 'react'
import { createMotifFromSelection, pasteClipboard, repeatSelection } from '@/editor/keyboard'
import { useEditor } from '@/editor/store'
import { fixtures } from '@/fixtures'

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
  )
}

export function Toolbar(): JSX.Element | null {
  const tool = useEditor((s) => s.tool)
  const hasSelection = useEditor((s) => s.selection.length > 0)
  if (tool !== 'select') return null
  return (
    <div className="canvas-actions" role="toolbar" aria-label="Canvas actions">
      <button type="button" className="text-button" onClick={pasteClipboard}>
        Paste
      </button>
      <button type="button" className="text-button" disabled={!hasSelection} onClick={createMotifFromSelection}>
        Create Motif
      </button>
      <button type="button" className="text-button" disabled={!hasSelection} onClick={repeatSelection}>
        Repeat
      </button>
      {import.meta.env.DEV && <FixtureLoader />}
    </div>
  )
}
```

- [ ] **Step 3.13: Rewrite `ProjectMenu`, create `TopBar` and delete `StatusBar`**

Replace `src/ui/ProjectMenu.tsx` with:

```tsx
// Shell §10.1: the project menu, a Radix DropdownMenu on the top bar's
// project-name button.
//
// - New project… keeps V1 §9's confirm-unless-blank flow until Task 10's
//   dialog.
// - Open project… keeps V1 §9's "Open a project?" confirmation and its
//   failure behaviour: project and history untouched, and the error goes to
//   the store's `message`, which only TopBar renders. `replaceProject` clears
//   a stale message on success.
// - Rename turns the name button into a text field labelled Name, under the
//   V1 §7.5 rules: Enter or blur commits, Esc reverts, and an empty name
//   reverts.
//
// Mod+O reaches the Open flow through `openProjectRef`, which App's
// `uiActions.openProject` calls.

import * as Dialog from '@radix-ui/react-dialog'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { ChevronDown, Download, FileOutput, FilePlus, FolderOpen, Keyboard, PencilLine } from 'lucide-react'
import type { ChangeEvent, JSX, ReactElement, RefObject } from 'react'
import { useEffect, useRef, useState } from 'react'
import { setProjectName } from '@/domain/commands'
import { importProject } from '@/domain/migrate'
import type { Project } from '@/domain/model'
import { newProject } from '@/domain/project'
import { useLayout } from '@/editor/layout'
import type { ShortcutId } from '@/editor/shortcuts'
import { SHORTCUTS } from '@/editor/shortcuts'
import { useEditor } from '@/editor/store'
import { downloadExportSvg, downloadProject } from '@/export/download'
import { ChordKeys } from './Keycap.tsx'

const ICON = { size: 16, strokeWidth: 1.6 } as const

/** SPEC §9: the blank starter — no objects (root or definition-owned) — is silently replaceable. */
export function isBlankProject(project: Project): boolean {
  return Object.keys(project.objects).length === 0
}

function MenuItem({ icon, label, shortcut, onSelect }: { icon: ReactElement; label: string; shortcut?: ShortcutId; onSelect(): void }): JSX.Element {
  return (
    <DropdownMenu.Item className="menu-item" onSelect={onSelect}>
      {icon}
      <span className="menu-item-label">{label}</span>
      {shortcut !== undefined && (
        <span className="menu-item-keys" aria-hidden="true">
          <ChordKeys chord={SHORTCUTS[shortcut].keys[0]!} muted />
        </span>
      )}
    </DropdownMenu.Item>
  )
}

type PendingAction = 'new' | 'open' | null

export function ProjectMenu({ openProjectRef }: { openProjectRef: RefObject<() => void> }): JSX.Element {
  const name = useEditor((s) => s.project.name)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<PendingAction>(null)
  const [renaming, setRenaming] = useState(false)
  const [text, setText] = useState('')
  // Refs, not state: the menu's close-autofocus handler and the field's blur
  // run before a re-render could show them the new value.
  const renamingRef = useRef(false)
  const reverted = useRef(false)

  const startNew = (): void => {
    const displayUnits = useEditor.getState().project.displayUnits
    useEditor.getState().replaceProject(newProject(displayUnits))
  }

  const onNewClick = (): void => {
    if (isBlankProject(useEditor.getState().project)) startNew()
    else setPending('new')
  }

  const onOpenClick = (): void => {
    if (isBlankProject(useEditor.getState().project)) fileInputRef.current?.click()
    else setPending('open')
  }

  useEffect(() => {
    openProjectRef.current = onOpenClick
  })

  const onConfirm = (): void => {
    if (pending === 'new') startNew()
    else if (pending === 'open') fileInputRef.current?.click()
    setPending(null)
  }

  const onFileChange = (e: ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow reselecting the same filename after a failure
    if (file === undefined) return
    void file.text().then((fileText) => {
      const result = importProject(fileText)
      if (!result.ok) {
        useEditor.setState({ message: result.error.path === '' ? result.error.message : `${result.error.path}: ${result.error.message}` })
        return
      }
      useEditor.getState().replaceProject(result.project)
    })
  }

  const startRename = (): void => {
    renamingRef.current = true
    reverted.current = false
    setText(name)
    setRenaming(true)
  }

  const finishRename = (): void => {
    if (!reverted.current && text.trim() !== '' && text !== name) useEditor.getState().run((p) => setProjectName(p, text))
    renamingRef.current = false
    setRenaming(false)
  }

  return (
    <div className="project-menu">
      <DropdownMenu.Root modal={false}>
        {renaming ? (
          <input
            ref={nameInputRef}
            className="project-name-input"
            aria-label="Name"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={finishRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
              else if (e.key === 'Escape') {
                e.stopPropagation()
                reverted.current = true
                e.currentTarget.blur()
              }
            }}
          />
        ) : (
          <DropdownMenu.Trigger asChild>
            <button type="button" className="project-name" title={name}>
              <span className="project-name-text">{name}</span>
              <ChevronDown {...ICON} />
            </button>
          </DropdownMenu.Trigger>
        )}
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            className="menu"
            align="start"
            sideOffset={6}
            onCloseAutoFocus={(e) => {
              if (!renamingRef.current) return
              e.preventDefault() // the trigger is gone: focus the Name field instead
              nameInputRef.current?.focus()
            }}
          >
            <MenuItem icon={<FilePlus {...ICON} />} label="New project…" onSelect={onNewClick} />
            <MenuItem icon={<FolderOpen {...ICON} />} label="Open project…" shortcut="openProject" onSelect={onOpenClick} />
            <MenuItem icon={<Download {...ICON} />} label="Download project" shortcut="downloadProject" onSelect={() => downloadProject(useEditor.getState().project)} />
            <DropdownMenu.Separator className="menu-separator" />
            <MenuItem icon={<PencilLine {...ICON} />} label="Rename" onSelect={startRename} />
            <MenuItem icon={<FileOutput {...ICON} />} label="Export SVG" shortcut="exportSvg" onSelect={() => downloadExportSvg(useEditor.getState().project)} />
            <DropdownMenu.Separator className="menu-separator" />
            <MenuItem icon={<Keyboard {...ICON} />} label="Keyboard shortcuts" shortcut="shortcuts" onSelect={() => useLayout.getState().setShortcutsOpen(true)} />
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      <input ref={fileInputRef} type="file" accept=".json,application/json" className="visually-hidden" aria-label="Open project file" onChange={onFileChange} />
      <Dialog.Root open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog-content" aria-describedby="project-menu-confirm-description">
            <Dialog.Title>{pending === 'new' ? 'Start a new project?' : 'Open a project?'}</Dialog.Title>
            <Dialog.Description id="project-menu-confirm-description">This replaces the current project. Download it first if you want to keep it.</Dialog.Description>
            <div className="button-row">
              <button type="button" onClick={onConfirm}>
                {pending === 'new' ? 'Start new project' : 'Choose file…'}
              </button>
              <Dialog.Close asChild>
                <button type="button">Cancel</button>
              </Dialog.Close>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  )
}
```

Create `src/ui/TopBar.tsx`:

```tsx
// Shell §8: the top bar. From left to right:
// - the sidebar toggle and the project menu;
// - the save status, with an inline Download when unsaved or changed in
//   another tab;
// - the store's `message`, truncated with the full text in its title. This
//   is the only place `message` renders;
// - Undo and Redo, disabled with empty history;
// - Theme, Export SVG, and the inspector toggle.
// It replaces V1's ProjectMenu button row and StatusBar.

import { Moon, PanelLeft, PanelRight, Redo2, Sun, SunMoon, Undo2 } from 'lucide-react'
import type { JSX, RefObject } from 'react'
import { useStore } from 'zustand'
import type { ThemePref } from '@/editor/layout'
import { nextTheme, useLayout } from '@/editor/layout'
import type { SaveStatus } from '@/editor/store'
import { useEditor } from '@/editor/store'
import { downloadExportSvg, downloadProject } from '@/export/download'
import { Hint } from './Hint.tsx'
import { ProjectMenu } from './ProjectMenu.tsx'

const ICON = { size: 18, strokeWidth: 1.6 } as const

const STATUS_TEXT: Record<SaveStatus, string> = {
  saved: 'Saved',
  unsaved: 'Not saved in this browser',
  'other-tab': 'Project changed in another tab',
}

const THEME_NAME: Record<ThemePref, string> = { dark: 'Dark', light: 'Light', system: 'System' }
const THEME_ICON: Record<ThemePref, JSX.Element> = { dark: <Moon {...ICON} />, light: <Sun {...ICON} />, system: <SunMoon {...ICON} /> }

export function TopBar({ openProjectRef }: { openProjectRef: RefObject<() => void> }): JSX.Element {
  const status = useEditor((s) => s.saveStatus)
  const message = useEditor((s) => s.message)
  const canUndo = useStore(useEditor.temporal, (t) => t.pastStates.length > 0)
  const canRedo = useStore(useEditor.temporal, (t) => t.futureStates.length > 0)
  const theme = useLayout((s) => s.theme)
  const leftOpen = useLayout((s) => s.leftOpen)
  const rightOpen = useLayout((s) => s.rightOpen)

  return (
    <header className="top-bar">
      <Hint shortcut="toggleLeft" side="bottom">
        <button type="button" className="icon-button" aria-label="Toggle sidebar" aria-pressed={leftOpen} onClick={() => useLayout.getState().uiActions?.toggleLeft()}>
          <PanelLeft {...ICON} />
        </button>
      </Hint>
      <ProjectMenu openProjectRef={openProjectRef} />
      <div className="top-bar-status" role="status">
        <span className="save-status" data-status={status}>
          <span className="save-dot" aria-hidden="true" />
          {STATUS_TEXT[status]}
        </span>
        {status !== 'saved' && (
          <button type="button" className="text-button" onClick={() => downloadProject(useEditor.getState().project)}>
            Download
          </button>
        )}
        {message !== null && (
          <span className="top-bar-notice" title={message}>
            {message}
          </span>
        )}
      </div>
      <span className="top-bar-spacer" />
      <Hint shortcut="undo" side="bottom">
        <button type="button" className="icon-button" aria-label="Undo" disabled={!canUndo} onClick={() => useEditor.getState().undo()}>
          <Undo2 {...ICON} />
        </button>
      </Hint>
      <Hint shortcut="redo" side="bottom">
        <button type="button" className="icon-button" aria-label="Redo" disabled={!canRedo} onClick={() => useEditor.getState().redo()}>
          <Redo2 {...ICON} />
        </button>
      </Hint>
      <span className="top-bar-divider" aria-hidden="true" />
      <Hint label={`Theme: ${THEME_NAME[theme]} · Click for ${THEME_NAME[nextTheme(theme)]}`} side="bottom">
        <button type="button" className="icon-button" aria-label="Theme" onClick={() => useLayout.getState().setTheme(nextTheme(theme))}>
          {THEME_ICON[theme]}
        </button>
      </Hint>
      <Hint shortcut="exportSvg" side="bottom">
        <button type="button" className="primary-button" onClick={() => downloadExportSvg(useEditor.getState().project)}>
          Export SVG
        </button>
      </Hint>
      <Hint shortcut="toggleRight" side="bottom">
        <button type="button" className="icon-button" aria-label="Toggle inspector" aria-pressed={rightOpen} onClick={() => useLayout.getState().uiActions?.toggleRight()}>
          <PanelRight {...ICON} />
        </button>
      </Hint>
    </header>
  )
}
```

(If Task 1 put a temporary theme control somewhere in the V1 chrome, this button supersedes it. Point `theme.spec.ts`'s locator at `getByRole('button', { name: 'Theme', exact: true })`.)

Then:
- Delete the old status bar: `git rm src/ui/StatusBar.tsx`.
- `src/editor/store.ts` l.34: change "surfaced by `StatusBar`" to "surfaced by `TopBar`".
- `src/ui/ToolOptions.tsx` l.10: change "is shown only in StatusBar now" to "is shown only in TopBar now".

- [ ] **Step 3.14: Rewrite `src/ui/App.tsx` as the shell**

```tsx
// Shell spec §4: the app grid.
// - Rows: top bar, optional recovery banner, body.
// - Body: the icon column, then a react-resizable-panels Group laid out as
//   [sidebar | canvas | inspector].
// - Narrow viewports (< 1024 px): the side panes leave the Group and become
//   overlays. Only one overlay is open at a time, and both start closed.
//   The canvas Panel stays at the same child position, so the Canvas never
//   remounts (its mount re-fits the camera).
// - App registers the pane and project `uiActions` in the layout store, and
//   mirrors leftOpen/rightOpen from the panel resize callbacks.

import * as Tooltip from '@radix-ui/react-tooltip'
import type { JSX } from 'react'
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { PanelImperativeHandle } from 'react-resizable-panels'
import { Group, Panel, Separator, useDefaultLayout } from 'react-resizable-panels'
import { installKeyboardDispatcher } from '@/editor/keyboard'
import { useLayout } from '@/editor/layout'
import { useEditor } from '@/editor/store'
import { Canvas } from '@/render/Canvas'
import { createAutosave, loadAtStartup, openStorage, PROJECT_KEY } from '@/storage/local'
import { Breadcrumb } from './Breadcrumb.tsx'
import { CanvasControls } from './CanvasControls.tsx'
import { IconColumn } from './IconColumn.tsx'
import { Inspector } from './Inspector/Inspector.tsx'
import { LeftPane } from './LeftPane.tsx'
import { RecoveryBanner } from './RecoveryBanner.tsx'
import { ShortcutsDialog } from './ShortcutsDialog.tsx'
import { useThemeSync } from './theme.ts'
import { Toolbar } from './Toolbar.tsx'
import { ToolOptions } from './ToolOptions.tsx'
import { TopBar } from './TopBar.tsx'

/** SPEC §9: startup load, debounced autosave on every project change, flush on hide, suspend on another tab's write. */
function usePersistence(): { recoveredText: string | null; dismissRecovery: () => void } {
  const [recoveredText, setRecoveredText] = useState<string | null>(null)

  useEffect(() => {
    const storage = openStorage(() => window.localStorage)
    const startup = storage === null ? null : loadAtStartup(storage)
    if (startup?.kind === 'project') useEditor.getState().replaceProject(startup.project)
    else if (startup?.kind === 'recovered') setRecoveredText(startup.text)

    // No usable storage, or a corrupt document it had no room to move aside:
    // work continues unsaved (the top bar offers Download), never over it.
    if (storage === null || (startup?.kind === 'recovered' && !startup.moved)) {
      useEditor.setState({ saveStatus: 'unsaved' })
      return
    }

    const autosave = createAutosave(
      storage,
      () => useEditor.getState().project,
      (status) => useEditor.setState({ saveStatus: status }),
    )

    // Registered here (not in storage/local.ts) so the module stays DOM-free
    // and testable with fake timers.
    const unsubscribe = useEditor.subscribe((state, prev) => {
      if (state.project !== prev.project) autosave.schedule()
    })
    const onPageHide = (): void => autosave.flush()
    const onVisibilityChange = (): void => {
      if (document.visibilityState === 'hidden') autosave.flush()
    }
    const onStorage = (e: StorageEvent): void => {
      if (e.key === PROJECT_KEY) autosave.suspend()
    }
    window.addEventListener('pagehide', onPageHide)
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('storage', onStorage)

    return () => {
      unsubscribe()
      window.removeEventListener('pagehide', onPageHide)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('storage', onStorage)
      autosave.dispose()
    }
  }, [])

  return { recoveredText, dismissRecovery: () => setRecoveredText(null) }
}

/**
 * Shell §4 persistence goes through a storage object that never throws. A
 * blocked `localStorage` getter (Review Focus 2) or a record that is not
 * JSON (Review Focus 1) reads as "nothing stored", so the defaults apply. A
 * failed write just doesn't persist.
 */
const layoutStorage: Pick<Storage, 'getItem' | 'setItem'> = {
  getItem(key) {
    try {
      const text = window.localStorage.getItem(key)
      if (text !== null) JSON.parse(text)
      return text
    } catch {
      return null
    }
  },
  setItem(key, value) {
    try {
      window.localStorage.setItem(key, value)
    } catch {
      // Storage blocked or full: pane sizes don't persist this session.
    }
  },
}

const narrowQuery = window.matchMedia('(max-width: 1023.98px)')

function subscribeNarrow(onChange: () => void): () => void {
  narrowQuery.addEventListener('change', onChange)
  return () => narrowQuery.removeEventListener('change', onChange)
}

function App(): JSX.Element {
  useEffect(() => installKeyboardDispatcher(), [])
  useThemeSync()
  const { recoveredText, dismissRecovery } = usePersistence()
  const narrow = useSyncExternalStore(subscribeNarrow, () => narrowQuery.matches)
  const leftOpen = useLayout((s) => s.leftOpen)
  const rightOpen = useLayout((s) => s.rightOpen)
  const leftRef = useRef<PanelImperativeHandle | null>(null)
  const rightRef = useRef<PanelImperativeHandle | null>(null)
  const openProjectRef = useRef<() => void>(() => {})
  /** The last desktop pane widths this session, in px: the narrow overlays open at these. A ref, so a separator drag doesn't re-render the shell every frame. */
  const widths = useRef({ left: 240, right: 280 })
  /** Set just before a toggle's collapse()/expand(): a button or shortcut is a user action, so its layout is saved like a drag. */
  const toggled = useRef(false)
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({ id: 'cbpd-shell', onlySaveAfterUserInteractions: true, storage: layoutStorage })

  // Shell §4: entering the narrow layout (or starting in it) closes both overlays.
  useLayoutEffect(() => {
    if (!narrow) return
    const { setPaneOpen } = useLayout.getState()
    setPaneOpen('left', false)
    setPaneOpen('right', false)
  }, [narrow])

  useEffect(() => {
    const toggle = (side: 'left' | 'right'): void => {
      const { leftOpen: l, rightOpen: r, setPaneOpen } = useLayout.getState()
      if (narrow) {
        const opening = !(side === 'left' ? l : r)
        setPaneOpen(side, opening)
        if (opening) setPaneOpen(side === 'left' ? 'right' : 'left', false)
        return
      }
      const panel = (side === 'left' ? leftRef : rightRef).current! // mounted whenever the layout is not narrow
      toggled.current = true
      if (panel.isCollapsed()) panel.expand()
      else panel.collapse()
    }
    useLayout.getState().setUiActions({
      toggleLeft: () => toggle('left'),
      toggleRight: () => toggle('right'),
      openLeft: (tab) => {
        useLayout.getState().setLeftTab(tab)
        if (!useLayout.getState().leftOpen) toggle('left')
      },
      openProject: () => openProjectRef.current(),
    })
    return () => useLayout.getState().setUiActions(null)
  }, [narrow])

  return (
    <Tooltip.Provider delayDuration={400} skipDelayDuration={300}>
      <div className="app">
        <TopBar openProjectRef={openProjectRef} />
        {recoveredText !== null && <RecoveryBanner text={recoveredText} onDiscard={dismissRecovery} />}
        <div className="app-body">
          <IconColumn />
          <Group
            id="cbpd-shell"
            className="shell-group"
            defaultLayout={defaultLayout}
            onLayoutChanged={(layout, meta) => {
              onLayoutChanged(layout, { isUserInteraction: meta.isUserInteraction || toggled.current })
              toggled.current = false
            }}
          >
            {!narrow && (
              <>
                <Panel
                  id="pane-left"
                  className="pane"
                  panelRef={leftRef}
                  collapsible
                  collapsedSize="0px"
                  minSize="200px"
                  maxSize="400px"
                  defaultSize="240px"
                  groupResizeBehavior="preserve-pixel-size"
                  onResize={(size) => {
                    useLayout.getState().setPaneOpen('left', size.asPercentage > 0)
                    if (size.inPixels > 0) widths.current.left = size.inPixels
                  }}
                >
                  {leftOpen && <LeftPane />}
                </Panel>
                <Separator className="pane-separator" />
              </>
            )}
            <Panel id="pane-canvas" className="canvas-pane">
              <main className="canvas-host">
                <Canvas />
                <Toolbar />
                <CanvasControls />
                <ToolOptions />
                <Breadcrumb />
              </main>
            </Panel>
            {!narrow && (
              <>
                <Separator className="pane-separator" />
                <Panel
                  id="pane-right"
                  className="pane"
                  panelRef={rightRef}
                  collapsible
                  collapsedSize="0px"
                  minSize="248px"
                  maxSize="440px"
                  defaultSize="280px"
                  groupResizeBehavior="preserve-pixel-size"
                  onResize={(size) => {
                    useLayout.getState().setPaneOpen('right', size.asPercentage > 0)
                    if (size.inPixels > 0) widths.current.right = size.inPixels
                  }}
                >
                  {rightOpen && <Inspector />}
                </Panel>
              </>
            )}
          </Group>
          {narrow && leftOpen && (
            <div className="pane-overlay pane-overlay-left" style={{ width: widths.current.left }}>
              <LeftPane />
            </div>
          )}
          {narrow && rightOpen && (
            <div className="pane-overlay pane-overlay-right" style={{ width: widths.current.right }}>
              <Inspector />
            </div>
          )}
        </div>
        <ShortcutsDialog />
      </div>
    </Tooltip.Provider>
  )
}

export default App
```

Hide the new floating bars in pixel captures. In `src/editor/testHook.ts` l.49, change the end of `HIDE_CHROME_CSS` from `.crossing-markers, .tool-options { display: none !important; }` to `.crossing-markers, .tool-options, .canvas-controls, .canvas-actions { display: none !important; }`.

Run: `pnpm typecheck`
Expected: PASS. If one of the assumed Task 2 ids (Note 1) differs, rename it at the call site and re-run.

- [ ] **Step 3.15: Replace the V1 chrome CSS with the shell frame section**

In `src/index.css`, delete every rule left for these selectors:
- `.app`, `.app-body`, `.app-top-bar`, `.canvas-host`, `.inspector`;
- `.toolbar`, `.toolbar button`, `.toolbar button[aria-pressed='true']`, `.toolbar-gap`;
- `.project-menu`, `.status-bar`, `.status-bar-message`, `.recovery-banner`;
- `.materials-panel`, `.materials-hint`, `.materials-grid`;
- `.material-swatch-row`, `.material-swatch`, `.material-swatch[aria-pressed='true']`, `.material-swatch-color`, `.material-swatch-name`;
- `.material-editor-trigger`.

Keep `.tool-options*` (Task 6), `.breadcrumb` (Task 8) and `.dialog-*` (Task 10). Also keep the `.tooltip` rule if Task 2 still uses it.

Then append:

```css
/* ---- Shell frame (shell spec §4, §5, §6, §7.2, §8, §10.1; Task 3) ---- */

.app {
  display: grid;
  grid-template-rows: 44px auto minmax(0, 1fr);
  height: 100%;
  background: var(--paste);
  color: var(--text);
}

.top-bar {
  grid-row: 1;
}

.recovery-banner {
  grid-row: 2;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  background: var(--raised);
  border-left: 3px solid var(--attn);
  border-bottom: 1px solid var(--line);
  font-size: 13px;
}

.app-body {
  grid-row: 3;
  position: relative;
  display: grid;
  grid-template-columns: 52px minmax(0, 1fr);
  min-height: 0;
}

.shell-group {
  height: 100%;
  min-width: 0;
}

.pane {
  height: 100%;
  overflow: hidden;
  background: var(--panel);
}

.canvas-pane {
  height: 100%;
}

.canvas-host {
  position: relative;
  height: 100%;
  min-width: 0;
  overflow: hidden;
  background: var(--paste);
}

.pane-separator {
  width: 1px;
  background: var(--line);
  outline: none;
}

.pane-separator[data-separator='hover'],
.pane-separator[data-separator='active'],
.pane-separator[data-separator='focus'] {
  background: var(--acc);
  box-shadow: 0 0 0 0.5px var(--acc);
}

.pane-overlay {
  position: absolute;
  top: 0;
  bottom: 0;
  z-index: 3;
  max-width: calc(100% - 52px);
  background: var(--panel);
  box-shadow: var(--shadow);
}

.pane-overlay-left {
  left: 52px;
  border-right: 1px solid var(--line);
}

.pane-overlay-right {
  right: 0;
  border-left: 1px solid var(--line);
}

/* Buttons shared by the bars and panes. */
.icon-button {
  display: inline-grid;
  place-items: center;
  flex: none;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
}

.icon-button:hover:not(:disabled) {
  background: var(--raised);
  color: var(--text);
}

.icon-button[aria-pressed='true'] {
  background: var(--acc-soft);
  color: var(--acc);
}

.icon-button:disabled {
  opacity: 0.4;
  cursor: default;
}

.text-button {
  flex: none;
  height: 28px;
  padding: 0 10px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--raised);
  color: var(--text);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.text-button:disabled {
  color: var(--muted);
  cursor: default;
}

.primary-button {
  flex: none;
  height: 30px;
  padding: 0 12px;
  border: 0;
  border-radius: 6px;
  background: var(--acc);
  color: var(--acc-ink);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

.bar-divider {
  flex: none;
  width: 1px;
  height: 24px;
  margin: 0 4px;
  background: var(--line);
}

/* Top bar (§8). */
.top-bar {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  padding: 0 8px;
  overflow: hidden;
  background: var(--panel);
  border-bottom: 1px solid var(--line);
  font-size: 13px;
}

.project-menu {
  display: flex;
  align-items: center;
  flex: 0 1 auto;
  min-width: 0;
}

.project-name {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  max-width: min(40vw, 360px);
  height: 30px;
  padding: 0 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

.project-name:hover {
  background: var(--raised);
}

.project-name-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-name svg {
  flex: none;
  color: var(--muted);
}

.project-name-input {
  width: min(40vw, 360px);
  height: 28px;
  padding: 0 8px;
  border: 1px solid var(--acc);
  border-radius: 6px;
  background: var(--raised);
  color: var(--text);
  font: inherit;
}

.top-bar-status {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 1 auto;
  min-width: 0;
  color: var(--muted);
  white-space: nowrap;
}

.save-status {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.save-dot {
  flex: none;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--ok);
}

.save-status[data-status='unsaved'] .save-dot {
  background: var(--danger);
}

.save-status[data-status='other-tab'] .save-dot {
  background: var(--attn);
}

.top-bar-notice {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.top-bar-spacer {
  flex: 1 1 0;
  min-width: 8px;
}

.top-bar-divider {
  flex: none;
  width: 1px;
  height: 20px;
  margin: 0 4px;
  background: var(--line);
}

/* Menus (§10.1; the Order menu in Task 4 reuses these). */
.menu {
  z-index: 6;
  min-width: 220px;
  padding: 4px;
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 10px;
  box-shadow: var(--shadow);
  color: var(--text);
  font-size: 13px;
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 30px;
  padding: 0 8px;
  border-radius: 6px;
  outline: none;
  cursor: pointer;
  user-select: none;
}

.menu-item[data-highlighted] {
  background: var(--raised);
}

.menu-item[data-disabled] {
  color: var(--muted);
  cursor: default;
}

.menu-item svg {
  flex: none;
  color: var(--muted);
}

.menu-item-label {
  flex: 1;
}

.menu-separator {
  height: 1px;
  margin: 4px 0;
  background: var(--line);
}

@keyframes shell-fade-in {
  from {
    opacity: 0;
  }
}

@media (prefers-reduced-motion: no-preference) {
  .menu {
    animation: shell-fade-in 100ms ease-out;
  }
}

/* Icon column (§5). */
.icon-column {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px 0;
  overflow-y: auto;
  background: var(--panel);
  border-right: 1px solid var(--line);
}

.icon-column .icon-button {
  width: 36px;
  height: 36px;
}

.icon-column-separator {
  flex: none;
  width: 32px;
  height: 2px;
  margin: 8px 0;
  border-radius: 1px;
  background: var(--line-strong);
}

.wood-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  flex: none;
  min-width: 30px;
  height: 30px;
  padding: 0 7px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--raised);
  color: var(--text);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.wood-chip-column {
  width: 30px;
  padding: 0;
}

.wood-chip-swatch {
  flex: none;
  width: 16px;
  height: 16px;
  border: 1px solid var(--line-strong);
  border-radius: 50%;
}

.wood-chip-text {
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

/* Left pane (§6) and the Wood pane (§6.3). */
.left-pane {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--panel);
  color: var(--text);
  font-size: 13px;
}

.pane-title {
  display: flex;
  flex: none;
  align-items: center;
  gap: 8px;
  height: 40px;
  padding: 0 8px 0 12px;
  border-bottom: 1px solid var(--line);
}

.pane-title h2 {
  flex: 1;
  min-width: 0;
  margin: 0;
  overflow: hidden;
  font-size: 13px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pane-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.pane-note {
  margin: 8px 12px;
  color: var(--muted);
  font-size: 12px;
}

.wood-list {
  margin: 0;
  padding: 4px;
  list-style: none;
}

.wood-row {
  display: flex;
  align-items: center;
  gap: 4px;
  border-radius: 6px;
}

.wood-row:hover {
  background: var(--raised);
}

.wood-swatch {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 8px;
  min-width: 0;
  height: 36px;
  padding: 0 6px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.wood-swatch[aria-pressed='true'] {
  background: var(--acc-soft);
}

.wood-swatch:disabled {
  opacity: 0.55;
  cursor: default;
}

.wood-swatch-color {
  flex: none;
  width: 28px;
  height: 28px;
  border: 1px solid var(--line-strong);
  border-radius: 6px;
}

.wood-swatch-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.wood-usage {
  flex: none;
  min-width: 20px;
  color: var(--muted);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.material-editor-trigger.icon-button {
  width: 28px;
  height: 28px;
}

/* Inspector frame (restyled in Task 9). */
.inspector {
  box-sizing: border-box;
  height: 100%;
  padding: 10px 12px;
  overflow-y: auto;
  background: var(--panel);
  color: var(--text);
  font-size: 13px;
}

/* Canvas controls (§7.2) and the transitional canvas strip (removed in Task 4). */
.canvas-controls,
.canvas-actions {
  position: absolute;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px;
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 12px;
  box-shadow: var(--shadow);
}

.canvas-controls {
  right: 14px;
  bottom: 14px;
}

.canvas-actions {
  top: 8px;
  right: 8px;
  gap: 4px;
}

.zoom-readout {
  min-width: 52px;
  height: 32px;
  padding: 0 6px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text);
  font: inherit;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
}

.zoom-readout:hover {
  background: var(--raised);
}

/* Touch (§5, V1 §7.4): 44 px hit areas; the column widens to 56 px. */
@media (pointer: coarse) {
  .app-body {
    grid-template-columns: 56px minmax(0, 1fr);
  }

  .pane-overlay-left {
    left: 56px;
  }

  .icon-button,
  .wood-chip,
  .zoom-readout,
  .canvas-actions .text-button {
    min-width: 44px;
    min-height: 44px;
  }
}
```

- [ ] **Step 3.16: Run the shell spec**

Run: `pnpm exec playwright test e2e/shell.spec.ts`
Expected: PASS in all four projects. The overlay-width and round-trip assertions depend on the library restoring the three-panel layout when the side Panels remount. If a library error or a width mismatch appears, stop and report it; it contradicts the Task 0 spike.

- [ ] **Step 3.17: Fix the existing specs broken by the moved controls**

These locators now miss (found with `grep -rn "Open Project\|New Project\|Download Project\|status-bar\|materials-panel\|project-menu\|\.toolbar\|getByRole('banner')\|getByLabel('Name'" e2e`):

1. **`e2e/persistence.spec.ts`**
   - l.11: add `projectMenuItem` to the `./helpers.ts` import.
   - l.42: `const downloadButton = page.locator('.status-bar').getByRole('button', { name: 'Download' })` becomes `const downloadButton = page.getByRole('banner').getByRole('button', { name: 'Download', exact: true })`.
   - l.67: `await expect(page.locator('.status-bar').getByRole('button', { name: 'Download' })).toBeVisible()` becomes `await expect(page.getByRole('banner').getByRole('button', { name: 'Download', exact: true })).toBeVisible()`.
   - l.102–103: the comment becomes `// message renders only in the top bar's notice (shell §8).`, and the assertion becomes `await expect(page.locator('.top-bar-notice')).toContainText('not valid JSON')`.
   - l.114: becomes `await projectMenuItem(page, 'Open project…')`.
   - l.129: becomes `const [chooser] = await Promise.all([page.waitForEvent('filechooser'), projectMenuItem(page, 'Open project…')])`.
   - l.142 and l.156: each becomes `await projectMenuItem(page, 'New project…')`.
   - l.169 and l.177: each becomes `const [download] = await Promise.all([page.waitForEvent('download'), projectMenuItem(page, 'Download project')])`.

2. **`e2e/materials.spec.ts`**
   - Replace the test at l.152–162 with:

     ```ts
       test('typing "b" in the project Rename field does not switch tools', async ({ page }) => {
         await seed(page, project([]))
         expect(await tool(page)).toBe('select')

         await projectMenuItem(page, 'Rename')
         const name = page.getByLabel('Name', { exact: true })
         await expect(name).toBeFocused()
         await name.press('b')

         expect(await tool(page)).toBe('select')
         await expect(name).toHaveValue(/b/)
       })
     ```

   - Add `projectMenuItem` to its `./helpers.ts` import.
   - The swatch tests (`Walnut`, `Edit Maple`, and so on) are unchanged: the Wood pane is open on the Wood tab by default.

3. **`e2e/a11y.spec.ts` l.56–58.** Replace the three `offenders.push` lines with:

   ```ts
       offenders.push(...(await unlabeledButtons(page, '.top-bar button')))
       offenders.push(...(await unlabeledButtons(page, '.icon-column button')))
       offenders.push(...(await unlabeledButtons(page, '.left-pane button'))) // the Wood pane, open by default
       offenders.push(...(await unlabeledButtons(page, '.canvas-controls button')))
       offenders.push(...(await unlabeledButtons(page, '.canvas-actions button')))
   ```

4. **`e2e/tablet.spec.ts` l.157–170.** The test title becomes `'every icon button meets the 44×44 px touch target'`. l.159 becomes:

   ```ts
       const buttons = page.locator('.icon-column button, .canvas-controls button, .canvas-actions button, .top-bar .icon-button')
   ```

   The failure message on l.169 becomes `` `icon buttons under 44×44 px: ${undersized.join(', ')}` ``.

5. **`e2e/motifs.spec.ts` l.141.** Becomes:

   ```ts
       await page.getByRole('toolbar', { name: 'Canvas actions' }).getByRole('button', { name: 'Repeat', exact: true }).click() // Create Motif, then Repeat
   ```

6. **`e2e/author/actions.ts` l.224–228.** Becomes:

   ```ts
     /** Canvas Repeat: Create Motif then a 2×2 field, or 2×2 of one selected instance (SPEC §7.4). */
     async repeat(): Promise<void> {
       await this.page.getByRole('toolbar', { name: 'Canvas actions' }).getByRole('button', { name: 'Repeat', exact: true }).click()
       await this.tick()
     }
   ```

7. **Task 2's `e2e/tooltips.spec.ts`.** If it scopes the tool buttons with `.toolbar`, replace that scope with `.icon-column`.

Run:

```bash
pnpm exec playwright test e2e/persistence.spec.ts e2e/materials.spec.ts e2e/a11y.spec.ts e2e/tablet.spec.ts e2e/motifs.spec.ts e2e/export-parity.spec.ts e2e/crossing-proof.spec.ts e2e/tooltips.spec.ts e2e/author
```

Expected: PASS.

Then run the whole suite, `pnpm test:e2e`. The canvas is narrower now (864 px at 1440 × 900), so any spec whose canvas press lands under `.canvas-actions` (top-right, 8–50 px below the canvas top) or `.canvas-controls` (bottom-right) fails. For each such failure, move that spec's `setCamera(… cameraShowing(p, local, zoom))` so the target `local` sits outside those corners. Do not hide the bars.

- [ ] **Step 3.18: Verify and commit**

Run: `pnpm typecheck && pnpm test && pnpm exec playwright test e2e/shell.spec.ts e2e/persistence.spec.ts e2e/materials.spec.ts e2e/a11y.spec.ts e2e/tablet.spec.ts e2e/motifs.spec.ts e2e/author`
Expected: all green.

```bash
git add package.json pnpm-lock.yaml src/index.css \
  src/ui/App.tsx src/ui/TopBar.tsx src/ui/ProjectMenu.tsx src/ui/icons.tsx src/ui/IconColumn.tsx src/ui/ToolButtons.tsx \
  src/ui/LeftPane.tsx src/ui/WoodPane.tsx src/ui/CanvasControls.tsx src/ui/Toolbar.tsx src/ui/MaterialEditor.tsx src/ui/ToolOptions.tsx \
  src/ui/Inspector/Inspector.tsx src/ui/Inspector/BoardPanel.tsx src/ui/StatusBar.tsx src/ui/MaterialPalette.tsx \
  src/export/download.ts src/export/download.test.ts \
  src/editor/layout.ts src/editor/layout.test.ts src/editor/shortcuts.ts src/editor/shortcuts.test.ts src/editor/keyboard.ts src/editor/store.ts src/editor/testHook.ts \
  e2e/shell.spec.ts e2e/helpers.ts e2e/persistence.spec.ts e2e/materials.spec.ts e2e/a11y.spec.ts e2e/tablet.spec.ts e2e/motifs.spec.ts e2e/author/actions.ts
git status   # also stage any spec touched by Step 3.17's camera moves or the tooltips.spec scope
FSH_NO_TTY=1 git commit -m "Build the shell frame: top bar, panes, controls" -m "Replaces V1's button row, tool rail, status bar and in-inspector palette with the shell spec's top bar, icon column, resizable and collapsible side panes (narrow overlays below 1024 px), Wood pane and canvas controls, so the later shell tasks have their homes. Pane layout persists through a storage wrapper that never throws, and button toggles are saved like drags."
```

---

### Task 4: Canvas actions and tool dock

**Files:**
- Create:
  - `src/ui/ActionsBar.tsx`, `src/ui/ToolBar.tsx`
  - `e2e/actions-bar.spec.ts`, `e2e/dock.spec.ts`
- Modify:
  - `src/editor/store.ts`: `EditorState` (l.46–86) gains `clipboard`; the initial state gains it (l.143–156).
  - `src/editor/keyboard.ts`:
    - header l.24–28;
    - remove the clipboard import and module variable (l.30, l.47–48);
    - `copySelection` and `pasteClipboard` (l.73–92);
    - the mod block gains Mod+R;
    - Shift+T goes before the `]`/`[` block.
  - `src/editor/keyboard.test.ts`: append.
  - `src/editor/shortcuts.ts`: 2 entries.
  - `src/ui/App.tsx`: the canvas-host children and imports.
  - `src/ui/IconColumn.tsx`: whole file.
  - `src/ui/CanvasControls.tsx`: dock-dependent position.
  - `src/ui/ProjectMenu.tsx`: the DEV samples submenu.
  - `src/ui/Inspector/SelectionPanel.tsx`: whole file.
  - `src/ui/Inspector/InstancePanel.tsx`: `EditMotifButton` and the detach helper, l.229–240 and l.296–330.
  - `src/editor/testHook.ts`: l.49.
  - `src/index.css`: append the "Actions bar and tool dock" section, and delete the `.canvas-actions` rules.
  - e2e: `e2e/motifs.spec.ts`, `e2e/author/actions.ts`, `e2e/author/interlace.spec.ts`, `e2e/a11y.spec.ts`, `e2e/tablet.spec.ts`.
- Delete: `src/ui/Toolbar.tsx`.
- Test:
  - `src/editor/keyboard.test.ts`
  - `e2e/actions-bar.spec.ts`
  - `e2e/dock.spec.ts`
  - the modified specs

**Interfaces:**
- Consumes:
  - Task 3: `ToolButtons({ variant })`, `WoodChip({ variant })`, `MotifIcon`, `RepeatIcon`, the `useLayout.uiActions` machinery, the `.menu`/`.menu-item` styles, `projectMenuItem`.
  - Task 2: `Hint`, `HintProps`, `SHORTCUTS`.
  - Task 1: `useLayout.toolsDocked`, `setToolsDocked(d)`.
- Produces:
  - The editor store gains `clipboard: Clipboard | null` (type from `@/domain/commands`; initially `null`; `replaceProject` keeps it).
  - `ActionsBar(): JSX.Element | null`: a `role="toolbar"` named `Selection actions`.
  - `ToolBar(): JSX.Element`: a `role="toolbar"` named `Tools`.
  - `SHORTCUTS` entries `repeat` and `toggleDock`.
  - From `src/ui/Inspector/InstancePanel.tsx`: `enterMotif(obj: MotifInstance | RepeatField): void` and `detachInstanceAndSelect(id: Id): void`.

- [ ] **Step 4.1: Write the failing clipboard tests**

Append to `src/editor/keyboard.test.ts`. Change its imports to `import { copySelection, cycleSelection, pasteClipboard } from './keyboard.ts'`.

```ts
describe('the clipboard lives in the store (shell §9.4)', () => {
  it('Copy writes it, replaceProject keeps it, Paste reads it', () => {
    resetStore(fourObjectProject(), ['a'])
    useEditor.setState({ clipboard: null })
    copySelection()
    expect(useEditor.getState().clipboard?.objects.map((o) => o.type)).toEqual(['band'])

    useEditor.getState().replaceProject(project([]))
    expect(useEditor.getState().clipboard).not.toBeNull()

    pasteClipboard()
    const pasted = useEditor.getState().project.rootChildren
    expect(pasted).toHaveLength(1)
    expect(useEditor.getState().selection).toEqual(pasted)
  })

  it('Paste with nothing copied changes nothing', () => {
    resetStore(fourObjectProject())
    useEditor.setState({ clipboard: null })
    const before = useEditor.getState().project
    pasteClipboard()
    expect(useEditor.getState().project).toBe(before)
    expect(useEditor.temporal.getState().pastStates).toHaveLength(0)
  })
})
```

Run: `pnpm test src/editor/keyboard.test.ts`
Expected: FAIL. The first test gets `undefined` from `useEditor.getState().clipboard` after Copy (the copy still went to the module variable) and doesn't equal `['band']`.

- [ ] **Step 4.2: Move the clipboard into the store**

`src/editor/store.ts`:
1. Change `import type { CommandResult } from '@/domain/commands'` to `import type { Clipboard, CommandResult } from '@/domain/commands'`.
2. In `interface EditorState`, after `abortGesture: (() => void) | null`, add:

   ```ts
     /** Shell §9.4: the last Copy (not the system clipboard). Written by copySelection; kept by replaceProject, like V1's module variable. */
     clipboard: Clipboard | null
   ```

3. In the initial state, after `abortGesture: null,`, add `clipboard: null,`.

`src/editor/keyboard.ts`:
1. Delete `import type { Clipboard } from '@/domain/commands'` (l.30).
2. Delete l.47–48, the comment `/** The clipboard: a module variable, not the system clipboard (SPEC §7.4). */` and `let clipboard: Clipboard | null = null`.
3. Replace `copySelection` and `pasteClipboard` with:

   ```ts
   export function copySelection(): void {
     const s = useEditor.getState()
     if (s.selection.length === 0) return
     useEditor.setState({ clipboard: copyObjects(s.project, s.selection) })
   }

   export function pasteClipboard(): void {
     const s = useEditor.getState()
     const clip = s.clipboard
     if (clip === null) return
     const ctx = currentContext(s)
     let newIds: Id[] = []
     s.run((p) => {
       const result = pasteObjects(p, ctx, clip)
       if (!result.ok) return result
       newIds = result.newIds
       return result.project
     })
     if (newIds.length > 0) useEditor.setState({ selection: newIds })
   }
   ```

Run: `pnpm test src/editor/keyboard.test.ts`. Expected: PASS.

- [ ] **Step 4.3: Add Mod+R and Shift+T, and their `SHORTCUTS` entries**

In `src/editor/shortcuts.ts`, add to `SHORTCUTS`:

```ts
  repeat: { label: 'Repeat', keys: ['Mod+R'], hint: 'Repeat the selection as a 2 × 2 grid', group: 'Selection' },
  toggleDock: { label: 'Dock / undock tools', keys: ['Shift+T'], group: 'Panels' },
```

Add these rows to Task 2's `shortcuts.test.ts` effect table:

| Entry | Chord dispatched | Effect asserted |
| --- | --- | --- |
| `repeat` | `ctrlKey`, `key: 'r'`, on a store holding two root bands with both selected | `project.rootChildren` becomes one object of `type: 'repeat'` |
| `toggleDock` | `shiftKey`, `key: 'T'` | `useLayout.getState().toolsDocked` flips |

Run: `pnpm test src/editor/shortcuts.test.ts`. Expected: FAIL on those two rows.

In `src/editor/keyboard.ts`:
1. Replace the header paragraph l.24–28:

   ```ts
   // Mirror X/Y, Rotate 90°/by, the order buttons, and Offset copy have no
   // keyboard shortcut in SPEC §7.4 — only a toolbar/inspector button, already
   // wired (SelectionPanel, BandPanel) straight to the same domain commands
   // this dispatcher calls, so nothing here duplicates them. `Ctrl/Cmd+G` is
   // Create Motif.
   ```

   with:

   ```ts
   // Mirror X/Y, Rotate 90°/by, the Order menu and Offset copy have no
   // keyboard shortcut — only a button (ActionsBar, SelectionPanel,
   // BandPanel) wired straight to the same domain commands. `Mod+G` is Make
   // motif, `Mod+R` Repeat (preventDefault'ed so the browser doesn't reload)
   // and `Shift+T` docks/undocks the tools (shell §12.2). The clipboard lives
   // in the editor store (shell §9.4).
   ```

2. In the mod block, directly after Task 3's `if (e.shiftKey && lower === 'e') { … }` block, add:

   ```ts
         if (!e.shiftKey && lower === 'r') {
           repeatSelection()
           e.preventDefault()
           return
         }
   ```

3. Before `if (!ctrlOrMeta && !e.altKey && (key === ']' || key === '[') && cyclingOwnsFocus(e.target)) {`, add:

   ```ts
       if (!ctrlOrMeta && !e.altKey && e.shiftKey && lower === 't') {
         const { toolsDocked, setToolsDocked } = useLayout.getState()
         setToolsDocked(!toolsDocked)
         e.preventDefault()
         return
       }
   ```

Run: `pnpm test`. Expected: PASS.

- [ ] **Step 4.4: Write the failing actions-bar and dock e2e specs**

Create `e2e/actions-bar.spec.ts`:

```ts
// Shell §9.4 (Task 4): the Select tool's actions bar — contents by selection,
// Paste's disabled reason until Copy, the Order menu, Edit motif, and Detach
// for an instance only; §12.2 Mod+R; and Review Focus 3 for Shift+T and Mod+R
// typed into a field.

import type { Locator, Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import type { Project } from '../src/domain/model.ts'
import { band, MAT2, project } from '../src/domain/test-builders.ts'
import { getProject, history, seed, seededProject, select } from './helpers.ts'

declare global {
  interface Window {
    __noReload?: boolean
  }
}

function bar(page: Page): Locator {
  return page.getByRole('toolbar', { name: 'Selection actions' })
}

function twoBands(): Project {
  return project([band('b1', [[0, 40], [80, 40]]), band('b2', [[0, 80], [80, 80]], { materialId: MAT2 })])
}

test('shows only Paste with nothing selected, and the full set with a count once something is', async ({ page }) => {
  await seed(page, twoBands())
  await expect(bar(page).getByRole('button')).toHaveCount(1)
  await expect(bar(page).getByRole('button', { name: 'Paste', exact: true })).toBeDisabled()

  await select(page, ['b1'])
  await expect(bar(page)).toContainText('1 band')
  for (const name of ['Duplicate', 'Copy', 'Paste', 'Mirror X', 'Mirror Y', 'Rotate 90° CCW', 'Rotate 90° CW', 'Order', 'Make motif', 'Repeat', 'Delete']) {
    await expect(bar(page).getByRole('button', { name, exact: true })).toBeVisible()
  }
  await expect(bar(page).getByRole('button', { name: 'Edit motif', exact: true })).toHaveCount(0)
  await expect(bar(page).getByRole('button', { name: 'Detach', exact: true })).toHaveCount(0)

  await select(page, ['b1', 'b2'])
  await expect(bar(page)).toContainText('2 objects')
})

test.describe('Paste', () => {
  test.skip(({ isMobile }) => isMobile, 'hover tooltips are for fine pointers')

  test('is disabled with the reason "Copy something first" until Copy, then pastes', async ({ page }) => {
    await seed(page, twoBands())
    await select(page, ['b1'])
    const paste = bar(page).getByRole('button', { name: 'Paste', exact: true })
    await expect(paste).toBeDisabled()
    await paste.locator('..').hover() // Hint wraps a disabled trigger so its tooltip can still open
    await expect(page.getByRole('tooltip')).toContainText('Copy something first')

    await bar(page).getByRole('button', { name: 'Copy', exact: true }).click()
    await expect(paste).toBeEnabled()
    await paste.click()
    expect((await getProject(page)).rootChildren).toHaveLength(3)
    expect(await history(page)).toEqual({ past: 1, future: 0 })
  })
})

test('Order → Send to back changes the paint order in one history step', async ({ page }) => {
  await seed(page, twoBands())
  await select(page, ['b2'])
  await bar(page).getByRole('button', { name: 'Order', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Send to back', exact: true }).click()
  expect((await getProject(page)).rootChildren).toEqual(['b2', 'b1'])
  expect(await history(page)).toEqual({ past: 1, future: 0 })
})

test('Edit motif enters an instance; Detach is offered for an instance, never for a repeat', async ({ page }) => {
  await seed(page, seededProject()) // i1: an instance of m1; rp1: a 2×2 repeat of m2
  await select(page, ['rp1'])
  await expect(bar(page)).toContainText('1 repeat')
  await expect(bar(page).getByRole('button', { name: 'Edit motif', exact: true })).toBeVisible()
  await expect(bar(page).getByRole('button', { name: 'Detach', exact: true })).toHaveCount(0)

  await select(page, ['i1'])
  await expect(bar(page)).toContainText('1 instance')
  await expect(bar(page).getByRole('button', { name: 'Detach', exact: true })).toBeVisible()
  await bar(page).getByRole('button', { name: 'Edit motif', exact: true }).click()
  expect(await page.evaluate(() => window.__cbpd!.getState().editContext)).toEqual([{ motifId: 'm1', path: [{ instanceId: 'i1' }] }])
  expect(await page.evaluate(() => window.__cbpd!.getState().selection)).toEqual([])
})

test('Mod+R repeats the selection and does not reload the page', async ({ page }) => {
  await seed(page, twoBands())
  await page.evaluate(() => {
    window.__noReload = true
  })
  await select(page, ['b1', 'b2'])
  await page.keyboard.press('ControlOrMeta+r')
  const p = await getProject(page)
  expect(p.rootChildren).toHaveLength(1)
  expect(p.objects[p.rootChildren[0]!]!.type).toBe('repeat')
  expect(await page.evaluate(() => window.__noReload)).toBe(true)
})

test('Shift+T and Mod+R typed into a field do nothing (Review Focus 3)', async ({ page }) => {
  await seed(page, twoBands())
  await page.evaluate(() => {
    window.__noReload = true
  })
  await select(page, ['b1', 'b2'])
  const x = page.getByRole('region', { name: 'Selection' }).getByLabel('X', { exact: true })
  await x.focus()
  await x.press('Shift+T')
  await x.press('ControlOrMeta+r')
  await expect(x).toBeFocused()
  await expect(page.getByRole('toolbar', { name: 'Tools' })).toHaveCount(0) // still docked
  expect((await getProject(page)).rootChildren).toEqual(['b1', 'b2'])
  expect(await page.evaluate(() => window.__noReload)).toBe(true)
})
```

Create `e2e/dock.spec.ts`:

```ts
// Shell §7.1, §7.2 (Task 4): Undock / Dock tools by button and by Shift+T;
// the choice persists across a reload; the canvas controls move to a
// vertical bar at the top-right while the tools are undocked.

import type { Locator, Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { project } from '../src/domain/test-builders.ts'
import { open, seed } from './helpers.ts'

function column(page: Page): Locator {
  return page.locator('.icon-column')
}

function toolBar(page: Page): Locator {
  return page.getByRole('toolbar', { name: 'Tools' })
}

async function box(locator: Locator): Promise<{ x: number; y: number; width: number; height: number }> {
  const b = await locator.boundingBox()
  expect(b, 'the element is laid out').not.toBeNull()
  return b!
}

test('Undock tools floats them in a bottom bar with the wood chip; Dock tools returns them; the canvas controls follow', async ({ page }) => {
  await seed(page, project([])) // current wood: Maple; next Band width 6.35 mm
  const host = await box(page.locator('.canvas-host'))
  await expect(column(page).getByRole('button', { name: 'Select', exact: true })).toBeVisible()
  let controls = await box(page.locator('.canvas-controls'))
  expect(host.y + host.height - (controls.y + controls.height)).toBeLessThan(40) // bottom-right while docked

  await column(page).getByRole('button', { name: 'Undock tools', exact: true }).click()
  await expect(toolBar(page).getByRole('button', { name: 'Select', exact: true })).toBeVisible()
  await expect(toolBar(page).getByRole('button', { name: 'Current wood: Maple', exact: true })).toContainText('Maple · 6.35 mm')
  await expect(column(page).getByRole('button', { name: 'Select', exact: true })).toHaveCount(0)
  await expect(column(page).getByRole('button', { name: 'Undock tools', exact: true })).toHaveCount(0)
  const bottomBar = await box(toolBar(page))
  expect(host.y + host.height - (bottomBar.y + bottomBar.height)).toBeLessThan(30) // 14 px above the canvas bottom
  controls = await box(page.locator('.canvas-controls'))
  expect(controls.y - host.y).toBeLessThan(30) // top …
  expect(host.x + host.width - (controls.x + controls.width)).toBeLessThan(30) // … right
  expect(controls.height).toBeGreaterThan(controls.width) // vertical

  await toolBar(page).getByRole('button', { name: 'Dock tools', exact: true }).click()
  await expect(toolBar(page)).toHaveCount(0)
  await expect(column(page).getByRole('button', { name: 'Select', exact: true })).toBeVisible()
  controls = await box(page.locator('.canvas-controls'))
  expect(host.y + host.height - (controls.y + controls.height)).toBeLessThan(40)
})

test('Shift+T toggles the dock, and the choice survives a reload', async ({ page }) => {
  await open(page)
  await page.keyboard.press('Shift+T')
  await expect(toolBar(page)).toBeVisible()
  await open(page)
  await expect(toolBar(page)).toBeVisible()
  await expect(column(page).getByRole('button', { name: 'Select', exact: true })).toHaveCount(0)
  await page.keyboard.press('Shift+T')
  await expect(toolBar(page)).toHaveCount(0)
  await open(page)
  await expect(column(page).getByRole('button', { name: 'Select', exact: true })).toBeVisible()
})
```

Run: `pnpm exec playwright test e2e/actions-bar.spec.ts e2e/dock.spec.ts --project=chromium`
Expected: FAIL. `Selection actions`, `Undock tools` and `Tools` aren't found. The two Mod+R tests fail too, because there is no Repeat on the bar yet (`rootChildren` stays length 2).

- [ ] **Step 4.5: Share the enter and detach logic from `InstancePanel`**

In `src/ui/Inspector/InstancePanel.tsx`:
1. Replace `EditMotifButton` (l.229–240) with:

   ```tsx
   /** V1 §7.6: enters `obj`'s definition at its first occurrence and clears the selection. Shared with the actions bar. */
   export function enterMotif(obj: Placed): void {
     const s = useEditor.getState()
     s.enterContext({ motifId: obj.motifId, path: [firstStep(obj)] })
     s.select([])
   }

   /** V1 §5.6 Detach: the instance becomes copies of its definition's objects, which are then selected. Shared with the actions bar. */
   export function detachInstanceAndSelect(id: Id): void {
     let copies: Id[] = []
     useEditor.getState().run((p) => {
       const result = detachInstance(p, id)
       if (!result.ok) return result
       copies = result.newIds
       return result.project
     })
     if (copies.length > 0) useEditor.getState().select(copies)
   }

   export function EditMotifButton({ obj }: { obj: Placed }): JSX.Element {
     return (
       <button type="button" onClick={() => enterMotif(obj)}>
         Edit Motif
       </button>
     )
   }
   ```

2. In `InstancePanel`, delete the local `const detach = (): void => { … }` (l.300–309). Change `<button type="button" onClick={detach}>` to `<button type="button" onClick={() => detachInstanceAndSelect(instance.id)}>`.

`Placed` stays module-private. `enterMotif`'s parameter type `Placed` is `MotifInstance | RepeatField`, which the actions bar passes directly.

Run: `pnpm typecheck`. Expected: PASS.

- [ ] **Step 4.6: Create `src/ui/ActionsBar.tsx`**

```tsx
// Shell §9.4: the Select tool's actions bar, centred 12 px below the
// canvas's top edge; hidden while drawing and for the other tools.
// - With a selection: a count, then Duplicate / Copy / Paste; Mirror X / Y
//   and Rotate 90° CCW / CW; the Order menu; Make motif / Repeat; Edit motif
//   (one Instance or Repeat); Detach (one Instance only, V1 §5.6); Delete.
// - With nothing selected: Paste only.
// Groups wrap on a narrow canvas.

import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { ArrowUpDown, ClipboardPaste, Copy, CopyPlus, FlipHorizontal2, FlipVertical2, RotateCcw, RotateCw, Trash2, Unlink } from 'lucide-react'
import type { JSX, ReactElement } from 'react'
import { mirrorObjects, reorder, rotateObjects } from '@/domain/commands'
import type { DesignObject } from '@/domain/model'
import { copySelection, createMotifFromSelection, deleteSelection, duplicateSelection, pasteClipboard, repeatSelection } from '@/editor/keyboard'
import { useEditor } from '@/editor/store'
import { selectionBounds } from '@/editor/tools/select'
import type { HintProps } from './Hint.tsx'
import { Hint } from './Hint.tsx'
import { MotifIcon, RepeatIcon } from './icons.tsx'
import { detachInstanceAndSelect, enterMotif } from './Inspector/InstancePanel.tsx'

const ICON = { size: 18, strokeWidth: 1.6 } as const

const TYPE_NAME: Record<DesignObject['type'], string> = { band: 'band', region: 'region', 'motif-instance': 'instance', repeat: 'repeat' }

const ORDER: ReadonlyArray<['forward' | 'backward' | 'front' | 'back', string]> = [
  ['forward', 'Bring forward'],
  ['backward', 'Send backward'],
  ['front', 'Bring to front'],
  ['back', 'Send to back'],
]

function ActionButton({ label, icon, onClick, hint }: { label: string; icon: ReactElement; onClick(): void; hint: Omit<HintProps, 'children'> }): JSX.Element {
  return (
    <Hint side="bottom" {...hint}>
      <button type="button" className="icon-button" aria-label={label} disabled={hint.disabledReason !== undefined} onClick={onClick}>
        {icon}
      </button>
    </Hint>
  )
}

export function ActionsBar(): JSX.Element | null {
  const tool = useEditor((s) => s.tool)
  const drawing = useEditor((s) => s.drawing)
  const project = useEditor((s) => s.project)
  const selection = useEditor((s) => s.selection)
  const editContext = useEditor((s) => s.editContext)
  const clipboardEmpty = useEditor((s) => s.clipboard === null)
  if (tool !== 'select' || drawing !== null) return null

  const paste = (
    <ActionButton
      label="Paste"
      icon={<ClipboardPaste {...ICON} />}
      onClick={pasteClipboard}
      hint={clipboardEmpty ? { shortcut: 'paste', disabledReason: 'Copy something first' } : { shortcut: 'paste' }}
    />
  )

  if (selection.length === 0) {
    return (
      <div className="actions-bar" role="toolbar" aria-label="Selection actions">
        {paste}
      </div>
    )
  }

  const single = selection.length === 1 ? project.objects[selection[0]!] : undefined
  const bounds = selectionBounds(project, editContext, selection)
  const centre = bounds === null ? null : { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 }
  const run = useEditor.getState().run

  return (
    <div className="actions-bar" role="toolbar" aria-label="Selection actions">
      <span className="actions-count">{single === undefined ? `${selection.length} objects` : `1 ${TYPE_NAME[single.type]}`}</span>
      <span className="actions-group">
        <ActionButton label="Duplicate" icon={<CopyPlus {...ICON} />} onClick={duplicateSelection} hint={{ shortcut: 'duplicate' }} />
        <ActionButton label="Copy" icon={<Copy {...ICON} />} onClick={copySelection} hint={{ shortcut: 'copy' }} />
        {paste}
      </span>
      {centre !== null && (
        <span className="actions-group">
          <span className="bar-divider" aria-hidden="true" />
          <ActionButton label="Mirror X" icon={<FlipHorizontal2 {...ICON} />} onClick={() => run((p) => mirrorObjects(p, selection, 'x', centre))} hint={{ label: 'Mirror X' }} />
          <ActionButton label="Mirror Y" icon={<FlipVertical2 {...ICON} />} onClick={() => run((p) => mirrorObjects(p, selection, 'y', centre))} hint={{ label: 'Mirror Y' }} />
          <ActionButton label="Rotate 90° CCW" icon={<RotateCcw {...ICON} />} onClick={() => run((p) => rotateObjects(p, selection, -90, centre))} hint={{ label: 'Rotate 90° CCW' }} />
          <ActionButton label="Rotate 90° CW" icon={<RotateCw {...ICON} />} onClick={() => run((p) => rotateObjects(p, selection, 90, centre))} hint={{ label: 'Rotate 90° CW' }} />
        </span>
      )}
      <span className="actions-group">
        <DropdownMenu.Root modal={false}>
          <Hint label="Order" side="bottom">
            <DropdownMenu.Trigger asChild>
              <button type="button" className="icon-button" aria-label="Order">
                <ArrowUpDown {...ICON} />
              </button>
            </DropdownMenu.Trigger>
          </Hint>
          <DropdownMenu.Portal>
            <DropdownMenu.Content className="menu" sideOffset={6}>
              {ORDER.map(([how, label]) => (
                <DropdownMenu.Item key={how} className="menu-item" onSelect={() => run((p) => reorder(p, selection, how))}>
                  <span className="menu-item-label">{label}</span>
                </DropdownMenu.Item>
              ))}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
        <span className="bar-divider" aria-hidden="true" />
        <ActionButton label="Make motif" icon={<MotifIcon />} onClick={createMotifFromSelection} hint={{ shortcut: 'makeMotif' }} />
        <ActionButton label="Repeat" icon={<RepeatIcon />} onClick={repeatSelection} hint={{ shortcut: 'repeat' }} />
        {(single?.type === 'motif-instance' || single?.type === 'repeat') && (
          <ActionButton label="Edit motif" icon={<MotifIcon />} onClick={() => enterMotif(single)} hint={{ label: 'Edit motif', hint: 'Changes apply to every occurrence' }} />
        )}
        {single?.type === 'motif-instance' && (
          <ActionButton label="Detach" icon={<Unlink {...ICON} />} onClick={() => detachInstanceAndSelect(single.id)} hint={{ label: 'Detach', hint: 'Replace this instance with editable copies' }} />
        )}
      </span>
      <span className="actions-group">
        <span className="bar-divider" aria-hidden="true" />
        <ActionButton label="Delete" icon={<Trash2 {...ICON} />} onClick={deleteSelection} hint={{ shortcut: 'delete' }} />
      </span>
    </div>
  )
}
```

(`centre` is `null` only when the selection has no painted bounds, for example an instance of an emptied motif. Then the transform group is left out, as `SelectionPanel` did.)

- [ ] **Step 4.7: Trim `SelectionPanel`**

Replace `src/ui/Inspector/SelectionPanel.tsx` with:

```tsx
// SPEC §7.5 Selection panel: shown for any non-empty selection (stacked
// above the Band/Region panel for a single object of that type). Bounds
// X/Y translate the selection; Rotate by rotates about the bounds centre and
// resets to 0. Bounds, X/Y and the pivot are in the current context's space,
// like the commands they drive. Its buttons moved to the actions bar (shell §9.4).

import type { JSX } from 'react'
import { rotateObjects, translateObjects } from '@/domain/commands'
import { useEditor } from '@/editor/store'
import { selectionBounds } from '@/editor/tools/select'
import type { PreviewOutcome } from './NumberField.tsx'
import { NumberField } from './NumberField.tsx'

export function SelectionPanel(): JSX.Element | null {
  const project = useEditor((s) => s.project)
  const selection = useEditor((s) => s.selection)
  const editContext = useEditor((s) => s.editContext)
  const commit = (): void => useEditor.getState().commit()

  const bounds = selectionBounds(project, editContext, selection)
  if (bounds === null) return null

  const centre = { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 }

  const previewTranslate = (x: number, y: number): PreviewOutcome => {
    useEditor.getState().setPreview(translateObjects(project, selection, x - bounds.minX, y - bounds.minY), 'commit')
    return undefined
  }

  return (
    <section className="panel" aria-label="Selection">
      <h2>Selection</h2>
      <NumberField label="X" value={bounds.minX} unit={project.displayUnits} policy="any" onPreview={(v) => previewTranslate(v, bounds.minY)} onCommit={commit} />
      <NumberField label="Y" value={bounds.minY} unit={project.displayUnits} policy="any" onPreview={(v) => previewTranslate(bounds.minX, v)} onCommit={commit} />
      <NumberField
        label="Rotate by"
        value={0}
        unit="deg"
        policy="any"
        onPreview={(deg) => {
          useEditor.getState().setPreview(rotateObjects(project, selection, deg, centre), 'commit')
          return undefined
        }}
        onCommit={commit}
      />
    </section>
  )
}
```

- [ ] **Step 4.8: Create `ToolBar`, add Undock to `IconColumn`, and reposition `CanvasControls`**

Delete the transitional strip first (it differs from the new file only by case): `git rm src/ui/Toolbar.tsx`.

Create `src/ui/ToolBar.tsx`:

```tsx
// Shell §7.1: the undocked tool bar, centred 14 px above the canvas's bottom
// edge. It holds Select and Hand | Band, Rectangle, Polygon and Crossing |
// the current-wood chip with the next Band's width | Dock tools.

import { PanelLeft } from 'lucide-react'
import type { JSX } from 'react'
import { useLayout } from '@/editor/layout'
import { Hint } from './Hint.tsx'
import { ToolButtons, WoodChip } from './ToolButtons.tsx'

export function ToolBar(): JSX.Element {
  return (
    <div className="tool-bar" role="toolbar" aria-label="Tools">
      <ToolButtons variant="bar" />
      <span className="bar-divider" aria-hidden="true" />
      <WoodChip variant="bar" />
      <span className="bar-divider" aria-hidden="true" />
      <Hint shortcut="toggleDock" label="Dock tools" side="top">
        <button type="button" className="icon-button" aria-label="Dock tools" onClick={() => useLayout.getState().setToolsDocked(true)}>
          <PanelLeft size={18} strokeWidth={1.6} />
        </button>
      </Hint>
    </div>
  )
}
```

Replace `src/ui/IconColumn.tsx` with:

```tsx
// Shell §5: the icon column, with these parts:
// - pane tabs (Wood only until Task 5);
// - a separator;
// - the docked tools and the current-wood chip;
// - after flexible space, Undock tools. It is hidden while undocked, when the
//   tools live in the floating ToolBar instead.
// Clicking the active tab toggles the left pane; an inactive tab opens the
// pane on that tab (§4.1).

import { Palette, PictureInPicture2 } from 'lucide-react'
import type { JSX } from 'react'
import type { LeftTab } from '@/editor/layout'
import { useLayout } from '@/editor/layout'
import { Hint } from './Hint.tsx'
import { ToolButtons, WoodChip } from './ToolButtons.tsx'

export function IconColumn(): JSX.Element {
  const leftTab = useLayout((s) => s.leftTab)
  const leftOpen = useLayout((s) => s.leftOpen)
  const docked = useLayout((s) => s.toolsDocked)

  const onTab = (tab: LeftTab): void => {
    const ui = useLayout.getState().uiActions
    if (tab === leftTab) ui?.toggleLeft()
    else ui?.openLeft(tab)
  }

  return (
    <div className="icon-column">
      <Hint label="Wood" side="right">
        <button type="button" className="icon-button" aria-label="Wood" aria-pressed={leftOpen && leftTab === 'wood'} onClick={() => onTab('wood')}>
          <Palette size={18} strokeWidth={1.6} />
        </button>
      </Hint>
      <div className="icon-column-separator" role="separator" />
      {docked && (
        <>
          <ToolButtons variant="column" />
          <WoodChip variant="column" />
          <span className="icon-column-fill" />
          <Hint shortcut="toggleDock" label="Undock tools" side="right">
            <button type="button" className="icon-button undock-button" aria-label="Undock tools" onClick={() => useLayout.getState().setToolsDocked(false)}>
              <PictureInPicture2 size={18} strokeWidth={1.6} />
            </button>
          </Hint>
        </>
      )}
    </div>
  )
}
```

In `src/ui/CanvasControls.tsx`:
1. Change the header comment's last sentence to "Bottom-right while the tools are docked; a vertical bar at the top-right while they are undocked."
2. Add `import { useLayout } from '@/editor/layout'`.
3. Replace `  const side = 'top'` with:

   ```tsx
     const docked = useLayout((s) => s.toolsDocked)
     const side = docked ? 'top' : 'left'
   ```

4. Replace `<div className="canvas-controls" role="toolbar" aria-label="View">` with:

   ```tsx
       <div className={docked ? 'canvas-controls' : 'canvas-controls canvas-controls-vertical'} role="toolbar" aria-label="View" aria-orientation={docked ? 'horizontal' : 'vertical'}>
   ```

In `src/ui/App.tsx`:
1. Replace `import { Toolbar } from './Toolbar.tsx'` with:

   ```tsx
   import { ActionsBar } from './ActionsBar.tsx'
   import { ToolBar } from './ToolBar.tsx'
   ```

   Keep the imports alphabetised: `ActionsBar` goes before `Breadcrumb`, and `ToolBar` before `ToolOptions`.

2. After `const rightOpen = useLayout((s) => s.rightOpen)`, add `const toolsDocked = useLayout((s) => s.toolsDocked)`.
3. Replace the canvas-host children:

   ```tsx
                   <Canvas />
                   <Toolbar />
                   <CanvasControls />
                   <ToolOptions />
                   <Breadcrumb />
   ```

   with:

   ```tsx
                   <Canvas />
                   <ActionsBar />
                   <CanvasControls />
                   {!toolsDocked && <ToolBar />}
                   <ToolOptions />
                   <Breadcrumb />
   ```

In `src/editor/testHook.ts` l.49, change `.canvas-controls, .canvas-actions { display: none !important; }` to `.canvas-controls, .actions-bar, .tool-bar { display: none !important; }`.

- [ ] **Step 4.9: Move the fixture loader into the project menu (DEV only)**

In `src/ui/ProjectMenu.tsx`:
1. Add `ChevronRight` to the `lucide-react` import.
2. Add `import { fixtures } from '@/fixtures'` after the `@/export/download` import.
3. After `const ICON = …`, add:

   ```tsx
   /** Dev-only manual-inspection aid (V1 SPEC §12 fixtures), until Task 10's New project dialog ships them; never bundled into production. */
   const SAMPLES: ReadonlyArray<[keyof typeof fixtures, string]> = [
     ['stripes', 'Stripes'],
     ['checker', 'Checker'],
     ['basketWeave', 'Basket weave'],
     ['chevronDiamond', 'Chevron diamond'],
     ['isometric', 'Isometric'],
     ['interlace', 'Interlace'],
   ]
   ```

4. Directly before `</DropdownMenu.Content>`, add:

   ```tsx
               {import.meta.env.DEV && (
                 <>
                   <DropdownMenu.Separator className="menu-separator" />
                   <DropdownMenu.Sub>
                     <DropdownMenu.SubTrigger className="menu-item">
                       <span className="menu-item-label">Load sample (dev)</span>
                       <ChevronRight {...ICON} />
                     </DropdownMenu.SubTrigger>
                     <DropdownMenu.Portal>
                       <DropdownMenu.SubContent className="menu" sideOffset={4}>
                         {SAMPLES.map(([key, label]) => (
                           <DropdownMenu.Item key={key} className="menu-item" onSelect={() => useEditor.getState().replaceProject(structuredClone(fixtures[key]))}>
                             <span className="menu-item-label">{label}</span>
                           </DropdownMenu.Item>
                         ))}
                       </DropdownMenu.SubContent>
                     </DropdownMenu.Portal>
                   </DropdownMenu.Sub>
                 </>
               )}
   ```

- [ ] **Step 4.10: CSS for the actions bar and the dock**

In `src/index.css`:
- In the Task 3 section, change the selector list `.canvas-controls,\n.canvas-actions {` to `.canvas-controls {`.
- Delete the `.canvas-actions { top: 8px; right: 8px; gap: 4px; }` rule.
- In the coarse-pointer block, delete `.canvas-actions .text-button` from the selector list.

Then append:

```css
/* ---- Actions bar and tool dock (shell spec §7.1, §7.2, §9.4; Task 4) ---- */

.actions-bar {
  position: absolute;
  top: 12px;
  left: 50%;
  z-index: 2;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;
  gap: 2px;
  max-width: calc(100% - 24px);
  padding: 4px;
  transform: translateX(-50%);
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 12px;
  box-shadow: var(--shadow);
  font-size: 12px;
}

.actions-group {
  display: flex;
  align-items: center;
  gap: 2px;
}

.actions-count {
  padding: 0 8px;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.tool-bar {
  position: absolute;
  bottom: 14px;
  left: 50%;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 2px;
  max-width: calc(100% - 24px);
  padding: 4px;
  transform: translateX(-50%);
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 12px;
  box-shadow: var(--shadow);
}

.tool-bar .icon-button {
  width: 40px;
  height: 40px;
}

.canvas-controls-vertical {
  top: 14px;
  bottom: auto;
  flex-direction: column;
}

.canvas-controls-vertical .bar-divider {
  width: 24px;
  height: 1px;
  margin: 4px 0;
}

.icon-column-fill {
  flex: 1;
}

.icon-column .undock-button {
  width: 28px;
  height: 28px;
}
```

(On coarse pointers, Task 3's `.icon-button { min-width: 44px; min-height: 44px }` already enlarges the actions bar, tool bar and Undock buttons.)

Run: `pnpm typecheck && pnpm exec playwright test e2e/actions-bar.spec.ts e2e/dock.spec.ts`
Expected: PASS in all four projects. The Paste tooltip test is skipped in chromium-touch.

- [ ] **Step 4.11: Fix the existing specs broken by the moved actions**

Found with `grep -rn "'Repeat'\|Create Motif\|Mirror\|Rotate 90\|To back\|To front\|Forward\|Backward\|Edit Motif\|canvas-actions\|'Selection')" e2e`:

1. **`e2e/motifs.spec.ts`**
   - l.83 becomes:

     ```ts
         await page.getByRole('toolbar', { name: 'Selection actions' }).getByRole('button', { name: 'Repeat', exact: true }).click()
     ```

   - l.141 (Task 3's version) becomes:

     ```ts
         await page.getByRole('toolbar', { name: 'Selection actions' }).getByRole('button', { name: 'Repeat', exact: true }).click() // Make motif, then Repeat
     ```

   - l.148 becomes the line below. `exact` is needed because the bar's "Edit motif" now also matches case-insensitively.

     ```ts
         await page.getByRole('button', { name: 'Edit Motif', exact: true }).click()
     ```

2. **`e2e/author/actions.ts`**
   - After `panel(name)`, add:

     ```ts
       private actionsBar(): Locator {
         return this.page.getByRole('toolbar', { name: 'Selection actions' })
       }

       /** One actions-bar button (shell §9.4). */
       private async action(name: string): Promise<void> {
         await this.actionsBar().getByRole('button', { name, exact: true }).click()
         await this.tick()
       }
     ```

   - Replace `mirror`, `rotate90` and `repeat` (l.208–228, keep `rotateBy` and `createMotif` between them) with:

     ```ts
       async mirror(axis: 'X' | 'Y'): Promise<void> {
         await this.action(`Mirror ${axis}`)
       }

       async rotate90(direction: 'CW' | 'CCW'): Promise<void> {
         await this.action(`Rotate 90° ${direction}`)
       }
     ```

     ```ts
       /** Actions-bar Repeat: Make motif then a 2×2 field, or 2×2 of one selected instance (SPEC §7.4). */
       async repeat(): Promise<void> {
         await this.action('Repeat')
       }

       /** The actions bar's Order menu: opening it and choosing the item are two actions (shell §16: G6 counts rise). */
       async order(item: 'Bring forward' | 'Send backward' | 'Bring to front' | 'Send to back'): Promise<void> {
         await this.action('Order')
         await this.page.getByRole('menuitem', { name: item, exact: true }).click()
         await this.tick()
       }
     ```

3. **`e2e/author/interlace.spec.ts` l.71.** `await a.button('To back', 'Selection')` becomes `await a.order('Send to back')`.

4. **`e2e/a11y.spec.ts`**
   - In test 1, `offenders.push(...(await unlabeledButtons(page, '.canvas-actions button')))` becomes `offenders.push(...(await unlabeledButtons(page, '.actions-bar button')))`.
   - In test 2 ('every Inspector panel button …'), after `const offenders = await unlabeledButtons(page, '.inspector button')`, add `offenders.push(...(await unlabeledButtons(page, '.actions-bar button'))) // the full bar: h1 is selected`.

5. **`e2e/tablet.spec.ts`.** The locator from Task 3 becomes:

   ```ts
       const buttons = page.locator('.icon-column button, .canvas-controls button, .actions-bar button, .top-bar .icon-button')
   ```

6. **Unchanged:**
   - `e2e/inspector.spec.ts:98` (`getByRole('button', { name: 'Mirror X' })`) now resolves to the actions bar's button. The Inspector's Mirror X is a checkbox.
   - `materials.spec.ts:97`'s exact `Delete` still has no rival there, because nothing is selected and the bar shows Paste only.

Run:

```bash
pnpm exec playwright test e2e/motifs.spec.ts e2e/inspector.spec.ts e2e/a11y.spec.ts e2e/tablet.spec.ts e2e/materials.spec.ts e2e/author e2e/export-parity.spec.ts e2e/crossing-proof.spec.ts e2e/shell.spec.ts
```

Expected: PASS.

Then run `pnpm test:e2e`. The actions bar sits 12–56 px below the canvas top, centred, whenever the Select tool is active. A spec whose canvas press or marquee starts under it fails. For each one, move that spec's `setCamera(… cameraShowing(p, local, zoom))` so the target's `local.y` is at least 70. Do not hide the bar.

- [ ] **Step 4.12: Verify and commit**

Run: `pnpm typecheck && pnpm test && pnpm exec playwright test e2e/actions-bar.spec.ts e2e/dock.spec.ts e2e/shell.spec.ts e2e/motifs.spec.ts e2e/inspector.spec.ts e2e/a11y.spec.ts e2e/tablet.spec.ts e2e/author`
Expected: all green.

```bash
git add src/editor/store.ts src/editor/keyboard.ts src/editor/keyboard.test.ts src/editor/shortcuts.ts src/editor/shortcuts.test.ts src/editor/testHook.ts \
  src/ui/ActionsBar.tsx src/ui/ToolBar.tsx src/ui/Toolbar.tsx src/ui/IconColumn.tsx src/ui/CanvasControls.tsx src/ui/App.tsx src/ui/ProjectMenu.tsx \
  src/ui/Inspector/SelectionPanel.tsx src/ui/Inspector/InstancePanel.tsx src/index.css \
  e2e/actions-bar.spec.ts e2e/dock.spec.ts e2e/motifs.spec.ts e2e/author/actions.ts e2e/author/interlace.spec.ts e2e/a11y.spec.ts e2e/tablet.spec.ts
git status   # also stage any spec touched by Step 4.11's camera moves
FSH_NO_TTY=1 git commit -m "Add the actions bar and undockable tools" -m "Moves the selection commands out of the inspector and the transitional canvas strip into the shell's floating actions bar (with the Order menu and Paste's disabled reason, which needs the clipboard in the store), adds Mod+R and Shift+T, and lets the tools undock to a floating bottom bar that persists, per shell spec §7.1, §9.4 and §12.2."
```

---

> **Drafting notes for Tasks 5–7 (read before executing).**
>
> - **No CONTRACT ISSUE.** Every contract name is used as declared: `occurrencePaths`, `contextLevelsForPath`, `setEditContext`, `DrawingBar`, `CrossingsPanel`, `LeftTab`, `useLayout`, `UiActions.openLeft/toggleLeft`, `Hint`, `Keycap`, `WoodChip`, `ToolButtons`, `MotifIcon`, `RepeatIcon`.
> - **Code from Tasks 3–4 that this draft could not see.** These tasks edit files that Tasks 3–4 create: `IconColumn.tsx`, `LeftPane.tsx`, `ToolButtons.tsx`, `Inspector.tsx` after Task 3, and `e2e/materials.spec.ts` after Task 3. Each such step shows the complete new code for the part it changes. It also says which Task 3 element that code replaces. Keep Task 3's own class names on anything not shown here.
> - **Spec ambiguities, and how they were resolved:**
>   - **"No objects" (§9.5)** means the root has no children (`rootChildren.length === 0`). Unplaced motif definitions leave the Board blank, so the hint still shows.
>   - **Grid clipping (§9.2).** The grid pattern fills a rect the size of the Board (`x=0 y=0 width=bw height=bh`) instead of the viewBox plus a `clipPath`. The pixels are the same, it needs no extra element, and the e2e test asserts that rect's size.
>   - **Rectangle preview** uses the Polygon preview style: fill at 45% and a 1 px `--acc` outline.
>   - **"Swapped" (§9.6)** means `source === 'override'`. That is V1's badged marker class, so the legend, the markers and the panel agree.
>   - **"N unresolved"** counts distinct unresolved records. That is the same number the Needs attention list shows.
>   - **Usage line (§6.2).** "Used 1 time" is singular when N = 1.
>   - **Thumbnail id.** Motifs thumbnails use the synthetic instance id `motif-thumbnail` in a throwaway copy of the project. The copy is never validated or stored.
> - **Layering choice.** `CrossingHover` stays in `src/ui` (file map), but `render/Canvas.tsx` renders it. The hover index is Canvas-local state, and the editor store may not gain fields (§11). This is the one `render → ui` import. Neither AGENTS.md nor the Global Constraints forbid that direction.
> - **Performance choice.** `MotifsPane` and `LayersPane` subscribe to the committed `project`. Only the small `MotifUsage` and `OccurrenceNote` components read `useScene()`. So a drag frame re-renders only those, never the thumbnails. No memoisation is added.

---

### Task 5: Occurrence helpers and Layers / Motifs panes

Implements §6.1, §6.2 and §6.4, and the Review Focus 5 pin for the panes.

**Files:**
- Modify `src/geometry/scene.ts`: add `occurrencePaths` after `placementsOf` (~lines 167–181).
- Modify `src/geometry/scene.test.ts`: append a describe block.
- Modify `src/editor/selection.ts`: add `contextLevelsForPath` after `contextPrefix` (~line 260).
- Create `src/editor/selection.test.ts`.
- Modify `src/editor/store.ts`:
  - the `EditorState` interface (~lines 91–92);
  - the actions, after `popContext` (~lines 227–229).
- Modify `src/editor/store.test.ts`: append a describe block.
- Modify `src/editor/layout.ts`: the `leftTab` default. Also update `src/editor/layout.test.ts` where it asserts the default.
- Modify `src/ui/Inspector/InstancePanel.tsx`: export `firstStep` (~line 25).
- Create `src/ui/LayersPane.tsx` and `src/ui/MotifsPane.tsx`.
- Modify `src/ui/IconColumn.tsx` (the pane tabs) and `src/ui/LeftPane.tsx` (the tab switch).
- Modify `src/index.css`: append a "Layers and Motifs panes" section.
- Create `e2e/layers.spec.ts`.
- Modify `e2e/helpers.ts`: add `openPane`.
- Modify `e2e/materials.spec.ts`, `e2e/author/actions.ts` and `e2e/a11y.spec.ts`: open the Wood pane, which is no longer the default tab.

**Interfaces:**
- **Consumes:**
  - `useLayout` / `LeftTab` / `UiActions` (Tasks 1 and 3): `leftTab`, `leftOpen`, `uiActions.openLeft(tab)`, `uiActions.toggleLeft()`.
  - `Hint` (Task 2): `label`, `disabledReason`, `side`.
  - `MotifIcon` / `RepeatIcon` (Task 3): `{ size?: number }`.
  - `WoodPane` (Task 3).
- **Produces:**
  - `export function occurrencePaths(p: Project, scene: Scene, motifId: Id): Step[][]` in `src/geometry/scene.ts`
  - `export function contextLevelsForPath(p: Project, path: Step[]): EditContextLevel[]` in `src/editor/selection.ts`
  - `setEditContext(levels: EditContextLevel[]): void` on `EditorState`
  - `export function firstStep(obj: MotifInstance | RepeatField): Step` in `src/ui/Inspector/InstancePanel.tsx`
  - `export function LayersPane(): JSX.Element` and `export function MotifsPane(): JSX.Element`
  - `export async function openPane(page: Page, name: 'Layers' | 'Motifs' | 'Wood'): Promise<void>` in `e2e/helpers.ts`

- [ ] **Step 1: Write the failing `occurrencePaths` tests.**

  In `src/geometry/scene.test.ts`, change the import on line 6 to:

  ```ts
  import { buildScene, occurrencePaths, pathD } from './scene.ts'
  ```

  Append:

  ```ts
  describe('occurrencePaths', () => {
    const cell = { id: 'M', children: [band('A', [[0, 0], [10, 0]])] }

    it('counts every repeat cell and every nested placement, in paint order', () => {
      const p = project(
        [repeat('rep', 'M', { rows: 2, columns: 3 }), instance('iO', 'O', { x: 400 })],
        [cell, { id: 'O', children: [instance('iM', 'M'), repeat('rin', 'M', { rows: 1, columns: 2 })] }],
      )
      const cells = [0, 1].flatMap((row) => [0, 1, 2].map((column) => [{ repeatId: 'rep', row, column }]))
      expect(occurrencePaths(p, buildScene(p, E), 'M')).toEqual([
        ...cells,
        [{ instanceId: 'iO' }, { instanceId: 'iM' }],
        [{ instanceId: 'iO' }, { repeatId: 'rin', row: 0, column: 0 }],
        [{ instanceId: 'iO' }, { repeatId: 'rin', row: 0, column: 1 }],
      ])
      expect(occurrencePaths(p, buildScene(p, E), 'O')).toEqual([[{ instanceId: 'iO' }]])
    })

    it('is empty for a motif that is not placed', () => {
      const p = project([band('root', [[0, 0], [10, 0]])], [cell])
      expect(occurrencePaths(p, buildScene(p, E), 'M')).toEqual([])
    })

    it('finds a motif placed only inside another motif', () => {
      const p = project([instance('iO', 'O')], [cell, { id: 'O', children: [band('B', [[0, 20], [10, 20]]), instance('iM', 'M')] }])
      expect(occurrencePaths(p, buildScene(p, E), 'M')).toEqual([[{ instanceId: 'iO' }, { instanceId: 'iM' }]])
    })
  })
  ```

  The builders import on line 3 already has `band, instance, project, record, ref, repeat`, so it needs no change.

- [ ] **Step 2: Run the tests and watch them fail.**

  `pnpm exec vitest run src/geometry/scene.test.ts`

  Expected: the three `occurrencePaths` tests fail with `TypeError: occurrencePaths is not a function`, or with a missing-export error. The existing tests pass.

- [ ] **Step 3: Implement `occurrencePaths`.**

  In `src/geometry/scene.ts`, change the model import (line 112) to:

  ```ts
  import type { ContextId, Crossing, Id, Project, Step } from '@/domain/model'
  ```

  After the closing brace of `placementsOf` (line 181), insert:

  ```ts
  /**
   * SPEC §6.4 (shell): one world path per occurrence of `motifId`'s definition in
   * `scene` (every repeat cell counts), in paint order. Built from the scene's
   * Band and Region occurrences, so a placement whose definition paints nothing
   * has no path.
   */
  export function occurrencePaths(p: Project, scene: Scene, motifId: Id): Step[][] {
    const occurrences = scene.elements.flatMap((el) => (el.kind === 'patch' ? [] : [el.occurrence]))
    return placementsOf(p, occurrences, motifId)
  }
  ```

  `unresolvedMarkers` keeps calling `placementsOf` directly: at that point it holds the occurrence list and has not built a `Scene`.

- [ ] **Step 4: Run the tests again and watch them pass.**

  `pnpm exec vitest run src/geometry/scene.test.ts`

  Expected: every test passes.

- [ ] **Step 5: Write the failing `contextLevelsForPath` tests.**

  Create `src/editor/selection.test.ts`:

  ```ts
  // SPEC §6.4 (shell): splitting a world path into per-level edit-context levels.

  import { describe, expect, it } from 'vitest'
  import type { Step } from '@/domain/model'
  import { band, instance, project, repeat } from '@/domain/test-builders'
  import { contextLevelsForPath, contextPrefix, pruneEditContext } from './selection.ts'

  const p = project(
    [instance('iO', 'O'), repeat('rp', 'M')],
    [
      { id: 'M', children: [band('A', [[0, 0], [10, 0]])] },
      { id: 'O', children: [instance('iM', 'M'), repeat('rin', 'M', { rows: 2, columns: 2 })] },
    ],
  )

  describe('contextLevelsForPath', () => {
    it('is empty for the root path', () => {
      expect(contextLevelsForPath(p, [])).toEqual([])
    })

    it('a root-level instance or repeat cell is one level entering its motif', () => {
      expect(contextLevelsForPath(p, [{ instanceId: 'iO' }])).toEqual([{ motifId: 'O', path: [{ instanceId: 'iO' }] }])
      expect(contextLevelsForPath(p, [{ repeatId: 'rp', row: 2, column: 1 }])).toEqual([{ motifId: 'M', path: [{ repeatId: 'rp', row: 2, column: 1 }] }])
    })

    it('a nested instance is one level per step, each relative to the previous context', () => {
      expect(contextLevelsForPath(p, [{ instanceId: 'iO' }, { instanceId: 'iM' }])).toEqual([
        { motifId: 'O', path: [{ instanceId: 'iO' }] },
        { motifId: 'M', path: [{ instanceId: 'iM' }] },
      ])
    })

    it('a repeat cell inside an instance keeps its row and column', () => {
      expect(contextLevelsForPath(p, [{ instanceId: 'iO' }, { repeatId: 'rin', row: 1, column: 0 }])).toEqual([
        { motifId: 'O', path: [{ instanceId: 'iO' }] },
        { motifId: 'M', path: [{ repeatId: 'rin', row: 1, column: 0 }] },
      ])
    })

    it('round-trips through contextPrefix, and every level resolves', () => {
      const path: Step[] = [{ instanceId: 'iO' }, { repeatId: 'rin', row: 1, column: 1 }]
      const levels = contextLevelsForPath(p, path)
      expect(contextPrefix(levels)).toEqual(path)
      expect(pruneEditContext(p, levels)).toBe(levels)
    })
  })
  ```

- [ ] **Step 6: Run the tests and watch them fail.**

  `pnpm exec vitest run src/editor/selection.test.ts`

  Expected: FAIL with `contextLevelsForPath is not a function`, or with a missing-export error.

- [ ] **Step 7: Implement `contextLevelsForPath`.**

  In `src/editor/selection.ts`, change the model import (line 248 of the file as read, its line 6) to:

  ```ts
  import type { ContextId, Id, MotifInstance, Project, RepeatField, Step } from '@/domain/model'
  ```

  After `contextPrefix` (ending at its line 18), insert:

  ```ts
  /**
   * SPEC §6.4 (shell): splits a world path into `editContext` levels, one per
   * step, each entering the motif its instance or repeat places and each
   * relative to the level before it. `contextPrefix` of the result is `path`.
   */
  export function contextLevelsForPath(p: Project, path: Step[]): EditContextLevel[] {
    return path.map((step) => {
      const placed = p.objects[stepObjectId(step)] as MotifInstance | RepeatField
      return { motifId: placed.motifId, path: [step] }
    })
  }
  ```

  The cast is safe because every path comes from `occurrencePaths`, whose steps name instances and repeats by construction.

- [ ] **Step 8: Run the tests again and watch them pass.**

  `pnpm exec vitest run src/editor/selection.test.ts`

  Expected: PASS (5 tests).

- [ ] **Step 9: Write the failing `setEditContext` test.**

  Append to `src/editor/store.test.ts`:

  ```ts
  describe('setEditContext (shell SPEC §6.4)', () => {
    it('settles the preview, clears selection and drawing, and replaces the whole edit context in one update', () => {
      const p0 = project([instance('i1', 'm1'), band('b1', [[0, 40], [10, 40]])], [{ id: 'm1', children: [band('c1', [[0, 0], [10, 0]])] }])
      resetStore(p0)
      useEditor.getState().enterContext({ motifId: 'm1', path: [{ instanceId: 'i1' }] })
      useEditor.getState().setPreview({ ...p0, name: 'field edit' }, 'commit')
      useEditor.setState({ selection: ['c1'], drawing: { tool: 'band', points: [{ x: 0, y: 0 }], cursor: null } })

      const levels = [{ motifId: 'm1', path: [{ instanceId: 'i1' }] }]
      useEditor.getState().setEditContext(levels)

      const s = useEditor.getState()
      expect(s.preview).toBeNull()
      expect(s.project.name).toBe('field edit') // a commit preview is committed, not dropped
      expect(useEditor.temporal.getState().pastStates.length).toBe(1)
      expect(s.selection).toEqual([])
      expect(s.drawing).toBeNull()
      expect(s.editContext).toBe(levels) // replaced, not appended
    })
  })
  ```

- [ ] **Step 10: Run the test and watch it fail.**

  `pnpm exec vitest run src/editor/store.test.ts`

  Expected: the new test fails with `TypeError: useEditor.getState(...).setEditContext is not a function`. The other tests pass.

- [ ] **Step 11: Implement `setEditContext`.**

  In `src/editor/store.ts`, in `interface EditorState`, after `popContext(): void` add:

  ```ts
    /** SPEC §6.4 (shell): enters a whole stack at once, from a list (Motifs → Edit motif, Crossings → Show). */
    setEditContext(levels: EditContextLevel[]): void
  ```

  In the actions, after the `popContext() { … },` block add:

  ```ts
      setEditContext(levels) {
        get().settlePreview()
        set({ editContext: levels, selection: [], drawing: null })
      },
  ```

- [ ] **Step 12: Run the unit suite and commit.**

  Run `pnpm typecheck && pnpm test`. Expected: all green.

  ```
  git add src/geometry/scene.ts src/geometry/scene.test.ts src/editor/selection.ts src/editor/selection.test.ts src/editor/store.ts src/editor/store.test.ts
  FSH_NO_TTY=1 git commit -m "Add occurrence paths and whole-stack context entry" -m "The Layers, Motifs and Crossings panes enter a definition from a list, not from a tap on the canvas: they need every occurrence of a motif, a way to turn one world path into edit-context levels, and a single store update that replaces the stack (shell spec 6.4)."
  ```

- [ ] **Step 13: Write the failing `e2e/layers.spec.ts`.**

  First add the pane helper to `e2e/helpers.ts`, after `select`:

  ```ts
  /** Shows the left pane on `name`'s tab (shell SPEC §4.1): clicking the already-active tab would collapse the pane, so only an inactive tab is clicked. */
  export async function openPane(page: Page, name: 'Layers' | 'Motifs' | 'Wood'): Promise<void> {
    const tab = page.getByRole('button', { name, exact: true })
    if ((await tab.getAttribute('aria-pressed')) !== 'true') await tab.click()
    await expect(tab).toHaveAttribute('aria-pressed', 'true')
  }
  ```

  Then create `e2e/layers.spec.ts`:

  ```ts
  // Shell SPEC §6.1, §6.2, §6.4 and Review Focus 5: the Layers list's two-way
  // selection sync and double-click entry, the edit-context title row, Motifs →
  // Edit motif for a motif placed only inside another, long names, and the
  // performance fixture.

  import type { Page } from '@playwright/test'
  import { expect, test } from '@playwright/test'
  import type { Project } from '../src/domain/model.ts'
  import { band, instance, project } from '../src/domain/test-builders.ts'
  import { cameraShowing, openPane, seed, seededProject, select, setCamera, toClient } from './helpers.ts'

  async function state<T>(page: Page, read: (s: ReturnType<NonNullable<Window['__cbpd']>['getState']>) => T): Promise<T> {
    return page.evaluate(`(${read.toString()})(window.__cbpd.getState())`) as Promise<T>
  }

  /** `outer` placed at the root holds an instance of `inner`; `unused` is never placed. */
  function nested(): Project {
    return project(
      [instance('iO', 'outer', { x: 100, y: 100 })],
      [
        { id: 'outer', children: [band('ob', [[0, 0], [40, 0]]), instance('iI', 'inner', { x: 0, y: 30 })] },
        { id: 'inner', children: [band('ib', [[0, 0], [20, 0]], { materialId: 'walnut' })] },
        { id: 'unused', children: [band('ub', [[0, 0], [20, 0]])] },
      ],
    )
  }

  const LONG = 'A motif with a deliberately long name that keeps going well past the pane width'

  test.describe('layers and motifs panes', () => {
    test.skip(({ isMobile }) => isMobile, 'mouse tests run in the desktop projects')

    test('rows list the root topmost first, and selection syncs both ways', async ({ page }) => {
      await seed(page)
      await setCamera(page, cameraShowing({ x: 0, y: 0 }, { x: 60, y: 120 }, 2))
      const list = page.getByRole('listbox')
      await expect(list.getByRole('option')).toHaveText([/m2.*2 × 2/, /m1.*Instance/, /Region.*Maple/, /Band.*Maple/])

      await list.getByRole('option', { name: 'Band, Maple' }).click()
      expect(await state(page, (s) => s.selection)).toEqual(['b1'])
      await list.getByRole('option', { name: 'Region, Maple' }).click({ modifiers: ['Shift'] })
      expect(await state(page, (s) => s.selection)).toEqual(['b1', 'r1'])
      await expect(list.getByRole('option', { name: 'Band, Maple' })).toHaveAttribute('aria-selected', 'true')
      await list.getByRole('option', { name: 'Band, Maple' }).click({ modifiers: ['Shift'] })
      expect(await state(page, (s) => s.selection)).toEqual(['r1'])

      await select(page, ['i1'])
      await expect(list.getByRole('option', { name: 'm1, Instance' })).toHaveAttribute('aria-selected', 'true')
      await expect(list.getByRole('option', { name: 'Region, Maple' })).toHaveAttribute('aria-selected', 'false')

      const c = await toClient(page, { x: 80, y: 40 }) // on b1
      await page.mouse.click(Math.round(c.x), Math.round(c.y))
      await expect(list.getByRole('option', { name: 'Band, Maple' })).toHaveAttribute('aria-selected', 'true')
      await expect(list.getByRole('option', { name: 'm1, Instance' })).toHaveAttribute('aria-selected', 'false')
    })

    test('double-clicking a repeat row enters its definition; the back button pops out', async ({ page }) => {
      await seed(page)
      await page.getByRole('option', { name: 'm2, 2 × 2' }).dblclick()
      expect(await state(page, (s) => s.editContext)).toEqual([{ motifId: 'm2', path: [{ repeatId: 'rp1', row: 0, column: 0 }] }])
      expect(await state(page, (s) => s.selection)).toEqual([])
      await expect(page.getByRole('navigation', { name: 'Edit context' })).toBeVisible()
      await expect(page.getByText('Changes apply to all 4 occurrences')).toBeVisible()
      await expect(page.getByRole('listbox').getByRole('option')).toHaveText([/Region.*Maple/]) // the definition's own children

      await page.getByRole('button', { name: 'Back to Test' }).click()
      expect(await state(page, (s) => s.editContext)).toEqual([])
      await expect(page.getByRole('navigation', { name: 'Edit context' })).toHaveCount(0)
    })

    test('Motifs → Edit motif enters a motif placed only inside another motif', async ({ page }) => {
      await seed(page, nested())
      await openPane(page, 'Motifs')
      await expect(page.getByRole('listitem', { name: 'inner' })).toContainText('Used 1 time')
      const unused = page.getByRole('listitem', { name: 'unused' })
      await expect(unused).toContainText('Not placed')
      await expect(unused.getByRole('button', { name: 'Edit motif' })).toBeDisabled()

      await page.getByRole('listitem', { name: 'inner' }).getByRole('button', { name: 'Edit motif' }).click()
      expect(await state(page, (s) => s.editContext)).toEqual([
        { motifId: 'outer', path: [{ instanceId: 'iO' }] },
        { motifId: 'inner', path: [{ instanceId: 'iI' }] },
      ])
      await expect(page.getByRole('navigation', { name: 'Edit context' })).toBeVisible()
      await openPane(page, 'Layers')
      await expect(page.getByRole('button', { name: 'Back to outer' })).toBeVisible()
      await expect(page.getByRole('listbox').getByRole('option')).toHaveText([/Band.*Walnut/])
    })

    test('Rename in the Motifs pane renames the definition in one history entry', async ({ page }) => {
      await seed(page, nested())
      await openPane(page, 'Motifs')
      await page.getByRole('listitem', { name: 'inner' }).getByRole('button', { name: 'Rename motif' }).click()
      const field = page.getByRole('textbox', { name: 'Motif name' })
      await field.fill('Knot')
      await field.press('Enter')
      expect(await page.evaluate(() => window.__cbpd!.getProject().motifs['inner']!.name)).toBe('Knot')
      expect(await page.evaluate(() => window.__cbpd!.getHistoryLengths().past)).toBe(1)
    })

    test('Review Focus 5: an 80-character motif name truncates with its full text as a title, with no horizontal overflow', async ({ page }) => {
      const p = seededProject()
      p.motifs['m1']!.name = LONG
      await seed(page, p)
      const name = page.locator('.layer-row .layer-name', { hasText: LONG })
      await expect(name).toHaveAttribute('title', LONG)
      expect(await name.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true)
      expect(await page.locator('.layers-pane').evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)

      await openPane(page, 'Motifs')
      const motifName = page.locator('.motif-name', { hasText: LONG })
      await expect(motifName).toHaveAttribute('title', LONG)
      expect(await motifName.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true)
      expect(await page.locator('.motifs-pane').evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    })

    test('with the performance fixture loaded, Layers renders and a row click selects the field', async ({ page }) => {
      await seed(page)
      await page.evaluate(() => window.__cbpd!.replaceProject(window.__cbpd!.performanceFixture()))
      const row = page.getByRole('option', { name: 'Lattice unit, 15 × 15' })
      await row.click()
      await expect(row).toHaveAttribute('aria-selected', 'true')
      expect(await state(page, (s) => s.selection)).toEqual(['interlace-field'])
      await openPane(page, 'Motifs')
      await expect(page.getByRole('listitem', { name: 'Lattice unit' })).toContainText('Used 225 times')
    })
  })
  ```

  The G9 budgets in `e2e/performance.spec.ts` are reported, not asserted, and run only under `pnpm perf`. So this test asserts only that selection sync works with the fixture loaded. Task 10's `pnpm perf` re-run covers the Layers numbers.

- [ ] **Step 14: Run the spec and watch it fail.**

  `pnpm exec playwright test e2e/layers.spec.ts --project=chromium`

  Expected: every test fails. `getByRole('listbox')` and the `Motifs` tab are not found, because the panes don't exist yet.

- [ ] **Step 15: Export `firstStep` from InstancePanel.**

  In `src/ui/Inspector/InstancePanel.tsx`, change:

  ```ts
  function firstStep(obj: Placed): Step {
  ```

  to:

  ```ts
  /** The step entering `obj`'s definition: the instance, or a repeat's cell (0, 0) (SPEC §7.6 Edit Motif). */
  export function firstStep(obj: MotifInstance | RepeatField): Step {
  ```

  If Task 4 already exported it, for the ActionsBar's Edit motif, leave it as it is.

- [ ] **Step 16: Create `src/ui/LayersPane.tsx`.**

  ```tsx
  // Shell SPEC §6.1: the current context's children as a listbox, topmost
  // first. Click selects; Shift, Mod or Add to selection toggles (V1 §7.4,
  // the canvas's `toggleSelection`); double-clicking an Instance or Repeat
  // enters it with the same single step as the Inspector's Edit Motif. At the
  // root, a Board header labels the list; inside a definition, a back button,
  // the motif name and the occurrence note do.

  import { ArrowLeft } from 'lucide-react'
  import type { JSX, MouseEvent } from 'react'
  import { useEffect, useRef } from 'react'
  import type { DesignObject, Id, Project } from '@/domain/model'
  import { childrenOf } from '@/domain/project'
  import { occurrencePaths } from '@/geometry/scene'
  import { useScene } from '@/editor/scene'
  import { currentContext, useEditor } from '@/editor/store'
  import { toggleSelection } from '@/editor/tools/select'
  import { Hint } from './Hint.tsx'
  import { MotifIcon, RepeatIcon } from './icons.tsx'
  import { firstStep } from './Inspector/InstancePanel.tsx'

  type Row = { name: string; detail: string; mark: JSX.Element }

  function rowOf(p: Project, obj: DesignObject): Row {
    if (obj.type === 'band' || obj.type === 'region') {
      const material = p.materials.find((m) => m.id === obj.materialId)! // V1 §2.1 invariant 2
      return { name: obj.type === 'band' ? 'Band' : 'Region', detail: material.name, mark: <span className="layer-swatch" style={{ background: material.color }} /> }
    }
    const name = p.motifs[obj.motifId]!.name
    return obj.type === 'motif-instance' ? { name, detail: 'Instance', mark: <MotifIcon size={16} /> } : { name, detail: `${obj.rows} × ${obj.columns}`, mark: <RepeatIcon size={16} /> }
  }

  /** "Changes apply to all N occurrences", from the shown scene; its own component so a drag frame re-renders only this line. */
  function OccurrenceNote({ motifId }: { motifId: Id }): JSX.Element | null {
    const shown = useEditor((s) => s.preview?.next ?? s.project)
    const n = occurrencePaths(shown, useScene(), motifId).length
    return n > 1 ? <p className="pane-note">Changes apply to all {n} occurrences</p> : null
  }

  export function LayersPane(): JSX.Element {
    const project = useEditor((s) => s.project)
    const selection = useEditor((s) => s.selection)
    const editContext = useEditor((s) => s.editContext)
    const ctx = useEditor(currentContext)
    const listRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
      listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
    }, [selection])

    const choose = (e: MouseEvent, id: Id): void => {
      const s = useEditor.getState()
      s.select(toggleSelection(s.selection, id, e.shiftKey || e.metaKey || e.ctrlKey || s.addToSelection))
    }
    const enter = (obj: DesignObject): void => {
      if (obj.type !== 'motif-instance' && obj.type !== 'repeat') return
      const s = useEditor.getState()
      s.enterContext({ motifId: obj.motifId, path: [firstStep(obj)] })
      s.select([])
    }
    const back = (): void => {
      const s = useEditor.getState()
      s.select([])
      s.popContext()
    }

    const parent = editContext.length >= 2 ? project.motifs[editContext[editContext.length - 2]!.motifId]!.name : project.name
    const background = project.materials.find((m) => m.id === project.board.backgroundMaterialId)?.name ?? 'None'

    return (
      <div className="layers-pane">
        {ctx === null ? (
          <>
            <div className="pane-title">
              <h2>Layers</h2>
            </div>
            <div className="layers-board" id="layers-board">
              <span>Board</span>
              <span className="layer-detail" title={background}>
                {background}
              </span>
            </div>
          </>
        ) : (
          <>
            <div className="pane-title">
              <Hint label={`Back to ${parent}`} side="bottom">
                <button type="button" className="icon-button" aria-label={`Back to ${parent}`} onClick={back}>
                  <ArrowLeft size={18} strokeWidth={1.6} />
                </button>
              </Hint>
              <h2 id="layers-title" className="layer-name" title={project.motifs[ctx]!.name}>
                {project.motifs[ctx]!.name}
              </h2>
            </div>
            <OccurrenceNote motifId={ctx} />
          </>
        )}
        <div ref={listRef} className="layers-list" role="listbox" aria-multiselectable="true" aria-labelledby={ctx === null ? 'layers-board' : 'layers-title'}>
          {childrenOf(project, ctx)
            .toReversed()
            .map((id) => {
              const obj = project.objects[id]!
              const row = rowOf(project, obj)
              return (
                <button
                  key={id}
                  type="button"
                  role="option"
                  className="layer-row"
                  aria-selected={selection.includes(id)}
                  aria-label={`${row.name}, ${row.detail}`}
                  onClick={(e) => choose(e, id)}
                  onDoubleClick={() => enter(obj)}
                >
                  <span className="layer-mark" aria-hidden="true">
                    {row.mark}
                  </span>
                  <span className="layer-name" title={row.name}>
                    {row.name}
                  </span>
                  <span className="layer-detail" title={row.detail}>
                    {row.detail}
                  </span>
                </button>
              )
            })}
        </div>
      </div>
    )
  }
  ```

- [ ] **Step 17: Create `src/ui/MotifsPane.tsx`.**

  ```tsx
  // Shell SPEC §6.2: one row per motif definition, in document order — a
  // thumbnail of the definition alone, the name (renamed inline, V1 §7.5
  // text-field rules), "Used N times" / "Not placed", and Edit motif, which
  // enters the first occurrence (§6.4). The pane reads the committed project;
  // only `MotifUsage` reads the live scene, so a drag frame never rebuilds the
  // thumbnails.

  import { PencilLine } from 'lucide-react'
  import type { JSX } from 'react'
  import { useState } from 'react'
  import { renameMotif } from '@/domain/commands'
  import type { Id, Project } from '@/domain/model'
  import { objectBounds } from '@/geometry/bounds'
  import { buildScene, occurrencePaths } from '@/geometry/scene'
  import { useScene } from '@/editor/scene'
  import { contextLevelsForPath } from '@/editor/selection'
  import { useEditor } from '@/editor/store'
  import { SceneSvg } from '@/render/SceneSvg'
  import { Hint } from './Hint.tsx'
  import { MotifIcon } from './icons.tsx'

  const THUMB_ID = 'motif-thumbnail'

  /** The definition's painted bounds, drawn from a throwaway copy whose root holds one identity instance of it and no root crossing records. */
  function Thumbnail({ project, motifId }: { project: Project; motifId: Id }): JSX.Element {
    const copy: Project = {
      ...project,
      objects: { ...project.objects, [THUMB_ID]: { type: 'motif-instance', id: THUMB_ID, motifId, transform: { x: 0, y: 0, rotationDeg: 0, mirrorX: false, mirrorY: false, scale: 1 } } },
      rootChildren: [THUMB_ID],
      crossings: [],
    }
    const box = objectBounds(copy, THUMB_ID) // null for a definition that paints nothing
    return (
      <svg className="motif-thumb" width={40} height={40} aria-hidden="true" viewBox={box === null ? undefined : `${box.minX} ${box.minY} ${box.maxX - box.minX} ${box.maxY - box.minY}`}>
        {box !== null && <SceneSvg scene={buildScene(copy, 0)} materials={project.materials} clipPrefix={`thumb-${motifId}`} />}
      </svg>
    )
  }

  function MotifUsage({ motifId, onRename }: { motifId: Id; onRename: () => void }): JSX.Element {
    const shown = useEditor((s) => s.preview?.next ?? s.project)
    const paths = occurrencePaths(shown, useScene(), motifId)
    const n = paths.length
    const edit = (): void => {
      const s = useEditor.getState()
      s.setEditContext(contextLevelsForPath(s.project, paths[0]!))
    }
    return (
      <>
        <span className="motif-usage">{n === 0 ? 'Not placed' : n === 1 ? 'Used 1 time' : `Used ${n} times`}</span>
        <div className="motif-actions">
          <Hint label="Edit motif" side="bottom" {...(n === 0 ? { disabledReason: 'Not placed on the board' } : {})}>
            <button type="button" className="icon-button" aria-label="Edit motif" disabled={n === 0} onClick={edit}>
              <MotifIcon size={18} />
            </button>
          </Hint>
          <Hint label="Rename" side="bottom">
            <button type="button" className="icon-button" aria-label="Rename motif" onClick={onRename}>
              <PencilLine size={18} strokeWidth={1.6} />
            </button>
          </Hint>
        </div>
      </>
    )
  }

  function MotifRow({ project, motifId }: { project: Project; motifId: Id }): JSX.Element {
    const name = project.motifs[motifId]!.name
    const [text, setText] = useState<string | null>(null) // null while not renaming
    const commit = (): void => {
      if (text !== null && text !== name) useEditor.getState().run((p) => renameMotif(p, motifId, text))
      setText(null)
    }
    return (
      <li className="motif-row" aria-label={name}>
        <Thumbnail project={project} motifId={motifId} />
        {text === null ? (
          <span className="motif-name" title={name}>
            {name}
          </span>
        ) : (
          <input
            className="motif-name"
            aria-label="Motif name"
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
              else if (e.key === 'Escape') {
                e.stopPropagation()
                setText(null)
              }
            }}
          />
        )}
        <MotifUsage motifId={motifId} onRename={() => setText(name)} />
      </li>
    )
  }

  export function MotifsPane(): JSX.Element {
    const project = useEditor((s) => s.project)
    const ids = Object.keys(project.motifs)
    return (
      <div className="motifs-pane">
        <div className="pane-title">
          <h2>Motifs</h2>
        </div>
        {ids.length === 0 && <p className="pane-note">No motifs yet. Select objects and choose Make motif.</p>}
        <ul className="motif-list">
          {ids.map((id) => (
            <MotifRow key={id} project={project} motifId={id} />
          ))}
        </ul>
      </div>
    )
  }
  ```

  The Esc on a rename reverts and calls `stopPropagation`, like `MotifNameField` (V1 §7.5). Enter commits through blur.

- [ ] **Step 18: Add the Layers and Motifs tabs, and make Layers the default tab.**

  In `src/editor/layout.ts`, in the `persist` initializer, change `leftTab: 'wood',` to `leftTab: 'layers',`.

  Then run `grep -n "'wood'" src/editor/layout.test.ts e2e/*.spec.ts` and update every assertion about the *default* tab to expect `'layers'`. For example, in `src/editor/layout.test.ts`:
  - `expect(useLayout.getState().leftTab).toBe('wood')` becomes `.toBe('layers')`;
  - a stored-defaults fixture `{ theme: 'dark', leftTab: 'wood', toolsDocked: true }` used as "the defaults" becomes `leftTab: 'layers'`.

  Leave alone any assertion that *sets* `'wood'` and reads it back.

  In `src/ui/IconColumn.tsx`, replace Task 3's single Wood tab element, the Hint-wrapped `Palette` button, with the three tabs below. Keep Task 3's tab button class on `className`.

  ```tsx
  // imports to add
  import { Layers, Palette } from 'lucide-react'
  import type { LeftTab } from '@/editor/layout'
  import { MotifIcon } from './icons.tsx'

  /** Shell SPEC §4.1/§5: the active tab toggles the pane; another tab opens the pane on it. */
  function PaneTab({ tab, label, children }: { tab: LeftTab; label: string; children: JSX.Element }): JSX.Element {
    const active = useLayout((s) => s.leftTab === tab)
    const onClick = (): void => {
      const { leftOpen, uiActions } = useLayout.getState()
      if (active && leftOpen) uiActions?.toggleLeft()
      else uiActions?.openLeft(tab)
    }
    return (
      <Hint label={label} side="right">
        <button type="button" className="icon-button pane-tab" aria-label={label} aria-pressed={active} onClick={onClick}>
          {children}
        </button>
      </Hint>
    )
  }
  ```

  In the column JSX, in place of the old Wood tab:

  ```tsx
  <PaneTab tab="layers" label="Layers">
    <Layers size={18} strokeWidth={1.6} />
  </PaneTab>
  <PaneTab tab="motifs" label="Motifs">
    <MotifIcon size={18} />
  </PaneTab>
  <PaneTab tab="wood" label="Wood">
    <Palette size={18} strokeWidth={1.6} />
  </PaneTab>
  ```

  If Task 3's Wood tab already routed through a local component with this behaviour, extend that component to take `tab` / `label` / icon instead of adding `PaneTab`. Remove the now-duplicate `Palette` import.

  In `src/ui/LeftPane.tsx`, replace the expression that renders `<WoodPane />` for the active tab with:

  ```tsx
  {leftTab === 'layers' && <LayersPane />}
  {leftTab === 'motifs' && <MotifsPane />}
  {leftTab === 'wood' && <WoodPane />}
  ```

  and add these imports:

  ```ts
  import { LayersPane } from './LayersPane.tsx'
  import { MotifsPane } from './MotifsPane.tsx'
  ```

- [ ] **Step 19: Append the pane styles to `src/index.css`.**

  ```css
  /* Shell SPEC §6.1–§6.2: Layers and Motifs panes. Names truncate with an
     ellipsis (their full text is the title attribute), never widening the pane. */
  .layers-pane,
  .motifs-pane {
    display: flex;
    flex-direction: column;
    min-width: 0;
    overflow-x: hidden;
  }

  .pane-title {
    display: flex;
    align-items: center;
    gap: 4px;
    height: 40px;
    padding: 0 8px 0 12px;
    border-bottom: 1px solid var(--line);
    min-width: 0;
  }

  .pane-title h2 {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
  }

  .pane-note {
    margin: 0;
    padding: 6px 12px;
    font-size: 12px;
    color: var(--muted);
  }

  .layers-board {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 8px 12px;
    font-size: 13px;
    font-weight: 600;
    min-width: 0;
  }

  .layers-list {
    display: flex;
    flex-direction: column;
    padding: 4px;
    min-width: 0;
  }

  .layer-row {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    height: 32px;
    padding: 0 8px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--text);
    font: inherit;
    font-size: 13px;
    text-align: left;
    cursor: default;
  }

  .layer-row:hover {
    background: var(--raised);
  }

  .layer-row[aria-selected='true'] {
    background: var(--acc-soft);
    color: var(--acc);
  }

  .layer-mark {
    display: inline-flex;
    flex: none;
    color: var(--muted);
  }

  .layer-swatch {
    display: block;
    width: 14px;
    height: 14px;
    border-radius: 4px;
    box-shadow: inset 0 0 0 1px var(--line);
  }

  .layer-name,
  .layer-detail,
  .motif-name,
  .motif-usage {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }

  .layer-name {
    flex: 1 1 auto;
  }

  .layer-detail {
    flex: 0 1 auto;
    max-width: 50%;
    font-size: 12px;
    color: var(--muted);
    font-weight: 400;
  }

  .motif-list {
    list-style: none;
    margin: 0;
    padding: 4px;
  }

  .motif-row {
    display: grid;
    grid-template-columns: 40px minmax(0, 1fr) auto;
    grid-template-areas:
      'thumb name actions'
      'thumb usage actions';
    column-gap: 10px;
    align-items: center;
    padding: 6px 8px;
    border-radius: 6px;
  }

  .motif-row:hover {
    background: var(--raised);
  }

  .motif-thumb {
    grid-area: thumb;
    border-radius: 6px;
    background: var(--paste);
  }

  .motif-name {
    grid-area: name;
    font-size: 13px;
  }

  input.motif-name {
    font: inherit;
    font-size: 13px;
    color: var(--text);
    background: var(--raised);
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 2px 6px;
  }

  .motif-usage {
    grid-area: usage;
    font-size: 12px;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }

  .motif-actions {
    grid-area: actions;
    display: flex;
    gap: 2px;
  }
  ```

  `.icon-button` comes from Task 3; these rules don't restyle it.

- [ ] **Step 20: Run the new spec and watch it pass.**

  `pnpm exec playwright test e2e/layers.spec.ts`

  Expected: 6 tests pass in chromium, firefox and webkit, and are skipped in chromium-touch.

- [ ] **Step 21: Fix fallout from the default tab changing to Layers.**

  The Wood swatches are no longer visible by default. Run:

  ```
  pnpm exec playwright test e2e/materials.spec.ts e2e/a11y.spec.ts e2e/author e2e/shell.spec.ts e2e/tooltips.spec.ts
  ```

  Expected failures, and their fixes:

  1. **`e2e/materials.spec.ts`.**
     - Add `openPane` to the import from `./helpers.ts`.
     - In the `materials palette` describe block, insert `await openPane(page, 'Wood')` on the line directly after each `await seed(…)`, in the five tests seeded at V1 lines 34, 51, 66, 80 and 91.
     - Do the same in any other test in the file that clicks a swatch, an `Edit <name>` button, or `Add material`.
  2. **`e2e/author/actions.ts`**, method `swatch`. Replace:

     ```ts
     async swatch(material: string): Promise<void> {
       await this.button(material)
     }
     ```

     with:

     ```ts
     /** A palette swatch: sets the current material with nothing selected, else assigns it (SPEC §3). Opening the Wood pane is one more action, needed once. */
     async swatch(material: string): Promise<void> {
       const wood = this.page.getByRole('button', { name: 'Wood', exact: true })
       if ((await wood.getAttribute('aria-pressed')) !== 'true') {
         await wood.click()
         await this.tick()
       }
       await this.button(material)
     }
     ```

     The G6 action counts rise by at most one per fixture. The shell spec §16 expects that.
  3. **`e2e/a11y.spec.ts`.** Before the line that collects the unlabelled buttons of the Wood pane (V1 line 58, which Task 3 re-pointed at the Wood pane), add `await openPane(page, 'Wood')`. Also add `openPane` to the helpers import.
  4. **`e2e/shell.spec.ts` and `e2e/tooltips.spec.ts`** (Task 3 and Task 2). Wherever a test assumes the Wood tab is active on a fresh page, clicks it expecting it to toggle the pane, or expects the tab restored after reload to be `wood` without having chosen it, change the expected default to `Layers`. For example, `await page.getByRole('button', { name: 'Wood', exact: true }).click() // active tab: collapses` becomes the same line with `'Layers'`.

  Rerun the command above. Expected: all pass.

- [ ] **Step 22: Run the full gate and commit.**

  Run:

  ```
  pnpm typecheck && pnpm test && pnpm exec playwright test e2e/layers.spec.ts e2e/materials.spec.ts e2e/a11y.spec.ts e2e/motifs.spec.ts e2e/shell.spec.ts
  ```

  Expected: all green.

  ```
  git add src/ui/LayersPane.tsx src/ui/MotifsPane.tsx src/ui/IconColumn.tsx src/ui/LeftPane.tsx src/ui/Inspector/InstancePanel.tsx src/editor/layout.ts src/editor/layout.test.ts src/index.css e2e/layers.spec.ts e2e/helpers.ts e2e/materials.spec.ts e2e/a11y.spec.ts e2e/author/actions.ts e2e/shell.spec.ts e2e/tooltips.spec.ts
  FSH_NO_TTY=1 git commit -m "Add Layers and Motifs panes" -m "The project's structure is visible as a list (shell spec 6.1-6.2): Layers selects in sync with the canvas and enters instances and repeats on double-click; Motifs shows each definition with its usage and enters its first occurrence even when it is only nested. Layers becomes the default tab."
  ```

  Only add the `e2e/shell.spec.ts` and `e2e/tooltips.spec.ts` paths if Step 21 changed them.

---

### Task 6: Drawing bar, true-width preview, empty board, board dimensions, grid clip

Implements §9.1, §9.2, §9.3 and §9.5.

**Files:**
- Create `src/ui/DrawingBar.tsx`, which replaces `src/ui/ToolOptions.tsx`.
- Delete `src/ui/ToolOptions.tsx`.
- Modify `src/ui/App.tsx`: in the canvas-host, `<ToolOptions />` becomes `<DrawingBar />` plus `<EmptyBoardHint />`.
- Rewrite `src/render/overlays/DrawPreview.tsx` and `src/render/overlays/Grid.tsx`.
- Create `src/render/overlays/BoardDimensions.tsx`.
- Create `src/ui/EmptyBoardHint.tsx`.
- Modify `src/ui/ToolButtons.tsx`: the Band button's invite outline.
- Modify `src/render/Canvas.tsx`:
  - the selectors (~lines 88–99);
  - the svg children (~lines 413–419).
- Modify `src/editor/testHook.ts`: `HIDE_CHROME_CSS` (line 49).
- Modify `src/index.css`: remove the V1 `.tool-options*` rules (~lines 58–61 and 186–224); append a "Drawing bar, board overlays, empty board" section.
- Modify `e2e/drawing.spec.ts`: new tests.
- Modify `e2e/a11y.spec.ts`: the selector rename.

**Interfaces:**
- **Consumes:**
  - `WoodChip({ variant: 'bar' })` and `ToolButtons` (Task 3);
  - `Hint` with `label` / `keys`, and `Keycap({ label })` (Task 2);
  - `NumberField` (V1);
  - `finishDrawing`, `undoPoint`, `cancelDrawing`, `placeTyped`, `isDrawTool` (V1 `tools/draw.ts`);
  - `scopeControlShown` (V1).
- **Produces:**
  - `export function DrawingBar(): JSX.Element | null`: the toolbar `Drawing options`, or `Crossing options` for the Crossing tool.
  - `export function EmptyBoardHint(): JSX.Element | null`
  - `export function emptyBoardHintShown(s: EditorState): boolean`
  - `export function BoardDimensions(props): JSX.Element | null`
  - `DrawPreview` gains the props `widthMm: number` and `color: string | undefined`.
  - `Grid` loses `view` and gains `board: { widthMm: number; heightMm: number }`.

- [ ] **Step 1: Write the failing drawing and board e2e tests.**

  Append to `e2e/drawing.spec.ts`, inside `test.describe('mouse', …)` and after the last test:

  ```ts
  test('the band preview is drawn at the band width in the current wood (shell SPEC §9.3)', async ({ page }) => {
    await start(page, 'Band')
    for (const w of [{ x: 50, y: 50 }, { x: 100, y: 50 }]) {
      const c = await at(page, w)
      await page.mouse.click(c.x, c.y)
    }
    const c = await at(page, { x: 100, y: 100 })
    await page.mouse.move(c.x, c.y)
    const placed = page.locator('.draw-preview .draw-preview-placed')
    await expect(placed).toHaveAttribute('stroke-width', '6.35') // lastBandWidthMm, in the svg's world-mm user units
    await expect(placed).toHaveAttribute('stroke', '#E8D4A8') // Maple, the current wood
    await expect(placed).toHaveAttribute('stroke-opacity', '0.85')
    const pending = page.locator('.draw-preview .draw-preview-pending')
    await expect(pending).toHaveAttribute('stroke-width', '6.35')
    await expect(pending).toHaveAttribute('stroke-opacity', '0.45')
  })

  test('Cancel is an icon button with the Esc keycap that drops the drawing', async ({ page }) => {
    await start(page, 'Band')
    const a = await at(page, { x: 50, y: 50 })
    await page.mouse.click(a.x, a.y)
    const bar = page.getByRole('toolbar', { name: 'Drawing options' })
    await expect(bar.getByRole('button', { name: /^Current wood: Maple/ })).toBeVisible()
    await bar.getByRole('button', { name: 'Cancel' }).click()
    expect(await page.evaluate(() => window.__cbpd!.getState().drawing)).toBeNull()
    expect(await history(page)).toEqual({ past: 0, future: 0 })
  })
  ```

  After the `touch` describe block, append a new block:

  ```ts
  test.describe('board overlays and the empty board (shell SPEC §9.1, §9.2, §9.5)', () => {
    test.skip(({ isMobile }) => isMobile, 'mouse tests run in the desktop projects')

    test('a blank board invites the first band; the invitation goes once a band exists', async ({ page }) => {
      await seed(page, project([]))
      await setCamera(page, cameraShowing({ x: 0, y: 0 }, { x: 60, y: 120 }, 2))
      const hint = page.locator('.empty-board-hint')
      await expect(hint).toContainText('Draw your first band')
      await expect(hint).toContainText('then tap to place points. Double-tap to finish.')
      const bandTool = page.getByRole('button', { name: 'Band', exact: true })
      await expect(bandTool).toHaveAttribute('data-invite', '')

      await bandTool.click()
      const a = await at(page, { x: 50, y: 50 })
      await page.mouse.click(a.x, a.y)
      await expect(hint).toHaveCount(0) // hidden while drawing
      const b = await at(page, { x: 100, y: 50 })
      await page.mouse.click(b.x, b.y)
      await page.getByRole('button', { name: 'Finish' }).click()
      await expect(hint).toHaveCount(0)
      await expect(bandTool).not.toHaveAttribute('data-invite')
    })

    test('the grid fills only the Board rectangle', async ({ page }) => {
      await seed(page, project([]))
      await setCamera(page, cameraShowing({ x: 0, y: 0 }, { x: 60, y: 120 }, 2))
      const rect = page.locator('.grid > rect')
      await expect(rect).toHaveAttribute('fill', 'url(#snap-grid)')
      for (const [name, value] of [['x', '0'], ['y', '0'], ['width', '300'], ['height', '450']] as const) {
        await expect(rect).toHaveAttribute(name, value)
      }
    })

    test('dimension labels show the Board size and hide when the Board is under 80 px', async ({ page }) => {
      await seed(page, project([]))
      await setCamera(page, cameraShowing({ x: 0, y: 0 }, { x: 60, y: 120 }, 1))
      await expect(page.locator('.board-dimensions text')).toHaveText(['300 mm', '450 mm'])
      await setCamera(page, cameraShowing({ x: 0, y: 0 }, { x: 60, y: 120 }, 0.2)) // 60 px wide
      await expect(page.locator('.board-dimensions')).toHaveCount(0)
    })
  })
  ```

- [ ] **Step 2: Run the tests and watch them fail.**

  `pnpm exec playwright test e2e/drawing.spec.ts --project=chromium`

  Expected: the five new tests fail:
  - `.draw-preview-placed` is not found;
  - there is no wood chip in the bar;
  - there is no `.empty-board-hint`;
  - the grid rect has `width` equal to the view width;
  - there is no `.board-dimensions`.

  The existing tests pass.

- [ ] **Step 3: Rewrite `src/render/overlays/DrawPreview.tsx`.**

  ```tsx
  // Shell SPEC §9.3 (V1 §7.4): the drawing preview. A Band is drawn at its real
  // width in the current wood — placed segments at 85%, the pending one at 45%,
  // mitred and butt-capped like the scene (V1 §4.2). A Polygon or Rectangle is its
  // fill at 45% with a 1 px accent outline. Point dots and the length/angle label
  // are the accent with a white halo. Points are in the current context's space;
  // `matrix` maps them to world, and the band width scales with it.

  import type { JSX } from 'react'
  import type { Unit } from '@/domain/units'
  import { formatAngle, formatLength } from '@/domain/units'
  import type { Mat } from '@/geometry/affine'
  import { apply, scaleOf } from '@/geometry/affine'
  import type { Drawing } from '@/editor/store'

  type XY = { x: number; y: number }

  interface Props {
    drawing: NonNullable<Drawing>
    matrix: Mat
    zoom: number
    unit: Unit
    widthMm: number // lastBandWidthMm, in the context's space
    color: string | undefined // the current wood's colour
  }

  const pts = (points: XY[]): string => points.map((p) => `${p.x},${p.y}`).join(' ')

  export function DrawPreview({ drawing, matrix, zoom, unit, widthMm, color }: Props): JSX.Element {
    const px = 1 / zoom
    const world = drawing.points.map((p) => apply(matrix, p))
    const cursor = drawing.cursor
    const end = cursor === null ? null : apply(matrix, cursor.point)
    const last = world[world.length - 1]
    const band = { fill: 'none', stroke: color, strokeWidth: widthMm * scaleOf(matrix), strokeLinejoin: 'miter' as const, strokeMiterlimit: 10, strokeLinecap: 'butt' as const }
    const area = { fill: color, fillOpacity: 0.45, style: { stroke: 'var(--acc)' }, strokeWidth: px }

    let shape: JSX.Element | null = null
    if (drawing.tool === 'band') {
      shape = (
        <g>
          {world.length >= 2 && <polyline className="draw-preview-placed" points={pts(world)} {...band} strokeOpacity={0.85} />}
          {end !== null && last !== undefined && <line className="draw-preview-pending" x1={last.x} y1={last.y} x2={end.x} y2={end.y} {...band} strokeOpacity={0.45} />}
        </g>
      )
    } else if (drawing.tool === 'polygon') {
      const outline = end === null ? world : [...world, end]
      if (outline.length >= 2) shape = <polygon className="draw-preview-area" points={pts(outline)} {...area} />
    } else if (cursor !== null) {
      const a = drawing.points[0]!
      const c = cursor.point
      shape = <polygon className="draw-preview-area" points={pts([a, { x: c.x, y: a.y }, c, { x: a.x, y: c.y }].map((p) => apply(matrix, p)))} {...area} />
    }

    const label =
      drawing.tool !== 'rect' && end !== null && last !== undefined ? (
        <text x={end.x + 10 * px} y={end.y - 10 * px} fontSize={12 * px} style={{ fill: 'var(--acc)' }} stroke="#ffffff" strokeWidth={3 * px} paintOrder="stroke">
          {`${formatLength(cursor!.lengthMm, unit)} ${unit} · ${formatAngle(cursor!.angleDeg)}°`}
        </text>
      ) : null

    return (
      <g className="draw-preview" pointerEvents="none">
        {shape}
        {world.map((p, k) => (
          <circle key={k} cx={p.x} cy={p.y} r={3 * px} style={{ fill: 'var(--acc)' }} stroke="#ffffff" strokeWidth={1.5 * px} />
        ))}
        {label}
      </g>
    )
  }
  ```

  If Task 1 already swapped `#1a73e8` for `var(--acc)` in this file, this complete replacement supersedes it.

- [ ] **Step 4: Rewrite `src/render/overlays/Grid.tsx`.**

  ```tsx
  // Shell SPEC §9.2 (V1 §7.7): the snapping grid, drawn when Show grid is on —
  // one <pattern> tile in the current context's space (`matrix` maps it to
  // world) filling only the Board rectangle. Snapping itself is not clipped.
  // Hidden when a cell would be under MIN_CELL_PX on screen.

  import type { JSX } from 'react'
  import type { Mat } from '@/geometry/affine'
  import { scaleOf } from '@/geometry/affine'

  interface Props {
    gridMm: number
    matrix: Mat
    zoom: number
    board: { widthMm: number; heightMm: number }
  }

  const MIN_CELL_PX = 6

  export function Grid({ gridMm, matrix, zoom, board }: Props): JSX.Element | null {
    if (gridMm * scaleOf(matrix) * zoom < MIN_CELL_PX) return null
    const px = 1 / zoom / scaleOf(matrix) // stroke is in pattern (context) units
    return (
      <g className="grid" pointerEvents="none">
        <defs>
          <pattern id="snap-grid" patternUnits="userSpaceOnUse" width={gridMm} height={gridMm} patternTransform={`matrix(${matrix.join(' ')})`}>
            <path d={`M ${gridMm} 0 H 0 V ${gridMm}`} fill="none" style={{ stroke: 'var(--muted)' }} strokeOpacity={0.3} strokeWidth={px} />
          </pattern>
        </defs>
        <rect x={0} y={0} width={board.widthMm} height={board.heightMm} fill="url(#snap-grid)" />
      </g>
    )
  }
  ```

- [ ] **Step 5: Create `src/render/overlays/BoardDimensions.tsx`.**

  ```tsx
  // Shell SPEC §9.1: the Board's width and height in display units (V1 §8
  // formatting), outside its top and left edges, each centred on a hairline.
  // Sized in screen px through `zoom`, like the other overlays; hidden when the
  // Board is under MIN_BOARD_PX on screen.

  import type { JSX } from 'react'
  import type { Unit } from '@/domain/units'
  import { formatLength } from '@/domain/units'

  interface Props {
    board: { widthMm: number; heightMm: number }
    zoom: number
    unit: Unit
  }

  const MIN_BOARD_PX = 80
  const GAP_PX = 14

  export function BoardDimensions({ board, zoom, unit }: Props): JSX.Element | null {
    if (board.widthMm * zoom < MIN_BOARD_PX || board.heightMm * zoom < MIN_BOARD_PX) return null
    const px = 1 / zoom
    const off = -GAP_PX * px
    const text = { fontSize: 11 * px, strokeWidth: 4 * px, textAnchor: 'middle' as const, dominantBaseline: 'central' as const }
    const midY = board.heightMm / 2
    return (
      <g className="board-dimensions" pointerEvents="none">
        <line x1={0} y1={off} x2={board.widthMm} y2={off} strokeWidth={px} />
        <text x={board.widthMm / 2} y={off} {...text}>
          {`${formatLength(board.widthMm, unit)} ${unit}`}
        </text>
        <line x1={off} y1={0} x2={off} y2={board.heightMm} strokeWidth={px} />
        <text x={off} y={midY} transform={`rotate(-90 ${off} ${midY})`} {...text}>
          {`${formatLength(board.heightMm, unit)} ${unit}`}
        </text>
      </g>
    )
  }
  ```

- [ ] **Step 6: Wire the overlays into `src/render/Canvas.tsx`.**

  Add the import after the `CrossingMarkers` import:

  ```ts
  import { BoardDimensions } from './overlays/BoardDimensions.tsx'
  ```

  After `const ctxMatrix = useEditor(useShallow(contextMatrix))` add:

  ```ts
  const bandWidthMm = useEditor((s) => s.lastBandWidthMm)
  const woodColor = useEditor((s) => s.project.materials.find((m) => m.id === s.currentMaterialId)?.color)
  ```

  Replace:

  ```tsx
  <path className="board-mat" d={matD} fillRule="evenodd" pointerEvents="none" />
  {showGrid && <Grid gridMm={gridMm} matrix={ctxMatrix} zoom={camera.zoom} view={{ x: vx, y: vy, w: vw, h: vh }} />}
  ```

  with:

  ```tsx
  <path className="board-mat" d={matD} fillRule="evenodd" pointerEvents="none" />
  <BoardDimensions board={project.board} zoom={camera.zoom} unit={project.displayUnits} />
  {showGrid && <Grid gridMm={gridMm} matrix={ctxMatrix} zoom={camera.zoom} board={project.board} />}
  ```

  Replace:

  ```tsx
  {drawing !== null && <DrawPreview drawing={drawing} matrix={ctxMatrix} zoom={camera.zoom} unit={project.displayUnits} />}
  ```

  with:

  ```tsx
  {drawing !== null && <DrawPreview drawing={drawing} matrix={ctxMatrix} zoom={camera.zoom} unit={project.displayUnits} widthMm={bandWidthMm} color={woodColor} />}
  ```

  If Task 1 edited the `board-mat` line's attributes (for example a class for `--paste`), keep its version and insert only the `BoardDimensions` line after it.

- [ ] **Step 7: Create `src/ui/EmptyBoardHint.tsx`.**

  ```tsx
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
  ```

- [ ] **Step 8: Add the Band button's invite outline in `src/ui/ToolButtons.tsx`.**

  Add these imports:

  ```ts
  import { emptyBoardHintShown } from './EmptyBoardHint.tsx'
  ```

  (and `useEditor`, if Task 3 hasn't already imported it).

  In `ToolButtons`'s body, before its `return`:

  ```ts
  const invite = useEditor(emptyBoardHintShown)
  ```

  On the `<button>` rendered for each tool, add this attribute. `tool` here stands for the element's tool id from Task 3's tool list; use the loop variable's `Tool` value.

  ```tsx
  data-invite={tool === 'band' && invite ? '' : undefined}
  ```

  If Task 3 renders the Band button as its own element and not in a loop, add `data-invite={invite ? '' : undefined}` to that element only.

- [ ] **Step 9: Create `src/ui/DrawingBar.tsx` and delete `src/ui/ToolOptions.tsx`.**

  ```tsx
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

  import { X } from 'lucide-react'
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
      <div className="drawing-bar" role="toolbar" aria-label="Drawing options">
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

  /** V1 §7.4 Crossing options: the scope control (only when some pair has a common motif ancestor) and the tapped marker's read-out. Restyled in Task 7. */
  function CrossingOptions(): JSX.Element {
    const scope = useEditor((s) => s.crossingScope)
    const notice = useEditor((s) => s.crossingNotice)
    const scoped = scopeControlShown(useScene())
    const scopeButton = (value: 'all' | 'occurrence', label: string): JSX.Element => (
      <button type="button" aria-pressed={scope === value} onClick={() => useEditor.setState({ crossingScope: value })}>
        {label}
      </button>
    )
    return (
      <div className="drawing-bar" role="toolbar" aria-label="Crossing options">
        {scoped && (
          <div className="segmented" role="group" aria-label="Scope">
            {scopeButton('all', 'All instances')}
            {scopeButton('occurrence', 'This occurrence')}
          </div>
        )}
        <span className="drawing-bar-hint" role="status">
          {notice ?? 'Tap a crossing to swap which band is on top'}
        </span>
      </div>
    )
  }
  ```

  Then run `git rm src/ui/ToolOptions.tsx`.

  If Task 4 defined a shared `.segmented` class, this reuses it. If not, Step 11 defines it.

- [ ] **Step 10: Mount the new components in `src/ui/App.tsx` and hide them in pixel tests.**

  In `src/ui/App.tsx`:
  - replace `import { ToolOptions } from './ToolOptions.tsx'` with:

    ```ts
    import { DrawingBar } from './DrawingBar.tsx'
    import { EmptyBoardHint } from './EmptyBoardHint.tsx'
    ```

  - in `<main className="canvas-host">`, replace `<ToolOptions />` with:

    ```tsx
    <EmptyBoardHint />
    <DrawingBar />
    ```

    `EmptyBoardHint` sits directly after `<Canvas />`, so the floating bars paint above it.

  In `src/editor/testHook.ts`, in `HIDE_CHROME_CSS`, replace the selector `.tool-options` with `.drawing-bar, .board-dimensions, .empty-board-hint`. Keep every other selector, including any that Task 4 added.

- [ ] **Step 11: Replace the V1 options-bar CSS and append the new section.**

  In `src/index.css`:
  - delete the `.tool-options button[aria-pressed='true']` selector from the rule shared with `.toolbar button[aria-pressed='true']`, if Task 3 kept that rule;
  - delete the rule blocks `.tool-options`, `.tool-options button`, `.tool-options-fields`, `.tool-options-fields .field`, `.tool-options-fields .field label` and `.tool-options-fields .field input`.

  Then append:

  ```css
  /* Shell SPEC §9.3: the drawing bar, floating 12 px below the canvas's top
     edge, in the actions bar's slot. */
  .drawing-bar {
    position: absolute;
    top: 12px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 2;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    max-width: calc(100% - 24px);
    padding: 6px 8px;
    background: var(--panel);
    color: var(--text);
    border: 1px solid var(--line);
    border-radius: 12px;
    box-shadow: var(--shadow);
    font-size: 13px;
  }

  .drawing-bar-fields {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .drawing-bar-fields .field {
    display: flex;
    align-items: center;
    gap: 4px;
    margin: 0;
  }

  .drawing-bar-fields .field label {
    font-size: 12px;
    color: var(--muted);
  }

  .drawing-bar-fields .field input {
    width: 5.5em;
    font-variant-numeric: tabular-nums;
  }

  .drawing-bar-hint {
    font-size: 12px;
    color: var(--muted);
  }

  .drawing-bar-button {
    height: 30px;
    padding: 0 10px;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: var(--raised);
    color: var(--text);
    font: inherit;
  }

  .drawing-bar-primary {
    background: var(--acc);
    border-color: var(--acc);
    color: var(--acc-ink);
    font-weight: 500;
  }

  .drawing-bar-button:disabled {
    opacity: 0.45;
  }

  .segmented {
    display: inline-flex;
    padding: 2px;
    gap: 2px;
    border-radius: 8px;
    background: var(--raised);
  }

  .segmented button {
    height: 26px;
    padding: 0 10px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--muted);
    font: inherit;
    font-size: 12px;
  }

  .segmented button[aria-pressed='true'] {
    background: var(--panel);
    color: var(--text);
    box-shadow: 0 0 0 1px var(--line);
  }

  @media (pointer: coarse) {
    .drawing-bar-button,
    .segmented button {
      min-height: 44px;
    }
  }

  /* Shell SPEC §9.1: Board dimension labels. */
  .board-dimensions line {
    stroke: var(--line);
  }

  .board-dimensions text {
    fill: var(--muted);
    stroke: var(--paste);
    paint-order: stroke;
    font-variant-numeric: tabular-nums;
  }

  /* Shell SPEC §9.5: the empty Board's invitation, and the Band tool's outline. */
  .empty-board-hint {
    position: absolute;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    pointer-events: none;
    text-align: center;
    font-size: 13px;
    color: var(--muted);
  }

  .empty-board-hint p {
    margin: 0;
  }

  .empty-board-title {
    font-size: 16px;
    font-weight: 600;
    color: var(--text);
  }

  [data-invite] {
    box-shadow: inset 0 0 0 1.5px var(--acc);
  }
  ```

  The hint text sits on the Board's own material colour, which is document data. It stays readable on the V1 default white Board and on the starter woods through `--text`/`--muted` in both themes. §16's contrast walkthrough in Task 10 checks this.

- [ ] **Step 12: Run the specs and watch them pass.**

  `pnpm exec playwright test e2e/drawing.spec.ts`

  Expected: every test passes in all four projects. The new tests skip in chromium-touch.

- [ ] **Step 13: Fix the fallout from the selector rename.**

  Run `grep -rn "tool-options" e2e src`. In `e2e/a11y.spec.ts`, both occurrences (V1 lines 62 and 69) change from:

  ```ts
  offenders.push(...(await unlabeledButtons(page, '.tool-options button')))
  ```

  to:

  ```ts
  offenders.push(...(await unlabeledButtons(page, '.drawing-bar button')))
  ```

  Then run:

  ```
  pnpm exec playwright test e2e/a11y.spec.ts e2e/crossings.spec.ts e2e/motifs.spec.ts e2e/author e2e/export-parity.spec.ts e2e/crossing-proof.spec.ts e2e/tablet.spec.ts e2e/inspector.spec.ts
  ```

  Expected: all pass. The toolbar names `Drawing options` and `Crossing options`, the field labels, and `Finish` / `Undo point` / `Cancel` are unchanged. The pixel specs hide the new overlays through `hideChrome`.

- [ ] **Step 14: Run the gate and commit.**

  Run:

  ```
  pnpm typecheck && pnpm test && pnpm exec playwright test e2e/drawing.spec.ts e2e/a11y.spec.ts e2e/crossings.spec.ts
  ```

  ```
  git add src/ui/DrawingBar.tsx src/ui/ToolOptions.tsx src/ui/EmptyBoardHint.tsx src/ui/ToolButtons.tsx src/ui/App.tsx src/render/overlays/DrawPreview.tsx src/render/overlays/Grid.tsx src/render/overlays/BoardDimensions.tsx src/render/Canvas.tsx src/editor/testHook.ts src/index.css e2e/drawing.spec.ts e2e/a11y.spec.ts
  FSH_NO_TTY=1 git commit -m "Add drawing bar, true-width preview and board hints" -m "Drawing now shows what will be cut: the band preview uses its real width and wood, the Board is labelled with its size, the grid stays on the Board, and an empty Board says how to begin (shell spec 9.1-9.3, 9.5). The drawing options move into a floating bar beside the wood chip."
  ```

---

### Task 7: Crossing tool restyle and Crossings panel

Implements §9.6.

**Files:**
- Rewrite `src/render/overlays/CrossingMarkers.tsx`.
- Modify `src/editor/tools/crossing.ts`: add `markerAt`; `tap` uses it (~lines 61–77).
- Modify `src/render/Canvas.tsx`:
  - hover state;
  - the crossing effect (~lines 389–405);
  - the markers line (~line 420);
  - render `CrossingHover`.
- Create `src/ui/CrossingHover.tsx`.
- Modify `src/ui/DrawingBar.tsx`: `CrossingOptions` gains the legend.
- Modify `src/ui/Inspector/CrossingList.tsx`: export `uniqueUnresolved`.
- Create `src/ui/Inspector/CrossingsPanel.tsx`.
- Modify `src/ui/Inspector/Inspector.tsx`: the empty-selection branch.
- Modify `src/editor/testHook.ts`: `HIDE_CHROME_CSS`.
- Modify `src/index.css`: append a "Crossing tool" section.
- Modify `e2e/crossings.spec.ts`: new tests.

**Interfaces:**
- **Consumes:**
  - from Task 5: `occurrencePaths(p, scene, motifId)`, `contextLevelsForPath(p, path)` and `setEditContext(levels)`;
  - from Task 2: `Keycap({ label })`;
  - from Task 6: `DrawingBar`'s `CrossingOptions`.
- **Produces:**
  - `export function markerAt(svg: SVGSVGElement, scene: Scene, client: { x: number; y: number }, pointerType: string): number | null` in `src/editor/tools/crossing.ts`. It returns an index into `[...scene.intersections, ...scene.unresolved]`.
  - `export function CrossingHover(props: { scene: Scene; index: number; materials: Material[]; camera: Camera }): JSX.Element | null`
  - `export function uniqueUnresolved(scene: Scene, matches: (u: UnresolvedMarker) => boolean): UnresolvedMarker[]`
  - `export function CrossingsPanel(): JSX.Element`

- [ ] **Step 1: Write the failing crossings e2e tests.**

  In `e2e/crossings.spec.ts`:
  - change the builders import to `import { band, instance, project, record, ref, repeat, transform } from '../src/domain/test-builders.ts'`;
  - add this after `weave()`:

  ```ts
  /** A definition record between two parallel bands of motif M: unresolved in its context, shown once for instance i1. */
  function lostInMotif(): Project {
    const lost = record('lost', ref('A', 'A0'), ref('B', 'B0'), 'a', { x: 5, y: 5 })
    return project(
      [instance('i1', 'M', { x: 50, y: 50 })],
      [{ id: 'M', children: [band('A', [[0, 0], [40, 0]]), band('B', [[0, 20], [40, 20]], { materialId: 'walnut' })], crossings: [lost] }],
    )
  }
  ```

  Append inside `test.describe('crossing tool (mouse)', …)`:

  ```ts
  test('hovering a marker grows it and names the over and under woods, with a Click keycap', async ({ page }) => {
    await start(page)
    const at = await clientAt(page, h1v1(0, 0))
    await page.mouse.move(at.x, at.y)
    const tip = page.locator('.crossing-hover')
    await expect(tip).toContainText('Maple over Walnut') // v1 (Maple) is over by paint order
    await expect(tip).toContainText('Click to put Walnut on top')
    await expect(tip.locator('.keycap', { hasText: 'Click' })).toBeVisible()
    await expect(page.locator('.crossing-markers [data-crossing-class="eligible"] svg')).toHaveCount(1) // the ArrowLeftRight glyph

    const unsupported = await clientAt(page, { x: 50, y: 160 })
    await page.mouse.move(unsupported.x, unsupported.y)
    await expect(tip).toContainText('The crossing angle is below')

    const far = await clientAt(page, h1v1(0, 0), { x: -30, y: 0 })
    await page.mouse.move(far.x, far.y)
    await expect(tip).toHaveCount(0)
  })

  test('the Crossings panel lists an unresolved record; Show enters its context and selects its band', async ({ page }) => {
    await seed(page, lostInMotif())
    await setCamera(page, CAMERA)
    await page.keyboard.press('x')
    await expect(page.getByRole('toolbar', { name: 'Crossing options' })).toContainText('1 unresolved')
    const panel = page.getByRole('region', { name: 'Crossings' })
    await expect(panel).toContainText('Needs attention')
    await panel.getByRole('button', { name: 'Show' }).click()
    expect(await page.evaluate(() => window.__cbpd!.getState().editContext)).toEqual([{ motifId: 'M', path: [{ instanceId: 'i1' }] }])
    expect(await page.evaluate(() => window.__cbpd!.getState().selection)).toEqual(['A'])
  })

  test('the Crossings panel counts swaps and unsupported crossings, and Remove drops an unresolved record', async ({ page }) => {
    await start(page)
    const panel = page.getByRole('region', { name: 'Crossings' })
    const total = await page.evaluate(() => window.__cbpd!.getScene().intersections.length)
    await expect(panel).toContainText(`${total} crossings`)
    await expect(panel.locator('.cant-swap')).toContainText('The crossing angle is below')
    await page.getByRole('button', { name: 'This occurrence' }).click()
    const cell = await clientAt(page, h1v1(1, 2))
    await page.mouse.click(cell.x, cell.y)
    await expect(panel.locator('.swapped li')).toHaveCount(1)

    await seed(page, lostInMotif())
    await page.keyboard.press('x')
    await page.getByRole('region', { name: 'Crossings' }).getByRole('button', { name: 'Remove' }).click()
    expect(await page.evaluate(() => window.__cbpd!.getProject().motifs['M']!.crossings)).toEqual([])
    await expect(page.getByRole('toolbar', { name: 'Crossing options' })).not.toContainText('unresolved')
  })
  ```

  `.keycap` is Task 2's `Keycap` class. If Task 2 named it differently, use that class here.

- [ ] **Step 2: Run the tests and watch them fail.**

  `pnpm exec playwright test e2e/crossings.spec.ts --project=chromium`

  Expected: the three new tests fail. There is no `.crossing-hover`, no legend text and no Crossings region. The existing four tests pass.

- [ ] **Step 3: Add `markerAt` to `src/editor/tools/crossing.ts` and route `tap` through it.**

  Remove `import { worldToScreen } from '@/editor/camera'`. Before `function tap`, add:

  ```ts
  /**
   * Index into `[...scene.intersections, ...scene.unresolved]` of the marker
   * centre nearest `client` within the pointer type's hit radius (12 px
   * mouse/pen, 22 px touch), or null. One screen CTM for all centres, so the
   * hover can call it on every pointer move.
   */
  export function markerAt(svg: SVGSVGElement, scene: Scene, client: XY, pointerType: string): number | null {
    const ctm = svg.getScreenCTM()!
    const centres = [...scene.intersections.map((i) => i.point), ...scene.unresolved.map((u) => u.worldHint)].map((w) => {
      const q = new DOMPoint(w.x, w.y).matrixTransform(ctm)
      return { x: q.x, y: q.y }
    })
    return pickNearest(centres, client, pointerType === 'touch' ? HIT_RADIUS_TOUCH_PX : HIT_RADIUS_MOUSE_PX)
  }
  ```

  Replace the first four lines of `tap`'s body:

  ```ts
    const scene = editorScene(useEditor.getState())
    const listed = scene.intersections
    const centres = [...listed.map((i) => i.point), ...scene.unresolved.map((u) => u.worldHint)].map((w) => worldToScreen(svg, w))
    const k = pickNearest(centres, client, pointerType === 'touch' ? HIT_RADIUS_TOUCH_PX : HIT_RADIUS_MOUSE_PX)
  ```

  with:

  ```ts
    const scene = editorScene(useEditor.getState())
    const listed = scene.intersections
    const k = markerAt(svg, scene, client, pointerType)
  ```

  Run `pnpm exec playwright test e2e/crossings.spec.ts -g "all instances|touch radius"`.

  Expected: PASS. The 16 px miss, the 8 px hit and the 18 px touch hit pin the hit radii across this refactor.

- [ ] **Step 4: Rewrite `src/render/overlays/CrossingMarkers.tsx`.**

  ```tsx
  // Shell SPEC §9.6 (V1 §7.4): Crossing tool markers, sized in screen px
  // through zoom, over an 18% pasteboard wash so they read on any wood.
  // Eligible: an 18 px accent disc with a 2 px white ring. Overridden: the same
  // plus a 2 px attention outer ring. Unsupported: a hatched disc (muted on
  // white). Unresolved: a hollow 2.5 px attention ring at the record's hint.
  // The hovered marker (fine pointer, Canvas) grows to 26 px; an eligible one
  // shows the swap glyph. Hit radii are the tool's, unchanged.

  import { ArrowLeftRight } from 'lucide-react'
  import type { JSX } from 'react'
  import type { Scene } from '@/geometry/scene'

  interface Props {
    scene: Scene
    zoom: number
    view: { x: number; y: number; w: number; h: number } // visible viewBox, world mm
    hovered: number | null // index into [...intersections, ...unresolved]
  }

  export function CrossingMarkers({ scene, zoom, view, hovered }: Props): JSX.Element {
    const px = 1 / zoom
    const radius = (k: number): number => (k === hovered ? 13 : 9) * px
    const listed = scene.intersections.length
    return (
      <g className="crossing-markers" pointerEvents="none">
        <defs>
          <pattern id="cbpd-hatch" patternUnits="userSpaceOnUse" width={3 * px} height={3 * px} patternTransform="rotate(45)">
            <rect width={3 * px} height={3 * px} fill="#ffffff" />
            <rect width={1.2 * px} height={3 * px} style={{ fill: 'var(--muted)' }} />
          </pattern>
        </defs>
        <rect className="crossing-wash" x={view.x} y={view.y} width={view.w} height={view.h} />
        {scene.intersections.map((i, k) => {
          const r = radius(k)
          const eligible = i.cls === 'eligible'
          return (
            <g key={k} data-crossing-class={i.cls} data-source={i.source}>
              {i.source === 'override' && <circle cx={i.point.x} cy={i.point.y} r={r + 2 * px} fill="none" style={{ stroke: 'var(--attn)' }} strokeWidth={2 * px} />}
              {eligible ? (
                <circle cx={i.point.x} cy={i.point.y} r={r} style={{ fill: 'var(--acc)' }} stroke="#ffffff" strokeWidth={2 * px} />
              ) : (
                <circle cx={i.point.x} cy={i.point.y} r={r} fill="url(#cbpd-hatch)" style={{ stroke: 'var(--muted)' }} strokeWidth={px} />
              )}
              {eligible && k === hovered && <ArrowLeftRight x={i.point.x - 7 * px} y={i.point.y - 7 * px} size={14 * px} strokeWidth={1.6} color="#ffffff" />}
            </g>
          )
        })}
        {scene.unresolved.map((u, k) => (
          <circle
            key={`${u.record.id}@${u.occurrenceKey}`}
            data-crossing-class="unresolved"
            cx={u.worldHint.x}
            cy={u.worldHint.y}
            r={radius(listed + k)}
            fill="none"
            style={{ stroke: 'var(--attn)' }}
            strokeWidth={2.5 * px}
          />
        ))}
      </g>
    )
  }
  ```

- [ ] **Step 5: Create `src/ui/CrossingHover.tsx`.**

  ```tsx
  // Shell SPEC §9.6: the hovered crossing marker's tooltip, a positioned div
  // (not a Radix tooltip: its anchor is a point on the canvas, not an
  // element), styled like the Hint surface. Eligible: "<over> over <under>"
  // with a Click keycap and the swap hint; unsupported: its reason; an
  // unresolved ring: how to rebind it. Placed at the marker's point within the
  // canvas: (world − camera) × zoom.

  import type { JSX } from 'react'
  import type { Id, Material } from '@/domain/model'
  import type { Scene } from '@/geometry/scene'
  import type { Camera } from '@/editor/store'
  import { Keycap } from './Keycap.tsx'

  interface Props {
    scene: Scene
    index: number // into [...scene.intersections, ...scene.unresolved]
    materials: Material[]
    camera: Camera
  }

  export function CrossingHover({ scene, index, materials, camera }: Props): JSX.Element | null {
    const name = (id: Id): string => materials.find((m) => m.id === id)!.name // V1 §2.1 invariant 2
    const i = scene.intersections[index]
    const u = i === undefined ? scene.unresolved[index - scene.intersections.length] : undefined
    const at = i?.point ?? u?.worldHint
    if (at === undefined) return null // the index came from a scene that has since changed

    let label = 'Unresolved crossing'
    let hint = 'Toggle a crossing of the same pair to rebind it, or remove it in the inspector'
    let click = false
    if (i !== undefined && i.cls === 'eligible') {
      const over = i.a.occ.key === i.overKey ? i.a : i.b
      const under = over === i.a ? i.b : i.a
      label = `${name(over.occ.materialId)} over ${name(under.occ.materialId)}`
      hint = `Click to put ${name(under.occ.materialId)} on top`
      click = true
    } else if (i !== undefined) {
      label = "Can't swap"
      hint = i.reason
    }

    return (
      <div className="crossing-hover" role="tooltip" style={{ left: (at.x - camera.x) * camera.zoom, top: (at.y - camera.y) * camera.zoom }}>
        <div className="crossing-hover-row">
          <span>{label}</span>
          {click && <Keycap label="Click" />}
        </div>
        <div className="crossing-hover-hint">{hint}</div>
      </div>
    )
  }
  ```

- [ ] **Step 6: Wire hover into `src/render/Canvas.tsx`.**

  Change these imports:
  - add `markerAt` to the `@/editor/tools/crossing` import list;
  - add `import { editorScene, useScene } from '@/editor/scene'`, which replaces the `useScene`-only import;
  - add `import { CrossingHover } from '@/ui/CrossingHover'`.

  After `const [rotating, setRotating] = useState(false)` add:

  ```ts
  /** The crossing marker under a fine pointer (shell SPEC §9.6), as an index into [...intersections, ...unresolved]. */
  const [hovered, setHovered] = useState<number | null>(null)
  ```

  Replace the Crossing tool effect (`// The Crossing tool owns single-pointer taps the same way` through its closing `}, [tool, wrapper, svgEl])`) with:

  ```tsx
  // The Crossing tool owns single-pointer taps the same way (SPEC §7.4); a
  // fine pointer's moves also hover the nearest marker (shell SPEC §9.6).
  useEffect(() => {
    if (tool !== 'crossing' || wrapper === null || svgEl === null) return
    const onDown = (e: PointerEvent): void => crossingPointerDown(e, spaceRef.current)
    const onUp = (e: PointerEvent): void => crossingPointerUp(svgEl, e)
    const onMove = (e: PointerEvent): void => {
      crossingPointerMove(e)
      setHovered(e.pointerType === 'touch' || e.buttons !== 0 ? null : markerAt(svgEl, editorScene(useEditor.getState()), clientOf(e), e.pointerType))
    }
    const onLeave = (): void => setHovered(null)
    wrapper.addEventListener('pointerdown', onDown)
    wrapper.addEventListener('pointermove', onMove)
    wrapper.addEventListener('pointerleave', onLeave)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', crossingPointerCancel)
    return () => {
      wrapper.removeEventListener('pointerdown', onDown)
      wrapper.removeEventListener('pointermove', onMove)
      wrapper.removeEventListener('pointerleave', onLeave)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', crossingPointerCancel)
      resetCrossingInput()
      setHovered(null)
    }
  }, [tool, wrapper, svgEl])
  ```

  Replace:

  ```tsx
  {tool === 'crossing' && <CrossingMarkers scene={scene} zoom={camera.zoom} />}
  ```

  with:

  ```tsx
  {tool === 'crossing' && <CrossingMarkers scene={scene} zoom={camera.zoom} view={{ x: vx, y: vy, w: vw, h: vh }} hovered={hovered} />}
  ```

  Directly after the closing `</svg>` add:

  ```tsx
  {tool === 'crossing' && hovered !== null && <CrossingHover scene={scene} index={hovered} materials={shown.materials} camera={camera} />}
  ```

  `setHovered` with an unchanged value bails out in React. So the Canvas re-renders only when the pointer enters or leaves a marker, not on every move.

- [ ] **Step 7: Add the legend to the crossing variant of `src/ui/DrawingBar.tsx`.**

  Add `import { TriangleAlert } from 'lucide-react'`. Merge it with the existing `X` import into `import { TriangleAlert, X } from 'lucide-react'`.

  Replace the whole `CrossingOptions` function with:

  ```tsx
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
      <div className="drawing-bar" role="toolbar" aria-label="Crossing options">
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
  ```

- [ ] **Step 8: Export the unresolved-record dedupe from `src/ui/Inspector/CrossingList.tsx`.**

  Add `import type { Scene, UnresolvedMarker } from '@/geometry/scene'`, which replaces the `UnresolvedMarker`-only type import. Replace `UnresolvedList`'s first four body lines:

  ```ts
    const scene = useScene()
    const unit = useEditor((s) => s.project.displayUnits)
    const byId = new Map<Id, UnresolvedMarker>()
    for (const u of scene.unresolved) if (!byId.has(u.record.id) && matches(u)) byId.set(u.record.id, u)
    if (byId.size === 0) return null
  ```

  with:

  ```ts
    const records = uniqueUnresolved(useScene(), matches)
    const unit = useEditor((s) => s.project.displayUnits)
    if (records.length === 0) return null
  ```

  and `{[...byId.values()].map((u) => (` with `{records.map((u) => (`. Then add before `UnresolvedList`:

  ```ts
  /** SPEC §5.5: the unresolved records matching `matches`, once per record (its first marker, in placement order). */
  export function uniqueUnresolved(scene: Scene, matches: (u: UnresolvedMarker) => boolean): UnresolvedMarker[] {
    const byId = new Map<Id, UnresolvedMarker>()
    for (const u of scene.unresolved) if (!byId.has(u.record.id) && matches(u)) byId.set(u.record.id, u)
    return [...byId.values()]
  }
  ```

- [ ] **Step 9: Create `src/ui/Inspector/CrossingsPanel.tsx`.**

  ```tsx
  // Shell SPEC §9.6: the Inspector while the Crossing tool is active and
  // nothing is selected — the crossing count; Needs attention (unresolved
  // records, each with Show and Remove); Swapped (the overridden crossings);
  // Can't swap (a count, grouped by reason). Show enters the record's context
  // (§6.4) at its first placement and selects the top-level object of the
  // record's first band reference there — which validation guarantees is a
  // child of that context (V1 §2.1).

  import { TriangleAlert } from 'lucide-react'
  import type { JSX } from 'react'
  import { removeRecord } from '@/domain/commands'
  import { stepObjectId } from '@/domain/keys'
  import type { Id } from '@/domain/model'
  import { formatLength } from '@/domain/units'
  import type { UnresolvedMarker } from '@/geometry/scene'
  import { occurrencePaths } from '@/geometry/scene'
  import { useScene } from '@/editor/scene'
  import { contextLevelsForPath } from '@/editor/selection'
  import { useEditor } from '@/editor/store'
  import { uniqueUnresolved } from './CrossingList.tsx'

  export function CrossingsPanel(): JSX.Element {
    const scene = useScene()
    const shown = useEditor((s) => s.preview?.next ?? s.project)
    const unit = shown.displayUnits
    const name = (id: Id): string => shown.materials.find((m) => m.id === id)!.name // V1 §2.1 invariant 2
    const where = (pt: { x: number; y: number }): string => `${formatLength(pt.x, unit)}, ${formatLength(pt.y, unit)}`

    const attention = uniqueUnresolved(scene, () => true)
    const swapped = scene.intersections.filter((i) => i.source === 'override')
    const unsupported = scene.intersections.filter((i) => i.cls !== 'eligible')
    const reasons = new Map<string, number>()
    for (const i of unsupported) reasons.set(i.reason, (reasons.get(i.reason) ?? 0) + 1)
    const total = scene.intersections.length

    const show = (u: UnresolvedMarker): void => {
      const s = useEditor.getState()
      s.setEditContext(u.contextId === null ? [] : contextLevelsForPath(s.project, occurrencePaths(shown, scene, u.contextId)[0]!))
      const first = u.record.a.path[0]
      s.select([first === undefined ? u.record.a.bandId : stepObjectId(first)])
    }

    return (
      <section className="panel crossings-panel" aria-label="Crossings">
        <h2>Crossings</h2>
        <p className="panel-note">{total === 1 ? '1 crossing' : `${total} crossings`}</p>
        {attention.length > 0 && (
          <div className="needs-attention">
            <h3>
              <TriangleAlert size={14} strokeWidth={1.6} aria-hidden="true" /> Needs attention
            </h3>
            <ul className="overrides">
              {attention.map((u) => (
                <li key={u.record.id}>
                  Unresolved at {where(u.worldHint)}
                  <button type="button" onClick={() => show(u)}>
                    Show
                  </button>
                  <button type="button" onClick={() => useEditor.getState().run((p) => removeRecord(p, u.contextId, u.record.id))}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <h3>Swapped</h3>
        {swapped.length === 0 ? (
          <p className="panel-note">None</p>
        ) : (
          <ul className="overrides swapped">
            {swapped.map((i) => {
              const over = i.a.occ.key === i.overKey ? i.a : i.b
              const under = over === i.a ? i.b : i.a
              return (
                <li key={`${i.a.occ.key}@${i.a.segmentStart}|${i.b.occ.key}@${i.b.segmentStart}`}>
                  {name(over.occ.materialId)} over {name(under.occ.materialId)} at {where(i.point)}
                </li>
              )
            })}
          </ul>
        )}
        <h3>Can't swap</h3>
        <div className="cant-swap">
          <p className="panel-note">{unsupported.length}</p>
          {reasons.size > 0 && (
            <ul className="overrides">
              {[...reasons].map(([reason, count]) => (
                <li key={reason}>
                  {reason}: {count}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    )
  }
  ```

  `u.contextId === null` means the record is a root record. Show then returns to the root with `setEditContext([])`, from wherever the user is.

- [ ] **Step 10: Route the Inspector.**

  In `src/ui/Inspector/Inspector.tsx`, add `import { CrossingsPanel } from './CrossingsPanel.tsx'`. At the top of `Inspector` add `const tool = useEditor((s) => s.tool)`. In the empty-selection branch, replace the `<BoardPanel />` element with:

  ```tsx
  {tool === 'crossing' ? <CrossingsPanel /> : <BoardPanel />}
  ```

  Keep whatever else Task 3 renders in that branch. Update the header comment's first routing sentence to: "Nothing selected → the Crossings panel while the Crossing tool is active (shell SPEC §9.6), else Board."

- [ ] **Step 11: Add the CSS and the pixel-test hide rule.**

  In `src/editor/testHook.ts`, append `, .crossing-hover` to the selector list of `HIDE_CHROME_CSS`.

  Append to `src/index.css`:

  ```css
  /* Shell SPEC §9.6: Crossing tool — scene wash, hover tooltip, legend, panel. */
  .crossing-wash {
    fill: var(--paste);
    opacity: 0.18;
  }

  .crossing-hover {
    position: absolute;
    z-index: 3;
    transform: translate(-50%, calc(-100% - 20px));
    pointer-events: none;
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-width: 260px;
    padding: 6px 8px;
    border-radius: 8px;
    background: var(--tip-bg);
    color: #ffffff;
    box-shadow: var(--shadow);
    font-size: 12px;
    font-weight: 500;
  }

  .crossing-hover-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .crossing-hover-hint {
    color: var(--muted);
    font-weight: 400;
  }

  @media (prefers-reduced-motion: no-preference) {
    .crossing-hover {
      animation: crossing-hover-in 100ms ease-out;
    }
  }

  @keyframes crossing-hover-in {
    from {
      opacity: 0;
    }
  }

  .crossing-legend {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
    margin: 0;
    padding: 0;
    list-style: none;
    font-size: 12px;
    color: var(--muted);
  }

  .crossing-legend li {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }

  .legend-mark {
    display: inline-block;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    box-sizing: border-box;
  }

  .legend-eligible {
    background: var(--acc);
    border: 2px solid #ffffff;
  }

  .legend-swapped {
    background: var(--acc);
    border: 2px solid #ffffff;
    box-shadow: 0 0 0 2px var(--attn);
  }

  .legend-unsupported {
    background: repeating-linear-gradient(45deg, var(--muted) 0 1.5px, #ffffff 1.5px 3.5px);
  }

  .legend-attn {
    color: var(--attn);
  }

  .needs-attention {
    border-left: 3px solid var(--attn);
    padding-left: 8px;
  }

  .needs-attention h3 {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--attn);
  }
  ```

  `.crossing-hover`'s `#ffffff` text on `--tip-bg` follows §12.3: the tooltip surface is dark in both themes. This is CSS in `index.css`, not an overlay, so §9.8's hex rule does not apply. If Task 2's Hint content rule defines a text-colour variable, use it here instead.

- [ ] **Step 12: Run the specs and watch them pass.**

  `pnpm exec playwright test e2e/crossings.spec.ts`

  Expected: all pass. The hover and panel tests are skipped in chromium-touch. The existing marker counts still hold: `data-crossing-class` sits only on each marker's `<g>` and on the unresolved circles. The existing 36-eligible and 1-near-parallel counts, the `data-source="override"` count, and the `Under:/Over: toggle crossing with Maple at 20, 20` buttons are unchanged.

- [ ] **Step 13: Fix fallout in the affected existing specs.**

  Run:

  ```
  pnpm exec playwright test e2e/a11y.spec.ts e2e/crossing-proof.spec.ts e2e/author e2e/tablet.spec.ts e2e/export-parity.spec.ts
  ```

  Expected: all pass with no edits.
  - The wash and hover sit inside `.crossing-markers` / `.crossing-hover`, which `hideChrome` hides for the raster comparisons.
  - The `Crossing options` toolbar name and the `All instances` / `This occurrence` buttons are unchanged.

  If the `a11y.spec.ts` unlabelled-button check over `.drawing-bar button` reports nothing new, no edit is needed: the legend has no buttons.

- [ ] **Step 14: Run the gate and commit.**

  Run:

  ```
  pnpm typecheck && pnpm test && pnpm exec playwright test e2e/crossings.spec.ts e2e/crossing-proof.spec.ts e2e/a11y.spec.ts
  ```

  ```
  git add src/render/overlays/CrossingMarkers.tsx src/render/Canvas.tsx src/editor/tools/crossing.ts src/ui/CrossingHover.tsx src/ui/DrawingBar.tsx src/ui/Inspector/CrossingList.tsx src/ui/Inspector/CrossingsPanel.tsx src/ui/Inspector/Inspector.tsx src/editor/testHook.ts src/index.css e2e/crossings.spec.ts
  FSH_NO_TTY=1 git commit -m "Restyle crossing tool and add Crossings panel" -m "Crossing state has to read on any wood and explain itself before a click: markers get the accent and attention styles over a wash, hovering names which wood is on top, the bar carries a legend, and the Inspector gathers unresolved, swapped and unsupported crossings with a way to reach each unresolved one (shell spec 9.6)."
  ```

---

No CONTRACT ISSUE. The contract names are used unchanged: `EditPill`, `Section`, `NewProjectDialog`, `occurrencePaths(p, scene, motifId)`, `setEditContext`, `Hint`, `MotifIcon`, `RepeatIcon`, `CrossingsPanel`, `downloadProject`.

Private additions:
- `ContextOutline`, in `ContextScrim.tsx`.
- `Switch` (`src/ui/Inspector/Switch.tsx`, which has four callers).
- `PointsTable`, in `PointRow.tsx`.
- `isBlankProject` moves from `ProjectMenu.tsx` to `src/domain/project.ts`. It now has two callers: the Open confirmation and the New Project warning.
- `NumberField` gains `prefix?: ReactNode`, not `string`. This lets it take the rotate icon that §13 allows. `null` hides the label without showing a prefix, for table cells whose column header names the value.

Assumptions about Tasks 0–7 that these tasks edit blind. Each is checked by a grep step before the edit:
- (a) `ProjectMenu.tsx` renders the project-name `DropdownMenu.Trigger`. Its accessible name is the project name. It still holds V1's `pending: 'new' | 'open'` confirmation and the DEV `Load sample (dev)` sub-menu.
- (b) `ActionsBar` and `DrawingBar` are absolutely positioned by a `.floating-top` rule.
- (c) The Inspector routes to `<CrossingsPanel />` when `tool === 'crossing'` and the selection is empty.
- (d) `MaterialPalette` is gone from the Inspector.
- (e) The Board panel's Name field is gone (Task 3 Rename).
- (f) `SelectionPanel` has no button rows (Task 4).

Spec ambiguity resolved: §8 says both "clicking an earlier level pops back to it" and "the menu stays on the project name". Inside an edit context the project name is the root crumb, and it pops to the root. The menu moves to a chevron `Project menu` button right beside that crumb. Outside a context, the name is the menu trigger exactly as Task 3 built it.

---

### Task 8: Edit context presentation

**Files:**
- Create:
  - `src/ui/EditPill.tsx`
  - `e2e/edit-context.spec.ts`
- Modify:
  - `src/ui/App.tsx`: the canvas `Panel`'s `<main className="canvas-host">` element and its imports.
  - `src/ui/ProjectMenu.tsx`: the `DropdownMenu.Trigger` element, and imports.
  - `src/render/overlays/ContextScrim.tsx`: whole file, 32 lines.
  - `src/render/Canvas.tsx`: the import at line ~65, and the overlay list at lines ~412–413.
  - `src/index.css`:
    - the `.context-scrim-rect` rule;
    - delete the `.breadcrumb` rules;
    - edit the `.floating-top` rule;
    - append a section.
  - `e2e/motifs.spec.ts`: lines 98, 104 and 177.
- Delete: `src/ui/Breadcrumb.tsx`
- Test: `e2e/edit-context.spec.ts`, `e2e/motifs.spec.ts`, `e2e/author/*.spec.ts` (`Author.done()` uses the `Edit context` nav).

**Interfaces:**
- Consumes:
  - `occurrencePaths(p: Project, scene: Scene, motifId: Id): Step[][]` (Task 5)
  - `useEditor.getState().setEditContext(levels: EditContextLevel[]): void` (Task 5)
  - `Hint(props: HintProps)` (Task 2)
  - `MotifIcon({ size }: IconProps)` (Task 3)
  - `ActionsBar(): JSX.Element | null` (Task 4)
  - `DrawingBar(): JSX.Element | null` (Task 6)
- Produces:
  - `export function EditPill(): JSX.Element | null`
  - `export function ContextOutline({ scene, prefix, zoom }: { scene: Scene; prefix: Step[]; zoom: number }): JSX.Element | null` (private to the canvas)

- [ ] **Step 1: Write the failing e2e spec.** Create `e2e/edit-context.spec.ts`:

```ts
// Shell spec §9.7 and §8: the edit-context pill (Editing <name>, the
// occurrence count, Done), the 2 px accent frame, the top-of-canvas stack
// (a bar 8 px under the pill), the --paste scrim at 62%, the entered
// occurrence's dashed outline, and the top-bar breadcrumb.

import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import type { Project, Step } from '../src/domain/model.ts'
import { band, instance, project } from '../src/domain/test-builders.ts'
import { expectClose, nextFrame, seed, seededProject } from './helpers.ts'

/** i1 (motif m1) at the root; m1 holds i2 (motif m2) and a band; m2 holds one band. */
function nestedProject(): Project {
  return project(
    [instance('i1', 'm1', { x: 100, y: 100 })],
    [
      { id: 'm1', children: [instance('i2', 'm2', { x: 20, y: 0 }), band('m1b', [[-40, 0], [0, 0]])] },
      { id: 'm2', children: [band('m2b', [[0, -20], [0, 20]], { materialId: 'walnut' })] },
    ],
  )
}

async function enter(page: Page, levels: Array<{ motifId: string; path: Step[] }>): Promise<void> {
  await page.evaluate((ls) => {
    const s = window.__cbpd!.getState()
    for (const l of ls) s.enterContext(l)
  }, levels)
  await nextFrame(page)
}

async function editContext(page: Page): Promise<unknown> {
  return page.evaluate(() => window.__cbpd!.getState().editContext)
}

async function token(page: Page, name: string): Promise<string> {
  return page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name)
}

/** '#3d9bff' → 'rgb(61, 155, 255)', the form getComputedStyle reports. */
function rgbOf(hex: string): string {
  return `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`
}

const REPEAT_CELL = [{ motifId: 'm2', path: [{ repeatId: 'rp1', row: 0, column: 1 }] }]

test.describe('edit context', () => {
  test('the pill names the motif, counts a repeat’s occurrences, and Done pops one level', async ({ page }) => {
    await seed(page, seededProject())
    await enter(page, REPEAT_CELL)
    const pill = page.getByRole('navigation', { name: 'Edit context' })
    await expect(pill).toContainText('Editing m2')
    await expect(pill).toContainText('· 4 occurrences') // rp1 is 2 × 2
    await pill.getByRole('button', { name: 'Done' }).click()
    expect(await editContext(page)).toEqual([])
    await expect(pill).toHaveCount(0)
  })

  test('a motif placed once shows no occurrence count', async ({ page }) => {
    await seed(page, seededProject())
    await enter(page, [{ motifId: 'm1', path: [{ instanceId: 'i1' }] }])
    const pill = page.getByRole('navigation', { name: 'Edit context' })
    await expect(pill).toContainText('Editing m1')
    await expect(pill).not.toContainText('occurrences')
  })

  test('the canvas has a 2 px inset accent frame only inside a definition', async ({ page }) => {
    await seed(page, seededProject())
    const host = page.locator('main.canvas-host')
    await expect(host).not.toHaveClass(/\bin-context\b/)
    await enter(page, REPEAT_CELL)
    await expect(host).toHaveClass(/\bin-context\b/)
    const shadow = await host.evaluate((el) => getComputedStyle(el, '::after').boxShadow)
    expect(shadow).toContain(rgbOf(await token(page, '--acc')))
    expect(shadow).toContain('0px 0px 0px 2px inset')
  })

  test('the scrim is --paste at 62% and the entered cell has a dashed accent outline of its painted bounds', async ({ page }) => {
    await seed(page, seededProject())
    await enter(page, REPEAT_CELL)
    const scrim = await page.locator('.context-scrim-rect').evaluate((el) => ({ fill: getComputedStyle(el).fill, opacity: getComputedStyle(el).opacity }))
    expect(scrim).toEqual({ fill: rgbOf(await token(page, '--paste')), opacity: '0.62' })

    const outline = page.locator('.context-outline')
    await expect(outline).toHaveCount(1)
    // m2 is a 40 mm square at the cell origin; rp1 sits at (40, 250) with step 60, so cell (0, 1) spans x 100..140, y 250..290.
    const [x, y, w, h] = await outline.evaluate((el) => ['x', 'y', 'width', 'height'].map((a) => Number(el.getAttribute(a))))
    expectClose(x!, 100, 1e-9)
    expectClose(y!, 250, 1e-9)
    expectClose(w!, 40, 1e-9)
    expectClose(h!, 40, 1e-9)
    expect(await outline.evaluate((el) => getComputedStyle(el).stroke)).toBe(rgbOf(await token(page, '--acc')))
    expect(await outline.getAttribute('stroke-dasharray')).not.toBeNull()
  })

  test('the actions bar sits 8 px below the pill, centred with it', async ({ page }) => {
    await seed(page, seededProject())
    await enter(page, REPEAT_CELL)
    const pill = (await page.getByRole('navigation', { name: 'Edit context' }).boundingBox())!
    const bar = (await page.getByRole('toolbar', { name: 'Selection actions' }).boundingBox())!
    expectClose(bar.y - (pill.y + pill.height), 8, 1)
    expectClose(bar.x + bar.width / 2, pill.x + pill.width / 2, 1)
  })

  test('top-bar breadcrumb: an earlier level pops to it, the project name pops to the root, the menu stays reachable', async ({ page }) => {
    await seed(page, nestedProject())
    await enter(page, [{ motifId: 'm1', path: [{ instanceId: 'i1' }] }, { motifId: 'm2', path: [{ instanceId: 'i2' }] }])
    const crumbs = page.getByRole('navigation', { name: 'Breadcrumb' })
    await expect(crumbs).toContainText('Test')
    await expect(crumbs).toContainText('m1')
    await expect(crumbs).toContainText('m2')
    await expect(crumbs.getByRole('button', { name: 'm2', exact: true })).toHaveCount(0) // the last level is plain text

    await crumbs.getByRole('button', { name: 'm1', exact: true }).click()
    expect(await editContext(page)).toEqual([{ motifId: 'm1', path: [{ instanceId: 'i1' }] }])

    await page.getByRole('button', { name: 'Project menu', exact: true }).click()
    await expect(page.getByRole('menuitem', { name: /^New project/ })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('menuitem', { name: /^New project/ })).toHaveCount(0)

    await enter(page, [{ motifId: 'm2', path: [{ instanceId: 'i2' }] }])
    await crumbs.getByRole('button', { name: 'Test', exact: true }).click()
    expect(await editContext(page)).toEqual([])
    await expect(crumbs).toHaveCount(0)
    await expect(page.locator('main.canvas-host')).not.toHaveClass(/\bin-context\b/)
  })

  test('a long motif name truncates in the pill and never scrolls the page sideways', async ({ page }) => {
    const p = nestedProject()
    const long = 'Herringbone with a walnut border and maple accents, version seven, final final (really)'
    p.motifs.m2 = { ...p.motifs.m2!, name: long }
    await seed(page, p)
    await enter(page, [{ motifId: 'm1', path: [{ instanceId: 'i1' }] }, { motifId: 'm2', path: [{ instanceId: 'i2' }] }])
    const pill = page.getByRole('navigation', { name: 'Edit context' })
    await expect(pill.locator('.edit-pill-name')).toHaveAttribute('title', `Editing ${long}`)
    const host = (await page.locator('main.canvas-host').boundingBox())!
    const box = (await pill.boundingBox())!
    expect(box.width).toBeLessThanOrEqual(host.width - 24)
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0)
  })
})
```

- [ ] **Step 2: Run it and watch it fail.**

  `pnpm exec playwright test e2e/edit-context.spec.ts --project=chromium`

  Expected: 7 failed.
  - The pill tests time out on `toContainText('Editing m2')`, because V1's nav says "Board / Motif: m2".
  - The frame test fails `toHaveClass(/\bin-context\b/)`.
  - The scrim test fails on opacity `'0.6'`, or on `.context-outline` count 0.
  - The breadcrumb test finds no `Breadcrumb` navigation.

- [ ] **Step 3: Create `src/ui/EditPill.tsx`.**

```tsx
// Shell spec §9.7: the edit-context pill, replacing V1's Breadcrumb (SPEC
// §7.6). "Editing <motif>", the definition's occurrence count across the
// whole board (omitted when it is placed once), and Done, which pops one
// level after clearing the selection, like Esc with nothing in progress.
// The count reads the shown scene, so a live Rows/Columns preview updates it.

import type { JSX } from 'react'
import { occurrencePaths } from '@/geometry/scene'
import { useScene } from '@/editor/scene'
import { useEditor } from '@/editor/store'
import { Hint } from './Hint.tsx'
import { MotifIcon } from './icons.tsx'

export function EditPill(): JSX.Element | null {
  const editContext = useEditor((s) => s.editContext)
  const shown = useEditor((s) => s.preview?.next ?? s.project)
  const scene = useScene()
  const level = editContext[editContext.length - 1]
  if (level === undefined) return null

  const name = shown.motifs[level.motifId]!.name
  const count = occurrencePaths(shown, scene, level.motifId).length
  const done = (): void => {
    const s = useEditor.getState()
    s.select([])
    s.popContext()
  }

  return (
    <nav className="edit-pill" aria-label="Edit context">
      <span className="edit-pill-icon" aria-hidden="true">
        <MotifIcon size={16} />
      </span>
      <span className="edit-pill-name" title={`Editing ${name}`}>
        Editing {name}
      </span>
      {count > 1 && <span className="edit-pill-count">· {count} occurrences</span>}
      <Hint label="Done" keys={['Escape']} side="bottom">
        <button type="button" className="edit-pill-done" onClick={done}>
          Done
        </button>
      </Hint>
    </nav>
  )
}
```

- [ ] **Step 4: Put the pill and the top bars in one stack in `src/ui/App.tsx`, and frame the canvas.** First check the assumption:

  `grep -n "Breadcrumb\|ActionsBar\|DrawingBar\|canvas-host" src/ui/App.tsx`

  Expected: one `<main className="canvas-host">`, with `<Breadcrumb />`, `<ActionsBar />` and `<DrawingBar />` among its children.

  - Replace `import { Breadcrumb } from './Breadcrumb.tsx'` with `import { EditPill } from './EditPill.tsx'`.
  - In `App()`, add next to the other `useEditor` reads:

    ```tsx
    const inContext = useEditor((s) => s.editContext.length > 0)
    ```

  - Change the canvas panel's `main`. Remove `<Breadcrumb />`, `<ActionsBar />` and `<DrawingBar />` from wherever they sit among its children, and insert the stack directly after `<Canvas />`. Every other child that Tasks 3–7 placed there keeps its position and order: `CanvasControls`, `EmptyBoardHint`, the undocked `ToolBar` and `CrossingHover`.

```tsx
<main className={inContext ? 'canvas-host in-context' : 'canvas-host'}>
  <Canvas />
  <div className="canvas-top-stack">
    <EditPill />
    <ActionsBar />
    <DrawingBar />
  </div>
  {/* …the remaining children, unchanged… */}
</main>
```

- [ ] **Step 5: Delete `src/ui/Breadcrumb.tsx`.** Run `git rm src/ui/Breadcrumb.tsx`, then `grep -rn "Breadcrumb" src`. Expected: no output.

- [ ] **Step 6: Add the scrim colour and the entered-occurrence outline.** Replace `src/render/overlays/ContextScrim.tsx` with:

```tsx
// SPEC §7.6 rendering while a definition is entered (shell spec §9.7). The
// full scene is drawn normally underneath. ContextScrim draws a scrim in
// --paste at 62% over the whole view (`.context-scrim-rect`, index.css), then
// the entered occurrence's elements again above it, with the patches between
// two of them (a patch whose over occurrence is outside stays under the
// scrim, consistent at the boundary). Per-element opacity is never used: it
// would double-paint patches. ContextOutline draws the entered occurrence's
// painted bounds (SPEC §4.5) as a dashed --acc rectangle above the board mat,
// its stroke in screen px converted through zoom, like the selection outline.

import type { JSX } from 'react'
import { stepKey } from '@/domain/keys'
import type { Material, Step } from '@/domain/model'
import { paintedBounds, unionBoxes } from '@/geometry/bounds'
import type { Occurrence } from '@/geometry/expand'
import type { Scene } from '@/geometry/scene'
import { SceneSvg } from '../SceneSvg.tsx'

/** Whether an occurrence lies inside the entered occurrence whose world path is `prefix`. */
function insideOf(prefix: Step[]): (o: Occurrence) => boolean {
  const keys = prefix.map(stepKey)
  return (o) => o.path.length >= keys.length && keys.every((k, i) => stepKey(o.path[i]!) === k)
}

interface Props {
  scene: Scene
  materials: Material[]
  /** World path of the entered occurrence (every level's path, in order). */
  prefix: Step[]
  view: { x: number; y: number; w: number; h: number }
}

export function ContextScrim({ scene, materials, prefix, view }: Props): JSX.Element {
  return (
    <g className="context-scrim" pointerEvents="none">
      <rect className="context-scrim-rect" x={view.x - view.w} y={view.y - view.h} width={3 * view.w} height={3 * view.h} />
      <SceneSvg scene={scene} materials={materials} clipPrefix="cbpd-clip-ctx" include={insideOf(prefix)} />
    </g>
  )
}

/** The entered occurrence's painted bounds; nothing while its definition is empty (every child deleted). */
export function ContextOutline({ scene, prefix, zoom }: { scene: Scene; prefix: Step[]; zoom: number }): JSX.Element | null {
  const inside = insideOf(prefix)
  const box = unionBoxes(scene.elements.flatMap((el) => (el.kind !== 'patch' && inside(el.occurrence) ? [paintedBounds(el.occurrence)] : [])))
  if (box === null) return null
  const px = 1 / zoom
  return (
    <rect
      className="context-outline"
      pointerEvents="none"
      x={box.minX}
      y={box.minY}
      width={box.maxX - box.minX}
      height={box.maxY - box.minY}
      strokeWidth={1.5 * px}
      strokeDasharray={`${6 * px} ${4 * px}`}
    />
  )
}
```

- [ ] **Step 7: Draw the outline above the board mat in `src/render/Canvas.tsx`.**
  - Line ~65, before:

    ```tsx
    import { ContextScrim } from './overlays/ContextScrim.tsx'
    ```

    After:

    ```tsx
    import { ContextOutline, ContextScrim } from './overlays/ContextScrim.tsx'
    ```

  - Lines ~412–413, before:

    ```tsx
            {editContext.length > 0 && <ContextScrim scene={scene} materials={shown.materials} prefix={contextPrefix(editContext)} view={{ x: vx, y: vy, w: vw, h: vh }} />}
            <path className="board-mat" d={matD} fillRule="evenodd" pointerEvents="none" />
    ```

    After:

    ```tsx
            {editContext.length > 0 && <ContextScrim scene={scene} materials={shown.materials} prefix={contextPrefix(editContext)} view={{ x: vx, y: vy, w: vw, h: vh }} />}
            <path className="board-mat" d={matD} fillRule="evenodd" pointerEvents="none" />
            {editContext.length > 0 && <ContextOutline scene={scene} prefix={contextPrefix(editContext)} zoom={camera.zoom} />}
    ```

- [ ] **Step 8: Build the top-bar breadcrumb in `src/ui/ProjectMenu.tsx`.** First check the assumption:

  `grep -n "DropdownMenu.Trigger" -A6 src/ui/ProjectMenu.tsx`

  Expected: exactly one trigger, whose child button shows the project name and a `ChevronDown`.

  - Add these imports, merging with any that already exist:

    ```tsx
    import { Fragment } from 'react'
    import { ChevronDown, ChevronRight } from 'lucide-react'
    import { Hint } from './Hint.tsx'
    ```

  - In the component body, next to its other `useEditor` reads, add:

    ```tsx
    const editContext = useEditor((s) => s.editContext)
    const motifs = useEditor((s) => s.project.motifs)
    const name = useEditor((s) => s.project.name)
    ```

    If Task 3 already reads `name`, keep one.
  - Wrap Task 3's trigger element, the whole `<DropdownMenu.Trigger asChild>…</DropdownMenu.Trigger>`, below referred to as TRIGGER, so it renders only at the root. The Rename branch that Task 3 put in front of it stays in front. Before:

    ```tsx
    TRIGGER
    ```

    After:

```tsx
{editContext.length === 0 ? (
  TRIGGER
) : (
  <nav className="crumbs" aria-label="Breadcrumb">
    <button type="button" className="crumb" title={name} onClick={() => useEditor.getState().setEditContext([])}>
      {name}
    </button>
    <Hint label="Project menu" side="bottom">
      <DropdownMenu.Trigger asChild>
        <button type="button" className="crumb-menu" aria-label="Project menu">
          <ChevronDown size={14} strokeWidth={1.6} aria-hidden="true" />
        </button>
      </DropdownMenu.Trigger>
    </Hint>
    {editContext.map((level, k) => {
      const motifName = motifs[level.motifId]!.name
      return (
        <Fragment key={k}>
          <ChevronRight className="crumb-sep" size={14} strokeWidth={1.6} aria-hidden="true" />
          {k < editContext.length - 1 ? (
            <button type="button" className="crumb" title={motifName} onClick={() => useEditor.getState().setEditContext(editContext.slice(0, k + 1))}>
              {motifName}
            </button>
          ) : (
            <span className="crumb crumb-current" title={motifName} aria-current="location">
              {motifName}
            </span>
          )}
        </Fragment>
      )
    })}
  </nav>
)}
```

  TRIGGER is the literal JSX Task 3 wrote, moved unchanged into the first branch. Do not retype it.

- [ ] **Step 9: CSS.** In `src/index.css`:
  - Replace the `.context-scrim-rect` rule with:

    ```css
    .context-scrim-rect {
      fill: var(--paste);
      opacity: 0.62;
    }
    ```

  - Delete the `.breadcrumb` and `.breadcrumb button` rules, if Task 1 kept them.
  - In the `.floating-top` rule (Tasks 4 and 6), delete the `position`, `top`, `left`, `right` and `transform` declarations; the stack places the bars now.

  Check with `grep -n "floating-top" -A10 src/index.css | grep -E "position|top:|left:|transform"`. Expected: no output.

  Then append:

```css
/* Shell spec §9.7 edit context: the canvas frame, the top-of-canvas stack
   (pill, then the actions or drawing bar 8 px below), the pill, the
   entered occurrence's outline; §8 the top-bar breadcrumb. */
.canvas-host.in-context::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 2;
  box-shadow: inset 0 0 0 2px var(--acc);
  pointer-events: none;
}

.canvas-top-stack {
  position: absolute;
  top: 12px;
  left: 12px;
  right: 12px;
  z-index: 3;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  pointer-events: none;
}

.canvas-top-stack > * {
  max-width: 100%;
  pointer-events: auto;
}

.edit-pill {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 4px 4px 4px 12px;
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 999px;
  box-shadow: var(--shadow);
  color: var(--text);
  font-size: 13px;
}

.edit-pill-icon {
  display: inline-flex;
  color: var(--acc);
}

.edit-pill-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
}

.edit-pill-count {
  flex: none;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}

.edit-pill-done {
  flex: none;
  min-height: 28px;
  padding: 0 14px;
  border: 0;
  border-radius: 999px;
  background: var(--acc);
  color: var(--acc-ink);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

.context-outline {
  fill: none;
  stroke: var(--acc);
}

.crumbs {
  display: flex;
  align-items: center;
  gap: 2px;
  min-width: 0;
}

.crumb {
  min-width: 0;
  max-width: 18ch;
  padding: 4px 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--muted);
  font: inherit;
  font-size: 13px;
}

button.crumb {
  cursor: pointer;
}

button.crumb:hover {
  background: var(--raised);
  color: var(--text);
}

.crumb-current {
  color: var(--text);
  font-weight: 500;
}

.crumb-sep {
  flex: none;
  color: var(--muted);
}

.crumb-menu {
  display: inline-grid;
  place-items: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--muted);
}

.crumb-menu:hover {
  background: var(--raised);
  color: var(--text);
}

@media (pointer: coarse) {
  .edit-pill-done,
  button.crumb {
    min-height: 44px;
  }

  .crumb-menu {
    width: 44px;
    height: 44px;
  }
}
```

- [ ] **Step 10: Run the new spec.**

  `pnpm exec playwright test e2e/edit-context.spec.ts`

  Expected: 7 passed per project (28 in total). chromium-touch runs them too, because none use mouse-only input.

- [ ] **Step 11: Fix the V1 breadcrumb text in `e2e/motifs.spec.ts`.**
  - Line 98, before:

    ```ts
        // Double-click cell (1, 1) → breadcrumb, scrim, and that cell drawn again above it.
    ```

    After:

    ```ts
        // Double-click cell (1, 1) → edit pill, scrim, and that cell drawn again above it.
    ```

  - Line 104, before:

    ```ts
        await expect(page.getByRole('navigation', { name: 'Edit context' })).toContainText(`Board / Motif: ${motifName}`)
    ```

    After:

    ```ts
        await expect(page.getByRole('navigation', { name: 'Edit context' })).toContainText(`Editing ${motifName}`)
    ```

  - Line 177, before:

    ```ts
        await expect(page.getByRole('navigation', { name: 'Edit context' })).toContainText('Board / Motif: m2')
    ```

    After:

    ```ts
        await expect(page.getByRole('navigation', { name: 'Edit context' })).toContainText('Editing m2')
    ```

  Line 124 (`toHaveCount(0)`) and `e2e/author/actions.ts:235` (`Edit context` → `Done`) stay as they are.

- [ ] **Step 12: Run the affected existing specs.**

  `pnpm typecheck && pnpm test && pnpm exec playwright test e2e/motifs.spec.ts e2e/materials.spec.ts e2e/author`

  Expected: all pass. The author specs press Done through `Author.done()`.

- [ ] **Step 13: Commit.**

```bash
git add src/ui/EditPill.tsx src/ui/App.tsx src/ui/ProjectMenu.tsx src/render/overlays/ContextScrim.tsx src/render/Canvas.tsx src/index.css e2e/edit-context.spec.ts e2e/motifs.spec.ts
git add -u src/ui/Breadcrumb.tsx
FSH_NO_TTY=1 git commit -m "Show edit context as pill, frame and breadcrumb" -m "Shell spec 9.7 and 8: V1's corner breadcrumb was easy to miss and gave no way back more than one level. The pill counts the occurrences an edit affects, the frame marks the mode, and the top-bar crumbs pop straight to any level."
```

---

### Task 9: Inspector restyle (§13)

**Files:**
- Create:
  - `src/ui/Inspector/Section.tsx`
  - `src/ui/Inspector/Switch.tsx`
- Modify (whole-file replacements unless noted):
  - `src/ui/Inspector/Inspector.tsx`
  - `src/ui/Inspector/NumberField.tsx`
  - `src/ui/Inspector/BoardPanel.tsx`
  - `src/ui/Inspector/SelectionPanel.tsx`
  - `src/ui/Inspector/BandPanel.tsx`
  - `src/ui/Inspector/PointRow.tsx`
  - `src/ui/Inspector/CrossingList.tsx`
  - `src/ui/Inspector/RegionPanel.tsx`
  - `src/ui/Inspector/InstancePanel.tsx`
  - `src/ui/Inspector/RepeatPanel.tsx`
  - `src/index.css`: delete the V1 inspector rules and append a section.
  - `e2e/author/actions.ts`: `check`, `setBackground` and `enterMotif`.
  - `e2e/a11y.spec.ts`: line 89.
  - `e2e/motifs.spec.ts`: line 148.
  - `e2e/inspector.spec.ts`: new describe block.
- Test:
  - `e2e/inspector.spec.ts`
  - `e2e/a11y.spec.ts`
  - `e2e/crossings.spec.ts`
  - `e2e/vertex-handles.spec.ts`
  - `e2e/materials.spec.ts`
  - `e2e/motifs.spec.ts`
  - `e2e/author/*.spec.ts`
  - `e2e/performance.spec.ts`: its `Width` label is unchanged, so the spec itself needs no edit.

**Interfaces:**
- Consumes:
  - `Hint` (Task 2)
  - `MotifIcon`, `RepeatIcon`, `CrossingIcon` (Task 3)
  - `CrossingsPanel(): JSX.Element` (Task 7)
  - `currentContext(s: EditorState): ContextId` (store, V1)
  - `@radix-ui/react-dropdown-menu`: `Root`, `Trigger`, `Portal`, `Content`, `Item`, `RadioGroup`, `RadioItem` (added in Task 3)
- Produces:
  - `export function Section({ title, collapsible, children }: { title: string; collapsible?: boolean; children: ReactNode }): JSX.Element`
  - `export function Switch({ label, checked, onChange }: { label: string; checked: boolean; onChange(checked: boolean): void }): JSX.Element`
  - `export function PointsTable(props: { project: Project; objectId: Id; points: readonly Point[]; wraps: boolean; unit: Unit }): JSX.Element`
  - `NumberField` gains `prefix?: ReactNode`.

Locators that change, with their replacements. The exact edits are in Steps 2 and 16.

| Old | New | Where |
| --- | --- | --- |
| `getByLabel('Closed')` checkbox | `getByRole('switch', { name: 'Closed' })` | new inspector test only; no existing spec used it |
| `Author.check(label)`: `getByLabel(label).check()` | `getByRole('switch', { name: label, exact: true })`, clicked when `aria-checked` differs | `e2e/author/actions.ts` (used by `interlace.spec.ts:137`, "Alternate mirror X") |
| `Author.setBackground`: `choose('Background material', m)` (a native select) | click `button` `/^Background material/`, then `menuitemradio` `m` | `e2e/author/actions.ts` (used by `interlace`, `isometric`, `chevron-diamond`) |
| Point rows' `Insert after` / `Delete` buttons | `Point N actions` button → `menuitem` `Insert after` / `Delete` | no existing spec clicked them |
| `heading 'Band'` (V1's panel h2) | `heading 'Band'` at `level: 2` (the header). The Band section's h3 is also named "Band". | `e2e/a11y.spec.ts:89` |
| `button 'Edit Motif'` (panel) | the panel button is now "Edit motif", the same text as the actions bar's. Locators are scoped to the `Selection actions` toolbar. | `e2e/author/actions.ts` `enterMotif`, `e2e/motifs.spec.ts:148` |
| `Display units` select | `group 'Display units'` → `button 'mm' \| 'in'` (`aria-pressed`) | no existing spec used it |

G6 action counts: no author spec asserts a count. They are printed by `Author.report()` and recorded in `docs/decisions/2026-09-24-gates.md` G6. `setBackground` becomes two actions (open the menu, pick an item), so D chevron-diamond, E isometric and F interlace each report one more action. `check` stays one action, because a switch click replaces a checkbox check. Task 10 re-records the G6 table.

- [ ] **Step 1: Write the failing e2e tests.** Append to `e2e/inspector.spec.ts`. Add `instance` and `region` to its `test-builders` import, and `nextFrame` to its helpers import.

```ts
test.describe('inspector sections (shell spec §13)', () => {
  test('the header shows the type, and notes the motif context or the object count', async ({ page }) => {
    await seed(page, seededProject())
    await page.evaluate(() => window.__cbpd!.getState().enterContext({ motifId: 'm1', path: [{ instanceId: 'i1' }] }))
    await select(page, ['mb1'])
    const header = page.locator('.inspector-header')
    await expect(header.getByRole('heading', { level: 2 })).toHaveText('Band')
    await expect(header).toContainText('in m1')

    await page.evaluate(() => window.__cbpd!.getState().popContext())
    await select(page, ['b1', 'r1'])
    await expect(header.getByRole('heading', { level: 2 })).toHaveText('Selection')
    await expect(header).toContainText('2 objects')
  })

  test('a compact prefix is shown while the full label stays the accessible name', async ({ page }) => {
    await seed(page, project([]))
    const board = page.getByRole('region', { name: 'Board' })
    await expect(board.getByLabel('Width', { exact: true })).toBeVisible()
    await expect(board.locator('.field-prefix').first()).toHaveText('W')
    await expect(board.locator('label', { hasText: /^Width$/ })).toHaveClass(/\bvisually-hidden\b/)
  })

  test('Closed is a switch: one click closes the band as one history entry', async ({ page }) => {
    await seed(page, project([band('b1', [[0, 0], [50, 0], [50, 50]])]))
    await select(page, ['b1'])
    const closed = page.getByRole('region', { name: 'Band' }).getByRole('switch', { name: 'Closed' })
    await expect(closed).toHaveAttribute('aria-checked', 'false')
    await closed.click()
    await expect(closed).toHaveAttribute('aria-checked', 'true')
    expect(bandOf(await getProject(page), 'b1').closed).toBe(true)
    expect(await history(page)).toEqual({ past: 1, future: 0 })
  })

  test('a point row’s menu inserts after the point and deletes it; Points collapses', async ({ page }) => {
    await seed(page, project([band('b1', [[0, 0], [50, 0], [50, 50]])]))
    await select(page, ['b1'])
    const panel = page.getByRole('region', { name: 'Band' })

    await panel.getByRole('button', { name: 'Point 1 actions' }).click()
    await page.getByRole('menuitem', { name: 'Insert after', exact: true }).click()
    let points = bandOf(await getProject(page), 'b1').points
    expect(points.map((p) => [p.x, p.y])).toEqual([[0, 0], [25, 0], [50, 0], [50, 50]])

    await panel.getByRole('button', { name: 'Point 2 actions' }).click()
    await page.getByRole('menuitem', { name: 'Delete', exact: true }).click()
    points = bandOf(await getProject(page), 'b1').points
    expect(points.map((p) => [p.x, p.y])).toEqual([[0, 0], [50, 0], [50, 50]])
    expect(await history(page)).toEqual({ past: 2, future: 0 })

    await panel.getByText('Points', { exact: true }).click()
    await expect(panel.getByLabel('Point 1 X', { exact: true })).toBeHidden()
    await panel.getByText('Points', { exact: true }).click()
    await expect(panel.getByLabel('Point 1 X', { exact: true })).toBeVisible()
  })

  test('Background is a menu of swatches; Display units is a segmented control', async ({ page }) => {
    await seed(page, project([]))
    const board = page.getByRole('region', { name: 'Board' })
    await board.getByRole('button', { name: /^Background material/ }).click()
    await page.getByRole('menuitemradio', { name: 'Walnut', exact: true }).click()
    expect((await getProject(page)).board.backgroundMaterialId).toBe('walnut')
    await expect(board.getByRole('button', { name: 'Background material: Walnut' })).toBeVisible()

    const units = board.getByRole('group', { name: 'Display units' })
    await expect(units.getByRole('button', { name: 'mm', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await units.getByRole('button', { name: 'in', exact: true }).click()
    expect((await getProject(page)).displayUnits).toBe('in')
    await units.getByRole('button', { name: 'in', exact: true }).click() // already on: no second entry
    expect(await history(page)).toEqual({ past: 2, future: 0 })
  })

  test('Instance Mirror X and Repeat alternation are switches', async ({ page }) => {
    await seed(page, seededProject())
    await select(page, ['i1'])
    await page.getByRole('region', { name: 'Instance' }).getByRole('switch', { name: 'Mirror X' }).click()
    expect((await getProject(page)).objects.i1).toMatchObject({ transform: { mirrorX: true } })
    await select(page, ['rp1'])
    await nextFrame(page)
    await page.getByRole('region', { name: 'Repeat' }).getByRole('switch', { name: 'Alternate mirror Y' }).click()
    expect((await getProject(page)).objects.rp1).toMatchObject({ alternateMirrorY: true })
  })
})
```

- [ ] **Step 2: Run the tests and watch them fail.**

  `pnpm exec playwright test e2e/inspector.spec.ts --project=chromium`

  Expected: the 5 existing tests pass and the 6 new ones fail:
  - no `.inspector-header`;
  - no `.field-prefix`;
  - no `switch` role;
  - no `Point 1 actions` button;
  - no `Background material` button.

- [ ] **Step 3: Create `src/ui/Inspector/Section.tsx`.**

```tsx
// Shell spec §13: one inspector section — a 12 px weight-600 title over its
// fields. Points, Segments, Crossings and Overrides collapse: a
// `<details open>` whose `<summary>` is the title. The collapsed state is
// the browser's and is not persisted.

import type { JSX, ReactNode } from 'react'

export function Section({ title, collapsible, children }: { title: string; collapsible?: boolean; children: ReactNode }): JSX.Element {
  if (collapsible === true) {
    return (
      <details className="section" open>
        <summary className="section-title">{title}</summary>
        {children}
      </details>
    )
  }
  return (
    <section className="section">
      <h3 className="section-title">{title}</h3>
      {children}
    </section>
  )
}
```

- [ ] **Step 4: Create `src/ui/Inspector/Switch.tsx`.**

```tsx
// Shell spec §13: an on/off inspector setting (Band Closed, Mirror X/Y, the
// Repeat alternation) as a `role="switch"` button. It commits on click, like
// the V1 checkbox it replaces. The visible label repeats the aria-label, so
// it is hidden from assistive tech.

import type { JSX } from 'react'

export function Switch({ label, checked, onChange }: { label: string; checked: boolean; onChange(checked: boolean): void }): JSX.Element {
  return (
    <div className="field field-switch">
      <span className="field-label" aria-hidden="true">
        {label}
      </span>
      <button type="button" role="switch" className="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}>
        <span className="switch-thumb" aria-hidden="true" />
      </button>
    </div>
  )
}
```

- [ ] **Step 5: Replace `src/ui/Inspector/NumberField.tsx`.** The behaviour is unchanged; only the markup changes.

```tsx
// SPEC §7.5/§8/§11: the one numeric inspector field. `<input type="text">`
// (never a native number input — smart quotes, fractions, and comma decimals
// all need to type through freely). Preview on every valid, in-policy
// keystroke; commit on Enter or blur only when the text changed from focus
// and is valid (no history entry, no rounding, for an unchanged Tab-through);
// Esc reverts the text and cancels the pending preview.
//
// Shell spec §13 look: a --raised box with the unit as a muted suffix and the
// error below in --danger. With `prefix`, a compact visible prefix (X, Y, W,
// H, a rotate icon) sits inside the box and the full `label` stays the
// accessible name through a visually hidden <label>. `prefix={null}` hides
// the label with no prefix, for table cells whose column header names the
// value.

import type { JSX, ReactNode } from 'react'
import { useEffect, useId, useRef, useState } from 'react'
import type { FieldPolicy, Unit } from '@/domain/units'
import { formatAngle, formatLength, parseAngle, parseLength } from '@/domain/units'
import { useEditor } from '@/editor/store'

/** `onPreview`'s return: `undefined` on success, or a refusal message (a command like `setPoints` can refuse a value the parser and policy both accept) to show as the field's inline error instead of previewing it. */
export type PreviewOutcome = string | undefined

interface NumberFieldProps {
  label: string
  value: number
  unit: Unit | 'deg' | null
  policy: FieldPolicy
  onPreview: (value: number) => PreviewOutcome
  onCommit: (value: number) => void
  prefix?: ReactNode
}

type Parsed = { ok: true; value: number } | { ok: false; error: string }

function parseText(text: string, unit: Unit | 'deg' | null): Parsed {
  if (unit === 'in' || unit === 'mm') {
    const r = parseLength(text, unit)
    return r.ok ? { ok: true, value: r.mm } : r
  }
  const r = parseAngle(text)
  return r.ok ? { ok: true, value: r.deg } : r
}

/** Unitless values (scale, rows/columns) show up to 4 decimals. */
function formatValue(value: number, unit: Unit | 'deg' | null): string {
  if (unit === null) return String(Number(value.toFixed(4)))
  return unit === 'in' || unit === 'mm' ? formatLength(value, unit) : formatAngle(value)
}

function satisfiesPolicy(value: number, policy: FieldPolicy): boolean {
  if (!Number.isFinite(value)) return false
  if (policy === 'positive') return value > 0
  if (policy === 'integer1to50') return Number.isInteger(value) && value >= 1 && value <= 50
  return true
}

export function NumberField({ label, value, unit, policy, onPreview, onCommit, prefix }: NumberFieldProps): JSX.Element {
  const id = useId()
  const errorId = `${id}-error`
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(() => formatValue(value, unit))
  const [error, setError] = useState<string | null>(null)
  const focusTextRef = useRef(text)

  // Re-derive the displayed text from the committed value whenever it isn't
  // being edited — including right after a blur/Enter commit or an Esc
  // revert, so a field with no backing store value (Rotate by) resets too.
  useEffect(() => {
    if (!editing) setText(formatValue(value, unit))
  }, [value, unit, editing])

  const revert = (): void => {
    setText(focusTextRef.current)
    const parsed = parseText(focusTextRef.current, unit)
    // Re-preview the value at focus: for a field with no backing store value
    // (Rotate by, or grid spacing which applies live with no preview/commit
    // split) this is what actually undoes the live effect; for a
    // project-backed field it recomputes a no-op preview that the
    // cancelPreview() below discards anyway.
    const outcome = parsed.ok ? onPreview(parsed.value) : undefined
    setError(outcome ?? null)
    useEditor.getState().cancelPreview() // discard a pending project-backed preview, if any
  }

  return (
    <div className="field">
      <label htmlFor={id} className={prefix === undefined ? 'field-label' : 'visually-hidden'}>
        {label}
      </label>
      <div className="field-box">
        {prefix !== undefined && prefix !== null && (
          <span className="field-prefix" aria-hidden="true">
            {prefix}
          </span>
        )}
        <input
          id={id}
          type="text"
          inputMode="text"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="done"
          aria-invalid={error !== null}
          aria-describedby={error !== null ? errorId : undefined}
          value={text}
          onFocus={() => {
            focusTextRef.current = text
            setEditing(true)
          }}
          onChange={(e) => {
            const next = e.target.value
            setText(next)
            const parsed = parseText(next, unit)
            if (!parsed.ok) {
              setError(parsed.error)
              return
            }
            if (!satisfiesPolicy(parsed.value, policy)) {
              setError('Out of range')
              return
            }
            setError(onPreview(parsed.value) ?? null)
          }}
          onBlur={() => {
            setEditing(false)
            if (text === focusTextRef.current) {
              // Nothing to commit, but a keystroke earlier in this focus session
              // (typed away and back to the original text) may have left a live
              // preview pending — e.g. retype "1/2" then back to "1/4". Left
              // alone, the NEXT command's settlePreview() would commit that
              // stale preview as its own spurious history entry.
              useEditor.getState().cancelPreview()
              return
            }
            if (error !== null) {
              revert()
              return
            }
            const parsed = parseText(text, unit)
            if (parsed.ok) onCommit(parsed.value)
            else revert() // defensive: `error` should already reflect this, but never commit unparsed text
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.currentTarget.blur()
            } else if (e.key === 'Escape') {
              e.stopPropagation()
              revert()
            }
          }}
        />
        {unit !== null && (
          <span className="field-unit" aria-hidden="true">
            {unit === 'deg' ? '°' : unit}
          </span>
        )}
      </div>
      {error !== null && (
        <span id={errorId} className="field-error">
          {error}
        </span>
      )}
    </div>
  )
}
```

- [ ] **Step 6: Replace `src/ui/Inspector/Inspector.tsx`.** Check the routing assumption first:

  `grep -n "CrossingsPanel\|MaterialPalette\|tool" src/ui/Inspector/Inspector.tsx`

  Expected: `CrossingsPanel` is routed for the Crossing tool with an empty selection, and there is no `MaterialPalette`.

```tsx
// SPEC §7.5: the right-hand inspector, routed by selection. Nothing selected
// → Board (or, with the Crossing tool, the Crossings panel, shell spec
// §9.6). Any non-empty selection → the Selection panel, plus the
// type-specific panel when exactly one Band, Region, Instance, or Repeat is
// selected. Shell spec §13 header: a swatch (Band, Region, Board background)
// or a type icon, the type name, and a muted note — "in <motif>" inside an
// edit context, "N objects" for a multi-selection. The panel <section>s keep
// their V1 region names (Selection, Band, Region, Instance, Repeat, Board),
// which the e2e helpers scope by.

import type { JSX, ReactNode } from 'react'
import { Layers } from 'lucide-react'
import type { Id } from '@/domain/model'
import { currentContext, useEditor } from '@/editor/store'
import { MotifIcon, RepeatIcon } from '../icons.tsx'
import { BandPanel } from './BandPanel.tsx'
import { BoardPanel } from './BoardPanel.tsx'
import { CrossingsPanel } from './CrossingsPanel.tsx'
import { InstancePanel } from './InstancePanel.tsx'
import { RegionPanel } from './RegionPanel.tsx'
import { RepeatPanel } from './RepeatPanel.tsx'
import { SelectionPanel } from './SelectionPanel.tsx'

export function Inspector(): JSX.Element {
  const project = useEditor((s) => s.project)
  const selection = useEditor((s) => s.selection)
  const tool = useEditor((s) => s.tool)
  const contextId = useEditor(currentContext)

  if (selection.length === 0 && tool === 'crossing') {
    return (
      <aside className="inspector">
        <CrossingsPanel />
      </aside>
    )
  }

  const single = selection.length === 1 ? project.objects[selection[0]!] : undefined
  const swatch = (materialId: Id | null): ReactNode => {
    const color = project.materials.find((m) => m.id === materialId)?.color
    return color === undefined ? <span className="inspector-swatch inspector-swatch-none" /> : <span className="inspector-swatch" style={{ background: color }} />
  }

  let mark: ReactNode
  let title: string
  if (selection.length === 0) {
    mark = swatch(project.board.backgroundMaterialId)
    title = 'Board'
  } else if (single?.type === 'band' || single?.type === 'region') {
    mark = swatch(single.materialId)
    title = single.type === 'band' ? 'Band' : 'Region'
  } else if (single?.type === 'motif-instance') {
    mark = <MotifIcon size={16} />
    title = 'Instance'
  } else if (single?.type === 'repeat') {
    mark = <RepeatIcon size={16} />
    title = 'Repeat'
  } else {
    mark = <Layers size={16} strokeWidth={1.6} />
    title = 'Selection'
  }
  const notes: string[] = []
  if (selection.length > 1) notes.push(`${selection.length} objects`)
  if (contextId !== null) notes.push(`in ${project.motifs[contextId]!.name}`)
  const note = notes.join(' · ')

  return (
    <aside className="inspector">
      <header className="inspector-header">
        <span className="inspector-mark" aria-hidden="true">
          {mark}
        </span>
        <h2 className="inspector-title">{title}</h2>
        {note !== '' && (
          <span className="inspector-note" title={note}>
            {note}
          </span>
        )}
      </header>
      {selection.length === 0 ? (
        <BoardPanel />
      ) : (
        <>
          <SelectionPanel />
          {single?.type === 'band' && <BandPanel key={single.id} band={single} />}
          {single?.type === 'region' && <RegionPanel region={single} />}
          {single?.type === 'motif-instance' && <InstancePanel key={single.id} instance={single} />}
          {single?.type === 'repeat' && <RepeatPanel key={single.id} field={single} />}
        </>
      )}
    </aside>
  )
}
```

- [ ] **Step 7: Replace `src/ui/Inspector/BoardPanel.tsx`.** The Name field left with Task 3's Rename; if `grep -n NameField src/ui/Inspector/BoardPanel.tsx` still prints a line, this replacement removes it.

```tsx
// SPEC §7.5 Board panel, shell spec §13: Size (W, H), Background (a menu of
// the materials, each with its swatch), Units & grid (a mm/in segmented
// control, grid spacing). The name is edited by the top bar's Rename (§10.1).

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
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button type="button" className="menu-select" aria-label={`Background material: ${background?.name ?? 'None'}`}>
              {background === undefined ? <span className="inspector-swatch inspector-swatch-none" /> : <span className="inspector-swatch" style={{ background: background.color }} />}
              <span className="menu-select-name">{background?.name ?? 'None'}</span>
              <ChevronDown size={14} strokeWidth={1.6} aria-hidden="true" />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content className="inspector-menu" align="start" sideOffset={4}>
              <DropdownMenu.RadioGroup
                value={project.board.backgroundMaterialId ?? NONE}
                onValueChange={(v) => useEditor.getState().run((p) => setBoardBackground(p, v === NONE ? null : v))}
              >
                <DropdownMenu.RadioItem className="inspector-menu-item" value={NONE}>
                  <span className="inspector-swatch inspector-swatch-none" />
                  None
                </DropdownMenu.RadioItem>
                {project.materials.map((m) => (
                  <DropdownMenu.RadioItem key={m.id} className="inspector-menu-item" value={m.id}>
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
                className="segment"
                aria-pressed={unit === u}
                onClick={() => {
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
```

  The `u !== unit` guard is required. `setDisplayUnits` always returns a new project, so a second click on the pressed segment would otherwise push a history entry that changes nothing.

- [ ] **Step 8: Replace `src/ui/Inspector/SelectionPanel.tsx`.** First confirm Task 4 removed its buttons with `grep -n "<button" src/ui/Inspector/SelectionPanel.tsx`. Expected: no output.

```tsx
// SPEC §7.5 Selection panel, shell spec §13: bounds X/Y translate the
// selection; Rotate by rotates about the bounds centre and resets to 0. Its
// V1 buttons live in the actions bar (§9.4). Bounds, X/Y and the pivot are in
// the current context's space, like the commands they drive.

import type { JSX } from 'react'
import { RotateCw } from 'lucide-react'
import { rotateObjects, translateObjects } from '@/domain/commands'
import { useEditor } from '@/editor/store'
import { selectionBounds } from '@/editor/tools/select'
import type { PreviewOutcome } from './NumberField.tsx'
import { NumberField } from './NumberField.tsx'
import { Section } from './Section.tsx'

export function SelectionPanel(): JSX.Element | null {
  const project = useEditor((s) => s.project)
  const selection = useEditor((s) => s.selection)
  const editContext = useEditor((s) => s.editContext)
  const commit = (): void => useEditor.getState().commit()

  const bounds = selectionBounds(project, editContext, selection)
  if (bounds === null) return null

  const centre = { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 }

  const previewTranslate = (x: number, y: number): PreviewOutcome => {
    useEditor.getState().setPreview(translateObjects(project, selection, x - bounds.minX, y - bounds.minY), 'commit')
    return undefined
  }

  return (
    <section className="panel" aria-label="Selection">
      <Section title="Position">
        <div className="field-grid">
          <NumberField label="X" prefix="X" value={bounds.minX} unit={project.displayUnits} policy="any" onPreview={(v) => previewTranslate(v, bounds.minY)} onCommit={commit} />
          <NumberField label="Y" prefix="Y" value={bounds.minY} unit={project.displayUnits} policy="any" onPreview={(v) => previewTranslate(bounds.minX, v)} onCommit={commit} />
        </div>
        <NumberField
          label="Rotate by"
          prefix={<RotateCw size={12} strokeWidth={1.6} />}
          value={0}
          unit="deg"
          policy="any"
          onPreview={(deg) => {
            useEditor.getState().setPreview(rotateObjects(project, selection, deg, centre), 'commit')
            return undefined
          }}
          onCommit={commit}
        />
      </Section>
    </section>
  )
}
```

- [ ] **Step 9: Replace `src/ui/Inspector/PointRow.tsx`.** It becomes the points table shared by Band and Region.

```tsx
// SPEC §7.5, shell spec §13: a Band's or Region's points as a table (#, X, Y)
// whose rows each have a More menu with Insert after and Delete. The field
// labels ("Point N X/Y") stay the accessible names; the column headers are
// the visible labels.

import type { JSX } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Ellipsis } from 'lucide-react'
import { deletePoint, insertPoint } from '@/domain/commands'
import type { Id, Point, Project } from '@/domain/model'
import type { Unit } from '@/domain/units'
import { useEditor } from '@/editor/store'
import { Hint } from '../Hint.tsx'
import { NumberField } from './NumberField.tsx'
import { insertAfterXY, previewSetPoint } from './shared.ts'

interface Props {
  project: Project
  objectId: Id
  points: readonly Point[]
  wraps: boolean
  unit: Unit
}

export function PointsTable({ project, objectId, points, wraps, unit }: Props): JSX.Element {
  const commit = (): void => useEditor.getState().commit()
  const run = useEditor.getState().run
  return (
    <table className="data-table">
      <thead>
        <tr>
          <th scope="col" className="col-index">
            #
          </th>
          <th scope="col">X</th>
          <th scope="col">Y</th>
          <th scope="col" className="col-menu">
            <span className="visually-hidden">Actions</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {points.map((pt, index) => {
          const label = `Point ${index + 1}`
          return (
            <tr key={pt.id}>
              <td className="col-index">{index + 1}</td>
              <td>
                <NumberField label={`${label} X`} prefix={null} value={pt.x} unit={unit} policy="any" onPreview={(v) => previewSetPoint(project, objectId, pt.id, { x: v, y: pt.y })} onCommit={commit} />
              </td>
              <td>
                <NumberField label={`${label} Y`} prefix={null} value={pt.y} unit={unit} policy="any" onPreview={(v) => previewSetPoint(project, objectId, pt.id, { x: pt.x, y: v })} onCommit={commit} />
              </td>
              <td className="col-menu">
                <DropdownMenu.Root>
                  <Hint label="More" side="left">
                    <DropdownMenu.Trigger asChild>
                      <button type="button" className="row-menu-trigger" aria-label={`${label} actions`}>
                        <Ellipsis size={16} strokeWidth={1.6} aria-hidden="true" />
                      </button>
                    </DropdownMenu.Trigger>
                  </Hint>
                  <DropdownMenu.Portal>
                    <DropdownMenu.Content className="inspector-menu" align="end" sideOffset={4}>
                      <DropdownMenu.Item className="inspector-menu-item" onSelect={() => run((p) => insertPoint(p, objectId, pt.id, insertAfterXY(points, wraps, index)))}>
                        Insert after
                      </DropdownMenu.Item>
                      <DropdownMenu.Item className="inspector-menu-item" onSelect={() => run((p) => deletePoint(p, objectId, pt.id))}>
                        Delete
                      </DropdownMenu.Item>
                    </DropdownMenu.Content>
                  </DropdownMenu.Portal>
                </DropdownMenu.Root>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
```

- [ ] **Step 10: Replace `src/ui/Inspector/BandPanel.tsx`.** The helpers stay byte-identical to V1: `segmentCount`, `endpointIndex`, `pointsAfter`, `length`, `angleDeg` and `movedPoints`. Keep lines 1–60 of the current file as they are, except that the header comment and the imports change to:

```tsx
// SPEC §7.5 Band panel, shell spec §13: Band (material, width, Closed as a
// switch); Offset copy (width, Left, Right); Points and Segments tables
// (editing a segment moves its end point and translates the points after
// it); the crossings list with unresolved records (CrossingList.tsx).

import type { JSX } from 'react'
import { useState } from 'react'
import { offsetCopyBand, setBandClosed, setBandWidth, setMaterial } from '@/domain/commands'
import type { Band } from '@/domain/model'
import { useEditor } from '@/editor/store'
import { CrossingList } from './CrossingList.tsx'
import { NumberField } from './NumberField.tsx'
import { PointsTable } from './PointRow.tsx'
import { Section } from './Section.tsx'
import { previewSetPoints } from './shared.ts'
import { Switch } from './Switch.tsx'
```

  Replace `export function BandPanel` with:

```tsx
export function BandPanel({ band }: Props): JSX.Element {
  const project = useEditor((s) => s.project)
  const unit = project.displayUnits
  const commit = (): void => useEditor.getState().commit()

  // SPEC §7.4 Offset copy (Band only): a width field defaulting to this
  // band's own width. Inspector.tsx keys this panel on the selected object's
  // id, so React remounts it (re-running this initializer) on every band
  // change instead of a `band.widthMm` edit clobbering a width already typed
  // here.
  const [offsetWidth, setOffsetWidth] = useState(band.widthMm)

  const n = band.points.length

  return (
    <section className="panel" aria-label="Band">
      <Section title="Band">
        <div className="field">
          <label htmlFor="band-material" className="field-label">
            Material
          </label>
          <select id="band-material" value={band.materialId} onChange={(e) => useEditor.getState().run((p) => setMaterial(p, [band.id], e.target.value))}>
            {project.materials.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
        <NumberField
          label="Width"
          value={band.widthMm}
          unit={unit}
          policy="positive"
          onPreview={(v) => {
            useEditor.getState().setPreview(setBandWidth(project, band.id, v), 'commit')
            return undefined
          }}
          onCommit={(v) => {
            commit()
            useEditor.setState({ lastBandWidthMm: v })
          }}
        />
        <Switch label="Closed" checked={band.closed} onChange={(closed) => useEditor.getState().run((p) => setBandClosed(p, band.id, closed))} />
      </Section>

      <Section title="Offset copy">
        <div className="field-with-button">
          <NumberField label="Offset copy width" prefix="W" value={offsetWidth} unit={unit} policy="positive" onPreview={() => undefined} onCommit={setOffsetWidth} />
          <button type="button" className="inspector-button" aria-label="Offset copy left" onClick={() => useEditor.getState().run((p) => offsetCopyBand(p, band.id, 'left', offsetWidth))}>
            Left
          </button>
          <button type="button" className="inspector-button" aria-label="Offset copy right" onClick={() => useEditor.getState().run((p) => offsetCopyBand(p, band.id, 'right', offsetWidth))}>
            Right
          </button>
        </div>
      </Section>

      <Section title="Points" collapsible>
        <PointsTable project={project} objectId={band.id} points={band.points} wraps={band.closed} unit={unit} />
      </Section>

      <Section title="Segments" collapsible>
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col" className="col-index">
                #
              </th>
              <th scope="col">Length</th>
              <th scope="col">Angle</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: segmentCount(band) }, (_, i) => i).map((i) => {
              const start = band.points[i]!
              const end = band.points[endpointIndex(i, n)]!
              const segLength = length(start, end)
              const segAngle = angleDeg(start, end)
              const endpointAt = (l: number, a: number): XY => {
                const rad = (a * Math.PI) / 180
                return { x: start.x + l * Math.cos(rad), y: start.y + l * Math.sin(rad) }
              }
              return (
                <tr key={`segment-${i}`}>
                  <td className="col-index">{i + 1}</td>
                  <td>
                    <NumberField
                      label={`Segment ${i + 1} length`}
                      prefix={null}
                      value={segLength}
                      unit={unit}
                      policy="positive"
                      onPreview={(v) => previewSetPoints(project, band.id, movedPoints(band, i, endpointAt(v, segAngle)))}
                      onCommit={commit}
                    />
                  </td>
                  <td>
                    <NumberField
                      label={`Segment ${i + 1} angle`}
                      prefix={null}
                      value={segAngle}
                      unit="deg"
                      policy="any"
                      onPreview={(deg) => previewSetPoints(project, band.id, movedPoints(band, i, endpointAt(segLength, deg)))}
                      onCommit={commit}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Section>

      <CrossingList bandId={band.id} />
    </section>
  )
}
```

- [ ] **Step 11: Restyle `src/ui/Inspector/CrossingList.tsx`.** The file header comment and the row logic are unchanged. The imports gain one line:

  ```tsx
  import { Section } from './Section.tsx'
  ```

  The two exports' return JSX become:

```tsx
  return (
    <Section title="Crossings" collapsible>
      {rows.length === 0 && <p className="panel-note">None</p>}
      <ul className="overrides">
        {rows.map(({ i, over, partner }, k) => {
          const where = `${formatLength(i.point.x, unit)}, ${formatLength(i.point.y, unit)}`
          const label = `with ${materialName(partner.occ.materialId)} at ${where}`
          return (
            <li key={k}>
              <span className="overrides-text">
                {label}
                {i.cls !== 'eligible' && ` (${i.cls})`}
                {i.source === 'override' && ' (override)'}
              </span>
              {i.cls === 'eligible' && (
                // Shell spec §13: V1's one toggle button drawn as an Over/Under segmented control. One button, so
                // focus stays on it after a toggle (crossings.spec) and its accessible name is unchanged.
                <button type="button" className="segmented" aria-label={`${over ? 'Over' : 'Under'}: toggle crossing ${label}`} onClick={() => toggleAt(i)}>
                  <span className={over ? 'segment on' : 'segment'}>Over</span>
                  <span className={over ? 'segment' : 'segment on'}>Under</span>
                </button>
              )}
            </li>
          )
        })}
      </ul>
      <UnresolvedList matches={(u) => u.record.a.bandId === bandId || u.record.b.bandId === bandId} />
    </Section>
  )
```

  and in `UnresolvedList`:

```tsx
  return (
    <>
      <h4 className="section-subtitle">Unresolved crossings</h4>
      <ul className="overrides">
        {[...byId.values()].map((u) => (
          <li key={u.record.id}>
            <span className="overrides-text">
              Unresolved at {formatLength(u.worldHint.x, unit)}, {formatLength(u.worldHint.y, unit)}
            </span>
            <button type="button" className="inspector-button" onClick={() => useEditor.getState().run((p) => removeRecord(p, u.contextId, u.record.id))}>
              Remove
            </button>
          </li>
        ))}
      </ul>
    </>
  )
```

- [ ] **Step 12: Replace `src/ui/Inspector/RegionPanel.tsx`'s imports and return.**
  - Imports: add `import { Section } from './Section.tsx'`, and replace `import { PointRow } from './PointRow.tsx'` with `import { PointsTable } from './PointRow.tsx'`.
  - Header comment: `// SPEC §7.5 Region panel, shell spec §13: Material and bounds W/H (scaling the polygon about the bounds origin), then the Points table.`
  - The return becomes:

```tsx
  return (
    <section className="panel" aria-label="Region">
      <Section title="Region">
        <div className="field">
          <label htmlFor="region-material" className="field-label">
            Material
          </label>
          <select id="region-material" value={region.materialId} onChange={(e) => useEditor.getState().run((p) => setMaterial(p, [region.id], e.target.value))}>
            {project.materials.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field-grid">
          <NumberField label="Width" prefix="W" value={width} unit={unit} policy="positive" onPreview={(v) => previewScale('x', v)} onCommit={() => useEditor.getState().commit()} />
          <NumberField label="Height" prefix="H" value={height} unit={unit} policy="positive" onPreview={(v) => previewScale('y', v)} onCommit={() => useEditor.getState().commit()} />
        </div>
      </Section>
      <Section title="Points" collapsible>
        <PointsTable project={project} objectId={region.id} points={region.points} wraps unit={unit} />
      </Section>
    </section>
  )
```

- [ ] **Step 13: Restyle `src/ui/Inspector/InstancePanel.tsx`.** The helpers are unchanged: `firstStep`, `throughObject`, `refWorldKeys` and `worldWidths`. The imports gain:

  ```tsx
  import { Section } from './Section.tsx'
  import { Switch } from './Switch.tsx'
  ```

  The header comment's "Edit Motif" becomes "Edit motif".

  Replace `MotifNameField`'s `<label htmlFor=…>` line with:

  ```tsx
  <label htmlFor={`motif-name-${obj.id}`} className="field-label">
  ```

  Replace `TransformFields`'s return with:

```tsx
  return (
    <Section title="Transform">
      <div className="field-grid">
        <NumberField label="Position X" prefix="X" value={t.x} unit={unit} policy="any" onPreview={(x) => preview({ x })} onCommit={commit} />
        <NumberField label="Position Y" prefix="Y" value={t.y} unit={unit} policy="any" onPreview={(y) => preview({ y })} onCommit={commit} />
      </div>
      <NumberField label="Rotation" value={t.rotationDeg} unit="deg" policy="any" onPreview={(rotationDeg) => preview({ rotationDeg })} onCommit={commit} />
      <NumberField label="Scale" value={t.scale} unit={null} policy="positive" onPreview={(scale) => preview({ scale })} onCommit={commit} />
      <Switch label="Mirror X" checked={t.mirrorX} onChange={(mirrorX) => toggle({ mirrorX })} />
      <Switch label="Mirror Y" checked={t.mirrorY} onChange={(mirrorY) => toggle({ mirrorY })} />
    </Section>
  )
```

  `EditMotifButton` returns:

```tsx
  return (
    <button type="button" className="inspector-button" onClick={enter}>
      Edit motif
    </button>
  )
```

  `OverridesList` returns:

```tsx
  return (
    <Section title="Overrides" collapsible>
      {overrides.length === 0 && <p className="panel-note">None</p>}
      <ul className="overrides">
        {overrides.map(({ i, record }) => (
          <li key={record.id}>
            <span className="overrides-text">
              Crossing at {formatLength(i.point.x, unit)}, {formatLength(i.point.y, unit)}
            </span>
            <button type="button" className="inspector-button" onClick={() => useEditor.getState().run((p) => removeRecord(p, null, record.id))}>
              Remove
            </button>
          </li>
        ))}
      </ul>
      <UnresolvedList matches={(u) => [u.record.a, u.record.b].some((r) => throughObject(refWorldKeys(u, r), prefixKeys, obj))} />
    </Section>
  )
```

  `InstancePanel` returns:

```tsx
  return (
    <section className="panel" aria-label="Instance">
      <Section title="Motif">
        <MotifNameField obj={instance} />
        {Math.abs(factor - 1) > EPS_RELATIVE &&
          worldWidths(project, instance, factor).map(({ width, world }) => (
            <p key={width} className="panel-note">
              World width: {formatLength(width, unit)} → {formatLength(world, unit)} {unit}
            </p>
          ))}
        <div className="button-row">
          <EditMotifButton obj={instance} />
          <button type="button" className="inspector-button" onClick={detach}>
            Detach
          </button>
        </div>
      </Section>
      <TransformFields obj={instance} />
      <OverridesList obj={instance} />
    </section>
  )
```

- [ ] **Step 14: Restyle `src/ui/Inspector/RepeatPanel.tsx`.**
  - Imports gain:

    ```tsx
    import { Section } from './Section.tsx'
    import { Switch } from './Switch.tsx'
    ```

  - Header comment:

    ```tsx
    // SPEC §7.5 Repeat panel, shell spec §13: Grid, Offsets (each with its ½ step button), Alternation (switches and the rotation select), Transform, the motif name with Edit motif, and the overrides list.
    ```

  - The return becomes:

```tsx
  return (
    <section className="panel" aria-label="Repeat">
      <Section title="Grid">
        <NumberField label="Rows" value={field.rows} unit={null} policy="integer1to50" onPreview={(rows) => preview({ rows })} onCommit={commit} />
        <NumberField label="Columns" value={field.columns} unit={null} policy="integer1to50" onPreview={(columns) => preview({ columns })} onCommit={commit} />
        <NumberField label="Step X" value={field.stepXMm} unit={unit} policy="any" onPreview={(stepXMm) => preview({ stepXMm })} onCommit={commit} />
        <NumberField label="Step Y" value={field.stepYMm} unit={unit} policy="any" onPreview={(stepYMm) => preview({ stepYMm })} onCommit={commit} />
      </Section>
      <Section title="Offsets">
        <div className="field-with-button">
          <NumberField label="Row offset" value={field.rowOffsetMm} unit={unit} policy="any" onPreview={(rowOffsetMm) => preview({ rowOffsetMm })} onCommit={commit} />
          <button type="button" className="inspector-button" aria-label="Row offset ½ step" onClick={() => set({ rowOffsetMm: field.stepXMm / 2 })}>
            ½ step
          </button>
        </div>
        <div className="field-with-button">
          <NumberField label="Column offset" value={field.columnOffsetMm} unit={unit} policy="any" onPreview={(columnOffsetMm) => preview({ columnOffsetMm })} onCommit={commit} />
          <button type="button" className="inspector-button" aria-label="Column offset ½ step" onClick={() => set({ columnOffsetMm: field.stepYMm / 2 })}>
            ½ step
          </button>
        </div>
      </Section>
      <Section title="Alternation">
        <Switch label="Alternate mirror X" checked={field.alternateMirrorX} onChange={(alternateMirrorX) => set({ alternateMirrorX })} />
        <Switch label="Alternate mirror Y" checked={field.alternateMirrorY} onChange={(alternateMirrorY) => set({ alternateMirrorY })} />
        <div className="field">
          <label htmlFor={`alt-rotation-${field.id}`} className="field-label">
            Alternate rotation
          </label>
          <select
            id={`alt-rotation-${field.id}`}
            value={field.alternateRotationDeg}
            onChange={(e) => set({ alternateRotationDeg: Number(e.target.value) as RepeatField['alternateRotationDeg'] })}
          >
            <option value={0}>0°</option>
            <option value={90}>90°</option>
            <option value={180}>180°</option>
          </select>
        </div>
      </Section>
      <TransformFields obj={field} />
      <Section title="Motif">
        <MotifNameField obj={field} />
        <div className="button-row">
          <EditMotifButton obj={field} />
        </div>
      </Section>
      <OverridesList obj={field} />
    </section>
  )
```

- [ ] **Step 15: CSS.** In `src/index.css`, first delete any V1 inspector rules that Task 1 kept:

  `.panel`, `.panel h2`, `.panel h3`, `.field`, `.field label`, `.field input, .field select`, `.field-checkbox`, `.field-unit`, `.field-error`, `.point-row, .segment-row`, `.segment-label`, `.button-row`, `.field-with-button`, `.field-with-button .field`, `.overrides`, `.overrides li`, `.panel-note`

  Check with `grep -nE "^\.(panel|field|point-row|segment-row|segment-label|button-row|overrides)" src/index.css`. Expected: no output. Then append:

```css
/* Shell spec §13 inspector: header, sections, fields (a --raised box with a
   muted unit suffix and optional compact prefix), two-column grids, tables,
   the switch, segmented controls, row and background menus. */
.inspector-header {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 12px;
  border-bottom: 1px solid var(--line);
}

.inspector-mark {
  display: inline-flex;
  flex: none;
  color: var(--muted);
}

.inspector-swatch {
  display: inline-block;
  flex: none;
  width: 16px;
  height: 16px;
  border: 1px solid var(--line);
  border-radius: 4px;
}

.inspector-swatch-none {
  background: repeating-linear-gradient(45deg, var(--raised) 0 3px, var(--panel) 3px 6px);
}

.inspector-title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
}

.inspector-note {
  min-width: 0;
  margin-left: auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: var(--muted);
}

.panel {
  margin: 0;
}

.section {
  padding: 10px 12px;
  border-bottom: 1px solid var(--line);
}

.section-title {
  margin: 0 0 8px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text);
}

summary.section-title {
  display: flex;
  align-items: center;
  gap: 6px;
  list-style: none;
  cursor: pointer;
}

summary.section-title::-webkit-details-marker {
  display: none;
}

summary.section-title::before {
  content: '';
  width: 5px;
  height: 5px;
  border-right: 1.5px solid var(--muted);
  border-bottom: 1.5px solid var(--muted);
  transform: rotate(-45deg);
}

details[open] > summary.section-title::before {
  transform: rotate(45deg);
}

details:not([open]) > summary.section-title {
  margin-bottom: 0;
}

.section-subtitle {
  margin: 10px 0 6px;
  font-size: 12px;
  font-weight: 500;
  color: var(--muted);
}

.field {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
  margin-bottom: 6px;
}

.field-label {
  flex: 0 0 88px;
  font-size: 12px;
  color: var(--muted);
}

.field-box {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 4px;
  min-width: 0;
  height: 28px;
  padding: 0 8px;
  background: var(--raised);
  border: 1px solid transparent;
  border-radius: 6px;
}

.field-box:focus-within {
  outline: 2px solid var(--acc);
  outline-offset: 2px;
}

.field-box:has(input[aria-invalid='true']) {
  border-color: var(--danger);
}

.field-box input {
  flex: 1;
  width: 100%;
  min-width: 0;
  padding: 0;
  border: 0;
  outline: none;
  background: transparent;
  color: var(--text);
  font: inherit;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}

.field-prefix,
.field-unit {
  display: inline-flex;
  flex: none;
  font-size: 12px;
  color: var(--muted);
}

.field-error {
  flex-basis: 100%;
  font-size: 12px;
  color: var(--danger);
}

.field > select,
.field > input[type='text'] {
  flex: 1;
  min-width: 0;
  height: 28px;
  padding: 0 6px;
  background: var(--raised);
  border: 1px solid transparent;
  border-radius: 6px;
  color: var(--text);
  font: inherit;
  font-size: 13px;
}

.field-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 8px;
}

.field-with-button {
  display: flex;
  align-items: flex-start;
  gap: 6px;
}

.field-with-button .field {
  flex: 1;
  min-width: 0; /* else the input's intrinsic width pushes the row past the inspector */
}

.button-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 4px;
}

.inspector-button {
  flex: none;
  height: 28px;
  padding: 0 10px;
  background: var(--raised);
  border: 1px solid var(--line);
  border-radius: 6px;
  color: var(--text);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.inspector-button:hover {
  border-color: var(--line-strong);
}

.panel-note {
  margin: 4px 0;
  font-size: 12px;
  color: var(--muted);
}

.overrides {
  margin: 0;
  padding: 0;
  list-style: none;
}

.overrides li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 3px 0;
  font-size: 12px;
}

.overrides-text {
  min-width: 0;
}

.data-table {
  width: 100%;
  table-layout: fixed;
  border-collapse: collapse;
  font-size: 12px;
}

.data-table th {
  padding: 0 4px 4px;
  text-align: left;
  font-weight: 500;
  color: var(--muted);
}

.data-table td {
  padding: 2px 4px;
  vertical-align: top;
}

.data-table .field {
  margin: 0;
}

.data-table .col-index {
  width: 24px;
  padding-top: 7px;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}

.data-table .col-menu {
  width: 32px;
}

.row-menu-trigger {
  display: inline-grid;
  place-items: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--muted);
}

.row-menu-trigger:hover,
.row-menu-trigger[data-state='open'] {
  background: var(--raised);
  color: var(--text);
}

.field-switch {
  justify-content: space-between;
}

.switch {
  position: relative;
  flex: none;
  width: 32px;
  height: 18px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: var(--line-strong);
  cursor: pointer;
}

.switch[aria-checked='true'] {
  background: var(--acc);
}

.switch-thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--text);
}

.switch[aria-checked='true'] .switch-thumb {
  transform: translateX(14px);
}

.segmented {
  display: inline-flex;
  flex: none;
  gap: 2px;
  padding: 2px;
  background: var(--raised);
  border: 0;
  border-radius: 6px;
  font: inherit;
  cursor: pointer;
}

.segment {
  display: inline-grid;
  place-items: center;
  min-width: 36px;
  height: 22px;
  padding: 0 8px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--muted);
  font: inherit;
  font-size: 12px;
  font-weight: 500;
}

.segment[aria-pressed='true'],
.segment.on {
  background: var(--panel);
  color: var(--text);
  box-shadow: 0 0 0 1px var(--line);
}

.menu-select {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  height: 32px;
  padding: 0 8px;
  background: var(--raised);
  border: 1px solid transparent;
  border-radius: 6px;
  color: var(--text);
  font: inherit;
  font-size: 13px;
  text-align: left;
}

.menu-select-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.inspector-menu {
  z-index: 6;
  min-width: 160px;
  padding: 4px;
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 10px;
  box-shadow: var(--shadow);
  color: var(--text);
  font-size: 13px;
}

.inspector-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 6px;
  outline: none;
  cursor: pointer;
}

.inspector-menu-item[data-highlighted] {
  background: var(--raised);
}

.inspector-menu-item[data-state='checked'] {
  background: var(--acc-soft);
}

@media (pointer: coarse) {
  .row-menu-trigger,
  .inspector-button {
    min-width: 44px;
    min-height: 44px;
  }

  .switch::after {
    content: '';
    position: absolute;
    inset: -13px -6px;
  }

  .segment {
    min-height: 44px;
  }
}
```

- [ ] **Step 16: Update the e2e helpers and specs whose locators changed.**

  `e2e/author/actions.ts`, before:

```ts
  async check(label: string, on: boolean): Promise<void> {
    const box = this.page.getByLabel(label, { exact: true })
    if (on) await box.check()
    else await box.uncheck()
    await this.tick()
  }
```

  After:

```ts
  /** An inspector switch (shell spec §13): one click when it is not already `on`. */
  async check(label: string, on: boolean): Promise<void> {
    const toggle = this.page.getByRole('switch', { name: label, exact: true })
    if ((await toggle.getAttribute('aria-checked')) !== String(on)) await toggle.click()
    await expect(toggle).toHaveAttribute('aria-checked', String(on))
    await this.tick()
  }
```

  Before:

```ts
  async enterMotif(): Promise<void> {
    await this.button('Edit Motif')
  }
```

  After:

```ts
  async enterMotif(): Promise<void> {
    await this.page.getByRole('toolbar', { name: 'Selection actions' }).getByRole('button', { name: 'Edit motif', exact: true }).click()
    await this.tick()
  }
```

  Before:

```ts
  async setBackground(material: string): Promise<void> {
    await this.choose('Background material', material)
  }
```

  After:

```ts
  /** The Board panel's Background menu (shell spec §13): open it, pick the material — two actions. */
  async setBackground(material: string): Promise<void> {
    await this.page.getByRole('region', { name: 'Board', exact: true }).getByRole('button', { name: /^Background material/ }).click()
    await this.tick()
    await this.page.getByRole('menuitemradio', { name: material, exact: true }).click()
    await this.tick()
  }
```

  If Task 4 already rewrote `enterMotif`, keep Task 4's version.

  `e2e/a11y.spec.ts:89`, before:

  ```ts
      await expect(page.getByRole('heading', { name: 'Band' })).toBeVisible()
  ```

  After:

  ```ts
      await expect(page.getByRole('heading', { name: 'Band', level: 2 })).toBeVisible()
  ```

  `e2e/motifs.spec.ts:148`, before:

  ```ts
      await page.getByRole('button', { name: 'Edit Motif' }).click()
  ```

  After:

  ```ts
      await page.getByRole('region', { name: 'Repeat' }).getByRole('button', { name: 'Edit motif', exact: true }).click()
  ```

  If Task 4 already changed this line to the actions bar, keep Task 4's line.

- [ ] **Step 17: Run the new tests.**

  `pnpm typecheck && pnpm exec playwright test e2e/inspector.spec.ts`

  Expected: 11 passed per project, including the V1 Repeat-panel no-horizontal-scroll test.

- [ ] **Step 18: Run every spec that touches the inspector.**

  `pnpm test && pnpm exec playwright test e2e/a11y.spec.ts e2e/crossings.spec.ts e2e/vertex-handles.spec.ts e2e/materials.spec.ts e2e/motifs.spec.ts e2e/move-snap.spec.ts e2e/edit-context.spec.ts e2e/author`

  Expected: all pass.
  - `crossings.spec.ts:152–161` keeps its toggle focused across the Over/Under flip, because it is still one button.
  - The author specs print G6 lines. D, E and F each report one more action than the G6 table records.

- [ ] **Step 19: Commit.**

```bash
git add src/ui/Inspector src/index.css e2e/inspector.spec.ts e2e/author/actions.ts e2e/a11y.spec.ts e2e/motifs.spec.ts
FSH_NO_TTY=1 git commit -m "Restyle inspector into sections and tables" -m "Shell spec 13: V1's stacked label rows made long panels hard to scan. Sections, point and segment tables, switches and segmented controls keep every field label and region name the helpers rely on, so behaviour and tests stay put."
```

---

### Task 10: New Project dialog, samples in production, final verification

**Files:**
- Create:
  - `src/ui/NewProjectDialog.tsx`
  - `e2e/new-project.spec.ts`
- Modify:
  - `src/domain/project.ts`: gains `isBlankProject`.
  - `src/ui/ProjectMenu.tsx`:
    - `isBlankProject` moves out;
    - the New item opens the dialog;
    - the V1 New confirmation path goes;
    - the DEV `Load sample (dev)` sub-menu goes.
  - `src/index.css`: append a section.
  - `e2e/persistence.spec.ts`: the header comment, and the `New Project confirmation` describe block.
  - `e2e/performance.spec.ts`: the Layers pane pin.
  - `playwright.perf.config.ts`: viewport.
  - `e2e/a11y.spec.ts`: a 200% zoom shell test.
  - `docs/decisions/2026-09-24-gates.md`: G6 table and a G9 re-run.
  - `docs/decisions/2026-09-24-final-report.md`: new section.
  - `docs/decisions/2026-09-24-ipad-checklist.md`: new section.
  - `AGENTS.md`: the "Where things are" table.
- Test:
  - `e2e/new-project.spec.ts`
  - `e2e/persistence.spec.ts`
  - `e2e/a11y.spec.ts`
  - `e2e/performance.spec.ts` (through `pnpm perf`)
  - the full suite.

**Interfaces:**
- Consumes:
  - `downloadProject(p: Project): void` (Task 3, `@/export/download`)
  - `fixtures` (`@/fixtures`)
  - `newProject(displayUnits)`
  - `setDisplayUnits(p, units): Project`
  - `setBoardSize(p, w, h): Project`. These are plain transforms, not `CommandResult`s, so there is nothing to unwrap.
  - `buildScene`, `SceneSvg`, `editorClipExtendMm`
  - `NumberField`, including its `prefix` (Task 9)
- Produces:
  - `export function NewProjectDialog({ open, onOpenChange }: { open: boolean; onOpenChange(o: boolean): void }): JSX.Element`
  - `export function isBlankProject(project: Project): boolean`, now in `src/domain/project.ts`.

- [ ] **Step 1: Write the failing e2e spec.** Create `e2e/new-project.spec.ts`:

```ts
// Shell spec §10.2: the New Project dialog, which is New's confirmation. A
// sample with other units and size creates exactly that project with history
// cleared; Cancel leaves project and history untouched; a non-blank project
// shows the warning with a working Download; a blank one shows none; the
// seven cards have thumbnails; the V1 dev sample loader is gone.

import type { Locator, Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { band, project } from '../src/domain/test-builders.ts'
import { expectClose, getProject, history, seed } from './helpers.ts'

const WARNING = 'This replaces the current project. Download it first to keep a copy.'

/** Project menu (the project-name button, §8) → New project…; returns the dialog. */
async function openNewProject(page: Page): Promise<Locator> {
  const name = (await getProject(page)).name
  await page.getByRole('button', { name, exact: true }).click()
  await page.getByRole('menuitem', { name: 'New project…', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'New project' })
  await expect(dialog).toBeVisible()
  return dialog
}

test.describe('New Project dialog', () => {
  test('Checker in inches with a new width: that project, units and size, with history cleared', async ({ page }) => {
    await seed(page, project([band('b1', [[0, 40], [80, 40]])]))
    await page.evaluate(() => window.__cbpd!.run((p) => ({ ...p, name: 'Edited' })))
    expect(await history(page)).toEqual({ past: 1, future: 0 })

    const dialog = await openNewProject(page)
    const checker = dialog.getByRole('button', { name: 'Checker', exact: true })
    await checker.click()
    await expect(checker).toHaveAttribute('aria-pressed', 'true')
    await dialog.getByRole('group', { name: 'Units' }).getByRole('button', { name: 'in', exact: true }).click()
    const width = dialog.getByLabel('Width', { exact: true })
    await expect(width).toHaveValue('11.811') // Checker's 300 mm, re-rendered in inches; the mm value is unchanged
    await width.fill('12')
    await width.press('Enter')
    await dialog.getByRole('button', { name: 'Create', exact: true }).click()

    await expect(dialog).toBeHidden()
    const p = await getProject(page)
    expect(p.name).toBe('Checker')
    expect(p.displayUnits).toBe('in')
    expectClose(p.board.widthMm, 304.8, 1e-9)
    expect(p.board.heightMm).toBe(450)
    expect(Object.keys(p.objects)).toHaveLength(3)
    expect(await history(page)).toEqual({ past: 0, future: 0 })
  })

  test('Cancel leaves the project and its history untouched', async ({ page }) => {
    await seed(page, project([band('b1', [[0, 40], [80, 40]])]))
    await page.evaluate(() => window.__cbpd!.run((p) => ({ ...p, name: 'Edited' })))
    const before = await getProject(page)
    const historyBefore = await history(page)

    const dialog = await openNewProject(page)
    await dialog.getByRole('button', { name: 'Interlace', exact: true }).click()
    await dialog.getByRole('group', { name: 'Units' }).getByRole('button', { name: 'in', exact: true }).click()
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()

    await expect(dialog).toBeHidden()
    expect(await getProject(page)).toEqual(before)
    expect(await history(page)).toEqual(historyBefore)
  })

  test('a non-blank project gets the warning, whose Download saves it without closing the dialog', async ({ page }) => {
    await seed(page, { ...project([band('b1', [[0, 40], [80, 40]])]), name: 'Walnut board' })
    const dialog = await openNewProject(page)
    await expect(dialog).toContainText(WARNING)
    const [download] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: 'Download project', exact: true }).click()])
    expect(download.suggestedFilename()).toBe('Walnut board.cbpd.json')
    await expect(dialog).toBeVisible()
  })

  test('a blank project gets no warning; Blank is chosen and creates a fresh blank project; seven cards have thumbnails', async ({ page }) => {
    await seed(page, project([]))
    const before = await getProject(page)
    const dialog = await openNewProject(page)
    await expect(dialog).not.toContainText(WARNING)
    await expect(dialog.getByRole('button', { name: 'Blank', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(dialog.locator('.new-project-card svg')).toHaveCount(7)
    expect(await dialog.getByRole('button', { name: 'Checker', exact: true }).locator('g.scene path').count()).toBeGreaterThan(0)

    await dialog.getByRole('button', { name: 'Create', exact: true }).click()
    const after = await getProject(page)
    expect(after.id).not.toBe(before.id)
    expect(after.objects).toEqual({})
    expect(after.displayUnits).toBe('mm')
    expect(after.board).toMatchObject({ widthMm: 300, heightMm: 450 })
  })

  test('the project menu has no dev sample loader', async ({ page }) => {
    await seed(page, project([]))
    await page.getByRole('button', { name: 'Test', exact: true }).click()
    await expect(page.getByRole('menuitem', { name: 'New project…', exact: true })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: /Load sample/ })).toHaveCount(0)
  })
})
```

- [ ] **Step 2: Run it and watch it fail.**

  `pnpm exec playwright test e2e/new-project.spec.ts --project=chromium`

  Expected: 5 failed.
  - The first four time out waiting for `dialog 'New project'`, because V1's `Start a new project?` dialog opens, or none opens on a blank project.
  - The fifth finds the `Load sample (dev)` sub-trigger.

- [ ] **Step 3: Move `isBlankProject` into the domain.**
  - Append to `src/domain/project.ts`:

```ts
/** SPEC §9: the blank starter — no objects (root or definition-owned). Open replaces it without asking; New Project warns only when it isn't blank (shell spec §10.2). */
export function isBlankProject(p: Project): boolean {
  return Object.keys(p.objects).length === 0
}
```

  - In `src/ui/ProjectMenu.tsx`, delete the `/** SPEC §9: the blank starter … */ export function isBlankProject …` block (V1 lines 22–25), and import it instead:

    ```ts
    import { isBlankProject } from '@/domain/project'
    ```

  Then run `grep -rn "isBlankProject" src e2e`. Expected: the definition in `project.ts`, and uses in `ProjectMenu.tsx` only.

- [ ] **Step 4: Create `src/ui/NewProjectDialog.tsx`.**

```tsx
// Shell spec §10.2: New Project — a blank board or one of the six sample
// patterns (SPEC §12 fixtures, shipped in production), with its size and
// units. It is New's confirmation (V1 §9's "Start a new project?" is gone).
// Sizes are held in mm; the unit toggle only re-renders the fields. Create
// builds the project (Blank: newProject(units); a sample: a deep clone, then
// setDisplayUnits if the units differ), runs setBoardSize if W or H differs,
// and opens it with one replaceProject, which clears history. Cancel changes
// nothing. The form lives inside Dialog.Content, which unmounts on close, so
// each opening starts fresh and renders the seven thumbnails once.

import * as Dialog from '@radix-ui/react-dialog'
import type { JSX } from 'react'
import { useState } from 'react'
import { setBoardSize, setDisplayUnits } from '@/domain/commands'
import type { Project } from '@/domain/model'
import { isBlankProject, newProject } from '@/domain/project'
import type { Unit } from '@/domain/units'
import { editorClipExtendMm } from '@/editor/camera'
import { useEditor } from '@/editor/store'
import { downloadProject } from '@/export/download'
import { fixtures } from '@/fixtures'
import type { Scene } from '@/geometry/scene'
import { buildScene } from '@/geometry/scene'
import { SceneSvg } from '@/render/SceneSvg'
import { NumberField } from './Inspector/NumberField.tsx'

/** Card order, as §10.2 lists them. */
const SAMPLES = ['stripes', 'checker', 'basketWeave', 'chevronDiamond', 'isometric', 'interlace'] as const satisfies ReadonlyArray<keyof typeof fixtures>
const UNITS: Unit[] = ['mm', 'in']
const THUMB_PX = 88

interface Card {
  key: string
  label: string
  blank: boolean
  project: Project
  scene: Scene
}

function card(key: string, label: string, blank: boolean, project: Project): Card {
  const { widthMm, heightMm } = project.board
  return { key, label, blank, project, scene: buildScene(project, editorClipExtendMm(THUMB_PX / Math.max(widthMm, heightMm))) }
}

function NewProjectForm({ onDone }: { onDone(): void }): JSX.Element {
  const current = useEditor((s) => s.project)
  const [cards] = useState(() => [card('blank', 'Blank', true, newProject(current.displayUnits)), ...SAMPLES.map((k) => card(k, fixtures[k].name, false, fixtures[k]))])
  const [chosen, setChosen] = useState(cards[0]!)
  const [units, setUnits] = useState<Unit>(current.displayUnits)
  const [size, setSize] = useState({ widthMm: chosen.project.board.widthMm, heightMm: chosen.project.board.heightMm })

  const choose = (c: Card): void => {
    setChosen(c)
    setSize({ widthMm: c.project.board.widthMm, heightMm: c.project.board.heightMm })
  }

  const create = (): void => {
    let p = chosen.blank ? newProject(units) : structuredClone(chosen.project)
    if (p.displayUnits !== units) p = setDisplayUnits(p, units)
    if (p.board.widthMm !== size.widthMm || p.board.heightMm !== size.heightMm) p = setBoardSize(p, size.widthMm, size.heightMm)
    useEditor.getState().replaceProject(p)
    onDone()
  }

  return (
    <>
      <div className="new-project-cards" role="group" aria-label="Start from">
        {cards.map((c) => {
          const { widthMm: w, heightMm: h, backgroundMaterialId } = c.project.board
          // A Board with no background is drawn white, as Canvas.tsx draws it: document rendering, not theme.
          const fill = c.project.materials.find((m) => m.id === backgroundMaterialId)?.color ?? '#ffffff'
          return (
            <button key={c.key} type="button" className="new-project-card" aria-pressed={c === chosen} onClick={() => choose(c)}>
              <svg className="new-project-thumb" viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
                <rect width={w} height={h} fill={fill} />
                <SceneSvg scene={c.scene} materials={c.project.materials} clipPrefix={`cbpd-np-${c.key}`} />
              </svg>
              <span className="new-project-card-name">{c.label}</span>
            </button>
          )
        })}
      </div>
      <div className="new-project-size">
        <NumberField
          label="Width"
          prefix="W"
          value={size.widthMm}
          unit={units}
          policy="positive"
          onPreview={(widthMm) => {
            setSize((s) => ({ ...s, widthMm }))
            return undefined
          }}
          onCommit={(widthMm) => setSize((s) => ({ ...s, widthMm }))}
        />
        <NumberField
          label="Height"
          prefix="H"
          value={size.heightMm}
          unit={units}
          policy="positive"
          onPreview={(heightMm) => {
            setSize((s) => ({ ...s, heightMm }))
            return undefined
          }}
          onCommit={(heightMm) => setSize((s) => ({ ...s, heightMm }))}
        />
        <div className="segmented" role="group" aria-label="Units">
          {UNITS.map((u) => (
            <button key={u} type="button" className="segment" aria-pressed={units === u} onClick={() => setUnits(u)}>
              {u}
            </button>
          ))}
        </div>
      </div>
      {!isBlankProject(current) && (
        <p className="new-project-warning">
          This replaces the current project. Download it first to keep a copy.{' '}
          <button type="button" className="inspector-button" onClick={() => downloadProject(current)}>
            Download project
          </button>
        </p>
      )}
      <div className="dialog-actions">
        <Dialog.Close asChild>
          <button type="button" className="inspector-button">
            Cancel
          </button>
        </Dialog.Close>
        <button type="button" className="new-project-create" onClick={create}>
          Create
        </button>
      </div>
    </>
  )
}

export function NewProjectDialog({ open, onOpenChange }: { open: boolean; onOpenChange(o: boolean): void }): JSX.Element {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content new-project">
          <Dialog.Title className="new-project-title">New project</Dialog.Title>
          <Dialog.Description className="new-project-lede">Start from a blank board or one of the sample patterns. You can change the size later.</Dialog.Description>
          <NewProjectForm onDone={() => onOpenChange(false)} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
```

  `card` has one call site, but that call site builds seven cards. It exists so the thumbnail zoom is computed in one place.

- [ ] **Step 5: Wire the New item, and delete the V1 New confirmation and the DEV sub-menu, in `src/ui/ProjectMenu.tsx`.** Check the assumptions:

  `grep -n "startNew\|onNewClick\|'new'\|Start a new project\|Load sample\|fixtures\|newProject" src/ui/ProjectMenu.tsx`

  Expected: V1's `startNew`, `onNewClick`, `PendingAction = 'new' | 'open' | null`, `onConfirm`'s `'new'` branch and the dialog-title ternary. Also the DEV sub-menu `{import.meta.env.DEV && ( <DropdownMenu.Sub> … Load sample (dev) … </DropdownMenu.Sub> )}`, and the `fixtures` / `newProject` imports it uses.

  - **Imports.** Delete the `newProject` import and the `fixtures` import (and any `FIXTURE_OPTIONS` table Task 4 moved in). Add:

    ```tsx
    import { NewProjectDialog } from './NewProjectDialog.tsx'
    ```

  - **Pending state**, before:

    ```tsx
    type PendingAction = 'new' | 'open' | null
    ```

    After:

    ```tsx
    type PendingAction = 'open' | null
    ```

  - **Delete** `startNew` and `onNewClick` entirely (V1 lines 48–56). Add to the component body:

    ```tsx
    const [newOpen, setNewOpen] = useState(false)
    ```

  - **onConfirm**, before:

```tsx
  const onConfirm = (): void => {
    if (pending === 'new') startNew()
    else if (pending === 'open') fileInputRef.current?.click()
    setPending(null)
  }
```

    After:

```tsx
  const onConfirm = (): void => {
    fileInputRef.current?.click()
    setPending(null)
  }
```

  - **The New project… item.** Change its `onSelect={onNewClick}` to `onSelect={() => setNewOpen(true)}`.
  - **The confirmation dialog's title and button.** Before:

```tsx
            <Dialog.Title>{pending === 'new' ? 'Start a new project?' : 'Open a project?'}</Dialog.Title>
```

```tsx
                {pending === 'new' ? 'Start new project' : 'Choose file…'}
```

    After:

```tsx
            <Dialog.Title>Open a project?</Dialog.Title>
```

```tsx
                Choose file…
```

  - **Delete** the whole `{import.meta.env.DEV && ( <DropdownMenu.Sub> … </DropdownMenu.Sub> )}` block.
  - **Render the dialog** directly after the Open confirmation's `</Dialog.Root>`:

    ```tsx
    <NewProjectDialog open={newOpen} onOpenChange={setNewOpen} />
    ```

  - **Header comment.** Replace its first sentence with:

    ```tsx
    // SPEC §9, shell spec §10.1: the project menu. New project… opens the New Project dialog (its confirmation); Open confirms unless the current project is blank; …
    ```

    Keep the rest.

  Check with `grep -n "startNew\|onNewClick\|Start a new project\|Load sample\|import.meta.env.DEV" src/ui/ProjectMenu.tsx`. Expected: no output.

- [ ] **Step 6: Confirm that the fixtures and the test hook are not gated to DEV.**

  `grep -rn "import.meta.env" src`

  Expected: only `src/editor/testHook.ts` (`MODE === 'production'`, which keeps the hook out of production), `src/editor/store.ts` (`DEV` validation) and `src/domain/freeze.ts`. `src/fixtures/index.ts` has no guard, and `window.__cbpd.loadFixture` still uses `fixtures`.

- [ ] **Step 7: CSS.** Append to `src/index.css`:

```css
/* Shell spec §10.2 New Project dialog: seven cards, size and units, the
   non-blank warning, Cancel / Create. */
.new-project {
  width: min(640px, calc(100vw - 32px));
  max-height: calc(100vh - 32px);
  overflow-y: auto;
  border-radius: 14px;
}

.new-project-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.new-project-lede {
  margin: 0;
  font-size: 13px;
  color: var(--muted);
}

.new-project-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(104px, 1fr));
  gap: 8px;
}

.new-project-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 8px;
  background: var(--raised);
  border: 1px solid var(--line);
  border-radius: 8px;
  color: var(--text);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.new-project-card[aria-pressed='true'] {
  background: var(--acc-soft);
  border-color: var(--acc);
}

.new-project-thumb {
  width: 100%;
  height: 88px;
}

.new-project-card-name {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.new-project-size {
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  align-items: start;
  gap: 8px;
}

.new-project-warning {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin: 0;
  padding: 8px 10px;
  background: var(--raised);
  border-left: 3px solid var(--attn);
  border-radius: 6px;
  font-size: 13px;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.new-project-create {
  height: 32px;
  padding: 0 16px;
  border: 0;
  border-radius: 6px;
  background: var(--acc);
  color: var(--acc-ink);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

@media (pointer: coarse) {
  .new-project-create {
    min-height: 44px;
  }
}
```

- [ ] **Step 8: Run the new spec.**

  `pnpm typecheck && pnpm exec playwright test e2e/new-project.spec.ts`

  Expected: 5 passed in each of the four projects (20 in total).

- [ ] **Step 9: Update `e2e/persistence.spec.ts`**, which covered the removed "Start a new project?" dialog. Replace header lines 1–5 with:

```ts
// SPEC §9, G8 browser part: quota-failure status + recovery, startup
// corruption recovery, a failed Open leaving project/history untouched,
// Open's confirmation on a non-blank project (and the direct path — no
// dialog — on a blank one), the pagehide flush, and multi-tab detection via
// the `storage` event. New Project is covered by new-project.spec.ts (shell
// spec §10.2: the dialog is New's confirmation).
```

  Delete the whole `test.describe('New Project confirmation', () => { … })` block, whatever Task 3 left in its two tests: the "asks to confirm" and "blank replaces without a confirmation" cases. `new-project.spec.ts` covers both: Cancel leaves the project and history untouched, and a blank project gets a fresh blank one. The difference is that a blank project now also sees the dialog, because it is where size and units are chosen.

  Check with `grep -n "Start a new project\|New Project confirmation" e2e/persistence.spec.ts`. Expected: no output.

- [ ] **Step 10: Pin Review Focus 5 (the Layers pane with the performance fixture) in the G9 run.**
  - `playwright.perf.config.ts`: change `viewport: { width: 1000, height: 800 }` to `viewport: { width: 1440, height: 900 }`, so both panes are open, unless Task 1 already did.
  - `e2e/performance.spec.ts`, in `seedFixture`, after `await snapOff(page) // see measureDrag`, add:

```ts
  // Shell spec §16: the Layers pane is open for every measurement, so its render cost is inside every frame recorded.
  await expect(page.locator('[role="listbox"][aria-multiselectable="true"]')).toBeVisible()
```

  - In `typical()`, after `const inspector = await measureWidthKeystroke(page)`, add:

```ts
  // --- Layers pane (shell spec §16, Review Focus 5): a row click on this project selects the band and paints. The root band is painted last, so it is the first row. ---
  await select(page, [])
  await afterPaint(page)
  await startProbe(page, 'pointerdown', 'click')
  await page.locator('[role="listbox"][aria-multiselectable="true"] [role="option"]').first().click()
  const [layersClick] = (await stopProbe(page, 1)).samples
  expect(await page.evaluate(() => window.__cbpd!.getState().selection)).toEqual([ROOT_BAND])
```

  - Add these to the returned object:

```ts
    layersClickDispatchMs: round(layersClick!.end - layersClick!.start),
    layersClickToPaintMs: toPaint(layersClick!),
```

  - Add this line under the header comment's `G9 {…}` description:

    ```ts
    //                  and one Layers-row click → selection painted
    ```

- [ ] **Step 11: Add a 200% zoom shell test to `e2e/a11y.spec.ts`.** Add `seededProject` to its helpers import, and add inside `test.describe('accessibility (G11)', …)`:

```ts
  test('at 200% zoom (720 × 450 CSS px of the 1440 × 900 baseline) the shell never scrolls sideways and stays usable', async ({ page }) => {
    await page.setViewportSize({ width: 720, height: 450 })
    await seed(page, { ...seededProject(), name: 'A very long project name that keeps going well past the top bar' })
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0)
    await expect(page.getByRole('button', { name: 'Export SVG', exact: true })).toBeInViewport()
    expect((await page.locator('.canvas').boundingBox())!.width).toBeGreaterThan(300) // narrow mode: the panes overlay, the canvas keeps the width
    await setCamera(page, cameraShowing({ x: 80, y: 40 }, { x: 60, y: 60 }, 2))
    const on = round(await toClient(page, { x: 80, y: 40 }))
    await page.mouse.click(on.x, on.y)
    expect(await state<string[]>(page, 's.selection')).toEqual(['b1'])
  })
```

  Then run `pnpm exec playwright test e2e/a11y.spec.ts e2e/persistence.spec.ts`. Expected: all pass.

- [ ] **Step 12: Commit the feature.**

```bash
git add src/ui/NewProjectDialog.tsx src/ui/ProjectMenu.tsx src/domain/project.ts src/index.css e2e/new-project.spec.ts e2e/persistence.spec.ts e2e/performance.spec.ts e2e/a11y.spec.ts playwright.perf.config.ts
FSH_NO_TTY=1 git commit -m "Add New Project dialog with sample patterns" -m "Shell spec 10.2: New now asks what to start from, not only whether to discard. The six fixtures ship as samples, which retires the dev-only loader; the dialog is New's confirmation, so V1's separate prompt goes. The perf run now keeps the Layers pane open and times a row click."
```

- [ ] **Step 13: Final verification. Run each command separately and record its output.**
  1. `pnpm typecheck`. Expected: exit 0, no output from either `tsc`.
  2. `pnpm test`. Expected: every Vitest file passes. The count is at least V1's 383 plus the tests Tasks 1, 2 and 5 added. Zero failed.
  3. `pnpm test:e2e`. Expected: 0 failed in chromium, firefox, webkit and chromium-touch, and no page errors. Record passed and skipped per project.
  4. `pnpm build`. Expected: OK. Then `grep -l "Chevron diamond" dist/assets/*.js`, which prints one bundle path: the fixtures ship in production. `grep -c "__cbpd" dist/assets/*.js` prints `0`: the test hook does not.
  5. `pnpm perf`. Expected: three `G9 {…}`, three `G9-packet {…}` and three `G9-worst {…}` lines. Take the median of the three runs for each value.
     - The typical case passes if its work median and inspector-to-paint are within +20% (the run-to-run noise recorded in G9) of the last recording, 27.9 ms and 29.7 ms. That means ≤ 33.5 ms and ≤ 35.6 ms.
     - The worst case passes if it stays within +20% of 199.8 ms.
     - Record `layersClickToPaintMs` as a new baseline.
     - A regression beyond that means profiling with `PERF_PROFILE=/tmp/g9.cpuprofile pnpm perf` before any fix. Any memoisation added must be justified in the G9 section (AGENTS.md).
  6. Contrast. Save the script below outside the repository, as `contrast.mjs` in the session scratchpad, and run `node <scratchpad>/contrast.mjs`. It is a one-off check, not a project file.

```js
// WCAG 2.x contrast of the shell spec §2.1 pairs in both themes: text ≥ 4.5, UI ≥ 3.
const T = {
  dark: { paste: '#1a1c20', panel: '#202328', raised: '#2a2e34', lineStrong: '#4a5059', text: '#e7e9ec', muted: '#8e96a1', acc: '#3d9bff', accInk: '#06121f', attn: '#f5b042', ok: '#46c07a', danger: '#ff6b5e', tipBg: '#2e3238' },
  light: { paste: '#e9ebee', panel: '#ffffff', raised: '#f0f2f4', lineStrong: '#c3c8cf', text: '#1c1f24', muted: '#6b7380', acc: '#1f6fe5', accInk: '#ffffff', attn: '#b86e00', ok: '#2fb36a', danger: '#c0392b', tipBg: '#2e3238' },
}
const lum = (hex) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m)
  return (x + 0.05) / (y + 0.05)
}
// [foreground, background, kind, where it is used]
const pairs = [
  ['text', 'panel', 'text', 'panel text'], ['text', 'raised', 'text', 'field values'], ['text', 'paste', 'text', 'canvas labels'],
  ['muted', 'panel', 'text', 'secondary text'], ['muted', 'raised', 'text', 'unit suffix in fields'], ['accInk', 'acc', 'text', 'primary buttons'],
  ['danger', 'panel', 'text', 'field errors, unsaved'], ['attn', 'panel', 'text', 'other-tab status text'], ['ok', 'panel', 'text', 'Saved text (if coloured)'],
  ['acc', 'panel', 'text', 'accent text'], ['#e7e9ec', 'tipBg', 'text', 'tooltip label'], ['muted', 'tipBg', 'text', 'tooltip hint line'], ['ok', 'tipBg', 'text', 'tooltip On'],
  ['acc', 'panel', 'ui', 'focus ring, active icon'], ['acc', 'raised', 'ui', 'focus ring on fields'], ['acc', 'paste', 'ui', 'frame, outline'],
  ['muted', 'panel', 'ui', 'idle icons'], ['lineStrong', 'panel', 'ui', 'separator, keycap edge (decorative)'], ['ok', 'panel', 'ui', 'Saved dot (with text)'], ['attn', 'paste', 'ui', 'snap guide'],
]
let failed = 0
for (const theme of ['dark', 'light']) {
  for (const [fg, bg, kind, use] of pairs) {
    const r = ratio(fg.startsWith('#') ? fg : T[theme][fg], T[theme][bg])
    const min = kind === 'text' ? 4.5 : 3
    if (r < min) failed++
    console.log(`${theme.padEnd(5)} ${kind.padEnd(4)} ${fg.padEnd(10)} on ${bg.padEnd(7)} ${r.toFixed(2).padStart(5)}:1 ${r >= min ? 'PASS' : 'FAIL'}  ${use}`)
  }
}
console.log(`${failed} below threshold`)
```

     Expected, as pre-computed while drafting this plan: `8 below threshold`. They are:
     - Dark:
       - `muted on tipBg` 4.31;
       - `lineStrong on panel` 1.94.
     - Light:
       - `muted on raised` 4.26;
       - `attn on panel` 3.99;
       - `ok on panel` 2.70, as text and as UI;
       - `muted on tipBg` 2.69;
       - `lineStrong on panel` 1.68.

     `lineStrong` (separators, keycap edges) is decorative, which WCAG 1.4.11 exempts. The Saved dot always sits beside the word "Saved", so it is not the sole indicator. These pairs are real text defects if the UI uses them as text:
     - the tooltip hint line (both themes);
     - the unit suffix in light fields;
     - the light `--attn` and `--ok` status text.

     The token values are approved design data (shell spec §2.1: exactly that table), so do not change them in this task. Record each failing, used pair in the final report's "Open items" with a passing replacement for the owner to approve, and apply it only after approval, by changing §2.1 first:
     - light `--muted` `#5f6773` (5.09:1 on `--raised`, 5.72:1 on `--panel`);
     - a tooltip hint colour of `#a9b0ba` (5.90:1 on `--tip-bg`), which needs a §2.1 amendment because it is a new value;
     - light `--attn` `#945800` (5.75:1);
     - light `--ok` `#1e8049` (4.95:1).

     To confirm which pairs are actually used as text, run `grep -n "color: var(--ok)\|color: var(--attn)\|color: var(--muted)" src/index.css` and check each selector against the pair list.
  7. **Keyboard-only walkthrough.** Use Chromium at 1440×900, with no pointer after the page loads. Record pass or fail for each row in the final report.
     1. Tab from the page start reaches the top bar's sidebar toggle first. Each focused control shows the 2 px `--acc` ring at a 2 px offset.
     2. Tab to the project name and press Enter. The menu opens on New project…. Arrow down to Keyboard shortcuts and press Enter: the sheet opens. Esc closes it and focus returns to the project name.
     3. `?` opens the sheet from the body; Esc closes it.
     4. Project menu → New project…, then Tab to the Checker card, Enter, Tab to Create, Enter. Checker loads.
     5. `Mod+\` collapses the left pane and again restores it. `Mod+Shift+\` does the same for the inspector. Focus a pane separator: ArrowLeft and ArrowRight resize it, and Enter collapses it (the library's keyboard resize).
     6. Tab to the icon column's Motifs tab and press Enter: the Motifs pane shows. Its Edit motif enters the checker motif. The pill's Done (Tab, Enter) pops out.
     7. Press `]`: the first object is selected, and the Layers row is highlighted and scrolled into view. Tab into the inspector and edit Width, then Enter: one history entry.
     8. Tab to a Points row's actions button, Enter, ArrowDown, Enter on Insert after: the point is added. Enter on a `Points` summary collapses it.
     9. Tab to the actions bar's Order menu and choose Bring to front by keyboard.
     10. Press X for the Crossing tool; the Crossings panel is reachable by Tab. With a band selected, the Over/Under control toggles with Enter and keeps focus.
     11. Press `Shift+T` to undock the tools: the floating tool bar is reachable by Tab. `Shift+T` docks them again.
     12. Esc, in order: it cancels a drawing, clears the selection, pops the edit context, then returns to the Select tool (V1 §7.4).
  8. **200% zoom.**
     - Automated: the new `a11y.spec.ts` test, above.
     - Manual, in Chrome, Firefox and Safari at 1440×900 with browser zoom set to 200%:
       - there is no horizontal page scroll;
       - the panes open as overlays, one at a time;
       - long names truncate with a tooltip;
       - the New Project dialog scrolls inside itself;
       - the inspector tables don't overflow.
  9. **Mod+R (shell spec §12.2).** This is a manual check; synthesised keys can't prove the page didn't reload. In each of Chrome, Firefox and Safari (macOS), on `pnpm preview`:
     - select a band and press `Mod+R`;
     - expected: a 2 × 2 Repeat appears, the tab does not reload, and the undo history is intact (`Mod+Z` undoes the Repeat).

     Record each engine's result. If any engine reloads, remove the binding and update the §12.2 row, as the spec directs. An agent cannot do this check; the owner does. Until they have, record "not run" and never "pass".

- [ ] **Step 14: Record the results.**
  - **`docs/decisions/2026-09-24-gates.md`:**
    - **G6.** Re-run `pnpm exec playwright test --project=chromium e2e/author`. In the G6 table, update the Actions column from the printed `G6 …` lines, and add this line under the table:

      > "Shell redesign (2026-09-25): `setBackground` became a two-action menu (open, pick), so D, E and F rose by 1; switches kept `check` at one action."

    - **Final verification run.** After the existing "Final verification run" section, append a `## Editor shell redesign verification run (<date>, <commit>)` section. Use the same table shape as the existing section, with these rows:
      - typecheck
      - unit
      - build
      - e2e per project
      - perf typical: work median, p95, commit, nudge, inspector, and Layers click to paint
      - perf packet scale
      - perf worst

      Fill in the recorded values, the machine and the load average. Then add one sentence comparing them with 2698014's row and giving the ±20% verdict from Step 13.5.
  - **`docs/decisions/2026-09-24-ipad-checklist.md`.** Append:

```markdown
## Editor shell redesign (shell spec, 2026-09-25)

Run on the same device, against `pnpm dev --host`, after the redesign merges.

| # | Item | Steps | Expected | Result (Pass/Fail) | Notes |
| --- | --- | --- | --- | --- | --- |
| 8 | Mod+R with a hardware keyboard | Select a band; press ⌘R. | A 2 × 2 Repeat appears; Safari does not reload (shell spec §12.2). | | |
| 9 | Long-press tooltip | Hold the Band tool button for about a second, then lift. | Its tooltip (Band, B, hint line) shows; the tool does not change; the next tap anywhere closes the tooltip (§12.3). | | |
| 10 | Narrow panes | Portrait orientation (under 1024 px): open Layers, then the inspector. | Each opens as an overlay; opening one closes the other; the canvas width does not change (§4). | | |
| 11 | Hit targets | Tap every icon-column button, the canvas controls, a point row's ⋯ menu, a switch. | Each is easy to hit (44 px or more) and does what its tooltip says (§5, V1 §7.4). | | |
| 12 | New Project fields | New project… → Checker → switch to in → type `11 3/4` in W → Create. | The on-screen keyboard offers `/` and space; the board is 298.45 mm wide (§10.2). | | |
| 13 | Theme | Cycle the theme button through Dark, Light and System with iPadOS in dark mode. | System follows iPadOS; no flash of the wrong theme on reload (§3). | | |
```

  - **`docs/decisions/2026-09-24-final-report.md`.** Insert before `## What the owner should do next`:

```markdown
## Editor shell redesign (2026-09-25)

Spec: `docs/superpowers/specs/2026-09-25-editor-shell-redesign-design.md`; plan: `docs/superpowers/plans/2026-09-25-editor-shell-redesign.md`. Presentation only: the document model, commands, geometry, input ownership and persistence are unchanged; the V1 amendments are logged in V1 §16.

- **Built:** a dark-first theme with a light option and a pre-paint theme script; resizable, collapsible panes (`react-resizable-panels`); an icon column with dockable tools; the Layers, Motifs and Wood panes; floating drawing, actions and canvas-control bars; the edit pill, frame and top-bar breadcrumb; tooltips with styled hotkeys and a shortcuts sheet; an inspector in sections and tables; a New Project dialog with the six fixtures as samples, now shipped in production.
- **Verification:** the results of the verification run are in `2026-09-24-gates.md` ("Editor shell redesign verification run"). Record the typecheck, unit, e2e-per-project and build results, and the perf medians against the previous run, here in one line each.
- **Keyboard-only walkthrough:** the 12 steps of the plan's Task 10 Step 13.7, each with its result. Record any failure as an open item.
- **200% zoom:** the automated `a11y.spec.ts` result, and the manual result per browser.
- **Contrast (shell spec §2.1):** decorative and exempt pairs: `--line-strong` on `--panel` (separators, keycap edges); the Saved dot (always beside its text). Below-threshold pairs used as text, pending the owner's decision on the proposed values:
  - the tooltip hint line (`--muted` on `--tip-bg`: 4.31 dark, 2.69 light; proposed `#a9b0ba`, 5.90);
  - the light unit suffix (`--muted` on `--raised`: 4.26; proposed light `--muted` `#5f6773`);
  - the light `--attn` text (3.99; proposed `#945800`);
  - the light `--ok` text (2.70; proposed `#1e8049`).
- **Mod+R (shell spec §12.2), checked by hand:**

  | Engine | Version | Repeat applied | Page reloaded |
  | --- | --- | --- | --- |
  | Chrome | | | |
  | Firefox | | | |
  | Safari (macOS) | | | |

  An empty row means not yet run. If any engine reloads, the binding is removed and §12.2 is updated.
- **G6:** D, E and F each report one more action, because the background is now a menu.
```

  Fill in every row that Step 13 produced. The Mod+R table stays empty until the owner runs it. Also add this item to `## What the owner should do next`:

  > "5. Run the Mod+R check in Chrome, Firefox and Safari and the new iPad rows 8–13; decide the four proposed contrast values."

  - **`AGENTS.md`.** In the "Where things are" table:
    - After the `| Editor state and history | src/editor/store.ts (spec §7.1) |` row, insert:

```markdown
| Shell layout, panes, narrow mode | `src/ui/App.tsx`, `src/editor/layout.ts` (persisted prefs: theme, left tab, tool dock), shell spec `docs/superpowers/specs/2026-09-25-editor-shell-redesign-design.md` |
| Top bar, project menu, New Project | `src/ui/TopBar.tsx`, `src/ui/ProjectMenu.tsx` (with the edit-context breadcrumb), `src/ui/NewProjectDialog.tsx` |
| Left column and panes | `src/ui/IconColumn.tsx`, `src/ui/ToolButtons.tsx`, `src/ui/LeftPane.tsx`, `src/ui/LayersPane.tsx`, `src/ui/MotifsPane.tsx`, `src/ui/WoodPane.tsx` |
| Floating canvas bars | `src/ui/ActionsBar.tsx`, `src/ui/DrawingBar.tsx`, `src/ui/ToolBar.tsx` (undocked tools), `src/ui/CanvasControls.tsx`, `src/ui/EditPill.tsx` |
| Inspector panels | `src/ui/Inspector/` (`Section.tsx`, `Switch.tsx`, `PointRow.tsx` points table, `CrossingsPanel.tsx`) |
| Shortcut table and tooltips | `src/editor/shortcuts.ts` (display only; dispatch stays in `src/editor/keyboard.ts`), `src/ui/Hint.tsx`, `src/ui/Keycap.tsx`, `src/ui/ShortcutsDialog.tsx` |
| Design tokens | `src/index.css` (shell spec §2.1), `src/ui/theme.ts`, the pre-paint script in `index.html` |
```

    - In the "Commands" block, change `pnpm dev  # http://localhost:5173, development build (fixture loader + window.__cbpd test hook)` to:

      ```
      pnpm dev  # http://localhost:5173, development build (window.__cbpd test hook)
      ```

      The samples are in New project… in every build.

- [ ] **Step 15: Final gate, then commit the records.** Run:

  `pnpm typecheck && pnpm test && pnpm exec playwright test e2e/new-project.spec.ts e2e/persistence.spec.ts e2e/a11y.spec.ts`

  Expected: green. Then:

```bash
git add docs/decisions/2026-09-24-gates.md docs/decisions/2026-09-24-final-report.md docs/decisions/2026-09-24-ipad-checklist.md AGENTS.md
FSH_NO_TTY=1 git commit -m "Record shell redesign verification results" -m "Shell spec 16 other checks: the perf re-run with the Layers pane open, the keyboard walkthrough, 200% zoom and contrast results, and the manual Mod+R and iPad rows the owner still has to run, so the redesign's gates are evidenced like V1's."
```
