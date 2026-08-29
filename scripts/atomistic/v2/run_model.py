#!/usr/bin/env python3
"""Run a frozen atomistic checkpoint with the v2 non-promotional evidence contract.

Only the standard library and ``runtime_contract`` load at module import time.
Package, checkpoint and structure-only bundle bytes plus the offline network boundary are
validated before ASE, NumPy, PyTorch, MatterSim or MACE can be imported.  This
process writes predictions and operational diagnostics only; an independent
verifier owns metrics, Merkle roots, acceptance and final receipts.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import random
import resource
import sys
import time
import traceback
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Sequence

import runtime_contract as runtime_contract_module
from runtime_contract import (
    ContractViolation,
    EXPECTED_STRUCTURE_BUNDLE_TRUST_ROOT,
    VerifiedArtifact,
    assert_no_positive_promotion_claims,
    atomic_write_bytes,
    atomic_write_json,
    canonical_existing_file,
    canonical_json_bytes,
    clean_partial_outputs,
    collect_installed_distributions,
    configure_preimport_environment,
    ensure_keys,
    id_set_digest,
    execution_provenance,
    non_promotional_claims,
    prepare_output_directory,
    prove_network_egress_disabled,
    public_error,
    parse_structure_jsonl,
    require_installed_distribution,
    reverify_artifact,
    sha256_json,
    stable_file_record,
    structure_manifest_digest,
    validate_scientific_plan_trust_root,
    validate_reproduction_plan_bytes,
    validate_base_runtime,
    verify_artifact,
)

RUNNER_IMPLEMENTATION = "tf.atomistic-runner/v2"
RUNNER_SCHEMA = "tf.atomistic-run-summary/0.3"
PREDICTION_SCHEMA = "tf.atomistic-prediction/0.3"
DIAGNOSTIC_SCHEMA = "tf.atomistic-run-diagnostic/0.3"
PLAN_SCHEMA = "tf.atomistic-reproduction/0.2"
MODEL_IDS = {
    "mattersim": "mattersim-v1.0.0-5m",
    "mace": "mace-mpa-0-medium",
}
MODEL_ADAPTERS = {
    "mattersim": "mattersim-ase-batch1-full3x3-eva3/v1",
    "mace": "mace-ase-batch1-full3x3-eva3/v1",
}
EXPECTED_MODE_COUNTS = {"smoke": 10, "full": 693}
SEED = 20260828
STANDARD_RUNNER_CONTAINER_PATHS = {
    "run_model.py": "/opt/tailing-venv/lib/python3.12/site-packages/run_model.py",
    "runtime_contract.py": "/opt/tailing-venv/lib/python3.12/site-packages/runtime_contract.py",
}


def _resolve_runner_layout(executed_path: Path) -> tuple[str, Path, Path]:
    """Resolve source, Stage-S materialized, and final-container runner layouts."""

    resolved = executed_path.resolve()
    if resolved.parts[-4:] == ("scripts", "atomistic", "v2", "run_model.py"):
        root = resolved.parents[3]
        return (
            "source-v2",
            root,
            (root / "evaluation/atomistic/reproduction-plan.json").resolve(),
        )
    if resolved.parts[-3:] == ("scripts", "atomistic", "run_model.py"):
        root = resolved.parents[2]
        return (
            "stage-s-materialized",
            root,
            (root / "evaluation/atomistic/reproduction-plan.json").resolve(),
        )
    standard_path = Path(STANDARD_RUNNER_CONTAINER_PATHS["run_model.py"])
    if resolved == standard_path:
        return "standard-container", Path("/"), Path("/inputs/reproduction-plan.json")
    raise RuntimeError(f"unsupported v2 runner layout: {resolved}")


RUNNER_LAYOUT, ROOT, DEFAULT_PLAN = _resolve_runner_layout(Path(__file__))


@dataclass(frozen=True)
class FrameCase:
    identifier: str
    atoms: Any
    atom_count: int
    atomic_numbers: tuple[int, ...]
    input_structure_digest: str


@dataclass(frozen=True)
class ModelOutput:
    case: FrameCase
    energy_ev: float
    forces_ev_per_angstrom: list[list[float]]
    stress_ase_ev_per_angstrom3: list[list[float]]


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Run MatterSim or MACE under the versioned v2 "
            "network-disabled CPU/float32/batch-1 contract."
        )
    )
    parser.add_argument("--model", required=True, choices=sorted(MODEL_IDS))
    parser.add_argument(
        "--mode", required=True, choices=sorted(EXPECTED_MODE_COUNTS),
        help="smoke selects the 10 frozen IDs; full requires all 693 records",
    )
    parser.add_argument("--package", required=True,
                        help="absolute canonical path to the frozen package wheel")
    parser.add_argument("--checkpoint", required=True,
                        help="absolute canonical path to the frozen checkpoint")
    parser.add_argument("--structures", required=True,
                        help="absolute canonical path to frozen structure-only JSONL")
    parser.add_argument("--structure-manifest", required=True,
                        help="absolute canonical path to frozen structure-only manifest")
    parser.add_argument("--output", required=True,
                        help="absolute path to a new or empty output directory")
    parser.add_argument("--plan", default=str(DEFAULT_PLAN),
                        help="absolute canonical reproduction-plan path")
    return parser


def _load_plan(path_raw: str) -> tuple[dict[str, Any], Path, str]:
    path = canonical_existing_file(path_raw, "reproduction plan")
    try:
        payload = path.read_bytes()
        validate_reproduction_plan_bytes(payload)
        plan = json.loads(payload)
    except (OSError, json.JSONDecodeError) as error:
        raise ContractViolation("plan-invalid", f"cannot read plan: {error}") from error
    if not isinstance(plan, dict) or plan.get("schemaVersion") != PLAN_SCHEMA:
        raise ContractViolation("plan-invalid", f"expected plan schema {PLAN_SCHEMA}")
    ensure_keys(plan, ("models", "benchmarks", "protocol"), "reproduction plan")
    validate_scientific_plan_trust_root(plan)
    return plan, path, f"sha256:{hashlib.sha256(payload).hexdigest()}"


def _select_manifest_entries(
    plan: dict[str, Any], model_name: str
) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    expected_id = MODEL_IDS[model_name]
    models = [item for item in plan["models"] if item.get("id") == expected_id]
    if len(models) != 1:
        raise ContractViolation("model-manifest-invalid",
                                f"expected one manifest for {expected_id}")
    model = models[0]
    ensure_keys(model, ("package", "checkpoint", "cachePath", "defaultAliasAllowed",
                        "outputs", "sourceCommit"), expected_id)
    ensure_keys(model["package"], ("name", "version", "filename", "sizeBytes", "sha256"),
                f"{expected_id} package")
    ensure_keys(model["checkpoint"], ("sizeBytes", "sha256"),
                f"{expected_id} checkpoint")
    if model["defaultAliasAllowed"] is not False:
        raise ContractViolation("alias-enabled", "default model aliases are forbidden")
    if model["outputs"] != ["energy_eV", "forces_eV_per_angstrom",
                            "stress_eV_per_angstrom3"]:
        raise ContractViolation("output-contract-drift", "E/F/stress contract drifted")

    benchmarks = [item for item in plan["benchmarks"]
                  if item.get("role") == "primary-like-for-like"]
    if len(benchmarks) != 1:
        raise ContractViolation("benchmark-manifest-invalid",
                                "expected one primary like-for-like benchmark")
    benchmark = benchmarks[0]
    ensure_keys(benchmark, ("artifact", "cachePath"), "primary benchmark")
    ensure_keys(benchmark["artifact"], (
        "sizeBytes", "sha256", "frames", "atoms", "elements", "atomsPerFrame",
        "idSetSha256", "smokeIds", "smokeElements", "smokeManifestSha256",
        "recordManifestSha256", "smokeRecordManifestSha256",
        "manifestCanonicalization",
    ), "primary benchmark artifact")
    if benchmark["artifact"]["manifestCanonicalization"] != "tf.random-tp.record/v1":
        raise ContractViolation("dataset-canonicalization-drift",
                                "scientific record canonicalization changed")

    runner = plan["protocol"].get("runner", {})
    expected = {
        "python": "3.12.13", "platform": "linux", "architecture": "x86_64",
        "dtype": "float32", "canonicalDevice": "cpu", "batchSize": 1,
        "threads": 1, "networkPolicy": "fetch-online-run-offline",
        "isolation": "verified-pickle-in-networkless-unprivileged-read-only-container",
    }
    drift = {key: {"expected": value, "actual": runner.get(key)}
             for key, value in expected.items() if runner.get(key) != value}
    adapter_key = "matterSimAdapter" if model_name == "mattersim" else "maceAdapter"
    if runner.get(adapter_key) != MODEL_ADAPTERS[model_name]:
        drift[adapter_key] = {"expected": MODEL_ADAPTERS[model_name],
                              "actual": runner.get(adapter_key)}
    if drift:
        raise ContractViolation("runner-contract-drift", "plan runner contract drifted",
                                details=drift)
    return model, benchmark, runner


def _verify_assets(args: argparse.Namespace, model: dict[str, Any],
                   benchmark: dict[str, Any]) -> dict[str, VerifiedArtifact]:
    package = model["package"]
    checkpoint = model["checkpoint"]
    del benchmark
    structure_bundle = EXPECTED_STRUCTURE_BUNDLE_TRUST_ROOT["bundle"]
    structure_manifest = EXPECTED_STRUCTURE_BUNDLE_TRUST_ROOT["manifest"]
    return {
        "package": verify_artifact(
            args.package, role=f"{model['id']} package",
            expected_size=package["sizeBytes"], expected_sha256=package["sha256"],
            expected_filename=package["filename"]),
        "checkpoint": verify_artifact(
            args.checkpoint, role=f"{model['id']} checkpoint",
            expected_size=checkpoint["sizeBytes"], expected_sha256=checkpoint["sha256"],
            expected_filename=Path(model["cachePath"]).name),
        "structures": verify_artifact(
            args.structures, role="frozen structure-only bundle",
            expected_size=structure_bundle["sizeBytes"],
            expected_sha256=structure_bundle["sha256"],
            expected_filename=structure_bundle["filename"]),
        "structureManifest": verify_artifact(
            args.structure_manifest, role="frozen structure-only manifest",
            expected_size=structure_manifest["sizeBytes"],
            expected_sha256=structure_manifest["sha256"],
            expected_filename=structure_manifest["filename"]),
    }


def _equal(actual: Any, expected: Any, code: str, label: str) -> None:
    if actual != expected:
        raise ContractViolation(code, f"{label} mismatch",
                                details={"expected": expected, "actual": actual})


def _load_and_validate_structures(
    bundle_path: str, manifest_path: str, benchmark: dict[str, Any], mode: str
) -> tuple[list[FrameCase], dict[str, Any]]:
    # The checkpoint process sees this structure-only bundle, never the raw
    # extxyz file or its energy/force/stress labels.
    records = parse_structure_jsonl(Path(bundle_path))
    try:
        manifest_bytes = Path(manifest_path).read_bytes()
        manifest = json.loads(manifest_bytes)
    except (OSError, json.JSONDecodeError) as error:
        raise ContractViolation("structure-manifest", f"cannot read manifest: {error}") from error
    if canonical_json_bytes(manifest) + b"\n" != manifest_bytes:
        raise ContractViolation("structure-manifest", "manifest is not canonical JSON")
    trust = EXPECTED_STRUCTURE_BUNDLE_TRUST_ROOT
    structure_root = structure_manifest_digest(records)
    if structure_root != trust["structureManifestSha256"]:
        raise ContractViolation("structure-manifest", "full structure manifest differs")
    expected = benchmark["artifact"]
    atom_total = sum(record["atomCount"] for record in records)
    elements = {number for record in records for number in record["atomicNumbers"]}
    checks = {
        "frames": len(records), "atoms": atom_total, "elements": len(elements),
        "atomsPerFrame": expected["atomsPerFrame"],
        "idSetSha256": id_set_digest(record["id"] for record in records),
        "structureManifestSha256": structure_root,
    }
    for key in ("frames", "atoms", "elements"):
        _equal(checks[key], expected[key], "structure-count", key)
    if any(record["atomCount"] != expected["atomsPerFrame"] for record in records):
        raise ContractViolation("structure-atoms-per-frame", "structure atom count drifted")
    _equal(checks["idSetSha256"], expected["idSetSha256"],
           "structure-id-set", "structure ID set")
    if manifest.get("structureManifestSha256") != structure_root:
        raise ContractViolation("structure-manifest", "manifest root differs from bundle")
    by_id = {record["id"]: record for record in records}
    smoke_ids = expected["smokeIds"]
    smoke_records = [by_id[identifier] for identifier in smoke_ids]
    smoke_root = structure_manifest_digest(smoke_records)
    if smoke_root != trust["smokeStructureManifestSha256"]:
        raise ContractViolation("structure-smoke-manifest", "smoke structure root differs")

    import numpy as np
    from ase import Atoms

    cases: dict[str, FrameCase] = {}
    for record in records:
        lattice = np.asarray(record["lattice"], dtype=np.float64)
        positions = np.asarray(record["positions"], dtype=np.float64)
        atoms = Atoms(
            numbers=record["atomicNumbers"], positions=positions,
            cell=lattice, pbc=record["pbc"],
        )
        if not math.isfinite(float(atoms.get_volume())) or atoms.get_volume() <= 0:
            raise ContractViolation("structure-cell", f"{record['id']} has invalid volume")
        cases[record["id"]] = FrameCase(
            record["id"], atoms, record["atomCount"],
            tuple(record["atomicNumbers"]), record["inputStructureDigest"],
        )
    selected_ids = smoke_ids if mode == "smoke" else sorted(cases)
    selected = [cases[identifier] for identifier in selected_ids]
    _equal(len(selected), EXPECTED_MODE_COUNTS[mode], "selection-count",
           f"{mode} selection count")
    checks.update({
        "smokeStructureManifestSha256": smoke_root,
        "selectedRecords": len(selected),
        "selectedIdsSha256": id_set_digest(selected_ids),
    })
    return selected, checks


def _configure_numeric_runtime() -> tuple[Any, Any]:
    import numpy as np
    import torch

    random.seed(SEED)
    np.random.seed(SEED)
    np.seterr(divide="raise", invalid="raise", over="raise", under="ignore")
    torch.manual_seed(SEED)
    torch.set_default_dtype(torch.float32)
    torch.set_num_threads(1)
    torch.set_num_interop_threads(1)
    torch.use_deterministic_algorithms(True)
    if hasattr(torch.backends, "cuda"):
        torch.backends.cuda.matmul.allow_tf32 = False
    if hasattr(torch.backends, "cudnn"):
        torch.backends.cudnn.allow_tf32 = False
        torch.backends.cudnn.benchmark = False
    if torch.cuda.is_available():
        raise ContractViolation("device-not-cpu", "CUDA is visible")
    if torch.get_default_dtype() is not torch.float32:
        raise ContractViolation("dtype-drift", "PyTorch default dtype is not float32")
    if torch.get_num_threads() != 1 or torch.get_num_interop_threads() != 1:
        raise ContractViolation("thread-drift", "PyTorch is not single-threaded")
    return np, torch


def _build_calculator(model_name: str, checkpoint: VerifiedArtifact) -> Any:
    checkpoint_path = Path(checkpoint.path)
    if (not checkpoint_path.is_absolute()
            or checkpoint_path.resolve(strict=True) != checkpoint_path):
        raise ContractViolation("checkpoint-alias", "checkpoint is not absolute/canonical")
    if model_name == "mattersim":
        from ase.units import GPa
        from mattersim.forcefield import MatterSimCalculator, Potential

        potential = Potential.from_checkpoint(
            load_path=str(checkpoint_path), model_name="m3gnet", device="cpu",
            load_training_state=False)
        potential.model.eval()
        calculator = MatterSimCalculator.from_potential(
            potential, device="cpu", dtype="float32", compute_stress=True,
            stress_weight=GPa, direct_graph=False, compile=False)
        if str(calculator.device) != "cpu" or str(calculator.dtype) != "torch.float32":
            raise ContractViolation("calculator-contract", "MatterSim device/dtype drift")
        if getattr(calculator, "_compiled", False) or getattr(
                calculator, "_use_direct_graph", False):
            raise ContractViolation("calculator-contract",
                                    "MatterSim compile/direct graph is forbidden")
        return calculator

    from mace.calculators import MACECalculator

    calculator = MACECalculator(
        model_paths=str(checkpoint_path), model_type="MACE", device="cpu",
        default_dtype="float32", energy_units_to_eV=1.0, length_units_to_A=1.0,
        compile_mode=None, enable_cueq=False, enable_oeq=False)
    if getattr(calculator, "num_models", None) != 1:
        raise ContractViolation("calculator-contract", "MACE committee is forbidden")
    if str(getattr(calculator, "device", "")) != "cpu":
        raise ContractViolation("calculator-contract", "MACE device drift")
    if getattr(calculator, "default_dtype", None) != "float32":
        raise ContractViolation("calculator-contract", "MACE dtype drift")
    if getattr(calculator, "use_compile", False):
        raise ContractViolation("calculator-contract", "MACE compile is forbidden")
    if getattr(calculator, "_enable_cueq", False) or getattr(
            calculator, "_enable_oeq", False):
        raise ContractViolation("calculator-contract", "MACE acceleration is forbidden")
    for loaded_model in calculator.models:
        loaded_model.eval()
    return calculator


def _finite_prediction(np: Any, identifier: str, count: int, energy: float,
                       forces: Any, stress: Any) -> tuple[Any, Any]:
    forces64 = np.asarray(forces, dtype=np.float64)
    stress64 = np.asarray(stress, dtype=np.float64)
    if forces64.shape != (count, 3):
        raise ContractViolation("prediction-force-shape",
                                f"{identifier} force shape is {forces64.shape}")
    if stress64.shape != (3, 3):
        raise ContractViolation("prediction-stress-shape",
                                f"{identifier} stress shape is {stress64.shape}")
    if not (math.isfinite(energy) and bool(np.isfinite(forces64).all())
            and bool(np.isfinite(stress64).all())):
        raise ContractViolation("prediction-nonfinite",
                                f"{identifier} produced non-finite E/F/stress")
    if not bool(np.allclose(stress64, stress64.T, rtol=0.0, atol=1e-10)):
        raise ContractViolation("prediction-stress-symmetry",
                                f"{identifier} stress is asymmetric")
    return forces64, stress64


def _run_outputs(model_name: str, cases: Sequence[FrameCase], calculator: Any,
                 np: Any) -> tuple[list[ModelOutput], dict[str, Any]]:
    outputs: list[ModelOutput] = []
    latencies: list[dict[str, Any]] = []
    all_started = time.perf_counter()
    for case in cases:
        predicted = case.atoms.copy()
        calculator.reset()
        predicted.calc = calculator
        started = time.perf_counter()
        try:
            energy = float(predicted.get_potential_energy())
            forces = predicted.get_forces()
            stress = predicted.get_stress(voigt=False)
        except Exception as error:
            raise ContractViolation("model-inference",
                                    f"{model_name} failed on {case.identifier}: {error}") from error
        elapsed = time.perf_counter() - started
        forces64, stress64 = _finite_prediction(
            np, case.identifier, case.atom_count, energy, forces, stress)
        outputs.append(ModelOutput(case, energy, forces64.tolist(), stress64.tolist()))
        latencies.append({"id": case.identifier, "seconds": elapsed})
    return outputs, {
        "inferenceWallSeconds": time.perf_counter() - all_started,
        "perRecordLatencySeconds": sorted(latencies, key=lambda item: item["id"]),
    }


def _runner_identity() -> dict[str, Any]:
    run_model_path = Path(__file__).resolve()
    runtime_contract_path = Path(runtime_contract_module.__file__).resolve()
    expected_runtime_contract_path = run_model_path.with_name("runtime_contract.py")
    if runtime_contract_path != expected_runtime_contract_path:
        raise ContractViolation(
            "runner-module-path",
            "v2 runtime_contract must be the sibling of the executed v2 run_model",
            details={
                "expected": str(expected_runtime_contract_path),
                "actual": str(runtime_contract_path),
            },
        )
    paths = {
        "run_model.py": run_model_path,
        "runtime_contract.py": runtime_contract_path,
    }
    files = []
    for name in sorted(paths):
        identity = stable_file_record(
            paths[name], f"v2 runner {name}", max_bytes=2 * 1024 * 1024
        )
        files.append({
            "name": name,
            "standardContainerPath": STANDARD_RUNNER_CONTAINER_PATHS[name],
            **identity,
        })
    return {
        "implementation": RUNNER_IMPLEMENTATION,
        "files": files,
        "digest": sha256_json(files),
    }


def _validate_provenance(runner_plan: dict[str, Any], model_name: str,
                         runner: dict[str, Any], provenance: dict[str, Any]) -> None:
    expected_runner = runner_plan.get("runnerDigest")
    if expected_runner is not None and expected_runner != runner["digest"]:
        raise ContractViolation("runner-digest-mismatch", "runner digest differs",
                                details={"expected": expected_runner,
                                         "actual": runner["digest"]})
    expected_container = runner_plan.get("containerDigests", {}).get(model_name)
    if expected_container is not None:
        raise ContractViolation(
            "container-trust-root-unsupported",
            "v2 will not compare a Docker local-load config ID with a promotion digest",
            details={"planContainerDigest": expected_container},
        )
    expected_lock = runner_plan.get("dependencyLockDigests", {}).get(model_name)
    lock = provenance["environmentLock"]
    actual_lock = lock["sha256"] if lock else None
    if expected_lock is not None and expected_lock != actual_lock:
        raise ContractViolation("lock-digest-mismatch", "lock digest differs",
                                details={"expected": expected_lock, "actual": actual_lock})


def _same_network_boundary(start: Any, end: Any) -> None:
    fields = ("network_namespace", "effective_capabilities", "interfaces",
              "ipv4_routes", "ipv6_routes", "escape_sockets_absent")
    drift = {field: {"start": getattr(start, field), "end": getattr(end, field)}
             for field in fields if getattr(start, field) != getattr(end, field)}
    if drift or not start.egress_disabled or not end.egress_disabled:
        raise ContractViolation("network-boundary-drifted",
                                "network boundary changed during inference", details=drift)


def _bind_predictions(outputs: Sequence[ModelOutput], *, model_id: str,
                      package_sha256: str, checkpoint_sha256: str,
                      runner_sha256: str,
                      environment_sha256: str) -> list[dict[str, Any]]:
    records = [{
        "schemaVersion": PREDICTION_SCHEMA,
        "id": output.case.identifier,
        "inputStructureDigest": output.case.input_structure_digest,
        "atomCount": output.case.atom_count,
        "atomicNumbers": list(output.case.atomic_numbers),
        "modelId": model_id,
        "checkpointSha256": checkpoint_sha256,
        "packageSha256": package_sha256,
        "runnerSha256": runner_sha256,
        "environmentSha256": environment_sha256,
        "status": "success",
        "energyEv": output.energy_ev,
        "forcesEvPerAngstrom": output.forces_ev_per_angstrom,
        "stressAseEvPerAngstrom3": output.stress_ase_ev_per_angstrom3,
    } for output in outputs]
    records.sort(key=lambda item: item["id"])
    if len({record["id"] for record in records}) != len(records):
        raise ContractViolation("output-duplicate", "prediction IDs are not unique")
    for record in records:
        canonical_json_bytes(record)  # rejects NaN and infinity
    return records


def _peak_rss_bytes() -> int:
    return int(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss) * 1024


def _write_failure(output: Path, *, run_id: str, stage: str,
                   error: BaseException, context: dict[str, Any]) -> None:
    clean_partial_outputs(output)
    for name in ("predictions.jsonl", "run-diagnostics.json", "summary.json",
                 "diagnostics.json"):
        try:
            (output / name).unlink()
        except FileNotFoundError:
            pass
    diagnostic = {
        "schemaVersion": DIAGNOSTIC_SCHEMA, "status": "failed", "runId": run_id,
        "failedAt": datetime.now(timezone.utc).isoformat(), "stage": stage,
        "error": public_error(error), "context": context,
        "traceback": traceback.format_exc().splitlines()[-40:],
        **non_promotional_claims(),
    }
    assert_no_positive_promotion_claims(diagnostic)
    atomic_write_json(output / "diagnostics.json", diagnostic)


def run(args: argparse.Namespace, output: Path, run_id: str) -> dict[str, Any]:
    stage = "preimport-environment"
    context: dict[str, Any] = {"model": args.model, "mode": args.mode}
    try:
        removed_proxies = configure_preimport_environment()
        runtime = validate_base_runtime()
        stage = "execution-identity"
        runner = _runner_identity()
        provenance = execution_provenance()
        claims = non_promotional_claims()
        context.update({
            "runnerSha256": runner["digest"],
            "workflowRevision": provenance["workflowRevision"],
            "runtimeSourceRevision": provenance["runtimeSourceRevision"],
            "executionIdentityComplete": provenance["executionIdentityComplete"],
        })
        stage = "manifest"
        plan, plan_path, plan_sha256 = _load_plan(args.plan)
        model, benchmark, runner_plan = _select_manifest_entries(plan, args.model)
        _validate_provenance(runner_plan, args.model, runner, provenance)
        context.update({"modelId": model["id"], "benchmarkId": benchmark["id"]})

        stage = "asset-integrity"
        artifacts = _verify_assets(args, model, benchmark)
        context["verifiedArtifacts"] = {name: value.public_record()
                                        for name, value in artifacts.items()}
        installed_package = require_installed_distribution(args.model)
        if installed_package != {"name": model["package"]["name"],
                                 "version": model["package"]["version"]}:
            raise ContractViolation("package-version-mismatch",
                                    "installed package differs from plan")

        stage = "network-isolation-start"
        network_start = prove_network_egress_disabled()
        stage = "structure-validation"
        cases, structure_summary = _load_and_validate_structures(
            artifacts["structures"].path,
            artifacts["structureManifest"].path,
            benchmark,
            args.mode,
        )
        stage = "numeric-runtime"
        np, torch = _configure_numeric_runtime()
        distributions, distributions_sha256 = collect_installed_distributions()

        stage = "pre-deserialization-integrity"
        for artifact in artifacts.values():
            reverify_artifact(artifact)
        stage = "checkpoint-load"
        load_started = time.perf_counter()
        calculator = _build_calculator(args.model, artifacts["checkpoint"])
        load_seconds = time.perf_counter() - load_started
        stage = "inference"
        outputs, timing = _run_outputs(args.model, cases, calculator, np)
        expected_count = EXPECTED_MODE_COUNTS[args.mode]
        _equal(len(outputs), expected_count, "output-count", "prediction count")

        stage = "network-isolation-end"
        network_end = prove_network_egress_disabled()
        _same_network_boundary(network_start, network_end)
        environment_binding = {
            "planSha256": plan_sha256, "runnerSha256": runner["digest"],
            "pythonVersion": runtime["pythonVersion"],
            "pythonImplementation": runtime["pythonImplementation"],
            "system": runtime["system"], "machine": runtime["machine"],
            "device": "cpu", "dtype": "float32", "batchSize": 1, "threads": 1,
            "adapter": MODEL_ADAPTERS[args.model], "numpyVersion": np.__version__,
            "torchVersion": torch.__version__,
            "installedDistributionsSha256": distributions_sha256,
            "dependencyLockSha256": (provenance["environmentLock"]["sha256"]
                                      if provenance["environmentLock"] else None),
            "containerIdentity": provenance["containerIdentity"],
            "executionIdentityComplete": provenance["executionIdentityComplete"],
            "workflowRevision": provenance["workflowRevision"],
            "runtimeSourceRevision": provenance["runtimeSourceRevision"],
            **claims,
            "structureBundleSha256": artifacts["structures"].sha256,
            "structureManifestFileSha256": artifacts["structureManifest"].sha256,
            "networkProofStart": network_start.public_record(),
            "networkProofEnd": network_end.public_record(),
        }
        environment_sha256 = sha256_json(environment_binding)
        records = _bind_predictions(
            outputs, model_id=model["id"],
            package_sha256=artifacts["package"].sha256,
            checkpoint_sha256=artifacts["checkpoint"].sha256,
            runner_sha256=runner["digest"], environment_sha256=environment_sha256)
        prediction_payload = b"\n".join(canonical_json_bytes(record)
                                        for record in records) + b"\n"
        prediction_sha256 = f"sha256:{hashlib.sha256(prediction_payload).hexdigest()}"

        diagnostics = {
            "schemaVersion": DIAGNOSTIC_SCHEMA,
            "status": "PREDICTIONS_ONLY_NOT_REPRODUCED", "runId": run_id,
            "modelId": model["id"], "mode": args.mode,
            "workflowRevision": provenance["workflowRevision"],
            "runtimeSourceRevision": provenance["runtimeSourceRevision"],
            "executionIdentityComplete": provenance["executionIdentityComplete"],
            **claims,
            "checkpointLoadSeconds": load_seconds, **timing,
            "peakRssBytes": _peak_rss_bytes(),
            "removedProxyVariables": list(removed_proxies),
            "predictionObjectsContainReferenceLabels": False,
        }
        diagnostic_payload = canonical_json_bytes(diagnostics) + b"\n"
        diagnostic_sha256 = f"sha256:{hashlib.sha256(diagnostic_payload).hexdigest()}"
        summary = {
            "schemaVersion": RUNNER_SCHEMA,
            "status": "PREDICTIONS_ONLY_NOT_REPRODUCED", "runId": run_id,
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "modelId": model["id"], "mode": args.mode,
            "workflowRevision": provenance["workflowRevision"],
            "runtimeSourceRevision": provenance["runtimeSourceRevision"],
            "executionIdentityComplete": provenance["executionIdentityComplete"],
            **claims,
            "environment": {
                **environment_binding, "environmentSha256": environment_sha256,
                "runtimeRelease": runtime["release"],
                "effectiveUid": runtime["effectiveUid"],
                "threadEnvironment": runtime["threadEnvironment"],
                "installedPackage": installed_package,
                "installedDistributions": distributions, "runner": runner,
                "provenance": provenance,
                "packageSha256": artifacts["package"].sha256,
                "checkpointSha256": artifacts["checkpoint"].sha256,
                "structureBundleSha256": artifacts["structures"].sha256,
                "structureManifestFileSha256": artifacts["structureManifest"].sha256,
                "planPath": str(plan_path),
            },
            "counts": {
                "expectedRecords": expected_count, "predictionRecords": len(records),
                "structureFrames": structure_summary["frames"],
                "structureAtoms": structure_summary["atoms"],
                "structureElements": structure_summary["elements"],
                "atomsPerFrame": structure_summary["atomsPerFrame"],
            },
            "structureIntegrity": structure_summary,
            "files": {
                "predictions": {"name": "predictions.jsonl",
                                "sha256": prediction_sha256, "records": len(records),
                                "schemaVersion": PREDICTION_SCHEMA},
                "diagnostics": {"name": "run-diagnostics.json",
                                "sha256": diagnostic_sha256},
            },
            "actualExecution": {"device": "cpu", "dtype": "float32",
                                "batchSize": 1, "threads": 1},
            "predictionObjectsContainReferenceLabels": False,
            "independentVerificationRequired": True,
        }
        assert_no_positive_promotion_claims({
            "predictions": records,
            "diagnostics": diagnostics,
            "summary": summary,
        })
        canonical_json_bytes(summary)
        stage = "publish"
        atomic_write_bytes(output / "predictions.jsonl", prediction_payload)
        atomic_write_bytes(output / "run-diagnostics.json", diagnostic_payload)
        atomic_write_json(output / "summary.json", summary)  # final completion marker
        return summary
    except BaseException as error:
        try:
            _write_failure(output, run_id=run_id, stage=stage, error=error,
                           context=context)
        except BaseException as diagnostic_error:
            print(f"runner failed and diagnostics could not be written: {diagnostic_error}",
                  file=sys.stderr)
        raise


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    run_id = str(uuid.uuid4())
    try:
        output = prepare_output_directory(args.output)
    except BaseException as error:
        print(f"atomistic runner refused output: {error}", file=sys.stderr)
        return 2
    try:
        summary = run(args, output, run_id)
    except BaseException as error:
        print(f"atomistic runner failed: {error}", file=sys.stderr)
        return 1
    print(f"Atomistic run: PREDICTIONS_ONLY_NOT_REPRODUCED · {summary['modelId']} · {summary['mode']} "
          f"{summary['counts']['predictionRecords']} predictions · "
          "independent verification required")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
