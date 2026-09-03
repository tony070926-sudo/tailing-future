# Full-candidate execution preflight and runtime-input freeze — independent review

Date: 2026-09-04

Implementation disposition: **LIMITED GO only for the exact, non-executable
preflight and private runtime-input freeze described here**

Inference, comparison, promotion, release and deployment disposition:
**NO-GO**

The reviewed source has no open P0 or P1 finding. It freezes authenticated
runtime-input bytes, one shared-host execution topology and quantitative
acceptance contracts. It does not add or enable an executable producer. No
MatterSim or MACE 693-record campaign was run, no prediction or error was
produced, and no scientific score changed.

This record is intentionally source-scoped. To avoid a self-referential hash,
it records the exact pre-record tree reviewed by the independent agents but
cannot embed the final tree, source-manifest digest or production artifact
digest that includes its own bytes. Acceptance of this record requires a
subsequent complete gate run, deterministic evaluator refresh, 404-file
manifest reconstruction, production rebuild and final freeze without editing
this file. Any later edit makes that evidence stale.

## Frozen bounded hypothesis

The round tested one bounded hypothesis:

> Tailing Future can recover the exact MatterSim and MACE Python runtime inputs
> from the already authenticated two-replica S→V→F bootstrap evidence, freeze a
> truthful shared-host topology for a future full campaign, and hard-gate that
> preflight while keeping every dispatch and scientific claim disabled.

The selected topology is profile A: one private host job, two sequential model
lanes, and two fresh containers per lane. Each model has one authoritative
693-record execution and one separate 693-record repeat-validation execution.
That is four container executions total, 1,386 authoritative prediction
records and 1,386 repeat-validation records. The lanes share a host and job,
so independent-job, independent-hardware and independent-replica claims are
explicitly forbidden. A label-bearing host verifier may start only after all
four containers have exited.

Profile B, a multi-job partition/aggregation topology, was not selected. It
would expand the label, transfer and aggregation trust surface without solving
offline per-ID recomputation after ephemeral-runner disposal. It remains only
a fallback if profile A later fails a preregistered resource or timeout gate.

Acceptance required all of the following:

- exact-byte and semantic binding of the checked-in preflight, predecessor
  plan, scientific plan, schema, two dependency locks and two runtime-input
  manifests;
- re-reading the frozen runtime lock, signed bootstrap receipt and Sigstore
  bundle, then projecting repository, workflow, run, attempt, conclusion,
  artifact and stable-runtime fields rather than trusting copied prose;
- exact topology arithmetic: two models, two fresh containers per model, 693
  records per execution, four executions total, and separate 1,386-record
  authoritative and repeat-validation populations;
- network-disabled, read-only-root, capability-dropped model containers with
  no labels, host sockets, secrets or shared writable mounts, plus required
  read-denial and exact mount/environment canaries before dispatch;
- every scientific quantity declaring unit, dimension and basis;
- preregistered per-model completeness, 40 invariance cases, 89 force
  finite-difference cases and 60 stress finite-difference cases, with exact
  methods, steps, absolute/relative tolerances and no post-hoc stress-sign
  selection;
- preserving the unresolved Python/JavaScript stress-symmetry tolerance as a
  dispatch blocker instead of averaging or silently selecting a threshold;
- all eight dispatch gates and all nine positive scientific claims remaining
  false, publication disabled, and the artifact allowlist empty;
- direct executable proof that the unchanged
  `tf.atomistic-full-candidate-plan/0.2` receipt rejects same-job model
  partitions rather than reinterpreting that historical contract;
- schema and policy mutation tests that must fail at the expected leaf or
  policy path, so a broad digest or object-level `const` failure cannot mask a
  missing field gate;
- evaluator integration that sends every preflight failure to the hard-gate
  list; and
- no change to `tf.world/0.3`, `tf.action/0.3` or `tf.observation/0.3`.

The Builder could implement and self-check this candidate but could not approve
it. The reviews below do not replace executable validation, cryptographic
verification, an independent solver, a model campaign, experiments or
qualified engineering approval.

## Live baseline and conflict isolation

The round used live observations rather than the goal snapshot.

- Work was isolated in
  `/Users/tonywilliam/Documents/ChatGPT/Tailing Future-v05-producer` on
  `codex/v05-full-producer-preflight`. The original dirty
  `codex/causal-mechanism-foundation` worktree was not modified.
- Local `HEAD`, `origin/main` and live `refs/heads/main` were
  `f9404264778ffe467e3a4a122c542dfcd55bedd6` at the review freezes.
- Main Sentinel run `33795074739` completed successfully for that exact SHA;
  reporter run `33797771964` was skipped. These are current-main observations,
  not candidate CI.
- Main protection still required strict `evaluate`, enforced administrators
  and linear history, and disallowed force-pushes and deletions.
- The protected canonical Cloudflare site returned HTTP 200 with title
  `Tailing Future — 材料世界模型实验室`. This observed the already deployed
  main site; the candidate was not deployed.

## Frozen runtime inputs and source chain

The candidate checks in only the four accepted runtime-input files derived
from the authenticated bootstrap evidence:

| Model / input | Bytes | SHA-256 |
| --- | ---: | --- |
| MatterSim dependency lock | 16,233 | `9c990909d1307bb32608d31b9ed217d2368c28e2048f6dec39e8dc4a2b63642b` |
| MatterSim runtime-input manifest | 157,190 | `203acc5ec09c2e76a819ff384573c2c0aca1316f90c53f2e735c98e9daab5c53` |
| MACE dependency lock | 4,612 | `ae4b21b6f6d8ad98edcf2d5e0d938cd563379f494cce0b4aaa2e987332147e33` |
| MACE runtime-input manifest | 55,251 | `6bb7f79c5380bb54b0d5ff972c3f22cc27623d131291d3a7c1b2c4efff826f47` |

The MatterSim closure records 157 wheels and 675,408,593 bytes. The MACE
closure records 44 wheels and 294,237,409 bytes. Both target Python 3.12.13 on
Linux AMD64. These are byte and count quantities, not scientific measurements
or OCI identities.

The preflight source chain binds:

- runtime lock: 12,558 bytes, raw SHA-256
  `b8c352aacfef3f74210d2dbf2002400887e35d21670f5f93da6a8003670bafa1`,
  semantic SHA-256
  `3f817d5536589d7d1eaeda32d27917ba590d517ee8172d6572b4bee90cc1193a`;
- signed receipt: 27,676 bytes, raw SHA-256
  `d12b91beb970df2212a3cc69c58b044f9bd4059d13cf435cd23e608c55ad19c4`,
  semantic SHA-256
  `ab6a7ea36118e388bc26fca532f571a34536156a0226d027708f793adbfad868`;
- Sigstore bundle: 11,787 bytes, raw SHA-256
  `2200a92fadbb596e5b16ee7b66b097f2aa3fa7f756ff15066d2d2b4a4b85b542`,
  whose subject is the exact signed-receipt raw digest; and
- bootstrap runs `33242996794` and `33242999376`, attempt one, successful,
  including all four artifact IDs, names, archive sizes, API/download digest
  agreement, expiry metadata and workflow-run ancestry.

The preflight performs exact-byte and projection checks. It is not a duplicate
cryptographic verifier. The subsequent runtime-lock gate separately invokes
the pinned offline GitHub CLI attestation verification with the captured
trusted root.

The checked-in preflight is 19,986 bytes with raw SHA-256
`886cf305df9418386c3087bf066cd8e9b83b316c127eaa41965c606b82f602aa`
and semantic SHA-256
`463fd9848dbde9f124d4a45ed0341271fac1102ee5ce72597191de5c8b930139`.
Its exact schema is 27,837 bytes with SHA-256
`43edb990b6a56f4f123c93cf94e71a781be8588c1ada30696b0dd32f33efef55`.

## Candidate freezes

The first formal pre-record freeze against base `f940426...` was:

- staged tree: `1a16cfc287b36f99e73ebafa58d825ee3f2e2cf5`;
- cached binary diff: 384,335 bytes;
- cached diff SHA-256:
  `ab8ec7ec83d50ab7732feac0b60175f13c66423c8a44915182bbdba1c81e1637`;
- 17 changed files; and
- zero unstaged or untracked files.

The software/evaluator reviewer found one P1 in that freeze: 24 important
schema mutations had no expected policy path and could pass the test merely by
triggering a broad object-level `const` error. The main agent added explicit
leaf checks and per-case path assertions; it also strengthened the original 17
high-risk topology/claim mutations the same way. The post-fix pre-record
freeze was:

- staged tree: `567c11b16d24cc215436a7fa6623228bc63123f6`;
- cached binary diff: 391,775 bytes;
- cached diff SHA-256:
  `ba40c2c6982146b26b9ac6bfc0df4c549aadde144f35b3b555b1a953ab47f3fe`;
- 17 changed files; and
- zero unstaged or untracked files.

All three independent reviewers recomputed and approved only the second tree.
The post-record final tree must differ because it includes this artifact and
refreshed evaluator outputs; the opening lifecycle condition governs it.

## Independent reviewers

- Mechanism and scientific validity: Ampere,
  `/root/runtime_receipt_projection`.
- Software, numerical and evaluator integrity; champion/AIDO/fixed-baseline
  comparison and Gap Planner: Feynman, `/root/round3_gap_planner`.
- Dated primary-source, SOTA and license boundary: Carver,
  `/root/sota_scout_round2`.

Each reviewer remained read-only. The main agent acted as Builder and owned all
fixes. The reviewer that raised the mutation P1 independently executed all 41
relevant in-memory mutations after the repair and observed 41 expected paths
with zero misses.

## Findings and dispositions

### P0

No P0 finding was recorded.

### P1 — all closed

1. **The early schema was too permissive.** Closed by exact contract constants,
   strict AJV compilation and adversarial schema drift tests.
2. **Early validation quantities lacked complete unit/dimension/basis metadata.**
   Closed for every one of the 34 objects containing `quantity`, `value` or
   `values`; the schema freezes the same declarations.
3. **An early topology draft counted two containers while requiring two per
   model lane.** Closed by the explicit four-container, 1,386-authoritative and
   1,386-repeat contract and arithmetic bridge tests.
4. **Signed-source identity was initially indirect.** Closed by re-reading the
   actual runtime lock, signed receipt and attestation, then projecting every
   repository, workflow, run and artifact field plus stable runtime roots.
5. **Generated Sentinel evidence became stale during fixes.** Closed before
   each formal freeze by deterministic regeneration and independent
   staged-tree manifest reconstruction.
6. **The first formal freeze allowed broad schema errors to mask missing leaf
   gates in mutation tests.** Closed by explicit checks for runtime slots,
   topology/isolation fields, 40/89/60 validation counts, finite-difference
   methods/steps/tolerances, claims, dispatch gates and forbidden publication
   classes. All 24 schema-table and 17 high-risk mutations now require their
   expected policy path. Feynman independently verified 41/41 with zero miss.

### P2

One non-blocking P2 remains: the `tf.evaluation/0.2` report folds execution
preflight validity into `verification.schemas.atomisticPlan` instead of exposing
a distinct `executionPreflight` field. Failures already enter
`hardGateFailures`, so this is an observability limitation, not a fail-open
path. It requires an explicit versioned evaluation-report migration and is
outside this bounded slice.

Two wording P2s were closed: historical R6b now says those runs contributed
zero accepted replicas at that stage while later S→V→F established the current
2/2 stable-input freeze; Random-TP rights text now says no dataset-specific
grant is recorded in the pinned evidence rather than asserting that no grant
can exist.

## Executable evidence

Before the first formal freeze, a complete `npm run check` passed:

| Gate | Result | Boundary |
| --- | --- | --- |
| ESLint | PASS | Complete configured repository surface |
| TypeScript | PASS | `tsc --noEmit` |
| JavaScript | PASS: 111 files; 2 skipped; 1,183 tests; 5 skipped | 660.19 seconds; includes deterministic numerical suites |
| Core Python | PASS: 91; 1 skipped | Available local environment |
| OpenMM policy/scientific Python | PASS: 42 | Stored assets remain non-reproduced |
| Safe ZIP Python | PASS: 3 | Duplicate-name warning expected |
| Atomistic plan/runtime lock | PASS | `693×2 — NOT RUN`; 2/2 bootstrap inputs; offline attestation gate |
| Sentinel | CONDITIONAL 41/100; no hard-gate failure | Evidence maturity only |
| Production build/isolation | PASS: 64 files, 5,549,854 bytes | Digest `9b53692aedbf48fed78f58bac65d73f2580ba32c2dfa1a6848e0e61b777f93df`; eight forbidden public fields absent |
| Dependency audit | PASS | Zero reported vulnerabilities |

One earlier full-suite attempt exceeded the existing 20-second
`atomistic-presentation-frame` test timeout after 20.734 seconds during a
19-second host scheduling stall. The same test immediately passed in 661 ms,
and the later complete run passed. This history is retained rather than
silently relabelled as a pass.

After the formal P1 repair:

- the preflight and legacy verifier targeted run passed 124 tests with one
  intentional skip, including 94 preflight tests;
- targeted ESLint, atomistic validation and `git diff --check` passed;
- the reviewer independently matched 41/41 mutation paths;
- Sentinel regenerated at `2026-09-03T22:17:03.892Z` with 403/403 source files,
  zero mismatch, source artifact digest
  `sha256:7febcf4dbc8db4d2aeb8d521ac4ea7b61bc20958b2e9932215e0c99875770d32`,
  `CONDITIONAL` 41/100 and `hardGateFailures: []`; and
- the old production directory was correctly treated as stale after the fix,
  not as post-fix build evidence.

The mandatory post-record complete run must supersede the stale production
directory, include this review file in the source manifest and preserve all
scientific and dispatch boundaries. This record is not a substitute for that
gate.

## Scientific and product boundary

Every energy, force, stress, coordinate, cell, error, conversion, aggregation
and acceptance quantity in this slice declares its unit, dimension and basis.
The stress convention remains ASE tensile-positive with
`pressure = -trace(stress)/3`; finite-difference comparison is same-sign and
post-hoc sign selection is forbidden. Python currently checks stress symmetry
at `1e-10 eV/angstrom^3`, while the JavaScript verifier uses
`2.220446049250313e-16 eV/angstrom^3`. That conflict is preserved explicitly
and blocks dispatch until a versioned tolerance is reviewed.

There is no cross-scale bridge, causal estimate, counterfactual, learned
trajectory, electronic density, orbital, bond-order output or new
visualization in this slice. The frontend state/action/observation contracts
are unchanged. Existing R2 reduced-unit Lennard-Jones/heat/A-to-B behavior
remains a reduced-unit demonstration, not a real material, chemical mechanism,
reactor or process model.

MatterSim and MACE remain external `AUDITABLE` references. The fixed released
Random-TP file contains 693 structures of 16 atoms, but neither model has run
the complete set here. The MatterSim paper's S6 description implies 250
sampled 20-atom frames from its stated 50 initial structures and five samples
per trajectory; its relationship to the released 693×16 file is unknown and
the two are not interchangeable. No local energy, force, stress, error,
throughput, memory, uncertainty or classical-potential comparison exists.

No data-leakage certification, SOTA ranking, model superiority, experimental
agreement, broad materials applicability or industrial fitness claim is
allowed. No automatic path to a PLC, DCS, SIS or other safety-critical system
is introduced.

## SOTA, evidence and license boundary

The dated reviewer used only pinned primary sources:

- MatterSim model card at revision `40a1eb8`:
  https://github.com/microsoft/mattersim/blob/40a1eb8f1189a53af310957b4f2c5dfbfe68d647/MODEL_CARD.md
- MatterSim paper, section S6:
  https://arxiv.org/html/2405.04967v2#S6
- released Random-TP bytes at revision `40a1eb8`:
  https://github.com/microsoft/mattersim/blob/40a1eb8f1189a53af310957b4f2c5dfbfe68d647/data/benchmarks/random-TP.xyz
- MACE source at revision `4d2da09`:
  https://github.com/ACEsuit/mace/blob/4d2da09413ac1407f37cdbb6b81fa28e4c15655e/README.md
- MACE dependency declaration at the same revision:
  https://raw.githubusercontent.com/ACEsuit/mace/4d2da09413ac1407f37cdbb6b81fa28e4c15655e/setup.cfg
- `python-hostlist` 2.3.0 metadata:
  https://pypi.org/pypi/python-hostlist/2.3.0/json

MatterSim's reported Random-TP metrics remain external `AUDITABLE` model-card
claims, not local `REPRODUCED` results. MACE-MPA-0 medium has no locked official
Random-TP target and cannot be assigned superiority from a future first local
run. The MatterSim and MACE model/source boundaries are MIT, while the pinned
MACE closure includes the GPL-2.0-or-later `python-hostlist` 2.3.0 source-only
distribution. A public container or wheelhouse remains blocked until source,
notice and distribution obligations are closed or the dependency is replaced.
Encryption would not grant publication or redistribution rights.

## Lifecycle status at record creation

| State | Status |
| --- | --- |
| Local implementation | Complete for the bounded preflight; final post-record gates pending |
| Commit | Not created |
| Push | Not performed |
| Pull request | Not created |
| Candidate CI | Not run |
| Main merge | Not performed |
| First-main CI | Current main `f940426...` passed; no candidate first-main CI exists |
| Release artifact | Not created for this candidate |
| Cloudflare deployment | Not performed |
| Canonical smoke | Existing deployed main observed only; not candidate evidence |

No commit, push, PR, merge, release or deployment is permitted unless the
post-record local gates pass and a fresh remote-main fetch shows no conflict.
Candidate CI, main first CI, release evidence, deployment and canonical smoke
must continue to be reported as separate states.

## Residual limitations and next round

Residual limitations remain explicit:

- the producer identity is `configured:false`/`id:null`; standalone preflight
  validation checks that static condition while the combined atomistic and
  evaluator gates also validate the inert workflow bytes;
- label-isolation canaries, exact observed mounts/commands, four observed
  container IDs, OCI manifest/config roots and a unified stress-symmetry
  tolerance do not yet exist;
- ephemeral-runner disposal prevents later per-record recomputation; raw data,
  per-record predictions and labels remain forbidden publication classes;
- aggregate-result publication rights are unresolved; and
- PFHub Benchmark 3, Cantera 3.2 CSTR, DFT/electronic structure and the complete
  multiscale world model remain unimplemented.

The next round is limited to at most three tasks:

1. Freeze and independently review the executable vNext workflow, observer,
   plan/receipt/provenance schemas, isolation canaries, OCI roots and one
   versioned stress-symmetry tolerance while keeping dispatch disabled.
2. Record a fail-closed Random-TP aggregate-publication disposition and the
   required MIT/GPL notices, source and distribution obligations.
3. Only after every gate closes, run the private four-container campaign and
   independently verify 693 records per model, completeness, invariance,
   finite differences, determinism, resources and calibrated claim bounds.

Only a validated receipt from task 3 may later feed energy, force, stress,
error and uncertainty into versioned World State/Observation data and the 3D
instrument. It still would not establish SOTA, leakage certification, causal
effects or industrial fitness without separate evidence.
