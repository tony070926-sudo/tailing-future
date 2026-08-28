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

GitHub Actions runs installation, lint, deterministic solver tests, production build, dependency audit and Sentinel aggregation for every push and pull request. Each upstream step reports its outcome even after another step fails. Before aggregation, the workflow removes the checked-in report; if aggregation itself crashes, the pull request receives a new REJECT notice rather than a stale PASS. After Sentinel writes the run-specific report, the workflow rebuilds the frontend so the displayed scorecard consumes that same report, then uploads the JSON and Markdown evidence artifacts.

The comparator registry pins source, claim owner, revision, evidence class, benchmark commit, checkpoint/data/runner digests and snapshot date. A stale registry blocks promotion. `CLAIM` never enters a numerical ranking; `AUDITABLE` only says public artifacts can be inspected; only local like-for-like `REPRODUCED` runs may become numerical baselines.

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
- periodic Fourier-mode normalized L2 error below `2e-3` and field-energy residual below `5e-12`;
- closed thermochemical trajectory total-energy residual below `2e-3 Eref` and momentum residual below `1e-9`;
- cell-local exchange and reaction closure accumulated near floating-point precision;
- at least `90%` of particles covered by cells with two or more particles in the locked coupling run;
- serialized world and every applied action validate against the executable 0.2 schemas;
- rejected actions and failed transitions leave the prior serialized state byte-for-byte unchanged;
- future process balance: mass and energy error at most `0.1%`;
- no automatic command path to PLC, DCS or SIS.

## Evidence scale

| Level | Meaning |
|---|---|
| E0 | no executable evidence or marketing-only claim |
| E1 | executable component or analytic toy case |
| E2 | reproducible multi-component verification with locked contracts and conservation gates |
| E3 | public held-out, OOD, cross-solver or blind experimental validation |
| E4 | external independent replication or real industrial blind test |

The weighted score measures evidence maturity only. It never means “percent toward scientific truth” or “percent of SOTA”.
