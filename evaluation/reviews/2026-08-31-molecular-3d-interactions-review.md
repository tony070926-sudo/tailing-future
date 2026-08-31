# R8 molecular / ionic 3D interaction review

Date: 2026-08-31

Base: `origin/main` at `58e435538c7afe931f76bd2332b504ea92184e8a`

Scope: the default microscopic view, a new deterministic molecular-scene
module, its tests and the directly affected architecture documentation.

## Outcome

**Independent reviews: APPROVE after one blocked revision.** The first review
was not promoted: all three reviewers identified that the NaCl view evaluated
only one central first shell while the Canvas allowed every background ion to
be selected. That could turn an unavailable force into an apparent zero and
could disconnect the selected coordinate from the displayed energy. The
candidate now exposes exactly one selectable NaCl site, stores every other
force as `null`, renders it as `NOT EVALUATED`, and visually subordinates the
non-evaluated lattice sites.

The final read-only assessments were performed by separate agents that made no
implementation edits:

- Scientific Evaluator: **APPROVE** — parameter values, geometry, units, force
  signs, energy closure, finite-difference gates and NaCl coordination gates
  are consistent with the declared classical models.
- UX / Architecture Reviewer: **APPROVE** — the default view is a recognizable
  bonded molecular structure rather than a random LJ cloud; NaCl selection and
  unavailable values are now honest; tab and slider keyboard semantics pass
  review.
- Source Scout: **APPROVE** — OpenMM and GROMACS references are versioned,
  experimental/crystallographic sources are identified, and the scene digest
  binds the source, pair and force payloads.

## Implemented evidence

### Water dimer

- Two rigid, neutral three-site H2O molecules with explicit x/y/z coordinates.
- OpenMM 8.5.1 TIP3P geometry and parameters: O-H 0.9572 A,
  H-O-H 104.52 degrees, qO -0.834 e, qH +0.417 e,
  sigmaOO 3.150752406575124 A and epsilonOO 0.635968 kJ/mol.
- Exactly nine cross-molecule Coulomb pairs and one O-O 12-6 Lennard-Jones
  contribution; no extra hydrogen-bond potential and no intramolecular
  harmonic energy for the rigid geometry.
- Analytic force versus central finite difference, energy-component closure,
  total internal-force closure, charge neutrality, geometry and deterministic
  identity are acceptance tested.

The monomer geometry and parameter set are sourced. The displayed dimer pose is
a controlled coordinate scan and is explicitly not claimed to be an
experimental or quantum-optimized equilibrium structure.

### NaCl rocksalt

- A neutral 4 x 4 x 4 visible checkerboard fragment generated from the NBS
  Fm-3m rocksalt structure with a = 5.6402 A at 26 C.
- The evaluated domain is the central Na+ and its six unlike first neighbors at
  a/2 = 2.8201 A. The 12 same-charge second neighbors at a/sqrt(2) are tested.
- The displayed sum is only the central ion's six finite, vacuum formal-charge
  Coulomb pairs. Analytic displacement force versus finite difference is
  tested.
- Background ions establish the crystal structure but are not selectable and
  carry machine-readable `null` forces. Short-range repulsion, polarization and
  dispersion are `NOT MODELED`, not numerical zero.

This is not Ewald/PME, a bulk lattice/cohesive energy, a complete NaCl force
field, a stable crystal dynamics model or a defect-property calculation.

## Primary and official sources

- Jorgensen et al. (1983), original TIP3P paper:
  https://doi.org/10.1063/1.445869
- OpenMM 8.5.1 parameter snapshot:
  https://github.com/openmm/openmm/blob/8.5.1/wrappers/python/openmm/app/data/tip3p.xml
- GROMACS 2026.3 unit definitions:
  https://manual.gromacs.org/2026.3/reference-manual/definitions.html
- NBS Circular 539 Vol. II NaCl diffraction and lattice data:
  https://doi.org/10.6028/NBS.CIRC.539v2
- IUCr inorganic structure types:
  https://www.iucr.org/resources/commissions/crystallographic-nomenclature/inorganic

## Candidate versus champion and comparator snapshot

The previous `main` view at the base revision rendered a 2D reduced-unit LJ
state through a rotatable perspective projection and explicitly had no real
species or z degree of freedom. This candidate keeps that solver as a numerical
baseline but replaces the default visual with explicit molecular/ionic xyz
structures, typed identities, authored bonds/coordination guides, pair-energy
components and force vectors.

This does not change the locked 41/100 evidence-maturity score or the current
conditional champion status. It does not close the pinned MatterSim/MACE
693-record reproduction gap, PFHub phase-field/heat gap, or Cantera CSTR gap.
AIDO Cell remains an architectural comparator for persistent multi-scale state
and action semantics; this visualization slice does not claim a learned
biology-style world model, atomistic foundation model or industrial optimizer.

## Validation and release separation

- Molecular/ionic unit tests: **11 passed**.
- Full locked repository check on the local macOS/arm64 host: **PASS** — lint,
  typecheck, 287 JavaScript tests (1 skipped), 94 Python tests (1 skipped),
  atomistic manifest/runtime validation, deterministic Sentinel evaluation and
  production build. Sentinel remains **CONDITIONAL 41/100** with zero hard-gate
  failures and the same three locked next gaps.
- Dependency audit: **0 known vulnerabilities** at the pre-review candidate.
- Production build and local HTTP HTML smoke: **passed**; no browser pixel or
  end-to-end interaction claim is made.
- Commit, pull request, GitHub main-branch CI artifact, release guard,
  Cloudflare deployment and canonical-site smoke are separate pending states.

## Remaining gaps

- No polarization, charge transfer, electron density, bond breaking or
  reactive dynamics.
- No periodic electrostatics or complete ionic short-range potential.
- No molecular-dynamics integrator, thermostat, time trajectory or transport
  coefficient.
- Canvas rendering is suitable for these bounded scenes; large systems will
  require instanced WebGL plus spatial indexing.
- The model is not authorized for materials selection, process settings,
  scale-up or safety decisions.
