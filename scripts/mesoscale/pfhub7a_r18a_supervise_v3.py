#!/usr/bin/env python3
"""Fail-closed private-runtime supervisor for the R18a FiPy preflight v3 successor."""

from __future__ import annotations

import argparse
import ast
import copy
import ctypes
import errno
import hashlib
import io
import json
import math
import os
from pathlib import Path, PurePosixPath
import platform
import selectors
import shutil
import signal
import stat
import subprocess
import sys
import tempfile
import time
import unicodedata
import zipfile


SPEC_PATH = Path("evaluation/mesoscale/preregistrations/pfhub7a-r18a-independent-solver-preflight-v4-resolved.json")
SPEC_SIZE = 20908
SPEC_DIGEST = "sha256:7f2a5bb819f9ebdedd8eb038e8c3c924c3d547593793da374021e3c04869e253"
LOCK_PATH = Path("evaluation/mesoscale/dependencies/pfhub7a-r18a-fipy/runtime-lock-v1.json")
LOCK_SIZE = 7411
LOCK_DIGEST = "sha256:cd7f8e8a47d67596c025a8035890e99f5a367be562289e84ae4f6d87e79c08ee"
WORKER_PATH = Path("scripts/mesoscale/pfhub7a_r18a_worker.py")
ORACLE_PATH = Path("scripts/mesoscale/pfhub7a_r18a_oracle.py")
RECEIPT_SCHEMA_VERSION = "tf.pfhub7a-r18a-preflight-receipt/0.3"
CANDIDATE_ID = "pfhub7a-r18a-independent-solver-semantic-runtime-preflight-v4-successor-v3"
REQUIRED_ENVIRONMENT = {
    "LANG": "C",
    "LC_ALL": "C",
    "TZ": "UTC",
    "FIPY_SOLVERS": "scipy",
    "OMP_NUM_THREADS": "1",
    "OPENBLAS_NUM_THREADS": "1",
    "MKL_NUM_THREADS": "1",
    "VECLIB_MAXIMUM_THREADS": "1",
    "NUMEXPR_NUM_THREADS": "1",
}
CHILD_TIMEOUT_SECONDS = 30.0
CHILD_STDOUT_LIMIT = 1024 * 1024
CHILD_STDERR_LIMIT = 64 * 1024


class GateFailure(RuntimeError):
    def __init__(self, code: str, detail: str):
        super().__init__(detail)
        self.code = code
        self.detail = detail


def require(condition: bool, code: str, detail: str) -> None:
    if not condition:
        raise GateFailure(code, detail)


def sha256_bytes(payload: bytes) -> str:
    return "sha256:" + hashlib.sha256(payload).hexdigest()


def read_regular_file(path: Path) -> bytes:
    require(not path.is_symlink(), "SYMLINK", "a required regular file is a symlink")
    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
    descriptor = os.open(path, flags)
    try:
        metadata = os.fstat(descriptor)
        require(stat.S_ISREG(metadata.st_mode), "FILE_TYPE", "a required input is not regular")
        chunks: list[bytes] = []
        while chunk := os.read(descriptor, 1024 * 1024):
            chunks.append(chunk)
        payload = b"".join(chunks)
        require(len(payload) == metadata.st_size, "INPUT_MUTATION", "input size changed while reading")
        return payload
    finally:
        os.close(descriptor)


def strict_json(payload: bytes, label: str) -> object:
    try:
        text = payload.decode("utf-8", errors="strict")
    except UnicodeDecodeError as error:
        raise GateFailure("JSON_UTF8", f"{label} is not UTF-8") from error

    def pairs_hook(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise GateFailure("JSON_DUPLICATE_KEY", f"{label} contains duplicate key {key!r}")
            result[key] = value
        return result

    try:
        value = json.loads(
            text,
            object_pairs_hook=pairs_hook,
            parse_constant=lambda token: (_ for _ in ()).throw(GateFailure("JSON_NONFINITE", f"{label} contains {token}")),
        )
    except GateFailure:
        raise
    except (json.JSONDecodeError, UnicodeError) as error:
        raise GateFailure("JSON_SYNTAX", f"{label} is invalid JSON") from error
    return value


def canonical_records(records: list[dict[str, object]]) -> bytes:
    return json.dumps(records, ensure_ascii=True, allow_nan=False, separators=(",", ":")).encode("utf-8")


def file_record(path: Path, logical_path: str) -> dict[str, object]:
    payload = read_regular_file(path)
    return {"byteSize": len(payload), "path": logical_path, "rawDigest": sha256_bytes(payload)}


def source_closure(source_root: Path) -> tuple[list[dict[str, object]], dict[str, Path]]:
    require(source_root.is_absolute(), "PYTHON_SOURCE", "Python source root must be absolute")
    selected: dict[str, Path] = {}
    executable = source_root / "bin/python3.12"
    selected["bin/python3.12"] = executable
    library = source_root / "lib/python3.12"
    require(library.is_dir() and not library.is_symlink(), "PYTHON_SOURCE", "Python library root is unavailable")
    for root, directory_names, file_names in os.walk(library, topdown=True, followlinks=False):
        root_path = Path(root)
        for directory_name in tuple(directory_names):
            candidate = root_path / directory_name
            relative = candidate.relative_to(source_root)
            if candidate.is_symlink():
                raise GateFailure("PYTHON_SOURCE_SYMLINK", "Python source selection contains a directory symlink")
            if directory_name in {"site-packages", "__pycache__"}:
                directory_names.remove(directory_name)
                continue
            require("site-packages" not in relative.parts and "__pycache__" not in relative.parts, "PYTHON_SOURCE_SELECTION", "excluded directory entered selection")
        for file_name in file_names:
            candidate = root_path / file_name
            relative = candidate.relative_to(source_root)
            if candidate.suffix in {".pyc", ".pyo"} or "site-packages" in relative.parts or "__pycache__" in relative.parts:
                continue
            if candidate.is_symlink():
                raise GateFailure("PYTHON_SOURCE_SYMLINK", "Python source selection contains a file symlink")
            require(candidate.is_file(), "PYTHON_SOURCE_TYPE", "Python source selection contains a non-regular file")
            selected[relative.as_posix()] = candidate
    records = [file_record(selected[path], path) for path in sorted(selected, key=lambda item: item.encode("utf-8"))]
    return records, selected


def validate_closure(records: list[dict[str, object]], expected: dict[str, object], code: str) -> None:
    require(len(records) == expected["recordCount"], code, "closure record count mismatch")
    require(sum(int(record["byteSize"]) for record in records) == expected["byteSize"], code, "closure byte size mismatch")
    require(sha256_bytes(canonical_records(records)) == expected["recordsDigest"], code, "closure records digest mismatch")


def safe_wheel_members(wheel_payload: bytes, destination_prefix: str) -> list[tuple[str, bytes]]:
    members: list[tuple[str, bytes]] = []
    collision_keys: set[str] = set()
    with zipfile.ZipFile(io.BytesIO(wheel_payload)) as archive:
        for info in archive.infolist():
            raw_name = info.filename
            require("\\" not in raw_name and "\x00" not in raw_name, "WHEEL_PATH", "wheel member has an unsafe name")
            normalized_name = raw_name[:-1] if info.is_dir() and raw_name.endswith("/") else raw_name
            member_path = PurePosixPath(normalized_name)
            require(not member_path.is_absolute() and normalized_name == member_path.as_posix(), "WHEEL_PATH", "wheel member path is not normalized")
            require(all(part not in {"", ".", ".."} for part in member_path.parts), "WHEEL_PATH", "wheel member path escapes extraction root")
            unix_mode = info.external_attr >> 16
            file_type = stat.S_IFMT(unix_mode)
            require(file_type not in {stat.S_IFLNK, stat.S_IFCHR, stat.S_IFBLK, stat.S_IFIFO, stat.S_IFSOCK}, "WHEEL_TYPE", "wheel member has a forbidden type")
            if info.is_dir():
                continue
            require(file_type in {0, stat.S_IFREG}, "WHEEL_TYPE", "wheel member is not regular")
            logical_path = destination_prefix + raw_name
            collision_key = unicodedata.normalize("NFC", logical_path).casefold()
            require(collision_key not in collision_keys, "WHEEL_DUPLICATE", "wheel members collide after filesystem normalization")
            collision_keys.add(collision_key)
            members.append((logical_path, archive.read(info)))
    return members


def wheel_closure(lock: dict[str, object], wheelhouse: Path) -> tuple[list[dict[str, object]], dict[str, bytes]]:
    require(wheelhouse.is_absolute() and wheelhouse.is_dir() and not wheelhouse.is_symlink(), "WHEELHOUSE", "wheelhouse must be an absolute regular directory")
    extracted: dict[str, bytes] = {}
    for distribution in lock["wheelhouse"]["distributions"]:
        filename = distribution["filename"]
        require(Path(filename).name == filename, "WHEEL_NAME", "locked wheel filename is unsafe")
        payload = read_regular_file(wheelhouse / filename)
        require(len(payload) == distribution["byteSize"] and sha256_bytes(payload) == distribution["rawDigest"], "WHEEL_IDENTITY", "wheel identity mismatch")
        for logical_path, member_payload in safe_wheel_members(payload, lock["wheelhouse"]["expandedClosure"]["destinationPrefix"]):
            require(logical_path not in extracted, "WHEEL_DUPLICATE", "duplicate expanded wheel path")
            extracted[logical_path] = member_payload
    records = [
        {"byteSize": len(extracted[path]), "path": path, "rawDigest": sha256_bytes(extracted[path])}
        for path in sorted(extracted, key=lambda item: item.encode("utf-8"))
    ]
    return records, extracted


def materialized_closure(runtime_root: Path) -> list[dict[str, object]]:
    require(not runtime_root.is_symlink() and runtime_root.is_dir(), "RUNTIME_TYPE", "runtime root is not a regular directory")
    require(stat.S_IMODE(runtime_root.stat().st_mode) == 0o555, "RUNTIME_MODE", "runtime root is not sealed 0555")
    records: list[dict[str, object]] = []
    for root, directory_names, file_names in os.walk(runtime_root, topdown=True, followlinks=False):
        root_path = Path(root)
        for name in directory_names:
            candidate = root_path / name
            require(not candidate.is_symlink() and candidate.is_dir(), "RUNTIME_TYPE", "runtime contains a non-directory or symlink")
            require(stat.S_IMODE(candidate.stat().st_mode) == 0o555, "RUNTIME_MODE", "runtime directory is not sealed 0555")
        for name in file_names:
            candidate = root_path / name
            relative = candidate.relative_to(runtime_root).as_posix()
            expected_mode = 0o555 if relative == "bin/python3.12" else 0o444
            require(not candidate.is_symlink() and candidate.is_file(), "RUNTIME_TYPE", "runtime contains a non-regular file or symlink")
            require(stat.S_IMODE(candidate.stat().st_mode) == expected_mode, "RUNTIME_MODE", "runtime file mode is not sealed")
            records.append(file_record(candidate, relative))
    records.sort(key=lambda record: str(record["path"]).encode("utf-8"))
    return records


def write_materialized_file(stage: Path, logical_path: str, payload: bytes, executable: bool = False) -> None:
    destination = stage / logical_path
    destination.parent.mkdir(parents=True, exist_ok=True)
    require(destination.resolve().is_relative_to(stage.resolve()), "MATERIALIZE_PATH", "materialized destination escaped stage")
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0)
    descriptor = os.open(destination, flags, 0o700 if executable else 0o600)
    try:
        offset = 0
        while offset < len(payload):
            offset += os.write(descriptor, payload[offset:])
        os.fsync(descriptor)
    finally:
        os.close(descriptor)
    os.chmod(destination, 0o555 if executable else 0o444, follow_symlinks=False)


def rename_no_replace(source: Path, destination: Path) -> None:
    """Darwin rename with RENAME_EXCL; never replace an existing capsule."""

    library = ctypes.CDLL(None, use_errno=True)
    renamex = library.renamex_np
    renamex.argtypes = [ctypes.c_char_p, ctypes.c_char_p, ctypes.c_uint]
    renamex.restype = ctypes.c_int
    result = renamex(os.fsencode(source), os.fsencode(destination), 0x00000004)
    if result != 0:
        error_number = ctypes.get_errno()
        raise OSError(error_number, os.strerror(error_number), destination)


def private_runtime_parent(repo_root: Path, relative: PurePosixPath) -> Path:
    """Create a private in-repository directory while rejecting symlink ancestors."""

    require(not relative.is_absolute(), "RUNTIME_PARENT", "private runtime path must be relative")
    require(
        all(part not in {"", ".", ".."} for part in relative.parts),
        "RUNTIME_PARENT",
        "private runtime path is not normalized",
    )
    resolved_repository = repo_root.resolve(strict=True)
    current = resolved_repository
    for part in relative.parts:
        current = current / part
        try:
            current.mkdir(mode=0o700)
        except FileExistsError:
            pass
        metadata = current.lstat()
        require(
            stat.S_ISDIR(metadata.st_mode) and not stat.S_ISLNK(metadata.st_mode),
            "RUNTIME_PARENT",
            "private runtime ancestor is not a real directory",
        )
        require(
            current.resolve(strict=True).is_relative_to(resolved_repository),
            "RUNTIME_PARENT",
            "private runtime ancestor escaped the repository",
        )
        os.chmod(current, 0o700, follow_symlinks=False)
        require(
            stat.S_IMODE(current.stat(follow_symlinks=False).st_mode) == 0o700,
            "RUNTIME_PARENT",
            "private runtime ancestor is not mode 0700",
        )
    return current


def materialize(repo_root: Path, source_root: Path, wheelhouse: Path, lock: dict[str, object]) -> tuple[Path, list[dict[str, object]]]:
    source_records, source_paths = source_closure(source_root)
    validate_closure(source_records, lock["bootstrapSource"]["canonicalClosure"], "PYTHON_CLOSURE")
    executable_record = next(record for record in source_records if record["path"] == "bin/python3.12")
    require(
        executable_record["byteSize"] == lock["bootstrapSource"]["pythonExecutable"]["byteSize"]
        and executable_record["rawDigest"] == lock["bootstrapSource"]["pythonExecutable"]["rawDigest"],
        "PYTHON_EXECUTABLE",
        "Python executable identity mismatch",
    )
    wheel_records, wheel_payloads = wheel_closure(lock, wheelhouse)
    validate_closure(wheel_records, lock["wheelhouse"]["expandedClosure"], "WHEEL_CLOSURE")
    combined_expected = sorted(source_records + wheel_records, key=lambda record: str(record["path"]).encode("utf-8"))
    validate_closure(combined_expected, lock["combinedClosure"], "COMBINED_CLOSURE")
    address = LOCK_DIGEST.split(":", 1)[1]
    parent = private_runtime_parent(repo_root, PurePosixPath(".tf-runtime/pfhub7a-r18a"))
    runtime_root = parent / address
    require(not parent.is_symlink() and parent.is_dir(), "RUNTIME_PARENT", "runtime parent is not a regular directory")
    require(stat.S_IMODE(parent.stat().st_mode) == 0o700, "RUNTIME_PARENT", "runtime parent is not private 0700")
    if runtime_root.exists():
        actual = materialized_closure(runtime_root)
        require(actual == combined_expected, "RUNTIME_MUTATION", "existing content-addressed runtime does not match lock")
        return runtime_root, actual
    stage = Path(tempfile.mkdtemp(prefix=".stage-", dir=parent))
    try:
        for logical_path, source_path in source_paths.items():
            write_materialized_file(stage, logical_path, read_regular_file(source_path), logical_path == "bin/python3.12")
        for logical_path, payload in wheel_payloads.items():
            write_materialized_file(stage, logical_path, payload)
        for root, directory_names, _ in os.walk(stage, topdown=False):
            for name in directory_names:
                os.chmod(Path(root) / name, 0o555, follow_symlinks=False)
        os.chmod(stage, 0o555, follow_symlinks=False)
        actual = materialized_closure(stage)
        require(actual == combined_expected, "RUNTIME_MATERIALIZATION", "staged runtime closure mismatch")
        try:
            rename_no_replace(stage, runtime_root)
        except OSError as error:
            if error.errno != errno.EEXIST:
                raise
            concurrent = materialized_closure(runtime_root)
            require(concurrent == combined_expected, "RUNTIME_CONCURRENCY", "concurrently installed runtime differs from lock")
            for root, directory_names, _ in os.walk(stage, topdown=False):
                for name in directory_names:
                    os.chmod(Path(root) / name, 0o700, follow_symlinks=False)
            os.chmod(stage, 0o700, follow_symlinks=False)
            shutil.rmtree(stage)
    except Exception:
        for root, directory_names, file_names in os.walk(stage, topdown=False):
            for name in file_names:
                os.chmod(Path(root) / name, 0o600, follow_symlinks=False)
            for name in directory_names:
                os.chmod(Path(root) / name, 0o700, follow_symlinks=False)
        if stage.exists():
            os.chmod(stage, 0o700, follow_symlinks=False)
            shutil.rmtree(stage)
        raise
    return runtime_root, materialized_closure(runtime_root)


def dotted_ast_name(node: ast.AST) -> str | None:
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        parent = dotted_ast_name(node.value)
        return f"{parent}.{node.attr}" if parent is not None else None
    return None


def verify_oracle_source_payload(payload: bytes) -> None:
    tree = ast.parse(payload.decode("utf-8"), filename="$ORACLE")
    allowed_imports = {
        "hashlib": None,
        "json": None,
        "math": None,
        "struct": None,
        "sys": None,
        "numpy": "np",
    }
    allowed_direct_calls = {
        "RuntimeError",
        "SystemExit",
        "ValueError",
        "alpha",
        "assemble_dense",
        "boundary_values",
        "canonical_digest",
        "cell_centres",
        "float",
        "float64_digest",
        "main",
        "manufactured_field",
        "manufactured_source",
        "range",
        "run_track",
        "tuple",
    }
    expected_functions = {
        "alpha",
        "assemble_dense",
        "boundary_values",
        "canonical_digest",
        "cell_centres",
        "float64_digest",
        "main",
        "manufactured_field",
        "manufactured_source",
        "run_track",
    }
    allowed_dotted_calls = {
        "hashlib.sha256",
        "json.dumps",
        "math.sqrt",
        "np.arange",
        "np.array",
        "np.asarray",
        "np.cosh",
        "np.cos",
        "np.full",
        "np.linalg.solve",
        "np.meshgrid",
        "np.ones",
        "np.sin",
        "np.tanh",
        "np.zeros",
        "struct.pack",
        "sys.stdout.write",
    }
    allowed_method_calls = {
        "append",
        "encode",
        "hexdigest",
        "join",
        "lower",
        "reshape",
        "startswith",
        "tolist",
    }
    protected_names = allowed_direct_calls | set(allowed_imports.values()) | set(allowed_imports)
    protected_names.discard(None)
    module_functions = [node for node in tree.body if isinstance(node, ast.FunctionDef)]
    all_functions = [node for node in ast.walk(tree) if isinstance(node, ast.FunctionDef)]
    require(
        len(module_functions) == len(all_functions)
        and len(module_functions) == len(expected_functions)
        and {node.name for node in module_functions} == expected_functions,
        "ORACLE_STATIC_STRUCTURE",
        "oracle function definitions must be the exact registered module-level set",
    )
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            require(node.col_offset == 0, "ORACLE_STATIC_IMPORT", "oracle import must be module-level")
            require(
                all(
                    alias.name in allowed_imports
                    and alias.asname == allowed_imports[alias.name]
                    for alias in node.names
                ),
                "ORACLE_STATIC_IMPORT",
                "oracle imports an unregistered dependency or alias",
            )
        elif isinstance(node, ast.ImportFrom):
            require(
                node.col_offset == 0
                and node.module == "__future__"
                and [(alias.name, alias.asname) for alias in node.names]
                == [("annotations", None)],
                "ORACLE_STATIC_IMPORT",
                "oracle contains an unregistered from-import",
            )
        elif isinstance(node, ast.Call):
            dotted = dotted_ast_name(node.func)
            if isinstance(node.func, ast.Name):
                allowed = node.func.id in allowed_direct_calls
            elif isinstance(node.func, ast.Attribute):
                allowed = (
                    dotted in allowed_dotted_calls
                    or node.func.attr in allowed_method_calls
                )
            else:
                allowed = False
            require(
                allowed,
                "ORACLE_STATIC_CALL",
                f"oracle call is not positively allowlisted: {ast.unparse(node.func)}",
            )
        elif isinstance(node, ast.Subscript):
            require(
                dotted_ast_name(node.value) != "sys.modules",
                "ORACLE_STATIC_CALL",
                "oracle may not retrieve callable objects through sys.modules",
            )
        elif isinstance(node, (ast.AsyncFunctionDef, ast.ClassDef, ast.Lambda)):
            raise GateFailure(
                "ORACLE_STATIC_STRUCTURE",
                "oracle may not define async functions, classes, or lambdas",
            )
        elif isinstance(node, ast.arg):
            require(
                node.arg not in protected_names,
                "ORACLE_STATIC_REBIND",
                "oracle may not shadow a protected callable or import with an argument",
            )
        elif isinstance(node, ast.Attribute):
            require(
                isinstance(node.ctx, ast.Load) and not node.attr.startswith("__"),
                "ORACLE_STATIC_REBIND",
                "oracle may not mutate attributes or access dunder attributes",
            )
        elif isinstance(node, ast.Name):
            require(
                node.id
                not in {
                    "__builtins__",
                    "__import__",
                    "breakpoint",
                    "compile",
                    "eval",
                    "exec",
                    "getattr",
                    "globals",
                    "input",
                    "locals",
                    "open",
                    "setattr",
                    "vars",
                },
                "ORACLE_STATIC_CALL",
                "oracle contains a forbidden builtin capability",
            )
            if isinstance(node.ctx, (ast.Store, ast.Del)):
                require(
                    node.id not in protected_names,
                    "ORACLE_STATIC_REBIND",
                    "oracle may not rebind a protected callable or import",
                )
        elif isinstance(node, (ast.Global, ast.Nonlocal)):
            require(
                not set(node.names).intersection(protected_names),
                "ORACLE_STATIC_REBIND",
                "oracle may not declare a protected callable or import global/nonlocal",
            )


def verify_oracle_source(path: Path) -> dict[str, object]:
    payload = read_regular_file(path)
    verify_oracle_source_payload(payload)
    return {"path": "$ORACLE", "byteSize": len(payload), "rawDigest": sha256_bytes(payload), "staticRestrictionPassed": True}


def verify_worker_source_payload(payload: bytes) -> None:
    tree = ast.parse(payload.decode("utf-8"), filename="$WORKER")
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            require(all("r17" not in alias.name.lower() for alias in node.names), "WORKER_STATIC", "worker imports an R17 module")
        elif isinstance(node, ast.ImportFrom) and node.module is not None:
            require("r17" not in node.module.lower(), "WORKER_STATIC", "worker imports an R17 module")

    reaction_assignments = [
        node
        for node in ast.walk(tree)
        if isinstance(node, ast.Assign)
        and any(isinstance(target, ast.Name) and target.id == "reaction" for target in node.targets)
    ]
    expected_reaction = ast.parse(
        "-4.0 * eta.old * (eta.old - 1.0) * (eta.old - 0.5)", mode="eval"
    ).body
    require(
        len(reaction_assignments) == 1
        and ast.dump(reaction_assignments[0].value, include_attributes=False)
        == ast.dump(expected_reaction, include_attributes=False),
        "WORKER_REACTION_TIME_LEVEL",
        "worker reaction must use the immutable eta.old field at time n",
    )

    source_calls = [
        node
        for node in ast.walk(tree)
        if isinstance(node, ast.Call)
        and isinstance(node.func, ast.Name)
        and node.func.id == "manufactured_source"
    ]
    require(
        len(source_calls) == 1
        and len(source_calls[0].args) == 4
        and isinstance(source_calls[0].args[3], ast.Name)
        and source_calls[0].args[3].id == "time_old",
        "WORKER_SOURCE_TIME_LEVEL",
        "worker manufactured source must be evaluated at time n",
    )

    boundary_calls = [
        node
        for node in ast.walk(tree)
        if isinstance(node, ast.Call)
        and isinstance(node.func, ast.Name)
        and node.func.id == "boundary_values"
    ]
    require(
        len(boundary_calls) == 1
        and len(boundary_calls[0].args) == 4
        and isinstance(boundary_calls[0].args[3], ast.Name)
        and boundary_calls[0].args[3].id == "time_new",
        "WORKER_BOUNDARY_TIME_LEVEL",
        "worker exact-trace boundary values must be evaluated at time n+1",
    )


def verify_worker_source(path: Path) -> None:
    verify_worker_source_payload(read_regular_file(path))


def candidate_snapshot(repo_root: Path) -> tuple[Path, dict[str, bytes], list[dict[str, object]]]:
    source_paths = {"oracle.py": repo_root / ORACLE_PATH, "worker.py": repo_root / WORKER_PATH}
    payloads = {name: read_regular_file(path) for name, path in source_paths.items()}
    records = [
        {"byteSize": len(payloads[name]), "path": name, "rawDigest": sha256_bytes(payloads[name])}
        for name in sorted(payloads, key=lambda value: value.encode("utf-8"))
    ]
    address = hashlib.sha256(canonical_records(records)).hexdigest()
    parent = private_runtime_parent(
        repo_root,
        PurePosixPath(".tf-runtime/pfhub7a-r18a/candidates"),
    )
    require(not parent.is_symlink() and parent.is_dir(), "CANDIDATE_SNAPSHOT", "candidate snapshot parent is not a regular directory")
    os.chmod(parent, 0o700, follow_symlinks=False)
    snapshot = parent / address

    def validate() -> None:
        require(not snapshot.is_symlink() and snapshot.is_dir(), "CANDIDATE_SNAPSHOT", "candidate snapshot is not a regular directory")
        require(stat.S_IMODE(snapshot.stat().st_mode) == 0o555, "CANDIDATE_SNAPSHOT", "candidate snapshot root is not sealed")
        require(set(item.name for item in snapshot.iterdir()) == set(payloads), "CANDIDATE_SNAPSHOT", "candidate snapshot members differ")
        for name, payload in payloads.items():
            member = snapshot / name
            require(stat.S_IMODE(member.stat().st_mode) == 0o444, "CANDIDATE_SNAPSHOT", "candidate source is not sealed read-only")
            require(read_regular_file(member) == payload, "CANDIDATE_SNAPSHOT", "candidate source snapshot digest mismatch")

    if snapshot.exists():
        validate()
        return snapshot, payloads, records
    stage = Path(tempfile.mkdtemp(prefix=".candidate-stage-", dir=parent))
    try:
        for name, payload in payloads.items():
            write_materialized_file(stage, name, payload)
        os.chmod(stage, 0o555, follow_symlinks=False)
        try:
            rename_no_replace(stage, snapshot)
        except OSError as error:
            if error.errno != errno.EEXIST:
                raise
            os.chmod(stage, 0o700, follow_symlinks=False)
            shutil.rmtree(stage)
        validate()
    except Exception:
        if stage.exists():
            os.chmod(stage, 0o700, follow_symlinks=False)
            shutil.rmtree(stage)
        raise
    return snapshot, payloads, records


def child_environment() -> dict[str, str]:
    return dict(REQUIRED_ENVIRONMENT)


def terminate_process_group(process: subprocess.Popen) -> None:
    try:
        os.killpg(process.pid, signal.SIGTERM)
    except (ProcessLookupError, PermissionError):
        pass
    deadline = time.monotonic() + 0.5
    while time.monotonic() < deadline:
        try:
            os.killpg(process.pid, 0)
        except (ProcessLookupError, PermissionError):
            break
        time.sleep(0.01)
    try:
        os.killpg(process.pid, signal.SIGKILL)
    except (ProcessLookupError, PermissionError):
        pass
    if process.poll() is None:
        try:
            process.wait(timeout=0.5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()


def require_empty_process_group_after_success(process: subprocess.Popen) -> None:
    """Reject and reap descendants that outlive a successful group leader."""

    try:
        os.killpg(process.pid, 0)
    except ProcessLookupError:
        return
    except PermissionError as error:
        terminate_process_group(process)
        raise GateFailure(
            "CHILD_DESCENDANT",
            "unable to prove the successful child process group is empty",
        ) from error
    terminate_process_group(process)
    raise GateFailure(
        "CHILD_DESCENDANT",
        "successful child leader left a live descendant in its process group",
    )


def run_bounded_process(command: list[str], cwd: Path, environment: dict[str, str]) -> tuple[int, bytes, bytes]:
    process = subprocess.Popen(
        command,
        cwd=cwd,
        env=environment,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        start_new_session=True,
    )
    require(process.stdout is not None and process.stderr is not None, "CHILD_LIFECYCLE", "child pipes unavailable")
    selector = selectors.DefaultSelector()
    selector.register(process.stdout, selectors.EVENT_READ, ("stdout", CHILD_STDOUT_LIMIT))
    selector.register(process.stderr, selectors.EVENT_READ, ("stderr", CHILD_STDERR_LIMIT))
    chunks: dict[str, list[bytes]] = {"stdout": [], "stderr": []}
    sizes = {"stdout": 0, "stderr": 0}
    deadline = time.monotonic() + CHILD_TIMEOUT_SECONDS
    try:
        while selector.get_map():
            remaining = deadline - time.monotonic()
            if remaining <= 0.0:
                raise GateFailure("CHILD_TIMEOUT", "child exceeded the 30 second deadline")
            events = selector.select(timeout=min(remaining, 0.25))
            for key, _ in events:
                stream_name, limit = key.data
                chunk = os.read(key.fd, 65536)
                if not chunk:
                    selector.unregister(key.fileobj)
                    continue
                sizes[stream_name] += len(chunk)
                if sizes[stream_name] > limit:
                    raise GateFailure("CHILD_OUTPUT_LIMIT", f"child {stream_name} exceeded its frozen byte ceiling")
                chunks[stream_name].append(chunk)
        remaining = deadline - time.monotonic()
        if remaining <= 0.0:
            raise GateFailure("CHILD_TIMEOUT", "child exceeded the 30 second deadline")
        return_code = process.wait(timeout=remaining)
        require_empty_process_group_after_success(process)
    except Exception:
        terminate_process_group(process)
        raise
    finally:
        selector.close()
        process.stdout.close()
        process.stderr.close()
    return return_code, b"".join(chunks["stdout"]), b"".join(chunks["stderr"])


def run_child(runtime_root: Path, script: Path, arguments: list[str], repo_root: Path) -> dict[str, object]:
    command = [str(runtime_root / "bin/python3.12"), "-I", "-B", "-W", "error", str(script), *arguments]
    return_code, stdout, stderr = run_bounded_process(command, repo_root, child_environment())
    require(not stderr, "CHILD_STDERR", "child emitted stderr")
    result = strict_json(stdout, "$CHILD_STDOUT")
    require(stdout == emit(result), "CHILD_CANONICAL_JSON", "child output is not canonical JSON")
    reason = result.get("reasonCode", "unknown") if isinstance(result, dict) else "invalid"
    require(return_code == 0 and isinstance(result, dict) and result.get("status") == "pass", "CHILD_ABSTENTION", f"child abstained with reason {reason}")
    return result


def run_expected_abstention(
    runtime_root: Path,
    script: Path,
    arguments: list[str],
    repo_root: Path,
    expected_reason: str,
) -> dict[str, object]:
    command = [str(runtime_root / "bin/python3.12"), "-I", "-B", "-W", "error", str(script), *arguments]
    return_code, stdout, stderr = run_bounded_process(command, repo_root, child_environment())
    require(not stderr, "NEGATIVE_PROBE_STDERR", "negative probe emitted stderr")
    result = strict_json(stdout, "$NEGATIVE_PROBE_STDOUT")
    require(stdout == emit(result), "NEGATIVE_PROBE_JSON", "negative probe output is not canonical JSON")
    require(
        return_code != 0
        and isinstance(result, dict)
        and result.get("status") == "abstain"
        and result.get("reasonCode") == expected_reason,
        "NEGATIVE_PROBE_RESULT",
        "negative probe did not produce the registered machine abstention",
    )
    return {"status": "expected-abstention", "reasonCode": expected_reason}


def maximum_absolute_difference(left: object, right: object) -> float:
    require(isinstance(left, list) and isinstance(right, list) and len(left) == len(right), "ORACLE_SHAPE", "oracle comparison shape mismatch")
    maximum = 0.0
    for left_value, right_value in zip(left, right):
        if isinstance(left_value, list) or isinstance(right_value, list):
            maximum = max(maximum, maximum_absolute_difference(left_value, right_value))
        else:
            difference = abs(float(left_value) - float(right_value))
            require(math.isfinite(difference), "ORACLE_NONFINITE", "oracle comparison is non-finite")
            maximum = max(maximum, difference)
    return maximum


def validate_worker_result(worker: dict[str, object]) -> None:
    require(worker.get("schemaVersion") == "tf.pfhub7a-r18a-worker-result/0.1" and worker.get("status") == "pass", "WORKER_SCHEMA", "worker result identity mismatch")
    runtime = worker.get("runtime")
    require(isinstance(runtime, dict), "WORKER_SCHEMA", "worker runtime observation is absent")
    versions = runtime.get("versions")
    require(
        versions == {
            "python": "3.12.14",
            "fipy": "4.0.3",
            "numpy": "2.5.3",
            "scipy": "1.18.1",
            "packaging": "26.3",
            "solverSuite": "scipy",
        },
        "WORKER_VERSION",
        "worker version tuple differs from the runtime lock",
    )
    require(runtime.get("prefix") == "$RUNTIME" and runtime.get("basePrefix") == "$RUNTIME", "WORKER_PREFIX", "worker prefix observation differs")
    require(runtime.get("executable") == "$RUNTIME/bin/python3.12", "WORKER_PREFIX", "worker executable observation differs")
    require(
        runtime.get("searchPath") == [
            "$RUNTIME/lib/python312.zip",
            "$RUNTIME/lib/python3.12",
            "$RUNTIME/lib/python3.12/lib-dynload",
            "$RUNTIME/lib/python3.12/site-packages",
        ],
        "WORKER_SEARCH_PATH",
        "worker search-path observation differs",
    )
    require(runtime.get("flags") == {"isolated": True, "dontWriteBytecode": True, "warningsAsErrors": True}, "WORKER_FLAGS", "worker flag observation differs")
    environment = runtime.get("environment")
    require(isinstance(environment, dict) and environment.get("required") == REQUIRED_ENVIRONMENT, "WORKER_ENVIRONMENT", "worker required environment observation differs")
    require(environment.get("darwinInjected") in ({}, {"__CF_USER_TEXT_ENCODING": "0x1F5:0x0:0x0"}), "WORKER_ENVIRONMENT", "worker Darwin environment observation differs")
    warning_policy = runtime.get("warningPolicy")
    require(isinstance(warning_policy, dict) and warning_policy.get("defaultAction") == "error" and warning_policy.get("allowlistedObservedCount") == 2, "WORKER_WARNING", "worker warning evidence differs")
    for inventory_name in ("moduleInventory", "dyldInventory"):
        inventory = runtime.get(inventory_name)
        require(isinstance(inventory, dict) and isinstance(inventory.get("records"), list), "WORKER_INVENTORY", f"{inventory_name} is absent")
        require(inventory.get("recordCount") == len(inventory["records"]), "WORKER_INVENTORY", f"{inventory_name} count mismatch")
        require(inventory.get("recordsDigest") == sha256_bytes(json.dumps(inventory["records"], ensure_ascii=True, allow_nan=False, separators=(",", ":"), sort_keys=True).encode("utf-8")), "WORKER_INVENTORY", f"{inventory_name} digest mismatch")
    preflight = worker.get("preflight")
    require(isinstance(preflight, dict), "WORKER_SCHEMA", "worker preflight is absent")
    require(
        preflight.get("matrix") == {"Nx": 8, "Ny": 4, "dx": 0.125, "dy": 0.125, "dt": 0.01, "stepCount": 2, "finalTime": 0.02},
        "WORKER_MATRIX",
        "worker preflight matrix differs",
    )
    tracks = preflight.get("tracks")
    require(isinstance(tracks, list) and [track.get("trackId") for track in tracks] == ["official-literal", "exact-trace-companion"], "WORKER_TRACKS", "worker executed track order differs")
    expected_provenance = {
        "official-literal": (True, True, False, None),
        "exact-trace-companion": (False, False, True, "non-PFHub exact-trace companion"),
    }
    for track in tracks:
        expected = expected_provenance[track["trackId"]]
        observed = (
            track.get("problemUsesOfficialLiteralBoundary"),
            track.get("metricSpecifiedByPfhub"),
            track.get("strictMms"),
            track.get("requiredLabel"),
        )
        require(observed == expected, "WORKER_TRACK_PROVENANCE", "worker track provenance boolean or label differs")
        expected_boundary = (
            {"type": "literal Dirichlet face values", "bottom": 1.0, "top": 0.0, "evaluationTime": "all registered times"}
            if track["trackId"] == "official-literal"
            else {
                "type": "manufactured-field face traces",
                "evaluationTime": "t_(n+1)",
                "requiredLabel": "non-PFHub exact-trace companion",
            }
        )
        require(track.get("boundaryDefinition") == expected_boundary, "WORKER_BOUNDARY", "worker boundary definition differs")
        mesh = track.get("mesh")
        require(
            isinstance(mesh, dict)
            and mesh.get("cellCount") == 32
            and mesh.get("uniqueCellCentreCount") == 32
            and mesh.get("xPeriodic") is True
            and mesh.get("duplicatePeriodicEndpoint") is False
            and mesh.get("pairedPeriodicFacesConnectOppositeCells") is True
            and mesh.get("redundantRightFacesAbsentFromCellFaceIds") is True,
            "WORKER_TOPOLOGY",
            "worker topology witness differs",
        )
        steps = track.get("steps")
        require(isinstance(steps, list) and len(steps) == 2, "WORKER_STEPS", "worker step count differs")
        for index, step in enumerate(steps):
            expected_old_digest = track["initialDigest"] if index == 0 else steps[index - 1]["endpointDigest"]
            require(
                step.get("stepIndex") == index + 1
                and step.get("timeOld") == index * 0.01
                and step.get("timeNew") == (index + 1) * 0.01
                and step.get("oldStateDigest") == expected_old_digest
                and step.get("solveCount") == 1
                and 0 <= step.get("actualIterations", 2001) <= 2000
                and step.get("postSolveResidualL2", math.inf) <= 1e-10
                and step.get("independentPostSolveResidualL2", math.inf) <= 1e-10
                and step.get("bottomFaceMaximumAbsoluteError", math.inf) <= 2e-15
                and step.get("topFaceMaximumAbsoluteError", math.inf) <= 2e-15,
                "WORKER_STEP_SEMANTICS",
                "worker time, solve, residual or boundary witness differs",
            )
            require(isinstance(step.get("matrix"), list) and len(step["matrix"]) == 32, "WORKER_MATRIX", "worker matrix shape differs")
            require(all(isinstance(row, list) and len(row) == 32 for row in step["matrix"]), "WORKER_MATRIX", "worker matrix row shape differs")
            require(isinstance(step.get("rhs"), list) and len(step["rhs"]) == 32, "WORKER_MATRIX", "worker rhs shape differs")
        require(isinstance(track.get("endpoint"), list) and len(track["endpoint"]) == 32, "WORKER_ENDPOINT", "worker endpoint shape differs")
        require(
            track.get("endpointDigest") == steps[-1].get("endpointDigest"),
            "WORKER_ENDPOINT",
            "worker track endpoint digest does not close the step chain",
        )
    require(tracks[0]["initialDigest"] == tracks[1]["initialDigest"], "WORKER_TRACKS", "worker track initial digests differ")
    require(tracks[0]["endpointDigest"] != tracks[1]["endpointDigest"], "WORKER_TRACKS", "worker track endpoint digests are not distinct")
    require(preflight.get("initialBoundaryCompatibility") is False, "WORKER_BOUNDARY", "initial boundary compatibility must remain false")


def compare_oracle(worker: dict[str, object], oracle: dict[str, object]) -> list[dict[str, object]]:
    require(oracle.get("runtimeImportSentinelPassed") is True, "ORACLE_SENTINEL", "oracle import sentinel did not pass")
    worker_tracks = {track["trackId"]: track for track in worker["preflight"]["tracks"]}
    oracle_tracks = {track["trackId"]: track for track in oracle["tracks"]}
    require(set(worker_tracks) == {"official-literal", "exact-trace-companion"} == set(oracle_tracks), "ORACLE_TRACKS", "oracle track set mismatch")
    comparisons: list[dict[str, object]] = []
    for track_id in ("official-literal", "exact-trace-companion"):
        worker_track = worker_tracks[track_id]
        oracle_track = oracle_tracks[track_id]
        require(len(worker_track["steps"]) == 2 and len(oracle_track["steps"]) == 2, "ORACLE_STEPS", "oracle step count mismatch")
        step_records: list[dict[str, object]] = []
        for worker_step, oracle_step in zip(worker_track["steps"], oracle_track["steps"]):
            matrix_difference = maximum_absolute_difference(worker_step["matrix"], oracle_step["matrix"])
            rhs_difference = maximum_absolute_difference(worker_step["rhs"], oracle_step["rhs"])
            require(matrix_difference <= 2e-13 and rhs_difference <= 2e-13, "ORACLE_ASSEMBLY", "FiPy A or b disagrees with clean-room oracle")
            require(worker_step["boundaryDigest"] == oracle_step["boundaryDigest"], "ORACLE_BOUNDARY", "FiPy boundary schedule disagrees with clean-room oracle")
            step_records.append(
                {
                    "stepIndex": worker_step["stepIndex"],
                    "matrixMaximumAbsoluteDifference": matrix_difference,
                    "rhsMaximumAbsoluteDifference": rhs_difference,
                    "matrixThreshold": 2e-13,
                    "rhsThreshold": 2e-13,
                    "boundaryDigestMatched": True,
                    "workerOldStateDigest": worker_step["oldStateDigest"],
                    "oracleOldStateDigest": oracle_step["oldStateDigest"],
                    "workerMatrixDigest": worker_step["matrixDigest"],
                    "oracleMatrixDigest": oracle_step["matrixDigest"],
                    "workerRhsDigest": worker_step["rhsDigest"],
                    "oracleRhsDigest": oracle_step["rhsDigest"],
                    "workerEndpointDigest": worker_step["endpointDigest"],
                    "oracleEndpointDigest": oracle_step["endpointDigest"],
                    "workerBoundaryDigest": worker_step["boundaryDigest"],
                    "oracleBoundaryDigest": oracle_step["boundaryDigest"],
                }
            )
        endpoint_difference = maximum_absolute_difference(worker_track["endpoint"], oracle_track["endpoint"])
        require(endpoint_difference <= 2e-12, "ORACLE_ENDPOINT", "FiPy endpoint disagrees with clean-room oracle")
        comparisons.append(
            {
                "trackId": track_id,
                "steps": step_records,
                "endpointMaximumAbsoluteDifference": endpoint_difference,
                "endpointThreshold": 2e-12,
                "workerInitialDigest": worker_track["initialDigest"],
                "oracleInitialDigest": oracle_track["initialDigest"],
                "workerEndpointDigest": worker_track["endpointDigest"],
                "oracleEndpointDigest": oracle_track["endpointDigest"],
            }
        )
    return comparisons


def replace_source_once(
    payload: bytes,
    replacements: list[tuple[bytes, bytes]],
    probe_id: str,
) -> bytes:
    mutated = payload
    for before, after in replacements:
        require(
            mutated.count(before) == 1,
            "NEGATIVE_PROBE_SOURCE",
            f"{probe_id} source target is not unique",
        )
        mutated = mutated.replace(before, after, 1)
    require(mutated != payload, "NEGATIVE_PROBE_SOURCE", f"{probe_id} did not change source bytes")
    return mutated


def oracle_difference_observation(
    worker: dict[str, object],
    mutant_oracle: dict[str, object],
) -> dict[str, object]:
    worker_tracks = {track["trackId"]: track for track in worker["preflight"]["tracks"]}
    oracle_tracks = {track["trackId"]: track for track in mutant_oracle["tracks"]}
    require(set(worker_tracks) == set(oracle_tracks), "NEGATIVE_PROBE_SHAPE", "mutant track set differs")
    maximum_matrix = 0.0
    maximum_rhs = 0.0
    maximum_endpoint = 0.0
    boundary_mismatch_count = 0
    for track_id in ("official-literal", "exact-trace-companion"):
        worker_track = worker_tracks[track_id]
        oracle_track = oracle_tracks[track_id]
        require(len(worker_track["steps"]) == len(oracle_track["steps"]) == 2, "NEGATIVE_PROBE_SHAPE", "mutant step count differs")
        for worker_step, oracle_step in zip(worker_track["steps"], oracle_track["steps"]):
            maximum_matrix = max(
                maximum_matrix,
                maximum_absolute_difference(worker_step["matrix"], oracle_step["matrix"]),
            )
            maximum_rhs = max(
                maximum_rhs,
                maximum_absolute_difference(worker_step["rhs"], oracle_step["rhs"]),
            )
            boundary_mismatch_count += int(
                worker_step["boundaryDigest"] != oracle_step["boundaryDigest"]
            )
        maximum_endpoint = max(
            maximum_endpoint,
            maximum_absolute_difference(worker_track["endpoint"], oracle_track["endpoint"]),
        )
    return {
        "maximumMatrixAbsoluteDifference": maximum_matrix,
        "maximumRhsAbsoluteDifference": maximum_rhs,
        "maximumEndpointAbsoluteDifference": maximum_endpoint,
        "boundaryDigestMismatchCount": boundary_mismatch_count,
    }


def run_semantic_negative_probes(
    runtime_root: Path,
    worker: dict[str, object],
    candidate_payloads: dict[str, bytes],
    repo_root: Path,
) -> list[dict[str, object]]:
    results: list[dict[str, object]] = []

    reaction_mutant = replace_source_once(
        candidate_payloads["worker.py"],
        [
            (
                b"reaction = -4.0 * eta.old * (eta.old - 1.0) * (eta.old - 0.5)",
                b"reaction = -4.0 * eta * (eta - 1.0) * (eta - 0.5)",
            )
        ],
        "reaction-time-level",
    )
    try:
        verify_worker_source_payload(reaction_mutant)
    except GateFailure as error:
        require(
            error.code == "WORKER_REACTION_TIME_LEVEL",
            "NEGATIVE_PROBE_RESULT",
            "reaction source mutant failed for an unexpected reason",
        )
        results.append(
            {
                "probeId": "reaction-time-level",
                "status": "expected-abstention",
                "probeMode": "in-memory-worker-source-ast-mutant",
                "mutation": "reaction eta.old at n -> eta at n+1 expression",
                "mutatedSourceDigest": sha256_bytes(reaction_mutant),
                "reasonCode": error.code,
            }
        )
    else:
        raise GateFailure("NEGATIVE_PROBE_RESULT", "reaction time-level source mutation was accepted")

    oracle_mutations = [
        {
            "probeId": "source-time-level",
            "mutation": "manufactured source time_old -> time_new",
            "replacements": [
                (
                    b"source = manufactured_source(x_cell, y_cell, time_old)",
                    b"source = manufactured_source(x_cell, y_cell, time_new)",
                )
            ],
            "requiredSignal": "rhs",
        },
        {
            "probeId": "exact-trace-time-level",
            "mutation": "boundary values time_new -> time_old",
            "replacements": [
                (
                    b"bottom, top = boundary_values(track, time_new)",
                    b"bottom, top = boundary_values(track, time_old)",
                )
            ],
            "requiredSignal": "boundary",
        },
        {
            "probeId": "periodic-wrap",
            "mutation": "left periodic modulo NX -> modulo NX-1",
            "replacements": [
                (
                    b"matrix[row, j * NX + ((i - 1) % NX)] = -rx",
                    b"matrix[row, j * NX + ((i - 1) % (NX - 1))] = -rx",
                )
            ],
            "requiredSignal": "matrix",
        },
        {
            "probeId": "dirichlet-factor-of-two",
            "mutation": "bottom and top Dirichlet 2*ry contributions -> ry",
            "replacements": [
                (b"rhs[row] += 2.0 * ry * bottom[i]", b"rhs[row] += ry * bottom[i]"),
                (b"rhs[row] += 2.0 * ry * top[i]", b"rhs[row] += ry * top[i]"),
            ],
            "requiredSignal": "rhs",
        },
    ]
    with tempfile.TemporaryDirectory(prefix="tf-r18a-semantic-mutants-") as directory:
        mutant_root = Path(directory)
        require(
            stat.S_IMODE(mutant_root.stat().st_mode) == 0o700,
            "NEGATIVE_PROBE_SOURCE",
            "semantic mutant directory is not private",
        )
        for mutation in oracle_mutations:
            probe_id = mutation["probeId"]
            mutant_payload = replace_source_once(
                candidate_payloads["oracle.py"],
                mutation["replacements"],
                probe_id,
            )
            mutant_path = mutant_root / f"{probe_id}.py"
            write_materialized_file(mutant_root, mutant_path.name, mutant_payload)
            verify_oracle_source(mutant_path)
            mutant_oracle = run_child(runtime_root, mutant_path, [], repo_root)
            observation = oracle_difference_observation(worker, mutant_oracle)
            required_signal = mutation["requiredSignal"]
            if required_signal == "matrix":
                signal_passed = observation["maximumMatrixAbsoluteDifference"] > 2e-13
            elif required_signal == "rhs":
                signal_passed = observation["maximumRhsAbsoluteDifference"] > 2e-13
            else:
                signal_passed = observation["boundaryDigestMismatchCount"] > 0
            require(
                signal_passed,
                "NEGATIVE_PROBE_RESULT",
                f"{probe_id} did not produce its registered full-system signal",
            )
            try:
                compare_oracle(worker, mutant_oracle)
            except GateFailure as error:
                require(
                    error.code in {"ORACLE_ASSEMBLY", "ORACLE_BOUNDARY", "ORACLE_ENDPOINT"},
                    "NEGATIVE_PROBE_RESULT",
                    f"{probe_id} failed for an unexpected reason",
                )
                results.append(
                    {
                        "probeId": probe_id,
                        "status": "expected-abstention",
                        "probeMode": "executed-full-clean-room-source-mutant",
                        "mutation": mutation["mutation"],
                        "mutatedSourceDigest": sha256_bytes(mutant_payload),
                        "reasonCode": error.code,
                        "observation": observation,
                    }
                )
            else:
                raise GateFailure("NEGATIVE_PROBE_RESULT", f"semantic source mutation was accepted: {probe_id}")

    provenance_mutant = copy.deepcopy(worker)
    provenance_mutant["preflight"]["tracks"][1]["metricSpecifiedByPfhub"] = True
    try:
        validate_worker_result(provenance_mutant)
    except GateFailure as error:
        require(
            error.code == "WORKER_TRACK_PROVENANCE",
            "NEGATIVE_PROBE_RESULT",
            "track provenance mutation failed for an unexpected reason",
        )
        results.append(
            {
                "probeId": "track-provenance-boolean",
                "status": "expected-abstention",
                "probeMode": "worker-result-semantic-mutant",
                "mutation": "exact-trace metricSpecifiedByPfhub false -> true",
                "reasonCode": error.code,
            }
        )
    else:
        raise GateFailure("NEGATIVE_PROBE_RESULT", "track provenance mutation was accepted")
    for probe_id, payload in (
        ("duplicate-json-literal", b'{"a":1,"a":2}'),
        ("duplicate-json-escaped", b'{"a":1,"\\u0061":2}'),
    ):
        try:
            strict_json(payload, "$NEGATIVE_JSON")
        except GateFailure as error:
            require(error.code == "JSON_DUPLICATE_KEY", "NEGATIVE_PROBE_RESULT", "duplicate JSON failed for an unexpected reason")
            results.append(
                {
                    "probeId": probe_id,
                    "status": "expected-abstention",
                    "probeMode": "strict-json-byte-mutant",
                    "mutation": "duplicate literal key" if probe_id.endswith("literal") else "escape-equivalent duplicate key",
                    "reasonCode": error.code,
                }
            )
        else:
            raise GateFailure("NEGATIVE_PROBE_RESULT", f"duplicate JSON mutation was accepted: {probe_id}")
    return results


def compact_tracks(worker_tracks: list[dict[str, object]]) -> list[dict[str, object]]:
    compact: list[dict[str, object]] = []
    for track in worker_tracks:
        item = {key: value for key, value in track.items() if key != "endpoint"}
        item["steps"] = [
            {key: value for key, value in step.items() if key not in {"matrix", "rhs"}}
            for step in track["steps"]
        ]
        compact.append(item)
    return compact


def build_acceptance_matrix(spec: dict[str, object]) -> list[dict[str, object]]:
    locators = {
        "identityAndIsolation": [
            ["/frozenInputs", "/negativeProbes/6", "/negativeProbes/7"],
            ["/runtime/inputVerification", "/runtime/closure"],
            ["/runtime/address", "/runtime/closure/allRegularFilesLockedReadOnly"],
            ["/runtime/workerObservation/prefix", "/runtime/workerObservation/moduleInventory"],
            ["/runtime/workerObservation/dyldInventory", "/runtime/hostBoundary"],
            ["/runtime/workerObservation/versions"],
            ["/runtime/workerObservation/warningPolicy", "/negativeProbes/8"],
        ],
        "scientificSemantics": [
            ["/scientificSemantics/executedTracks/0/mesh", "/scientificSemantics/executedTracks/1/mesh"],
            ["/scientificSemantics/preflightMatrix", "/scientificSemantics/executedTracks/*/steps"],
            ["/scientificSemantics/executedTracks/*/boundaryDefinition", "/scientificSemantics/cleanRoomOracle/comparisons/*/steps/*/boundaryDigestMatched"],
            ["/scientificSemantics/executedTracks/*/initialDigest", "/scientificSemantics/executedTracks/*/endpointDigest"],
            ["/scientificSemantics/executedTracks/*/steps"],
            ["/scientificSemantics/diagnostics/constantTwoDiscreteL2"],
            ["/scientificSemantics/literalSelfPreflight"],
            ["/scientificSemantics/boundaryCompatibility", "/scientificSemantics/diagnostics/analyticBoundaryTailMismatchAtExecutedFaces"],
        ],
        "claimAndFailure": [
            ["/capabilityCeiling", "/promotionAuthorized"],
            ["$SUPERVISOR:main", "/negativeProbes"],
            ["$ORACLE:runtimeImportSentinel", "$SUPERVISOR:verify_worker_source", "/candidateSources/privateSnapshot"],
        ],
        "resolvedSpecAndCleanRoomOracle": [
            ["/frozenInputs/preregistration"],
            ["/scientificSemantics/boundaryCompatibility", "/scientificSemantics/quantityRegistry", "/sourceMetadata", "/scientificSemantics/trackRegistry"],
            ["/scientificSemantics/linearSolver", "/scientificSemantics/cleanRoomOracle/comparisons"],
            ["/candidateSources/oracle", "/scientificSemantics/cleanRoomOracle/runtimeImportSentinelPassed"],
            ["/negativeProbes/0", "/negativeProbes/1", "/negativeProbes/2", "/negativeProbes/3", "/negativeProbes/4", "/negativeProbes/5"],
            ["$SCHEMA_GATE:forbidden-effective-receipt-values"],
        ],
    }
    matrix: list[dict[str, object]] = []
    acceptance_tests = spec["acceptanceTests"]
    require(list(acceptance_tests) == list(locators), "ACCEPTANCE_MATRIX", "acceptance group order differs from effective v4")
    for group, requirements in acceptance_tests.items():
        require(len(requirements) == len(locators[group]), "ACCEPTANCE_MATRIX", f"acceptance requirement count differs for {group}")
        for index, (requirement, evidence_locators) in enumerate(zip(requirements, locators[group])):
            matrix.append(
                {
                    "acceptanceId": f"r18a.{group}.{index + 1:02d}",
                    "group": group,
                    "ordinal": index + 1,
                    "requirement": requirement,
                    "evidenceLocators": evidence_locators,
                    "passed": True,
                }
            )
    return matrix


def build_receipt(
    spec: dict[str, object],
    lock: dict[str, object],
    runtime_records: list[dict[str, object]],
    worker: dict[str, object],
    oracle_identity: dict[str, object],
    comparisons: list[dict[str, object]],
    candidate_records: list[dict[str, object]],
    supervisor_identity: dict[str, object],
    negative_probes: list[dict[str, object]],
) -> dict[str, object]:
    candidate_by_name = {record["path"]: record for record in candidate_records}
    return {
        "schemaVersion": RECEIPT_SCHEMA_VERSION,
        "candidateId": CANDIDATE_ID,
        "status": "pass",
        "evidenceClassification": "auditable",
        "acceptanceMatrix": build_acceptance_matrix(spec),
        "negativeProbes": negative_probes,
        "frozenInputs": {
            "preregistration": {"path": SPEC_PATH.as_posix(), "byteSize": SPEC_SIZE, "rawDigest": SPEC_DIGEST},
            "runtimeLock": {"path": LOCK_PATH.as_posix(), "byteSize": LOCK_SIZE, "rawDigest": LOCK_DIGEST},
            "auditHistoryEffectiveSpecification": False,
        },
        "candidateSources": {
            "supervisor": supervisor_identity,
            "worker": {
                "path": "$WORKER",
                "byteSize": candidate_by_name["worker.py"]["byteSize"],
                "rawDigest": candidate_by_name["worker.py"]["rawDigest"],
            },
            "oracle": oracle_identity,
            "privateSnapshot": {
                "addressDigest": sha256_bytes(canonical_records(candidate_records)),
                "sealedReadOnly": True,
                "postRunRepositorySourcesUnchanged": True,
            },
        },
        "runtime": {
            "address": "$REPOSITORY/.tf-runtime/pfhub7a-r18a/" + LOCK_DIGEST.split(":", 1)[1],
            "trackedByGit": False,
            "inputVerification": {
                "verifiedBeforeExecution": True,
                "pythonSource": {
                    "logicalRoot": "$PYTHON_SOURCE_ROOT",
                    "executable": lock["bootstrapSource"]["pythonExecutable"],
                    "canonicalClosure": lock["bootstrapSource"]["canonicalClosure"],
                },
                "wheelhouse": {
                    "logicalRoot": "$WHEELHOUSE",
                    "wheels": [
                        {
                            "name": item["name"],
                            "version": item["version"],
                            "filename": item["filename"],
                            "byteSize": item["byteSize"],
                            "rawDigest": item["rawDigest"],
                        }
                        for item in lock["wheelhouse"]["distributions"]
                    ],
                    "expandedClosure": lock["wheelhouse"]["expandedClosure"],
                },
            },
            "closure": {
                "recordCount": len(runtime_records),
                "byteSize": sum(int(record["byteSize"]) for record in runtime_records),
                "recordsDigest": sha256_bytes(canonical_records(runtime_records)),
                "allRegularFilesLockedReadOnly": True,
            },
            "requiredFlags": ["-I", "-B", "-W", "error"],
            "environment": REQUIRED_ENVIRONMENT,
            "workerObservation": worker["runtime"],
            "hostBoundary": {
                "classification": "residual-P2",
                "callerSuppliedCpythonSource": True,
                "description": lock["dynamicClosurePolicy"]["hostBoundary"],
                "byteLocked": False,
            },
        },
        "scientificSemantics": {
            "equation": spec["officialProblem"]["equation"],
            "timeIntegrator": spec["implementation"]["timeIntegrator"],
            "preflightMatrix": worker["preflight"]["matrix"],
            "linearSolver": {
                "class": "FiPy LinearPCGSolver",
                "criterion": "RHS",
                "tolerance": 1e-12,
                "absoluteTolerance": 1e-14,
                "iterations": 2000,
                "preconditioner": None,
                "solveCountPerStep": 1,
            },
            "matrixNormalization": "multiply FiPy A and b by dt/cellVolume",
            "trackRegistry": spec["boundarySemantics"]["tracks"],
            "boundaryCompatibility": {
                "initialBoundaryCompatibility": spec["boundarySemantics"]["initialBoundaryCompatibility"],
                "alphaConservativeIntervalForT0To8": spec["boundarySemantics"]["alphaConservativeIntervalForT0To8"],
                "conservativeBoundaryTraceMismatchUpperBound": spec["boundarySemantics"]["conservativeBoundaryTraceMismatchUpperBound"],
                "upperBoundInterpretation": spec["boundarySemantics"]["upperBoundInterpretation"],
            },
            "executedTracks": compact_tracks(worker["preflight"]["tracks"]),
            "literalSelfPreflight": {
                "executedAsBvpConvergence": False,
                "syntheticAffineRestrictionOnly": True,
                "maximumAbsoluteError": worker["preflight"]["restrictionMaximumAbsoluteError"],
            },
            "cleanRoomOracle": {
                "dependencies": oracle_identity,
                "runtimeImportSentinelPassed": True,
                "comparisons": comparisons,
            },
            "diagnostics": {
                "constantTwoDiscreteL2": worker["preflight"]["constantTwoDiscreteL2"],
                "trackEndpointDifferenceL2": worker["preflight"]["trackEndpointDifferenceL2"],
                "analyticBoundaryTailMismatchAtExecutedFaces": worker["preflight"]["analyticBoundaryTailMismatchAtExecutedFaces"],
                "initialBoundaryCompatibility": False,
                "convergenceFitEligible": False,
                "rankingEligible": False,
            },
            "quantityRegistry": spec["quantityRegistry"],
        },
        "sourceMetadata": [
            {
                "classification": item["classification"],
                "name": item["name"],
                "date": item["date"],
                "revision": item["revision"],
                "url": item["url"],
                "rawDigest": item["rawDigest"],
            }
            for item in spec["sotaEvidence"]
        ],
        "capabilityCeiling": spec["capabilityCeiling"],
        "crossScaleBridge": spec["crossScaleBridge"],
        "causalPolicy": spec["causalPolicy"],
        "globalRepositoryBlockers": spec["globalRepositoryBlockers"],
        "promotionAuthorized": False,
        "abstention": None,
    }


def parse_arguments(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(allow_abbrev=False)
    parser.add_argument("--python-source", type=Path, required=True)
    parser.add_argument("--wheelhouse", type=Path, required=True)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--inject-warning", action="store_true")
    return parser.parse_args(argv)


def atomic_write(path: Path, payload: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    require(not path.parent.is_symlink() and path.parent.is_dir(), "OUTPUT_PATH", "output parent is not a regular directory")
    descriptor, temporary_name = tempfile.mkstemp(prefix=".r18a-", suffix=".tmp", dir=path.parent)
    temporary = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(payload)
            stream.flush()
            os.fsync(stream.fileno())
        os.chmod(temporary, 0o444, follow_symlinks=False)
        os.link(temporary, path, follow_symlinks=False)
    finally:
        if temporary.exists():
            temporary.unlink()


def emit(value: object) -> bytes:
    return json.dumps(value, ensure_ascii=True, allow_nan=False, separators=(",", ":"), sort_keys=True).encode("utf-8")


def main(argv: list[str] | None = None) -> int:
    try:
        arguments = parse_arguments(sys.argv[1:] if argv is None else argv)
        repo_root = Path(__file__).resolve(strict=True).parents[2]
        supervisor_path = Path(__file__).resolve(strict=True)
        supervisor_payload = read_regular_file(supervisor_path)
        require(platform.system() == "Darwin" and platform.machine() == "arm64", "PLATFORM", "runtime lock requires Darwin arm64")
        spec_payload = read_regular_file(repo_root / SPEC_PATH)
        lock_payload = read_regular_file(repo_root / LOCK_PATH)
        require(len(spec_payload) == SPEC_SIZE and sha256_bytes(spec_payload) == SPEC_DIGEST, "SPEC_IDENTITY", "effective v4 preregistration identity mismatch")
        require(len(lock_payload) == LOCK_SIZE and sha256_bytes(lock_payload) == LOCK_DIGEST, "LOCK_IDENTITY", "runtime lock identity mismatch")
        spec = strict_json(spec_payload, "$PREREGISTRATION")
        lock = strict_json(lock_payload, "$RUNTIME_LOCK")
        require(isinstance(spec, dict) and spec.get("status") == "frozen-self-contained-before-builder-candidate", "SPEC_STATUS", "effective preregistration status mismatch")
        require(isinstance(lock, dict) and lock.get("lockId") == "pfhub7a-r18a-fipy-scipy-headless-darwin-arm64-cpython312-v1", "LOCK_STATUS", "runtime lock identity field mismatch")
        require(arguments.python_source.is_absolute() and not arguments.python_source.is_symlink(), "PYTHON_SOURCE", "Python source root must be an absolute non-symlink path")
        require(arguments.wheelhouse.is_absolute() and not arguments.wheelhouse.is_symlink(), "WHEELHOUSE", "wheelhouse must be an absolute non-symlink path")
        snapshot, candidate_payloads, candidate_records = candidate_snapshot(repo_root)
        runtime_root, before_records = materialize(repo_root, arguments.python_source.resolve(), arguments.wheelhouse.resolve(), lock)
        oracle_identity = verify_oracle_source(snapshot / "oracle.py")
        verify_worker_source(snapshot / "worker.py")
        oracle = run_child(runtime_root, snapshot / "oracle.py", [], repo_root)
        worker = run_child(
            runtime_root,
            snapshot / "worker.py",
            ["--inject-warning"] if arguments.inject_warning else [],
            repo_root,
        )
        validate_worker_result(worker)
        comparisons = compare_oracle(worker, oracle)
        negative_probes = run_semantic_negative_probes(
            runtime_root,
            worker,
            candidate_payloads,
            repo_root,
        )
        warning_probe = run_expected_abstention(
            runtime_root,
            snapshot / "worker.py",
            ["--inject-warning"],
            repo_root,
            "WARNING_NOT_ALLOWLISTED",
        )
        negative_probes.append(
            {
                "probeId": "non-allowlisted-warning",
                "probeMode": "executed-worker-warning-mutant",
                "mutation": "emit one non-allowlisted RuntimeWarning",
                **warning_probe,
            }
        )
        after_records = materialized_closure(runtime_root)
        require(before_records == after_records, "RUNTIME_MUTATION", "runtime closure changed during execution")
        require(read_regular_file(repo_root / ORACLE_PATH) == candidate_payloads["oracle.py"], "CANDIDATE_MUTATION", "repository oracle changed during execution")
        require(read_regular_file(repo_root / WORKER_PATH) == candidate_payloads["worker.py"], "CANDIDATE_MUTATION", "repository worker changed during execution")
        require(read_regular_file(snapshot / "oracle.py") == candidate_payloads["oracle.py"], "CANDIDATE_MUTATION", "private oracle snapshot changed during execution")
        require(read_regular_file(snapshot / "worker.py") == candidate_payloads["worker.py"], "CANDIDATE_MUTATION", "private worker snapshot changed during execution")
        require(read_regular_file(repo_root / SPEC_PATH) == spec_payload, "SPEC_MUTATION", "preregistration changed during execution")
        require(read_regular_file(repo_root / LOCK_PATH) == lock_payload, "LOCK_MUTATION", "runtime lock changed during execution")
        require(read_regular_file(supervisor_path) == supervisor_payload, "SUPERVISOR_MUTATION", "supervisor changed during execution")
        receipt = build_receipt(
            spec,
            lock,
            after_records,
            worker,
            oracle_identity,
            comparisons,
            candidate_records,
            {"path": "$SUPERVISOR", "byteSize": len(supervisor_payload), "rawDigest": sha256_bytes(supervisor_payload)},
            negative_probes,
        )
        payload = emit(receipt)
        if arguments.output is not None:
            output = arguments.output if arguments.output.is_absolute() else repo_root / arguments.output
            atomic_write(output, payload + b"\n")
        sys.stdout.buffer.write(payload)
        return 0
    except GateFailure as error:
        sys.stdout.buffer.write(
            emit(
                {
                    "schemaVersion": "tf.pfhub7a-r18a-abstention/0.1",
                    "status": "abstain",
                    "reasonCode": error.code,
                    "detail": error.detail,
                }
            )
        )
        return 1
    except (OSError, subprocess.SubprocessError, zipfile.BadZipFile, SyntaxError, ValueError) as error:
        sys.stdout.buffer.write(
            emit(
                {
                    "schemaVersion": "tf.pfhub7a-r18a-abstention/0.1",
                    "status": "abstain",
                    "reasonCode": "SUPERVISOR_FAILURE",
                    "detail": type(error).__name__,
                }
            )
        )
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
