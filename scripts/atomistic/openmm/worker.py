#!/usr/bin/env python3
"""One-process stages for the locked OpenMM 8.6 TIP3P producer."""

from __future__ import annotations

import argparse
import contextlib
import hashlib
import json
import math
import os
import re
import sys
import time
from pathlib import Path
from typing import Mapping, Sequence

from binary_codec import AtomicArrayWriter, decode_f64le, encode_f64le
from contract import (
    ARTIFACT_ID,
    ARTIFACT_MANIFEST_SCHEMA_VERSION,
    CELL_NANOMETER,
    CLAIMS,
    COMPARISON_FRAME_INDICES,
    COMPARISON_STEPS,
    COMPONENT_COUNT,
    CONSTRAINT_COUNT,
    CONSTRAINT_TOLERANCE,
    CPU_BACKEND_MANIFEST_DIGEST,
    CPU_RUN_SCHEMA_VERSION,
    FRAME_COUNT,
    MAX_JSON_BYTES,
    MINIMIZATION_MAX_ITERATIONS,
    MINIMIZATION_TOLERANCE_KJ_MOL_NM,
    PARTICLE_COUNT,
    PLAN_DIGEST,
    PREPARE_RECEIPT_SCHEMA_VERSION,
    REFERENCE_BACKEND_MANIFEST_DIGEST,
    REFERENCE_RUN_SCHEMA_VERSION,
    RUNTIME_INVENTORY_SCHEMA_VERSION,
    SAMPLE_STRIDE_STEPS,
    SYSTEM_DIGEST,
    SYSTEM_ID,
    TEMPERATURE_KELVIN,
    TIME_STEP_PICOSECONDS,
    VELOCITY_SEED,
    ContractViolation,
    IncompleteExecution,
    atomic_write_json,
    canonical_directory,
    digest_bytes,
    digest_value,
    read_regular_file,
    validate_descriptor,
    validate_input_root,
)
from engine import (
    center_of_mass_velocity,
    compile_system,
    create_context,
    flatten_vectors,
    group_payload,
    mass_weighted_momentum_relative_residual,
    maximum_constraint_relative_residual,
    maximum_velocity_constraint_rate,
    read_particle_array,
    remove_mass_weighted_center_of_mass_velocity,
    runtime_inventory,
    set_positions,
    set_velocities,
    state_payload,
    vectors_to_plain,
    warmup_and_pme_readback,
)


STATIC_ARRAY_PATHS = {
    "cell": "arrays/cell.f64le",
    "masses": "arrays/masses.f64le",
    "constraints": "arrays/constraints.u32le",
    "constraint-targets": "arrays/constraint-targets.f64le",
    "start-positions": "arrays/start-positions.f64le",
    "start-velocities": "arrays/start-velocities.f64le",
    "comparison-steps": "arrays/comparison-steps.u32le",
}

ENERGY_TEMPORAL_ALIGNMENT = (
    "openmm-state-potential-and-integrator-adjusted-kinetic-at-position-time"
)
STATE_KINETIC_ENERGY_SEMANTICS = (
    "ReferenceIntegrateVerletStepKernel-computeShiftedKineticEnergy-"
    "plus-half-dt-with-velocity-constraints-1e-4"
)
MINIMIZER_WORKING_CONSTRAINT_TOLERANCE = 1e-4
MINIMIZER_REPORT_ARGUMENTS = frozenset(
    ("system energy", "restraint energy", "restraint strength", "max constraint error")
)


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)
    for name in ("runtime", "prepare"):
        candidate = subparsers.add_parser(name)
        candidate.add_argument("--input-root", type=Path, required=True)
        candidate.add_argument("--output-root", type=Path, required=True)
    reference = subparsers.add_parser("reference")
    reference.add_argument("--replica", choices=("a", "b"), required=True)
    reference.add_argument("--input-root", type=Path, required=True)
    reference.add_argument("--output-root", type=Path, required=True)
    cpu = subparsers.add_parser("cpu")
    cpu.add_argument("--input-root", type=Path, required=True)
    cpu.add_argument("--output-root", type=Path, required=True)
    manifest = subparsers.add_parser("manifest")
    manifest.add_argument("--output-root", type=Path, required=True)
    manifest.add_argument("--source-revision", required=True)
    manifest.add_argument("--producer-outcome-digest", required=True)
    return parser


def _read_json(path: Path) -> dict[str, object]:
    value = json.loads(
        read_regular_file(path, maximum_bytes=MAX_JSON_BYTES),
        object_pairs_hook=_reject_duplicate_keys,
    )
    if not isinstance(value, dict):
        raise ContractViolation(f"{path.name}: expected a JSON object")
    return value


def _reject_duplicate_keys(pairs: list[tuple[str, object]]) -> dict[str, object]:
    value: dict[str, object] = {}
    for key, item in pairs:
        if key in value:
            raise ContractViolation(f"duplicate JSON key: {key}")
        value[key] = item
    return value


def _write_array(
    output_root: Path,
    *,
    artifact_id: str,
    path: str,
    dtype: str,
    shape: Sequence[int],
    unit: str,
    values: object,
) -> dict[str, object]:
    with AtomicArrayWriter(
        output_root=output_root,
        artifact_id=artifact_id,
        relative_path=path,
        dtype=dtype,
        shape=shape,
        unit=unit,
    ) as writer:
        writer.write(values)
        return writer.finish()


def _assert_compilation_matches_prepare(compiled: Mapping[str, object], prepare: Mapping[str, object]) -> None:
    expected = {
        "compiledTopologyDigest": compiled["compiledTopologyDigest"],
        "serializedSystemDigest": compiled["serializedSystemDigest"],
        "atomOrderDigest": compiled["atomOrderDigest"],
    }
    for key, value in expected.items():
        if prepare.get(key) != value:
            raise ContractViolation(f"fresh process {key} differs from the prepare receipt")


def run_runtime(input_root: Path, output_root: Path) -> dict[str, object]:
    validate_input_root(input_root)
    root = canonical_directory(output_root, "output root", create=True)
    inventory = runtime_inventory()
    inventory.update(
        {
            "schemaVersion": RUNTIME_INVENTORY_SCHEMA_VERSION,
            "artifactId": ARTIFACT_ID,
            "planDigest": PLAN_DIGEST,
            "systemDigest": SYSTEM_DIGEST,
            "actualContextProperties": "recorded-per-lane-after-context-creation",
            "claims": dict(CLAIMS),
        }
    )
    payload = dict(inventory)
    payload.pop("inventoryDigest", None)
    inventory["inventoryDigest"] = digest_value(payload)
    atomic_write_json(root / "manifests/runtime-inventory.json", inventory)
    return inventory


class _MinimizationTrace:
    def __init__(self, mm: object) -> None:
        outer = self

        class Reporter(mm.MinimizationReporter):
            def __init__(self) -> None:
                super().__init__()

            def report(self, iteration: int, _x: object, _grad: object, args: object) -> bool:
                outer.report_count += 1
                if int(iteration) == 0:
                    outer.cycle_count += 1
                outer.maximum_iteration_index = max(outer.maximum_iteration_index, int(iteration))
                outer.last_iteration_index = int(iteration)
                raw_arguments = dict(args)
                if set(raw_arguments) != MINIMIZER_REPORT_ARGUMENTS:
                    raise ContractViolation("minimizer reporter argument set changed")
                outer.last_arguments = {
                    str(key): float(value) for key, value in sorted(raw_arguments.items())
                }
                if any(not math.isfinite(value) for value in outer.last_arguments.values()):
                    raise ContractViolation("minimizer reporter returned a non-finite statistic")
                positions = [float(value) for value in _x]
                gradient = [float(value) for value in _grad]
                if (
                    len(positions) != COMPONENT_COUNT
                    or any(not math.isfinite(value) for value in positions)
                ):
                    raise ContractViolation("minimizer reporter returned invalid flattened positions")
                if (
                    len(gradient) != COMPONENT_COUNT
                    or any(not math.isfinite(value) for value in gradient)
                ):
                    raise ContractViolation("minimizer reporter returned an invalid objective gradient")
                outer.last_position_components = positions
                outer.last_objective_gradient_rms = math.sqrt(
                    sum(value * value for value in gradient) / len(gradient)
                )
                elapsed = time.monotonic() - outer.started_monotonic
                if outer.report_count >= 20_000:
                    outer.budget_exhaustion = "maximum-reporter-callbacks"
                elif outer.cycle_count - 1 > 3:
                    outer.budget_exhaustion = "maximum-constraint-restarts"
                elif elapsed >= 1_800:
                    outer.budget_exhaustion = "wall-clock-timeout"
                return outer.budget_exhaustion is not None

        self.reporter = Reporter()
        self.report_count = 0
        self.cycle_count = 0
        self.maximum_iteration_index = -1
        self.last_iteration_index = -1
        self.last_arguments: dict[str, float] = {}
        self.last_position_components: list[float] | None = None
        self.last_objective_gradient_rms: float | None = None
        self.budget_exhaustion: str | None = None
        self.started_monotonic = time.monotonic()

    def receipt(self) -> dict[str, object]:
        return {
            "reportCount": self.report_count,
            "restraintCycles": self.cycle_count,
            "maximumIterationIndex": self.maximum_iteration_index,
            "lastIterationIndex": self.last_iteration_index,
            "lastArguments": self.last_arguments,
            "lastPositionSha256": (
                digest_bytes(encode_f64le(self.last_position_components))
                if self.last_position_components is not None
                else None
            ),
            "lastObjectiveGradientRmsKjMolNanometer": self.last_objective_gradient_rms,
            "globalCallbackOrdinal": self.report_count - 1,
            "maximumReporterCallbacks": 20_000,
            "maximumConstraintRestarts": 3,
            "wallClockTimeoutSeconds": 1_800,
            "constraintRestartCount": max(self.cycle_count - 1, 0),
            "budgetExhaustion": self.budget_exhaustion,
            "reporterNeverStoppedMinimizationEarly": self.budget_exhaustion is None,
        }


def _force_component_rms(forces: Sequence[Sequence[float]]) -> float:
    flattened = flatten_vectors(forces)
    return math.sqrt(sum(value * value for value in flattened) / len(flattened))


def run_prepare(input_root: Path, output_root: Path) -> dict[str, object]:
    validate_input_root(input_root)
    root = canonical_directory(output_root, "output root", create=True)
    runtime = _read_json(root / "manifests/runtime-inventory.json")
    compiled = compile_system(input_root)
    lane = create_context(compiled, "Reference")
    context = lane["context"]
    mm = compiled["mm"]
    unit = compiled["unit"]
    set_positions(context, mm, unit, compiled["initialPositions"])
    pre_warmup = warmup_and_pme_readback(compiled, lane)
    pre_state = state_payload(context, unit)
    pre_constraint_residual = maximum_constraint_relative_residual(
        pre_state["positions"], compiled["constraints"]
    )

    trace = _MinimizationTrace(mm)
    mm.LocalEnergyMinimizer.minimize(
        context,
        MINIMIZATION_TOLERANCE_KJ_MOL_NM * unit.kilojoule_per_mole / unit.nanometer,
        MINIMIZATION_MAX_ITERATIONS,
        trace.reporter,
    )
    if trace.budget_exhaustion is not None:
        raise IncompleteExecution(
            f"minimization budget exhausted ({trace.budget_exhaustion}); no production start state"
        )
    post_internal_minimizer = state_payload(context, unit)
    pre_apply_constraint_residual = maximum_constraint_relative_residual(
        post_internal_minimizer["positions"], compiled["constraints"]
    )
    context.applyConstraints(CONSTRAINT_TOLERANCE)
    post_minimization = state_payload(context, unit)
    post_constraint_residual = maximum_constraint_relative_residual(
        post_minimization["positions"], compiled["constraints"]
    )
    terminal_report_constraint_error = trace.last_arguments.get("max constraint error")
    if trace.last_objective_gradient_rms is None or trace.last_objective_gradient_rms > 1.0:
        raise IncompleteExecution(
            "minimization lacks the locked final reporter objective-gradient RMS postcondition"
        )
    reporter_observed_terminal_state = (
        trace.last_position_components is not None
        and terminal_report_constraint_error is not None
        and 0.0 <= terminal_report_constraint_error <= MINIMIZER_WORKING_CONSTRAINT_TOLERANCE
    )
    if not reporter_observed_terminal_state:
        raise IncompleteExecution(
            "minimization reporter did not observe the successful terminal optimizer cycle"
        )
    if post_constraint_residual > 1e-8:
        raise IncompleteExecution("post-minimization constraint residual exceeds 1e-8")

    post_internal_components = flatten_vectors(post_internal_minimizer["positions"])
    maximum_reporter_to_post_projection_displacement = max(
        abs(reported - projected)
        for reported, projected in zip(
            trace.last_position_components, post_internal_components
        )
    )

    context.setVelocitiesToTemperature(TEMPERATURE_KELVIN * unit.kelvin, VELOCITY_SEED)
    first_velocity_state = state_payload(context, unit)
    first_velocity_residual = maximum_velocity_constraint_rate(
        first_velocity_state["positions"],
        first_velocity_state["velocities"],
        compiled["constraints"],
    )
    corrected_velocities, removed_com = remove_mass_weighted_center_of_mass_velocity(
        first_velocity_state["velocities"], compiled["masses"]
    )
    set_velocities(context, mm, unit, corrected_velocities)
    context.applyVelocityConstraints(CONSTRAINT_TOLERANCE)
    production_start = state_payload(context, unit)
    final_velocity_residual = maximum_velocity_constraint_rate(
        production_start["positions"], production_start["velocities"], compiled["constraints"]
    )
    final_com = center_of_mass_velocity(production_start["velocities"], compiled["masses"])
    final_com_speed = math.sqrt(sum(value * value for value in final_com))
    final_momentum_residual = mass_weighted_momentum_relative_residual(
        production_start["velocities"], compiled["masses"]
    )
    if final_com_speed > 1e-12:
        raise IncompleteExecution("production start COM speed exceeds 1e-12 nm/ps")
    if final_velocity_residual > 1e-8:
        raise IncompleteExecution("production start velocity-constraint residual exceeds 1e-8")

    descriptors = [
        _write_array(
            root,
            artifact_id="cell",
            path=STATIC_ARRAY_PATHS["cell"],
            dtype="float64-le",
            shape=(9,),
            unit="nanometer",
            values=compiled["cell"],
        ),
        _write_array(
            root,
            artifact_id="masses",
            path=STATIC_ARRAY_PATHS["masses"],
            dtype="float64-le",
            shape=(PARTICLE_COUNT,),
            unit="dalton",
            values=compiled["masses"],
        ),
        _write_array(
            root,
            artifact_id="constraints",
            path=STATIC_ARRAY_PATHS["constraints"],
            dtype="uint32-le",
            shape=(CONSTRAINT_COUNT, 2),
            unit="index",
            values=[(first, second) for first, second, _target in compiled["constraints"]],
        ),
        _write_array(
            root,
            artifact_id="constraint-targets",
            path=STATIC_ARRAY_PATHS["constraint-targets"],
            dtype="float64-le",
            shape=(CONSTRAINT_COUNT,),
            unit="nanometer",
            values=[target for _first, _second, target in compiled["constraints"]],
        ),
        _write_array(
            root,
            artifact_id="start-positions",
            path=STATIC_ARRAY_PATHS["start-positions"],
            dtype="float64-le",
            shape=(PARTICLE_COUNT, 3),
            unit="nanometer",
            values=production_start["positions"],
        ),
        _write_array(
            root,
            artifact_id="start-velocities",
            path=STATIC_ARRAY_PATHS["start-velocities"],
            dtype="float64-le",
            shape=(PARTICLE_COUNT, 3),
            unit="nanometer-per-picosecond",
            values=production_start["velocities"],
        ),
        _write_array(
            root,
            artifact_id="comparison-steps",
            path=STATIC_ARRAY_PATHS["comparison-steps"],
            dtype="uint32-le",
            shape=(len(COMPARISON_STEPS),),
            unit="step",
            values=COMPARISON_STEPS,
        ),
    ]
    by_id = {str(item["id"]): item for item in descriptors}
    start_state_identity = {
        "cellSha256": by_id["cell"]["sha256"],
        "positionSha256": by_id["start-positions"]["sha256"],
        "velocitySha256": by_id["start-velocities"]["sha256"],
        "atomOrderDigest": compiled["atomOrderDigest"],
    }
    receipt: dict[str, object] = {
        "schemaVersion": PREPARE_RECEIPT_SCHEMA_VERSION,
        "artifactId": ARTIFACT_ID,
        "planDigest": PLAN_DIGEST,
        "status": "complete",
        "systemId": SYSTEM_ID,
        "systemDigest": SYSTEM_DIGEST,
        "backendManifestDigest": REFERENCE_BACKEND_MANIFEST_DIGEST,
        "runtimeInventoryDigest": runtime.get("inventoryDigest"),
        "compiledTopologyDigest": compiled["compiledTopologyDigest"],
        "serializedSystemDigest": compiled["serializedSystemDigest"],
        "atomOrderDigest": compiled["atomOrderDigest"],
        "forceClassCounts": compiled["forceClassCounts"],
        "topology": compiled["topologyInventory"],
        "actualContextProperties": lane["platformProperties"],
        "pmeWarmupAndReadback": pre_warmup,
        "minimization": {
            "algorithm": "OpenMM-LocalEnergyMinimizer-LBFGS",
            "toleranceKjMolNanometer": MINIMIZATION_TOLERANCE_KJ_MOL_NM,
            "maximumIterationsArgument": MINIMIZATION_MAX_ITERATIONS,
            "maximumIterationsPerRestraintCycle": MINIMIZATION_MAX_ITERATIONS,
            "iterationSemantics": (
                "OpenMM-maxIterations-argument-does-not-bound-total-reporter-"
                "callbacks-across-constraint-restarts"
            ),
            "reporter": trace.receipt(),
            "prePotentialEnergyKjMol": pre_state["energies"][0],
            "postInternalMinimizerPotentialEnergyKjMol": post_internal_minimizer["energies"][0],
            "postPotentialEnergyKjMol": post_minimization["energies"][0],
            "prePotentialForceComponentRmsKjMolNanometer": _force_component_rms(pre_state["forces"]),
            "postPotentialForceComponentRmsKjMolNanometer": _force_component_rms(
                post_minimization["forces"]
            ),
            "preConstraintRelativeResidual": pre_constraint_residual,
            "preApplyConstraintsRelativeResidual": pre_apply_constraint_residual,
            "postApplyConstraintsRelativeResidual": post_constraint_residual,
            "postMinimizationApplyConstraintsPerformed": True,
            "terminalGradientRmsKjMolNanometer": trace.last_objective_gradient_rms,
            "maximumConstraintRelativeResidual": post_constraint_residual,
            "allPositionsFinite": True,
            "allForcesFinite": True,
            "allEnergiesFinite": True,
            "reporterObservedTerminalState": reporter_observed_terminal_state,
            "reporterTerminalStateInterpretation": (
                "last-successful-lbfgs-iterate-before-openmm-internal-final-"
                "constraint-projection"
            ),
            "reporterTerminalOptimizerPositionSha256": digest_bytes(
                encode_f64le(trace.last_position_components)
            ),
            "postInternalConstraintProjectionPositionSha256": digest_bytes(
                encode_f64le(post_internal_components)
            ),
            "maximumReporterToPostInternalProjectionComponentDisplacementNanometer": (
                maximum_reporter_to_post_projection_displacement
            ),
            "terminalReporterConstraintRelativeResidual": terminal_report_constraint_error,
            "postconditionsAreProducerDiagnosticsOnly": True,
        },
        "velocityInitialization": {
            "method": "OpenMM-setVelocitiesToTemperature",
            "temperatureKelvin": TEMPERATURE_KELVIN,
            "randomSeed": VELOCITY_SEED,
            "operationOrder": [
                "setVelocitiesToTemperature",
                "removeMassWeightedCenterOfMassVelocity",
                "applyVelocityConstraints",
            ],
            "operationSequence": [
                "OpenMM-setVelocitiesToTemperature",
                "remove-mass-weighted-center-of-mass-velocity",
                "OpenMM-setVelocities",
                "OpenMM-applyVelocityConstraints",
            ],
            "setVelocitiesToTemperatureInternalConstraintTolerance": 1e-5,
            "removeMassWeightedCenterOfMassVelocity": True,
            "applyVelocityConstraintsAfterCenterOfMassRemoval": True,
            "explicitVelocityConstraintTolerance": CONSTRAINT_TOLERANCE,
            "constraintTolerance": CONSTRAINT_TOLERANCE,
            "firstVelocityConstraintRelativeResidual": first_velocity_residual,
            "removedCenterOfMassVelocityNanometerPerPicosecond": list(removed_com),
            "finalVelocityConstraintRelativeResidual": final_velocity_residual,
            "finalCenterOfMassVelocityNanometerPerPicosecond": list(final_com),
            "finalCenterOfMassSpeedNanometerPerPicosecond": final_com_speed,
            "centerOfMassVelocityFormula": "norm(sum(m_i*v_i))/sum(m_i)",
            "maximumCenterOfMassSpeedNanometerPerPicosecond": 1e-12,
            "velocityConstraintResidualFormula": (
                "max(abs(dot(r_ij,v_j-v_i))/max(norm(r_ij)*norm(v_j-v_i),"
                "1e-12-nm2-ps))"
            ),
            "maximumVelocityConstraintRelativeResidual": 1e-8,
            "postconditionEvaluationPoint": "after-explicit-applyVelocityConstraints",
            "seedAloneIsReplayInput": False,
            "sequence": "set-temperature-remove-mass-weighted-com-apply-velocity-constraints",
            "velocityConstraintRelativeResidual": final_velocity_residual,
            "massWeightedMomentumRelativeResidual": final_momentum_residual,
            "actualKineticTemperatureKelvin": (
                2.0 * float(production_start["energies"][1])
                / ((3 * PARTICLE_COUNT - CONSTRAINT_COUNT - 3) * 0.00831446261815324)
            ),
        },
        "forceSemantics": "potential-force-excluding-constraint-impulses",
        "velocitySemantics": "raw-openmm-verlet-half-step-associated-velocity",
        "energyTemporalAlignment": ENERGY_TEMPORAL_ALIGNMENT,
        "stateKineticEnergySemantics": STATE_KINETIC_ENERGY_SEMANTICS,
        "rawHalfStepVelocitiesSufficientToRecomputeStateKineticEnergy": False,
        "portableProductionStartStateDigest": digest_value(start_state_identity),
        "arrays": sorted(descriptors, key=lambda item: str(item["id"])),
        "claims": dict(CLAIMS),
    }
    receipt["receiptDigest"] = digest_value(receipt)
    atomic_write_json(root / "manifests/prepare-receipt.json", receipt)
    return receipt


def _open_reference_writers(
    stack: contextlib.ExitStack, root: Path, replica: str
) -> dict[str, AtomicArrayWriter]:
    prefix = f"reference-{replica}"
    specs = {
        "sampleSteps": (f"{prefix}-sample-steps", f"arrays/{prefix}-sample-steps.u32le", "uint32-le", (FRAME_COUNT,), "step"),
        "sampleTimes": (f"{prefix}-sample-times", f"arrays/{prefix}-sample-times.f64le", "float64-le", (FRAME_COUNT,), "picosecond"),
        "positions": (f"{prefix}-positions", f"arrays/{prefix}-positions.f64le", "float64-le", (FRAME_COUNT, PARTICLE_COUNT, 3), "nanometer"),
        "velocities": (f"{prefix}-velocities", f"arrays/{prefix}-velocities.f64le", "float64-le", (FRAME_COUNT, PARTICLE_COUNT, 3), "nanometer-per-picosecond"),
        "forces": (f"{prefix}-potential-forces", f"arrays/{prefix}-potential-forces.f64le", "float64-le", (FRAME_COUNT, PARTICLE_COUNT, 3), "kilojoule-per-mole-per-nanometer"),
        "energies": (f"{prefix}-energies", f"arrays/{prefix}-energies.f64le", "float64-le", (FRAME_COUNT, 3), "kilojoule-per-mole"),
        "groupEnergies": (f"{prefix}-comparison-group-energies", f"arrays/{prefix}-comparison-group-energies.f64le", "float64-le", (len(COMPARISON_STEPS), 5), "kilojoule-per-mole"),
        "groupForces": (f"{prefix}-comparison-group-forces", f"arrays/{prefix}-comparison-group-forces.f64le", "float64-le", (len(COMPARISON_STEPS), 5, PARTICLE_COUNT, 3), "kilojoule-per-mole-per-nanometer"),
    }
    return {
        key: stack.enter_context(
            AtomicArrayWriter(
                output_root=root,
                artifact_id=artifact_id,
                relative_path=path,
                dtype=dtype,
                shape=shape,
                unit=unit,
            )
        )
        for key, (artifact_id, path, dtype, shape, unit) in specs.items()
    }


def _set_locked_cell(context: object, mm: object, unit: object) -> None:
    vectors = [mm.Vec3(*row) * unit.nanometer for row in CELL_NANOMETER]
    context.setPeriodicBoxVectors(*vectors)


def run_reference(replica: str, input_root: Path, output_root: Path) -> dict[str, object]:
    if replica not in ("a", "b"):
        raise ContractViolation("reference replica must be a or b")
    validate_input_root(input_root)
    root = canonical_directory(output_root, "output root", create=True)
    prepare = _read_json(root / "manifests/prepare-receipt.json")
    compiled = compile_system(input_root)
    _assert_compilation_matches_prepare(compiled, prepare)
    start_positions = read_particle_array(
        root / "arrays/start-positions.f64le", unit_label="start positions"
    )
    start_velocities = read_particle_array(
        root / "arrays/start-velocities.f64le", unit_label="start velocities"
    )
    lane = create_context(compiled, "Reference")
    context = lane["context"]
    mm = compiled["mm"]
    unit = compiled["unit"]
    _set_locked_cell(context, mm, unit)
    set_positions(context, mm, unit, start_positions)
    set_velocities(context, mm, unit, start_velocities)
    warmup = warmup_and_pme_readback(compiled, lane)

    comparison_set = set(COMPARISON_STEPS)
    with contextlib.ExitStack() as stack:
        writers = _open_reference_writers(stack, root, replica)
        for frame_index in range(FRAME_COUNT):
            step = frame_index * SAMPLE_STRIDE_STEPS
            if frame_index > 0:
                lane["integrator"].step(SAMPLE_STRIDE_STEPS)
            state = state_payload(context, unit)
            writers["sampleSteps"].write((step,))
            writers["sampleTimes"].write((state["timePicoseconds"],))
            writers["positions"].write(state["positions"])
            writers["velocities"].write(state["velocities"])
            writers["forces"].write(state["forces"])
            writers["energies"].write(state["energies"])
            if step in comparison_set:
                energies, forces = group_payload(context, unit)
                writers["groupEnergies"].write(energies)
                writers["groupForces"].write(forces)
        descriptors = [writer.finish() for writer in writers.values()]

    start_identity = {
        "positionSha256": digest_bytes(encode_f64le(start_positions)),
        "velocitySha256": digest_bytes(encode_f64le(start_velocities)),
        "cellSha256": digest_bytes(encode_f64le(CELL_NANOMETER)),
        "atomOrderDigest": compiled["atomOrderDigest"],
    }
    manifest: dict[str, object] = {
        "schemaVersion": REFERENCE_RUN_SCHEMA_VERSION,
        "artifactId": ARTIFACT_ID,
        "planDigest": PLAN_DIGEST,
        "status": "complete",
        "lane": f"reference-{replica}",
        "platform": "Reference",
        "systemDigest": SYSTEM_DIGEST,
        "backendManifestDigest": REFERENCE_BACKEND_MANIFEST_DIGEST,
        "replica": replica,
        "processId": os.getpid(),
        "freshProcessRequired": True,
        "compiledTopologyDigest": compiled["compiledTopologyDigest"],
        "serializedSystemDigest": compiled["serializedSystemDigest"],
        "atomOrderDigest": compiled["atomOrderDigest"],
        "prepareReceiptDigest": prepare.get("receiptDigest"),
        "portableProductionStartStateDigest": digest_value(start_identity),
        "startPositionSha256": start_identity["positionSha256"],
        "startVelocitySha256": start_identity["velocitySha256"],
        "integrator": "OpenMM-VerletIntegrator",
        "timeStepPicoseconds": TIME_STEP_PICOSECONDS,
        "integratedSteps": FRAME_COUNT * SAMPLE_STRIDE_STEPS - SAMPLE_STRIDE_STEPS,
        "sampleCount": FRAME_COUNT,
        "sampleStrideSteps": SAMPLE_STRIDE_STEPS,
        "actualContextProperties": lane["platformProperties"],
        "pmeWarmupAndReadback": warmup,
        "actualPmeContextParameters": warmup["actualPmeContextParameters"],
        "platformProperties": lane["platformProperties"],
        "forceSemantics": "potential-force-excluding-constraint-impulses",
        "velocitySemantics": "raw-openmm-verlet-half-step-associated-velocity",
        "velocityReadbackSemantics": (
            "prepared-step-0-then-raw-OpenMM-Verlet-half-step-velocities-"
            "no-resynchronization"
        ),
        "velocityTemporalAlignment": "openmm-verlet-raw-velocity-at-t-minus-dt-over-2",
        "energyColumnOrder": ["potential", "kinetic", "total"],
        "energyTemporalAlignment": ENERGY_TEMPORAL_ALIGNMENT,
        "stateKineticEnergySemantics": STATE_KINETIC_ENERGY_SEMANTICS,
        "rawHalfStepVelocitiesSufficientToRecomputeStateKineticEnergy": False,
        "groupOrder": ["total", "harmonic-bond", "harmonic-angle", "nonbonded-direct-and-lennard-jones", "nonbonded-reciprocal"],
        "positionsEnforcePeriodicBox": False,
        "integrationForceGroupsMask": 15,
        "determinism": {
            "scope": "same-host-same-container-fresh-process-exact-required",
            "executionMode": "canonical-reference-trajectory-and-fixed-coordinate-evaluation",
            "freeTrajectoryCrossPlatformEquality": False,
            "randomSeedReconstructsPortableState": False,
        },
        "fallbackPolicy": "reject-no-algorithm-or-platform-fallback",
        "arrays": sorted(descriptors, key=lambda item: str(item["id"])),
        "claims": dict(CLAIMS),
    }
    manifest["runReceiptDigest"] = digest_value(manifest)
    atomic_write_json(root / f"manifests/reference-{replica}-run.json", manifest)
    return manifest


def _reference_frame_bytes(data: bytes, frame_index: int) -> bytes:
    frame_bytes = PARTICLE_COUNT * 3 * 8
    start = frame_index * frame_bytes
    end = start + frame_bytes
    if not 0 <= frame_index < FRAME_COUNT or end > len(data):
        raise ContractViolation("reference coordinate frame index is outside the trajectory")
    return data[start:end]


def run_cpu(input_root: Path, output_root: Path) -> dict[str, object]:
    validate_input_root(input_root)
    root = canonical_directory(output_root, "output root", create=True)
    prepare = _read_json(root / "manifests/prepare-receipt.json")
    reference = _read_json(root / "manifests/reference-a-run.json")
    compiled = compile_system(input_root)
    _assert_compilation_matches_prepare(compiled, prepare)
    trajectory_bytes = read_regular_file(
        root / "arrays/reference-a-positions.f64le",
        maximum_bytes=FRAME_COUNT * PARTICLE_COUNT * 3 * 8,
    )
    if len(trajectory_bytes) != FRAME_COUNT * PARTICLE_COUNT * 3 * 8:
        raise ContractViolation("Reference A coordinate artifact has the wrong byte length")
    lane = create_context(compiled, "CPU")
    context = lane["context"]
    mm = compiled["mm"]
    unit = compiled["unit"]
    _set_locked_cell(context, mm, unit)

    specs = {
        "readbackPositions": ("cpu-readback-positions", "arrays/cpu-readback-positions.f64le", (len(COMPARISON_STEPS), PARTICLE_COUNT, 3), "nanometer"),
        "readbackCells": ("cpu-readback-cells", "arrays/cpu-readback-cells.f64le", (len(COMPARISON_STEPS), 9), "nanometer"),
        "groupEnergies": ("cpu-comparison-group-energies", "arrays/cpu-comparison-group-energies.f64le", (len(COMPARISON_STEPS), 5), "kilojoule-per-mole"),
        "groupForces": ("cpu-comparison-group-forces", "arrays/cpu-comparison-group-forces.f64le", (len(COMPARISON_STEPS), 5, PARTICLE_COUNT, 3), "kilojoule-per-mole-per-nanometer"),
    }
    coordinate_receipts: list[dict[str, object]] = []
    coordinate_readback_matched = True
    first_pme_readback: dict[str, object] | None = None
    with contextlib.ExitStack() as stack:
        writers = {
            key: stack.enter_context(
                AtomicArrayWriter(
                    output_root=root,
                    artifact_id=artifact_id,
                    relative_path=path,
                    dtype="float64-le",
                    shape=shape,
                    unit=unit_label,
                )
            )
            for key, (artifact_id, path, shape, unit_label) in specs.items()
        }
        for step, frame_index in zip(COMPARISON_STEPS, COMPARISON_FRAME_INDICES):
            source_bytes = _reference_frame_bytes(trajectory_bytes, frame_index)
            source_positions = [
                list(row)
                for row in zip(*[iter(decode_f64le(source_bytes))] * 3)
            ]
            _set_locked_cell(context, mm, unit)
            set_positions(context, mm, unit, source_positions)
            warmup = warmup_and_pme_readback(compiled, lane)
            if first_pme_readback is None:
                first_pme_readback = warmup
            readback_state = context.getState(getPositions=True, enforcePeriodicBox=False)
            readback_positions = vectors_to_plain(readback_state.getPositions(), unit.nanometer)
            readback_cell = vectors_to_plain(readback_state.getPeriodicBoxVectors(), unit.nanometer)
            energies, forces = group_payload(context, unit)
            writers["readbackPositions"].write(readback_positions)
            writers["readbackCells"].write(readback_cell)
            writers["groupEnergies"].write(energies)
            writers["groupForces"].write(forces)
            coordinate_receipts.append(
                {
                    "step": step,
                    "sourceReferenceFrameIndex": frame_index,
                    "setPositionSha256": digest_bytes(source_bytes),
                    "getPositionSha256": digest_bytes(encode_f64le(readback_positions)),
                    "setCellSha256": digest_bytes(encode_f64le(CELL_NANOMETER)),
                    "getCellSha256": digest_bytes(encode_f64le(readback_cell)),
                    "warmupPotentialEnergyKjMol": warmup["warmupPotentialEnergyKjMol"],
                }
            )
            if encode_f64le(readback_positions) != source_bytes:
                coordinate_readback_matched = False
        descriptors = [writer.finish() for writer in writers.values()]

    if first_pme_readback is None:
        raise ContractViolation("CPU lane did not evaluate any fixed coordinate")
    if not coordinate_readback_matched:
        raise ContractViolation("CPU position readback differs from Reference A fixed-coordinate input")
    manifest: dict[str, object] = {
        "schemaVersion": CPU_RUN_SCHEMA_VERSION,
        "artifactId": ARTIFACT_ID,
        "planDigest": PLAN_DIGEST,
        "status": "complete",
        "lane": "cpu-fixed-coordinate",
        "platform": "CPU",
        "systemDigest": SYSTEM_DIGEST,
        "backendManifestDigest": CPU_BACKEND_MANIFEST_DIGEST,
        "processId": os.getpid(),
        "fixedCoordinateComparisonOnly": True,
        "freeTrajectoryExecution": False,
        "integratedSteps": 0,
        "compiledTopologyDigest": compiled["compiledTopologyDigest"],
        "serializedSystemDigest": compiled["serializedSystemDigest"],
        "atomOrderDigest": compiled["atomOrderDigest"],
        "prepareReceiptDigest": prepare.get("receiptDigest"),
        "referenceRunReceiptDigest": reference.get("runReceiptDigest"),
        "actualContextProperties": lane["platformProperties"],
        "pmeWarmupAndReadback": first_pme_readback,
        "actualPmeContextParameters": first_pme_readback["actualPmeContextParameters"],
        "platformProperties": lane["platformProperties"],
        "comparisonMode": "fixed-reference-a-coordinates-no-integration-no-projection",
        "warmupEnergyEvaluationCompletedBeforePmeReadback": True,
        "coordinateReadbackMatchedReferenceInput": True,
        "coordinateReceipts": coordinate_receipts,
        "forceSemantics": "potential-force-excluding-constraint-impulses",
        "groupOrder": ["total", "harmonic-bond", "harmonic-angle", "nonbonded-direct-and-lennard-jones", "nonbonded-reciprocal"],
        "positionsEnforcePeriodicBox": False,
        "determinism": {
            "scope": "fixed-coordinate-comparison-only-no-integration",
            "executionMode": "fixed-coordinate-evaluation-only-zero-integrated-steps",
            "freeTrajectoryCrossPlatformEquality": False,
            "randomSeedReconstructsPortableState": False,
        },
        "fallbackPolicy": "reject-no-algorithm-or-platform-fallback",
        "arrays": sorted(descriptors, key=lambda item: str(item["id"])),
        "claims": dict(CLAIMS),
    }
    manifest["runReceiptDigest"] = digest_value(manifest)
    atomic_write_json(root / "manifests/cpu-fixed-coordinate-run.json", manifest)
    return manifest


def _canonical_digest_without_lf(value: object) -> str:
    encoded = json.dumps(
        value, ensure_ascii=True, allow_nan=False, sort_keys=True, separators=(",", ":")
    ).encode("ascii")
    return "sha256:" + hashlib.sha256(encoded).hexdigest()


def _expected_array_contracts() -> tuple[dict[str, dict[str, object]], ...]:
    def record(path: str, dtype: str, shape: Sequence[int], unit: str) -> dict[str, object]:
        return {"path": path, "dtype": dtype, "shape": list(shape), "unit": unit}

    prepare = {
        "cell": record("arrays/cell.f64le", "float64-le", (9,), "nanometer"),
        "masses": record("arrays/masses.f64le", "float64-le", (PARTICLE_COUNT,), "dalton"),
        "constraints": record("arrays/constraints.u32le", "uint32-le", (PARTICLE_COUNT, 2), "index"),
        "constraint-targets": record("arrays/constraint-targets.f64le", "float64-le", (PARTICLE_COUNT,), "nanometer"),
        "comparison-steps": record("arrays/comparison-steps.u32le", "uint32-le", (5,), "step"),
        "start-positions": record("arrays/start-positions.f64le", "float64-le", (PARTICLE_COUNT, 3), "nanometer"),
        "start-velocities": record("arrays/start-velocities.f64le", "float64-le", (PARTICLE_COUNT, 3), "nanometer-per-picosecond"),
    }

    def reference(prefix: str) -> dict[str, dict[str, object]]:
        return {
            f"{prefix}-sample-steps": record(f"arrays/{prefix}-sample-steps.u32le", "uint32-le", (FRAME_COUNT,), "step"),
            f"{prefix}-sample-times": record(f"arrays/{prefix}-sample-times.f64le", "float64-le", (FRAME_COUNT,), "picosecond"),
            f"{prefix}-positions": record(f"arrays/{prefix}-positions.f64le", "float64-le", (FRAME_COUNT, PARTICLE_COUNT, 3), "nanometer"),
            f"{prefix}-velocities": record(f"arrays/{prefix}-velocities.f64le", "float64-le", (FRAME_COUNT, PARTICLE_COUNT, 3), "nanometer-per-picosecond"),
            f"{prefix}-potential-forces": record(f"arrays/{prefix}-potential-forces.f64le", "float64-le", (FRAME_COUNT, PARTICLE_COUNT, 3), "kilojoule-per-mole-per-nanometer"),
            f"{prefix}-energies": record(f"arrays/{prefix}-energies.f64le", "float64-le", (FRAME_COUNT, 3), "kilojoule-per-mole"),
            f"{prefix}-comparison-group-energies": record(f"arrays/{prefix}-comparison-group-energies.f64le", "float64-le", (5, 5), "kilojoule-per-mole"),
            f"{prefix}-comparison-group-forces": record(f"arrays/{prefix}-comparison-group-forces.f64le", "float64-le", (5, 5, PARTICLE_COUNT, 3), "kilojoule-per-mole-per-nanometer"),
        }

    cpu = {
        "cpu-readback-positions": record("arrays/cpu-readback-positions.f64le", "float64-le", (5, PARTICLE_COUNT, 3), "nanometer"),
        "cpu-readback-cells": record("arrays/cpu-readback-cells.f64le", "float64-le", (5, 9), "nanometer"),
        "cpu-comparison-group-energies": record("arrays/cpu-comparison-group-energies.f64le", "float64-le", (5, 5), "kilojoule-per-mole"),
        "cpu-comparison-group-forces": record("arrays/cpu-comparison-group-forces.f64le", "float64-le", (5, 5, PARTICLE_COUNT, 3), "kilojoule-per-mole-per-nanometer"),
    }
    return prepare, reference("reference-a"), reference("reference-b"), cpu


def _validate_source_array_descriptors(
    arrays: object, expected: Mapping[str, Mapping[str, object]]
) -> list[dict[str, object]]:
    if not isinstance(arrays, list) or any(not isinstance(record, dict) for record in arrays):
        raise ContractViolation("producer source manifest lacks a valid arrays list")
    by_id = {str(record.get("id")): record for record in arrays}
    if len(by_id) != len(arrays) or set(by_id) != set(expected):
        raise ContractViolation("producer source manifest array id set differs from the locked lane")
    validated: list[dict[str, object]] = []
    for artifact_id in sorted(expected):
        record = by_id[artifact_id]
        validate_descriptor(record)
        identity = {key: record[key] for key in ("path", "dtype", "shape", "unit")}
        if identity != expected[artifact_id]:
            raise ContractViolation(f"{artifact_id}: array descriptor identity differs from the lock")
        validated.append(record)
    return validated


def write_artifact_manifest(
    output_root: Path, source_revision: str, producer_outcome_digest: str
) -> dict[str, object]:
    root = canonical_directory(output_root, "output root", create=True)
    if not re.fullmatch(r"(?!0{40})[0-9a-f]{40}", source_revision):
        raise ContractViolation("source revision must be one nonzero lowercase Git commit ID")
    if not re.fullmatch(r"sha256:[0-9a-f]{64}", producer_outcome_digest):
        raise ContractViolation("producer outcome digest is invalid")
    control_paths = {
        "runtime-inventory": "manifests/runtime-inventory.json",
        "prepare-receipt": "manifests/prepare-receipt.json",
        "reference-a-run": "manifests/reference-a-run.json",
        "reference-b-run": "manifests/reference-b-run.json",
        "cpu-fixed-coordinate-run": "manifests/cpu-fixed-coordinate-run.json",
    }
    source_manifests = [
        _read_json(root / path)
        for path in (
            "manifests/prepare-receipt.json",
            "manifests/reference-a-run.json",
            "manifests/reference-b-run.json",
            "manifests/cpu-fixed-coordinate-run.json",
        )
    ]
    descriptors: list[dict[str, object]] = []
    for source, expected in zip(source_manifests, _expected_array_contracts()):
        descriptors.extend(_validate_source_array_descriptors(source.get("arrays"), expected))
    ids = [str(record["id"]) for record in descriptors]
    paths = [str(record["path"]) for record in descriptors]
    if len(ids) != len(set(ids)) or len(paths) != len(set(paths)):
        raise ContractViolation("producer artifact descriptors repeat an id or path")
    for record in descriptors:
        data = read_regular_file(root / str(record["path"]))
        if len(data) != record["sizeBytes"] or digest_bytes(data) != record["sha256"]:
            raise ContractViolation(f"{record['path']}: artifact bytes differ from their descriptor")
    control_records: list[dict[str, object]] = []
    for artifact_id, path in control_paths.items():
        data = read_regular_file(root / path, maximum_bytes=MAX_JSON_BYTES)
        control_records.append(
            {
                "id": artifact_id,
                "path": path,
                "kind": "canonical-json",
                "dtype": "canonical-json",
                "shape": [],
                "unit": "canonical-json-bytes",
                "sizeBytes": len(data),
                "sha256": digest_bytes(data),
            }
        )
    artifacts = sorted([*descriptors, *control_records], key=lambda item: str(item["id"]))
    bundle_root = _canonical_digest_without_lf(
        {
            "schemaVersion": "tf.openmm-tip3p-artifact-bundle-root/0.4.5",
            "artifacts": artifacts,
        }
    )
    manifest: dict[str, object] = {
        "schemaVersion": ARTIFACT_MANIFEST_SCHEMA_VERSION,
        "profile": "openmm-tip3p-producer-internal-evidence",
        "planDigest": PLAN_DIGEST,
        "systemDigest": SYSTEM_DIGEST,
        "sourceRevision": source_revision,
        "producerOutcomeDigest": producer_outcome_digest,
        "artifacts": artifacts,
        "bundleRoot": bundle_root,
        "publicationPolicy": {
            "profile": "tf.openmm-tip3p-internal-evidence/0.4.5",
            "rawScientificPayloadPublic": False,
            "parameterAssetsPublic": False,
            "coordinateAssetsPublic": False,
            "serializedSystemPublic": False,
            "containerPublic": False,
            "licenseClearanceRequired": True,
            "independentVerificationRequired": True,
            "attestationRequiredForPromotion": True,
        },
    }
    atomic_write_json(root / "manifests/artifact-manifest.json", manifest)
    return manifest


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(sys.argv[1:] if argv is None else list(argv))
    if args.command == "runtime":
        result = run_runtime(args.input_root, args.output_root)
    elif args.command == "prepare":
        result = run_prepare(args.input_root, args.output_root)
    elif args.command == "reference":
        result = run_reference(args.replica, args.input_root, args.output_root)
    elif args.command == "cpu":
        result = run_cpu(args.input_root, args.output_root)
    elif args.command == "manifest":
        result = write_artifact_manifest(
            args.output_root, args.source_revision, args.producer_outcome_digest
        )
    else:
        raise AssertionError("unreachable command")
    print(json.dumps({"schemaVersion": result["schemaVersion"]}, sort_keys=True, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except IncompleteExecution as error:
        print(f"incomplete: {error}", file=sys.stderr)
        raise SystemExit(75) from None
