#!/usr/bin/env python3
"""Write one atomic, non-promotional OpenMM producer outcome."""

from __future__ import annotations

import argparse
import json
import stat
import sys
from pathlib import Path
from typing import Sequence

from contract import (
    ARTIFACT_ID,
    CLAIMS,
    MAX_JSON_BYTES,
    OUTCOME_SCHEMA_VERSION,
    PLAN_DIGEST,
    STATUS_DOMAIN,
    STAGES,
    SYSTEM_DIGEST,
    ContractViolation,
    atomic_write_bytes,
    canonical_json_bytes,
    canonical_directory,
    digest_bytes,
    read_regular_file,
    validate_relative_artifact_path,
    validate_stage_vector,
)


OUTPUT_RELATIVE_PATH = "manifests/producer-outcome.json"
ARTIFACT_MANIFEST_RELATIVE_PATH = "manifests/artifact-manifest.json"

ARTIFACT_STAGE = {
    "manifests/input-receipt.json": "inputs",
    "manifests/runtime-inventory.json": "runtime",
    "manifests/prepare-receipt.json": "prepare",
    "arrays/cell.f64le": "prepare",
    "arrays/masses.f64le": "prepare",
    "arrays/constraints.u32le": "prepare",
    "arrays/constraint-targets.f64le": "prepare",
    "arrays/start-positions.f64le": "prepare",
    "arrays/start-velocities.f64le": "prepare",
    "arrays/comparison-steps.u32le": "prepare",
    "manifests/reference-a-run.json": "reference-a",
    "arrays/reference-a-sample-steps.u32le": "reference-a",
    "arrays/reference-a-sample-times.f64le": "reference-a",
    "arrays/reference-a-positions.f64le": "reference-a",
    "arrays/reference-a-velocities.f64le": "reference-a",
    "arrays/reference-a-potential-forces.f64le": "reference-a",
    "arrays/reference-a-energies.f64le": "reference-a",
    "arrays/reference-a-comparison-group-energies.f64le": "reference-a",
    "arrays/reference-a-comparison-group-forces.f64le": "reference-a",
    "manifests/reference-b-run.json": "reference-b",
    "arrays/reference-b-sample-steps.u32le": "reference-b",
    "arrays/reference-b-sample-times.f64le": "reference-b",
    "arrays/reference-b-positions.f64le": "reference-b",
    "arrays/reference-b-velocities.f64le": "reference-b",
    "arrays/reference-b-potential-forces.f64le": "reference-b",
    "arrays/reference-b-energies.f64le": "reference-b",
    "arrays/reference-b-comparison-group-energies.f64le": "reference-b",
    "arrays/reference-b-comparison-group-forces.f64le": "reference-b",
    "manifests/cpu-fixed-coordinate-run.json": "cpu-fixed-coordinate",
    "arrays/cpu-readback-positions.f64le": "cpu-fixed-coordinate",
    "arrays/cpu-readback-cells.f64le": "cpu-fixed-coordinate",
    "arrays/cpu-comparison-group-energies.f64le": "cpu-fixed-coordinate",
    "arrays/cpu-comparison-group-forces.f64le": "cpu-fixed-coordinate",
    "manifests/producer-diagnostics.json": "cpu-fixed-coordinate",
}

REQUIRED_COMPLETE_PATHS = frozenset(ARTIFACT_STAGE)


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-root", type=Path, required=True)
    parser.add_argument(
        "--stage",
        action="append",
        default=[],
        metavar="STAGE=OUTCOME",
        help="repeat exactly once for every frozen stage, in order",
    )
    return parser


def parse_stages(raw: Sequence[str]) -> tuple[tuple[str, str], ...]:
    pairs: list[tuple[str, str]] = []
    for item in raw:
        if not isinstance(item, str) or item.count("=") != 1:
            raise ContractViolation("stage argument must use exact stage=outcome syntax")
        stage, value = item.split("=", 1)
        pairs.append((stage, value))
    return tuple(pairs)


def _evidence_record(root: Path, relative_path: str) -> dict[str, object]:
    validate_relative_artifact_path(relative_path)
    data = read_regular_file(root / relative_path)
    return {
        "path": relative_path,
        "stage": ARTIFACT_STAGE[relative_path],
        "sizeBytes": len(data),
        "sha256": digest_bytes(data),
    }


def _inventory(root: Path, normalized_stages: Sequence[dict[str, str]]) -> list[dict[str, object]]:
    outcome_by_stage = {item["stage"]: item["outcome"] for item in normalized_stages}
    records: list[dict[str, object]] = []
    for relative_path in sorted(ARTIFACT_STAGE):
        path = root / relative_path
        stage = ARTIFACT_STAGE[relative_path]
        if path.exists() or path.is_symlink():
            record = _evidence_record(root, relative_path)
            record["stageOutcome"] = outcome_by_stage[stage]
            records.append(record)
    return records


def _assert_closed_output_tree(root: Path) -> None:
    # The artifact manifest binds the digest of the final producer outcome.
    # It is therefore an allowed sibling but cannot also be evidence inside
    # that outcome without creating a cryptographic cycle.
    allowed = {OUTPUT_RELATIVE_PATH, ARTIFACT_MANIFEST_RELATIVE_PATH, *ARTIFACT_STAGE}
    for candidate in root.iterdir():
        if candidate.name not in ("arrays", "manifests"):
            raise ContractViolation(f"unexpected top-level output entry: {candidate.name}")
    for directory in ("arrays", "manifests"):
        base = root / directory
        if not base.exists():
            continue
        metadata = base.lstat()
        if not stat.S_ISDIR(metadata.st_mode) or base.is_symlink():
            raise ContractViolation(f"{directory} output path is not one real directory")
        for candidate in base.iterdir():
            relative = candidate.relative_to(root).as_posix()
            if relative not in allowed:
                raise ContractViolation(f"unexpected output artifact: {relative}")
            metadata = candidate.lstat()
            if not stat.S_ISREG(metadata.st_mode) or candidate.is_symlink() or metadata.st_nlink != 1:
                raise ContractViolation(f"{relative}: output artifact is not one regular file")


def build_outcome(
    output_root: Path,
    stages: Sequence[tuple[str, str]],
) -> dict[str, object]:
    root = canonical_directory(output_root, "output root", create=True)
    status, terminal_stage, normalized = validate_stage_vector(stages)
    _assert_closed_output_tree(root)
    evidence = _inventory(root, normalized)
    present = {str(item["path"]) for item in evidence}
    if status == "complete-pass" and present != REQUIRED_COMPLETE_PATHS:
        missing = sorted(REQUIRED_COMPLETE_PATHS - present)
        extra = sorted(present - REQUIRED_COMPLETE_PATHS)
        raise ContractViolation(f"complete producer evidence is not closed; missing={missing}, extra={extra}")

    # A stage reported as successful must have produced every artifact owned by
    # that stage.  The failed/cancelled terminal stage may contain partial
    # evidence, which is retained as negative evidence without being promoted.
    outcome_by_stage = {item["stage"]: item["outcome"] for item in normalized}
    for stage in STAGES:
        if outcome_by_stage[stage] != "success":
            continue
        required = {path for path, owner in ARTIFACT_STAGE.items() if owner == stage}
        missing = sorted(required - present)
        if missing:
            raise ContractViolation(f"successful {stage} stage is missing evidence: {missing}")

    diagnostic_path = root / "manifests/producer-diagnostics.json"
    diagnostic_metrics: object | None = None
    if diagnostic_path.exists():
        diagnostic_metrics = json.loads(
            read_regular_file(diagnostic_path, maximum_bytes=MAX_JSON_BYTES),
            object_pairs_hook=_reject_duplicate_keys,
        )
    return {
        "schemaVersion": OUTCOME_SCHEMA_VERSION,
        "artifactId": ARTIFACT_ID,
        "planDigest": PLAN_DIGEST,
        "systemDigest": SYSTEM_DIGEST,
        "status": status,
        "statusDomain": STATUS_DOMAIN,
        "terminalStage": terminal_stage,
        "stages": list(normalized),
        "evidence": evidence,
        "diagnosticMetrics": diagnostic_metrics,
        "diagnosticMetricsAreAcceptance": False,
        "claims": dict(CLAIMS),
    }


def write_built_outcome(
    output_root: Path, manifest: dict[str, object]
) -> tuple[Path, dict[str, object]]:
    """Atomically publish a previously built outcome without mutating it."""

    root = canonical_directory(output_root, "output root")
    data = canonical_json_bytes(manifest)
    path = root / OUTPUT_RELATIVE_PATH
    atomic_write_bytes(path, data)
    return path, manifest


def write_outcome(
    output_root: Path,
    stages: Sequence[tuple[str, str]],
) -> tuple[Path, dict[str, object]]:
    manifest = build_outcome(output_root, stages)
    return write_built_outcome(output_root, manifest)


def _reject_duplicate_keys(pairs: list[tuple[str, object]]) -> dict[str, object]:
    value: dict[str, object] = {}
    for key, item in pairs:
        if key in value:
            raise ContractViolation(f"duplicate JSON key: {key}")
        value[key] = item
    return value


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(sys.argv[1:] if argv is None else list(argv))
    path, manifest = write_outcome(args.output_root, parse_stages(args.stage))
    print(
        json.dumps(
            {"path": str(path), "status": manifest["status"]},
            sort_keys=True,
            separators=(",", ":"),
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
