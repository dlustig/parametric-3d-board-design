# Cutting Board Pattern Designer — Orchestration Agent Handoff

You are the orchestration agent responsible for taking an already researched product into a reviewed specification, implementation plan, and working first SPA. Work continuously and make routine choices yourself. The human has deliberately separated this research phase from implementation; preserve its decisions and retire the identified risks before broad feature work.

## Read order and authority

Read these two files **in full**, in this order:

1. `cutting-board-pattern-designer-technology-packet.md` — Part I contains the complete original product research; Part II contains the latest dependency decisions, corrections to the crossing and motif model, and two narrow integration comparisons. **Part II takes precedence where the original research conflicts.**
2. This handoff prompt — mission, execution sequence, and completion standard.

These two documents are the complete handoff. The original research file and old implementation prompt have been incorporated or superseded; do not require them, the source manual, or prior chat history. If filenames differ in your environment, resolve by title/content. Inspect the actual repository, package manager, runtime, project instructions, and existing architecture before selecting versions or writing code. No implementation repository was included with this handoff.

## Goal and boundaries

Deliver a fast, direct-manipulation, dimensionally meaningful **2D cutting-board pattern editor** for experienced woodworkers. Users draw Bands and Regions, assign and swap Materials, make Motifs, repeat and transform them, edit source definitions, and toggle eligible local Band/Band over-under crossings. Keep semantic, versioned JSON as the editable document; SVG is derived.

Do not add cut lists, manufacturing sequences, kerf/stock calculations, 3D/AR, accounts, cloud collaboration, AI, CNC, a generic plugin/editor framework, or photorealistic wood. Treat the supplied Chainmail manual only as a complexity benchmark. Ship original fixtures, not its pattern, diagrams, dimensions, or instructions.

## Required orchestration sequence

1. **Inspect and reconcile.** Read all inputs and repository instructions. Write a short decision reconciliation: product decisions preserved, technology assumptions verified, contradictions corrected, open questions that genuinely affect V1. Confirm Node/template engines and installed dependency licenses rather than copying version guesses. **Do not redo the broad dependency survey.**
2. **SPEC before substantial implementation.** Define exact document schema and ownership/order; motif origin and transform composition; valid Band/Region geometry; repeat address expansion; occurrence-specific and definition-wide crossing scope; crossing eligibility and unresolved behavior after topology edits; units and fractional parsing; snapping and gestures; state/history; import/migration validation; storage failure UX; standalone SVG export; accessible controls; and explicit acceptance criteria. Do not leave crossing identity as `bandAId + bandBId`.
3. **Independent spec review.** Have separate reviewers attack geometry/crossing/export, editor/tablet/persistence, and product workflow/fixture authorability. Record and resolve substantive objections in the SPEC. Do not mistake reviewer agreement for measured proof.
4. **Implementation plan.** Break the SPEC into thin vertical slices with concrete deliverables, modules, tests, and pass/fail gates. Keep domain/geometry independent from React. Front-load the two focused package comparisons in Part II §3.8 of the research packet; do not create a speculative architecture or a throwaway spike that is later rewritten.
5. **First integrated proof.** Prove the recommended Moveable/Selecto/gesture integration within React SVG, and Flatten-based crossing discovery with SVG local masks. If either fails, follow the packet's narrow fallback decision rather than writing a generic editor or geometry engine. Implement the real semantic model, Band/Board, transform, two distinct local crossings between the same Bands, occurrence-addressed motif repeat, local override, history, JSON round-trip, and standalone SVG. Run Part II §5 gates. Fix a failed model before UI polish.
6. **Complete V1 workflows.** Add Regions, materials, numeric inspector, unit parser, snapping, motif source editing, repeats/alternation, pan/zoom and tablet gesture controls, autosave and explicit files, and meaningful workflow/visual tests. Prove the original acceptance designs can be made from blank UI without fixture JSON authoring.
7. **Review and report.** Get independent code/product review after the core proof and before completion. Verify build, tests, export parity, and browser workflow against actual output. Report what works, measured performance, known limitations, and any intentionally unsupported crossing class. Do not claim a gate passed from a screenshot alone.

## Default stack, subject to repo constraints

React + React DOM, TypeScript, Vite, SVG, Zustand + zundo, Zod, `@flatten-js/core`, `fraction.js`, provisional `react-moveable` + `react-selecto`, `@use-gesture/react`, selected Radix Primitives, Vitest, Playwright. Install packages in the slices where used. Keep only domain-specific identity, crossing, motif/repeat, and physical-unit policy in application code. Use browser SVG/Pointer Events and native Blob downloads. Do not add a second pan/zoom owner or redundant geometry package by default. `clipper2-ts` is the fallback for exact Band footprints if local SVG masks fail the specified proof. `idb` is appropriate if V1 supports multiple/larger local projects. Full tldraw is a serious paid alternative if commercial licensing becomes acceptable; do not reject it as technically incapable.

## Product success test

An experienced user can start from a blank Board, create and edit dimensioned Bands/Regions with fraction or mm input, recolor, duplicate/rotate/mirror, build a Motif, repeat it, edit its definition, toggle a particular crossing without changing another, save/reopen, and export a visually matching standalone SVG. Repeat geometry remains semantic. They can author the original stripes, checker/offset, basket weave, chevron/diamond, isometric, and synthetic complex interlace families through the app rather than by editing fixture JSON.

The hard early proof is **crossing identity and compositing through repetition and edits**. If an isolated crossing class cannot be supported cleanly, document and visibly enforce the precise limit; do not silently generate an incorrect design.

## Communication and decision discipline

- Favor the simplest correct code for this product and current release.
- Ask the human only for a real product contradiction with substantial consequences after presenting the researched options and recommendation. Make routine implementation choices autonomously.
- Document any departure from the consolidated research packet, with evidence and the acceptance test affected.
- Do not equate physical proportions in the visual design with fabrication feasibility.
- Keep the SPEC and plan reviewable before broad implementation, then continue through the authorized goal under the environment's normal approval rules.

Start now: read the packet, inspect the repository, and write the reconciliation plus SPEC.
