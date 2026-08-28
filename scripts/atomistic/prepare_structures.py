#!/usr/bin/env python3
"""Trusted, standard-library-only Random-TP label-stripping preprocessor."""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path
from typing import Any, Sequence

from runtime_contract import (
    ContractViolation,
    EXPECTED_SCIENTIFIC_PLAN_PROJECTION,
    EXPECTED_STRUCTURE_BUNDLE_TRUST_ROOT,
    STRUCTURE_MANIFEST_SCHEMA,
    STRUCTURE_SCHEMA,
    atomic_write_bytes,
    build_structure_record,
    canonical_existing_file,
    canonical_json_bytes,
    id_set_digest,
    inspect_random_tp,
    prepare_output_directory,
    record_manifest_digest,
    reverify_artifact,
    structure_manifest_digest,
    validate_reproduction_plan_bytes,
    validate_scientific_plan_trust_root,
    verify_artifact,
)

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_PLAN = (ROOT / "evaluation/atomistic/reproduction-plan.json").resolve()
BUNDLE_NAME = "structures.jsonl"
MANIFEST_NAME = "structures.manifest.json"


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Validate frozen Random-TP labels, then emit deterministic structure-only JSONL."
    )
    parser.add_argument("--dataset", required=True,
                        help="absolute canonical path to frozen raw random-TP.xyz")
    parser.add_argument("--output", required=True,
                        help="absolute path to a new or empty output directory")
    parser.add_argument("--plan", default=str(DEFAULT_PLAN),
                        help="absolute canonical v0.2 reproduction plan")
    return parser


def _load_plan(raw_path: str) -> dict[str, Any]:
    path = canonical_existing_file(raw_path, "reproduction plan")
    try:
        payload = path.read_bytes()
        validate_reproduction_plan_bytes(payload)
        plan = json.loads(payload)
    except (OSError, json.JSONDecodeError) as error:
        raise ContractViolation("plan-invalid", f"cannot read plan: {error}") from error
    validate_scientific_plan_trust_root(plan)
    return plan


def _validate_source(records: list[dict[str, Any]]) -> dict[str, Any]:
    expected = EXPECTED_SCIENTIFIC_PLAN_PROJECTION["benchmark"]
    by_id = {record["id"]: record for record in records}
    values = {
        "frames": len(records),
        "atoms": sum(record["atomCount"] for record in records),
        "elements": len({number for record in records for number in record["atomicNumbers"]}),
        "idSetSha256": id_set_digest(record["id"] for record in records),
        "recordManifestSha256": record_manifest_digest(records),
    }
    smoke = [by_id[identifier] for identifier in expected["smokeIds"] if identifier in by_id]
    values.update({
        "smokeManifestSha256": id_set_digest(record["id"] for record in smoke),
        "smokeRecordManifestSha256": record_manifest_digest(smoke),
        "smokeElements": len({number for record in smoke for number in record["atomicNumbers"]}),
    })
    for key, actual in values.items():
        if actual != expected[key]:
            raise ContractViolation(
                "source-scientific-integrity", f"source {key} differs from trust root",
                details={"expected": expected[key], "actual": actual},
            )
    if any(record["atomCount"] != expected["atomsPerFrame"] for record in records):
        raise ContractViolation("source-atoms-per-frame", "source frame atom count drifted")
    return values


def build_outputs(raw_records: list[dict[str, Any]]) -> tuple[bytes, dict[str, Any]]:
    structures = sorted(
        (build_structure_record(record) for record in raw_records),
        key=lambda record: record["id"],
    )
    bundle = b"\n".join(canonical_json_bytes(record) for record in structures) + b"\n"
    bundle_sha256 = f"sha256:{hashlib.sha256(bundle).hexdigest()}"
    expected = EXPECTED_SCIENTIFIC_PLAN_PROJECTION["benchmark"]
    by_id = {record["id"]: record for record in structures}
    smoke = [by_id[identifier] for identifier in expected["smokeIds"]]
    manifest = {
        "schemaVersion": STRUCTURE_MANIFEST_SCHEMA,
        "structureSchemaVersion": STRUCTURE_SCHEMA,
        "canonicalization": "sorted-id-canonical-json-lines/v1",
        "digestCanonicalization": "tf.atomistic-structure/v1",
        "bundle": {
            "filename": BUNDLE_NAME,
            "sizeBytes": len(bundle),
            "sha256": bundle_sha256,
            "records": len(structures),
        },
        "counts": {
            "frames": len(structures),
            "atoms": sum(record["atomCount"] for record in structures),
            "elements": len({number for record in structures
                             for number in record["atomicNumbers"]}),
            "atomsPerFrame": expected["atomsPerFrame"],
        },
        "idSetSha256": id_set_digest(record["id"] for record in structures),
        "structureManifestSha256": structure_manifest_digest(structures),
        "smoke": {
            "ids": expected["smokeIds"],
            "idSetSha256": id_set_digest(record["id"] for record in smoke),
            "structureManifestSha256": structure_manifest_digest(smoke),
            "elements": len({number for record in smoke
                             for number in record["atomicNumbers"]}),
        },
        "sourceDatasetSha256": expected["sha256"],
    }
    return bundle, manifest


def run(args: argparse.Namespace) -> dict[str, Any]:
    _load_plan(args.plan)
    expected = EXPECTED_SCIENTIFIC_PLAN_PROJECTION["benchmark"]
    dataset = verify_artifact(
        args.dataset,
        role="trusted raw Random-TP dataset",
        expected_size=expected["sizeBytes"],
        expected_sha256=expected["sha256"],
        expected_filename=expected["filename"],
    )
    raw_records = inspect_random_tp(Path(dataset.path))
    _validate_source(raw_records)
    reverify_artifact(dataset)
    bundle, manifest = build_outputs(raw_records)
    manifest_bytes = canonical_json_bytes(manifest) + b"\n"
    actual_outputs = {
        "bundle": {
            "filename": BUNDLE_NAME, "sizeBytes": len(bundle),
            "sha256": f"sha256:{hashlib.sha256(bundle).hexdigest()}",
        },
        "manifest": {
            "filename": MANIFEST_NAME, "sizeBytes": len(manifest_bytes),
            "sha256": f"sha256:{hashlib.sha256(manifest_bytes).hexdigest()}",
        },
        "structureManifestSha256": manifest["structureManifestSha256"],
        "smokeStructureManifestSha256": manifest["smoke"]["structureManifestSha256"],
    }
    if actual_outputs != EXPECTED_STRUCTURE_BUNDLE_TRUST_ROOT:
        raise ContractViolation(
            "structure-output-trust-root",
            "generated structure-only artifacts differ from the frozen trust root",
            details={"expected": EXPECTED_STRUCTURE_BUNDLE_TRUST_ROOT,
                     "actual": actual_outputs},
        )
    output = prepare_output_directory(args.output)
    atomic_write_bytes(output / BUNDLE_NAME, bundle)
    atomic_write_bytes(output / MANIFEST_NAME, manifest_bytes)
    return manifest


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        manifest = run(args)
    except BaseException as error:
        print(f"structure preparation failed: {error}", file=sys.stderr)
        return 1
    print(json.dumps({
        "status": "STRUCTURES_PREPARED_NOT_INFERENCE",
        "bundleSha256": manifest["bundle"]["sha256"],
        "structureManifestSha256": manifest["structureManifestSha256"],
        "records": manifest["bundle"]["records"],
    }, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
