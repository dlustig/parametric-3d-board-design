# Slice-1 interaction proof — library findings and arbitration

Date: 2026-09-24. Scope: SPEC §7.2–§7.3 and the §15 proof (a)–(j), Task 8.
Versions: react-moveable 0.56.0, react-selecto 1.26.3 (selecto 1.26.3, gesto 1.19.4), @use-gesture/react 10.3.1, @playwright/test 1.63.0.

## Verdict

All of (a)–(j) pass in `chromium` and `chromium-touch`; the mouse assertions also pass in `firefox`. No assertion needed replacement interaction machinery. WebKit could not be launched on this host (see the last section); that is an environment gap, not a library result.

## Findings

1. **Selecto has no immediate abort API (§15 j).** The public methods (`clickTarget`, `setSelectedTargets`, `triggerDragStart`, `selectTargetsByPoints`, …) include no stop/abort. The only stops are `e.stop()` inside the `dragStart` handler, `dragCondition` (both at start only), and `e.stop()` inside the `drag` handler, which makes Selecto hide its box and stop its Gesto — but only on the next move event, not when the second finger lands. The Gesto instance is private. **Arbitration (as SPEC §15 j allows):** Selecto is unmounted while two or more touches are down (`touchstart` with `touches.length ≥ 2`), and remounted when all fingers lift. Unmount calls `destroy()`, which unbinds Gesto; selection is applied only on `selectEnd`, so an aborted marquee changes nothing. The proof checks that the marquee element disappears, the selection is unchanged, and a new marquee works afterwards.
2. **Selecto `getElementRect` is re-fitted to the element's DOM rect.** With a custom `getElementRect`, `getElementPoints` passes the four points through `fitPoints(points, target.getBoundingClientRect())`, so only the shape of the returned quad matters. Proxies are axis-aligned `<rect>`s at the domain painted bounds, so the DOM rect equals the domain bounds projected through the CTM and marquee hit-testing is by domain bounds (§15 g passes over the empty corner of the rotated instance's bounds).
3. **Moveable does not observe SVG attribute changes.** Proxies move by re-rendering their `x/y/width/height`; the canvas calls `moveable.updateRect()` in a layout effect after every render. With that, the box matches the projected domain bounds within 1 px after commit, undo, redo, zoom and resize (§15 b).
4. **Moveable's box lines swallow presses on thin objects.** At zoom 0.5 a 6 mm band is 3 px tall and the press landed on `.moveable-line.moveable-direction` (edge-resize lines, pointer events on by default), so no drag started. With resize disabled the lines have no job: `.moveable-control-box .moveable-line { pointer-events: none }` in `src/index.css`. The rotation control stays interactive.
5. **Overlapping proxies.** A press on a selected object inside an unselected object's proxy would reach the unselected proxy and start a marquee. Selected proxies are emitted last so they win the hit; this is a DOM-order choice, not extra event code.
6. **Cancel paths.** CDP `touchCancel` produces both `pointercancel` (the wrapper listener aborts: `stopDrag()` + `cancelPreview()`) and Gesto's `touchcancel` `dragEnd` (the handler cancels when `inputEvent.type === 'touchcancel'`). Mutation checks confirmed each guard alone keeps §15 f passing, and removing both fails it. A second finger calls `moveable.stopDrag()`; no `dragEnd` follows and the preview is cancelled.
7. **`getScreenCTM` is single precision.** Chrome returns the CTM's translation as float32 (e.g. `397.29998779296875`). Δ in §15 a still meets 1e-6 because the translation cancels in a difference and the scales tested (0.5, 1, 7.3) round benignly; absolute screen→world round trips carry about 4e-6 mm of error at zoom 3, which is why the zoom-about-cursor anchor check in (i) uses 1e-3 mm.
8. **use-gesture pinch on touchscreens calls `setPointerCapture` on every pointerdown** (device `pointer`). It did not interfere with Moveable/Selecto (they use touch and compatibility mouse events). Pan drags use `pointer: { capture: false }`, so no capture is taken for mouse presses.

## WebKit

`pnpm exec playwright test --project webkit` fails at `browserType.launch` on this host: missing `libgstcodecparsers-1.0.so.0` and `libavif.so.13` (installing them needs root; `sudo` requires a password). The WebKit project stays configured; run it where `playwright install-deps webkit` has been applied, and do the SPEC G7 manual iPad Safari checklist before relying on Safari `gesture*` handling, which no automated project here exercises.
