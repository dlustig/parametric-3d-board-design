# Agent instructions — Cutting Board Pattern Designer

Read this before changing anything. It is the repo's contract for humans and agents alike.

## What this is

A client-only React 19 + TypeScript + Vite 8 editor for cutting-board patterns. The document is versioned semantic JSON (`schemaVersion: 1`, spec §2); SVG is derived from it. Users draw Bands and Regions, assign Materials, build and repeat Motifs, edit motif definitions in place, and toggle which Band is on top at a crossing. No backend, no accounts, no manufacturing planning.

Authority, in order:

1. `docs/superpowers/specs/2026-09-24-cutting-board-pattern-designer-design.md` — the binding V1 spec. Change the spec first, then the code, and log the change in its §16 table.
2. `docs/decisions/*.md` — reconciliation with the research packet, gate results, library quirks, the V1 final report, the iPad checklist.
3. The two research files in the repo root are provenance; Part II of the packet wins over Part I where they conflict, and the spec wins over both.

## Commands

```
pnpm install
pnpm dev            # http://localhost:5173, development build (fixture loader + window.__cbpd test hook)
pnpm dev --host     # same, reachable on the LAN (tablet testing)
pnpm build          # typecheck src, then production build to dist/
pnpm preview        # serve dist/
pnpm typecheck      # src and e2e
pnpm test           # Vitest unit suite
pnpm test:e2e       # Playwright: chromium, firefox, webkit, chromium-touch (starts the dev server)
pnpm perf           # G9 measurements against a production bundle
```

Node 22.12+ and pnpm only. Never `npm` in this repo. Playwright browsers: `pnpm exec playwright install` (plus `install-deps` on Linux for WebKit).

## Layering rules (enforced by review, not tooling)

- `src/domain` — model, Zod schema, validation, migration, pure commands. Imports nothing from React, the DOM, or `@flatten-js/core`, and nothing from `src/geometry` except in four command files: `src/domain/commands/{crossings,motifs,objects,points}.ts` import `@/geometry/{affine,bounds,expand,offset,resolve}` (and the `Intersection` type) because commands own rematching (spec §5.5, §7.1) and Create Motif, Repeat and Offset copy need bounds and offsets (spec §14). Through those imports they depend on Flatten transitively. Commands are `(project, args) => Project | CommandResult`; every output satisfies spec §2.1 (the property test in `src/domain/commands/property.test.ts` checks this over the fixture corpus).
- `src/geometry` — affine, expansion, intersections and classification, footprints, scene. May import Flatten at the boundary; never persists Flatten objects. Classification depends only on the document, never on the camera.
- `src/editor` — Zustand store (`project`, `preview`, ephemeral UI state), tools, keyboard, snapping. The store's `run`, `commit` and `replaceProject` (New/Open/startup load), plus zundo's `undo`/`redo`, are the only writers of `project`; commands own rematching.
- `src/render`, `src/ui` — React only. The scene comes from `buildScene` via `useScene` (`src/editor/scene.ts`) and edits go through the commands; components use `@/geometry` helpers for overlays and screen/world mapping (`RegionPanel`'s Width/Height preview also scales points inline).
- `src/export`, `src/storage` — the standalone SVG writer and the `localStorage` autosave/recovery.
- Spec §4.6 constants live in `src/geometry/tolerance.ts` and `src/domain/limits.ts` (re-exported by `tolerance.ts`). Module-local constants are named where they are used (e.g. `MIN_ZOOM`/`MAX_ZOOM`/`FIT_MARGIN` in `src/editor/camera.ts`, `AUTOSAVE_DEBOUNCE_MS` in `src/storage/local.ts`).

## Conventions

- TypeScript strict with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`. No `any`; explicit return types on exported functions; `import type` for type-only imports; `@/` path alias, no deep relative paths.
- Keep it small: no framework layers, registries, or single-caller helpers; no defensive branches for states validation already excludes; no memoisation or caches without a measured reason (the ones that exist are documented in `docs/decisions/2026-09-24-gates.md`, G9 section).
- Tests: Vitest beside the source as `*.test.ts`; Playwright in `e2e/`. Test behaviour, not implementation; a new test must fail when the code it guards is broken. E2E waits are only for real timers (the two justified cases are documented in the specs); no retries, no loosened tolerances.
- In development and test builds the store deep-freezes and validates every project it takes in (`run`, `commit`, `replaceProject`); an in-place mutation or an invariant violation throws. Production skips both; the `pnpm perf` build (mode `perf`) freezes but does not validate.
- Commits: imperative subject of 50 characters or fewer, body explains why. Run `pnpm typecheck && pnpm test` and the affected e2e specs before committing. Use `FSH_NO_TTY=1 git commit -m "..."` on this machine (a global hook needs a TTY otherwise). No agent-authorship trailers.

## Where things are

| Need | File |
| --- | --- |
| Document types and invariants | `src/domain/model.ts`, `src/domain/validate.ts` |
| Crossing identity, precedence, rematch | `src/domain/crossings.ts`, `src/geometry/resolve.ts` (spec §5) |
| Classification and compositing | `src/geometry/intersections.ts`, `src/geometry/footprint.ts`, `src/geometry/scene.ts` (spec §5.2, §6) |
| Editor state and history | `src/editor/store.ts` (spec §7.1) |
| Input ownership (Moveable, Selecto, use-gesture) | `src/render/Canvas.tsx`, `src/editor/input.ts`, `docs/decisions/2026-09-24-slice1-interaction.md` |
| Units grammar | `src/domain/units.ts` (spec §8) |
| Fixtures A–F | `src/fixtures/` |
| Gate evidence | `docs/decisions/2026-09-24-gates.md` |
| Known limitations and open items | `docs/decisions/2026-09-24-final-report.md` |
