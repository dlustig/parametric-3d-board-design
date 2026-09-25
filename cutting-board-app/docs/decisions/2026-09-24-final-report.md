# Cutting Board Pattern Designer — V1 report

Status: final. Branch `feat/v1`, local only (no remote yet).

## What was built

A client-only React 19 + TypeScript + Vite 8 single-page editor. The document is versioned semantic JSON (`schemaVersion: 1`); SVG is derived. Users draw Bands (constant-width polylines, open or closed) and Regions (polygons), assign Materials, group geometry into Motifs, place and repeat them (rows × columns, steps, brick/half-drop offsets, alternate mirror and rotation), edit a motif definition in place, and toggle which Band is on top at any eligible Band/Band crossing, either for every occurrence of the motif or for one occurrence only. The project autosaves to `localStorage`, can be downloaded and reopened as JSON, and exports a standalone SVG at true millimetre size.

Source layout follows the spec: `src/domain` (model, validation, commands), `src/geometry` (affine, expansion, intersections, footprints, scene), `src/editor` (store, tools, keyboard, snapping), `src/render` (canvas and overlays), `src/ui` (toolbar, inspector, palette, menus), `src/export`, `src/storage`, `src/fixtures`. Domain and geometry import nothing from React or the DOM.

Dependencies actually used: react, react-dom, zustand, zundo, zod, @flatten-js/core, @use-gesture/react, react-moveable, react-selecto, three Radix primitives (dialog, popover, tooltip); dev: vite, typescript, vitest, @playwright/test. `fraction.js` was dropped after a reviewer showed it rejects `1-1/8` and accepts expression-like input; a twenty-line grammar replaced it.

## Gates (see `2026-09-24-gates.md` for evidence)

| Gate | Result |
| --- | --- |
| §15 Moveable/Selecto/use-gesture interaction proof | PASS in Chromium, Firefox, WebKit, Chromium-touch |
| G1 crossing identity, G2 occurrence scope | PASS (unit) |
| G3 transform parity | PASS (unit + proof) |
| G4 edge classes | PASS (unit) |
| G5 export correctness and parity | PASS in three engines; max pixel difference 1/255 against an 8/255 bound |
| G6 authorability (A–F from a blank project, UI only) | PASS with friction logged; 21–127 actions per family |
| G7 tablet | automated PASS (Chromium touch); manual iPad Safari checklist pending (`2026-09-24-ipad-checklist.md`) |
| G8 persistence | PASS (unit + browser, three engines) |
| G9 performance | FINDING: on a 3,151-occurrence fixture (about 9,100 rendered elements, nine times the packet's ~1,000-element target) a drag of one band runs at a 27 ms median / 36 ms p95 frame; moving every occurrence at once runs at 158 / 200 ms. The 16 ms median target is missed; the 50 ms p95 target is met in the typical case. At the packet's stated scale (8×8, 897 occurrences) the drag runs at 20 ms median / 25 ms p95. |
| §11 accessibility | PASS (names on every control, keyboard-only flow, 200% zoom via viewport halving) |
| Product success test | PASS 9/9 steps by scripted walkthrough (`.superpowers` walkthrough report); manual pass by the owner still recommended |

Full verification after the final fix wave: typecheck clean, 383 unit tests, production build, 338 Playwright tests passed across four projects (Chromium 100, Firefox 94, WebKit 94, Chromium-touch 50) with 0 failures, perf suite 9 passed.

## Intentionally unsupported crossing classes

Only isolated transverse interior centreline intersections between two distinct segments are toggleable. Every listed intersection is classified into exactly one class and drawn with a distinct marker whose reason is shown on tap:

| Class | Meaning |
| --- | --- |
| `collinear` | segments overlap along a length |
| `endpoint` | a segment ends on the other (T-junction or crossing exactly at a polyline joint) |
| `near-parallel` | crossing angle under 10° |
| `near-joint` | a joint of either band lies within reach of the patch, so the segment-only patch would not match the mitered stroke |
| `occluded` | something painted between the two bands enters the crossing footprint |
| `crowded` | another crossing's footprint overlaps this one (triple points, adjacent crossings) |

End-to-end contacts of collinear bands (repeat seams) are ignored entirely. Unsupported crossings render by paint order; nothing silently produces a wrong design.

## Known limitations

- Crossings between two cells of one repeat, between two instances, or between a root band and a motif interior can only be overridden per occurrence (root records); the scope control hides for them. Fixture F keeps all its crossings inside the cell.
- The accepted compositing residual is a one-pixel anti-aliased blend on the under band's edge where the over band exits it (measured 21–32% under-band colour, a pure blend of the two colours). The clip is enlarged across the over band's edges only.
- Self-intersecting Regions are allowed but the `occluded` test can mis-measure their overlap (Flatten booleans); rare, documented rather than fixed.
- Two minors parked at the end of the final review, both with fixes identified: the Selection panel rotates and mirrors about the context-space bounds centre while the rotate handle uses the world bounds centre mapped into the context (they differ only for asymmetric selections inside a rotated motif; one-line fix in `onRotateStart`), and when a corrupt saved document cannot be moved to the recovery key the banner's Discard does not clear it (no data loss; autosave stays off).
- The final review found and the fix wave corrected three defects that the task reviews had missed: multi-digit fraction numerators (`13/16`) parsed as a mixed number; typed-closed polygons could produce an invalid document; the Selection panel used world coordinates inside an entered motif. A dev/test-only validation assertion in the store now guards the second class.
- Re-targeting the entered motif by tapping another occurrence only finds occurrences in the enclosing context; sibling painted-bounds snap targets are coarse when entered two or more motif levels deep.
- Performance: see G9. The remaining per-frame cost is O(occurrences) re-resolution and element diffing; three next steps are recorded in the gates doc (per-intersection resolution memo, patch memo, repeat-cell subtree reuse). Canvas rendering was not evaluated, per the packet's order.
- PNG export is not in V1. One active project; no project gallery.

## Departures from the research packet (all recorded in `2026-09-24-reconciliation.md` and spec §16)

1. Bands and Regions carry no transform; points are baked in parent space. Numeric rotate and bounds X/Y fields provide the equivalents.
2. `fraction.js` dropped for an owned grammar (evidence above).
3. Compositing re-paints the over band's crossed segment clipped to the footprint instead of masking the under band; classification uses plain footprints only, and the clip is enlarged across the over band only after a per-side enlargement rule was reviewed and found to need four more sub-rules.
4. Single `localStorage` project, no IndexedDB.
5. `Band.closed` added for borders and outlines.
6. Default repeat step is the definition's painted size in definition units (the cell offsets are inside the field transform).
7. Duplicate offsets by one grid step so the action is visible; Tab keeps native focus movement and `[`/`]` cycle selection.

## What the owner should do next

1. Run the iPad Safari checklist (`2026-09-24-ipad-checklist.md`) and fill in the results; G7's manual half is the only gate not executed by a machine.
2. Do a hands-on pass of the product success test; the scripted walkthrough measured automation time, not human time.
3. Decide whether the G9 median miss at nine times the packet's scale matters for the boards you actually design; at the packet's scale the numbers are recorded separately.
4. Consider the three performance next steps only after profiling a real design.

## Process record

Ninety-nine commits before the fix wave and about thirty in it; every task had an implementer, a task-scoped reviewer, and a scoped re-review; the spec went through one slop audit, three adversarial reviews, a second slop audit, and was amended during implementation when reviewers or gates proved it wrong (rev 4 plus later one-line corrections). Rulings taken on the owner's behalf are listed in the session's closing message and in the SDD ledger.
