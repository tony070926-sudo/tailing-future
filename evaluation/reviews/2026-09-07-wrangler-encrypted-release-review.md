# Wrangler encrypted OAuth release compatibility — 2026-09-07

Status at review: the frozen implementation has passed independent read-only
review and the full local code gates. This record does not claim a commit, CI,
merge, release artifact or deployment. Final-document source binding and the
ordinary protected-main release sequence remain mandatory before promotion.

## Bounded hypothesis

The locked Wrangler 4.127.0 can consume the existing default encrypted OAuth
profile through its native OS-keyring implementation while the Tailing Future
release path preserves its exact-main, first-successful-CI, unique-artifact,
digest, account, clean-tree and isolated-process gates. The release wrapper
must never read a key or decrypted token, invoke a keyring command, or generate
a plaintext OAuth profile. Credential refresh lifecycle must not silently
discard a newly issued encrypted credential or overwrite concurrent user work.

This is release infrastructure only. No scientific contract, numerical model,
scorecard, data right, execution authorization or model-dispatch status changes.

## Baseline frozen before source edits

- Base/main: `a63415c174dcfaa0dc5370ecc777b6ccdcda86aa`, fetched 2026-09-07.
- Worktree: `Tailing Future-wrangler-encrypted-release`.
- Branch: `codex/wrangler-encrypted-release`.
- Original working directory and other worktrees remain untouched.
- Locked Node: `v24.16.0`; Wrangler: `4.127.0`.
- Separate worktree `npm ci --ignore-scripts --no-fund`: 561 packages installed;
  audit found zero vulnerabilities.
- Baseline release tests: 35/35 passed across Cloudflare process boundaries,
  GitHub release policy, artifact verification and release-report equivalence.
- Existing source profile metadata only: default.enc, regular file, uid 501,
  mode 0600, one link, 1220 bytes. No source key/token read by the wrapper.
- Prior script accepts only default.toml, so it cannot consume the available
  encrypted profile despite the fixed Wrangler version supporting it.

## Acceptance criteria

1. Select only the default production profile; preserve exact API-token mode.
   Encrypted mode must explicitly force the native keyring provider and fail
   closed if it is unavailable. No ambient authentication/profile/endpoint
   setting enters any child environment.
2. Before the final Wrangler boundary, copy only bounded, regular, private,
   single-link credential bytes. Validate the encrypted envelope without
   decrypting it. Reject malformed, ambiguous, noncanonical and unsafe inputs.
3. Git/GitHub/Python/npm remain isolated from Cloudflare credentials. Final
   Wrangler remains isolated from GitHub tokens, real HOME, unrelated user
   settings and project node_modules. `--check-only` remains credential-free.
4. Preserve safe refresh behavior, including a failed deployment after refresh
   and concurrent source changes. No plaintext downgrade or silent loss of
   refreshed encrypted bytes is allowed.
5. Existing main/CI/artifact/account/digest/clean-tree gates and exact dependency
   lock remain intact. Targeted tests plus mandatory full gates and independent
   read-only reviews must pass before commit or promotion.

## Primary implementation evidence

- Cloudflare general commands, retrieved 2026-09-07:
  https://developers.cloudflare.com/workers/wrangler/commands/general/#storing-oauth-credentials-in-the-os-keychain
- Locked npm package Wrangler 4.127.0 (`package-lock.json` integrity): native
  keyring selection is forced by `CLOUDFLARE_AUTH_USE_KEYRING=true`; default
  profile uses keyring service `wrangler`, account `default`; source envelope
  is version 1 AES-256-GCM with base64 IV, tag and ciphertext. Native refresh
  writes its result to the active credential store.

## Candidate freeze, executable evidence and independent dispositions

### Frozen implementation

- Builder: Astra (`/root/astra_release`). The Builder did not approve the code.
- Base: `a63415c174dcfaa0dc5370ecc777b6ccdcda86aa`.
- Initial staged tree: `9bda9730664cb8222abf28d8a852a749ec08db72`.
- Initial binary-patch SHA-256:
  `02ee021572b02c3bfd51b67959d1179fc8aecec749756cc360694e49988914b2`.
- Reviewed, fixed implementation tree:
  `a8d9d6e5f76af7b361ea2f6bc31effa83d40fcbf`.
- Reviewed binary-patch SHA-256:
  `ccb973dcf16e95df8f47f310523ee0721936971c1da2cb8f8754943362389b6e`.
- Implementation scope: `scripts/release-cloudflare.mjs`, its test file, and
  `docs/RELEASE_AUTHENTICATION.md`; 592 insertions and 17 deletions. No package,
  dependency lock, scientific implementation, frontend contract or scorecard
  change. This review record and the four regenerated reports are outside that
  implementation freeze. The final source manifest includes this review record
  but excludes the four generated reports. Those reports are outputs checked
  through their source-artifact digest, summary/equivalence validation and,
  in the actual CI release, the release artifact's file manifest.

### Findings and closure

The main agent owned both fixes; reviewers remained read-only.

| Finding | Severity | Disposition and executable evidence |
| --- | --- | --- |
| A directory-inspection exception during cleanup could leave the deletion decision true. | P1 | CLOSED. Any inspection exception explicitly makes the session uncertain and retains it. Fresh child-process tests independently inject `lstatSync` and `readdirSync` failures and verify both ciphertext and guard preservation. |
| Removing the original encrypted file could select legacy OAuth without checking a retained-session guard. | P1 | CLOSED. Every OAuth selection checks retained guards before encrypted or legacy selection, including when no encrypted-path property is supplied. Explicit account/API-token mode remains a separate deliberate lane. |
| This record ambiguously suggested that the source manifest includes the four generated reports. | P2 | CLOSED. The record now distinguishes source-file coverage from generated-output and CI-artifact validation; the independent record reviewer verified closure. No evaluator behavior changed. |

The focused pre-fix regression check produced four expected failures and one
pass (39 cases excluded by the filter). After the fixes, the complete release
group passed **70/70**: Cloudflare 44, artifact 13, report equivalence 9 and
GitHub policy 4. The independent software reviewer reran the same 70 tests and
verified that the frozen patch did not change. A separate real child-process
SIGKILL test proves synthetic refreshed ciphertext survives a parent `finally`
being bypassed. These tests use synthetic credentials; none proves a real
Cloudflare deployment or authorizes access to scientific data.

The initial candidate had 65 targeted passes, but its full-gate run was
cancelled after the review findings. That cancelled run is **not PASS** and is
not reused as final validation.

### Independent read-only review

| Role | Reviewer | Frozen-code disposition |
| --- | --- | --- |
| Software, numerical/evaluator boundary and credential lifecycle | `/root/astra_release/auth_lifecycle_review` | GO; both P1 findings verified closed; open P0/P1/P2 = 0/0/0. No CI or deployment approval is implied. |
| Scientific validity and claims | `/root/scientific_release_review` | GO for this infrastructure-only scope; open P0/P1/P2 = 0/0/0. No physical model, schema, data right or scientific ranking changed. |
| Dated SOTA and comparison scope | `/root/sota_scout_round1` | GO for comparison scope; no new inference, accuracy or throughput claim. Rechecked the revised custom-MACE/Ar next tasks against primary sources. |
| Gap planning | `/root/gap_planner_restart` | Independently separated dataset rights, model use, runtime redistribution and empirical applicability; revised the next tasks below. Not an implementation approver. |
| Final review-record/evidence audit | `/root/final_release_evidence_review` | Read-only source/log reconciliation and documentation-P2 closure verified; open P0/P1/P2 = 0/0/0. Original reviewers' GO messages, the focused RED check and full-driver terminal exit were available through main-task history, not independently reread from separate durable reviewer logs. |

### Full local code gates after the final code fixes

The original final-gate driver completed with exit 0; it was not restarted or
given relaxed timeouts. Local logs are retained under
`/private/tmp/tf-wrangler-encrypted-final-gates.yYot7x/`. Commands were run in the
isolated candidate worktree with Node v24.16.0, Darwin arm64 and Python 3.9.6.
This is not the CI Python 3.12.11 environment or the ML-container Python
3.12.13 environment; those identities must not be conflated.

| Gate | Command / result |
| --- | --- |
| Lint | `npm run lint`: PASS |
| Types | `npm run typecheck`: PASS |
| JS core | `npm run test:js:core`: 1455 passed, 5 existing controlled skips; 538.26 s |
| Observer snapshot | `npm run test:js:observer-snapshot`: 2/2 passed; 998.69 s; six real evaluator runs exercise the frozen-source and authorization-request boundaries |
| Python | `npm run test:python`: 91 total with 1 skip, then 42 and 3 passed; combined **136 total = 135 passed + 1 skip** |
| Atomistic manifests and runtime locks | `npm run atomistic:validate`: VALID; full inference still NOT RUN and dispatch BLOCKED |
| Dependency vulnerability audit | `npm audit --audit-level=low`: zero known vulnerabilities |
| Installed dependency tree | `npm ls --all`: exit 0 |
| Deterministic Sentinel | `npm run evaluate`: exit 0; CONDITIONAL 41/100; `hardGateFailures=[]`; 166 s |
| Production build and isolation | `npm run build`: exit 0; 78 files, 5,729,883 bytes; eight forbidden public-evaluation fields absent |
| Independent source verification | Temporary standalone Node verifier: PASS; re-enumerated the full Git source inventory, checked all 450 file digests and the mode-sensitive aggregate, local runtime/provenance, summary binding, unchanged scorecard and reported deterministic physics/molecular/periodic replay |

The controlled skips are not model, OpenMM or browser reproduction evidence.
The duplicate-ZIP-member warning belongs to a successful negative extraction
test. The build's vinext route-classification notice is not a failed build or
an independent browser smoke result. Vulnerability scanning is not a blanket
license certification: no dependency/license scope changed in this migration,
and existing runtime redistribution limitations remain in force.

The initial full sweep included the baseline draft of this record. Its source
digest was `sha256:697b1f799473d01a35b521b95fb8245037f4f3a2ef50234e4577d58d60d5e1b7`
and its production digest was
`sha256:1b4f9271e1dce98d08db170409d23bff1e0f5dcfb008fb545bea8d3c1e25fd6f`.
Those are **draft-document evidence, not the final release identities**.
After this final record is written, Sentinel, production build/isolation and
the independent inventory/digest verifier must run again. Their generated
report and build output bind the final document; the draft digests must not be
reused. The source bytes of the reviewed implementation remain frozen.

The first final-document binding attempt was stopped after the documentation
P2 was identified: session 71407 / process group 10262 exited 143, with no group
members left. It is **review-triggered cancellation / NOT PASS**, not a timeout
restart; Sentinel had not completed and build/verifier had not started. Its
logs and cancellation record remain separate from the completed full sweep.
An additional reviewer's release-group rerun overlapped the evaluator's
intentional report-withdrawal window and encountered missing reports. It is
excluded as passing evidence, not diagnosed as a source regression. A sequential
release-group rerun after final report restoration is required before commit.

The subsequent v2 binding failed its source-inventory gate before numerical
execution: the cancelled process had left `.tailing-sentinel-x1mWtP` in the
worktree. Root and Astra verified its exact directory identity and the old
captured review-document digest, and confirmed no live worker used it. Root
moved only that snapshot to
`/private/tmp/tf-wrangler-cancelled-snapshot.tE1ebe/snapshot`, preserving its
contents and inode for recovery. No ignore rule was loosened and no source
code was changed. v2 is NOT PASS; the same final binding gates and sequential
release-group verification must succeed on the cleaned, frozen source tree.

### Release state and remaining operational boundaries

At this review cutoff, remote main is still the base SHA, protected-main run
34117855662 is attempt 1 / success, and no PR is open. The authenticated CLI
confirmed strict `evaluate` checks from app 15368, administrator enforcement,
linear history, no force pushes and no branch deletion; no rule was changed.
Cloudflare still serves deployment `b1494da8-87d4-41b1-9ccb-e8c86e49f6b4`, version
`cb33dcbe-035e-492d-8274-738dc677b28e`, created 2026-09-02. The candidate is not
deployed. A prior old-site HTTP/WebGL/one-step smoke is not candidate evidence.

Fetch main again before committing. Commit, PR, candidate CI, protected merge,
the new main SHA's first successful CI, unique release artifact, provenance
verification, Cloudflare deployment and canonical browser smoke are separate
states. Only the actual CI may generate the release manifest; no local
`GITHUB_SHA` or successful-upstream status is fabricated. No local `dist` may
be deployed directly.

The wrapper never overwrites the original credential profile. A native refresh,
uncertain exit or unexpected session entry retains private recovery state and
blocks later OAuth reuse until explicit reconciliation. It does not provide
automatic recovery from native Wrangler's non-atomic write or a machine power
loss. The real keyring and deployment boundary still require the gated release
to run; synthetic tests are not evidence that this boundary has succeeded.

## Residual scientific limitations

No model inference or new scientific reproduction is performed by this change.
Random-TP 693×2 remains NOT RUN, rights remain ABSTAIN, and dispatch remains
blocked. Existing 118-element representation does not imply solver coverage.
The unchanged champion is R2 and the unchanged 41/100 score measures validation
maturity, not percent completion or percent of SOTA. No DFT/electronic output,
full OpenMM reproduction, PFHub Benchmark 3 or Cantera CSTR completion is added.

Primary-source comparison checks on 2026-09-07 are references, not local
reproductions: [AIDO Cell](https://genbio.ai/aido-cell-simulator/),
[MatterSim's fixed model card](https://raw.githubusercontent.com/microsoft/mattersim/40a1eb8f1189a53af310957b4f2c5dfbfe68d647/MODEL_CARD.md),
[MACE foundation models](https://github.com/ACEsuit/mace-foundations), and
[LAMMPS force-shifted LJ](https://docs.lammps.org/pair_lj_smooth_linear.html).
Web-page byte digests are null here; this prose does not create a new locked
model source or change the comparator registry. Random-TP's dataset-specific
rights block is not a prohibition on every independently sourced custom
structure. Nor does model MIT licensing authorize redistribution of the entire
dependency/runtime bundle or prove material prediction accuracy.

## Next-round tasks

After this release iteration is closed, freeze acceptance tests for at most
these three tasks; they are not implemented or accepted by this review:

1. Deliver a separately versioned custom MACE-MPA-0 CPU single-point entry and
   actual fresh isolated runs on original, analytically generated neutral
   periodic structures. Reuse verified checkpoint and dependency identities,
   but do not repurpose Random-TP smoke/full or inherit its execution grant.
   Verify input/model/runtime/result binding, E/F/stress units and conventions,
   finite differences, translation/permutation behavior and resource records.
   Label results exploratory and material accuracy uncalibrated; never fall
   back silently to LJ. Prefer the existing Linux CPU infrastructure over an
   unreviewed macOS dependency migration; do not publish runtime bundles.
2. Connect those actual results to the existing custom workbench: editable
   structure, bounded job, validated result, per-atom force/source inspection,
   export/reimport and invalidation after input edits. Preserve stable IDs and
   cell conventions. Compare a coordinate-modified pair of actual single-point
   calculations, explicitly not a future trajectory or identified total
   causal effect. Keep 118-element representation separate from checkpoint
   technical coverage and empirical applicability.
3. Systematically validate a bounded 2–64 Ar classical execution domain, with
   frozen cells, separation, velocity, timestep, horizon and compute budget.
   Cover every N against an all-pairs oracle and representative cutoff/PBC,
   finite-difference, convergence, conservation, rollback and restore cases.
   Two Ar is an analytic test, not the product's permanent hard limit. A
   separate Node process using the same kernel is transport/runtime validation,
   not an independent physical solver or proof for every Ar configuration.
