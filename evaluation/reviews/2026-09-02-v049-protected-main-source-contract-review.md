# v0.4.9 protected-main browser source contract — final independent review

Date: 2026-09-02
Disposition: **GO for a non-promotional source checkpoint only**
Promotion and deployment: **NO-GO until the exact protected-main run succeeds**

## Scope and independence

This review covers the final checked-in source contract for carrying one exact
OpenMM positions trajectory through three private Chromium observation modes
and into a sanitized, digest-bound CI evidence envelope. Separate scientific
and security reviewers inspected the final candidate after implementation; no
reviewer approved its own changes.

It does not claim that the workflow has executed on protected `main`, that the
hosted runner isolation assumptions have been observed, that OpenMM output has
been reproduced, or that any private trajectory is eligible for a release or
Cloudflare distribution.

## Accepted source contract

- Happy path, mid-playback dispose and context-loss bind the same world session,
  source lineage, 101-frame position trajectory and client bytes, while using
  three independently generated single-use capabilities.
- Every mode performs exactly 37 checked WebGL2 draws and reaches a client-side
  audit barrier. Happy path explicitly releases the barrier and completes all
  101 frames. Dispose and context-loss terminate at frame 37 and retain the same
  count during a one-second post-revocation observation window.
- The evidence model records the two distinct facts without contradiction:
  `browserDrawObserved` is true in all three modes, while
  `trajectoryCompleted` is true only for happy path. The exact
  `101 / 37 / 37` rendered-frame contract is enforced by the runner, composer,
  JSON Schema, CI writer and independent inline attester.
- Browser evidence remains positions-only. It contains no coordinates, tokens,
  URLs, ports or private runtime tree, and it does not claim force, velocity,
  stress, energy, electron density, reaction behavior or learned dynamics.
- The Linux supervisor retains Chromium sandboxing and enters a run-scoped
  AppArmor user-namespace profile before applying `NoNewPrivs`. The Node process
  verifies its exact AppArmor label, non-root credentials, empty inheritable,
  permitted, effective, bounding and ambient capability sets, loopback-only
  interfaces and routes, and read-only source/runtime mounts.
- Always-run cleanup removes the temporary profile source, unloads the exact
  AppArmor profile, verifies that no mode of that profile remains, and removes
  only the explicitly derived private roots. No global user-namespace sysctl is
  relaxed, no SUID helper is introduced and no `--no-sandbox` path exists.
- The final reviewed workflow SHA-256 is
  `d137f2b2a73ad9d259b32046f7df627273277d13ce54d520119b4a81542b13f0`.
  All 25 locked run-step program digests match the policy, including the final
  attester digest
  `sha256:12b75cf8bb1230abbe6aa13ebf37cf1a776b565edfc182f5913844c514c28f0b`.

## Locally reproduced checks

- full JavaScript suite: 100 files passed, 2 environment-only files skipped;
  952 tests passed and 5 skipped;
- Python scientific and policy suites: 125 tests passed with 1 environment
  skip;
- full ESLint, TypeScript, shell syntax and whitespace checks: pass;
- atomistic plan and runtime-lock validation: pass;
- dependency audit: zero reported vulnerabilities;
- deterministic Sentinel: conditional at 41/100 with zero hard-gate failures;
- production build and public/private isolation audit: pass;
- local production browser smoke: one WebGL2 canvas, 11 exact NaCl–TIP3P
  endpoints, playback cursor reaching 10/10 and no browser warning/error.

The real Chromium integration tests remain environment-skipped locally. The UI
smoke uses the app browser and is not a substitute for the locked Linux
Chromium archive, AppArmor boundary or protected workflow execution.

## Comparator gap retained

GenBio AI's AIDO Cell remains a product-architecture comparator for unified
state, perturbation and multimodal readouts, not a reproduced materials
benchmark. V049 is still a read-only positions trajectory viewer rather than a
learned, action-conditioned world model. The pinned MatterSim and MACE
checkpoints have not completed their 693-record runs; PFHub Benchmark 3 phase
and heat coupling is not implemented; the pinned Cantera sample is isothermal
and cannot establish an adiabatic energy ledger.

Primary comparator pages:

- https://genbio.ai/aido-cell-simulator/
- https://github.com/microsoft/mattersim/releases
- https://github.com/ACEsuit/mace/releases/tag/v0.3.16
- https://pages.nist.gov/pfhub/benchmarks/benchmark3.ipynb/
- https://github.com/Cantera/cantera/releases/tag/v3.2.0
- https://github.com/openmm/openmm/releases/tag/8.6.0

## Release hard stops

The source checkpoint may be committed only as non-promotional work. Promotion,
GitHub release and Cloudflare deployment require the exact protected-main SHA to
produce and attest the nine-file allowlisted artifact, pass the bounded
cross-platform release guard, and preserve every conservative false claim.
Conservation, determinism, schema, isolation, license, manifest or provenance
failure remains a hard stop.
