# H-R18A-WRANGLER-ADMISSION/0.4 — frozen implementation plan

2026-09-07. Builder `/root/astra_release`; independent approval PENDING.
Source admission, report consistency, numerical execution, review, CI and
deployment are distinct states. This plan grants none of the latter states.

## Clean baseline, before source edits

Freshly fetched main: `84f7720e9ac14fcb50fb54fdcb96d1df7473c365`; tree
`e673c40ee6144b510223caf8cf6d6b30bc4f9eb6`. New isolated worktree
`Tailing Future-r18a-wrangler-integration-v04`, branch
`codex/r18a-wrangler-integration-v04`; clean status before and after baseline.
The original user, auth and custom-MACE worktrees remain untouched.

All 517 original files were measured by sorted path/POSIX-mode/size/SHA256;
the compact JSON record array has SHA256
`cbfb32cd44ba74f44a68a933ff49ccc0e7d32daa0dfd0675a9123a74b0844310`.
Complete records and command logs are in the external temporary directory
`/private/tmp/tf-r18a-wrangler-v04-baseline.4R1wJO/`.

Baseline 2026-09-07 17:37–17:38 UTC: Node24.16.0; independent
`npm ci --ignore-scripts` installed 561 packages/audited562, zero vulnerabilities;
Wrangler4.127.0; old /0.3 actual-tree admission exit0. Complete observed tree:
517 paths, SHA256 `dd2d72415ccf31d28bdb8fcb953c5363c4cb350c3f1f82763c1b001f2aaabfa7`;
source input:512 paths, SHA256
`084a283e76abf1a1342ea2cc9f5f5acf787595dc4dae6e22426b44bfc2bbd2d5`,
Git tree `c5d365c1b164683d76f4c8ca6ea0b4b95b9813fb`.
Targeted Vitest74/74 in67.14s, including /0.3's10/current_root_v2's5,
release-cloudflare9/artifact13/report9, derived-report24 and source-scope4.
The /0.3 tests actually executed nested /0.2(5), /0.1(20) and Git-checkoutNode29;
their raw outputs are preserved, not substituted with prior CI logs.
No scientific model or bounded Darwin numerical suite was run by this baseline.
New-main first CI34147253692 was in progress at task dispatch; old e151 candidate
CI success is not current-main evidence and is never transferred.

## Hypothesis and bounded scope (at most three tasks)

1. New /0.4 source admission, closed schema and tests, explicitly anchored to
   the exact 84f Git tree plus enumerated before/after changes. No in-place
   mutation of old /0.1,/0.2,/0.3 ledgers, schemas, checkers or tests. No automatic
   adoption of discovered source bytes and no wildcard admission.
2. New versioned `pfhub7a_r18a_current_root_v3.mjs` and tests; `package.json`
   changes only its current R18a command. Exact two-path Vitest routing changes
   move old /0.3 and current_root_v2 actual-tree tests into mandatory unchanged
   execution in an exact84f historical checkout. New /0.4 tests independently
   validate the actual successor tree; historical success cannot admit it.
3. Import exactly the four previously reviewed e151 source/document files below,
   create this plan and an ordinary source-input review record, then complete
   Builder selfchecks and freeze for independent review. Later final gates,
   regenerated four reports and main-only artifact release remain Root's duty.

No custom-MACE, frontend, dependency/lockfile, scientific equation, scorecard,
numerical tolerance, runtime identity, 600000ms physics budget or 75-minute CI
timeout changes. No commit/push/PR modification/merge/deployment by this Builder.

## Immutable source anchors

SHA256 from the complete pre-code baseline:

| Source | SHA256 |
| --- | --- |
| `scripts/source-scope.mjs` | `94ecad38f94d3081d01119cf0155e3a5d72b1ba37c037aa092ee580c8cfa7460` |
| `scripts/evaluate.mjs` | `c884a09088862afd3acccc9246af1a385a24bb6277108be8bc39ca710c63bb3c` |
| `scripts/derived-report-contract.mjs` | `a9947eb01497a2e0fd793f129fe7e9348f3c8f462f882a4e3f518fa516ec9b98` |
| old `/0.3` checker | `b1f0a52f96b48af412d04a709396f59278d72f3b3c0aeecbc26764f56e35059e` |
| old `/0.3` schema | `9efff3af296872d22f94dfbde94516b911a04518f2a1fed3b6bd3bcc745e4ac6` |
| old `/0.3` ledger | `a02ed15bacbdca32b6f390536719ed77419ece909ec7fe435105bd2e8303ec86` |
| `pfhub7a_r18a_current_root_v2.mjs` | `425b8f2602bb06e1fea0eec572f855f4b58515614702762874ef397c27357a52` |
| old exact terminal review | `17d0ba68e76fb51d6cc3683dfc8b216e21be4f5c969f5458f5a44b0b562ffc7c` |

Scientific contract base remains `307e6d723086fe41b6d89e9f9b4b532364ccaeff`.
All workers/oracle/Node29/Python21/schema/runtime-lock and historical receipt
are inherited byte-for-byte from84f; the receipt remains248778bytes SHA256
`d91e31d261bf77f99b17e810f5f51aab131dd5339e281839933e45fa79855e5c`.
Only that exact source receipt retains its old0444/0644 portability exception;
new runtime/generated outputs do not inherit it. R12 excluded paths AND renamed
excluded byte identities remain forbidden. Full source enumeration must ignore
neither nested `.gitignore` nor `.git/info/exclude`-hidden additions.

Exact reviewed import commit: `e151c27be45eca9cd149f33ec42ff888ec747621`:

| Path | Bytes | SHA256 |
| --- | --- | --- |
| `scripts/release-cloudflare.mjs` | 35821 | `e0a0498fd25a41717fd27276ab69c326153381636321923bbb4a3b81d100f04c` |
| `scripts/release-cloudflare.test.mjs` | 32238 | `343dcf6058832e0ac8127202728c901fb9b1fc674cfcf0ac3563e91e66a04430` |
| `docs/RELEASE_AUTHENTICATION.md` | 4171 | `5eb813dc561b267e42b4fb72a00bcfe16510c9817df0d266080b4a58bebff734` |
| `evaluation/reviews/2026-09-07-wrangler-encrypted-release-review.md` | 17136 | `1ef1fbc88ea34828d4e8e3d350d04c54354ee80a876e20819777b1fb00f4ffe3` |

The old auth review is historical implementation evidence, not approval of this
new integration. Cloudflare/Wrangler skills were read; their missing auth.md
reference was replaced by the [official OAuth/keychain documentation](https://developers.cloudflare.com/workers/wrangler/commands/general/#storing-oauth-credentials-in-the-os-keychain).
No authentication behavior beyond those exact imports is added.

## Acyclic identity graph and report lifecycle

```text
Pinned84f commit/tree -> all517 historical blobs + before-identities
Explicit /0.4 ledger -> non-control after-identities (including this plan)
/0.4 checker -> exact ledger/schema hashes; target checker equals executing bytes
Independent frozen full candidate + protected CI -> checker/ledger/review bytes
Captured evaluator inputs -> four reports -> external generation/run evidence
```

The ledger must not hash a checker that embeds the ledger hash, nor hash a final
review that records the complete candidate's hash. Only the exact new ledger,
checker and named current review record receive separately declared control
treatment (regular single-link0644, bounded size); no prefix/extension exception.
Executing-checker self-identity is a byte check, never external approval.
Every new document, including the current review, remains in evaluator source
inputs and complete observed inventory. Independent review/final source freeze
and protected CI bind those control bytes; no in-tree self-attestation can grant
release eligibility. No new source exclusion is introduced.

The only derived outputs remain the four existing evaluation reports. Their84f
bytes remain immutable history in the pinned Git tree; regenerated bytes are
new outputs, never historical constraints. The old single named terminal-review
exclusion remains exactly as implemented by the unchanged evaluator selectors,
but /0.4 additionally pins its actual old bytes as predecessor input. All new
review documents are ordinary evaluator inputs. Source admission accepts absent,
partial or regenerated reports without calling them validated. Report readiness
requires unchanged actual source/POSIX identities before/after, all four exact
outputs, real successful evaluator completion and its external generation record.
No four-file transaction or unsigned execution authentication is claimed.

## Frozen acceptance and anti-bypass tests

- Reject the unadmitted Wrangler combination with two source-identity and two
  unaccounted-source failures. Require the precise /0.4 declared successor only.
- Reject missing/extra/duplicate/reordered inventory, unregistered additions,
  renamed R12 bytes, wrong before/after identities, changed scientific/history/
  selector/control files, unsafe modes, symlinks/hardlinks and source drift.
- Preserve untouched historical tests; mandatory wrapper runs exactly10+5 on84f
  and proves nested5+20 and Node29 actually ran. No skipped, filtered, zero-test,
  failed, truncated, timed-out or unclean child result is accepted. The exact two
  new Vitest exclusions are justified only by this mandatory replay.
- New current-tree tests cover actual /0.4 acceptance and before/after identity
  drift, both allowed receipt-mode transition directions, report lifecycle and
  ordinary Git checkout without corrective chmod. Historical replay is not a
  full independent dependency closure; current candidate has its own npm install.
- Exact imported Wrangler tests must pass, including encrypted-only recovery,
  refresh failure and no destructive/legacy credential fallback. Release checks
  must continue rejecting stale source/run/attempt/artifact/account identities.
- Runner evidence advances explicitly to /0.4 but keeps reproduced,
  physicalValidation, convergenceVerified, scientificPromotionEligible and
  releaseEligible false; budget600000ms/stop-grace1000ms remain exact. A new
  successful current numerical run requires actual Python21/Node29/two receipt
  commands and final unchanged-source checks; no old success can be copied.
- No relevant P0/P1 may survive promotion. Root owns post-review fixes, final
  lint/type/numerical/schema/atomistic/Sentinel/build/isolation/audit/source/
  artifact gates, protected candidate CI, merge, first new-main CI and deployment.

Independent plan guidance from Scientific Evaluator `/root/scientific_custom_mace`
and Software Evaluator `/root/custom_runtime_review` was incorporated before code:
exact historical routing/counts, no new exclusions, explicit acyclic binding,
and no transfer of scientific/run/release approval. These are plan constraints,
not approval of yet-unwritten source. Builder cannot approve its candidate.

R18a remains a bounded dimensionless PFHub7a preflight/execution scope, not full
PFHub convergence, PFHub Benchmark3 phase-field/thermal reproduction, a real
material validation, or a causal/industrial recommendation. No score increase.
