# V046 private artifact-frame adapter review — 2026-09-02

## Decision

**Conditional approve: private, execution-unattested integration only.**

The adapter may be used as a local Node server capability that connects one
digest-bound V045 artifact frame to the V046 presentation and instancing path.
It must not be connected to a route, Client Component, public cache, Cloudflare
payload or release claim. It does not authenticate an OpenMM execution and does
not change the locked R2 scorecard or the `planned-not-executed` status.

## Independently reviewed properties

The design reviewer and security reviewer were read-only and did not implement
the candidate. Their final assessments found no P0 issue. The design assessment
approved the private adapter; the security assessment conditionally approved it
for the same private boundary.

- The V045 session and selected frame are derived from the same stable captured
  artifact snapshot. No trajectory is reopened after session construction.
- Each of the three 6,508,440-byte F64LE trajectory artifacts is fully hashed;
  the internally computed `frameOrdinal * 64,440` slice is then copied into an
  intrinsic `Uint8Array` and independently matched to the frame digest.
- Frame 0, 1, 37 and 100 sentinels exercise lower, adjacent, interior and final
  offsets; exact-input replay checks deterministic metadata and all three F32
  byte payloads.
- A module-private `WeakMap` releases the handle only for the exact original
  frozen materialization. JSON, spread, structured clone and a claim-escalated
  clone with a recomputed digest all lose the capability.
- Proxy traps and accessor getters are not executed. Client imports of both the
  facade and implementation fail at build time.
- Captured artifact buffers, decoded numeric arrays and temporary F64 frame
  copies are best-effort zero-filled in `finally`. The returned tree contains
  no binary payload. The contract explicitly reports that private derived F32
  bytes remain retained while the capability is reachable.
- Symlinked positions, hard-linked velocities, truncated forces, an appended
  manifest and mutation of an unselected frame all fail before a new handle can
  be issued. An already issued handle remains a capture-time snapshot.
- Execution authenticity, reproduction, protected-main provenance, attestation,
  license clearance, promotion, public distribution and Cloudflare distribution
  remain false; `publicPayload` remains null.

## Local evidence boundary

The integration fixture is synthetic but digest-consistent. It exercises the
real verifier, world-session loader, F64LE-to-F32LE converter and instancing
runtime code paths; it is not evidence that OpenMM ran, that a protected-main CI
artifact exists, or that redistribution is permitted.

## Remaining gaps

1. Add a deterministic filesystem seam for short-read and open-after-check
   directory/file replacement races; do not rely on timing-sensitive tests.
2. Add an explicit bounded lifetime or `dispose`/revoke contract before caching
   many frame handles.
3. Keep source revision and session ID as internal lineage labels; never treat
   them as request input or authorization.
4. Pass the exact protected-main GitHub artifact, license decision, private
   browser backend smoke and cross-platform release guard before any UI or
   Cloudflare trajectory delivery.
