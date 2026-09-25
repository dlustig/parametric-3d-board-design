# Cutting Board Pattern Designer — V1 SPEC

Status: revision 4 (rev 3 plus one implementation-time correction, §16 last row) (slop audit; geometry/crossing/export; editor/tablet/persistence; product/authorability). Resolutions are logged in §16. Companion: `docs/decisions/2026-09-24-reconciliation.md`.

This document is the contract for V1: document model, geometry semantics, crossing identity and compositing, editor behaviour, persistence, export, and acceptance gates. Product intent, scope, and non-goals come from the research packet and are not restated except where a rule depends on them.

## 1. Vocabulary and conventions

- **mm** is the only stored unit; angles are degrees. Display units are `in` or `mm`.
- **World space**: Board top-left is `(0, 0)`, +X right, +Y down. Positive rotation is visually clockwise. Objects may extend outside the Board and are clipped in the finished view.
- **Context**: the ordered list that owns an object: the Project root or one Motif definition. Objects inside a definition are in **definition space**, whose origin is the definition's pivot.
- **Occurrence**: one visible copy of a source object after expanding instances and repeats, addressed by a path (§5.1).
- **Paint order**: within a context, later children are on top. Expansion (§4.4) flattens this to one world list.
- Computed geometry is compared with tolerances (§4.6), never `===`.

## 2. Document schema (`schemaVersion: 1`)

```ts
type Id = string                          // crypto.randomUUID(); validated as /^[A-Za-z0-9_-]{1,64}$/

type Project = {
  schemaVersion: 1
  id: Id
  name: string
  displayUnits: 'in' | 'mm'
  board: { widthMm: number; heightMm: number; backgroundMaterialId: Id | null }
  materials: Material[]                   // palette order
  objects: Record<Id, DesignObject>       // all source objects, any context
  rootChildren: Id[]                      // paint order, back to front
  motifs: Record<Id, MotifDefinition>
  crossings: Crossing[]                   // records whose context is root
}

type Material = { id: Id; name: string; color: string }   // color matches /^#[0-9a-fA-F]{6}$/
type Point = { id: Id; x: number; y: number }             // in the owning context's space

type Band = { type: 'band'; id: Id; materialId: Id; widthMm: number; closed: boolean; points: Point[] }  // ≥ 2 points; closed needs ≥ 3
type Region = { type: 'region'; id: Id; materialId: Id; points: Point[] }                                // ≥ 3 points

type Transform = { x: number; y: number; rotationDeg: number; mirrorX: boolean; mirrorY: boolean; scale: number }  // scale > 0

type MotifInstance = { type: 'motif-instance'; id: Id; motifId: Id; transform: Transform }

type RepeatField = {
  type: 'repeat'; id: Id; motifId: Id; transform: Transform
  rows: number; columns: number          // integers 1..50
  stepXMm: number; stepYMm: number       // any finite value
  rowOffsetMm: number                    // X shift on odd rows
  columnOffsetMm: number                 // Y shift on odd columns
  alternateMirrorX: boolean              // mirror X on odd columns
  alternateMirrorY: boolean              // mirror Y on odd rows
  alternateRotationDeg: 0 | 90 | 180     // rotation where (row + column) is odd
}

type DesignObject = Band | Region | MotifInstance | RepeatField
type MotifDefinition = { id: Id; name: string; children: Id[]; crossings: Crossing[] }

type Crossing = {                        // §5
  id: Id
  a: BandRef; b: BandRef                 // stored in canonical order: refKey(a) < refKey(b)
  over: 'a' | 'b'
  hint: { x: number; y: number }         // last resolved intersection point, in the record's context space
}
type BandRef = { path: Step[]; bandId: Id; segmentStart: Id }
type Step = { instanceId: Id } | { repeatId: Id; row: number; column: number }
```

### 2.1 Invariants (validated on import; every command preserves them — tested by a property test over the fixtures)

1. Every object id appears in exactly one of `rootChildren` or one `motifs[*].children`; every listed id exists in `objects`.
2. Every `materialId`, `motifId`, non-null `backgroundMaterialId`, and crossing `bandId` references an existing record of the right type. Each crossing `path` walks consistently from the record's context (each step's object is a child of the context reached so far; repeat `row`/`column` are inside the field's grid). `segmentStart` is a point id of that Band. A ref that walks correctly but names the last point of an open Band is valid and simply resolves to nothing.
3. Point ids are unique within an object. Consecutive points (and first/last of a closed Band or Region) are at least `MIN_SEGMENT_MM` apart.
4. The motif reference graph is acyclic.
5. All numbers finite; `widthMm > 0`; board dimensions `> 0`; `scale > 0`; rows/columns integers 1..50; total expanded occurrences ≤ `MAX_OCCURRENCES` (5000).
6. Within a context, crossing records are unique by canonical key (§5.3), `a ≠ b`, and stored in canonical order.

Invalid documents are rejected whole with the first failing path. Nothing is repaired.

### 2.2 Differences from the research model

Bands and Regions carry no Transform (move/rotate/mirror bake into points). `MotifDefinition.origin` does not exist: Create Motif re-bases children so the pivot is at definition `(0, 0)` (§7.4). `Band.closed` is added for borders and outlines.

## 3. Materials

- Starter palette on a new project (all editable): Maple `#E8D4A8`, Walnut `#5C3A21`, Cherry `#A8543A`, Purpleheart `#6B2E6B`, Padauk `#C8402A`, Ash `#DED2B4`, Oak `#C19A6B`, Wenge `#3B2A20`.
- Add, rename, recolour; delete only when unused (usage count shown). **Replace everywhere** swaps every reference in one history step.
- One material is **current** (highlighted swatch). With an empty selection, clicking a swatch sets the current material; new Bands/Regions use it. With Bands/Regions selected, clicking assigns to them. With only instances/repeats selected, the palette shows "Edit the motif to recolour".

## 4. Geometry semantics

### 4.1 Transforms

For `t: Transform`, `M(t) = T(x, y) · R(rotationDeg) · S(scale) · Mirror(mirrorX, mirrorY)` applied to column vectors, where `Mirror` negates x when `mirrorX` and y when `mirrorY`, `S` is uniform, and `R(θ)` in y-down space is `[[cos θ, −sin θ], [sin θ, cos θ]]` (positive θ clockwise on screen). Occurrence matrices compose outward: `world = M_parent · M(t)`. World width of a Band occurrence = `widthMm × ∏ scale` along its path; mirror never changes width. `vector-effect: non-scaling-stroke` is never used.

Mirroring an instance about a world axis: toggle `mirrorX` (or `mirrorY`), negate `rotationDeg`, and reflect `x` (or `y`) about the axis — because `Mx · R(θ) = R(−θ) · Mx`.

`geometry/affine.ts` owns matrix composition and inversion (Flatten's `Matrix` has no inverse; inversion is needed for edit-context input mapping). No second matrix type.

### 4.2 Bands

Rendered as an SVG path along its points (`Z` when closed) with `fill="none"`, `stroke` = material colour, `stroke-width` = world width, `stroke-linejoin="miter"`, `stroke-miterlimit="10"`, `stroke-linecap="butt"`. Segment `i` runs from `points[i]` to `points[i+1]` and is identified by `points[i].id`; a closed Band's closing segment is identified by the last point's id.

### 4.3 Regions

Rendered as a closed path with `fill` = material colour, `fill-rule="nonzero"`, plus a same-colour stroke of `REGION_SEAM_MM` (0.1 mm) so abutting Regions show no anti-aliased background seam. This is a rendering choice, not geometry; the inspector and export dimensions are the polygon's. Self-intersecting polygons are allowed.

### 4.4 Expansion

`expand(project)` yields the flat world occurrence list in paint order:

- Root children in order. A Band/Region yields one occurrence, `path = []`, identity matrix.
- A MotifInstance yields the definition's children recursively with `path = [...parent, { instanceId }]`, matrix `parent · M(t)`.
- A RepeatField yields, row-major over `rows × columns`, the definition's children with `path = [...parent, { repeatId, row, column }]` and matrix `parent · M(t) · Cell(row, column)`:

```
Cell(r, c) = T(c·stepX + (r odd ? rowOffset : 0),  r·stepY + (c odd ? columnOffset : 0))
           · R((r + c) odd ? alternateRotationDeg : 0)
           · Mirror(alternateMirrorX && c odd, alternateMirrorY && r odd)
```

Each occurrence carries `key` (§5.1), `kind`, `sourceId`, `path`, `matrix`, `materialId`, `worldPoints`, and for Bands `worldWidth`, `closed`. Commands that would exceed `MAX_OCCURRENCES` are rejected with a visible message.

### 4.5 Bounds

- **Painted geometry** of a Band occurrence: its segments' stroke rectangles (each segment's endpoints offset ±`w/2` along the segment normal) plus, at each interior joint, the miter triangle between the two rectangles' outer corners and the miter tip (`w / (2 sin(φ/2))` from the vertex, bevelled where that exceeds `5w`, matching `stroke-miterlimit` 10). Used by the `occluded` and `crowded` tests.
- **Painted bounds**: the bounds of the stroke rectangles only (exact at butt ends; miter tips may exceed it). Used for selection proxies, marquee, fit, and the default repeat step.
- **Conservative bounds**: polyline bounds expanded by `5 × w` (a miter tip at `stroke-miterlimit` 10 reaches `w / (2 sin(φ/2)) ≤ 5w` from the centreline vertex). Used only to prefilter pair tests and painted-geometry overlap tests.
- Region bounds are polygon bounds. Instance/repeat bounds are the union of their occurrences' painted bounds.

### 4.6 Tolerances and constants (`geometry/tolerance.ts`)

| Name | Value | Use |
| --- | --- | --- |
| `EPS_GEOMETRY` | 1e-6 mm | point equality, parameter interior test |
| `MIN_SEGMENT_MM` | 0.01 mm | shortest legal segment; closer points are merged by commands |
| `MIN_CROSSING_ANGLE_DEG` | 10° | below this an intersection is `near-parallel` |
| `EPS_OVERLAP_MM` | 0.01 mm | minimum footprint penetration to count as overlap |
| `REMATCH_TOLERANCE_MM` | 3 mm | rebind radius around `hint` (§5.5) |
| `MAX_OCCURRENCES` | 5000 | expansion cap |
| `REGION_SEAM_MM` | 0.1 mm | §4.3 |
| `MAX_CLIP_EXTEND_MM` | 0.5 mm | upper bound of any renderer's patch clip enlargement; also used by `near-joint` |
| `EXPORT_CLIP_EXTEND_MM` | 0.2 mm | §6.2 patch clip enlargement in export |
| `EDITOR_CLIP_EXTEND_PX` | 1.5 px | §6.2 patch clip enlargement in the editor: `min(1.5 / zoom, MAX_CLIP_EXTEND_MM)` mm |
| `SNAP_TOLERANCE_PX` | 8 px | converted to mm through zoom (and occurrence scale in edit context) |
| `ANGLE_SNAP_DEG` | 15° step, ±4° capture | while drawing segments |
| `TAP_SLOP_PX`, `DOUBLE_TAP_MS` | 6 px, 300 ms | tap vs drag, double-tap detection |

## 5. Crossings: identity, scope, resolution

### 5.1 Keys

`stepKey({instanceId}) = 'i:' + id`; `stepKey({repeatId,row,column}) = 'r:' + id + ':' + row + ':' + column`. `occurrenceKey(path, sourceId) = stepKeys.join('/') + '#' + sourceId`. `refKey(ref) = occurrenceKey(ref.path, ref.bandId) + '@' + ref.segmentStart`. Ids cannot contain `:/#@|` by validation, so keys are unambiguous.

### 5.2 Intersection discovery and classification

Runs on Band occurrences in one space: world space for rendering; definition space (identity at the definition) when evaluating a definition context. Pairs are prefiltered by conservative bounds; segment intersections use Flatten `Segment.intersect`. Segments of the same occurrence are never compared.

Every intersection point between segments `sA` (occurrence A, width `wA`) and `sB` gets exactly one class, decided in this precedence order (first match wins):

| Class | Condition |
| --- | --- |
| `ignored` | both parameters are at segment ends (endpoint-to-endpoint contact, e.g. collinear Band ends meeting at a repeat seam). Not listed, not marked. |
| `collinear` | the segments overlap along a length |
| `endpoint` | a parameter is within `EPS_GEOMETRY` (scaled by segment length) of 0 or 1 on either segment, including a crossing exactly at a polyline joint |
| `near-parallel` | angle between directions outside `[MIN_CROSSING_ANGLE_DEG, 180 − MIN_CROSSING_ANGLE_DEG]` |
| `near-joint` | an interior vertex of either Band lies within `halfDiagonal(footprint with both widths + 2·MAX_CLIP_EXTEND_MM) + miterExtent(vertex)` of the point, where `miterExtent = w / (2 sin(φ/2))` capped at `5w` for joint angle φ |
| `occluded` | some element strictly between A and B in paint order has painted geometry (§4.5: stroke rectangles and miter triangles, or the Region polygon) penetrating the footprint (§6.1) by more than `EPS_OVERLAP_MM` |
| `crowded` | the plain (unenlarged) footprint penetrates another listed intersection's plain footprint on either occurrence by more than `EPS_OVERLAP_MM`. Proxy footprints: `collinear` uses the overlap strip; `endpoint` and `near-parallel` use a disc of radius `max(w)` (a near-parallel footprint is arbitrarily long and would crowd distant crossings). Triple points land here; flush-packed neighbours whose footprints only touch do not. |
| `eligible` | everything else |

Unsupported classes carry their reason. They are drawn with a distinct marker in the Crossing tool and get no toggle; tapping one shows the reason in the tool options bar. **Render eligibility is always decided per world intersection.** A definition record can be resolved in its own space while a particular world occurrence of it is additionally `unsupported (world)` because of neighbouring cells or root objects; that occurrence renders by paint order and is marked.

### 5.3 Records, scope, precedence

A record lives in exactly one context (`project.crossings` or `motifs[m].crossings`); its refs are relative to that context. `canonicalize(record)` sorts `a`/`b` by `refKey` and swaps `over` accordingly; every write goes through it. Canonical key = `refKey(a) + '|' + refKey(b)`.

- A record in a definition with empty paths applies to every occurrence of the definition ("all instances").
- A record in the root context with non-empty paths applies to one occurrence pair ("this occurrence").
- Records in a definition with non-empty paths (a nested instance addressed from an outer definition) arise from Create Motif (§5.6) and from toggles inside nested contexts. The resolver treats all three forms uniformly.

**Common ancestor** of two occurrences = their longest common path prefix. Their **contexts** are: root, then the definition of each step in the common prefix, innermost last.

**Precedence.** For a world intersection between `A` and `B`, look up the canonical key in each context from outermost (root, full paths) inward (paths with the prefix stripped). **The outermost record found wins.** With no record, paint order decides: the later occurrence is over.

**Limit (V1).** Occurrences with no common motif ancestor (two cells of one repeat, two instances, or a root Band and an instance interior) can only have root records. Their default is paint order, and the scope control is hidden. Fixture F keeps every strand crossing inside its cell.

### 5.4 Toggle semantics

Toggling an eligible intersection flips the effective over/under. The Crossing tool shows a scope control only when the pair has a common motif ancestor: **All instances** (default) or **This occurrence**.

- *All instances*: set the record in the innermost common definition to the opposite of the clicked occurrence's current effective value (creating it if absent); remove records for the same pair from every context outside it. Every occurrence, including the clicked one, then shows the flipped value.
- *This occurrence*: write (or flip) the root record. If the result equals the value the outer contexts would give without it, delete the root record instead (an override never shadows silently). Overridden occurrences get a distinct badge; the inspector lists a selected instance's/repeat's overrides with **Remove**.
- If the pair has an unresolved record in the target context, the toggle rebinds it (§5.5) and sets `over`.

### 5.5 Rematching after edits

Every command that changes any occurrence geometry or width (point edits, transforms, repeat parameters, width, definition edits, detach) ends with `rematchCrossings(before, after)` inside the same history step, computed from the pre-command project to the committed one (never per preview frame):

1. For every record resolved in `before` (its refs yielded a listed intersection), evaluate in `after`. If its refs still yield an intersection, update `hint`.
2. Otherwise collect listed intersections of the same occurrence pair within `REMATCH_TOLERANCE_MM` of `hint` that (a) did not exist as an intersection of that pair in `before` and (b) are not bound by another record in that context. Process lost records in canonical-key order. Exactly one candidate → rebind `segmentStart` (on the changed side or sides) and `hint`; otherwise leave the record untouched.
3. Records already unresolved in `before` are never auto-rebound; only an explicit toggle (§5.4) rebinds them, choosing the nearest hint if several match.

A record with no matching intersection is **unresolved**, a derived state. Unresolved records show a ring marker at `hint` (per occurrence, mapped to world) and appear in the inspector with **Remove** whenever a referenced Band, instance, or repeat is selected. Undo restores records exactly; import/export carries them verbatim.

Deleting a Band, instance, or repeat removes records that reference it; shrinking a repeat removes root records addressing removed cells. Deleting a vertex rewrites `segmentStart` of records naming it to the previous point (the merged segment) before rematching. Definition records survive instance deletion.

### 5.6 Motif operations and records

- **Create Motif** (§7.4): a ref is *inside* the selection if its `bandId` is a selected object or its path begins with a selected instance/repeat. Records with both refs inside move into the new definition unchanged (nested paths included). Records with one ref inside stay in the context with that ref's path prefixed by the new instance step. Records in outer contexts whose path reaches the selection through the context's own instances get the new instance step inserted at that depth. All moved records are re-canonicalized.
- **Detach instance**: definition children are copied into the context with baked points, widths × scale, and fresh ids for objects, points, and nested instances/repeats; definition records are copied with fresh ids, empty paths, and every copied id remapped in `bandId` and path steps. Context records whose path begins with the instance step have the step removed and all ids remapped. Where a copied definition record and an existing context record collide on canonical key, the context record (the override) wins and the copy is dropped.
- A definition that loses its last instance/repeat is deleted in the same history step (undo restores both). Motif names are edited from the instance/repeat inspector.

## 6. Compositing

### 6.1 Footprint

For segments `sA` (width `wA`) and `sB` (`wB`) crossing transversely, `footprint(sA, wA, sB, wB)` is the parallelogram bounded by the two stroke edges of each segment: its corners are the intersections of lines `offset(sA, ±wA/2)` with `offset(sB, ±wB/2)`, computed analytically in `geometry/footprint.ts`. Classification uses only this plain footprint, so it depends only on the document and is identical in editor and export. The footprint is the intersection of two infinite strips: near a butt end it can extend past the painted end of a Band. That is harmless (the patch paints only O's segment, and `occluded` guards elements between), but a pixel test at such a corner sees a legitimate three-way blend with the background, so G5 samples exclude a small clearance around segment ends. Overlap tests use Flatten polygon intersection with the `EPS_OVERLAP_MM` penetration threshold.

### 6.2 Patch

`buildScene(project, clipExtendMm)` takes only the patch clip enlargement `e` as a parameter (editor: `min(EDITOR_CLIP_EXTEND_PX / zoom, MAX_CLIP_EXTEND_MM)`; export: `EXPORT_CLIP_EXTEND_MM`; both ≤ `MAX_CLIP_EXTEND_MM`). Classification never uses `e`, so a camera change regenerates only clip polygons.

Let `O` be the effective over occurrence and `U` the under at an eligible intersection. If `O` is already after `U` in paint order, nothing is drawn. Otherwise the scene inserts a patch immediately after `U`:

```svg
<clipPath id="{prefix}-c{n}" clipPathUnits="userSpaceOnUse"><polygon points="…enlarged footprint…"/></clipPath>
<path d="M x1 y1 L x2 y2" fill="none" stroke="{O colour}" stroke-width="{wO}" stroke-linejoin="miter" stroke-miterlimit="10" stroke-linecap="butt" clip-path="url(#{prefix}-c{n})"/>
```

The path is **only the crossed segment of O** (the `near-joint` class guarantees no joint of O or U lies within reach of the clip, so O's segment stroke equals O's real paint there).

**Clip polygon** = `footprint(sO, wO + 2e, sU, wU)`: enlarged across O's edges only. The extra area is limited by O's own stroke, so the patch never paints outside O's real paint and never beyond U's edges; this removes the anti-aliasing seam along O's edges. The clip is **not** enlarged across U's edges: doing so paints O beyond U into whatever neighbour lies there, and making that safe needs a set of paint-order rules that a review showed to be intricate and still incomplete. The accepted residual is a one-pixel anti-aliased blend of O and U along U's edge where O exits U (about 25% U), the same kind of blend U's edge shows against the background elsewhere. The `occluded` class guarantees nothing between O and U meets the footprint, so the patch never punches through anything. Patches that share the same U are emitted in canonical-key order. Because the patch is right after U, everything above U still covers both; two crossings on the same Band never share paint.

### 6.3 Scene

One derivation feeds the React renderer and the exporter:

```ts
type Scene = {
  elements: Array<
    | { kind: 'region'; occurrence: RegionOccurrence }
    | { kind: 'band'; occurrence: BandOccurrence }
    | { kind: 'patch'; over: BandOccurrence; segment: [Point, Point]; clip: Point[] }
  >
  intersections: Intersection[]      // every listed world intersection: point, class, reason, effective over key, record source ('default' | 'definition' | 'override'), footprint
  unresolved: Array<{ record: Crossing; contextId: Id | null; occurrenceKey: string; worldHint: Point }>
}
```

## 7. Editor

### 7.1 State and history

One Zustand store with:

- `project` — the document, wrapped by zundo `temporal({ partialize: s => ({ project: s.project }), equality: (a, b) => a.project === b.project, limit: 100 })`. The equality is required: without it camera and selection writes push duplicate entries and clear redo.
- `preview: { next: Project; onInterrupt: 'commit' | 'cancel' } | null`. Pointer gestures and inspector typing write `next`, always recomputed from `project` with the cumulative gesture arguments (never frame-on-frame). The renderer uses `preview?.next ?? project`.
- `settlePreview()` runs before **any** command, undo, redo, import, or New Project, so `project` cannot change while a preview exists: inspector previews commit, gesture previews cancel. `commit()` replaces `project` with `next` and clears the preview (commands already run `rematchCrossings`; the store never rematches, so no preview frame ever pays for it). History therefore sees exactly one entry per gesture or field edit, and never a preview frame.
- Ephemeral: `tool`, `selection: Id[]`, `editContext: { motifId, path: Step[] }[]`, `camera`, `snapEnabled`, `addToSelection`, `crossingScope`, `currentMaterialId`, drawing state, save status.

After undo, redo, or import: drop selection ids that no longer exist, pop `editContext` to the deepest level whose motif and path still validate, cancel any drawing. Undo and redo trigger autosave like commits.

Commands are pure `(project, args) → project` in `domain/commands/`, tested without React. Every command's output must satisfy §2.1.

### 7.2 Camera and input ownership

- The root `<svg>`'s `viewBox` is derived from `camera` and kept at the wrapper's client aspect ratio via `ResizeObserver` (no letterboxing, so zoom-about-cursor is exact). Screen→world uses `getScreenCTM().inverse()`.
- The canvas wrapper `<div>` has `touch-action: none`; `html, body` have `overflow: hidden; overscroll-behavior: none`; the viewport meta disables user zoom. Moveable's `container` is the wrapper, so its handles inherit `touch-action`.

Input ownership (the proof in Slice 1 verifies each row):

| Input | Owner | Notes |
| --- | --- | --- |
| Plain wheel | use-gesture | pans |
| Ctrl/Cmd + wheel, trackpad pinch (`ctrlKey` wheel), Safari `gesture*` | use-gesture | zooms about cursor; `preventDefault` (`eventOptions: { passive: false }`) |
| Two-finger drag / pinch | use-gesture | pan/zoom; on the second pointer, any Moveable drag is stopped and cancelled and any Selecto marquee aborted |
| Middle button drag, `Space`+drag, Hand tool (`H`) drag | use-gesture | pan; Moveable `draggable={false}` while Space is held |
| Single pointer on a selection proxy or handle | react-moveable | drag/rotate; commits only when `isDrag` and the ending event is not `touchcancel`, else cancel |
| Single pointer on empty space in Select | react-selecto | marquee over proxies, `getElementRect` from domain bounds |
| Single pointer in drawing tools | tool code (Pointer Events) | Moveable and Selecto are unmounted |
| `pointercancel` | tool/use-gesture | cancel preview, restore state |

Never `preventDefault` on canvas `pointerdown`: it suppresses the compatibility mouse events Moveable and Selecto (Gesto) rely on. Zoom limits 0.05–50 px/mm. Fit: Board bounds + 5% margin. Top bar has −, +, Fit.

### 7.3 Selection proxies

The scene is flat occurrences, so Moveable and Selecto need one DOM target per selectable object. The renderer emits, for each top-level object in the current context, an invisible `<rect data-object-id>` at its painted bounds in world space. Proxies are the only Moveable targets and Selecto selectables. During a rotate gesture the proxy rect is frozen at gesture start and the angle is computed from pointer positions about the fixed centre, so the handle does not move under the finger as baked points change. Hit testing for click-select uses domain geometry (topmost occurrence under the point maps to its top-level object).

### 7.4 Tools and commands

Tool keys: `V` select, `H` hand, `B` band, `R` rectangle region, `P` polygon region, `X` crossing. The rail shows the same tools with ≥ 44 px targets plus toggles **Snap**, **Add to selection** (tap acts as Shift+tap), and **Show grid**.

- **Select**: tap selects the topmost object at the point; Shift or Add-to-selection toggles; marquee selects objects whose painted bounds intersect it. Moveable handles: drag (translate), rotate handle about the selection's painted-bounds centre (snaps to 15° with Shift or when snap is on within ±4°). No resize/scale handles. A single selected Band or Region also shows **vertex handles** (drag with snapping) and **midpoint handles** (drag to insert a vertex); dragging a vertex onto its neighbour within snap tolerance deletes it. Double-tap an instance or repeat cell enters its definition (§7.6).
- **Band / Polygon**: points are placed on `pointerup` when movement is under `TAP_SLOP_PX` and no second pointer arrived. A tool options bar shows the pending segment's **Length** and **Angle** as editable fields (Enter places the point from the typed values), the live snapped values otherwise. Angle snap applies to both tools. A point within snap tolerance of the previous point is merged. Own double-tap detection (`DOUBLE_TAP_MS`, ≤ 10 px) finishes and discards the second tap. **Finish**, **Undo point**, **Cancel** buttons appear in the options bar; keys: Enter finishes, Backspace removes the last point (Ctrl+Z too, while drawing), Esc cancels. Band needs ≥ 2 points; tapping the first point of a polygon closes it (≥ 3 points). A Band drawn back onto its first point becomes `closed`. New objects use the current material and last-used width (default 6.35 mm).
- **Rectangle**: drag corner to corner; 4-point Region.
- **Crossing**: draws markers for every listed intersection (filled = eligible, badge = overridden, hatched = unsupported, ring = unresolved). Tap an eligible marker to toggle per §5.4 using the scope control in the options bar; tap an unsupported marker to read its reason. Hit radius 12 px for mouse, 22 px for touch; nearest centre wins.

Selection commands (toolbar buttons and keys; all operate in the current context): Delete/Backspace; **Duplicate** (`Ctrl/Cmd+D`; the copy is offset by one grid step in +X and +Y so the action is visible; arrays are what Repeat is for); copy/paste (`Ctrl/Cmd+C/V`, in place, in-app clipboard including definition-internal records); **Mirror X / Y** about the painted-bounds centre; **Rotate 90° CW/CCW** and **Rotate by °** about the same centre; arrow nudge one grid step (Shift ×10; screen axes, mapped into the context); Bring forward / Send backward / To front / To back; **Offset copy** (Band only: a parallel copy on the chosen side at perpendicular distance `(w + w')/2` with miter-offset joints; width `w'` defaults to `w`); **Create Motif** (`Ctrl/Cmd+G`); **Repeat**; **Detach**.

**Create Motif**: pivot = centre of the selection's painted bounds. Children are re-based so the pivot is definition `(0,0)`; the new instance has `x, y` = pivot, replacing the selection at the topmost selected child's position in paint order. A pivot marker is drawn on selected instances. **Repeat**: on one instance, replaces it with a 2×2 RepeatField with the same motif and transform and steps equal to the definition's painted-bounds size in definition units (the cell offsets are applied inside the field's transform, so this tiles seamlessly at any scale); on any other selection, performs Create Motif then Repeat.

Keyboard dispatch is one listener that ignores events whose target is an input, textarea, select, or contenteditable (Esc excepted: it reverts the field and stops). Modifiers are matched exactly. Esc order: cancel gesture → cancel drawing → clear selection → pop edit context → Select tool.

### 7.5 Inspector (right panel)

- Board: name, width, height, background material, display units, grid spacing.
- Any selection: bounds X/Y (edits translate), Rotate by, Mirror X/Y, material (Bands/Regions), order buttons.
- Band: material, width, closed, per-point X/Y with per-segment length and angle (editing a segment moves its end point and translates the points after it), insert/delete vertex; **crossings list** (each listed intersection of this Band with an over/under toggle button — the keyboard path for crossings) and unresolved records with Remove.
- Region: material, width/height of bounds (edits scale the polygon about the bounds origin), per-point X/Y, insert/delete.
- Instance: motif name (editable), X, Y, rotation, mirror X/Y, scale, world width read-out, Edit Motif, Detach, overrides list.
- Repeat: all §2 fields with **½ step** buttons beside the offsets, transform fields, Edit Motif, overrides list.

Numeric fields are `<input type="text" inputMode="text" autocapitalize="off" autocorrect="off" spellcheck="false" enterKeyHint="done">`. Preview on each valid keystroke; commit on Enter or blur **only if the text differs from the formatted value at focus** (Tabbing through fields never rounds geometry or creates history); Esc reverts. Invalid text shows an inline error and no preview.

### 7.6 Edit context

Entering a definition (double-tap an instance/cell, or **Edit Motif**) pushes `{ motifId, path }` for the tapped occurrence. Breadcrumb `Board / Motif: Name` with **Done**. While entered:

- Only the definition's children are selectable and drawable. Tapping another occurrence of the same definition re-targets `path` to it.
- All pointer input (drawing, drag, rotate, vertex drag, nudge) is mapped through `inverse(occurrenceMatrix)`; in a mirrored occurrence a clockwise screen rotation becomes `−θ`; snap tolerance divides by zoom × occurrence scale; length/angle labels are in definition space to match the inspector.
- Rendering: the full scene draws normally; a 60% scrim in the background colour covers it; the entered occurrence's elements (with their patches) are drawn again above the scrim. Per-element opacity is never used (it would double-paint patches).
- Nested entry by double-tapping a nested instance. Esc with nothing in progress pops one level.

### 7.7 Snapping

Enabled by default; Alt held disables temporarily (Alt keyup is `preventDefault`ed); the rail toggle persists. Grid spacing is an editor setting (not in the document), set to 3.175 mm for inch projects and 5 mm for mm projects whenever a project is opened or its display units change (a user edit to the spacing lasts until then); the grid is drawn when **Show grid** is on. The grid is drawn and snapped in the current context's space (definition axes while editing a motif), like the length and angle labels.

- **Targets** (computed once at gesture start from `project`, excluding the moving selection; inside an edit context they include the other occurrences of the entered definition and its siblings, mapped into definition space): grid points; Board edges and centre lines; Band endpoints and vertices; Region vertices; listed intersection points; painted-bounds edges and centres of other objects.
- **Sources** while moving: the selection's vertices, endpoints, and bounds edges/centres. The nearest source–target pair within tolerance wins; point targets beat line targets beat grid. A guide overlay shows the active snap.
- While drawing: the angle constrains the ray to a 15° multiple when within ±4° (unless a point target is within tolerance); the length then snaps to grid along the ray or to line targets intersecting the ray.
- Moveable's own `snappable` is disabled.

### 7.8 Board view

The editor draws the whole scene unclipped, then a mat (a rect with an even-odd hole at the Board) at 70% opacity in the background colour, so outside-Board geometry is visible dimmed and remains hit-testable. Selection overlays draw above the mat. Selection outline is a double stroke (light over dark) so it reads on any material.

## 8. Units (`domain/units.ts`)

`parseLength(text, defaultUnit)`: grammar, case-insensitive, after trimming:

```
^([+-])?\s*(?:(\d+(?:[.,]\d*)?|[.,]\d+)|(?:(\d+)(?:\s+|-))?(\d+)\s*/\s*(\d+))\s*(in|"|”|″|mm)?$
```

i.e. either a decimal, or a fraction with an optional whole number that must be separated from it by whitespace or a hyphen (so `13/16` is thirteen sixteenths, never 1 3/16); `,` accepted as the decimal separator, the sign applying to the whole value, a non-zero denominator, and the unit suffix overriding `defaultUnit`. Integer arithmetic (numerator/denominator) then `× 25.4` for inches. Rejected: empty, `1 - 1/8`, exponents, feet, expressions, two units. No fraction library is used (rationale in the reconciliation document).

`formatLength(mm, unit)`: inches — if within 0.0005" of `k/64`, a reduced mixed fraction (`1 1/8`, `3/16`, `2`); otherwise three decimals. mm — up to two decimals, trailing zeros trimmed. Angles: one decimal, trailing zero trimmed. Units are shown beside the field.

Field policies: widths, board dimensions, grid spacing, scale > 0; steps and offsets any finite; coordinates any finite; rows/columns integers 1–50.

## 9. Persistence

- Autosave: 500 ms after a commit, undo, or redo, write the project JSON to `localStorage` key `cbpd:project:v1`; flush on `pagehide` and `visibilitychange: hidden`. On failure show **Not saved in this browser — download your project** with a Download button; retry on the next change; clear the status on success.
- Startup: if the key validates, open it. If it exists but fails, move its text to `cbpd:recovered` (so autosave cannot destroy it), start blank, and show a banner with **Download recovered file** and **Discard**.
- Another tab writing the key (`storage` event) shows **Project changed in another tab** and suspends autosave here until reload.
- **New Project** and **Open Project** confirm unless the current project is the blank starter (no objects). Autosaved work is never replaced silently.
- **Download Project**: pretty-printed JSON Blob, `<name>.cbpd.json`. **Open Project**: `<input type="file">`, `File.text()`, then `JSON.parse → migrate → zod safeParse → §2.1 invariants`. Any failure leaves project and history untouched and shows the first error with its path. Success replaces the project and clears history.
- `migrate(json)`: version 1 passes; any other version is an error naming it.
- One active project. No IndexedDB.

## 10. SVG export

`exportSvg(project): string` serialises `buildScene(project, EXPORT_CLIP_EXTEND_MM)`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="{W}mm" height="{H}mm" viewBox="0 0 {W} {H}">
  <title>{escaped name}</title>
  <defs><clipPath id="{p}-board"><rect width="{W}" height="{H}"/></clipPath> …patch clipPaths…</defs>
  <g clip-path="url(#{p}-board)"><rect width="{W}" height="{H}" fill="{background or none}"/>…scene elements…</g>
</svg>
```

`{p}` is unique per export. All text and attribute values are XML-escaped; colours and ids are already constrained by validation. No classes, CSS, fonts, editor overlays, or external references. Numbers use up to 4 decimals. PNG export is not in V1.

## 11. Accessibility

Native `button`/`input`/`select` or Radix primitives (Dialog, Tooltip, Popover). Every control has a visible label or `aria-label`. Inspector fields have `<label>`s. `[` / `]` cycle selection through the current context's objects (with the canvas focused), so the inspector and the crossing list are reachable without a pointer; Tab keeps its native focus movement so the canvas is never a focus trap. Selection is indicated by outline and inspector heading, not colour alone. Material names are visible. Every drag has a numeric equivalent (bounds X/Y, Rotate by, per-point fields, crossing list). Layout is rem/flex; the canvas fills the remainder and stays correct at 200% browser zoom.

## 12. Fixtures (`src/fixtures/`, original designs; JSON plus UI authoring tests)

- A `stripes` — 4 materials, 7 flush parallel Bands of different widths.
- B `checker` — one 2-Region motif, 6×6 with row offset.
- C `basket-weave` — 2 horizontal + 2 vertical Bands with alternating definition crossings, 3×3 with alternate 90° rotation, seamless by default step.
- D `chevron-diamond` — ±45° parallel Bands via Offset copy and Mirror, a closed diamond Band outline, nested diamond Regions.
- E `isometric` — three-rhombus cube (30°/60°) with three materials, built with angle snap and typed lengths, 4×4 with ½-step row offset.
- F `interlace` — 6 materials; a lattice motif (4 angular polylines) containing an instance of a 2-Band accent motif; 5×5 with alternate mirror X; ≥ 40 eligible crossings per field, alternating definition crossings, two root overrides; all crossings inside the cell. The performance variant repeats it so that ≥ 1000 occurrences exist.

## 13. Acceptance gates

All automated unless marked manual; all must pass before V1 is reported complete.

| # | Gate | Test |
| --- | --- | --- |
| G1 | Crossing identity | Vitest: two polylines crossing twice with opposite records; move an endpoint, change width, insert a vertex on each half of the crossed segment, delete the referenced start point, move an instance transform then make an unrelated edit, undo, redo, save/reopen. Each record resolves to its intended intersection or is unresolved exactly when it no longer exists. Includes the hairpin counterexample: a lost record must not rebind onto an intersection already owned by another record. |
| G2 | Occurrence scope | Vitest: 3×3 repeat with a definition record and a root override in cell (1,2); only that cell differs; JSON round-trip preserves both; rows shrink removes the override; Detach with an override keeps the override; "All instances" toggled in an overridden cell removes the override; a nested-instance record in an intermediate context resolves. |
| G3 | Transform parity | Vitest: rotate 30°, mirror X, scale 1.5 → width, intersection point, bounds, inspector values agree with hand-computed; world mirror of a rotated instance; 2×2 with alternate 90° lands on expected cell centres. Playwright: the Slice-1 assertions (§15). |
| G4 | Edge classes | Vitest: acute 15° unequal widths (eligible; footprint corners checked); shared endpoint; collinear; 5°; self-crossing polyline; triple point; two crossings 1 mm apart; a crossing 1 mm from a joint; a Region between O and U; lattice footprints touching exactly, checked in definition space and in world space after a 30° rotation. Each classified as specified. |
| G5 | Export correctness and parity | Playwright in Chromium, Firefox, WebKit: export Fixture F; load standalone; for every eligible intersection sample the raster at the intersection point and at footprint-interior offsets (must equal the effective over colour) and along a 1-px band at each footprint edge (no third colour); max per-pixel difference between editor Board region and export, excluding an anti-aliased-edge mask, ≤ 8/255. Assert no `class`, `style`, or external `url(`. |
| G6 | Authorability | Playwright: build A–F from a blank project using only UI actions; then edit a source motif and one dimension; scene matches the fixture within tolerance. The log records action counts, elapsed time, and any step needing a workaround. |
| G7 | Tablet | Playwright Chromium with CDP touch: tap-create Band with Finish, tap-select, drag, two-finger pan and pinch (`scrollY === 0`, `visualViewport.scale === 1` afterwards), `touchcancel` mid-drag leaves project and history unchanged. Manual iPad Safari checklist (recorded in the report): wheel/trackpad behaviour, handle touch, drawing double-tap, multi-select toggle, fraction entry keyboard. |
| G8 | Persistence | Vitest: malformed JSON, version 2, cyclic motifs, nested repeats exceeding 5000 occurrences while each field is within bounds, duplicate ids, dangling refs → each rejected with a path; valid round-trip deep-equal; `validate(command(p))` property test over fixtures and all commands. Playwright: quota failure (`setItem` override) shows the status and Download works, and the status clears after a successful retry; corrupt key → banner and the recovered key byte-identical after an edit; failed Open leaves project and both history stacks unchanged; New/Open confirmations; autosave flushed on `pagehide`. |
| G9 | Performance | Playwright, Fixture F performance variant (≥ 1000 occurrences): 60-frame drag median and p95 frame time, inspector edit latency, patch count. Target median ≤ 16 ms, p95 ≤ 50 ms. Numbers are reported; a miss is a finding. |

Product success test (packet): performed manually at the end and reported with timings.

## 14. Module layout

```
src/
  domain/      model.ts  ids.ts  units.ts  validate.ts  migrate.ts  crossings.ts  commands/*.ts
  geometry/    affine.ts  tolerance.ts  expand.ts  intersections.ts  footprint.ts  scene.ts  bounds.ts  offset.ts  snap.ts
  editor/      store.ts  camera.ts  keyboard.ts  input.ts  tools/*.ts
  render/      Canvas.tsx  SceneSvg.tsx  Proxies.tsx  overlays/*.tsx
  export/      svg.ts  download.ts
  storage/     local.ts
  ui/          App.tsx  Toolbar.tsx  Inspector/*.tsx  MaterialPalette.tsx  Breadcrumb.tsx  StatusBar.tsx
  fixtures/    *.json  index.ts
```

`domain/` and `geometry/` import nothing from React or the DOM; `geometry/` may import `@flatten-js/core`, `domain/` may not. Tests sit beside sources as `*.test.ts`; Playwright tests in `e2e/`.

## 15. Slice-1 interaction proof (assertions, from the editor review)

(a) Drag N screen px at zoom 0.5, 1, and 7.3 px/mm with a panned camera commits Δ = N/zoom mm within 1e-6, computed through `getScreenCTM`. (b) The Moveable box client rect equals the domain bounds projected through the CTM ±1 px after commit, undo, redo, zoom, and resize. (c) No SVG element or proxy carries a `transform` attribute or `style.transform`. (d) 20 drag+undo cycles return a deep-equal project. (e) History +1 per gesture, +0 for click-without-move. (f) `touchcancel` and a second finger mid-drag leave project and history unchanged. (g) Marquee over a rotated instance selects by domain bounds. (h) Drag inside a rotated, mirrored, 1.5× edit context moves the definition child by the inverse-mapped delta. (i) Mouse drag works while use-gesture is bound. (j) Selecto marquee can be aborted programmatically when a second pointer arrives (if not, record it and arbitrate by unmounting Selecto during multi-touch).

## 16. Review resolution log

| Source | Objection | Resolution |
| --- | --- | --- |
| Slop | 400-cell repeat limit duplicates the 5000 cap; G8 tested the wrong limit | Removed; G8 tests nested over-budget import |
| Slop | Intermediate-context records are created by the UI, not merely tolerated | §5.3 says so |
| Geometry 1 | Rebind could steal another record's intersection | §5.5 step 2 (a)(b), canonical processing order |
| Geometry 2 | Commands could produce invalid documents (rows shrink, detach collisions, vertex delete) | §5.5 last paragraph, §5.6 Detach rules, G8 property test |
| Geometry 3 | Crossings near joints mis-render; full-path patch | `near-joint` class; patch is the segment only |
| Geometry 4 | Elements between O and U are punched through | `occluded` class |
| Geometry 5 | Anti-aliasing seams; extension in mm is wrong in kind | Enlarge across both edges; device-px in editor, 0.2 mm in export |
| Geometry 6 | `crowded` ill-defined; classes overlap | Precedence order, proxy footprints, `EPS_OVERLAP_MM` |
| Geometry 7 | Definition-space verdict ≠ world verdict | Per-world-intersection eligibility; per-occurrence unresolved hints |
| Geometry 8 | Rematch triggers too narrow; stale hints | Rematch on every geometry-affecting command, from before→after; only previously resolved records auto-rebind |
| Geometry 9 | Canonical order not recomputed on path rewrites | `canonicalize` on every write |
| Geometry 10 | "All instances" could be a no-op under an outer record | Removes the pair's records from all outer contexts |
| Geometry 11, Product 1 | Pivot undefined | Painted-bounds centre at Create Motif |
| Geometry 12, Product 11 | Cross-cell crossings unscopable | Documented V1 limit; scope control hidden; F stays in-cell |
| Geometry 13, Product 9 | No closed Bands | `Band.closed` |
| Geometry 14 | Raster mean test not decisive; not independent | Pixel sampling gate + max-diff with AA mask, three engines |
| Geometry 15 | Export injection | XML escaping; colour and id regexes |
| Geometry 16–23 | Matrix conventions, min segment, bounds kinds, patch attributes, seams, invariants, gate coverage, patch count | Adopted as written |
| Editor 1 | zundo without `equality` pollutes history | §7.1 |
| Editor 2, 6 | Whole-project preview overwrites commits; frame-on-frame drift | `settlePreview`, base assertion, recompute from base |
| Editor 3 | Autosave destroys the corrupt key | Moved to `cbpd:recovered` |
| Editor 4 | No DOM target for instances/repeats | Proxy rects (§7.3) |
| Editor 5, 8, 9, 10, 11 | Gesto touch semantics, library fights, touch-action, rotate re-fit, weak G3 | Ownership table, container, frozen proxy, §15 assertions |
| Editor 7 | Wheel = zoom breaks trackpads | Wheel pans; Ctrl+wheel zooms |
| Editor 12, 13, 14 | Edit context mapping, opacity vs patches, stale context | §7.6 |
| Editor 15, Product 6 | Snapping sources/frozen candidates/cross-cell targets | §7.7 |
| Editor 16, Product 3 | Drawing flow on touch; exact lengths/angles | `pointerup` placement, own double-tap, Length/Angle fields, Undo point |
| Editor 17, Product 18 | No tablet multi-select | Add-to-selection toggle |
| Editor 18, 19, 20, 27 | inputMode, blur rounding, key scoping, fraction.js grammar gaps | §7.5 fields, §7.4 dispatch, own grammar |
| Editor 21, 22, 26 | Open confirmation, multi-tab, G8 gaps | §9, G8 |
| Slop rev 2 F1 | Classification depended on zoom via the clip enlargement | `CLASSIFY_EXTEND_MM` fixed margin; clip enlargement clamped to it |
| Slop rev 2 F2 | Duplicate-with-last-offset duplicates Repeat | Removed |
| Slop rev 2 F3 | Download hash for dirty tracking exceeds the objection | Confirm unless blank |
| Slop rev 2 F4 | `preview.base` duplicated `project` | Removed |
| Task 4 implementation | Enlarged-footprint `crowded`/`occluded` made flush-packed weaves unsupported in some paint orders; a per-side enlargement rule was reviewed and found to need four more sub-rules | Classification uses plain footprints only; the clip is enlarged across O's edges only; the U-edge blend is the accepted residual; painted geometry includes miter triangles; `CLASSIFY_EXTEND_MM` renamed `MAX_CLIP_EXTEND_MM` (§4.5, §5.2, §6.1, §6.2) |
| Editor 23, 24, 25 | Touch marker reason/size, keyboard paths, touch emulation limits | §7.4, §11, G7 |
| Editor 28, 29 | Grid details, hand tool, aspect | §7.7, §7.2 |
| Product 2 | Repeat command unspecified; default step leaves gaps | §7.4 Repeat; painted bounds |
| Product 4, 8, 21 | No numeric rotate/position; polyline segment angles | Rotate by, bounds X/Y, Region W/H, per-segment length/angle |
| Product 5 | Duplicate offset by grid step | In place; repeat last move delta |
| Product 7 | No flush parallel strips at angles | Offset copy |
| Product 10 | Override could shadow silently | Delete on return to outer value; badge; list |
| Product 12 | Vertex editing vague | Vertex and midpoint handles |
| Product 13 | Orphan definitions, no rename | Auto-delete with last reference; name in inspector |
| Product 14, 16, 17, 20, 22 | G6 scope, F counts, grid/zoom/outside view, seam markers, ½ step | Adopted |
| Product 15 | Current material undefined | §3 |
| Editor 30 | Show `≈` for inexact fractions | Declined: adds a display state for no workflow gain |
| Fix wave | §4.5 padded conservative bounds by 2.5w but a miter tip reaches 5w | Pad is 5w (§4.5); painted-geometry prefilter boxes include joint triangles |
| Final review C1 | The §8 regex let `13/16` backtrack into `1` + `3/16` | Fraction branch requires a separator between whole and fraction (§8) |
| Final review I4 | Rematch ran in commands and again in `commit()` | Commands are the only rematch owner (§7.1) |
| Final review I2, walkthrough | Grid default never followed inch units | Grid spacing set from display units on open and on unit change (§7.7) |
| Walkthrough | Duplicate in place gave no visible result | Copy offset by one grid step (§7.4) |
| Product 4 (part) | Draggable pivot point | Declined: vertex-snapped move and typed lengths cover alignment |
| Product 8 (part) | Separate "Move by" field | Declined: bounds X/Y covers it |
