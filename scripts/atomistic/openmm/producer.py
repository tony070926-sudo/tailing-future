#!/usr/bin/env python3
"""Orchestrate fresh OpenMM processes and write one atomic producer outcome.

The final ``complete-pass`` status concerns producer execution integrity only.
Scientific acceptance belongs exclusively to the independent verifier.
"""

from __future__ import annotations

import argparse
import json
import os
import signal
import subprocess
import sys
from pathlib import Path
from typing import Sequence

from contract import (
    ARTIFACT_ID,
    CLAIMS,
    INPUT_FILES,
    PLAN_DIGEST,
    STAGES,
    SYSTEM_DIGEST,
    ContractViolation,
    atomic_write_json,
    canonical_json_bytes,
    canonical_directory,
    digest_value,
    platform_guard,
    read_regular_file,
    validate_input_root,
)
from diagnostics import write_diagnostics
from outcome import ARTIFACT_STAGE, build_outcome, write_built_outcome, write_outcome


WORKER = Path(__file__).resolve().with_name("worker.py")

STAGE_TIMEOUT_SECONDS = {
    "runtime": 300,
    "prepare": 1_810,
    "reference-a": 7_200,
    "reference-b": 7_200,
    "cpu-fixed-coordinate": 3_600,
    "manifest": 300,
}


class StageFailure(RuntimeError):
    def __init__(self, stage: str, message: str, *, incomplete: bool = False) -> None:
        super().__init__(message)
        self.stage = stage
        self.incomplete = incomplete


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input-root", type=Path, required=True)
    parser.add_argument("--output-root", type=Path, required=True)
    parser.add_argument("--source-revision", required=True)
    return parser


def _interrupt_on_signal(_signal_number: int, _frame: object) -> None:
    raise KeyboardInterrupt


def _guard_empty_output_root(path: Path) -> Path:
    root = canonical_directory(path, "output root", create=True)
    entries = list(root.iterdir())
    if entries:
        raise ContractViolation("output root must be empty; refusing to mix or overwrite evidence")
    (root / "arrays").mkdir(mode=0o755)
    (root / "manifests").mkdir(mode=0o755)
    return root


def _input_receipt(input_root: Path, output_root: Path) -> dict[str, object]:
    sources = validate_input_root(input_root)
    records = []
    for role, actual in sorted(sources.items()):
        expected = INPUT_FILES[role]
        records.append(
            {
                "role": role,
                "path": actual["path"],
                "sizeBytes": actual["sizeBytes"],
                "sha256": actual["sha256"],
                "sourceCommit": "c6173db6e8edd705eb59172bd21e9ce69c572405",
                "explicitRuntimeInput": True,
                "redistributionCleared": False,
            }
        )
    receipt: dict[str, object] = {
        "schemaVersion": "tf.openmm-tip3p-input-receipt/0.4.5",
        "artifactId": ARTIFACT_ID,
        "planDigest": PLAN_DIGEST,
        "systemDigest": SYSTEM_DIGEST,
        "networkAccessUsed": False,
        "sources": records,
        "claims": dict(CLAIMS),
    }
    receipt["receiptDigest"] = digest_value(receipt)
    atomic_write_json(output_root / "manifests/input-receipt.json", receipt)
    return receipt


def _stage_environment(stage: str) -> dict[str, str]:
    environment = dict(os.environ)
    for key in ("PYTHONPATH", "PYTHONHOME", "PYTHONSTARTUP", "PYTHONUSERBASE"):
        environment.pop(key, None)
    environment.update(
        {
            "PYTHONHASHSEED": "0",
            "TZ": "UTC",
            "LC_ALL": "C.UTF-8",
            "OMP_NUM_THREADS": "1",
            "OPENBLAS_NUM_THREADS": "1",
            "MKL_NUM_THREADS": "1",
            "NUMEXPR_NUM_THREADS": "1",
            "PYTHONDONTWRITEBYTECODE": "1",
            "PYTHONNOUSERSITE": "1",
        }
    )
    if stage == "cpu-fixed-coordinate":
        environment["OPENMM_CPU_THREADS"] = "1"
    else:
        environment.pop("OPENMM_CPU_THREADS", None)
    return environment


def _run_worker(
    stage: str,
    arguments: Sequence[str],
    *,
    output_root: Path,
) -> None:
    # ``-I`` would silently ignore the locked PYTHONHASHSEED even though the
    # variable remains visible in os.environ.  Python 3.12 safe-path mode plus
    # the sanitized environment preserves the seed without admitting cwd,
    # PYTHONPATH, or the user site into a fresh worker.
    command = [sys.executable, "-P", "-s", "-B", str(WORKER), *arguments]
    try:
        completed = subprocess.run(
            command,
            check=False,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            errors="strict",
            env=_stage_environment(stage),
            cwd=output_root,
            timeout=STAGE_TIMEOUT_SECONDS[stage],
        )
    except subprocess.TimeoutExpired as error:
        _cleanup_atomic_temporaries(output_root)
        raise StageFailure(
            stage,
            f"stage exceeded its {STAGE_TIMEOUT_SECONDS[stage]} second process bound",
            incomplete=True,
        ) from error
    if completed.returncode != 0:
        _cleanup_atomic_temporaries(output_root)
        detail = completed.stderr[-16_384:].strip() or completed.stdout[-16_384:].strip()
        raise StageFailure(
            stage,
            f"worker exited {completed.returncode}: {detail}",
            incomplete=completed.returncode == 75,
        )


def _cleanup_atomic_temporaries(output_root: Path) -> None:
    for directory in (output_root / "arrays", output_root / "manifests"):
        if not directory.is_dir() or directory.is_symlink():
            continue
        for candidate in directory.iterdir():
            if candidate.name.startswith(".") and candidate.name.endswith(".tmp"):
                candidate.unlink(missing_ok=True)


def _assert_stage_evidence(output_root: Path, stage: str) -> None:
    required = sorted(path for path, owner in ARTIFACT_STAGE.items() if owner == stage)
    for relative_path in required:
        read_regular_file(output_root / relative_path)


def _stage_vector(
    statuses: dict[str, str], terminal_stage: str | None = None, *, incomplete: bool = False
) -> tuple[tuple[str, str], ...]:
    if terminal_stage is not None:
        terminal_index = STAGES.index(terminal_stage)
        statuses[terminal_stage] = "cancelled" if incomplete else "failure"
        for stage in STAGES[terminal_index + 1 :]:
            statuses[stage] = "skipped"
    return tuple((stage, statuses[stage]) for stage in STAGES)


def produce(
    input_root: Path, output_root: Path, source_revision: str
) -> tuple[dict[str, object], int]:
    statuses = {stage: "skipped" for stage in STAGES}
    terminal: StageFailure | None = None
    try:
        root = _guard_empty_output_root(output_root)
        platform_guard()
        statuses["guard"] = "success"
        _input_receipt(input_root, root)
        _assert_stage_evidence(root, "inputs")
        statuses["inputs"] = "success"
        common = ("--input-root", str(input_root), "--output-root", str(root))
        _run_worker("runtime", ("runtime", *common), output_root=root)
        _assert_stage_evidence(root, "runtime")
        statuses["runtime"] = "success"
        _run_worker("prepare", ("prepare", *common), output_root=root)
        _assert_stage_evidence(root, "prepare")
        statuses["prepare"] = "success"
        _run_worker(
            "reference-a", ("reference", "--replica", "a", *common), output_root=root
        )
        _assert_stage_evidence(root, "reference-a")
        statuses["reference-a"] = "success"
        _run_worker(
            "reference-b", ("reference", "--replica", "b", *common), output_root=root
        )
        _assert_stage_evidence(root, "reference-b")
        statuses["reference-b"] = "success"
        _run_worker("cpu-fixed-coordinate", ("cpu", *common), output_root=root)
        write_diagnostics(root)
        _assert_stage_evidence(root, "cpu-fixed-coordinate")
        statuses["cpu-fixed-coordinate"] = "success"
    except StageFailure as error:
        terminal = error
        root = canonical_directory(output_root, "output root")
    except KeyboardInterrupt:
        failed_stage = next(stage for stage in STAGES if statuses[stage] == "skipped")
        terminal = StageFailure(failed_stage, "producer interrupted", incomplete=True)
        root = canonical_directory(output_root, "output root")
        _cleanup_atomic_temporaries(root)
    except Exception as error:
        failed_stage = next(stage for stage in STAGES if statuses[stage] == "skipped")
        terminal = StageFailure(failed_stage, str(error), incomplete=False)
        root = canonical_directory(output_root, "output root")

    if terminal is not None:
        stages = _stage_vector(
            statuses,
            terminal.stage,
            incomplete=terminal.incomplete,
        )
        _outcome_path, outcome = write_outcome(root, stages)
        print(f"{terminal.stage}: {terminal}", file=sys.stderr)
        return outcome, 75 if terminal.incomplete else 1

    # Build the exact final success outcome before the artifact manifest so the
    # manifest can bind its byte digest without a circular manifest digest in
    # the outcome itself.  Nothing is published as complete-pass yet.
    prospective_statuses = dict(statuses)
    prospective_statuses["manifest"] = "success"
    success_stages = _stage_vector(prospective_statuses)
    try:
        success_outcome = build_outcome(root, success_stages)
        success_outcome_bytes = canonical_json_bytes(success_outcome)
        producer_outcome_digest = digest_value(success_outcome)
        _run_worker(
            "manifest",
            (
                "manifest",
                "--output-root",
                str(root),
                "--source-revision",
                source_revision,
                "--producer-outcome-digest",
                producer_outcome_digest,
            ),
            output_root=root,
        )
        artifact_manifest = json.loads(
            read_regular_file(
                root / "manifests/artifact-manifest.json", maximum_bytes=8 * 1024 * 1024
            )
        )
        if not isinstance(artifact_manifest, dict):
            raise ContractViolation("artifact manifest is not a JSON object")
        if artifact_manifest.get("producerOutcomeDigest") != producer_outcome_digest:
            raise ContractViolation("artifact manifest does not bind the final producer outcome")
        rebuilt = build_outcome(root, success_stages)
        if canonical_json_bytes(rebuilt) != success_outcome_bytes:
            raise ContractViolation("producer outcome preimage changed during manifest finalization")
        _outcome_path, outcome = write_built_outcome(root, success_outcome)
        return outcome, 0
    except StageFailure as error:
        terminal = error
    except KeyboardInterrupt:
        terminal = StageFailure("manifest", "producer interrupted", incomplete=True)
        _cleanup_atomic_temporaries(root)
    except Exception as error:
        terminal = StageFailure("manifest", str(error), incomplete=False)

    failed_stages = _stage_vector(
        statuses,
        "manifest",
        incomplete=terminal.incomplete,
    )
    _outcome_path, outcome = write_outcome(root, failed_stages)
    print(f"manifest: {terminal}", file=sys.stderr)
    return outcome, 75 if terminal.incomplete else 1


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(sys.argv[1:] if argv is None else list(argv))
    previous_sigterm = None
    if hasattr(signal, "SIGTERM"):
        previous_sigterm = signal.signal(
            signal.SIGTERM,
            _interrupt_on_signal,
        )
    try:
        outcome, return_code = produce(args.input_root, args.output_root, args.source_revision)
    finally:
        if previous_sigterm is not None:
            signal.signal(signal.SIGTERM, previous_sigterm)
    print(
        json.dumps(
            {"status": outcome["status"], "statusDomain": outcome["statusDomain"]},
            sort_keys=True,
            separators=(",", ":"),
        )
    )
    return return_code


if __name__ == "__main__":
    raise SystemExit(main())
