# R7b1 evidence-boundary review — 2026-08-30

## Decision

**GO for the R7b1 non-promotional evidence foundations and site release.**
**NO-GO for a 693×2 producer dispatch, public producer artifact or
authoritative scientific receipt.** Sentinel remains **41 / 100,
CONDITIONAL**; no atomistic, comparison, reproduction, superiority or
industrial-fitness score is raised.

This iteration does not report model inference, Random-TP accuracy, a formal
reproduction or an AIDO-like multiscale world model. It prepares the next
workflow iteration without weakening the existing negative-claim boundary.

## Changes accepted in this iteration

### Scientific/data boundary

- Candidate plan `0.2` separates the trusted label-stripping preprocessor,
  label-blind model sandbox and independent label-bearing verifier.
- Producer scientific input is exactly two paths:
  `manifests/structures.manifest.json` and
  `predictions/predictions.jsonl`.
- Raw Random-TP bytes and `structures/structures.jsonl` are rejected. The
  independent verifier reconstructs and validates the frozen structure bundle
  privately and records `producerStructureBundleAttributed:false`.
- The producer outcome schema is now byte-bound by the candidate plan.

### Producer execution evidence

- `tf.atomistic-full-candidate-producer-outcome/0.2` derives execution status
  from twelve ordered stage outcomes and has a separate
  `producer-execution-only-not-scientific-assessment` status domain.
- Its scanned directory is explicitly an internal evidence inventory, not a
  public artifact. Scientific and administrative publication eligibility are
  both false while atomic-number/data redistribution remains unresolved.
- The writer inventories a fixed allowlist, rejects raw data, structures,
  labels, metrics, receipts, attestations and checkpoints, preserves bounded
  partial/failure observations and fixes every positive claim to false.
- A separate strict policy validates canonical bytes, frozen schema bytes,
  cross-field stage/evidence consistency, model-specific paths, required files,
  ordering and claim negativity.

### Source and verifier integrity

- `tf.git-source-tree/v1` hashes every tracked regular blob with SHA-256 and
  binds root plus recursive raw Git tree objects through a separate topology
  SHA-256. Empty subtrees, paths and executable modes affect the final digest;
  symlinks, gitlinks and non-regular modes fail closed.
- Rejected producer-payload evidence now requires canonical, NFC, well-formed
  UTF-8 paths at the authoritative boundary and hashes the full path bytes and
  byte length while displaying at most 256 code points. Invalid UTF-16 strings
  receive a separate code-unit identity rather than collapsing through the
  replacement character. Overflow members enter a separate domain digest;
  long sensitive suffixes can no longer be reported as absent or share the
  same evidence digest.
- Authoritative payload maps are bounded by member count and bytes. UTC
  timestamps require a real calendar date rather than permissive `Date.parse`
  rollover.
- Receipt source records the `tf.git-source-tree/v1` protocol, while remaining
  explicitly unauthenticated until the next adapter iteration.

## Review-loop findings handed to the next iteration

Three independent roles reviewed scientific correctness, receipt integrity and
GitHub integration. Their remaining P1 findings are intentionally fail-closed
scope blockers, not accepted provenance claims:

1. A trusted adapter must obtain repository/run/attempt/job/hardware/status
   from GitHub APIs and attestations; the current low-level verifier still
   accepts bare source/producer objects.
2. That adapter must hash actual outer archive members, validate the producer
   outcome, preserve control/failure evidence digests and only then create the
   exact two-file scientific byte map. The structural outcome policy alone is
   not authoritative evidence of archive bytes.
3. Public prediction publication remains blocked because prediction `0.3`
   includes atomic numbers and Random-TP has no dataset-specific redistribution
   grant. A reviewed encrypted/private handoff or a new legally cleared output
   contract is required before dispatch.
4. Required external/code-owner approval is not enforced by repository
   settings. Enabling it with only the repository author would self-lock
   approvals, so that governance change requires a collaborator decision.
5. The future archive adapter must reject or stream oversized maps before the
   low-level diagnostic receipt builder observes them. The authoritative
   receipt validator already preflights count and byte limits, but the direct
   diagnostic builder still hashes rejected members in order to preserve
   failure evidence and is not an untrusted archive-ingestion boundary.

Consequently there are still no two independent full-candidate receipts, no
40 invariance / 89 force finite-difference / 60 stress finite-difference checks
per model, and no formal reproduction eligibility.

## AIDO Cell / state-of-the-art gap

[AIDO Cell](https://genbio.ai/aido-cell-simulator/) remains the sequencing
reference: linked foundation-model representations feed a persistent shared
state, perturb/clone/replay operations and multiple readout families. R7b1
strengthens only one atomistic evidence boundary. Tailing Future still lacks a
learned persistent material state, atomistic-to-mesoscale learned bridge,
validated PFHub evolution, Cantera reactor dynamics, calibrated uncertainty,
process optimization and measured 1/5/20-horizon rollout accuracy.

The next implementation loop should build the authenticated adapter and
non-redistributive handoff first. It must retain complete-fail, failed,
cancelled and partial outcomes rather than rerunning until a pass appears.

## Verification boundary

R7b1 acceptance requires the targeted plan, producer-outcome, source-tree,
metric and verifier suites; Python writer tests; strict schema compilation;
the complete repository check in an isolated checkout; protected-main GitHub
CI; and a post-release Cloudflare smoke. The final run IDs and deployment URL
are release evidence reported separately after merge.
