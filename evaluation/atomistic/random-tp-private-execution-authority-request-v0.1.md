# Random-TP exact-scope private-execution authority request v0.1

> **NOT AUTHORIZATION — DO NOT EXECUTE OR DISPATCH.** This is a routing-only draft request. It does not grant a right, register a workflow, authorize model execution, permit publication or redistribution, or establish a scientific result.

- Request ID: `random-tp-private-execution-exact-scope-v0.1`
- Status: `draft-routing-only-not-authorization`
- As of: `2026-09-06`
- Legal advice: `false`
- Current private-execution right: `false`

## Determination requested

Please determine whether the exact private computation identified by scope digest `sha256:c73cbb22ae3f7c57579d55c1242f6a0434eb79fb0489cd8799fceff67b8e3c91` may be authorized by a qualified dataset rights authority. The canonical scope is `evaluation/atomistic/random-tp-rights-disposition-v0.1.json#/intendedPrivateComputeScope/contract`.

This request covers only private execution. It does not request aggregate publication or runtime/checkpoint redistribution, and no decision may propagate from one of those rights to another.

## Exact benchmark binding

- Dataset: `microsoft/mattersim` / `data/benchmarks/random-TP.xyz`
- Source revision: `40a1eb8f1189a53af310957b4f2c5dfbfe68d647`
- Git SHA-1 blob: `79bddf16aac8f8f5559fe2218867a7817fad4219`
- Project-frozen SHA-256: `sha256:c14473dcf4bd71e1ed11556ac9ff12b68e7a423d813f939bc9eedaef663054d9`
- Population: 693 frames × 16 atoms/frame, covering every frozen ASCII-ordered ID
- ID-set digest: `sha256:4df1ba7cda1b0a31cdb0b3e2281ed535327d7b92ce381cd930c781cc8b800f91`
- Structure-manifest digest: `sha256:b0a94b5424f9d4a2be7519265b8dbe89a478fa5b21a6c956c70ffe0c705078f7`
- Label-manifest digest: `sha256:a0eda4ac1c7720002a32f42f91c635bf8398b93c02846fb83ae97437e3e8422f`

## Exact model and runtime binding

- MatterSim: `mattersim-v1.0.0-5m`, package `mattersim==1.2.5`, source `40a1eb8f1189a53af310957b4f2c5dfbfe68d647`, checkpoint `sha256:e3df9fa708725e3d453140646c7d1838324b347a3d1214cf1440522146f872b5`
- MACE: `mace-mpa-0-medium`, package `mace-torch==0.3.16`, source `4d2da09413ac1407f37cdbb6b81fa28e4c15655e`, foundation revision `6de003bb29db05f451051c30ce809fad522d26da`, checkpoint `sha256:75428afe3a1d7d8062e19bcaabd5c433623cabf308242ec9fb493e38604fb638`
- Canonical runtime: `linux/amd64`, Python `3.12.13`, CPU, float32, batch size 1, one thread
- Runner digest: `sha256:d6e83640f15926088c116312c27605570f9e9c8ba4e9a9988ef5bf4d3a974ed4`
- Runtime source-manifest digest: `sha256:08b1ed2ae239ce5732cf565b5e7bd814727a99ad6e1e1a29aeaa21ea1ed529a1`
- Materialization digest: `sha256:345d5e55227bbe873d567f5ea72b88db1f21c1d46e72f078db38e6a455d47721`
- Maximum request budget: 4,044 prediction requests, exactly 1,386 authoritative + 1,386 repeats + 80 invariance + 712 force finite-difference + 480 stress finite-difference requests

## Execution boundary if separately authorized later

The proposed computation uses one private ephemeral Linux AMD64 CPU runner and four fresh sequential model containers. Model execution has no network access, a read-only root filesystem, UID/GID `65532:65532`, no capabilities, no new privileges, no host sockets or secrets, no reference labels in model containers, and no shared writable mount between executions.

No persistent dataset, reference-label or per-record-prediction copy is allowed. No public artifact or log upload is allowed. Dataset and label material must be deleted before runner teardown, with independent deletion evidence. Encryption does not change the rights status.

Training or fine-tuning, any other dataset, GPU or non-Linux-AMD64 execution, public output, redistribution, browser/frontend ingestion, scientific promotion, SOTA ranking, data-leakage certification, future-rollout claims, causal claims and industrial-control use are excluded.

## Routing candidates are not authority evidence

- `ai4s-materials@microsoft.com` is an official MatterSim project contact found in the fixed README. It is a routing candidate only; its authority is not verified.
- `https://github.com/microsoft/mattersim/issues` is an official project issue route only; it is not a grant.
- `https://www.microsoft.com/en-us/legal/intellectualproperty/copyright/permissions` is an official corporate permissions route only; it is not a dataset-specific grant.

No email, issue or permissions request has been sent by this repository change, and no response has been received.

## Future response requirements

A future response is unusable unless a separate versioned migration independently verifies the responding principal, its rightsholder/delegate/qualified-review mandate, a trusted document digest and signature, issue and expiry times, implementation independence, and exact equality to the scope digest above. A self-authored, unsigned, untrusted, expired, broader, narrower or ambiguous response must remain default-deny.

The current `tf.atomistic-random-tp-rights-disposition/0.1` record remains an all-rights abstention. MatterSim/MACE 693×2 inference remains **NOT RUN**; no result is reproduced, comparison-eligible, SOTA-ranked, leakage-certified, causal, or fit for industrial use.
