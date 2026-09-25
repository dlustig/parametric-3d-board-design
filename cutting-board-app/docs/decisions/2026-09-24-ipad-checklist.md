# iPad Safari manual checklist (G7)

SPEC §13 G7 also requires a manual pass on real iPad Safari hardware — CDP touch
(`e2e/tablet.spec.ts`) exercises the DOM-level touch/gesture handling in headless
Chromium, but only a real device exercises Safari's own gesture recognizer,
its on-screen keyboard, and native pinch-zoom. Run each row on an iPad (any
recent iPadOS) in Safari against `pnpm dev --host` reached over the LAN (there
is no deployed build), then fill in Result and Notes. A row that can't be exercised (no trackpad
available, etc.) should say so in Notes rather than being left blank.

| # | Item | Steps | Expected | Result (Pass/Fail) | Notes |
| --- | --- | --- | --- | --- | --- |
| 1 | Wheel / trackpad behaviour | With a trackpad or Magic Mouse paired to the iPad: plain two-finger scroll over the canvas; then hold ⌘/Ctrl and two-finger scroll (or pinch on the trackpad). | Plain scroll pans the canvas (SPEC §7.2). Modified scroll / trackpad pinch zooms about the cursor. Neither scrolls or zooms the Safari page itself. | | |
| 2 | Handle touch | Select a single Band or Region. Touch-drag a vertex handle to a new position; touch-drag a midpoint handle to insert a vertex. | Both handles are easy to acquire with a finger (SPEC §7.4 vertex/midpoint handles), drag smoothly, and commit one history entry each; a tap (no drag) on a midpoint does not insert a point. | | |
| 3 | Drawing double-tap | Select the Band tool, place two points by tapping, then double-tap to finish. Repeat for Polygon (double-tap should not place a duplicate point at the tap location). | The shape finishes on the double-tap with no extra point at the second tap's location (SPEC §7.4 own double-tap detection, `DOUBLE_TAP_MS`/10 px). | | |
| 4 | Multi-select toggle | Turn on the rail's **Add to selection** toggle. Tap two different objects, then tap one of them again. | Both objects get selected by the first two taps (tap acts as Shift+tap); the third tap (on the already-selected one) removes it from the selection. | | |
| 5 | Fraction entry keyboard | Open an inch-unit project (or set display units to inches), focus a numeric field (e.g. Band Width) and type a fraction like `3/16`. | The on-screen keyboard offers ordinary text entry (the field is `inputMode="text"`, SPEC §7.5) — not a numeric-only keypad that hides `/` — and the value parses and previews live. | | |
| 6 | Pinch never zooms the page | With two fingers on the canvas, pinch in and out repeatedly, including starting the pinch near the screen edge. | The canvas content zooms (camera), but Safari's own page zoom never engages — no page-wide zoom, no bounce/rubber-band scroll of the surrounding page. | | |
| 7 | `gesture*` events | Pinch and rotate with two fingers on the canvas (Safari fires `gesturestart`/`gesturechange`/`gestureend` in addition to touch events). | The camera pinch-zooms smoothly with no jump or double-application of the zoom delta (SPEC §7.2 lists Safari `gesture*` as an owned input, same row as Ctrl/Cmd+wheel and trackpad pinch); no page-level effect. | | |

## Environment

- Device: _(fill in — model, iPadOS version)_
- Safari version: _(fill in)_
- Build under test: _(fill in — commit/branch, `pnpm dev` or a built bundle)_
- Date run: _(fill in)_
- Run by: _(fill in)_
