# R2 independent release review — 2026-08-28

Candidate: `0.3.0-r2-physics-and-atomistic-freeze`

Decision: **PASS TO CI · CONDITIONAL**, not scientific promotion. Cloudflare release remains blocked until the exact commit passes GitHub Sentinel and live branch protection is verified.

## Review separation

Three bounded read-only reviewer agents independently inspected (1) physics and numerical validity, (2) code, schema and release security, and (3) SOTA/model/data/license evidence. A fourth read-only completion pass replayed the red-team cases after remediation. Builder changes were not accepted on self-report alone.

## Findings closed before CI

- Reaction parameters now have a derived single-event feasibility gate; multi-event settlement is atomically preflighted and cannot cross the 260 K domain.
- Coupling coverage counts only cells with actual thermal degrees of freedom entering the analytic exchange path.
- Nested serialized particle/grid sizes are rejected before allocation; SHA-256 binds raw LJ box/force payloads; world parent IDs must follow the exact namespace, step and revision lineage.
- A clicked state probe is cleared when the displayed observation changes and otherwise displays its own frozen state digest.
- Sentinel hashes only Git-tracked plus non-ignored files and publishes the complete per-file source manifest.
- Cloudflare release requires a clean remote-main checkout, a successful main-push CI run, the exact seven gate keys, Node 24/Linux x64, and equality of every non-run-specific CI/local report field. Missing/extra gates and user-facing report tampering have executable regression tests.
- MatterSim and MACE package/checkpoint bytes and platform tags are pinned. MACE evidence now points to the fixed source that actually documents MPA-0. UMA is an explicit industrial-default exclusion; its fixed README/license bytes are verified while the identity-gated standalone AUP remains unresolved and fail-closed.

## Evidence gates

- Numerical tests: 34 solver/contract tests plus release-report red-team tests.
- Long-horizon profile: 8 preregistered seeds × 5,000 steps with deterministic continuation and empirical p50/p95/p99/max reporting.
- Physics references: three 2D Fourier modes, a 73-case analytic two-reservoir matrix, grid-independent heat capacity/pulse energy, atomic reaction settlement and conservation ledgers.
- Model status: `planned-not-reproduced`; no MatterSim, MACE or UMA inference result is credited as local evidence.

## Residual P2 and next-loop inputs

- The standalone LJ module still needs its own explicit maximum-particle resource envelope outside the thermochemical wrapper.
- GitHub action pins, CycloneDX SBOM, artifact attestation and signed observation/replay bundles remain future governance work.
- The score policy still lives in the same repository; required checks improve control but do not constitute external certification.
- Priority work remains: execute MatterSim/MACE on all 693 Random-TP author-test frames; reproduce PFHub Benchmark 3; reproduce a pinned Cantera CSTR before any process recommendation.
