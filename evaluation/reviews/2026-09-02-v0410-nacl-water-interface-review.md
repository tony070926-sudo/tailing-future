# Independent review — v0.4.10 NaCl{100}–water geometric interface

Date: 2026-09-02
Scope: additive static coordinate/system/action/observation contract only
Implementation author and evaluators: separated; all evaluator passes were
read-only

## Decision

**CONDITIONAL APPROVE for a local static geometric-contract commit only.**

This review does not approve scientific promotion, a solver trajectory, a
Cloudflare release represented as dynamics, or any hydration, detachment,
dissolution, crystallization, phase-equilibrium or kinetic claim. All four
solver-admission receipts remain absent and every such action remains
fail-closed with `solverInvoked:false`.

## Independent roles

- **Scientific Evaluator** checked the Fm-3m construction, plane neutrality,
  surface/interior coordination, TIP3P geometry, formal/model charge split,
  water placement, PBC interpretation and action/observation trust seam.
- **SOTA Scout** checked primary-source pins and claim boundaries against NIST
  Circular 539 volume 2, OpenMM 8.6 Amber14/TIP3P, Joung–Cheatham, DaRUS 2726,
  O'Neill et al. 2024 and the AIDO Cell product/research descriptions.
- **Gap Planner** adversarially tested schema-versus-semantic validation,
  caller-supplied plan forgery and the exported minimum-distance audit.

No evaluator implemented or edited the candidate.

## Findings and disposition

| Severity | Finding | Disposition in this slice |
|---|---|---|
| P1 | JSON Schema can accept an in-range coordinate/species/index mutation because it cannot recompute SHA-256 or resolve cross-record topology. | Added an explicit schema-valid/semantic-invalid regression. Documentation now calls all five schemas structural prefilters. The runtime exact validator remains mandatory. A separate cross-language verifier is still required before solver export. |
| P1 | Digest serialization ignored extra object properties whose value was `undefined`. | The plain-data trust boundary now rejects `undefined` recursively. Nested system and atom regressions cover the former bypass. |
| P1 | Caller-supplied forged plans could otherwise substitute gates/readouts. | Every action and observation seam validates the supplied plan against locked plan, system and seed identities before use. |
| P1 | Four local gates could be misread as the complete scientific route. | They are now named solver-admission gates and admit, at most, a non-promotional trajectory. The v0.4.2 bulk-concentration, uncertainty and finite-size ladder still gates scientific interpretation. |
| P2 | Minimum-distance audit initialized to `a/2` and trusted `atomIndex` as an array address, producing a false positive for a single synthetic molecule. | Initialization is now infinity; atom-index bijection, coordinate domain and at least two molecule identities are checked first. Same-molecule, duplicate-index, reversed-array and out-of-cell regressions are rejected. |
| P2 | Construction labels could be mistaken for permanent phase/interface membership under 3D PBC. | The contract now states that region, surface-role and phase fields are seed labels only. Future frames must use unwrapped image counters, per-frame re-binning and a defined moving-surface reference. |
| P2 | Heavy exact-plan tests had insufficient timeout headroom under concurrent load. | Heavy tests have a 60 s execution budget without changing any scientific threshold or assertion. |

## Independent geometric audit

The review reproduced the following construction facts from the emitted seed:

- 6×6×4 conventional Fm-3m cells;
- 576 Na and 576 Cl sites in eight neutral mixed `(001)` planes, an equivalent
  member of `{100}`;
- five opposite-ion nearest neighbors for surface sites and six for interior
  sites;
- 1,728 rigid TIP3P waters, 864 on each construction side, with balanced six
  cardinal orientation counts;
- 6,336 atoms, 3,456 structural O–H links and 5,184 rigid constraints;
- total formal charge and total force-model point charge both zero;
- lower-water maximum z below the first crystal plane and upper-water minimum z
  above the last crystal plane;
- actual outer-plane span `3.5a`, distinct from the nominal `4a` slab extent;
- minimum ion–water site separation about `0.26000365 nm`; and
- locked plan/system/coordinate identities reproduced by the exact validator.

The NIST lattice constant is an experimental geometric seed, not a force-field
equilibrium. The regular water grid is not liquid equilibrium. The minimum
separation is an overlap gate, not evidence that the interface is physically
relaxed.

## Primary-source/SOTA boundary

- NIST/NBS supports the Fm-3m identity, four NaCl formula units per
  conventional cell and `a = 5.6402 Å` at 26 °C.
- OpenMM 8.6 provides the pinned Amber14/TIP3P/Joung–Cheatham candidate bytes;
  successful parsing would not establish solid/interface suitability.
- Joung–Cheatham reports substantial TIP3P NaCl phase-equilibrium limitations,
  so saturation or phase-equilibrium claims remain prohibited.
- DaRUS 2726 is only a future public-script rebuild comparator: its public
  generator does not lock the corresponding random seed/trajectory, and its
  restrained crystal and different water/ion family cannot validate this
  mobile TIP3P/Joung–Cheatham interface.
- O'Neill et al. informs future multiseed event design, not a reproduced result.
- The present action/observation envelope is AIDO-inspired but does not yet
  provide AIDO Cell persistence, clone, branch, restore, replay, learned-state
  transition or capability parity.

DaRUS, Joung–Cheatham and O'Neill are not yet entries in the machine-validated
comparator registry and therefore do not enter a numerical ranking. The next
registry refresh should separately verify DaRUS V1 (`10.18419/darus-2726`) and
pin the O'Neill repository at commit
`b7a70d56ec51e9d90f129dc35e8e4ea06e3aea4f`; neither may be promoted beyond a
versioned design reference without an admissible local reproduction receipt.

## Remaining hard prerequisites

1. Build an independent Python/OpenMM semantic importer and digest-bound import
   receipt; verify exact atom/topology identities and reject adversarial payloads
   before any GPU loader runs.
2. Version and execute four independent gate receipts: protected pure-water,
   low-salt PME, dry mobile slab, and a complete potential-domain qualification
   including non-uniform-interface dispersion/cutoff sensitivity.
3. Only after those gates, produce a non-promotional F64 trajectory with
   conservation and cross-platform receipts. Bulk concentration, uncertainty,
   event-count and finite-size gates remain additional prerequisites for any
   hydration, dissolution, crystallization or kinetics interpretation.

The locked score remains unchanged. This static contract is not reproduced
OpenMM evidence, a learned world model, an industrial simulator or a deployment
approval.
