# Research baseline — 2026-08-28

## AIDO method reference

The [AIDO perspective](https://arxiv.org/abs/2412.06993) is the primary source for the modular → connectable → holistic sequence. GenBio AI's [AIDO Cell technical report](https://genbio.ai/research/AIDO%20Cell%20V1%20-%20Technical%20Report%20-%2018%20Aug%202026.pdf), [release page](https://genbio.ai/aido-cell-simulator/) and [virtual-cell world-model definition](https://genbio.ai/world-model-of-the-virtual-cell/) are sources for its linked multi-level state, action-conditioned transitions, observations, branching and multi-turn use.

Important boundary: the public AIDO Cell claims, including its benchmark coverage and reported wins, are vendor statements. The product is described as a controlled alpha, and novel wet-lab validation and additional temporal/metabolic capabilities are still future work. Tailing Future uses it as an architecture comparator, not as a directly comparable numerical materials baseline.

## Materials and atomistic references

- [UMA documentation](https://fair-chem.github.io/uma/) — atomistic foundation-model candidate;
- [MatterSim model card](https://github.com/microsoft/mattersim/blob/main/MODEL_CARD.md) — atomistic scope and limitations;
- [MACE foundation models](https://github.com/ACEsuit/mace-foundations) — checkpoint and license-aware atomistic candidate;
- [CHGNet paper](https://www.nature.com/articles/s42256-023-00716-3) — energy, force, stress and magnetic-moment training scope;
- [Open Catalyst](https://opencatalystproject.org/) — catalytic structures and ID/OOD evaluation;
- [Matbench Discovery](https://www.nature.com/articles/s42256-025-01055-1) — discovery benchmark and leakage/fair-comparison concerns;
- [NIST JARVIS](https://jarvis.nist.gov/) and [NOMAD](https://nomad-lab.eu/docs) — structured materials data and provenance.

## Mesoscale, continuum and process anchors

- [MOOSE Phase Field](https://mooseframework.inl.gov/moose/modules/phase_field/index.html) and [PFHub](https://pages.nist.gov/pfhub/benchmarks/);
- [NVIDIA PhysicsNeMo](https://docs.nvidia.com/physicsnemo/latest/index.html) as a physics-ML framework rather than a complete material model;
- [Cantera](https://cantera.org/) for thermochemistry, kinetics and transport;
- [IDAES](https://idaes.org/overview/) for process systems engineering;
- [Aspen Hybrid Models](https://www.aspentech.com/en/solutions/aspen-hybrid-models) as a commercial process-hybrid capability reference.

Each future numerical comparison must pin model version, checkpoint, license, dataset digest, split, metric, random seed, hardware and whether the result is reported or reproduced.
