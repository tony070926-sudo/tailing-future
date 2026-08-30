# R6e bootstrap-replica verifier implementation review

Date: 2026-08-30
Decision: **CONDITIONAL PASS — Commit V may enter protected-main review; no freeze, scientific promotion or deployment is authorized**

## Scope and evidence boundary

Commit S `687755a5835b92b632fc116e9b73ab11c1eb6cb5` produced two fresh
protected-main bootstrap candidate runs. This review covers the
repository-controlled Commit-V verifier that re-fetches those immutable GitHub records and
emits one bootstrap-only receipt. It does not turn ten label-free smoke
predictions into the preregistered 693-record scientific benchmark.

| Run | Model | Job | Artifact | Raw archive SHA-256 |
|---|---|---:|---:|---|
| `33242996794` | MatterSim | `99075425745` | `9711953689` | `sha256:12035812d29f2794a449dbe1da932d7ffb8fe954e3c3b8188d4381b760d53384` |
| `33242996794` | MACE | `99075425834` | `9711940176` | `sha256:be8ff03de186f93658d2dd5a9f30402d9b08db9f991685641e0ae4ec2a7951fa` |
| `33242999376` | MatterSim | `99075752494` | `9711987070` | `sha256:f298e09634006840583bb9be02dc9ff51cc35508d0bdea85cf9d2fe22d4bd3b8` |
| `33242999376` | MACE | `99075752422` | `9711979645` | `sha256:2180079d260b343f6ebfb3f3bcf19c9bd517056632c461bdeb2d0bfadaa69e53` |

All four archives retain exact allowlists, ten finite predictions, no reference
labels or accuracy/benchmark metrics, and recursively false promotion,
comparison and reproduction claims. MatterSim differs across runs only below
the preregistered bootstrap numerical tolerances; MACE physical prediction values are equal. These are
run-specific smoke observations, not model accuracy or superiority evidence.

## Commit-V trust separation

The verifier workflow has two jobs with different authority:

- `verify` has only `contents: read` and `actions: read`. It runs on protected
  `main`, accepts only the two exact run IDs, re-fetches run/job/artifact APIs,
  downloads bounded raw archives and logs, and constructs one canonical receipt.
- `attest` has no checkout and executes no repository code. It downloads only
  the exact current-run receipt artifact, independently matches its regular-file
  identity, byte length and SHA-256 to the read-only job outputs, then asks
  GitHub to attest those bytes.

Every external action is pinned to a full reviewed commit. Archive validation is
fail-closed for member names, order, modes, flags, extra fields, data
descriptors, CRC, gaps, overlaps, prefixes, trailing bytes and size limits before
the existing safe extractor is used. The verifier reconstructs runtime-input and
container-observation contracts using the repository's official helpers rather
than trusting summary labels.

This is technical separation, not organizational independence. The workflow,
policy and evaluator remain controlled by this repository, so E4 remains
unavailable until an external party controls or reproduces the verification.

## Authorization semantics fixed by supervision

Independent trust and scientific reviewers rejected the first receipt wording
because a generic `acceptedReplicaCount: 2` and `runtimeLockFreezeEligible: true`
could be misread as self-authorization. The final contract instead requires:

- `verifierAcceptedReplicaCount: 2`;
- `runtimeLockAcceptedReplicaCountBeforeCommitF: 0`;
- `runtimeLockFreezeCandidate: true`;
- `runtimeLockFreezeAuthorized: false`;
- `externalReceiptAttestationRequired: true`;
- `scientificPromotionEligible: false`; and
- `independentVerifierRequiredForScientificPromotion: true`.

Schema constants, policy comparison and recursive negative-claim checks enforce
all seven values. The receipt cannot contain its own artifact or attestation
identity and cannot authorize Commit F. Only a later reviewed commit, after an
external verification of the receipt attestation, may update the separate
runtime lock.

Review also corrected per-run GitHub log-file ordering, replaced copied
run-specific constants with values derived from downloaded bundles, placed the
publication clock after the final artifact-API reads, and corrected documentation
that had conflated AIDO Cell's world-model harness with AIDO Foundry's separate
build and evaluation loop.

## AIDO Cell / SOTA gap after Commit V

Commit V improves provenance and the build/evaluation loop only. It does not
reduce the current model-capability gap:

| AIDO-derived capability | Tailing Future after V | Remaining gap |
|---|---|---|
| Persistent shared state | Typed deterministic toy state | No calibrated material state, durable append-only history or long-horizon error model |
| Action-conditioned branching | Toy actions plus deterministic branch/restore | No validated industrial interventions or 1/5/20-horizon state accuracy |
| Multimodal readouts | One observation drives particle, heat and A/B views | Readouts are not measurements of one real cross-scale material system |
| Multiscale coupling | Analytic Lennard-Jones/heat bridge and passive A/B labels | No calibrated atomistic-to-mesoscale or process bridge |
| Foundation models | Two models × ten label-free smoke records | No complete 693-record metrics, OOD envelope or comparable baseline |
| Foundry-style loop | Sentinel, scorecard, subagent review and receipt verifier | Repository-controlled evidence, no external E4 certification |

The score therefore remains **41 / 100 CONDITIONAL**. The next order is fixed:
protected-main Commit V plus external receipt-attestation verification, a
separate Commit F that freezes only authenticated stable roots, then the complete
693-record L1 benchmark. A narrow calibrated L1→L2/PFHub bridge and persistent
1/5/20-horizon state/action/readout tests follow; no Cloudflare release is
authorized by Commit V.

## Local verification

The focused receipt, verifier and workflow-policy suite passes **55 / 55** tests,
and targeted ESLint, syntax, JSON-schema and whitespace checks pass. The full
candidate suite passes 201 JavaScript, 73 Python and 3 safe-extractor tests;
lint, atomistic validation and production build also pass. Atomistic validation
continues to report **0 / 2 — DISCOVERY ONLY — NOT REPRODUCED**.

Direct root `npm run typecheck` is contaminated by the separate untracked nested
repository `tailing-future-health/`, whose files the root TypeScript glob sees.
No file there was changed or staged. The same typecheck passes in an isolated
candidate snapshot that excludes that adjacent repository, which is also outside
Sentinel's declared project-source roots.

A separate online audit re-fetched all four real source artifacts and logs and
generated a valid 27,676-byte all-negative receipt under a synthetic local V
context, but that audit is diagnostic only. The authoritative receipt and
external attestation can exist only after Commit V is merged and dispatched from
protected `main`. Live branch protection still requires `evaluate`, includes
administrators, requires linear history, and forbids force pushes and deletion.
