# Cutting Board Pattern Designer — V1 report

Status: final. Built on branch `feat/v1` and merged to `main` (merge commit 2698014); local only (no remote).

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
| G9 performance | FINDING: on a 3,151-occurrence fixture (about 9,100 rendered elements, nine times the packet's ~1,000-element target) a drag of one band runs at a 28 ms median / 39 ms p95 frame; moving every occurrence at once runs at 200 / 249 ms. The 16 ms median target is missed; the 50 ms p95 target is met in the typical case. At the packet's stated scale (8×8, 897 occurrences) the drag runs at 17 ms median / 25 ms p95. |
| §11 accessibility | PASS (names on every control, keyboard-only flow, 200% zoom via a 640×480 reduced-viewport substitution) |
| Product success test | PASS 9/9 steps by scripted walkthrough (its report was kept in the session's `.superpowers/` workspace, since deleted, and is not in the repository); manual pass by the owner still recommended |

Full verification after the final fix wave (at 2698014; details in the gates doc's final verification run): typecheck clean, 383 unit tests, production build, 338 Playwright tests passed across four projects (Chromium 100, Firefox 94, WebKit 94, Chromium-touch 50) with 0 failures, perf suite 9 passed.

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

## Departures from the research packet (1–5 recorded in `2026-09-24-reconciliation.md`; 6 and 7 in spec §7.4 and §11, the Duplicate offset also in §16)

1. Bands and Regions carry no transform; points are baked in parent space. Numeric rotate and bounds X/Y fields provide the equivalents.
2. `fraction.js` dropped for an owned grammar (evidence above).
3. Compositing re-paints the over band's crossed segment clipped to the footprint instead of masking the under band; classification uses plain footprints only, and the clip is enlarged across the over band only after a per-side enlargement rule was reviewed and found to need four more sub-rules.
4. Single `localStorage` project, no IndexedDB.
5. `Band.closed` added for borders and outlines.
6. Default repeat step is the definition's painted size in definition units (the cell offsets are inside the field transform).
7. Duplicate offsets by one grid step so the action is visible; Tab keeps native focus movement and `[`/`]` cycle selection.

## Editor shell redesign (2026-09-25)

Spec: `docs/superpowers/specs/2026-09-25-editor-shell-redesign-design.md`; plan: `docs/superpowers/plans/2026-09-25-editor-shell-redesign.md`. Presentation only: the document model, commands, geometry, input ownership and persistence are unchanged; the V1 amendments are logged in V1 §16.

- **Built:** a dark-first theme with a light option and a pre-paint theme script; resizable, collapsible panes (`react-resizable-panels`); an icon column with dockable tools; the Layers, Motifs and Wood panes; floating drawing, actions and canvas-control bars; the edit pill, frame and top-bar breadcrumb; tooltips with styled hotkeys and a shortcuts sheet; an inspector in sections and tables; a New Project dialog with the six fixtures as samples, now shipped in production.
- **Verification:** full results in `2026-09-24-gates.md` ("Editor shell redesign verification run", 2026-09-26, `bd2991f`). In one line each: typecheck clean; 457 unit tests passed; production build OK with the fixtures bundled and the test hook excluded; e2e 449 passed across chromium (175), firefox (169) and chromium-touch (105) with 0 failures and no page errors, webkit could not launch (missing OS packages on this host, an owner action item, not a code failure); perf medians (different machine from the earlier runs — see the gates entry for that caveat) all within the recorded ±20% band: typical work median 29.1 ms (target ≤ 33.5), typical inspector-to-paint 29.3 ms (≤ 35.6), worst-case work median 192.1 ms (≤ 239.8); Layers-row-click-to-paint recorded as a new baseline (22.9 ms typical, 17.0 ms packet scale).
- **Keyboard-only walkthrough** (the plan's Task 10 Step 13.7, Chromium 1440×900, no pointer after load):
  1. PASS — first Tab reaches the sidebar toggle, with a 2 px solid `--acc` ring at a 2 px outline offset.
  2. PARTIAL as run, since fixed — Tab to the project name, Enter opens the menu on New project…; Arrow-down to Keyboard shortcuts, Enter opens the sheet — both pass. Esc closed the sheet with focus on `<body>`: the element Radix's Dialog saves at open is the menu item, which is gone by close. **Fixed** in the final-review fix wave: the sheet's `onCloseAutoFocus` returns focus to the project menu's trigger when the saved element is no longer in the document, pinned by `tooltips.spec.ts` ("closing the sheet opened from the project menu returns focus to the project name").
  3. PASS — `?` opens the sheet from the body; Esc closes it.
  4. PASS — Project menu → New project…, Tab to the Checker card, Enter selects it (`aria-pressed` true), Tab to Create, Enter: Checker loads.
  5. PASS — `Mod+\` and `Mod+Shift+\` collapse and restore the sidebar and inspector; focusing a pane separator and pressing ArrowLeft/ArrowRight resizes it (confirmed via `aria-valuenow`), and Enter collapses it.
  6. PASS — Tab to the icon column's Motifs tab, Enter shows the pane; its Edit motif enters the checker motif (`editContext` set, pill reads "Editing Checker unit"); the pill's Done (focus, Enter) pops it back out.
  7. PASS — `]` selects the first object and the Layers pane (once on that tab) shows it `aria-selected`; Tab into the inspector, edit Width, Enter: exactly one history entry.
  8. PASS — a Points row's actions button, Enter, then Enter on Insert after (already the first, default-focused item — no ArrowDown was actually needed on this build) adds a point; Enter on the Points `<summary>` collapses it (native `<details>` behaviour).
  9. FAIL as run (corrected after the final review) — Tab to the actions bar's Order button, Enter, ArrowDown ×2, Enter on Bring to front does bring the object to the front, but the walkthrough missed that each ArrowDown also reached the global keyboard dispatcher and nudged the selection one grid step (two extra history entries); menu typeahead letters likewise switched the tool, and Delete/letters went through the modal dialogs. **Fixed** in the final-review fix wave: `keyboard.ts` ignores keys (Escape excepted) aimed inside a menu, listbox or dialog, pinned by `actions-bar.spec.ts` ("arrow keys move through the Order menu without nudging the selection", "a letter typed in an open menu does not switch the tool"), `new-project.spec.ts` ("editor shortcuts do nothing behind the open dialog") and `shortcuts.test.ts`.
  10. PASS — `X` selects the Crossing tool; the Crossings/Band panel's Over/Under button is reachable and toggles the crossing on Enter, keeping focus (confirmed by reading `document.activeElement` after the toggle).
  11. PASS — `Shift+T` undocks the tools into a Tab-reachable floating bar (`tabIndex` 0); `Shift+T` docks them again.
  12. PASS — Esc cascade confirmed as four separate, ordered effects: cancels an in-progress Band drawing (leaves the tool, clears `drawing`); with an empty drawing, clears the selection; with an empty selection, pops the edit context one level; with an empty context, returns the tool to Select.
- **200% zoom:** automated — the new `a11y.spec.ts` shell test passed on chromium and firefox (720×450 CSS px, no horizontal scroll, Export SVG stays in viewport, the canvas keeps > 300 px width, a click still resolves through the zoomed CTM). Manual, per-browser (Chrome/Firefox/Safari at 1440×900, actual browser zoom to 200%): **not run** — this session has no access to real browser zoom (CSS `zoom`/viewport-resize substitutes are not the same mechanism, and Safari does not run on this Linux host); recorded here as an open item for the owner, the same as the Mod+R and iPad rows below.
- **Contrast (shell spec §2.1):** re-checked with the pairs read live from `src/index.css` (not hardcoded), including the tooltip-surface pairs (`.hint`/`.crossing-hover` always render with the dark token set, per that file's own comment, so a tooltip's label/hint/"On" state pairs are theme-invariant). **Every text pair is ≥ 4.5:1 and every UI pair is ≥ 3:1 in both themes** — the light-theme `--muted`, `--attn` and `--ok` values and the `--tip-hint` token that a prior review had flagged as failing are already at the values that review proposed (`#5f6773`, `#945800`, `#1e8049`, `#a9b0ba`), so there is no outstanding contrast decision for the owner. `--line-strong` on `--panel` is the one pair below 3:1 (1.94 dark, 1.68 light) and stays exempt as decorative (separators, keycap edges, WCAG 1.4.11). **Missed pair, added after the final review:** the keyboard-highlighted menu item was `--raised` on `--panel` only (1.15:1 dark, 1.12:1 light) — a focus indicator below 3:1. It is now `--acc-soft` with a 2 px `--acc` inset outline: `--acc` on `--panel` 5.50:1 dark / 4.70:1 light, `--acc` on `--acc-soft`-over-`--panel` 4.30:1 dark / 4.06:1 light (pinned by `a11y.spec.ts`, "the keyboard-highlighted menu item has a 2 px --acc outline, in both themes").
- **Mod+R (shell spec §12.2), checked by hand:**

  | Engine | Version | Repeat applied | Page reloaded |
  | --- | --- | --- | --- |
  | Chrome | | | |
  | Firefox | | | |
  | Safari (macOS) | | | |

  Not yet run (no row filled in); an agent cannot verify this (synthesised keys can't prove a real reload didn't happen) — the owner runs it per the exact steps in `2026-09-24-gates.md`/the plan.
- **G6:** action counts rose across all six families (A 37→38, B 21→22, C 37→38, D 63→65, E 46→48, F 127→130). `setBackground` becoming a two-action menu (open, pick) accounts for one action each in D, E and F, which only they use; the uniform +1 in A/B/C and the remaining +1 (F: +2) in D/E/F reflect other UI changes accumulated across Tasks 0–9 (e.g. Rename moving from an inline Board-panel field to a top-bar action) that this task did not audit action-by-action. All six specs still pass.
- **Firefox export-parity (shell spec §16 "Other checks"):** a Firefox-only `export-parity.spec.ts` failure was reported earlier in this branch. Re-run on this head (`bd2991f`): all four `export-parity.spec.ts` tests passed on firefox (part of the 169 firefox e2e passes above). It did not reproduce, so the pre-branch bisection (`5e33be0`) described in the task brief was not needed; recorded here rather than silently dropped in case it recurs.
- **Known parked item:** a Firefox-only dev-mode React warning, `Cannot update a component (\`TopBar\`) while rendering a different component`, appears during the e2e run (seen in `e2e/a11y.spec.ts`/`e2e/persistence.spec.ts` on firefox). This is the shell-redesign equivalent of a warning V1 already had for `StatusBar` (`2026-09-24-gates.md`:142) — parked, not fixed, per that precedent.

## What the owner should do next

1. Run the iPad Safari checklist (`2026-09-24-ipad-checklist.md`) and fill in the results; G7's manual half is the only gate not executed by a machine.
2. Do a hands-on pass of the product success test; the scripted walkthrough measured automation time, not human time.
3. Decide whether the G9 median miss at nine times the packet's scale matters for the boards you actually design; at the packet's scale the numbers are recorded separately.
4. Consider the three performance next steps only after profiling a real design.
5. Run the Mod+R check in Chrome, Firefox and Safari, the new iPad rows 8–13, and the manual 200% browser-zoom pass in Chrome, Firefox and Safari — none of the three can be done from this (Linux, no real browser zoom) session.

## Process record

One hundred commits on `feat/v1` before the fix wave and thirty-three in it; every task had an implementer, a task-scoped reviewer, and a scoped re-review; the spec went through one slop audit, three adversarial reviews, a second slop audit, and was amended during implementation when reviewers or gates proved it wrong (rev 4 plus later one-line corrections). Rulings taken on the owner's behalf were listed in the session's closing message and in the SDD ledger in the since-deleted `.superpowers/` workspace; neither is in the repository, and git history records the resulting spec and code changes.
