# v0.4.11 NaCl–Water Semantic Import Release Review

Date: 2026-09-02

## Decision

PASS for entry into the full local and protected-main release gates. This
review is read-only, agent-level separation from implementation; it is not an
organizationally independent certification, a scientific reproduction receipt
or deployment provenance.

The score remains 41/100 and R2 remains the conditional champion. v0.4.11 adds
an auditable cross-language semantic handoff only. It does not import OpenMM,
compile a system, create a context, invoke a solver, minimize, equilibrate or
produce a trajectory. It does not establish interface physics, MatterSim/MACE
accuracy, SOTA superiority, industrial prediction, promotion or public-release
eligibility.

## Independent assessments

Separate read-only reviewers covered three roles:

- the Scientific Evaluator found the contract, schema, scorecard, importer,
  verifier and public documentation consistent with a static geometric and
  semantic-transport claim, with every solver and scientific claim false;
- the SOTA Scout compared the candidate boundary with the pinned comparator
  snapshot, reproduced focused tests and found no remaining P0/P1 source-level
  blocker after remediation; and
- the Gap Planner checked governance, source scope, CODEOWNERS and CI policy,
  and approved entry into full gates without changing the locked scorecard.

None of these reviewers implemented the reviewed remediation.

## Findings closed before release gates

1. Failure cleanup no longer recursively removes a path by name. Files and
   directories are created and cleaned through held directory descriptors, and
   removal is limited to the exact inodes created by the importer. Replacement
   directories and their contents are preserved.
2. The importer checks the exact root, array and manifest inventories after the
   receipt is written and again immediately before success. A root-level extra
   entry prevents a success receipt from surviving cleanup.
3. The Node verifier retains metadata snapshots for the plan, receipt, schema,
   importer source and all ten normalized artifacts. It rechecks file identity,
   mode and link count, then directory identity and closed inventory, before
   returning `verified-pass`.
4. The importer source digest is captured from a bounded, stable, single-link
   source inode during module initialization and independently checked by Node.
5. The receipt schema pins exact plan bytes, canonical digest, six chained
   digests, ten artifact sizes and hashes, semantic root, four unsatisfied gates,
   source-evidence boundary, seven false execution fields and eight false claim
   fields.
6. The Sentinel workflow now pins Ubuntu 24.04, Node 24.16.0 and Python 3.12.11.
   Its complete reviewed byte digest plus every gate command, timeout, build SHA
   binding and status propagation are checked by mutation tests.

Focused final checks observed by the reviewers passed: 56 JavaScript tests
(19 v0.4.11 plus 37 workflow-policy tests), 11 Python importer tests, targeted
ESLint and `git diff --check`.

## Remaining boundaries

- The four solver-admission receipts remain absent, so this bundle cannot be
  interpreted as a physically equilibrated NaCl–water interface.
- Source metadata is pinned, but upstream source-byte authenticity,
  redistribution clearance and potential-domain qualification remain false.
- The full 693-by-two MatterSim/MACE benchmark is still not run; PFHub Benchmark
  3 and the Cantera 3.2 CSTR remain future milestones.
- GitHub CODEOWNERS provides routing and visibility but protected `main` does
  not enforce two-person or code-owner approval. The release guard instead
  requires the existing strict `evaluate` check, administrator enforcement,
  linear history and disabled force-push/deletion. No organizationally
  independent review claim is made.
- The source digest binds a stable disk source snapshot, not remotely attested
  CPython bytecode. Cross-platform acceptance still requires the exact commit's
  pinned Ubuntu CI run.

Promotion and Cloudflare deployment remain blocked until the current source
tree passes the full local gates and the exact merged `main` commit produces the
required successful Sentinel artifact.
