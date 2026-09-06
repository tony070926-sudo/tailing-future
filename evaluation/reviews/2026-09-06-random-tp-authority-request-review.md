# Random-TP exact-scope authority request v0.1 — independent review

Review date: 2026-09-06

Implementation disposition: **LIMITED GO for the exact, default-deny
H-AUTHORITY-REQUEST/0.1 request artifact, deterministic projection and
evaluator hardening reviewed here**

External contact, authority attribution, rights clearance, workflow
registration or dispatch, MatterSim/MACE execution, publication,
redistribution, frontend ingestion, score promotion, scientific reproduction,
SOTA ranking, leakage certification, causal claims and industrial use:
**NO-GO**

This milestone prepares a machine-readable, safe-to-publish request for one
exact private-compute scope. It is not authorization. No route was contacted,
no issue was created, no response was received, and no model or dataset bytes
were downloaded or executed. The existing three rights decisions remain
`false + abstain`; the 693-by-2 campaign remains **NOT RUN**; Tailing
Sentinel remains `CONDITIONAL`, 41/100, with zero hard-gate failures.

## Frozen bounded hypothesis and acceptance tests

The frozen hypothesis was:

> A versioned authorization-request artifact can unambiguously ask a qualified
> authority about only the exact existing Random-TP private-execution scope,
> while remaining machine-verifiably incapable of granting permission or
> enabling execution, dispatch, publication, redistribution, frontend use,
> score promotion or scientific claims. Any parse, schema, digest, scope,
> projection, rights-binding or file-mode drift must fail closed without
> increasing the evidence score.

Acceptance required:

- one strict JSON Schema 2020-12 request and one deterministic Markdown
  projection, both carrying an explicit `NOT AUTHORIZATION` boundary;
- exact binding to private scope digest
  `sha256:c73cbb22ae3f7c57579d55c1242f6a0434eb79fb0489cd8799fceff67b8e3c91`,
  the byte-frozen 693-frame Random-TP benchmark, two fixed checkpoints, two
  dependency closures, the common CPU runtime and the exact 4,044-request
  maximum budget;
- explicit units, dimensions and bases for all counts and checkpoint sizes,
  including `1386 + 1386 + 80 + 712 + 480 = 4044` prediction requests;
- a request for only the private-execution decision, with aggregate
  publication and runtime/checkpoint redistribution neither requested nor
  inferable from it;
- exact raw and semantic binding to the current rights disposition and exact
  raw binding plus strict validation of its declared schema;
- routing candidates recorded only as unverified routes, never as authority
  evidence, with `contactAttempted:false` and `responseReceived:false`;
- a future response remaining unusable without a separate versioned migration
  that verifies the principal, mandate chain, exact scope, stable document
  digest, signature, issue/expiry times, trust and implementation
  independence;
- malformed roots, malformed nested objects, widened/substituted scope,
  authorization injection, schema drift, digest drift, non-0644 modes,
  symbolic paths and inconsistent public projection to fail closed;
- direct request validation inside the frozen Sentinel source snapshot and a
  real-evaluator mode-only mutation with exact gate, score and public-summary
  assertions; and
- no change to `tf.world/0.3`, `tf.action/0.3`, `tf.observation/0.3`, the
  locked scorecard, frontend behavior, model results or scientific values.

The Builder stage implemented and self-checked the first candidate but was
not permitted to approve it. The main agent owned every repair after review.
Review does not substitute for authenticated authorization, legal advice,
executable validation, an independent solver, experiment or qualified
engineering approval.

## Baseline and lifecycle state

- Isolated worktree:
  `/Users/tonywilliam/Documents/ChatGPT/Tailing Future-v05-authority-request`.
- Branch: `codex/v05-random-tp-authority-request`.
- Base, local `HEAD`, fetched `origin/main` and GitHub main on 2026-09-06:
  `f80ec0375c1245f193f250a07982489acee5a5b6`.
- That exact main SHA's first Tailing Sentinel run `33978741171` completed
  successfully. The later reporter run `33981340576` was skipped and is not
  substituted for the successful Sentinel run.
- The canonical site returned HTTP 200 with title
  `Tailing Future — 材料世界模型实验室`. This is prior-main deployment
  evidence, not deployment evidence for this candidate.
- The unrelated dirty primary worktree was not edited.
- Local implementation and independent review are complete for the frozen
  source candidate below. Commit, push, PR, candidate CI, merge, first merged-
  main CI, release artifact, Cloudflare deployment and post-deploy smoke are
  distinct later lifecycle states. None is implied by this artifact.

## Candidate evolution and retained failures

The first formal review freeze was:

- base `f80ec0375c1245f193f250a07982489acee5a5b6`;
- staged tree `0dc53ea8d9026c7ad93cb1c5c20d14afe7e7db33`;
- cached binary patch SHA-256
  `24b181b4363b2543cd1503c6caad7212e72ff1ca49b3885845f8f627279bd0e6`;
  and
- focused request tests, lint, typecheck, atomistic validation and baseline
  Sentinel passed before independent review.

Independent software review correctly rejected that freeze. It recorded
three P1 findings: falsy JSON roots could return `valid:true`; the declared
rights schema was not read or validated; and exact mode checks masked special
bits while the evaluator override could omit mode metadata. It also recorded
two P2 findings: some malformed-object paths threw instead of returning a
stable denial envelope, and the authorization-mutation assertion did not
prove the exact gate set. Independent SOTA review recorded one P2: the fixed
MatterSim README contact URL used the wrong anchor. The initial candidate was
therefore **NO-GO**.

Retained test failures are not counted as passes:

| Observation | Disposition |
| --- | --- |
| The first complete JS-core attempt reported 12 failures: 11 runtime-freeze checks were invoked without the required absolute fixed `gh` verifier path, and one test observed a `node_modules/playwright` symlink left by a failed reviewer wrapper. | Invocation/dependency-layout failure. A clean `npm ci` restored 561 lockfile packages; all three affected files then passed 41/41 with the pinned verifier path. |
| The first reviewed request used `README.md#researchers-and-developers`. | Source-anchor defect; changed to the actual fixed-revision `README.md#researcher-and-developers` anchor and independently rechecked. |
| The first post-record exact-tree `npm test` reached the observer-snapshot suite with the JS core complete, then reported 1 failure and 1 pass. The five-source combination correctly emitted 10 fail-closed gates, while the test enumerated only 9 and omitted the new authority-request binding gate for mutated rights bytes. | Evidence-expectation defect; no authorization or execution path opened. The main agent added the exact `authority-request.binding.rights-disposition.rawDigest` denial to both the combined and rights-only expectations. The targeted real-evaluator regression then passed (1 selected, 1 filtered skip; 499.7 seconds). The original failed run remains a failure and triggered a complete gate rerun. |

The repaired, independently reviewed pre-record freeze was:

- staged tree `28e7a338ade30b28da65994397903d79ff75e06f`;
- 17 staged paths, 2,030 insertions and 37 deletions;
- cached binary patch SHA-256
  `ea144b7ace8306fc3d1522655bb5c489daa7bf28e2d748f410dfbb79adfe912a`;
  and
- `git diff --cached --check` passed.

This dated review artifact is an administrative addition after that reviewed
freeze. It intentionally records the pre-record identity. Adding this file
and regenerating the four deterministic evaluation reports changes the source
manifest, artifact digest, final tree and final patch identity. Those final
identities and post-record gates must be recorded in the PR/CI evidence; they
must not be represented as reviewer approval of different implementation
bytes.

The post-record regression-repair freeze, before this review record was
updated again, was:

- staged tree `167000a09926341f4202c2be6ef3a4f708ed2608`;
- 18 staged paths, 2,313 insertions and 37 deletions;
- cached binary patch SHA-256
  `466b516429ba2b1aabb3c887e6d87bdee24dfa175af871ee144dee8231655101`;
  and
- `git diff --cached --check` plus the targeted real-evaluator regression
  passed.

The independent software closure review reproduced that freeze exactly and
returned GO for the two-line expectation repair with P0/P1/P2 all zero. It
confirmed that both additions preserve exact-array equality, rejection,
score/dimension invariants and single-source manifest-difference assertions;
the review is closure for that repair only, not promotion authorization. Its
independent behavioral rerun passed one selected test with one intentional
filter skip in 496.7 seconds. Because the dated record itself had already been
updated in the working tree, that rerun is recorded as behavioral evidence,
not as a byte-for-byte execution of the earlier frozen tree.

## Implemented evidence contract

- The checked-in JSON request is strict, versioned and bound to the existing
  rights artifact, its schema, the exact private scope and all model/runtime
  identities. Its raw, semantic and deterministic Markdown digests are:
  `sha256:e3d8d7cca9b83c2ff10d85c0411e88f2b98628cf41113ead86e0b2fdcda91049`,
  `sha256:8a3d60d59db5773945698759075176c48a92789450cbdba5c54ad26b32ca3ea5`
  and
  `sha256:f4f534ee5af4953ab413231deab8419c56e7aa995656bd0596c20894ca3e1078`.
- Its standalone schema raw digest is
  `sha256:4330cf199dd2c3e56066ea80932add207aab6ef3abc578f415a9a4f910ec36e5`.
- The parser now distinguishes parse success from JSON truthiness. Every
  non-object or structurally malformed value produces a stable invalid,
  all-effects-false envelope.
- Request validation performs bounded canonical reads, duplicate-member
  rejection, raw and semantic digest checks, strict AJV validation of both
  the request and the bound rights disposition, deterministic Markdown
  comparison, and a final file-identity audit.
- The internal evaluator snapshot control advanced to
  `tf.evaluator-snapshot/0.2`. It captures the complete four-octal permission
  bits for the full source set, validates an exact path set and value range,
  and includes mode metadata in the evaluator artifact commitment.
- The worker pre-gates exact mode `0644` for the request JSON, request schema,
  Markdown projection, rights JSON and rights schema before constructing
  policy overrides. Unsafe modes produce stable path-specific hard gates.
- The existing rights-policy exact-mode check also now rejects special-bit
  additions instead of masking them away.
- No frontend file, frozen state/action/observation schema, scorecard,
  checkpoint, runtime lock or existing numerical result was changed.

## Executable evidence before this review record

All successful Node-based commands used Node.js 24.16.0 and, where required,
the absolute fixed `gh` 2.98.0 verifier path.

| Gate | Result |
| --- | --- |
| Authority, rights and source-snapshot focused tests | PASS: 37/37 |
| Evaluator launcher tests | PASS: 13/13 |
| Real evaluator authorization and mode-only regression | PASS: one selected test and one intentional skip; baseline plus two independent rejected mutations; 500.5 seconds |
| Mode-only `0755` mutation | PASS: exit 1, exact two hard gates, score 41 and dimensions unchanged, public summaries consistent, byte manifest unchanged and mode-bound artifact digest changed |
| Post-record rights-binding expectation regression | PASS: one selected test and one intentional filter skip; baseline plus combined five-source and independent rights-only mutations; 499.7 seconds |
| Python atomistic suites | PASS: 91 tests with 1 skip, then 42/42 and safe-zip 3/3 |
| ESLint | PASS |
| TypeScript | PASS |
| Atomistic plan and runtime lock | PASS; `693×2 — NOT RUN`; `RIGHTS 3/3 ABSTAIN`; authority request valid but not authorization; dispatch blocked; runtime remains non-reproduced |
| Pre-record local Sentinel | `CONDITIONAL`; 41/100; `hardGateFailures=[]`; 423 source files; artifact `sha256:f2673b4ef3b5c1d748c964b5846d1d46e471b533f1c87d8b3e97e307589d3962` |

The 41/100 score is a dimensionless validation-maturity score, not scientific
truth, percent of SOTA or model accuracy. No energy, force, stress,
throughput, memory, uncertainty or cross-scale quantity was produced by this
milestone. The routing sources and request are `reference` or `auditable`;
none is `reproduced`.

## Independent reviewers

- Mechanism/scientific validity: Anscombe,
  `/root/scientific_reviewer`.
- Software, numerical, schema and evaluator integrity: Copernicus,
  `/root/software_reviewer`.
- Dated primary-source/SOTA comparison and at most three next gaps: Linnaeus,
  `/root/sota_gap_reviewer`.

All reviewers were read-only on each candidate they assessed. On the repaired
freeze `28e7a338…` / `ea144b7a…`:

- scientific review returned `P0=0`, `P1=0`, `P2=0`, LIMITED GO only for the
  routing-only evidence artifact and evaluator hardening;
- software/evaluator closure returned `P0=0`, `P1=0`, `P2=0`, after
  independently checking all five prior findings and recomputing the
  423-file manifest plus mode-bound artifact digest; and
- SOTA/source closure returned `P0=0`, `P1=0`, `P2=0` after verifying the
  corrected official fixed-revision README anchor.

The software reviewer could not independently rerun the runtime-freeze gate
because its environment lacked the required absolute verifier path. That gate
was run by the main agent with the pinned path; the reviewer explicitly
treated that as supplied evidence rather than an independent reproduction.

## Findings and dispositions

### P0

No P0 finding was recorded.

### P1 — all closed

1. **Falsy or non-object JSON roots could fail open.** Closed with a separate
   parse-success state and uniform denial envelopes for `null`, `false`, `0`,
   empty string, arrays and malformed objects.
2. **The declared rights schema was not actually bound.** Closed with bounded
   read, exact raw digest, duplicate-member rejection and strict AJV
   validation, including a schema-override negative test.
3. **File-mode metadata could fail open or disappear at the evaluator
   boundary.** Closed by preserving `mode & 07777`, requiring complete v0.2
   mode metadata, committing it into the artifact digest, and exact-0644
   pre-gates plus a real evaluator mutation.

### P2 — all closed

- Malformed Markdown-projection, semantic-validation and checked-in read paths
  now return invalid denial envelopes instead of throwing.
- Mutation tests assert exact hard-gate sets and counts, unchanged score and
  dimensions, and consistent public projections.
- The post-record integration regression now enumerates the authority
  request's independent raw binding to mutated rights-disposition bytes in
  both the combined and rights-only real-evaluator paths.
- The MatterSim project-contact source now uses the correct fixed-revision
  `README.md#researcher-and-developers` anchor. The contact remains an
  unverified routing candidate, not authority evidence.

## Residual limitations and claim boundary

1. There is no authorization record, verified rightsholder, verified delegate
   mandate, trusted signature or scope-matched decision. The request cannot
   change any right from `false + abstain`.
2. No external contact was authorized or performed. The official README
   email, issue tracker and corporate permissions page are possible routes
   only; their existence says nothing about dataset-specific permission.
3. MatterSim/MACE 693-by-2 inference, independent baseline comparison and the
   frontend foundation-model bridge remain not run. There is no reproduced
   model result, SOTA claim, data-leakage certification or quantitative
   intervention/counterfactual answer.
4. Public reports do not expose the complete mode manifest needed for an
   offline third party to recompute the new mode-bound artifact commitment.
   The local evaluator contract is closed; explicit public mode-manifest
   publication would require a future versioned evidence change.

The R2 reduced-unit Lennard-Jones/heat/A-to-B world remains a synthetic
verification world, not a real material, chemical mechanism, reactor or
process model. No taxonomy, descriptor, mechanism path or routing record is a
causal-effect claim. No output from this milestone is suitable for PLC, DCS,
SIS or other safety-critical control.

## Next-round tasks — at most three

1. With explicit user authorization for outbound contact, obtain and
   independently verify a signed, exact-scope, dataset-specific authority
   decision and provenance chain; otherwise retain the current default-deny
   state without contact or execution.
2. Only after a valid versioned authority migration clears the exact private
   scope, run the locked MatterSim/MACE 693-by-2 CPU campaign and compare
   energy, force, stress, determinism, uncertainty and resource evidence
   like-for-like against the frozen classical baseline. If authority remains
   absent, this task remains blocked rather than simulated by manifests.
3. After that foundation bridge is genuinely reproduced and integrated,
   proceed in order to NIST PFHub Benchmark 3 phase-field/thermal coupling and
   then Cantera 3.2 CSTR, each with its own bounded hypothesis, conservation
   gates and independent review.
