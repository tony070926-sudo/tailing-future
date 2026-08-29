# Tailing Sentinel — 0.3.1-r5-atomistic-bootstrap

- Verdict: **CONDITIONAL**
- Evidence maturity: **41.00 / 100** (not a SOTA score)
- Comparator snapshot: **2026-08-29**
- Evaluated revision: **local working tree**
- Artifact: `sha256:95f0d2056de073f864ad1139603836b9d43f0eaa8dcdaafa62beb8e58d9b3f0b` across 101 source files

## Hard gates

- PASS — executable R2 numerical, schema, manifest and promotion-floor gates passed.

## Executable verification

- Fourier L2: 1.701e-4; minimum 2D order: 1.913; 8×5000 p95/max energy tail: 5.187e-5 / 5.369e-5.
- World/action schemas and negative mutation corpus: PASS; atomistic reproduction plan / dataset catalog / comparator receipts: PASS (manifest only); evaluator runtime: 75279.5 ms.
- Industrial default exclusions: facebook-uma (manual; industrialDefaultAllowed=false).

## Next iteration gaps

1. **P1 · atomistic** — Pass the locked MACE smoke, then execute both models on all 693 Random-TP records under the independent metric and receipt protocol.
   - Evidence: Force finite-difference, cutoff continuity, exact pair momentum and 10k-step NVE drift tests; protected-main MatterSim run 33221777626 also passed a 157-wheel offline build and ten-record checkpoint smoke with no reference labels in the prediction objects.
   - Acceptance: Energy, force, stress, stability, OOD and cost metrics are reproduced with checkpoint and runner digests.
2. **P1 · mesoscale** — Implement the pinned NIST PFHub Benchmark 3 coupled phase/heat case.
   - Evidence: No executable evidence in the current candidate.
   - Acceptance: Free energy, solid fraction, tip position and zero contour meet preregistered PFHub tolerances.
3. **P1 · process** — Reproduce a pinned Cantera 3.2 CSTR before adding any process recommendation.
   - Evidence: No executable evidence in the current candidate.
   - Acceptance: Species, temperature and energy trajectories match the locked Cantera reference and close balances below 0.1%.

## Interpretation boundary

This score measures evidence and engineering maturity only. CLAIM and AUDITABLE comparator records are not treated as locally reproduced numerical baselines. R2 is still a reduced-unit thermochemical verification world with one non-promotional ten-frame MatterSim smoke and no dual-model full benchmark, not a real-material, reactor or industrial-process predictor.
