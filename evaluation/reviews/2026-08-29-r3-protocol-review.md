# R3 atomistic protocol independent review — 2026-08-29

Candidate: `0.3.1-r2-physics-r3-atomistic-protocol`

Decision: **PASS TO PR/CI · PROTOCOL ONLY**. This is not a scientific
promotion. MatterSim and MACE have not produced local or GitHub-hosted
checkpoint predictions, so both remain `planned-not-reproduced`.

## Review separation

Three bounded reviewer agents independently inspected the candidate:

1. evidence, attestation, dependency resolution and container boundaries;
2. default-branch PR-reporting isolation and candidate-token authority;
3. GitHub release-artifact and Cloudflare deployment boundaries.

The builder did not approve its own changes. Reviewers reported no open P0 or
P1 after remediation.

## Current SOTA comparison

The 2026-08-29 Dubai-time refresh (recorded as the 2026-08-28 UTC comparator
snapshot so it cannot be future-dated in CI) re-downloaded the fixed
[AIDO Cell 1.0 technical report](https://genbio.ai/research/AIDO%20Cell%20V1%20-%20Technical%20Report%20-%2018%20Aug%202026.pdf)
and reproduced its registered SHA-256
`4f25869b149a0064cc71381febf2599ca1e95c891be1d7d66c83a8797dbab508`.
GenBio AI's official
[AIDO Cell release page](https://genbio.ai/aido-cell-simulator/) describes a
persistent shared state, mid-trajectory actions, coherent multimodal readouts,
branching and multi-turn experiments, with vendor-reported coverage of 31
metrics across five task families. It remains a closed-alpha, cross-domain
architecture comparator; its reported results are not an independently
reproduced materials baseline.

The package controls remain
[MatterSim 1.2.5](https://pypi.org/project/mattersim/) and
[MACE 0.3.16](https://pypi.org/project/mace-torch/). Tailing Future now has an
executable, label-free, dependency-isolated smoke path for those exact packages
and checkpoints, plus a full receipt contract. Its gap to the AIDO Cell pattern
is execution and learned cross-scale coupling: the shared material state and
readouts are still governed by tested reduced-unit solvers, not a validated
atomistic-to-mesoscale-to-process learned transition model.

## Findings closed before PR

- Candidate evaluation is read-only. Pull-request comments moved to a
  default-branch `workflow_run` reporter that validates the source workflow,
  repository, run/attempt, SHA, pull request and bounded artifact before
  treating Markdown as inert data.
- The bootstrap image context contains exactly five regular files; dependencies
  enter through a separately verified wheelhouse named context. Resolution
  includes both base and requested-extra marker contexts.
- Receipt promotion binds canonical bytes, source/artifact digests, GitHub
  certificate identity, signer/source digest and ref, run ID/attempt,
  hosted-runner class and verified timestamps. With no trusted promotion
  context or full workflow, a `reproduced` registry edit fails closed.
- Release artifacts bind the exact successful main-push run and deployable
  files. Cloudflare credentials are isolated until the final child process,
  both authentication paths use one pinned account, and artifact-level
  `account_id` overrides are rejected.
- The engineering release version advanced to `0.3.1`; the unchanged
  thermochemical state contract correctly remains engine version `0.3.0`.

## Residual P2 and claim limits

- A future promotion guard must normalize a real `gh attestation verify
  --format json` result; current tests exercise the normalized contract, not a
  recorded CLI fixture.
- The attestation proves the GitHub-hosted runner class, not CPU or memory-model
  truth. `hardwareDigest` currently proves only consistency with the receipt.
- The new reporter requires a post-merge pull request to obtain its first live
  `workflow_run` exercise.
- Linux/amd64 wheel resolution, BuildKit behavior and real checkpoint runtime
  compatibility remain untested until the manual bootstrap runs.

## Next-loop inputs

1. Merge the protocol through protected CI, then run both ten-frame,
   non-promotional bootstrap matrix jobs. Acceptance: exact model/package/data
   digests, isolated cold install, ten finite E/F/stress records and bounded
   diagnostics for each model.
2. Convert the successful smoke environment into frozen runner, container and
   dependency-lock digests; add a real GitHub CLI attestation fixture and the
   independent full-run verifier. Acceptance: all 693 Random-TP structures for
   both models, six per-ID metric roots, invariance and finite-difference gates,
   with no missing or nonfinite record.
3. Only after full atomistic evidence, calibrate one narrow one-way material
   readout and reproduce the pinned PFHub and Cantera references before adding
   any process recommendation. Acceptance: held-out transport evidence plus
   conservation and uncertainty gates, with recommendations remaining shadow
   mode.
