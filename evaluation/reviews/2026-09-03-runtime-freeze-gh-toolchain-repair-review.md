# Historical runtime-freeze GitHub CLI toolchain repair — final review

Date: 2026-09-03

Implementation disposition: **GO only for the bounded historical
runtime-freeze/runtime-lock GitHub CLI execution repair**

Commit, promotion, release and deployment disposition: **NO-GO**

The implementation and evidence freezes have no open P0 or P1 finding within
the bounded repair. The overall candidate nevertheless remains NO-GO because
the release manifest correctly rejects an uncommitted source snapshot with a
null source revision, candidate CI has not run, and the Linux runner identity
has not been observed for this candidate. Nothing was committed, pushed,
opened as a pull request, run in candidate CI, merged, released or deployed.

## Frozen bounded hypothesis

The hypothesis was deliberately limited to one historical execution seam:
the Commit-F runtime-freeze validator can locate, authenticate and execute only
the fixed official GitHub CLI 2.98.0 binary for the supported host, preserve
strict byte/string verifier output, and continue rejecting `PATH` substitution
without changing scientific evidence or the R7b2 producer design.

Acceptance required all of the following:

- close the five baseline runtime-freeze/runtime-lock test failures without
  weakening offline receipt, Sigstore bundle, trusted-root or projection
  validation;
- require a canonical absolute regular executable with exact platform, version,
  mode, link count, byte length and SHA-256 identity;
- reject a relative path, `PATH` decoy, wrong mode, final or ancestor symlink,
  hard link, wrong digest, wrong version and mutable injected output;
- execute a privately copied and rechecked binary with no shell, a minimal
  environment, a private working directory and bounded time/output;
- preserve the machine-readable full-candidate readiness rejection, all
  scientific claim flags, frontend compatibility contracts and the scorecard;
  and
- pass every applicable repository gate, followed by independent read-only
  mechanism/science, software/evaluator and dated SOTA review.

The Builder could not approve the candidate. Review statements below do not
replace executable tests, an authenticated candidate CI observation, an
independent solver, a model run or qualified engineering approval.

## Real-time baseline and conflict isolation

The round began with live repository, remote-main, GitHub Actions and canonical
site checks rather than trusting the goal snapshot.

- Local `HEAD` and `origin/main` were both
  `72bc2011d75d9880b9918b70c903129b9bf1de65` in the isolated worktree
  `/Users/tonywilliam/Documents/ChatGPT/Tailing Future-v05`, branch
  `codex/v05-ai-interatomic-bridge`.
- Main workflow run `33682276037`, attempt one, was successful. Its current
  public artifact `9867675870` had digest
  `sha256:b6688fb39bf081e7ae2a07853c2c6862bb73fae5081c73dd1a0743e47da273d9`.
- The protected canonical Cloudflare site returned HTTP 200 and identified
  source revision `72bc2011...`; title, canvas, WebGL2 context, one-step solver
  interaction and browser-console smoke passed. This was an observation of the
  already deployed main site, not a deployment made in this round.
- The user's original dirty worktree on
  `codex/causal-mechanism-foundation` at `643b8b15...` was not modified. No
  unrelated frontend work was touched.

The successful main CI and deployed-site observations are not candidate CI,
candidate release evidence or candidate deployment evidence.

## Baseline failure and implemented repair

Before the repair, the two targeted files produced **20 passes and 5
failures**. The default verifier spawned bare `gh` after deliberately removing
the provisioned temporary CLI directory from the child `PATH`, producing
`spawn gh ENOENT`. The injected test seam also mixed exact stdout bytes with an
`{ stdout }` child-process result, causing two output-contract failures and one
downstream `verifiedGhOutput` cascade.

Builder Nash (`/root/runtime_builder`) changed only the runtime-freeze policy
and tests, ran a self-check, and reported 30/30 targeted passes, targeted lint,
runtime-lock validation and atomistic plan validation. The Builder explicitly
did not approve the candidate. Its initial two-file diff digest was
`sha256:6d267e3e5d0bd31ebf4a02c7fc2789a7a3f2cc129889850ad2e6f7b323d91725`.

The main agent then owned all review-driven changes:

- documented supported hosts, integrity quantities, actual-job evidence limits
  and the separate 2.98.0 historical versus 2.99.0 future contracts;
- added a wrong-mode locator rejection;
- changed `Uint8Array` normalization from a potentially shared backing-store
  view to an immediate byte snapshot and added a caller-mutation regression;
  and
- corrected the prior R7b2 review's main artifact digest from a transcription
  error to `sha256:b6688fb39bf081e7ae2a07853c2c6862bb73fae5081c73dd1a0743e47da273d9`.

The resulting validator locks GitHub CLI 2.98.0 and its official tag commit,
checksum-list, archive and extracted executable identities for only
`darwin-arm64` and `linux-x64`. Darwin requires an explicitly supplied canonical
absolute path; Linux defaults only to the exact `/usr/bin/gh` identity.
Unsupported operating-system/architecture pairs fail closed.

The source executable must be a normalized canonical absolute regular file,
mode `0755`, link count one, and match the fixed byte length and SHA-256. The
validator copies the verified bytes into a private `0700` state directory as a
`0500`, single-link executable, then rechecks identity and digest before and
after version and attestation calls. Child execution uses `shell: false`, a
private working directory, `PATH=/usr/bin:/bin`, a 30-second timeout, `SIGKILL`,
a 5 MiB output cap and no inherited token, repository, pager or editor
variables. Attestation verification also pins `--hostname github.com` and the
exact 2.98.0 JSON wrapper projection.

Injected verification accepts only a `Buffer`, copied `Uint8Array`, or string.
It does not silently unwrap `{ stdout }`. This is a testable API boundary, not
an assertion that JavaScript or same-user processes provide formal isolation.

## Official toolchain identity and applicability

Primary official sources were checked against the candidate:

- GitHub CLI release: https://github.com/cli/cli/releases/tag/v2.98.0
- fixed source commit:
  https://github.com/cli/cli/commit/a255baf71d13fe5947a4eb7ad521ffd412d64cee
- official checksums:
  https://github.com/cli/cli/releases/download/v2.98.0/gh_2.98.0_checksums.txt
- fixed Ubuntu 24.04 runner inventory:
  https://github.com/actions/runner-images/blob/73a898e845210ee1565a4bb3328897e152dd73ae/images/ubuntu/Ubuntu2404-Readme.md?plain=1
- fixed runner installation script:
  https://github.com/actions/runner-images/blob/73a898e845210ee1565a4bb3328897e152dd73ae/images/ubuntu/scripts/build/install-github-cli.sh
- fixed 2.98.0 attestation command and wrapper sources:
  https://github.com/cli/cli/blob/a255baf71d13fe5947a4eb7ad521ffd412d64cee/pkg/cmd/attestation/verify/verify.go
  and
  https://github.com/cli/cli/blob/a255baf71d13fe5947a4eb7ad521ffd412d64cee/pkg/cmd/attestation/api/attestation.go

Locked integrity observations:

| Item | Size basis | SHA-256 |
| --- | ---: | --- |
| official checksum list | 1,950 bytes | `275b90ae...c4db9` |
| Darwin arm64 ZIP | archive bytes | `8cfb027c...6ca4` |
| Darwin arm64 executable | 39,256,176 bytes | `eedbfd5b8071027fe6326826eded48d274f1ec9d93f9239d9ba778ea1f479ac9` |
| Linux amd64 DEB | archive bytes | `f65a3fa2...535d6` |
| Linux x64 `/usr/bin/gh` | 41,377,954 bytes | `62885b97de6a0cd85e616cdd94bcda908bf5cf1018094385892b05cea3537163` |

The local positive execution used official Node.js 24.16.0 and the canonical
Darwin executable at `/private/tmp/.../gh`, which reported GitHub CLI 2.98.0,
mode `0755`, link count one, 39,256,176 bytes and the full expected digest.
The spelling `/tmp/...` is intentionally not accepted on macOS because `/tmp`
is a symlink to `/private/tmp`.

These sizes are byte counts and the digests are integrity identifiers. They are
not physical quantities, model outputs or scientific validation. The fixed
runner inventory reports image `20260823.283.1` and GitHub CLI 2.98.0, but an
inventory does not establish which image served a particular job. Linux
execution and actual-job identity therefore remain candidate-CI evidence.

## Freeze ledger

All reviewers used a staged, frozen candidate against base revision
`72bc2011d75d9880b9918b70c903129b9bf1de65`.

| Freeze | Staged tree | Cached binary diff SHA-256 | Scope |
| --- | --- | --- | --- |
| Builder self-check | not promoted | `6d267e3e5d0bd31ebf4a02c7fc2789a7a3f2cc129889850ad2e6f7b323d91725` | initial two-file implementation only |
| Software review | `54bc881038940c0e7d1e44ed9b2a8399a55ca089` | `b77783bfa3b66535fb510cf773d3b4d5f48757383980e9a640c56ffdb55c254d` | final code, tests, docs and prior-review correction |
| Evaluator/science/SOTA freeze | `7d981c3face6f08a3bc6ea0e3650193b0400238f` | `6a94e72d5197dde1fead1f9a90738b17eddc0669cba5f0364d83ad0191e24905` | software freeze plus regenerated reports |

At the evaluator/science/SOTA freeze there was no unstaged or untracked file.
The policy, test, documentation and corrected prior-review SHA-256 values were,
respectively, `8a772e6f...df8b`, `0d8f6f90...1b5f`,
`3d311f60...a147` and `d473fc14...0a7`.

This dated review is a post-review evidence-only addition. It is intentionally
not inserted into the evaluator source manifest that it describes, avoiding a
self-referential report cycle. Its final staged addition must be verified
separately and does not expand the approved implementation scope.

## Independent reviewers

- Mechanism and scientific validity: Arendt,
  `/root/scientific_runtime_review`.
- Software, numerical and evaluator integrity:
  `/root/software_runtime_review`.
- Dated primary-source and SOTA comparison: Carver,
  `/root/sota_scout_round2`.
- Champion/AIDO/fixed-baseline comparison and next-round gaps:
  `/root/gap_planner`.

The science and SOTA reviewers independently recomputed the final frozen tree
and binary diff. The SOTA reviewer additionally recomputed every one of the 383
source-manifest SHA-256 entries from the staged index with zero mismatch. Each
reviewer returned only a limited-scope GO; none authorized commit, promotion,
release, deployment or a scientific reproduction.

## Findings and dispositions

### P0

No P0 finding was recorded.

### P1 — closed within the implementation/evidence freeze

1. **Historical runtime verifier could not execute the verified tool.** Closed
   by the fixed absolute-executable materialization and execution contract.
2. **Injected verifier output contract was inconsistent.** Closed by accepting
   only immediate bytes/string and testing mutable typed-array input.
3. **Prior R7b2 review recorded the wrong current-main artifact digest.** Closed
   by correcting the evidence record to the independently observed public
   artifact digest.
4. **Generated evaluator reports were stale after source changes.** Closed by
   regenerating all four reports and independently hashing all 383 source
   entries from the staged index; mismatches were zero.
5. **No dated artifact described the repaired gate state.** Closed by this
   bounded review record and a separate final evidence-only freeze check. This
   does not turn the still-red release gate into a pass.

### P2 — residual, explicitly non-promoted

1. Copy-and-recheck narrows `PATH`, symlink, hard-link and ordinary mutation
   attacks but does not provide a formal same-UID adversarial isolation or a
   kernel-backed immutable execution guarantee. Tests share a setup fixture,
   so one fixture failure can still produce cascading diagnostics.
2. Only Darwin arm64 and Linux x64 identities are locked. The local positive
   run covers Darwin; a concrete GitHub job must still capture actual runner
   image/version and `/usr/bin/gh` bytes. A floating `ubuntu-24.04` label and a
   runner inventory are insufficient.
3. R7b2 still has no authenticated, pagination-complete GitHub adapter, no
   auditable proof that an artifact was never created and then deleted, and no
   dataset-specific Random-TP redistribution determination. Encryption creates
   no license right. These become P1 blockers before producer enablement.

## Executable evidence after the final source fix

| Gate | Result | Boundary |
| --- | --- | --- |
| Runtime-freeze/runtime-lock targeted tests | PASS: 31/31 | Includes wrong mode, link, digest, `PATH`, output type and caller-mutation negatives |
| R7b2 targeted tests, independent reviewer | PASS: 59; 1 private-dataset skip | Non-running policy/codec only |
| Targeted ESLint | PASS | Modified policy/test surface |
| Full ESLint | PASS | Repository lint surface |
| TypeScript | PASS | `tsc --noEmit` |
| Core Python suites | PASS: 91; 1 skipped | Available local environment |
| OpenMM policy/scientific tests | PASS: 42 | Stored assets remain non-reproduced |
| Safe ZIP tests | PASS: 3 | Duplicate-name warning expected |
| Full JavaScript suite, clean rerun | PASS: 108 files; 2 environment skips; 1,031 tests; 5 skips; 0 failures | Includes 10,000-step deterministic aqueous verification |
| Atomistic plan/runtime validator | PASS | Prints `693×2 — NOT RUN` and `NOT SCIENTIFICALLY REPRODUCED` |
| Full-candidate readiness CLI | Expected rejection, exit 1 | `producer-workflow-not-pinned`; all six positive claims false |
| Deterministic evaluator | CONDITIONAL 41/100; no evaluator hard-gate failures | Evidence maturity only; source revision null |
| Source manifest | PASS: 383/383 index entries, zero mismatch | Review freeze `7d981c3...` |
| Dependency audit | PASS: 0 reported vulnerabilities | Installed locked tree; `npm ls --all` reported no problems |
| Production build/isolation | PASS: 64 files; 5,546,830 bytes; 8 forbidden fields absent | Content root `sha256:6aaac2a3cf344644f8b1d71d9db1d929a6375d1e8c08a4dba6c85a881bc72589` |
| Release manifest | **FAIL as designed for this state**, exit 1 | `release commit must be a full lowercase Git SHA`; no `.release-artifact` created |

The first full-JavaScript attempt is not counted as evidence. It overlapped the
evaluator's temporary removal and rewrite of generated reports and ended with
1,008 passes, 5 skips and 6 `ENOENT` failures in three report-dependent files.
The evaluator had completed successfully and restored the reports, after which
the suite was rerun alone and passed in 487.29 seconds. This was orchestration
interference, not silently converted into a candidate pass.

The first combined Python invocation also inherited a shell `PATH` without the
official Node directory after the core 91-test segment; the OpenMM segment
therefore could not launch Node. The complete invocation was rerun with the
official Node directory explicitly present and passed the 91/42/3 segments
above. The invalid environment attempt is not counted as candidate evidence.

The evaluator generated its report at `2026-09-03T07:41:30.707Z` with
`sourceRevision: null`, 383 source files, artifact digest
`sha256:d2a48595f9fe084d81b809f97c7e754e3dd5262b52dd85ea2665cf3b7f36d8b7`,
`CONDITIONAL` verdict, score 41/100 and `hardGateFailures: []`. The four report
file SHA-256 values are:

- `evaluation/latest-report.json`: `24ed3d02...98b4`;
- `evaluation/latest-report.md`: `554b39c6...f98a`;
- `evaluation/public-summary.json`: `167ec05a...4a9b`; and
- `evaluation/public-product-evaluation.json`: `d47f5c14...2f6`.

All upstream release states in this local report honestly remain
`not-reported-local`. An empty evaluator hard-gate array does not waive the
separate release-manifest failure, missing candidate CI, or review protocol.

## Scientific, causal and compatibility boundary

This repair changes no solver, state transition, potential, force, energy,
stress, charge, trajectory, uncertainty, visualization or frontend scientific
contract. The staged name set contains no frontend world/action/observation
contract file; base and index retain the same 18 literal occurrences of
`tf.world/0.3`, `tf.action/0.3` and `tf.observation/0.3` outside reviews.

No cross-scale bridge was added, so there are no new geometry, averaging,
time-scale, conservation, uncertainty, information-loss or reverse-use
assumptions to promote. Existing atomistic scientific units remain energy in
eV, force in eV/Å and ASE stress in eV/Å³, with comparison stress in GPa on its
declared conversion basis. No new value in this patch is a material property.

There is no structural equation or identified intervention in scope. Nothing
is promoted from a taxonomy, correlation, mechanism path or visualization into
a causal total effect. No counterfactual or industrial control recommendation
is emitted. The R2 reduced-unit Lennard–Jones/heat/A→B world remains a toy
reduced-unit world and is not a real material, chemical mechanism, reactor or
process model.

There is still **NO FULL PRODUCER WORKFLOW / NO 693×2 RUN / NO AUTHORITATIVE
FULL RECEIPT / NO PUBLIC SCIENTIFIC PAYLOAD**. MatterSim model-card values remain
external `AUDITABLE` references, MACE-MPA-0 medium has no locked official
Random-TP target, and neither is a local `REPRODUCED` result. There is no data
leakage certification, numerical ranking, SOTA claim, electronic density,
orbital calculation, PFHub 3 result or Cantera CSTR result.

AIDO Cell remains a `REFERENCE` for modular-to-connected-to-aligned build order
and interaction language, not a like-for-like materials benchmark. The current
candidate adds no learned persistent multiscale state, calibrated L1→L5
transition, shared-state multi-readout or rollout-error model.

## Distinct lifecycle status at close

| State | Status |
| --- | --- |
| Local implementation and applicable non-release gates | PASS for bounded repair |
| Git commit | NOT CREATED; NO-GO |
| Push / pull request | NOT CREATED; NO-GO |
| Candidate CI | NOT RUN |
| Candidate branch protection observation | NOT AVAILABLE |
| Main merge | NOT PERFORMED |
| Main first CI | Baseline main run `33682276037` PASS; not candidate evidence |
| Candidate release artifact | NOT CREATED; release gate exit 1 |
| Cloudflare deployment | NOT PERFORMED |
| Canonical site smoke | Existing main deployment PASS; not candidate evidence |

## Gap Planner — next round, maximum three tasks

1. **Lock the real producer job, runner, workflow and GitHub CLI 2.99.0
   identities without dispatch.** Add only an unreachable minimum-permission
   workflow first, obtain and separately lock GitHub's workflow ID, pin action
   SHAs, architecture, container roots and exact 2.99.0 tool bytes, and require
   actual-job runner/image evidence. Acceptance rejects every moving, wrong or
   mutable identity and reruns all repository gates. This proves execution
   identity only; it creates no scientific result and cannot raise the score.
2. **Implement the authenticated GitHub adapter, no-deletion audit boundary and
   Random-TP rights decision.** Require complete race-safe pagination, original
   response commitments, exact protected-main ordering, first-run/attempt-one
   successful-job binding, durable deletion-window evidence, independently
   verified attestations and a written, digestible rights conclusion for every
   plaintext, ciphertext, private-storage and publication use. Missing rights
   or deletion evidence must keep `configured:false`. Authentication,
   encryption and deletion do not establish scientific correctness.
3. **Only after tasks 1 and 2, run and independently verify the locked 693×2
   L1 campaign.** Require exactly 693/693 finite energy/force/stress predictions
   per model, independently recomputed metrics and evidence roots, invariance
   and finite-difference checks, environment/cost records and two independent
   protected-main receipts before `REPRODUCED` eligibility. MACE's first result
   is an engineering baseline; an inapplicable classical potential must be
   reported `not-applicable`, never substituted with reduced-unit LJ. Passing
   does not certify data leakage, SOTA, experiment truth, general materials
   validity or industrial use.

PFHub Benchmark 3 remains subsequent to the v0.5 L1 campaign. Its reference
set, error norm and three-grid convergence tolerances must be frozen before
implementation. Cantera 3.2 CSTR remains after PFHub; the official sample's
`energy="off"` is isothermal, so a future reproduction must account for the
thermostat heat load and must not claim adiabatic energy closure.
