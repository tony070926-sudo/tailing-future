# Tailing Future

Tailing Future is an evidence-first materials and chemical-engineering world-model lab. It starts with a small solver that can be tested, then grows scale by scale toward atomistic, mesoscale, continuum, reactor and process models.

Live lab: [tailing-future.tony070926.workers.dev](https://tailing-future.tony070926.workers.dev) currently serves v0.3.0. The Commit-S v0.3.1 candidate described below is local and unreleased.

The current **R2 / CONDITIONAL** candidate is intentionally narrow:

- a deterministic two-dimensional, force-shifted Lennard–Jones solver embedded in a periodic Fourier heat field;
- grid-independent area heat capacity and pulse energy, with three-mode two-dimensional Fourier convergence order above 1.8;
- exact two-reservoir exchange, atomic A→B settlement and normalized per-operator / cumulative energy closure gates;
- executable `tf.world/0.3` and `tf.action/0.3` schemas, atomic rollback, deterministic checkpoint continuation and unique branches;
- an eight-seed × 5,000-step PR tail gate with p50/p95/p99/max reporting and explicit compute budgets;
- a live particle/heat/species view whose pixels, values, state ID and ledger come from one observation;
- a versioned SOTA registry and Sentinel evaluator that runs physics and schema checks rather than trusting evidence labels;
- a machine-validated atomistic reproduction protocol, label-free structure bundle, isolated dependency/bootstrap path and receipt contract for MatterSim 5M and MACE-MPA-0 on Random-TP. Protected main has completed ten-record checkpoint smoke inference for both models; neither run contains reference labels or accuracy metrics, and the full dual-model benchmark remains **planned-not-reproduced**. Two R6a discovery runs failed closed on a Docker exporter-observation mismatch. Two later R6b runs executed successfully, but their locked R5 summaries contradicted the outer non-promotional evidence with nested `promotionEligible: true`; they are inadmissible and the accepted-replica count remains **0 / 2**. Commit P `f861b3e` passed [protected-main Sentinel run `33233795434`](https://github.com/tony070926-sudo/tailing-future/actions/runs/33233795434), and a subsequent dispatch proved its exact legacy-runner quarantine fails closed. This Commit-S candidate now selects only P's exact v2 Git blobs through a verified source→build→container mapping; it still requires protected-main Sentinel, two entirely fresh runs, controlled verification and only then a separate freeze commit.

This is an educational and numerical-verification prototype. It does not model a specific material, reaction, plant or safe operating window, and it must not be used for engineering decisions.

## Why this order

GenBio AI's AIDO program provides a useful systems pattern: build modules independently, connect them using domain structure, then align the combined system. AIDO Cell further separates a persistent shared state, action-conditioned transitions, readouts, branching and an evaluation/build harness. Tailing Future adapts that pattern to a non-linear materials/process graph while retaining explicit physical solvers and conservation gates.

See [Architecture](docs/ARCHITECTURE.md), [Atomistic reproduction](docs/ATOMISTIC_REPRODUCTION.md), [Evaluation loop](docs/EVALUATION_LOOP.md), [Research baseline](docs/RESEARCH_BASELINE.md), [Roadmap](docs/ROADMAP.md) and [Safety boundary](docs/SAFETY.md).

## Run locally

```bash
npm install
npm run dev
```

Run the complete lightweight gate:

```bash
npm run check
```

The gate runs lint, numerical tests, the Sentinel comparison report and a production build. The generated report is written to `evaluation/latest-report.md` and `evaluation/latest-report.json`.

## Evidence policy

- `E0`: concept or unsupported claim;
- `E1`: executable component or analytic toy case;
- `E2`: reproducible multi-component verification with locked contracts, conservation gates and public CI;
- `E3`: public held-out, OOD, cross-solver or blind experimental validation;
- `E4`: independent external replication or real industrial blind test.

Vendor-reported performance is recorded as such and never silently treated as a reproduced baseline. A higher maturity score cannot override a failed conservation, safety, leakage or license gate.

## License

No project license has been selected yet. External models and datasets are not bundled; each future integration must record its own license and redistribution terms.
