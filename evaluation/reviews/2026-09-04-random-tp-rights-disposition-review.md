# Random-TP rights disposition v0.1 — independent review

Review date: 2026-09-04

Final local-gate closure recorded: 2026-09-05

Implementation disposition: **LIMITED GO for the exact, default-deny
H-RIGHTS-DISPOSITION/0.1 evidence milestone reviewed here**

Private model execution, workflow registration or dispatch, aggregate
publication, runtime/checkpoint redistribution, scientific reproduction,
score promotion, release and deployment disposition: **NO-GO**

This milestone records a machine-readable abstention for three independent
rights questions over one exact Random-TP dataset, two exact checkpoints and
their exact CPU runtime closures. It grants no right. It does not execute
MatterSim, MACE or OpenMM, does not download model or dataset bytes, and does
not produce energy, force, stress, throughput, memory or uncertainty results.
The 693-by-2 campaign remains **NOT RUN** and the evidence-maturity score
remains 41/100.

## Frozen bounded hypothesis and acceptance tests

The frozen hypothesis was:

> A versioned Random-TP rights artifact can bind the exact proposed private
> compute scope while representing private execution, aggregate publication
> and runtime redistribution as three non-substitutable `false + abstain`
> decisions; any byte, semantic, source, authority, scope or bound-evidence
> drift must fail closed, and Tailing Sentinel must reject such drift without
> increasing the score.

Acceptance required:

- exact dataset revision, Git blob OID, project SHA-256, 693-frame ID set,
  structure manifest and label manifest bindings;
- exact MatterSim and MACE source, package, checkpoint, size and SHA-256
  bindings, including the MPA-0 foundation release/asset identity;
- exact per-model dependency lock, input manifest, dependency graph,
  installed-path closure and common CPU runtime/image/runner identities inside
  the proposed scope digest;
- explicit units, dimensions and bases for all request-count quantities, with
  `1386 + 1386 + 80 + 712 + 480 = 4044`;
- three named rights slots that cannot be exchanged or substituted, with no
  grant state in v0.1;
- no authority default clock, strict principal/record validation, and a
  mandatory versioned migration even for a future otherwise-well-formed
  authority record;
- exact standalone JSON Schema rejection of widened network scope, exchanged
  decision slots, checkpoint substitution and duplicate source lists;
- bounded, mode-0644, canonical, non-symbolic, singly linked reads for the
  disposition, schema and nine local evidence files, followed by one final
  all-file identity audit after cross-file validation;
- invalid UTF-8, trailing data, duplicate members, wrong mode, symlink,
  hard-link and read-after-validation race mutations to fail closed;
- direct rights validation inside the frozen Sentinel source snapshot;
- a rights-only, semantically unchanged trailing-space mutation to produce a
  `reject` verdict with exact rights hard gates and score 41; and
- no modification to `tf.world/0.3`, `tf.action/0.3`,
  `tf.observation/0.3`, the scorecard, existing observer/receipt contracts,
  model/runtime locks or frontend code.

The Builder implemented and self-checked the first candidate but could not
approve it. The main agent owned every repair after review. Review does not
substitute for legal advice, authenticated authorization, executable
validation, model inference, an independent solver, experiment or qualified
engineering approval.

## Baseline and lifecycle state

- Isolated worktree:
  `/Users/tonywilliam/Documents/ChatGPT/Tailing Future-v05-rights`.
- Branch: `codex/v05-random-tp-rights-disposition`.
- Base and local `HEAD` at the formal review freeze:
  `5b6d835ec7df97ca2a5e0e9397c786ee67845004`.
- That SHA is the merged H-OBS-SNAPSHOT-1 main commit. Its first exact-main
  Tailing Sentinel run `33873930316`, job `101026243460`, attempt 1, completed
  successfully. Artifact ID `9938508146` had download SHA-256
  `bd4d876afbfc52e847a9b15d0d4bdca52b1720fb759f2ec7bd76a0dcd0137c6d`.
- At round start, `origin/main` and GitHub main were that same SHA. The
  canonical protected site returned HTTP 200 with title
  `Tailing Future — 材料世界模型实验室`; that was prior deployment evidence,
  not a deployment of this candidate.
- Local implementation and review are complete for the bounded milestone.
  Commit, push, PR, candidate CI, merge, first merged-main CI, release
  artifact, Cloudflare deployment and post-deploy smoke are separate later
  states. None is implied by this record.
- The unrelated dirty primary worktree was not edited. Coordination with its
  active task reserved this isolated worktree and the shared report paths.

## Candidate evolution and retained failures

The Builder's initial five-file freeze was:

- tree `5768e7a5524967834075d947ba388e88f9ff120a`;
- binary patch SHA-256
  `78fd7d8f46f95664b3cab004931876b9645713d769cc21ab036d090458751496`;
- focused rights tests 10/10, lint, typecheck and atomistic validation passed;
  and
- one broader test attempt was not green: under concurrent shared-host load
  and without the mandatory fixed `gh` environment declaration it reported
  seven failed files and 18 failed tests. That run remains failed evidence and
  is not described as a pass.

Independent software review rejected that freeze with three P1 findings:

1. the standalone schema accepted widened scope, exchanged slots, checkpoint
   substitution and duplicate source lists;
2. Sentinel inventoried but did not directly validate the rights artifact;
3. sequential cross-file reads lacked a final all-file identity re-audit and
   could return a stale validation result.

The same review recorded three P2 items: a fixed default authority clock and
weak principal shape, incomplete scope-digest identity coverage, and missing
independent digest literals plus malformed-file/race/Sentinel tests. The
scientific and SOTA reviews also requested stronger scope and primary-source
digest bindings. The initial candidate was therefore **NO-GO**.

During repair, retained non-promotional failures were:

| Observation | Disposition |
| --- | --- |
| Three first static commands returned `env: node: No such file or directory` because the fixed Node directory was omitted from `PATH`. | Operator invocation failure; all three were rerun with Node 24.16.0 on `PATH` and passed. |
| First repaired Sentinel returned `REJECT` because a new diagnostic property was not allowed by the frozen evaluation-report schema. | Correct schema rejection; the unnecessary report property was removed while the direct rights hard gate was retained. The rerun returned `CONDITIONAL`, score 41 and zero hard gates. |
| First three-snapshot E2E attempt returned the expected mutation `REJECT`, but its exact-set assertion omitted the additional bound-observer-evidence rights gate. | Test expectation defect; the stronger gate was added to the exact expected set. The full three-snapshot rerun passed. |

Final-gate attempts also retain all non-zero results. On the unchanged repaired
source, repeated full-suite runs on the shared battery-powered macOS host
reported only wall-clock timeout failures, not a conflicting numerical or
scientific assertion. None was counted as a pass:

| Invocation/environment | Retained result |
| --- | --- |
| First standard `npm run check` | Core tests non-zero: 5 failed files, 108 passed, 2 skipped; 6 failed tests, 1304 passed, 5 skipped. The failures were timeout observations. |
| Second standard `npm run check` | Core tests non-zero: 1 failed file/test, 112 files and 1309 tests passed, 2 files and 5 tests skipped. The remaining failure was a 60-second timeout. |
| Standard `npm test`, output buffered | Non-zero: 16 failed files/tests, 97 files and 1256 tests passed; 2997.68 seconds. |
| `caffeinate -i npm test` in the original isolated worktree | Non-zero: 18 failed files and 16 failed tests, 95 files and 1254 tests passed; 3075.14 seconds. Preventing idle system sleep alone did not close the gate. |
| Detached `/private/tmp` exact-tree diagnostic with linked dependencies | Non-zero: 16 timeout failures plus the expected canonical-directory rejection of a linked `node_modules`; it was ineligible as gate evidence. |
| Detached exact-tree diagnostic with a real but mechanically cloned dependency directory, default foreground scheduling and `caffeinate -i` | Non-zero: 15 timeout failures, 98 files and 1277 tests passed; 2932.37 seconds. It was also ineligible because the dependency directory was not a clean install. |

The successful run below used a clean `npm ci`, a real local dependency
directory, a `.noindex` detached worktree to avoid the Documents/File Provider
path, default foreground scheduling via `taskpolicy -B`, and explicit display,
disk and idle-sleep assertions via `caffeinate -dimsu`. These controls changed
no test selection, retry, worker, assertion, trajectory size or timeout. They
do not establish that endpoint security was absent or disabled.

The independently reviewed repaired pre-record freeze was:

- base `5b6d835ec7df97ca2a5e0e9397c786ee67845004`;
- staged tree `2fefc49d3b37e43f3c75c495452c9904e2bae05c`;
- seven staged files; and
- cached binary diff SHA-256
  `1ccf0f70cff3fd104840fc8de9312b7b1eee649f2c3d717558c0b4222665e620`.

After adding this required review artifact, the exact local gate freeze was:

- base `5b6d835ec7df97ca2a5e0e9397c786ee67845004`;
- staged tree `0c4ad23fc34f8a9511d942aa2835c5ba632ba044`;
- eight staged files, consisting of the seven reviewed implementation paths
  plus this review artifact;
- default cached binary diff SHA-256
  `209c5e9e26c3d002a3b76691edad599c2a79775d830e781bd4f14c61e58868ed`;
- full-index cached binary diff SHA-256
  `46ec95023f2cf83490f20ece17204e3d6fe36098de5e686c4fad91ab6ba8519d`;
  and
- zero unstaged differences and zero non-ignored untracked source paths in the
  detached gate worktree before and after the successful run.

The four generated evaluation reports were deliberately excluded from that
gate tree and are treated as deterministic derived evidence. They must be
regenerated from the final review-artifact bytes, summarized and staged only
after the post-record evaluator/build rerun succeeds.

The seven reviewed paths and file SHA-256 values were:

| Path | SHA-256 |
| --- | --- |
| `evaluation/atomistic/random-tp-rights-disposition-v0.1.json` | `32e0134c25553ab7a415ffab526b4bb82a81e487f1dae3424c25b841faf9962f` |
| `schemas/atomistic-random-tp-rights-disposition.schema.json` | `7c1f5c781c87cc3dfbfa0349be3b77a0529e23f569b1b4a213595bc0d606297c` |
| `scripts/atomistic/random-tp-rights-disposition-policy.mjs` | `413b4e967b4fabb93d28b510c10de64838b0c7b60d64009ed9479959b3a8e1bb` |
| `scripts/atomistic/random-tp-rights-disposition-policy.test.mjs` | `2b0d52f8014b78d99d207c4484706356c32f90d3136b4769c454b6060f64a3b1` |
| `scripts/evaluate-observer-snapshot.test.mjs` | `e260adb8808e4d87385b47a57138932f410368bd4dce0749783cb30909890962` |
| `scripts/evaluate-worker.mjs` | `e26162e4bd5796754aa5cbf90c1dd91cc9ba59d3a7cdae392e5d697c6edc8b4e` |
| `scripts/validate-atomistic-plan.mjs` | `42d4d48bd39c1b73deb3cf06ea0a92e575d74b875c74ee9f9aaa68e8cded2d93` |

The disposition raw, semantic, standalone-schema and private-scope digests
were respectively:

- `sha256:32e0134c25553ab7a415ffab526b4bb82a81e487f1dae3424c25b841faf9962f`;
- `sha256:edfaf76141afd65221f674f55c806568f3b7aab57eea9b62d2dabc9c67866cd3`;
- `sha256:7c1f5c781c87cc3dfbfa0349be3b77a0529e23f569b1b4a213595bc0d606297c`;
  and
- `sha256:c73cbb22ae3f7c57579d55c1242f6a0434eb79fb0489cd8799fceff67b8e3c91`.

## Executable evidence and local gate closure

All commands used Node.js 24.16.0 and the absolute fixed `gh` 2.98.0 path.

| Gate | Result |
| --- | --- |
| Rights policy tests | PASS: 13/13, including strict-AJV, invalid encoding/trailing data, filesystem safety, TOCTOU and authority mutations |
| Real Sentinel source-snapshot E2E | PASS: 1/1; three full evaluator snapshots; 1,009.25 seconds |
| E2E baseline | exit 0; `conditional`; score 41; `hardGateFailures=[]` |
| E2E five-source joint mutation | exit 1; `reject`; exact observer, bound-evidence and rights gate set; score 41 |
| E2E rights-only trailing-space mutation | exit 1; `reject`; exact rights raw-digest plus dependent atomistic gate; score 41 |
| ESLint | PASS |
| TypeScript | PASS |
| Atomistic manifest and runtime lock | PASS; `693×2 — NOT RUN`; `RIGHTS 3/3 ABSTAIN`; `DISPATCH BLOCKED`; runtime `bootstrap-runtime-frozen-not-reproduced` |
| Local Tailing Sentinel | `CONDITIONAL`; 41/100; zero hard-gate failures |
| `git diff --cached --check` | PASS |
| Clean dependency installation | PASS: npm 11.13.0 installed 561 packages from lock SHA-256 `159a3c4e740dc206b0e217f21f86dce39198309d116cd74661c816e68ee5d20d`; `npm ls --depth=0` exit 0; audit found zero vulnerabilities |
| Complete local `npm test` on gate tree `0c4ad23f…` | PASS, exit 0, 2026-09-05 03:59:52Z–04:15:52Z; core 113 files/1310 tests passed with 2 files/5 tests skipped; observer snapshot 1/1 passed; Python groups 91 (1 skipped), 42 and 3 passed |
| Complete-test log | 320 lines, 25,906 bytes, SHA-256 `45e0f1ceceba21fdf65bd34ec0093a9d74a137b49d37045e5c8d1fc4e6ffeb28`; the runner separately recorded `exit_code=0`, command wrapper and unchanged pre/post tree and patch identities |
| Local complete-test runtime | Node 24.16.0; npm 11.13.0; fixed `gh` 2.98.0; `/usr/bin/python3` 3.9.6, SHA-256 `b8763cf250e607a778bb4603cecb5b90338814d0a3dfcba0d57b1de242f610e9`; macOS on battery power |
| Post-test static/numerical/evaluator/build chain | PASS, exit 0, 2026-09-05 04:21:34Z–04:24:37Z: lint, typecheck, atomistic validation, local Sentinel, production build, dependency audit and cached-diff check; log SHA-256 `b48e6a201cd808b4ff0a9150f7215e8d22dd1a8a00e60afbc0e7d599e4ffa4a7` |
| Production isolation | PASS: 64 files, 5,549,854 bytes, SHA-256 `b08270fefdbf943832d7a5e1e27c5d4a54d053c2e6c27a9fe0160c00d2413545`; public evaluation 4,804 bytes and eight forbidden fields absent |

This is software and evidence-contract validation only. No result in this
table is a MatterSim/MACE reproduction or scientific performance observation.

## Primary-source and rights evidence

The dated SOTA/rights scout checked only primary papers, official repositories,
official releases and the official package index. The disposition records:

- MatterSim revision `40a1eb8f1189a53af310957b4f2c5dfbfe68d647`,
  LICENSE SHA-256 `fd532481…e93d`, MODEL_CARD SHA-256
  `9f48dff…c5b7`, Random-TP Git blob
  `79bddf16aac8f8f5559fe2218867a7817fad4219`, absent official API
  SHA-256 and separate project-frozen SHA-256 `c14473dc…054d9`;
- MACE revision `4d2da09413ac1407f37cdbb6b81fa28e4c15655e`, README,
  setup and LICENSE SHA-256 values `1ef0c309…3038`, `3b279d3b…f12` and
  `42137790…2e86`;
- mace-foundations revision `6de003bb29db05f451051c30ce809fad522d26da`,
  LICENSE SHA-256 `31ea0ccf…da1c`, release ID `191152959`, asset ID
  `213937064`, asset size `79462305`, official asset digest `null` and a
  separately identified project checkpoint SHA-256; and
- python-hostlist 2.3.0 raw upstream license `GPL2+`, upstream
  `license_expression:null`, project normalization `GPL-2.0-or-later`, sdist
  name, size `37326` and SHA-256 `e1a0b18e…71ea`.

These records are `reference` or `auditable`, never `reproduced`. The scout's
review is not legal advice or authority to execute, publish or redistribute.

## Independent reviewers

- Builder and self-check: `/root/rights_disposition_builder`; the Builder did
  not approve the candidate.
- Mechanism/scientific validity: Aquinas,
  `/root/rights_scientific_evaluator`.
- Software, numerical, schema and evaluator integrity: Ptolemy,
  `/root/rights_software_reviewer`.
- Dated SOTA, primary-source rights evidence and next gaps: Erdos,
  `/root/sota_rights_review_observer`.

All reviewers remained read-only on the frozen candidate. They independently
confirmed its base/tree/patch identity. On the repaired pre-record freeze:

- scientific review returned `P0=0`, `P1=0`, `P2=0`, LIMITED GO;
- software/evaluator review returned `P0=0`, `P1=0`, `P2=3`, LIMITED GO; and
- SOTA/rights review returned `P0=0`, `P1=0`, `P2=0`, GO only for this bounded
  abstention milestone.

After the complete local test succeeded, the software reviewer independently
recomputed the current gate freeze, dependency and log identities and returned
`P0=0`, `P1=0` for the local full-test gate. Its remaining evidence caveats
are that the raw npm log needs the runner's separately recorded wrapper and
exit metadata, and that macOS/Python 3.9.6 local success does not replace the
Ubuntu 24.04/Python 3.12.11 candidate-CI gate.

## Findings and dispositions

### P0

No P0 finding was recorded.

### P1 — all closed

1. **Standalone schema admitted invalid contract permutations.** Closed by a
   top-level exact `const` equal to the complete disposition and independent
   strict-AJV negative replay.
2. **Sentinel did not directly enforce the rights artifact.** Closed by direct
   validation over source-snapshot bytes, hard-gate propagation, candidate
   dependency gating, and joint plus rights-only real-evaluator mutations.
3. **Cross-file TOCTOU could approve stale bytes.** Closed by retaining the
   disposition, schema and all nine evidence identities through validation,
   a final whole-set `realpath`/`lstat` identity audit, and a deterministic
   post-read race regression.
4. **Review/report lifecycle was incomplete.** Closed for review by this
   dated artifact and for local testing by the exact `0c4ad23f…` gate freeze.
   Before commit, the main agent must regenerate all four derived reports from
   the final bytes of this file, rerun Sentinel and the production build, stage
   only the verified reports, and record the resulting final tree externally;
   no commit is permitted if that post-record check changes the score or opens
   a hard gate.

### P2 — closed during repair

- The authority API no longer supplies a fixed default clock, validates the
  principal and record shape, and fails closed without an explicit clock.
- The private scope now directly binds dataset projections, both checkpoints,
  both runtime closures and common execution/runtime identities.
- Tests contain independent digest literals and explicit malformed encoding,
  trailing data, mode, symlink, hard-link, race, CLI and Sentinel coverage.
- Lockable primary-source file digests, MPA release/asset identity and raw
  versus normalized python-hostlist license fields are explicit.

### P2 — residual, non-blocking and fail-closed

1. Authority-record exact-key validation is order-sensitive. A semantically
   identical reordered record is over-rejected, never admitted. A future
   versioned grant migration should compare an order-independent exact key set
   or validate against a separately frozen authority schema.
2. The rights module does not itself bind Git index or commit objects. The
   outer staged-tree/patch freeze and Sentinel source manifest supply the
   current binding; future supply-chain hardening should add signed commit or
   in-toto/SLSA provenance.
3. The rights-only E2E separately asserts score 41; full scorecard dimensions
   and public projection equality are asserted by the joint test containing
   the same rights mutation. The three-snapshot test took about 16.8 minutes,
   so candidate CI must demonstrate headroom rather than infer it.
4. The successful local full suite used macOS and Python 3.9.6. It is local
   gate evidence only and cannot be substituted for the separately reported
   Ubuntu 24.04/Python 3.12.11 candidate or exact-main CI states.

## Scientific and product boundary

The artifact is an auditable candidate explanation of why dispatch stays
blocked, not a causal-effect claim and not a legal determination. No
cross-scale bridge, electronic density, orbital, bond order, defect,
microstructure, phase-field, continuum, reactor or process quantity is added.
No motion, arrow, trajectory, field line, isosurface or number is added to the
frontend.

All three effective rights remain false. All execution, publication,
redistribution, frontend-ingestion, scientific, comparison, SOTA, leakage,
causal and industrial claims remain false. The R2 reduced-unit
Lennard-Jones/heat/A-to-B world remains a verification world and is not a real
material, chemical mechanism, reactor or process model. No PLC, DCS, SIS or
other safety-critical path is added.

## Next round — strict order, at most three tasks

1. Obtain dataset-specific, recorded and independently mandated authorization
   for private execution of the exact Random-TP blob and v0.1 scope. Acceptance:
   a versioned migration binds signed authority, document digest, exact scope
   and validity interval; every missing/mismatched element still denies
   dispatch.
2. Resolve aggregate-publication rights independently. Acceptance: an
   aggregate-only projection rejects structures, labels, IDs, per-frame
   energy/force/stress, weights and runtime artifacts, and a private-execution
   grant cannot imply publication.
3. Close runtime redistribution independently with an exact
   OCI/wheelhouse/checkpoint SBOM, license/notice/corresponding-source matrix
   and offline digest inventory, including the python-hostlist derived wheel.
   Any null, conflict or missing obligation keeps redistribution false.

Only after the relevant right is independently authorized may a later round
consider the fixed 693-by-2 inference campaign. This milestone itself does not
authorize it.
