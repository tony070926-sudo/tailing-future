# Registration compare nullable-head compatibility review

Date: 2026-09-03

Disposition: **LIMITED GO for the bounded registration-only compatibility
fix to proceed through final evaluator, validation and pull-request gates**.

Producer configuration, dispatch, scientific promotion, release and deployment
disposition: **NO-GO**.

No P0 or P1 finding is open. One software-review P2 requested direct negative
coverage for an invalid comparison tail when GitHub omits `head_commit`; the
main agent added the null and missing cases, and the same reviewer verified the
finding closed. This record is source-scoped evaluator input, so it does not
claim its own digest. Adding or editing it requires regenerated evaluator
projections, all applicable gates and final read-only review of the resulting
exact tree.

## Frozen hypothesis and acceptance tests

The bounded hypothesis is that GitHub's compare response may omit or null an
undocumented `head_commit` member even when the documented comparison fields
establish a non-divergent ancestry from the frozen registration commit to the
separately fetched current protected `main` revision.

For an `ahead` comparison, the policy may therefore accept `head_commit` only
when it is null or absent, or when its present SHA exactly equals current main.
It must still require all of the following:

- the fixed authenticated GET endpoint
  `compare/3221265a4145626dd9e32876fa911f23ae49fbff...main`;
- base commit and merge base equal the frozen registration revision;
- `behind_by === 0`, `status === "ahead"`, nonnegative `ahead_by`, and
  `total_commits === ahead_by === commits.length`;
- the final ordered comparison commit equals the separately fetched current
  protected-main revision;
- the separately fetched current tree matches that revision's tree and still
  contains the frozen workflow blob; and
- two complete snapshots remain identical and schema-valid.

Acceptance requires direct tests for null and missing success, mismatching
present-head rejection, wrong-tail rejection under both null and missing head,
and preservation of every existing transport, identity, pagination,
protection, Sentinel, scientific-abstention and CI-isolation negative. It also
requires a successful live two-pass observer, complete repository gates and
three independent read-only reviews.

## Baseline, implementation freeze and observed defect

Work was isolated in
`/Users/tonywilliam/Documents/ChatGPT/Tailing Future-v05-compare` on branch
`codex/v05-registration-compare-null-head`. The unrelated dirty original
worktree was not used for implementation.

The base and observed GitHub main were
`4599bb92e47e4de0c339f095b4874384939030d4`, with tree
`69500d95bec19c3a7ac296ff3bf5b3f478efd1f3`. That revision is the squash merge
of pull request 27. Its first-main `Tailing Sentinel` run `33781400041`, attempt
1, job `100735675538`, completed successfully. The independently downloaded
artifact `9904486850` had 2,827,508 bytes and ZIP digest
`sha256:a0b65207d8332ed36807f7968197aaf75add8bf75922d715eb23b7d62080f54a`.
Safe extraction and the repository validator passed for 67 manifest files,
5,673,456 bytes, content root
`sha256:6c70abeef378c4e3cf7116240e23d6cca74940291bbf32e14edb856b91abbd3d`
and source report digest
`sha256:c4a94578d246bee45b2777dfc3533cb36dc7fcb22d4c09302565e19be0aab671`.
That report remained `CONDITIONAL` 41/100 with no hard-gate failure and did not
contain a MatterSim or MACE result.

The merged observer initially returned a schema-valid fail-closed rejection,
`registration-main-ancestry-invalid`. A direct API read showed:

- `status: ahead`;
- base and merge base `3221265a4145626dd9e32876fa911f23ae49fbff`;
- `behind_by: 0`, `ahead_by: 1`, `total_commits: 1`;
- sole and final commit
  `4599bb92e47e4de0c339f095b4874384939030d4`; and
- `head_commit` absent/null.

The Builder changed one predicate and added direct tests. The Builder could not
approve the candidate. The post-P2 implementation-only freeze relative to the
base was:

- staged tree `0b2fca347718596191b5558389d8623b1eef32f3`;
- cached binary diff SHA-256
  `a6ef1f27ef43fda1ec97b3f5b86f70a452a44599a0a7ffe0d9c70069b82599aa`;
- two paths, 54 insertions and one deletion;
- zero unstaged and zero untracked paths; and
- clean cached diff check.

The focused test file passed 43/43 for the Builder freeze and 45/45 after the
main agent added the two wrong-tail negatives. A first live attempt from the
fixed source failed closed on a transient fixed `repositoryRuns` GET. After
the endpoint was independently reachable, a new complete run from
2026-09-03T17:29:04.725Z through 2026-09-03T17:29:16.375Z passed the strict
schema and reported:

- current main/tree exactly equal the base identities above;
- registration relationship `ahead` and registered workflow `349363715`
  active;
- 199 currently visible repository runs and zero target-workflow runs or
  repository target-path matches;
- seven workflows with one target-workflow match;
- pages including explicit terminators: repository runs 3, target runs 1,
  workflows 2 and Sentinel jobs 2; and
- two stable passes with snapshot digest
  `sha256:e54617b2d8fd4f6aac19e90dfaf9bc828c734d0c2dacaa479a1632ed8d044361`.

The transient rejection is not counted as a passing observation. The later
success is current visible control-plane evidence only; it is not proof that a
run was never created or deleted.

## Independent reviewers and findings

- Mechanism/scientific validity:
  `/root/compare_null_head_science_review`.
- Software, schema and evaluator integrity:
  `/root/software_runtime_review`.
- Dated primary-source/SOTA boundary and next gaps:
  `/root/sota_scout_round2`.

All reviewers were read-only on the source they assessed. The initial
implementation freeze received no P0/P1 finding. The scientific and SOTA
reviews recorded no P2. The software review's one P2 requested wrong-tail
negative tests under both permitted absent-head forms; the main agent added
them and the reviewer independently verified 45/45 and closed the finding.

Final acceptance still requires all three relevant reviewers to confirm that
the post-record tree contains only this record, regenerated evaluator
projections and the reviewed compatibility fix, with no new open P0/P1.

## Dated primary-source boundary

| Official source | Evidence class | Version/access basis | Digest |
| --- | --- | --- | --- |
| [Compare two commits](https://docs.github.com/en/rest/commits/commits?apiVersion=2022-11-28#compare-two-commits) | `reference` | REST API `2022-11-28`; accessed 2026-09-03 | `null` for live documentation |
| [GitHub REST OpenAPI description](https://github.com/github/rest-api-description/blob/9afcff5e82ad046d20ce1f292ed2e5ed9d643f10/descriptions/api.github.com/api.github.com.json) | `auditable` | pinned revision `9afcff5e82ad046d20ce1f292ed2e5ed9d643f10` | file SHA-256 `a00e97b728e9f3c4ad45170cd07b5d104810db303c15a67a4fb08e45f8e2d538` |

The official documentation says unpaginated comparison commits are ordered
chronologically and the final item is the most recent commit in the complete
comparison. The pinned official `commit-comparison` schema neither defines nor
requires `head_commit`. These references support API compatibility only; they
are not scientific results and do not enter a numerical ranking.

## Scientific boundary and residual limitations

This change introduces no energy, force, stress, uncertainty, throughput,
memory, material property, mechanism, causal effect, counterfactual or
industrial recommendation. Counts are dimensionless item counts, sizes are
bytes, digests are integrity identifiers and timestamps are local UTC process
time. None is a physical quantity.

All six scientific and promotion claims remain fixed false. MatterSim, MACE
and comparison remain null with status `unavailable`; the 693-by-2 inference
matrix remains **NOT RUN**. Producer configuration, dispatch eligibility,
structure and redistribution rights, private handoff, actual runner and actual
toolchain remain false or unverified. `tf.world/0.3`, `tf.action/0.3` and
`tf.observation/0.3` are unchanged. This administrative fix does not narrow
the scientific gap to AIDO-style multimodal/multiscale state, PFHub Benchmark
3, Cantera 3.2 CSTR or electronic-structure prediction.

Current GitHub listings are mutable and do not provide an externally anchored
append-only history. Current classic branch protection does not fully observe
rulesets or bypass actors. An unpaginated comparison larger than GitHub's
documented complete-response range remains fail-closed through the exact count
check. The first-main job also emitted a nonblocking warning that pinned action
revisions declaring a Node 20 runtime are being forced onto Node 24 by GitHub;
compatible official revisions should be evaluated separately rather than
silently changed here.

## Lifecycle state at record creation

- Local focused validation: complete for the implementation-only freeze.
- Full post-record lint, type, numerical, schema, evaluator, build, dependency,
  source-manifest and artifact gates: not yet run.
- Commit, push, pull request and candidate CI: not performed for this hotfix.
- Protected-main merge and first-main CI: not performed for this hotfix.
- Release and Cloudflare deployment: not authorized and not performed.
- Canonical site: prior deployment only; HTTP/title availability does not bind
  it to this candidate.

## Next-round tasks

At most three bounded tasks remain:

1. Add externally anchored append-only run/artifact evidence and trusted time,
   or continue abstaining from historical non-deletion and full ruleset/bypass
   claims.
2. Verify structure/redistribution rights, private handoff, executable-producer
   identity and the actual runner/toolchain bytes before any dispatch.
3. Only after those gates close, execute the fixed official MatterSim and MACE
   checkpoints over the complete locked 693-by-2 benchmark and record energy,
   force, stress, error, resource and uncertainty evidence without a SOTA or
   data-leakage claim.
