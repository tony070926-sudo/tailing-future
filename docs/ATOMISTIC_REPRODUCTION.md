# Atomistic foundation-model reproduction protocol

Status: **runtime-frozen-not-reproduced** for bootstrap execution and
**planned-not-reproduced** for the full dual-model benchmark on 2026-08-30.
Protected-main run `33226521340` first completed non-promotional, ten-record
smoke inference for both MatterSim and MACE. R6a discovery runs
`33229898921` and `33229901480` later failed closed after image export; R6b
runs `33231316217` and `33231323492` are permanently inadmissible because
their summaries contain a contradictory nested positive promotion claim.
Commit S `687755a` then produced fresh protected-main runs `33242996794` and
`33242999376`, each with ten finite label-free predictions per model and
recursively negative promotion, comparison and reproduction claims. Commit V
`fb687f8` passed protected-main Sentinel, and its protected-main verifier run
`33296529694` re-fetched and authenticated both candidates, emitted one
canonical receipt and attested its exact bytes. Commit F verifies and preserves
that receipt, Sigstore bundle and captured trusted root and freezes only the
stable bootstrap identities at **2 / 2**. This is still not a 693-record
reproduction result, an accuracy comparison or independent scientific review.

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
`main`, Linux/amd64 and 10 smoke IDs. Its reviewed execution path resolves and
freezes a wheelhouse, proves a cold hash-locked install, builds without network
access, and runs checkpoint inference in a non-root read-only container.

Commit P `f861b3e` placed that workflow under an active, exact-byte quarantine
and passed protected-main Sentinel. Dispatch `33234001808` then stopped both
model jobs with `BOOTSTRAP_QUARANTINE_ACTIVE`, published only bounded
non-promotional guard-failure outcomes and performed no resolve, build or
inference work. Commit S `687755a` now binds P's exact five source blobs,
materializes the two v2 files into isolated standard build paths and rejects
both the legacy R5 identity and every unknown runner. Its two fresh
protected-main executions are candidate inputs for the Commit-V verifier.
Their bootstrap artifacts remain predictions and diagnostics only—not metrics,
a receipt, an attestation or a reproduction claim.

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
with its post-execution identities left `null`. During discovery the separate
runtime lock kept runner, dependency-lock and canonical runtime-input
identities null. After two fresh protected-main executions, the separately
generated Commit-V verifier authenticated workflow and repository identities,
job/run conclusions, raw logs, artifact IDs, archive digests and every
machine-readable claim. Its receipt kept runtime-lock freeze authorization and
all scientific claims false. Commit F independently pins V's Git objects and
ancestry, verifies the exact receipt through its Sigstore bundle and captured
trusted root, then projects only the receipt's stable roots into runtime-lock
version `0.3`. That lock accepts two distinct source observations but remains
`runtime-frozen-not-reproduced`. The runtime-input manifest binds the base image,
Dockerfile frontend and bytes,
`.dockerignore`, exact wheels and runtime inventory, runner files, platform and
offline build policy while excluding resolver metadata and raw plan fields
that would create a self-referential hash cycle. A locally observed Docker
image `.Id` remains run-specific evidence unless independent OCI builds prove
the same manifest digest.

The canary passes the immutable P runtime-source timestamp through BuildKit's special
`SOURCE_DATE_EPOCH` build argument and verifies the resulting image/config
timestamp against `docker image inspect`; when Buildx emits a true manifest
descriptor, its created annotation is checked too. This normalizes OCI config
and history timestamps, but it is not a blanket reproducible-image
claim: [BuildKit documents](https://github.com/moby/buildkit/blob/master/docs/build-repro.md#source_date_epoch)
that rewriting timestamps inside exported image layers requires a compatible
image exporter option, and image assembly behavior also depends on the named
BuildKit compatibility path. Discovery therefore treats Buildx exporter/config
digests as run-specific diagnostics, never promotion roots. The corrected observation
schema distinguishes a true `single-image-manifest` descriptor from the
descriptor-free Docker `--load` profile, where `containerimage.digest` is only
a `docker-image-config-alias` and `manifestDescriptor` remains null. It also
binds the exact normalized local image name. Its container observation
also separates the current S workflow revision (used by the local image tag)
from the fixed P runtime-source revision (used by the OCI source label and
stable v2 runtime-input contract). The bounded bundle publishes the raw Buildx
metadata, image-inspect JSON and tool-version lines so an independent verifier
can recompute every projected diagnostic digest.

R6b exposed a second evidence-boundary defect after execution succeeded. The
locked R5 runner treats presence of the dependency lock and container digest as
`promotionEligible: true`, even though this establishes only environment
identity completeness and the enclosing summary remains
`PREDICTIONS_ONLY_NOT_REPRODUCED`. Its ambiguous `environment.sourceRevision`
also names the workflow commit while the actual runner bytes come from the
separate R5 runtime-source commit. Neither an explanatory note nor a
publication-time rewrite can repair those artifact bytes.

The repair is non-circular. Commit P prepositioned the versioned v2 runner at
new paths, left the R5-locked source unchanged and actively quarantined its
dispatch path. Commit S takes P's immutable merged SHA and timestamp as its
only runtime-source anchor, verifies P tree modes, blob OIDs, sizes and hashes,
and records the exact source→build→container mapping without freezing any
observed identity. S is merged and the separately generated,
repository-controlled Commit-V verifier has authenticated its two fresh runs.
It rejected positive promotion, comparison or reproduction claims at every
nesting depth, separated stable input roots from run-specific container and
prediction observations, and emitted a bootstrap-only receipt whose exact
bytes were attested outside the receipt. The receipt itself still does not
authorize the freeze. Commit F applies the reviewed decision by validating the
external attestation and freezing only the accepted stable identities; it does
not rewrite V's claim bytes or promote the scientific evidence class.

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

Twelve protected-main bootstrap dispatches are preserved. The first stopped during
wheelhouse construction; the second and third passed wheelhouse construction
but stopped during offline exact-lock resolution. The fourth crossed those
boundaries for MatterSim. The fifth crossed them for both models and produced
two successful ten-record smoke artifacts. The sixth and seventh failed during
R6a container observation. The eighth and ninth completed both model jobs under
R6b but are rejected because their run summaries contain the contradictory
nested positive promotion claim. The tenth, protected-main dispatch
[`33234001808`](https://github.com/tony070926-sudo/tailing-future/actions/runs/33234001808),
proved the exact legacy-runner quarantine fails closed at the guard and emitted
no prediction payload; it is not a replica. The eleventh and twelfth dispatches,
[`33242996794`](https://github.com/tony070926-sudo/tailing-future/actions/runs/33242996794)
and [`33242999376`](https://github.com/tony070926-sudo/tailing-future/actions/runs/33242999376),
ran Commit S `687755a` and completed both model jobs. Their four raw archives
were cross-checked for stable input agreement, safe exact member sets, ten
finite label-free predictions and recursively negative claims. MatterSim's two
prediction sets differ only within the preregistered bootstrap numerical
tolerances; MACE's physical predictions are equal. Protected-main Commit-V run
[`33296529694`](https://github.com/tony070926-sudo/tailing-future/actions/runs/33296529694)
then independently re-fetched all four artifacts and logs. The canonical receipt
binds both candidates, stable-input commitment
`sha256:b4183913307ca0810813c66a3963de1cb20f63ae2000121f9d1016eac94fbfcb`
and recursively negative claims; GitHub attested its exact raw digest
`sha256:d12b91beb970df2212a3cc69c58b044f9bd4059d13cf435cd23e608c55ad19c4`.
Commit F freezes the authenticated runtime roots at **2 / 2**. Every retained
prediction bundle remains `bootstrap-not-reproduced`: smoke predictions are
neither the 693-record preregistered benchmark nor an accuracy result.

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
self-reference, not a reproducibility proof. R6a therefore introduced a
non-circular runtime-input manifest and a separate discovery-only runtime lock;
R6b corrected its Docker local-load observation but revealed the positive
runner-claim conflict documented in
`evaluation/reviews/2026-08-29-r6b-successful-execution-claim-conflict-review.md`.
The versioned P-to-S source transition, fresh runs, controlled verifier and
later F freeze are now mandatory before any execution identity can be frozen.
Repository-authored observations alone can never self-approve.
