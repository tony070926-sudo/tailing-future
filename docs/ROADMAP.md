# Roadmap

## R0 — trustworthy core

Status: current candidate.

- immutable world state and typed module roles;
- deterministic LJ solver, observation, branch and replay;
- numerical verification suite;
- truth-labelled browser visualization;
- Sentinel scorecard and comparator registry.

## R1 — independently verified modules

- dataset manifests for Materials Project, JARVIS, NOMAD and Open Catalyst subsets;
- like-for-like evaluation of at least two open atomistic foundation potentials;
- LAMMPS and Cantera offline reference jobs;
- model cards, licenses, cost and OOD limits.

## R2 — first real scale bridge

- choose one narrow porous heterogeneous-catalyst system;
- adsorption/reaction energies → microkinetics → effective transport;
- PFHub phase-field benchmark;
- unit, sensitivity, conservation and uncertainty tests.

## R3 — equipment coupling

- validated porous-pellet or single-reactor model;
- continuum hot spots and transfer limits;
- reference solver replay and lab/pilot calibration.

## R4 — process world model

- IDAES dynamic flowsheet and process constraints;
- common state across reactor and flowsheet;
- AI candidate recommendations only in shadow mode;
- independent high-fidelity replay before any recommendation is shown.

## R5 — Foundry loop

- active learning chooses the next valuable calculation or experiment;
- new evidence updates the model and its validity domain;
- champion/challenger evaluation remains isolated.

## R6 — controlled industrial advisory

- application-specific V&V and calibrated uncertainty;
- HAZOP/LOPA and enterprise change-control integration;
- engineer-facing candidates with traceable evidence;
- still no direct autonomous control of safety-critical equipment.
