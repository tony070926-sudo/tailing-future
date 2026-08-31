# R9 AIDO-inspired material-state visual review

Date: 2026-08-31

Branch point: `origin/main` at `cf86af5e97000d8472257685e63b544d9b4c92a0`

Scope: the molecular / ionic workbench presentation layer, the Canvas visual
encoding and the directly affected architecture documentation. The molecular
models, coordinates, interaction equations and acceptance tests are unchanged.

## Outcome

**Independent reviews: APPROVE after one blocked UX revision.** The first UX
assessment was not promoted. It identified a Na+ legend mismatch, overlapping
mobile overlays, a 320-355 px scale-rail overflow and a small-text contrast
ratio below 4.5:1. The candidate now uses the same Na+ cyan in the legend and
Canvas, anchors the force legend away from the bottom probe, changes the narrow
scale rail to a 3-by-2 grid and raises active atom-ID contrast to 5.39:1.

The final read-only assessments were performed by separate agents that made no
implementation edits:

- Source Scout: **APPROVE** - the public AIDO Cell visual references are
  represented accurately at the level of palette and information hierarchy,
  while the implementation uses Tailing Future's own material-state graphics,
  labels and structure data. No GenBio image, logo, copy, trajectory, point set
  or layout asset is shipped by the application.
- Scientific Evaluator: **APPROVE** - every physical line remains typed as a
  bond, guide, pair interaction, pair force or net force; decorative flow lines
  stay outside the Canvas. No electron-density, physical-radius, dynamics or
  validated multi-scale-bridge claim was introduced.
- UX / Architecture Reviewer: **APPROVE after fixes** - the element / ion color
  mapping is consistent, the bounded mobile overlays and scale rail no longer
  collide or overflow, and the corrected active-ID contrast exceeds 4.5:1.

## Official observations versus local adaptation

The public AIDO Cell product page and its official title, operation/readout and
perturbation-atlas graphics show a predominantly warm near-white field, dark
typography, green and cyan action/structure accents, thin connectors, large
whitespace and an ordered state-to-readout hierarchy. Purple and orange are
used more selectively for differentiated trajectories and readouts.

Tailing Future adapts those general visual principles into a distinct materials
vocabulary: a three-node material-state mark, a structure/control/evaluate/
readout rail and a light microscopic viewport. It does not reproduce the AIDO
Cell circular cell shell, central lightning mark, chip-like organelles, product
copy, experimental labels, plotted coordinates or pixel layout. Official URLs
are documentation references only and are not application image dependencies.

Primary visual references:

- Product page: https://genbio.ai/aido-cell-simulator/
- Official title graphic:
  https://genbio.ai/wp-content/uploads/2026/08/aido-cell-x-1600x900-1.jpg
- Official operation / readout graphic:
  https://genbio.ai/wp-content/uploads/2026/08/vc_abstract-1-1920x1225.png
- Official perturbation atlas:
  https://genbio.ai/wp-content/uploads/2026/08/image-5-1-1920x763.jpg

These references establish visual observations and vendor positioning only.
They are not locally reproduced evidence for AIDO Cell's scientific claims.

## Scientific representation boundary

- Water and NaCl still use the existing explicit xyz coordinates, typed species,
  authored bonds / coordination guides, pair-energy terms and force vectors.
- The new rail is explicitly labelled `STATIC CONFIGURATION · NOT TIME`; it is
  an information flow, not a molecular trajectory, transport path or reaction.
- The visible status remains `2 / 6 STANDALONE` and `0 VALIDATED BRIDGES`.
- Atom surfaces remain identity glyphs, not electron density, orbitals, ionic
  radii or van der Waals radii. Only selection receives a bounded emphasis ring.
- NaCl remains a finite central first-shell evaluation, not Ewald/PME, bulk
  cohesive energy, a full ionic force field or a stable crystal dynamics model.
- No model is authorized for materials selection, process settings, scale-up or
  safety decisions.

## Candidate versus champion and comparator snapshot

The branch-point champion already provided a real, rotatable, selectable 3D
water-dimer and NaCl view. This candidate preserves that scientific slice and
changes the visual system from a dense dark instrument panel to a spacious
light material-state interface with stronger structure-to-readout hierarchy.

This is a presentation and legibility improvement, not a score-bearing
scientific capability. It does not change the locked 41/100 maturity score or
the conditional champion status. It does not close the pinned MatterSim/MACE
checkpoint reproduction gap, PFHub Benchmark 3 coupling gap or Cantera 3.2
CSTR reproduction gap. AIDO Cell remains a system-design and visual-language
comparator; Tailing Future does not claim an equivalent learned world model.

## Verification boundary

- Molecular / ionic acceptance tests before review: **11 passed**.
- A full locked repository check before the UX correction passed lint,
  typecheck, 287 JavaScript tests (1 skipped), 94 Python tests (1 skipped),
  atomistic manifest/runtime validation, deterministic Sentinel evaluation and
  production build.
- Lint, typecheck, static contrast calculation and development-server smoke
  passed after the UX correction.
- The final post-review locked check, dependency audit, production smoke,
  commit, pull request, GitHub CI artifact, release guard, Cloudflare deployment
  and canonical-site smoke remain separate promotion states. The generated
  Sentinel reports and GitHub artifacts, rather than this narrative, are the
  authoritative evidence for those states.
