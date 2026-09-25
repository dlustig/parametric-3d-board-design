# Editor Shell Redesign — SPEC

Status: draft 2. It incorporates a completeness review and an ai-slop review; both are summarised in §18. This is a companion to the V1 spec (`2026-09-24-cutting-board-pattern-designer-design.md`, "V1" below). It rebuilds the editor's presentation: theme, layout, panels, toolbars, tooltips and the New Project flow. The document model, commands, geometry, compositing, input ownership and persistence stay exactly as V1 defines them, except for the amendments in §14, which are also logged in V1 §16.

The approved mockups are in `.superpowers/brainstorm/2158829-1790343557/content/` (`workbench-v2.html` … `workbench-v4.html`). They are not committed. Where this text and a mockup disagree, this text wins.

## 1. Goals and non-goals

**Goals.**

- The editor is dark by default, with a light option.
- It is calm and modern, and can be learned without reading anything.
- Every icon explains itself with a tooltip that shows its hotkey.
- Both side panels can be resized. The left one collapses to an icon column; the right one hides completely.
- Tools can be docked in the left column or undocked to a floating bottom bar.
- The project's structure is visible as a list, not only on the canvas.
- It stays usable on an iPad.

**Non-goals.**

- **Unchanged:** the document schema, commands, geometry, crossing semantics, the input ownership table (V1 §7.2), keyboard dispatch rules (V1 §7.4), autosave and export.
- **Not included:**
  - a command palette;
  - drag-reordering in the Layers list;
  - visibility or lock toggles;
  - placing a motif from the library;
  - rulers;
  - a canvas context menu;
  - user-chosen accent colours.

## 2. Visual system

### 2.1 Colour tokens

The tokens are defined once in `src/index.css` as custom properties on `:root[data-theme="dark"]` and `:root[data-theme="light"]`. `data-theme` always holds the resolved value, `dark` or `light` (§3). Components and overlays use tokens only. The one exception is the theme-independent contrast pair `#ffffff` / `#1a1a1a`, which overlays may use where a mark has to read on any wood (§9.8).

| Token | Dark | Light | Use |
| --- | --- | --- | --- |
| `--paste` | `#1a1c20` | `#e9ebee` | Canvas pasteboard; the Board-view mat colour (V1 §7.8) |
| `--panel` | `#202328` | `#ffffff` | Top bar, sidebars, floating bars, menus, dialogs |
| `--raised` | `#2a2e34` | `#f0f2f4` | Fields, hovered rows and buttons, chips, segmented controls |
| `--line` | `#32363d` | `#dfe2e6` | Borders and dividers |
| `--line-strong` | `#4a5059` | `#c3c8cf` | Icon-column separator, keycap edges |
| `--text` | `#e7e9ec` | `#1c1f24` | Primary text and active icons |
| `--muted` | `#8e96a1` | `#6b7380` | Secondary text, idle icons, units |
| `--acc` | `#3d9bff` | `#1f6fe5` | Selection, active tool, focus ring, primary button |
| `--acc-ink` | `#06121f` | `#ffffff` | Text on `--acc` |
| `--acc-soft` | `rgb(61 155 255 / 16%)` | `rgb(31 111 229 / 11%)` | Active tool and selected-row backgrounds |
| `--attn` | `#f5b042` | `#b86e00` | Swapped and needs-attention crossing states (§9.6), snap guide |
| `--ok` | `#46c07a` | `#2fb36a` | Saved dot, "On" in tooltips |
| `--danger` | `#ff6b5e` | `#c0392b` | Field errors, unsaved status |
| `--tip-bg` | `#2e3238` | `#2e3238` | Tooltip surface (dark in both themes) |
| `--shadow` | `0 8px 24px rgb(0 0 0 / 35%)` | `0 8px 24px rgb(20 30 50 / 12%)` | Floating bars, menus, dialogs |

The accent is blue because every starter wood is warm, so a blue selection never merges with a material. `--attn` carries crossing state, so that state never relies on the accent alone.

### 2.2 Type

IBM Plex Sans, self-hosted through `@fontsource/ibm-plex-sans` at weights 400, 500 and 600, so it works offline and makes no third-party request. Fallback: `system-ui, sans-serif`.

- **Sizes:** 13 px in panels; 12 px for secondary text and units; 16 px for dialog titles.
- **Numbers:** `font-variant-numeric: tabular-nums` on every numeric field and read-out.
- **Case:** sentence case everywhere; no all-caps labels.

### 2.3 Shape, spacing, motion

- **Radii:** 6 px for fields and small buttons, 8 px for icon buttons, 10–12 px for floating bars and menus, 14 px for dialogs.
- **Spacing:** a 4 px grid.
- **Focus:** a 2 px `--acc` outline with a 2 px offset, on `:focus-visible` only.
- **Motion:** it only answers an action. Menus and tooltips fade in over 100 ms. Pane collapse and expand are instant, as the panel library does them.
- **Reduced motion:** under `prefers-reduced-motion: reduce`, transitions are none.

### 2.4 Icons

Icons come from `lucide-react`, imported per icon, rendered at `strokeWidth={1.6}` and 18 px in toolbars.

`src/ui/icons.tsx` holds only the four domain glyphs Lucide lacks: **Band**, **Crossing**, **Motif** (also used for Make motif and Edit motif) and **Repeat**. They are drawn on the same 24-unit, `currentColor`, 1.6-stroke, round-cap grid, matching the mockups.

The Lucide choices:

| Use | Lucide icon |
| --- | --- |
| Select | `MousePointer2` |
| Hand | `Hand` |
| Rectangle | `Square` |
| Polygon | `Pentagon` |
| Layers | `Layers` |
| Motifs tab | the custom Motif glyph |
| Wood | `Palette` |
| Undock | `PictureInPicture2` |
| Dock | `PanelLeft` |
| Undo, Redo | `Undo2`, `Redo2` |
| Sidebar toggles | `PanelLeft`, `PanelRight` |
| Theme | `Moon`, `Sun`, `SunMoon` |
| Snap | `Magnet` |
| Show grid | `Grid3x3` |
| Add to selection | `SquarePlus` |
| Zoom | `ZoomOut`, `ZoomIn` |
| Fit | `Scan` |
| Duplicate | `CopyPlus` |
| Copy | `Copy` |
| Paste | `ClipboardPaste` |
| Mirror | `FlipHorizontal2`, `FlipVertical2` |
| Rotate | `RotateCcw`, `RotateCw` |
| Order | `ArrowUpDown` |
| Detach | `Unlink` |
| Delete | `Trash2` |
| Cancel | `X` |
| Menus | `ChevronDown`, `ChevronRight`, `ArrowLeft`, `Ellipsis`, `Plus` |
| Project menu | `FilePlus`, `FolderOpen`, `Download`, `FileOutput`, `PencilLine`, `Keyboard` |
| Crossing hover glyph | `ArrowLeftRight` |
| Needs attention | `TriangleAlert` |

## 3. Theme

- **Preference:** `theme: 'dark' | 'light' | 'system'`, default `'dark'`. It persists in the layout store (§11).
- **Resolving:** `'system'` resolves through `matchMedia('(prefers-color-scheme: dark)')`, live.
- **No flash:** an inline script in `index.html` reads the persisted preference, resolves it, and sets `document.documentElement.dataset.theme` and `style.colorScheme` before first paint. After that, a small effect in `App` keeps the attribute in sync with the store and the media query.
- **Theme button:** in the top bar, it cycles Dark → Light → System. Its icon shows the current preference (`Moon`, `Sun`, `SunMoon`). Its tooltip names the current preference and the next one, for example "Theme: Dark · Click for Light".
- **Canvas:** the mat (V1 §7.8) paints `var(--paste)`. Material colours are document data and are never themed.

## 4. Shell layout

```
┌──────────────────────────── top bar 44 px ─────────────────────────────────┐
│[⊟] Basket weave ▾  ● Saved  notice…            [↶][↷] | [☾] [Export SVG] [⊟]│
├──────────────────────── recovery banner (when present) ────────────────────┤
├────┬───────────────┬────────────────────────────────────┬─────────────────┤
│tabs│ left pane     │ canvas                             │ inspector       │
│ ── │ (resizable)   │   floating: edit pill, drawing or  │ (resizable,     │
│tool│               │     actions bar, canvas controls,  │  hideable)      │
│ …  │               │     undocked tool bar              │                 │
│ ⤓  │               │                                    │                 │
└────┴───────────────┴────────────────────────────────────┴─────────────────┘
 52 px   200–400 px                 fills the rest            248–440 px
```

- **App grid:** rows `44px auto 1fr` (top bar, recovery banner, body). Body columns are `52px 1fr`: the icon column, then a horizontal panel `Group` from `react-resizable-panels` (^4.13), laid out as
  `[left Panel] [Separator] [canvas Panel] [Separator] [inspector Panel]`.
- **Panel settings:**
  - Both side Panels are `collapsible` with `collapsedSize="0px"`, and the Group uses `groupResizeBehavior="preserve-pixel-size"`, so a pane keeps its width when the window resizes.
  - Left: `min 200px`, `max 400px`, `default 240px`.
  - Inspector: `min 248px`, `max 440px`, `default 280px`.
- **Persistence:** sizes and collapsed state persist through `useDefaultLayout({ id: 'cbpd-shell', onlySaveAfterUserInteractions: true })`.
- **The library owns** dragging, clamping, double-click reset, keyboard resize and the separators' ARIA.
- **We add styling only.** A separator shows a 2 px `--acc` line on hover and while dragging, styled with `[data-separator]`.
- **Recovery banner** (V1 §9): a `--raised` strip with an `--attn` left border.
- **Narrow viewports.** Below 1024 px, the side panes are rendered outside the `Group`:
  - they are absolutely positioned overlays at their persisted widths, with `--shadow`;
  - opening one closes the other;
  - both start closed.

  The canvas then fills the body beside the icon column.

### 4.1 Toggling

- **Left pane:**
  - toggled by the top-bar sidebar button, by `Mod+\`, or by clicking the already-active tab in the icon column;
  - clicking an inactive tab while the pane is collapsed opens the pane on that tab;
  - toggles call the Panel handle's `collapse()` / `expand()`;
  - the icon column itself never collapses.
- **Inspector:** toggled by the top-bar inspector button or `Mod+Shift+\`.

## 5. Icon column (left, 52 px)

Top to bottom:

1. **Pane tabs:** Layers, Motifs, Wood, as 36 px icon buttons. The active tab shows `--acc-soft` with an `--acc` icon, and has `aria-pressed`.
2. **Separator:** 2 × 32 px, `--line-strong`, 8 px vertical margin, `role="separator"`.
3. **Tools** (while docked): Select, Hand, Band, Rectangle, Polygon, Crossing.
4. **Current-wood chip:** below the tools. A 30 px button with a 16 px round swatch of `currentMaterialId`. It opens the Wood pane, and its accessible name is "Current wood: <name>".
5. **Undock tools:** after flexible space, a 28 px button at the foot. It is hidden while the tools are undocked.

On `(pointer: coarse)`, every icon button's hit area is at least 44 × 44 px (V1 §7.4). The column is then 56 px wide, and the icons keep their visual size.

## 6. Left panes

Each pane has a 40 px title row: its name, plus pane-specific controls on the right. Each pane scrolls independently.

### 6.1 Layers

**What it lists:** the current context's children (the root, or the entered definition), in paint order, topmost first.

**Rows:**

- **Band or Region:** a material swatch, the type name, and the material name on the right.
- **Instance:** the Motif glyph, the motif name, and "Instance" on the right.
- **Repeat:** the Repeat glyph, the motif name, and "rows × columns" on the right.

**Board header:** at the root, a **Board** header row shows the background material name. It sits above the listbox as its visible label (`aria-labelledby`), not as an option.

**Interaction:**

- Click selects.
- Shift-click, Mod-click, or click with Add to selection on toggles, as in V1 §7.4.
- Double-click an Instance or Repeat row enters its definition at that object (the same single-step `enterContext` that `InstancePanel` uses today).
- Selection syncs both ways with the canvas, and the selected row scrolls into view.

**ARIA:** rows are `role="option"` in a `role="listbox"` with `aria-multiselectable="true"`. Each row's accessible name is its visible text, for example "Band, Walnut".

**In an edit context:**

- The title row shows a back button (`aria-label="Back to <parent name>"`), which pops one level, followed by the motif name.
- A muted line reads "Changes apply to all N occurrences" (omitted when N = 1), where N = `occurrencePaths(project, motifId).length` (§6.4).
- There is no Board header.

### 6.2 Motifs

One row per `project.motifs` entry, in document order. Each row has:

- **A 40 px thumbnail:** the definition's painted bounds, drawn with `SceneSvg` from `buildScene` on a copy of the project whose root holds only one identity instance of the motif and whose root crossing records are cleared.
- **The name.**
- **A muted usage line:** "Used N times" (N = `occurrencePaths(…).length`), or "Not placed" when N = 0.

**Row actions:**

- **Edit motif:** enters the first occurrence (§6.4). When N = 0 it is disabled, with the reason "Not placed on the board".
- **Rename:** an inline text field, following the V1 §7.5 text-field rules.

Motifs are not created or deleted here.

### 6.3 Wood

The materials palette (V1 §3) moves here with unchanged behaviour:

- the current-material highlight;
- click semantics by selection mode;
- the "Edit the motif to recolour" note;
- the per-material editor popover;
- Add material.

**Layout:**

- One row per material: a 28 px swatch, the name, and the usage count on the right.
- Each row also has an **Edit <name>** icon button. The swatch button's accessible name stays the material name.
- The title row holds **Add material**.

### 6.4 Entering a definition from a list

- **`occurrencePaths(project, motifId): Step[][]`:** `placementsOf` in `src/geometry/scene.ts` is exported under this name, built from the committed scene's occurrences. It returns one world path per occurrence of the definition. Every repeat cell counts as an occurrence.
- **`contextLevelsForPath(project, path): EditContextLevel[]`** (new, `src/editor/selection.ts`): splits a world path into the per-level, context-relative `EditContextLevel`s that `editContext` stores.
- **Entering from a pane** (Motifs → Edit motif, Crossings → Show in §9.6):
  - replaces the whole `editContext` in one store update;
  - clears the selection;
  - uses `contextLevelsForPath(project, occurrencePaths(project, motifId)[0])`;
  - then applies V1 §7.6's rules as if the user had entered level by level.

  This needs a store action `setEditContext(levels)` next to `enterContext` and `popContext`. It writes only ephemeral state.

## 7. Tools

### 7.1 Docked and undocked

- **Docked** (default): the tools sit in the icon column (§5).
- **Undocked:** they sit in a floating bar centred 14 px above the canvas's bottom edge. The bar holds:
  1. Select, Hand
  2. Band, Rectangle, Polygon, Crossing
  3. the current-wood chip, showing the swatch, the name and `lastBandWidthMm`, for example "Walnut · 16 mm"
  4. **Dock tools**

  Tool buttons in the bar are 40 px.
- **Switching:** Undock tools / Dock tools, or `Shift+T`, switches between the two. The choice persists.
- **Behaviour:** tools behave as V1 §7.4 says, unchanged.

### 7.2 Canvas controls

- **Contents:** a floating bar with Snap, Show grid and Add to selection (toggles, `aria-pressed`), then Zoom out, a zoom read-out, Zoom in and Fit.
- **Position:** bottom-right while the tools are docked. While undocked, it is a vertical bar at the top-right.
- **Zoom read-out:** the camera zoom relative to the Fit zoom, as a percentage. Clicking it runs Fit.

## 8. Top bar

Left to right:

- **Sidebar button:** toggles the left pane; pressed while the pane is open.
- **Project name button:** the name plus a chevron. It opens the project menu (§10.1).
  - In an edit context this becomes a breadcrumb: the project name, then each entered motif's name, separated by chevrons.
  - Clicking an earlier level pops back to it; the last level is plain text.
  - The menu stays on the project name.
- **Save status:** a 6 px dot plus text.
  - **Saved** (`--ok`).
  - **Not saved in this browser** (`--danger`), with an inline **Download** button (V1 §9).
  - **Project changed in another tab** (`--attn`), also with an inline **Download** button.
- **Notice:** the store's `message`, muted and truncated, with the full text in its tooltip. This is the only place `message` renders, as it is in `StatusBar` today.
- *(flexible space)*
- **Undo** and **Redo:** disabled when their history is empty.
- *(a divider)*
- **Theme** (§3).
- **Export SVG:** the primary button.
- **Inspector button:** toggles the inspector; pressed while it is open.

The top bar replaces the `ProjectMenu` button row and `StatusBar`.

## 9. Canvas

### 9.1 Board dimensions

- **Labels:** outside the Board's top and left edges, labels show its width and height in display units, formatted as in V1 §8. Each is centred on a `--line` hairline.
- **Drawing:** they are drawn in screen space from the Board's projected rectangle.
- **Hiding:** they are hidden when the Board is under 80 px on screen.

### 9.2 Grid

- **Show grid** draws the V1 §7.7 grid, clipped to the Board rectangle.
- The stroke is `var(--muted)` at 30% opacity.
- Snapping is unchanged and is not clipped.

### 9.3 Drawing bar (Band, Polygon, Rectangle)

The V1 tool options move into a floating bar centred 12 px below the canvas's top edge. Its contents depend on the tool:

- **Band:** the current-wood chip | Width | Length | Angle | Undo point | Cancel | **Finish** (primary). Cancel is an `X` icon button with the keycap Esc.
- **Polygon:** the same, without Width.
- **Rectangle:** the chip and the hint "Drag corner to corner".

What stays the same:

- Field labels, typed-value behaviour and key handling.
- The accessible names: **Finish**, **Undo point**, **Cancel**.

The preview:

- **Band:** drawn at its real width in its material colour. Placed segments are at 85% opacity and the pending segment at 45%, with miter joins and butt caps.
- **Polygon:** its fill at 45% with a 1 px `--acc` outline.
- **Point dots and the length/angle label:** `--acc`, with a white halo.

### 9.4 Actions bar (Select tool)

**When it shows:** while the Select tool is active and nothing is being drawn. Its position is centred 12 px below the canvas's top edge.

**With a selection:**

- A count read-out: "1 band", "3 objects".
- Duplicate, Copy, Paste.
- Mirror X, Mirror Y, Rotate 90° CCW, Rotate 90° CW.
- An **Order** menu: Bring forward, Send backward, Bring to front, Send to back.
- **Make motif**, **Repeat**.
- **Edit motif** (a single Instance or Repeat).
- **Detach** (a single Instance only, V1 §5.6).
- **Delete**.

**With an empty selection:** only Paste.

**Paste state:** Paste is disabled, with the reason "Copy something first", when nothing has been copied. To make that observable, the clipboard moves from the module variable in `keyboard.ts` into the editor store as ephemeral `clipboard: Clipboard | null`. It is written by copy, and not reset by `replaceProject` (the same lifetime as today).

**Layout:** the bar is `max-width: calc(100% - 24px)` with `flex-wrap: wrap`. On a narrow canvas, groups wrap to a second row.

**What it replaces:** the Selection panel's button rows, and the rail's Paste, Create Motif and Repeat. "Create Motif" is labelled **Make motif** everywhere.

### 9.5 Empty board

When the project has no objects, the context is the root and nothing is being drawn:

- The Board shows "Draw your first band" and then "Press B, then tap to place points. Double-tap to finish.", with B as a keycap.
- The Band tool button gets a 1.5 px `--acc` inset outline.

Both disappear when the first object is drawn.

### 9.6 Crossing tool

- **Wash:** the scene draws under an 18% `--paste` wash, so the markers read.
- **Markers:** V1's classes and hit radii (12 px mouse, 22 px touch) are kept. Each is drawn as:

  | Class | Appearance |
  | --- | --- |
  | Eligible | an 18 px disc filled with `--acc`, with a 2 px `#ffffff` ring |
  | Overridden | the eligible marker plus a 2 px `--attn` outer ring |
  | Unsupported | a hatched disc, `--muted` on `#ffffff` |
  | Unresolved | a hollow 2.5 px `--attn` ring |

- **Hover** (fine pointer only):
  - The marker grows to 26 px and shows `ArrowLeftRight`.
  - A tooltip reads "<over material> over <under material>", with a **Click** keycap and the hint "Click to put <under material> on top".
  - An unsupported marker's tooltip gives its reason instead.
- **Touch** keeps V1's tap behaviour.
- **Drawing-bar position:** it holds the scope segmented control (**All instances** / **This occurrence**, under V1's rule), then the legend (Can swap, Swapped, Can't swap, and "N unresolved" when N > 0), then `crossingNotice` or the default hint.
- **Inspector, when the tool is active and nothing is selected:** a **Crossings** panel. It has:
  - the total count;
  - **Needs attention**, with an `--attn` left border. It lists unresolved records, each with **Show** and **Remove**. **Show** enters the record's context (§6.4, when the record is not at the root) and selects the top-level object of its first band reference in that context. **Remove** is the existing unresolved-record removal.
  - **Swapped**, a list of the overridden records;
  - **Can't swap**, a count with the reasons grouped.

### 9.7 Edit context

- **Frame:** a 2 px inset `--acc` frame around the canvas.
- **Pill:** centred 12 px below the canvas's top edge. It shows the Motif glyph, "Editing <motif name>", "· N occurrences" (omitted when N = 1), and **Done** (primary; keycap Esc).
  - It replaces `Breadcrumb`.
  - It is a `nav` landmark labelled "Edit context".
- **Stacking:** a drawing bar or actions bar sits 8 px below the pill.
- **Scrim:** V1 §7.6's scrim and redraw stay, with the scrim colour `--paste` at 62%.
- **Entered occurrence:** it gets a dashed `--acc` outline of its painted bounds.

### 9.8 Overlay colours

Overlays read tokens with `var(--…)` through `style` or classes, and follow `data-theme` without re-rendering:

| Overlay | Colours |
| --- | --- |
| Selection outline | the V1 double stroke: `#ffffff` over `var(--acc)` |
| Vertex handles | `#ffffff` fill, `var(--acc)` stroke |
| Pivot | unchanged: `#ffffff` over `#1a1a1a` |
| Draw preview | as §9.3 |
| Snap guide | `var(--attn)` |
| Grid | as §9.2 |

No other hex literals remain in `src/render/overlays/`.

## 10. Project menu, New Project, shortcuts sheet

### 10.1 Project menu

A Radix DropdownMenu on the project name. The items:

1. New project…
2. Open project… (`Mod+O`)
3. Download project (`Mod+S`)
4. *(divider)*
5. Rename
6. Export SVG (`Mod+Shift+E`)
7. *(divider)*
8. Keyboard shortcuts (`?`)

**Rename** turns the project name button into a text field labelled **Name**, following the V1 §7.5 text-field rules. The Board panel loses its Name field.

**Open project** keeps V1 §9's confirmation ("Open a project?") and its failure behaviour.

### 10.2 New Project dialog

**Contents:**

- The title "New project", and the line "Start from a blank board or one of the sample patterns. You can change the size later."
- A grid of seven cards: **Blank**, plus the six fixtures (Stripes, Checker, Basket weave, Chevron diamond, Isometric, Interlace). Each card has a thumbnail rendered once from its project with `buildScene` + `SceneSvg`.
- W and H fields, and a mm/in segmented control. They are prefilled from the chosen card; Blank uses `newProject(currentDisplayUnits)`.
- **Cancel**, and **Create** (primary).

**Units and size:**

- Values are held in mm. Toggling units re-renders the fields in the new unit without changing the mm values.
- On **Create**, Blank uses `newProject(chosenUnits)`. A sample uses a deep clone of its fixture, then `setDisplayUnits` if the chosen units differ.
- Then `setBoardSize` runs if W or H differs from the board in mm.
- The result goes to one `replaceProject`, and history clears as it does today.

**When the current project is not blank:** a line above the buttons reads "This replaces the current project. Download it first to keep a copy." It has an inline **Download project** button.

**What it replaces:** the dialog is New's confirmation, so V1 §9's separate New confirmation ("Start a new project?") is dropped. Open keeps its confirmation.

**Fixtures:**

- They ship in the production bundle.
- The dev-only fixture loader in the tool rail is removed.
- `window.__cbpd.loadFixture` stays for tests.

### 10.3 Keyboard shortcuts sheet

- **Opening:** a Radix Dialog, opened by `?` or from the menu.
- **Contents:** every `SHORTCUTS` entry (§12.1), grouped as Tools, Selection, Drawing, View, Project and Panels.
- **Keycaps:** the same `Keycap` component the tooltips use.

## 11. State and storage

**Layout store.** `src/editor/layout.ts` is a separate Zustand store, wrapped in `persist({ name: 'cbpd:prefs', version: 1 })`. It holds:

| Field | Default |
| --- | --- |
| `theme` | `'dark'` |
| `leftTab` | `'layers'` |
| `toolsDocked` | `true` |

**Why separate:** these values outlive a project and must never enter undo history.

**Storage:** it uses `createJSONStorage` over a storage object whose `setItem` swallows exceptions. A failed prefs write is ignored and never touches `saveStatus`.

**What persists where:**

- Pane sizes and collapsed state persist through `useDefaultLayout` (§4). The default is both panes open.
- Narrow-viewport overlay state is not persisted.

**Editor store changes:** it gains only `clipboard` (§9.4) and the `setEditContext` action (§6.4). Tool, selection, snap, grid and Add to selection keep their V1 homes and reset rules.

## 12. Tooltips and the shortcut table

### 12.1 One table for display

`src/editor/shortcuts.ts` exports `SHORTCUTS`, a const record:

```
{ [id]: { label, keys: Chord[], hint?, group } }
```

A chord is platform-neutral: `'Mod+G'`, `'Shift+T'`, `'B'`, `'Space'`, `'Alt'`, `'?'`, `'Mod+\\'`.

**Who reads it:** `Hint` and the shortcuts sheet.

**The dispatcher:** `keyboard.ts` keeps its V1 dispatch logic: the field exemption, exact modifiers, the Esc order, drawing precedence, and `cyclingOwnsFocus` for `[` and `]`. Where it is a direct substitution, it reads `TOOL_KEYS` and the new bindings from this record. New bindings are added to the dispatcher with two matching rules:

- `?` matches `e.key === '?'` with Shift ignored.
- The `\` chords match `e.code === 'Backslash'`, so that `Mod+Shift+\` works when `e.key` is `|`.

**`formatChord(chord, platform)`:**

- On macOS (`navigator.userAgentData?.platform ?? navigator.platform` matching `/mac|iphone|ipad/i`), Mod renders as ⌘, Alt as ⌥, and Shift as ⇧.
- Elsewhere they render as Ctrl, Alt and Shift.

### 12.2 New bindings

| Action | Keys | Note |
| --- | --- | --- |
| Toggle sidebar | `Mod+\` | |
| Toggle inspector | `Mod+Shift+\` | |
| Dock / undock tools | `Shift+T` | |
| Repeat | `Mod+R` | `preventDefault`s browser reload. Synthesised test keys can't prove the browser didn't reload, so this is checked by hand in Chrome, Firefox and Safari and recorded in the final report. If any engine still reloads, the binding is removed and this row is updated. |
| Open project | `Mod+O` | |
| Download project | `Mod+S` | |
| Export SVG | `Mod+Shift+E` | |
| Keyboard shortcuts | `?` | |

`Mod` means Ctrl on Windows and Linux, and ⌘ on macOS, the same as V1's existing chords.

### 12.3 Tooltip component

`src/ui/Hint.tsx` wraps Radix Tooltip.

**Content:**

- The label on the left and keycaps on the right. The keycaps come from a `SHORTCUTS` id, or are passed explicitly for controls that have no entry, such as "Click".
- An optional hint line in `--muted`.
- For toggles, the state after the label: "On" in `--ok`, or "Off".
- For disabled controls, the reason as the hint line. The trigger wraps the disabled button so the tooltip can still open.

**Look:**

- A `--tip-bg` surface with an 8 px radius, 6/8 px padding, 12 px weight-500 text, and `--shadow`.
- It opens to the right of icon-column buttons, above bottom-bar buttons, and below top-bar buttons.

**Keycaps** (`src/ui/Keycap.tsx`):

- At least 19 × 19 px, with a 5 px radius and 10.5 px weight-600 text.
- A `#3a3f47` fill and a `#4a5059` border, 2 px thick at the bottom.
- Inside menus they are muted to `--raised` and `--muted`.

**Timing:** `Tooltip.Provider delayDuration={400} skipDelayDuration={300}`.

**Touch:**

- On `pointerType === 'touch'`, holding a Hint trigger for 500 ms or more shows the tooltip and suppresses that press's click.
- The next pointerdown anywhere closes it.
- Triggers set `-webkit-touch-callout: none` and `user-select: none`.

**Coverage:** every icon-only control has a Hint.

**Tool hints:**

| Tool | Hint line |
| --- | --- |
| Select | "Tap to select. Drag empty space to box-select." |
| Hand | "Drag to pan. Or hold Space." |
| Band | "Draw a strip of wood. Tap to place points." |
| Rectangle | "Drag corner to corner." |
| Polygon | "Tap to place corners. Tap the first to close." |
| Crossing | "Choose which band is on top where two cross." |

## 13. Inspector

Routing stays as in V1 §7.5.

**Header:**

- A 16 px swatch for Bands and Regions, or a type icon for the others.
- The type name, 13 px weight 600.
- A muted note: "in <motif name>" inside an edit context, or "3 objects" for a multi-selection.
- No action buttons.

**Sections:**

- Each section has a 12 px weight-600 title, 10/12 px padding and a `--line` bottom border.
- **Points**, **Segments**, **Crossings** and **Overrides** are `<details open>`, with the title as their `<summary>` and a CSS chevron.
- Collapsed state is not persisted.

**Numeric fields:**

- `NumberField` keeps its behaviour and its `<label>` text.
- Visually, it is a `--raised` box with the unit as a muted suffix.
- In two-column grids, a compact visible prefix (X, Y, W, H, or a rotate icon) is shown; the full label stays the accessible name.
- Errors appear below the field in `--danger`.

**Panels:**

- **Board:**
  - **Size:** W and H.
  - **Background:** a select showing each wood's swatch and name.
  - **Units & grid:** a mm/in segmented control and Grid spacing.
- **Selection:** X, Y, Rotate by. Its buttons move to the actions bar (§9.4).
- **Band:**
  - **Band:** Material, Width, and Closed (a switch).
  - **Offset copy:** width, **Left** and **Right**. Their accessible names stay "Offset copy left" and "Offset copy right".
  - **Points:** a table of #, X and Y. Each row's More menu has Insert after and Delete.
  - **Segments:** a table of #, Length and Angle.
  - **Crossings:** V1's list, with the over/under button restyled as an Over/Under segmented control. Accessible names are unchanged.
- **Region:** Material, W/H of the bounds, and a Points table.
- **Instance:**
  - Motif name, X, Y, Rotation, Mirror X/Y, Scale, and the world-width read-out.
  - **Edit motif** and **Detach** buttons.
  - The Overrides list.
- **Repeat:** the V1 fields, grouped:
  - **Grid:** Rows, Columns, Step X/Y.
  - **Offsets:** each with its ½ step button.
  - **Alternation:** switches.
  - **Transform.**
  - **Edit motif**, and the Overrides list.

## 14. Amendments to V1

Each is logged as a row in V1 §16, and the V1 text points here.

| V1 section | Change |
| --- | --- |
| §7.4 | **Rail:** it becomes the icon column or the undocked tool bar (§5, §7.1). **Toggles:** Snap, Show grid and Add to selection move to the canvas controls (§7.2). **Actions:** Paste, Create Motif (renamed **Make motif**) and Repeat move to the actions bar (§9.4). **Kept:** targets of 44 px or more on coarse pointers, and Finish / Undo point / Cancel (§9.3). **New bindings:** §12.2. |
| §7.5 | **Materials palette:** moves to the Wood pane (§6.3). **Board Name:** moves to the top-bar Rename (§10.1). **Selection panel buttons:** move to the actions bar. **Panels:** restyled (§13). |
| §7.6 | **Breadcrumb:** becomes the edit pill (§9.7) plus the top-bar breadcrumb (§8). **Scrim colour:** `--paste`. **Entering from lists:** replaces the whole stack (§6.4). |
| §7.7 | **Grid:** drawn clipped to the Board (§9.2). |
| §7.8 | **Mat colour:** `--paste`. **Selection outline:** its dark stroke is `--acc`. |
| §9 | **New Project:** confirmed by the New Project dialog (§10.2). |
| §11 | **Accessibility additions:** tooltips and the shortcuts sheet (§12), separators (§4), the Layers listbox (§6.1). |
| §12 | **Fixtures A–F:** ship in production as New Project samples. |

## 15. Dependencies

Added:

- `react-resizable-panels` ^4.13 (§4)
- `lucide-react` (§2.4)
- `@fontsource/ibm-plex-sans` (§2.2)
- `@radix-ui/react-dropdown-menu`, for the project menu, the Order menu and the point-row menus

Already present: Radix Tooltip, Popover, Dialog, and Zustand (`persist`).

## 16. Testing

### E2E baseline

All four Playwright projects move from 1000×800 to 1440×900, so both panes can be open beside a usable canvas. The narrow layout is covered explicitly by `shell.spec.ts` and one `tablet.spec.ts` case, both at 820×1180.

### Unit (Vitest)

- **`shortcuts.test.ts`:**
  - For each `SHORTCUTS` entry that `keyboard.ts` dispatches, dispatching its chord produces the entry's effect. Space (Canvas-owned, V1 §7.2) and Alt (snap suspension) are listed as display-only and excluded.
  - `formatChord` on mac and non-mac.
- **`selection.test.ts`** (extend it): `contextLevelsForPath` covers root, a nested instance, a repeat cell inside an instance, and a round trip with `contextPrefix`.
- **`scene.test.ts`** (extend it): `occurrencePaths` counts every repeat cell and nested placement, and returns `[]` for an unplaced motif.

### Existing e2e updates

These are expected. G6 action counts rise where an action now sits in a menu.

- **Menu items:** New, Open and Download become project-menu items. "Start a new project?" becomes the New Project dialog.
- **Name:** moves to the top-bar Rename.
- **Order:** "To back" and its siblings become Order menu → "Send to back".
- **Repeat:** buttons in `banner` move to the actions bar, which is a `toolbar` named "Selection actions".
- **Edit context:** the landmark stays a `nav` named "Edit context". Its text becomes "Editing <name>" plus the top-bar breadcrumb.
- **`tablet.spec.ts`:**
  - the selection stroke assertion becomes `#ffffff` over the resolved `--acc`;
  - the "rail buttons ≥ 44 px" check applies to the icon column and bars.
- **Materials:** the Walnut and Maple swatches are reached in the Wood pane.

### New e2e

- **`shell.spec.ts`:**
  - Collapse and expand both panes by button, by shortcut, and by clicking the active tab.
  - Undock and dock the tools.
  - Reload restores sizes, collapsed state, tab and dock state.
  - At 820×1180 the panes overlay, the canvas's width is unchanged when one opens, and opening one closes the other.
- **`theme.spec.ts`:**
  - The theme is dark by default.
  - The cycle persists across reload.
  - With `page.route('**/src/main.tsx', r => r.abort())`, the inline script alone sets `data-theme` from the stored preference.
  - System follows `emulateMedia({ colorScheme })`.
- **`tooltips.spec.ts`:**
  - Hovering each tool shows its label and keycaps.
  - A disabled action shows its reason.
  - A touch long-press shows the tooltip without activating the control.
- **`new-project.spec.ts`:**
  - Creating from a sample with changed units and size produces those values.
  - Cancel leaves the project and history untouched.
  - The non-blank warning appears.
- **`layers.spec.ts`:**
  - Click and Shift-click selection syncs with the canvas.
  - Double-click enters a definition.
  - The back button pops out.
  - Motifs → Edit motif enters a motif that is only placed inside another motif.

### Other checks

- **Performance:** `pnpm perf` (G9) is re-run. The Layers list and Motifs thumbnails must not regress the recorded numbers. Any memoisation they need is justified in the G9 section of `docs/decisions/2026-09-24-gates.md`.
- **Accessibility:**
  - A keyboard-only walkthrough.
  - The contrast pairs from §2.1 checked in both themes: 4.5:1 for text, 3:1 for UI.
  - 200% browser zoom.
  - The `Mod+R` manual check (§12.2).

## 17. Implementation order

Vertical slices, each shippable:

0. **Spike:** `react-resizable-panels`.
   - Prove pixel clamping.
   - Prove `preserve-pixel-size` across a window resize.
   - Prove imperative collapse and expand.
   - Prove persistence, on chromium and webkit.
   - Keep the result only if it passes. Otherwise stop and report before any shell work.
1. Tokens, font, theme with the pre-paint script, overlay colours; the e2e viewport moves to 1440×900.
2. Shell grid, top bar, panes on the library, the layout store.
3. Icon column, tool dock and undock, canvas controls.
4. `SHORTCUTS`, `formatChord`, `Hint`, `Keycap`, the new bindings, the shortcuts sheet.
5. `occurrencePaths`, `contextLevelsForPath`, `setEditContext`; the Layers, Motifs and Wood panes.
6. The clipboard in the store; the drawing bar with the true-width preview; the actions bar; the empty board.
7. Crossing tool restyle and Crossings panel; the edit context.
8. Inspector restyle.
9. The project menu and New Project dialog; fixtures in production; the V1 amendments are already logged.

## 18. Review resolution

| Source | Finding | Resolution |
| --- | --- | --- |
| Slop 1 | Hand-rolled panes duplicate `react-resizable-panels` v4 (px sizes, collapsible, preserve-pixel-size, persistence) | Adopted (§4, §15), behind a spike (§17.0) |
| Slop 2 | 48 hand-drawn icons | `lucide-react` plus 4 domain glyphs (§2.4) |
| Slop 3 | `useThemeColors` hook re-reads CSS variables | Overlays use `var(--…)` directly (§9.8) |
| Slop 4 | Rewriting the V1 dispatcher around a table with scopes, plus a two-way drift test | The table is display data. The dispatcher keeps its V1 logic; the test checks table → effect (§12.1, §16) |
| Slop 6 | Hand-built prefs module and schema | Zustand `persist` (§11) |
| Slop 7 | Persisted per-section collapse | `<details>`, not persisted (§13) |
| Slop 10 | Overlay wording | Simplified (§4) |
| Slop 11 | Measured "More" overflow menu | `flex-wrap` (§9.4) |
| Slop 5, 8, 9, 12 | Touch long-press, Crossings panel, Motifs thumbnails, System theme and `Mod+R` are unrequested | Kept: each was shown and approved in brainstorming rounds 2–4 |
| Review 1 | E2E viewport 1000×800 is below the 1024 px breakpoint | Baseline moves to 1440×900; narrow layout tested explicitly (§16) |
| Review 2 | Drawing Cancel button dropped | Kept (§9.3, §14) |
| Review 3 | Clipboard not observable | Moves into the editor store (§9.4, §11) |
| Review 4 | Occurrence counting and entering from lists are unspecified | `occurrencePaths`, `contextLevelsForPath`, `setEditContext` (§6.4) |
| Review 5 | Detach offered for Repeat | Instance only (§9.4) |
| Review 6 | `?` and `\` chords fail exact-modifier matching | Matching rules stated (§12.1) |
| Review 7 | Coverage test contradicted Canvas ownership of Space and snap ownership of Alt | Display-only entries excluded (§16) |
| Review advisories | Hex rule, test fallout, defaults, resolved `data-theme`, banner row, dialog units, thumbnail records, theme test strength, listbox header, iOS callout, prefs write failure | Addressed in §2.1, §16, §11, §3, §4, §10.2, §6.2, §6.1, §12.3 |
