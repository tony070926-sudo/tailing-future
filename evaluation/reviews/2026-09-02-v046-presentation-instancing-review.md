# v0.4.6 presentation and Three instancing — independent review

Date: 2026-09-02
Disposition: **CONDITIONAL ACCEPT — local presentation/scene-object foundation only**
Promotion: **not requested; R2 remains the conditional champion at 41/100**

## Scope and independence

This review covers the F64LE-to-F32LE presentation contract, the locked
2,685-site instancing data core, the Three.js `InstancedMesh` bridge and their
claim boundaries. Implementation and read-only evaluation were assigned to
separate agents; the evaluator did not approve its own implementation. A
separate read-only SOTA scout compared the slice with first-party AIDO Cell and
Three.js material.

## Review rounds

1. **Initial data-core review — NOT READY.** The first plan accepted
   caller-composed atoms and bonds while recording an unrelated topology
   digest. Runtime input also accepted caller-authored Float64 coordinates
   while trusting a frame-digest string. A valid-looking topology or coordinate
   array could therefore borrow another frame's lineage.
2. **Lineage repair — closed.** The plan now requires a validated V045 session,
   derives the locked 895-water O-H-H order and 1,790 O-H adjacencies
   internally, and binds session, trajectory, atom order, cell, topology and
   all 101 position-channel source digests. Runtime updates only accept a V046
   presentation handle, defensively copy intrinsic fixed ArrayBuffer bytes,
   recompute their F32 digest and reject shared, resizable, subclassed,
   cross-session or altered payloads.
3. **Three scene-object review — conditionally accepted.** The bridge creates
   exactly three persistent instanced meshes, shares atom geometry, updates
   matrix buffers in place, marks the attributes dirty, recomputes bounds,
   resolves real Raycaster hits and disposes resources once. Tests cover the
   complete 895-oxygen and 1,790-hydrogen instance map. Its receipt correctly
   says that no WebGL/WebGPU draw, measured draw calls or FPS occurred.
4. **Release-claim review — hard boundary retained.** The private V045 loader
   still returns `publicPayload:null` and does not provide the raw artifact
   bytes needed to create a presentation handle. Production `app/` code does
   not import the V046 modules. The tests therefore use synthetic,
   digest-consistent fixtures. This is not evidence that a protected OpenMM
   trajectory was rendered in a browser or deployed.

## Reproduced local checks

- presentation-frame conversion and rejection tests: `10/10`;
- instancing plan/runtime tests: `9/9`;
- Three persistent-mesh, upload, bounds, raycast, full-map and disposal tests:
  `5/5`;
- combined presentation/core/Three focused suite: `24/24`;
- server-only loader boundary: `4/4`;
- TypeScript, focused ESLint and `git diff --check`: pass.

These are local source and fixture results. They are not protected-main CI,
release-provenance, browser-GPU or canonical-site results.

## Scientific and visual boundaries

The only rendered physical channel is the digest-bound F32 presentation
derivative of source positions. Structural cylinders mean topology adjacency
and rigid-distance constraint, not energetic bond or bond order. Atom and link
radii are nonphysical display scales. Force, velocity, scalar field, electron
density, motion synthesis and interpolation remain unavailable. The system is
the finite 895-water TIP3P PME control; it is not bulk water, solution or NaCl.

Public AIDO Cell material is a controlled-alpha vendor presentation, not a
reproducible 3D atomistic renderer. Its useful comparator is the persistent
world state, action/branch/replay history and same-state multi-readout design.
The V046 digest chain is locally more explicit than the public AIDO marketing
evidence, but Tailing Future does not yet have AIDO-like state/readout UI,
intervention receipts or multiscale decoded outputs and must use only the term
“AIDO-inspired.”

## Remaining blockers and next three acceptance tasks

1. **Private real-artifact adapter.** Materialize one exact frame's three raw
   channels inside the server-only boundary, retain no bytes after conversion,
   bind the adapter to the verified manifest/receipt and license decision, and
   prove that no raw or derived coordinates enter a public response while
   distribution remains unauthorized.
2. **Browser renderer and mutation guard.** Attach the three persistent meshes
   behind a non-public rendering facade; revalidate matrix identity immediately
   before draw; measure actual `renderer.info.render.calls`; test context loss,
   WebGL2 fallback and fixed-browser picking. WebGPU must remain experimental
   until separate macOS and Windows parity checks pass.
3. **Same-state scientific readout.** Bind viewport, timeline and selection
   panel to one session/frame/atom-order/cell tuple. Show exact position and
   structural-constraint semantics first. Add forces only at an exact solver
   frame and raw half-step velocity only with its temporal warning. Keep field
   and isosurface controls absent until a digest-bound scalar grid with units,
   axes/cell, boundary conditions and source-frame lineage exists.

Any execution-authenticity, conservation, schema, license, public-distribution,
renderer-provenance or digest failure remains a promotion hard stop. This
review does not change the scorecard or authorize commit, push or deployment.
