# Tailing Sentinel evaluation loop

Every candidate follows one state machine:

```text
SPEC_FREEZE → BUILD → BUILDER_SELF_CHECK → INDEPENDENT_EVAL
            → SOTA_COMPARE → GAP_REPORT → NEXT_ITERATION_PLAN
            → ACCEPT / CONDITIONAL / REJECT
```

## Separation of roles

- **SOTA Scout** reads primary papers, official model cards, versions and licenses. It updates a proposed registry diff but does not change the current gate silently.
- **Builder** implements one bounded hypothesis and supplies the code, seed, data hashes and run manifest. It cannot approve its own candidate.
- **Isolated Runner** executes deterministic checks and produces the immutable evaluation bundle.
- **Scientific Evaluator** reads the candidate, locked rubric and bundle. It evaluates numerical, statistical, OOD, conservation and safety evidence without modifying the implementation.
- **Gap Planner** emits at most three next tasks, each with evidence and an executable acceptance test.
- **Supervisor** promotes a candidate only when P0 findings are absent and all relevant hard gates pass.

LLM agents interpret results and propose work; they do not replace numerical tests, independent solvers, experiments or human safety approval.

## Per-change automation

GitHub Actions runs lint, deterministic solver tests, Sentinel evaluation and the production build for every push and pull request. The resulting JSON and Markdown reports are uploaded as artifacts. Pull requests receive one updated Sentinel summary.

The comparator registry pins source, revision, evidence type and snapshot date. A stale registry blocks promotion. Vendor figures stay `vendor_reported`; only like-for-like reproduced runs may become numerical baselines.

## Promotion rules

Immediate rejection conditions include:

- mass, element, momentum, energy, positivity, boundary or hard process constraint failure;
- benchmark leakage or silently skipped predictions;
- an unexplained regression beyond the preregistered tolerance;
- NaN, runaway or discontinuous long-horizon state;
- uncalibrated uncertainty paired with a deterministic engineering recommendation;
- incompatible model, dependency or dataset licensing;
- a report that an independent runner cannot reproduce.

Automatic iteration stops after three cycles or when two successive cycles improve the evidence score by less than one point without a statistically meaningful target-metric gain. The supervisor then requires a human direction decision.

## Initial acceptance thresholds

These are development gates, not universal certification limits:

- pair force versus finite-difference potential derivative: absolute error below `2e-5` in the R0 sweep;
- force and potential continuous at the cutoff within floating-point tolerance;
- total pair force near floating-point zero;
- NVE relative energy drift below `1e-3` for the locked stable 10,000-step case;
- deterministic replay for a fixed seed and action sequence;
- future continuum toy case: normalized conservation residual at most `1e-3`;
- future cross-scale interface: residual at most `1%`;
- future process balance: mass and energy error at most `0.1%`;
- no automatic command path to PLC, DCS or SIS.

## Evidence scale

| Level | Meaning |
|---|---|
| E0 | no executable evidence or marketing-only claim |
| E1 | analytic toy case or deterministic demo |
| E2 | reproducible public held-out benchmark |
| E3 | OOD, cross-solver or blind experimental holdout |
| E4 | external independent replication or real industrial blind test |

The weighted score measures evidence maturity only. It never means “percent toward scientific truth” or “percent of SOTA”.
