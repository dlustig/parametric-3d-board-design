# Shell spike: react-resizable-panels (shell spec §17 step 0)

Date: 2026-09-25. Library: `react-resizable-panels` 4.13.3 (from
`pnpm-lock.yaml`).

## What was run

A throwaway page (`spike.html` + `src/spike.tsx`) with a horizontal `Group`:

- a left `Panel`: collapsible, `collapsedSize="0px"`, 200–400 px, default 240 px;
- a relative canvas `Panel`;
- a right `Panel`: collapsible, 248–440 px, default 280 px;
- both side panels `groupResizeBehavior="preserve-pixel-size"` (a `Panel` prop — confirmed, see below);
- `useDefaultLayout({ id: 'spike', onlySaveAfterUserInteractions: true })`.

Plus three extra scenarios added per the controller's ruling 2, all in the
same `spike.tsx`, selected by `?scenario=`:

- default: the page above, extended with a `window.__spike.markedCollapseLeft()`
  hook and a `wrappedOnLayoutChanged` that ORs a `toggled` ref into
  `meta.isUserInteraction`, set true just before an imperative `collapse()`
  and cleared right after.
- `?scenario=bad-storage&getItem=throws|unparseable|null`: a `Group` whose
  `useDefaultLayout({ storage })` is given a raw (unwrapped) storage object
  with a misbehaving `getItem`/`setItem`, exercising the library's own
  defenses (or lack of them) with no app-level wrapper in front.
- `?scenario=conditional[&panelIds=1]`: a `Group` whose left/right `Panel`s
  and `Separator`s are conditionally unmounted (`narrow` state), forcing a
  `Group` remount via `key` on every toggle — the library's documented
  pattern for conditionally-rendered panels — with and without the
  `panelIds` option.

Checked by `e2e/spike.spec.ts` at 1440×900:

    pnpm add react-resizable-panels@^4.13 --registry=https://registry.npmjs.org/
    pnpm exec playwright test e2e/spike.spec.ts --project=chromium --project=firefox

**Gate engines: chromium + firefox** (controller decision — WebKit's OS-level
launch dependencies are missing on this host and sudo is not available to
install them; see "WebKit: open owner action item" below). The spike files
are deleted after this record and the dependency change are committed.

## Results

| Check | chromium | firefox |
| --- | --- | --- |
| 1. px defaults 240 / 280 | PASS | PASS |
| 2. px clamping (400, 200, 440, 248) | PASS | PASS |
| 3. preserve-pixel-size at 1000 / 1800 / 1440 wide | PASS | PASS |
| 4. `usePanelRef` collapse → 0, expand → last size | PASS | PASS |
| 5a. dragged size survives reload | PASS | PASS |
| 5b. imperative collapse survives reload (observation) | no (as documented) | no (as documented) |
| 6. **marked** imperative collapse survives reload (ruling 2a) | PASS — persisted, restored | PASS — persisted, restored |
| 7a. raw `getItem` returns unparseable JSON (ruling 2b) | CRASHES the render (see finding) | CRASHES the render (see finding) |
| 7b. raw `getItem` throws (ruling 2b) | CRASHES the render (see finding) | CRASHES the render (see finding) |
| 7c. raw `setItem` throws alone (ruling 2b) | PASS — renders, resizes, no crash | PASS — renders, resizes, no crash |
| 8a. conditional remount, no `panelIds` (ruling 2c) | PASS — sizes preserved | PASS — sizes preserved |
| 8b. conditional remount, with `panelIds` (ruling 2c) | PASS — sizes preserved | PASS — sizes preserved |

`pnpm exec playwright test e2e/spike.spec.ts --project=chromium --project=firefox`
→ **24 passed** (12 per engine; WebKit skipped by the spec's own
`test.skip`, mobile projects unaffected).

Stored value (5a): `{"left":20.95,"canvas":59.497,"right":19.553}`, under the
key `react-resizable-panels:spike`. Percentages keyed by panel id (not
pixels), summing to 100 within floating-point rounding. Identical in both
engines.

Stored value after a **marked** collapse (test 6): `{"left":0,"canvas":80.447,"right":19.553}`
— survives reload; the left panel stays at 0 px. Identical in both engines.

Test 7a's crash is confirmed in both engines, but each engine's native
`JSON.parse` `SyntaxError` text differs (V8: `Unexpected token 'o', "not
valid json {{{" is not valid JSON`; SpiderMonkey: `JSON.parse: unexpected
keyword at line 1 column 1 of the JSON data`) — the test asserts only that
an error surfaced, not its exact text, and logs it for the record. This
cross-engine agreement (crash occurs, only the message wording differs) is
itself corroborating evidence that the missing read-path guard is a real
library gap, not a chromium quirk.

## WebKit: open owner action item (not a gate failure)

**WebKit was not run on this host.** The WebKit **browser binary** is
installed (`~/.cache/ms-playwright/webkit-2359` present), but
`browserType.launch` fails:

    Host system is missing dependencies to run browsers.
    sudo pnpm exec playwright install-deps

`pnpm exec playwright install-deps webkit --dry-run` lists 44 missing OS
packages (fonts, codecs, `libavif13`, `libsoup-3.0-0`, GTK/WPE media
backends, etc.). `sudo -n true` confirms no passwordless sudo is available
in this session, so these cannot be installed here.

This is not a new mystery: `docs/decisions/2026-09-24-slice1-interaction.md`
already documents the identical failure mode from V1's Slice 1 on this same
repo ("failed at `browserType.launch`... missing `libgstcodecparsers-1.0.so.0`
and `libavif.so.13`. Those libraries have since been installed and the
webkit project runs in every full `pnpm exec playwright test`"), and
`docs/decisions/2026-09-24-gates.md` records webkit passing 94/94 tests
across V1's full gate suite with results matching chromium and firefox
throughout. The OS packages that fixed it before are evidently not present
in this worktree's environment (a fresh container/sandbox likely doesn't
carry them even though the user-level Playwright browser cache does).

**Owner action item:** run `sudo pnpm exec playwright install-deps` (or
install the 44 packages `--dry-run` lists) on this host, then run
`pnpm test:e2e --project=webkit` to confirm the full suite (not just this
spike, since the whole project's e2e suite — persistence, a11y, interaction
— targets webkit per `AGENTS.md`) still passes there, matching the V1
precedent. This blocks nothing in Task 3 today; chromium + firefox evidence
above is the controller-approved gate.

## Findings for Task 3

- `groupResizeBehavior` is a **`Panel`** prop. `pnpm typecheck` accepted it
  as written in the brief with no error, and Context7's docs for
  `react-resizable-panels` confirm: `GroupResizeBehavior` is documented as
  a `PanelProps` field (`PanelProps.groupResizeBehavior`), not a `Group`
  prop. Spec §4's wording ("a Panel prop in v4") already matches; no spec
  edit needed.
- Imperative `collapse()`/`expand()` **is not** persisted under
  `onlySaveAfterUserInteractions: true` (test 5b, documented v4 behaviour —
  not a bug, not a gate failure per the controller's ruling 1). **Marking**
  an imperative call as a user interaction fixes this cleanly: wrap
  `onLayoutChanged` as `(layout, meta) => onLayoutChanged(layout, { ...meta,
  isUserInteraction: meta.isUserInteraction || toggled.current })`, where
  `toggled` is a ref set `true` immediately before the imperative call and
  reset immediately after (test 6: PASS in both engines, both the collapse
  and its persistence across reload). This is exactly the mechanism spec §4
  already assumes ("Collapse/expand from our own buttons and shortcuts
  count as user interactions (the plan marks them)") — Task 3's toggle
  handlers should wrap their `Group`'s `onLayoutChanged` this way before
  calling `left.current?.collapse()` / `.expand()`.
- The layout is stored as **percentages** keyed by panel id (not pixels),
  under the key `react-resizable-panels:<id>` (`react-resizable-panels:cbpd-shell`
  for the shell). `groupResizeBehavior="preserve-pixel-size"` still keeps
  the *rendered* pixel width stable across a window resize (test 3); it is
  the group's internal accounting during a resize, not the storage format,
  that this setting affects.
- **The app-level storage wrapper (spec §4) is required, not optional —
  this is the load-bearing finding for Task 3.** A raw `storage.getItem`
  that throws, or that returns a non-JSON string, crashes the *entire*
  `Group`'s render tree with an uncaught exception — confirmed from real
  stack traces in both chromium and firefox, not inference:
  - `getItem` throwing: uncaught inside `useSyncExternalStore`'s snapshot
    function (`mountSyncExternalStore` → the hook's `getSnapshot`, which
    calls `storage.getItem` with **no try/catch**).
  - `getItem` returning unparseable text: an uncaught `SyntaxError` from an
    **unguarded `JSON.parse`** inside a `useMemo` in the same hook.
  - Both cases, both engines: React logs "An error occurred in the
    `<...>` component. Consider adding an error boundary" and the
    component tree unmounts to an empty `<div id="root">` — nothing else
    renders (test 7a/7b).
  - By contrast, `setItem` throwing **alone** (`getItem` returning `null`,
    the normal empty case) does **not** crash: the docs' claim that write
    failures are "caught and logged with `console.error`, not thrown" holds
    for the write path (test 7c: PASS in both engines, page renders with
    defaults, dragging still works, no uncaught `pageerror`).
  - **Conclusion for Task 3:** the storage wrapper must defend the *read*
    side specifically — `getItem` must never throw, and must return `null`
    (not garbage) for anything that isn't valid, already-ours JSON, or the
    shell will hard-crash on any corrupted or blocked `localStorage` entry
    at startup. The write side doesn't strictly need a wrapper (the library
    already swallows `setItem` failures), but wrapping both uniformly (as
    spec §4 already plans) is simpler and equally correct.
- **Conditionally-rendered side panels** (simulating the < 1024 px narrow
  overlay layout, spec §4): unmounting/remounting the left and right
  `Panel`s + `Separator`s, forcing the `Group` to remount via a `key` change
  (the library's documented pattern), preserved the dragged pixel sizes
  correctly **both with and without `panelIds`**, in both engines (tests 8a
  and 8b both PASS) — because Task 3's real config
  (`onlySaveAfterUserInteractions: true`) guards the narrow-only remount's
  initial commit from auto-saving, and the narrow layout (canvas-only, no
  drag targets) offers no opportunity for a real user interaction to
  overwrite the wide layout's storage key. `panelIds` is therefore not
  strictly required for this narrow/wide swap under Task 3's actual
  persistence config, but costs nothing (the `Group` already remounts via
  `key` either way) and is the library's documented, defensive pattern for
  this exact use case — it is reasonable to keep it as a safety margin
  rather than relying on the interaction-guard alone.

## Verdict

**PASS: adopt for Task 3.** Chromium and firefox (the controller-approved
gate engines) both pass every required check (1–5a) and every extension
observation (5b, 6, 7a–7c, 8a–8b) — 24/24 combined, all as expected or
precisely explained above. WebKit was not run on this host (missing OS
packages, no sudo — see above); this is tracked as an open owner action
item, not a gate failure, per the controller's decision.
