# Custom 118-element structure workbench v0.1 — iteration record

Review date: 2026-09-06

Last updated: 2026-09-07

Current disposition: **IMPLEMENTED; FINAL FREEZE, GATES AND RE-REVIEW PENDING**

This record began by freezing the bounded hypothesis and acceptance gates
before the Builder changed source code. It now also preserves rejected
candidate identities, independent findings, repairs and local browser evidence.
It is not solver validation, a scientific reproduction, a SOTA result, release
approval or deployment evidence. Any open P0 or P1 blocks commit and promotion.

## Historical frozen bounded hypothesis

H-CUSTOM-STRUCTURE/0.1 is:

> For one native `tf.structure-document/0.1` JSON document no larger than
> 1 MiB and containing 1–4,096 atoms plus 0–8,192 explicitly declared display
> connections, Tailing Future can strictly preserve any IUPAC element identity
> Z=1–118, finite Cartesian coordinates in angstrom, either finite or fully
> three-dimensional periodic boundary topology, user declarations and source
> boundaries; produce a deterministic document-semantic digest; and render the
> validated structure in a static interactive WebGL2 view. Classical
> atomistic, ML interatomic and electronic-structure channels must each return
> a digest-bound machine-readable abstention without invoking a solver.

This hypothesis means **all 118 element identities and arbitrary valid custom
structures can be represented, edited and viewed inside the stated limits**.
It does not mean every molecule or material is chemically valid, stable,
parameterized, simulatable or inside a model's validation domain.

## Explicit scope amendment — 2026-09-07

The original 1 MiB transport ceiling above is retained verbatim as historical
evidence. It was not silently overwritten. The first maximum-cardinality native
round-trip produced 2,038,241 bytes, proving that the original byte ceiling was
incompatible with the already frozen 4,096-atom/8,192-connection semantic
cardinality. Independent reviewers correctly classified the unrecorded change
to 16 MiB as P1 scope drift and rejected staged tree `d4357b1...`.

The single amended field is the native transport ceiling:

- operative limit: exactly 16,777,216 bytes (16 MiB);
- pre-decode and pre-`File.arrayBuffer()` rejection: byte length greater than
  16,777,216;
- rationale: preserve the existing maximum semantic cardinality, leave more
  than 8x headroom over the measured 2,030,908-byte final synthetic boundary
  fixture, and still impose a bounded browser allocation;
- compensating controls: one private immutable byte snapshot, fatal UTF-8,
  nesting limit, allocation-free bounded string validation, 4,096/8,192
  semantic limits, editor pagination and measured browser memory/latency;
- no other scientific domain, format, solver, model or claim is expanded.

The operative H-CUSTOM-STRUCTURE/0.1 therefore replaces only “no larger than
1 MiB” with “no larger than 16,777,216 bytes.” All other text in the historical
hypothesis remains binding. The original negative test “files over 1 MiB” is
superseded only by “files over 16,777,216 bytes.”

## Explicitly excluded claims and regimes

- No classical potential, force field, MatterSim, MACE, OpenMM, DFT or other
  solver is selected or run by this milestone.
- Energy, atomic force, stress, physical charge, bond order, electron density,
  orbital, velocity, trajectory, uncertainty and causal-effect outputs remain
  unavailable and `null`.
- A user-declared connection is display topology only. It is not an inferred
  chemical bond and never creates an energetic interaction.
- `finite` and `periodic-3d` describe boundary topology, not phase or material
  class. Molecules, disconnected molecular assemblies, clusters, liquids,
  solutions, glasses and crystals are not inferred. An optional classification
  is `user-declared-unverified` only.
- Slab, wire and every mixed/partial-periodicity topology are excluded from
  v0.1 rather than coerced into finite or fully periodic form.
- Plain XYZ, extended XYZ, CIF and V3000 import are excluded. Only the native
  versioned JSON is accepted until a format-specific field-loss map, pinned
  specification and round-trip corpus exist.
- Representation does not establish solver species coverage, reference-theory
  setup, environmental applicability, quantitative accuracy, safety or
  suitability for industrial control.
- This milestone cannot change the locked validation-maturity score, the
  `CONDITIONAL` verdict or any existing reproduced/not-reproduced disposition.
- No AIDO Cell biological result, benchmark or scientific capability is
  like-for-like. AIDO is an interaction and state/engine architecture reference
  only.

## Frozen implementation tasks — maximum three

### Task 1 — identity, document, validation and abstention contracts

Create an identity-only catalog with exactly 118 tuples of atomic number,
symbol and IUPAC English name. The catalog must carry the fixed official source
URL, retrieval date, byte count and digest; it must not contain atomic weight,
isotope abundance, physical mass, radius, color or inferred chemistry. Its
local semantic digest is locked by test. Atomic number is dimensionless;
symbol and name are identifiers.

Add the new, additive `tf.structure-document/0.1` contract without modifying
`tf.world/0.3`, `tf.action/0.3` or `tf.observation/0.3`. The document contract
must be closed to unknown fields and must state:

- topology `finite | periodic-3d`;
- Cartesian coordinate dimension `length`, unit `angstrom`, basis
  `structure-local`, with input values preserved and no automatic coordinate
  centering, wrapping or optimization;
- finite topology as cell `null` and PBC `[false,false,false]`;
- periodic topology as PBC `[true,true,true]` and
  `H=[a b c]-column-vectors`, where each column is a structure-local Cartesian
  vector in angstrom;
- every coordinate and cell component finite, not negative zero and within
  `[-10_000,+10_000]` angstrom;
- each periodic cell-vector norm at least `1e-6` angstrom; positive finite
  determinant in cubic angstrom; and the scale-independent normalized triple
  product `det([a/|a| b/|b| c/|c|]) > 1e-12`;
- stable bounded ASCII atom identifiers and exact `{atomicNumber,symbol}`
  catalog pairing;
- isotope mass number, when present, as a dimensionless integer nucleon count
  `Z <= A <= 400`, explicitly user-declared and existence-unverified, with no
  mass inference;
- atomic formal charge, when present, as a safe integer in elementary charge,
  dimension `electric-charge`, basis `formal-bookkeeping`, and
  user-declared-unverified;
- finite-system net charge, when present, as a safe integer in elementary
  charge where `Q=+1` means one electron fewer than the sum of nuclear charges;
- finite-system spin multiplicity, when present, checked with
  `N=sum(Z)-Q`, `N>=0`, `M>=1`, `M-1<=N` and even `N-(M-1)`;
- periodic topology must reject finite-system charge/spin fields. Its optional
  aggregate is only formal charge per declared cell, in elementary charge with
  a formal-bookkeeping-per-declared-cell basis. It is not physical partial
  charge, compensating background, electrostatic solvability or electron
  count, and it has no spin multiplicity;
- when every atomic formal charge and the corresponding finite or periodic
  aggregate are specified, exact equality is required. Summation uses `BigInt`
  or an equivalent exact overflow-safe method, including at the 4,096-atom
  limit;
- connections are undirected display declarations with order
  `unknown | single | double | triple | aromatic`, provenance
  `user-declared | explicit-import`, role `display-only` and
  `energeticInteraction:false`;
- image shift for endpoint B is a three-component safe integer vector in
  `[-16,+16]`. The endpoint is exactly `r_image=r_B+H*n`. Finite connections
  require zero shift. `(A,B,n)` and `(B,A,-n)` are the same identity and
  duplicates are rejected. Zero-shift self connections are rejected; nonzero
  periodic self connections are permitted;
- user-created documents require no fabricated external source or revision.
  Native-file transport is recorded separately. Every supplied source,
  license, attribution and classification remains a user declaration with
  `projectVerified:false`; `NOASSERTION` is valid and never implies
  redistribution clearance.

The browser-safe native parser must enforce the byte limit before decode, use
fatal UTF-8, and reject BOM, NUL, trailing tokens, non-finite parsed numbers,
negative zero, prototype-polluting construction and duplicate decoded object
keys including escaped/nested duplicates.

Document, raw transport/import receipt, validation receipt and solver-admission
receipt must remain separate so their digests cannot form a cycle. The raw
receipt binds exact bytes and raw SHA-256. The semantic digest sorts only
unordered atom records by ID and undirected connections by canonical edge key;
it never reorders coordinate, vector, tensor, PBC or cell-column arrays. It is
document-semantic identity only, not physical equivalence under translation,
rotation, symmetry, alternative cell choice or chemical interpretation.

Each of the three admission channels binds the semantic digest, validation
receipt digest and policy version, and fixes `decision:abstain`,
`attempted:false`, `solverInvoked:false`, `backend:null` and every physical or
electronic output to `null`. Static dependency checks and injectable zero-call
sentinels must prove that no solver path is reached.

### Task 2 — static WebGL2 editor and viewer

Add an independent custom-structure workbench. It must support:

- an all-118-element selector;
- add, edit and remove atom identity, stable ID and exact x/y/z coordinates;
- optional isotope and formal-charge declarations;
- finite/periodic-3d topology switching and nine explicit cell-matrix values;
- explicit connection add/edit/remove including order, source and image shift;
- native `.tfstructure.json` import/export;
- pagination of atom and connection editors at 64 rows per page;
- invalid drafts leaving the last valid render state unchanged;
- persistent `STRUCTURE ONLY / SOLVER NOT RUN` status and three visible
  abstention cards.

The renderer must use real WebGL2 and Three.js instancing/batching, never a fake
2D substitute. It copies validated double-precision render-model coordinates
without modifying them. GPU conversion is an explicit nonphysical display
projection with identity axes, zero offset, one display unit per angstrom and
deterministic `Math.fround`; exact doubles remain in the document, inspector
and digest. Every uploaded Float32 primitive and camera bound must be finite or
the adapter must refuse rendering with a machine-readable reason.

Atoms use one uniform nonphysical display radius and a deterministic visual-only
color derived from Z, never unsourced CPK radii or colors. Connections and cell
edges come only from validated input. With no connections, the renderer draws
none. Periodic endpoints use `r_B+H*n`. A degenerate zero-length display segment
is skipped with an explicit warning, not replaced by a fabricated length.

Raycasting must map Three.js `instanceId` back to stable atom ID. Orbit, pan,
zoom, selected-atom focus and reset are allowed; they cannot change structure
state or digest. There is no auto-rotation, damping, interval, solver advance or
continuous animation loop. RAF is coalesced and requested only for input,
camera, resize, selection or validated-model changes. WebGL2 unavailable,
context loss, hidden/inactive and disposal states must be explicit and safe.

### Task 3 — product integration, evidence and independent review

Add a fifth entry after the four existing molecular/atomistic scenes and pause
their scan/trajectory state before opening the custom workbench. Do not adapt a
custom document into the current TIP3P, Coulomb, Lennard-Jones, Ewald, OpenMM,
MatterSim, MACE or DFT code paths.

The candidate must add focused catalog, strict-parser, schema, semantic,
renderer, WebGL policy and component tests. Required negative cases include:

- invalid or mismatched Z/symbol, catalog duplicates and accidental physical
  properties;
- duplicate decoded JSON keys, BOM, bad UTF-8, NUL, trailing data, `1e400`,
  negative zero and files over 1 MiB;
- 4,096/8,192 acceptance and 4,097/8,193 rejection;
- finite/periodic mismatch, partial periodicity, left-handed, zero, too-small
  and near-singular cells;
- vector-coordinate permutation and cell-column permutation changing the
  semantic digest, while atom/connection record permutation does not;
- exact bounds, large finite translations, maximum image shifts and finite
  Float32 upload values;
- missing connection endpoints, duplicate undirected periodic edges, invalid
  image shifts, zero-shift self edge and allowed nonzero periodic self edge;
- H+, H-, valid neutral-H doublet, invalid neutral-H singlet, even-electron
  multiplicities, periodic per-cell formal charge and rejection of periodic
  finite-system spin/charge;
- exact 4,096-item formal-charge summation without Number precision loss;
- three digest-bound abstentions, null outputs, zero calls and a static import
  graph with no solver dependencies or motion loop;
- fifth-entry editing and native import/export, invalid-draft retention,
  selection/orbit read-only behavior and console-clean real-browser WebGL2.

After Builder self-check, the main agent will freeze the diff and assign
read-only mechanism/science, software/numerical/evaluator and dated SOTA/gap
reviews. P0/P1 findings block commit and promotion. Final applicable lint,
typecheck, full JS/Python numerical tests, atomistic manifest, deterministic
Sentinel, production build, dependency audit, source/artifact digests and
release isolation gates must all pass after the last fix.

## Baseline before implementation

- Isolated worktree:
  `/Users/tonywilliam/Documents/ChatGPT/Tailing Future-custom-structure`.
- Branch: `codex/custom-structure-workbench`.
- Fetched local `HEAD`, `origin/main` and GitHub main:
  `ecff55ffd3d5d0d65236d5c5a8da302403253cf8`.
- There were zero open GitHub pull requests immediately before this worktree
  was created.
- The unrelated primary worktree remains dirty on
  `codex/causal-mechanism-foundation` at
  `643b8b15f1a796c0ca4c34657d4b5edc68389354`; it is not an implementation
  source and must not be edited by this milestone.
- Exact-main Tailing Sentinel run
  [34051795677](https://github.com/tony070926-sudo/tailing-future/actions/runs/34051795677)
  ran from 2026-09-06T18:27:55Z through 19:37:23Z and succeeded. Every
  applicable install, lint, typecheck, full test, atomistic validation, build,
  audit, Sentinel, report-build, release-manifest, long-lived upload and final
  aggregation step passed. The PR-only report upload was conditionally skipped
  because this was a push run, not failed.
- The exact-main long-lived artifact is GitHub artifact `9995810961`, named
  `tailing-sentinel-ecff55ffd3d5d0d65236d5c5a8da302403253cf8`, archive size
  2,828,981 bytes, GitHub digest
  `sha256:5d21ef42bea62cfdddada7d7e9dd98de76f219bf0acb55857dc960d209cd8f0e`.
  Offline validation against the exact main SHA passed: 67 files, 5,677,804
  bytes, content-root digest
  `sha256:12e6f91ae242e34560fa064b1c7639ba731bb41e951ea1e0ec5868b6735947f0`
  and report-artifact digest
  `sha256:73f1cdf89f847c419db6fd4660001496cd8f71e79113d6839fd553c324bd23fa`.
- The exact-main report remains `CONDITIONAL`, 41/100, with
  `hardGateFailures=[]`. Its source manifest has 424 files. This is validation
  maturity, not scientific truth or percent of SOTA.
- Reporter run
  [34055477390](https://github.com/tony070926-sudo/tailing-future/actions/runs/34055477390)
  was correctly skipped because the source run was a push rather than a PR.
- The canonical site returned HTTP 200 and title
  `Tailing Future — 材料世界模型实验室`. The HTML did not establish a
  deployment revision for this new milestone, which has not been built or
  deployed.
- Existing relevant pinned packages are `three@0.185.0`, `ajv@8.20.0` and
  `@noble/hashes@1.8.0`; this milestone does not require a dependency change.
- Frozen compatibility hashes before implementation are:
  - `schemas/world-state.schema.json`:
    `sha256:0f0941fcd0cb66f491baeb32d1e9f9acc3af8f18ac939efeb3961f4a3fd48795`;
  - `schemas/action.schema.json`:
    `sha256:f80094a63dc37e10c033b9981cfbbe423182bd4aebcff1e22cfb70cd2dd4aa18`.
  The `tf.observation/0.3` implementation contract must likewise remain
  unchanged and will be checked by the existing compatibility tests.
- No custom-structure source change, local candidate test, commit, push, PR,
  candidate CI, merge, first merged-main CI, Cloudflare deployment or
  post-deploy smoke existed at this freeze.

## Dated primary-source baseline

- IUPAC 4 May 2022 periodic table PDF: identity tuples Z=1–118 only; retrieved
  55,608 bytes with
  `sha256:ef6ca2f6d46554f96e30ad3a60693d6630fe45ad81ce83cb14e508c6cbb7d3b3`.
  Copyright presentation is not redistributed and the derived fact catalog
  does not claim an IUPAC license. Atomic-weight columns are excluded; CIAAW's
  2024 weight table is newer and weights are not identity defaults.
- RFC 8259 is a JSON syntax reference, not a molecular ontology. Its official
  text was audited at 28,360 bytes with
  `sha256:61a5378f4255c720beb2a4b4a63b29540147c140f36988bf086291989b4cd2d7`.
- Official MatterSim v1 metadata and the official MACE-MPA-0 checkpoint expose
  the same non-contiguous 89-species set: Z=1–83 and Z=89–94. They do not cover
  all 118 elements and must never be described as simply Z=1–89. MatterSim's
  fixed source revision is
  `40a1eb8f1189a53af310957b4f2c5dfbfe68d647`; MACE foundations revision is
  `6de003bb29db05f451051c30ce809fad522d26da` and the audited checkpoint digest
  is
  `sha256:75428afe3a1d7d8062e19bcaabd5c433623cabf308242ec9fb493e38604fb638`.
  Both are external auditable references, not local reproduced results.
- libAtoms extxyz v0.4.5 at revision
  `471cb688fd2c3fd538e4bbc019cb1f00bf9be2d0`, IUCr CIF 2.0/core dictionary
  3.2.0 and BIOVIA CTfile Formats 2020 each carry semantics that the native
  v0.1 document does not claim to preserve. Their importers remain off.
- AIDO Cell 1.0's 2026-08-18 technical report is an architecture reference
  only. Its audited 30,089,474-byte report digest is
  `sha256:4f25869b149a0064cc71381febf2599ca1e95c891be1d7d66c83a8797dbab508`.
  There is no shared dataset, metric, domain or validation target with this
  milestone.

## Pre-implementation independent review

- Scientific evaluator: `/root/custom_structure_science_evaluator`, read-only.
  The initial design received three P1 findings: phase was conflated with
  boundary topology; cell/periodic-edge and digest mathematics were
  underspecified; and charge/spin/isotope/provenance/admission consistency was
  incomplete. A second review found two further P1s concerning unsafe array
  canonicalization and unbounded numeric-to-GPU projection. The revised frozen
  contract above closed every P1 and received **GO-for-implementation** with
  P0=0 and P1=0. Its remaining P2, exact overflow-safe summation of all atomic
  formal charges, is incorporated above and is therefore an implementation
  acceptance test rather than an accepted residual.
- SOTA Scout: `/root/custom_structure_sota_scout`, read-only. It used official
  standards, source repositories, model cards/checkpoints and original papers.
  Its P1 boundaries — the exact non-contiguous MLIP species set, native-only
  import claim and strict separation between representation and solver support
  — are incorporated above. No external number is classified as reproduced.
- Builder: `/root/custom_structure_builder` (Pasteur) may implement and
  self-check this hypothesis but cannot approve its candidate.
- Independent software/evaluator review and final Gap Planner review have not
  yet occurred and remain mandatory before commit or promotion.

## Candidate identity, tests, findings and lifecycle

### Implemented bounded product

- A new fifth Molecular Lab entry opens an isolated custom-structure
  workbench and pauses the pre-existing scene scan/trajectory state.
- `tf.structure-document/0.1` is additive. It represents 1–4,096 atoms with
  exact Z/symbol identity, Cartesian x/y/z in angstrom, finite or full 3D
  periodic topology, a column-vector cell, optional user-declared isotope and
  formal-charge bookkeeping, and 0–8,192 explicit display-only connections.
- The native contract now carries a fixed machine-readable image-shift frame:
  dimension `dimensionless`, unit `cell-lattice-coefficient`, basis
  `integer-coefficients-of-declared-cell-columns`, endpoint B and equation
  `r_image=r_B+H*n`. Its applicability is `periodic-3d-only`; finite topology
  fixes the vector to zero and declares `zero-required-not-applied`.
- Strict native JSON parsing binds raw bytes separately from semantic identity,
  rejects decoded duplicate/NUL/prototype keys and unsafe values, snapshots
  shared input before decode/hash, and enforces the amended byte ceiling before
  browser file buffering.
- Validation and admission receipts are separate, closed, immutable and
  digest-bound. Classical atomistic, ML interatomic and electronic-structure
  channels all remain `ABSTAIN`, unattempted, uninvolved and all scientific
  outputs remain `null`.
- The Three.js WebGL2 adapter batches atoms and segments. It publishes `ready`
  only after `renderer.render` returns successfully; hidden RAF work is
  suppressed; render failure and partial initialization fail closed; normal
  cleanup is idempotent. A context-loss event tears down the old renderer,
  owned resources, observers and listeners while that context is lost; one
  separately owned, one-shot restore listener then starts a fresh runtime.
- Exact document coordinates remain untouched. Float32 display projection uses
  `Math.fround` and normalizes either signed underflow zero to positive zero.
  Camera padding is named and typed as visual-only display framing, not an
  exact scientific radius. Periodic connections explicitly declare a canonical
  undirected-edge-orbit representative that may differ from literal endpoint
  order by a whole lattice translation.
- The UI directly labels uniform atom radius and Z-derived color as visual-only,
  isotope and formal charge as unverified user declarations, connections as
  non-inferred/non-energetic, and every unsupported solver result as unavailable.
- No dependency or lockfile was changed. No adapter into TIP3P, Lennard-Jones,
  Coulomb, Ewald, OpenMM, MatterSim, MACE or DFT was added.

### Rejected freeze history and dispositions

The Builder's first staged candidate was based on
`ecff55ffd3d5d0d65236d5c5a8da302403253cf8`, tree
`bb103df90f1f2cbe02e23cd58a877bbe13e0a6d0`, with cached binary-patch SHA-256
`1a36beec7e98506cddce9b822ff2936f82832518eb6ca062265d57a85ef1e4e0`.
It was rejected. Independent review found, among other issues, an incorrect
IUPAC URL, import-receipt lifecycle ambiguity, escaped-NUL keys, shared-buffer
decode/hash TOCTOU, validation-receipt accessor TOCTOU, schema/runtime Unicode
length mismatch, pseudo array indices, incomplete WebGL cleanup/ready-path
tests, excessive endpoint option duplication and absent maximum-scale browser
evidence.

The first main-agent repair was frozen as tree
`d4357b14877db3e04cb29109ddb2e7c887f1ff67`, cached binary-patch SHA-256
`d3a094e5598a4dc7a530c76085548994d5ee08f158b61dfbde677f2d87a24f9b`.
It too was rejected: P0=0, but the independent software review reported four
P1 and one P2, and the independent science review reported five P1 and two P2.
The blocking findings were the unrecorded 1 MiB→16 MiB scope expansion,
pre-frame `ready`, allocation-heavy Unicode counting, incomplete early WebGL
resource ownership, negative-underflow projection asymmetry, scientific naming
of visual camera padding and an undeclared periodic-edge display gauge. The
software evidence gap also required a real WebGL2/context/console run. Every
one of those findings is repaired in the next freeze; none was waived.

That next freeze was staged tree
`f941e8f77d025b394d22a7387e5a4c7ca51f5c54`, cached binary-patch SHA-256
`68faddca2dc74b05740cc2d88a1a086c59afa1b734fc92a83f6e1c41289a0e1e`.
It was also rejected with P0=0 and two independent P1 findings. The science
review found that finite connections were incorrectly labelled with periodic
edge-orbit/lattice-translation metadata. The software review established from
Three.js r185 source that skipping `WebGLRenderer.dispose()` after context loss
would retain old canvas listeners and rebuilt caches across restore cycles.
The new repair branches finite versus periodic connection metadata, adds
`periodic-3d-only`/`zero-required-not-applied` applicability to the image-shift
frame, tears down the old runtime during loss and tests two consecutive
loss/restore cycles with every old renderer and controls object disposed exactly
once. Neither finding was waived.

The following repair was frozen as staged tree
`071d11ac710aea1814df8204561f3464853e1e31`, cached binary-patch SHA-256
`d953b21e5ff7808a4d74d9503c8c6df2a0c822e737594b82d72caef8c780257b`.
Independent software/numerical review and Gap Planner review both returned GO
with P0=0, P1=0 and P2=0. Independent science review returned GO with P0=0,
P1=0 and one non-blocking P2: the finite-topology duplicate-edge rejection
message incorrectly called the edge periodic. The rejection semantics, digest
and geometry were correct, but the main agent chose to close the wording defect
rather than accept it. The error is now topology-neutral and the same test
probes a reversed duplicate finite edge while asserting that its diagnostic
does not contain `periodic`. Because source and test bytes changed, every GO on
tree `071d11ac710aea1814df8204561f3464853e1e31` is treated as superseded rather
than transferred to the next freeze.

The first assertion repair was frozen as staged tree
`b33c047f92c8634a1fbfa978d94bfa40d2aeab2e`, cached binary-patch SHA-256
`44faaead8f4b8c1141cf031b0973daa375647cc54b0c3bcd89a879f2ec23c16c`.
Science and Gap Planner review returned GO with no findings. Software review
returned GO with one P2: Vitest passes the complete `Error` object to an
asymmetric `stringContaining` matcher, so negating that matcher did not prove
that the error message omitted `periodic`. The implementation and preceding
positive regression assertion were already correct, but the evidence claim
was too strong. The test now captures the thrown `Error.message`, requires a
diagnostic to exist and applies `not.toContain('periodic')` to that string.
Tree `b33c047f92c8634a1fbfa978d94bfa40d2aeab2e` is superseded and its GO results
do not transfer.

One initial full-test attempt against superseded tree
`071d11ac710aea1814df8204561f3464853e1e31` was stopped after
the unchanged V048 legacy-collapsed-fixture test exceeded its explicit
30-second timeout under concurrent review load (33.483 seconds). The exact
test then passed in isolation in 6.022 seconds; all three tests in its file
passed in 18.95 seconds. This is evidence of a load-sensitive timeout, not a
passing full-suite gate. A fresh uninterrupted full suite remains mandatory on
the final source freeze and only that result may satisfy the gate.

The first review's earlier P1 findings are closed by negative tests that cover
decoded NUL keys, private shared-byte snapshots, exact plain receipt snapshots,
astral code-point boundaries, exact array-own-key sets, hidden/symbol deep
freeze, oversized-file zero-read, stale import suppression, receipt retention,
successful/hidden/lost/restored/failed WebGL lifecycles and canonical render
ordering. Direct `canonicalJson` coverage now proves pseudo-index properties
cannot be omitted from a digest. The unavailable-output test asserts the exact
key set including `causalEffect`.

### Local focused and browser evidence before final freeze

- Pinned runtime: official Node.js `v24.16.0` at
  `/private/tmp/tf-r16da-flat-npm-review.Im0Y0j/node-v24.16.0-darwin-arm64/bin`;
  pinned GitHub CLI `2.98.0` at
  `/private/tmp/tf-gh298-binaries-veVuGy/macos-arm64/gh_2.98.0_macOS_arm64/bin/gh`.
- Structure-focused Vitest: 9 files, 67 tests, all passed after the last source
  repair. This includes seven real-component/fake-runtime lifecycle tests,
  maximum semantic cardinality, all 118 identities and every listed negative
  contract boundary.
- TypeScript `tsc --noEmit`: pass. Full repository ESLint: pass.
- Production build and isolation check: pass, 78 files, 5,729,901 bytes,
  content digest
  `sha256:d0a0188a0113860a04f6e37aca96621c0dc2d495e61acfe2a11772b89314e91c`;
  the Vite output retained its non-blocking greater-than-500-kB chunk warning.
- Final synthetic native boundary fixture: 4,096 atoms cycling Z=1–118,
  8,192 unique finite display-only connections, 2,030,908 bytes, raw SHA-256
  `ef98fb08cdd9dd37070d491286a8f9e81c12128e6f71fc1cfb1d7cccb3a35676`.
  Its title explicitly says synthetic and makes no physical-material claim.
- In the in-app Chromium production build, that fixture reached
  `Atoms (4096/4096)`, `Explicit display connections (8192/8192)` and
  `Static viewer status: ready` with a real WebGL2 drawing buffer of
  1,564×964. Its raw import receipt was visible and bound. Atom 118 displayed
  `118 · Og · oganesson`; three visible solver cards remained `ABSTAIN`.
- Page-native import instrumentation measured 896.8 ms from the file-change
  event through two frames after a newly initialized WebGL ready. Observed JS
  heap delta was 30,024,381 bytes; two long tasks totaled 696 ms with a
  555 ms maximum. This is a single-machine acceptance observation, not a
  cross-device performance guarantee.
- On the same maximum document, a title draft edit reached two frames in
  80.2 ms with zero observed long tasks. The accepted semantic digest stayed
  `sha256:8bc71ace7f42f3f8d0d8029650068dfb7982ba571b5292c2229295d12aa0a218`
  and one canvas remained, proving draft edits do not mutate the accepted view.
- Two consecutive real `WEBGL_lose_context` cycles moved the status to
  `context-lost`; each restore rebuilt the runtime and reached `ready` only
  after another successful frame. The component test independently proves each
  retired renderer and controls instance is disposed exactly once. A fresh CDP
  event window covering reload, maximum import, both loss/restore cycles and a
  final re-import contained
  zero console warnings, zero console errors and zero uncaught exceptions. Two
  informational Three.js context lifecycle logs were present. A site icon was
  added so this same window also had no favicon 404.

### Source and claim boundaries

- The identity-only catalog points to the official IUPAC CRA PDF at
  `https://iupac.org/wp-content/uploads/2022/07/IUPAC_Periodic_Table-04May22_CRA.pdf`,
  55,608 bytes, SHA-256
  `ef6ca2f6d46554f96e30ad3a60693d6630fe45ad81ce83cb14e508c6cbb7d3b3`.
  The PDF presentation is not redistributed; weights, radii and colors are not
  imported.
- Public MatterSim/MACE comparator coverage remains the externally audited,
  non-contiguous Z=1–83 and Z=89–94 set. Neither model has been run by this
  milestone. No leakage certification, SOTA equality/superiority or all-element
  solver coverage is claimed.
- Native JSON is the only accepted format. XYZ, extXYZ, CIF and V3000 remain
  unavailable. A valid structure is representable/viewable, not necessarily a
  molecule, stable material, parameterized system or solvable model input.
- Existing `tf.world/0.3`, `tf.action/0.3` and `tf.observation/0.3` compatibility
  surfaces are unchanged. Existing scorecard/evaluator source is unchanged.
- Energy, force, stress, physical/partial charge, bond order, velocity,
  trajectory, electron density, orbitals, uncertainty and causal effects are
  unavailable. User connections never become causal or energetic claims.

### Live lifecycle snapshot before final freeze

- GitHub main/API and `origin/main` remained
  `ecff55ffd3d5d0d65236d5c5a8da302403253cf8`; open PR count was zero.
- Exact-main Tailing Sentinel run `34051795677` remained successful; its
  reporter run `34055477390` remained correctly skipped for a push source run.
- Canonical Cloudflare URL returned HTTP 200 and title
  `Tailing Future — 材料世界模型实验室`. It still served the previous main
  artifact and is not evidence for this candidate.
- The unrelated dirty primary worktree remains untouched. All implementation
  and browser work occurred in the isolated worktree named above.
- Commit, push, PR, candidate CI, branch-protection decision, merge, first-main
  CI, release artifact validation, deployment and post-deploy smoke for this
  milestone are all pending. They must remain separately reported.

### Final reviewed source freeze and independent dispositions

The last executable-source freeze before this record-only completion was based
on HEAD/base `ecff55ffd3d5d0d65236d5c5a8da302403253cf8`, staged tree
`4a10836ec3e94d1162fcf8e19606173952393dfd` and cached binary-patch SHA-256
`1b7f2252a7b52baf4c505e53fc9d450fcddb67a40f6ecd17bd6cb8bb5be57adb`.
It contained 23 candidate files and had no unstaged or untracked entries.
`git diff --check` and `git diff --cached --check` passed. The frozen
`tf.world/0.3`, `tf.action/0.3` and `tf.observation/0.3` surfaces, scorecard and
evaluator implementation were unchanged.

- Scientific Evaluator `/root/custom_structure_final_science`: GO, P0=0,
  P1=0, P2=0. It independently reran 9 structure files / 67 tests and verified
  the finite/periodic geometry split, image-shift applicability, identity-only
  element catalog, fixed solver abstentions and all scientific claim boundaries.
- Software/numerical/evaluator reviewer `/root/software_reviewer`: GO, P0=0,
  P1=0, P2=0. Its child parser audit independently checked strict parsing and
  contract closure. It verified resource teardown over repeated context-loss
  cycles, exact record/schema/runtime consistency and the final finite-edge
  diagnostic mutation test. The reviewer found and then verified closure of
  both the ineffective asymmetric matcher and the record attribution ambiguity;
  neither was waived.
- Gap Planner `/root/custom_structure_final_gap`: GO, P0=0, P1=0, P2=0. It
  confirmed that this candidate adds only bounded L0 static representation and
  interaction, does not promote the champion score, and does not turn external
  MatterSim, MACE, AIDO Cell, PFHub or Cantera references into reproduced
  results.

Each reviewer rechecked the exact freeze identity before and after its read-only
work. All prior freezes and every disposition are preserved above. No P0, P1
or accepted P2 remains.

### Final executable gates on the unchanged source

- Focused structure suite: 9 files / 67 tests passed, including the maximum
  4,096-atom / 8,192-connection round trip and all 118 element identities.
- Full repository lint and `tsc --noEmit`: passed on pinned Node.js v24.16.0.
- Uninterrupted `npm test`: passed. JS core reported 123 files passed and 2
  intentionally skipped, with 1,398 tests passed and 5 intentionally skipped.
  The separately isolated observer-snapshot suite passed 2/2 tests in
  1,774.06 seconds. Python reported 91 tests passed with one intentional skip,
  then 42/42 and 3/3 passed. The unchanged V048 file that timed out on the
  superseded, concurrently loaded attempt passed 3/3 in this full run.
- The 10,000-step aqueous long verification completed with maximum relative
  energy excursion `1.4348723343311155e-4`; its deterministic evidence and
  work receipts remained digest-bound. Existing molecular, periodic,
  thermochemical, schema, mutation and isolation suites all passed. This does
  not add a new external-solver reproduction claim.
- `npm run atomistic:validate`: passed for two pinned models and two benchmark
  entries while explicitly retaining `FULL CANDIDATE FROZEN 693×2 — NOT RUN`,
  Random-TP rights `3/3 ABSTAIN`, `DISPATCH BLOCKED` and
  `BOOTSTRAP RUNTIME FROZEN — NOT SCIENTIFICALLY REPRODUCED`.
- Local deterministic Sentinel: `CONDITIONAL`, 41.00/100, three existing next
  gaps and `hardGateFailures=[]`. The local report retained
  `sourceRevision=null`, all upstream CI fields as `not-reported-local`, and a
  Darwin arm64 runtime boundary. The first pre-record binding enumerated 445
  source files. No scorecard value was changed or promoted.
- Production build and release isolation: passed with 78 files, 5,729,883
  bytes and content digest
  `sha256:bd8723d8e34e260662b6e34376313ce20f5c9436dc3cda34a2cad2b10734f598`.
  The greater-than-500-kB Vite chunk warning remained non-blocking and is not a
  performance pass. The public evaluation boundary contained 4,804 bytes and
  all eight forbidden private fields were absent.
- `npm audit --audit-level=low --json`: exit 0, zero info/low/moderate/high/
  critical vulnerabilities; dependency totals were production 20, development
  661, optional 173, peer 35, total 718. `npm ls --all`: exit 0; reported unmet
  entries were platform/feature optional dependencies only. No dependency or
  lockfile changed.

The tracked evaluation outputs and production bytes depend on this record's
source digest, so their authoritative post-record values cannot be duplicated
inside this source file without creating a self-reference. Promotion therefore
requires, after this paragraph is frozen: one fresh local Sentinel run that
binds this exact record and retains 41/CONDITIONAL/no hard gates, one fresh
production-isolation build, staging of the four canonical generated reports,
and a final read-only manifest/record check. Those generated reports are the
authoritative digest-bearing evidence. No commit is allowed if that post-record
binding differs in verdict, score, hard gates, source inventory or boundaries.

### Lifecycle state at record completion

- Local implementation, focused/full tests, independent reviews, atomistic
  validation, preliminary Sentinel, production isolation and dependency audit:
  complete as detailed above.
- Commit, push, PR, candidate CI, branch-protection decision, merge, first-main
  CI, exact release-artifact validation, Cloudflare deployment and canonical
  post-deploy smoke: still pending and must be reported as separate states.
- The unrelated dirty primary worktree remains untouched. Before commit the
  main agent must fetch `origin/main`, prove no conflicting new main commit and
  rebase or stop rather than overwrite remote work.

### Next round (maximum three tasks)

1. Close every v0.5 execution-admission gate, including qualified external
   Random-TP authorization, label isolation, full scientific validators and the
   OCI/runtime trust root; a project self-signature must not count.
2. Execute and independently recompute the fixed MatterSim and MACE checkpoints
   on all 693 Random-TP frames twice in clean isolation, recording energy,
   force, stress, error, throughput, memory, environment and digests without
   leakage-certification or SOTA claims.
3. Connect only digest-bound results to a per-document, per-model
   `ADMIT`/`ABSTAIN` capability matrix in this workbench; unsupported species,
   topology, validation domain or missing execution receipts must remain
   `ABSTAIN`, and raw model disagreement must not be labelled calibrated
   uncertainty.
