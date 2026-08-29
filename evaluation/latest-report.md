# Tailing Sentinel — 0.3.1-r6a-runtime-lock-discovery

- Verdict: **CONDITIONAL**
- Evidence maturity: **41.00 / 100** (not a SOTA score)
- Comparator snapshot: **2026-08-29**
- Evaluated revision: **local working tree**
- Artifact: `sha256:c40892ea691045ef38de84d08e9b7ba97223177b7fa0cc18cfd877fec1834eea` across 111 source files

## Hard gates

- PASS — executable R2 numerical, schema, manifest and promotion-floor gates passed.

## Executable verification

- Fourier L2: 1.701e-4; minimum 2D order: 1.913; 8×5000 p95/max energy tail: 5.187e-5 / 5.369e-5.
- World/action schemas and negative mutation corpus: PASS; atomistic reproduction plan / dataset catalog / comparator receipts: PASS (manifest only); evaluator runtime: 73340.2 ms.
- Industrial default exclusions: facebook-uma (manual; industrialDefaultAllowed=false).

## Next iteration gaps

1. **P1 · atomistic** — Issue a controlled verification receipt for the independently replicated runtime inputs, freeze a later lock version, then execute both models on all 693 Random-TP records under the independent metric and receipt protocol.
   - Evidence: Force finite-difference, cutoff continuity, exact pair momentum and 10k-step NVE drift tests; protected-main run 33226521340 also passed both isolated offline dependency builds and ten-record checkpoint smoke inference with no reference labels in either prediction artifact.
   - Acceptance: Energy, force, stress, stability, OOD and cost metrics are reproduced with checkpoint and runner digests.
2. **P1 · mesoscale** — Implement the pinned NIST PFHub Benchmark 3 coupled phase/heat case.
   - Evidence: No executable evidence in the current candidate.
   - Acceptance: Free energy, solid fraction, tip position and zero contour meet preregistered PFHub tolerances.
3. **P1 · process** — Reproduce a pinned Cantera 3.2 CSTR before adding any process recommendation.
   - Evidence: No executable evidence in the current candidate.
   - Acceptance: Species, temperature and energy trajectories match the locked Cantera reference and close balances below 0.1%.

## Interpretation boundary

This score measures evidence and engineering maturity only. CLAIM and AUDITABLE comparator records are not treated as locally reproduced numerical baselines. R2 is still a reduced-unit thermochemical verification world with non-promotional ten-frame MatterSim and MACE smoke artifacts and no dual-model full benchmark, not a real-material, reactor or industrial-process predictor.
