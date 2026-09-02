# V046 owner revocation and filesystem-fault review — 2026-09-02

## Decision

**Approve for the existing private, execution-unattested boundary.**

This slice closes the prior adapter review's two local lifecycle and
deterministic-fault gaps. It does not authorize a browser route, public cache,
Cloudflare payload, scientific promotion, or release. The source OpenMM
execution remains unauthenticated; redistribution and protected-main artifact
provenance remain unverified.

## Owner-controlled lifetime

- Render consumers receive a frozen read handle with copy operations and an
  `isRevoked()` query. It exposes neither `revoke` nor `dispose`.
- A separate owner controller holds the only synchronous revoke closure. The
  private server loader retains that controller in an exact-object `WeakMap`;
  clones, spreads, serialized values, proxies, and forged records cannot get or
  revoke the capability.
- First revoke closes reads, zero-fills the three private F32 channel buffers
  (96,660 bytes), clears their references, stores a tombstone, and returns one
  frozen receipt. Repeated revoke returns the identical receipt.
- Scientific metadata and both presentation/materialization digests remain
  unchanged and auditable. The receipt explicitly does not claim to revoke
  caller-owned copies, renderer/runtime buffers, or GPU copies, and does not
  claim secure physical erasure.
- The instancing core rejects a revoked handle before metadata validation or
  any runtime-buffer write. Tests preserve the complete prior snapshot across
  revoked, cross-session, digest-tampered, and shared-buffer failures.

## Deterministic filesystem faults

The fault seam exists only in a dedicated Vitest file. Production code gained
no fault parameter, environment switch, global hook, or test export.

- A partial `node:fs` mock binds each injection to the post-verifier phase, one
  absolute path, the exact opened descriptor, and its descriptor-to-path map.
- The seam arms only after the real artifact verifier returns successfully.
- One recoverable short read is retried to completion.
- Premature EOF, same-path inode replacement, late captured-buffer corruption,
  descriptor-close failure, combined EOF plus close failure, and a one-byte
  post-size-check append all fail without returning a materialization or
  handle.
- Main artifact buffers are zero-filled whenever a read is not handed off or
  descriptor close fails. The one-byte overflow probe is zero-filled in its own
  `finally`.
- A combined read and close failure is retained as an `AggregateError` ordered
  `[readFailure, closeFailure]`, with the original read failure as `cause`.
- Every injection is asserted to occur exactly once. After disabling the seam,
  the same fixture loads normally without counter changes or leaked descriptor
  bookkeeping.

## Independent assessment

The implementation and the final evaluator were separate. The independent
review found no P0 or P1 issue. It first identified two P2 gaps—close failure
masking a primary read error and an uncleared one-byte overflow probe. Both were
fixed, acceptance-tested, and independently re-reviewed with final approval.

Targeted local evidence at review time:

- owner-revocation, loader, instancing, Three bridge, and filesystem-fault
  tests: 40/40 before the P2 additions;
- expanded deterministic fault suite: 7/7;
- TypeScript, targeted ESLint, and `git diff --check`: pass.

These results establish local implementation behavior only. Locked full-suite,
Sentinel, production-build, dependency-audit, source-manifest, protected-main
CI artifact, release-guard, deployment, and canonical-site states remain
separate.

## Locked local gate result

The subsequent full local gate completed successfully:

- ESLint and TypeScript: pass;
- JavaScript: 687 pass, 1 intentional skip across 72 files;
- Python: 91 pass / 1 skip, then 31 pass, then 3 pass;
- atomistic plan and runtime lock validation: pass, retaining the explicit
  `693 x 2 not run` and `not scientifically reproduced` boundaries;
- Sentinel: `CONDITIONAL`, 41.00/100, three unchanged P1 gaps, zero hard-gate
  failures;
- production build: pass;
- dependency audit: zero vulnerabilities;
- frozen source snapshot: 285 files, artifact digest
  `sha256:4ab0e1d7239e9e70a17465eacd4cb80b96a868036f4a77d4b9c8f2640c72104b`;
- canonical-site smoke: reachable with the expected title and current atomic
  viewer, with no browser console errors.

The commit-bound release manifest correctly remained unavailable: this dirty,
uncommitted candidate has no CI `GITHUB_SHA`-bound Sentinel report or successful
CI upstream-gate map. No commit, push, protected-main run, release artifact,
release guard, or deployment occurred.

## Next acceptance-tested slice

Build one positions-only, single-frame, private browser E2E harness. It must
reuse the same digest-bound frame and three persistent instanced meshes, perform
an actual WebGL2 draw, verify the browser payload digest, and keep the private
F32 derivative outside every public Cloudflare route. Force arrows and pairwise
interaction views remain unavailable until their renderer consumes explicit
solver channels with separately tested semantics.
