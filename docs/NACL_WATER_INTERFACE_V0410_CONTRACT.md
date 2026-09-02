# NaCl{100}–Water Interface v0.4.10 Contract

## Status

`v0.4.10` is a deterministic, solver-input **geometric coordinate seed** for a
future NaCl crystal–water experiment. It constructs every Na, Cl, O and H site,
the fully periodic cell, crystal-layer labels, water residues, structural O–H
links and rigid-water constraints. It does not run molecular dynamics.

The following are all false in this version: OpenMM execution, PME execution,
minimization, equilibration, force or energy availability, trajectory
availability, interface dynamics, hydration measurement, dissolution,
crystallization, rate estimation, electronic structure, learned world-model
training, industrial prediction and public-release eligibility.

This namespace is additive. It does not widen the eight-site executable
`0.4.2` calibration, reinterpret the 895-water `0.4.4` control, or change any
reserved PFHub/Cantera `v0.5` work.

## Why geometry and dynamics are separated

The repository can construct a real three-dimensional molecular topology before
it has scientific authority to animate that topology as an interface
experiment. Treating those as the same milestone would create two false claims:

1. that loading Na⁺/Cl⁻ and water parameters validates the same model for an
   ionic solid and its aqueous interface; and
2. that visible ion motion in one trajectory establishes dissolution or
   crystallization kinetics.

The `v0.4.10` action evaluator therefore accepts only a read-only inspection of
the coordinate seed. Requests to prepare or advance interface dynamics return a
digested observation with all missing prerequisite gates and `solverInvoked:
false`.

The full 6,336-site coordinate object and the combined system/seed plan each
have their own closed Draft 2020-12 JSON Schema. Schema validation bounds every
array, index, coordinate, identity, charge and distance field; the TypeScript
validator additionally checks ordered self digests and the exact locked plan.

## Primary-source inputs

| Role | Pinned source | What it establishes | What it does not establish |
|---|---|---|---|
| NaCl structure | [NIST/NBS Circular 539 Volume 2](https://nvlpubs.nist.gov/nistpubs/Legacy/circ/nbscircular539v2.pdf), DOI `10.6028/NBS.CIRC.539v2`, 6,365,255 bytes, SHA-256 `ad69a84ba964e66caf2de506b7ac044531e0721e2b626ddcfce6d1f839652426` | `Fm-3m`, four NaCl formula units per conventional cell and `a = 5.6402 Å` at 26 °C | The equilibrium lattice constant of a chosen force field at another temperature |
| Candidate water/ion parameters | [OpenMM 8.6.0 `amber14/tip3p.xml`](https://github.com/openmm/openmm/blob/c6173db6e8edd705eb59172bd21e9ce69c572405/wrappers/python/openmm/app/data/amber14/tip3p.xml), commit `c6173db6e8edd705eb59172bd21e9ce69c572405`, SHA-256 `3f4b188dbcb6c02863230eaca231e927fb6bf3307ce947d8a50d0f46f6dd83d9` | TIP3P geometry and bonded/nonbonded terms plus compatible Joung–Cheatham monovalent-ion parameter bytes; v0.4.10 separately encodes rigid-water constraints | Actual OpenMM constraint application, a validated NaCl solid, phase equilibrium, surface free energy, dissolution barrier or rate |
| Parameter-domain warning | [Joung and Cheatham 2009](https://pmc.ncbi.nlm.nih.gov/articles/PMC2755304/), DOI `10.1021/jp902584c` | Ion parameters depend on the selected water model; reported TIP3P NaCl solubility is far below experiment | Permission to extrapolate this candidate to saturated solution or crystallization |

The parameter file and license notices are byte-pinned but are not bundled.
Their redistribution clearance remains false. A self digest proves internal byte
identity, not source authenticity, execution or licensing.

## Locked geometric system

### Crystal

- Six conventional cells along x, six along y and four along z.
- Rocksalt `Fm-3m` conventional basis with four NaCl formula units per cell.
- 576 Na⁺ and 576 Cl⁻ sites, for 1,152 crystal ions.
- The z-normal `(001)` plane is a cubic-equivalent member of the `{100}`
  family.
- Eight atomic planes separated by `a/2 = 0.28201 nm`.
- Every plane contains 72 Na⁺ and 72 Cl⁻ and is formally neutral.
- Each interior ion has six opposite-charge nearest neighbours; each outer-plane
  ion has five because one z neighbour is absent at the interface.
- The experimental 26 °C lattice constant is only a coordinate seed. It is not
  labelled a relaxed or stable lattice under the candidate force model.

### Water

- 1,728 rigid TIP3P molecules, 864 on each side of the slab.
- Each region uses a deterministic `12 × 12 × 6` oxygen grid.
- O–H is `0.09572 nm`, H–H is `0.15139006545247014 nm`, and the H–O–H angle
  is `1.82421813418 rad`.
- Six cardinal dipole orientations occur exactly 144 times in each region, so
  the construction has zero first-moment orientation bias on either side.
- The regular packing is explicitly a pre-minimization seed, not equilibrated
  liquid water. Its nominal water-region density is `1000.3659761772168 kg m⁻³`;
  that construction value is not a measured equilibrium density.
- The minimum distance between sites belonging to different molecules is
  `0.16483354467600186 nm`. This only passes a geometric overlap guard; it is not
  an energy or stability result.

### Periodic cell

- Orthorhombic `3.38412 × 3.38412 × 6.76824 nm`.
- Periodic on x, y and z.
- No vacuum region and no unimplemented 2D slab-Ewald correction.
- The nominal solid extent is `2.25608 nm`; the two nominal water-side extents
  are `2.25608 nm` each.
- The periodic distance from one outer atomic plane to the next image's facing
  plane through water is `4.794169999999999 nm`.
- The two water regions have equal composition and use the same packing recipe.
  This is a balanced double-interface seed, not a claim that the labelled
  microscopic coordinates are related by one exact translation. Later
  trajectory statistics must demonstrate two-side agreement rather than
  assuming it.

The resulting topology contains 6,336 particles, 2,880 residues, 3,456
structural O–H links and 5,184 rigid-water distance constraints. Each atom
stores chemical formal charge separately from the candidate force field's model
point charge: water O/H formal charges are zero while their TIP3P model charges
are `-0.834/+0.417 e`. Both the total formal charge and total model point charge
are exactly zero. Structural O–H links are topology glyphs, not separate
harmonic energy terms.

## Immutable identity

The builder emits stable atom indices and IDs in this order:

```text
crystal cell z → y → x → basis
lower water z → y → x → O,H1,H2
upper water z → y → x → O,H1,H2
```

Every crystal atom carries conventional-cell, basis, atomic-layer and
surface/interior labels. Every water atom carries region, grid, construction
orientation and site-role labels. The plan binds four separate, chained
identities:

- system digest: physical and evidence contract;
- coordinate-construction digest: the constructed pre-system atom, topology
  and construction-receipt payload before system binding;
- coordinate-payload digest: ordered atom IDs and xyz values;
- topology digest: atom identities, charges, masses, labels, links and
  constraints.

Deleting an atom, reordering atoms, changing one coordinate, charge, layer,
source pin, gate or claim flag fails the exact validator even if the caller
recomputes its outer digest.

The five JSON Schemas are deliberately structural prefilters, not semantic
proofs. Draft 2020-12 cannot recompute the locked SHA-256 values, enforce atom
index uniqueness or resolve every topology reference. The runtime exact
validator recomputes the locked plan, system and coordinate-seed self-digests
before admitting an action or observation. This version deliberately deferred
the cross-language portable-input verifier; the additive
[v0.4.11 semantic-import contract](NACL_WATER_INTERFACE_V0411_IMPORT_CONTRACT.md)
now closes that seam without admitting a solver.

`waterSite.region`, crystal `surfaceRole` and `phase` are construction-time
labels only. Under fully three-dimensional periodic dynamics the two water
regions are connected across the z boundary, ions may leave ideal sites and the
instantaneous interface can move. Any executed readout must therefore re-bin
positions per frame with unwrapped image counters and a defined moving-surface
reference; it may not treat these seed labels as permanent phase membership.

## Solver-admission gates

The following four gates are strictly ordered inputs to a first
non-promotional interface trajectory. They are not the complete scientific
interpretation or promotion route. All are currently `required-not-satisfied`
with no receipt:

1. protected OpenMM 8.6 pure-water replay and Reference/CPU comparison;
2. a periodic water box with one neutral NaCl pair and preregistered low-salt
   energy, constraint, equilibration and structural gates;
3. a mobile dry NaCl{100} slab stability, force-closure and lattice-order
   control; and
4. independent qualification of one potential for solid NaCl, aqueous ions and
   the interface domain.

The low-salt control is an execution-admission prerequisite. Code for the
geometry, schemas, transport and renderer may be developed in parallel, but no
interface preparation or dynamics can be admitted until the receipts exist.
Passing these four gates would admit only a clearly labelled, non-promotional
solver trajectory. It would not make hydration, detachment, dissolution,
crystallization or kinetics interpretable: the v0.4.2 contract's bulk
concentration series, uncertainty and finite-size gates remain additionally
required for those claims.

The future OpenMM backend must be a new manifest. The current 895-water contract
assigns a Reference trajectory and CPU fixed-coordinate comparison at a fixed
2,685-particle shape. A 6,336-particle interface production run is expected to
use another explicitly named execution lane; those semantics must not be
silently inverted or generalized.

## State → action → observation seam

`tf.nacl-water-interface-action/0.4.10` accepts three closed action kinds:

- `inspect-coordinate-seed`;
- `request-interface-preparation`; and
- `request-mobile-interface-dynamics`.

Every action binds the exact system and coordinate-seed digests. Inspection
returns the four geometric evidence classes and enumerates every unavailable
dynamic/statistical readout. The other two actions return
`blocked-prerequisite-gates-unsatisfied`, list all four missing gates, perform no
state mutation and invoke no solver. The observation is independently
self-digested and exact-validated against its action.

This is an [AIDO Cell](https://genbio.ai/aido-cell-simulator/)-inspired envelope
skeleton toward one persistent state, typed intervention, side-effect-free
readout and explicit branch/replay boundaries. The present slice implements one
immutable system/seed plus read-only or blocked decisions; it does not yet
implement persistence, clone, branch, restore or trajectory replay. It implies
no model, benchmark or capability parity with AIDO Cell and is not a learned
multi-scale world model.

## Future executed observation

An executed interface observation must bind all of the following to one source
state, step, time and digest:

- F64 positions, velocities and potential forces for all 6,336 sites;
- periodic box and unwrapped image counters;
- kinetic, potential, total and force-group energies;
- rigid-water constraint residuals and any explicit external-restraint ledger;
- z-resolved Na, Cl, O and H density;
- water dipole orientation versus z;
- Na–O, Cl–H and Cl–O geometric coordination;
- crystal-layer order, ideal-site displacement and surface occupancy; and
- runtime, image, source, action, parent-state and artifact receipts.

The browser may receive a verified F32 projection only after each frame binds
back to its F64 source-frame digest. Positions, force arrows, paths and profiles
must come from the same observation. Rendering cadence, camera, selection and
layer toggles remain presentation state. Interpolation or extrapolation cannot
create physical endpoints.

Na–Cl, hydration and hydrogen-bond-like lines are geometric contacts unless an
executed energy decomposition supplies a stronger meaning. Point charges are
not electron density. Display radii are not physical atomic radii. A visible
crossing of one threshold is not a dissolution event.

## Interface acceptance sequence

After all four solver-admission gates pass, a future producer may create a
non-promotional trajectory, but must keep preparation, conservation witness and
statistics separate:

1. bounded minimization with explicit postconditions;
2. restrained-free 300 K equilibration, excluded from production statistics;
3. fixed-cell 1 fs NVE conservation witness with all force groups included;
4. at least three preregistered 2 fs NVT production seeds for an engineering
   reproducibility witness; and
5. fresh-process fixed-coordinate Reference/CPU checks on selected frames.

At minimum, NVE relative energy excursion must be at most `1e-3`, rigid-water
constraint relative residual at most `1e-6`, and all arrays, step/time ordering,
restart windows, force-group sums, mass and charge must close. Statistical
acceptance additionally requires fixed block definitions, enough effective
blocks, two-interface agreement, early/late profile agreement and finite-size
controls. Those checks do not replace the earlier v0.4.2 calibration ladder:
the finite-concentration control and bulk concentration series must pass before
hydration, ion detachment, terrace/step motion, nucleation or phase-change
observables are interpreted scientifically.

Three seeds are not a kinetic-rate sample. Any later dissolution or
crystallization estimate must separately preregister the event definition,
unwrapped-PBC persistence/residence window, reattachment hysteresis, moving
surface reference, independent event count, confidence interval and lateral /
water-gap finite-size convergence. A crystallization experiment also requires
an independently specified solution concentration or chemical-potential start
state; this zero-free-ion geometric seed cannot supply one.

For an independent constrained-surface structure comparator, the future loop
can rebuild a candidate from the public scripts in
[DaRUS dataset 2726](https://doi.org/10.18419/darus-2726). Its generator lacks a
locked random seed and the dataset does not provide the corresponding raw
trajectory, so that rebuild must not be called an exact trajectory
reproduction. Its restrained crystal setup also cannot validate mobile-ion
dissolution. For
candidate dissolution-event definitions and multi-seed uncertainty design, the
loop can compare with [O'Neill et al. 2024](https://pubs.rsc.org/en/content/articlehtml/2024/cp/d4cp03115f)
and its [author repository](https://github.com/niamhon/nacl-dissolution), while
keeping its missing original trajectories, environment lock and repository
licence separate from reproduced evidence.

No score, champion, release, deployment or canonical-site claim changes in
this geometric-contract milestone.
