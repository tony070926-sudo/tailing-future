# H-R18A-WRANGLER-ADMISSION/0.4 — independent source review

2026-09-07 UTC. Builder: `/root/astra_release` (Astra/Sagan). Root owns all
post-freeze changes and final gate execution. Read-only scientific reviewer:
`/root/scientific_custom_mace` (Dewey); software/numerical reviewer:
`/root/custom_runtime_review` (Fermat); dated primary-source/claims reviewer:
`/root/sota_release_v04`; independent priority planner:
`/root/gap_planner_release_v04`. No reviewer implemented the candidate assessed.

**Source-review disposition: GO for this bounded integration only. Open
P0/P1/P2: 0/0/0. This is not commit, scientific-promotion or release approval.**
The final post-review source freeze, executable gates and protected CI must
independently succeed. A review assertion never substitutes for an execution.

## Hypothesis, baseline and scope

The complete frozen pre-code hypothesis and acceptance tests are in
`2026-09-07-r18a-wrangler-integration-v0.4-plan.md`, SHA256
`421d38b161304130aea3e780f9b17139917cb07844b08fdec2eac9401ec1f1cb`.
The three tasks are explicit /0.4 admission of the reviewed Wrangler import,
versioned current-root-v3 wiring with mandatory unchanged historical replay,
and integration/review followed by separate final gates and release states.
No custom-MACE implementation or frontend change is included.

The clean baseline was exact main `84f7720e9ac14fcb50fb54fdcb96d1df7473c365`,
Git tree `e673c40ee6144b510223caf8cf6d6b30bc4f9eb6`, 517 paths. All sorted
POSIX-mode/size/SHA256 baseline records have compact-array digest
`cbfb32cd44ba74f44a68a933ff49ccc0e7d32daa0dfd0675a9123a74b0844310`.
External baseline records and logs:
`/private/tmp/tf-r18a-wrangler-v04-baseline.4R1wJO/`.
Fresh Node24.16.0 install: 561 packages, audited562, zero vulnerabilities;
baseline targeted tests 74/74, 67.14s. Baseline actual historical replay included
10+5 tests, nested5+20 and checkoutNode29. No actual Python numerical run was
claimed for that baseline. Earlier e151 CI is not transferred to this candidate.

## Frozen candidate assessed

Builder froze the candidate at 2026-09-07T17:59:09.399Z. External record:
`/private/tmp/tf-r18a-wrangler-v04-selfcheck.NkCKty/builder-freeze.json`, SHA256
`d3e7bdc99586cc37a0bbf9296db1d07dcd0fdefa5a68ca496b9e19e4d67659c7`.
Its adjacent `frozen-candidate.diff` and `frozen-inventory.json` retain the raw
patch and per-file identities. The patch algorithm concatenates sorted-path
Git binary diffs; new files use no-index diffs against `/dev/null`.

| Frozen object | Identity |
| --- | --- |
| 14-file patch, including the then-draft review, 262203 bytes | SHA256 `4344819ef80f0359b7d64034a2c694dfafcf5bca09b94107338f63e7cd77a808` |
| 13-file implementation patch, excluding only this exact review, 260236 bytes | SHA256 `7ace26d2149a2cae2dbf9bb5eb720d171830f42ccfdfe3a9f64063d6cd7ebc4c` |
| Complete observed inventory, 527 paths | SHA256 `b5166e7505e3a8ff656b22913089bb856d130a5a78e065b16a5d0cff567cc6f1`; Git tree `81e289e8f6c26d8c2ebb7ec42f4407d47f07be29` |
| Evaluator inputs, 522 paths | SHA256 `b9f6a311b3f80a4355fe88872272c53e9c3b5fd15a6f96b131ecbb14be028563`; Git tree `3b8d83b0c9a47796323a70fbd201fac18d658674` |

Those complete-source identities describe the draft-review freeze, not this
final review's bytes. Only this exact control record is finalized afterward;
the 13-file implementation identity must remain unchanged. Every new document,
including this record, remains an evaluator input. Final full-source identities
must be captured externally after this edit and rebound to actual final runs.
No source exclusion, circular self-hash or in-tree self-approval is introduced.

## Executed checks and retained failure

The first Builder selfcheck passed lint/typecheck but returned **108/109,
COMMAND_FAILED, exit1**. Its historical wrapper failed after120.541s. The saved
log lacks the child facts needed to identify a cause: **root cause UNDETERMINED**.
A later host-load sample does not establish load during that failure. Later
passes do not explain it. The original `targeted.log` remains in the external
selfcheck directory. No timeout, physics budget, CI budget or test tolerance was
relaxed. Failed child facts are now retained on the thrown error for diagnosis.

A standalone diagnostic then passed in64.493s with the existing120s child budget,
complete historical counts, status0, no truncation and confirmed cleanup.
`historical-diagnostic.json` retains that distinct execution. Final Builder
selfcheck then passed lint/typecheck and **111/111 in110.75s**, comprising new
admission12, current-root-v3 tests5, Wrangler44, artifact13, report9,
derived-report24 and source-scope4. Its historical child was64.342s; separate
current Node29 also passed. These do not include the full MD/Sentinel/build gates.

Builder final logs in the same external directory:

| Log | Bytes | SHA256 |
| --- | --- | --- |
| `v2-lint.log` | 187 | `9a1b6012f89124eddcb6c5fb9580d64ebc48f83f219cf9e3064590d6dfc07816` |
| `v2-typecheck.log` | 117 | `b76ad2098fff3b2bf769a4183440b86daafb68335fa2a6abe70bbaf737769db9` |
| `v2-targeted.log` | 85064 | `2fb073f7da7018bb396f8079c30f944c37275853a0244cb97f76fa59c292ee21` |
| `v2-current-node29.log` | 9703 | `069c5c4c5a1e235ee79eb85f6d25efada60f3d79b5114eb0db918ed5948b3739` |
| `v2-current-source-admission.log` | 1400 | `26372cd47c34958206b69c4b1ada360f8a1576aa7dc1d1b63ee25382e4d4119c` |

Root also **actually executed** the current-root-v3 R18a suite on the frozen
draft-review candidate, using copied/reverified locked Darwin CPython3.12.14
inputs, not merely invoking a fixture. Exit0, elapsed25269.303ms: Python21,
Node29 and two independent supervisor/schema invocations all passed with no
timeout, truncation or unconfirmed cleanup. The two newly produced receipts had
distinct inodes/supervisor PIDs, each248778bytes,0444,single-link, SHA256
`d91e31d261bf77f99b17e810f5f51aab131dd5339e281839933e45fa79855e5c`.
All527 observed source identities were unchanged before/after.
Raw execution record558827bytes, SHA256
`829c09926ca9039c29758c2e989167a53647617e1f4b6bdda5ac9c60619cd6d8`:
`.tf-runtime/r18a-current-root-KOLrI9/execution.json` in this worktree.
The locked747-file bootstrap was verified independently; source runtime inputs
in the original user's worktree were read-only, copied and reverified, not edited.
This execution must be repeated against the final review/source identity.

## Independent findings and dispositions

- **Scientific/evidence: GO, P0/P1/P2=0/0/0.** Independently reconstructed the
  frozen diffs and Git base records, checked exact Wrangler imports, verified
  unchanged scientific/runtime/budget contracts, ran current-root-v3 tests5/5,
  and independently read the full real R18a execution record, bootstrap and two
  receipt outputs. Both receipt schema commands passed independently. All
  physical-validation, convergence, reproduction and promotion flags stay false.
- **Software/numerical integrity: GO, P0/P1/P2=0/0/0.** Independently checked
  all517 base Git blobs, all14 frozen identities before/after, exact four e151
  imports and the runner's two mechanical substitutions. Independent focused
  replay17/17, exit0,112.891s; historical child66.828/120s, actual10+5,
  nested5+20 and Node29, cleanup confirmed. Separate currentNode29 passed.
  Two production-function POSIX drift directions0444↔0644 and negative controls
  passed. Raw `focused.log`:84806bytes, SHA256
  `c52619e83ade18d22f517310b076f7a30ffe839fe30af5a4347e08c0717a8306`,
  `/var/folders/7n/r3bblh415gb535s1gz9y5zn00000gn/T/tf-v04-independent-review-PHDL1j/`.
- **Dated sources/claims: GO, P0/P1/P2=0/0/0 after clarification.** Independently
  matched the frozen files, patch, Builder logs and actual receipt record. No
  inherited CI, signed-attestation, SLSA or scientific validation is claimed.
- **Gap Planner:** no blocking release-scope issue. Missing actual custom-MACE
  execution remains a capability backlog, not an implementation result. The
  growing historical-admission replay cost is a future architecture issue, not
  permission to remove today's checks, exclusions discipline or frozen budgets.

The inherited P2 wording clarification is closed by this explicit limitation:
the unchanged Wrangler selector finds an eligible successful exact-main
push run on attempt1; it does **not** prove chronological-first uniqueness among
separate run IDs. At release Root must additionally enumerate exact-SHA push/main
runs and require one unambiguous initial run, attempt1 success, plus the existing
unique-artifact gate. Any ambiguity blocks deployment. The four reviewed import
files remain byte-exact; no signed-attestation or SLSA certification is asserted.

## Dated primary-source comparison

This is a provenance/authentication integration, not a scientific leaderboard
comparison. Official sources were inspected on2026-09-07:

- Cloudflare's [Wrangler OAuth/keychain documentation](https://developers.cloudflare.com/workers/wrangler/commands/general/#storing-oauth-credentials-in-the-os-keychain),
  raw docs revision `26ef2e07d02644632cb0215ffcbf65664f5086c6`,
  `src/content/docs/workers/wrangler/commands/general.mdx`, SHA256
  `5f2e726af529af9d819ae47e32aa627f9e956cc1d7c9c07cf6b05c5fba61b5aa`.
  The installed Wrangler4.127.0 tag resolves to source revision
  `a831498703957fe6a6025402ed7c4a527555881e`. Its official npm archive integrity:
  `sha512-4dPqcBEMJfGeZeNnjHT7ThNJs+EiNYxUTg4ywqIdQubcXHBhFeVMQyHV4A9AOhZRFr83cckqdds034KGcr/dtw==`.
  This supports the native keychain/encrypted-profile behavior, not proof that
  this candidate has successfully authenticated or deployed.
- GitHub's [artifact attestation documentation](https://docs.github.com/en/actions/concepts/security/artifact-attestations),
  docs revision `831337b0fed60b90a72e2711a41dfcad72b5f288`,
  `content/actions/concepts/security/artifact-attestations.md`, SHA256
  `664b528c604fb5b1cd0100b7dc5f785ccbef5091421840b460cd2a750d02f4dd`;
  reusable explanation SHA256
  `75af27a34a3bf442b9a73f7c26ff9878c8d612259a6520378fd6fb73e6ca4994`.
  Signed provenance and security/correctness are distinct. The local digest
  guard is not a signed attestation. Official artifact-sharing documentation
  at the same revision has SHA256
  `93aa0138f0689897421f975eb9c487dbc21ca703aa4c8dd2862d4cd536969892`;
  download-action digest warnings do not replace this wrapper's hard failures.
- [AIDO Cell Simulator](https://genbio.ai/aido-cell-simulator/) and its
  [official AIDO repository](https://github.com/genbio-ai/AIDO) remain conceptual
  references for shared state and experimental interfaces, not like-for-like
  numerical comparators for this admission/authentication task. No material-world
  parity or evidence-score increase follows. These live page digests are null;
  the pinned raw-document hashes above are not hashes of rendered live pages.

## Final gates, release states and scientific boundaries

This completed review records the tests and identities already observed. The
post-review gate run must bind this final record's exact bytes. External final
freeze, command logs/statuses and actual evaluator generation evidence belong in
`/private/tmp/tf-r18a-wrangler-v04-root-gates.ncs74h/`. Their existence or success
is **not asserted in advance**. The four generated reports remain outputs and
must be regenerated by the real evaluator after all applicable final gates, then
verified with its actual external generation record. Local artifact verification
must preserve its honest source-mode/non-CI identity. No local dist may deploy.

Required final gates: targeted tests; lint/typecheck; complete JS core and isolated
observer-Sentinel snapshots, Node29 and Python suites; new current-root R18a
execution and receipt schemas; atomistic manifests; deterministic Sentinel;
production build and isolation; dependency audit/tree; source/POSIX inventories,
derived report and artifact identities; independent final-record verification.
Any relevant failure or P0/P1 blocks commit/promotion. Fetch main and recheck
conflicts before commit. Commit, PR, candidate CI, branch protection, main merge,
first new-main CI, unique release artifact, Cloudflare deployment and canonical
HTTP/title/canvas/WebGL/solver/console smoke are separate later states. None is
established by this document. Old main84f CI was still running at18:08 UTC;
old canonical72bc remains the last observed deployment, not this candidate.

R18a is only an8×4 dimensionless PFHub7a preflight, two steps over0.02 reduced
time. Its real receipts are auditable bounded execution, not PFHub Benchmark3,
mesh/time convergence, real-material accuracy, model inference or a reproduced
full benchmark. No scientific quantity, scorecard, unit/basis, frontend contract,
source exclusion, runtime identity, 600000ms numerical budget,1000ms stop grace
or75-minute CI limit changed. Sentinel score41, if re-established, measures
validation maturity rather than scientific truth or percent of SOTA.

All118-element representation, model technical support and validated domain
remain distinct. Native custom structures remain static/solver-ABSTAIN here.
Random-TP693-per-model inference has not run and its rights/dispatch block is
unchanged. No electron density, orbital, bond-order, calibrated uncertainty,
identified causal effect, industrial recommendation or automated PLC/DCS/SIS
path is added. The parked custom-MACE source/synthetic tests are not actual MACE
inference and are not included in this release integration.

## Next round, at most three tasks after release

1. Close the custom-MACE locked Linux execution path: build and verify the missing
   derived wheel, bind actual runtime/host evidence and the raw result producer.
2. Execute two fresh223-configuration custom runs against the frozen scientific
   preregistration and independent verifier; preserve failures/inconclusive
   outcomes. Derivative/invariance consistency is not independent DFT accuracy.
3. Bind accepted real single-point results to editable stable-ID3D structures,
   invalidate them on edits and verify export/reimport. No fabricated dynamics,
   reaction, calibrated uncertainty or quantitative causal interpretation.
