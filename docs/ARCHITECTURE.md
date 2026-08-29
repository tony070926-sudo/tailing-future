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
  locked R5 summaries contain a nested positive promotion claim; accepted
  replicas remain **0 / 2**. This Commit-P candidate actively quarantines the
  legacy path and prepositions a versioned v2 runner without selecting or
  executing it. After P has a protected, immutable merged SHA, Commit S may
  select it non-circularly for entirely fresh runs; a controlled verifier must
  authenticate those runs before a later Commit F freezes anything and before
  the complete 693-record independent verifier can run;
- a browser frame assembled from one immutable observation snapshot.

The heat field represents an independent carrier; it is not claimed to be a coarse graining of the same particle degrees of freedom. A/B are passive internal labels, not chemical species or bonds. No coefficient is calibrated to a real material. The solver contains no electronic structure, true reactive potential, 3D geometry, phase equilibrium, convection, turbulence, reactor or process equipment. Argon constants only provide an approximate interpretation of reduced time and temperature.

## System components

- **Tailing Core** — state, transition, bridge and observation contracts;
- **Tailing Foundry** — future data ingestion, calibration, active learning and lineage;
- **Tailing Lab** — the microscopic-to-process user surface;
- **Tailing Sentinel** — independent evaluation, comparator registry and next-iteration gaps.
