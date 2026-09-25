# Decision reconciliation — 2026-09-24

Inputs: the orchestrator handoff and the consolidated research packet (Part I product research, Part II technology decisions; Part II wins on conflict). No repository, `AGENTS.md`, or code existed before this document.

## Product decisions preserved (from the packet, unchanged)

- Design tool, not manufacturing planner. 2D. Users edit the finished pattern directly. Board is a rectangular clip viewport.
- Primitives: Material, Band, Region, Motif definition, Motif instance, Repeat field, Crossing. Semantic versioned JSON is the document; SVG is derived.
- Canonical geometry in millimetres as plain floats; inch/mm display; fractional-inch input to 1/64.
- Desktop and tablet first-class; hover and right-click are never the only path.
- Flat material colours. No cut lists, kerf, 3D, accounts, cloud, AI, CNC, plugins.
- Original fixtures only; the Chainmail manual is a complexity benchmark, never content.
- Local Band/Band over-under crossings are first-class and the early hard proof.

## Technology assumptions verified in this environment

| Item | Verified |
| --- | --- |
| Node | 22.12.0 (asdf). Meets `vite@8` (`^20.19 \|\| >=22.12`) and `vitest@5` (`^22.12`) exactly at the minimum. |
| Package manager | pnpm 10.32.1. The `npm` shim is misconfigured under asdf; do not use it. |
| Registry | Reachable. Latest: react 19.3.0, vite 8.3.1, @vitejs/plugin-react 6.1.1, typescript 7.0.2, zustand 5.0.15, zundo 2.3.0, zod 4.6.5, @flatten-js/core 1.6.14, fraction.js 5.3.4, react-moveable 0.56.0, react-selecto 1.26.3, @use-gesture/react 10.3.1, vitest 5.0.1, @playwright/test 1.63.0. |
| Licences | MIT for all of the above except TypeScript and Playwright (Apache-2.0), idb (ISC), clipper2-ts (BSL-1.0). Matches the packet. Re-check against the installed lockfile before any release. |
| Playwright browsers | Chromium, Firefox, WebKit builds already cached under `~/.cache/ms-playwright`. |
| Git identity | Global identity is a work address; this repo is configured locally to `dllustig@gmail.com`. |

TypeScript 7.x (native compiler) is now the npm latest. The Vite template pins its own TypeScript; keep whatever the template installs unless it breaks Vitest or the React plugin.

`pnpm licenses list` on the Task 1 scaffold's installed graph (react, react-dom, vite, @vitejs/plugin-react, typescript, vitest, and their transitive deps): licence names present are MIT, Apache-2.0 (detect-libc, expect-type, typescript), BSD-3-Clause (source-map-js), ISC (picocolors, siginfo), and MPL-2.0 (lightningcss, lightningcss-linux-x64-gnu); no GPL/AGPL or unlicensed packages.

## Contradictions and corrections

1. **Band/Region `transform` field removed.** Part I's illustrative model gives Bands and Regions their own Transform. Part II §4.1 defines the transform chain for motif instances and repeats only. Two ways to express the same geometry (points plus a transform) would double every geometry path, snapping rule, and inspector field. Decision: Bands and Regions store points in their parent's coordinate space; move/rotate/mirror bake into points. Only motif instances and repeat fields carry a Transform. Affected acceptance: none; all product tests still pass with baked points. Documented in SPEC §2.
2. **`MotifDefinition.origin` removed.** Children are re-based on creation so the definition's origin is the pivot. One fewer field with the same behaviour.
3. **Crossing identity is not `bandAId + bandBId + intersectionKey`.** Replaced with occurrence-addressed refs plus stable segment identity (SPEC §5).
4. **Gestures and touch are in the first editor slice**, not Phase 5, as Part II §3.1 instructs.
5. **Compositing algorithm.** Part II suggests masking the under Band. The SPEC instead re-paints the over Band clipped to the crossing footprint (SPEC §6). This is the same primitive class (SVG clip in `userSpaceOnUse`) but avoids anti-aliasing gaps along the over Band's edges and never touches the under Band's paint outside the footprint. The proof gate is unchanged.
6. **Single active project, no `idb`.** Part II leaves this to the SPEC. V1 stores one project in `localStorage` with explicit Download/Open; a gallery is not in scope.
7. **`fraction.js` dropped.** Part II §3.4 recommends it behind a thin wrapper. The editor review ran fraction.js 5.3.4 against the packet's own input list: it rejects `1-1/8` and padded whitespace, and accepts `1:2`, `0.(3)`, and `1.'3'`. The wrapper would therefore have to own the grammar anyway, after which the library contributes nothing a 20-line integer parser does not. SPEC §8 defines the grammar. Affected acceptance: unit parser tests only.
8. **`Band.closed` added.** Borders and nested outlines are named Band uses in Part I §6.3; an open polyline returning to its start renders two butt caps at the corner. One boolean, rendered with `Z`.
9. **Compositing corrections after review.** The clipped re-paint patch draws only the crossed segment, is enlarged across both Bands' edges by a device-pixel amount in the editor (fixed mm in export), and two further unsupported classes (`near-joint`, `occluded`) guarantee it never paints where it should not. Eligibility is decided per world intersection. See SPEC §5.2, §6.2, §16.

## Decisions deferred to proofs (not settled by research)

- Whether `react-moveable` and `react-selecto` work correctly with a viewBox-driven SVG camera, nested motif occurrences, and undo without drift. Slice 1 decides. If they fail on coordinate or event semantics, the packet's fallback is Fabric.js (canvas). I will record the exact failure and stop for a decision before pivoting, because Fabric contradicts SVG-first rendering and export parity, and a minimal owned handle set may be the smaller correction.
- Whether clipped re-paint isolates acute, unequal-width crossings without touching neighbours. Slice 2 decides. Fallback: `clipper2-ts` offsets, per packet.

## Open questions that affect V1

None block the SPEC. One is worth confirming at the spec gate: **nested motifs.** The SPEC allows a motif definition to contain instances of other motifs (acyclic). Rendering and addressing support it with no extra code paths, and Fixture F benefits. If you prefer flat motifs only, that is a one-line validation change.
