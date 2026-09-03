# R7b2 GitHub readiness and private handoff — final independent review

Date: 2026-09-03

Implementation disposition: **GO only for the non-running, non-authoritative
control-plane policy and private codec source candidate**

Commit, promotion, release and deployment disposition: **NO-GO**

The NO-GO is mandatory because the complete JavaScript/runtime-lock gate and
the release-manifest gate are red. This candidate was not committed, pushed,
opened as a pull request, run in candidate CI, merged or deployed.

## Frozen bounded hypothesis

Without adding or dispatching a producer workflow, calling GitHub, running a
foundation model or publishing scientific bytes, Tailing Future can add a
fail-closed source contract which:

- selects only the complete first producer run (`run_number === 1`) and attempt
  one after an exact successful protected-main Sentinel observation;
- admits a private scientific handoff only from the exact process-local proof
  of a `completed/success` model job and an exactly bound `complete` producer
  outcome;
- preserves failed, cancelled, timed-out and not-started outcomes as empty,
  machine-readable terminal evidence;
- treats AES-256-GCM only as an authenticated private-storage codec, never as a
  publication, redistribution, GitHub-origin or scientific-validity proof; and
- returns a schema-valid rejection with all six positive readiness claims
  false while the producer workflow remains unconfigured.

The preregistered acceptance checks were: schema-total rejection behavior;
first-run/attempt-one and strict Sentinel ordering; exact run/job/model/source
binding; rejection of caller-reported, cloned, spread, JSON-round-tripped and
`structuredClone` provenance; complete versus terminal outcome separation;
independent recomputation by the core verifier; exact private publication-policy
locks; unchanged frontend compatibility contracts; and all applicable repository
gates.

## Real-time baseline and conflict isolation

The round began by checking the repository, remote, GitHub, CI and canonical
site rather than relying on the goal snapshot.

- Remote `main` was
  `72bc2011d75d9880b9918b70c903129b9bf1de65`; its required protected check was
  `evaluate`. Main workflow run `33682276037` succeeded on its first attempt.
  Artifact `9867675870` had digest
  `sha256:b6688fb39bf081e7ae2a07853c2c6862bb73fae5081c73dd1a0743e47da273d9`.
- The canonical Cloudflare URL returned HTTP 200 and identified the same
  `72bc2011d75d9880b9918b70c903129b9bf1de65` source revision. WebGL2 context,
  one-step dynamics and browser-console smoke passed. No Cloudflare API token
  was present, so this check is a public-site observation, not a deployment
  receipt.
- The user's original worktree was already dirty on
  `codex/causal-mechanism-foundation` at `643b8b15...`; it was not modified.
  All work occurred in the isolated
  `/Users/tonywilliam/Documents/ChatGPT/Tailing Future-v05` worktree on
  `codex/v05-ai-interatomic-bridge`, based exactly on remote `main`.
- The observed host was Apple M5, arm64, 24 GB, with no Docker and no canonical
  693-by-two cache or execution. Temporary official Node.js 24.16.0 and GitHub
  CLI 2.99.0 binaries were archive-hash checked; the canonical `npm ci` tree
  contained 561 packages.

These are separate states: baseline main CI and canonical-site smoke do not
constitute candidate CI, candidate release evidence or candidate deployment.

## Candidate scope

The independently reviewed implementation freeze modified eleven files: the
atomistic reproduction protocol, package script surface, one readiness schema,
three policy/CLI modules and their tests, and the full-candidate verifier plus
tests. It contained 2,496 insertions and 25 deletions.

No workflow, authenticated GitHub adapter, network operation, `gh` operation,
Sigstore operation, model inference, frontend component or public scientific
payload was added. `FULL_CANDIDATE_PRODUCER_WORKFLOW` remains exactly
`{ configured: false, id: null }`. The readiness CLI accepts no input and exits
nonzero with `producer-workflow-not-pinned`.

The candidate does not modify `tf.world/0.3`, `tf.action/0.3` or
`tf.observation/0.3`, and does not add a taxonomy-to-causality promotion or a
quantitative intervention claim.

## Freeze ledger

Every review used a frozen staged tree and SHA-256 of the cached binary diff
against the exact base revision.

| Freeze | Staged tree | Cached diff SHA-256 | Disposition |
| --- | --- | --- | --- |
| Initial unsafe draft | `5e5f43d3...` | `e8b95c5a...` | Withdrawn; NO-GO |
| First revised draft | `80881eb...` | `bf1e36c...` | Superseded; NO-GO |
| First remediation | `95634bc6...` | `178d6d37...` | Superseded; NO-GO |
| Final implementation | `4f5ed39f2c32ed5459b301d6f60ea30bb345b1c9` | `922f890a0d9433856c166443e86a6c0774f36def3a4ba65a2ee7c2cade32321a` | Three limited-scope GO reviews |

The Builder (`/root/handoff_builder`) implemented the initial bounded slice and
reported its 8/8 self-check. The Builder did not approve the candidate. The main
agent owned all review-driven fixes. Each reviewer remained read-only on the
freeze it assessed.

## Independent reviewers

- Mechanism/scientific validity: Bohr, `/root/scientific_evaluator`.
- Software/numerical/evaluator integrity: Huygens, `/root/gap_planner`.
- Dated primary-source/SOTA comparison and next gaps: Carver,
  `/root/sota_scout_round2`.

For the final implementation identity, all three reviewers independently
reported GO only within the current non-running control-plane/codec scope. No
review treated a review statement as a substitute for executable validation,
an authenticated GitHub observation, a full solver run or release evidence.

## Findings and dispositions

### P0

No P0 finding was recorded in any freeze.

### P1 — all implementation findings closed

The initial unsafe draft had four definite P1 blockers plus an unresolved
ciphertext-redistribution permission blocker. It permitted unsafe combinations
of selective reruns/attempt two, overclaimed exclusive-label evidence, proposed
a public Actions artifact before a producer/locked workflow identity existed,
and did not preserve the Random-TP licensing boundary. The public-artifact path
was withdrawn rather than promoted; no workflow or operational adapter remains
in this candidate, and plaintext and ciphertext publication are both forbidden.

The first revised freeze then had four exact P1 findings:

1. first-dispatch selection did not require `run_number === 1`;
2. private handoff and the core verifier still admitted attempt two;
3. producer creation simultaneous with Sentinel completion could pass; and
4. `250×20` was described as directly reported rather than inferred from
   `50×5`, without stating that its relationship to the released `693×16` file
   is unknown.

The first remediation closed those four, but independent scientific review
found one new P1: successful model-job terminal state was not inseparably bound
to handoff provenance, so a failed workflow/job observation could be combined
with a `complete` outcome.

The final implementation closes that P1. `validateFirstProducerJob` binds the
exact workflow run, attempt, job, model, model ID, source revision, status and
conclusion in a process-local proof. Private create/open operations derive
provenance only from an original `completed/success` proof and the exactly
matching complete outcome. Wrong jobs, failed jobs, caller-added provenance,
spread/JSON/structured clones and terminal-proof clones are rejected. Overall
workflow failure remains representable when the exact model job itself
succeeded. Failed, cancelled, timed-out and not-started states produce no
producer output and an empty `Map`; the core verifier recomputes them as
`incomplete`.

Final implementation result: **P1 = 0**.

### P2 — three residual boundaries

1. There is no authenticated operational GitHub adapter. A process-local
   WeakSet proof demonstrates that this policy validated the supplied object;
   it does not authenticate GitHub API origin, pagination completeness or job
   and check URLs.
2. The zero-artifact predicate checks the supplied live listing only. It cannot
   prove that an earlier Actions artifact was created and later deleted.
3. Dataset-specific Random-TP redistribution permission remains unresolved.
   Neither plaintext nor ciphertext may be published; encryption creates no
   license right.

These P2 items do not block review of a deliberately unconfigured, non-running
source policy. Each becomes a promotion blocker before any producer workflow
can be enabled.

## Executable evidence after the final fix

| Gate | Result | Evidence boundary |
| --- | --- | --- |
| Four targeted Node test files | PASS: 59 passed, 1 private-dataset skip | Policy/codec/verifier behavior only |
| Targeted ESLint | PASS | Modified JavaScript files only |
| Full ESLint | PASS | Repository lint surface |
| TypeScript | PASS | `tsc --noEmit` |
| Core Python suites | PASS: 91 passed, 1 skipped | Local available environment |
| OpenMM policy/scientific tests | PASS: 42 passed | Does not make the stored OpenMM assets a scientific reproduction |
| Safe ZIP tests | PASS: 3 passed | Expected duplicate-name warning observed |
| Dependency audit | PASS: 0 reported vulnerabilities | Installed canonical npm tree |
| Atomistic plan validator | PASS | Prints `FULL CANDIDATE FROZEN 693×2 — NOT RUN · PLAN ONLY — NO INFERENCE` |
| Readiness CLI | Expected rejection | Exit 1, schema-valid, six positive claims false |
| Deterministic Sentinel | CONDITIONAL, 41/100, no Sentinel hard-gate failures | Evidence-maturity score, not truth or SOTA |
| Production build/isolation | PASS | 64 public files, 5,546,830 bytes, 8 forbidden fields absent |
| Full JavaScript suite | **FAIL**: 106 files passed, 2 failed, 2 skipped; 1,020 tests passed, 5 failed, 5 skipped | Five existing runtime-freeze/runtime-lock failures; candidate tests pass |
| Runtime-lock half of `atomistic:validate` | **FAIL** | `offline gh verification failed (spawn gh ENOENT)` |
| Release manifest | **FAIL** | `release commit must be a full lowercase Git SHA`; `.release-artifact` absent |

The full JavaScript command used official Node.js 24.16.0 and the canonical
`npm ci` tree, with the checked GitHub CLI 2.99.0 directory added to the caller
`PATH`. The five failures are the existing main runtime-freeze/runtime-lock
incompatibility: two `gh` ENOENT paths, two mock seams returning an object where
the verifier requires bytes/string, and one downstream `verifiedGhOutput`
cascade. They are not regressions in the eleven-file implementation diff, but
the mandatory repository gate is still red and therefore blocks commit and
promotion.

The long deterministic checks inside the full run still passed, including the
10,000-step NVE replay. That passing numerical evidence does not override the
five failed tests.

## Deterministic evaluator and build evidence

The post-fix evaluator wrote four generated reports for the reviewed
implementation source snapshot:

- `evaluation/latest-report.json`:
  `bd871bac482fc69dc9be8e3c802aa3ea53007ceb664a7de9be7f45a9393d8ddc`;
- `evaluation/latest-report.md`:
  `6fcfcba742043c891024fbe8c08ca28f90c11c00fcd6e994d067be01b8de9383`;
- `evaluation/public-summary.json`:
  `9f26f7d5b22ada33c181fb405c26c060faf74f7a20e3cc8a4e43232d9bc69d24`;
- `evaluation/public-product-evaluation.json`:
  `c8e16a1a99bd0a9238327c40634ea74c4dda699cc42a3eb55c0917ac5ec63b61`.

The evaluator verdict is `conditional`, weighted evidence maturity is 41/100,
and its own `hardGateFailures` array is empty. Its source snapshot contains 382
files and has artifact digest
`sha256:4a65f3c4ff21e085524e86999ce2bae1b1797f8894bfd504026592b6d3780869`.
The scorecard was not changed. The evaluator's empty hard-gate array does not
include or waive the separately red full-JavaScript, runtime-lock and
release-manifest gates above.

The production isolation result contains 64 files and has digest
`sha256:74982cf9289e6554f4f22f1cb28a700359b77a9428335c2c615f32d4cc84667a`.
The bundle-size warning for a chunk above 500 kB is non-blocking. A release
artifact was not generated.

The four generated reports and this review file are post-review evidence. They
are intentionally excluded from the reviewed implementation tree
`4f5ed39f...` and its evaluator source digest; rerunning the evaluator after
adding a review of its own output would create a self-reference. They must be
checked separately as evidence-only additions and do not expand the
independently approved implementation scope.

## Scientific and SOTA statement boundary

The released Random-TP file is locked as 693 structures of 16 atoms (11,088
atoms total), with SHA-256
`c14473dcf4bd71e1ed11556ac9ff12b68e7a423d813f939bc9eedaef663054d9`.
MatterSim paper section S6 instead reports 50 random initial structures of 20
atoms and five sampled frames per trajectory. `250×20` is therefore an
explicit inference from `50×5`, not a directly reported dataset count, and its
relationship to the released `693×16` file remains unknown. The bases are not
interchangeable.

The fixed MatterSim 5M model card numbers—0.199 eV/atom energy, 0.824 eV/Å
force and 1.999 GPa stress—remain external `AUDITABLE` references, not local
results. The locked challenger is MACE-MPA-0 medium. MatterSim paper S6 reports
a different MACE-MP-0 large identity at a different revision, so those numbers
cannot be transplanted into a target for this challenger. MACE-MPA-0 medium has
no locked official Random-TP target. No numerical ranking, superiority claim or
data-leakage certification is permitted.

Scientific units remain energy in eV, force in eV/Å and ASE stress in eV/Å³;
comparison metrics remain eV/atom, eV/Å and GPa on the stated basis. Envelope
byte counts and SHA-256 digests are not physical observables. AES-GCM authenticates
relative to its key only; it does not authenticate GitHub origin. JavaScript
buffer clearing is best-effort and does not prove removal of immutable strings,
native copies or garbage-collected memory.

AIDO Cell remains a `REFERENCE` architecture, sequencing and visual-language
comparator, not a reproduced like-for-like materials benchmark. Its public
performance remains a vendor `CLAIM`, not a local result. This source candidate
does not add learned persistent state, electronic structure, a 693-by-two
result, PFHub Benchmark 3, Cantera 3.2 CSTR, a cross-scale bridge, a causal
total effect or an industrial recommendation.

In this review, `CLAIM` means a source-owner result lacking the locked public
artifacts required for independent audit; `REFERENCE` is architecture or
method context; `AUDITABLE` means the fixed public artifacts can be inspected
but the result has not been locally reproduced; and `REPRODUCED` is reserved
for a locked, like-for-like Tailing Future run with independent local
verification. No external number above is `REPRODUCED` or enters a ranking.

Primary comparison sources retained by the review:

- https://genbio.ai/aido-cell-simulator/
- https://arxiv.org/html/2405.04967v2
- https://github.com/microsoft/mattersim/blob/40a1eb8f1189a53af310957b4f2c5dfbfe68d647/MODEL_CARD.md
- https://github.com/microsoft/mattersim/blob/40a1eb8f1189a53af310957b4f2c5dfbfe68d647/data/benchmarks/random-TP.xyz
- https://github.com/ACEsuit/mace/blob/4d2da09413ac1407f37cdbb6b81fa28e4c15655e/README.md
- https://docs.github.com/en/rest/actions/workflow-jobs
- https://pages.nist.gov/pfhub/benchmarks/benchmark3.ipynb/
- https://github.com/Cantera/cantera/releases/tag/v3.2.0

## Promotion boundary and next round

There is **NO FULL PRODUCER WORKFLOW / NO 693×2 RUN / NO AUTHORITATIVE FULL
RECEIPT / NO PUBLIC SCIENTIFIC PAYLOAD**. Nothing in this review changes that
state. No commit, push, pull request, candidate CI, merge, release, deployment
or engineering recommendation is authorized while the red repository gates
remain.

At most three next tasks are retained:

1. Repair the pre-existing runtime-freeze/runtime-lock execution seams, then
   rerun every lint, type, numerical, schema, evaluator, build and release gate.
2. Specify and independently review an authenticated, pagination-complete
   GitHub adapter and auditable no-artifact-deletion boundary while keeping the
   producer unconfigured; resolve Random-TP redistribution rights before any
   public or private execution design is enabled.
3. Only after those gates pass, freeze the real producer/runtime candidate for
   a separately reviewed 693-by-two run; PFHub Benchmark 3 and Cantera 3.2 CSTR
   remain subsequent milestones, not current evidence.
