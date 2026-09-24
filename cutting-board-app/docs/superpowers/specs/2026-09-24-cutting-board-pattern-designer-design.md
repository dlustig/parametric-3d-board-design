# Cutting Board Pattern Designer — V1 SPEC

Status: draft for review. Companion: `docs/decisions/2026-09-24-reconciliation.md`.

This document is the contract for V1. It defines the document model, geometry semantics, crossing identity and compositing, editor behaviour, persistence, export, and acceptance gates. Product intent, scope, and non-goals come from the research packet and are not restated except where a rule depends on them.

## 1. Vocabulary and coordinate conventions

- **mm** is the only stored unit. All numbers in the document are millimetres or degrees. Display units are `in` or `mm`.
- **World space**: Board top-left is `(0, 0)`, +X right, +Y down. The Board occupies `[0, widthMm] × [0, heightMm]`. Objects may extend outside the Board and are clipped visually.
- **Context**: the ordered list that owns an object. Either the Project root or one Motif definition. Objects inside a definition are in **definition space**, whose origin is the definition's pivot.
- **Occurrence**: one visible copy of a source object after expanding instances and repeats. Addressed by a path (§5.1).
- **Paint order**: within a context, children are drawn in list order; later children are on top.
- Angles are degrees in the document and UI; geometry helpers may use radians internally and convert at their boundary.
- Comparisons of computed geometry always use tolerances (§4.6). `===` on computed coordinates is a defect.

## 2. Document schema (`schemaVersion: 1`)

Types are shown as TypeScript for precision. The Zod schema in code mirrors this exactly.

```ts
type Id = string                          // crypto.randomUUID()

type Project = {
  schemaVersion: 1
  id: Id
  name: string
  displayUnits: 'in' | 'mm'
  board: { widthMm: number; heightMm: number; backgroundMaterialId: Id | null }
  materials: Material[]                   // ordered as shown in the palette
  objects: Record<Id, DesignObject>       // all source objects, any context
  rootChildren: Id[]                      // paint order, back to front
  motifs: Record<Id, MotifDefinition>
  crossings: Crossing[]                   // records whose context is root
}

type Material = { id: Id; name: string; color: string }   // color: '#rrggbb'

type Point = { id: Id; x: number; y: number }             // coordinates in the owning context's space

type Band = { type: 'band'; id: Id; materialId: Id; widthMm: number; points: Point[] }   // ≥ 2 points
type Region = { type: 'region'; id: Id; materialId: Id; points: Point[] }               // ≥ 3 points

type Transform = { x: number; y: number; rotationDeg: number; mirrorX: boolean; mirrorY: boolean; scale: number }  // scale > 0

type MotifInstance = { type: 'motif-instance'; id: Id; motifId: Id; transform: Transform }

type RepeatField = {
  type: 'repeat'; id: Id; motifId: Id; transform: Transform
  rows: number; columns: number          // integers, 1..50 each, rows × columns ≤ 400
  stepXMm: number; stepYMm: number       // may be negative or zero
  rowOffsetMm: number                    // X shift applied to odd rows
  columnOffsetMm: number                 // Y shift applied to odd columns
  alternateMirrorX: boolean              // mirror X on odd columns
  alternateMirrorY: boolean              // mirror Y on odd rows
  alternateRotationDeg: 0 | 90 | 180     // rotation on cells where (row + column) is odd
}

type DesignObject = Band | Region | MotifInstance | RepeatField

type MotifDefinition = { id: Id; name: string; children: Id[]; crossings: Crossing[] }

type Crossing = {                        // §5
  id: Id
  a: BandRef; b: BandRef                 // canonical order: refKey(a) < refKey(b)
  over: 'a' | 'b'
  hint: { x: number; y: number }         // last known intersection point, in the record's context space
}
type BandRef = { path: Step[]; bandId: Id; segmentStart: Id }
type Step = { instanceId: Id } | { repeatId: Id; row: number; column: number }
```

### 2.1 Ownership and invariants (validated on import and asserted in tests)

1. Every object id appears in exactly one of `rootChildren` or one `motifs[*].children`, and every id in those lists exists in `objects`.
2. Every `materialId`, `motifId`, `backgroundMaterialId` (when non-null), and crossing `bandId` references an existing record. Crossing `bandId` must be a Band. Crossing `path` steps must reference instances or repeats that exist and whose walk from the record's context is consistent (each step's object is a child of the context reached so far; a repeat step's `row`/`column` are within the field's grid).
3. Point ids are unique within an object. Band ≥ 2 points, Region ≥ 3 points. Consecutive duplicate points (distance < `EPS_GEOMETRY`) are invalid.
4. Motif reference graph (definition → instances/repeats it contains → their definitions) is acyclic.
5. All numbers finite. `widthMm > 0`, board dimensions `> 0`, `scale > 0`, repeat limits as above. Total expanded occurrence count for the project ≤ 5000 (§4.4).
6. Crossing records are unique per context by canonical key (§5.3). `over` refers to the canonical pair.

Invalid documents are rejected whole. Nothing is silently repaired.

### 2.2 Removed from the research model

Bands and Regions do not carry a Transform; move/rotate/mirror bake into `points`. `MotifDefinition.origin` does not exist; children are re-based on creation (§7.3). Rationale in the reconciliation document.

## 3. Materials

- Starter palette (created with a new project, all editable): Maple `#E8D4A8`, Walnut `#5C3A21`, Cherry `#A8543A`, Purpleheart `#6B2E6B`, Padauk `#C8402A`, Ash `#DED2B4`, Oak `#C19A6B`, Wenge `#3B2A20`.
- Add, rename, recolour, and delete (only when unused; the UI shows the usage count). "Replace everywhere" swaps every reference from one material to another in one history step.
- Clicking a swatch with a non-empty selection assigns that material to every selected Band and Region. Selected instances/repeats are unaffected (their materials live in the definition).

## 4. Geometry semantics

### 4.1 Transform matrix

For a Transform `t`, the matrix applied to local points is `M = T(x, y) · R(rotationDeg) · S(scale) · Mirror(mirrorX, mirrorY)`, i.e. mirror first, then uniform scale, then rotate about the local origin, then translate. Occurrence matrices compose outward: `world = M_parentOccurrence · M_local`. World stroke width of a Band occurrence = `widthMm × product of scales along the path`. Mirror never changes width. `vector-effect: non-scaling-stroke` is never used.

### 4.2 Bands

A Band renders as an SVG path along its points with `stroke = material colour`, `stroke-width = world width`, `stroke-linejoin = miter`, `stroke-miterlimit = 10`, `stroke-linecap = butt`, `fill = none`. Segment `i` runs from `points[i]` to `points[i+1]` and is identified by `points[i].id` (its start point).

### 4.3 Regions

A Region renders as a closed SVG path (`Z`) with `fill = material colour`, no stroke, `fill-rule = nonzero`. Self-intersecting polygons are allowed and render per `nonzero`; the editor does not prevent them.

### 4.4 Expansion

`expand(project)` produces the flat world-space occurrence list in paint order:

- Root children in order. A Band/Region yields one occurrence with `path = []` and identity matrix.
- A MotifInstance yields the definition's children (recursively) with `path = [...parentPath, { instanceId }]` and matrix `parent · M(transform)`.
- A RepeatField yields, for `row in 0..rows-1`, `column in 0..columns-1` (row-major), the definition's children with `path = [...parentPath, { repeatId, row, column }]` and matrix `parent · M(transform) · Cell(row, column)` where

```
Cell(r, c) = T(c·stepX + (r odd ? rowOffset : 0),  r·stepY + (c odd ? columnOffset : 0))
           · R(alternateRotationDeg if (r + c) odd else 0)
           · Mirror(alternateMirrorX && c odd, alternateMirrorY && r odd)
```

Each occurrence carries: `key` (§5.1), `kind`, `sourceId`, `path`, `matrix`, `materialId`, `worldPoints`, and for Bands `worldWidth`. The cap of 5000 occurrences is enforced by commands (a change that would exceed it is rejected with a visible message) and by import validation.

### 4.5 Bounds

Band occurrence bounds are the bounds of its stroke: polyline bounds expanded by `worldWidth / 2` (an approximation at miter tips; sufficient for selection, fit, and prefiltering). Region bounds are polygon bounds. Instance/repeat bounds are the union of their occurrences' bounds.

### 4.6 Tolerances (single module `geometry/tolerance.ts`)

| Name | Value | Use |
| --- | --- | --- |
| `EPS_GEOMETRY` | 1e-6 mm | point equality, degenerate segments, parameter interior test |
| `MIN_CROSSING_ANGLE_DEG` | 10° | below this a centreline intersection is unsupported (near-parallel) |
| `CLIP_EXTEND_MM` | 0.05 mm | extension of the crossing clip across the under Band's edges (§6.2) |
| `REMATCH_TOLERANCE_MM` | 3 mm | distance from `hint` within which a lost crossing may rebind (§5.5) |
| `SNAP_TOLERANCE_PX` | 8 screen px | converted to mm through the current zoom |
| `ANGLE_SNAP_DEG` | 15° step, ±4° capture | while drawing Band segments |

## 5. Crossings: identity, scope, resolution

### 5.1 Occurrence keys

`stepKey({instanceId}) = 'i:' + instanceId`; `stepKey({repeatId,row,column}) = 'r:' + repeatId + ':' + row + ':' + column`. `occurrenceKey = stepKeys.join('/') + '#' + sourceId` (empty path → `'#' + sourceId`). `refKey(ref) = occurrenceKey(ref.path, ref.bandId) + '@' + ref.segmentStart`.

### 5.2 Intersection discovery and classification

Performed on Band occurrences in one common space: world space for the root, or definition space (identity at the definition) when evaluating a definition context. Segment intersections use `@flatten-js/core` `Segment.intersect`. Pairs of occurrences are prefiltered by stroke bounds overlap.

For every pair of segments from two **distinct** occurrences that intersect, classify:

| Class | Condition | Behaviour |
| --- | --- | --- |
| `eligible` | exactly one intersection point; parameters on both segments in `(EPS, 1−EPS)` scaled by segment length (interior); angle between directions in `[MIN_CROSSING_ANGLE_DEG, 180 − MIN_CROSSING_ANGLE_DEG]`; footprint (§6.1) does not overlap any other intersection footprint on either occurrence | toggleable |
| `endpoint` | an intersection parameter is within `EPS` of 0 or 1 on either segment (includes a crossing exactly at a polyline joint) | unsupported |
| `collinear` | segments overlap along a length | unsupported |
| `near-parallel` | angle outside the eligible range | unsupported |
| `crowded` | footprint overlaps another intersection's footprint on either occurrence (includes triple points and adjacent crossings) | unsupported |

Segments within the same occurrence are never compared (self-intersection is not a crossing; the Band paints over itself in path order). Unsupported intersections are listed with their reason and drawn with a distinct marker when the Crossing tool is active; they receive no toggle and no record can bind to them. If a record's target becomes unsupported, the record is unresolved (§5.5).

### 5.3 Records and scope

A Crossing record lives in exactly one context: `project.crossings` (root) or `motifs[m].crossings` (definition). Its two `BandRef`s are relative to that context. Canonical order sorts `a` and `b` by `refKey`, so selection order never changes identity. The record's canonical key is `refKey(a) + '|' + refKey(b)`; unique per context.

- A record in a definition with empty paths applies to **every occurrence** of that definition ("all instances").
- A record in the root context with non-empty paths applies to **exactly one** occurrence pair ("this occurrence only").
- Records may also live in an intermediate definition with non-empty paths (a nested instance addressed from an outer definition). V1 UI creates only the two forms above; the resolver handles all three.

**Precedence.** For an eligible intersection between world occurrences `A` and `B`, candidate records are found by walking contexts from the root inward along the occurrences' common ancestry: at each context, strip the common path prefix and look up the record by canonical key. **The record found in the outermost context wins** (it names the most specific occurrence). If no record exists, the default is paint order: the occurrence later in the flat expansion is over.

### 5.4 Toggle semantics

Toggling an eligible intersection flips the effective over/under. The Crossing tool has a scope control, visible only when both occurrences share at least one motif ancestor: **All instances** (default) or **This occurrence**. 

- *All instances*: the record is written in the innermost common definition context with paths relative to it. Any more-specific root record for the same pair is removed so the toggle is visible (otherwise the root record would keep winning).
- *This occurrence*: the record is written in the root context with full paths. Definition records are untouched.
- If a record already exists in the target context, `over` flips. If flipping makes it equal to the paint-order default and no outer record shadows it, the record is still kept (explicit intent survives reordering).
- A toggle on an eligible intersection whose pair has an unresolved record in the target context rebinds that record (§5.5) instead of creating a new one.

### 5.5 Topology edits and rematching

After any command that changes Band points (move, rotate, mirror, vertex drag, vertex insert/delete, duplicate does not count), `rematchCrossings(project)` runs inside the same history step:

1. For each record, evaluate its context. If an eligible intersection exists between the referenced occurrence pair on the referenced segments, update `hint` to the intersection point. Done.
2. Otherwise collect eligible intersections between the same occurrence pair (any segments) within `REMATCH_TOLERANCE_MM` of `hint`. If exactly one, rebind `segmentStart` on the changed side(s) and update `hint`. 
3. Otherwise leave the record untouched. It is **unresolved**: derived at scene build time, never stored.

Unresolved records render as a marker at `hint` in the Crossing tool and are listed in the inspector when a referenced Band or motif is selected, with a **Remove** action. Undo restores records exactly; import/export carries records verbatim, so an unresolved record stays unresolved across save/reopen until removed or rebound.

A record referencing a deleted Band, instance, or repeat is removed by the delete command. A record inside a definition survives instance deletion.

### 5.6 Motif operations and records

- **Create Motif** from a selection: records between two selected Bands move from the context into the new definition unchanged. Records between a selected Band and an unselected Band stay in the context with the selected side's path prefixed by the new instance step. Records involving the selection through repeats are impossible (repeats cannot be partially selected).
- **Detach instance**: definition children are copied into the context with baked points and widths; definition records between them are copied into the context with fresh ids and empty paths; context records whose path begins with that instance step have the step removed and `bandId` remapped.
- **Delete definition**: allowed only when unused.

## 6. Compositing (the over/under render)

### 6.1 Footprint

For an eligible intersection between segments `sA` (world width `wA`) and `sB` (`wB`), the footprint is the parallelogram bounded by the two stroke edges of `sA` and the two stroke edges of `sB`: the four corners are the intersections of lines `offset(sA, ±wA/2)` with `offset(sB, ±wB/2)`. Computed analytically in `geometry/footprint.ts`. Footprint overlap for the `crowded` class is a polygon-intersection test on these parallelograms.

### 6.2 Patch

Let `O` be the over occurrence and `U` the under occurrence at an eligible intersection. If `O` is already later than `U` in paint order, nothing is drawn. Otherwise the scene inserts a **patch** immediately after `U`:

```svg
<clipPath id="{prefix}-clip-{n}" clipPathUnits="userSpaceOnUse"><polygon points="…"/></clipPath>
<path d="{O's full world path}" stroke="{O material}" stroke-width="{wO}" … clip-path="url(#{prefix}-clip-{n})"/>
```

The clip polygon is the footprint computed with `U`'s width enlarged by `2 × CLIP_EXTEND_MM`, so the patch overlaps `O`'s own paint by a hair across `U`'s edges (harmless) while its edges along `O`'s stroke coincide with `O`'s real edges (any anti-aliasing blends against `U`, not background). Because the patch is placed right after `U`, anything painted above `U` still covers both. Patches never modify `U`'s paint, so two crossings on the same Band are independent by construction. Ids use a per-render prefix so editor and export never collide.

### 6.3 Scene

`buildScene(project): Scene` is the single derivation used by both the React renderer and the SVG exporter:

```ts
type Scene = {
  elements: Array<
    | { kind: 'region'; occurrence: RegionOccurrence }
    | { kind: 'band'; occurrence: BandOccurrence }
    | { kind: 'patch'; over: BandOccurrence; clip: Point[] }
  >
  intersections: Intersection[]        // eligible + unsupported, with world point, class, and effective over key
  unresolved: Array<{ record: Crossing; contextId: Id | null; worldHint: Point }>
}
```

## 7. Editor

### 7.1 State

Three stores of concern in one Zustand store:

- `project` — the document. Wrapped by zundo `temporal` with `partialize` to `project` only and `limit: 100`.
- `preview` — `Project | null`. Commands that run per frame (drag, rotate, inspector typing) write here; the renderer uses `preview ?? project`. `commit()` copies the preview into `project` (one history entry) and clears it; `cancel()` clears it. History never sees preview frames.
- Ephemeral: `tool`, `selection: Id[]`, `editContext: { motifId, path: Step[] } | null`, `camera: { x, y, zoom }`, `snapEnabled`, `crossingScope`, `save status`, drawing-in-progress state.

Commands are pure functions `(project, args) → project` in `domain/commands/`, unit-tested without React. Any command that changes Band points ends with `rematchCrossings`.

### 7.2 Camera and input

- One camera transform: `viewBox` of the root `<svg>` derived from `camera`. Screen→world uses `getScreenCTM().inverse()`.
- `@use-gesture/react` on the canvas handles: wheel zoom about the cursor, pinch zoom about the pinch centre, two-finger drag pan, middle-button drag pan, `Space`+drag pan. Single-pointer gestures go to the active tool.
- The canvas sets `touch-action: none`. `pointercancel` cancels the current drag/drawing and clears `preview`.
- Zoom limits: 0.05–50 px/mm. Fit: Board bounds plus 5% margin.

### 7.3 Tools

Tool keys: `V` select, `B` band, `R` rectangle region, `P` polygon region, `X` crossing. `Esc` cancels an in-progress drawing or returns to Select. Tablet gets the same tools in a rail with ≥ 44 px targets and visible **Finish** / **Cancel** buttons during Band and polygon drawing.

- **Select**: click selects the topmost object at point within the current context (occurrences inside instances/repeats select their top-level instance/repeat). `Shift`+click toggles. Marquee (drag on empty space) selects objects whose bounds intersect the marquee (react-selecto, with its element-geometry callback configured for rotated targets). Selected objects get react-moveable handles: drag to move (commits baked translation for Bands/Regions, transform `x/y` for instances/repeats), rotate handle around the selection's bounds centre (snaps to 15° with `Shift` or when snap is on and within ±4°). Resize/scale handles are disabled. Double-click a Band vertex region: vertex drag; double-click an instance or repeat: enter its definition (§7.5).
- **Band**: click/tap to place points with live segment length and angle labels; move shows the pending segment; `Enter`, double-click, or **Finish** ends (≥ 2 points required, else cancelled); `Backspace` removes the last placed point. New Bands take the current material and the last-used width (default 6.35 mm = 1/4").
- **Rectangle region**: drag from corner to corner; produces a 4-point Region.
- **Polygon region**: same placement flow as Band; ≥ 3 points; closes on Finish.
- **Crossing**: all intersections are drawn as markers (filled circle for eligible, hatched for unsupported with a tooltip reason, ring for unresolved records). Click/tap an eligible marker toggles per §5.4 using the scope control in the tool options bar. Marker hit radius is 12 screen px, independent of Band paint.

Drawing takes place in the current edit context; screen points are inverse-mapped through the entered occurrence matrix into definition space.

### 7.4 Selection commands

Delete/Backspace, duplicate (`Ctrl/Cmd+D`, offset by one grid step), copy/paste (`Ctrl/Cmd+C/V`, in-app clipboard of DesignObjects and their definition-internal crossings), mirror X / mirror Y (about the selection bounds centre), rotate 90° CW/CCW, arrow nudge by one grid step (`Shift` ×10), bring forward / send backward / to front / to back, Create Motif (`Ctrl/Cmd+G`), Repeat, Detach. All are toolbar/inspector buttons as well as keys.

### 7.5 Edit context

Entering a definition (double-click an instance or repeat cell, or **Edit Motif** in the inspector) pushes `{ motifId, path }` where `path` is the clicked occurrence's path. The breadcrumb shows `Board / Motif: Name` with a **Done** button. While entered: only that definition's children are selectable and drawable; everything else is drawn at 40% opacity; edits go to the definition so every occurrence updates live; the inspector shows definition-space values (width is the definition's width; the world width is shown read-only when scale ≠ 1). Nested entry is allowed by double-clicking a nested instance inside the entered definition. `Esc` with nothing in progress pops one level.

### 7.6 Inspector (right panel, context sensitive)

- Board: width, height, background material, display units, project name.
- Band: material, width, per-point X/Y list with insert/delete vertex; for 2-point Bands also length and angle (editing angle rotates about the start point; editing length moves the end point).
- Region: material, per-point X/Y with insert/delete vertex.
- Motif instance: definition name (link to Edit), X, Y, rotation, mirror X/Y, scale; Detach.
- Repeat: all fields of §2 plus the same transform fields; live preview while typing.
- Multi-selection: material assignment and transform commands only.
- Any selection with unresolved records: list with Remove.

All numeric fields are `<input type="text" inputMode="decimal">` using the unit parser (§8). Preview applies on each valid keystroke; commit on `Enter` or blur; `Esc` reverts. Invalid text shows an inline error and does not preview.

### 7.7 Snapping

Enabled by default; `Alt` held disables temporarily; a toolbar toggle persists the setting. Candidates (world mm): grid points; Board edges and centre lines; Band endpoints and vertices; Region vertices; eligible intersection points; bounds edges and centres of other objects in the context. Point snaps win over line snaps, which win over grid. A snap draws a guide line/point overlay. While drawing a Band segment, the angle snaps to 15° multiples when within ±4° unless a point snap is active. Grid spacing defaults to 3.175 mm (1/8") for inch projects and 5 mm for mm projects and is editable.

### 7.8 History

`Ctrl/Cmd+Z` undo, `Ctrl/Cmd+Shift+Z` and `Ctrl/Cmd+Y` redo. Selection is cleared of ids that no longer exist after undo/redo. Camera, selection, tool, and edit context are not in history. Opening/importing a project clears history.

## 8. Units, parsing, formatting (`domain/units.ts`)

`parseLength(text, defaultUnit): { ok: true; mm: number } | { ok: false; error: string }`.

Accepted, after trimming and collapsing whitespace: decimal (`0.25`, `.5`, `-3`); fraction (`3/16`); mixed (`1 1/8`, `1-1/8`); optional unit suffix `in`, `"`, `mm`, with or without a space; suffix overrides `defaultUnit`. Fractions use `fraction.js` for exact parsing; result converts to mm (`× 25.4` for inches). Rejected: empty, zero denominators, feet, expressions, more than one unit, non-finite.

`formatLength(mm, unit)`: inches — if the value is within 0.0005" of `k/64`, render as reduced mixed fraction (`1 1/8`, `3/16`, `2`); otherwise three decimals. mm — up to two decimals, trailing zeros trimmed. Unit label is shown beside the field, not inside the value. Angles format with one decimal, trailing zero trimmed.

Field policies: widths, board dimensions, steps allow positive only (steps also allow zero and negative); coordinates allow any finite value; scale > 0; rows/columns integers 1–50.

## 9. Persistence

- Autosave: after every committed change, debounce 500 ms, write `JSON.stringify(project)` to `localStorage` key `cbpd:project:v1`. On failure (quota, disabled storage) show a persistent **Not saved in this browser — download your project** status with a Download button; retry on next change.
- Startup: if the key exists and validates, open it. If it exists but fails validation or migration, keep it untouched, start a blank project, and show a banner with **Download recovered file** (raw text) and **Discard**.
- **New Project** confirms when unsaved-to-file changes exist (the status bar tracks "downloaded at" vs last commit).
- **Download Project**: `Blob` of the JSON, pretty-printed, filename `<name>.cbpd.json`.
- **Open Project**: `<input type="file" accept=".json">`, `File.text()`, `importProject(text)`: `JSON.parse` → `migrate` → Zod `safeParse` → domain invariants (§2.1). Any failure leaves the current project and history untouched and shows the first error with its path. Success replaces the project and clears history.
- `migrate(json)`: `schemaVersion === 1` passes through; anything else is an error naming the version. The harness exists from day one so version 2 is a function, not a redesign.
- One active project only. No IndexedDB in V1.

## 10. SVG export

`exportSvg(project): string` serialises `buildScene(project)` to a standalone document:

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="{W}mm" height="{H}mm" viewBox="0 0 {W} {H}">
  <title>{name}</title>
  <defs><clipPath id="board"><rect width="{W}" height="{H}"/></clipPath> …patch clipPaths…</defs>
  <g clip-path="url(#board)">
    <rect width="{W}" height="{H}" fill="{background or none}"/>
    …elements in scene order, colours inline, no classes…
  </g>
</svg>
```

No editor overlays, grid, CSS, fonts, or external references. Numbers are written with up to 4 decimals. The same scene drives the editor, so parity is structural; the acceptance test opens the exported file in a fresh page and compares a raster of it with a raster of the editor's Board region at the same pixel size (mean channel difference < 1%, no pixel cluster larger than the anti-aliasing tolerance). PNG export is not in V1 unless it falls out of the parity test harness for free.

## 11. Accessibility

Every control is a native `button`, `input`, `select`, or a Radix primitive (Dialog for confirmations, Tooltip for tool labels, Popover for the material editor). Tool buttons have visible labels or `aria-label` plus tooltips. Inspector fields have `<label>`s. Selection is indicated by a dashed outline and by the inspector heading, not colour alone. Materials show name and swatch. Every drag has a numeric equivalent in the inspector. The app respects browser zoom (layout in rem/flex, canvas fills the remainder).

## 12. Fixtures

Original JSON fixtures in `src/fixtures/`, each also constructible from the UI (Playwright tests prove C, E, F):

- A `stripes` — Board, 4 materials, 7 parallel Bands of different widths.
- B `checker` — one 2-Region motif repeated 6×6 with row offset (brick).
- C `basket-weave` — motif of 2 horizontal + 2 vertical Bands with alternating definition crossings, repeated 3×3 with alternate 90° rotation.
- D `chevron-diamond` — ±45° parallel Bands mirrored, nested diamond Regions.
- E `isometric` — three-rhombus cube motif (30°/60°) with three materials, repeated 4×4 with row offset.
- F `interlace` — synthetic: 6 materials, nested motif (a 4-Band lattice motif containing an instance of a 2-Band accent motif), repeated 5×5 with alternate mirror, at least 40 eligible crossings with alternating definition crossings and two root overrides. ≥ 1000 expanded occurrences when repeated 8×8 in the performance test.

## 13. Acceptance gates (from packet Part II §5, made concrete)

Each gate is an automated test unless marked manual; all must pass before V1 is reported complete.

| # | Gate | Test |
| --- | --- | --- |
| G1 | Crossing identity | Vitest: two 3-point polylines crossing twice; set opposite over at each; move an endpoint, change width, insert a vertex on the crossed segment, delete it; after each step the two records resolve to their intended intersections or become unresolved exactly when the intersection no longer exists; undo restores. |
| G2 | Occurrence scope | Vitest: Fixture C-like 3×3 repeat; definition record + one root override in cell (1,2); scene shows the override only there; JSON round-trip preserves both; a nested instance variant passes the same assertions. |
| G3 | Transform parity | Vitest: rotate 30°, mirror X, scale 1.5 an instance; painted width, intersection point, bounds, and inspector value agree with hand-computed values. Playwright: after drag/rotate/undo, the DOM has no residual `transform` and the project values match. |
| G4 | Edge classes | Vitest: acute 15° unequal widths (eligible, footprint corners checked), shared endpoint, collinear, 5° near-parallel, self-crossing polyline, triple point, two crossings 1 mm apart → each classified as specified. |
| G5 | Export parity | Playwright: export Fixture F, load the SVG standalone, rasterise both at 800 px wide, compare per §10. Also assert no `class`, `style`, or external `url(` outside `#`-refs. |
| G6 | Authorability | Playwright: build C, E, and F from a blank project using only UI actions (tools, snapping, inspector, Create Motif, Repeat, Crossing tool); then edit the source motif and one dimension; assert the scene matches the fixture within tolerance. The test log records action counts. |
| G7 | Tablet | Playwright with touch emulation (WebKit or Chromium mobile): tap-create Band with Finish, tap-select, drag, two-finger pan and pinch, `pointercancel` mid-drag leaves the project unchanged; no page scroll. |
| G8 | Persistence | Vitest: malformed JSON, wrong version, cyclic motifs, 401-cell repeat, duplicate ids, dangling refs each rejected with a path; valid round-trip is deep-equal. Playwright: simulated quota failure shows the unsaved status and Download works. |
| G9 | Performance | Playwright on Fixture F at 8×8 (≥ 1000 occurrences): measure a 60-frame drag; report median and p95 frame time and inspector edit latency. Target: median ≤ 16 ms, p95 ≤ 50 ms on the dev machine. Report the numbers; a miss is a finding, not a silent pass. |

Product success test (packet): performed manually once at the end and reported with timings.

## 14. Module layout

```
src/
  domain/      model.ts  ids.ts  units.ts  validate.ts  migrate.ts  crossings.ts  commands/*.ts
  geometry/    affine.ts  tolerance.ts  expand.ts  intersections.ts  footprint.ts  scene.ts  bounds.ts  snap.ts
  editor/      store.ts  camera.ts  keyboard.ts  tools/*.ts
  render/      Canvas.tsx  SceneSvg.tsx  overlays/*.tsx
  export/      svg.ts  download.ts
  storage/     local.ts
  ui/          App.tsx  Toolbar.tsx  Inspector/*.tsx  MaterialPalette.tsx  Breadcrumb.tsx  StatusBar.tsx
  fixtures/    *.json  index.ts
```

`domain/` and `geometry/` import nothing from React or the DOM. `geometry/` may import `@flatten-js/core`; `domain/` may not. Tests live beside sources as `*.test.ts`; Playwright tests in `e2e/`.

## 15. Dependencies by slice

Installed in the slice that first uses them: scaffold (`react`, `react-dom`, `vite`, `@vitejs/plugin-react`, `typescript`, `vitest`); model (`zod`, `@flatten-js/core`, `fraction.js`); editor (`zustand`, `zundo`, `@use-gesture/react`, `react-moveable`, `react-selecto`); UI (`@radix-ui/react-dialog`, `@radix-ui/react-tooltip`, `@radix-ui/react-popover`); e2e (`@playwright/test`). Nothing else without a recorded reason.
