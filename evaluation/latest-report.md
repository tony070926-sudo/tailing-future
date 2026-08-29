# Tailing Sentinel — 0.3.1-r6d-runtime-source-switch

- Verdict: **CONDITIONAL**
- Evidence maturity: **41.00 / 100** (not a SOTA score)
- Comparator snapshot: **2026-08-29**
- Evaluated revision: **local working tree**
- Artifact: `sha256:5612adf1b0234f5dac4fdc62f718864cb2e3d03adf8b1550f0af32383d1933b0` across 118 source files

## Hard gates

- PASS — executable R2 numerical, schema, manifest and promotion-floor gates passed.

## Executable verification

- Fourier L2: 1.701e-4; minimum 2D order: 1.913; 8×5000 p95/max energy tail: 5.187e-5 / 5.369e-5.
- World/action schemas and negative mutation corpus: PASS; atomistic reproduction plan / dataset catalog / comparator receipts: PASS (manifest only); evaluator runtime: 76884.1 ms.
- Industrial default exclusions: facebook-uma (manual; industrialDefaultAllowed=false).

## Next iteration gaps

1. **P1 · atomistic** — Pass Commit S through protected-main Sentinel, obtain two entirely fresh negative-claim runtime replicas, complete controlled verification and only then freeze identities in Commit F before executing both models on all 693 Random-TP records.
   - Evidence: Force finite-difference, cutoff continuity, exact pair momentum and 10k-step NVE drift tests; protected-main run 33226521340 passed both isolated ten-record smoke paths. R6b later completed two more dual-model smoke executions, but their positive nested promotion claims make them inadmissible and add no scientific result. Commit P now anchors a recursively non-promotional v2 producer, and protected-main run 33234001808 proved the legacy R5 path is quarantined. This Commit-S candidate binds and materializes only the exact P v2 bytes; no S execution or scientific result exists yet.
   - Acceptance: Energy, force, stress, stability, OOD and cost metrics are reproduced with checkpoint and runner digests.
2. **P1 · mesoscale** — Implement the pinned NIST PFHub Benchmark 3 coupled phase/heat case.
   - Evidence: No executable evidence in the current candidate.
   - Acceptance: Free energy, solid fraction, tip position and zero contour meet preregistered PFHub tolerances.
3. **P1 · process** — Reproduce a pinned Cantera 3.2 CSTR before adding any process recommendation.
   - Evidence: No executable evidence in the current candidate.
   - Acceptance: Species, temperature and energy trajectories match the locked Cantera reference and close balances below 0.1%.

## Interpretation boundary

This score measures evidence and engineering maturity only. CLAIM and AUDITABLE comparator records are not treated as locally reproduced numerical baselines. R2 is still a reduced-unit thermochemical verification world with non-promotional ten-frame MatterSim and MACE smoke artifacts and no dual-model full benchmark, not a real-material, reactor or industrial-process predictor.
