# Full-candidate registration lifecycle — independent review

Date: 2026-09-03

Candidate-CI disposition: **LIMITED GO for the registration-only source to
enter the reviewed pull-request lifecycle**

Producer, scientific promotion, release and deployment disposition:
**NO-GO**

There is no open P0 or registration-only P1 finding in the reviewed candidate.
The reviewed source adds a deliberately zero-matching GitHub Actions workflow
shell plus fail-closed identity, runtime, handoff and GitHub-evidence policies.
It does not enable or dispatch a producer. MatterSim and MACE `693 x 2` were
not run, and no scientific result, reproduced baseline, SOTA comparison,
leakage certification, release approval or deployment approval was produced.

This record is itself source-scoped evaluator input. It records the frozen
candidate and candidate-CI evidence that existed before this file was added.
To avoid an endless self-reference, it does not claim its own final Git blob,
the post-inclusion source aggregate, the next pull-request head or its final CI
run IDs. Acceptance requires all of the following after this file is added:

1. the only source change beyond the reviewed candidate is this record and the
   deterministically regenerated evaluator projections;
2. all local lint, type, numerical, schema, evaluator, build, dependency,
   manifest and release-source gates are rerun;
3. independent reviewers compare the post-inclusion tree with this freeze and
   verify that no implementation or scientific claim changed;
4. a new ordinary commit and non-force push are bound to that exact tree;
5. the exact new pull-request head receives a fresh attempt-one Sentinel
   success, its artifact validates independently, and the registration
   workflow still has zero visible runs; and
6. base revision, branch protection and every promotion boundary are checked
   again immediately before any merge.

Editing this record or any source after the post-inclusion checks makes that
evidence stale and requires another complete cycle.

## Frozen bounded hypothesis

The hypothesis for this lifecycle round was:

> The already reviewed registration-only tree can pass through a normal
> feature-branch push and protected pull request without running the new
> workflow, without changing scientific contracts or claims, and with the
> existing Sentinel producing commit-bound, independently verifiable candidate
> artifacts.

Acceptance required:

- a final pre-commit fetch showing no remote-main conflict;
- a commit whose tree is byte-identical to the independently reviewed staged
  tree and whose parent is the observed main revision;
- an ordinary, non-force feature-branch push and a one-commit pull request to
  the unchanged protected main branch;
- distinct attempt-one successes for the exact-head `push` Sentinel and the
  exact-head `pull_request` Sentinel, never substituting one event for the
  other;
- a pull-request synthetic merge commit whose tree matches the reviewed head
  and whose parents are exactly the base and head commits;
- all applicable CI steps, the required `evaluate` check, report publication
  and candidate artifact validation to succeed;
- pagination-complete workflow and repository-run observations with zero
  entries for `.github/workflows/atomistic-full-candidate.yml`;
- no model, dataset, bootstrap, OpenMM, producer, dispatch, release or deploy
  workflow to be invoked; and
- explicit separation of candidate CI from default-branch registration,
  first-main CI, release, deployment and scientific reproduction.

The main agent performed the lifecycle mutations and cannot independently
approve them. The reviewers remained read-only. Their statements do not
replace executable tests, GitHub service evidence, an independent solver,
experiments or qualified engineering approval.

## Live baseline and conflict isolation

Immediately before commit, the isolated worktree
`/Users/tonywilliam/Documents/ChatGPT/Tailing Future-v05` was on
`codex/v05-ai-interatomic-bridge`.

- Local `HEAD`, `origin/main` and a freshly fetched remote `main` were all
  `72bc2011d75d9880b9918b70c903129b9bf1de65`; ahead/behind was `0/0`.
- The reviewed staged tree was
  `4cacfe9a05f426af17ec9414c6c69db417ec83d8`.
- The complete cached binary diff from main had SHA-256
  `08adcaed89de06f669ca0bf91689c58c93e42ac1cfab5bb369c664cf9703dabc`.
- The candidate contained 26 staged paths, 4,999 insertions and 66 deletions,
  with zero unstaged and zero untracked paths and a clean cached diff check.
- GitHub listed six active workflows and no target workflow. There was no
  remote feature branch and no existing pull request for the head branch.
- The original user worktree contained unrelated in-progress work and was not
  modified. All lifecycle work remained in the isolated worktree.
- The existing canonical site returned HTTP 200 with the expected title. This
  was an observation of the prior deployment, not a candidate deployment.

## Commit and pull-request identity

The main agent created and pushed one ordinary commit:

- commit: `a1998fb958ba3de62c6f80785f19b30193ffdae7`;
- commit tree: `4cacfe9a05f426af17ec9414c6c69db417ec83d8`;
- sole parent: `72bc2011d75d9880b9918b70c903129b9bf1de65`;
- branch: `codex/v05-ai-interatomic-bridge`; and
- GitHub commit verification: unsigned. Required commit signatures are
  disabled, so this is recorded honestly and is not described as signed.

Pull request [#26](https://github.com/tony070926-sudo/tailing-future/pull/26)
was opened non-draft from that branch to `main`:

- base: `72bc2011d75d9880b9918b70c903129b9bf1de65`;
- head: `a1998fb958ba3de62c6f80785f19b30193ffdae7`;
- pre-record state: mergeable and `CLEAN`; and
- synthetic merge:
  `0a5a8c2d0dff226a4691b5e807392e84388e9363`, with tree
  `4cacfe9a05f426af17ec9414c6c69db417ec83d8` and parents in base/head order.

The protected `main` branch required the strict GitHub Actions check
`evaluate` from app ID 15368, enforced the rule for administrators, required
linear history and conversation resolution, and disabled force pushes and
deletion. It did not require approving pull-request reviews and did not require
signed commits. Those omissions remain explicit governance boundaries; the
repository's independent review protocol is not a GitHub-enforced approval.

## Candidate CI

Two existing Sentinel events were checked separately for the exact head.

### Feature-branch push

- run: [33747361163](https://github.com/tony070926-sudo/tailing-future/actions/runs/33747361163);
- event/path: `push` / `.github/workflows/evaluate.yml`;
- workflow ID: 344526316;
- attempt: 1;
- job/check: `evaluate`, job 100622810752;
- result: completed successfully at 2026-09-03T11:29:04Z; and
- every applicable gate succeeded. The pull-request-only report upload step was
  expectedly skipped and is not misreported as a successful applicable step.

### Pull request

- run: [33747435475](https://github.com/tony070926-sudo/tailing-future/actions/runs/33747435475);
- event/path: `pull_request` / `.github/workflows/evaluate.yml`;
- workflow ID: 344526316;
- attempt: 1;
- job/check: `evaluate`, job 100623047344;
- evaluated head: `a1998fb958ba3de62c6f80785f19b30193ffdae7`;
- checked-out release revision: synthetic merge `0a5a8c2d...`; and
- result: completed successfully at 2026-09-03T11:29:10Z.

The pull-request job had one job and no failed step. Install, lint, typecheck,
the full JavaScript and Python test surface, atomistic validation, both builds,
dependency audit, deterministic evaluator, release manifest, both artifact
uploads and the final aggregate gate all succeeded.

The two checks share the same visible context name, `evaluate`. A green context
alone is therefore insufficient evidence: run ID, event, attempt, head,
workflow, job and conclusion were all bound independently.

## Candidate artifacts and report publication

The GitHub API artifact archive digests were reproduced by raw archive
downloads, and the extracted full artifacts passed the repository's
`validateExtractedReleaseArtifact` implementation.

| Evidence | GitHub ID | API archive SHA-256 | Binding and validation |
| --- | ---: | --- | --- |
| Push full artifact `tailing-sentinel-a1998fb958ba3de62c6f80785f19b30193ffdae7` | 9891093625 | `e22e498c1c1a6617e2d6643b5379e83d5b6b52ec3207859e852e22c8762aab11` | 2,827,197-byte ZIP; revision `a1998fb...`; 67 files / 5,672,562 bytes; content root `sha256:cb5b8ffb1f90a34a250813524fec78cdbb19087fa46cc056c64a48f9139b01c5` |
| PR full artifact `tailing-sentinel-0a5a8c2d0dff226a4691b5e807392e84388e9363` | 9891096483 | `77fb05466a472081aa6124a0bbaeb22e2d0e30d12a519c6c6d254c17a3e6dfd8` | 2,827,211-byte ZIP; revision `0a5a8c2d...`; 67 files / 5,672,562 bytes; content root `sha256:9249a7e2872abd4834d5e3e6fc474c60bd561d04388e946a9ac869216769dd1b` |
| PR inert Markdown artifact `tailing-sentinel-pr-report-33747435475-1` | 9891097220 | `891bacdacddc2583624334417e560c515452506fcc3e47f6978f845711afda46` | 2,682-byte ZIP; Markdown SHA-256 `e7955b354268df631d0c5ae57b0cb42aec0c717184376f5aee32be5c5bbe0b66`, byte-identical to the full PR artifact copy |

Both complete manifests recorded the source aggregate
`sha256:ec17aed795536579be91c0e73dc43327ec402175e527e6f0cd3362c28198cd0f`
over 388 source files, `CONDITIONAL` with evidence-maturity score 41,
`hardGateFailures: []`, and successful install, lint, typecheck, test,
atomistic-manifest, build and audit upstream gates. The Linux reports differed
only in expected time, revision and elapsed-time fields. No Darwin/Linux
bitwise numerical-equality claim is made.

Reporter run
[33749938052](https://github.com/tony070926-sudo/tailing-future/actions/runs/33749938052),
attempt one, job 100630926947, independently validated the source PR run and
published the Markdown as inert pull-request data. Comment 5525024961 binds
run 33747435475, attempt one, head `a1998fb...` and success. Its exact UTF-8
body is 5,303 bytes with SHA-256
`50f1b4515650c3ba9d006a35979a7721aaf91478f6f8dd275c0f86338263ecbf`.
The Reporter is useful evidence but is not a branch-protection required check.

## Workflow and run-history observation

After candidate CI, the authenticated repository workflow listing contained
six workflows in one complete page. The raw page SHA-256 was
`9498dc2b331eb79d88084f84062adc3f0c6a07148217b2c5a7cec3aa3a527527`.
The target path was absent because it was not yet on the default branch.

The complete visible repository run listing contained 187 runs across pages of
100 and 87 entries. A canonical reduced listing had SHA-256
`096ce975ccce98dc3fe6d83a2a0ffadfd8d57b97a7d6f14083074899fb3066a4`.
Exactly zero entries had path
`.github/workflows/atomistic-full-candidate.yml`.

This proves only the service state visible at the query time. GitHub provides
a run-deletion API, so an empty listing is not an immutable proof that no run
was ever deleted. Numeric workflow identity can be observed only after
default-branch registration, and GitHub publishes no ID-allocation latency or
stability service-level guarantee.

## Independent reviewers

- Mechanism and scientific validity: Arendt,
  `/root/scientific_runtime_review`.
- Software, numerical and evaluator integrity plus Gap Planner: Leibniz,
  `/root/software_runtime_review`.
- Dated primary-source and SOTA boundary: Carver,
  `/root/sota_scout_round2`.

All reviewers were read-only. For the pre-record candidate-CI freeze:

- the scientific reviewer reported P0=0 and P1=0 and permitted this artifact
  to be drafted, while retaining the default-branch, release/deployment and
  unexecuted-science boundaries;
- the software reviewer reported P0=0, P1=0 and one non-blocking governance P2
  concerning the absent required review and ambiguous same-name check context;
  and
- the SOTA reviewer reported P0=0 and no registration-only P1, with no new P2,
  and found no official-source or claim drift blocking this registration-only
  lifecycle.

## Findings and dispositions

### P0

No P0 finding was recorded.

### P1

No P1 finding applies to the bounded registration-only commit, PR or candidate
CI. The following P1 gates apply to later phases and remain open by design:

1. default-branch registration, a unique numeric workflow ID and then-current
   complete zero-run evidence are required before any producer configuration;
2. Random-TP rights, no-deletion/private-handoff evidence and actual
   runner/tool bytes are required before any producer enablement or dispatch;
   and
3. MatterSim and MACE `693 x 2` independent runs and validation are required
   before any v0.5 scientific promotion or comparison.

These later-phase P1s do not circularly block the registration-only change
needed to observe the workflow ID. They do block dispatch, scientific
promotion, release and deployment.

### P2

- Branch protection does not require an approving review, and the push and PR
  checks use the same `evaluate` context. Exact event/run/job bindings and the
  repository's independent review record remain mandatory procedural gates.
- The registration shell's zero-matching interpretation is limited to
  GitHub's documented hosted-service semantics observed on 2026-09-03, not a
  timeless theorem.
- Visible zero history cannot prove no deletion. No-deletion evidence remains
  a separate pre-dispatch gate.
- The selected MACE-MPA-0 medium challenger has no locked official Random-TP
  target. Results for a different MACE-MP-0 large model cannot be transferred.
- The relationship between the MatterSim paper's described sampled structures
  and the published 693-by-16-atom benchmark file remains unexplained; no
  leakage certification may be claimed.

## Post-inclusion local gate note

The first full local `npm test` after this record was drafted was not counted as
green evidence. It completed 1,041 tests with five skips, but two unchanged
long-horizon dynamics tests exceeded Vitest's 20-second wall-clock timeout in a
698.40-second, heavily concurrent full-suite run. The process exited one and
candidate progression stopped.

An immediate same-runtime Vitest invocation containing exactly the two failed
files completed 27/27 tests successfully in 2.25 seconds. The rigid free-rotor
and 10,000-step molecular-world cases took 1.385 and 0.640 seconds at file
level, respectively. This targeted result diagnoses a full-suite scheduling or
host-load timeout rather than a reproduced numerical assertion failure, but it
does not erase or replace the failed full gate. A fresh complete `npm test`
must pass without source changes before the post-inclusion candidate can be
frozen. The independent software reviewer must classify the timeout and verify
closure before merge.

## Scientific and compatibility boundaries

- `tf.world/0.3`, `tf.action/0.3` and `tf.observation/0.3` are unchanged.
- All six full-candidate readiness claims remain false; before default-branch
  ingestion the registration state is `configured: false`, `id: null`.
- `CONDITIONAL 41/100` measures evidence maturity, not scientific truth,
  benchmark performance or percent of SOTA.
- MatterSim and MACE `693 x 2` remain **NOT RUN**. No full energy, force,
  stress, error, throughput, memory, uncertainty or classical-potential
  comparison exists.
- Fixed MatterSim model-card values remain external `AUDITABLE` references.
  The selected MACE-MPA-0 medium baseline remains blind on Random-TP.
- No data-leakage certification, causal effect, universal mechanism, real-
  material validity or industrial recommendation is claimed.
- The R2 reduced-unit Lennard-Jones/heat/A-to-B world is not a real material,
  chemical mechanism, reactor or process model.
- PFHub Benchmark 3 and Cantera 3.2 CSTR remain incomplete and unpromoted.

## Lifecycle state at this pre-record freeze

| State | Evidence | Disposition |
| --- | --- | --- |
| Local validation | Complete for tree `4cacfe9a...` | LIMITED GO |
| Commit | `a1998fb...`, tree `4cacfe9a...`, parent `72bc2011...` | Complete, unsigned boundary recorded |
| Feature-branch push | Ordinary non-force push | Complete |
| Pull request | #26, base/head bound, CLEAN | Open |
| Candidate push CI | 33747361163 attempt one | Success |
| Candidate PR CI | 33747435475 attempt one | Success |
| Candidate report publication | 33749938052 attempt one | Success; not a required check |
| Default-branch merge | No | NOT PERFORMED |
| First main CI for candidate | No | NOT PERFORMED |
| Target workflow registration/ID | No | NOT OBSERVED |
| Producer enablement or dispatch | No | PROHIBITED |
| Release artifact for exact new main | No | NOT CREATED |
| Cloudflare deployment | No | NOT PERFORMED |

## Next tasks, at most three

1. Complete the post-inclusion local/evaluator/review/PR-CI cycle described at
   the top of this record; only then consider a branch-protection-compliant
   squash merge of the exact reviewed head.
2. After the exact new main revision's first attempt-one Sentinel succeeds,
   independently validate its release artifact, then bind one unique numeric
   workflow ID and pagination-complete visible zero-run history. Do not deploy.
3. In a separate non-running candidate, close read-only GitHub adapter,
   no-deletion, rights, private-handoff and actual runner/tool evidence. Do not
   enable or dispatch the producer without a later explicit human-authorized
   scientific execution round.
