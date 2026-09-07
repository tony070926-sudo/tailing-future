# Backend migration admission v0.1 — frozen scope

Date: 2026-09-07. Owner: root. Builder: Astra. This is release preparation,
not a release authorization or a scientific capability promotion.

## Authorization and preservation

The user authorized a release excluding R12 uncleared transcription while
retaining original local work and evidence. The legacy working tree remains
untouched. The integration worktree starts from origin/main at
`307e6d723086fe41b6d89e9f9b4b532364ccaeff`; legacy HEAD is
`643b8b15f1a796c0ca4c34657d4b5edc68389354` with uncommitted scientific work.
Latest-main frontend and backend work must not be overwritten by legacy files.

## One bounded hypothesis

A byte-bound, complete migration inventory can distinguish exclusion,
preservation, conflict and pending work without promoting pending scientific
capabilities, treating excluded R12 as licensed, or transferring an older
review approval to a different integrated source tree. This is a provenance
and scientific-claim integrity hypothesis, not a physical model hypothesis.

## Candidate paths

- `schemas/backend-migration-admission-v0.1.schema.json`
- `evaluation/backend-migration/r18a-origin-main-admission-v0.1.json`
- `scripts/backend-migration/verify-r18a-origin-main-admission.mjs`
- `scripts/backend-migration/verify-r18a-origin-main-admission.test.mjs`

The scope, frozen identities, executable gate evidence and independent reviews
are additive artifacts under `evaluation/reviews/`. No package, frontend,
legacy source, historical receipt, release pipeline or evaluator changes are
authorized in this iteration. No scientific implementation is imported yet.

## Acceptance tests fixed before implementation

1. Cover the exact union of legacy 641 and main 449 inventoried paths: 939
   unique sorted entries, including 106 identical, 45 conflicting, 481 pending
   legacy-only, nine R12-excluded and 298 main-only entries. Bind both complete
   inventories by mode, byte size and SHA-256. Observed count differences must
   fail, not silently change these expectations.
2. Verify all preserved main files against their inventory identities. Verify
   pending and excluded legacy-only paths are absent. Do not depend on the
   legacy machine's absolute path when subsequently verifying the ledger.
3. Exclusion remains `rightsStatus: unresolved`, `payloadPresent: false` and
   does not turn the historical R12 redistribution failure into a pass.
   Pending, conflicting and historical-only work cannot count as admitted.
   Overall release eligibility remains false in this preparation-only version.
4. Reject missing or duplicate paths, changed identities/modes, unknown
   dispositions, forged completeness, R12 inclusion, renamed identical excluded
   payload, pending-to-admitted and excluded-to-licensed mutations. Detect
   unaccounted source additions rather than treating them as implicitly safe.
   Test fixtures must use synthetic payloads, not reproduce R12 transcription.
5. Preserve `tf.world/0.3`, `tf.action/0.3`, `tf.observation/0.3`, latest-main
   frontend and scientific code byte-identically. No numerical/evidence score,
   causal-effect or industrial authority claim is added.
6. Record the R18a legacy `.gitignore` candidate-set conflict explicitly. The
   original 17-file identity remains historical; this ledger is a new
   integration identity, not a reproduction of that candidate at the new root.
7. Native syntax, schema validation, checker mutations and actual-tree
   verification must pass. Rerun lint, typecheck and production build/isolation.
   Existing release/evaluator tests remain applicable; missing full integration
   and runtime successors are explicit release blockers, never hidden skips.

## Review and stop conditions

Freeze the exact candidate path identities and test evidence before independent
read-only science, software/evaluator and dated SOTA reviews. Builder cannot
approve. Root owns review fixes; relevant reviewer verifies P0/P1 closure.
Any unresolved relevant P0/P1 or incomplete required release gate prohibits
commit, push, deployment and engineering recommendation. A passing admission
checker establishes only inventory integrity, not scientific validation,
licensing, full migration completion or deployment readiness.

## Next bounded rounds, not included here

1. Merge and test the non-R12 causal/thermochemistry/equilibrium/gas-state
   capability planes against latest main with versioned report compatibility.
2. Preserve mesoscale history and add explicit portable runtime successors for
   R16d-b/R17b; correct R18 test dispatch without editing frozen historical tests.
3. Integrate a tested R12-excluded release profile, source/production exclusion
   evidence and complete source notices; then run independent full-release gates.
