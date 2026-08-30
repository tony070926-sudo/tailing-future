# R6f runtime-freeze review — 2026-08-30

## Decision

**GO for Commit F only.** The two authenticated Commit-S bootstrap candidates
may be projected into runtime-lock `0.3` as **2 / 2** with evidence class
`runtime-frozen-not-reproduced`. This review does not authorize a scientific
reproduction, numerical comparison, score increase, model promotion or
Cloudflare deployment.

Severity at the freeze decision:

- P0: 0
- P1: 0
- P2: 2 non-blocking follow-ups

## Protected-main evidence

- producer revision: Commit S
  `687755a5835b92b632fc116e9b73ab11c1eb6cb5`;
- source runs: `33242996794` and `33242999376`, attempt `1`, workflow
  `344903345`, `refs/heads/main`;
- verifier revision: Commit V
  `fb687f8cbe4841de496031415be0053bd0c7c510`;
- verifier run: `33296529694`, attempt `1`, workflow `345720281`, protected
  `refs/heads/main`, successful GitHub-hosted `ubuntu-24.04` jobs;
- receipt artifact: ID `9727579469`, 6,811-byte ZIP,
  `sha256:61a191224f5b1922a118302919f6e8cc192c3ba7cee5b3b5c30d3ed98ab5ba8a`;
- canonical receipt: 27,676 bytes,
  `sha256:d12b91beb970df2212a3cc69c58b044f9bd4059d13cf435cd23e608c55ad19c4`;
- semantic receipt digest:
  `sha256:ab6a7ea36118e388bc26fca532f571a34536156a0226d027708f793adbfad868`;
- stable-input commitment:
  `sha256:b4183913307ca0810813c66a3963de1cb20f63ae2000121f9d1016eac94fbfcb`;
- attestation ID `43928932`; Sigstore bundle 11,787 bytes,
  `sha256:2200a92fadbb596e5b16ee7b66b097f2aa3fa7f756ff15066d2d2b4a4b85b542`;
- captured trusted root 34,634 bytes,
  `sha256:65ca537f6ed8a47fd0e560c421baa1f6c1efb8b25fc200d8c5c02c0e92eb2b9c`;
- attested Rekor time: `2026-08-30T06:17:17Z` (`1788070637`).

The raw receipt passed the exact V schema and policy with independently supplied
workflow, revision, run, attempt and verifier-script pins. Online verification
and offline `gh attestation verify` with the downloaded bundle and captured
trusted root both matched the exact repository, certificate SAN, OIDC issuer,
signer/source digest, source ref, GitHub-hosted runner, SLSA predicate, subject
name/digest and invocation URI. Wrong signer-digest and source-ref negative tests
failed as required.

The Rekor v1 bundle correctly has two different indices: global entry index
`2647884657` and shard-local inclusion-proof index `2525980395`. The signed
checkpoint identifies tree `1193050959916656506`, size `2525980413` and root
`LxShnheCrgeQmKw8BGv8CEDGlrqFGM03YfxEgjA4XYM=`. Commit F treats the indices as
different fields, requires the local index below the tree size, matches proof
size/root to the signed checkpoint and leaves the SET plus Merkle proof to the
offline cryptographic verifier; it never requires the two indices to be equal.
This follows the pinned [Sigstore protobuf
contract](https://github.com/sigstore/protobuf-specs/blob/v0.5.1/protos/sigstore_rekor.proto)
and [Rekor v1 client
guidance](https://github.com/sigstore/rekor-tiles/blob/main/CLIENTS.md).

## Accepted projection

The lock directly projects the common scientific-plan, source/materialization,
runner, dependency-lock and runtime-input roots. The exact vendored receipt raw
digest plus stable-input commitment transitively binds the remaining structure,
dependency-graph, installed-path and wheelhouse roots. The two source run IDs
remain distinct observations. Run-specific image/config identities remain
`null`; no reproducible OCI root is asserted.

The receipt deliberately retains `runtimeLockFreezeAuthorized: false`. Commit F
applies the reviewed decision outside the receipt, preventing a receipt from
self-authorizing the lock that later trusts it. Every promotion, comparison,
reproduction and promotion-trust-root claim remains false.

## Trust boundary and P2 follow-ups

1. The four source artifacts expire on 2026-09-05 and the receipt artifact on
   `2026-09-06T06:17:08Z`. Commit F therefore persists the receipt, Sigstore
   bundle and trusted-root capture and pins artifact IDs, historical metadata,
   archive hashes and signed time. Artifact expiry is historical metadata, not a
   future `Date.now()` gate.
2. The verifier logs record Node 20 deprecation warnings for the reviewed
   upload/download artifact action pins; GitHub forced them onto Node 24 for this
   successful run. A future workflow revision should upgrade and separately
   review those immutable action pins. This does not alter the completed run.

GitHub OIDC and a repository-controlled workflow establish provenance of the
receipt bytes, not organizational independence or scientific correctness. The
captured trusted root is historical verification material stored in the same
repository. CODEOWNERS is visibility, not a required-review rule. E4 therefore
remains unavailable.

## SOTA/AIDO gap handed to the next loop

This change strengthens Tailing Future's evidence/build loop; it adds no new
world-state capability. Relative to AIDO Cell's linked multiscale state,
perturb/simulate/branch primitives and broad readout families, the current lab
still lacks a learned persistent atomistic state, calibrated L1→L2 bridge,
mesoscale dynamics, reactor/process modules and measured 1/5/20-step rollout
error. The next atomistic gate is the preregistered **693 / 693 Random-TP** run
for both frozen runtimes with an independent scientific verifier. PFHub 3 and a
locked Cantera CSTR remain the next cross-scale reference anchors.

Sentinel remains **41 / 100, CONDITIONAL**.
