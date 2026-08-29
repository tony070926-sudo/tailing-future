# R6b protected-main successful-execution claim-conflict review

Date: 2026-08-29
Decision: **REJECT — execution succeeded, but the evidence contains a positive promotion claim; zero accepted replicas**

## Scope

Two fresh `workflow_dispatch` runs exercised the corrected Docker local-load
observer on protected `main` commit
`94273066e36e230ac8ca9c7d78d7901902aed001`:

| Run | Model | Job | Job conclusion | Artifact ID | Archive bytes | Archive SHA-256 |
|---|---|---:|---|---:|---:|---|
| `33231316217` | MatterSim | `99044549338` | success | `9708599707` | 107,472 | `sha256:1b33415eddc629b77df8d8e07a71722498976ee7d5b66574bcc57272fcf60ac2` |
| `33231316217` | MACE | `99044549420` | success | `9708589960` | 49,438 | `sha256:2bb368da077ce594c83c8eb2552b7fdd734898e0fa332c16c487c34e6f76dba1` |
| `33231323492` | MatterSim | `99044856801` | success | `9708634266` | 107,486 | `sha256:9f2f0defa997c6338353e454fe8fc3fbd1dac8f9b294aae6821510e602cf0ed8` |
| `33231323492` | MACE | `99044856577` | success | `9708623345` | 49,440 | `sha256:fa6545316cdf43d77ef5a4768a1533e859c8197dcecc4ba40bc8a5d4bb021123` |

Both runs and all four jobs concluded success. GitHub's artifact API sizes and
digests matched the downloaded archive bytes, all four ZIPs passed bounded safe
extraction, and their published-file allowlists matched their bootstrap
outcomes. Each model emitted ten label-free prediction records and a valid
descriptor-free container observation. These are execution facts, not a
scientific reproduction or an accepted runtime replica.

## Machine-readable claim conflict

Every `manifests/run-summary.json` contains all of the following:

- top-level status `PREDICTIONS_ONLY_NOT_REPRODUCED`;
- `independentVerificationRequired: true`;
- `environment.provenance.complete: true`; and
- `environment.provenance.promotionEligible: true`.

The same artifact's `*.container-observation.json` instead declares
`evidenceClass: bootstrap-not-reproduced` with `promotionEligible: false`,
`comparable: false` and `reproduced: false`. Its
`bootstrap-outcome.json` also declares `bootstrap-not-reproduced`, while the
checked-in discovery lock remains `discovery-not-frozen`, with no accepted
observations and all promotion claims false.

The positive nested boolean is produced by the locked R5
`runtime_contract.py`: it equates presence of an environment lock plus a
container digest with promotion eligibility. Those inputs establish execution
identity completeness only. They cannot authorize promotion, especially for a
ten-record, label-free smoke run without metrics or an independent receipt.
Documentation or an outer negative object cannot override a contradictory
machine-readable positive claim.

## Revision ambiguity

All four summaries report
`environment.sourceRevision: 94273066e36e230ac8ca9c7d78d7901902aed001`,
which is the workflow revision. The executing runner is instead bound to R5
runtime-source commit `9a67f4509588d242838c736a580b6ec5badc18f9` and runner
digest
`sha256:2c708fc0220808cc4b2e2f3043623f604793f7bd8a5913472440f91f17a3987c`.
The container observation correctly separates `workflowRevision` from
`runtimeSourceRevision`, but a verifier must not have to reinterpret the
ambiguous summary field. The next summary schema must expose both revisions
explicitly and bind the runner digest to every locally executed producer file.

## Non-circular remediation order

The existing runtime source cannot be edited and then pointed at its own
not-yet-known commit. Repair therefore uses five ordered boundaries:

1. **P — preposition.** Add a versioned v2 runner/contract at new paths while
   leaving the R5-locked files and discovery lock unchanged. Separate
   `executionIdentityComplete` from promotion, make all bootstrap promotion,
   comparison and reproduction claims false, add explicit workflow/runtime
   revisions, and fail closed on the known conflicting R5 runner. Protected-main
   Sentinel must pass before P becomes a source anchor.
2. **S — switch.** After P has an immutable commit SHA and timestamp, update the
   discovery lock and workflow to bind P's exact blobs. The canonical runtime
   input must include the source-to-image path mapping and the digest of every
   executed local runner or wrapper file. The discovery identities and
   observations remain null/empty. Protected-main Sentinel must pass again.
3. **Fresh runs.** Execute two entirely new protected-main run IDs from S. Runs
   `33231316217` and `33231323492` cannot be retried, rewritten or reinterpreted
   into accepted evidence.
4. **Verifier.** A separately controlled default-branch verifier authenticates
   the GitHub workflow, revision, run and job conclusions, artifact IDs and
   archive digests, safely extracts the exact allowlist, recomputes runner and
   runtime-input identities, and rejects any positive promotion, comparison or
   reproduction claim at any nesting depth.
5. **F — freeze.** Only a later commit, after the controlled receipt exists, may
   freeze accepted runtime identities. The receipt and lock remain outside the
   model image so no digest feeds back into the runner bytes it identifies.

A publication-time postprocessor may reject a contradictory artifact, but it
must not rewrite `true` to `false`: that would replace the runner's output with
unbound derived evidence. Merely explaining the field as environment-scoped is
also insufficient.

## Claim and release boundary

- Accepted protected-main replicas: **0 / 2**
- Runtime lock: `discovery-not-frozen`
- Scientific full benchmark: `planned-not-reproduced`
- MatterSim/MACE evidence: ten-record smoke only; `AUDITABLE`, not comparable
- Evidence maturity: unchanged at **41 / 100 CONDITIONAL**
- Cloudflare: unchanged; no deployment was authorized or performed by these
  runs, and the latest existing deployment predates them
