# v0.4.8 single-snapshot position trajectory — independent review

Date: 2026-09-02
Disposition: **CONDITIONAL ACCEPT — private local trajectory foundation only**
Promotion: **not requested; R2 remains the conditional champion at 41/100**

## Scope and independence

This review covers the V048 positions-only trajectory owner, the private
OpenMM artifact adapter, the trajectory instancing runtime and their production
isolation boundary. Implementation, scientific evaluation, SOTA/gap review and
code-quality review were assigned independently. No evaluator approved its own
implementation.

The positive artifact and browser-adjacent tests use explicit synthetic
fixtures. No protected-main OpenMM artifact, authenticated execution, browser
GPU draw or public payload was produced in this iteration.

## Review rounds

1. **Single-snapshot trajectory contract — conditionally accepted.** All 101
   exact F64 position frames are captured under one digest-bound filesystem
   snapshot and converted into one contiguous 3,254,220-byte private F32 owner.
   Every descriptor binds ordinal, step, time, source and derived digests,
   geometry-gate digests and one noncircular state key. Source and derived frame
   digests must each be unique.
2. **Scientific truth boundary — repaired.** The metadata now says
   `sourceDeclaredDiscreteFrameCount`, `solverFrameOriginVerified:false` and
   `motionSynthesizedByThisAdapter:false`. It no longer describes an
   unattested input as verified solver output. Execution authenticity,
   reproduction, promotion, public distribution and Cloudflare eligibility
   remain false.
3. **Geometry and conversion gates — accepted for presentation sanity.** Each
   F64 and F32 frame must contain 895 unique wrapped oxygen anchors, occupy all
   eight half-cell octants, have nonzero minimum-image O–O separation and meet
   rigid TIP3P residual limits of `1e-6` and `1e-5`. Dedicated rejection tests
   cover NaN, infinity, F64 negative zero, F32 overflow, F32 negative-zero
   underflow, duplicate frames, collapsed oxygen anchors, source-geometry
   tamper and geometry that passes F64 but fails after F32 conversion. These
   gates do not prove liquid equilibrium, density, realistic dynamics or
   execution origin.
4. **Runtime byte-owner review — repaired.** A first review reproduced
   acceptance of SharedArrayBuffer-backed position bytes. The runtime now
   requires an intrinsic fixed `Uint8Array` on a non-resizable `ArrayBuffer`,
   defensively copies before hashing or decoding, and rejects shared,
   resizable and subclassed buffers without changing the current frame.
5. **Lifecycle review — repaired.** Receipt and manifest buffers now enter the
   same `finally` zero-fill domain as captured artifacts. Receipt read failure
   and descriptor-close failure zero the main owner and one-byte overflow
   probe. Float64 decode failures zero partially decoded arrays; sequential
   constraint/target decode clears the first array if the second fails.
6. **Three object reuse — conditionally accepted.** A 101-frame test preserves
   the identity of one Group, three InstancedMesh objects, their geometry,
   material, instanceMatrix and CPU-side arrays. It proves Node-side projection
   and upload staging only. The receipt continues to state
   `webglOrWebgpuDrawExecuted:false`; no real WebGL/WebGPU buffer reuse, draw,
   context-loss recovery or measured frame rate is claimed.
7. **Production isolation — accepted for the local candidate.** Application
   code does not import V048 private modules. Both ordinary production-build
   audit and release audit scan for V048 schema/module markers. The public page
   consumes only the allowlisted product-evaluation projection, not the full
   scorecard or comparator registry.

## Reproduced local checks

- final focused V048, loader, lifecycle, release and isolation suite: `47/47`;
- TypeScript, focused ESLint and `git diff --check`: pass;
- all 101 discrete frames update the same Three scene and matrix owners;
- receipt mutation after independent verification fails and its captured bytes
  are observed zero-filled;
- the final full repository lint, numerical suite, evaluation, build and audit
  are reported separately and are not implied by this focused result.

These are local source and synthetic-fixture results. They are not GitHub CI,
branch-protection, exact CI artifact, cross-platform release, deployment or
canonical-site evidence.

## Pinned SOTA comparison

The pinned AIDO Cell report is useful as an information-architecture reference:
one persistent state, actions or perturbations, conditional transition, and
multiple readouts from the same state across scales. It remains a vendor-owned
controlled-alpha claim rather than an independently reproduced materials
benchmark. V048 implements only a lower-layer, positions-only, read-only state
sequence and a traceable 3D projection. It has no learned encoder or transition
core, multimodal decoder, intervention branch, restore semantics, uncertainty
model, mesoscale bridge or process optimizer. The project may therefore say
**AIDO-inspired**, not AIDO-equivalent.

The pinned OpenMM parameter source remains a reference. Passing a synthetic
directory through the real verifier and loader proves contract behavior, not
that the locked OpenMM container ran or generated those bytes. MatterSim/MACE,
PFHub Benchmark 3 and Cantera CSTR remain the global scientific priorities and
are not displaced or credited by this presentation slice.

## Next three acceptance tasks for the private 3D evidence lane

1. **Protected real-artifact execution.** Run the V048 loader against the exact
   protected-main OpenMM artifact, bind runner/image/source provenance, retain
   the false public-distribution boundary, and independently verify 101 frame
   digests plus energy, constraints, RDF and displacement diagnostics. A
   manifest-only or synthetic fixture cannot satisfy this task.
2. **Private trajectory envelope and pinned Chromium draw.** Define a bounded
   positions-only envelope, exact frame-offset and WebCrypto verification,
   then consume it in a private pinned-Chromium WebGL2 harness. Acceptance must
   cover frames 0/37/100, actual draw evidence, object/GPU-resource stability,
   raycast identity, context loss, disposal and raw-coordinate exclusion from
   public artifacts.
3. **Same-state microscope with an independent force channel.** Bind viewport,
   timeline and atom selection to one session/frame/state key. Add exact
   artifact force bytes with their own digest and units, explicitly excluding
   constraint impulses. Never infer force from displacement; velocity,
   electronic density and energetic bond layers stay unavailable until their
   own evidence contracts exist.

Any conservation, determinism, schema, source-origin, license, private/public
boundary or release-provenance failure remains a promotion hard stop. This
review changes no score and authorizes no commit, push or deployment.
