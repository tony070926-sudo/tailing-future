# R5 dual-model protected smoke review / R5 双模型受保护烟雾评审

Decision: **ENGINEERING SMOKE PASS · SCIENTIFIC PROMOTION BLOCKED**
结论：**工程烟雾测试通过，科学证据与产品晋级仍禁止**。

R5 is the first protected-main run in which both frozen checkpoint adapters
completed dependency resolution, isolated cold install, image construction,
checkpoint loading and ten label-free predictions. It is not a 693-structure
reproduction, a benchmark result, an AIDO Cell comparison score, or an
industrial recommendation.

R5 首次在受保护主分支上同时跑通 MatterSim 与 MACE 的完整烟雾路径；
但本次输出无真值标签，因而不能计算误差指标，也不能作为模型复现或 SOTA
证据。

## Protected-main evidence / 受保护主分支证据

The successful workflow-dispatch run was
[`33226521340`](https://github.com/tony070926-sudo/tailing-future/actions/runs/33226521340),
bound to protected-main commit
`9a67f4509588d242838c736a580b6ec5badc18f9`. That commit is the protected
squash merge of [R5 PR #7](https://github.com/tony070926-sudo/tailing-future/pull/7).
Both matrix jobs completed successfully:

- MACE job
  [`99031236621`](https://github.com/tony070926-sudo/tailing-future/actions/runs/33226521340/job/99031236621),
  artifact `9707068855`;
- MatterSim job
  [`99031236711`](https://github.com/tony070926-sudo/tailing-future/actions/runs/33226521340/job/99031236711),
  artifact `9707082369`.

The following values were independently read from the bounded artifacts. The
archive digest is the GitHub Actions ZIP digest; the prediction digest covers
the emitted prediction file; the runner digest covers the reviewed Python
runner inputs; and `containerImageDigest` is the Docker image ID returned by
`docker image inspect --format '{{.Id}}'` (an OCI configuration-object digest,
not a pushed registry-manifest digest).

| Observation | MatterSim | MACE |
| --- | --- | --- |
| Artifact | `9707082369`; 63,095 bytes; 9 safe regular files | `9707068855`; 30,745 bytes; 10 safe regular files |
| Actions archive SHA-256 | `sha256:8eb61a5f442edb59b6047f9c9304d6ede09083a29ec192b7b0a4b5a723efd064` | `sha256:25667e291717f40bdc8ff99edc24152d8b7b0768d507343196a93e19080c786d` |
| Prediction-file SHA-256 | `sha256:883d5551140306c4a5c9ff876b987557a625380e8cd14c6e81efab485947d95e` | `sha256:32bfd987e33cfdcf1a2cb7f31d5e55af8b4cd48f35d8f3e627d3891e044c242b` |
| Runner SHA-256 | `sha256:2c708fc0220808cc4b2e2f3043623f604793f7bd8a5913472440f91f17a3987c` | `sha256:2c708fc0220808cc4b2e2f3043623f604793f7bd8a5913472440f91f17a3987c` |
| Dependency-lock SHA-256 | `sha256:9c990909d1307bb32608d31b9ed217d2368c28e2048f6dec39e8dc4a2b63642b` | `sha256:ae4b21b6f6d8ad98edcf2d5e0d938cd563379f494cce0b4aaa2e987332147e33` |
| Observed OCI config/image ID | `sha256:739ef6ded2c0ab06b448cbab2855a171d9942b4410d28df8aba4e1e3740d817e` | `sha256:9caaac479f2db278b9beb0d4363c667e6259211166c887651727a67c84a4b571` |

For MACE, two fresh, network-isolated `python-hostlist` source builds produced
the same derived wheel,
`sha256:498c59026aec1015aa07f970423d4b655ac45f5108bbc900f40f8afd3593ad1c`;
the corresponding source-build manifest is
`sha256:1b2796e8419a6eeaf1bfaacd3942c266ca1316d2975afb040d718a8edd9b1d59`.
This closes the R4 process-limit failure at the smoke level, but it is not a
scientific metric.

For each model, the artifact contains exactly the ten expected, unique
structure IDs. Every one of the 10/10 records has a finite scalar energy, 16
finite three-component force vectors, and a finite 3x3 stress tensor. Neither
prediction file contains reference energy, force, or stress labels. The
independent artifact audits therefore passed structural, provenance, shape and
finiteness checks, while correctly retaining
`bootstrap-not-reproduced` / `PREDICTIONS_ONLY_NOT_REPRODUCED`.

## Claim boundary / 声明边界

No MAE, RMSE, correlation, calibration, invariance, finite-difference, or
like-for-like comparator metric was computed. With no joined labels, the ten
predictions demonstrate only executable checkpoint compatibility under the
reviewed sandbox. MatterSim and MACE remain **not reproduced**; neither is
promoted in the comparator registry, and no score is transferred to the
multiscale world-model claim.

[AIDO Cell](https://genbio.ai/aido-cell-simulator/) remains an architecture and
iteration-sequence reference for persistent state, actions and multimodal
readouts. Its biology-domain vendor claims are not numerically comparable with
this materials-domain, label-free smoke. This review makes no claim that
Tailing Future matches AIDO Cell's accuracy, scale, training regime or product
maturity.

## R4 → R5 image-ID drift / OCI 配置 ID 漂移

The observed MatterSim `containerImageDigest` changed from R4
`sha256:cb9393b34b8debaf050ce646fd270fcf2b708b78c22de5d63b1fcaa456ca7fe5`
to R5
`sha256:739ef6ded2c0ab06b448cbab2855a171d9942b4410d28df8aba4e1e3740d817e`.
This field is currently populated from Docker's local image `.Id`, which is the
hash of the OCI image configuration. The build injects
`org.opencontainers.image.revision="$GITHUB_SHA"`; changing the protected-main
commit therefore changes the configuration bytes and necessarily changes this
ID, even if all otherwise material runtime inputs were identical. Other build
inputs can also affect it.

Accordingly, the R4→R5 difference is a run-specific provenance observation,
not by itself evidence of physics drift, and it must not be described as an
independently reproduced immutable runtime image. A registry manifest digest,
an OCI config digest and a canonical digest of runtime-defining inputs are
different identities and must remain separately named.

## Supervised loop verdicts / Subagent 评审结论

| Supervisor scope | Verdict | Bound conclusion |
| --- | --- | --- |
| MatterSim artifact audit | **PASS (smoke only)** | Exact safe inventory; 10/10 IDs and finite E/F/stress; no labels or metrics |
| MACE artifact audit | **PASS (smoke only)** | Exact safe inventory; byte-identical derived source wheel; 10/10 IDs and finite E/F/stress; no labels or metrics |
| R6 identity-freeze design review | **P0 caught · REJECTED** | Whole-plan hash self-reference makes the proposed runner/container freeze circular |
| Evidence and release boundary | **HOLD** | No comparator promotion, score increase, Cloudflare deployment or industrial recommendation |

## Rejected R6 identity-freeze attempt / 已拦截的 P0

The first R6 freeze proposal attempted to write the observed runner, lock and
OCI config/image IDs into the reproduction plan. Review caught a P0 hash
circularity before merge:

1. the plan's raw digest is embedded in `runtime_contract.py`;
2. `runtime_contract.py` is included in the runner digest and copied into the
   container image;
3. adding runner/container identities to the plan changes the plan's raw
   digest, which requires changing `runtime_contract.py`;
4. that change creates new runner and container identities, which would again
   change the plan.

The proposed fixed point is therefore not a valid provenance construction.
The attempt was rejected with **no merge and no evidence promotion**. The
scientific reproduction-plan raw digest remains
`sha256:d3a58524029b51c598d00a7bb9f60b6479a9973a0f9907cbf94a31e61bf1c9c2`.

## R6 next-loop acceptance / 下一轮验收门

R6 may pass only if all of the following hold:

1. Keep the scientific plan's raw digest
   `sha256:d3a58524029b51c598d00a7bb9f60b6479a9973a0f9907cbf94a31e61bf1c9c2`
   unchanged; do not feed discovered runtime outputs back into that hash root.
2. Move runtime-lock discovery into a separate, explicitly typed evidence
   record. Discovery must not self-approve or silently become a promotion
   receipt.
3. Define and verify a canonical runtime-input manifest that binds the
   runtime-defining Dockerfile, lock, runner/contract sources, wheelhouse
   members, base image/frontend, target platform and build policy while keeping
   run-volatile metadata separately identified.
4. Execute two fresh protected-main replicas from independently created work
   directories and compare the canonical input manifests, locks, predictions
   and all observed image identities. Any mismatch is a blocker or a documented
   non-reproducible observation, not a value to normalize away.
5. Freeze an actual OCI config or registry-manifest ID only after independent
   replicas demonstrate that the specifically named identity is reproducible.
   Otherwise retain it as run-scoped evidence and freeze only the canonical
   runtime-input contract.
6. Do not accept repository-authored `runId`, protected-branch or success
   fields as proof. A separately controlled verifier must query and bind the
   exact workflow path, repository/head SHA, run conclusion, artifact IDs and
   archive digests; its receipt must not include the later freeze-lock digest
   that consumes it.

The 693-record dual-model benchmark and independent scientific verifier remain
downstream gates. Until those gates join labels and pass the preregistered
metrics, Tailing Future's evidence score stays **41/100**. The public
Cloudflare application remains **v0.3.0** at
[tailing-future.tony070926.workers.dev](https://tailing-future.tony070926.workers.dev/);
this smoke review authorizes no deployment.
