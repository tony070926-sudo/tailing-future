# R8 atomistic-dynamics foundation review

Date: 2026-08-31

Candidate: `0.4.0-r8-atomistic-dynamics-foundation`

Scope: the bounded two-water fixed-orientation trajectory, its typed
world/action/observation contracts, Sentinel integration, UI readouts and the
directly affected documentation. This was an independent read-only scientific
and release review; the reviewer did not implement the solver or its fixes.

## Decision

**Implementation review: APPROVE after two blocked revisions.**

**Promotion remains conditional on a fresh, source-bound Sentinel report and
the separate release pipeline.** The local implementation is not by itself a
GitHub CI result, release artifact, Cloudflare deployment or canonical-site
smoke result.

R2 remains the conditional champion. The evidence-maturity score remains
**41 / 100**, every dimension score and promotion floor is unchanged, and the
new molecular path does not promote any OpenMM, MatterSim, MACE, Random-TP,
multiscale or industrial claim.

## First independent review: blocked findings

The first review found two P0 state-integrity failures even though the altered
payloads had fresh, internally consistent public digests:

1. A step state produced by three substeps could have its last action changed to
   two substeps, then have `actionId` and `stateDigest` recomputed. A branch
   action could likewise name a contradictory `fromStep`. The loader verified
   hashes but did not prove that the action semantics matched the represented
   parent-to-result transition.
2. The initial state could translate both rigid bodies by `+1 A`, then recompute
   `physicalDigest`, `stateId` and `stateDigest`. The loader accepted the
   translated state even though the initial center-of-mass reference remained
   locked, allowing a subsequent observation to report a passing numerical
   status alongside an out-of-contract center-of-mass residual.

The same review also blocked promotion because Sentinel had not yet made the
new molecular schemas, recomputed-tamper corpus and 10,000-step trajectory part
of its hard-gate result. The evaluation report was stale while implementation
files were still changing.

## Implementer remediation and independent replay

The implementation now checks action semantics in addition to digest syntax:

- a step action must satisfy `parentStep + substeps == resulting step`;
- a branch action must name the current step as both its source and resulting
  step, with a positive safe-integer branch ordinal;
- step zero must match the complete locked initial rigid-body state and initial
  energy statistics;
- every restored or advanced observation fails closed when the analytic
  center-of-mass residual exceeds the locked limit.

The reviewer independently rebuilt the current TypeScript module and repeated
the original attacks. Recomputed step, zero-substep and branch action mutations
were rejected with the expected transition-semantic error. The recomputed
initial `+1 A` center-of-mass translation was rejected as a non-matching locked
initial state. Focused tests also cover these mutations and transactional
rollback.

## Sentinel hard-gate review

Sentinel now evaluates the molecular path from its frozen source snapshot and
hard-fails on any of the following:

- invalid `tf.molecular-world-state/0.4`,
  `tf.molecular-action/0.4` or `tf.molecular-observation/0.4` data;
- acceptance of recomputed-digest step, branch or initial-COM mutations;
- a horizon other than exactly 10,000 steps or an energy sample count other
  than 10,001;
- breach of the maximum relative energy-excursion, momentum,
  center-of-mass, internal-force, rigid-bond or rigid-angle limits;
- failure of deterministic physical, complete serialized-state or complete
  observation replay.

The first Sentinel revision compared only the final `physicalDigest` while its
label said deterministic replay. That was insufficient to detect divergent
energy statistics, state lineage or observation bookkeeping. The revised
10,000-step gate separately compares the physical digest, byte-stable JSON form
of the complete serialized state and byte-stable JSON form of the complete
observation, then defines the aggregate `deterministicReplay` as the conjunction
of all three. The focused 10,000-step test independently asserts full
serialization and observation equality.

## Cross-runtime static-scene identity review

The final browser pass found a separate presentation-layer hydration defect.
The static molecular scene originally hashed raw trigonometric and
inverse-distance results. Server-side rendering and browser hydration could
therefore derive different IDs when their math runtimes differed only in the
last IEEE-754 bits, despite representing the same requested static scene.

The remediation is appropriately limited to the public
`tf.molecular-scene/0.1` identity payload:

- object keys are sorted recursively while array order and all strings remain
  exact;
- finite numbers are normalized to 13 significant decimal digits, with `-0`
  treated as the same semantic value as `0`;
- the full public `stateDigest` hashes that semantic payload and `stateId` uses
  the first 16 hexadecimal digits of the same digest; and
- the exact molecular simulation `physicalDigest`, serialized `stateDigest`,
  topology digest, action identity, conservation gates and observations are
  unchanged and do not use this normalizer.

This does not round or mutate the coordinates, pair energies, forces or
metadata returned to the UI. It only defines when two public static-scene
identities are semantically equivalent. Across the admitted scene ranges, the
largest identity-only rounding scale is orders of magnitude below the authored
parameter precision, displayed precision and control increments (`0.05 A` for
water separation, `3 degrees` for orientation and `0.02 A` for the NaCl probe).
The independent probes confirmed that a one-ULP-equivalent water input keeps
the same digest, while each visible control increment changes both digest and
ID. The implementation still rejects non-finite identity values.

The reviewer therefore found no hidden scientifically meaningful change. The
important boundary is that the static `stateDigest` is now a 13-significant-
digit semantic scene identity, not a commitment to every raw floating-point
bit. It remains suitable for hydration and camera-independent display identity,
but it must not be described as the exact runtime simulation digest or as a
cryptographic scientific measurement record.

## Scientific and SOTA claim boundary

The source/SOTA review led to four explicit claim corrections that are present
across the README, architecture, scorecard, molecular contract and UI:

1. The target is a finite two-body vacuum, isolated constant-energy calculation,
   not a bulk NVE ensemble with a defined thermodynamic temperature, pressure,
   volume or stress.
2. The implemented degrees of freedom are only the translations of two rigid,
   fixed-orientation TIP3P bodies. Torque is reported but rotation is not
   integrated, so this is a bounded integrator foundation rather than complete
   molecular dynamics.
3. Geometry and force-field values are transcribed from the pinned OpenMM 8.5.1
   TIP3P parameter snapshot, but the local TypeScript kernel executes the force
   and Velocity Verlet calculations. OpenMM itself is not executed or
   reproduced by this path.
4. MatterSim and MACE are not invoked. Their authenticated evidence remains ten
   label-free smoke observations with evidence class
   `runtime-frozen-not-reproduced`; the full `693 x 2` Random-TP benchmark
   remains planned-not-reproduced and receives no score or superiority claim.

NaCl remains a static finite central-first-shell point-charge view. The solver
trajectory is separate from both that NaCl view and the static water coordinate
scan. No electronic structure, polarization, charge transfer, reactive
potential, periodic electrostatics, learned future-state model, validated
multiscale bridge or industrial process recommendation is claimed.

AIDO Cell remains a vendor-claim architecture and visual-language comparator,
not a like-for-like numerical baseline. This iteration adds a small persistent
typed state/action/observation loop and physical transition kernel; it does not
claim an AIDO-equivalent learned virtual cell or close the atomistic-to-process
world-model gap.

## Local verification observed by this reviewer

- Molecular world suite: **15 / 15 passed**, including the 10,000-step
  conservation and full-replay test.
- Molecular world, evaluator-launcher and release-report focused suites after
  the final determinism correction: **32 / 32 passed**.
- Static molecular identity, visual-guide and molecular-world focused suites
  after the hydration correction: **32 / 32 passed**; typecheck and lint also
  passed after that correction.
- TypeScript typecheck: **PASS** after the report was present.
- Locked lint: **PASS**.
- Full JavaScript run: **307 passed, 1 skipped, 1 existing thermochemical test
  timed out under concurrent evaluator load**; the timed-out test passed alone
  in 8.7 seconds with its assertions intact.
- Diff whitespace check: **PASS**.

These observations are local and do not substitute for the complete clean
repository gate. Python tests, atomistic manifest/runtime validation, a fresh
full Sentinel run, production build, dependency audit and browser smoke remain
part of that final local gate unless separately recorded by another independent
artifact.

## Identity and report-provenance condition

At review time, `package.json`, the package-lock root and package-lock version
all identify `0.4.0`. The scorecard identifies
`0.4.0-r8-atomistic-dynamics-foundation`, its weights total 100 and its
recomputed score is 41 with no scorecard hard-gate failure.

The report produced before the final determinism change was correctly detected
as stale: its manifest no longer matched
`lib/simulation/molecular-world.test.ts` and `scripts/evaluate-worker.mjs`, and
its molecular result predated the three explicit replay fields. Subsequent
static-scene identity and test changes, plus this amended review, require
another regeneration even if an intermediate report was produced. No earlier
report is promotion evidence.

Immediately before this review file was added, the implementation source
inventory contained exactly 163 files. Because evaluation reviews are inside
Sentinel's declared `evaluation/` source scope, adding this review changes the
next final inventory to exactly 164 files if no other source path is added or
removed. The promotion condition is therefore a fresh deterministic Sentinel
generation after all source edits stop, bound to the exact final path set and
bytes (expected 164 files at this point), with:

- candidate `0.4.0-r8-atomistic-dynamics-foundation`;
- `sourceRevision: null` for the final local working-tree report;
- weighted score 41 and verdict `conditional`;
- zero hard-gate failures;
- all molecular schema, recomputed-tamper, 10,000-step conservation and three
  deterministic replay gates passing; and
- exact agreement between the regenerated source manifest, source-file count
  and artifact digest and the final stable tree.

The checked-in local report must then be replaced or independently reproduced
by the exact GitHub main-branch CI artifact with a non-null commit-bound
`sourceRevision`. Commit/PR status, protected-main CI, release-manifest and
cross-platform guard, Cloudflare deployment, and canonical-site smoke must be
reported as six separate states. No deployment should proceed from this local
review alone.
