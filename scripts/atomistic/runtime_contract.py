"""Fail-closed runtime primitives for the Tailing Future atomistic runner.

This module intentionally imports only the Python standard library.  The caller
must verify the package wheel, checkpoint, and benchmark bytes before importing
ASE, NumPy, PyTorch, MatterSim, or MACE.
"""

from __future__ import annotations

import errno
import hashlib
import importlib.metadata
import json
import math
import os
import platform
import re
import socket
import stat
import struct
import sys
import tempfile
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Iterable, Mapping


SHA256_RE = re.compile(r"^(?:sha256:)?([0-9a-f]{64})$")
CONTAINER_DIGEST_RE = re.compile(r"^sha256:[0-9a-f]{64}$")
THREAD_ENVIRONMENT = {
    "OMP_NUM_THREADS": "1",
    "MKL_NUM_THREADS": "1",
    "OPENBLAS_NUM_THREADS": "1",
    "NUMEXPR_NUM_THREADS": "1",
    "VECLIB_MAXIMUM_THREADS": "1",
    "BLIS_NUM_THREADS": "1",
    "PYTHONHASHSEED": "0",
    "CUDA_VISIBLE_DEVICES": "",
    "PYTORCH_ENABLE_MPS_FALLBACK": "0",
}
PROXY_ENVIRONMENT = (
    "ALL_PROXY",
    "FTP_PROXY",
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "NO_PROXY",
    "all_proxy",
    "ftp_proxy",
    "http_proxy",
    "https_proxy",
    "no_proxy",
)
KNOWN_ESCAPE_SOCKETS = (
    "/var/run/docker.sock",
    "/run/docker.sock",
    "/run/containerd/containerd.sock",
    "/var/run/podman/podman.sock",
)
EXPECTED_DISTRIBUTIONS = {
    "mattersim": ("mattersim", "1.2.5"),
    "mace": ("mace-torch", "0.3.16"),
}
RANDOM_TP_RECORD_DOMAIN = "tf.random-tp.record/v1"
RANDOM_TP_RECORD_MANIFEST_DOMAIN = "tf.random-tp.record-manifest/v1"
STRUCTURE_SCHEMA = "tf.atomistic-structure/0.1"
STRUCTURE_MANIFEST_SCHEMA = "tf.atomistic-structure-bundle-manifest/0.1"
STRUCTURE_DIGEST_DOMAIN = "tf.atomistic-structure/v1"
STRUCTURE_MANIFEST_DOMAIN = "tf.atomistic-structure-manifest/v1"
EXPECTED_REPRODUCTION_PLAN_SHA256 = "sha256:d3a58524029b51c598d00a7bb9f60b6479a9973a0f9907cbf94a31e61bf1c9c2"
RANDOM_TP_ID_RE = re.compile(r"^random-TP-[0-9]{6}$")
PERIODIC_SYMBOLS = (
    "", "H", "He", "Li", "Be", "B", "C", "N", "O", "F", "Ne", "Na",
    "Mg", "Al", "Si", "P", "S", "Cl", "Ar", "K", "Ca", "Sc", "Ti",
    "V", "Cr", "Mn", "Fe", "Co", "Ni", "Cu", "Zn", "Ga", "Ge", "As",
    "Se", "Br", "Kr", "Rb", "Sr", "Y", "Zr", "Nb", "Mo", "Tc", "Ru",
    "Rh", "Pd", "Ag", "Cd", "In", "Sn", "Sb", "Te", "I", "Xe", "Cs",
    "Ba", "La", "Ce", "Pr", "Nd", "Pm", "Sm", "Eu", "Gd", "Tb", "Dy",
    "Ho", "Er", "Tm", "Yb", "Lu", "Hf", "Ta", "W", "Re", "Os", "Ir",
    "Pt", "Au", "Hg", "Tl", "Pb", "Bi", "Po", "At", "Rn", "Fr", "Ra",
    "Ac", "Th", "Pa", "U", "Np", "Pu", "Am", "Cm", "Bk", "Cf", "Es",
    "Fm", "Md", "No", "Lr", "Rf", "Db", "Sg", "Bh", "Hs", "Mt", "Ds",
    "Rg", "Cn", "Nh", "Fl", "Mc", "Lv", "Ts", "Og",
)
ATOMIC_NUMBER = {symbol: number for number, symbol in enumerate(PERIODIC_SYMBOLS) if symbol}
EXPECTED_SCIENTIFIC_PLAN_PROJECTION = {
    "schemaVersion": "tf.atomistic-reproduction/0.2",
    "models": {
        "mace-mpa-0-medium": {
            "sourceCommit": "4d2da09413ac1407f37cdbb6b81fa28e4c15655e",
            "package": {
                "name": "mace-torch", "version": "0.3.16",
                "filename": "mace_torch-0.3.16-py3-none-any.whl",
                "sizeBytes": 316021,
                "sha256": "sha256:b80407edf6b2a1ec8523668c2a36852d20927ce1c3c56b70983a9f2dc53233ad",
            },
            "checkpoint": {
                "filename": "mace-mpa-0-medium.model", "sizeBytes": 79462305,
                "sha256": "sha256:75428afe3a1d7d8062e19bcaabd5c433623cabf308242ec9fb493e38604fb638",
            },
            "outputs": ["energy_eV", "forces_eV_per_angstrom", "stress_eV_per_angstrom3"],
            "defaultAliasAllowed": False,
            "adapter": "mace-ase-batch1-full3x3-eva3/v1",
        },
        "mattersim-v1.0.0-5m": {
            "sourceCommit": "40a1eb8f1189a53af310957b4f2c5dfbfe68d647",
            "package": {
                "name": "mattersim", "version": "1.2.5",
                "filename": "mattersim-1.2.5-cp312-cp312-manylinux_2_17_x86_64.manylinux2014_x86_64.whl",
                "sizeBytes": 755919,
                "sha256": "sha256:1b5e46ba56efa5c1e93372ad32321300fa5e1f07dd9188a11b727bd578cf8d7f",
            },
            "checkpoint": {
                "filename": "mattersim-v1.0.0-5M.pth", "sizeBytes": 91176875,
                "sha256": "sha256:e3df9fa708725e3d453140646c7d1838324b347a3d1214cf1440522146f872b5",
            },
            "outputs": ["energy_eV", "forces_eV_per_angstrom", "stress_eV_per_angstrom3"],
            "defaultAliasAllowed": False,
            "adapter": "mattersim-ase-batch1-full3x3-eva3/v1",
        },
    },
    "benchmark": {
        "id": "mattersim-random-tp", "filename": "random-TP.xyz",
        "sizeBytes": 1514015,
        "sha256": "sha256:c14473dcf4bd71e1ed11556ac9ff12b68e7a423d813f939bc9eedaef663054d9",
        "frames": 693, "atoms": 11088, "elements": 89, "atomsPerFrame": 16,
        "idSetSha256": "sha256:4df1ba7cda1b0a31cdb0b3e2281ed535327d7b92ce381cd930c781cc8b800f91",
        "recordManifestSha256": "sha256:6afbbdc0cd745efaca4bf5d7a2a7604db9f1d1f59749b86d3c0a51d48f07893a",
        "smokeManifestSha256": "sha256:858b009bddf8fe8d78114b1c227fd7756c49990ca84aaf7ee8e5aecd54967423",
        "smokeRecordManifestSha256": "sha256:35c87d2440310bb226e800407c9bec39000f4e2934d2ca83ec4eea537e7ed8de",
        "smokeElements": 89,
        "smokeIds": [
            "random-TP-000000", "random-TP-000005", "random-TP-000010",
            "random-TP-000095", "random-TP-000125", "random-TP-000135",
            "random-TP-000200", "random-TP-000220", "random-TP-000369",
            "random-TP-000555",
        ],
        "manifestCanonicalization": "tf.random-tp.record/v1",
    },
    "runner": {
        "python": "3.12.13", "platform": "linux", "architecture": "x86_64",
        "dtype": "float32", "canonicalDevice": "cpu", "batchSize": 1,
        "threads": 1,
    },
}
EXPECTED_STRUCTURE_BUNDLE_TRUST_ROOT = {
    "bundle": {
        "filename": "structures.jsonl",
        "sizeBytes": 681414,
        "sha256": "sha256:d4ff1ee210abf80884e1526b1e2600e918103f3505a2a712bce57d6fba3a1b5c",
    },
    "manifest": {
        "filename": "structures.manifest.json",
        "sizeBytes": 1147,
        "sha256": "sha256:9f870f62cd60b7021d874d1970c81ac8cb64a302e2c5fd4013464198fd11a25e",
    },
    "structureManifestSha256": "sha256:b0a94b5424f9d4a2be7519265b8dbe89a478fa5b21a6c956c70ffe0c705078f7",
    "smokeStructureManifestSha256": "sha256:0b412c1d675b1ee8adf434610cd4e29bb40601c1c966bdbaa9cbc114d880f938",
}


class ContractViolation(RuntimeError):
    """A machine-readable, fail-closed contract violation."""

    def __init__(self, code: str, message: str, *, details: Any = None) -> None:
        super().__init__(message)
        self.code = code
        self.details = details


@dataclass(frozen=True)
class VerifiedArtifact:
    role: str
    path: str
    filename: str
    size_bytes: int
    sha256: str
    device: int
    inode: int
    modified_ns: int

    def public_record(self) -> dict[str, Any]:
        record = asdict(self)
        record.pop("device")
        record.pop("inode")
        record.pop("modified_ns")
        return record


@dataclass(frozen=True)
class NetworkProof:
    egress_disabled: bool
    network_namespace: str
    effective_capabilities: str
    interfaces: tuple[str, ...]
    ipv4_routes: tuple[str, ...]
    ipv6_routes: tuple[str, ...]
    probes: tuple[dict[str, Any], ...]
    escape_sockets_absent: bool
    method: str

    def public_record(self) -> dict[str, Any]:
        return asdict(self)


def configure_preimport_environment() -> tuple[str, ...]:
    """Freeze CPU/thread settings and remove proxy hints before ML imports."""

    for key, value in THREAD_ENVIRONMENT.items():
        os.environ[key] = value
    removed: list[str] = []
    for key in PROXY_ENVIRONMENT:
        if key in os.environ:
            removed.append(key)
            os.environ.pop(key, None)
    return tuple(sorted(removed))


def validate_base_runtime() -> dict[str, Any]:
    """Require the declared Python/Linux/x86_64, unprivileged CPU runtime."""

    failures: list[str] = []
    if platform.python_version() != "3.12.13":
        failures.append(f"Python 3.12.13 required, found {platform.python_version()}")
    if platform.system() != "Linux":
        failures.append(f"Linux required, found {platform.system()}")
    machine = platform.machine().lower()
    if machine not in {"x86_64", "amd64"}:
        failures.append(f"x86_64 required, found {platform.machine()}")
    if sys.maxsize <= 2**32:
        failures.append("64-bit Python required")
    effective_uid = os.geteuid() if hasattr(os, "geteuid") else None
    if effective_uid == 0:
        failures.append("runner must be unprivileged (effective uid 0 is forbidden)")
    mismatched_threads = {
        key: os.environ.get(key)
        for key, value in THREAD_ENVIRONMENT.items()
        if os.environ.get(key) != value
    }
    if mismatched_threads:
        failures.append(f"thread/device environment drift: {mismatched_threads}")
    if failures:
        raise ContractViolation("runtime-platform", "; ".join(failures))
    return {
        "pythonVersion": platform.python_version(),
        "pythonImplementation": platform.python_implementation(),
        "system": platform.system(),
        "release": platform.release(),
        "machine": platform.machine(),
        "effectiveUid": effective_uid,
        "cpuCount": os.cpu_count(),
        "device": "cpu",
        "dtype": "float32",
        "batchSize": 1,
        "threadEnvironment": dict(THREAD_ENVIRONMENT),
    }


def _canonical_existing_file(raw_path: str, label: str) -> Path:
    supplied = Path(raw_path)
    if not supplied.is_absolute():
        raise ContractViolation(
            "path-not-absolute", f"{label} must be an absolute path: {raw_path!r}"
        )
    try:
        canonical = supplied.resolve(strict=True)
    except OSError as error:
        raise ContractViolation(
            "path-unavailable", f"{label} is unavailable: {error}"
        ) from error
    if canonical != supplied:
        raise ContractViolation(
            "path-not-canonical",
            f"{label} must be canonical and symlink-free: {supplied} -> {canonical}",
        )
    metadata = canonical.stat()
    if not stat.S_ISREG(metadata.st_mode):
        raise ContractViolation("path-not-file", f"{label} is not a regular file")
    return canonical


def canonical_existing_file(raw_path: str, label: str) -> Path:
    """Public canonical-path check for plan and optional provenance files."""

    return _canonical_existing_file(raw_path, label)


def _normalize_expected_sha256(value: str, label: str) -> str:
    if not isinstance(value, str):
        raise ContractViolation("digest-invalid", f"{label} SHA-256 is not a string")
    match = SHA256_RE.fullmatch(value.lower())
    if not match:
        raise ContractViolation("digest-invalid", f"{label} has malformed SHA-256")
    return match.group(1)


def _open_readonly_nofollow(path: Path) -> int:
    flags = os.O_RDONLY | getattr(os, "O_CLOEXEC", 0) | getattr(os, "O_NOFOLLOW", 0)
    try:
        descriptor = os.open(path, flags)
    except OSError as error:
        raise ContractViolation(
            "artifact-open", f"cannot open {path} without following links: {error}"
        ) from error
    metadata = os.fstat(descriptor)
    if not stat.S_ISREG(metadata.st_mode):
        os.close(descriptor)
        raise ContractViolation("path-not-file", f"{path} is not a regular file")
    return descriptor


def _sha256_descriptor(descriptor: int, *, chunk_bytes: int) -> str:
    digest = hashlib.sha256()
    os.lseek(descriptor, 0, os.SEEK_SET)
    while True:
        chunk = os.read(descriptor, chunk_bytes)
        if not chunk:
            break
        digest.update(chunk)
    return digest.hexdigest()


def sha256_file(path: Path, *, chunk_bytes: int = 1024 * 1024) -> str:
    descriptor = _open_readonly_nofollow(path)
    try:
        return _sha256_descriptor(descriptor, chunk_bytes=chunk_bytes)
    finally:
        os.close(descriptor)


def verify_artifact(
    raw_path: str,
    *,
    role: str,
    expected_size: int,
    expected_sha256: str,
    expected_filename: str | None = None,
) -> VerifiedArtifact:
    """Stream-verify an artifact and detect concurrent mutation while hashing."""

    path = _canonical_existing_file(raw_path, role)
    if expected_filename is not None and path.name != expected_filename:
        raise ContractViolation(
            "filename-mismatch",
            f"{role} filename mismatch: expected {expected_filename}, found {path.name}",
        )
    if not isinstance(expected_size, int) or expected_size <= 0:
        raise ContractViolation("size-invalid", f"{role} expected size is invalid")
    expected_digest = _normalize_expected_sha256(expected_sha256, role)
    descriptor = _open_readonly_nofollow(path)
    try:
        before = os.fstat(descriptor)
        if before.st_size != expected_size:
            raise ContractViolation(
                "size-mismatch",
                f"{role} size mismatch: expected {expected_size}, found {before.st_size}",
            )
        actual_digest = _sha256_descriptor(descriptor, chunk_bytes=1024 * 1024)
        after = os.fstat(descriptor)
    finally:
        os.close(descriptor)
    identity_before = (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns)
    identity_after = (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns)
    if identity_before != identity_after:
        raise ContractViolation(
            "artifact-raced", f"{role} changed while it was being verified"
        )
    if actual_digest != expected_digest:
        raise ContractViolation(
            "digest-mismatch",
            f"{role} SHA-256 mismatch",
            details={"expected": f"sha256:{expected_digest}", "actual": f"sha256:{actual_digest}"},
        )
    return VerifiedArtifact(
        role=role,
        path=str(path),
        filename=path.name,
        size_bytes=after.st_size,
        sha256=f"sha256:{actual_digest}",
        device=after.st_dev,
        inode=after.st_ino,
        modified_ns=after.st_mtime_ns,
    )


def reverify_artifact(artifact: VerifiedArtifact) -> None:
    """Recheck identity and digest immediately before a consumer opens the file."""

    path = Path(artifact.path)
    descriptor = _open_readonly_nofollow(path)
    try:
        metadata = os.fstat(descriptor)
        identity = (metadata.st_dev, metadata.st_ino, metadata.st_size, metadata.st_mtime_ns)
        actual_digest = _sha256_descriptor(descriptor, chunk_bytes=1024 * 1024)
    finally:
        os.close(descriptor)
    expected_identity = (
        artifact.device,
        artifact.inode,
        artifact.size_bytes,
        artifact.modified_ns,
    )
    if identity != expected_identity:
        raise ContractViolation(
            "artifact-changed", f"{artifact.role} identity changed after verification"
        )
    if f"sha256:{actual_digest}" != artifact.sha256:
        raise ContractViolation(
            "artifact-changed", f"{artifact.role} bytes changed after verification"
        )


def canonical_json_bytes(value: Any) -> bytes:
    return json.dumps(
        value,
        allow_nan=False,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")


def sha256_json(value: Any) -> str:
    return f"sha256:{hashlib.sha256(canonical_json_bytes(value)).hexdigest()}"


def validate_reproduction_plan_bytes(payload: bytes) -> None:
    actual = f"sha256:{hashlib.sha256(payload).hexdigest()}"
    if actual != EXPECTED_REPRODUCTION_PLAN_SHA256:
        raise ContractViolation(
            "plan-raw-trust-root",
            "reproduction plan bytes differ from the frozen preregistration",
            details={"expected": EXPECTED_REPRODUCTION_PLAN_SHA256, "actual": actual},
        )


def scientific_plan_projection(plan: Mapping[str, Any]) -> dict[str, Any]:
    """Extract the immutable scientific inputs without circular runner hashes."""

    try:
        models = {entry["id"]: entry for entry in plan["models"]}
        if len(models) != len(plan["models"]):
            raise KeyError("duplicate model IDs")
        benchmark_matches = [
            entry for entry in plan["benchmarks"]
            if entry.get("role") == "primary-like-for-like"
        ]
        if len(benchmark_matches) != 1:
            raise KeyError("primary benchmark")
        benchmark = benchmark_matches[0]
        artifact = benchmark["artifact"]
        runner = plan["protocol"]["runner"]
        projected_models: dict[str, Any] = {}
        for model_id in sorted(EXPECTED_SCIENTIFIC_PLAN_PROJECTION["models"]):
            model = models[model_id]
            adapter_key = "matterSimAdapter" if model_id.startswith("mattersim") else "maceAdapter"
            projected_models[model_id] = {
                "sourceCommit": model["sourceCommit"],
                "package": {
                    key: model["package"][key]
                    for key in ("name", "version", "filename", "sizeBytes", "sha256")
                },
                "checkpoint": {
                    "filename": Path(model["cachePath"]).name,
                    "sizeBytes": model["checkpoint"]["sizeBytes"],
                    "sha256": model["checkpoint"]["sha256"],
                },
                "outputs": model["outputs"],
                "defaultAliasAllowed": model["defaultAliasAllowed"],
                "adapter": runner[adapter_key],
            }
        benchmark_projection = {
            "id": benchmark["id"], "filename": Path(benchmark["cachePath"]).name,
            **{key: artifact[key] for key in (
                "sizeBytes", "sha256", "frames", "atoms", "elements", "atomsPerFrame",
                "idSetSha256", "recordManifestSha256", "smokeManifestSha256",
                "smokeRecordManifestSha256", "smokeElements", "smokeIds",
                "manifestCanonicalization",
            )},
        }
        runner_projection = {key: runner[key] for key in (
            "python", "platform", "architecture", "dtype", "canonicalDevice",
            "batchSize", "threads",
        )}
    except (KeyError, TypeError) as error:
        raise ContractViolation(
            "plan-trust-root", f"plan cannot form the scientific projection: {error}"
        ) from error
    return {
        "schemaVersion": plan.get("schemaVersion"),
        "models": projected_models,
        "benchmark": benchmark_projection,
        "runner": runner_projection,
    }


def validate_scientific_plan_trust_root(plan: Mapping[str, Any]) -> None:
    actual = scientific_plan_projection(plan)
    if actual != EXPECTED_SCIENTIFIC_PLAN_PROJECTION:
        raise ContractViolation(
            "plan-trust-root",
            "plan scientific projection differs from the runner trust root",
            details={
                "expectedSha256": sha256_json(EXPECTED_SCIENTIFIC_PLAN_PROJECTION),
                "actualSha256": sha256_json(actual),
            },
        )


def structure_digest(
    *, identifier: str, atom_count: int, atomic_numbers: Iterable[int],
    lattice: Iterable[float], positions: Iterable[float], pbc: Iterable[bool],
) -> str:
    """Hash only model-visible structure data using a fixed LE encoding."""

    numbers = tuple(atomic_numbers)
    lattice_values = tuple(lattice)
    position_values = tuple(positions)
    periodic = tuple(pbc)
    if not RANDOM_TP_ID_RE.fullmatch(identifier):
        raise ContractViolation("structure-id", f"invalid structure ID {identifier!r}")
    if not isinstance(atom_count, int) or not (0 < atom_count < 2**32):
        raise ContractViolation("structure-atom-count", f"{identifier} atom count is invalid")
    if len(numbers) != atom_count or any(
        not isinstance(number, int) or not (0 < number < 2**16) for number in numbers
    ):
        raise ContractViolation("structure-elements", f"{identifier} elements are invalid")
    if len(lattice_values) != 9 or len(position_values) != atom_count * 3:
        raise ContractViolation("structure-shape", f"{identifier} geometry shape is invalid")
    if periodic != (True, True, True):
        raise ContractViolation("structure-pbc", f"{identifier} must be fully periodic")
    values: list[float] = []
    for value in lattice_values + position_values:
        numeric = float(value)
        if not math.isfinite(numeric):
            raise ContractViolation("structure-nonfinite", f"{identifier} has non-finite geometry")
        values.append(0.0 if numeric == 0.0 else numeric)
    payload = bytearray(f"{STRUCTURE_DIGEST_DOMAIN}\0{identifier}\0".encode("utf-8"))
    payload.extend(struct.pack("<I", atom_count))
    payload.extend(struct.pack(f"<{atom_count}H", *numbers))
    payload.extend(bytes(int(value) for value in periodic))
    payload.extend(struct.pack(f"<{len(values)}d", *values))
    return f"sha256:{hashlib.sha256(payload).hexdigest()}"


def build_structure_record(raw_record: Mapping[str, Any]) -> dict[str, Any]:
    count = raw_record["atomCount"]
    lattice = [list(raw_record["lattice"][offset:offset + 3]) for offset in range(0, 9, 3)]
    positions = [
        list(raw_record["positions"][offset:offset + 3])
        for offset in range(0, count * 3, 3)
    ]
    record = {
        "schemaVersion": STRUCTURE_SCHEMA,
        "id": raw_record["id"],
        "atomCount": count,
        "atomicNumbers": list(raw_record["atomicNumbers"]),
        "lattice": lattice,
        "positions": positions,
        "pbc": [True, True, True],
    }
    record["inputStructureDigest"] = structure_digest(
        identifier=record["id"], atom_count=count,
        atomic_numbers=record["atomicNumbers"],
        lattice=[value for row in lattice for value in row],
        positions=[value for row in positions for value in row], pbc=record["pbc"],
    )
    return record


def validate_structure_record(record: Mapping[str, Any]) -> dict[str, Any]:
    expected_keys = {
        "schemaVersion", "id", "atomCount", "atomicNumbers", "lattice",
        "positions", "pbc", "inputStructureDigest",
    }
    if set(record) != expected_keys or record.get("schemaVersion") != STRUCTURE_SCHEMA:
        raise ContractViolation("structure-schema", "structure record has extra/missing fields")
    try:
        lattice = [value for row in record["lattice"] for value in row]
        positions = [value for row in record["positions"] for value in row]
    except (TypeError, ValueError) as error:
        raise ContractViolation("structure-shape", "structure arrays are malformed") from error
    actual = structure_digest(
        identifier=record["id"], atom_count=record["atomCount"],
        atomic_numbers=record["atomicNumbers"], lattice=lattice,
        positions=positions, pbc=record["pbc"],
    )
    if actual != record["inputStructureDigest"]:
        raise ContractViolation(
            "structure-digest", f"{record['id']} structure digest mismatch",
            details={"expected": record["inputStructureDigest"], "actual": actual},
        )
    return dict(record)


def structure_manifest_digest(records: Iterable[Mapping[str, Any]]) -> str:
    ordered = sorted(records, key=lambda record: record["id"])
    if not ordered or len({record["id"] for record in ordered}) != len(ordered):
        raise ContractViolation("structure-manifest", "structure IDs must be unique")
    digest = hashlib.sha256()
    digest.update(f"{STRUCTURE_MANIFEST_DOMAIN}\0".encode("utf-8"))
    for record in ordered:
        checked = validate_structure_record(record)
        value = _normalize_expected_sha256(
            checked["inputStructureDigest"], f"{checked['id']} structure"
        )
        digest.update(f"{checked['id']}\0".encode("utf-8"))
        digest.update(bytes.fromhex(value))
    return f"sha256:{digest.hexdigest()}"


def parse_structure_jsonl(path: Path) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    try:
        with path.open("r", encoding="utf-8", newline="") as handle:
            for line_number, line in enumerate(handle, start=1):
                if not line.endswith("\n") or line in {"\n", "\r\n"}:
                    raise ContractViolation(
                        "structure-jsonl", f"line {line_number} is empty or not newline terminated"
                    )
                record = json.loads(line)
                if canonical_json_bytes(record) + b"\n" != line.encode("utf-8"):
                    raise ContractViolation(
                        "structure-canonical", f"line {line_number} is not canonical JSON"
                    )
                records.append(validate_structure_record(record))
    except (OSError, json.JSONDecodeError) as error:
        raise ContractViolation("structure-jsonl", f"cannot parse structure bundle: {error}") from error
    if len({record["id"] for record in records}) != len(records):
        raise ContractViolation("structure-duplicate", "structure bundle has duplicate IDs")
    if records != sorted(records, key=lambda record: record["id"]):
        raise ContractViolation("structure-order", "structure bundle is not sorted by ID")
    return records


def id_set_digest(identifiers: Iterable[str]) -> str:
    """Hash the sorted newline-terminated ID set used by the Node verifier."""

    ordered = sorted(identifiers)
    if not ordered or len(set(ordered)) != len(ordered):
        raise ContractViolation(
            "dataset-id-set", "record IDs must be a non-empty unique set"
        )
    payload = ("\n".join(ordered) + "\n").encode("utf-8")
    return f"sha256:{hashlib.sha256(payload).hexdigest()}"


def scientific_record_digest(
    *,
    identifier: str,
    atom_count: int,
    atomic_numbers: Iterable[int],
    lattice: Iterable[float],
    positions: Iterable[float],
    energy: float,
    forces: Iterable[float],
    stress: Iterable[float],
) -> str:
    """Implement ``tf.random-tp.record/v1`` byte-for-byte.

    Integer fields are unsigned little-endian and every numeric scientific
    value is an IEEE-754 little-endian float64.  Negative zero is normalized to
    positive zero exactly as in ``dataset-manifest.mjs``.
    """

    if not RANDOM_TP_ID_RE.fullmatch(identifier):
        raise ContractViolation("dataset-id", f"invalid Random-TP ID {identifier!r}")
    if not isinstance(atom_count, int) or not (0 < atom_count < 2**32):
        raise ContractViolation("dataset-atom-count", "record atom count is invalid")
    numbers = tuple(atomic_numbers)
    lattice_values = tuple(lattice)
    position_values = tuple(positions)
    force_values = tuple(forces)
    stress_values = tuple(stress)
    if len(numbers) != atom_count or any(
        not isinstance(number, int) or not (0 < number < 2**16)
        for number in numbers
    ):
        raise ContractViolation("dataset-elements", f"{identifier} has invalid atomic numbers")
    expected_lengths = ((lattice_values, 9), (position_values, atom_count * 3),
                        (force_values, atom_count * 3), (stress_values, 9))
    if any(len(values) != expected for values, expected in expected_lengths):
        raise ContractViolation("dataset-record-shape", f"{identifier} has invalid record shape")
    numeric_values = lattice_values + position_values + (energy,) + force_values + stress_values
    normalized: list[float] = []
    for value in numeric_values:
        numeric = float(value)
        if not math.isfinite(numeric):
            raise ContractViolation("dataset-nonfinite", f"{identifier} contains a non-finite value")
        normalized.append(0.0 if numeric == 0.0 else numeric)
    payload = bytearray(
        f"{RANDOM_TP_RECORD_DOMAIN}\0{identifier}\0".encode("utf-8")
    )
    payload.extend(struct.pack("<I", atom_count))
    payload.extend(struct.pack(f"<{atom_count}H", *numbers))
    payload.extend(bytes((1, 1, 1)))
    payload.extend(struct.pack(f"<{len(normalized)}d", *normalized))
    return f"sha256:{hashlib.sha256(payload).hexdigest()}"


def record_manifest_digest(records: Iterable[Mapping[str, Any]]) -> str:
    """Hash sorted ``id -> scientific record digest`` bindings."""

    ordered = sorted(records, key=lambda record: record["id"])
    if not ordered or len({record["id"] for record in ordered}) != len(ordered):
        raise ContractViolation(
            "dataset-record-manifest", "scientific records must have unique IDs"
        )
    digest = hashlib.sha256()
    digest.update(f"{RANDOM_TP_RECORD_MANIFEST_DOMAIN}\0".encode("utf-8"))
    for record in ordered:
        identifier = record["id"]
        if not isinstance(identifier, str) or not RANDOM_TP_ID_RE.fullmatch(identifier):
            raise ContractViolation("dataset-id", f"invalid Random-TP ID {identifier!r}")
        record_digest = _normalize_expected_sha256(
            record["recordDigest"], f"{identifier} scientific record"
        )
        digest.update(f"{identifier}\0".encode("utf-8"))
        digest.update(bytes.fromhex(record_digest))
    return f"sha256:{digest.hexdigest()}"


def _header_capture(header: str, pattern: str, label: str, line_number: int) -> str:
    match = re.search(pattern, header)
    if not match:
        raise ContractViolation(
            "dataset-header", f"Random-TP line {line_number} is missing {label}"
        )
    return match.group(1)


def _finite_number(raw: str, label: str) -> float:
    try:
        value = float(raw)
    except (TypeError, ValueError) as error:
        raise ContractViolation("dataset-number", f"{label} is not numeric") from error
    if not math.isfinite(value):
        raise ContractViolation("dataset-nonfinite", f"{label} is not finite")
    return value


def _numeric_vector(raw: str, length: int, label: str) -> tuple[float, ...]:
    values = tuple(_finite_number(value, label) for value in raw.strip().split())
    if len(values) != length:
        raise ContractViolation(
            "dataset-record-shape", f"{label} must contain {length} values"
        )
    return values


def inspect_random_tp(path: Path) -> list[dict[str, Any]]:
    """Strictly parse Random-TP and compute the Node-compatible record digests.

    This parser is standard-library-only, so callers can validate the dataset
    bytes and its scientific manifest before importing ASE or any ML package.
    """

    try:
        payload = path.read_bytes()
    except OSError as error:
        raise ContractViolation("dataset-parse", f"cannot read Random-TP: {error}") from error
    if not payload or b"\0" in payload:
        raise ContractViolation("dataset-parse", "Random-TP is empty or contains NUL bytes")
    raw_lines = payload.split(b"\n")
    if raw_lines and raw_lines[-1] == b"":
        raw_lines.pop()
    lines: list[str] = []
    for line_number, raw_line in enumerate(raw_lines, start=1):
        if raw_line.endswith(b"\r"):
            raw_line = raw_line[:-1]
        try:
            lines.append(raw_line.decode("utf-8", errors="strict"))
        except UnicodeDecodeError as error:
            raise ContractViolation(
                "dataset-encoding", f"Random-TP line {line_number} is not UTF-8"
            ) from error

    records: list[dict[str, Any]] = []
    identifiers: set[str] = set()
    cursor = 0
    while cursor < len(lines):
        count_raw = lines[cursor].strip()
        if not re.fullmatch(r"[1-9][0-9]*", count_raw):
            raise ContractViolation(
                "dataset-atom-count", f"Random-TP line {cursor + 1} has an invalid atom count"
            )
        atom_count = int(count_raw)
        header_index = cursor + 1
        final_atom_index = cursor + 1 + atom_count
        if final_atom_index >= len(lines):
            raise ContractViolation("dataset-truncated", f"frame at line {cursor + 1} is truncated")
        header = lines[header_index]
        identifier = _header_capture(
            header, r"(?:^|\s)internal_id=([^\s]+)", "internal_id", header_index + 1
        )
        if not RANDOM_TP_ID_RE.fullmatch(identifier) or identifier in identifiers:
            raise ContractViolation("dataset-id", f"invalid or duplicate ID {identifier!r}")
        identifiers.add(identifier)
        for key, expected in (
            ("energy_unit", "eV"),
            ("forces_unit", "eV/A"),
            ("stress_unit", "eV/A^3"),
        ):
            actual = _header_capture(
                header, rf"(?:^|\s){key}=([^\s]+)", key, header_index + 1
            )
            if actual != expected:
                raise ContractViolation(
                    "dataset-unit", f"{identifier} expected {key}={expected}, found {actual}"
                )
        pbc = _header_capture(
            header, r'(?:^|\s)pbc="([^"]+)"', "pbc", header_index + 1
        )
        if pbc != "T T T":
            raise ContractViolation("dataset-pbc", f"{identifier} is not fully periodic")
        lattice = _numeric_vector(
            _header_capture(header, r'(?:^|\s)Lattice="([^"]+)"', "Lattice", header_index + 1),
            9,
            f"{identifier} lattice",
        )
        stress = _numeric_vector(
            _header_capture(header, r'(?:^|\s)stress="([^"]+)"', "stress", header_index + 1),
            9,
            f"{identifier} stress",
        )
        energy = _finite_number(
            _header_capture(header, r"(?:^|\s)energy=([^\s]+)", "energy", header_index + 1),
            f"{identifier} energy",
        )
        atomic_numbers: list[int] = []
        positions: list[float] = []
        forces: list[float] = []
        for offset in range(atom_count):
            line_index = cursor + 2 + offset
            fields = lines[line_index].strip().split()
            if len(fields) != 7 or not re.fullmatch(r"[A-Z][a-z]?", fields[0]):
                raise ContractViolation(
                    "dataset-atom-row", f"{identifier} has an invalid atom row at line {line_index + 1}"
                )
            atomic_number = ATOMIC_NUMBER.get(fields[0])
            if atomic_number is None:
                raise ContractViolation("dataset-element", f"{identifier} has unknown element {fields[0]}")
            values = [_finite_number(value, f"{identifier} atom {offset}") for value in fields[1:]]
            atomic_numbers.append(atomic_number)
            positions.extend(values[:3])
            forces.extend(values[3:])
        record_digest = scientific_record_digest(
            identifier=identifier,
            atom_count=atom_count,
            atomic_numbers=atomic_numbers,
            lattice=lattice,
            positions=positions,
            energy=energy,
            forces=forces,
            stress=stress,
        )
        records.append(
            {
                "id": identifier,
                "atomCount": atom_count,
                "atomicNumbers": atomic_numbers,
                "lattice": lattice,
                "positions": positions,
                "energy": energy,
                "forces": forces,
                "stress": stress,
                "recordDigest": record_digest,
            }
        )
        cursor = final_atom_index + 1
    return records


def atomic_write_bytes(path: Path, payload: bytes) -> None:
    """Write a new evidence file atomically without overwriting prior evidence."""

    if path.exists():
        raise ContractViolation("output-exists", f"refusing to overwrite {path}")
    path.parent.mkdir(parents=True, exist_ok=True)
    file_descriptor, temporary_name = tempfile.mkstemp(
        prefix=f".{path.name}.", suffix=".partial", dir=path.parent
    )
    temporary_path = Path(temporary_name)
    try:
        with os.fdopen(file_descriptor, "wb") as handle:
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary_path, path)
    finally:
        try:
            temporary_path.unlink()
        except FileNotFoundError:
            pass


def atomic_write_json(path: Path, value: Any) -> None:
    atomic_write_bytes(path, canonical_json_bytes(value) + b"\n")


def prepare_output_directory(raw_path: str) -> Path:
    supplied = Path(raw_path)
    if not supplied.is_absolute():
        raise ContractViolation(
            "path-not-absolute", f"output must be an absolute directory path: {raw_path!r}"
        )
    if supplied.exists():
        canonical = supplied.resolve(strict=True)
        if canonical != supplied or not canonical.is_dir():
            raise ContractViolation(
                "output-invalid", "output must be a canonical directory"
            )
        if any(canonical.iterdir()):
            raise ContractViolation(
                "output-not-empty", f"output directory must be empty: {canonical}"
            )
        return canonical
    parent = supplied.parent.resolve(strict=True)
    canonical = parent / supplied.name
    if canonical != supplied:
        raise ContractViolation(
            "path-not-canonical", f"output path must be canonical: {supplied}"
        )
    canonical.mkdir(mode=0o700)
    return canonical


def _read_route_lines(path: Path, *, has_header: bool) -> tuple[str, ...]:
    try:
        lines = path.read_text(encoding="ascii").splitlines()
    except OSError as error:
        raise ContractViolation(
            "network-proof-unavailable", f"cannot read {path}: {error}"
        ) from error
    if has_header:
        lines = lines[1:]
    return tuple(line.strip() for line in lines if line.strip())


def _probe_unreachable(
    family: socket.AddressFamily, address: tuple[Any, ...]
) -> dict[str, Any]:
    accepted_errors = {
        errno.EACCES,
        errno.EADDRNOTAVAIL,
        errno.EAFNOSUPPORT,
        errno.EHOSTUNREACH,
        errno.ENETDOWN,
        errno.ENETUNREACH,
        errno.EPERM,
    }
    try:
        probe = socket.socket(family, socket.SOCK_STREAM)
    except OSError as error:
        if error.errno != errno.EAFNOSUPPORT:
            raise ContractViolation(
                "network-egress-ambiguous",
                f"cannot create egress probe socket for {address}: {error}",
                details={"errno": error.errno},
            ) from error
        return {
            "family": "ipv6" if family == socket.AF_INET6 else "ipv4",
            "address": str(address[0]),
            "port": int(address[1]),
            "blockedErrno": error.errno,
            "blockedReason": error.strerror,
        }
    with probe:
        probe.settimeout(0.25)
        try:
            probe.connect(address)
        except OSError as error:
            if error.errno not in accepted_errors:
                raise ContractViolation(
                    "network-egress-ambiguous",
                    f"egress probe failed ambiguously for {address}: {error}",
                    details={"errno": error.errno},
                ) from error
            return {
                "family": "ipv6" if family == socket.AF_INET6 else "ipv4",
                "address": str(address[0]),
                "port": int(address[1]),
                "blockedErrno": error.errno,
                "blockedReason": error.strerror,
            }
    raise ContractViolation(
        "network-egress-enabled", f"egress probe unexpectedly connected to {address}"
    )


def prove_network_egress_disabled() -> NetworkProof:
    """Prove the process has only loopback and no usable external route."""

    if platform.system() != "Linux":
        raise ContractViolation(
            "network-proof-platform", "network proof is implemented only for Linux"
        )
    namespace_path = Path("/proc/self/ns/net")
    try:
        network_namespace = os.readlink(namespace_path)
    except OSError as error:
        raise ContractViolation(
            "network-proof-unavailable", f"cannot inspect network namespace: {error}"
        ) from error
    try:
        status_lines = Path("/proc/self/status").read_text(encoding="ascii").splitlines()
        capability_line = next(line for line in status_lines if line.startswith("CapEff:"))
        effective_capabilities = capability_line.split(":", 1)[1].strip().lower()
        capability_bits = int(effective_capabilities, 16)
    except (OSError, StopIteration, ValueError) as error:
        raise ContractViolation(
            "network-proof-unavailable", f"cannot inspect effective capabilities: {error}"
        ) from error
    forbidden_capabilities = {
        "CAP_NET_ADMIN": 12,
        "CAP_SYS_ADMIN": 21,
    }
    present_forbidden = [
        name for name, bit in forbidden_capabilities.items() if capability_bits & (1 << bit)
    ]
    if present_forbidden:
        raise ContractViolation(
            "network-admin-capability",
            "runner can mutate or escape its network namespace",
            details=present_forbidden,
        )
    interfaces = tuple(sorted(name for _, name in socket.if_nameindex()))
    if interfaces != ("lo",):
        raise ContractViolation(
            "network-interface-present",
            f"network-disabled runtime must expose only loopback; found {interfaces}",
        )
    ipv4_routes = _read_route_lines(Path("/proc/net/route"), has_header=True)
    # Unlike /proc/net/route, /proc/net/ipv6_route has no header row.
    ipv6_routes = _read_route_lines(Path("/proc/net/ipv6_route"), has_header=False)
    non_loopback_v4 = tuple(
        line for line in ipv4_routes if line.split()[0] != "lo"
    )
    non_loopback_v6 = tuple(
        line for line in ipv6_routes if line.split()[-1] != "lo"
    )
    if non_loopback_v4 or non_loopback_v6:
        raise ContractViolation(
            "network-route-present",
            "network-disabled runtime contains a non-loopback route",
            details={"ipv4": non_loopback_v4, "ipv6": non_loopback_v6},
        )
    present_escape_sockets: list[str] = []
    for candidate in KNOWN_ESCAPE_SOCKETS:
        try:
            if stat.S_ISSOCK(os.stat(candidate).st_mode):
                present_escape_sockets.append(candidate)
        except FileNotFoundError:
            continue
        except OSError as error:
            raise ContractViolation(
                "network-proof-unavailable", f"cannot inspect {candidate}: {error}"
            ) from error
    if present_escape_sockets:
        raise ContractViolation(
            "escape-socket-present",
            "host-control socket mounted into inference runtime",
            details=present_escape_sockets,
        )
    probes = (
        _probe_unreachable(socket.AF_INET, ("192.0.2.1", 9)),
        _probe_unreachable(socket.AF_INET6, ("2001:db8::1", 9, 0, 0)),
    )
    return NetworkProof(
        egress_disabled=True,
        network_namespace=network_namespace,
        effective_capabilities=f"0x{effective_capabilities}",
        interfaces=interfaces,
        ipv4_routes=ipv4_routes,
        ipv6_routes=ipv6_routes,
        probes=probes,
        escape_sockets_absent=True,
        method=(
            "isolated Linux network namespace; loopback-only interface set; "
            "no non-loopback IPv4/IPv6 route; TEST-NET probes rejected; "
            "known host-control sockets absent"
        ),
    )


def require_installed_distribution(model: str) -> dict[str, str]:
    try:
        distribution_name, expected_version = EXPECTED_DISTRIBUTIONS[model]
    except KeyError as error:
        raise ContractViolation("model-invalid", f"unsupported model {model!r}") from error
    try:
        actual_version = importlib.metadata.version(distribution_name)
    except importlib.metadata.PackageNotFoundError as error:
        raise ContractViolation(
            "package-not-installed", f"{distribution_name} is not installed"
        ) from error
    if actual_version != expected_version:
        raise ContractViolation(
            "package-version-mismatch",
            f"expected {distribution_name}=={expected_version}, found {actual_version}",
        )
    return {"name": distribution_name, "version": actual_version}


def collect_installed_distributions() -> tuple[list[dict[str, str]], str]:
    by_name: dict[str, str] = {}
    for distribution in importlib.metadata.distributions():
        name = distribution.metadata.get("Name")
        if name:
            by_name[name.lower().replace("_", "-")] = distribution.version
    records = [
        {"name": name, "version": by_name[name]} for name in sorted(by_name)
    ]
    return records, sha256_json(records)


def optional_provenance() -> dict[str, Any]:
    """Capture honest lock/container provenance without inventing absent values."""

    lock_path_raw = os.environ.get("TAILING_ATOMISTIC_LOCK_PATH")
    lock_record: dict[str, Any] | None = None
    if lock_path_raw:
        lock_path = _canonical_existing_file(lock_path_raw, "environment lock")
        lock_record = {
            "path": str(lock_path),
            "sizeBytes": lock_path.stat().st_size,
            "sha256": f"sha256:{sha256_file(lock_path)}",
        }
    container_digest = os.environ.get("TAILING_ATOMISTIC_CONTAINER_DIGEST")
    if container_digest and not CONTAINER_DIGEST_RE.fullmatch(container_digest):
        raise ContractViolation(
            "container-digest-invalid",
            "TAILING_ATOMISTIC_CONTAINER_DIGEST must be sha256:<64 lowercase hex>",
        )
    complete = lock_record is not None and container_digest is not None
    return {
        "environmentLock": lock_record,
        "containerImageDigest": container_digest,
        "complete": complete,
        "promotionEligible": complete,
        "note": (
            "lock and immutable container digest recorded"
            if complete
            else "bootstrap evidence only: a real hash lock and/or immutable container digest is absent"
        ),
    }


def merkle_root(records: Iterable[tuple[str, bytes]]) -> str:
    """Merkle-root canonical records sorted by ID, duplicating an odd last leaf."""

    ordered = sorted(records, key=lambda item: item[0])
    if not ordered:
        raise ContractViolation("merkle-empty", "cannot Merkle-root zero records")
    identifiers = [identifier for identifier, _ in ordered]
    if len(set(identifiers)) != len(identifiers):
        raise ContractViolation("merkle-duplicate", "duplicate record ID in Merkle input")
    level = [hashlib.sha256(payload).digest() for _, payload in ordered]
    while len(level) > 1:
        if len(level) % 2:
            level.append(level[-1])
        level = [
            hashlib.sha256(level[index] + level[index + 1]).digest()
            for index in range(0, len(level), 2)
        ]
    return f"sha256:{level[0].hex()}"


def clean_partial_outputs(output_directory: Path) -> None:
    for entry in output_directory.iterdir():
        if entry.name.endswith(".partial") or ".partial." in entry.name:
            try:
                entry.unlink()
            except FileNotFoundError:
                pass


def public_error(error: BaseException) -> dict[str, Any]:
    record: dict[str, Any] = {
        "type": type(error).__name__,
        "message": str(error),
    }
    if isinstance(error, ContractViolation):
        record["code"] = error.code
        if error.details is not None:
            record["details"] = error.details
    return record


def ensure_keys(mapping: Mapping[str, Any], keys: Iterable[str], label: str) -> None:
    missing = [key for key in keys if key not in mapping]
    if missing:
        raise ContractViolation(
            "manifest-incomplete", f"{label} is missing keys: {missing}"
        )
