# Tailing Sentinel — 0.1.0-r0

- Verdict: **CONDITIONAL**
- Evidence maturity: **10.50 / 100** (not a SOTA score)
- Comparator snapshot: **2026-08-28**
- Artifact: `sha256:486c5baa2d8869ad5069fa6f7f75ca5729470bd31f0617db4405167229f57f03`

## Hard gates

- PASS — no preregistered hard-gate failure in the lightweight R0 suite.

## Next iteration gaps

1. **P0 · coupling** — Implement typed atomistic-to-transport bridge.
   - Evidence: No executable evidence in the current candidate.
   - Acceptance: Unit check passes and interface conservation residual is below 1%.
2. **P0 · atomistic** — Run two open foundation potentials on a locked held-out subset.
   - Evidence: force finite-difference test; NVE drift test; momentum conservation test
   - Acceptance: Energy, force, stress, stability, OOD and cost metrics reproduced for two models.
3. **P0 · contract** — Validate immutable state and typed actions end-to-end.
   - Evidence: schemas/world-state.schema.json; deterministic replay test
   - Acceptance: Schema, clone, replay and branch isolation all pass in CI.

## Interpretation boundary

This score measures evidence and engineering maturity only. Vendor-reported capabilities are not treated as reproduced numerical baselines, and the R0 browser solver is not a real-material or industrial-process predictor.
