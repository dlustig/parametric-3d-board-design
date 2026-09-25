# Cutting Board Pattern Designer

A React + TypeScript + Vite single-page app for designing end-grain and edge-grain cutting board patterns: Bands (strips of wood), Regions, motifs repeated in fields, and which strip goes over which at every crossing. It runs entirely in the browser and exports a true-scale SVG.

## Scripts

Install dependencies with `pnpm install`, then:

| Command | What it does |
| --- | --- |
| `pnpm dev` | Vite dev server on http://localhost:5173 (development build: adds a fixture loader to the toolbar and the `window.__cbpd` test hook). |
| `pnpm build` | Type-checks `src`, then writes the production build to `dist/`. |
| `pnpm preview` | Serves the production build from `dist/`. |
| `pnpm typecheck` | Type-checks `src` and `e2e` without emitting. |
| `pnpm test` | Vitest unit suite. |
| `pnpm test:e2e` | Playwright end-to-end suite (same as `pnpm exec playwright test`): chromium, firefox, webkit and a touch-emulating chromium project, against the dev server it starts. |
| `pnpm perf` | G9 performance run: builds `dist/perf` (production React with the test hook), serves it, and runs `e2e/performance.spec.ts` in chromium three times, printing one `G9…` JSON line per case and run. |

Playwright needs its browsers once: `pnpm exec playwright install` (and, on Linux, `pnpm exec playwright install-deps` for WebKit's system libraries).

## First run

The app opens on a blank project in millimetres: a 300 × 450 mm Board (12 × 18 in, 304.8 × 457.2 mm, for a new inch project) fitted to the canvas, with a grid. Around it:

- **Top bar:** New Project, Open Project, Download Project (`.cbpd.json`), Export SVG, and the save status ("Saved": every change autosaves to this browser's local storage).
- **Left rail:** the tools Select (V), Hand (H), Band (B), Rectangle (R), Polygon (P) and Crossing (X); the toggles Snap, Show grid and Add to selection; Paste, Create Motif, Repeat; zoom − / + and Fit.
- **Right inspector:** the materials palette (eight starter species; `+` adds one) and, with nothing selected, the Board panel: name, width and height, background, display units (mm or in) and grid spacing. Selecting something shows its panels instead.

Lengths accept decimals, fractions and mixed numbers (`3/16`, `1 1/8`, `1-1/8`, with an optional `in`, `"` or `mm`). Reloading the page restores the autosaved project.

## Design documents

The specification is `docs/superpowers/specs/2026-09-24-cutting-board-pattern-designer-design.md` and the implementation plan `docs/superpowers/plans/2026-09-24-cutting-board-v1.md`. Gate results are in `docs/decisions/2026-09-24-gates.md`.
