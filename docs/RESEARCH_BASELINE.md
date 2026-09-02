# Research baseline — 2026-09-02

## AIDO method reference

The [AIDO perspective](https://arxiv.org/abs/2412.06993) and its
[Nature Medicine version of record](https://www.nature.com/articles/s41591-026-04595-0)
are the primary sources for the modular → connectable → holistic sequence.
GenBio AI's [AIDO Cell technical report](https://genbio.ai/research/AIDO%20Cell%20V1%20-%20Technical%20Report%20-%2018%20Aug%202026.pdf),
[release page](https://genbio.ai/aido-cell-simulator/) and
[virtual-cell world-model definition](https://genbio.ai/world-model-of-the-virtual-cell/)
are sources for its linked multi-level state, action-conditioned transitions,
observations, branching and multi-turn use.

Important boundary: the public AIDO Cell claims, including its benchmark coverage and reported wins, are vendor statements. The product is described as a controlled alpha, and novel wet-lab validation and additional temporal/metabolic capabilities are still future work. Tailing Future uses it as an architecture comparator, not as a directly comparable numerical materials baseline.

The official [GenBio AI model hub](https://huggingface.co/genbio-ai) and
[research overview](https://github.com/genbio-ai/Research-Overview) distinguish
the publicly released previous-generation GB.DNA/GB.RNA/GB.Protein/GB.Cell
artifacts from the new closed-alpha AIDO Cell world model. Those older weights
must not be presented as a reproduction of the new product. The public AIDO
Cell images are product/technical-report information graphics rather than
auditable evidence of a 3D atomistic renderer. This iteration therefore borrows
the persistent-state, intervention, branch/replay and same-state multi-readout
information design—not an inferred rendering implementation or numerical
result.

## Browser atomistic rendering references

- Three.js [`InstancedMesh`](https://threejs.org/docs/pages/InstancedMesh.html)
  is the primary API reference for persistent shared-geometry instances. Its
  contract requires an instance-matrix update flag after edits and explicit
  bounding-volume recomputation when instance transforms change.
- Three.js [`Raycaster`](https://threejs.org/docs/pages/Raycaster.html) exposes
  `instanceId` for instanced intersections; the local V046 bridge binds that ID
  back to the authoritative atom-order and topology digests.
- The official [WebGPU instance example](https://threejs.org/examples/webgpu_instance_mesh.html)
  is capability context only. The local V046 tests create Three.js scene
  objects and exercise raycasting in Node; they do not execute WebGL/WebGPU,
  measure `renderer.info.render.calls`, establish FPS or certify a backend.
- [`Data3DTexture`](https://threejs.org/docs/pages/Data3DTexture.html) and
  [`MarchingCubes`](https://threejs.org/docs/pages/MarchingCubes.html) are future
  volume/isosurface mechanisms. They remain disabled until a real field artifact
  supplies kind, units, grid, axes/cell, boundary conditions, source-frame and
  data digests. TIP3P point-charge potential or PFHub phase field would be valid
  future inputs; neither may be labelled electron density.

## Materials and atomistic references

- [EquiformerV3+DeNS-OAM locked Matbench record](https://github.com/janosh/matbench-discovery/blob/0ba474661cf615d10987ba9a2acb8132943aa491/models/equiformer_v3/equiformer-v3-oam.yml) — current auditable crystal-discovery comparator;
- [TECE-OAM-RRA-1.0 locked Matbench record](https://github.com/janosh/matbench-discovery/blob/0ba474661cf615d10987ba9a2acb8132943aa491/models/tace/tece-oam-rra-1.0.yml) — current auditable phonon/thermal-transport comparator;
- [UMA fixed gated model card](https://huggingface.co/facebook/UMA/tree/f611b917d9c68566bbbeccbb0aa0f7cad1696cb2) — multi-domain context only; FAIR Chemistry terms prevent its use as the industrial default;
- [MatterSim model card at commit `40a1eb8`](https://github.com/microsoft/mattersim/blob/40a1eb8f1189a53af310957b4f2c5dfbfe68d647/MODEL_CARD.md) — open reproduction control with explicit scope and limitations;
- [MACE source at commit `4d2da09`](https://github.com/ACEsuit/mace/blob/4d2da09413ac1407f37cdbb6b81fa28e4c15655e/README.md) — fixed source that explicitly supports the MPA-0 identity and 89-element scope;
- [OpenMM 8.5.1 Amber14 TIP3P plus ions at commit `f7fa0c27`](https://github.com/openmm/openmm/blob/f7fa0c27c1f8d943c339d67b3bf22f026d0bd8b5/wrappers/python/openmm/app/data/amber14/tip3p.xml) — immutable compatible water/monovalent-ion parameter source for the next Ewald comparison; it is reference evidence only, is not bundled and has not been executed or reproduced locally;
- [CHGNet paper](https://www.nature.com/articles/s42256-023-00716-3) — energy, force, stress and magnetic-moment training scope;
- [Open Catalyst](https://opencatalystproject.org/) — catalytic structures and ID/OOD evaluation;
- [Matbench Discovery](https://www.nature.com/articles/s42256-025-01055-1) — discovery benchmark and leakage/fair-comparison concerns;
- [NIST JARVIS](https://jarvis.nist.gov/) and [NOMAD](https://nomad-lab.eu/docs) — structured materials data and provenance.

## Mesoscale, continuum and process anchors

- [MOOSE Phase Field](https://mooseframework.inl.gov/moose/modules/phase_field/index.html) and [NIST PFHub Benchmark 3 at commit 316f242](https://github.com/usnistgov/pfhub/blob/316f242042af2c086e030864f2af201e0bee8618/benchmarks/benchmark3.ipynb);
- [NVIDIA PhysicsNeMo](https://docs.nvidia.com/physicsnemo/latest/index.html) as a physics-ML framework rather than a complete material model;
- [Cantera 3.2 continuous-reactor reference at commit 4a8358e](https://github.com/Cantera/cantera/blob/4a8358eb80cfeb50474386b5f9ec0b3a83519889/samples/python/reactors/continuous_reactor.py) for the next reactor gate. Both reference reactors use `energy="off"`, so this is an isothermal kinetics baseline; a later energy-closure gate must explicitly account for the external thermostat heat load rather than claiming adiabatic conservation;
- [IDAES 2.12 CSTR at commit 995ef18](https://github.com/IDAES/idaes-pse/blob/995ef18fd835473a63047fd2ac69dd9fa4101fe8/idaes/models/unit_models/cstr.py) for later process systems engineering;
- [Aspen Hybrid Models](https://www.aspentech.com/en/solutions/aspen-hybrid-models) only as a vendor capability claim; it is neither reproduced nor numerically comparable here.

Each future numerical comparison must pin model version, checkpoint, license, dataset digest, split, metric, random seed, hardware and whether the result is reported or reproduced.

## NaCl–water interface preconditions — 2026-09-01 refresh

The current executable parameter receipt remains pinned to OpenMM 8.5.1 and is
still reference-only. [OpenMM 8.6.0](https://github.com/openmm/openmm/releases/tag/8.6.0)
is the explicitly pinned comparator release and its fixed
[Amber14 TIP3P/JC file](https://github.com/openmm/openmm/blob/8.6.0/wrappers/python/openmm/app/data/amber14/tip3p.xml)
is the next comparator candidate; neither source has been executed in this
repository. A future repin must update source bytes, license review, manifests
and independent energy/force receipts together rather than silently changing a
version string.

### OpenMM 8.6.0 pure-water external-control plan

The additive v0.4.4 contract pins three upstream files at OpenMM commit
`c6173db6e8edd705eb59172bd21e9ce69c572405` without bundling them:

- [`tip3p.pdb`](https://github.com/openmm/openmm/blob/c6173db6e8edd705eb59172bd21e9ce69c572405/wrappers/python/openmm/app/data/tip3p.pdb),
  179,998 bytes,
  `sha256:14fd37900d627c0e258d6086a14c6084e4bec1422e9d20fccfc83c3f814fd7ee`;
- [Amber14 `tip3p.xml`](https://github.com/openmm/openmm/blob/c6173db6e8edd705eb59172bd21e9ce69c572405/wrappers/python/openmm/app/data/amber14/tip3p.xml),
  19,070 bytes,
  `sha256:3f4b188dbcb6c02863230eaca231e927fb6bf3307ce947d8a50d0f46f6dd83d9`;
- [`Licenses.txt`](https://github.com/openmm/openmm/blob/c6173db6e8edd705eb59172bd21e9ce69c572405/docs-source/licenses/Licenses.txt),
  9,305 bytes,
  `sha256:437b7168cc997abea3b5f2a9e0fb6894f96de77b9c69be428ccfcfe9bed58293`.

The pinned PDB describes 895 waters (2,685 particles) in a 3 nm cubic cell.
The artifact ID is `tf.openmm-pure-water-cold-start-pme-control/1`; “bulk” was
removed because the plan does not validate bulk behavior. The declarative
control fixes rigid TIP3P/HBonds and PME with a 1 nm cutoff. It calls explicit
`setPMEParameters` with nonzero alpha `2.918423065872431 nm^-1` and requested
`90×90×90` grid, so the recorded `1e-4` design tolerance is ignored by OpenMM.
Each `Reference` and `CPU` Context must separately receipt its actual
`getPMEParametersInContext` alpha/grid; platform restrictions may adjust the
request. Same-lane fresh-process readbacks must match.

The plan requires a portable prepared state and proposes a fixed-cell NVE run
of 1,000 steps at 1 fs with 101 samples. Exact replay is required only for two
fresh `Reference` processes on the same host and pinned container; the CPU lane
is a bounded fixed-coordinate energy/force comparison, not a cross-platform
bitwise trajectory claim. Runtime sourcing is unique: PyPI is the sole package
index; the container is only
`docker.io/library/python:3.12.11-slim-bookworm`, locked by index and linux/
amd64 manifest digests; and OpenMM 8.6.0 and NumPy 2.2.6 use one exact PyPI
wheel URL, filename, byte count and SHA-256 each. These remain expected inputs,
not fetched-package or observed-runtime evidence.

Acceptance formulas are closed rather than headline tolerances. Reference
energy excursion is
`max(|E_i-E_0|)/max(|E_0|,1 kJ mol^-1)` over all 101 authoritative samples and
must be at most `1e-3`. The maximum minimum-image relative distance residual
covers every rigid-water constraint at all 101 samples and must be at most
`1e-6`. CPU/Reference force comparison uses steps `0,10,100,500,1000`, each
particle's Euclidean L2 error
`||F_cpu-F_ref||/max(||F_ref||,1e-12 kJ mol^-1 nm^-1)`, the conventional sorted
median across particles, then the maximum of those five medians; it must be
at most `1e-4`. The global L2 force error over all particles uses the same
floor and five-step maximum and must also be at most `1e-4`, so the median
cannot hide a broad error tail. At those same physical-coordinate digests and
lane-bound prepare receipts, the maximum CPU/Reference potential-energy error
`|U_cpu-U_ref|/max(|U_ref|,1 kJ mol^-1)` must be at most `1e-5`. Energy and
componentwise force sums over groups 0→3 use ascending sum order and
denominator floors of `1 kJ mol^-1` and `1 kJ mol^-1 nm^-1`; both residuals are
evaluated independently for Reference and CPU at all five coordinates, and
the ten-point energy maximum and ten-point force maximum must each be at most
`1e-8`.

The future force API is also explicit: a request supplies the periodic cell and
all 8,055 coordinate components plus digests, while its response supplies the
four complete group energies and O(N) total and per-group force component
arrays plus digests. The groups are harmonic bond, harmonic angle, direct
nonbonded plus Lennard–Jones, and reciprocal nonbonded. Runtime envelope
validators require 8,055 finite canonical values per position/force array,
bind every array and response to digests and request identity, and enforce
per-evaluation group closure. No force-backend implementation or receipt exists.

Every v0.4.4 execution field remains false and the artifact status is
`planned-not-executed`. No OpenMM context, PME calculation, minimization,
velocity initialization or trajectory has run; there is no compiled-system,
portable-state, force, replay, provenance or protected-main receipt. The
source hashes do not clear redistribution of the coordinate or parameter
assets, and license review remains incomplete. This cold-start finite box is
not equilibration, bulk-water validation, density convergence, RDF, diffusion,
ion or NaCl-interface evidence. It cannot support dissolution,
crystallization, industrial or score-promotion claims. The existing v0.4.2 and
v0.4.3 contracts remain frozen, and the v0.5 PFHub Benchmark 3 and Cantera 3.2
order is unchanged.

The non-polarizable Joung–Cheatham ions are water-model-specific implementation
baselines, not a license to make high-concentration claims. The primary
[2009 coexistence study](https://pmc.ncbi.nlm.nih.gov/articles/PMC2755304/)
reported only `1.54 ± 0.02 mol kg^-1` saturation for its TIP3P-compatible NaCl
model against a `6.15 mol kg^-1` experimental reference and explicitly warned
against applying those TIP3P-compatible ions at high salt concentration. The
[2008 parameter paper](https://doi.org/10.1021/jp8001614) also frames the model
as a non-polarizable pair-additive compromise. Tailing Future must therefore
label TIP3P/JC as an implementation and low-salt structural baseline, not a
quantitative saturated-brine or dissolution model.

Before an interface trajectory is visible, the release gate must separately
reproduce bulk TIP3P/low-salt solution controls and bulk rocksalt controls,
then generate a balanced, fully three-dimensional-periodic NaCl(100)-water
artifact with no vacuum. The earlier `4×4×3` / 384-ion / 1,024-water figure was
a preliminary planning lower bound and is superseded by the locked v0.4.10
geometric target: a `6×6×4` conventional rocksalt slab (1,152 ions, eight
neutral (100) layers) with 1,728 total rigid TIP3P waters split equally across
the two sides and no free salt. That size is still a finite-size calibration,
not a convergence result. The
first accepted artifact must bind the exact
orientation, cell, counts, seed, minimized/equilibrated checkpoint, PME/cutoff
settings (including switch, long-range correction or LJPME status),
platform/precision, topology and parameter bytes before the browser is allowed
to replay it. Its future system contract must also lock the starting lattice
constant and equilibration stationarity, duration and multi-seed criteria.
