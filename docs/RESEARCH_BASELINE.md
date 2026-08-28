# Research baseline — 2026-08-28

## AIDO method reference

The [AIDO perspective](https://arxiv.org/abs/2412.06993) is the primary source for the modular → connectable → holistic sequence. GenBio AI's [AIDO Cell technical report](https://genbio.ai/research/AIDO%20Cell%20V1%20-%20Technical%20Report%20-%2018%20Aug%202026.pdf), [release page](https://genbio.ai/aido-cell-simulator/) and [virtual-cell world-model definition](https://genbio.ai/world-model-of-the-virtual-cell/) are sources for its linked multi-level state, action-conditioned transitions, observations, branching and multi-turn use.

Important boundary: the public AIDO Cell claims, including its benchmark coverage and reported wins, are vendor statements. The product is described as a controlled alpha, and novel wet-lab validation and additional temporal/metabolic capabilities are still future work. Tailing Future uses it as an architecture comparator, not as a directly comparable numerical materials baseline.

## Materials and atomistic references

- [EquiformerV3+DeNS-OAM locked Matbench record](https://github.com/janosh/matbench-discovery/blob/0ba474661cf615d10987ba9a2acb8132943aa491/models/equiformer_v3/equiformer-v3-oam.yml) — current auditable crystal-discovery comparator;
- [TECE-OAM-RRA-1.0 locked Matbench record](https://github.com/janosh/matbench-discovery/blob/0ba474661cf615d10987ba9a2acb8132943aa491/models/tace/tece-oam-rra-1.0.yml) — current auditable phonon/thermal-transport comparator;
- [UMA documentation](https://fair-chem.github.io/uma/) — multi-domain atomistic foundation-model candidate, currently claim/model-card evidence only;
- [MatterSim model card](https://github.com/microsoft/mattersim/blob/main/MODEL_CARD.md) — open reproduction control with explicit scope and limitations;
- [MACE-MPA-0 locked Matbench record](https://github.com/janosh/matbench-discovery/blob/0ba474661cf615d10987ba9a2acb8132943aa491/models/mace/mace-mpa-0.yml) — second open reproduction control;
- [CHGNet paper](https://www.nature.com/articles/s42256-023-00716-3) — energy, force, stress and magnetic-moment training scope;
- [Open Catalyst](https://opencatalystproject.org/) — catalytic structures and ID/OOD evaluation;
- [Matbench Discovery](https://www.nature.com/articles/s42256-025-01055-1) — discovery benchmark and leakage/fair-comparison concerns;
- [NIST JARVIS](https://jarvis.nist.gov/) and [NOMAD](https://nomad-lab.eu/docs) — structured materials data and provenance.

## Mesoscale, continuum and process anchors

- [MOOSE Phase Field](https://mooseframework.inl.gov/moose/modules/phase_field/index.html) and [NIST PFHub Benchmark 3 at commit 316f242](https://github.com/usnistgov/pfhub/blob/316f242042af2c086e030864f2af201e0bee8618/benchmarks/benchmark3.ipynb);
- [NVIDIA PhysicsNeMo](https://docs.nvidia.com/physicsnemo/latest/index.html) as a physics-ML framework rather than a complete material model;
- [Cantera 3.2 continuous-reactor reference at commit 4a8358e](https://github.com/Cantera/cantera/blob/4a8358eb80cfeb50474386b5f9ec0b3a83519889/samples/python/reactors/continuous_reactor.py) for the next reactor gate;
- [IDAES 2.12 CSTR at commit 995ef18](https://github.com/IDAES/idaes-pse/blob/995ef18fd835473a63047fd2ac69dd9fa4101fe8/idaes/models/unit_models/cstr.py) for later process systems engineering;
- [Aspen Hybrid Models](https://www.aspentech.com/en/solutions/aspen-hybrid-models) only as a vendor capability claim; it is neither reproduced nor numerically comparable here.

Each future numerical comparison must pin model version, checkpoint, license, dataset digest, split, metric, random seed, hardware and whether the result is reported or reproduced.
