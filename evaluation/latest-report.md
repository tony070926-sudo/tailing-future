# Tailing Sentinel — 0.4.11-nacl-water-semantic-import

- Verdict: **CONDITIONAL**
- Evidence maturity: **41.00 / 100** (not a SOTA score)
- Comparator snapshot: **2026-09-02**
- Evaluated revision: **local working tree**
- Artifact: `sha256:32777c7662c52b37bfb1e10cc38dfd75a4466af2e9326844711360d8cb2dc270` across 375 source files

## Hard gates

- PASS — executable R2 numerical, schema, manifest and promotion-floor gates passed.

## Executable verification

- Fourier L2: 1.701e-4; minimum 2D order: 1.913; 8×5000 p95/max energy tail: 5.187e-5 / 5.369e-5.
- Molecular isolated constant-energy trajectory: 10000 steps / 5.000 ps; maximum |ΔE|/max(|E₀|, 1 kJ mol⁻¹): 1.263e-5; OLS relative drift: 7.448e-8 ps⁻¹; deterministic replay: PASS.
- Periodic atomistic fixed-cell NVE calibration: 10,000 primary + 10,000 independent replay steps; maximum relative energy excursion 6.086e-9; momentum / internal-force / COM residuals 2.729e-12 / 6.476e-15 / 7.857e-15; physical, full-state, observation and trajectory/checkpoint digest replay PASS (evidence sha256:c19d04cfd1ebae74ea1ea8c71e99bb092aedff44cb164ad971af3f7fb36707e9).
- Aqueous foundation references: 15/15 direct-Ewald and rigid-constraint gates passed; NaCl point-charge Madelung |ΔE| 2.274e-12 kJ mol⁻¹; triclinic force finite-difference maximum 3.782e-9 kJ mol⁻¹ Å⁻¹; TIP3P position / velocity-derivative residuals 6.772e-13 Å / 6.722e-13 Å² ps⁻¹ (foundation only; no NaCl–water trajectory, PME or OpenMM execution; evidence sha256:7a015b6879c2bdbe8c39a6bbe5f0c2f4384cd0a7ad527616e57edcab4ee3f78a).
- World/action schemas and negative mutation corpus: PASS; molecular world/action/observation schemas and recomputed-tamper corpus: PASS; periodic atomistic world/action/observation schemas: PASS; aqueous v0.4.4 system/backend schemas and exact negative-evidence plan: PASS (declarative contract only; OpenMM not run); NaCl-water v0.4.10 full-seed schemas, locked digests and fail-closed actions: PASS (geometric contract only; no trajectory or solver); v0.4.11 Python semantic import and independent byte verifier source contract: PASS (portable input only; OpenMM not imported); atomistic reproduction + full-candidate plans / dataset catalog / comparator receipts: PASS (candidate contract only; no full run); evaluator runtime: 296080.0 ms.
- Industrial default exclusions: facebook-uma (manual; industrialDefaultAllowed=false).

## Next iteration gaps

1. **P1 · atomistic** — Complete the authenticated provenance/archive adapter and private handoff, then execute both frozen runtimes on all 693 Random-TP records with an independent scientific verifier.
   - Evidence: Force finite-difference, cutoff continuity and exact pair momentum tests remain unchanged. R8 adds a local two-fixed-orientation rigid-TIP3P water-body Velocity Verlet trajectory with a 10,000-step maximum relative energy-excursion gate, OLS drift diagnostic, momentum/center-of-mass/internal-force/rigid-geometry closure and deterministic replay. v0.4.10 adds a complete deterministic 6,336-site NaCl{100}–TIP3P geometric seed with exact system/coordinate/topology identity, structural schemas and fail-closed actions. v0.4.11 independently reconstructs the six-digest graph, crystal/water geometry, topology, charge/mass and periodic cell in standard-library Python, writes ten digest-bound normalized artifacts, and has Node decode every value back against the locked TypeScript plan. All four solver-admission receipts remain absent; OpenMM import, system compilation, PME, minimization, trajectory, hydration, dissolution and phase-equilibrium evidence remain false. The authenticated S replicas each contain ten finite label-free outputs per learned model; the full 693-by-two benchmark remains not run. No scientific reproduction, learned-potential comparison or score increase is claimed.
   - Acceptance: Authenticated inputs produce two 693/693 receipts; energy, force, stress, stability, OOD and cost metrics are recomputed with checkpoint, runner, source-tree and outcome digests.
2. **P1 · mesoscale** — Implement the pinned NIST PFHub Benchmark 3 coupled phase/heat case.
   - Evidence: No executable evidence in the current candidate.
   - Acceptance: Free energy, solid fraction, tip position and zero contour meet preregistered PFHub tolerances.
3. **P1 · process** — Reproduce a pinned Cantera 3.2 CSTR before adding any process recommendation.
   - Evidence: No executable evidence in the current candidate.
   - Acceptance: Species, temperature and energy trajectories match the locked Cantera reference and close balances below 0.1%.

## Interpretation boundary

This score measures evidence and engineering maturity only. CLAIM and AUDITABLE comparator records are not treated as locally reproduced numerical baselines. R2 is still a reduced-unit thermochemical verification world with non-promotional ten-frame MatterSim and MACE smoke artifacts and no dual-model full benchmark, not a real-material, reactor or industrial-process predictor.
