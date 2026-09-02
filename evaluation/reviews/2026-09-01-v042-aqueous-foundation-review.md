# v0.4.2 aqueous numerical foundation — independent review

Date: 2026-09-01
Disposition: **CONDITIONAL ACCEPT — reference kernels and foundation-only verification**
Promotion: **not requested; R2 remains the conditional champion at 41/100**

## Scope

The review covers the local direct-Ewald reference, periodic SHAKE/RATTLE
projection reference, their deterministic aggregate, the OpenMM source-metadata
pins, Sentinel integration, evaluation-report schema and claim boundaries. The
evaluator did not approve its own implementation; an independent read-only
agent constructed counterexamples, reran the numerical gates and reviewed the
frozen-snapshot integration.

## Review rounds

1. **Initial architecture audit — NOT READY.** The v0.4.1 Argon schema cannot
   represent molecules, independent constraints, nonbonded exceptions, zero-LJ
   sites, constrained degrees of freedom or complete electrostatic stress.
   Therefore v0.4.1 remains immutable and no aqueous world was created.
2. **Numerical-kernel audit — two P1 issues found and closed.** Large unwrapped
   Ewald coordinates lost fractional bits near an integer image of `1e9`; the
   API now accepts a wrapped coordinate plus a separate ignored image gauge.
   SHAKE/RATTLE originally formed huge absolute Cartesian coordinates; it now
   projects in an origin-free component-anchor frame. Exact `1e9` Ewald and
   `1e8` rigid common-image regressions permanently cover both cases.
3. **Foundation aggregate audit — CONDITIONAL ACCEPT.** All 15 gates passed,
   including rocksalt point-charge Madelung energy, triclinic central-difference
   forces, Ewald split/cutoff convergence, fail-closed domain/work budgets,
   exact TIP3P distances, velocity derivatives, component COM and momentum,
   inconsistent periodic-loop rejection and deterministic evidence digest.
4. **Sentinel/report audit — two reporting P1 issues found and closed.** The
   evaluation schema now locks the foundation-only status, all 15 successful
   gate keys, immutable source pins, ten unsupported-capability booleans, five
   exact boundary statements and the verification digest. Negative tests reject
   promotion, reproduction, PME/OpenMM execution, pin drift, missing digest,
   failed gates, misleading boundary text and unknown fields. Markdown reports
   the actual passed-gate count and the worker separately asserts all ten
   unsupported boundaries remain false.

## Reproduced local evidence

- Foundation aggregate: `15/15`; digest
  `sha256:0abc4a826a72836e41fa5b32e00c2a2e57b85041bde349f5af26d8f461b1be3b`.
- NaCl rocksalt point-charge Madelung absolute error:
  `2.2737367544323206e-12 kJ/mol`.
- Triclinic finite-difference maximum force error:
  `3.78185e-9 kJ/mol/Å`.
- TIP3P maximum position / velocity-derivative residuals:
  `6.81e-13 Å` / `6.72e-13 Å²/ps`.
- TIP3P component-COM / momentum changes:
  `2.82e-14 Å` / `1.33e-15 Da·Å/ps`.
- OpenMM assets were independently checked at commit
  `f7fa0c27c1f8d943c339d67b3bf22f026d0bd8b5`; they remain unbundled source
  metadata with `executionPerformed=false` and no license-clearance claim.

## Remaining world-promotion blockers

- no intramolecular exception correction, reciprocal/exception virial or
  supported electrostatic surface variants;
- no full constrained Velocity Verlet/RATTLE transition, SHAKE displacement
  velocity synchronization, constraint impulse/virial/energy audit, constrained
  temperature DOF or world-level atomic rollback;
- no compatible aqueous topology/state/schema, Lennard-Jones/combination rules,
  dispersion correction, restore semantics or solver-bound rendering;
- no OpenMM single-point or trajectory reproduction and no parameter or project
  license clearance;
- no NaCl–water trajectory, hydration/dissolution observable, stress result,
  cross-platform evidence or industrial conclusion.

The next accepted slice must address those blockers in a new v0.4.2 world
contract. These reference kernels must not be described as the world itself.
