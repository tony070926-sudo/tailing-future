# Tailing Sentinel — 0.3.1-r7b1-evidence-boundary

- Verdict: **CONDITIONAL**
- Evidence maturity: **41.00 / 100** (not a SOTA score)
- Comparator snapshot: **2026-08-29**
- Evaluated revision: **local working tree**
- Artifact: `sha256:7c956cd2a3290fc66c6a7a969f6eb4bf5a0b95f5138ef42502afabd75832943f` across 149 source files

## Hard gates

- PASS — executable R2 numerical, schema, manifest and promotion-floor gates passed.

## Executable verification

- Fourier L2: 1.701e-4; minimum 2D order: 1.913; 8×5000 p95/max energy tail: 5.187e-5 / 5.369e-5.
- World/action schemas and negative mutation corpus: PASS; atomistic reproduction + full-candidate plans / dataset catalog / comparator receipts: PASS (candidate contract only; no full run); evaluator runtime: 78258.2 ms.
- Industrial default exclusions: facebook-uma (manual; industrialDefaultAllowed=false).

## Next iteration gaps

1. **P1 · atomistic** — Complete the authenticated provenance/archive adapter and private handoff, then execute both frozen runtimes on all 693 Random-TP records with an independent scientific verifier.
   - Evidence: Force finite-difference, cutoff continuity, exact pair momentum and 10k-step NVE drift tests remain unchanged. The authenticated S replicas each contain ten finite label-free outputs per model. MACE physical predictions agree across the two runs; MatterSim differs only below the frozen bootstrap numerical tolerances. Commit F freezes the stable runtime inputs at 2/2 but these remain smoke observations without labels or accuracy metrics, not a scientific reproduction, model comparison or score increase.
   - Acceptance: Authenticated inputs produce two 693/693 receipts; energy, force, stress, stability, OOD and cost metrics are recomputed with checkpoint, runner, source-tree and outcome digests.
2. **P1 · mesoscale** — Implement the pinned NIST PFHub Benchmark 3 coupled phase/heat case.
   - Evidence: No executable evidence in the current candidate.
   - Acceptance: Free energy, solid fraction, tip position and zero contour meet preregistered PFHub tolerances.
3. **P1 · process** — Reproduce a pinned Cantera 3.2 CSTR before adding any process recommendation.
   - Evidence: No executable evidence in the current candidate.
   - Acceptance: Species, temperature and energy trajectories match the locked Cantera reference and close balances below 0.1%.

## Interpretation boundary

This score measures evidence and engineering maturity only. CLAIM and AUDITABLE comparator records are not treated as locally reproduced numerical baselines. R2 is still a reduced-unit thermochemical verification world with non-promotional ten-frame MatterSim and MACE smoke artifacts and no dual-model full benchmark, not a real-material, reactor or industrial-process predictor.
