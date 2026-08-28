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
- **Isolated Runner** executes deterministic checks and produces a run-specific evaluation bundle.
- **Scientific Evaluator** reads the candidate, reviewed rubric and bundle. It evaluates numerical, statistical, OOD, conservation and safety evidence without modifying the implementation.
- **Gap Planner** emits at most three next tasks, each with evidence and an executable acceptance test.
- **Supervisor** promotes a candidate only when P0 findings are absent and all relevant hard gates pass.

LLM agents interpret results and propose work; they do not replace numerical tests, independent solvers, experiments or human safety approval.

## Per-change automation

GitHub Actions runs installation, lint, deterministic solver tests, manifest validation, production build, dependency audit and Sentinel aggregation for every push and pull request. Each upstream step reports its outcome even after another step fails. Before aggregation, the workflow removes the checked-in report; if aggregation itself crashes, the pull request receives a new REJECT notice rather than a stale PASS. Sentinel hashes the exact Git-tracked plus non-ignored source set into a per-file manifest, records the CI commit, rebuilds the frontend, then uploads the JSON and Markdown evidence artifacts. Cloudflare release fetches remote `main`, requires its strict Sentinel check, downloads that exact CI report, compares the source manifest with the clean local checkout and rechecks remote `main` before deploy.

The comparator registry pins source, claim owner, revision, evidence class, benchmark commit, checkpoint/data/runner digests and snapshot date. A stale registry blocks promotion. `CLAIM` never enters a numerical ranking; `AUDITABLE` only says public artifacts can be inspected; only local like-for-like `REPRODUCED` runs may become numerical baselines.

The evaluator, scorecard and comparator registry still live in this repository. `CODEOWNERS` makes policy changes visible; the R2 release checklist must also confirm strict branch protection and the required Sentinel status check in live GitHub settings before deployment. These controls are not organizationally independent certification. E4 remains unavailable until an external party controls or reproduces the policy and evidence.

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
- closed thermochemical trajectory total-energy residual below `2e-3 Eref` and raw/ledger momentum residual below `1e-10`;
- each closure operator below `1e-12 Eref` and cumulative absolute closure below `1e-10 Eref`;
- three two-dimensional Fourier modes show observed order at least `1.8`, finest-grid error below `5e-4`, and grid-invariant total heat capacity;
- eight preregistered seeds run 5,000 steps with p95 energy residual at most `3e-4`, maximum at most `5e-4`, deterministic checkpoint continuation and minimum coupling coverage `90%`;
- serialized world and every applied action validate against the executable 0.3 schemas;
- the atomistic manifest locks two checkpoint hashes, Random-TP bytes and a fail-closed isolated-runner protocol without claiming local reproduction;
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
