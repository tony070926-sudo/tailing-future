# Architecture: a constrained multi-scale world state

## Operating definition

Tailing Future is not a collection of unrelated predictors. A world-model candidate must provide:

1. a persistent, versioned state;
2. typed actions with units and validity limits;
3. state transitions that can be replayed and branched;
4. multiple observations decoded from the same state;
5. explicit cross-scale bridges with conservation and uncertainty;
6. abstention when the requested state or action is outside the validated domain.

The shared state is a typed collection rather than one opaque latent vector:

```text
WorldState = {
  electronic, atomistic, mesoscale,
  continuum, reactor, process,
  bridges, uncertainty, provenance
}
```

Each transition is conceptually:

```text
next = constraint_projection(
  trusted_solver(state, action, parameters, closure)
  + learned_correction(state, action)
)
```

AI may supply a representation, prior, closure, surrogate, decoder or design policy. The module contract must declare that role so that a visual decoder or inverse-design model cannot be mistaken for a physical transition engine.

## Adapted from AIDO, not copied literally

The 2024 [AIDO perspective](https://arxiv.org/abs/2412.06993) describes a three-stage engineering path: independent modules, bottom-up connections and holistic alignment. The 2026 [AIDO Cell technical report](https://genbio.ai/research/AIDO%20Cell%20V1%20-%20Technical%20Report%20-%2018%20Aug%202026.pdf) describes a linked nucleotide/gene/transcript/cell state and the operational primitives `observe`, `perturb`, `simulate`, `branch/restore` and `design`; this is a coordinated system of models and references, not evidence of one monolithic checkpoint. The [AIDO Cell release](https://genbio.ai/aido-cell-simulator/) describes continuous interventions, branching and several readout families. Its public benchmark figures remain vendor-reported, the full system is a closed alpha, and the product page says further temporal and metabolic capabilities and novel wet-lab validation are still being developed.

The Lab's visual system adapts observed principles from the official
[AIDO Cell title graphic](https://genbio.ai/wp-content/uploads/2026/08/aido-cell-x-1600x900-1.jpg),
[operation/readout diagram](https://genbio.ai/wp-content/uploads/2026/08/vc_abstract-1-1920x1225.png)
and [perturbation atlas](https://genbio.ai/wp-content/uploads/2026/08/image-5-1-1920x763.jpg):
a warm near-white field, high-contrast typography, restrained emerald/cyan
accents, thin system connections and a clear state-to-readout hierarchy. No
GenBio artwork, logo, copy, experimental label, trajectory or layout asset is
included. In Tailing Future, decorative system lines stay outside the physical
Canvas. Bonds, guides, pair contributions and force arrows inside the Canvas
remain separately styled and are drawn only from the typed molecular scene;
the static configuration rail remains a coordinate-scan workflow, while the
separate bounded v0.4 trajectory rail renders typed solver observations rather
than inventing motion for appearance. Neither rail implies transport, a bulk
thermodynamic ensemble or a learned AIDO model.

Materials do not have one equivalent of the DNA → RNA → protein central dogma. The working causal graph is bidirectional:

```text
composition + processing history
        ⇅
electrons ⇄ atoms ⇄ phases / microstructure ⇄ fields / components
        ⇄ reactors ⇄ flowsheets / controls
```

Temperature, pressure, stress, chemical environment and process actions can change the structure at lower scales. Boundaries, geometry and open-system flows therefore remain explicit.

## Six scientific layers

| Layer | State and action | Physics anchor | Candidate AI role |
|---|---|---|---|
| L0 electronic | nuclei, charge, spin, cell, electron state; substitution, strain, field | DFT, DFPT, NEB | Hamiltonian, density or barrier surrogate |
| L1 atomistic | elements, coordinates, velocities, cell, charge; T/P/strain/composition | MD, ab-initio MD, LAMMPS, ASE | UMA, MACE, CHGNet or MatterSim after target-domain validation |
| L2 mesoscale | phase field, grains, defects, pores, interfaces | CALPHAD, phase-field, kMC, DEM | representation, closure, neural operator |
| L3 continuum | density, velocity, pressure, temperature, species, stress | finite volume / finite element solvers | geometry-bounded operator surrogate |
| L4 reactor | kinetics, transport, residence time, catalyst state, equipment limits | Cantera, CFD, PBM | hybrid ROM and calibrated state model |
| L5 process | streams, inventories, utilities, economics, emissions, controls | IDAES, Pyomo, DAE/MPC | advisory policy under hard constraints |

## Scale bridges

Every bridge records input/output variables and units, averaging windows, model digest, calibration data, validity range, uncertainty and conservation residual.

```text
L0 → L1  energy / forces / barriers
L1 → L2  free energy / diffusivity / mobility / interface energy
L2 → L3  homogenized constitutive law / permeability / transport tensor
L3 → L4  pressure drop / effective rate / transfer coefficient / RTD
L4 → L5  unit-operation ROM / stream map / dynamic constraints
```

A missing scale separation or failed residual produces `abstain`; it must not be hidden by a smooth visualization.

## R2 numerical implementation

R2 currently remains a 2D reduced-unit thermochemical verification world. It is a real numerical calculation but still a toy physical world:

- private force-shifted Lennard–Jones state, exact requested density, minimum-image validation and transactional velocity-Verlet steps;
- a periodic finite-difference Fourier heat field with area heat-capacity density, grid-independent pulse energy and automatic CFL subcycling;
- conservative cell-local energy exchange using an exact two-reservoir kernel and peculiar velocities around each cell center of mass;
- equal-mass, equal-potential A/B internal labels with frozen counter-randomized Arrhenius hazards;
- symmetric `H/2 → X/2 → R/2 → MD → R/2 → X/2 → H/2` operator ordering;
- explicit mechanical, field, chemical, external-heat, interface and reaction closure ledgers with normalized maximum-operator and cumulative gates;
- `tf.world/0.3` / `tf.action/0.3`, parent chains, unique siblings, deterministic checkpoint continuation and atomic action rollback;
- three-mode two-dimensional Fourier convergence and an 8×5,000-step PR ensemble tail;
- pinned MatterSim / MACE / Random-TP scientific manifests plus a separate,
  non-self-referential runtime-lock protocol. Both isolated ten-frame smoke
  paths now emit finite E/F/stress without labels, but remain
  `planned-not-reproduced`. Two R6b executions are inadmissible because their
  locked R5 summaries contain a nested positive promotion claim. Commit P
  `f861b3e` anchors the versioned v2 runner, and a protected-main dispatch proved
  the legacy path is quarantined. Commit S `687755a` non-circularly selected and
  materialized only those P blobs and produced two successful fresh
  protected-main candidates. Protected-main Commit-V run `33296529694` then
  re-fetched and bound their GitHub metadata, logs and raw archives and emitted
  one externally attested, bootstrap-only receipt. Commit F validates the
  vendored receipt, Sigstore bundle, trusted root, V Git blobs and ancestry
  offline before projecting only stable input identities into a **2 / 2**
  `runtime-frozen-not-reproduced` lock. Run-specific OCI identities stay null,
  every scientific claim stays false and the complete 693-record independent
  verifier is still required;
- a browser frame assembled from one immutable observation snapshot.

The Lab also exposes a separate `tf.molecular-scene/0.1` structure viewer. Its
default water-dimer configuration uses explicit xyz coordinates, rigid OpenMM
8.5.1 TIP3P monomer geometry, cross-molecule fixed-charge Coulomb terms and one
O–O 12–6 Lennard-Jones term. Its NaCl scene uses the NBS 26 °C rocksalt lattice
and evaluates only the central Na⁺ first coordination shell as finite, vacuum
point charges. The monomer parameters and crystal structure are sourced; the
water-dimer pose is a controlled coordinate scan, not an experimental or
optimized equilibrium structure. The NaCl path and the water coordinate scan
remain static: they are not periodic Ewald/PME, a bulk lattice energy, a
reactive potential or an electronic-structure model.

A third local path, `tf.periodic-atomistic-*/0.4.1`, is an unpromoted
three-dimensional periodic atomistic foundation. A full 3×3 cell, exact
triclinic minimum image, deterministic Verlet half-list, explicit radial
potentials and fixed-cell NVE Velocity Verlet produce one immutable observation
for both numerical gates and the dark microscopic observatory. The first locked
fixture is 32-atom FCC argon; it is intentionally a short-range calibration and
not the planned NaCl–water material interface. The 10,000 + 10,000 step verifier
is a new hard gate, while the scorecard and R2 champion remain unchanged.

The separate local `0.4.2` aqueous foundation does not mutate that world or its
schema. It provides a direct three-dimensional Ewald reference, origin-free
graph-consistent SHAKE/RATTLE, explicit compatible topology and nonbonded
exceptions, constrained Velocity Verlet and a transactional eight-site
NaCl–TIP3P calibration world. A local verifier executes 10,000 accepted NVE
steps and a 10-step independent prefix replay; this is finite-size cold-start
integration evidence, not a bulk or external-engine result, and the exact
report is not yet bound to a protected-main CI artifact.

The WebGL2 readout remains downstream of an immutable adapter that accepts only
the exact step-0 or step-1 observation. Its pure scene plan uses a sodium-
anchored minimum-image molecule gauge, emits each of the eight actual sites
once, preserves actual evaluated LJ displacements, and keeps unsupported
electronic, pair-Coulomb, pressure, stress and reaction layers fail-closed. The
client adds true depth, whitelisted Raycaster selection, on-demand rendering,
keyboard controls and semantic fallback/context restoration without changing
the solver state. There is still no OpenMM/PME reproduction, bulk solution,
electrostatic virial, license clearance, score increase or release acceptance.
The ordered calibration systems and exact claim boundaries are specified in
[the v0.4.2 science contract](NACL_WATER_V042_CONTRACT.md).

The additive `tf.aqueous-dynamics-render-trajectory/0.4.3` path does not widen
that v0.4.2 adapter. It executes the locked `0..10` prefix twice from separate
fresh worlds and admits the 11 full observations only after exact ordered
sample-digest equality. Presentation state is deliberately absent from the
bundle: the UI cursor, playback cadence and WebGL RAF consume accepted
endpoints but cannot invoke or write back to the solver. Interpolation is
currently `null`, so forces, energy and local interactions always correspond to
the displayed endpoint rather than a fabricated in-between pose.

For trajectory display, each molecule anchor follows its source unwrapped
coordinate (`wrapped + integer image`) while rigid-water internal sites use the
source minimum-image geometry. The gauge epoch has no display rebase. This
removes the moving-sodium global reference for the multi-frame path without
changing source state or physical digests. It is a small-system bridge only;
large interfaces require a versioned system specification, a PME-capable
external backend, chunked trajectory artifacts and instanced GPU primitives.

The additive v0.4.4 seam supplies the first two contracts without changing
either executable path. `tf.aqueous-system-spec/0.4.4` owns physical identity:
pinned source bytes and atom order, composition, periodic cell, force model,
preparation and dynamics plans, acceptance thresholds, and explicit negative
evidence semantics. `tf.force-backend-manifest/0.4.4` separately owns engine
and runtime identity, platform capabilities, determinism scope, a reject-only
fallback policy, license state and negative claim boundaries. The associated
`ForceBackend`/prepared-system/evaluation interfaces describe the future
prepare-and-evaluate boundary. An evaluation request now carries the physical
cell and all 8,055 position components plus their digest; the response carries
all four group energies and complete O(N) total/group force arrays and digests.
The four groups are harmonic bond, harmonic angle, direct nonbonded plus
Lennard–Jones, and reciprocal nonbonded. Canonical request/result envelope
builders and validators reject truncated/non-finite arrays, stale component or
self digests, request/result identity drift, and non-closing force groups.
There is still no external backend implementation or prepare/evaluation
receipt in this slice.

The first locked plan is a cold-start, finite pure-water engine control: 895
rigid TIP3P waters (2,685 particles) in the pinned OpenMM 8.6.0 3 nm cubic
`tip3p.pdb`, compiled with the pinned Amber14 `tip3p.xml`. Its artifact ID is
`tf.openmm-pure-water-cold-start-pme-control/1`, without a “bulk” label. It
requests PME at a 1 nm cutoff, exact same-host and same-container fresh-process
replay on the canonical `Reference` platform, a separate single-thread `CPU`
fixed-coordinate energy/force comparison, and a shared portable start state
for a future 1 ps, 1,000-step NVE trajectory with 101 samples. Package index,
container source/tag/digests and exact OpenMM/NumPy wheel URLs, byte counts and
digests have one allowed identity; no source, platform or electrostatics
fallback is allowed.

Because the plan calls `setPMEParameters` with a nonzero alpha and explicit
grid, OpenMM ignores the recorded `1e-4` design tolerance. Each lane must read
back and receipt its actual alpha/grid from its own Context; platform limits may
adjust those values, while same-lane fresh-process readbacks must agree. The
acceptance contract defines Reference total-energy excursion over all 101
samples with a 1 kJ/mol denominator floor, minimum-image constraint residuals
over every rigid-water constraint at every sample, and CPU/Reference L2 force
errors at steps 0, 10, 100, 500 and 1,000 with a `1e-12 kJ mol^-1 nm^-1`
reference-force floor. It takes both the median across particles and the
global force-vector L2 error at each step, then the maximum across steps; both
must be at most `1e-4`. On the same physical-coordinate, atom-order and
lane-bound prepare receipts, CPU/Reference potential-energy relative error
must be at most `1e-5`. Ascending force-group 0→3 sums must close independently
for both lanes at all five coordinates, for energy and componentwise forces,
using 1 kJ/mol and 1 kJ mol^-1 nm^-1 floors, respectively, with the maximum of
the ten energy residuals and, separately, the ten force residuals each at most
`1e-8`; both aggregates must pass.

The plan status is `planned-not-executed`: this repository has not run OpenMM,
PME, minimization, velocity initialization or that trajectory, and therefore
has no prepare/evaluation/replay receipt to pass downstream. Source and payload
digests are identity controls, not execution, authenticity, attestation,
redistribution-rights or license-clearance evidence. This is not equilibrated
or validated bulk water, density convergence, RDF/diffusion, low-salt, ion,
interface, dissolution/crystallization or industrial evidence, and it cannot
increase the score. The v0.4.2 and v0.4.3 contracts stay frozen. This additive
v0.4.4 namespace does not reorder the v0.5 NIST PFHub Benchmark 3 and Cantera
3.2 roadmap.

The additive v0.4.5 implementation supplies a future execution boundary for
that unchanged plan. It separates four states that must not be collapsed:

1. producer execution integrity — fresh bounded worker stages and one atomic
   outcome, with all producer scientific claims false;
2. independent payload assessment — raw-array recomputation of the frozen
   scientific gates and complete administrative receipt-chain validation;
3. execution/release provenance — final derived image identity, protected-main
   artifact identity and attestation, all currently absent;
4. presentation — an immutable 101-frame binary trajectory handoff whose GPU
   conversion and interpolation are explicitly non-physical derivatives.

The source now also contains the bounded protected execution program for those
states. `.github/workflows/openmm-tip3p-protected.yml` is manual-only and
requires protected `main`, the exact repository identity, Ubuntu 24.04 and
Linux/x86_64. Its first job keeps downloaded inputs, wheels and all raw producer
arrays inside one private runner directory; it verifies the pinned base index,
Linux/amd64 child and Dockerfile frontend, performs an offline-step image build,
runs the producer with no network, a read-only root, UID/GID 65532, all
capabilities dropped and fixed PID/memory/CPU ceilings, then invokes the host
independent verifier. A schema-valid receipt is still rejected unless
`status=verified-pass`, `gates.allPassed=true` and `scientificPass=true` while
every authenticity, reproduction, promotion and publication claim remains
false.

The job now extends that same-source boundary through one private browser
observer. It freezes the locked Linux Chromium distribution, an exact Node
24.16.0 executable and the single Rolldown 1.2.6 native binding needed by the
in-memory Vite build. The repository, producer artifact and control receipt
remain read-only and `noexec`; only that root-frozen, digest-checked Rolldown
file receives a child read-only executable mount. Three fresh mount/network/PID
namespaces run happy, dispose and context-loss modes against the same verified
OpenMM positions derivative and one shared world-session identity, while each
mode receives a fresh random capability. Each mode stops at an exact
37-rendered-frame barrier; happy explicitly continues to 101, while dispose and
context-loss revoke at 37 and retain the frozen count in their receipts. A temporary root-owned AppArmor
profile attaches to the exact frozen Chromium executable and grants `userns` to
the bounded Node/Chromium process tree; the workflow canaries it after entering
the profile and before retaining
`NoNewPrivs=1`, never disables Ubuntu's global restriction, never uses
`--no-sandbox`, and unloads the profile before deleting the private roots. The
mode receipts expose only commitments to the world session, V048/V049 metadata,
F32 positions, ordered position frames and packet. Their private receipts and
all runtime/source roots are deleted before artifact staging.

Only eight closed administrative source records plus one sanitized envelope may
leave the job as a nine-file artifact. The eighth source record is a
coordinate-free three-mode browser evidence summary; no PDB/XML input, wheel,
scientific array, Chromium archive/tree or mode receipt is in the upload path.
The attestation job has no checkout and executes no repository code; it bounds
and hashes every downloaded file, binds the envelope to all eight sources,
independently checks the browser evidence canonical bytes, self-digest,
source/control lineage, exact AppArmor-isolation boolean, cross-mode trajectory
commitments and false promotion/publication claims, verifies the
current GitHub artifact metadata, and attests only the envelope. The workflow's
complete bytes, step order, action SHAs, shell-program digests and raw-payload
exclusions are enforced by `scripts/workflow-policy.mjs`. This is implemented
source, not evidence that the protected job has run.

The private trajectory-to-world adapter is split at a build-time `server-only`
facade. It first obtains the ordinary no-binary verifier receipt, matches the
external canonical receipt byte for byte, and then performs a second bounded
read of the receipt-bound manifest and nine required artifacts using canonical
paths, single-link checks, `O_NOFOLLOW`, stable descriptor identity and exact
SHA-256/size validation. From those private bytes it derives the six Reference-A
channel descriptors and 101 immutable frame records. The returned session has
only offsets, lineage, digests and scalar step/time/energy readbacks—never a
`Buffer`, typed array or serializable coordinate payload. A real client-build
fixture proves that this filesystem capability cannot enter a Client Component.

The assessment receipt may record that the producer reports an OpenMM run, but
`openmmExecutionAuthenticated` and `executionAuthenticityVerified` remain
permanently false in the v0.4.5 control receipt. Even after the protected
workflow succeeds, a separate versioned attestation verifier must consume that
provenance and emit a new receipt; GitHub attestation does not retroactively
upgrade the scientific receipt. The pinned Python base-image
digests are not relabelled as the final derived OpenMM image digest. Raw Verlet
velocities keep their half-step time gauge, whereas OpenMM State kinetic energy
is the integrator-adjusted and velocity-constrained value at the position time;
only the latter closes the on-step State total energy. No v0.4.5 source-only
test result—including the workflow, evidence writer or server-only adapter
tests—changes the plan’s `planned-not-executed` status or authorizes a public
trajectory deployment.

## Additive v0.4.6 presentation and instancing boundary

The local v0.4.6 slice connects three previously separate contracts without
changing the V045 evidence or distribution boundary:

1. `tf.atomistic-presentation-frame/0.4.6` accepts the three exact F64LE
   channels of one validated V045 session frame, recomputes every source-byte
   digest, converts each component to explicit F32LE, and records both source
   and derived digests. The handle keeps the derived bytes in a private closure
   and returns fresh copies. It does not authenticate execution, interpolate a
   physical state, improve scientific precision or clear redistribution.
2. `tf.atomistic-instancing-plan/0.4.6` can only be created from a validated
   V045 session. It derives the locked 895-water PDB O-H-H order and 1,790 O-H
   structural adjacencies internally, binds all 101 source-frame position
   digests, and accepts coordinates only through the presentation handle. The
   runtime rehashes the F32LE bytes before updating its preallocated matrices.
3. `tf.atomistic-three-instanced-runtime/0.4.6` creates three persistent
   Three.js `InstancedMesh` objects: 895 oxygen sites, 1,790 hydrogen sites and
   1,790 structural O-H links. Oxygen and hydrogen share one unit-icosphere
   geometry. Matrix attributes are updated in place and marked dirty, bounds
   are recomputed, and `Raycaster` `instanceId` values resolve through the
   digest-bound atom-order map. Shared geometry, materials and meshes are
   disposed exactly once.

The structural cylinders represent topology adjacency and rigid-distance
constraints, not energetic bonds or bond order. Atom and link radii are
nonphysical display scales. No force, velocity, field, electron density or
interpolated layer is emitted. Constructing Three.js scene objects is not a
WebGL/WebGPU draw, measured draw-call count, FPS result or cross-platform
rendering receipt.

The original V045 server materializer deliberately still returns
`publicPayload:null` and no binary payload. An additive V046 server-only entry
now derives one real presentation handle from the exact three slices already
captured by the same stable, full-artifact read. It validates the monolithic
artifact and per-frame digests, copies into intrinsic `Uint8Array` inputs, and
does not reopen a trajectory after session construction. The returned record
contains only frozen metadata; a module-private `WeakMap` binds the F32 handle
to that exact object instance, so JSON, spread and structured-clone copies have
no capability. Source F64 bytes are unreachable after return, while private
derived F32 bytes remain resident for the lifetime of the handle. The handle is
a capture-time snapshot rather than proof that the current filesystem is still
fresh; source revision and session ID are lineage labels, never request-facing
authorization inputs.

The local integration tests still use synthetic digest-bound fixtures. A
protected same-job OpenMM-to-browser execution path is now implemented in the
manual workflow, but it has not run on protected `main`; consequently there is
still no protected replay evidence and no deployable public 2,685-site
trajectory. License clearance, authenticated execution, complete host-runtime
closure, release provenance and canonical-site gates remain separate. The
locked R2 score and the `planned-not-executed` OpenMM status do not change.

## Additive v0.4.10 NaCl{100}–water system boundary

The v0.4.10 namespace creates the first full crystal–water coordinate system
without pretending that coordinate construction is molecular dynamics. It is
separate from the executable eight-site direct-Ewald world and from the fixed
895-water OpenMM control shape.

The locked geometric system contains a 6×6×4 conventional-cell `Fm-3m` slab,
576 Na⁺, 576 Cl⁻ and 1,728 rigid TIP3P waters. Its orthorhombic cell is periodic
on all three axes and has two equally populated, neutral mixed `{100}`
interface sides with no vacuum. The NIST 26 °C lattice constant supplies initial
geometry only. A balanced six-orientation water grid supplies a deterministic
pre-minimization packing only. Every atom, residue, layer, surface role,
structural O–H link and rigid-water distance has an ordered identity and is
bound through one chained coordinate, topology, system and plan identity.

Five closed envelopes establish the future state-machine seam:

- `tf.nacl-water-interface-system/0.4.10` binds physical identity, source pins,
  composition, cell, coordinate recipe, candidate force family, readout classes
  and negative evidence claims;
- `tf.nacl-water-interface-coordinate-seed/0.4.10` closes all 6,336 atom
  records, 3,456 topology links, 5,184 constraints and the construction receipt;
- `tf.nacl-water-interface-plan/0.4.10` binds that full seed to the exact
  physical system;
- `tf.nacl-water-interface-action/0.4.10` binds a typed request to that exact
  system and coordinate seed; and
- `tf.nacl-water-interface-observation/0.4.10` returns either read-only
  geometric evidence or a complete fail-closed prerequisite decision.

These JSON Schemas are structural prefilters: ordinary Draft 2020-12 validation
cannot recompute a digest, enforce unique atom indices or prove that bond IDs
refer to the corresponding atom records. The exact runtime plan validator is
therefore mandatory and recomputes the locked plan, system and coordinate-seed
self-digests before any action or observation is admitted. A regression test
keeps a deliberately schema-valid but semantically forged plan on the rejected
side of that boundary. v0.4.10 deliberately left a separately implemented
cross-language verifier as the next portable-input prerequisite; v0.4.11 closes
that transport seam while retaining every solver gate.

The candidate OpenMM 8.6 TIP3P/Joung–Cheatham parameter file is not qualified
for solid NaCl, the aqueous interface or phase equilibrium. Protected pure-water
execution, a one-pair low-salt PME control, dry mobile-slab stability and an
independent solid/interface potential-domain qualification are all absent. The
action evaluator therefore blocks preparation and mobile dynamics with
`solverInvoked:false`. Future trajectory, force, density, orientation and
coordination readouts cannot be emitted by this geometric source.

Those four receipts would gate only a non-promotional solver trajectory. They
do not supersede the v0.4.2 bulk-concentration, uncertainty or finite-size
ladder, which must still pass before hydration, detachment, dissolution,
crystallization or kinetic interpretation.

The v0.4.11 cross-language handoff closes the previously stated portable-input
gap without widening solver authority. A create-only TypeScript exporter fixes
the exact plan wire bytes. A standard-library-only Python importer uses an
independent no-LF digest implementation, reconstructs the six chained
preimages, geometry, topology, charge/mass and periodic-cell invariants, and
emits typed read-only arrays plus an identity ledger. A separate Node verifier
reopens and decodes every artifact and checks both the semantic root and receipt
self digest. The receipt remains in the
`semantic-import-integrity-only-not-solver-admission` status domain; OpenMM
import, system compilation, solver execution and every promotional claim stay
false. See [the v0.4.11 import contract](NACL_WATER_INTERFACE_V0411_IMPORT_CONTRACT.md).

The browser renderer may be generalized to four instanced site batches only
after it consumes a verified trajectory observation. It may not use this
coordinate seed as animated evidence. Source F64 endpoints, cells, velocities,
forces and energies must remain bound together; presentation F32 conversion,
camera state and playback cadence stay downstream. The full boundary is in
[the v0.4.10 contract](NACL_WATER_INTERFACE_V0410_CONTRACT.md).

## Bounded v0.4 molecular-dynamics foundation

The local v0.4 slice adds a second, typed water-dimer path without replacing or
coupling to the R2 `tf.world/0.3` thermochemical state. It is intentionally
limited to two fixed-orientation rigid TIP3P bodies:

- `tf.molecular-world-state/0.4`, `tf.molecular-action/0.4` and
  `tf.molecular-observation/0.4` define the state, actions and readout;
- the only integrated degrees of freedom are the two centers of mass and their
  translational velocities; atom coordinates are reconstructed from fixed
  body-frame offsets, and reported torque is not integrated;
- the force model sums all nine cross-molecule fixed-charge Coulomb pairs and
  the O–O Lennard–Jones pair; there is no intramolecular potential because the
  monomer geometry is fixed;
- a fixed-step kick–drift–kick Velocity Verlet transition advances a vacuum,
  isolated constant-energy target at `dt = 0.0005 ps`, with no more than
  `10,000` cumulative steps (`5 ps`);
- the maximum energy excursion is normalized by
  `max(abs(initial total energy), 1 kJ mol⁻¹)` and must stay at or below
  `1e-4`; an ordinary-least-squares energy-drift slope and relative rate are
  also accumulated and serialized as finite diagnostics, not substituted for
  that envelope gate;
- momentum, internal-force, center-of-mass, rigid-bond, rigid-angle,
  separation, finiteness and step-cap checks fail closed;
- a physical digest distinguishes physical equivalence from the full state
  digest and lineage. Exact deterministic continuation, branching, schema and
  semantic restoration checks, digest verification and transactional rollback
  are part of the contract.

The parameters are transcribed from the OpenMM 8.5.1 TIP3P XML snapshot, but
the local TypeScript force kernel and integrator execute them: OpenMM itself is
not invoked. MatterSim and MACE are also not invoked by this path, so it cannot
upgrade their existing `runtime-frozen-not-reproduced` status or stand in for
the still-unreproduced full Random-TP benchmark. NaCl remains static. This is a
bounded integrator and state-integrity foundation, not full molecular dynamics,
electronic structure, a real-material calibration or an industrial prediction.
The exact numerical and claim contract is recorded in
[Molecular dynamics](MOLECULAR_DYNAMICS.md).

The heat field represents an independent carrier; it is not claimed to be a coarse graining of the same particle degrees of freedom. A/B are passive internal labels, not chemical species or bonds. No coefficient is calibrated to a real material. The thermochemical solver contains no electronic structure, true reactive potential, three-dimensional physical degrees of freedom, phase equilibrium, convection, turbulence, reactor or process equipment. Argon constants only provide an approximate interpretation of reduced time and temperature.

## System components

- **Tailing Core** — state, transition, bridge and observation contracts;
- **Tailing Foundry** — future data ingestion, calibration, active learning and lineage;
- **Tailing Lab** — the microscopic-to-process user surface;
- **Tailing Sentinel** — independent evaluation, comparator registry and next-iteration gaps.
