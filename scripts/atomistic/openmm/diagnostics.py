#!/usr/bin/env python3
"""Compute producer-side diagnostics without applying acceptance thresholds."""

from __future__ import annotations

import argparse
import json
import math
import statistics
import sys
from pathlib import Path
from typing import Sequence

from binary_codec import decode_f64le, decode_u32le
from contract import (
    ARTIFACT_ID,
    COMPARISON_STEPS,
    CONSTRAINT_COUNT,
    FRAME_COUNT,
    MAX_JSON_BYTES,
    PARTICLE_COUNT,
    PLAN_DIGEST,
    SYSTEM_DIGEST,
    ContractViolation,
    atomic_write_json,
    canonical_directory,
    digest_bytes,
    digest_value,
    read_regular_file,
)


SCHEMA_VERSION = "tf.openmm-tip3p-producer-diagnostics/0.4.5"
GROUP_SLOT_COUNT = 5
COMPONENT_COUNT = PARTICLE_COUNT * 3


def energy_excursion(energies: Sequence[float]) -> float:
    if len(energies) != FRAME_COUNT * 3:
        raise ContractViolation("reference energy array shape changed")
    totals = [float(energies[index * 3 + 2]) for index in range(FRAME_COUNT)]
    denominator = max(abs(totals[0]), 1.0)
    return max(abs(value - totals[0]) / denominator for value in totals)


def force_comparison(
    reference: Sequence[float], cpu: Sequence[float]
) -> tuple[float, float]:
    expected = len(COMPARISON_STEPS) * GROUP_SLOT_COUNT * COMPONENT_COUNT
    if len(reference) != expected or len(cpu) != expected:
        raise ContractViolation("comparison force array shape changed")
    maximum_median = 0.0
    maximum_global = 0.0
    slot_width = COMPONENT_COUNT
    step_width = GROUP_SLOT_COUNT * slot_width
    for step_index in range(len(COMPARISON_STEPS)):
        offset = step_index * step_width
        particle_errors: list[float] = []
        squared_difference = 0.0
        squared_reference = 0.0
        for particle in range(PARTICLE_COUNT):
            start = offset + particle * 3
            reference_norm_squared = 0.0
            difference_norm_squared = 0.0
            for axis in range(3):
                reference_value = float(reference[start + axis])
                difference = float(cpu[start + axis]) - reference_value
                reference_norm_squared += reference_value * reference_value
                difference_norm_squared += difference * difference
            particle_errors.append(
                math.sqrt(difference_norm_squared) / max(math.sqrt(reference_norm_squared), 1e-12)
            )
            squared_difference += difference_norm_squared
            squared_reference += reference_norm_squared
        maximum_median = max(maximum_median, float(statistics.median(particle_errors)))
        maximum_global = max(
            maximum_global,
            math.sqrt(squared_difference) / max(math.sqrt(squared_reference), 1e-12),
        )
    return maximum_median, maximum_global


def potential_energy_comparison(reference: Sequence[float], cpu: Sequence[float]) -> float:
    expected = len(COMPARISON_STEPS) * GROUP_SLOT_COUNT
    if len(reference) != expected or len(cpu) != expected:
        raise ContractViolation("comparison energy array shape changed")
    return max(
        abs(float(cpu[index * GROUP_SLOT_COUNT]) - float(reference[index * GROUP_SLOT_COUNT]))
        / max(abs(float(reference[index * GROUP_SLOT_COUNT])), 1.0)
        for index in range(len(COMPARISON_STEPS))
    )


def group_closure(
    energies: Sequence[float], forces: Sequence[float]
) -> tuple[float, float]:
    expected_energy = len(COMPARISON_STEPS) * GROUP_SLOT_COUNT
    expected_force = expected_energy * COMPONENT_COUNT
    if len(energies) != expected_energy or len(forces) != expected_force:
        raise ContractViolation("force-group array shape changed")
    maximum_energy = 0.0
    maximum_force = 0.0
    for step_index in range(len(COMPARISON_STEPS)):
        energy_offset = step_index * GROUP_SLOT_COUNT
        total_energy = float(energies[energy_offset])
        group_energy = sum(float(energies[energy_offset + slot]) for slot in range(1, 5))
        maximum_energy = max(
            maximum_energy, abs(total_energy - group_energy) / max(abs(total_energy), 1.0)
        )
        force_offset = step_index * GROUP_SLOT_COUNT * COMPONENT_COUNT
        total_components = forces[force_offset : force_offset + COMPONENT_COUNT]
        maximum_total_component = max(abs(float(value)) for value in total_components)
        maximum_component_difference = 0.0
        for component in range(COMPONENT_COUNT):
            group_sum = sum(
                float(forces[force_offset + slot * COMPONENT_COUNT + component])
                for slot in range(1, 5)
            )
            maximum_component_difference = max(
                maximum_component_difference,
                abs(float(total_components[component]) - group_sum),
            )
        maximum_force = max(
            maximum_force,
            maximum_component_difference / max(maximum_total_component, 1.0),
        )
    return maximum_energy, maximum_force


def constraint_residual(
    positions: Sequence[float], pairs: Sequence[int], targets: Sequence[float]
) -> float:
    if len(positions) != FRAME_COUNT * COMPONENT_COUNT:
        raise ContractViolation("reference position array shape changed")
    if len(pairs) != CONSTRAINT_COUNT * 2 or len(targets) != CONSTRAINT_COUNT:
        raise ContractViolation("constraint array shape changed")
    maximum = 0.0
    for frame in range(FRAME_COUNT):
        frame_offset = frame * COMPONENT_COUNT
        for constraint in range(CONSTRAINT_COUNT):
            first = int(pairs[constraint * 2])
            second = int(pairs[constraint * 2 + 1])
            target = float(targets[constraint])
            squared = 0.0
            for axis in range(3):
                delta = (
                    float(positions[frame_offset + second * 3 + axis])
                    - float(positions[frame_offset + first * 3 + axis])
                )
                delta -= 3.0 * math.floor(delta / 3.0 + 0.5)
                squared += delta * delta
            maximum = max(maximum, abs(math.sqrt(squared) - target) / target)
    return maximum


def _read_f64(root: Path, relative: str) -> tuple[float, ...]:
    return decode_f64le(read_regular_file(root / relative))


def _read_u32(root: Path, relative: str) -> tuple[int, ...]:
    return decode_u32le(read_regular_file(root / relative))


def _reference_replay_receipt(root: Path) -> dict[str, object]:
    suffixes = (
        "sample-steps.u32le",
        "sample-times.f64le",
        "positions.f64le",
        "velocities.f64le",
        "potential-forces.f64le",
        "energies.f64le",
        "comparison-group-energies.f64le",
        "comparison-group-forces.f64le",
    )
    comparisons = []
    for suffix in suffixes:
        first = read_regular_file(root / f"arrays/reference-a-{suffix}")
        second = read_regular_file(root / f"arrays/reference-b-{suffix}")
        comparisons.append(
            {
                "arraySuffix": suffix,
                "referenceASha256": digest_bytes(first),
                "referenceBSha256": digest_bytes(second),
                "bytewiseEqual": first == second,
            }
        )
    return {
        "arrays": comparisons,
        "allEightArraysBytewiseEqual": all(bool(item["bytewiseEqual"]) for item in comparisons),
    }


def write_diagnostics(output_root: Path) -> dict[str, object]:
    root = canonical_directory(output_root, "output root", create=True)
    reference_energies = _read_f64(root, "arrays/reference-a-energies.f64le")
    reference_positions = _read_f64(root, "arrays/reference-a-positions.f64le")
    reference_group_energies = _read_f64(
        root, "arrays/reference-a-comparison-group-energies.f64le"
    )
    reference_group_forces = _read_f64(
        root, "arrays/reference-a-comparison-group-forces.f64le"
    )
    cpu_group_energies = _read_f64(root, "arrays/cpu-comparison-group-energies.f64le")
    cpu_group_forces = _read_f64(root, "arrays/cpu-comparison-group-forces.f64le")
    pairs = _read_u32(root, "arrays/constraints.u32le")
    targets = _read_f64(root, "arrays/constraint-targets.f64le")
    median_force, global_force = force_comparison(reference_group_forces, cpu_group_forces)
    reference_energy_closure, reference_force_closure = group_closure(
        reference_group_energies, reference_group_forces
    )
    cpu_energy_closure, cpu_force_closure = group_closure(cpu_group_energies, cpu_group_forces)
    manifest: dict[str, object] = {
        "schemaVersion": SCHEMA_VERSION,
        "artifactId": ARTIFACT_ID,
        "planDigest": PLAN_DIGEST,
        "systemDigest": SYSTEM_DIGEST,
        "statusDomain": "producer-diagnostics-only-independent-verifier-required",
        "thresholdsApplied": False,
        "acceptanceDecision": None,
        "metrics": {
            "referenceRelativeEnergyExcursion": energy_excursion(reference_energies),
            "referenceMaximumConstraintRelativeResidual": constraint_residual(
                reference_positions, pairs, targets
            ),
            "cpuReferenceMaximumRelativePotentialEnergyDifference": potential_energy_comparison(
                reference_group_energies, cpu_group_energies
            ),
            "cpuReferenceMaximumMedianPerParticleRelativeForceError": median_force,
            "cpuReferenceMaximumGlobalRelativeForceL2Error": global_force,
            "referenceMaximumRelativeGroupEnergyClosureResidual": reference_energy_closure,
            "referenceMaximumRelativeGroupForceClosureResidual": reference_force_closure,
            "cpuMaximumRelativeGroupEnergyClosureResidual": cpu_energy_closure,
            "cpuMaximumRelativeGroupForceClosureResidual": cpu_force_closure,
        },
        "referenceReplay": _reference_replay_receipt(root),
        "claims": {
            "scientificPass": False,
            "accepted": False,
            "reproduced": False,
            "promotionEligible": False,
            "protectedMainArtifact": False,
        },
    }
    manifest["diagnosticsDigest"] = digest_value(manifest)
    atomic_write_json(root / "manifests/producer-diagnostics.json", manifest)
    return manifest


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-root", type=Path, required=True)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(sys.argv[1:] if argv is None else list(argv))
    result = write_diagnostics(args.output_root)
    print(json.dumps({"schemaVersion": result["schemaVersion"]}, sort_keys=True, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
