# 2026-09-11 — strict extXYZ geometry input v0.1

Status: hypothesis frozen before implementation; NOT reviewed or eligible for commit/promotion.

## Bounded hypothesis and tasks

The existing structure representation can preserve explicitly supplied Cartesian geometry, full three-dimensional periodic cells and source-declared atom IDs from a deliberately narrow extXYZ profile without converting imported labels into computed results or expanding solver applicability.

At most three tasks in this round:

1. Implement and test a bounded, single-frame `tf.extxyz-geometry/0.1` parser. Supported header keys are exactly `Properties`, `pbc`, and optional `Lattice`. `Properties` and `pbc` are required; only TTT with nine-number Lattice or FFF without Lattice is accepted. Required columns: `pos:R:3` and `species:S:1` or `Z:I:1` (both allowed only if consistent). Optional `id:S:1` is a TF profile convention; unique identifiers retain source-declared, unverified status. Other fields, including E/F/stress/charge/spin/unit/source annotations, are explicitly refused, never silently discarded. An explicit user interpretation is required: Cartesian angstrom geometry, not a 2D layout or fractional coordinates. This is not universal extXYZ compatibility.
2. Wire the profile into the existing import transaction and 3D viewer. Show cell/PBC, profile/ID interpretation, retained raw header and transport digest; preserve original raw bytes for explicit download. Native JSON preserves geometry/IDs but not original formatting/header/transport provenance. Stale, malformed or refused input must leave the last accepted structure/receipt unchanged. No automatic solver invocation or new electronic output.
3. Freeze implementation/tests, run all applicable gates, obtain independent read-only scientific/software/SOTA review, and record P0/P1/P2 dispositions. Any P0/P1 or failed relevant gate blocks commit and promotion. Existing main CI/release remains a separate state and artifact; do not deploy this candidate or local dist.

## Acceptance tests

- Preserve all 118 element identities and binary64 coordinates; canonical species/Z consistency, exact positive count, existing 4096-atom/16 MiB core limits, an additional 8192-character header limit, UTF-8/control/line grammar and finite numeric range checks.
- Test nonorthogonal a,b,c lattice columns, volume and displayed cell corners; never transpose, wrap, infer cell/PBC, add vacuum, or generate coordinates.
- Reject missing/partial PBC, finite-with-cell, left-handed/degenerate cells, multi-frame input, duplicate/unknown header or Properties fields, invalid property types/shapes, duplicate IDs, nonfinite/underflow/negative-zero coordinates and contradictory species/Z.
- Test reordered Properties and atom rows with explicit IDs, generated file-row IDs when absent, exact-byte raw download including CRLF, deterministic receipt/semantic digests and native round-trip. A row ID is not proof of persistent physical identity.
- Reject imported scientific labels and conflicting/unknown unit/source annotations before acceptance; preserve all old accepted state on refusal. Successful geometry import retains null scientific outputs and abstaining admission, regardless of element support.
- UI tests cover explicit interpretation, periodic 3D/readout binding, atomic rejection, pending-read invalidation, original-file download and native-export loss notice. Existing plain XYZ/native/Ar explicit-result routes must remain unchanged.

## Baseline and boundaries

- Isolated worktree: `/Users/tonywilliam/Documents/ChatGPT/Tailing Future-custom-extxyz-v01`, branch `codex/custom-extxyz-v01`, created from freshly fetched main `2cbc7bb927fa4db0acb6cfe27ded29d406b9edc7`, tree `155029420301fe1baba96a41a4ac8dfc34a427b7`.
- This tree equals reviewed PR40 candidate3ca. Two candidate CIs passed 1935 tests each, 6 skipped, eleven actual outcomes success; main first CI34576996317 attempt1 is still live and has no terminal result at hypothesis freeze. These are prior-tree evidence, not validation of this new implementation.
- Original dirty user workspace and all other worktrees remain untouched. No dependencies, schema versions, scorecard, numerical tolerances or model assets may change in this task.
- Baseline package SHA256 `0631ec8732a6652b3c1cb843fdc6ca9de0e72ab73e1c6de2692ba399f842eb38`; lock `0792424e6a7eb74c15b44a4d98384d535a439a74f5fc5403f038088ed60366a5`; scorecard `ff0f47dd69ff3832468dc489119a59e5d42afff9c95ff6d16ba98fbc9dfb96a7`; atomistic runtime lock `b8c352aacfef3f74210d2dbf2002400887e35d21670f5f93da6a8003670bafa1`.
- Sentinel41 is validation maturity, not percent-complete/SOTA/truth. This input task does not qualify general molecules, change the finite neutral-Ar LJ domain, complete MACE Linux qualification, supply authorized compute, clear Random-TP rights, run the 2772 minimum full benchmark predictions, or reproduce PFHub3/Cantera.
- Cloudflare auth guard/credentials and retained OAuth session remain untouched. No industrial control writes or engineering recommendations.

## Primary format references

Read 2026-09-11; classification `reference`, source revision and raw-page digest both null. No ASE/libAtoms compatibility execution yet.

- https://docs.ase-lib.org/ase/io/formatoptions.html#extxyz
- https://github.com/libAtoms/extxyz#extended-xyz-specification

ASE documentation and libAtoms mapping differ on default/mandatory lattice handling. The explicit TF profile above deliberately supplies no defaults. Rejected metadata is a documented first-version limitation, not a claim it is invalid in extXYZ generally.

## Candidate and independent dispositions

Implementation identity, targeted baseline/self-check, complete gate evidence and independent reviewers: pending. Builder cannot approve its own changes. This document alone is not scientific reproduction or release evidence.
