# Cutting Board Pattern Designer V1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Every task: write the failing tests first, run them red, implement, run green, run `pnpm typecheck && pnpm test`, commit.

**Goal:** A client-only React/TypeScript/Vite/SVG editor where a woodworker draws dimensioned Bands and Regions, builds and repeats Motifs, toggles local over/under crossings, saves JSON, and exports a standalone SVG.

**Architecture:** A semantic millimetre Project (Zod-validated JSON) is the only source of truth. Pure `domain/` commands mutate it; pure `geometry/` expands it into world occurrences, classifies crossings, and builds one `Scene` consumed by both the React SVG renderer and the string exporter. The editor store (Zustand + zundo) holds the project, a preview, and ephemeral UI state; react-moveable/react-selecto act on proxy rects, @use-gesture owns the camera.

**Tech Stack:** pnpm, Vite 8, React 19, TypeScript (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), Vitest 5, Playwright, Zustand 5 + zundo 2, Zod 4, @flatten-js/core, @use-gesture/react, react-moveable, react-selecto, Radix Dialog/Tooltip/Popover.

**Spec:** `docs/superpowers/specs/2026-09-24-cutting-board-pattern-designer-design.md` (rev 3). Section numbers below refer to it. Implementers read the spec section named in each task before starting.

## Global Constraints

- Node 22.12.0, pnpm only (the `npm` shim is broken on this machine). Commit `pnpm-lock.yaml`.
- `src/domain/` and `src/geometry/` import nothing from React or the DOM; `src/domain/` may not import `@flatten-js/core`.
- All stored numbers are mm or degrees; ids validated by `/^[A-Za-z0-9_-]{1,64}$/`; colours by `/^#[0-9a-fA-F]{6}$/`.
- Tolerances and constants come only from `src/geometry/tolerance.ts` (spec §4.6). No magic numbers elsewhere.
- Every command returns a project satisfying spec §2.1; the property test in Task 5 runs over all commands.
- No dependency outside spec §15 without a note in `docs/decisions/`. No `any`. Explicit return types on exported functions.
- Commit messages: imperative, ≤ 50-char subject, no agent trailers. Use `FSH_NO_TTY=1 git commit`.
- Never `preventDefault` on canvas `pointerdown` (spec §7.2).
- One spec constant is deliberately camera-dependent: only the patch clip enlargement; classification never is. The clip is enlarged across the over band's edges only (spec §6.2, rev 4).

## Review Focus

Inputs the spec implies but no task's tests exercise by default; each has been added as a test in the owning task.

1. A Band whose two points coincide after a nudge (distance < `MIN_SEGMENT_MM`) — the command must merge points, not produce a zero-length segment (Task 5, `nudge merges points`).
2. A repeat with `stepX = 0` and `columns = 3` — three identical stacked occurrences; crossings between them are `collinear`/`ignored`, never eligible, and the scene must not explode (Task 4, `stacked cells`).
3. Pasting a copied instance whose definition was deleted by undo — paste must fail visibly, not create a dangling `motifId` (Task 11, `paste after definition gone`).
4. Importing a project whose `displayUnits` is `"cm"` or whose `alternateRotationDeg` is 45 — Zod rejects with a path, current project untouched (Task 2, `enum rejections`).
5. An inch field typed as `1 1/8"` on iOS with a smart quote `”` — parser accepts (Task 9, `smart quote inch`).

---

### Task 1: Scaffold, tooling, CI scripts

**Files:**
- Create: `package.json`, `pnpm-lock.yaml`, `vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`, `index.html`, `src/main.tsx`, `src/ui/App.tsx`, `src/index.css`, `README.md`
- Test: `src/smoke.test.ts`

**Interfaces:**
- Produces: scripts `pnpm dev`, `pnpm build`, `pnpm typecheck` (`tsc -b --noEmit` or `tsc --noEmit -p tsconfig.json`), `pnpm test` (vitest run), `pnpm test:e2e` (added in Task 8).

- [ ] Run `pnpm create vite@latest . --template react-ts` in the repo root (it is non-empty; accept "ignore files and continue" if prompted, or scaffold into a temp dir and move files, keeping existing `docs/`, `.gitignore`, and the two research `.md` files).
- [ ] Add to `tsconfig.json` compiler options: `"strict": true, "noUncheckedIndexedAccess": true, "exactOptionalPropertyTypes": true, "noImplicitOverride": true`. Add path alias `@/* → src/*` in both tsconfig and `vite.config.ts` (`resolve.alias`).
- [ ] `pnpm add -D vitest @vitest/coverage-v8` is NOT needed; add only `vitest`. Configure `test: { environment: 'node', include: ['src/**/*.test.ts'] }` in `vite.config.ts` (`/// <reference types="vitest/config" />`).
- [ ] Replace the template `App.tsx` with a component rendering `<main>Cutting Board Pattern Designer</main>`; delete template assets and CSS except a minimal `index.css` with `:root` font and `html, body { margin: 0; height: 100%; overflow: hidden; overscroll-behavior: none }`. Add `<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">` to `index.html`.
- [ ] Write `src/smoke.test.ts`: `expect(1 + 1).toBe(2)`. Run `pnpm test` → passes. Run `pnpm typecheck` and `pnpm build` → pass.
- [ ] `README.md`: one paragraph, the three commands, pointer to the spec.
- [ ] Verify licences of the installed graph: `pnpm licenses list` and record the summary line in `docs/decisions/2026-09-24-reconciliation.md` under "Technology assumptions verified".
- [ ] Commit: `Scaffold Vite React TypeScript app with Vitest`.

---

### Task 2: Domain model, ids, Zod schema, validation, migration

**Files:**
- Create: `src/domain/model.ts`, `src/domain/ids.ts`, `src/domain/schema.ts`, `src/domain/validate.ts`, `src/domain/migrate.ts`, `src/domain/project.ts`
- Test: `src/domain/validate.test.ts`, `src/domain/migrate.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // model.ts — exactly the types in spec §2, exported. Plus:
  export type ContextId = Id | null            // null = root
  // ids.ts
  export function newId(): Id                  // crypto.randomUUID()
  // project.ts
  export function newProject(displayUnits: 'in' | 'mm'): Project   // 300×450 mm board (12"×18" for 'in' = 304.8×457.2), starter palette §3, no objects
  export function childrenOf(p: Project, ctx: ContextId): Id[]
  export function contextOf(p: Project, objectId: Id): ContextId   // throws if unowned
  // schema.ts
  export const projectSchema: z.ZodType<Project>
  // validate.ts
  export type ValidationError = { path: string; message: string }
  export function validateProject(p: Project): ValidationError | null   // §2.1 invariants 1–6 in order; first failure
  export function countOccurrences(p: Project): number                 // without expanding geometry
  // migrate.ts
  export type ImportResult = { ok: true; project: Project } | { ok: false; error: ValidationError }
  export function importProject(text: string): ImportResult          // parse → migrate → schema → validate
  ```
- Consumes: nothing.

- [ ] `pnpm add zod`.
- [ ] Write `validate.test.ts` cases (build small projects by hand with `newProject` and object literals):
  - valid blank project → `null`
  - object id in two contexts → error path `rootChildren` / `motifs.<id>.children`
  - dangling `materialId` → path `objects.<id>.materialId`
  - band with 1 point; region with 2 points; consecutive points 0.001 mm apart → errors naming the object
  - cyclic motifs (A contains instance of B, B contains instance of A) → path `motifs`
  - `widthMm: 0`, `scale: 0`, `rows: 51`, `rows: 2.5`, `NaN` coordinate → errors
  - nested repeats each 50×1 and 50×1 inside a definition instanced 3 times → occurrence count > 5000 → error path `objects` (this is the G8 nesting case)
  - crossing record: unknown bandId; bandId pointing at a Region; path step naming an instance not in the context; repeat step row out of range; `segmentStart` not a point of the band; duplicate canonical key; `a === b`; non-canonical stored order → each an error
  - `enum rejections` (Review Focus 4): `displayUnits: 'cm'`, `alternateRotationDeg: 45`, colour `#GGGGGG`, id with `:` → schema errors with paths
- [ ] Write `migrate.test.ts`: version 1 passes through; version 2 → `error.message` contains `2`; non-JSON text → error; JSON array → error.
- [ ] Run tests → fail (modules missing).
- [ ] Implement `model.ts` (types only), `ids.ts`, `project.ts`, `schema.ts` (Zod mirror of §2 with `z.discriminatedUnion('type', …)`, `.int().min(1).max(50)`, finite numbers, regexes), `validate.ts` (six invariant checks as separate functions called in order; `countOccurrences` multiplies rows×columns through the definition graph with memoisation), `migrate.ts`.
- [ ] Run tests → pass. `pnpm typecheck` clean.
- [ ] Commit: `Add domain model, schema, validation, import`.

---

### Task 3: Affine, tolerance, expansion, bounds

**Files:**
- Create: `src/geometry/tolerance.ts`, `src/geometry/affine.ts`, `src/geometry/expand.ts`, `src/geometry/bounds.ts`, `src/geometry/keys.ts`
- Test: `src/geometry/affine.test.ts`, `src/geometry/expand.test.ts`, `src/geometry/bounds.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // tolerance.ts — every constant of spec §4.6, exported as `const`
  // affine.ts
  export type Mat = readonly [a: number, b: number, c: number, d: number, e: number, f: number]  // SVG convention: x' = a x + c y + e; y' = b x + d y + f
  export const IDENTITY: Mat
  export function multiply(m: Mat, n: Mat): Mat            // m · n
  export function fromTransform(t: Transform): Mat         // T · R · S · Mirror per §4.1
  export function cell(r: RepeatField, row: number, col: number): Mat   // §4.4 Cell(r,c)
  export function invert(m: Mat): Mat
  export function apply(m: Mat, p: {x:number;y:number}): {x:number;y:number}
  export function scaleOf(m: Mat): number                  // sqrt(|det|)
  export function isMirrored(m: Mat): boolean              // det < 0
  // keys.ts
  export function stepKey(s: Step): string
  export function occurrenceKey(path: Step[], sourceId: Id): string
  export function refKey(r: BandRef): string
  // expand.ts
  export type BandOccurrence = { kind:'band'; key:string; sourceId:Id; path:Step[]; matrix:Mat; materialId:Id; worldPoints:Point[]; worldWidth:number; closed:boolean }
  export type RegionOccurrence = { kind:'region'; key:string; sourceId:Id; path:Step[]; matrix:Mat; materialId:Id; worldPoints:Point[] }
  export type Occurrence = BandOccurrence | RegionOccurrence
  export function expand(p: Project): Occurrence[]                          // root, world space, paint order
  export function expandContext(p: Project, ctx: ContextId): Occurrence[]   // identity at the context (root → same as expand)
  export function segmentsOf(o: BandOccurrence): Array<{ startId: Id; a: Point; b: Point }>   // closed → includes closing segment keyed by last point id
  // bounds.ts
  export type Box = { minX:number; minY:number; maxX:number; maxY:number }
  export function paintedBounds(o: Occurrence): Box
  export function conservativeBounds(o: Occurrence): Box
  export function unionBoxes(boxes: Box[]): Box | null
  export function objectBounds(p: Project, objectId: Id): Box | null   // painted bounds of the object's occurrences in its own context space
  ```
- Consumes: Task 2 types.

- [ ] `pnpm add @flatten-js/core` (used from Task 4 on; `affine.ts` is hand-written 2×3 math because Flatten's `Matrix` has no inverse).
- [ ] Tests (`affine.test.ts`): rotation 90° maps (1,0)→(0,1) (y-down, clockwise); `fromTransform({x:10,y:20,rotationDeg:30,mirrorX:true,mirrorY:false,scale:2})` applied to (1,0) equals hand-computed `(10 + 2·(−cos30), 20 + 2·(−sin30))`; `invert(m)·m ≈ IDENTITY`; `scaleOf` = 2; `isMirrored` true; `cell` for a 2×2 repeat with `alternateRotationDeg: 90` and steps (50,50) maps the definition origin of cell (0,1) to (50,0) and cell (1,1) to (50,50) (G3 case); brick: `rowOffsetMm: 25` shifts row 1 by +25 in X only.
- [ ] Tests (`expand.test.ts`): root band → one occurrence, identity; instance of a 2-object motif → two occurrences with `path=[{instanceId}]` and transformed points; 3×2 repeat → 6× children, row-major keys `r:<id>:0:0`, `r:<id>:0:1`, …; nested instance inside a repeat cell → path length 2 and matrix = repeat·cell·instance; world width = width × scale product; `expandContext(p, motifId)` gives identity-space points.
- [ ] Tests (`bounds.test.ts`): horizontal band width 10 from (0,0) to (100,0) → painted `{0,−5,100,5}`; conservative → expanded by 25; region bounds; `objectBounds` of a repeat = union.
- [ ] Run red → implement → green → typecheck → commit `Add affine math, expansion, bounds`.

---

### Task 4: Intersections, footprint, classification

**Files:**
- Create: `src/geometry/footprint.ts`, `src/geometry/intersections.ts`
- Test: `src/geometry/footprint.test.ts`, `src/geometry/intersections.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // footprint.ts
  export type Seg = { a: Point; b: Point }
  export function footprint(sA: Seg, wA: number, sB: Seg, wB: number): Point[]   // 4 corners, §6.1; caller passes enlarged widths for clip/classification variants
  export function polygonsPenetrate(p: Point[], q: Point[], eps: number): boolean // Flatten intersection area > eps² or overlap depth > eps
  // intersections.ts
  export type IntersectionClass = 'eligible' | 'collinear' | 'endpoint' | 'near-parallel' | 'near-joint' | 'occluded' | 'crowded'
  export type Intersection = {
    a: { occ: BandOccurrence; segmentStart: Id; seg: Seg }
    b: { occ: BandOccurrence; segmentStart: Id; seg: Seg }     // a and b ordered so refKey(a) < refKey(b)
    point: Point
    cls: IntersectionClass
    reason: string                                              // '' when eligible
    classificationFootprint: Point[] | null                     // null for collinear/endpoint proxies stored separately
  }
  export function findIntersections(occurrences: Occurrence[]): Intersection[]   // all listed (non-ignored) intersections among band occurrences, using paint order of `occurrences` for the occluded test
  ```
- Consumes: Task 3.

- [ ] Tests (`footprint.test.ts`): perpendicular widths 10 and 4 → axis-aligned 10×4 rectangle centred on the intersection; 45° equal widths → rhombus with hand-computed corners; 15° unequal (6.35 vs 3.175) → corners checked against the analytic offset-line intersections (G4).
- [ ] Tests (`intersections.test.ts`), each building two or three bands as root occurrences via `expand`:
  - plain X crossing → one `eligible`, point at (50,50)
  - T-junction (one segment ends on the other) → `endpoint`
  - both ends meet (collinear seam) → not listed (`ignored`)
  - collinear overlap → `collinear`
  - 5° → `near-parallel`
  - polyline joint 1 mm from the crossing → `near-joint`; joint 40 mm away with 6.35 mm bands → `eligible`
  - region painted between A and B whose polygon enters the classification footprint → `occluded`; region 1 mm outside it → eligible
  - three bands through one point → all three intersections `crowded`
  - two crossings 1 mm apart on 6.35 mm bands → both `crowded`
  - lattice with spacing exactly equal to width: footprints touch, penetration 0 → both `eligible`; same lattice rotated 30° via an instance → same classes (G4)
  - self-crossing polyline → no intersection listed
  - `stacked cells` (Review Focus 2): repeat with `stepXMm: 0`, columns 3 → the three copies of one band yield no eligible intersections; function returns within 100 ms
- [ ] Run red → implement: prefilter by conservative bounds; Flatten `Segment.intersect`; parameters via projection; classes in the spec's precedence order; `near-joint` uses `miterExtent = w / (2·sin(φ/2))` capped at `5w`; `occluded` scans elements between A and B in `occurrences` order using segment stroke rectangles and region polygons; `crowded` compares classification footprints (proxies: overlap strip for collinear, disc radius `max(w)` approximated as an 8-gon for endpoint).
- [ ] Green → typecheck → commit `Add intersection discovery and classification`.

---

### Task 5: Crossing records, resolution, rematch, and the command layer

**Files:**
- Create: `src/domain/crossings.ts`, `src/domain/commands/index.ts`, `src/domain/commands/objects.ts`, `src/domain/commands/points.ts`, `src/domain/commands/materials.ts`, `src/domain/commands/order.ts`, `src/domain/commands/crossings.ts`
- Create: `src/geometry/resolve.ts`
- Test: `src/domain/crossings.test.ts`, `src/geometry/resolve.test.ts`, `src/domain/commands/commands.test.ts`, `src/domain/commands/property.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // domain/crossings.ts (no geometry imports)
  export function canonicalize(c: Crossing): Crossing
  export function canonicalKey(c: Crossing): string
  export function recordsOf(p: Project, ctx: ContextId): Crossing[]
  export function withRecords(p: Project, ctx: ContextId, records: Crossing[]): Project
  export function commonPrefix(a: Step[], b: Step[]): Step[]
  export function contextsAlong(p: Project, prefix: Step[]): ContextId[]   // [null, motif of step 0, motif of step 1, …]
  // geometry/resolve.ts
  export type Resolved = { over: 'a' | 'b'; source: 'default' | 'definition' | 'override'; record: Crossing | null; contextId: ContextId }
  export function resolveIntersection(p: Project, i: Intersection, paintIndex: (key: string) => number): Resolved   // §5.3 precedence
  export function isRecordResolved(p: Project, ctx: ContextId, c: Crossing): boolean
  export function rematchCrossings(before: Project, after: Project): Project                                        // §5.5
  // domain/commands/*.ts — every command is (project, args) => Project and ends with rematchCrossings where §5.5 requires
  export function addBand(p, args: { ctx: ContextId; materialId: Id; widthMm: number; points: {x:number;y:number}[]; closed?: boolean }): Project
  export function addRegion(p, args: { ctx: ContextId; materialId: Id; points: {x:number;y:number}[] }): Project
  export function deleteObjects(p, ids: Id[]): Project                 // removes records referencing them; deletes now-unused definitions
  export function translateObjects(p, ids: Id[], dx: number, dy: number): Project   // bakes for band/region, transform.x/y for instance/repeat
  export function rotateObjects(p, ids: Id[], deg: number, about: {x:number;y:number}): Project
  export function mirrorObjects(p, ids: Id[], axis: 'x' | 'y', about: {x:number;y:number}): Project   // §4.1 instance algebra
  export function setBandWidth(p, id: Id, widthMm: number): Project
  export function setPoint(p, objectId: Id, pointId: Id, xy: {x:number;y:number}): Project   // merges with a neighbour closer than MIN_SEGMENT_MM
  export function insertPoint(p, objectId: Id, afterPointId: Id, xy): Project
  export function deletePoint(p, objectId: Id, pointId: Id): Project            // rewrites records' segmentStart to previous point first
  export function setMaterial(p, ids: Id[], materialId: Id): Project
  export function addMaterial / updateMaterial / deleteMaterial / replaceMaterial(p, …): Project
  export function reorder(p, ids: Id[], how: 'forward' | 'backward' | 'front' | 'back'): Project
  export function toggleCrossing(p, i: Intersection, scope: 'all' | 'occurrence'): Project   // §5.4
  export function removeRecord(p, ctx: ContextId, recordId: Id): Project
  export function setTransform / setRepeatParams(p, id: Id, patch: Partial<Transform | RepeatField>): Project   // rejects if countOccurrences > MAX_OCCURRENCES (returns p unchanged and the caller reports)
  ```
  Commands that can fail return `{ ok: false; message: string }` via a small `CommandResult` type; the store shows the message.
- Consumes: Tasks 2–4.

- [ ] Tests (`crossings.test.ts`): `canonicalize` swaps a/b and `over` when `refKey(a) > refKey(b)`; key stable across selection order; `commonPrefix`; `contextsAlong`.
- [ ] Tests (`resolve.test.ts`) — the G1/G2 unit gates:
  - two polylines crossing twice, records with opposite `over` → each resolves to its own intersection
  - move an endpoint so one crossing slides along its segment → still resolved, hint updated
  - insert a vertex on the crossed segment on the near half → resolved by id; on the far half → rebound by hint to the new segment
  - delete the referenced start point → `segmentStart` rewritten to the previous point, resolved
  - width change → resolved
  - move endpoint so the crossing disappears → unresolved; move back → resolved again (record untouched in between)
  - hairpin counterexample from the geometry review: the lost record must not rebind onto the intersection owned by the other record
  - a record already unresolved before the command is not auto-rebound
  - 3×3 repeat, definition record + root override in cell (1,2): `resolveIntersection` returns `override` only for that cell, `definition` elsewhere; JSON round-trip (`importProject(JSON.stringify(p))`) preserves both
  - rows shrink to 1 removes the override record
  - nested instance: record in the outer definition with a non-empty path resolves for its occurrences
  - "All instances" toggle in an overridden cell removes the root record and flips the definition record
  - "This occurrence" toggle back to the outer value deletes the root record
  - instance transform changed then an unrelated edit → record still resolved, hint fresh
- [ ] Tests (`commands.test.ts`): each command on a small project → expected shape; `deleteObjects` of the last instance deletes its definition; `nudge merges points` (Review Focus 1); `setRepeatParams` exceeding the cap returns not-ok and leaves the project unchanged; `mirrorObjects` on a rotated instance negates rotation and toggles `mirrorX`.
- [ ] Tests (`property.test.ts`): for each fixture-like project in a small in-test corpus (blank, stripes-like, a 3×3 repeat with records, a nested motif), for every command with representative args, `validateProject(command(p))` is `null`. (Fixtures proper arrive in Task 15; extend this test then.)
- [ ] Run red → implement → green → typecheck → commit `Add crossing records, resolution, rematch, commands`.

---

### Task 6: Scene builder and SVG export

**Files:**
- Create: `src/geometry/scene.ts`, `src/export/svg.ts`, `src/export/download.ts`
- Test: `src/geometry/scene.test.ts`, `src/export/svg.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // scene.ts — spec §6.3 Scene type, plus:
  export function buildScene(p: Project, clipExtendMm: number): Scene
  export function pathD(points: Point[], closed: boolean): string          // "M x y L x y … [Z]" with 4-decimal numbers
  // svg.ts
  export function exportSvg(p: Project): string                              // §10; uses EXPORT_CLIP_EXTEND_MM; unique prefix per call
  export function escapeXml(s: string): string
  // download.ts (DOM)
  export function downloadText(filename: string, text: string, mime: string): void
  ```
- Consumes: Tasks 2–5.

- [ ] Tests (`scene.test.ts`): band O painted before U with O set over → elements are `[O, U, patch(O)]`; patch `segment` is O's crossed segment only; patch `clip` equals `footprint(sO, wO + 2e, sU, wU)` (enlarged across O's edges only, never across U's — spec §6.2); O already after U → no patch; two crossings on U with different over bands → two patches right after U, in canonical-key order; `clipExtendMm` changes only `clip` polygons, never `intersections[*].cls`; an unsupported world intersection of a resolved definition record appears in `intersections` with its class and the record appears in `unresolved` with a `worldHint` per occurrence only when unresolved in its context.
- [ ] Tests (`svg.test.ts`): output starts with `<svg xmlns=…width="300mm" height="450mm" viewBox="0 0 300 450">`; contains `<title>` with `&lt;` for a name `<b>`; a material named `"x"&y` escapes; patch path has `fill="none"` and miter attributes; every `id` starts with the prefix and two calls have different prefixes; no `class=`, `style=`, or `url(` not followed by `#`; the board rect uses the background colour or `none`.
- [ ] Run red → implement → green → typecheck → commit `Add scene builder and standalone SVG export`.

---

### Task 7: Editor store with history and preview

**Files:**
- Create: `src/editor/store.ts`, `src/editor/selection.ts`
- Test: `src/editor/store.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type Tool = 'select' | 'hand' | 'band' | 'rect' | 'polygon' | 'crossing'
  export type EditorState = {
    project: Project
    preview: { next: Project; onInterrupt: 'commit' | 'cancel' } | null
    tool: Tool; selection: Id[]; editContext: { motifId: Id; path: Step[] }[]
    camera: { x: number; y: number; zoom: number }          // world mm at viewport origin; px per mm
    snapEnabled: boolean; showGrid: boolean; gridMm: number; addToSelection: boolean
    crossingScope: 'all' | 'occurrence'; currentMaterialId: Id
    saveStatus: 'saved' | 'saving' | 'unsaved' | 'other-tab'
    message: string | null                                   // last command failure / notice
    // actions
    run(cmd: (p: Project) => Project | CommandResult): void  // settlePreview → apply → (history entry)
    setPreview(next: Project, onInterrupt: 'commit' | 'cancel'): void
    commit(): void; cancelPreview(): void; settlePreview(): void
    undo(): void; redo(): void
    replaceProject(p: Project): void                         // import / new: settle, set, clear history, reset context/selection
    select(ids: Id[]): void; setTool(t: Tool): void; enterContext(c): void; popContext(): void; setCamera(c): void
  }
  export const useEditor: UseBoundStore<StoreApi<EditorState>> & { temporal: … }
  export function currentContext(s: EditorState): ContextId
  export function contextMatrix(s: EditorState): Mat         // product of entered occurrence matrices
  ```
- Consumes: Tasks 2–5.

- [ ] `pnpm add zustand zundo`.
- [ ] Tests (`store.test.ts`), using the real store outside React:
  - 60 `setPreview` calls, then camera and selection changes, then `commit()` → `temporal.getState().pastStates.length` grew by exactly 1
  - undo, then a camera change, then redo → redo still available and applied
  - `run` while a gesture preview is active cancels the preview first; while a `'commit'` preview is active commits first (two history entries)
  - `undo()` during a gesture preview: preview cancelled, project undone, renderer source equals project
  - `replaceProject` clears both stacks and resets `editContext` and `selection`
  - after undo that removes a definition, `editContext` pops to a valid level and selection drops missing ids
  - `run` with a failing command sets `message` and adds no history entry
- [ ] Run red → implement with `temporal(…, { partialize, equality: (a, b) => a.project === b.project, limit: 100 })` → green → typecheck → commit `Add editor store with bounded history and preview`.

---

### Task 8: Canvas, camera, proxies, Select tool — the Slice-1 interaction proof (GATE)

**Files:**
- Create: `src/render/Canvas.tsx`, `src/render/SceneSvg.tsx`, `src/render/Proxies.tsx`, `src/render/overlays/Selection.tsx`, `src/editor/camera.ts`, `src/editor/input.ts`, `src/editor/tools/select.ts`, `src/ui/App.tsx` (modify), `src/ui/Toolbar.tsx`, `playwright.config.ts`, `e2e/helpers.ts`, `e2e/interaction-proof.spec.ts`
- Test: `e2e/interaction-proof.spec.ts`, `src/editor/camera.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // camera.ts
  export function viewBoxFor(camera, viewportPx: {w:number;h:number}): string
  export function screenToWorld(svg: SVGSVGElement, client: {x:number;y:number}): Point   // getScreenCTM().inverse()
  export function zoomAbout(camera, factor: number, worldAnchor: Point): Camera
  export function fitBoard(board, viewportPx): Camera
  // input.ts — @use-gesture bindings for the wrapper div per spec §7.2 table; exports useCanvasGestures(ref)
  // Proxies.tsx — one <rect data-object-id> per top-level object in the current context at its painted bounds
  // window.__cbpd (test-only, guarded by import.meta.env.MODE !== 'production'): { getProject, getHistoryLengths, run, replaceProject }
  ```
- Consumes: Tasks 6–7.

- [ ] `pnpm add @use-gesture/react react-moveable react-selecto` and `pnpm add -D @playwright/test`; `playwright.config.ts` with `webServer: pnpm dev`, projects `chromium`, `firefox`, `webkit`, and a `chromium-touch` project (`hasTouch: true`, `isMobile: true`).
- [ ] Unit test `camera.test.ts`: `zoomAbout` keeps the anchor fixed; `fitBoard` yields 5% margin.
- [ ] Render: `Canvas` = wrapper div (`touch-action: none`) → `<svg viewBox>` → `SceneSvg` (flat elements from `buildScene(previewOrProject, min(EDITOR_CLIP_EXTEND_PX / zoom, MAX_CLIP_EXTEND_MM))`, regions with seam stroke, bands, patches with `<clipPath>` in `<defs>`) → board mat (§7.8) → `Proxies` → selection overlay. Moveable (`container` = wrapper, `draggable`, `rotatable`, `resizable={false}`, `snappable={false}`, `origin={false}`) targets the selected proxies; Selecto (`selectableTargets: ['[data-object-id]']`, `getElementRect` from domain bounds, `hitRate: 0`) marquee on empty space.
- [ ] Select tool: click → topmost object under point from domain geometry; Shift/addToSelection toggles; Moveable `onDrag` → `setPreview(translateObjects(project, sel, Δworld))` with Δ from `screenToWorld` of the pointer delta (never Moveable's `translate`); `onDragEnd` → `isDrag && inputEvent.type !== 'touchcancel' ? commit() : cancelPreview()`; rotate with a frozen proxy rect and angle from pointer positions about the fixed centre → `rotateObjects`. Second pointer or Space → `moveable.stopDrag()`, cancel preview, abort Selecto (record whether Selecto exposes an abort; if not, unmount it while a second pointer is down).
- [ ] Write `e2e/interaction-proof.spec.ts` implementing spec §15 (a)–(j) against a seeded project (`window.__cbpd.replaceProject` with one band, one region, one rotated instance, one 2×2 repeat). Each assertion is its own test. Run in chromium and chromium-touch (touch for f, g).
- [ ] Run the proof. **Gate:** all of (a)–(j) pass, or each failure is recorded in `docs/decisions/2026-09-24-slice1-interaction.md` with the exact library behaviour observed. If a failure is a library coordinate/event limitation that cannot be arbitrated with configuration, STOP and report to the orchestrator (do not build replacement interaction machinery in this task).
- [ ] Commit `Add canvas, camera, selection with Moveable/Selecto proof`.

---

### Task 9: Crossing render proof in the browser (GATE)

**Files:**
- Create: `e2e/crossing-proof.spec.ts`, `e2e/raster.ts`
- Modify: `src/render/SceneSvg.tsx` if the proof finds a rendering defect

**Interfaces:**
- Produces: `e2e/raster.ts` → `rasterizeSvg(page, svgText, widthPx): Promise<ImageData-like {width,height,data}>` (draws the SVG into an `<img>` on a canvas in a fresh `page.goto('about:blank')`), `samplePixel`, `colorEquals(rgb, hex, tol)`.
- Consumes: Tasks 6, 8.

- [ ] Seed a project: band A (walnut, 6.35 mm) and band B (maple, 3.175 mm) crossing twice at 30° and 90° with opposite records; a third pair at 15° unequal widths; a region between two crossing bands (should classify `occluded`).
- [ ] For editor and for `exportSvg` output rasterised standalone, in chromium, firefox, webkit: at each eligible intersection the pixel at the point and at four footprint-interior offsets equals the effective over colour (tolerance 3/255); a 1-px band along each clip edge contains only the two band colours; the `occluded` crossing renders by paint order and its marker class is reported via `window.__cbpd`.
- [ ] **Gate:** passes in all three engines, or the failing case is recorded with a screenshot in `docs/decisions/2026-09-24-slice2-crossing.md`. If clipped re-paint cannot isolate an eligible crossing, follow spec/packet fallback (Clipper2 footprints) only after reporting to the orchestrator.
- [ ] Commit `Prove crossing compositing in three engines`.

---

### Task 10: Units parser/formatter and numeric inspector fields

**Files:**
- Create: `src/domain/units.ts`, `src/ui/Inspector/NumberField.tsx`, `src/ui/Inspector/Inspector.tsx`, `src/ui/Inspector/BoardPanel.tsx`, `src/ui/Inspector/BandPanel.tsx`, `src/ui/Inspector/RegionPanel.tsx`, `src/ui/Inspector/SelectionPanel.tsx`
- Test: `src/domain/units.test.ts`, `e2e/inspector.spec.ts`

**Interfaces:**
- Produces:
  ```ts
  export type Unit = 'in' | 'mm'
  export function parseLength(text: string, defaultUnit: Unit): { ok: true; mm: number } | { ok: false; error: string }
  export function formatLength(mm: number, unit: Unit): string
  export function formatAngle(deg: number): string
  export function parseAngle(text: string): { ok: true; deg: number } | { ok: false; error: string }
  // NumberField props: { label; value: number; unit: Unit | 'deg' | null; policy: 'positive' | 'nonneg' | 'any' | 'integer1to50'; onPreview(v); onCommit(v) }
  ```
- Consumes: Task 7.

- [ ] Tests (`units.test.ts`): `0.25`→6.35; `.5`; `1/4`; `3/16`; `1 1/8`→28.575; `1-1/8`; `-1-1/8`→−28.575; `1 1/2 mm`→1.5; `25.4mm`; `1.125in`; `1"`; `smart quote inch` `1 1/8”`→28.575; `1,5`→1.5 default mm; `5.`→5; rejects: empty, `1 - 1/8`, `1/0`, `2ft`, `1e3`, `1in mm`, `abc`. Formatting: 28.575 in → `1 1/8`; 4.7625 → `3/16`; 50.8 → `2`; 7.62 (0.3") → `0.300`; 25 mm in inches → `63/64`; mm: 25.4→`25.4`, 25→`25`, 3.175→`3.18`; angles `30`, `22.5`.
- [ ] Implement `units.ts` with the §8 regex; `NumberField` with `inputMode="text"` etc., preview on valid keystroke, commit on Enter/blur only when text ≠ text-at-focus, Esc reverts; the four panels per §7.5 (Board, Band incl. per-point list with per-segment length/angle and insert/delete, Region incl. W/H, Selection with bounds X/Y, Rotate by, Mirror, order buttons).
- [ ] e2e (`inspector.spec.ts`): type `3/16` into width → path stroke-width 4.7625 live, one history entry on blur; Tab through five point fields without typing → history unchanged, coordinates unchanged to 1e-9; Esc reverts.
- [ ] Commit `Add unit parsing and numeric inspector`.

---

### Task 11: Drawing tools with snapping and typed length/angle

**Files:**
- Create: `src/geometry/snap.ts`, `src/editor/tools/draw.ts`, `src/render/overlays/DrawPreview.tsx`, `src/render/overlays/SnapGuide.tsx`, `src/render/overlays/Grid.tsx`, `src/ui/ToolOptions.tsx`
- Test: `src/geometry/snap.test.ts`, `e2e/drawing.spec.ts`

**Interfaces:**
- Produces:
  ```ts
  export type SnapTargets = { points: Point[]; lines: Array<{ a: Point; b: Point }>; gridMm: number; board: Box }
  export function collectSnapTargets(p: Project, ctx: ContextId, contextMatrix: Mat, exclude: Id[], intersections: Intersection[]): SnapTargets
  export function snapPoint(pt: Point, targets: SnapTargets, toleranceMm: number): { point: Point; guide: 'point' | 'line' | 'grid' | null }
  export function snapSegmentEnd(start: Point, pt: Point, targets, toleranceMm, angleSnap: boolean): { point: Point; angleDeg: number; lengthMm: number; guide }
  ```
- Consumes: Tasks 8, 10.

- [ ] Tests (`snap.test.ts`): point beats line beats grid within tolerance; angle snap to 15° multiples within ±4°, then length to grid along the ray; a point target within tolerance overrides the angle; exclusion of the moving selection; edit-context targets include other occurrences of the entered definition mapped into definition space.
- [ ] Implement Band/Polygon/Rectangle tools per §7.4 (pointerup placement with slop, own double-tap, merge-with-previous, Finish/Undo point/Cancel in `ToolOptions`, Length/Angle fields that place on Enter, closing on first point, `closed` band on returning to start), snap guides, grid overlay (when `showGrid`), snap toggle, Alt temporary disable.
- [ ] e2e (`drawing.spec.ts`): draw a 2-point band with the mouse → one band, one history entry; type Length `4` and Angle `30` → point placed at hand-computed position; double-click finish leaves no duplicate point; touch project: tap, tap, Finish button → band; two-finger pan mid-draw places no point.
- [ ] Commit `Add drawing tools with snapping`.

---

### Task 12: Materials palette and selection commands

**Files:**
- Create: `src/ui/MaterialPalette.tsx`, `src/ui/MaterialEditor.tsx`, `src/editor/keyboard.ts`, `src/domain/commands/duplicate.ts`, `src/geometry/offset.ts`, `src/domain/commands/clipboard.ts`
- Test: `src/geometry/offset.test.ts`, `src/domain/commands/duplicate.test.ts`, `e2e/materials.spec.ts`

**Interfaces:**
- Produces:
  ```ts
  export function offsetPolyline(points: Point[], distance: number, closed: boolean): Point[]   // miter-offset joints, sign = side
  export function duplicateObjects(p, ctx, ids): { project: Project; newIds: Id[] }             // in place; fresh ids incl. points; definition-internal records untouched
  export function offsetCopyBand(p, id, side: 'left' | 'right', widthMm: number): Project      // distance (w + w')/2
  export type Clipboard = { objects: DesignObject[]; motifs: MotifDefinition[] }               // in-app only
  export function copyObjects(p, ids): Clipboard; export function pasteObjects(p, ctx, clip): Project | CommandResult   // fails visibly if a referenced definition no longer exists and is not in the clipboard
  ```
- Consumes: Tasks 5, 10.

- [ ] `pnpm add @radix-ui/react-popover @radix-ui/react-tooltip @radix-ui/react-dialog`.
- [ ] Tests: `offsetPolyline` of an L at distance 5 → inner corner at the miter intersection; closed square offset outward → larger square; `duplicateObjects` gives fresh ids for objects and points and identical geometry; `paste after definition gone` (Review Focus 3) returns not-ok.
- [ ] Implement palette (current material, assign, add/edit via Popover, delete when unused with count, Replace everywhere), keyboard dispatcher per §7.4 (one listener; ignores inputs except Esc; exact modifiers; `preventDefault` on Space/Ctrl+D/G/Y), selection commands wired to toolbar and keys: delete, duplicate, copy/paste, mirror X/Y, rotate 90, rotate by, nudge (screen axes mapped into context, grid step, Shift ×10), order, offset copy.
- [ ] e2e (`materials.spec.ts`): select two bands, click Walnut → both recolour, one history entry; Replace Maple→Cherry updates every occurrence; typing `b` in the project-name field does not switch tools; Backspace in a field does not delete the selection.
- [ ] Commit `Add materials palette, clipboard, selection commands`.

---

### Task 13: Motifs, instances, edit context, repeat, detach

**Files:**
- Create: `src/domain/commands/motifs.ts`, `src/ui/Inspector/InstancePanel.tsx`, `src/ui/Inspector/RepeatPanel.tsx`, `src/ui/Breadcrumb.tsx`, `src/render/overlays/ContextScrim.tsx`, `src/render/overlays/Pivot.tsx`
- Test: `src/domain/commands/motifs.test.ts`, `e2e/motifs.spec.ts`

**Interfaces:**
- Produces:
  ```ts
  export function createMotif(p, ctx, ids: Id[], name?: string): { project: Project; motifId: Id; instanceId: Id }   // pivot = painted-bounds centre; §5.6 record moves; re-canonicalize
  export function makeRepeat(p, instanceId: Id): Project        // 2×2, steps = definition painted size × scale
  export function detachInstance(p, instanceId: Id): Project    // §5.6 rules incl. override-wins and full id remap
  export function renameMotif(p, motifId, name): Project
  ```
- Consumes: Tasks 5, 8, 10, 12.

- [ ] Tests (`motifs.test.ts`): createMotif re-bases children so their bounds centre is (0,0) and the instance sits at the old centre (world positions unchanged after expand, to 1e-9); records between two selected bands move into the definition; a record with one side selected gets the instance step prefixed and stays canonical (include a pair where the sort order flips); a root record addressing inside a selected instance becomes a definition record with a non-empty path; makeRepeat 2×2 tiles seamlessly (adjacent cell painted bounds touch, no overlap, for a square lattice); detach with an override keeps the override and drops the copied definition record; detach with a nested instance remaps all ids; deleting the last instance removes the definition; all outputs validate.
- [ ] Implement panels (§7.5 Instance/Repeat incl. ½-step buttons, world width read-out, Edit Motif, Detach, overrides list with Remove, motif name), breadcrumb + Done, edit-context entry by double-tap / button, scrim rendering (§7.6: full scene, 60% scrim, entered occurrence re-drawn above), input mapping through `inverse(contextMatrix)` including the mirrored-rotation sign and snap tolerance scaling, re-targeting on tapping another occurrence, pivot marker.
- [ ] e2e (`motifs.spec.ts`): draw 2 bands → marquee → Ctrl+G → instance appears, world render unchanged (screenshot diff ≤ AA); Repeat → 2×2; set rows 3, columns 3 via inspector → 9 cells live; double-click a cell → breadcrumb shows the motif; change a band width inside → all 9 cells update; Done; undo ×N returns to the two bands.
- [ ] Commit `Add motifs, repeat fields, in-place editing`.

---

### Task 14: Crossing tool UI

**Files:**
- Create: `src/editor/tools/crossing.ts`, `src/render/overlays/CrossingMarkers.tsx`, `src/ui/Inspector/CrossingList.tsx`
- Test: `e2e/crossings.spec.ts`

**Interfaces:**
- Consumes: Tasks 5, 6, 8, 13. Uses `Scene.intersections` and `Scene.unresolved`.

- [ ] Implement markers (filled/badged/hatched/ring per §7.4), hit radius by pointer type, nearest-centre selection, scope control shown only when a common motif ancestor exists, tap-to-toggle through `toggleCrossing`, tap-unsupported shows the reason in `ToolOptions`, unresolved records listed with Remove in Band/Instance/Repeat panels, `CrossingList` in the Band panel with toggle buttons (keyboard path).
- [ ] e2e (`crossings.spec.ts`): basket-weave motif 3×3: toggle in "All instances" → every cell flips (pixel samples at three cells); switch to "This occurrence", toggle cell (1,2) → only that cell differs; toggle it back → root record gone (`window.__cbpd.getProject().crossings.length === 0`); unsupported marker tap shows `near-parallel`; keyboard: Tab to a band, use the crossing list button → toggled.
- [ ] Commit `Add crossing tool and inspector crossing list`.

---

### Task 15: Fixtures A–F and the property test corpus

**Files:**
- Create: `src/fixtures/stripes.json`, `checker.json`, `basket-weave.json`, `chevron-diamond.json`, `isometric.json`, `interlace.json`, `src/fixtures/index.ts`, `src/fixtures/fixtures.test.ts`
- Modify: `src/domain/commands/property.test.ts` (use the fixtures)

**Interfaces:**
- Produces: `export const fixtures: Record<'stripes'|'checker'|'basketWeave'|'chevronDiamond'|'isometric'|'interlace', Project>` and `interlacePerformance(): Project` (repeated so `countOccurrences ≥ 1000`).
- Consumes: Task 2.

- [ ] Author the six original fixtures per spec §12 (hand-written JSON; ids may be readable slugs matching the id regex). F: all crossings inside the cell; ≥ 40 eligible per field; alternating definition records; two root overrides.
- [ ] `fixtures.test.ts`: each validates; F yields ≥ 40 `eligible` intersections and zero unresolved; C's default repeat step equals the definition painted size; performance variant ≥ 1000 occurrences and ≤ 5000.
- [ ] Extend the property test to run every command over every fixture.
- [ ] Add a dev-only "Load fixture" menu (guarded by `import.meta.env.DEV`) for manual inspection.
- [ ] Commit `Add original acceptance fixtures`.

---

### Task 16: Persistence

**Files:**
- Create: `src/storage/local.ts`, `src/ui/ProjectMenu.tsx`, `src/ui/StatusBar.tsx`, `src/ui/RecoveryBanner.tsx`
- Test: `src/storage/local.test.ts`, `e2e/persistence.spec.ts`

**Interfaces:**
- Produces:
  ```ts
  export const PROJECT_KEY = 'cbpd:project:v1'; export const RECOVERED_KEY = 'cbpd:recovered'
  export function loadAtStartup(storage: Storage): { kind: 'project'; project: Project } | { kind: 'recovered'; text: string } | { kind: 'none' }
  export function createAutosave(storage: Storage, get: () => Project, onStatus: (s: SaveStatus) => void): { schedule(): void; flush(): void; suspend(): void; dispose(): void }   // 500 ms debounce, pagehide/visibilitychange flush, storage-event detection
  ```
- Consumes: Tasks 2, 7.

- [ ] Unit tests with a fake `Storage`: valid key → project; invalid → moved to `RECOVERED_KEY`, main key removed; `setItem` throwing → status `unsaved`, then a later successful write → `saved`; `storage` event from another tab → `other-tab` and no further writes.
- [ ] Implement menu (New with confirm unless blank, Open via file input + `importProject`, Download JSON, Export SVG placeholder wired in Task 17), status bar, recovery banner (Download recovered / Discard), autosave on commit/undo/redo.
- [ ] e2e (`persistence.spec.ts`) — G8 browser part: quota failure via `addInitScript` overriding `Storage.prototype.setItem` → status shows unsaved and Download works, then restore → status clears; corrupt key → banner, edit a band, recovered key byte-identical; Open a malformed file → error shown, project and history lengths unchanged; reload within 100 ms of an edit → edit persisted (pagehide flush); New on a non-blank project → confirmation dialog.
- [ ] Commit `Add local autosave, recovery, open and download`.

---

### Task 17: Export UI and G5 parity gate

**Files:**
- Modify: `src/ui/ProjectMenu.tsx`
- Create: `e2e/export-parity.spec.ts`

- [ ] Wire **Export SVG** to `downloadText(name + '.svg', exportSvg(project), 'image/svg+xml')`.
- [ ] e2e in chromium, firefox, webkit: load Fixture F; export via `window.__cbpd` (avoid the download dialog) and rasterise standalone at 800 px wide; rasterise the editor's Board region at the same size (fit camera, hide overlays via a test flag); per-intersection pixel sampling as in Task 9 for every eligible intersection; max per-pixel difference outside an edge mask (pixels whose 3×3 neighbourhood has > 1 distinct colour in either image) ≤ 8/255; string checks from Task 6.
- [ ] **Gate:** passes in all three engines. Record results in `docs/decisions/2026-09-24-gates.md` (create; one row per gate from now on).
- [ ] Commit `Add SVG export and parity gate`.

---

### Task 18: Authorability tests (G6)

**Files:**
- Create: `e2e/author/*.spec.ts` (one per fixture), `e2e/author/actions.ts` (helpers: `drawBand(points)`, `setField(label, text)`, `clickSwatch(name)`, `createMotif()`, `repeat(rows, cols)`, `toggleCrossingAt(point, scope)`, …, each incrementing an action counter)

- [ ] For each of A–F: from a blank project, perform only UI actions to reproduce the fixture; then edit the source motif (where one exists) and one dimension; assert `buildScene` of the authored project matches the fixture's scene within 0.05 mm on occurrence points and equal crossing classes/over keys. Log action count and elapsed time to the test output; any workaround needed is written to `docs/decisions/2026-09-24-gates.md` as a finding.
- [ ] **Gate:** all six authored. If any family cannot be authored with the specified UI, record the missing operation and STOP for the orchestrator's decision rather than adding tools ad hoc.
- [ ] Commit `Add authorability tests for fixtures A–F`.

---

### Task 19: Tablet gate (G7) and accessibility checks

**Files:**
- Create: `e2e/tablet.spec.ts`, `e2e/a11y.spec.ts`, `docs/decisions/2026-09-24-ipad-checklist.md`

- [ ] `tablet.spec.ts` (chromium-touch with CDP `Input.dispatchTouchEvent` for multi-touch): tap-create Band with Finish; tap-select; drag; two-finger pan and pinch → `scrollY === 0`, `visualViewport.scale === 1`; `touchcancel` mid-drag → project and history unchanged; Add-to-selection toggle then two taps → two selected.
- [ ] `a11y.spec.ts`: every toolbar/rail control has an accessible name; keyboard-only flow: Tab to select a band, set width via the inspector, toggle a crossing from the crossing list, Ctrl+Z; at 200% browser zoom (`page.setViewportSize` + `deviceScaleFactor`) a click at a computed screen point selects the expected object.
- [ ] Write the manual iPad Safari checklist (items from spec G7) for the human to run; leave results blank.
- [ ] Commit `Add tablet and accessibility gates`.

---

### Task 20: Performance measurement (G9)

**Files:**
- Create: `e2e/performance.spec.ts`

- [ ] Load `interlacePerformance()`; record `patch count` and occurrence count from `window.__cbpd`; drag a root band for 60 frames via CDP mouse events with `requestAnimationFrame` timestamps collected in-page; report median and p95 frame time; measure inspector width-edit latency (time from `input` event to next paint). Write numbers to `docs/decisions/2026-09-24-gates.md`.
- [ ] If median > 16 ms: profile with `page.tracing`, then apply the packet's order (reduce redundant DOM → exploit reuse → cache classification per project version, which the spec's fixed-margin design allows) and re-measure. Record each step.
- [ ] Commit `Measure performance on the interlace fixture`.

---

### Task 21: Independent code review and final report

- [ ] Run `pnpm typecheck && pnpm test && pnpm test:e2e` and paste the summary into `docs/decisions/2026-09-24-gates.md`.
- [ ] Dispatch the independent code/product review (orchestrator task; reviewers on Opus 5.5): simplicity/defensibility, spec conformance, gate evidence. Fix accepted findings in follow-up commits.
- [ ] Perform the product success test manually (packet): record timings and friction in `docs/decisions/2026-09-24-final-report.md` with: what works, measured performance, known limitations, intentionally unsupported crossing classes (spec §5.2 table), and departures from the packet with evidence.

---

## Self-review notes

- Spec coverage: §2–§6 → Tasks 2–6; §7.1 → 7; §7.2–7.3 → 8; §7.4 tools → 11, commands → 12, motif ops → 13, crossing → 14; §7.5 → 10, 13; §7.6 → 13; §7.7 → 11; §7.8 → 8; §8 → 10; §9 → 16; §10 → 6, 17; §11 → 19; §12 → 15; §13 gates: G1/G2 → 5, G3 → 3 + 8, G4 → 4, G5 → 9 + 17, G6 → 18, G7 → 19, G8 → 2 + 16, G9 → 20; §15 → 8.
- Type consistency: `Mat`, `Occurrence`, `Intersection`, `Scene`, `ContextId`, `CommandResult`, `Clipboard` are defined once and referenced by name thereafter.
- Review Focus items are pinned to Tasks 5, 4, 12, 2, 10 respectively.

---

### Task 22: Spec-gap closure found by the authorability gate (executes between Tasks 18 and 19)

**Files:**
- Modify: `src/render/Canvas.tsx`, `src/editor/tools/select.ts`, `src/geometry/snap.ts`, `src/editor/tools/draw.ts`, `src/ui/Toolbar.tsx`, `src/domain/commands/property.test.ts`
- Create: `src/render/overlays/VertexHandles.tsx`
- Test: `src/geometry/snap.test.ts` (extend), `e2e/vertex-handles.spec.ts`, `e2e/move-snap.spec.ts`

**Interfaces:**
- Consumes: `setPoint`, `insertPoint`, `deletePoint` (Task 5), `collectSnapTargets`/`snapPoint` (Task 11), Moveable drag path (Task 8).
- Produces: vertex/midpoint handle overlay for a single selected Band or Region; snapping during Moveable drags; `snapPoint` along-line grid rule; `snapSegmentEnd` grid-points-near-ray rule.

- [ ] **Vertex and midpoint handles** (spec §7.4 Select bullet): when exactly one Band or Region is selected, render a handle at each vertex and at each segment midpoint (screen-px sized, above the selection overlay). Dragging a vertex handle previews `setPoint` with snapping (targets from `collectSnapTargets` excluding the object; point > line > grid) and commits on release; dragging a midpoint handle previews `insertPoint` then moves the new point; dropping a vertex within snap tolerance of a neighbour deletes it (`deletePoint`). Raw Pointer Events on the handle elements; Moveable's drag must not start from a handle press. Touch hit radius 22 px.
- [ ] **Snapping while moving a selection** (spec §7.7): at Moveable drag start, freeze targets from `project` excluding the selection and compute sources (selection vertices, endpoints, bounds edges/centres); each frame, find the nearest source–target pair within tolerance and apply that offset to Δworld (point > line > grid); show the snap guide; Alt disables.
- [ ] **Crossing tool button** in the rail (label "Crossing", key X in the tooltip).
- [ ] **Snap rules:** (a) `snapPoint`: after a line snap, if a grid point on that line is within tolerance of the snapped point, snap to it (guide 'point'); (b) `snapSegmentEnd`: with an angle captured, candidate lengths are the distances to grid points whose perpendicular distance to the ray is within tolerance (grid intersections on or near the ray), plus line-target intersections; choose the nearest to the pointer; never whole grid steps along the ray. Unit tests: a 45° ray from a grid point snaps to 60√2 (grid point (60,60)), not 85; a grid point on a Board centre line snaps exactly to the grid point.
- [ ] **Property-test runtime:** cap toggle-command generation to the first 40 listed intersections per fixture so the interlace case runs well under 5 s; keep the 20 s timeout as headroom.
- [ ] e2e: vertex drag with snap to another band's endpoint commits one history entry; midpoint insert; neighbour-merge delete; Moveable drag snaps a band endpoint onto a region vertex (world coordinates exact to 1e-6); Alt held during the drag disables the snap.
- [ ] Update the G6 workaround notes in `docs/decisions/2026-09-24-gates.md` to say which are now resolved (do not re-run G6 here; Task 21 re-runs everything).
- [ ] Commit: `Add vertex handles, move snapping, snap rules`.

---

### Task 23: Diagnose and fix the middle-button pan race (executes after Task 20, before Task 21)

**Files:**
- Modify: `src/editor/input.ts` and/or `src/render/Canvas.tsx` (only if the cause is in the app); `e2e/interaction-proof.spec.ts` (only if the cause is test authorship)
- Test: `e2e/interaction-proof.spec.ts` (i), run `--repeat-each 10 --workers=1` in chromium and webkit

**Interfaces:** consumes the §7.2 input-ownership table; produces no new interface.

- [ ] Reproduce: `pnpm exec playwright test e2e/interaction-proof.spec.ts -g "(i)" --project=chromium --repeat-each 10 --workers=1` (Task 19 measured 3/8 failures single-worker on the middle-button drag pan assertion).
- [ ] Apply the systematic-debugging discipline: capture the failing assertion's actual vs expected camera values and the sequence of pointer/mouse events use-gesture received (instrument with a temporary console log read via Playwright, removed before commit). Form a hypothesis (candidates: use-gesture's drag `filterTaps`/threshold before the first move; the middle-button `pointerdown` arriving before `mousedown` ordering with Selecto; the test's `page.mouse` sequence not awaiting a frame; a `passive` wheel/gesture option racing). Test the hypothesis with a minimal change.
- [ ] Fix the cause. If the cause is in the app (a real race in the pan path), fix it in `input.ts`/`Canvas.tsx` and keep the test unchanged. If the cause is the test (missing `nextFrame` waits, unrealistic event timing), fix the test and say so in the report. Do not widen tolerances.
- [ ] Verify: `--repeat-each 10 --workers=1` passes 10/10 in chromium and webkit; full `pnpm test:e2e --project=chromium` green.
- [ ] Record the root cause in `docs/decisions/2026-09-24-gates.md` next to the §15 row (replace the flake footnote).
- [ ] Commit: `Fix middle-button pan race` (or `Fix flaky pan proof test`).
