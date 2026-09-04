# Observer source-snapshot evaluator regression — independent review

Date: 2026-09-04

Implementation disposition: **LIMITED GO for the exact source-scoped
H-OBS-SNAPSHOT-1 evaluator-integrity candidate reviewed here**

Model execution, scientific comparison, score promotion, rights clearance,
publication, release and deployment disposition: **NO-GO**

This round closes one prior P2 by adding a real launcher/worker regression for
one precisely enumerated mutation vector: before evaluator capture, append one
ASCII space to each of four reviewed observer sources in one isolated copy.
The test proves exact fail-closed diagnostics and no score promotion. It does
not execute MatterSim, MACE or OpenMM, does not access Random-TP records, and
does not cover every mutation class or timing attack. The 693-by-2 campaign
remains **NOT RUN** and the evidence-maturity score remains 41/100.

This record is source-scoped. It preserves the exact pre-record tree reviewed
by the independent reviewers and separately records every later reliability
delta and gate observation. The final immutable tree must receive a final
read-only identity and evidence check after this record and refreshed evaluator
outputs are present. Any later source or record edit makes that final check
stale.

## Frozen bounded hypothesis and acceptance tests

The round tested one bounded hypothesis:

> A real Tailing Sentinel launcher/worker run over an unmodified candidate is
> conditional with score 41 and no hard-gate failures, while one capture-before
> four-file trailing-space mutation vector is rejected by the exact expected
> observer dependency gates without changing the scorecard dimensions or the
> original repository reports.

Acceptance required all of the following:

- one baseline evaluator followed by one mutated evaluator, with no evaluator
  fan-out and no cleanup race;
- the mutation root to be created only after the baseline finishes;
- exactly one trailing byte `0x20` on each of these four paths:
  - `evaluation/atomistic/full-candidate-observer-contract-vnext.json`;
  - `evaluation/atomistic/full-candidate-observer-vnext.workflow.yml`;
  - `schemas/atomistic-full-candidate-observer-contract.schema.json`; and
  - `schemas/atomistic-full-candidate-host-observation.schema.json`;
- JSON or YAML parsing before and after each append to produce equal data;
- the baseline report to have exit 0, verdict `conditional`, score 41 and an
  empty hard-gate list;
- the mutation report to have exit 1, verdict `reject` and exactly seven
  failures: four raw-digest gates, workflow byte length, the derived receipt
  workflow digest, and the derived atomistic-plan observer dependency;
- all four mutated SHA-256 values to be recomputed directly from bytes and to
  equal their report manifest entries;
- the changed manifest path set to be exactly the four paths above;
- the mutation artifact digest to differ and remain bound to the public
  product projection;
- score 41, all scorecard dimensions and the public dimension projection to
  remain equal to the baseline;
- the four existing published evaluator files in the source worktree to
  remain byte-identical;
- copied sources to be regular, non-symbolic, single-link files resolving to
  their canonical reviewed paths;
- bounded timeout ordering: worker 18 minutes, outer evaluator 20 minutes,
  test 45 minutes and required CI job 75 minutes;
- the CI workflow byte digest and semantic workflow policy to bind the new
  75-minute limit without changing read-only permissions or adding execution
  steps; and
- no change to `tf.world/0.3`, `tf.action/0.3`,
  `tf.observation/0.3`, the scorecard, dataset catalog, model/runtime locks or
  rights decisions.

The Builder could implement and self-check the first candidate but could not
approve it. All fixes after review were owned by the main agent. Review does
not substitute for executable validation, authenticated provenance, model
inference, an independent scientific solver, legal advice, experiments or
qualified engineering approval.

## Baseline and isolation

- Isolated worktree:
  `/Users/tonywilliam/Documents/ChatGPT/Tailing Future-v05-observer-snapshot`.
- Branch: `codex/v05-observer-snapshot-gate`.
- Base and local `HEAD` at every formal freeze:
  `67feea928b259d803882fe2731550fa6dd7d4818`.
- That base is the squash-merged H-vNext-Observer/0.1 main commit. Its first
  merged-main Sentinel run `33846585284`, job `100939714768`, succeeded, and
  artifact ID `9927514619` was independently verified before this round.
- Work occurred outside the user's other active worktrees. Before any commit,
  the main agent must fetch `origin/main` again and check both ancestry and
  path overlap.
- The protected Cloudflare site remains prior-main evidence only. This round
  does not authorize a deployment or canonical smoke claim.

Local validation used Node.js 24.16.0 on macOS 26.6.2, arm64, with 15 logical
CPUs. The focused pre-record run reused the package-lock-compatible
`node_modules` tree from the immediately preceding isolated observer worktree;
a later clean `npm ci` installed 561 locked packages without changing
`package-lock.json`. Candidate CI remains independently required.

## Candidate evolution and retained failures

The initial Builder freeze contained only the new test:

- tree `1841b08ad24cddb35ab1339eb40299cb28a8c3af`;
- one staged file;
- cached binary patch 8,083 bytes; and
- patch SHA-256
  `cc6467f2f402e27b2975b788108b4dcbd16b2733d807fdaefd2ac7a2a7ad8458`.

Its self-check passed 1/1 in 830.979 seconds, but it ran one baseline plus four
full evaluators concurrently. Independent review found this incompatible with
the 35-minute required workflow and susceptible to CPU oversubscription and
`Promise.all` cleanup races. That P1 blocked promotion.

The main-agent repair sequence retained every failure:

| Freeze | Identity | Observation and disposition |
| --- | --- | --- |
| Revised 1 | tree `3ee56c391d4d37b635d75116f28394144073715a`; 9,456-byte patch; SHA-256 `1dd75985e0ad626ea34c8d28e2f5271184644b3d031d0fc14f0dcfd5ae746bed` | Consolidated to two evaluator runs and raised the workflow to 60 minutes. The 499.492-second test correctly failed because the workflow digest and semantic policy still bound 35 minutes. |
| Revised 2 | tree `fc48a75a61f40461187bf422a8560164e64da635`; 12,257-byte patch; SHA-256 `2f1b2eb600e7728d1dbee753eec4051925b0481850c865d1966262dab8141158` | Synchronized the 60-minute workflow policy. The 1,201.683-second test was terminated by the then-11-minute outer evaluator limit during the second run. |
| Revised 3 | tree `f1c6f1460addc6957f15d94f327c84b122756880`; 12,257-byte patch; SHA-256 `4e5ae2ba664a8ba7b901ba8c33a4c11a27e9a856163531b883ba445cf5c1686f` | Raised outer/test/CI limits to 20/45/75 minutes. The 677.482-second baseline produced no report because the launcher still terminated its worker at 10 minutes. |
| Revised 4 | tree `5305b5fae100ad5a0095a4562c6f29157da3d40e`; 14,263-byte patch; SHA-256 `f77fd712e3e1141c01d8a53bc81b505a5ce6133a64b329b4d393f557911a9c57` | Made the worker limit an explicit tested 18 minutes and added missing-report diagnostics. Both evaluators completed in 1,000.147 seconds; the test then correctly exposed two previously unasserted derived gates, receiving seven rather than five. |
| Reviewed final pre-record freeze | tree `f625dbc5a9332ae4222065bce193606bbeffeb3c`; 16,581-byte patch; SHA-256 `4b5386683f833064bae35cebe59c817ebf3deb7082f22058eed68e1bd5fe1d05` | Independently recomputes the four mutated digests, asserts the exact seven-gate set, and replaces the ambiguous aggregate `null` diagnostic with the observer dependency. Focused real-evaluator regression passed. |

The final pre-record freeze has seven staged files, 287 insertions, six
deletions, no unstaged files and these paths:

- `.github/workflows/evaluate.yml`;
- `scripts/evaluate-launcher.test.mjs`;
- `scripts/evaluate-observer-snapshot.test.mjs`;
- `scripts/evaluate-worker.mjs`;
- `scripts/evaluate.mjs`;
- `scripts/workflow-policy.mjs`; and
- `scripts/workflow-policy.test.mjs`.

The required workflow's exact raw SHA-256 is
`57773b8ff757a5c3401bdaa8878bb43a6386921a7af351f0e5c1a5173e65a5d1`,
matching the frozen policy constant.

## Executable evidence before this record

The final focused command was:

```text
env PATH=<Node-24.16.0>/bin:$PATH ./node_modules/.bin/vitest run \
  --config vitest.config.ts scripts/evaluate-observer-snapshot.test.mjs \
  --reporter=verbose
```

Bound to tree `f625dbc5a9332ae4222065bce193606bbeffeb3c` and patch SHA-256
`4b5386683f833064bae35cebe59c817ebf3deb7082f22058eed68e1bd5fe1d05`,
the retained terminal result was:

```text
PASS scripts/evaluate-observer-snapshot.test.mjs
Test Files  1 passed (1)
Tests       1 passed (1)
Test time   901.717 s
Total       902.24 s
```

The test itself executed the real `scripts/evaluate.mjs` launcher twice. The
baseline was exit 0, `conditional`, score 41 and `hardGateFailures: []`. The
joint mutation was exit 1, `reject`, score 41 and exactly seven expected
failures. This is a locked local software execution observation, not a
scientific `reproduced` result or hardware throughput benchmark.

Additional focused gates on the same final pre-record tree were:

| Gate | Result |
| --- | --- |
| `git diff --cached --check` | PASS |
| Node syntax checks | PASS |
| ESLint over all seven changed-script surfaces | PASS |
| Launcher + workflow policy + observer contract tests | PASS: 170/170 |
| Temporary-root inventory after long test | PASS: zero `tailing-observer-snapshot-e2e-*` roots |
| Freeze recheck | PASS: tree and patch identity unchanged; unstaged files zero |

## Post-review full-gate observations and reliability delta

After the dated record was first staged, a clean `npm ci` installed all 561
locked packages without changing `package-lock.json`. Two complete
`npm run check` attempts then each reached the JavaScript suite and exposed a
different pre-existing per-test wall-clock timeout under sustained shared-host
load. Neither attempt is recorded as a passing full gate:

| Attempt | Passing evidence before failure | Sole failure | Isolated unchanged rerun |
| --- | --- | --- | --- |
| 1 | lint PASS; typecheck PASS; observer regression PASS in 1,068.918 seconds; 1,297 tests passed and five skipped | `lib/molecular/aqueous-dynamics-lab-component.test.ts`, explicit 15-second limit, observed 19.210 seconds | PASS 1/1; test 1.759 seconds, 2.53 seconds total |
| 2 | lint PASS; typecheck PASS; observer regression PASS in 665.334 seconds; aqueous 10k verification PASS 31/31 in 380.529 seconds; the attempt-1 component PASS in 1.450 seconds; 1,297 tests passed and five skipped | final existing-output guard in `scripts/atomistic/openmm/nacl-water-interface-import-v0411.test.mjs`, inherited 20-second limit, observed 24.447 seconds | whole file PASS 7/7; failing case 3.232 seconds, 12.56 seconds total |

The failures moved between unrelated tests, and each passed promptly without a
source change when isolated. That evidence supports resource interference as
the bounded diagnosis; it does not convert either failed full run into a pass.
The main agent made two execution-policy-only repairs:

- `test:js` now runs the 1,297-test core suite first and the approximately
  15-minute observer evaluator regression in a fresh Vitest process second;
  the core inventory was checked with `vitest list` to exclude exactly the
  observer file, so no test is skipped; and
- the OpenMM import file's final Python-spawning existing-output guard now has
  the same 60-second execution timeout already used by other expensive tests
  in that file. No scientific tolerance, expected value, fixture or assertion
  changed. The unrelated frontend component's 15-second threshold was not
  changed.

Targeted validation of that delta passed: the package-script composition was
asserted directly, the core list contained 1,297 tests and no observer test,
and the complete OpenMM import file passed 7/7 with the formerly failing case
at 2.959 seconds. At that freeze a subsequent complete clean gate was still
mandatory, so the candidate remained NO-GO for commit.

The first attempted post-repair rerun was invalid as full-gate evidence because
the main agent put the fixed `gh` binary on `PATH` but omitted the required
absolute `TAILING_RUNTIME_FREEZE_GH_PATH`. The core run therefore ended with 12
failures across three files, including explicit runtime-freeze failures for the
missing local tool declaration and one unrelated 20-second container-observation
timeout. This was an operator-environment error, not a candidate pass. With the
exact pinned `gh` path declared, the runtime-lock and container-observation
files passed together 27/27; the previously timed-out case took 146 ms. No
source change or timeout expansion followed that invalid run.

Both follow-up read-only reviewers checked the 10-file reliability delta. They
reported P0=0 and no source, scientific, numerical or evaluator P1; they kept
one process P1 open solely because a correctly configured complete gate had
not yet passed. The following correctly configured `npm run check` then closed
that process P1:

| Gate | Final local result |
| --- | --- |
| ESLint | PASS |
| TypeScript | PASS |
| Core JavaScript | PASS: 112 files, 2 controlled skips; 1,297 tests passed, 5 controlled skips; 637.22 seconds |
| Observer real-evaluator regression | PASS: 1/1; 454.330 seconds |
| Python atomistic discovery | PASS: 91 tests, 1 controlled skip |
| Python OpenMM discovery | PASS: 42/42 |
| Safe ZIP extraction | PASS: 3/3 |
| Atomistic manifest | VALID; 693-by-2 remains NOT RUN |
| Runtime lock | VALID; `bootstrap-runtime-frozen-not-reproduced` |
| Tailing Sentinel | CONDITIONAL; 41.00/100; zero hard-gate failures |
| Production build and isolation | PASS: 64 files, 5,549,854 bytes, SHA-256 `6324d92e654ce614e90b7fb045f8f1520cc916e33c49d14507e881e5f79a5a1b`; eight forbidden public fields absent |
| Dependency audit | PASS: zero vulnerabilities at `--audit-level=low` |

The report produced during that full gate covered 413 source files, retained
score 41 and verdict `conditional`, had `hardGateFailures: []`, and bound its
public projection to source artifact digest
`sha256:ae2539ced9db7b095d6c7d186b3edd6353600c50b714988dd73b3dbda5c1550f`.
Because adding these final observations changes this review file, that digest
is intentionally pre-amendment evidence rather than the final source identity.
The evaluator and production build must be rerun after this amendment, and the
resulting identity must be checked outside this self-referential record before
commit.

The four pre-existing published report files remained byte-identical during
the focused test. Their pre-record SHA-256 values were:

| File | SHA-256 |
| --- | --- |
| `evaluation/latest-report.json` | `5106b54d76d0cb08db3463e4ad283d1ee7dbdbf01721343f914ec362c6ec6a6c` |
| `evaluation/latest-report.md` | `2341cc6fc4d2cef9e5192fa6f0ad7de319eca6709d07ca6c7960ba3a4bdcf489` |
| `evaluation/public-summary.json` | `463ee5b9a9b2e8bf0beaca291fd6d4a0ed58e68bf5196597b671e49cffdc3967` |
| `evaluation/public-product-evaluation.json` | `68e58603158f306e16abc5a7831300885481e3bfe10df3959ec69f346328dd08` |

Those reports describe the 411-source base artifact
`sha256:3bb787b000e588adbb9056659b5242803729f5c63cf8a89b7dd87433ab8b9a78`,
score 41, verdict `conditional` and no hard-gate failures. They are baseline
evidence only; post-record evaluator outputs must bind the final source set.

## Independent reviewers

- Builder and self-check: `/root/observer_snapshot_builder`. The Builder did
  not approve the candidate.
- Mechanism/scientific validity and closure: Feynman,
  `/root/round3_gap_planner`.
- Software, numerical, evaluator and CI-resource integrity:
  `/root/round3_gap_planner/observer_numeric_audit`.
- Dated primary-source, SOTA, rights and evidence boundary: Erdos,
  `/root/sota_rights_review_observer`.

Every review was read-only on the candidate. The main agent owned all repairs.
All three final reviewers independently recomputed or checked the same
pre-record identity and returned P0=0, P1=0 and LIMITED GO only for this
evaluator-integrity candidate.

## Findings and dispositions

### P0

No P0 finding was recorded.

### P1 — closed

1. **Five full evaluator runs used unsafe four-way fan-out without CI budget
   closure.** Closed by one baseline plus one joint-mutation run, strict
   post-run cleanup, explicit 18/20/45/75-minute bounded layers, workflow
   byte/policy tests and a 901.717-second successful local observation. The
   relevant scientific and software reviewers independently marked this P1
   closed. Exact GitHub-runner headroom remains a required candidate-CI check.
2. **The repaired candidate lacked one correctly configured complete green
   gate.** Closed by the final `npm run check` evidence above. The preceding
   run with a missing required `TAILING_RUNTIME_FREEZE_GH_PATH` remains
   explicitly invalid, and the two earlier moving timeout failures remain
   failed attempts rather than being retroactively promoted.

### P2 — initial items closed

1. **The initial name said “every” and only used `toContain`.** Closed by the
   quantified “four enumerated” name, an exact seven-gate set and a separate
   exact four-raw-digest projection.
2. **The copy fixture did not check link count or canonical resolution.**
   Closed by `nlink === 1` and realpath equality before every copy.

### P2 — residual, non-blocking

1. The test covers one joint, capture-before, trailing-space vector. It is not
   evidence for arbitrary byte mutations, four independent evaluator runs,
   capture-after races, path replacement or authenticated tamper resistance.
2. The local source manifest and artifact digest are unsigned bindings, not a
   SLSA or in-toto attestation.
3. The regression costs about 15 minutes under the observed local load.
   Candidate and main CI must monitor actual 75-minute headroom. Performance
   work may reduce duplicate computation only if it preserves the same real
   launcher/worker and fail-closed assertions.

## Cross-task coordination incident

During timeout diagnosis, the main agent incorrectly attributed an unrelated
`/private/tmp/tailing-ai-phase48-py31213/bin/python3` process to this test and
sent SIGTERM to its exact Python and `/usr/bin/time` PIDs. The process belonged
to the separate active Tailing AI Phase 48 task. No file was deleted, but that
computation was interrupted and its exit 143 was invalid evidence. The main
agent immediately corrected the attribution, notified the owning task with
the exact PIDs and time, and the owning task restarted its byte-level
verification. No result from that process, before or after interruption, is
used by this candidate. Future cleanup must be based on a process handle or
proven parent/child group created by this task, never on name or timing alone.

## Scientific, product, score and rights boundary

The seven changed files contain no solver, force field, model checkpoint,
training data, inference adapter, visualization or cross-scale bridge. They do
not add any energy, force, stress, uncertainty, accuracy, throughput, memory
or GPU observation. They do not establish a causal effect, counterfactual,
electronic density, orbital, bond order, material mechanism, reactor model or
industrial recommendation.

The observer fixture remains `execution:not-run`,
`scientificDecision:abstain`, with zero container observations and all claims
false. Its three rights decisions remain independent and false:

- `privateExecutionAllowed=false`;
- `aggregatePublicationAllowed=false`; and
- `runtimeRedistributionAllowed=false`.

Random-TP remains `NOASSERTION` with `redistribute:false`; runtime and plan
states remain `*-not-reproduced`. The scorecard and comparator registry are
unchanged. There is no new external or local `reproduced` evidence, no
like-for-like numerical ranking, no data-leakage certification, no SOTA claim
and no basis to display new model outputs in the three-dimensional product.

The unchanged R2 reduced-unit Lennard-Jones/heat/A-to-B world is not described
as a real material, chemical mechanism, reactor or process. No PLC, DCS, SIS
or other safety-critical path is added.

## Dated SOTA and provenance comparison

The SOTA/rights reviewer checked primary sources on 2026-09-04. MatterSim and
MACE remain external `auditable` or `reference` evidence only, while AIDO Cell
remains an architectural `claim/reference`, not a like-for-like materials
baseline.

- MatterSim model card and Random-TP source at fixed commit
  `40a1eb8f1189a53af310957b4f2c5dfbfe68d647`:
  <https://github.com/microsoft/mattersim/blob/40a1eb8f1189a53af310957b4f2c5dfbfe68d647/MODEL_CARD.md>
  and
  <https://github.com/microsoft/mattersim/blob/40a1eb8f1189a53af310957b4f2c5dfbfe68d647/data/benchmarks/random-TP.xyz>.
- MatterSim 1.2.5 package and paper:
  <https://pypi.org/project/mattersim/1.2.5/> and
  <https://arxiv.org/abs/2405.04967>.
- MACE source at fixed commit
  `4d2da09413ac1407f37cdbb6b81fa28e4c15655e`, MACE-MPA-0 release,
  package and paper:
  <https://github.com/ACEsuit/mace/blob/4d2da09413ac1407f37cdbb6b81fa28e4c15655e/README.md>,
  <https://github.com/ACEsuit/mace-foundations/releases/tag/mace_mpa_0>,
  <https://pypi.org/project/mace-torch/0.3.16/> and
  <https://arxiv.org/abs/2401.00096>.
- `python-hostlist` 2.3.0 official metadata records GPL2+ and only a source
  distribution. This is an existing `auditable` fact, not permission:
  <https://pypi.org/project/python-hostlist/2.3.0/>.
- The current approved SLSA Build Provenance specification is v1.2:
  <https://slsa.dev/spec/v1.2/build-provenance> and
  <https://slsa.dev/spec/v1.2/verifying-artifacts>.
- in-toto Statement v1 and its validation model at fixed revision
  `2dcd055e9f72e746687c306e35f4e59720ff45be` require a matching subject
  digest, recognized attester and signature envelope:
  <https://github.com/in-toto/attestation/blob/2dcd055e9f72e746687c306e35f4e59720ff45be/spec/v1/statement.md>
  and
  <https://github.com/in-toto/attestation/blob/2dcd055e9f72e746687c306e35f4e59720ff45be/docs/validation.md>.

Changing timeout budgets and adding a mutation regression cannot be compared
to model accuracy or scientific capability. No external number enters the
score or ranking.

## Lifecycle status at record creation

| State | Status |
| --- | --- |
| Local implementation | Complete for the bounded candidate; correctly configured full local gate and dependency audit passed |
| Commit | Not created |
| Push | Not performed |
| Pull request | Not created |
| Candidate CI | Not run |
| Main merge | Not performed |
| First-main CI | Base `67feea...` passed; no candidate first-main CI exists |
| Release artifact | Not created for this candidate |
| Cloudflare deployment | Not performed |
| Canonical smoke | Prior deployed main only; not candidate evidence |

No commit, push, PR, merge, release or deployment is permitted unless the
post-amendment evaluator/build identities are frozen, final independent review
has no P0/P1, and a fresh remote-main fetch shows no conflict. This round does
not authorize a Cloudflare deployment even if CI passes.

## Residual limitations and next tasks

At most three next tasks are carried forward:

1. Complete candidate PR CI and first-main CI on exact immutable commits, and
   record actual 75-minute headroom and artifact identities separately.
2. If release-grade provenance is required, add SLSA v1.2 plus signed in-toto
   subject/attester/envelope verification; do not relabel unsigned local
   digests as authenticated provenance.
3. Resolve private execution, aggregate publication and runtime
   redistribution rights independently before seeking human authorization
   for a 693-by-2 like-for-like MatterSim/MACE run. That future run still must
   independently validate energy, force, stress, errors, uncertainty,
   determinism, cost and domain limits before any product integration.

The next scientific milestones remain PFHub Benchmark 3 and Cantera 3.2 CSTR
only after the v0.5 atomistic bridge has genuine executable evidence. Nothing
in this round advances those milestones.
