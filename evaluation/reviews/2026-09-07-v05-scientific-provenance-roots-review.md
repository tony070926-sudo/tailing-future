# v0.5 scientific/provenance determinism roots — review record

Review date: 2026-09-07

Implementation disposition: **LIMITED GO — the frozen implementation, three
independent reviews and all applicable local gates are complete; eligible for
commit, protected PR and candidate/main CI only**

MatterSim/MACE execution, workflow dispatch, rights clearance, aggregate
publication, frontend ingestion, score promotion, scientific reproduction,
SOTA ranking, leakage certification, causal claims and industrial use:
**NO-GO**

## Frozen bounded hypothesis and acceptance tests

The frozen hypothesis is:

> A versioned full-candidate determinism contract can compare only immutable
> scientific identity and model outputs in one canonical root while committing
> fresh-container execution provenance in a separate canonical root. Changing
> a container/network namespace or another declared provenance field must not
> change the scientific root and must change the provenance root. Changing any
> structure identity, model/checkpoint/runner scientific identity, energy,
> force or stress value must change the scientific root. The migration must
> remain default-deny and cannot authorize or execute a model.

Acceptance requires:

- a versioned, closed scientific-projection contract with explicit units,
  dimensions, bases, included fields and excluded provenance fields;
- a separate versioned provenance projection/root that binds the excluded
  execution-environment evidence without weakening its validation;
- signed-zero normalization and deterministic, bounded canonical encoding;
- positive tests proving identical scientific bytes/root across distinct
  fresh-container IDs and network namespace identities when the scientific
  payload is identical;
- positive tests proving that those provenance changes alter the provenance
  bytes/root;
- mutation tests proving that every structure/model/checkpoint/runner identity
  and every energy, force and stress component committed by the scientific
  projection changes its root or fails closed;
- malformed, missing, extra, duplicate, non-finite and schema-drift inputs to
  fail closed;
- the observer fixture and policy to describe the two roots without marking a
  synthetic fixture as observed execution evidence;
- no change to `tf.world/0.3`, `tf.action/0.3`, `tf.observation/0.3`, the
  locked scorecard, rights dispositions, dispatch eligibility, frontend
  behavior, model results or scientific values; and
- zero MatterSim, MACE, Random-TP or other private model execution.

## Implementation-before baseline

- Isolated worktree:
  `/Users/tonywilliam/Documents/ChatGPT/Tailing Future-v05-roots`.
- Branch: `codex/v05-scientific-provenance-roots`.
- Base, local `HEAD`, fetched `origin/main` and GitHub main:
  `307e6d723086fe41b6d89e9f9b4b532364ccaeff`.
- Base tree: `1b0d9d3a62a35f4ed74051722e55ca438abd6760`.
- The exact base's first main-push Tailing Sentinel run `34071759794`, attempt
  1, completed successfully. Its unique release artifact is `10001860284`,
  named `tailing-sentinel-307e6d723086fe41b6d89e9f9b4b532364ccaeff`,
  with GitHub archive digest
  `sha256:555a20b1a32c0194b708b0f0e2133ec28b32ae07cdfe715c8191c19d8450d6e2`.
- The release guard passed for that exact artifact. The canonical URL currently
  returns HTTP 200, the expected title and the custom-structure workbench, but
  no checked evidence binds those served bytes to artifact `10001860284` or to
  exact main SHA `307e6d7...`. Standard Wrangler authentication was not used in
  this round. Deployment provenance and post-deploy solver/WebGL/console smoke
  therefore remain **unverified**, and this record makes no deployment claim.
- With Node 24.16.0 and the pinned absolute GitHub CLI 2.98.0 verifier,
  `npm run atomistic:validate` passes while explicitly reporting `693×2 — NOT
  RUN`, rights `3/3 ABSTAIN`, `DISPATCH BLOCKED` and runtime frozen but not
  scientifically reproduced.
- The unrelated dirty primary worktree is not edited.

## Independent pre-implementation findings

The dated SOTA Scout, Scientific Evaluator and Gap Planner reviews were
read-only. They agree that the current path is correctly fail-closed and that
no private execution is authorized. The Scientific Evaluator identified the
specific defect addressed here: current predictions commit
`environmentSha256`; that environment digest includes a fresh-container
network namespace identity, while the existing `canonicalScientificPayload`
canonicalizes the whole record. Two scientifically identical fresh-container
runs can therefore fail the byte/root equality requirement solely because
their provenance differs.

This record is completed incrementally after the Builder self-check, exact
candidate freeze, three independent read-only reviews, finding dispositions
and the full mandatory gate rerun. A review statement does not substitute for
executable validation, authorization, an independent solver, experiment or
qualified engineering approval.

## Candidate identity and reviews

### Frozen implementation

- Base/`HEAD`/fetched `origin/main`:
  `307e6d723086fe41b6d89e9f9b4b532364ccaeff`.
- Frozen staged implementation tree:
  `cde612b5df62b7f8815983a2e03fb862883f43b4`.
- SHA-256 of `git diff --cached --binary`:
  `31539c4294fe536e0832087d43b7e33433d21421196d459a9042e8c4ee63834e`.
- `git diff --cached --check`: clean.
- The implementation freeze contains exactly eight paths:
  `docs/ATOMISTIC_REPRODUCTION.md`, the v0.1 determinism-roots contract, its
  schema, the host-observation schema, observer vNext and its tests, the
  observer snapshot mutation test, and `scripts/evaluate-worker.mjs`.
- This review record is an untracked administrative artifact and is not part
  of the implementation tree above. Any later implementation edit invalidates
  the review freeze and requires the relevant focused gates and reviewers to
  run again.
- No frontend-facing `tf.world/0.3`, `tf.action/0.3` or
  `tf.observation/0.3` contract, scorecard value, solver output, UI or model
  capability changes in this candidate.

The candidate keeps the frozen v2 runner's rich 27-field environment digest
preimage intact, then defines a versioned scientific projection and a separate
versioned provenance projection. The checked cross-language vectors are:

- MatterSim environment SHA-256:
  `sha256:3f348ebf7e89bfd6f87f583ee0d0df49249c7a23d21a5d8725a2bb965d287f91`;
- MACE environment SHA-256:
  `sha256:93632458d226aa387ffd0fb4dd876c3f4f1f155153ebfc537b4e49dee3a4dc26`.

The synthetic observer remains `not-run`, default-deny and dispatch-disabled.
It does not convert the fixture into observed model execution.

### Independent read-only reviews

- Scientific-validity reviewer `/root/astra/scientific_validity_review`:
  **GO**, P0=0, P1=0, P2=0. This reviewer was explicitly re-assigned against
  the frozen tree because the earlier scientific review identity could not be
  recovered after context compaction; no unattributed conclusion is counted.
  It inspected all eight staged paths and their frozen runner, lock, rights,
  authority, workflow, manifest and applicability dependencies. It confirmed
  that each model lane commits 693 ordered records and 58 numerical outputs
  per record (one total energy, 16x3 forces and 3x3 stress): 40,194 scalars per
  model and 80,388 across both lanes. It also verified declared energy, force
  and ASE-sign Cauchy-stress units/bases, the static 16-atom periodic boundary,
  the frozen Python v2 27-field preimage, fresh-container root separation,
  default deny and all false claim boundaries. Focused tests passed 135/135;
  no model, network or workflow ran. The freeze was unchanged after review.
- Software/numerical/evaluator-integrity reviewer
  `/root/astra/software_evaluator_review`: **GO**, P0=0, P1=0, P2=1. The
  reviewer independently verified the freeze before and after review, checked
  strict UTF-8 and duplicate-key rejection, terminal LF and input bounds,
  closed/dense data, non-finite rejection, recursive signed-zero
  normalization, all 693 ordered records and 40,194 E/F/stress scalars per
  model lane,
  model/checkpoint/runner identities, the 27-field v2 environment digest,
  host/runner agreement and hard-gate wiring. Its focused observer run passed
  135/135; full-candidate/bootstrap policy passed 40 with one controlled skip;
  a 1,048,001-byte adversarial JSON parse completed in about 32 ms with
  near-linear scaling. No model ran.
- Dated SOTA Scout / Gap Planner `/root/astra/dated_sota_gap_review`:
  **LIMITED GO**, P0=0, P1=0, P2=0, only for the fixture-only dual-root
  contract to complete local gates and this record. It independently verified
  the frozen identity at both ends and kept model execution, dispatch,
  promotion, release/deployment and capability/SOTA/leakage claims at NO-GO.

### Findings and current dispositions

- P0: none recorded.
- P1: none recorded. The two earlier complete-test attempts exposed host-sleep
  wall-clock interference rather than a source defect; the unchanged suite
  subsequently passed under process-scoped `caffeinate`, as recorded below.
- P2 (accepted/deferred, non-blocking): the existing evaluator runs the
  thermochemical, periodic and aqueous numerical gates before cheap
  authority/provenance admission checks. One authority snapshot therefore
  serially runs three complete evaluators. The bounded PR profile is roughly
  8 seeds x 7,500 replay steps x 2,016 pairs = 120,960,000 pair visits per
  evaluator and explains the measured approximately 503-second snapshot. It
  is finite, not a parser hot loop. A later round should split or front-load
  cheap admission while preserving every numerical gate, timeout and report
  semantic, with equivalence regressions.
- Scientific-review P2 findings: none.
- Preserved semantic limitation, not a finding: decoded finite binary64 values
  are canonically re-encoded, and `-0` is deliberately normalized to `0`.
  Roots do not preserve original JSON number spelling or a negative-zero sign
  bit; tests and documentation state that boundary.

## Gate evidence

### Passing bounded gates

All commands used pinned Node 24.16.0 and, where applicable, the exact
digest-pinned GitHub CLI 2.98.0 path.

- `npm run lint`: PASS.
- `npm run typecheck`: PASS.
- `npm run atomistic:validate`: PASS, while explicitly reporting 693x2 NOT
  RUN, rights 3/3 ABSTAIN, authority request as a draft rather than authority,
  and dispatch BLOCKED.
- `npm audit --audit-level=low --json`: PASS, 0 vulnerabilities among 718
  packages.
- `npm ls --all`: PASS after exact `package-lock.json` reconstruction.
- Focused observer: 135/135 PASS.
- Four-file observer/schema cluster: 262/262 PASS.
- Authority-only observer snapshot: 1/1 PASS in 503.24 seconds with the
  existing timeout unchanged; all evaluator subprocesses and temporary roots
  exited cleanly.
- The formerly suspected parser path is bounded: a 1 MiB adversarial input is
  near-linear at approximately 32 ms. Profiling instead identified the fixed
  numerical work above.

The frozen diff does not widen a snapshot, evaluator or global timeout. Its
only new timeout is the 10-second ceiling on the real Python cross-language
environment-hash regression.

### Dependency-tree recovery

During a read-only science check, a reviewer accidentally invoked `pnpm exec`.
It changed only ignored `node_modules`; it did not change tracked files, the
index, the staged tree or the patch digest. The polluted dependency tree was
moved recoverably to
`/private/tmp/tf-v05-pnpm-node-modules.I7ZHEt/node_modules-pnpm-interrupted`,
then `npm ci` reconstructed exactly from `package-lock.json` with pinned Node
24.16.0. `npm ls --all` and `npm audit` now pass. This incident is retained
rather than silently omitted.

### Complete-test attempts and closure

Attempt 1, `npm test`, stopped after JavaScript core:

- 121 files passed, 2 files controlled-skipped;
- 1,414 tests passed, 10 skipped;
- one existing runtime-freeze policy test crossed its 20-second timeout; and
- one existing V049 synthetic trajectory `beforeAll` crossed its 30-second
  timeout.

Both points passed immediately in isolation without code or timeout changes:
runtime-freeze 18/18 with the affected case at 877 ms, and V049 5/5.

Attempt 2, a complete `test:js:core` rerun, reached:

- 122 files passed, 2 files controlled-skipped;
- 1,419 tests passed, 5 skipped; and
- one different existing V048 position-byte-owner test crossed its 45-second
  timeout, reported at 61.691 seconds.

The two attempt-1 points passed in attempt 2. The sole attempt-2 point then
passed 1/1 in isolation in 7.50 seconds with the original 45-second timeout.
System power logs provide the direct explanation: while attempt 2 ran, macOS
repeatedly entered 19-35 second `Maintenance Sleep` intervals, for example at
12:12:09, 12:13:29, 12:14:35 and continuing approximately every 65 seconds.
Vitest counted these host-sleep intervals against wall-clock time. A separate,
unrelated phase56 Python benchmark was also active on one core and was not
interrupted or modified.

Before attempt 3, a read-only capacity check found 15 logical/physical cores,
25.77 GB memory, load approximately 3.34, zero swap, zero throttled pages and
no thermal or performance warning. The unrelated phase56 process occupied one
core, so it was left untouched. Attempt 3 ran the original suite and original
timeouts under process-scoped `/usr/bin/caffeinate -dimsu`; no source, test,
timeout or system-wide power setting changed.

Attempt 3, complete `npm test`: **PASS**.

- JavaScript core: 123 files passed, 2 controlled-skipped; 1,420 tests passed,
  5 skipped; 579.85 seconds.
- Observer snapshot: 2/2 passed; the evaluator children completed in 548.875
  and 497.851 seconds, 1,046.83 seconds total, below the unchanged 18-minute
  worker and 20-minute helper ceilings.
- Python suites: 91 tests passed with 1 skip, then 42 passed, then 3 passed.
- Every Vitest, evaluator and `caffeinate` process exited cleanly; no known test
  failure remained.

Final post-test gates, still using pinned Node 24.16.0 and the exact pinned
GitHub CLI 2.98.0 verifier where applicable:

- `npm run lint`: PASS.
- `npm run typecheck`: PASS.
- `npm run atomistic:validate`: PASS, preserving `693x2 NOT RUN`, rights `3/3
  ABSTAIN`, draft-only authority and `DISPATCH BLOCKED`.
- `npm audit --audit-level=low --json`: PASS, 0 vulnerabilities among 718
  packages.
- `npm ls --all`: PASS.
- `npm run evaluate`: PASS with Sentinel `CONDITIONAL`, score 41.00/100,
  `hardGateFailures: []` and three unchanged priority gaps. This is validation
  maturity, not scientific truth or percent of SOTA.
- `npm run build`: PASS. The pre-record-freeze production-isolation check
  inspected 78 files and 5,729,883 bytes, found all 8 forbidden
  public-evaluation fields absent, and produced preliminary content root
  `sha256:0b175549944b697e23df434b254ec01b52aead72df65bc72e37242c536dadad6`.

The generated evaluation reports will be regenerated once after this review
record is frozen so their source manifest binds these exact review bytes, and
the production build will then be regenerated from those reports. The final
report artifact digest and final build content root are intentionally not
copied back into this source-bound record: either value would change after the
record edit and create a false self-reference. They must instead be verified
from the generated report/build evidence and, for release, from the exact CI
artifact. At this record's freeze point there is no commit, remote branch, PR,
candidate CI, main merge, main CI artifact, release, Cloudflare deployment or
post-deploy smoke for this candidate; those remain distinct later states and
cannot be inferred from this local GO.

## Residual limitations and next-round tasks

### Dated external comparison

The 2026-09-07 reviewer checked only primary/official sources. MatterSim is
locked to release v1.2.5, commit
`40a1eb8f1189a53af310957b4f2c5dfbfe68d647`; its model-card raw SHA-256 is
`9f48dffafb55f0700bbc2d180ce8f7b5bc28decac1de43c3058c323a7c0dc5b7`.
The author-reported Random-TP values remain external **AUDITABLE** evidence,
not local reproduction. MACE is locked to v0.3.16, commit
`4d2da09413ac1407f37cdbb6b81fa28e4c15655e`; its README raw SHA-256 is
`1ef0c309a49cf7d1035ab581b1ddc8284c678658ba375a132c4d5fcefd833038`.
MPA-0 covers 89 elements and has no official Random-TP target. Neither model
supports a claim of arbitrary molecules or all 118 elements.

The AIDO Cell official product/report date is 2026-08-18; report SHA-256 is
`4f25869b149a0064cc71381febf2599ca1e95c891be1d7d66c83a8797dbab508`.
Its persistent shared state, action-conditioned transitions, same-state
multimodal readouts, multi-scale and branch/clone interaction are architecture
references, not like-for-like material metrics. Matbench Discovery is a
different unrelaxed-to-relaxed stability-screening task, not Random-TP
single-point E/F/stress. IUPAC supports element identities through Z=118; it
does not support a checkpoint capability claim.

Primary links: [MatterSim v1.2.5](https://github.com/microsoft/mattersim/releases/tag/v1.2.5),
[MatterSim model card](https://github.com/microsoft/mattersim/blob/40a1eb8f1189a53af310957b4f2c5dfbfe68d647/MODEL_CARD.md),
[MACE v0.3.16](https://github.com/ACEsuit/mace/releases/tag/v0.3.16),
[MACE MPA-0](https://github.com/ACEsuit/mace-foundations/releases/tag/mace_mpa_0),
[AIDO Cell](https://genbio.ai/aido-cell-simulator/),
[Matbench Discovery](https://www.nature.com/articles/s42256-025-01055-1),
and [IUPAC element naming](https://iupac.org/recommendation/names-and-symbols-of-the-elements-with-atomic-numbers-113-115-117-and-118/).

### Next round, at most three tasks

1. Close rights/authority and real execution identity, while retaining
   `dispatchEligible:false`: require an independent qualified, signed,
   unexpired, dataset-specific decision bound to scope digest
   `sha256:c73cbb22ae3f7c57579d55c1242f6a0434eb79fb0489cd8799fceff67b8e3c91`,
   with separate private-compute, aggregate-publication and
   runtime-redistribution decisions plus locked producer/OCI/runner/handoff.
   Wrong scope, mandate, digest, expiry, signature, pagination or TOCTOU must
   reject machine-readably before dispatch.
2. Only after task 1 passes, execute the fixed 693x2 benchmark twice per model
   in fresh isolated CPU environments and independently verify exactly 693
   finite total energies, 16x3 forces and 3x3 stresses per run. Same-model
   scientific roots must match; fresh provenance roots must differ. Recompute
   metrics, worst IDs, invariance, finite differences, throughput and memory.
   MACE remains a blind engineering baseline; no SOTA or leakage claim.
3. Define a new capability-aware customizable element/molecule representation
   version without changing the frozen frontend v0.3 contracts. It should
   round-trip Z=1..118 identities, real xyz, cell/PBC, total charge/spin,
   isotopes, bonds, source, unit, basis and license, while every backend states
   exact supported Z/charge/spin/PBC/domain/readouts. Missing evidence or an
   unsupported condition must yield machine-readable abstention, never
   invented force, bond or electron-density output.

PFHub Benchmark 3 and Cantera 3.2 CSTR remain after real L1 reproduction. The
existing rights, workflow, label-isolation, scientific-probe,
stress-source/tolerance, OCI trust-root, resource, UQ, applicability and
aggregate-publication gaps remain dispatch-blocking.
