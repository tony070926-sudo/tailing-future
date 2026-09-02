# Tailing Future

Tailing Future is an evidence-first materials and chemical-engineering world-model lab. It starts with a small solver that can be tested, then grows scale by scale toward atomistic, mesoscale, continuum, reactor and process models.

Live lab: [tailing-future.tony070926.workers.dev](https://tailing-future.tony070926.workers.dev). Releases originate only from protected `main` through the guarded Cloudflare workflow. The additive v0.4.11 candidate retains the v0.3.1 R7b1 evidence boundary: the full 693-by-two atomistic run remains **not run**, with no authoritative scientific receipt or public producer artifact.

The locked **R2 / CONDITIONAL** scorecard champion remains intentionally narrow:

- a deterministic two-dimensional, force-shifted Lennard–Jones solver embedded in a periodic Fourier heat field;
- grid-independent area heat capacity and pulse energy, with three-mode two-dimensional Fourier convergence order above 1.8;
- exact two-reservoir exchange, atomic A→B settlement and normalized per-operator / cumulative energy closure gates;
- executable `tf.world/0.3` and `tf.action/0.3` schemas, atomic rollback, deterministic checkpoint continuation and unique branches;
- an eight-seed × 5,000-step PR tail gate with p50/p95/p99/max reporting and explicit compute budgets;
- a live particle/heat/species view whose pixels, values, state ID and ledger come from one observation;
- a versioned SOTA registry and Sentinel evaluator that runs physics and schema checks rather than trusting evidence labels;
- a machine-validated atomistic reproduction protocol, label-free structure bundle, isolated dependency/bootstrap path and receipt contract for MatterSim 5M and MACE-MPA-0 on Random-TP. Protected main has completed ten-record checkpoint smoke inference for both models; no retained smoke bundle contains reference labels or accuracy metrics, and the full dual-model benchmark remains **planned-not-reproduced**. Earlier R6a failures and contradictory R6b positive nested claims remain inadmissible. Commit P `f861b3e` established the quarantined v2 producer; Commit S `687755a` selected only P's exact Git blobs through a verified source→build→container mapping. Fresh protected-main runs [`33242996794`](https://github.com/tony070926-sudo/tailing-future/actions/runs/33242996794) and [`33242999376`](https://github.com/tony070926-sudo/tailing-future/actions/runs/33242999376) both succeeded. The protected-main Commit-V verifier run [`33296529694`](https://github.com/tony070926-sudo/tailing-future/actions/runs/33296529694) independently re-fetched their metadata, logs and raw archives, emitted one canonical negative-claim receipt and attested its exact bytes through GitHub OIDC/Sigstore. Commit F vendors that receipt, its Sigstore bundle and a captured trusted root, then freezes only the authenticated stable bootstrap roots at **2 / 2**. The evidence class is `runtime-frozen-not-reproduced`: it is not a 693-record result, accuracy comparison, scientific reproduction, organizationally independent review or industrial release.

## Bounded v0.4 molecular-dynamics foundation

The local `0.4.0-r8-atomistic-dynamics-foundation` candidate adds a deliberately
small, separate dynamics contract. R2 remains the conditional champion and no
score, external-model evidence class or promotion claim is increased:

- exactly two rigid TIP3P water molecules with fixed body-frame orientation;
- center-of-mass translation only, with torque reported but not integrated;
- a vacuum, isolated constant-energy target advanced by fixed-step Velocity
  Verlet at `0.0005 ps`, capped at `10,000` cumulative steps (`5 ps`);
- fixed-charge cross-molecule Coulomb interactions plus the O–O 12–6
  Lennard–Jones term, using parameters transcribed from the OpenMM 8.5.1 TIP3P
  XML snapshot;
- deterministic typed actions and observations, separate physical/state
  digests, exact serialization continuation, branching, semantic restoration
  checks and byte-for-byte rollback on rejected transitions;
- a hard maximum-relative-energy-excursion envelope, alongside a serialized
  ordinary-least-squares energy-drift diagnostic.

The TypeScript kernel does **not** execute OpenMM, MatterSim or MACE. NaCl
remains a static finite-shell viewer, and this slice is neither complete
molecular dynamics nor electronic structure or an industrial predictor. See
[Molecular dynamics](docs/MOLECULAR_DYNAMICS.md) for the exact contract and
claim boundary.

### Local v0.4.1 periodic atomistic candidate

The next unpromoted slice adds a solver-driven three-dimensional periodic
observatory around a 32-atom FCC argon calibration cell. It includes a general
right-handed 3×3 cell, exact triclinic minimum image, deterministic Verlet
half-list, force-shifted short-range pair potentials, fixed-cell NVE Velocity
Verlet, wrapped coordinates plus image counters, force/velocity/virial layers
and face-split trajectories. Its locked verifier runs a 10,000-step trajectory
and a separate 10,000-step replay, with conservation, force finite-difference,
neighbor-oracle, mutation and digest gates.

This is still a local classical calibration, not NaCl–water, long-range
electrostatics, a learned potential, electronic density or a materials
prediction. NVT/NPT, a complete constrained integrator, production Ewald/PME,
cross-platform bit-exact evidence and signed append-only lineage remain future
work. R2 remains the conditional champion and the scorecard is unchanged.

### Local v0.4.2 aqueous calibration candidate

This unpromoted slice adds separate small-system references and composes
them into a locked eight-site periodic calibration world without changing or
reinterpreting the v0.4.1 Argon world:

- a neutral-cell, three-dimensional direct Ewald sum with explicit real,
  reciprocal and self energies plus analytical forces; and
- deterministic mass-weighted SHAKE position and RATTLE velocity projection
  across orthorhombic and triclinic periodic boundaries;
- an explicit aqueous topology with rigid TIP3P constraints, nonbonded
  exceptions and compatible Na+/Cl- parameters bound to pinned OpenMM source
  bytes; and
- constrained Velocity Verlet, transactional world actions and immutable
  step-0/step-1 observations consumed by an audited WebGL2 depth scene.

A deterministic 15-gate aggregate checks the rocksalt point-charge Madelung
energy, triclinic finite-difference forces, Ewald split/cutoff convergence,
fail-closed resource and model-domain errors, exact large-image invariance and
the three TIP3P distances plus velocity, component-COM and momentum closure.
OpenMM 8.5.1 source assets are bound only as immutable commit/path/size/digest
metadata; OpenMM is not executed and the assets are not bundled.

A separate local cold-start verifier executes 10,000 accepted NVE steps
(`10 ps`) and a 10-step independent prefix replay. Its report is internally
digested but is not yet a protected-main CI artifact, so release provenance
remains rejected. The interactive renderer deliberately accepts only the exact
step-0 and step-1 audit frames: eight real selectable sites in a sodium-anchored
minimum-image molecule gauge, four O–H structural constraints, two optional
H–H diagnostics, actual evaluated LJ segments, the triclinic cell, and total
plus component forces. It uses true WebGL2 depth and fails over to a semantic
data table on context loss or unavailable WebGL2.

This is still not PME, an OpenMM reproduction, bulk NaCl(aq), a concentration
series, virial/stress evidence, parameter-license clearance or a score
promotion. See [NaCl–water v0.4.2 science contract](docs/NACL_WATER_V042_CONTRACT.md).

### Local v0.4.3 exact-endpoint trajectory extension

The current unpromoted extension leaves every v0.4.2 frame contract and
verifier unchanged. On an explicit user action it constructs a fresh locked
eight-site world twice, executes the complete accepted-step prefix `0..10` in
each run, and emits a trajectory bundle only when all 11 ordered sample digests
and the trajectory digest match exactly. Each sample contains the full solver
observation and a separate `tf.aqueous-dynamics-render-frame/0.4.3` projection;
the determinism receipt also accounts for the replay work.

The WebGL timeline selects exact endpoints only. Playback, range seek and the
raster requestAnimationFrame loop do not call `advance`, and renderer
interpolation remains `null`. Trajectory scenes use each molecule anchor's
source unwrapped coordinate plus minimum-image internal water placement in a
fixed display epoch, rather than recomputing the whole scene around a moving
Na+ reference. The original sodium-anchored step-0/step-1 v0.4.2 scene remains
its own unchanged oracle.

This is still an eight-site `0.01 ps` finite-size demonstration, not a bulk
solution, NaCl crystal-water interface, dissolution/crystallization trajectory,
OpenMM/PME reproduction or large-system rendering claim. Atom instancing,
chunked binary trajectory transport, a Worker/compute service and a validated
external-engine interface artifact remain subsequent gates. No score,
champion, commit, release or deployment status changes with this local slice.

### Local v0.4.4 aqueous-system and force-backend seam

The additive, unpromoted v0.4.4 plan introduces
`tf.aqueous-system-spec/0.4.4` and
`tf.force-backend-manifest/0.4.4`. The first contract fixes physical-system
identity, source pins, atom order, composition, cell, force/preparation/
dynamics settings and acceptance boundaries; the second fixes the external
engine, runtime, platform, capability, determinism, fallback and license
claims independently of that system. The executable v0.4.2 eight-site world
and v0.4.3 exact-endpoint trajectory remain frozen rather than being widened
into a larger system.

Its first declarative external-control candidate pins the OpenMM 8.6.0
`tip3p.pdb`, Amber14 `tip3p.xml` and license-notice bytes for a 3 nm cubic box
containing 895 rigid TIP3P waters (2,685 particles). Its artifact ID is
`tf.openmm-pure-water-cold-start-pme-control/1`; it deliberately makes no
“bulk” identity claim. The plan requires PME with a 1 nm cutoff, a canonical
OpenMM `Reference` preparation/replay lane, a separate single-thread `CPU`
fixed-coordinate comparison lane, and a shared portable start state before a
1 ps fixed-cell NVE run could emit 101 samples. Reference exactness is scoped
only to fresh processes on the same host and pinned container. Package index,
container registry/repository/tag and exact OpenMM/NumPy wheel URLs, sizes and
digests are single-sourced; fallback to another source, algorithm or platform
is forbidden.

The explicit nonzero `setPMEParameters` alpha and requested grid make the
recorded `1e-4` design tolerance non-operative in OpenMM. Each lane must instead
receipt its own `getPMEParametersInContext` alpha/grid readback, which the
platform may adjust. Acceptance definitions lock the 101-sample domains,
denominator floors, same-coordinate CPU/Reference potential-energy error at
`1e-5`, Euclidean per-particle force median and global-L2 errors at `1e-4`,
plus ascending group 0→3 energy/force closure at `1e-8` across both lanes and
all five comparison steps. The future `ForceEvaluation` request carries the
cell and all 8,055 coordinate components; its result carries every group
energy and complete O(N) total and per-group force arrays. Runtime validators
enforce exact array cardinality, finite canonical numbers, coordinate/request
identity, per-array digests, response lineage, and group closure. These are
envelope interfaces only, not a force-backend implementation.

This is **planned-not-executed** contract work. No OpenMM context, PME force,
minimization, velocity initialization or trajectory has been run, and no
prepare, evaluation, replay, attestation or protected-main artifact exists.
The source pins do not establish redistribution or parameter/coordinate
license clearance. The finite cold-start box is not equilibration, bulk-water
validation, density convergence, RDF/diffusion evidence, an ion or NaCl-water
interface result, dissolution/crystallization evidence or an industrial
prediction. It raises no score and changes no champion or release state. The
v0.5 NIST PFHub Benchmark 3 and Cantera 3.2 route remains unchanged.

### Local v0.4.5 OpenMM evidence producer and 3D handoff boundary

The unpromoted v0.4.5 slice implements the producer and independent-assessment
code for that frozen control without changing its plan or system digests. A
Linux/amd64, Python 3.12.11 worker is pinned to exact OpenMM 8.6.0 and NumPy
2.2.6 wheel bytes. Separate fresh processes prepare the portable state, run
Reference A and Reference B, and evaluate the CPU platform only at five fixed
Reference-A coordinates. The producer writes complete binary64 arrays plus
self-digested runtime, preparation and lane receipts, then publishes a
`complete-pass` outcome only after the final manifest has bound its prospective
bytes. That outcome concerns producer execution integrity, never scientific
acceptance.

The Node verifier independently reads the closed output tree, checks every
descriptor and receipt-parent link, compares the eight Reference arrays as raw
bytes, recomputes the locked energy, constraint, force and force-group gates,
and emits a schema-checked receipt through
`npm run atomistic:verify-openmm-control -- ...`. Its digest is derived from
the exact verifier sources, schema and package locks. OpenMM State kinetic
energy is treated as the integrator-adjusted, constraint-projected value at the
position time; exported Verlet velocities remain raw half-step readbacks and
are not used to impersonate that State kinetic energy.

This source tree has **not** completed the pinned Linux container run. The
independent receipt therefore distinguishes “execution reported by producer”
from “execution authenticated”; the latter remains false. The final derived
container-image digest, successful protected-main CI run, attestation,
redistribution clearance and public payload are absent, so promotion and
Cloudflare distribution remain forbidden.

The repository now contains a manual protected-main workflow at
`.github/workflows/openmm-tip3p-protected.yml`. In one private Ubuntu 24.04 job
it acquires the five exact inputs, verifies the base-image index/platform and
Dockerfile-frontend digests, builds without networked Dockerfile steps, runs a
non-root/no-network/read-only container, independently verifies the complete
private payload and requires `verified-pass`. The same job can now freeze a
digest-locked Chromium runtime, Node 24.16.0 and the one exact Rolldown native
binding needed by the in-memory client build. It loads a temporary root-owned
AppArmor profile attached to the exact Chromium executable, enters that profile
for the bounded Node/Chromium process tree before `no-new-privileges`, proves
`userns` under the same non-root/capability-empty boundary, and unloads the
profile in the always-run cleanup without disabling Ubuntu's global restriction
or Chromium sandboxing. It then presents one exact session-bound 101-frame
positions derivative through happy, dispose and context-loss browser modes
inside separate mount/network/PID namespaces. The public evidence binds the
world session, V048/V049 metadata, F32 positions, ordered frame and packet
digests across all three modes. Each mode must reach an exact 37-rendered-frame
audit barrier: happy path explicitly continues to the completed 101-frame draw,
while the other two terminate at 37 and prove that count remains frozen. Only
eight bounded administrative source records—including one coordinate-free
browser evidence record—plus one sanitized envelope may cross into the
nine-file Actions artifact. Coordinates, parameters, wheels, raw arrays,
browser mode receipts and runtime trees stay ephemeral and are removed before
staging. A separate job with no checkout or repository execution revalidates
all nine files, the envelope's eight source bindings, the browser evidence
self-digest and conservative claims, and GitHub artifact metadata before
attesting only the envelope. The entire workflow and each executable step are
locked by the source policy, but this workflow has not yet run on protected
`main`. A successful attestation would still require a separate versioned
verifier to issue any authenticated-execution receipt; it does not mutate or
promote the v0.4.5 scientific receipt.

The 3D handoff is now a Node server-only loader. After matching an external
receipt to a fresh verifier result, it independently rereads the same
digest-bound private artifacts and materializes an immutable 101-frame session
of offsets, per-frame byte digests, time, step and energy metadata. It returns
no `Buffer`, typed array or public coordinate payload, and a real Client
Component import is rejected at build time. This is still an unattested private
scientific-payload handoff, not proof of a reproduced OpenMM run. The public UI
is not switched to these arrays until an exact protected-main artifact and its
attestation pass the release guard and redistribution is cleared.

An additive private V046 entry can select frame 0–100 from that same stable
artifact snapshot and convert its three exact F64LE slices into the existing
F32 presentation handle. The ordinary returned object remains recursively
frozen, contains only serializable metadata and `publicPayload:null`, and gains
no handle property or symbol. A module-private `WeakMap` releases the derived
F32 handle only for the exact original server object; JSON, spread and
`structuredClone` copies lose the capability. Source F64 bytes are never
reachable from the result, while the derived F32 bytes intentionally remain
private until that capability is garbage-collected. This path is not wired to
a route, Client Component, Cloudflare payload or public cache.

### Local v0.4.10 NaCl{100}–water geometric interface contract

The additive v0.4.10 foundation constructs a complete, deterministic
6,336-site coordinate seed rather than enlarging the eight-site calibration:
576 Na⁺, 576 Cl⁻ and 1,728 rigid TIP3P waters in a fully three-dimensional
periodic `3.38412 × 3.38412 × 6.76824 nm` cell. A 6×6×4 `Fm-3m` rocksalt slab
has eight neutral mixed `{100}` planes and equally populated water regions on
both sides. Every site has stable identity, mass, formal charge, force-field
point charge, xyz, phase/residue
and crystal-layer or water-grid labels; all O–H links and rigid constraints are
explicit. NIST's 26 °C `0.56402 nm` lattice constant is used only as an
experimental geometric seed, and the regular water packing is explicitly not
equilibrated liquid.

System, coordinate, topology and plan digests form one chained identity set.
Closed JSON schemas structurally prefilter the system, full 6,336-site
coordinate seed, combined plan, actions and observations; they cannot recompute
hashes or prove cross-record topology. The exact runtime validator recomputes
the locked self-digests before either actions or observations are trusted.
Read-only inspection is the
only admitted action: interface preparation and mobile dynamics requests return
all four missing prerequisites—protected pure water, low-salt PME, dry-slab
stability and solid/interface potential qualification—without changing state or
invoking a solver. The OpenMM 8.6 TIP3P/Joung–Cheatham bytes are a candidate
parameter family, not validated solid-interface, solubility or phase-equilibrium
evidence. Even if those four solver-admission gates later pass, bulk
concentration, uncertainty and finite-size controls remain separate gates before
hydration, detachment, dissolution or crystallization can be interpreted.

Accordingly, this milestone adds no OpenMM/PME trajectory, force, energy,
hydration, dissolution, crystallization, learned world-model, score, release or
deployment claim. See the exact [v0.4.10 interface contract](docs/NACL_WATER_INTERFACE_V0410_CONTRACT.md).

The additive v0.4.11 handoff now exports those exact 5,053,426 JSON bytes to a
standard-library-only Python semantic importer. Python independently rebuilds
the six-level digest graph, all 6,336 atom identities, crystal/water geometry,
charges, cell, 3,456 links and 5,184 constraints, then emits a read-only bundle
of typed F64LE/U32LE arrays plus a canonical identity ledger. A separate Node
verifier decodes and compares every output value with the locked TypeScript
plan. Both layers fix OpenMM import, system compilation, solver execution,
scientific reproduction, promotion and public-release eligibility to false;
source metadata is pinned, while source bytes and redistribution clearance are
not claimed. See the exact [v0.4.11 semantic-import contract](docs/NACL_WATER_INTERFACE_V0411_IMPORT_CONTRACT.md).

This is an educational and numerical-verification prototype. It does not yet
validate or predict a material process, reaction, plant or safe operating
window, and it must not be used for engineering decisions.

## Why this order

GenBio AI's AIDO program provides a useful systems pattern: build modules independently, connect them using domain structure, then align the combined system. AIDO Cell adds a persistent shared-state world-model harness with action-conditioned transitions, readouts and branching, while AIDO Foundry supplies a separate build and evaluation loop. Tailing Future adapts that pattern to a non-linear materials/process graph while retaining explicit physical solvers and conservation gates.

See [Architecture](docs/ARCHITECTURE.md), [Molecular dynamics](docs/MOLECULAR_DYNAMICS.md), [Atomistic reproduction](docs/ATOMISTIC_REPRODUCTION.md), [Evaluation loop](docs/EVALUATION_LOOP.md), [Research baseline](docs/RESEARCH_BASELINE.md), [Roadmap](docs/ROADMAP.md) and [Safety boundary](docs/SAFETY.md).

## Run locally

```bash
npm install
npm run dev
```

Run the complete lightweight gate:

```bash
npm run check
```

The gate runs lint, numerical tests, the Sentinel comparison report and a production build. The generated report is written to `evaluation/latest-report.md` and `evaluation/latest-report.json`.

## Evidence policy

- `E0`: concept or unsupported claim;
- `E1`: executable component or analytic toy case;
- `E2`: reproducible multi-component verification with locked contracts, conservation gates and public CI;
- `E3`: public held-out, OOD, cross-solver or blind experimental validation;
- `E4`: independent external replication or real industrial blind test.

Vendor-reported performance is recorded as such and never silently treated as a reproduced baseline. A higher maturity score cannot override a failed conservation, safety, leakage or license gate.

## License

No project license has been selected yet. External models and datasets are not bundled; each future integration must record its own license and redistribution terms.
