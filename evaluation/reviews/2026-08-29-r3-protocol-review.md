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
- The reporter has passed its first live `workflow_run` exercise, but its
  Node 20 action runtime was forced to Node 24 by GitHub and should be watched
  for future action-runtime changes.
- Linux/amd64 asset fetch, preprocessing and online wheelhouse construction
  have run on GitHub. Exact-lock completion, cold install, BuildKit behavior
  and real checkpoint runtime compatibility remain unproven because the second
  bootstrap stopped in offline resolution.

## Next-loop inputs

1. Merge the resolver-compatibility remediation through protected CI, then rerun both
   ten-frame, non-promotional bootstrap matrix jobs. Acceptance: exact
   model/package/data digests, isolated cold install, ten finite E/F/stress
   records and bounded diagnostics for each model, plus a truthful outcome
   manifest for every success or failure.
2. Convert a successful smoke environment into frozen runner, container and
   dependency-lock digests; add a real GitHub CLI attestation fixture and the
   independent full-run verifier. Acceptance: all 693 Random-TP structures for
   both models, six per-ID metric roots, invariance and finite-difference gates,
   with no missing or nonfinite record.
3. Only after full atomistic evidence, calibrate one narrow one-way material
   readout and reproduce the pinned PFHub and Cantera references before adding
   any process recommendation. Acceptance: held-out transport evidence plus
   conservation and uncertainty gates, with recommendations remaining shadow
   mode.

## First live-dispatch feedback

After the protocol merged, GitHub recorded push-associated workflow parse
failure
[`33207671025`](https://github.com/tony070926-sudo/tailing-future/actions/runs/33207671025)
with zero jobs and zero artifacts; the subsequent dispatch API request was
unavailable with the same parse error. GitHub does not expose `runner.temp` in
job-level `env`. No checkpoint was loaded and no prediction artifact was
produced. The next loop moves the publish-directory derivation into the first
shell step using the hosted runner's absolute `RUNNER_TEMP`, while preserving
the exact step-level upload destination and the reviewed artifact allowlist.

The parse correction subsequently passed both pull-request Sentinel checks,
the first live default-branch reporter run
[`33208639878`](https://github.com/tony070926-sudo/tailing-future/actions/runs/33208639878),
and the protected-main Sentinel run
[`33208879671`](https://github.com/tony070926-sudo/tailing-future/actions/runs/33208879671).
The reporter's source run, artifact, candidate SHA and pull-request identities
were independently audited with no open P0/P1.

## First real atomistic bootstrap feedback

The first executable ten-frame matrix dispatch,
[`33209101610`](https://github.com/tony070926-sudo/tailing-future/actions/runs/33209101610),
ran at protected-main commit
`f3c9693f7b60eb2e044c8f38858d10d54cc29762`. Both jobs verified the immutable
base, fetched and hash-checked the selected model/checkpoint/dataset assets, and
preprocessed the exact structure subset. Both then failed in the online
wheelhouse stage before lock resolution, cold install, image build, checkpoint
deserialization or inference:

- MACE job
  [`98977621593`](https://github.com/tony070926-sudo/tailing-future/actions/runs/33209101610/job/98977621593)
  could not satisfy `python-hostlist` under `--only-binary=:all:` because PyPI
  provides 2.3.0 only as an sdist.
- MatterSim job
  [`98977621761`](https://github.com/tony070926-sudo/tailing-future/actions/runs/33209101610/job/98977621761)
  exhausted the unchanged 1 GiB `/tmp` boundary while pip downloaded
  `warp-lang`; the resolver cache and temporary response duplicated large
  wheel bytes.

The two bounded artifacts contain only fetched-asset and structure manifests:

- MatterSim artifact `9700871156`, archive digest
  `sha256:71cfcf558ccd00baf6dda4c6ca5c0a8d9e04d34d967453c89b403f56f1d4d716`;
- MACE artifact `9700869145`, archive digest
  `sha256:f884f3f08968fa78b86e87b29eea400bd3b102e060a271476f6321aee8dbf311`.

No checkpoint was loaded, no prediction was produced, and no scientific metric
was evaluated. The evidence status therefore remains
`bootstrap-not-reproduced` / `planned-not-reproduced`.

## First wheelhouse remediation

The next candidate keeps the 3 GiB memory and 1 GiB `/tmp` limits unchanged,
but disables pip's cache for each download so response bytes are not retained
twice. For MACE it adds an exact `python-hostlist==2.3.0` root and a dedicated
source-only derivation boundary: frozen source/build-tool hashes, two fresh
networkless read-only Linux/amd64 builds, byte-identity, strict wheel
verification and resolver-bound provenance. The sdist/build tools do not enter
the runtime wheelhouse.

After checkout and pinned tool setup, an always-running step attempts to emit a
run-bound `bootstrap-outcome.json` on success or any reviewed shell-stage
failure. Its fixed stage order and allowlist distinguish “assets fetched,”
“lock resolved,” “inference succeeded,” and “predictions present” without
inferring success from artifact existence. Checkout/action-runtime or writer
failure instead skips upload; it never fabricates an outcome artifact.

Independent reviewers found no bootstrap-blocking P0/P1 in this remediation.
Their lower-priority findings were closed before PR: early-stage staging now
uses a bounded `RUNNER_TEMP` fallback, inference status is conservative, the
aggregate artifact cap includes the newly written outcome, the offline
resolver independently recomputes the derived wheel's member/install-path
digests, and staging rechecks the frozen provenance digest recorded by that
resolver.
They did identify a production gate that remains deliberately open: the first
derived wheel cannot approve itself. A later production candidate must freeze
an independently reviewed output/member digest (or adopt an upstream wheel or
MACE dependency correction), strengthen source-to-wheel payload binding, and
complete GPL-2.0-or-later redistribution review. Until then this mechanism is
non-promotional bootstrap infrastructure only.

## Second real atomistic bootstrap feedback

The wheelhouse remediation merged as protected-main commit
`e43908272c2cf56d0fdcadcae4413e8fd68c5174`. The second ten-frame dispatch,
[`33214569382`](https://github.com/tony070926-sudo/tailing-future/actions/runs/33214569382),
proved that both online wheelhouse paths now complete. For both matrix jobs,
`guard`, `directories`, `bind`, `base`, `assets`, `structures` and
`wheelhouse` succeeded; `resolve` failed; `freeze`, `cold-install`, `build` and
`inference` were skipped.

- MACE job
  [`98995214629`](https://github.com/tony070926-sudo/tailing-future/actions/runs/33214569382/job/98995214629)
  rejected `setuptools-84.0.0` because suffix matching counted its nested
  vendored `.dist-info` payload as outer wheel metadata.
- MatterSim job
  [`98995214826`](https://github.com/tony070926-sudo/tailing-future/actions/runs/33214569382/job/98995214826)
  rejected the genuine `scripts/pmg` install-path collision between
  `pymatgen-2026.5.4` and `pymatgen-core-2026.8.13`.

The bounded MACE artifact `9702868333` has archive digest
`sha256:a2aff137e9e284106ef5af7ee9e62ffd86890bdffc7fbf287e3d428ab49fbda9`;
the MatterSim artifact `9702867113` has archive digest
`sha256:ce77574effea4f34d116591d4f93bbc476e7d4413dde77fa1bef20df7d3e069e`.
Their outcome manifests bind run, attempt and commit, report
`failureStage: resolve`, `inferenceSucceeded: false`,
`predictionsPresent: false` and `evidenceClass: bootstrap-not-reproduced`, and
contain no lock, checkpoint, prediction or metric. Independent ZIP inspection
found only the declared read-only JSON members, with no path, link, duplicate,
encryption or size-policy violation.

## Current resolver-compatibility candidate

The next candidate recognizes exactly one top-level `.dist-info` root while
keeping nested vendored metadata under the outer RECORD's hash coverage. It
does not weaken install-path collision handling. MatterSim instead fixes the
reviewed stable all-wheel pair `pymatgen==2025.4.17` and
`pymatgen-io-validation==0.1.2`. A full target-platform pip dry-run selected
157 distributions with no `pymatgen-core` and no pre/dev release. Separately,
an 88-wheel material-dependency subgraph passed the repository's wheel,
dependency and install-path validators with no collision; this subgraph audit
does not replace the full bootstrap resolver. A static wheel scan also found
all 21 unique `pymatgen.*` modules imported by the union of MatterSim and
`pymatgen-io-validation`; MatterSim itself accounts for three unique targets.
This does not prove ABI or runtime behavior.

Torch's runtime dependency is fixed to the exact official
`setuptools==84.0.0` wheel. The resolver binds the complete wheel and its sole
`distutils-precedence.pth` by size and SHA-256, declares exactly one planned
removal, and rejects every other startup hook. Cold install and both image
builds reverify and delete that file before the next venv interpreter starts,
then assert no startup hook remains before isolated `pip check`. A separate
hash-bound verifier reconstructs every install path directly from wheel ZIP
members and entry points after freeze and again before build, rechecks
collisions/removal ownership, and independently recomputes raw and post-removal
path digests. These checks are candidate evidence only; a third protected-main
dispatch is still required to prove exact-lock generation, cold install, image
build and checkpoint smoke inference.
