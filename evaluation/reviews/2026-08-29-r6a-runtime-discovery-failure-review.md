# R6a protected-main runtime-discovery failure review

Date: 2026-08-29

Decision: **FAIL CLOSED — producer/exporter observation contract mismatch; zero successful replicas**

## Scope

Two fresh `workflow_dispatch` runs evaluated the R6a discovery producer on
protected `main` commit `ffc4e3795e3444775633a2464a3a34692170c176`:

| Run | MatterSim job | MACE job | Conclusion |
|---|---:|---:|---|
| `33229898921` | `99040731336` | `99040731473` | failure |
| `33229901480` | `99040990526` | `99040990374` | failure |

All four jobs passed the first thirteen reviewed stages. Each image was built
and loaded locally, then the build step failed in
`write-container-observation.mjs`. Inference was skipped. No prediction,
runtime-inventory, run-summary or container-observation artifact exists.

## Root cause

GitHub-hosted Buildx `v0.36.1` with Docker server `28.0.4` emitted this exact
metadata surface for the reviewed `docker buildx build --load` path:

- `buildx.build.ref`
- `containerimage.config.digest`
- `containerimage.digest`
- `image.name`

The R6a observer required `containerimage.descriptor` and rejected
`image.name`. Both runs therefore failed with
`Buildx metadata has an unexpected claim surface`.

For this Docker local-load exporter,
`containerimage.digest == containerimage.config.digest == docker image Id`.
No independent OCI manifest descriptor was emitted. Calling that value a
manifest digest would be inaccurate. The corrected observation protocol must
record it as a `docker-image-config-alias`, keep the manifest descriptor null,
and continue treating every image/exporter digest as run-specific diagnostic
data rather than a promotion trust root.

## Preserved failure evidence

| Run | Model | Artifact ID | Archive SHA-256 |
|---|---|---:|---|
| `33229898921` | MatterSim | `9708167237` | `6e2d25bc8edef85a45174c7c3fbd18fe09eb819f39db672a6adb26f3ba6e85d5` |
| `33229898921` | MACE | `9708157159` | `412844d910ccf7e521b740d987072d711de64a693ab8b5083be5114dca33c47b` |
| `33229901480` | MatterSim | `9708197220` | `c36208d362a60a01690029eca3aba6414d4f6df952501c051feb7c65ea3d1bf3` |
| `33229901480` | MACE | `9708190503` | `cf9bbe9ca9638d06ca29c626b6e74bd23299e0538b573de70c68eebbb822871b` |

Each downloaded archive matched the GitHub artifact API size and digest. ZIP
paths were safe and the exact published-file allowlist matched the failure
outcome. Every outcome remained `bootstrap-not-reproduced`, named `build` as
the first failure stage, and set both `inferenceSucceeded` and
`predictionsPresent` to false.

The stable discovery inputs were byte-identical across the two failed runs:

| Identity | SHA-256 |
|---|---|
| scientific plan | `d3a58524029b51c598d00a7bb9f60b6479a9973a0f9907cbf94a31e61bf1c9c2` |
| runner | `2c708fc0220808cc4b2e2f3043623f604793f7bd8a5913472440f91f17a3987c` |
| MatterSim runtime input | `dfc9e51bdb1251a3c2bf7dd48860aa0d4e9817cb453f8288e820a9e677f3c7fb` |
| MACE runtime input | `b4c18437a31c481c20c5a70d952ead3eec4a49765bc2429119c43c4b3881ebe1` |
| MatterSim dependency lock | `9c990909d1307bb32608d31b9ed217d2368c28e2048f6dec39e8dc4a2b63642b` |
| MACE dependency lock | `ae4b21b6f6d8ad98edcf2d5e0d938cd563379f494cce0b4aaa2e987332147e33` |

That agreement is useful negative evidence, but it cannot count as successful
replication because all four jobs concluded failure and no inference or valid
container observation completed.

The locally loaded image IDs also differed between the runs:

| Model | Run `33229898921` | Run `33229901480` |
|---|---|---|
| MatterSim | `8f57ce1d352a5403fdbb2516d984c2de7dc23ee683d923426d964530711a7970` | `60000c7fe838ccf7416cdab5c244d1e7c045ab22ab3ccd6a163a6e8aece6b3fd` |
| MACE | `5ca0634c8dbb74ca5528392c84bd0a2bbaf78faf60c65e8a7520c90d5db45a44` | `fea3884bb1be7412a66177bb1c63ea599b3b44f10b34dc952bb1c5f2f9a31a31` |

This is additional evidence that Docker config IDs are observations, not
cross-run stable identities.

## Required next iteration

1. Upgrade the container-observation schema to distinguish a Docker local-load
   config-ID alias from a true single-image manifest descriptor.
2. Require and validate the exact local image name; retain the strict metadata
   allowlist and reject non-empty provenance or warning claims.
3. Add the observed descriptor-free surface as an executable regression test,
   while retaining descriptor-profile mutation tests.
4. Re-run all local and Sentinel gates, merge through the protected branch,
   then execute two entirely new protected-main runs. The failed run IDs in
   this review can never be promoted by retrying or reinterpreting them.
5. A later default-branch verifier must reject any replica pair whose API run
   or job conclusion is not success, even if its stable input digests agree.

## Claim and release boundary

- Successful replicas: **0 / 2**
- Runtime lock: `discovery-not-frozen`
- Scientific full benchmark: `planned-not-reproduced`
- MatterSim/MACE evidence: ten-record smoke only; not comparable
- Score: unchanged at 41/100 CONDITIONAL
- Cloudflare deployment: not authorized by this evidence
