# Bounded v0.4 molecular-dynamics foundation

## Status and purpose

The local v0.4 implementation is a small L1 atomistic state-transition test. It
adds real time integration, conservation diagnostics and restorable state to a
single controlled water-dimer scenario. It is separate from the current
**R2 / CONDITIONAL** champion. The candidate identity is
`0.4.0-r8-atomistic-dynamics-foundation`; the scorecard records the new local
artifacts but leaves every evidence score, external-model evidence class and
promotion decision unchanged.

The opening water-dimer sections describe behavior implemented in the local
TypeScript world and covered by focused tests. Later sections separately label
Python/OpenMM, private Chromium and protected-workflow code as local evidence,
source-only implementation or protected-run evidence. None of these layers
claims a complete molecular-dynamics engine, a learned biology-style world
model, electronic structure, real-material validation or industrial predictive
capability.

## Locked scenario

The world is `tf.world/water-dimer-fixed-orientation-isolated-energy/v1` and
contains exactly two TIP3P water bodies (`water-a` and `water-b`):

- each monomer has one oxygen and two hydrogens;
- O–H distance is `0.9572 Å` and H–O–H angle is `104.52°`;
- oxygen charge is `-0.834 e` and each hydrogen charge is `+0.417 e`;
- oxygen Lennard–Jones parameters are
  `sigma = 3.150752406575124 Å` and `epsilon = 0.635968 kJ mol⁻¹`;
- oxygen and hydrogen masses are `15.99943 Da` and `1.007947 Da`;
- the initial O–O separation is `2.9 Å`, the donor angle is `0°`, and both
  center-of-mass velocities are zero.

These geometry, charge, mass and oxygen Lennard–Jones values are transcribed
from the repository's OpenMM 8.5.1 TIP3P XML snapshot. The source of parameters
does not mean OpenMM is executed.

Each water is a rigid body with fixed body-frame orientation. Only its center
of mass and translational velocity evolve. Atom positions are reconstructed
from fixed offsets and every atom in one body shares its body's translational
velocity. The solver reports net torque for inspection but does not integrate
rotation. There are therefore six translational configurational degrees of
freedom, represented together with their six velocity components, not
flexible-water or translating-and-rotating rigid-body dynamics.

## Force and energy model

The force model is
`tf-local-classical-tip3p-openmm-8.5.1-parameters-cross-only/v1`. It evaluates:

1. fixed-charge Coulomb energy and force for all `3 × 3 = 9` atom pairs across
   the two waters; and
2. one 12–6 Lennard–Jones energy and force for the cross-molecule O–O pair.

No intramolecular potential is evaluated because bond lengths, angle and
orientation are fixed. The model has no polarization, charge transfer,
electronic rearrangement, bond breaking, reaction, long-range periodic sum or
learned correction. It is a finite two-body calculation in vacuum.

The locked unit conversions include `100` from
`kJ mol⁻¹ Å⁻¹ Da⁻¹` to `Å ps⁻²` and `0.01` from
`Da Å² ps⁻²` to `kJ mol⁻¹`. Unit constants are tested directly rather than
being inferred from a trajectory.

## Time integration and domain

The integrator is fixed-step, fixed-orientation Velocity Verlet using the
kick–drift–kick sequence:

```text
v(t + dt/2) = v(t) + a(t) dt/2
x(t + dt)   = x(t) + v(t + dt/2) dt
v(t + dt)   = v(t + dt/2) + a(t + dt) dt/2
```

The time step is exactly `0.0005 ps`. One typed step action may request between
`1` and `1,000` substeps, while the cumulative world limit is `10,000` steps,
or `5 ps`. A request beyond that cap is rejected without partial advancement.

The target is vacuum, isolated and constant energy. No periodic cell, volume,
thermostat or barostat exists. Temperature, pressure and stress are explicitly
undefined for this two-fixed-body contract. Calling it a bulk NVE ensemble
would therefore overstate the implementation.

## Energy diagnostics

Every accepted substep updates sufficient statistics over time and total
energy. With

```text
Eref = max(abs(Einitial), 1 kJ mol⁻¹)
```

the hard trajectory metric is the largest observed relative energy excursion:

```text
max_i abs(Ei - Einitial) / Eref
```

It must remain at or below `1e-4`. The observation also reports the current
absolute and signed relative drift and the maximum absolute excursion.

Separately, the accumulated `n`, `Σt`, `ΣE`, `Σt²` and `ΣtE` statistics produce
an ordinary-least-squares slope:

```text
(n ΣtE - Σt ΣE) / (n Σt² - (Σt)²)
```

The observation serializes both the slope in `kJ mol⁻¹ ps⁻¹` and its rate
relative to `Eref` in `ps⁻¹`. These must be finite, but v0.4 does not assign a
separate numerical promotion threshold to the OLS slope. The OLS trend is a
diagnostic; it does not replace or relax the maximum-excursion hard gate.

## Conservation and geometry gates

An accepted state must satisfy all of the following:

| Check | Hard limit |
|---|---:|
| maximum relative energy excursion | `≤ 1e-4` |
| total momentum residual | `≤ 1e-9 Da Å ps⁻¹` |
| internal-force residual | `≤ 1e-9 kJ mol⁻¹ Å⁻¹` |
| center-of-mass analytic residual | `≤ 1e-9 Å` |
| rigid O–H bond residual | `≤ 1e-12 Å` |
| rigid H–O–H angle residual | `≤ 1e-10 degree` |
| O–O separation | `2.45 Å` through `4.8 Å` |
| cumulative steps | `≤ 10,000` |

Every serialized number must also be finite. A failed numerical transition is
transactional: the full mutable state, including accumulated energy statistics,
is restored byte for byte.

## Typed state, determinism and recovery

The interfaces are versioned as:

- `tf.molecular-world-state/0.4`;
- `tf.molecular-action/0.4`;
- `tf.molecular-observation/0.4`.

The schemas reject unknown fields and lock the scenario, force model,
integrator, constraint, boundary, time step and maximum step count. The world
tracks namespace, revision, action count, branch count, parent state, last
action, topology digest and two different state identities:

- `physicalDigest` covers the physical configuration and allows a batch step
  and equivalent incremental steps to be recognized as physically equal;
- `stateDigest` also binds the full serialized bookkeeping and lineage, so
  those histories remain distinguishable.

Focused tests cover exact repetition of the same initial state and action
sequence, batch/incremental physical equivalence, exact continuation after
serialization, distinct branch lineage, digest and topology tamper rejection,
semantic loader rejection, failed-step rollback, second-order convergence and
time reversal. This is determinism for the locked implementation and tested
runtime path; it is not a claim of bitwise identity across every browser,
processor or future JavaScript engine.

Restoration does not trust a matching hash alone. The loader checks locked
options and topology, exact keys, lineage/action consistency, initial-state
references, energy-statistic consistency, domain gates and recomputed digests
before accepting a state. Recomputed-but-semantically-invalid payloads fail
closed.

## Execution and evidence boundary

The v0.4.0 water-dimer trajectory described above is produced by the
repository's local TypeScript force kernel and Velocity Verlet integrator. It
does **not** execute:

- the OpenMM executable, Python API or an OpenMM simulation context;
- MatterSim inference;
- MACE inference;
- an electronic-structure solver.

Consequently, the v0.4 water trajectory is not evidence that OpenMM reproduced
it, and it cannot promote the pinned MatterSim/MACE Random-TP work. The full
`693 × 2` benchmark remains **planned-not-reproduced**, and its authenticated
bootstrap receipt remains `runtime-frozen-not-reproduced`. Existing R2 evidence
and negative-claim boundaries remain unchanged.

The NaCl visualization also remains static. It evaluates a finite central-Na⁺
first-shell point-charge scene in vacuum; it is not advanced by this world, is
not periodic, and is not a stable-crystal or bulk-lattice simulation.

The current result must not be used for material selection, process design,
safety limits, plant control or any other engineering decision.

## Separate v0.4.1 periodic atomistic candidate

The local tree now contains a separate, unpromoted periodic foundation. It does
not alter the two-water contract above and does not promote the locked R2
scorecard. Its calibration fixture is a 32-atom, 2×2×2 conventional FCC argon
cell with a force-shifted 12–6 Lennard-Jones rule. It exists to establish the
mechanics required before any ionic solution or material interface is shown.

The implementation provides:

- a right-handed full 3×3 column-vector cell with fractional/Cartesian
  conversion, bounded wrapped coordinates and integer image counters;
- an exact adaptive closest-lattice-vector minimum image for triclinic cells;
- a deterministic Verlet half-list with a `skin/2` rebuild rule and an
  independent all-pair oracle test;
- analytic Coulomb-reference, Lennard-Jones, Buckingham, Morse and harmonic
  radial terms, with force-shifted nonbonded cutoffs;
- Newton-third-law pair forces, potential energy, virial, per-atom virial proxy
  and fixed-cell NVE kick–drift–kick Velocity Verlet;
- center-of-mass-frame temperature, pressure and stress estimators, while the
  total Hamiltonian retains absolute kinetic energy;
- typed `0.4.1` world/action/observation schemas, deterministic restore replay,
  branch/rollback behavior and a 17-gate executable verifier.

The calibration verifier executes the same locked initial condition twice for
10,000 steps each. It gates energy excursion, momentum, internal force,
center-of-mass motion, mass/charge closure, finite-difference force, minimum
image and neighbor-oracle agreement, periodic face crossings, cache isolation,
runtime mutation rejection and physical/full/observation replay digests.
Neighbor rebuild counts are explicitly process-local cache diagnostics and are
not serialized or included in the physical digest.

The browser observatory is a projection of one immutable observation. The cell
edges, wrapped positions, cross-face neighbor images, velocity, force, local
virial proxy and face-split selected-atom trajectory come from that observation.
The luminous density envelopes are visual identity/stress encodings only; they
are not electron density, orbitals or a DFT result.

The periodic electrostatics interface is a minimum-image short-range reference,
not Ewald or PME. The argon fixture has no bonds, constraints, thermostat,
barostat, reactions, learned potential or uncertainty calibration. The SHA-256
digests support deterministic integrity and replay comparison but are not a
signature of origin; a signed append-only action log and cross-platform golden
digest matrix remain pending. These boundaries must be closed before moving to
the planned NaCl–water interface.

## Local v0.4.6 atomistic presentation path

An additive, unpromoted path now tests how one future 2,685-particle V045
OpenMM frame would become a Three.js scene without allowing rendering to alter
or overstate the scientific state:

```text
validated V045 session + exact F64LE frame bytes
  -> digest-checked F32LE presentation derivative
  -> fixed O-H-H topology and periodic display matrices
  -> three persistent Three.js InstancedMesh objects
```

The conversion is explicit little-endian, component by component. Source and
derived byte digests, dtype, shape, unit, session, frame, atom order and cell
remain bound in the presentation receipt. NaN, infinity, negative zero,
overflow, stale digests, wrong sessions and mutable shared/resizable buffers
fail closed. F32 is a display derivative; the F64 source remains the only
scientific-precision representation.

The instancing plan is restricted to the locked 895-water, 3 nm cubic control.
It derives 895 oxygen and 1,790 hydrogen sites plus 1,790 O-H structural links
from the pinned PDB record convention. Hydrogens are placed relative to their
oxygen anchor using the cubic minimum image, so a molecule crossing a periodic
face is not drawn with a box-length link. The O-H cylinders mean adjacency and
rigid-distance constraint only. They do not imply an energetic bond, bond
order, charge transfer or reactivity.

The Three.js bridge owns one shared atom geometry, one link geometry, three
materials and exactly three body `InstancedMesh` objects. It copies verified
matrices into existing `instanceMatrix` buffers, sets their update flag,
recomputes bounds and maps `Raycaster` instance hits back to the same atom-order
and topology digests. Unit tests cover an actual ray hit and the full 2,685-site
instance mapping. This is scene-object construction only: no browser renderer,
GPU draw, measured draw-call count, FPS or cross-platform visual parity has
been demonstrated.

The server-only V045 materializer still returns `publicPayload:null` and no raw
scientific arrays. A separate V046 private entry now selects an exact frame from
the same stable full-artifact read and exposes its derived presentation handle
only through a module-private `WeakMap` keyed by the original frozen metadata
object. Clones and serialized round trips lose the capability; no F64 source
payload is returned, and the private F32 derivative remains reachable only
through the server-local handle.

The local tests still use synthetic but digest-consistent fixtures. No protected
OpenMM artifact has been converted or rendered, no redistribution right has
been established, and no UI or Cloudflare data path is wired. All
execution-authenticity, promotion, public-distribution and industrial-use
claims remain false.

## v0.4.9 private 101-frame browser evidence boundaries

V049 extends the private presentation path into a bounded, single-use browser
harness without changing the scientific or distribution status. One 101-frame
positions-only owner is encoded into an in-memory packet, served once over an
IPv4 loopback capability, verified in the browser with whole-packet,
aggregate-channel and per-frame WebCrypto digests, and logically zero-filled
after transfer. The browser removes the fragment credential before its packet
request and never emits coordinates, packet bytes, URLs, ports or tokens in its
observation.

The Three scene reuses exactly three InstancedMesh objects through all 101
source frames. Expected triangles are derived from each actual BufferGeometry
index or position cardinality and instance count; the locked scene produces
three calls and 554,900 triangles per frame. Against the synthetic fixture, a
local digest-locked Chromium main executable completed happy,
running-state dispose and context-loss paths. That historical local checkpoint
did not retain a partial-frame count and therefore did not prove a true
mid-playback interruption. The
observer also hashes the actual client JavaScript response against the in-memory
build result, requests Chromium sandboxing and rejects root Linux execution.

The locally exercised input remains an explicitly synthetic spatial fixture.
Those local browser geometry checks establish only noncollapsed rigid-water
presentation sanity, not solver execution, liquid equilibrium, RDF or physical
motion. The path has no force, velocity, energy, stress, charge, field or
electron-density channel; atom and link sizes are nonphysical and the links are
topological. See the
[V049 independent review](../evaluation/reviews/2026-09-02-v049-private-browser-trajectory-review.md)
for that historical local-only checkpoint.

The source now additionally contains a manual protected-main production chain.
After the private OpenMM producer passes its independent control receipt, the
same execute job copies that exact artifact and receipt into separate
root-owned 0555/0444 trees. Three fresh Linux mount/network/PID namespaces run
happy, mid-playback-dispose and context-loss observations with UID/GID 65534,
all five Linux capability sets empty, `NoNewPrivs=1`, loopback-only networking and private
tmpfs state. A run-scoped, root-owned AppArmor profile is attached to the exact
frozen Chromium path; the bounded Node/Chromium process tree enters it before
`NoNewPrivs=1` so it can use `userns`. An actual dropped-credential
user-namespace canary must pass, and the profile is unloaded by the always-run
cleanup. The global Ubuntu restriction,
`nosuid` mounts and `chromiumSandbox:true` remain enabled.

All three modes use one stable world-session identity while receiving separate
random capability tokens. The runner independently binds the world-session,
V048 metadata, V049 browser metadata, F32 positions channel, ordered-position
frames and packet digests before Chromium observes the trajectory. Every mode
must first draw exactly 37 frames and stop at a client-side audit barrier.
Happy path explicitly releases that barrier and reaches 101 frames; dispose and
context-loss terminate at exactly 37, retain that rendered-frame count in the
private and aggregate receipts, and prove that it stays unchanged during a
one-second post-revocation observation window. All three modes record that a
browser draw was observed, while only happy path records trajectory completion.
The interrupted modes make no completed-trajectory claim. The public
browser evidence contains no coordinates, tokens, URLs,
ports or runtime tree and keeps authentication, reproduction, host closure,
promotion, public distribution, license clearance and Cloudflare eligibility
false.

This production chain is implemented source only. It has not run on protected
`main`, so it is not evidence that OpenMM executed, that Chromium rendered the
producer positions, or that cleanup and namespace assumptions hold on the
hosted Linux runner.

### V049 Linux Chromium acquisition and distribution-tree boundary

The Playwright discovery URL for Chrome for Testing `151.0.7922.34` currently
responds with a redirect, so it is not the executable download endpoint. The
acquisition lock retains that address only as discovery provenance and requests
the exact Google Cloud Storage object generation `1784092744255039` with
redirect following disabled. The response stream and the published file are
hashed independently. The production archive is fixed at `193,282,658` bytes
and `sha256:ae8736ac…b9fcf8`; an offline test transport is emitted under a
different test-audit schema and cannot claim network provenance.

The dedicated extractor accepts only a single-link, current-owner, mode-0400
archive and a current-owner empty mode-0700 output directory. It independently
rehashes the archive before and after extraction, validates the local and
central ZIP records, rejects ZIP64, descriptors, encryption, links, special
files, traversal, collisions and unbounded expansion, and creates files through
directory descriptors with no-follow and exclusive semantics. The locked
archive has 308 members, 303 regular files, 11 canonical runtime directories
and 406,847,046 expanded bytes. Its root-stripped distribution-tree identity is
`sha256:ef61b26d…fae658`. The same digest was reproduced from archive bytes and
from a second read of the extracted files.

The extractor intentionally writes a private mutable staging tree: directories
and nine executable members are mode 0700, while all other files are mode 0600.
It also computes, but does not claim to have verified, the expected identity
`sha256:379be99b…04adb3` for a later root-owned frozen tree with 0555
directories/executables and 0444 non-executable files. A separate non-root
preflight and pre/post execution verification are wired to verify that state.
The source also loads an exact-path temporary AppArmor `userns` profile and
runs a non-root, capability-empty, no-new-privileges user-namespace canary
without changing the global restriction or enabling the SUID helper. A real
protected Ubuntu run is still required to validate those host assumptions. The
Chromium distribution still depends on host libraries,
fonts, kernel behavior, Node.js and a graphics backend outside the archive;
therefore complete-runtime immutability, cross-platform equivalence, OpenMM
execution authenticity, reproduction, promotion, release and Cloudflare
distribution remain false. See the
[independent acquisition review](../evaluation/reviews/2026-09-02-v049-chromium-acquisition-review.md).

A built-ins-only preflight now verifies the installed own-package payloads;
the preflight code itself does not import or execute Playwright. `playwright`
has 62 locked regular files and
`playwright-core` has 111. It binds their package-lock records, canonical
content-tree digests and `browsers.json` Chromium declaration. This check
deliberately excludes a package-root `node_modules` subtree; the local Darwin
installation contains optional `fsevents`, while the target Linux run must have
no nested Playwright dependency directory. The audit therefore records an
incomplete host closure and makes no fresh-process, immutable-runtime or
execution claim.

The companion frozen-runtime preflight is wired into the manual protected
Linux x86-64 workflow. It must run as a non-root user against a canonical runtime
root containing only `chrome-linux64`; that root, all 11 directories and all
303 files must be root-owned, single-linked and read-only at the exact 0555 or
0444 modes. It recomputes the complete frozen-tree digest
`sha256:379be99b…04adb3` before launch and is required again after launch. Tiny
fixture tests cover content, count, mode, owner, symlink and hard-link failures.
The workflow also freezes Node 24.16.0 and the exact 19,324,672-byte Rolldown
1.2.6 Linux binding; the repository stays `noexec` and only that SHA-256-locked
native file is bind-mounted executable. No real root-owned Linux checkpoint has
run yet, so browser execution, host-runtime closure, immutable-host claims,
reproduction, promotion and release remain false.
