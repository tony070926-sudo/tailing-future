# Tailing Sentinel — 0.2.0-r1-thermochemical

- Verdict: **CONDITIONAL**
- Evidence maturity: **29.50 / 100** (not a SOTA score)
- Comparator snapshot: **2026-08-28**
- Artifact: `sha256:12109986b25614b41c5338e51516b16f099e5fab9ec9e822721cf151dbffa81f` across 52 source files

## Hard gates

- PASS — executable R1 physics, schema, evidence and promotion-floor gates passed.

## Executable verification

- Fourier L2: 1.701e-4; coupled energy residual: 5.506e-5; momentum residual: 4.291e-14.
- World/action schemas and negative mutation corpus: PASS; evaluator runtime: 1696.1 ms.

## Next iteration gaps

1. **P1 · atomistic** — Reproduce two pinned open foundation potentials on one locked held-out benchmark.
   - Evidence: Force finite-difference, cutoff continuity, exact pair momentum and 10k-step NVE drift tests.
   - Acceptance: Energy, force, stress, stability, OOD and cost metrics are reproduced with checkpoint and runner digests.
2. **P1 · mesoscale** — Implement the pinned NIST PFHub Benchmark 3 coupled phase/heat case.
   - Evidence: No executable evidence in the current candidate.
   - Acceptance: Free energy, solid fraction, tip position and zero contour meet preregistered PFHub tolerances.
3. **P1 · process** — Reproduce a pinned Cantera 3.2 CSTR before adding any process recommendation.
   - Evidence: No executable evidence in the current candidate.
   - Acceptance: Species, temperature and energy trajectories match the locked Cantera reference and close balances below 0.1%.

## Interpretation boundary

This score measures evidence and engineering maturity only. CLAIM and AUDITABLE comparator records are not treated as locally reproduced numerical baselines. R1 is a reduced-unit thermochemical verification world, not a real-material, reactor or industrial-process predictor.
