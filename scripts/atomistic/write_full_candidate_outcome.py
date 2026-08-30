#!/usr/bin/env python3
"""Write one bounded, non-promotional full-candidate producer outcome.

This writer is deliberately label-blind.  It inventories only a fixed internal
evidence allowlist and derives the execution status from the actual ordered
step outcomes supplied by GitHub Actions.  It never accepts a caller-provided
status and never makes a scientific pass/fail assessment.  Its scanned working
directory is an internal evidence inventory, not an uploadable public artifact.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import secrets
import stat
import sys
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Sequence


SCHEMA_VERSION = "tf.atomistic-full-candidate-producer-outcome/0.2"
PROFILE = "full-candidate-producer"
EVIDENCE_CLASS = "producer-output-awaiting-independent-verification"
STATUS_DOMAIN = "producer-execution-only-not-scientific-assessment"
OUTPUT_RELATIVE_PATH = "manifests/producer-outcome.json"
EVIDENCE_INVENTORY_PROFILE = "tf.atomistic-full-candidate-producer-evidence-inventory/0.2"
SCIENTIFIC_ARTIFACT_EXACT_PATHS = (
    "manifests/structures.manifest.json",
    "predictions/predictions.jsonl",
)
MODELS = ("mattersim", "mace")
PARTITION_IDS = {
    "mattersim": "mattersim-full-000",
    "mace": "mace-full-000",
}
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
STAGE_OUTCOMES = frozenset(("success", "failure", "cancelled", "skipped"))

MAX_PATH_BYTES = 4_096
MAX_RUN_ID = 9_007_199_254_740_991
MAX_RUN_ATTEMPT = 1_000_000
MAX_DIRECTORY_ENTRIES = 32
MAX_PUBLISHED_FILE_BYTES = 16 * 1024 * 1024
MAX_PUBLISHED_BYTES = 32 * 1024 * 1024
MAX_MANIFEST_BYTES = 64 * 1024
READ_CHUNK_BYTES = 1024 * 1024

ALLOWED_DIRECTORIES = frozenset(("locks", "manifests", "predictions", "diagnostics"))
DERIVED_WHEEL_MANIFEST = "manifests/python-hostlist.derived-wheel.manifest.json"


@dataclass(frozen=True)
class FileRule:
    stage: str | None
    category: str


@dataclass(frozen=True)
class FileSnapshot:
    path: str
    stage: str
    category: str
    size_bytes: int
    sha256: str
    device: int
    inode: int
    modified_ns: int
    changed_ns: int

    def public_record(self, stage_outcome: str) -> dict[str, object]:
        return {
            "path": self.path,
            "stage": self.stage,
            "stageOutcome": stage_outcome,
            "sizeBytes": self.size_bytes,
            "sha256": self.sha256,
        }

    def private_identity(self) -> tuple[object, ...]:
        return (
            self.path,
            self.stage,
            self.category,
            self.size_bytes,
            self.sha256,
            self.device,
            self.inode,
            self.modified_ns,
            self.changed_ns,
        )


STATIC_FILE_RULES = {
    "manifests/fetched-assets.manifest.json": FileRule("assets", "control"),
    "manifests/pytorch-download-sources.json": FileRule("wheelhouse", "control"),
    "manifests/structures.manifest.json": FileRule("structures", "structure-manifest"),
    "manifests/run-summary.json": FileRule("inference", "control"),
    "predictions/predictions.jsonl": FileRule("inference", "predictions"),
    "diagnostics/run-diagnostics.json": FileRule("inference", "control"),
    "diagnostics/failure-diagnostics.json": FileRule("inference", "failure"),
}

SUCCESS_REQUIRED_FILES = {
    "assets": frozenset(("manifests/fetched-assets.manifest.json",)),
    "structures": frozenset(("manifests/structures.manifest.json",)),
    "wheelhouse": frozenset(("manifests/pytorch-download-sources.json",)),
    "inference": frozenset(
        (
            "manifests/run-summary.json",
            "predictions/predictions.jsonl",
            "diagnostics/run-diagnostics.json",
        )
    ),
}

CLAIMS = {
    "claimEligible": False,
    "comparisonEligible": False,
    "promotionEligible": False,
    "reproduced": False,
    "reproductionEligible": False,
    "superiorityClaimAllowed": False,
}

FORBIDDEN_MEMBER_CLASS_NAMES = (
    "raw-dataset",
    "raw-structure-records",
    "positions-cell-pbc",
    "reference-labels-targets",
    "scientific-metrics",
    "receipts-attestations",
    "model-checkpoints",
)

_SAFE_COMPONENT_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Write a deterministic, label-blind full-candidate producer outcome."
    )
    parser.add_argument("--model", required=True)
    parser.add_argument("--commit-sha", required=True)
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--run-attempt", required=True)
    parser.add_argument(
        "--publish-root",
        required=True,
        help=(
            "absolute canonical internal-evidence directory; this directory is "
            "not a public artifact"
        ),
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
    if not isinstance(raw, str) or not re.fullmatch(r"[1-9][0-9]*", raw):
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
    if not isinstance(commit_sha, str) or (
        not re.fullmatch(r"[0-9a-f]{40}", commit_sha) or commit_sha == "0" * 40
    ):
        raise ValueError("commit SHA must be one nonzero lowercase 40-hex Git commit ID")
    return (
        model,
        commit_sha,
        _parse_positive_decimal(run_id, "run id", MAX_RUN_ID),
        _parse_positive_decimal(run_attempt, "run attempt", MAX_RUN_ATTEMPT),
    )


def parse_stage_outcomes(
    raw_stages: Sequence[str],
) -> tuple[tuple[tuple[str, str], ...], str, str | None]:
    """Validate the actual ordered step outcomes and derive execution status.

    GitHub exposes success/failure/cancelled/skipped as step outcomes.  A fully
    skipped vector is the only unambiguous not-started representation.  A
    success prefix followed by bare skipped outcomes has no explicit reason and
    is therefore rejected rather than guessed.
    """

    if len(raw_stages) != len(STAGES):
        raise ValueError(f"exactly {len(STAGES)} ordered stage outcomes are required")
    parsed: list[tuple[str, str]] = []
    for index, raw in enumerate(raw_stages):
        if not isinstance(raw, str) or raw.count("=") != 1:
            raise ValueError("each stage outcome must use exact stage=outcome syntax")
        stage, stage_outcome = raw.split("=", 1)
        if stage != STAGES[index]:
            raise ValueError(f"stage {index + 1} must be {STAGES[index]}")
        if stage_outcome not in STAGE_OUTCOMES:
            raise ValueError(f"{stage} has an unsupported outcome")
        parsed.append((stage, stage_outcome))

    outcomes = tuple(stage_outcome for _, stage_outcome in parsed)
    if all(stage_outcome == "success" for stage_outcome in outcomes):
        return tuple(parsed), "complete", None
    if all(stage_outcome == "skipped" for stage_outcome in outcomes):
        return tuple(parsed), "not-started", None

    terminal_index = next(
        (index for index, stage_outcome in enumerate(outcomes) if stage_outcome != "success"),
        None,
    )
    if terminal_index is None:
        raise AssertionError("non-complete stage vector has no terminal outcome")
    terminal_stage, terminal_outcome = parsed[terminal_index]
    if terminal_outcome not in ("failure", "cancelled"):
        raise ValueError("the first non-success stage must be failure or cancelled")
    if any(stage_outcome != "skipped" for stage_outcome in outcomes[terminal_index + 1 :]):
        raise ValueError("every stage after failure or cancellation must be skipped")
    status_value = "failed" if terminal_outcome == "failure" else "cancelled"
    return tuple(parsed), status_value, terminal_stage


def _canonical_publish_root(raw: str) -> Path:
    if not isinstance(raw, str) or not raw or "\x00" in raw:
        raise ValueError("publish root must be one nonempty path string")
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


def _file_rules(model: str) -> dict[str, FileRule]:
    rules = {
        **STATIC_FILE_RULES,
        f"locks/{model}.requirements.lock": FileRule("resolve", "control"),
        f"manifests/{model}.wheelhouse.manifest.json": FileRule("resolve", "control"),
        f"manifests/{model}.runtime-inputs.json": FileRule("resolve", "control"),
        f"manifests/{model}.container-observation.json": FileRule("build", "control"),
        f"diagnostics/{model}.buildx-metadata.json": FileRule("build", "control"),
        f"diagnostics/{model}.image-inspect.json": FileRule("build", "control"),
        f"diagnostics/{model}.buildx-version.txt": FileRule("build", "control"),
        f"diagnostics/{model}.docker-server-version.txt": FileRule("build", "control"),
        OUTPUT_RELATIVE_PATH: FileRule(None, "outcome"),
    }
    if model == "mace":
        rules[DERIVED_WHEEL_MANIFEST] = FileRule("wheelhouse", "control")
    return rules


def _same_stat(left: os.stat_result, right: os.stat_result) -> bool:
    return (
        left.st_dev,
        left.st_ino,
        left.st_mode,
        left.st_nlink,
        left.st_size,
        left.st_mtime_ns,
        left.st_ctime_ns,
    ) == (
        right.st_dev,
        right.st_ino,
        right.st_mode,
        right.st_nlink,
        right.st_size,
        right.st_mtime_ns,
        right.st_ctime_ns,
    )


def _read_snapshot(
    directory_fd: int,
    name: str,
    relative_name: str,
    listed_metadata: os.stat_result,
    rule: FileRule,
) -> FileSnapshot:
    flags = os.O_RDONLY | getattr(os, "O_CLOEXEC", 0) | getattr(os, "O_NOFOLLOW", 0)
    descriptor = os.open(name, flags, dir_fd=directory_fd)
    try:
        before = os.fstat(descriptor)
        if not _same_stat(listed_metadata, before):
            raise ValueError(f"publish file changed before reading: {relative_name}")
        if not stat.S_ISREG(before.st_mode) or stat.S_ISLNK(before.st_mode):
            raise ValueError(f"publish entry is not one regular file: {relative_name}")
        if before.st_nlink != 1:
            raise ValueError(f"publish entry is hard-linked: {relative_name}")
        if before.st_size <= 0:
            raise ValueError(f"publish file must not be empty: {relative_name}")
        if before.st_size > MAX_PUBLISHED_FILE_BYTES:
            raise ValueError(f"publish file exceeds its bound: {relative_name}")

        digest = hashlib.sha256()
        consumed = 0
        while True:
            chunk = os.read(descriptor, READ_CHUNK_BYTES)
            if not chunk:
                break
            consumed += len(chunk)
            if consumed > MAX_PUBLISHED_FILE_BYTES:
                raise ValueError(f"publish file exceeds its bound: {relative_name}")
            digest.update(chunk)
        after = os.fstat(descriptor)
        if consumed != before.st_size or not _same_stat(before, after):
            raise ValueError(f"publish file changed while reading: {relative_name}")
        listed_after = os.stat(name, dir_fd=directory_fd, follow_symlinks=False)
        if not _same_stat(after, listed_after):
            raise ValueError(f"publish file was replaced while reading: {relative_name}")
        if rule.stage is None:
            raise ValueError("refusing to overwrite an existing producer outcome")
        return FileSnapshot(
            path=relative_name,
            stage=rule.stage,
            category=rule.category,
            size_bytes=consumed,
            sha256="sha256:" + digest.hexdigest(),
            device=after.st_dev,
            inode=after.st_ino,
            modified_ns=after.st_mtime_ns,
            changed_ns=after.st_ctime_ns,
        )
    finally:
        os.close(descriptor)


def _scan_directory(
    directory_fd: int,
    prefix: PurePosixPath,
    rules: dict[str, FileRule],
    snapshots: list[FileSnapshot],
    counters: list[int],
) -> None:
    names = os.listdir(directory_fd)
    for name in sorted(names):
        counters[0] += 1
        if counters[0] > MAX_DIRECTORY_ENTRIES:
            raise ValueError("publish root contains too many entries")
        if not isinstance(name, str) or not _SAFE_COMPONENT_RE.fullmatch(name):
            raise ValueError("publish root contains a non-canonical path component")
        relative = prefix / name
        relative_name = relative.as_posix()
        if len(relative_name.encode("ascii")) > MAX_PATH_BYTES:
            raise ValueError("publish member path exceeds its bound")
        metadata = os.stat(name, dir_fd=directory_fd, follow_symlinks=False)
        if stat.S_ISLNK(metadata.st_mode):
            raise ValueError(f"publish entry is a symbolic link: {relative_name}")
        if stat.S_ISDIR(metadata.st_mode):
            if relative_name not in ALLOWED_DIRECTORIES:
                raise ValueError(f"publish root contains an unknown directory: {relative_name}")
            flags = (
                os.O_RDONLY
                | getattr(os, "O_CLOEXEC", 0)
                | getattr(os, "O_DIRECTORY", 0)
                | getattr(os, "O_NOFOLLOW", 0)
            )
            child_fd = os.open(name, flags, dir_fd=directory_fd)
            try:
                if not _same_stat(metadata, os.fstat(child_fd)):
                    raise ValueError(f"publish directory changed while opening: {relative_name}")
                _scan_directory(child_fd, relative, rules, snapshots, counters)
            finally:
                os.close(child_fd)
            continue
        if not stat.S_ISREG(metadata.st_mode):
            raise ValueError(f"publish entry is not one regular file: {relative_name}")
        rule = rules.get(relative_name)
        if rule is None:
            raise ValueError(f"publish root contains an unknown or forbidden file: {relative_name}")
        snapshot = _read_snapshot(directory_fd, name, relative_name, metadata, rule)
        counters[1] += snapshot.size_bytes
        if counters[1] > MAX_PUBLISHED_BYTES:
            raise ValueError("publish files exceed the aggregate byte bound")
        snapshots.append(snapshot)


def _scan_publish_root_fd(root_fd: int, model: str) -> tuple[tuple[FileSnapshot, ...], int]:
    snapshots: list[FileSnapshot] = []
    counters = [0, 0]
    _scan_directory(root_fd, PurePosixPath(), _file_rules(model), snapshots, counters)
    ordered = tuple(sorted(snapshots, key=lambda item: item.path))
    if len({snapshot.path for snapshot in ordered}) != len(ordered):
        raise ValueError("publish root contains duplicate paths")
    return ordered, counters[1]


def _required_files_for_model(model: str) -> dict[str, frozenset[str]]:
    required = dict(SUCCESS_REQUIRED_FILES)
    required["resolve"] = frozenset(
        (
            f"locks/{model}.requirements.lock",
            f"manifests/{model}.wheelhouse.manifest.json",
            f"manifests/{model}.runtime-inputs.json",
        )
    )
    required["build"] = frozenset(
        (
            f"manifests/{model}.container-observation.json",
            f"diagnostics/{model}.buildx-metadata.json",
            f"diagnostics/{model}.image-inspect.json",
            f"diagnostics/{model}.buildx-version.txt",
            f"diagnostics/{model}.docker-server-version.txt",
        )
    )
    if model == "mace":
        required["wheelhouse"] = required["wheelhouse"] | frozenset(
            (DERIVED_WHEEL_MANIFEST,)
        )
    return required


def _classify_evidence(
    model: str,
    stages: tuple[tuple[str, str], ...],
    status_value: str,
    snapshots: tuple[FileSnapshot, ...],
) -> dict[str, object]:
    by_stage = dict(stages)
    present = {snapshot.path for snapshot in snapshots}
    terminal_index = next(
        (
            index
            for index, (_, stage_outcome) in enumerate(stages)
            if stage_outcome in ("failure", "cancelled")
        ),
        None,
    )

    for stage, required_files in _required_files_for_model(model).items():
        if by_stage[stage] == "success" and not required_files.issubset(present):
            missing = sorted(required_files - present)
            raise ValueError(f"successful {stage} stage is missing allowlisted files: {missing}")

    evidence: dict[str, object] = {
        "predictions": None,
        "structureManifest": None,
        "control": [],
        "partial": [],
        "failure": [],
    }
    for snapshot in snapshots:
        stage_outcome = by_stage[snapshot.stage]
        stage_index = STAGES.index(snapshot.stage)
        if stage_outcome == "skipped" or (
            terminal_index is not None and stage_index > terminal_index
        ):
            raise ValueError(f"file from a skipped stage is present: {snapshot.path}")
        public = snapshot.public_record(stage_outcome)
        if snapshot.category == "failure":
            if stage_outcome not in ("failure", "cancelled"):
                raise ValueError("failure diagnostics require failed or cancelled inference")
            evidence["failure"].append(public)  # type: ignore[union-attr]
        elif stage_outcome in ("failure", "cancelled"):
            evidence["partial"].append(public)  # type: ignore[union-attr]
        elif snapshot.category == "predictions":
            if evidence["predictions"] is not None:
                raise ValueError("multiple prediction evidence files are forbidden")
            evidence["predictions"] = public
        elif snapshot.category == "structure-manifest":
            if evidence["structureManifest"] is not None:
                raise ValueError("multiple structure manifests are forbidden")
            evidence["structureManifest"] = public
        else:
            evidence["control"].append(public)  # type: ignore[union-attr]

    if status_value == "complete":
        if evidence["predictions"] is None or evidence["structureManifest"] is None:
            raise ValueError("complete execution requires predictions and structure manifest")
        if evidence["partial"] or evidence["failure"]:
            raise ValueError("complete execution cannot contain failure or partial evidence")
    if status_value == "not-started" and snapshots:
        raise ValueError("not-started execution cannot contain producer evidence")
    return evidence


def build_manifest(
    *,
    model: str,
    commit_sha: str,
    run_id: str,
    run_attempt: str,
    raw_stages: Sequence[str],
    snapshots: tuple[FileSnapshot, ...],
) -> dict[str, object]:
    model, commit_sha, parsed_run_id, parsed_attempt = _parse_identity(
        model, commit_sha, run_id, run_attempt
    )
    stages, status_value, terminal_stage = parse_stage_outcomes(raw_stages)
    evidence = _classify_evidence(model, stages, status_value, snapshots)
    manifest: dict[str, object] = {
        "schemaVersion": SCHEMA_VERSION,
        "profile": PROFILE,
        "evidenceClass": EVIDENCE_CLASS,
        "statusDomain": STATUS_DOMAIN,
        "model": model,
        "partitionId": PARTITION_IDS[model],
        "commitSha": commit_sha,
        "runId": parsed_run_id,
        "runAttempt": parsed_attempt,
        "status": status_value,
        "terminalStage": terminal_stage,
        "stages": [
            {"stage": stage, "outcome": stage_outcome}
            for stage, stage_outcome in stages
        ],
        "evidence": evidence,
        "outputPath": OUTPUT_RELATIVE_PATH,
        "publicationPolicy": {
            "profile": EVIDENCE_INVENTORY_PROFILE,
            "workingDirectoryIsPublicArtifact": False,
            "scientificArtifactExactPaths": list(SCIENTIFIC_ARTIFACT_EXACT_PATHS),
            "scientificArtifactPublicationEligible": False,
            "administrativeEvidenceArtifactPublicationEligible": False,
            "atomicNumbersPublicationLicenseCleared": False,
            "forbiddenMemberClasses": list(FORBIDDEN_MEMBER_CLASS_NAMES),
            "independentLabelBearingVerificationRequired": True,
        },
        "claims": dict(CLAIMS),
    }
    expected_keys = {
        "schemaVersion",
        "profile",
        "evidenceClass",
        "statusDomain",
        "model",
        "partitionId",
        "commitSha",
        "runId",
        "runAttempt",
        "status",
        "terminalStage",
        "stages",
        "evidence",
        "outputPath",
        "publicationPolicy",
        "claims",
    }
    if set(manifest) != expected_keys or any(CLAIMS.values()):
        raise AssertionError("producer outcome claim surface drifted")
    return manifest


def _canonical_json_bytes(value: object) -> bytes:
    return (
        json.dumps(value, ensure_ascii=True, sort_keys=True, separators=(",", ":")) + "\n"
    ).encode("ascii")


def _open_root(root: Path) -> int:
    flags = (
        os.O_RDONLY
        | getattr(os, "O_CLOEXEC", 0)
        | getattr(os, "O_DIRECTORY", 0)
        | getattr(os, "O_NOFOLLOW", 0)
    )
    descriptor = os.open(root, flags)
    opened = os.fstat(descriptor)
    listed = root.lstat()
    if not _same_stat(opened, listed):
        os.close(descriptor)
        raise ValueError("publish root changed while opening")
    return descriptor


def _open_manifest_directory(root_fd: int) -> int:
    try:
        os.mkdir("manifests", mode=0o700, dir_fd=root_fd)
    except FileExistsError:
        pass
    listed = os.stat("manifests", dir_fd=root_fd, follow_symlinks=False)
    if not stat.S_ISDIR(listed.st_mode) or stat.S_ISLNK(listed.st_mode):
        raise ValueError("manifest output directory must be a real directory")
    flags = (
        os.O_RDONLY
        | getattr(os, "O_CLOEXEC", 0)
        | getattr(os, "O_DIRECTORY", 0)
        | getattr(os, "O_NOFOLLOW", 0)
    )
    descriptor = os.open("manifests", flags, dir_fd=root_fd)
    if not _same_stat(listed, os.fstat(descriptor)):
        os.close(descriptor)
        raise ValueError("manifest output directory changed while opening")
    return descriptor


def _atomic_write_new(directory_fd: int, payload: bytes) -> None:
    if len(payload) > MAX_MANIFEST_BYTES:
        raise ValueError("producer outcome exceeds its byte bound")
    output_name = "producer-outcome.json"
    temporary_name: str | None = None
    descriptor: int | None = None
    flags = (
        os.O_WRONLY
        | os.O_CREAT
        | os.O_EXCL
        | getattr(os, "O_CLOEXEC", 0)
        | getattr(os, "O_NOFOLLOW", 0)
    )
    for _ in range(16):
        candidate = f".{output_name}.{secrets.token_hex(16)}.partial"
        try:
            descriptor = os.open(candidate, flags, 0o600, dir_fd=directory_fd)
        except FileExistsError:
            continue
        temporary_name = candidate
        break
    if descriptor is None or temporary_name is None:
        raise OSError("could not reserve an exclusive temporary outcome file")
    try:
        offset = 0
        while offset < len(payload):
            written = os.write(descriptor, payload[offset:])
            if written <= 0:
                raise OSError("short write while creating producer outcome")
            offset += written
        os.fchmod(descriptor, 0o444)
        os.fsync(descriptor)
        before_link = os.fstat(descriptor)
        if before_link.st_size != len(payload) or before_link.st_nlink != 1:
            raise OSError("temporary producer outcome is incomplete")
        os.link(
            temporary_name,
            output_name,
            src_dir_fd=directory_fd,
            dst_dir_fd=directory_fd,
            follow_symlinks=False,
        )
    finally:
        os.close(descriptor)
        try:
            os.unlink(temporary_name, dir_fd=directory_fd)
        except FileNotFoundError:
            pass
    os.fsync(directory_fd)

    verify_flags = os.O_RDONLY | getattr(os, "O_CLOEXEC", 0) | getattr(os, "O_NOFOLLOW", 0)
    verify_fd = os.open(output_name, verify_flags, dir_fd=directory_fd)
    try:
        metadata = os.fstat(verify_fd)
        content = bytearray()
        while True:
            chunk = os.read(verify_fd, READ_CHUNK_BYTES)
            if not chunk:
                break
            content.extend(chunk)
            if len(content) > MAX_MANIFEST_BYTES:
                raise OSError("written producer outcome exceeds its bound")
        if (
            not stat.S_ISREG(metadata.st_mode)
            or stat.S_ISLNK(metadata.st_mode)
            or metadata.st_nlink != 1
            or metadata.st_size != len(payload)
            or bytes(content) != payload
        ):
            raise OSError("atomic producer outcome is not one complete regular file")
    finally:
        os.close(verify_fd)


def write_outcome(
    *,
    model: str,
    commit_sha: str,
    run_id: str,
    run_attempt: str,
    publish_root: str,
    raw_stages: Sequence[str],
) -> tuple[Path, dict[str, object]]:
    model, _, _, _ = _parse_identity(model, commit_sha, run_id, run_attempt)
    root = _canonical_publish_root(publish_root)
    root_fd = _open_root(root)
    try:
        snapshots, input_bytes = _scan_publish_root_fd(root_fd, model)
        manifest = build_manifest(
            model=model,
            commit_sha=commit_sha,
            run_id=run_id,
            run_attempt=run_attempt,
            raw_stages=raw_stages,
            snapshots=snapshots,
        )
        payload = _canonical_json_bytes(manifest)
        if input_bytes + len(payload) > MAX_PUBLISHED_BYTES:
            raise ValueError("publish files plus producer outcome exceed the aggregate byte bound")

        # Re-scan through the already-open root descriptor immediately before
        # publication.  This catches replacements, mutations, and new members
        # between inventory construction and the exclusive output link.
        rescanned, rescanned_bytes = _scan_publish_root_fd(root_fd, model)
        if (
            tuple(item.private_identity() for item in rescanned)
            != tuple(item.private_identity() for item in snapshots)
            or rescanned_bytes != input_bytes
        ):
            raise ValueError("publish evidence changed before outcome publication")

        manifest_fd = _open_manifest_directory(root_fd)
        try:
            _atomic_write_new(manifest_fd, payload)
        finally:
            os.close(manifest_fd)
    finally:
        os.close(root_fd)
    return root / OUTPUT_RELATIVE_PATH, manifest


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
        print(f"full-candidate producer outcome failed: {error}", file=sys.stderr)
        return 1
    print(
        json.dumps(
            {
                "evidenceClass": EVIDENCE_CLASS,
                "output": str(output_path),
                "status": manifest["status"],
            },
            ensure_ascii=True,
            sort_keys=True,
            separators=(",", ":"),
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
