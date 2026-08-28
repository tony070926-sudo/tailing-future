# Tailing Sentinel — 0.3.0-r2-physics-and-atomistic-freeze

- Verdict: **CONDITIONAL**
- Evidence maturity: **41.00 / 100** (not a SOTA score)
- Comparator snapshot: **2026-08-28**
- Evaluated revision: **local working tree**
- Artifact: `sha256:a22ba1672afeda615e25a3f5f9ccac4ce231fd3172c0deab9251d535497a2e88` across 48 source files

## Hard gates

- PASS — executable R2 numerical, schema, manifest and promotion-floor gates passed.

## Executable verification

- Fourier L2: 1.701e-4; minimum 2D order: 1.913; 8×5000 p95/max energy tail: 5.187e-5 / 5.369e-5.
- World/action schemas and negative mutation corpus: PASS; atomistic reproduction plan / dataset catalog: PASS (manifest only); evaluator runtime: 84854.2 ms.
- Industrial default exclusions: facebook-uma (manual; industrialDefaultAllowed=false).

## Next iteration gaps

1. **P1 · atomistic** — Execute the pinned MatterSim 5M active model and MACE-MPA-0 challenger on the complete Random-TP benchmark.
   - Evidence: Force finite-difference, cutoff continuity, exact pair momentum and 10k-step NVE drift tests.
   - Acceptance: Energy, force, stress, stability, OOD and cost metrics are reproduced with checkpoint and runner digests.
2. **P1 · mesoscale** — Implement the pinned NIST PFHub Benchmark 3 coupled phase/heat case.
   - Evidence: No executable evidence in the current candidate.
   - Acceptance: Free energy, solid fraction, tip position and zero contour meet preregistered PFHub tolerances.
3. **P1 · process** — Reproduce a pinned Cantera 3.2 CSTR before adding any process recommendation.
   - Evidence: No executable evidence in the current candidate.
   - Acceptance: Species, temperature and energy trajectories match the locked Cantera reference and close balances below 0.1%.

## Interpretation boundary

This score measures evidence and engineering maturity only. CLAIM and AUDITABLE comparator records are not treated as locally reproduced numerical baselines. R2 is still a reduced-unit thermochemical verification world with a manifest-only atomistic plan, not a real-material, reactor or industrial-process predictor.
