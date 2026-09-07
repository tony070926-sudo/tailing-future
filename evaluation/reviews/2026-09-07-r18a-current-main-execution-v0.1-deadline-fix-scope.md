# R18a current-root deadline closure — frozen root fix

Frozen by root on 2026-09-07 after independent review of candidate
`dda56144e54c6e05e31878e8851103a311430522d31fede2a823933c7e7c445b`.
The initial manifest, Builder gates, science/SOTA reviews and original-source
evidence remain preserved. Root owns these fixes; Builder does not approve.

## Bounded hypothesis

The current-root wrapper can reject incomplete execution within an explicit
scientific acceptance budget using a monotonic clock and an independent,
bounded child-process stopping deadline, while all unchanged R18a numerical
tests and both exact formal receipts remain identical. The historical replay
uses the same bounded process primitive with its separate 120000 ms allowance.
Neither change extends the physical domain or establishes full convergence.

## Findings to close

- P1: synchronous child timeout can wait after SIGTERM; the post-return group
  kill cannot enforce the deadline. Final source/bootstrap verification also
  lacked an aggregate-budget check before success. An exact-block synthetic
  probe with a 100 ms allowance took 1324 ms for a finite SIGTERM handler.
  A separate pipe-holder probe returned in 101 ms and did not reproduce that
  branch. Preserve both observations and the probe's INCONCLUSIVE top-level
  combined predicate honestly.
- P2: historical replay has the same synchronous lifecycle limitation under
  its independent 120000 ms timeout. Close it by sharing the bounded primitive;
  do not characterize this as a failure of the scientific 600000 ms contract.

## Exact changes and acceptance

Modify only the new current-root runner and its focused test, the v0.2 admission
checker/test/ledger/schema necessary to bind those changes, and additive dated
review controls. Preserve all twelve scientific imports, all three existing
configuration reconciliations, the other 446 main files, and the eleven frozen
admission-v0.1 files. Do not touch the original worktree, R12 or frontend.

Use asynchronous direct spawning (no shell). Record partial output, output
limits, child exit, pipe closure, termination failures and observed original
process-group status. Never claim escaped-descendant or OS/hardware isolation.
Output overflow, timeout, termination failure, incomplete cleanup or missing
completion evidence cannot produce success. After a stop request use a declared
1000 ms maximum cleanup grace independent of pipe close; this grace is not extra
scientific acceptance time. Keep the scientific allowance at 600000 ms, check
its monotonic deadline across preparation, commands and final verification,
and check again immediately before accepting success. The historical replay
has its own unchanged 120000 ms allowance and the same disclosed stop grace.

Execute focused regressions for normal completion, finite SIGTERM handling,
finite pipe holding, simulated termination failure, output overflow, cumulative
budget exhaustion, and the actual final-verification code block exceeding the
deadline. Fault fixtures must be finite and cleaned up; ordinary Linux contract
tests must not require a Darwin numerical runtime or count as numerical runs.
Retain actual mandatory historical twenty-test execution, Node29, Python21,
strict schema/semantic gates, syntax/lint/type checks and two E2E receipts each
248778 bytes / d91e31d261bf77f99b17e810f5f51aab131dd5339e281839933e45fa79855e5c.

Keep the initial manifest and Builder gates unchanged. Freeze additive
`successor-v2-manifest.json` and `successor-v2-builder-gates.json` under this
review prefix, with exact paths bound by the versioned admission ledger. Keep
initial review conclusions explicitly scoped to the initial candidate; ask the
same reviewers to verify closure and scientific/source invariance on the new
identity. Only then run all applicable final repository gates in the verified
disposable snapshot. No commit, push, deployment, score increase or Goal
completion follows from this fix alone. Continue directly toward separately
frozen R18b t=8 convergence after R18a closure.
