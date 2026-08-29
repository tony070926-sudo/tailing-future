# Atomistic foundation-model reproduction protocol

Status: **planned-not-reproduced** for the full dual-model benchmark on
2026-08-29. Protected-main run `33226521340` completed non-promotional,
ten-record smoke inference for both MatterSim and MACE. This document freezes
the next executable experiment and its evidence contract, not a 693-record
reproduction result.

## Why these two models

The active model is [MatterSim-v1.0.0-5M at source commit `40a1eb8`](https://github.com/microsoft/mattersim/blob/40a1eb8f1189a53af310957b4f2c5dfbfe68d647/MODEL_CARD.md). Its official model card records an MIT license, a 4.5M-parameter model, direct energy/force/stress output, ASE/MD support and Random-TP reference metrics. The challenger is [MACE-MPA-0 medium at the MACE `4d2da09` source](https://github.com/ACEsuit/mace/blob/4d2da09413ac1407f37cdbb6b81fa28e4c15655e/README.md), which explicitly documents MPA-0's 89-element MPTrj+sAlex scope and raw PBE+U energy convention; its release asset is locked separately by byte hash.

Both are anonymously downloadable and can be evaluated on the same E/F/stress records. Their exact commits, package versions, byte lengths and SHA-256 values live in [`evaluation/atomistic/reproduction-plan.json`](../evaluation/atomistic/reproduction-plan.json).

[UMA at fixed revision `f611b917`](https://huggingface.co/facebook/UMA/tree/f611b917d9c68566bbbeccbb0aa0f7cad1696cb2) remains architecture/SOTA context only. Its weights require manually gated acceptance of the FAIR Chemistry License and an acceptable-use policy that restricts critical infrastructure, transportation, heavy machinery and nuclear uses. The fixed README and license bytes are hashed; the separately gated `USE_POLICY.md` remains `sha256:null` and therefore fail-closed until an authorized download can be verified. UMA is not allowed as Tailing Future's industrial default.

## Locked experiment

The primary like-for-like author test benchmark is the fixed [MatterSim Random-TP file](https://github.com/microsoft/mattersim/blob/40a1eb8f1189a53af310957b4f2c5dfbfe68d647/data/benchmarks/random-TP.xyz):

- 1,514,015 bytes, SHA-256 `c14473dc…63054d9`;
- 693 structures, 11,088 atoms, 89 elements and 693 unique IDs;
- energy in eV, forces in eV/Å and stress in eV/Å³;
- ten preregistered smoke structures cover all 89 elements, but full acceptance always runs all 693 frames.

The MatterSim training corpus is not hash-public, so Random-TP cannot be called leakage-certified. It also lacks per-frame T/P metadata and was produced by the MatterSim authors. The independent stability reference is WBM / Matbench Discovery, but its raw redistribution license and locked artifact digest remain unresolved; the manifest therefore blocks mirroring and local promotion.

## Fail-closed runner contract

1. Download into an untrusted staging area and verify each pinned wheel, checkpoint and dataset byte length and SHA-256 before installation or deserialization.
2. Load each pickle-based checkpoint in a network-disabled, unprivileged container with no secrets.
3. Pass an absolute local checkpoint path; mutable branch URLs and package default aliases are forbidden.
4. Require 693/693 finite E/F/stress outputs. Missing rows, corrupt bytes or unsupported elements fail; LJ and cached constants are forbidden fallbacks.
5. Test translation, atom permutation and periodic-image invariance; rotate forces and stresses equivariantly; compare forces with finite differences.
6. Publish energy/force/stress distributions, worst IDs, failure rate, batch-1 latency, throughput, memory and hardware provenance.
7. Merkle-root canonical per-record outputs by sorted structure ID; record the
   stable runtime-input contract and dependency-lock digests separately from
   each run-specific OCI image/config observation.

The raw Random-TP file is parsed by a standard-library-only trusted process. It
emits a frozen structure-only JSONL bundle; energy, force and stress labels are
never mounted into the model container. MatterSim and MACE run in separate
dependency environments because their e3nn requirements conflict. The manual
`Atomistic bootstrap predictions (non-promotional)` workflow is restricted to
`main`, Linux/amd64 and 10 smoke IDs. It resolves and freezes a wheelhouse,
proves a cold hash-locked install, builds without network access, and executes
checkpoint inference in a non-root read-only container. Its artifacts are
predictions and diagnostics only—not metrics, a receipt, an attestation or a
reproduction claim.

The resolver treats only one direct top-level `.dist-info` directory as wheel
metadata, rejects case-variant or `.egg-info` roots and any `.data` relocation
that adds to an installed metadata root, and keeps genuinely vendored nested
metadata as ordinary RECORD-hashed payload. It also rejects the prefix-relative
`.data/data` scheme, which could otherwise alias the venv's `site-packages`,
executables or configuration. The only exceptions bind the complete wheel
identity and complete observed member set for the reviewed FontTools, Plotly,
SymPy and `python-hostlist` `share/man` or `share/jupyter` payloads. The latter
also remains constrained by its package-specific dual-build verifier. Venv
Python, pip and activation scripts plus seeded pip package roots are reserved
against wheel-file and generated-entry-point collisions.
Pre-release and development wheel versions fail closed. The
MatterSim bootstrap explicitly fixes `pymatgen==2025.4.17` and
`pymatgen-io-validation==0.1.2`, avoiding the overlapping paths in the 2026
`pymatgen`/`pymatgen-core` split without weakening collision detection. Torch's
runtime setuptools dependency is fixed to the reviewed 84.0.0 wheel. Its sole
`distutils-precedence.pth` is accepted only when both the complete wheel and
hook bytes match their frozen digests, recorded as a planned removal, and
deleted before the next venv interpreter starts. Every other direct
`site-packages` `.pth`, plus every directly importable top-level `sitecustomize`
or `usercustomize` module/package form, remains forbidden.
Nested `.pth` payloads such as packaged model weights and nested vendored
customization-looking names are ordinary RECORD-hashed data, not Python site
startup hooks.

A separately hash-bound verifier runs after freeze and again immediately before
the image build. It parses the wheel ZIP members and entry points independently,
reclassifies direct startup hooks, rechecks path and file/directory collisions,
and recomputes both the raw and post-removal install-path digests instead of
trusting the resolver manifest.

The image build context is a fresh temporary directory with exactly five
regular files: `.dockerignore`, the selected Dockerfile, the generated
hash-locked requirements file, `run_model.py` and `runtime_contract.py`.
Wheel bytes enter only through a separately verified named BuildKit context.
Unexpected files or symlinks fail before the build starts.

The scientific preregistration and runtime discovery are intentionally
separate. `reproduction-plan.json` remains byte-frozen at
`sha256:d3a58524029b51c598d00a7bb9f60b6479a9973a0f9907cbf94a31e61bf1c9c2`
with its post-execution identities left `null`. A separate runtime lock binds
that plan digest and keeps the runner, dependency locks and canonical
runtime-input identities `null` during R6a discovery. R6a deliberately has no
locally assertable frozen state. After two independent protected-main replicas,
a separately controlled verifier must authenticate the workflow, repository
revision, artifact IDs and archive digests before a later lock version may
freeze those identities. The
runtime-input manifest binds the base image, Dockerfile frontend and bytes,
`.dockerignore`, exact wheels and runtime inventory, runner files, platform and
offline build policy while excluding resolver metadata and raw plan fields
that would create a self-referential hash cycle. A locally observed Docker
image `.Id` remains run-specific evidence unless independent OCI builds prove
the same manifest digest.

The canary passes the R5 commit timestamp through BuildKit's special
`SOURCE_DATE_EPOCH` build argument and verifies the resulting config/descriptor
timestamps against Buildx metadata and `docker image inspect`. This normalizes
OCI config and history timestamps, but it is not a blanket reproducible-image
claim: [BuildKit documents](https://github.com/moby/buildkit/blob/master/docs/build-repro.md#source_date_epoch)
that rewriting timestamps inside exported image layers requires a compatible
image exporter option, and image assembly behavior also depends on the named
BuildKit compatibility path. R6a therefore records manifest/config digests as
run-specific diagnostics, never promotion roots. Its container observation
also separates the current workflow revision (used by the local image tag)
from the fixed R5 runtime-source revision (used by the OCI source label and
stable runtime-input contract). The bounded bundle publishes the raw Buildx
metadata, image-inspect JSON and tool-version lines so an independent verifier
can recompute every projected diagnostic digest.

Full promotion requires all 693 IDs from both models. Each energy, force and
stress metric report must include a deterministic mean, HF7 p50/p90/p95/p99,
the worst ID/error pair and a duplicate-ID-forbidden per-record evidence root.
An independent verifier owns finite-difference, invariance and batch-1 checks
and must emit the canonical receipt bound to the exact plan bytes and trusted
attestation claims.

The future full-promotion guard must verify the GitHub artifact attestation
cryptographically outside the candidate receipt. Its trusted observation must
bind the certificate issuer and subject alternative name, repository and
repository ID, signer workflow and signer digest, source digest/ref, run
ID/attempt, hosted-runner class, raw bundle bytes and verified transparency-log
or timestamp-authority time. The equivalent CLI policy is a pinned repository
plus `--signer-workflow`, `--signer-digest`, `--source-digest`, `--source-ref`,
the SLSA provenance predicate and `--deny-self-hosted-runners`. Decoded
predicate fields alone are not a trust root. No `atomistic-full.yml` promotion
workflow exists yet, so a registry edit to `reproduced` remains fail-closed.

Run the manifest gate with:

```bash
npm run atomistic:validate
```

To verify all pinned package/checkpoint/data bytes, set an absolute cache root and add `--verify-cache`; the validator rejects path traversal and symlinks escaping the cache root:

```bash
TAILING_ATOMISTIC_CACHE=/absolute/cache node scripts/validate-atomistic-plan.mjs --verify-cache
```

## Promotion boundary

MatterSim must reproduce its official Random-TP means—0.199 eV/atom energy,
0.824 eV/Å force and 1.999 GPa stress—within the preregistered tolerances in the
manifest. MACE has no locked official Random-TP target: its first complete
blind run may establish an engineering baseline, but cannot be used to claim
superiority. Until the separate runtime lock is independently replicated and
the full 693-record verifier passes, both models remain `AUDITABLE`, never
`REPRODUCED` or numerically comparable.

Five protected-main bootstrap dispatches have run. The first stopped during
wheelhouse construction; the second and third passed wheelhouse construction
but stopped during offline exact-lock resolution. The fourth crossed those
boundaries for MatterSim. The fifth crossed them for both models and produced
two successful ten-record smoke artifacts. Every bundle deliberately remains
`bootstrap-not-reproduced`: smoke predictions are neither the 693-record
preregistered benchmark nor an accuracy result.

The third dispatch,
[`33219047585`](https://github.com/tony070926-sudo/tailing-future/actions/runs/33219047585),
ran at protected-main commit
`04f613fedea10be1f4985e32729ff73d4297066c`. Both jobs rejected the same three
TorchMetrics LPIPS weight files under
`torchmetrics/functional/image/lpips_models/{alex,squeeze,vgg}.pth`; these are
nested RECORD-hashed model data, not direct `site-packages/*.pth` startup
files. The MatterSim artifact `9704488401` has digest
`sha256:d29d46082edd0035558afa0ed9cb8ce499220e15e13146997300f90652c19cee`;
the MACE artifact `9704485367` has digest
`sha256:f77fe3ece5edf92b8c88ed20633043933a1b4aa26b34b8762a3675f48cc953dc`.
Independent inspection found no artifact safety or run-binding violation; both
truthfully report `failureStage: resolve` and no predictions.

The fourth dispatch,
[`33221777626`](https://github.com/tony070926-sudo/tailing-future/actions/runs/33221777626),
ran at protected-main commit
`9f2335070c1bd2cf441e4b549a16aca86e88eada`. MatterSim attempt-one job
[`99017141491`](https://github.com/tony070926-sudo/tailing-future/actions/runs/33221777626/job/99017141491)
passed the 157-wheel resolver, independent 35,697-file raw / 35,696-file
runtime inventory, offline cold install, image build and checkpoint inference.
Artifact `9705471645` is 63,101 bytes with archive digest
`sha256:7ae686cdaea87097c07a9fe1bdd8fe0277cf86b000f9afc71d907aa17095d005`.
Its ten predictions have digest
`sha256:14e89cfcb8d0d42b545b18b41a66b4a0899b080de014f913a91bd108d9e419cb`
and contain no reference labels. Independent inspection found ten unique
successful IDs, finite energies, sixteen force rows and a full 3x3 stress for
each selected structure.

MACE did not reach dependency resolution. Attempt-one job
[`99017141610`](https://github.com/tony070926-sudo/tailing-future/actions/runs/33221777626/job/99017141610)
failed while starting the first `python-hostlist` source-build container.
The same-commit failed-job rerun, attempt-two job
[`99017596056`](https://github.com/tony070926-sudo/tailing-future/actions/runs/33221777626/job/99017596056),
built the first wheel at the expected Linux digest
`498c59026aec1015aa07f970423d4b655ac45f5108bbc900f40f8afd3593ad1c`
and then failed to execute `/usr/bin/sh` in the second clean builder with
`resource temporarily unavailable`. Its final artifact `9705485885` is 2,369
bytes with archive digest
`sha256:912f52f47027e8f4a7494700a119789662532343fe04d789ccda7dae6d827717`;
it truthfully records `failureStage: wheelhouse` and no predictions.

[Docker documents](https://docs.docker.com/reference/cli/docker/container/run/#for-nproc-usage)
that `RLIMIT_NPROC` counts processes for a user rather than a container and can
produce this exact failure. Removing the UID-scoped limit while retaining the
container-scoped PID, CPU, memory, file, network, privilege and read-only
boundaries allowed the fifth dispatch to pass both clean MACE source builds.

The fifth dispatch,
[`33226521340`](https://github.com/tony070926-sudo/tailing-future/actions/runs/33226521340),
ran at protected-main commit
`9a67f4509588d242838c736a580b6ec5badc18f9`. MatterSim job `99031236711`
and MACE job `99031236621` both completed. Their artifacts `9707082369` and
`9707068855` contain the exact ten preregistered unique IDs, finite scalar
energies, 16×3 forces and symmetric 3×3 stresses, with no reference labels.
Both report runner digest
`sha256:2c708fc0220808cc4b2e2f3043623f604793f7bd8a5913472440f91f17a3987c`;
the resolved dependency-lock digests are
`sha256:9c990909d1307bb32608d31b9ed217d2368c28e2048f6dec39e8dc4a2b63642b`
for MatterSim and
`sha256:ae4b21b6f6d8ad98edcf2d5e0d938cd563379f494cce0b4aaa2e987332147e33`
for MACE. Independent archive and record inspection passed, but no reference
metrics or scientific receipt was computed.

R6 supervision rejected an attempted direct identity freeze before merge. The
raw plan digest was embedded in `runtime_contract.py`; hashing that runner and
writing its digest back into the plan changed the plan digest again. The same
attempt treated Docker's local config `.Id` as a cross-run trust root even
though the build labels it with the current commit. This is a cryptographic
self-reference, not a reproducibility proof. The next canary therefore emits a
non-circular runtime-input manifest and a separate discovery-only runtime lock,
then requires two fresh protected-main replicas plus a separately controlled
GitHub run/artifact verification receipt before any execution identity can be
frozen. Repository-authored observations alone can never self-approve.
