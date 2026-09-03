# Full-candidate registration-only source integrity — independent review

Date: 2026-09-03

Implementation disposition: **GO only for the bounded registration-only,
zero-matching workflow source contract and its local source-integrity gate**

Commit, promotion, release and deployment disposition: **NO-GO**

There is no open P0 or P1 finding in the bounded implementation. The overall
candidate remains NO-GO because it is uncommitted, has no candidate CI or
commit-bound release manifest, has not been ingested from the default branch,
and has no observed GitHub workflow ID or run-history evidence. No producer was
enabled or dispatched. No MatterSim, MACE or other foundation-model inference
was run, and no scientific result was produced.

This review record is source-scoped evaluator input. To avoid a self-referential
record, it does not embed its own Git blob, the final post-inclusion evaluator
artifact digest or the final post-inclusion staged tree. Acceptance of this
record requires a subsequent deterministic evaluator run that includes this
exact file, followed by an independent manifest comparison and a separate
final freeze check. Editing this record after that run makes the evaluator
stale again.

## Frozen bounded hypothesis

The hypothesis was deliberately limited to the first phase of a two-phase
GitHub producer-identity chain:

> Tailing Future can add the exact future producer path to source control for
> default-branch registration while, under GitHub's documented semantics as of
> 2026-09-03, giving the source no matching event and no schedulable job. The
> local validator can prove that the reviewed raw bytes are the same regular
> file, Git index blob and staged-tree blob that would be submitted.

Acceptance required all of the following:

- the only trigger is `push`, with quoted `**` in both `branches-ignore` and
  `tags-ignore`, and there is no dispatch, call, pull-request, repository-
  dispatch or schedule entry;
- workflow- and job-level permissions remain empty, the only job uses the
  literal-false expression, and its only unreachable canary step has no
  checkout, artifact, credential, secret, API, network, data, model or
  scientific payload;
- the complete workflow remains exactly 520 bytes with SHA-256
  `e578459f2c46e77d10f3fd944984daa01f845219921454c3095b9852e4074cc0`;
- every source path component is real; the target is one single-link regular
  mode-0644 file; `O_NOFOLLOW` plus pre/open/post descriptor and path identity
  checks reject file substitution and read races;
- captured raw bytes, before UTF-8 decoding, match the exact size and digest,
  and match a stage-zero mode-100644 Git index blob and the corresponding blob
  in a freshly derived staged tree;
- target and ancestor symlinks, hard links, wrong filesystem or Git mode,
  untracked bytes, staged/working-tree drift, UTF-8 BOM, same-length byte drift,
  cyclic YAML aliases and live index mutation all fail closed in executable
  tests;
- the existing frontend compatibility contracts, scorecard, scientific plan,
  runtime lock, claim flags and `693×2 — NOT RUN` boundary remain unchanged;
  and
- all applicable lint, type, numerical, schema, evaluator, build, dependency,
  source-manifest and independent-review gates pass or retain an explicitly
  expected non-promotional rejection.

The Builder could implement and self-check the candidate but could not approve
it. Review statements below do not replace executable validation, a GitHub
service observation, a model run, an independent solver, experiments or
qualified engineering approval.

## Live baseline and conflict isolation

The round began with live checks rather than trusting the goal snapshot.

- The isolated worktree was
  `/Users/tonywilliam/Documents/ChatGPT/Tailing Future-v05` on
  `codex/v05-ai-interatomic-bridge`. Local `HEAD` and `origin/main` were both
  `72bc2011d75d9880b9918b70c903129b9bf1de65`, with ahead/behind `0/0` before
  the staged candidate.
- GitHub main run `33682276037`, attempt one, was successful for that exact
  revision. Authenticated workflow listing contained six workflows and no
  `.github/workflows/atomistic-full-candidate.yml` entry.
- The protected canonical Cloudflare site returned HTTP 200. This was an
  observation of the already deployed main site, not a candidate deployment.
- The original user worktree was dirty on a different branch and was not
  modified. All changes remained in the isolated worktree.
- The local dependency tree was restored from the lock with official Node.js
  24.16.0 and npm 11.13.0. The fixed historical runtime validator used only the
  separately verified official GitHub CLI 2.98.0 executable.

Main CI and the deployed main site are not candidate CI, release evidence or a
candidate deployment.

## Implementation and evidence

Builder Nash (`/root/runtime_builder`) added the initial 520-byte workflow,
exact semantic policy, tests, atomistic-plan integration and documentation. Its
self-check reached 61/61 targeted passes. The Builder did not stage, commit,
push, call GitHub, enable a workflow, access Random-TP, run a model or approve
the candidate.

The main agent owned every review-driven fix:

1. It replaced path-only UTF-8 reading with a repository source policy that
   binds a canonical regular file to its raw Git index and staged-tree blobs.
2. It made recursive YAML aliases return a structured failure rather than a
   `TypeError` or stack overflow.
3. After an independent reviewer reproduced a 523-byte UTF-8 BOM bypass, it
   moved exact raw size and SHA-256 validation before decoding and added API
   and absolute-CLI regressions.
4. It added a deterministic first-index-read to final-index-read mutation
   negative and isolated every fixture Git/CLI call from inherited Git config,
   worktree, index and replacement-ref variables.

The final implementation delta relative to the prior reviewed staged tree
`520b5d70f53c76710580f987c139a2ade0d5729b` contains exactly seven files:
the workflow, documentation, repository source policy and test, atomistic plan
validator, workflow policy and workflow-policy test. It contains 1,025
insertions and 21 deletions. Its binary delta SHA-256 is
`09c8c263a1c62c1105f5d51e93231561d7c2a3dd1860630ca3c34e10dcce7a6f`.

The final implementation freeze against base revision `72bc2011...` was:

- staged tree: `4785dc43e1b6de6e447a7998b5d20fa4a37cf480`;
- cached binary diff SHA-256:
  `c0605e7f9082ae6d95338a104873bf8968170a88308576e981a616b2c88ea108`;
- unstaged/untracked files: zero; and
- registration workflow Git blob:
  `76d40b0938df50375728b4f68133a52a1ceabd13`.

After the implementation freeze, the evaluator refreshed its four generated
outputs. The pre-review-record evidence freeze was:

- staged tree: `352b17ae624ec0cdd44f253329930775ee7a3572`;
- cached binary diff SHA-256:
  `bab7efd7939da6172b3770d598f3aa23fcbc20f5fe20fc4e0e42f0fa932220bf`;
- evidence-only delta SHA-256:
  `abf0db65f086365f9d04f7b8733a6b27d30a9161a3f8cb652855eb6605120219`;
- source count: 387/387 with zero path, order, mode or digest mismatch;
- source artifact digest:
  `sha256:7c49858f8dc4a5cb7b6ba48f0fa35e74e75e5c4a43986c92846a14a0ee0c2a52`;
- verdict: `CONDITIONAL`, evidence-maturity score 41/100,
  `hardGateFailures: []`, and `sourceRevision: null`.

The final post-inclusion evaluator run required by the opening lifecycle note
supersedes only those generated report bytes. It must not change this reviewed
implementation freeze or promote the registration shell into execution
evidence.

## Independent reviewers

- Mechanism and scientific validity: Arendt,
  `/root/scientific_runtime_review`.
- Software, numerical and evaluator integrity: Leibniz,
  `/root/software_runtime_review`.
- Dated primary-source and SOTA boundary: Carver,
  `/root/sota_scout_round2`.
- Champion, AIDO and fixed-baseline comparison plus next gaps:
  `/root/gap_planner_round3`.

Each reviewer remained read-only. Every implementation reviewer independently
recomputed the final tree and diff identity. The scientific, software and SOTA
reviewers independently reconstructed the 387-file pre-record source manifest
from Git blobs, its aggregate artifact digest and the public report projections
with zero mismatch.

## Findings and dispositions

### P0

No P0 finding was recorded.

### P1 — closed in the implementation

1. **Path-only validation did not bind the submitted Git object.** Closed with
   canonical component checks, a single-link 0644 file, `O_NOFOLLOW`, stable
   descriptor/path identity, stage-zero mode-100644 index binding, raw blob
   comparison, `write-tree`/`ls-tree` binding and a final index reread.
2. **UTF-8 BOM could bypass the complete raw-byte contract.** Closed by exact
   520-byte and SHA-256 checks on the captured `Buffer` before decoding. The
   reviewer's original 523-byte API and CLI reproduction now fails.
3. **Generated evaluator evidence was stale after source changes.** Closed for
   the pre-record 387-file freeze by three independent manifest
   reconstructions. The mandatory post-record evaluator lifecycle stated at
   the top of this artifact must also pass before the round is handed off.

### P2 — closed or retained explicitly

- Cyclic YAML alias handling, deterministic index-race coverage and fixture Git
  environment isolation were closed with executable negative tests.
- The local file gate intentionally applies to the reviewed POSIX environment
  with `/usr/bin/git`, `/dev/null`, `O_NOFOLLOW` and Unix mode 0644 semantics.
  An unsupported platform fails closed; Windows support is outside this slice.
- File/index rereads reduce ordinary mutation and configuration substitution;
  they are not a kernel-backed immutability proof against a privileged or
  same-UID adversary that can precisely race and restore metadata.
- The zero-matching conclusion is limited to GitHub's documented hosted-service
  filter semantics as of 2026-09-03. It is not a timeless theorem for every
  YAML engine or future service implementation.
- Default-branch registration, one unique numeric workflow ID, pagination-
  complete REST evidence, complete zero run history, actual runner identity,
  GitHub CLI 2.99.0 job bytes and all `693×2` scientific evidence remain absent.

## Executable gate evidence

| Gate | Result | Boundary |
| --- | --- | --- |
| Final registration/workflow targeted tests | PASS: 49/49 | Includes target/ancestor links, mode, index/blob/tree, BOM, YAML cycle, file race and live index race negatives |
| Hostile inherited Git environment test | PASS: 6/6 | Independent reviewer supplied hostile `GIT_DIR`, `GIT_WORK_TREE`, `GIT_INDEX_FILE` and config values |
| Full ESLint | PASS | Repository lint surface |
| TypeScript | PASS | `tsc --noEmit` |
| Core Python | PASS: 91; 1 skipped | Available local environment |
| OpenMM policy/scientific tests | PASS: 42 | Stored assets remain non-reproduced |
| Safe ZIP tests | PASS: 3 | Duplicate-name warning expected |
| Full JavaScript clean run | PASS: 109 files; 2 environment skips; 1,043 tests; 5 skips; 0 failures | 482.43 seconds; includes 10,000-step deterministic NVE and locked historical gh execution |
| Atomistic plan validator | PASS | `FULL CANDIDATE FROZEN 693×2 — NOT RUN · PLAN ONLY — NO INFERENCE` |
| Runtime-lock validator | PASS | `BOOTSTRAP RUNTIME FROZEN — NOT SCIENTIFICALLY REPRODUCED` |
| Registration-only validator | PASS | Binds implementation tree `4785dc43...` and workflow blob `76d40b...`; no execution |
| Full-candidate readiness | Expected rejection, exit 1 | `producer-workflow-not-pinned`; all six positive claims false |
| Dependency audit/tree | PASS | Zero reported vulnerabilities; `npm ls --all` reported no problems |
| Deterministic evaluator, pre-record | CONDITIONAL 41/100; no evaluator hard failures | 387 sources; local null revision; evidence maturity only |
| Independent source manifest | PASS: 387/387, zero mismatch | Three reviewers plus main-agent reconstruction from staged Git blobs |
| Report-boundary regression after refresh | PASS: 25/25 | Evaluator launcher, public projection and release-report boundaries |
| Production build/isolation after refresh | PASS | 64 files; 5,549,854 bytes; 8 forbidden public fields absent |
| Release manifest | **Expected FAIL in uncommitted state**, exit 1 | `release commit must be a full lowercase Git SHA`; no `.release-artifact` created |

Several invalid invocations were not converted into passes: one shell lacked
Node/npm on `PATH`; one runtime-lock call omitted the mandatory locked gh path;
one Python attempt could not find Node; one full-JavaScript attempt omitted the
gh locator; another was stopped when the BOM P1 invalidated its freeze; and an
ad-hoc manifest command omitted Node's module mode. Each applicable gate was
rerun from the beginning with the correct locked environment. Only the clean
results in the table are evidence.

## Scientific and product boundary

This slice adds no scientific quantity, model prediction, material property,
cross-scale bridge, causal effect, counterfactual or visualization. Its 520-byte
size is a byte count and its hashes are integrity identifiers, not physical
measurements.

MatterSim and MACE remain external `AUDITABLE` references. The locked
Random-TP benchmark remains 693 structures by 16 atoms, but neither model has
run the complete set. There is no local energy, force, stress, error,
throughput, memory or uncertainty result and no classical-potential comparison.
No data-leakage certification, numerical ranking, SOTA, experiment agreement,
general material validity or industrial-use claim is allowed.

The existing R2 reduced-unit Lennard-Jones/heat/A-to-B world remains a reduced
unit demonstration, not a real material, chemical mechanism, reactor or
process model. The registration shell does not advance PFHub Benchmark 3,
Cantera 3.2 CSTR, electronic structure, DFT or an AIDO-like learned multiscale
state.

## External evidence boundary

Primary sources used by the dated SOTA review were:

- GitHub workflow filters, permissions and job conditions:
  https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax
- GitHub workflow REST identity:
  https://docs.github.com/en/rest/actions/workflows?apiVersion=2022-11-28
- GitHub workflow-run history REST:
  https://docs.github.com/en/rest/actions/workflow-runs?apiVersion=2022-11-28#list-workflow-runs-for-a-workflow
- actual runner-image evidence boundary:
  https://github.com/actions/runner-images/blob/c9a325cf656f41546b8da92a0ccbd03e260cd42a/README.md#what-image-version-is-used-in-my-build
- fixed MatterSim model card:
  https://github.com/microsoft/mattersim/blob/40a1eb8f1189a53af310957b4f2c5dfbfe68d647/MODEL_CARD.md
- fixed MACE source:
  https://github.com/ACEsuit/mace/blob/4d2da09413ac1407f37cdbb6b81fa28e4c15655e/README.md

GitHub documents workflow list/get fields and pagination, but not an exact
numeric-ID allocation time or stability SLA. A floating `ubuntu-24.04` selector
and a versioned runner-image inventory do not prove the image, architecture or
tool bytes used by an actual job.

## Separate lifecycle states at handoff

- Local implementation and evidence validation: complete for this bounded
  source slice, subject to the post-record evaluator check above.
- Commit: not created.
- Pull request and candidate CI: not created or run.
- Branch protection: not evaluated for a candidate because no PR exists.
- Main merge and first main CI: not performed.
- Commit-bound release artifact: absent; release gate rejects local null
  revision as designed.
- Cloudflare deployment: not performed.
- Canonical smoke: the pre-existing main site was observed only; there is no
  candidate-site smoke.

## Next round — strict order, at most three tasks

1. Complete the normal reviewed commit/PR/candidate-CI lifecycle for the exact
   registration-only source without enabling any trigger. After protected main
   and its first CI succeed, use a read-only pagination-complete REST observer
   to bind one unique exact path/name numeric workflow ID and verify complete
   zero run history. Missing registration remains pending; any run history
   fails closed.
2. In a separate non-running candidate, freeze the authenticated GitHub
   adapter, independent-producer/receipt semantics, no-deletion evidence,
   actual runner and gh 2.99.0 observation protocol, and machine-readable
   Random-TP rights decision. No dispatch is allowed; missing rights returns
   `rights-not-cleared`.
3. Only after both prior gates pass and a human explicitly authorizes the
   activation, enable a manual-only producer in a separately reviewed version
   and run each independent producer once. Require exact 693/693 MatterSim and
   MACE outputs, units and bases, invariance/finite-difference gates, resource
   observations and independent receipts. MACE remains a blind engineering
   baseline; no SOTA or leakage-certification claim is permitted.

PFHub Benchmark 3 follows a validated L1 receipt; Cantera 3.2 CSTR follows
PFHub. This ordering preserves the principle of validating modules before
connecting them into a multiscale world model.
