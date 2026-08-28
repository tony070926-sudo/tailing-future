# R2 atomistic foundation-model reproduction freeze

Status: **planned-not-reproduced** on 2026-08-28. This document freezes the next executable experiment; it is not evidence that either checkpoint has run locally.

## Why these two models

The active model is [MatterSim-v1.0.0-5M at source commit `40a1eb8`](https://github.com/microsoft/mattersim/blob/40a1eb8f1189a53af310957b4f2c5dfbfe68d647/MODEL_CARD.md). Its official model card records an MIT license, a 4.5M-parameter model, direct energy/force/stress output, ASE/MD support and Random-TP reference metrics. The challenger is [MACE-MPA-0 medium at the MACE `4d2da09` source](https://github.com/ACEsuit/mace/blob/4d2da09413ac1407f37cdbb6b81fa28e4c15655e/README.md), which explicitly documents MPA-0's 89-element MPTrj+sAlex scope and raw PBE+U energy convention; its release asset is locked separately by byte hash.

Both are anonymously downloadable and can be evaluated on the same E/F/stress records. Their exact commits, package versions, byte lengths and SHA-256 values live in [`evaluation/atomistic/reproduction-plan.json`](../evaluation/atomistic/reproduction-plan.json).

[UMA at fixed revision `f611b917`](https://huggingface.co/facebook/UMA/tree/f611b917d9c68566bbbeccbb0aa0f7cad1696cb2) remains architecture/SOTA context only. Its weights require manually gated acceptance of the FAIR Chemistry License and an acceptable-use policy that restricts critical infrastructure, transportation, heavy machinery and nuclear uses. The fixed README and license bytes are hashed; the separately gated `USE_POLICY.md` remains `sha256:null` and therefore fail-closed until an authorized download can be verified. UMA is not allowed as Tailing Future's industrial default.

## Locked experiment

The primary like-for-like author test benchmark is the fixed [MatterSim Random-TP file](https://github.com/microsoft/mattersim/blob/40a1eb8f1189a53af310957b4f2c5dfbfe68d647/data/benchmarks/random-TP.xyz):

- 1,514,015 bytes, SHA-256 `c14473dc…63054d9`;
- 693 structures, 11,088 atoms, 89 elements and 693 unique IDs;
- energy in eV, forces in eV/Å and stress in eV/Å³;
- ten preregistered smoke structures cover all 89 elements, but full acceptance always runs all 693 frames.

The MatterSim training corpus is not hash-public, so Random-TP cannot be called leakage-certified. It also lacks per-frame T/P metadata and was produced by the MatterSim authors. The independent stability reference is WBM / Matbench Discovery, but its raw redistribution license and locked artifact digest remain unresolved; the manifest therefore blocks mirroring and local promotion.

## Fail-closed runner contract

1. Download into an untrusted staging area and verify each pinned wheel, checkpoint and dataset byte length and SHA-256 before installation or deserialization.
2. Load each pickle-based checkpoint in a network-disabled, unprivileged container with no secrets.
3. Pass an absolute local checkpoint path; mutable branch URLs and package default aliases are forbidden.
4. Require 693/693 finite E/F/stress outputs. Missing rows, corrupt bytes or unsupported elements fail; LJ and cached constants are forbidden fallbacks.
5. Test translation, atom permutation and periodic-image invariance; rotate forces and stresses equivariantly; compare forces with finite differences.
6. Publish energy/force/stress distributions, worst IDs, failure rate, batch-1 latency, throughput, memory and hardware provenance.
7. Merkle-root canonical per-record outputs by sorted structure ID, and record runner/container/model/data digests.

Run the manifest gate with:

```bash
npm run atomistic:validate
```

To verify all pinned package/checkpoint/data bytes, set an absolute cache root and add `--verify-cache`; the validator rejects path traversal and symlinks escaping the cache root:

```bash
TAILING_ATOMISTIC_CACHE=/absolute/cache node scripts/validate-atomistic-plan.mjs --verify-cache
```

## Promotion boundary

MatterSim must reproduce its official Random-TP means—0.199 eV/atom energy, 0.824 eV/Å force and 1.999 GPa stress—within the preregistered tolerances in the manifest. MACE has no locked official Random-TP target: its first complete blind run may establish an engineering baseline, but cannot be used to claim superiority. Until checkpoint, dataset and runner digests are all present, both models remain `AUDITABLE`, never `REPRODUCED` or numerically comparable.
