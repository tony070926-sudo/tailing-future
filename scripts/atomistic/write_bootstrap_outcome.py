#!/usr/bin/env python3
"""Write one bounded, non-promotional atomistic bootstrap outcome manifest."""

from __future__ import annotations

import argparse
import json
import os
import re
import stat
import sys
import tempfile
from pathlib import Path, PurePosixPath
from typing import Sequence


SCHEMA_VERSION = "tf.atomistic-bootstrap-outcome/0.1"
EVIDENCE_CLASS = "bootstrap-not-reproduced"
OUTPUT_RELATIVE_PATH = "manifests/bootstrap-outcome.json"
DERIVED_WHEEL_MANIFEST = "manifests/python-hostlist.derived-wheel.manifest.json"
MODELS = ("mattersim", "mace")
STAGES = (
    "guard",
    "directories",
    "bind",
    "base",
    "assets",
    "structures",
    "wheelhouse",
    "resolve",
    "freeze",
    "cold-install",
    "build",
    "inference",
)
OUTCOMES = frozenset(("success", "failure", "skipped", "cancelled"))

MAX_PATH_BYTES = 4_096
MAX_RUN_ID = 9_223_372_036_854_775_807
MAX_RUN_ATTEMPT = 1_000_000
MAX_DIRECTORY_ENTRIES = 32
MAX_PUBLISHED_FILE_BYTES = 16 * 1024 * 1024
MAX_PUBLISHED_BYTES = 32 * 1024 * 1024
MAX_MANIFEST_BYTES = 64 * 1024

ALLOWED_DIRECTORIES = frozenset(("locks", "manifests", "predictions", "diagnostics"))
STATIC_FILE_STAGES = {
    "manifests/fetched-assets.manifest.json": "assets",
    "manifests/pytorch-download-sources.json": "wheelhouse",
    "manifests/structures.manifest.json": "structures",
    "manifests/run-summary.json": "inference",
    "predictions/predictions.jsonl": "inference",
    "diagnostics/run-diagnostics.json": "inference",
    "diagnostics/failure-diagnostics.json": "inference",
}
SUCCESS_REQUIRED_FILES = {
    "assets": frozenset(("manifests/fetched-assets.manifest.json",)),
    "structures": frozenset(("manifests/structures.manifest.json",)),
    "wheelhouse": frozenset(("manifests/pytorch-download-sources.json",)),
    "inference": frozenset((
        "manifests/run-summary.json",
        "predictions/predictions.jsonl",
        "diagnostics/run-diagnostics.json",
    )),
}


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Write a deterministic bootstrap-not-reproduced outcome manifest."
    )
    parser.add_argument("--model", required=True)
    parser.add_argument("--commit-sha", required=True)
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--run-attempt", required=True)
    parser.add_argument(
        "--publish-root",
        required=True,
        help="absolute canonical directory containing only allowlisted bootstrap files",
    )
    parser.add_argument(
        "--stage",
        action="append",
        default=[],
        metavar="STAGE=OUTCOME",
        help="repeat once for every stage, in the frozen order",
    )
    return parser


def _parse_positive_decimal(raw: str, label: str, maximum: int) -> int:
    if not re.fullmatch(r"[1-9][0-9]*", raw):
        raise ValueError(f"{label} must be a canonical positive decimal integer")
    value = int(raw)
    if value > maximum:
        raise ValueError(f"{label} exceeds its bound")
    return value


def _parse_identity(
    model: str, commit_sha: str, run_id: str, run_attempt: str
) -> tuple[str, str, int, int]:
    if model not in MODELS:
        raise ValueError("model must be mattersim or mace")
    if not re.fullmatch(r"[0-9a-f]{40}", commit_sha) or commit_sha == "0" * 40:
        raise ValueError("commit SHA must be one nonzero lowercase 40-hex Git commit ID")
    return (
        model,
        commit_sha,
        _parse_positive_decimal(run_id, "run id", MAX_RUN_ID),
        _parse_positive_decimal(run_attempt, "run attempt", MAX_RUN_ATTEMPT),
    )


def parse_stage_outcomes(raw_stages: Sequence[str]) -> tuple[tuple[str, str], ...]:
    if len(raw_stages) != len(STAGES):
        raise ValueError(f"exactly {len(STAGES)} ordered stage outcomes are required")
    parsed: list[tuple[str, str]] = []
    for index, raw in enumerate(raw_stages):
        if not isinstance(raw, str) or raw.count("=") != 1:
            raise ValueError("each stage outcome must use exact stage=outcome syntax")
        stage, outcome = raw.split("=", 1)
        if stage != STAGES[index]:
            raise ValueError(f"stage {index + 1} must be {STAGES[index]}")
        if outcome not in OUTCOMES:
            raise ValueError(f"{stage} has an unsupported outcome")
        parsed.append((stage, outcome))

    terminal_index = next(
        (index for index, (_, outcome) in enumerate(parsed) if outcome != "success"),
        None,
    )
    if terminal_index is not None:
        terminal_outcome = parsed[terminal_index][1]
        if terminal_outcome not in ("failure", "cancelled"):
            raise ValueError("the first non-success stage must be failure or cancelled")
        if any(outcome != "skipped" for _, outcome in parsed[terminal_index + 1:]):
            raise ValueError("every stage after the first failure or cancellation must be skipped")
    return tuple(parsed)


def _canonical_publish_root(raw: str) -> Path:
    if len(os.fsencode(raw)) > MAX_PATH_BYTES:
        raise ValueError("publish root path exceeds its bound")
    path = Path(raw)
    if not path.is_absolute() or path != Path(os.path.abspath(path)):
        raise ValueError("publish root must be a normalized absolute path")
    resolved = path.resolve(strict=True)
    metadata = path.lstat()
    if resolved != path or not stat.S_ISDIR(metadata.st_mode) or stat.S_ISLNK(metadata.st_mode):
        raise ValueError("publish root must be a canonical, symlink-free real directory")
    return resolved


def _file_stage_allowlist(model: str) -> dict[str, str | None]:
    allowed: dict[str, str | None] = {
        **STATIC_FILE_STAGES,
        f"locks/{model}.requirements.lock": "resolve",
        f"manifests/{model}.wheelhouse.manifest.json": "resolve",
        OUTPUT_RELATIVE_PATH: None,
    }
    if model == "mace":
        allowed[DERIVED_WHEEL_MANIFEST] = "wheelhouse"
    return allowed


def _scan_publish_root(root: Path, model: str) -> tuple[tuple[str, ...], int]:
    allowed_files = _file_stage_allowlist(model)
    present: list[str] = []
    entry_count = 0
    total_bytes = 0
    stack: list[tuple[Path, PurePosixPath]] = [(root, PurePosixPath())]
    while stack:
        directory, prefix = stack.pop()
        with os.scandir(directory) as entries:
            for entry in entries:
                entry_count += 1
                if entry_count > MAX_DIRECTORY_ENTRIES:
                    raise ValueError("publish root contains too many entries")
                relative = prefix / entry.name
                relative_name = relative.as_posix()
                if entry.is_symlink():
                    raise ValueError(f"publish entry is a symbolic link: {relative_name}")
                if entry.is_dir(follow_symlinks=False):
                    if relative_name not in ALLOWED_DIRECTORIES:
                        raise ValueError(
                            f"publish root contains an unknown directory: {relative_name}"
                        )
                    stack.append((Path(entry.path), relative))
                    continue
                metadata = entry.stat(follow_symlinks=False)
                if not stat.S_ISREG(metadata.st_mode) or metadata.st_nlink != 1:
                    raise ValueError(f"publish entry is not one regular file: {relative_name}")
                if relative_name not in allowed_files:
                    raise ValueError(f"publish root contains an unknown file: {relative_name}")
                if metadata.st_size > MAX_PUBLISHED_FILE_BYTES:
                    raise ValueError(f"publish file exceeds its bound: {relative_name}")
                total_bytes += metadata.st_size
                if total_bytes > MAX_PUBLISHED_BYTES:
                    raise ValueError("publish files exceed the aggregate byte bound")
                present.append(relative_name)
    return tuple(sorted(present)), total_bytes


def _validate_file_outcomes(
    model: str,
    stages: tuple[tuple[str, str], ...],
    present_files: tuple[str, ...],
) -> None:
    by_stage = dict(stages)
    present = set(present_files)
    terminal_index = next(
        (index for index, (_, outcome) in enumerate(stages) if outcome != "success"),
        None,
    )
    for stage, required in SUCCESS_REQUIRED_FILES.items():
        if by_stage[stage] == "success" and not required.issubset(present):
            missing = sorted(required - present)
            raise ValueError(f"successful {stage} stage is missing allowlisted files: {missing}")
    if model == "mace" and by_stage["wheelhouse"] == "success":
        if DERIVED_WHEEL_MANIFEST not in present:
            raise ValueError(
                "successful MACE wheelhouse stage is missing its derived-wheel manifest"
            )
    if by_stage["resolve"] == "success":
        required = {
            f"locks/{model}.requirements.lock",
            f"manifests/{model}.wheelhouse.manifest.json",
        }
        if not required.issubset(present):
            missing = sorted(required - present)
            raise ValueError(
                f"successful resolve stage is missing allowlisted files: {missing}"
            )

    file_stages = _file_stage_allowlist(model)
    for relative_name in present:
        producer = file_stages[relative_name]
        if producer is None:
            raise ValueError("refusing to overwrite an existing bootstrap outcome")
        producer_index = STAGES.index(producer)
        if terminal_index is not None and producer_index > terminal_index:
            raise ValueError(f"file from a skipped stage is present: {relative_name}")

    inference_outcome = by_stage["inference"]
    success_only = {
        "manifests/run-summary.json",
        "predictions/predictions.jsonl",
        "diagnostics/run-diagnostics.json",
    }
    if inference_outcome != "success" and present.intersection(success_only):
        raise ValueError("prediction or success output exists without successful inference")
    failure_diagnostic = "diagnostics/failure-diagnostics.json"
    if failure_diagnostic in present and inference_outcome not in ("failure", "cancelled"):
        raise ValueError("failure diagnostics require failed or cancelled inference")


def build_manifest(
    *,
    model: str,
    commit_sha: str,
    run_id: str,
    run_attempt: str,
    raw_stages: Sequence[str],
    present_files: Sequence[str],
) -> dict[str, object]:
    model, commit_sha, parsed_run_id, parsed_attempt = _parse_identity(
        model, commit_sha, run_id, run_attempt
    )
    stages = parse_stage_outcomes(raw_stages)
    _validate_file_outcomes(model, stages, tuple(present_files))
    outcomes = dict(stages)
    failure_stage = next(
        (stage for stage, outcome in stages if outcome == "failure"),
        None,
    )
    status = "success" if all(outcome == "success" for _, outcome in stages) else "failed"
    published_files = sorted({*present_files, OUTPUT_RELATIVE_PATH})
    manifest: dict[str, object] = {
        "schemaVersion": SCHEMA_VERSION,
        "model": model,
        "commitSha": commit_sha,
        "runId": parsed_run_id,
        "runAttempt": parsed_attempt,
        "status": status,
        "failureStage": failure_stage,
        "stages": [
            {"stage": stage, "outcome": outcome} for stage, outcome in stages
        ],
        "inferenceSucceeded": outcomes["inference"] == "success",
        "predictionsPresent": "predictions/predictions.jsonl" in present_files,
        "publishedFiles": published_files,
        "evidenceClass": EVIDENCE_CLASS,
    }
    if set(manifest) != {
        "schemaVersion", "model", "commitSha", "runId", "runAttempt", "status",
        "failureStage", "stages", "inferenceSucceeded", "predictionsPresent",
        "publishedFiles", "evidenceClass",
    } or manifest["evidenceClass"] != EVIDENCE_CLASS:
        raise AssertionError("outcome manifest claim surface drifted")
    return manifest


def _ensure_manifest_directory(root: Path) -> Path:
    directory = root / "manifests"
    try:
        directory.mkdir(mode=0o700)
    except FileExistsError:
        pass
    metadata = directory.lstat()
    if (
        not stat.S_ISDIR(metadata.st_mode)
        or stat.S_ISLNK(metadata.st_mode)
        or directory.resolve(strict=True) != directory
    ):
        raise ValueError("manifest output directory must be canonical and symlink-free")
    return directory


def _atomic_write_new(path: Path, payload: bytes) -> None:
    if len(payload) > MAX_MANIFEST_BYTES:
        raise ValueError("outcome manifest exceeds its byte bound")
    directory = path.parent
    if path != directory / "bootstrap-outcome.json":
        raise ValueError("outcome path is not the fixed allowlisted destination")
    descriptor, temporary_name = tempfile.mkstemp(
        prefix=".bootstrap-outcome.json.", suffix=".partial", dir=directory
    )
    temporary_path = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "wb") as handle:
            handle.write(payload)
            handle.flush()
            os.fchmod(handle.fileno(), 0o444)
            os.fsync(handle.fileno())
        os.link(temporary_path, path, follow_symlinks=False)
    finally:
        try:
            temporary_path.unlink()
        except FileNotFoundError:
            pass
    directory_descriptor = os.open(
        directory, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0)
    )
    try:
        os.fsync(directory_descriptor)
    finally:
        os.close(directory_descriptor)
    metadata = path.lstat()
    if (
        not stat.S_ISREG(metadata.st_mode)
        or stat.S_ISLNK(metadata.st_mode)
        or metadata.st_nlink != 1
        or metadata.st_size != len(payload)
    ):
        raise OSError("atomic outcome is not one complete regular file")


def write_outcome(
    *,
    model: str,
    commit_sha: str,
    run_id: str,
    run_attempt: str,
    publish_root: str,
    raw_stages: Sequence[str],
) -> tuple[Path, dict[str, object]]:
    root = _canonical_publish_root(publish_root)
    present_files, input_bytes = _scan_publish_root(root, model)
    manifest = build_manifest(
        model=model,
        commit_sha=commit_sha,
        run_id=run_id,
        run_attempt=run_attempt,
        raw_stages=raw_stages,
        present_files=present_files,
    )
    payload = (
        json.dumps(manifest, ensure_ascii=True, sort_keys=True, separators=(",", ":"))
        + "\n"
    ).encode("ascii")
    if input_bytes + len(payload) > MAX_PUBLISHED_BYTES:
        raise ValueError("publish files plus outcome exceed the aggregate byte bound")
    manifest_directory = _ensure_manifest_directory(root)
    output_path = manifest_directory / "bootstrap-outcome.json"
    _atomic_write_new(output_path, payload)
    return output_path, manifest


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        output_path, manifest = write_outcome(
            model=args.model,
            commit_sha=args.commit_sha,
            run_id=args.run_id,
            run_attempt=args.run_attempt,
            publish_root=args.publish_root,
            raw_stages=args.stage,
        )
    except (OSError, ValueError) as error:
        print(f"bootstrap outcome failed: {error}", file=sys.stderr)
        return 1
    print(json.dumps({
        "evidenceClass": EVIDENCE_CLASS,
        "output": str(output_path),
        "status": manifest["status"],
    }, ensure_ascii=True, sort_keys=True, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
