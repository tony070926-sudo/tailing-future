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

GitHub Actions runs installation, lint, deterministic solver tests, manifest validation, production build, dependency audit and Sentinel aggregation for every push and pull request. Each upstream step reports its outcome even after another step fails. Before aggregation, the workflow removes the checked-in report; an aggregation failure therefore fails CI and cannot reuse a stale PASS. A pull-request comment is published only when the separate reporter can authenticate and validate the fresh bounded report artifact. Sentinel uses a two-stage evaluator: a built-in-only launcher captures the exact Git-tracked plus non-ignored source set into a private, regular-file-only tree, then a fresh worker loads every project module, plan, schema, ID manifest and comparator receipt from those frozen bytes. The same snapshot supplies policy inputs, evidence digests and the per-file source manifest. The launcher recaptures the active tree after the long physics run and publishes each worker report through an atomic rename only if every path, mode, length and digest still matches; symlinked or multiply linked source is rejected. In CI it also checks the source path set, raw blob bytes and executable mode against the exact `GITHUB_SHA` tree both before capture and before publication. Drift cannot turn mixed-version execution into a passing or commit-bound report. It records the CI commit, rebuilds the frontend, then uploads the JSON and Markdown evidence artifacts. Cloudflare release fetches remote `main`, requires its strict Sentinel check, downloads that exact CI report, compares the source manifest with the clean local checkout and rechecks remote `main` before deploy. Source manifests, report shape, discrete counts, score, verdict and gap text remain byte-exact, while local and CI gate maps must each match their exact expected status set. Only explicitly whitelisted continuous `verification.physics` scalars may differ across macOS and Linux by `max(1e-12, 0.2% of magnitude)`, and deployment remains blocked outside that IEEE-754 portability budget.

The pull-request evaluator itself is read-only and can only upload a bounded
report artifact. A separate default-branch `workflow_run` reporter owns the
comment permission. Before reading or commenting it pins the source workflow
ID, repository ID, event, run ID/attempt, head SHA, pull-request identity and
artifact name; it never checks out or executes candidate code, and sanitizes
mention syntax. This keeps a candidate-authored workflow diff from acquiring
the writer token merely by changing its own job definition.

The built-in-only launcher, the frozen worker plus its evaluator, policy and
scientific module graph, and the workspace `node_modules` dependency tree form
an explicit repository-controlled trusted computing base. The launcher's
envelope checks bind publication to the frozen bytes and worker exit status;
they do not independently recompute the scientific verdict or make a malicious
worker trustworthy. CI requires its fresh install gate, captures
`package-lock.json`, and the launcher removes `NODE_OPTIONS` and `NODE_PATH`
before starting the worker. This repository-owned trust boundary cannot support
an E4 claim or independent certification.

The manifest boundary is explicit: project files may live only at the repository
root or under `.github`, `.openai`, `app`, `atomistic`, `docs`, `evaluation`,
`lib`, `public`, `schemas` and `scripts`. A regular tracked or non-ignored file
outside those roots makes the launcher fail, so a new `components`, `src` or
other build-input root must first be registered and reviewed. Git's safe
trailing-slash marker for a separate untracked repository is ignored only when
it is outside every declared source root; a nested repository inside a source
root fails closed.

The comparator registry pins source, claim owner, revision, evidence class, benchmark commit, checkpoint/data/runner digests and snapshot date. A stale registry blocks promotion. `CLAIM` never enters a numerical ranking; `AUDITABLE` only says public artifacts can be inspected; only local like-for-like `REPRODUCED` runs may become numerical baselines.

Scientific preregistration and execution discovery use separate trust roots.
The atomistic plan stays byte-frozen before execution; post-plan runner, lock
and runtime-input identities live in a separate runtime lock that is excluded
from the model image. A discovery lock is never promotion evidence, and the R6a
schema accepts discovery state only. A later lock can become frozen only after
at least two independent protected-main replicas agree on the canonical
runtime-input manifests and a separately controlled verifier authenticates the
workflow path, repository revision, run conclusion, artifact IDs and archive
digests through GitHub rather than trusting self-reported JSON. Run-specific Docker config/image IDs
remain observations unless a separately controlled reproducible OCI export
proves an identical manifest digest. Sentinel rejects any digest dependency
cycle that feeds a plan or runtime-lock output back into the runner bytes it
claims to identify.

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
