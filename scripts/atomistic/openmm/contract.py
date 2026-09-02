"""Frozen OpenMM 8.6 TIP3P producer contract and hostile-input helpers.

This module intentionally uses only the Python standard library.  It can be
tested on a host that does not have OpenMM installed and does not make an
execution, reproduction, acceptance, or release claim.
"""

from __future__ import annotations

import hashlib
import json
import math
import os
import platform
import re
import stat
import sys
import tempfile
from pathlib import Path, PurePosixPath
from typing import Iterable, Mapping, Sequence


SCHEMA_VERSION = "tf.openmm-tip3p-producer/0.4.5"
OUTCOME_SCHEMA_VERSION = "tf.openmm-tip3p-producer-outcome/0.4.5"
ARTIFACT_MANIFEST_SCHEMA_VERSION = "tf.openmm-tip3p-artifact-manifest/0.4.5"
RUNTIME_INVENTORY_SCHEMA_VERSION = "tf.openmm-runtime-inventory/0.4.5"
PREPARE_RECEIPT_SCHEMA_VERSION = "tf.openmm-tip3p-prepare-receipt/0.4.5"
REFERENCE_RUN_SCHEMA_VERSION = "tf.openmm-tip3p-reference-run/0.4.5"
CPU_RUN_SCHEMA_VERSION = "tf.openmm-tip3p-cpu-fixed-coordinate-run/0.4.5"

SYSTEM_ID = "openmm-8.6-tip3p-895-water-pme-control"
ARTIFACT_ID = "tf.openmm-pure-water-cold-start-pme-control/1"
OPENMM_VERSION = "8.6.0"
OPENMM_SOURCE_COMMIT = "c6173db6e8edd705eb59172bd21e9ce69c572405"
OPENMM_FULL_VERSION = "8.6.0.dev-c6173db"
OPENMM_RELEASE_FLAG = False
PLAN_DIGEST = "sha256:ad07bc923c991746bcc5c9e048dff9b4065981b50c940b13c3f1654e4ffd1177"
SYSTEM_DIGEST = "sha256:e80bb9d1bd4bd8b774008b052b717cb758f16995e5164b36cda7102e2dbf6419"
REFERENCE_BACKEND_MANIFEST_DIGEST = (
    "sha256:7f7104ea225819798c9c06eed382298c4d90ec19484f632fc6910832369882b9"
)
CPU_BACKEND_MANIFEST_DIGEST = (
    "sha256:8bea1d8a2f48897d34594fb416f791aa8d94c02807857182681c32c9d6e0424b"
)

PARTICLE_COUNT = 2_685
COMPONENT_COUNT = PARTICLE_COUNT * 3
WATER_COUNT = 895
CONSTRAINT_COUNT = 2_685
FRAME_COUNT = 101
ACCEPTED_STEPS = 1_000
SAMPLE_STRIDE_STEPS = 10
COMPARISON_STEPS = (0, 10, 100, 500, 1_000)
COMPARISON_FRAME_INDICES = tuple(step // SAMPLE_STRIDE_STEPS for step in COMPARISON_STEPS)
FORCE_GROUPS = (0, 1, 2, 3)
FORCE_SLOTS = ("total", "group-0", "group-1", "group-2", "group-3")
CELL_NANOMETER = ((3.0, 0.0, 0.0), (0.0, 3.0, 0.0), (0.0, 0.0, 3.0))
TIME_STEP_PICOSECONDS = 0.001
CONSTRAINT_TOLERANCE = 1e-8
MINIMIZATION_TOLERANCE_KJ_MOL_NM = 1.0
MINIMIZATION_MAX_ITERATIONS = 5_000
TEMPERATURE_KELVIN = 300.0
VELOCITY_SEED = 20_260_901
PME_ALPHA_INVERSE_NANOMETER = 2.918423065872431
PME_GRID = (90, 90, 90)
NONBONDED_CUTOFF_NANOMETER = 1.0

INPUT_FILES = {
    "license": {
        "filename": "Licenses.txt",
        "sizeBytes": 9_305,
        "sha256": "sha256:437b7168cc997abea3b5f2a9e0fb6894f96de77b9c69be428ccfcfe9bed58293",
    },
    "parameters": {
        "filename": "tip3p.xml",
        "sizeBytes": 19_070,
        "sha256": "sha256:3f4b188dbcb6c02863230eaca231e927fb6bf3307ce947d8a50d0f46f6dd83d9",
    },
    "coordinates": {
        "filename": "tip3p.pdb",
        "sizeBytes": 179_998,
        "sha256": "sha256:14fd37900d627c0e258d6086a14c6084e4bec1422e9d20fccfc83c3f814fd7ee",
    },
}

WHEEL_FILES = {
    "openmm": {
        "filename": "openmm-8.6.0-cp312-cp312-manylinux_2_34_x86_64.whl",
        "sizeBytes": 14_428_011,
        "sha256": "sha256:e7acafe671fe40c502623886b15a97bcc948a83a4a995da0336b7ee3ab4b0221",
    },
    "numpy": {
        "filename": "numpy-2.2.6-cp312-cp312-manylinux_2_17_x86_64.manylinux2014_x86_64.whl",
        "sizeBytes": 16_527_618,
        "sha256": "sha256:fd83c01228a688733f1ded5201c678f0c53ecc1006ffbc404db9f7a899ac6249",
    },
}

REQUIRED_ENVIRONMENT = {
    "PYTHONHASHSEED": "0",
    "TZ": "UTC",
    "LC_ALL": "C.UTF-8",
    "OMP_NUM_THREADS": "1",
    "OPENBLAS_NUM_THREADS": "1",
    "MKL_NUM_THREADS": "1",
    "NUMEXPR_NUM_THREADS": "1",
}

STAGES = (
    "guard",
    "inputs",
    "runtime",
    "prepare",
    "reference-a",
    "reference-b",
    "cpu-fixed-coordinate",
    "manifest",
)
STAGE_OUTCOMES = frozenset(("success", "failure", "cancelled", "skipped"))
STATUS_DOMAIN = "producer-execution-integrity-only-not-scientific-assessment"
CLAIMS = {
    "scientificPass": False,
    "accepted": False,
    "reproduced": False,
    "promotionEligible": False,
    "protectedMainArtifact": False,
}

MAX_FILE_BYTES = 512 * 1024 * 1024
MAX_JSON_BYTES = 8 * 1024 * 1024
MAX_PATH_BYTES = 4_096
READ_CHUNK_BYTES = 1024 * 1024
DIGEST_RE = re.compile(r"^sha256:[0-9a-f]{64}$")


class ContractViolation(ValueError):
    """An input or runtime does not satisfy the locked producer contract."""


class IncompleteExecution(ContractViolation):
    """A bounded execution stopped without producing a complete stage."""


def canonical_json_bytes(value: object) -> bytes:
    return (
        json.dumps(value, ensure_ascii=True, allow_nan=False, sort_keys=True, separators=(",", ":"))
        + "\n"
    ).encode("ascii")


def digest_bytes(data: bytes) -> str:
    return "sha256:" + hashlib.sha256(data).hexdigest()


def digest_value(value: object) -> str:
    return digest_bytes(canonical_json_bytes(value))


def _file_identity(metadata: os.stat_result) -> tuple[int, int, int, int, int]:
    return (
        metadata.st_dev,
        metadata.st_ino,
        metadata.st_size,
        metadata.st_mtime_ns,
        metadata.st_ctime_ns,
    )


def read_regular_file(path: Path, *, maximum_bytes: int = MAX_FILE_BYTES) -> bytes:
    """Read a bounded, single-link regular file without following a final symlink."""

    supplied = Path(path)
    if len(os.fsencode(str(supplied))) > MAX_PATH_BYTES:
        raise ContractViolation("path exceeds the bounded byte length")
    metadata = supplied.lstat()
    if (
        not stat.S_ISREG(metadata.st_mode)
        or supplied.is_symlink()
        or metadata.st_nlink != 1
        or metadata.st_size < 1
        or metadata.st_size > maximum_bytes
    ):
        raise ContractViolation(f"{supplied.name}: expected one bounded, single-link regular file")
    descriptor = os.open(supplied, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
    with os.fdopen(descriptor, "rb") as handle:
        opened = os.fstat(handle.fileno())
        if _file_identity(opened) != _file_identity(metadata):
            raise ContractViolation(f"{supplied.name}: file identity changed while opening")
        chunks: list[bytes] = []
        consumed = 0
        while True:
            chunk = handle.read(READ_CHUNK_BYTES)
            if not chunk:
                break
            consumed += len(chunk)
            if consumed > maximum_bytes:
                raise ContractViolation(f"{supplied.name}: file exceeds its bound")
            chunks.append(chunk)
        closed = os.fstat(handle.fileno())
        if _file_identity(closed) != _file_identity(opened):
            raise ContractViolation(f"{supplied.name}: file changed while reading")
    return b"".join(chunks)


def validate_input_root(input_root: Path) -> dict[str, dict[str, object]]:
    root = canonical_directory(input_root, "input root")
    expected_names = sorted(record["filename"] for record in INPUT_FILES.values())
    actual_names = sorted(path.name for path in root.iterdir())
    if actual_names != expected_names:
        raise ContractViolation("input root must contain exactly the locked PDB, XML, and license files")
    validated: dict[str, dict[str, object]] = {}
    for role, expected in INPUT_FILES.items():
        path = root / str(expected["filename"])
        data = read_regular_file(path)
        actual = {"sizeBytes": len(data), "sha256": digest_bytes(data)}
        if actual != {"sizeBytes": expected["sizeBytes"], "sha256": expected["sha256"]}:
            raise ContractViolation(f"{path.name}: byte identity differs from the locked source pin")
        validated[role] = {"path": path.name, **actual}
    return validated


def canonical_directory(path: Path, label: str, *, create: bool = False) -> Path:
    supplied = Path(path)
    if not supplied.is_absolute() or supplied != Path(os.path.abspath(supplied)):
        raise ContractViolation(f"{label} must be a normalized absolute path")
    if supplied.resolve(strict=False) != supplied:
        raise ContractViolation(f"{label} must not traverse a symbolic-link ancestor")
    if create:
        supplied.mkdir(parents=True, exist_ok=True)
    metadata = supplied.lstat()
    if (
        not stat.S_ISDIR(metadata.st_mode)
        or supplied.is_symlink()
        or supplied.resolve(strict=True) != supplied
    ):
        raise ContractViolation(f"{label} must be one real directory")
    return supplied


def validate_relative_artifact_path(raw: str) -> str:
    if not isinstance(raw, str) or not raw or "\x00" in raw or "\\" in raw:
        raise ContractViolation("artifact path is not one safe POSIX relative path")
    path = PurePosixPath(raw)
    if path.is_absolute() or str(path) != raw or any(part in ("", ".", "..") for part in path.parts):
        raise ContractViolation("artifact path is not canonical")
    if len(raw.encode("utf-8")) > MAX_PATH_BYTES:
        raise ContractViolation("artifact path exceeds its bound")
    return raw


def atomic_write_bytes(path: Path, data: bytes, *, read_only: bool = True) -> None:
    """Create or replace one file atomically, with fsync of file and parent."""

    parent = canonical_directory(path.parent, "artifact parent", create=True)
    if path.parent != parent:
        raise ContractViolation("artifact parent changed during canonicalization")
    descriptor, temporary_name = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=parent)
    temporary = Path(temporary_name)
    try:
        os.fchmod(descriptor, 0o600)
        with os.fdopen(descriptor, "wb", closefd=True) as handle:
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
        if read_only:
            os.chmod(temporary, 0o444)
        os.replace(temporary, path)
        directory_descriptor = os.open(parent, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0))
        try:
            os.fsync(directory_descriptor)
        finally:
            os.close(directory_descriptor)
    finally:
        if temporary.exists():
            temporary.unlink()


def atomic_write_json(path: Path, value: object, *, read_only: bool = True) -> bytes:
    data = canonical_json_bytes(value)
    atomic_write_bytes(path, data, read_only=read_only)
    return data


def validate_stage_vector(
    raw: Sequence[tuple[str, str]],
) -> tuple[str, str | None, tuple[dict[str, str], ...]]:
    """Derive an atomic producer status from an ordered executor stage vector.

    ``complete-pass`` means only that every producer stage completed and all
    expected evidence was inventoriable.  It is not a scientific acceptance.
    ``complete-fail`` records one explicit failed stage.  Cancellation and a
    wholly skipped run remain ``incomplete``.
    """

    if len(raw) != len(STAGES):
        raise ContractViolation(f"exactly {len(STAGES)} stage outcomes are required")
    normalized: list[dict[str, str]] = []
    for index, item in enumerate(raw):
        if not isinstance(item, tuple) or len(item) != 2:
            raise ContractViolation("stage outcomes must be (stage, outcome) pairs")
        stage, outcome = item
        if stage != STAGES[index] or outcome not in STAGE_OUTCOMES:
            raise ContractViolation("stage vector is reordered or contains an unknown outcome")
        normalized.append({"stage": stage, "outcome": outcome})
    outcomes = tuple(item["outcome"] for item in normalized)
    if all(outcome == "success" for outcome in outcomes):
        return "complete-pass", None, tuple(normalized)
    if all(outcome == "skipped" for outcome in outcomes):
        return "incomplete", None, tuple(normalized)
    terminal_index = next(index for index, outcome in enumerate(outcomes) if outcome != "success")
    terminal_stage = STAGES[terminal_index]
    terminal_outcome = outcomes[terminal_index]
    if terminal_outcome not in ("failure", "cancelled"):
        raise ContractViolation("first non-success stage must be an explicit failure or cancellation")
    if any(outcome != "skipped" for outcome in outcomes[terminal_index + 1 :]):
        raise ContractViolation("every stage after the terminal outcome must be skipped")
    status = "complete-fail" if terminal_outcome == "failure" else "incomplete"
    return status, terminal_stage, tuple(normalized)


def assert_finite(values: Iterable[float], label: str) -> None:
    for index, value in enumerate(values):
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
            raise ContractViolation(f"{label}[{index}] is not finite")


def platform_guard() -> dict[str, object]:
    failures: list[str] = []
    if platform.system() != "Linux":
        failures.append("Linux is required")
    if platform.machine() not in ("x86_64", "AMD64"):
        failures.append("x86_64 is required")
    if platform.python_version() != "3.12.11":
        failures.append("Python 3.12.11 is required")
    if hasattr(os, "geteuid") and os.geteuid() == 0:
        failures.append("the producer must run as an unprivileged user")
    if not bool(getattr(sys.flags, "safe_path", False)):
        failures.append("Python safe-path mode (-P) is required")
    if not bool(sys.flags.no_user_site):
        failures.append("Python no-user-site mode (-s) is required")
    if not bool(sys.flags.dont_write_bytecode):
        failures.append("Python no-bytecode mode (-B) is required")
    if bool(sys.flags.ignore_environment):
        failures.append("Python must not ignore the locked PYTHONHASHSEED")
    mismatched = {
        key: os.environ.get(key)
        for key, expected in REQUIRED_ENVIRONMENT.items()
        if os.environ.get(key) != expected
    }
    if mismatched:
        failures.append(f"environment drift: {mismatched}")
    if failures:
        raise ContractViolation("; ".join(failures))
    return {
        "system": platform.system(),
        "machine": platform.machine(),
        "pythonVersion": platform.python_version(),
        "pythonImplementation": platform.python_implementation(),
        "pythonFlags": {
            "safePath": bool(getattr(sys.flags, "safe_path", False)),
            "noUserSite": bool(sys.flags.no_user_site),
            "dontWriteBytecode": bool(sys.flags.dont_write_bytecode),
            "ignoreEnvironment": bool(sys.flags.ignore_environment),
        },
        "effectiveUid": os.geteuid() if hasattr(os, "geteuid") else None,
        "environment": dict(REQUIRED_ENVIRONMENT),
    }


def array_descriptor(
    *,
    artifact_id: str,
    path: str,
    dtype: str,
    shape: Sequence[int],
    unit: str,
    data: bytes,
) -> dict[str, object]:
    validate_relative_artifact_path(path)
    if dtype not in ("float64-le", "uint32-le"):
        raise ContractViolation("unsupported binary dtype")
    if (
        not isinstance(shape, Sequence)
        or isinstance(shape, (str, bytes))
        or not shape
        or any(isinstance(value, bool) or not isinstance(value, int) or value < 1 for value in shape)
    ):
        raise ContractViolation("array shape must contain positive integers")
    component_bytes = 8 if dtype == "float64-le" else 4
    expected_bytes = component_bytes * math.prod(shape)
    if len(data) != expected_bytes:
        raise ContractViolation("array bytes do not match dtype and shape")
    if unit not in (
        "nanometer",
        "picosecond",
        "nanometer-per-picosecond",
        "kilojoule-per-mole-per-nanometer",
        "kilojoule-per-mole",
        "dalton",
        "index",
        "step",
    ):
        raise ContractViolation("unsupported array unit")
    if not isinstance(artifact_id, str) or not re.fullmatch(r"[a-z][a-z0-9-]{0,95}", artifact_id):
        raise ContractViolation("array artifact id is not one stable lowercase token")
    return {
        "id": artifact_id,
        "path": path,
        "kind": "array",
        "dtype": dtype,
        "shape": list(shape),
        "unit": unit,
        "sizeBytes": len(data),
        "sha256": digest_bytes(data),
    }


def validate_descriptor(record: Mapping[str, object]) -> None:
    expected_keys = {"id", "path", "kind", "dtype", "shape", "unit", "sizeBytes", "sha256"}
    if set(record) != expected_keys:
        raise ContractViolation("array descriptor key set changed")
    artifact_id = record["id"]
    if not isinstance(artifact_id, str) or not re.fullmatch(r"[a-z][a-z0-9-]{0,95}", artifact_id):
        raise ContractViolation("array descriptor id is invalid")
    path = validate_relative_artifact_path(
        record["path"] if isinstance(record["path"], str) else ""
    )
    if record["kind"] != "array" or record["dtype"] not in ("float64-le", "uint32-le"):
        raise ContractViolation("array descriptor kind or dtype is invalid")
    dtype = str(record["dtype"])
    if not path.endswith(".f64le" if dtype == "float64-le" else ".u32le"):
        raise ContractViolation("array descriptor path suffix differs from its dtype")
    shape = record["shape"]
    if (
        not isinstance(shape, list)
        or not 1 <= len(shape) <= 4
        or any(
            isinstance(value, bool) or not isinstance(value, int) or not 1 <= value <= 1_000_000_000
            for value in shape
        )
    ):
        raise ContractViolation("array descriptor shape is invalid")
    allowed_units = {
        "nanometer",
        "picosecond",
        "nanometer-per-picosecond",
        "kilojoule-per-mole-per-nanometer",
        "kilojoule-per-mole",
        "dalton",
        "index",
        "step",
    }
    if not isinstance(record["unit"], str) or record["unit"] not in allowed_units:
        raise ContractViolation("array descriptor unit is invalid")
    size_bytes = record["sizeBytes"]
    component_bytes = 8 if dtype == "float64-le" else 4
    if (
        isinstance(size_bytes, bool)
        or not isinstance(size_bytes, int)
        or not 1 <= size_bytes <= 1024 * 1024 * 1024
        or size_bytes != component_bytes * math.prod(shape)
    ):
        raise ContractViolation("array descriptor size differs from dtype and shape")
    digest = record["sha256"]
    if not isinstance(digest, str) or not DIGEST_RE.fullmatch(digest):
        raise ContractViolation("array descriptor digest is invalid")
