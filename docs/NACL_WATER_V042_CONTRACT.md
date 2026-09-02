# NaCl–Water v0.4.2 science contract

Status: executable local finite-size integration calibration; release
provenance is rejected. Direct Ewald, selected intramolecular Coulomb
correction, plain-cutoff Lorentz–Berthelot Lennard-Jones composition,
constrained Velocity Verlet/RATTLE and the locked eight-site world have local
executable evidence. A local 10,000-step / 10 ps cold-start verifier passes its
locked gates, but its exact report has not been emitted and bound by protected-
main CI as a release artifact. This document does not claim OpenMM/PME
reproduction, bulk-water or dilute-solution observables, hydration
thermodynamics, a dissolution event or release acceptance.

## Why this is the next layer

Tailing Future follows the useful systems pattern in AIDO Cell without treating
GenBio AI's vendor-reported biological results as a materials benchmark. AIDO
Cell describes a persistent shared state, action-conditioned transitions,
branch/restore operations and multiple readouts decoded from the same state.
For the material world this becomes:

```text
chemical identity and topology
  -> electrostatic and short-range interactions
  -> constrained atomistic dynamics
  -> hydration, diffusion and interfacial events
  -> concentration, chemical potential and interfacial-energy readouts
  -> phase-field, transport and process-control states
```

The atom positions, velocities, forces, constraints, cell and accumulated time
remain the authoritative state. RDF curves, coordination shells, trajectories,
force arrows and future coarse-grained fields are readouts; querying or hiding
a readout must not mutate that state.

Primary architecture sources:

- GenBio AI, AIDO Cell 1.0 release and product description (2026-08-18):
  <https://genbio.ai/aido-cell-simulator/>
- GenBio AI, AIDO perspective and modular-to-integrated sequence:
  <https://genbio.ai/research/AIDO.pdf>

The AIDO capability and benchmark numbers remain claim-class evidence owned by
GenBio AI. They are not locally reproduced and must never contribute a numeric
Tailing Future materials score.

## Candidate A: direct Ewald reference

The first periodic electrostatics implementation is a deterministic direct
Ewald sum. It is an auditable small-system reference for a later PME
implementation, not PME itself and not a production-scale solver.

Required contract:

- fully three-dimensional periodic, right-handed fixed cell;
- explicitly neutral charge set; a non-neutral cell fails closed instead of
  silently introducing a uniform background charge;
- real-space, reciprocal-space and self terms reported separately;
- conducting (tin-foil) outer-boundary convention, with no unreported surface
  or dipole correction;
- vacuum electrostatic prefactor (`relativePermittivity = 1`) because solvent
  screening is represented by explicit water sites; a continuum dielectric is
  a different model and fails this contract;
- explicit splitting parameter, real-space lattice bound and reciprocal index
  bound, all included in evidence and deterministic digests;
- analytical atom forces consistent with the reported finite sum and energy;
- deterministic atom and lattice-vector ordering;
- coordinates enter as an already wrapped fractional vector in `[0, 1)` plus
  a separate bounded integer image counter; the counter is a lattice gauge and
  never enters floating-point phases or displacements;
- no exclusions, 1-4 scaling, polarizability, charge transfer, slab correction
  or reciprocal-space virial unless separately implemented and tested.

The direct sum must pass finite-difference force checks, net-force closure,
integer lattice-translation invariance, atom-order permutation invariance and a
convergence table against a more tightly truncated direct-Ewald calculation.
Changing the Ewald split while tightening both sums should approach the same
finite reference within a locked tolerance.

Formula and implementation comparators:

- GROMACS long-range electrostatics reference manual:
  <https://manual.gromacs.org/documentation/current/reference-manual/functions/long-range-electrostatics.html>
- OpenMM theory guide, Ewald and PME sections:
  <https://docs.openmm.org/latest/userguide/theory/02_standard_forces.html#coulomb-interaction-with-ewald-summation>

Those documents explain the comparator algorithms. Passing local unit tests is
not an OpenMM or GROMACS reproduction.

## Candidate B: SHAKE/RATTLE reference

The constraint layer operates on atom coordinates and velocities, rather than
moving a pre-rendered rigid glyph. Each constraint is a target interatomic
distance and is solved with mass-weighted corrections.

Required contract:

- position projection satisfies every squared-distance constraint;
- velocity projection satisfies the time derivative of every constraint;
- constraints spanning a periodic face use one consistent unwrapped molecular
  image during an iteration, represented in an origin-free local lattice frame
  so a large common integer image cannot erase fractional coordinate bits;
- canonical constraint ordering and deterministic convergence reporting;
- explicit relative/absolute tolerance and maximum iteration count;
- non-convergence, zero/negative mass, duplicate constraint and singular
  geometry fail closed;
- internal constraint impulses preserve total linear momentum to numerical
  tolerance;
- constraint application never creates or deletes atoms and never changes
  their masses or charges.

The reference algorithms are the original SHAKE and RATTLE methods:

- Ryckaert, Ciccotti and Berendsen, *J. Comput. Phys.* 23 (1977) 327–341,
  <https://doi.org/10.1016/0021-9991(77)90098-5>
- Andersen, *J. Comput. Phys.* 52 (1983) 24–34,
  <https://doi.org/10.1016/0021-9991(83)90014-1>

The first implementation is a deterministic iterative reference. It does not
claim SETTLE, LINCS, GPU acceleration or bit-exact agreement with another MD
package.

## Force-field pin before a NaCl–water trajectory

Water and ion parameters are one compatible model family, not mix-and-match
element styling. The existing static water dimer is transcribed from the bare
OpenMM 8.5.1 `tip3p.xml`; that file does not by itself establish compatible
Na+/Cl- parameters.

Candidate inputs are frozen separately:

| Asset | Role | Bytes | SHA-256 of raw OpenMM 8.5.1 bytes |
|---|---|---:|---|
| `wrappers/python/openmm/app/data/tip3p.xml` | current water-only geometry/parameter provenance | 891 | `607f0fc9566c3770db2d9eb579fed68c4157578445eed1ec0aa7dccc23d57a6c` |
| `wrappers/python/openmm/app/data/amber14/tip3p.xml` | proposed TIP3P plus water-compatible monovalent-ion comparator | 19,070 | `3f4b188dbcb6c02863230eaca231e927fb6bf3307ce947d8a50d0f46f6dd83d9` |

Pinned source commit:
<https://github.com/openmm/openmm/blob/f7fa0c27c1f8d943c339d67b3bf22f026d0bd8b5/wrappers/python/openmm/app/data/amber14/tip3p.xml>

The combined asset now has a pinned source-byte receipt, schema-bound units and
exact parameter-extraction tests. Hydrogen's source sigma is preserved as the
literal `1 nm` even though its zero epsilon makes that sigma energetically
inactive; chloride's full binary64 literal and the H–H distance derived from
the XML radian literal are also preserved. This is primary-source parameter
extraction, not OpenMM execution or reproduction. License clearance and an
independently generated OpenMM single-point/trajectory comparator remain
required before promotional or external-reproduction claims.

## Required v0.4.2 topology break

The v0.4.1 argon contract remains immutable. Aqueous dynamics needs a new
versioned topology and schema rather than overloading the short-range argon
fields:

- electrostatics is one cell-global solver with separate real, reciprocal,
  self, surface and exception terms, not another radial pair term;
- atoms belong to explicit molecules/residues and constraints are independent
  of energetic bonds;
- nonbonded exceptions identify excluded or scaled intramolecular Coulomb and
  Lennard-Jones pairs, including the H–H 1–3 pair of a rigid three-site water;
- a zero Lennard-Jones epsilon is represented explicitly instead of inventing
  a positive hydrogen interaction;
- constrained degrees of freedom are subtracted from the temperature
  estimator, and thermostat/barostat degrees of freedom remain absent until
  their algorithms are implemented;
- the observation separates total, short-range, reciprocal and constraint
  forces/impulses and does not label a short-range pair virial as the full
  electrostatic stress.

No v0.4.1 serialized state may be silently reinterpreted under this contract.

## Ordered calibration systems

1. **Electrostatic oracle:** a small neutral charge set in orthorhombic and
   triclinic cells. No water-model or dissolution claim.
2. **Rigid-water oracle:** one and then several three-site waters, including a
   molecule crossing each periodic face. Constraint projection only.
3. **Finite-size integration calibration:** two rigid TIP3P waters plus one
   Na+/Cl- pair in a periodic cell, including one water spanning a periodic
   face. This eight-site system exists only to bind the force composer,
   constraints, transactions, digests and rendering contract. It is not bulk
   water, a dilute solution or a statistically meaningful hydration system.
4. **Finite-concentration low-salt control:** a neutral ion pair in a periodic
   water box. Lock molality and finite-size comparisons, then report energy
   components, constraint residuals, equilibration and conservation before
   structural observables; use `bulk` or `dilute` only after those gates pass.
5. **Bulk concentration series:** compute Na–O, Cl–H, Cl–O and O–O RDFs,
   coordination numbers, mean-squared displacement and diffusion estimates
   with equilibration, block uncertainty and finite-size disclosures.
6. **NaCl surface:** add a charge-neutral rocksalt slab with explicit surface
   termination. Only after bulk gates pass may ion detachment, hydration,
   terrace/step motion or nucleation be reported.

No single spontaneous visual event is evidence of a dissolution rate,
nucleation free energy or industrial condition.

## Staged gates for the local 3D scene and later promotion

The numerical, determinism, rendering-truth and claim-boundary rows gate the
local scene. Parameter provenance must record the current license status; it
does not imply clearance. License clearance and an independently generated
external-engine receipt are separate promotion gates before distributing or
describing the result as an external reproduction.

| Gate | Minimum evidence |
|---|---|
| Electrostatic energy/force consistency | central finite difference over every charged atom and axis |
| Ewald convergence | locked loose/medium/tight truncation table with a tighter reference |
| Translational invariance | common Cartesian and independent integer-lattice translations |
| Constraint closure | all O–H and H–H distances plus their velocity derivatives within locked tolerance |
| Conservation | charge and mass exact; NVE momentum and energy within locked thresholds after constraints |
| Determinism | same state/action/seed yields identical canonical state and observation digests |
| Parameter provenance | exact source bytes, digest, explicit license status and unit-conversion receipt; an uncleared status remains a promotion stop |
| External comparison | independently generated OpenMM energy/force/trajectory receipt for the exact same input; required for an external-reproduction claim, not silently inferred from the local reference |
| Rendering truth | every visible position, bond, shell, vector and trajectory segment points to one observation field |
| Claim boundary | no PME, electronic density, reactive chemistry, rate or industrial optimization claim without its own evidence |

## Visual truth contract

The NaCl–water scene may render compact element-identified interaction sites,
actual constrained water geometry, topology bonds, periodic molecular images,
solver forces and velocities, geometrically derived coordination shells and
trajectories split at periodic crossings. A Lennard-Jones sigma shell must be
named as a force-field parameter shell, not an ionic, electronic or nuclear
radius. A hydrogen-bond line must be labeled as a geometric analysis rule unless
its energy model is explicitly evaluated. A smooth field or isosurface must name
the scalar data, grid, units, zero convention and digest that generated it.
Complete Ewald virial, pressure, stress, electrostatic-potential grids, electron
density, orbitals, polarization, charge transfer, bond breaking and uncomputed
field lines remain hidden until their own solver evidence exists.

## Current local 3D and long-run evidence

The local v0.4.2 candidate now composes the numerical references into one
eight-site periodic NaCl–TIP3P world and exposes two independently bounded
readout paths:

- the long verifier executes 10,000 accepted `0.001 ps` NVE steps, records
  10,001 audit samples and checkpoints, checks 14 locked numerical/accounting
  gates, and performs an exact independent replay of only the first 10 accepted
  steps;
- the UI adapter accepts only the exact frozen step-0 or step-1 observation,
  so the interactive scene is two audited frames and is not presented as the
  10,000-step trajectory;
- a pure scene projection places each intact molecule in a `sodium-na`-anchored
  unique minimum-image gauge while the 12-edge triclinic cell remains in its
  display-zero reference; it emits exactly eight selectable atom/ion sites,
  four structural O–H constraints, two optional H–H constraint diagnostics,
  only the six actually evaluated LJ pairs in the locked fixture, and the
  selected atom's total plus five source force components;
- the client creates an explicit WebGL2 context with depth testing, a
  perspective camera, Raycaster selection restricted to the eight real sites,
  coalesced on-demand rendering, keyboard-equivalent controls, a semantic data
  fallback, and context-loss restoration from the same frozen observation.

All atom/site radii and force-arrow lengths remain labeled display transforms.
The long report's self-digests prove internal consistency, not execution
authenticity. Until the exact report and browser bundle are produced by the
bounded protected-main release guard, the evidence class remains local and no
score, champion, release or deployment claim changes.

## Additive v0.4.3 exact-endpoint UI bridge

The local v0.4.3 bridge is a new schema family; it does not relax the v0.4.2
step-0/step-1 adapter or reinterpret the long verifier's summary samples as
renderable coordinates.

- a primary fresh world and an independent fresh replay each execute exactly
  10 accepted `0.001 ps` steps and retain all 11 complete observations;
- every sample binds its parent state, integration receipt, observation,
  v0.4.3 render frame and previous sample digest;
- the bundle is admitted only when primary and replay sample digests match at
  every index, with separate primary and replay work accounting;
- timeline play, previous/next and range seek select only those accepted
  endpoints, perform no solver call and use no renderer interpolation;
- the trajectory scene binds the bundle, ordered trajectory and selected sample
  digests, and uses source-unwrapped molecule anchors plus minimum-image rigid
  water placement in a fixed display epoch;
- selection, camera, layer toggles, playback cursor and frame cadence remain
  display state and cannot alter observation, physical or trajectory digests.

This bridge demonstrates clock separation and auditable motion only for the
locked eight-site, 10-step finite-size calibration. It is not evidence for
bulk water, a NaCl slab-water interface, equilibrium, diffusion, dissolution,
crystallization, concentration response or external-engine reproduction. The
next scientific system must be a new contract and must not be implemented by
increasing the atom count inside this fixture.
