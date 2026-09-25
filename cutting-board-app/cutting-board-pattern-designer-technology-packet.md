# Cutting Board Pattern Designer — Consolidated Product and Technology Research Packet

**Date:** 2026-09-24  
**Purpose:** Complete product and dependency research for the orchestration agent. This packet and `cutting-board-pattern-designer-orchestrator-handoff.md` are the only required handoff documents. No repository or source manual is required to understand the handoff.

**Reading rule:** Read Part I for product intent and scope, then Part II for the latest technology choices and corrections. Part II supersedes Part I where they conflict, especially the package recommendations, crossing schema, occurrence identity, and implementation sequencing. Part I is preserved in full as research provenance; its older “handoff definition of done” describes the research stage, not a separate required file.

---

# Part I — Product, Domain, UX, and Original Research

**Status:** Research complete enough to begin specification and implementation planning  
**Date:** 2026-09-24  
**Primary target:** Fast browser SPA, designed so the core model can later support a native/App Store product  
**Primary user:** A woodworker who already knows how to build complex cutting boards and wants a much faster way to design them

---

## 0. Executive conclusion

Build a **2D, direct-manipulation, parametric pattern editor for cutting boards**.

The product is not traditional CAD and is not a manufacturing planner. It occupies the gap between graph paper and CAD:

> **Faster than CAD, more precise and editable than paper.**

A user should be able to turn a visual idea into a dimensionally meaningful cutting-board pattern in minutes, then rapidly explore changes in geometry, wood assignment, symmetry, repetition, and over/under relationships.

The app should model the **finished visual design directly**, not force the user to model the sequence of cuts, glue-ups, milling operations, kerf, stock preparation, or shop workflow required to manufacture it.

The strongest product analogy is:

> **Figma for cutting-board patterns, with woodworking-specific geometry.**

The strongest architectural principle is:

> **Do not build a generic drawing application and add woodworking features to it. Build a cutting-board pattern editor whose semantic objects happen to render as vector geometry.**

For V1, use a small domain language:

- Board
- Material
- Band
- Region
- Motif
- Motif Instance
- Repeat Field
- Crossing

and a small set of transformations:

- Move
- Rotate
- Mirror
- Duplicate
- Group / Create Motif
- Repeat
- Reorder / local over-under crossing

This is sufficient to express simple boards while scaling to interlaced, nested, mirrored, and repeated designs of the same *complexity class* as the supplied Chainmail reference without reproducing that copyrighted pattern as a bundled template.

---

# 1. Product definition

## 1.1 One-sentence definition

**A fast, visual, parametric design tool for creating complex cutting-board patterns with real dimensions, wood materials, reusable motifs, symmetry, repetition, and editable intersections.**

## 1.2 Job to be done

When a woodworker has an idea for a cutting-board pattern, they need to answer quickly:

> What will this actually look like, at real proportions, if I make it?

Then they need to explore variants without redrawing the design:

- What if this accent strip is 3/16" instead of 1/4"?
- What if walnut and maple are swapped?
- What if the central motif is 15% larger?
- What if alternate motifs are mirrored?
- What if the pattern repeats 4 × 6 instead of 3 × 5?
- What if the diagonal is 30° instead of 45°?
- What if one crossing goes under instead of over?
- What if the board is 14" × 20" rather than 12" × 18"?

The software should make those questions nearly instantaneous.

## 1.3 The problem

### Paper

Paper is excellent for sketching but poor for iteration once the design contains exact dimensions, nested geometry, repeated motifs, angles, many wood species, or symmetry. A single change can require substantial redrawing and arithmetic.

### Traditional CAD

CAD solves precision but introduces unnecessary ceremony for this job: sketches, constraints, solids, extrusions, construction planes, bodies, assemblies, and many operations unrelated to visual pattern exploration.

### Existing cutting-board software

Most existing products are organized around **strip sequences, build calculations, templates, and manufacturing plans**, not unrestricted direct composition of a complex finished pattern.

The gap is not "another cutting-board calculator." The gap is:

> **A domain-specific visual pattern editor that lets woodworkers think in geometry, materials, motifs, and repeats.**

---

# 2. Source reference: what the supplied Chainmail plan teaches us

The supplied *Chainmail Weave* manual is a useful complexity benchmark because the final appearance emerges from multiple intermediate glue-ups and transformations.

The source describes:

- three successive "weave" assemblies;
- repeated splitting, bookmatching, insertion of accent strips, and redimensioning;
- a 45° diamond extraction;
- final arrangement of the resulting pieces into a repeated pattern;
- cross-cutting and flipping to reveal the end-grain layout.

The important research conclusion is that **the manufacturing history is much more complicated than the finished visual grammar**.

For the design application, the relevant visual ingredients are approximately:

- background regions;
- narrow parallel accent bands;
- wider bands;
- ±45° diagonals;
- nested diamond-like structures;
- mirrored geometry;
- repeating units;
- local visual interlacing / over-under behavior;
- multiple material assignments.

The application should let the user directly create the desired final pattern rather than reconstruct the entire shop process that generates it.

### Copyright constraint

The supplied manual explicitly states that the Chainmail Weave is an original design and restricts redistribution / mass production of that design. Therefore:

- use the manual internally as a **complexity and expressiveness test**;
- do not ship the Chainmail pattern as a built-in template;
- do not copy the manual's diagrams, dimensions, or instructions into the product;
- use synthetic interlaced patterns of similar complexity as automated fixtures and demonstrations.

---

# 3. Product principles

## P1 — Design first, fabrication later

V1 answers:

> "What does my design look like?"

It does **not** answer:

> "Exactly how do I manufacture it?"

The user already knows woodworking. The application is their design instrument.

## P2 — Direct manipulation first

The user should be able to draw, drag, resize, rotate, mirror, duplicate, and repeat objects without entering a form first.

Numeric inputs exist to refine geometry, not to replace visual editing.

## P3 — Real dimensions, not pixel art

The canvas represents real physical dimensions. A 1/8" accent and a 1/2" strip have meaningful relative scale.

## P4 — Semantic geometry

A band remains a **Band** with a width, material, path, and crossings. It is not flattened into anonymous SVG polygons in the saved document.

Likewise, a repeated motif remains a repeat definition rather than hundreds of disconnected shapes.

## P5 — Reuse is a first-class operation

Complex patterns become manageable when the user can design one element and reuse it:

> Build once → convert to motif → repeat / rotate / mirror → edit source → all instances update.

## P6 — Complexity should emerge from a small language

Do not create a special tool for "diamond," "basket weave," "chain," "chevron," "tumbling block," etc. unless later evidence shows it is necessary.

Those designs should emerge from common primitives and transformations.

## P7 — The app must beat graph paper

If a reasonably experienced user can sketch the idea faster on graph paper than in the app, the interaction model is wrong.

## P8 — Precision without CAD ceremony

Useful exactness:

- lengths;
- widths;
- positions;
- angles;
- alignment;
- symmetry;
- repeat spacing.

Avoid V1 CAD concepts such as a general constraint solver, assemblies, solids, or parametric dependency graphs.

---

# 4. Competitive research

Research was performed against current web/mobile tools and woodworking discussions as of 2026-09-24.

## 4.1 Cutting Board Designer: 3D

Source:
- https://cuttingboarddesigner.app/
- https://apps.apple.com/us/app/cutting-board-designer-3d/id6763621639

Capabilities advertised:

- browser plus iPhone/iPad/Mac;
- stack wood species;
- strip widths and angles;
- alternate flip / rotation;
- 2D and 3D preview;
- kerf, slice count, cut lists, finished dimensions;
- AR preview;
- templates.

**Lesson:** polished product, but its central abstraction remains the board/build configuration. It validates demand for quick visual preview but does not remove the opportunity for a more expressive pattern-first editor.

## 4.2 Cutting Board Designer JS (CBDJS)

Source:
- https://ericu.github.io/CBDJS/cb.html

It models a sequence of wood layers with width and trailing angle and supports operations such as alternate flip/rotation. It includes examples such as checkerboard, zig-zag, spiral, and snakeskin.

**Lesson:** strip sequencing can generate useful designs with very little UI, but becomes constraining when the desired pattern is better described spatially than as an ordered list of source strips.

## 4.3 MvRens/CuttingBoard

Source:
- https://github.com/MvRens/CuttingBoard

Relevant features:

- fully client-side;
- multiple source boards with their own layer patterns;
- combine source boards into an end-grain board;
- per-strip direction;
- customizable wood species;
- JSON save/load;
- metric and decimal-inch support.

**Lesson:** composition of reusable source patterns is useful. But the data model is still rooted in source-board construction rather than a direct finished-pattern canvas.

## 4.4 Endgrain Designer

Source:
- https://endgraindesigner.com/

It exposes named pattern families and visual segments, material selection, widths, mirror, rotation, waste, kerf, cut lists, and build sequence.

**Lesson:** the market repeatedly gravitates toward templates + manufacturing calculations. Our intended product should deliberately avoid competing on that axis in V1.

## 4.5 CuttingBoardDesigner.com

Source:
- https://www.cuttingboarddesigner.com/

It exposes numerous named patterns and parameters, then shows preview, costs, and build steps.

**Lesson:** template parameterization is useful for users who already know what pattern family they want. It is weaker for free exploration and original pattern invention.

## 4.6 Sawdust Math Cutting Board Designer

Source:
- https://sawdustmath.com/design/cutting-board/

Strip-oriented design, 2D/3D preview, stock and cost calculation, cut sheet.

**Lesson:** another confirmation that the existing tool category largely treats design as input to a calculator.

## 4.7 Endgrain Studio

Source:
- https://end-grain-studio.com/

Parametric lamella-based design with species, dimensions, 3D preview, material plan, and seven manufacturing stages.

**Lesson:** sophisticated manufacturing-aware parametrics are possible, but they solve a different primary problem.

## 4.8 2026 community-built pattern maker

Sources:
- https://www.reddit.com/r/Cuttingboards/comments/1qwmj1k/im_making_a_website_for_designing_cutting_board/
- https://www.reddit.com/r/Cuttingboards/comments/1r3uh2w/my_cutting_board_pattern_maker_is_now_live/

This is the closest conceptual competitor found.

Its creator describes:

- individual editable blocks identified by letters;
- a grid in which block letters are arranged;
- blocks containing multiple colors;
- angle and width controls;
- repeated rows/columns.

The motivation was that existing tools could not adequately explore a desired pattern.

Community responses specifically expressed interest in:
- having the software do pattern math;
- more expressive pattern creation;
- 3D/build transformations in some cases;
- usability improvements for complex grids.

**Lesson:** there is direct evidence that woodworkers want a more expressive pattern-design tool. A block/grid model is useful but still forces design through a tile spreadsheet. Direct manipulation plus reusable motifs should be more fluid.

---

# 5. Adjacent-domain research

The most useful product ideas are not coming only from woodworking software.

## 5.1 Quilting software

### Electric Quilt (EQ8)

Sources:
- https://electricquilt.com/
- https://support.electricquilt.com/articles/using-the-rotate-flip-and-symmetry-tools-in-eq8/
- https://support.electricquilt.com/articles/understanding-block-vs-motif/

Relevant concepts:

- reusable blocks;
- motifs distinct from background-bearing blocks;
- rotate / flip operations;
- symmetry generation;
- live recoloring;
- repeated layout;
- working at finished dimensions.

**Takeaway:** the block/motif vocabulary maps extremely well to complex cutting boards. The important idea is not to copy EQ8's UI; it is to preserve reusable design definitions and instance-level transforms.

## 5.2 LoomSketch / weaving tools

Source:
- https://loomsketch.com/

Relevant ideas:

- browser-first;
- immediate drawing;
- symmetry;
- adjustable element sizes;
- repeating tile preview;
- simple color palette;
- minimal learning curve.

**Takeaway:** domain tools can be powerful without becoming CAD. Immediate visual feedback is more important than generality.

## 5.3 Seamless pattern / textile tools

Sources:
- https://boxlab.io/tools/tiler/en
- general repeat literature

Useful repeat modes:

- straight/grid;
- half-drop;
- half-brick;
- mirror;
- alternating transforms.

**Takeaway:** "repeat" deserves to be a semantic object, not a one-time duplicate command.

## 5.4 Broader pattern theory

There are 17 mathematical wallpaper symmetry groups, but implementing a general wallpaper-group system in V1 is unnecessary.

A small set of practical repeat controls covers the woodworking use case:

- rows × columns;
- X/Y step;
- alternating row or column offset;
- alternate horizontal mirror;
- alternate vertical mirror;
- alternate 90°/180° rotation.

If future designs show a need for full crystallographic symmetry, it can be added later.

---

# 6. Domain grammar

## 6.1 Board

The **Board** is the finished visible boundary.

V1:

- rectangle only;
- width;
- height;
- optional background material;
- acts as a clip boundary for design geometry.

Important mental model:

> The board is a viewport through the design, not the fundamental design object.

Objects may extend outside the board. They are simply clipped visually.

Later:
- rounded rectangles;
- handles;
- juice grooves;
- custom outlines.

Those are explicitly not V1 concerns.

## 6.2 Material

A Material is a visual wood/material assignment.

V1 fields:

- id;
- name;
- display color;
- optional short label.

Built-in starter palette may include common species such as walnut, maple, cherry, purpleheart, padauk, ash, oak, etc., but **custom material creation is mandatory**.

Do not encode physical lumber properties in V1.

Do not make photorealistic wood texture a dependency. Flat, well-chosen colors provide a clearer design surface.

## 6.3 Band

A **Band** is the most important primitive.

Definition:

> A constant-width material strip following a line or polyline.

Properties:

- material;
- width;
- ordered path points;
- transform;
- mitered joins by default;
- butt ends by default.

Typical uses:

- accent stripes;
- diagonal strips;
- nested outlines;
- woven paths;
- borders;
- chevrons.

Why a Band is semantic rather than a polygon:

- width can be changed directly;
- length and angle remain understandable;
- intersections can be detected from centerline geometry;
- crossings can refer to band IDs;
- future manufacturing analysis can reason about strip-like geometry.

## 6.4 Region

A **Region** is a closed polygon filled with one material.

Properties:

- material;
- ordered polygon vertices;
- transform.

Typical uses:

- backgrounds;
- diamonds;
- triangles;
- tumbling-block faces;
- irregular filled spaces.

Convenience creation tools can create rectangles, triangles, and diamonds, but these should serialize as Region geometry rather than separate domain types unless later behavior requires otherwise.

## 6.5 Motif

A **Motif** is a reusable named definition containing Bands, Regions, and nested references.

Semantics should resemble a Figma component / SVG symbol:

- one source definition;
- many instances;
- changes to source propagate to all instances;
- instances may have their own transform.

V1 should allow:

1. select geometry;
2. **Create Motif**;
3. name it optionally;
4. place instances;
5. edit the motif source.

Do not duplicate and flatten the source geometry on every repeat.

## 6.6 Motif Instance

Instance properties:

- motifDefinitionId;
- position;
- rotation;
- mirrorX;
- mirrorY;
- optional scale.

Recommendation for V1: allow **uniform scale only** for motif instances. Non-uniform scaling changes strip widths differently by axis and can undermine physical meaning.

## 6.7 Repeat Field

A Repeat Field creates many transformed instances of one source motif or selection.

Properties:

- source definition / object;
- rows;
- columns;
- stepX;
- stepY;
- rowOffset;
- columnOffset;
- alternate mirror X;
- alternate mirror Y;
- alternate rotation mode.

The repeat remains editable as one semantic object.

Examples:

- straight grid;
- brick;
- half-drop;
- mirror tessellation;
- alternating 180° motifs.

## 6.8 Crossing

A Crossing is a **local relationship between two intersecting Bands**.

It records which band is visually on top at a specific intersection.

This matters because whole-object z-order is insufficient for woven patterns: Band A may pass over Band B at one intersection and under it at another.

Suggested semantic shape:

```ts
type Crossing = {
  id: string
  bandAId: string
  bandBId: string
  intersectionKey: string
  overBandId: string
}
```

`intersectionKey` should be derived deterministically from path segment indices / intersection position rather than relying only on raw floating-point coordinates.

The renderer derives local segmentation/masking from this relation. The saved model should not manually split the Band.

---

# 7. Transformations

V1 supports:

- translate;
- rotate;
- mirror horizontal;
- mirror vertical;
- duplicate;
- group;
- create motif;
- create repeat;
- reorder;
- toggle crossing.

## Angle behavior

Default snap angles:

- 0°;
- 15°;
- 30°;
- 45°;
- 60°;
- 90°.

Allow free numeric input.

45° and 90° will be common, but do not hard-code the domain around them. 30° and 60° are important for hexagonal / isometric illusion patterns.

## Scaling

- allow uniform motif scaling;
- changing Band width numerically is preferred to arbitrary free scaling of a Band;
- do not introduce a general CAD-style scale model where dimensional meaning becomes ambiguous.

---

# 8. Interaction design

## 8.1 Target devices

V1 should be excellent on:

- desktop/laptop browser;
- tablet browser with touch.

Phone editing is not a V1 requirement.

This matters because a future App Store product is plausible. Avoid interaction assumptions that require hover or right-click.

## 8.2 Layout

Recommended baseline:

### Top bar

- project name;
- undo / redo;
- unit selector;
- zoom controls / fit;
- save/export.

### Left tool rail

- Select;
- Band;
- Region;
- Motif / Repeat actions appear contextually rather than necessarily as persistent tools.

### Main canvas

- infinite pan/zoom workspace;
- Board centered initially;
- geometry clipped to board in normal view;
- optional "show outside board" editing mode.

### Right inspector

Context-sensitive numeric properties.

For Band:

- material;
- width;
- angle where meaningful;
- X/Y;
- path points / segment dimensions as needed;
- duplicate;
- mirror;
- create motif.

For Repeat:

- rows;
- columns;
- step;
- offset;
- alternating transforms.

### Material palette

Could occupy the bottom of the left panel or a compact floating section.

Clicking a material while geometry is selected reassigns it immediately.

## 8.3 Band creation

Recommended interaction:

1. choose Band;
2. pointer-down / tap to place start;
3. move cursor; live preview;
4. click/tap to place next point;
5. continue to create polyline segments;
6. double-click, Enter, or explicit Finish action ends the band.

While creating:

- show live segment length;
- show angle;
- snap to grid, object edges, endpoints, centers, and angle increments;
- keyboard numeric entry may override active length/angle later, but should not be required.

For the absolute first implementation, a two-point straight Band is acceptable if polyline Bands are the next immediate milestone. The model should support polylines from the start so the schema does not have to change.

## 8.4 Region creation

V1 should provide:

- rectangle;
- polygon.

Triangle and diamond can be creation shortcuts over polygon geometry.

Do not create a large toolbox of named shapes.

## 8.5 Selection and editing

Expected editor behavior:

- click/tap to select;
- Shift/additive multi-select;
- drag to move;
- handles for resize where semantically valid;
- visible rotation handle;
- Delete / Backspace;
- copy/paste;
- duplicate;
- arrow-key nudge;
- modifier for finer/coarser nudge.

Numeric inspector edits are applied live.

## 8.6 Motif creation flow

1. multi-select objects;
2. click `Create Motif`;
3. the selection becomes a motif definition plus one instance;
4. bounding box is visible;
5. Repeat becomes an obvious next action.

Editing a motif should have an explicit context/breadcrumb:

`Board / Motif: Interlock`

This prevents accidental edits to only one instance.

## 8.7 Repeat workflow

After selecting a motif:

`Repeat`

opens a small inspector with:

- Columns;
- Rows;
- X step;
- Y step;
- Row offset;
- Column offset;
- Alternate rotation;
- Alternate mirror X/Y.

Updates render live.

The initial defaults should tile based on the motif bounds.

## 8.8 Crossings

When two Bands geometrically intersect:

- intersection is discoverable / highlightable;
- clicking an intersection while in a crossing action toggles which band is over;
- visual change is immediate.

Do not make the user manually cut holes, create masks, or segment geometry.

This is one of the highest-value domain-specific features.

## 8.9 Materials / recoloring

Recoloring should be extremely cheap:

- select one or many objects;
- click a material swatch;
- update instantly.

Optional later feature:
- "Select all using this material";
- global material substitution.

Global material substitution is cheap and useful enough that it is a strong V1 candidate.

---

# 9. Measurement and units

## V1 user-facing units

- inches;
- millimeters.

Input should accept common woodworking syntax:

- `0.25`
- `1/4`
- `3/16`
- `1 1/8`
- `25.4mm`
- possibly `1"`.

Fractional-inch formatting should support denominators at least through 1/64.

## Internal representation recommendation

Use ordinary JavaScript numbers in one canonical physical unit, preferably **millimeters**.

Reasons:

- browser geometry is already floating point;
- design—not manufacturing—is the V1 requirement;
- accumulated numeric error at board scale is far below woodworking tolerances;
- exact rational arithmetic would add complexity without user-visible benefit.

Rules:

- centralize parsing/formatting;
- use epsilon-aware geometry comparisons;
- never compare computed geometry with `===`;
- round only for display, not after every operation.

Do **not** introduce rational-number libraries or fixed-point nanometer schemes in V1 unless real defects demonstrate the need.

---

# 10. Snapping and guides

Snapping is essential to making the product feel fast.

## V1 snap targets

- configurable grid;
- Board edges and center lines;
- object bounding-box edges and centers;
- Band endpoints;
- Band vertices;
- Region vertices;
- intersections;
- common angle increments.

## UX

- snap should be enabled by default;
- modifier key temporarily disables snapping;
- tablet UI needs a visible snap toggle;
- draw subtle guide lines when a snap activates;
- snap tolerance should be screen-space based, not design-unit based, so behavior remains consistent across zoom levels.

No general geometric constraint solver in V1.

---

# 11. Rendering model

## Recommendation: SVG first

Use SVG as the V1 rendering surface.

### Why

The expected workload is moderate, not millions of elements. Even complex cutting-board designs are likely to be hundreds or low thousands of vector elements when motifs remain instanced semantically.

SVG provides natively:

- crisp zoom;
- paths;
- strokes with exact width;
- polygons;
- groups;
- transforms;
- clipping;
- masks;
- pointer events;
- easy SVG export;
- straightforward DOM inspection during development;
- strong browser support;
- direct compatibility with React.

A Band maps naturally to an SVG path with stroke width. A Region maps to a polygon/path. Board clipping maps to `clipPath`.

### Important architecture rule

SVG is a **renderer**, not the source of truth.

The domain JSON owns the design. SVG is derived.

Do not serialize arbitrary DOM/SVG as the project format.

## When to reconsider

Move to Canvas/WebGL only if profiling demonstrates a real performance problem with realistic documents.

Do not preemptively choose a GPU renderer.

---

# 12. Rendering-library research

## 12.1 Paper.js

Sources:
- https://paperjs.org/about/
- https://paperjs.org/reference/path/
- https://paperjs.org/license/

Strengths:

- mature vector scene graph;
- path manipulation;
- hit testing;
- intersections;
- SVG import/export;
- MIT license.

Weakness:

- it creates another object model between our semantic model and the DOM;
- React integration is less natural;
- we do not initially need its full Bezier/vector scripting power.

**Decision:** useful fallback / geometry reference, but not necessary as the core V1 renderer.

## 12.2 Konva

Sources:
- https://konvajs.org/
- https://github.com/konvajs/konva

Strengths:

- MIT;
- strong interaction model;
- scene graph;
- drag/drop;
- transformations;
- React integration;
- canvas performance.

Weakness:

- Canvas rendering is less naturally exportable as semantic/vector SVG;
- another scene graph to synchronize;
- probably unnecessary at V1 scale.

**Decision:** best fallback if hand-built SVG pointer interactions become burdensome. Do not adopt until needed.

## 12.3 Fabric.js

Source:
- https://fabricjs.com/

Strengths:

- mature Canvas object editor;
- selections and transforms;
- serialization;
- SVG/image export;
- MIT.

Weakness:

- strongly centered around generic drawable objects;
- risks pulling the product toward a generic vector-editor model.

**Decision:** not preferred.

## 12.4 PixiJS

Source:
- https://pixijs.com/

Strengths:

- high-performance rendering;
- reusable graphics contexts;
- WebGL.

Weakness:

- optimized for rendering performance far beyond our demonstrated need;
- vector/SVG support has limitations;
- would increase complexity for editing and export.

**Decision:** reject for V1.

## 12.5 tldraw

Sources:
- https://tldraw.dev/docs/shapes
- https://tldraw.dev/docs/tools
- https://tldraw.dev/sdk-features/snapping
- https://tldraw.dev/community/license

Technically attractive:

- custom shapes;
- custom tools;
- hit testing;
- selection;
- snapping;
- persistence;
- mature editor interactions.

However, current licensing requires a production license key (commercial, trial, or discretionary hobby license). The SDK is source-available but not permissively open source for production use.

It also carries a large generic infinite-canvas abstraction that this product does not actually need.

**Decision:** do not use tldraw as the production foundation. It is useful interaction inspiration.

## 12.6 Polygon clipping libraries

`martinez-polygon-clipping` / related packages can perform polygon boolean operations and are MIT-licensed.

However, V1 should avoid introducing polygon booleans unless a concrete feature requires them. Board clipping and many crossing effects can be achieved with SVG clip/mask logic and line intersection math.

**Decision:** keep as a known tool; do not add by default.

---

# 13. Proposed V1 technical stack

The implementation agent should verify repository constraints, but absent conflicting constraints:

- **Vite**
- **React**
- **TypeScript**
- **SVG rendering**
- lightweight CSS solution already preferred by the repo; do not add a design-system framework unless useful
- **Zustand** or an equally small store for project/editor state
- **Vitest** for pure geometry/model tests
- **Playwright** for critical interaction and visual fixture tests

No backend.

No authentication.

No cloud sync.

No database.

No analytics required for V1.

No 3D engine.

No native wrapper.

## Why SPA-first

The product's core value is in a local geometry/document engine. Keeping V1 fully client-side:

- reduces iteration time;
- makes local persistence trivial;
- supports offline workshop use later;
- creates a clean path to PWA or native wrappers;
- avoids premature account/backend architecture.

---

# 14. Proposed application architecture

Keep the architecture boring.

```text
src/
  domain/
    model.ts
    commands.ts
    units.ts
    serialization.ts

  geometry/
    transforms.ts
    bands.ts
    intersections.ts
    repeats.ts
    bounds.ts
    snapping.ts

  editor/
    store.ts
    history.ts
    selection.ts
    tools/
      select.ts
      band.ts
      region.ts
      crossing.ts

  rendering/
    BoardSvg.tsx
    BandSvg.tsx
    RegionSvg.tsx
    MotifSvg.tsx
    RepeatSvg.tsx
    overlays/

  ui/
    Toolbar.tsx
    Inspector.tsx
    MaterialPalette.tsx
    ProjectControls.tsx

  fixtures/
    simple-stripes.json
    basket-weave.json
    interlace-complexity.json
    isometric-blocks.json
```

The exact filenames are not important. The separation is.

## Critical separation

### Domain

What the design **is**.

No React.

### Geometry

What the design **means spatially**.

Pure functions whenever practical.

No UI.

### Editor

User actions, tool modes, selection, history.

### Rendering

Turns semantic objects + derived geometry into SVG.

### UI

Panels and controls.

Avoid putting geometry math inside React components.

---

# 15. Suggested document model

Illustrative, not a frozen API:

```ts
type Project = {
  schemaVersion: 1
  id: string
  name: string
  displayUnits: 'in' | 'mm'
  board: Board
  materials: Material[]
  rootObjectIds: string[]
  objects: Record<string, DesignObject>
  motifs: Record<string, MotifDefinition>
  crossings: Record<string, Crossing>
}

type Board = {
  widthMm: number
  heightMm: number
  backgroundMaterialId?: string
}

type Material = {
  id: string
  name: string
  color: string
}

type Transform = {
  x: number
  y: number
  rotationDeg: number
  mirrorX: boolean
  mirrorY: boolean
  scale: number
}

type Band = {
  type: 'band'
  id: string
  materialId: string
  widthMm: number
  points: Point[]
  transform: Transform
}

type Region = {
  type: 'region'
  id: string
  materialId: string
  points: Point[]
  transform: Transform
}

type MotifInstance = {
  type: 'motif-instance'
  id: string
  motifId: string
  transform: Transform
}

type RepeatField = {
  type: 'repeat'
  id: string
  sourceMotifId: string
  transform: Transform
  rows: number
  columns: number
  stepXmm: number
  stepYmm: number
  rowOffsetMm: number
  columnOffsetMm: number
  alternateRotationDeg?: number
  alternateMirrorX?: boolean
  alternateMirrorY?: boolean
}

type DesignObject = Band | Region | MotifInstance | RepeatField

type MotifDefinition = {
  id: string
  name: string
  objectIds: string[]
  origin: Point
}
```

## Do not over-model

Avoid V1:

- event-sourced domain architecture;
- ECS;
- generalized node graphs;
- expression languages;
- arbitrary constraint systems;
- plugin architectures;
- CRDTs;
- generic "shape schema" abstractions intended for hypothetical future products.

Version the project JSON from day one. That is enough.

---

# 16. Geometry semantics

## 16.1 Coordinate system

- project coordinates in millimeters;
- origin at Board top-left for user-visible coordinates, unless implementation ergonomics strongly favor another origin;
- positive X right;
- positive Y down;
- degrees for UI rotation.

If geometry helpers use radians internally, convert at module boundaries.

## 16.2 Transform order

Define once and test.

Recommended conceptual order for an object:

1. local geometry;
2. mirror;
3. uniform scale;
4. rotate around object/motif origin;
5. translate.

Nested motif transforms compose outward.

Do not let each renderer invent transform semantics independently.

## 16.3 Band rendering

A Band is represented as a centerline path plus width.

Derived SVG:

```html
<path
  d="..."
  stroke="material"
  stroke-width="..."
  stroke-linejoin="miter"
  stroke-linecap="butt"
/>
```

Selection overlay is separate from material rendering.

## 16.4 Intersections

For each candidate Band pair:

1. transform paths into the same coordinate space;
2. test segment intersections;
3. generate stable intersection identities;
4. look up optional Crossing overrides;
5. derive render segmentation or masks.

Only recompute affected intersections when practical, but do not implement an elaborate spatial index until profiling demonstrates need.

## 16.5 Motif expansion

Motif instances should remain instances in the document.

Rendering may recursively resolve them.

Guard against cyclic motif references. Simplest V1 rule:

> A motif may not contain an instance of itself, directly or indirectly.

## 16.6 Repeat expansion

Repeat Field generates virtual motif instances at render/geometry-query time.

Do not materialize hundreds of document objects unless the user explicitly "detaches" the repeat in a future version.

---

# 17. History and editing model

Undo/redo is mandatory.

For V1, document size is expected to be small enough that a simple immutable snapshot history is acceptable.

Recommended behavior:

- one drag = one undo action, not hundreds;
- typing in a numeric input is coalesced into one history operation;
- repeat slider/input changes may debounce/coalesce;
- selection and zoom do not need to pollute design undo history.

Do not implement a complex command/event-sourcing framework merely for undo.

---

# 18. Persistence and export

## V1 persistence

- automatic local save;
- multiple local projects if easy;
- explicit Download Project;
- explicit Open Project.

Project file:
- JSON;
- schema version;
- human-readable enough for debugging.

## V1 export

Strong candidates:

- SVG;
- PNG.

SVG is especially valuable because the design is vector and can be printed or brought into other software.

## Not V1

- cloud accounts;
- collaboration;
- public sharing;
- PDF manufacturing instructions;
- cut lists;
- BOM;
- CNC/DXF;
- native iCloud sync.

---

# 19. V1 scope

## Must have

### Project
- new/open/save local project;
- rectangular Board dimensions;
- inch/mm UI.

### Materials
- built-in starter materials;
- custom material;
- change color/name;
- reassign material.

### Canvas
- pan;
- zoom;
- fit board;
- grid;
- snap;
- board clipping.

### Geometry
- Band;
- Region rectangle;
- Region polygon;
- select/multi-select;
- move;
- rotate;
- mirror;
- duplicate;
- delete;
- numeric inspector.

### Motifs
- create motif;
- edit motif;
- motif instances.

### Repetition
- rows/columns;
- X/Y step;
- row/column offset;
- alternate mirror;
- alternate rotation.

### Crossings
- detect Band/Band intersections;
- toggle local over/under.

### Editor quality
- undo/redo;
- keyboard shortcuts;
- touch-capable primary interactions;
- live dimensions;
- fractional-inch parsing.

### Export
- project JSON;
- SVG;
- PNG if straightforward.

## Explicitly out of scope

- stock inventory;
- board-foot calculations;
- kerf;
- cut lists;
- milling;
- glue-up sequencing;
- construction instructions;
- feasibility validation;
- tool setup;
- CNC;
- joinery;
- furniture;
- 3D CAD;
- photorealism;
- AR;
- user accounts;
- cloud sync;
- collaboration;
- AI pattern generation;
- marketplace/templates;
- plugin system.

---

# 20. Acceptance design corpus

The implementation should be validated against **design families**, not only unit tests.

Do not use copyrighted reference designs as shipped fixtures.

## Fixture A — simple striped board

Tests:

- Board;
- materials;
- Bands;
- exact widths;
- recolor.

## Fixture B — checker / offset grid

Tests:

- motif;
- repeat rows/columns;
- alternating offset;
- material variation.

## Fixture C — basket-weave-like motif

Tests:

- orthogonal Bands;
- motif rotation;
- local crossings;
- repeated motif.

## Fixture D — chevron / nested diamond

Tests:

- ±45° angles;
- parallel Bands;
- mirror;
- nested geometry;
- precise spacing.

## Fixture E — isometric / tumbling-block-like design

Tests:

- 30° / 60° geometry;
- polygon Regions;
- three-material illusion;
- tiling.

## Fixture F — synthetic complex interlace

Create an original fixture with complexity comparable to the supplied Chainmail reference:

- multiple materials;
- nested angular Bands;
- repeated motif;
- alternating over/under crossings;
- mirrored/rotated instances;
- enough intersections to stress editing.

Success criterion:

> The fixture should be buildable in the editor without manually drawing every repeated copy and without flattening semantic objects.

---

# 21. Product UX acceptance criteria

These are intentionally more useful than vague "looks good" requirements.

## Fast start

A new user who understands cutting-board geometry should be able to:

- create a board;
- add three materials;
- draw two Bands;
- change their widths;
- duplicate/mirror;
- save;

without reading a manual.

## Direct edit

Changing a selected Band from `1/4"` to `3/16"` updates the rendered design immediately.

## Recolor

Changing a material globally updates every geometry object using it without editing each object.

## Motif leverage

A user can create one motif, repeat it across the Board, edit the source, and see all instances update.

## Crossing leverage

A user can change an individual Band intersection from A-over-B to B-over-A with one direct action.

## No flattening penalty

Repeated designs remain editable as motifs/repeats rather than becoming hundreds of anonymous shapes.

## Precision

A user can enter fractional inch dimensions and see them preserved/formatted sensibly.

---

# 22. Performance targets

Do not prematurely optimize, but define useful expectations.

Target on a modern desktop/tablet:

- pan/zoom feels continuous;
- ordinary direct manipulation aims for display-frame responsiveness;
- inspector edits visually update in under ~50 ms for normal projects;
- complex fixture stays interactive with at least ~1,000 derived rendered elements;
- project load/save appears instantaneous for normal documents.

If SVG performance becomes an issue:

1. profile;
2. reduce redundant DOM;
3. exploit motif/repeat reuse where possible;
4. only then evaluate Canvas/Konva.

Do not jump directly to WebGL.

---

# 23. Mobile / future native considerations

The first product is a SPA, but avoid painting us into a desktop-only corner.

From day one:

- Pointer Events rather than mouse-only events;
- touch targets large enough for tablet;
- no feature depends only on hover;
- keyboard shortcuts are enhancements, not the only path;
- document/geometry model is UI-framework independent;
- persistence is isolated behind a small interface.

Possible future delivery:

- PWA;
- Capacitor wrapper;
- native shell;
- full native rewrite only if product traction justifies it.

Do not choose a native framework now.

---

# 24. Accessibility and interaction robustness

Even though this is a visual editor:

- buttons and form controls should be real semantic controls;
- inspector fields must be keyboard accessible;
- selected objects need non-color-only indication;
- material names are visible, not only swatches;
- toolbar actions have labels/tooltips;
- provide numeric alternatives to drag operations;
- respect browser zoom.

---

# 25. Risks and mitigations

## Risk 1 — building Illustrator by accident

**Mitigation:** only implement domain primitives and transformations necessary for cutting-board patterns.

## Risk 2 — manufacturing scope creep

**Mitigation:** maintain the V1 non-goals list. Cut lists and build sequences are separate product work.

## Risk 3 — motif model becomes over-general

**Mitigation:** use source definitions + instances + transforms. No expression graph.

## Risk 4 — local crossings become geometrically difficult

**Mitigation:** constrain V1 crossing semantics to Band/Band intersections. Regions do not participate in over/under crossings.

## Risk 5 — SVG performance anxiety causes premature Canvas/WebGL migration

**Mitigation:** establish complex fixtures and profile real documents first.

## Risk 6 — wood textures make the UI noisy and misleading

**Mitigation:** use flat material colors in V1.

## Risk 7 — exact arithmetic overengineering

**Mitigation:** millimeter floats + central parser/formatter + epsilon comparisons.

## Risk 8 — generic editor dependency controls the product architecture

**Mitigation:** own the semantic document model and interactions. Avoid tldraw/Fabric as foundational state models.

## Risk 9 — copyrighted patterns become product content

**Mitigation:** use supplied/reference plans only to understand complexity. Ship original fixtures/templates.

---

# 26. Rejected approaches

## Traditional 3D CAD

Rejected for V1 because the problem is predominantly 2D pattern composition and iteration.

## 3D-first board model

Rejected because 3D adds interaction/rendering complexity without materially improving pattern creation.

## Manufacturing-operation graph

Rejected for V1. Modeling cut → glue → rip → rotate → glue may eventually enable planning and feasibility, but it is explicitly not the current job-to-be-done.

## Strip-list-only model

Rejected because it cannot naturally express arbitrary interlaced/nested spatial patterns.

## Grid-cell-only editor

Rejected as the primary UX because it forces complex designs into a spreadsheet-like tile abstraction. Grids remain useful for repeat behavior.

## Generic vector editor

Rejected because generic path editing provides too much flexibility and too little woodworking meaning.

## Full constraint solver

Rejected as unnecessary CAD complexity.

## WebGL/PixiJS first

Rejected as premature optimization.

## tldraw foundation

Rejected primarily due to current production licensing and secondarily because its general infinite-canvas model is larger than needed.

---

# 27. Decision register

These decisions should be treated as settled unless implementation evidence contradicts them.

| ID | Decision |
|---|---|
| D001 | V1 is a **design tool**, not a manufacturing planner. |
| D002 | V1 is primarily **2D**. |
| D003 | Users edit the **finished visual pattern directly**. |
| D004 | The Board is a rectangular viewport/clip through the design. |
| D005 | Saved data is **semantic domain JSON**, never flattened SVG. |
| D006 | Core primitives are Material, Band, Region, Motif, Motif Instance, Repeat Field, Crossing. |
| D007 | Band = centerline/polyline + constant width + material. |
| D008 | Reuse uses definition/instance semantics. |
| D009 | Repeat remains semantic and editable. |
| D010 | Local Band/Band over-under crossings are first-class. |
| D011 | No general geometric constraint solver in V1. |
| D012 | Inches and millimeters are user-facing; internal canonical geometry uses millimeters. |
| D013 | Ordinary JS floating point is sufficient for V1 precision. |
| D014 | SVG is the initial renderer. |
| D015 | React + TypeScript + Vite is the recommended SPA foundation. |
| D016 | No backend/account/cloud architecture in V1. |
| D017 | Desktop and tablet are first-class; phone editing is not. |
| D018 | Flat material colors first; photorealistic wood is deferred. |
| D019 | Project JSON is versioned from the first release. |
| D020 | Complex original fixtures, not copyrighted plans, prove expressiveness. |

---

# 28. Implementation sequencing recommendation

The planning agent should create its own detailed plan, but research suggests this order minimizes risk.

## Phase 0 — geometry spike

Before polishing UI, prove:

- Board SVG clip;
- Band rendering;
- selection;
- move/rotate;
- width changes;
- two-band intersection detection;
- local crossing render;
- motif transform;
- repeat expansion.

This should be a disposable-ish vertical slice, not a separate architecture.

## Phase 1 — editor foundation

- project model;
- store;
- history;
- Board;
- pan/zoom;
- Select;
- Band;
- Region;
- inspector;
- units.

## Phase 2 — domain leverage

- Materials;
- Motifs;
- Instances;
- Repeat Field;
- mirror/rotate/duplicate;
- snapping.

## Phase 3 — weaving / complexity

- intersection discovery;
- Crossing toggle;
- complex fixtures;
- performance refinement.

## Phase 4 — persistence/export

- local autosave;
- import/export JSON;
- SVG;
- optional PNG;
- schema migration harness.

## Phase 5 — tablet polish

- Pointer Events;
- touch sizing;
- context UI;
- gesture/pan behavior;
- final usability pass.

---

# 29. Test strategy

Tests should protect math and workflows, not generate coverage theater.

## High-value pure tests

- unit parser (`3/16`, `1 1/8`, mm);
- transforms;
- motif transform composition;
- repeat placement;
- bounds;
- line-segment intersection;
- stable crossing identity;
- mirror/rotation behavior;
- JSON migrations.

## High-value browser tests

- create/edit/delete Band;
- change material;
- undo/redo;
- create motif and repeat;
- edit motif and verify instances update;
- toggle crossing;
- import/export round trip.

## Visual regression

Use the acceptance fixture corpus.

A small number of golden screenshots/SVG snapshots is more useful than dozens of brittle component snapshots.

---

# 30. Research-backed product opportunity

The current landscape demonstrates several things:

1. Woodworkers already use dedicated cutting-board software.
2. Many tools focus heavily on cut lists, costs, kerf, manufacturing stages, and strip sequencing.
3. Community-built tools continue appearing, indicating the problem is not fully solved.
4. A 2026 community project was explicitly created because existing tools could not express the desired pattern.
5. Adjacent craft software has proven that reusable motifs, live recoloring, symmetry, and repeat operations are highly effective interfaces for complex visual construction.

The differentiated thesis is therefore:

> **The fastest cutting-board design tool should act less like a calculator and less like CAD, and more like a domain-specific pattern editor.**

---

# 31. Questions intentionally deferred

These do not block V1 specification.

- Should a later release infer a manufacturing plan from the finished design?
- Should wood grain direction be represented?
- Should source-stock constraints detect impossible designs?
- Should a pattern marketplace exist?
- Should AI propose pattern variants?
- Should users share browser links?
- Should 3D preview exist?
- Should DXF/CNC export exist?
- Should custom Board outlines exist?
- Should there be a full wallpaper-group symmetry engine?

None should influence the V1 architecture beyond preserving a clean semantic document model.

---

# 32. Handoff definition of done

The research phase is complete when the next agent can begin with:

1. product intent already decided;
2. scope and non-goals already decided;
3. core domain language already decided;
4. interaction model substantially decided;
5. geometry semantics substantially decided;
6. technical direction narrowed;
7. competitor landscape understood;
8. acceptance fixture families defined;
9. major risks/rejected approaches documented.

The next agent's job is **not to redo product discovery**.

Its job is:

> inspect the actual repository/environment → turn this dossier into an implementation specification → produce a phased implementation plan → build the smallest right V1.

---

# 33. Source index

## Supplied reference
- *The Chainmail Weave*, Ryan Feldthouse and Chantal Schoenherz, 2021. User-supplied PDF. Used only as a domain/complexity reference.

## Cutting-board tools
- Cutting Board Designer: https://cuttingboarddesigner.app/
- App Store listing: https://apps.apple.com/us/app/cutting-board-designer-3d/id6763621639
- CBDJS: https://ericu.github.io/CBDJS/cb.html
- MvRens/CuttingBoard: https://github.com/MvRens/CuttingBoard
- Endgrain Designer: https://endgraindesigner.com/
- CuttingBoardDesigner.com: https://www.cuttingboarddesigner.com/
- Sawdust Math: https://sawdustmath.com/design/cutting-board/
- Endgrain Studio: https://end-grain-studio.com/
- CBdesigner: https://cbdesigner.org/

## Community research
- 2026 pattern-maker discussion:
  https://www.reddit.com/r/Cuttingboards/comments/1qwmj1k/im_making_a_website_for_designing_cutting_board/
- Follow-up:
  https://www.reddit.com/r/Cuttingboards/comments/1r3uh2w/my_cutting_board_pattern_maker_is_now_live/

## Adjacent design tools
- Electric Quilt: https://electricquilt.com/
- EQ8 rotate/flip/symmetry:
  https://support.electricquilt.com/articles/using-the-rotate-flip-and-symmetry-tools-in-eq8/
- EQ8 block vs motif:
  https://support.electricquilt.com/articles/understanding-block-vs-motif/
- LoomSketch: https://loomsketch.com/
- Tiler: https://boxlab.io/tools/tiler/en

## Rendering / editor technology
- Paper.js: https://paperjs.org/
- Paper.js Path API: https://paperjs.org/reference/path/
- Paper.js license: https://paperjs.org/license/
- Konva: https://konvajs.org/
- Konva GitHub: https://github.com/konvajs/konva
- Fabric.js: https://fabricjs.com/
- PixiJS: https://pixijs.com/
- tldraw shapes: https://tldraw.dev/docs/shapes
- tldraw tools: https://tldraw.dev/docs/tools
- tldraw snapping: https://tldraw.dev/sdk-features/snapping
- tldraw license: https://tldraw.dev/community/license
- Martinez polygon clipping: https://github.com/w8r/martinez

---

# 34. Final product statement

> **A browser-based cutting-board pattern designer that lets woodworkers create dimensionally accurate geometric patterns using materials, bands, regions, reusable motifs, symmetry, repetition, and local over/under crossings. It is optimized for rapid visual exploration of the finished design—not for modeling the sequence of shop operations used to manufacture it.**

The success test is simple:

> **Can an experienced woodworker get a complicated idea out of their head, explore several variants, and arrive at a design they want to build faster than they could with graph paper or general-purpose CAD?**

If yes, the product is doing its job.

---

# Part II — Dependency-First Technology Decisions and Risk Retirement

## 1. Executive decision

Build the first usable product as a client-only React/TypeScript/Vite SPA with a semantic millimeter-based document and an SVG editor. **Offload ordinary editor mechanics to focused, permissively licensed dependencies:** selection and transform controls, gesture handling, undo/redo, 2D geometry, fractional numbers, accessible controls, and optional local project storage. Own only cutting-board-specific behavior: Bands/Regions, materials, motif/repeat semantics, crossing identity/scope, physical width policy, and document/export contracts.

The most important research correction is **not a package choice**. A crossing in a repeated motif cannot be addressed by `bandAId + bandBId + intersectionKey`. The design must distinguish source objects from their visible occurrences, decide whether an edit affects the motif definition or one occurrence, and define what happens when geometry changes. An SVG mask is a plausible renderer, but a working proof is required before that architecture is treated as settled.

### Recommended dependency-first stack

| Role | Starting choice | Why / boundary |
| --- | --- | --- |
| UI | `react`, `react-dom` | Components and SVG DOM, not domain ownership. |
| Build/language | `typescript`, `vite`, `@vitejs/plugin-react`, React type packages | Use a coherent scaffold and lockfile; check installed Node and template engine requirements. |
| Editor state/history | `zustand` + `zundo` | Selective subscriptions and bounded undo/redo of committed Project changes. Do not track camera, selection, or every drag frame. |
| SVG interaction | `react-moveable` + `react-selecto` | Transform handles, drag/rotate/group guides and mouse/touch marquee selection. **Provisional until the focused integration proof passes.** |
| Gestures | `@use-gesture/react` | Tool-specific drag/pinch/wheel event state. Choose it for canvas gestures; do not also install a pan/zoom controller by default. |
| 2D geometry | `@flatten-js/core` | Segment intersections, affine transforms, bounds/relations, polygon operations, and optional spatial queries through one MIT package. Keep domain schema independent of its classes. |
| Fraction parsing | `fraction.js` | Mixed-number parsing and rational formatting; own unit suffixes and woodworking display policy. |
| Import validation | `zod` | Validate JSON at trust boundary, then check cross-reference and cycle invariants in domain code. TypeScript alone cannot validate imported data. |
| Accessible composites | Selected Radix Primitives | Use for dialog/menu/popover/tooltip where needed; native controls elsewhere. |
| Pure tests | `vitest` | Units, transforms, hierarchy, repeat expansion, intersections, crossings, migrations. |
| Browser tests | `@playwright/test` | Actual pointer/touch workflows, import/export, and a few visual fixtures. |

This is a **recommended set of evaluated choices**, not a requirement to install every package on day one. Add each in the first slice that uses it. The focused proof decides whether Moveable/Selecto save work in the real SVG coordinate system. Let the selected Vite template pin compatible versions, commit the lockfile, and check installed licenses and `engines`. Current Vite documentation requires Node 20.19+ or 22.12+, with some templates needing higher versions. [Vite guide](https://vite.dev/guide/) · [React SPA guidance](https://react.dev/learn/build-a-react-app-from-scratch).

## 2. What is settled, what must be proven

| Area | Status | Required next action |
| --- | --- | --- |
| Design-first 2D product, Board/Material/Band/Region/Motif/Repeat vocabulary | Product decision | Preserve from dossier. |
| Physical units in mm, fractional-inch input | Product decision | Central parser/formatter and numeric policy in spec. |
| Semantic JSON; SVG as derived renderer | Architectural decision | Keep React/SVG out of the domain model. |
| React/TS/Vite and SVG | Strong default | Verify repository/runtime; prove realistic fixture performance. |
| Motif definition and instance ownership | Underspecified | Specify single parent, ordered children, pivots, edit context, cycle checks. |
| Crossing identity, scope, and topology changes | **Unproven blocker** | Design and test occurrence addressing before broad editor work. |
| SVG local over/under effect | **Unproven blocker** | Demonstrate two independently reversed crossings, masks, transforms, and standalone export. |
| Isometric and complex fixture authorability | Product/UX hypothesis | Recreate through UI from blank project; JSON fixture alone is insufficient. |
| Local autosave | Convenience feature | Specify failure state, recovery, explicit project download. |

## 3. Dependency research and decisions

### 3.1 Rendering and interaction

**Use React-rendered SVG with focused interaction dependencies.** `react-moveable` (MIT) supports SVG targets, drag/rotate/scale/group handles, and guide snapping; `react-selecto` (MIT) supports click and marquee selection with mouse/touch. Their event deltas must be translated into semantic edit commands rather than persisting DOM transforms. Moveable's handbook explicitly says SVG **resize is unsupported**; scale is available, so Band width/vertices still need domain-aware inspector/handles. Selecto's default rectangle selection may be inaccurate on rotated targets; configure its documented element-geometry callback. Both need proof with nested motifs, board clipping, and zoom before becoming irrevocable foundations. [Moveable handbook](https://github.com/daybrush/moveable/blob/master/handbook/handbook.md) · [React Moveable](https://github.com/daybrush/moveable/blob/master/packages/react-moveable/README.md) · [Selecto](https://github.com/daybrush/selecto/blob/master/README.md).

Use `@use-gesture/react` (MIT) for canvas-specific drag, pinch, and wheel state. It offers enabled/target options, but the app still arbitrates tool drawing versus camera pan versus selected-object manipulation. Maintain one camera transform; map screen pixels to mm and avoid conflating Moveable guide snaps with semantic endpoint/edge/angle snaps. Convert client coordinates using the SVG screen matrix inverse; use a wider transparent Band hit path and separate crossing hit target. Handle cancellation and scoped `touch-action`, and provide visible Finish/Cancel for touch polyline creation. This belongs in the **first editor slice**, correcting the dossier's Phase 5 sequencing. [gesture options](https://use-gesture.netlify.app/docs/options/) · [SVG getScreenCTM](https://developer.mozilla.org/en-US/docs/Web/API/SVGGraphicsElement/getScreenCTM) · [touch-action](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/touch-action).

**Choose one camera gesture owner.** `@panzoom/panzoom` (MIT) directly pans/zooms SVG and supports pinch and target exclusions, but owns CSS transform and pointer event handling; `d3-zoom` (ISC) has configurable filters but also takes gesture ownership. Compare either with `@use-gesture/react` only if the initial tool arbitration is unwieldy. Never install all three and let each update the camera. [Panzoom README/options](https://github.com/timmywil/panzoom) · [d3-zoom](https://d3js.org/d3-zoom).

**Full editor alternative:** tldraw has custom shapes/records, snapping, history, clipping, persistence, and SVG export. It may save more editor code than the focused stack, but production requires a trial, commercial, or discretionary noncommercial hobby license key; pricing is negotiated and hobby output carries a watermark. If commercial licensing is acceptable, evaluate it as a serious paid option rather than dismissing it as technically unsuitable. Its shape/store model still needs adaptation for live motif/repeat occurrences and crossing overrides. The open-source preference makes SVG + focused libraries the default. [tldraw SDK features/license](https://tldraw.dev/community/license).

**Other foundations:** Fabric.js (MIT) provides canvas transforms/selection/SVG export but introduces an imperative scene synchronized with semantic JSON; it is the strongest fallback if the Moveable integration fails. Paper.js (MIT) offers vector intersections, hit testing and SVG export but does not supply a complete editor or established stroke-to-outline API. Konva (MIT) provides a canvas scene/Transformer but would need a separate SVG exporter and domain snapping; Excalidraw (MIT) provides a complete sketch-oriented vocabulary that is hard to fit to Bands/Repeats; SVG.js drag/select plugins own the DOM imperatively and its current v3 catalog does not include the old select/resize combination. None is the default. [Fabric](https://fabricjs.com/docs/) · [Paper.js](https://paperjs.org/features/) · [Konva](https://konvajs.org/docs/) · [Excalidraw](https://github.com/excalidraw/excalidraw) · [SVG.js plugins](https://svgjs.dev/docs/3.2/plugins/).

### 3.2 Geometry and hierarchy

Use **`@flatten-js/core` as the geometry kernel** (MIT). It provides segment intersections, affine matrices, distance/relations, polygon operations, and `PlanarSet` spatial queries. Convert from the semantic Project into transient library shapes at geometry boundaries, then convert results back. The document must not persist Flatten objects. This replaces proposed handwritten line intersection/affine/spatial-index machinery and makes `robust-predicates` and RBush unnecessary at install time. Define separate tolerances for geometry eligibility, screen-space snapping, and crossing rematching. The library does not know motif ancestry, crossing scope, or woodworking units. [FlattenJS README/API](https://github.com/alexbol99/flatten-js).

**Conditional exact Band footprints:** `clipper2-ts` (Boost-1.0) exposes open-path offsets with miter joins and butt ends plus polygon intersection/difference. This could derive stroke footprints and acute-angle overlap regions instead of hand-writing offsets. It is a younger port; perform one narrow calibration of 1/8-inch widths, caps, acute angles, self-turns, and float/integer scaling **only if** SVG local masks cannot meet the crossing gates cleanly. Do not introduce it simply because its API exists. [Clipper2 documentation](https://angusj.com/clipper2/Docs/Overview.htm) · [clipper2-ts repository](https://github.com/countertype/clipper2-ts).

**Defer overlapping geometry packages:** `polygon-clipping` handles booleans but not offsetting, `robust-predicates` handles orientation but not intersections, and RBush only indexes boxes already handled by Flatten's PlanarSet. Add one only if a demonstrated defect/performance case remains. [polygon-clipping](https://github.com/mfogel/polygon-clipping) · [robust-predicates](https://github.com/mourner/robust-predicates) · [RBush](https://github.com/mourner/rbush).

No Bezier/path engine in V1: Bands are straight segments or polylines, Regions are polygons. A genuinely requested curved path, arbitrary union/difference, or CNC export would require a new geometry decision and its own tests.

### 3.3 State, history, validation

Keep three distinct concerns: (1) serializable Project, (2) ephemeral selection/tool/camera/gesture state, and (3) bounded undo/redo. `zundo` is a tiny MIT middleware for Zustand with `temporal`, `partialize`, `limit`, and pause/resume; use it to track only committed Project state. Keep high-frequency drag previews outside the committed Project, then make a single commit on gesture completion. Verify cancel/undo/redo and imported-project reset semantics. `zustand` persistence is not a substitute for the deliberately versioned Project file. [Zustand](https://zustand.docs.pmnd.rs/) · [zundo API](https://github.com/charkour/zundo).

Use `zod.safeParse` for external JSON shape, finite values, bounds, and discriminated types; enforce unique IDs, referential integrity, motif acyclicity, repeat limits, ownership, and crossing references in a second domain validation pass. Import to a temporary parsed Project; replace the current Project only after validation/migration succeeds. Do not silently repair ambiguous object references. [Zod basic usage](https://zod.dev/basics).

**Defer `immer` and state machines.** Add Immer only if nested immutable edits are actually cumbersome; keep history transaction boundaries explicit even when zundo manages stacks. [Zustand Immer middleware](https://zustand.docs.pmnd.rs/reference/middlewares/immer).

### 3.4 Units and inputs

Use `fraction.js` (MIT) for rational parsing and mixed-fraction formatting, then a thin app wrapper for `0.25`, `1/4`, `3/16`, `1 1/8`, `1.125 in`, `25.4 mm`, and quote suffixes. Define the default unit, whitespace/sign policy, field-specific positive/zero rules, allowed denominators, rounding and error presentation. Convert to canonical mm numbers; don't persist a Fraction object or round geometry every edit. Its generic rational formatting does **not** automatically match preferred woodworking denominators, so verify `3/16`, `1 1/8`, and a non-power-of-two input against intended display. `type=text` with suitable `inputMode` is needed for mixed fractions. [Fraction.js](https://github.com/rawify/Fraction.js) · [HTML number input](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/input/number).

No broad unit-conversion, arbitrary-precision, or math-expression engine. The fraction library handles fraction arithmetic; the app owns inch/mm semantics.

### 3.5 Persistence, files, and export

For one bounded text-only active project, debounced `localStorage` is adequate **if** write/quota errors produce visible unsaved state and explicit Download/Open Project exists. If V1 includes a local project gallery or larger projects, use `idb` (ISC) to offload IndexedDB transaction/promise boilerplate behind the repository interface. Decide that scope in the SPEC rather than building a custom IndexedDB layer. Browser storage can be cleared or evicted and is not a backup. [Web Storage](https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API) · [quotas/eviction](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria) · [idb](https://github.com/jakearchibald/idb).

Use a file input/`File.text()` for JSON import and Blob/object URL/anchor download for JSON and SVG. Do not make `showOpenFilePicker` or `showSaveFilePicker` a required path: compatibility varies. Generate a **clean standalone SVG from the semantic Project**, not a serialization of the live editor SVG: `width`/`height` in mm, matching mm `viewBox`, Board-only content, embedded definitions and material colors, no selection handles/grid/CSS dependencies, unique definition IDs, and no external assets. JSON remains the editable format; SVG is a visual export. Optional PNG may use SVG image to canvas `toBlob` after the SVG export is proved. [SVG root](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Element/svg) · [Blob URLs](https://developer.mozilla.org/en-US/docs/Web/API/URL/createObjectURL_static) · [canvas toBlob](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob).

### 3.6 Testing and UI components

Vitest protects pure logic; Playwright exercises real browser pointer input, touch emulation, import/export, and selected visual examples. Test an exported SVG in a fresh document/image context, not only a snapshot of the editor DOM. Do not build mock-heavy component suites. [Vitest guide](https://vitest.dev/guide/) · [Playwright assertions/screenshots](https://playwright.dev/docs/test-assertions).

Use native buttons and text inputs plus **selected Radix Primitives** (MIT) for dialogs, popovers, menus, tooltips, and sliders as those controls appear. This saves keyboard/focus/overlay behavior without dictating product styling. `tinykeys` is optional for shortcut dispatch if scattered key handling appears; guard text inputs and composition. Defer a generic design system, icon suite, color-picker, and file drag/drop dependency until a concrete UI need. [Radix accessibility](https://www.radix-ui.com/primitives/docs/overview/accessibility) · [tinykeys](https://github.com/jamiebuilds/tinykeys).

### 3.7 Head-to-head implementation options

| Approach | Editor work it provides | What still belongs to this app | Cost / decision |
| --- | --- | --- | --- |
| **React SVG + Moveable + Selecto + gesture hook** | Selection rectangle, transform handles, drag/rotate/group, guides, pointer gesture state | Semantic tools, motif/repeat source and occurrences, crossing scope/compositing, exact mm and domain snapping | **Default open-source route.** Four focused pieces must cooperate under SVG zoom/clipping; prove that integration first. |
| **tldraw SDK** | Full editor state, tools, input, camera, selection, snapping, history, clipping, SVG export | Custom shapes/records, live repeats, local crossings, woodworking inspector/export semantics | Technically serious option if a commercial license is acceptable; license and shape-model adaptation are the deciding costs. |
| **Fabric.js** | Canvas selection, controls, transforms, pan/zoom, generic serialization and SVG export | Semantic source of truth, repeat expansion, crossings, export parity and DOM scene synchronization | Fallback if SVG interaction stack fails; test before adopting. |
| **Paper.js scene** | Vector hit/intersection/boolean/SVG functions | Almost all editor UI, semantic model, repeat/crossing relationship | Adds a scene graph without solving editor mechanics; Flatten better as a geometry-only dependency. |
| **Konva/react-konva** | Canvas events, transforms, performant drawing | Semantic model, domain snaps, SVG vector export and crossings | Poorer fit when physical SVG export is required. |
| **SVG.js with plugins** | Imperative SVG manipulation, some drag/pan | React/DOM ownership integration, semantic editor and current selection controls | Do not combine with React ownership without a compelling proof. |

**What dependencies cannot offload:** No reviewed package understands a Band's physical width, one motif definition repeated into addressable occurrences, a crossing overridden in one cell, or the rule for rematching after geometry topology changes. These are the application's small but essential domain core. A large editor SDK can reduce generic plumbing, but does not remove those semantics.

### 3.8 Package admission and one-day comparison

The orchestration agent should **not** repeat this broad package survey. At its first technical slice, run only these two focused, time-boxed comparisons:

1. **Interaction fit:** React SVG + Moveable/Selecto + gesture hook against a Board clip with one Band, one polygon, one rotated motif instance, and one repeated cell. Prove select, drag/rotate, semantic transform commits, zoom coordinate mapping, touch marquee, and no transform drift after rerender/undo. Disable unsupported resize; use inspector width for Band. If this fails due to library coordinate/event semantics, compare Fabric.js and, only if licensing is in scope, tldraw. Record the exact failure rather than building replacement interaction machinery by reflex.
2. **Crossing geometry:** use Flatten segments to discover/classify a proper centerline crossing; create a localized SVG mask using the over Band's actual stroke width and compare render/export at acute angles and unequal widths. If the mask cannot isolate an overlap without harming nearby crossings, try Clipper2 open-path offset and polygon intersection. Preserve unresolved/unsupported classifications instead of expanding to a general CAD engine.

Everything else above has an established API fit from current documentation and needs ordinary integration tests, not broad research or a package tournament.

## 4. Correct the semantic model before specification

The following is a **contract to specify and prove**, not a frozen TypeScript schema.

### 4.1 Ownership and order

- Every source design object has exactly one ordered parent: Project root or one Motif definition. A single global object map may store records, but root/definition ordered child lists define ownership and paint order. Do not let an ID appear in two parents.
- A Motif definition owns source geometry and may contain nested Motif instances subject to an acyclic reference graph. A repeat references exactly one Motif source; it generates virtual instances, not persisted copies.
- Define origin/pivot once, and apply local mirror → uniform scale → rotation → translation, composing parent transforms outward. World Band width scales with the magnitude of uniform scale. SVG `vector-effect: non-scaling-stroke` would violate that physical meaning. [SVG vector-effect](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Attribute/vector-effect).
- Define root and motif-local stacking of Regions and Bands. A Region's draw order affects ordinary visual overlap. Crossing overrides only control an eligible Band/Band pair locally; they do not reorder neighboring Regions or unrelated Bands.
- Editing the definition changes its instances; editing an instance's transform does not mutate its definition. The UI always shows the edit context. Define delete/detach behavior for definitions in use before implementation.

### 4.2 Occurrence addressing and crossing scope

Expansion should derive a visible Band occurrence containing a source Band ID, an ancestry address (root, nested motif instance IDs, repeat field ID and row/column indices), composed transform, world polyline, and world width. A pair of visible occurrences is sorted canonically so input selection order cannot change its identity.

For each polyline segment, consider stable segment or vertex IDs in source data instead of using array position alone. An eligible crossing record then refers to the occurrence pair, source segment identities, and optional parametric position/location hints. The exact encoding belongs in the spec. Keep motif-local default crossings distinct from one-occurrence overrides; define precedence. The UI must say whether Toggle applies to **all instances through the definition** or **this occurrence only**. A 3×3 repeat with one cell edited differently is a required demonstration if occurrence overrides are in V1.

When a vertex is inserted or moved, rematch an override only if one eligible intersection unambiguously matches its source segment lineage and proximity. If not, mark it unresolved and offer remove/reassign; never silently attach it to a different intersection. Undo/redo and import/export must preserve this status. One legitimate simpler V1 choice is to constrain topology edits after a crossing, but this must be visible, specified, and compatible with the requested workflow.

### 4.3 Crossing classification and compositing

The dossier's phrase “two intersecting Bands” is broader than a simple centerline test. Finite-width strokes may overlap without crossing centerlines. V1 should initially promise **isolated transverse interior centerline intersections between two distinct straight polyline segments**. Explicitly classify shared endpoints, collinear/parallel overlaps, near-tangent angles, self-intersection, triple intersections, and overlapping crossing footprints as unsupported or requiring a defined separate behavior. Render a visible unsupported state rather than pretending a toggle succeeded.

Candidate renderer: transform both Bands to Board coordinates; derive the local overlap footprint from their **actual widths**, angle, and an optional visual clearance; remove the under Band's paint within a localized mask while keeping the over Band intact. The neighborhood must be small enough not to erase another crossing, and it must survive nested transforms, clipping, and export. A simple circular patch or drawing the chosen over Band last is not a general solution. SVG masks/clip paths are capable primitives, not proof that this algorithm works. Use explicit `userSpaceOnUse` coordinates and stable unique IDs; keep crossing hit geometry separate from painted masks. [SVG mask](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Element/mask) · [SVG clipPath](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Element/clipPath).

### 4.4 Polygon authoring and the “design, not fabrication” boundary

The Region polygon can represent a rhombus or tumbling-block face, but the current UX may not let a user construct exact shared seams quickly. Test from a blank project: polygon vertex editing, vertex/edge snapping, duplicate, rotate 60°/120°, and alignment may be the smallest missing operations. Add only those proven necessary by fixture authoring. A rendered JSON fixture proves expressiveness of the model; an authored UI fixture proves the product workflow.

The model produces a **dimensionally meaningful visual composition**, not a planar manufacturing partition. Overlapping Regions/Bands, gaps, and material layers can be intentional. Neither the editor nor SVG export implies a feasible glue-up, cut list, or source stock.

## 5. Risk-retirement gates for the orchestration agent

Perform these as tests of the real architecture, not a throwaway parallel prototype. Record actual outcome, screenshot/export, and any change to the model before planning the rest of V1.

1. **Crossing identity:** two polylines intersect twice; set opposite over/under at the two points. Move an endpoint, change a width, insert a vertex, undo/redo. Each override stays on the intended crossing or becomes visibly unresolved.
2. **Occurrence scope:** repeat a motif 3×3; set a motif-wide crossing default and a different override in one cell. Other cells remain unchanged. Reopen JSON and verify identity/scope. Include a nested instance if V1 promises nesting.
3. **Transform parity:** rotate, mirror, and uniformly scale a motif. Painted width, detected intersection, hit target, snap result, and inspector mm value agree under the composed transform. Moveable deltas cannot become persistent CSS transforms independent of the Project.
4. **Geometry edge classes:** test acute unequal-width crossings, shared endpoint, collinear, near-parallel, self-intersecting, triple, and adjacent-crossing cases. Each is supported with an explicit algorithm or flagged with an intelligible limitation; no silent corruption.
5. **Export parity:** standalone SVG opened separately matches Board-clipped in-editor artwork, including masks, transform nesting, material colors, and physical dimensions; no editor chrome or unresolved external references.
6. **Authorability:** create one original basket weave, one isometric face cluster, and one synthetic complex interlace from a blank UI without hand-writing fixture JSON; modify a source motif and one dimension, observe instance update and preserved intended seams. Record time, action count, friction, and missing tool operations.
7. **Tablet:** test touch create/select/drag, two-finger pan/zoom, finish/cancel, `pointercancel`, and no page-scroll conflict on a representative tablet browser or faithful touch emulation. Verify Selecto/Moveable/gesture hook do not each claim the same interaction.
8. **Persistence:** malformed import leaves current Project intact; quota/write failure shows unsaved status; valid project JSON round-trips; repeat count or cyclic motif attack fails safely.
9. **Performance:** use the synthetic complex fixture and at least ~1,000 derived visible elements as a measurement case. Profile frame time and interaction latency on target desktop/tablet before replacing SVG. Flatten's PlanarSet can index candidates if needed; the dossier's 50 ms target is a target, not evidence already achieved.

If a gate fails, adjust the smallest relevant model/interaction piece and rerun the gate. Do not conceal a failed gate with hand-crafted fixture JSON or an export of the live editor DOM.

## 6. Sequencing and orchestration advice

1. Inspect repo, package manager, Node version, app constraints, and any `AGENTS.md`. The supplied files are research; no code repository was supplied with this packet.
2. Write a concise **SPEC** with ownership/order, transform/width policy, crossing eligibility/address/scope/rematching, edit contexts, units/parser, gestures, import validation, persistence/error UX, SVG export, and acceptance criteria.
3. Write an **IMPLEMENTATION PLAN** as small vertical slices, beginning with the two focused package integration comparisons in §3.8, followed by the integrated model/render/crossing/repeat/export proof and actual touch input. Set explicit pass/fail gates above.
4. Have independent review of the spec and proof results, especially computational geometry and UX authorability. Resolve contradictions before expanding features.
5. Implement only the product already scoped in the dossier. Prefer package APIs for routine mechanics while retaining a small semantic core. Pin the lockfile and rerun license/security checks against the actual installed graph before release.

**At relevant slices:** React/React DOM, TypeScript/Vite/React plugin, Zustand+zundo, Zod, `@flatten-js/core`, `fraction.js`, provisional Moveable+Selecto, `@use-gesture/react`, selected Radix controls, Vitest, Playwright. **Conditional:** Clipper2 (exact crossing footprint after mask failure), `idb` (multi-project/size), Immer (nested editing complexity), another camera library (gesture conflict), Fabric.js (SVG interaction failure), tldraw (commercial license and superior fit). **Excluded without a new product requirement:** manufacturing planning libraries and full CAD engines.

## 7. Source and review notes

Primary project/browser references are linked at each decision. Package status and license must be verified from the **actual installed version**, because upstream releases and terms can change. Examples currently documented: [React MIT metadata](https://github.com/facebook/react/blob/main/packages/react/package.json), [Vite MIT license](https://github.com/vitejs/vite/blob/main/LICENSE), [TypeScript Apache-2.0 metadata](https://github.com/microsoft/TypeScript/blob/main/package.json), [Zustand repository](https://github.com/pmndrs/zustand), [Zod package metadata](https://github.com/colinhacks/zod/blob/main/packages/zod/package.json), [Playwright Apache-2.0](https://github.com/microsoft/playwright/blob/main/LICENSE). Treat a generated third-party notice and dependency audit as release work, not a reason to overbuild V1.

Three independent technical reviews challenged the original packet's geometry, editor/browser stack, and product/model assumptions. A further three independent package reviews examined editor foundations, geometry, and utilities. They found the prior packet **overcommitted to custom code**. The revised default now assigns routine mechanics to focused packages and retains crossing/motif semantics in the app. The two remaining integration choices are explicit proofs, not missing broad research. Package fit here is based on primary documentation; no prototype or real-product performance benchmark has been run yet.
