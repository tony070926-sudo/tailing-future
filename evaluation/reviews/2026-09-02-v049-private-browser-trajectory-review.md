# v0.4.9 private browser trajectory — independent review

Date: 2026-09-02
Disposition: **CONDITIONAL ACCEPT — local synthetic-capable browser evidence only**
Promotion: **not requested; R2 remains the conditional champion at 41/100**

## Scope and independence

This review covers the bounded private trajectory packet, one-time loopback
transport, in-memory Vite client build, persistent Three.js scene, Chromium
observer and their lifecycle and claim boundaries. Scientific, security and
CI-gap reviews were performed independently from implementation. No evaluator
approved its own implementation.

The executed integration fixture is explicitly named
`synthetic-spatial-render-fixture`. The result therefore demonstrates a local
browser presentation path; it does not demonstrate that OpenMM generated the
positions, that an MD trajectory was reproduced, or that any payload may be
published.

## Accepted local evidence

1. **Bounded positions-only transfer.** One V048 owner is converted into a
   single-use V049 packet containing 101 F32 position frames and exact metadata.
   Whole-packet, aggregate-position and per-frame digests are independently
   recomputed in the browser with WebCrypto. Source F64 bytes, velocities,
   forces and energies are absent.
2. **Actual WebGL2 draws.** The client advances exact source ordinals 0 through
   100 with one `requestAnimationFrame` pacing yield per source frame. It does
   not interpolate or create physical states. Three persistent
   `InstancedMesh` objects draw 895 oxygen instances, 1,790 hydrogen instances
   and 1,790 O-H topology links.
3. **Geometry-derived render budget.** The expected triangle count is derived
   from the live BufferGeometry draw cardinality and instance count, then
   compared with `renderer.info.render.triangles` after every draw. With locked
   Three 0.185.0, the non-indexed icosahedron contributes 180 triangles per
   atom and the indexed cylinder contributes 40 per topology link, for exactly
   554,900 triangles and three draw calls per frame. A unit test derives the
   same total from the actual geometries rather than trusting a literal.
4. **Browser-side presentation sanity.** All 101 F32 frames independently pass
   rigid TIP3P O-H/H-H relative-distance checks, 895 bitwise-unique wrapped
   oxygen anchors and occupancy of all eight half-cell octants. These checks do
   not establish density, equilibrium, RDF, a positive O-O exclusion distance,
   physical motion or solver origin.
5. **Narrow interaction evidence.** A real Three `Raycaster` maps oxygen
   instance zero to atom zero at frames 0, 37 and 100. This is CPU geometry
   intersection and identity mapping, not GPU picking or evidence for every
   atom. Final-frame `readPixels` observes pixels that differ from the lower-left
   reference pixel; it is not a 101-frame visual-equivalence proof.
6. **Code and capability binding.** The observer binds the exact packet digest
   and now also hashes the actual `/client.js` response body against the
   in-memory build byte length and SHA-256. The fragment credential is removed
   before the authenticated packet request. The manual URL launcher requires
   two explicit synthetic-only environment acknowledgements and refuses CI.
7. **Lifecycle failure closure.** Happy, mid-playback dispose and WebGL context
   loss each end with trajectory-owner revocation, core/Three/renderer disposal,
   loopback closure and logical packet/token/asset zero-fill. Terminal state
   and frame count are rechecked after a one-second stability window. Context
   restoration cannot resume without a new capability.
8. **Sandbox posture improved, not attested.** Playwright documents that
   `chromiumSandbox` defaults to false. The observer now explicitly requests
   `chromiumSandbox:true`, rejects root execution on Linux and forbids explicit
   no-sandbox arguments. The local macOS run does not prove a protected Linux
   sandbox or process-level network boundary.

## Reproduced local checks

- focused build, geometry, observer, isolation and lifecycle contracts:
  `76 passed`, `1 manual-only skipped`;
- exact local Chromium integration after client-response digest binding:
  `3/3 passed` — happy `35.084 s`, mid-playback dispose `25.742 s`, context
  loss `26.090 s`;
- focused ESLint and TypeScript: pass;
- final full JavaScript run: `844 passed`, `5 skipped`, across `94 passed` and
  `2 environment-skipped` files. A prior concurrent run timed out in one
  existing finite-difference receipt-policy test; its isolated rerun passed in
  `432 ms` and the final unchanged full run passed it in `747 ms` without
  changing thresholds;
- Python scientific and policy suites: `125 passed`, `1 skipped`;
- atomistic manifest/runtime-lock validation: pass; Sentinel remains
  `CONDITIONAL · 41.00/100`; dependency audit reports zero vulnerabilities;
- source-manifest recapture: `336` current files matched
  `sha256:2d51a1d29213184cac411ee90143aa821e35f3c8dfe13d760d5f4cfbea0cfcb9`
  before this review's final evidence-only edit;
- production build, production-isolation audit and current canonical-site HTTP
  identity smoke: pass.

These are local darwin-arm64 results using a digest-locked Chromium main
executable. The observer explicitly records that the full runtime tree and
archive snapshot are not verified. They are not protected-main CI, a GitHub
artifact, cross-platform reproduction, release, deployment or canonical-site
evidence.

## Scientific and product boundary

The browser result is deliberately positions-only. Atom and topology-link
radii are nonphysical display scales; cylinders represent O-H adjacency, not
bond order or energetic bonds. No force, velocity, stress, energy, Coulomb
field, electron density, orbital, reaction, performance or complete physical
state is rendered. `motionSynthesizedByThisBrowserAdapter:false` means only
that this adapter did not invent intermediate frames; source motion provenance
is explicitly `unverified-may-be-synthetic`.

GenBio AI describes AIDO Cell as a vendor-controlled world model with a unified
state that can be perturbed and decoded into multiple experimental readouts.
Its multiscale AIDO program describes a three-stage progression from component
models, through bottom-up connection, to aligned networked modules. Those are
useful information-architecture comparators, not independently reproduced
materials benchmarks. V049 provides only a private read-only trajectory viewer
for one positions channel. It has no action-conditioned transition model,
branch/restore experiment, learned world state, multimodal decoder, calibrated
uncertainty, scale bridge or process optimizer. The allowed description remains
**AIDO-inspired**, never AIDO-equivalent.

Primary references:

- [AIDO Cell](https://genbio.ai/aido-cell-simulator/)
- [AIDO multiscale foundation-model program](https://genbio.ai/aido-multiscale-foundation-models/)
- [OpenMM 8.6.0 release](https://github.com/openmm/openmm/releases/tag/8.6.0)
- [Playwright BrowserType launch options](https://playwright.dev/docs/api/class-browsertype)

## Remaining hard stops

- The protected workflow has no Chromium fetch, safe extraction, three-mode
  execution or sanitized browser receipt and still uploads exactly eight
  non-browser evidence files.
- The Linux archive, runtime tree and Playwright implementation bytes are not
  fully bound. Main-executable SHA-256 plus package-declared version is not a
  complete runtime identity.
- `context.route` is a page-request allowlist, not host/process egress
  isolation. Real private coordinates require a non-root Chromium sandbox and
  a Linux network namespace or equivalent that exposes loopback only.
- The 30-second loopback capability begins before two executable hashes,
  browser launch and 101 draws. Linux CI timing margin is unproven. Runtime
  preflight should finish before capability issuance, rather than silently
  relaxing the lifetime.
- Browser close hang/crash and process-group termination do not yet have
  injected fault tests. Logical zero-fill is not secure physical erasure.
- No protected OpenMM artifact has entered this browser path, and the control
  receipt still records execution authenticity, reproduction, promotion and
  public distribution as false.

## Next three acceptance tasks

1. **Protected real OpenMM-to-browser proof.** Safely acquire and extract the
   locked Linux Chromium archive; bind archive, runtime tree, Playwright bytes
   and client response; run as a non-root sandboxed user inside a loopback-only
   network boundary. Feed three fresh capabilities from the same exact private
   protected-main OpenMM artifact into happy/dispose/context-loss paths and
   export only canonical aggregate receipts. A second independent run is
   required before any reproduction claim.
2. **Same-state physical readouts and operations.** Add independently digested
   solver-frame velocity, force, energy, stress and charge channels with exact
   units and temporal semantics. Viewport, selection, timeline and
   `observe/perturb/branch/restore` must bind one state key. Force may not be
   inferred from displacement and electronic layers stay absent without a
   separately verified density grid.
3. **Return to the scientific roadmap.** Complete both pinned MatterSim and
   MACE 693-record Random-TP runs before learned-potential claims, then proceed
   to the NIST PFHub Benchmark 3 phase/heat module and Cantera 3.2 CSTR closure.
   Only independently accepted modules may be connected by a unit-bearing,
   conservation-gated and uncertainty-aware scale bridge.

Any conservation, determinism, schema, source-origin, sandbox, network,
license, private/public or release-provenance failure remains a promotion hard
stop. This review changes no score and authorizes no commit, push, Cloudflare
deployment or public trajectory.
