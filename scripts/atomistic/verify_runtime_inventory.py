from __future__ import annotations

import argparse
import configparser
import hashlib
import json
import os
import re
import stat
import sys
import zipfile
from pathlib import Path, PurePosixPath


PYTHON_HOSTLIST_WHEEL_FILENAME = "python_hostlist-2.3.0-py3-none-any.whl"
ALLOWED_DATA_SCHEME_WHEEL_POLICY = {
    "fonttools-4.63.0-cp312-cp312-manylinux2014_x86_64.manylinux_2_17_x86_64.whl": {
        "sizeBytes": 4_999_800,
        "sha256": "sha256:58dc6bb86a78d782f00f9190ca02c119cf5bbe2807536e361e18d42019f877d8",
        "members": frozenset({
        "fonttools-4.63.0.data/data/share/",
        "fonttools-4.63.0.data/data/share/man/",
        "fonttools-4.63.0.data/data/share/man/man1/",
        "fonttools-4.63.0.data/data/share/man/man1/ttx.1",
        }),
    },
    "plotly-7.0.0-py3-none-any.whl": {
        "sizeBytes": 9_052_859,
        "sha256": "sha256:78cbf7bd06d1b05bb3b8ec1b709864695229b55151b6f7530fbf55517ead6fdd",
        "members": frozenset({
        "plotly-7.0.0.data/data/share/jupyter/labextensions/jupyterlab-plotly/install.json",
        "plotly-7.0.0.data/data/share/jupyter/labextensions/jupyterlab-plotly/package.json",
        "plotly-7.0.0.data/data/share/jupyter/labextensions/jupyterlab-plotly/static/0.e889754e73c03c32.js",
        "plotly-7.0.0.data/data/share/jupyter/labextensions/jupyterlab-plotly/static/remoteEntry.6f1030bf65ead662.js",
        "plotly-7.0.0.data/data/share/jupyter/labextensions/jupyterlab-plotly/static/style.js",
        "plotly-7.0.0.data/data/share/jupyter/labextensions/jupyterlab-plotly/static/third-party-licenses.json",
        }),
    },
    PYTHON_HOSTLIST_WHEEL_FILENAME: {
        "sizeBytes": 39_523,
        "sha256": "sha256:498c59026aec1015aa07f970423d4b655ac45f5108bbc900f40f8afd3593ad1c",
        "members": frozenset(
            f"python_hostlist-2.3.0.data/data/share/man/man1/{name}.1"
            for name in ("dbuck", "hostgrep", "hostlist", "pshbak")
        ),
    },
    "sympy-1.14.0-py3-none-any.whl": {
        "sizeBytes": 6_299_353,
        "sha256": "sha256:e091cc3e99d2141a0ba2847328f5479b05d94a6635cb96148ccb3f34671bd8f5",
        "members": frozenset({
            "sympy-1.14.0.data/data/share/man/man1/isympy.1",
        }),
    },
}
PYTHON_HOSTLIST_ALLOWED_DATA_MEMBERS = ALLOWED_DATA_SCHEME_WHEEL_POLICY[
    PYTHON_HOSTLIST_WHEEL_FILENAME
]["members"]
RESERVED_VENV_SCRIPT_ROOTS = frozenset({
    "activate", "activate.csh", "activate.fish", "activate.nu", "activate.ps1",
    "pip", "pip3", "pip3.12", "python", "python3", "python3.12",
})
SETUPTOOLS_RUNTIME_WHEEL_POLICY = {
    "filename": "setuptools-84.0.0-py3-none-any.whl",
    "name": "setuptools",
    "version": "84.0.0",
    "sizeBytes": 818_216,
    "sha256": "sha256:51a52592b3b99e102b609654876bd65f19f999935166d1352678931132b0c670",
    "startupHook": {
        "archivePath": "distutils-precedence.pth",
        "installPath": "site-packages/distutils-precedence.pth",
        "sizeBytes": 151,
        "sha256": "sha256:2638ce9e2500e572a5e0de7faed6661eb569d1b696fcba07b0dd223da5f5d224",
    },
}


MAX_MANIFEST_BYTES = 100_000_000
MAX_WHEEL_BYTES = 1_500_000_000
MAX_ARCHIVE_MEMBERS = 250_000


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--wheelhouse", type=Path, required=True)
    parser.add_argument("--manifest", type=Path, required=True)
    args = parser.parse_args(sys.argv[1:] if argv is None else argv)
    summary = verify_runtime_inventory(args.wheelhouse, args.manifest)
    print(json.dumps(summary, sort_keys=True, separators=(",", ":")))
    return 0


def verify_runtime_inventory(wheelhouse: Path, manifest_path: Path) -> dict[str, object]:
    wheelhouse = canonical_directory(wheelhouse, "wheelhouse")
    manifest = json.loads(
        read_regular(manifest_path, MAX_MANIFEST_BYTES).decode("utf-8"),
        object_pairs_hook=reject_duplicate_json_keys,
    )
    if manifest.get("schemaVersion") != "tf.atomistic-wheelhouse-manifest/0.1":
        raise ValueError("runtime inventory verifier received an unsupported manifest")
    declared_wheels = manifest.get("wheels")
    removals = manifest.get("startupHookRemovals")
    if not isinstance(declared_wheels, list) or not isinstance(removals, list):
        raise ValueError("runtime inventory manifest lacks wheel or removal arrays")
    if manifest.get("wheelCount") != len(declared_wheels):
        raise ValueError("runtime inventory manifest wheel count drifted")

    declared_by_filename: dict[str, dict[str, object]] = {}
    flattened_removals: list[dict[str, object]] = []
    for wheel in declared_wheels:
        if not isinstance(wheel, dict):
            raise ValueError("runtime inventory manifest contains a non-object wheel")
        filename = wheel.get("filename")
        if (
            not isinstance(filename, str)
            or PurePosixPath(filename).name != filename
            or not filename.endswith(".whl")
            or filename in declared_by_filename
        ):
            raise ValueError("runtime inventory manifest contains an unsafe or duplicate wheel filename")
        per_wheel_removals = wheel.get("startupHookRemovals", [])
        if not isinstance(per_wheel_removals, list):
            raise ValueError("runtime inventory manifest contains invalid per-wheel removals")
        flattened_removals.extend(per_wheel_removals)
        declared_by_filename[filename] = wheel
    if canonical_json(flattened_removals) != canonical_json(removals):
        raise ValueError("global and per-wheel startup-hook removals differ")

    directory_entries = sorted(wheelhouse.iterdir(), key=lambda path: path.name)
    actual_names: list[str] = []
    for path in directory_entries:
        metadata = path.lstat()
        if not stat.S_ISREG(metadata.st_mode) or path.is_symlink() or metadata.st_nlink != 1:
            raise ValueError("runtime inventory wheelhouse contains a non-regular wheel")
        actual_names.append(path.name)
    if actual_names != sorted(declared_by_filename):
        raise ValueError("runtime inventory wheelhouse filename set differs from the manifest")

    files: dict[str, str] = {}
    directories: set[str] = set()
    for wheel_path in directory_entries:
        wheel = declared_by_filename[wheel_path.name]
        per_wheel_removals = wheel.get("startupHookRemovals", [])
        install_paths = inspect_install_inventory(wheel_path, per_wheel_removals)
        if canonical_digest(install_paths) != wheel.get("installPathDigest"):
            raise ValueError(f"{wheel_path.name}: independently derived install-path digest differs")
        register_install_paths(wheel_path.name, install_paths, files, directories)

    raw_paths = sorted(files)
    if manifest.get("installedFileCount") != len(raw_paths):
        raise ValueError("independently derived installed file count differs")
    if manifest.get("installedPathDigest") != canonical_digest(raw_paths):
        raise ValueError("independently derived installed path digest differs")

    removed_paths: set[str] = set()
    for removal in removals:
        validate_removal_shape(removal)
        install_path = str(removal["installPath"])
        wheel_filename = str(removal["wheelFilename"])
        if install_path in removed_paths:
            raise ValueError("runtime inventory manifest removes one path more than once")
        if files.get(install_path) != wheel_filename:
            raise ValueError("runtime inventory removal is not owned by its declared wheel")
        removed_paths.add(install_path)
    runtime_paths = [path for path in raw_paths if path not in removed_paths]
    if manifest.get("runtimeInstalledFileCount") != len(runtime_paths):
        raise ValueError("independently derived runtime file count differs")
    if manifest.get("runtimeInstalledPathDigest") != canonical_digest(runtime_paths):
        raise ValueError("independently derived runtime path digest differs")
    return {
        "schemaVersion": "tf.runtime-install-inventory-verification/0.1",
        "wheelCount": len(declared_wheels),
        "installedFileCount": len(raw_paths),
        "removedFileCount": len(removed_paths),
        "runtimeInstalledFileCount": len(runtime_paths),
        "installedPathDigest": canonical_digest(raw_paths),
        "runtimeInstalledPathDigest": canonical_digest(runtime_paths),
    }


def inspect_install_inventory(path: Path, removals: list[object]) -> list[str]:
    metadata = path.lstat()
    if (
        not stat.S_ISREG(metadata.st_mode)
        or path.is_symlink()
        or metadata.st_nlink != 1
        or metadata.st_size < 1
        or metadata.st_size > MAX_WHEEL_BYTES
    ):
        raise ValueError(f"{path.name}: runtime inventory input is not a bounded regular wheel")
    descriptor = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
    with os.fdopen(descriptor, "rb") as handle:
        opened = os.fstat(handle.fileno())
        if file_identity(opened) != file_identity(metadata):
            raise ValueError(f"{path.name}: wheel changed while it was being opened")
        digest = hashlib.sha256()
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
        handle.seek(0)
        with zipfile.ZipFile(handle) as archive:
            members = archive.infolist()
            if len(members) > MAX_ARCHIVE_MEMBERS:
                raise ValueError(f"{path.name}: runtime inventory wheel has too many members")
            member_by_name: dict[str, zipfile.ZipInfo] = {}
            for info in members:
                validate_archive_member(path.name, info, member_by_name)
                validate_reserved_venv_install_path(
                    path.name, install_destination(info.filename)
                )
            validate_data_scheme_policy(
                path.name,
                opened.st_size,
                f"sha256:{digest.hexdigest()}",
                {info.filename for info in members if is_data_scheme_member(info.filename)},
            )
            direct_dist_info_roots = sorted({
                parts[0]
                for info in members
                if (parts := PurePosixPath(info.filename).parts)
                and parts[0].lower().endswith(".dist-info")
            })
            if len(direct_dist_info_roots) != 1:
                raise ValueError(f"{path.name}: runtime inventory found multiple direct dist-info roots")
            entry_point_path = f"{direct_dist_info_roots[0]}/entry_points.txt"
            entry_point = member_by_name.get(entry_point_path)
            if entry_point is not None and (entry_point.is_dir() or entry_point.file_size > 1_000_000):
                raise ValueError(f"{path.name}: runtime inventory found invalid entry-point metadata")
            install_paths = [
                install_destination(info.filename)
                for info in members
                if not info.is_dir()
            ]
            install_paths.extend(parse_entry_point_scripts(
                path.name,
                archive.read(entry_point) if entry_point is not None else None,
            ))
            for install_path in install_paths:
                validate_reserved_venv_install_path(path.name, install_path)
            startup_hook_candidates = [
                {
                    "archivePath": info.filename,
                    "installPath": install_destination(info.filename),
                    "sizeBytes": info.file_size,
                    "sha256": "sha256:" + hashlib.sha256(archive.read(info)).hexdigest(),
                }
                for info in members
                if not info.is_dir()
                and is_startup_hook_destination(install_destination(info.filename))
            ]
            validate_startup_hook_policy(
                path.name,
                opened.st_size,
                f"sha256:{digest.hexdigest()}",
                startup_hook_candidates,
                removals,
            )
            if len(install_paths) != len(set(install_paths)):
                raise ValueError(f"{path.name}: runtime inventory found an intra-wheel path collision")
            for removal in removals:
                validate_removal_shape(removal)
                if removal["wheelFilename"] != path.name:
                    raise ValueError(f"{path.name}: per-wheel removal owner differs")
                archive_path = str(removal["archivePath"])
                info = member_by_name.get(archive_path)
                if (
                    info is None
                    or info.is_dir()
                    or install_destination(archive_path) != removal["installPath"]
                ):
                    raise ValueError(f"{path.name}: removal does not bind an installed archive member")
                if info.file_size != removal["sizeBytes"]:
                    raise ValueError(f"{path.name}: removal member size differs")
                content = archive.read(info)
                if sha256(content) != removal["sha256"]:
                    raise ValueError(f"{path.name}: removal member digest differs")
        closed = os.fstat(handle.fileno())
        if file_identity(closed) != file_identity(opened):
            raise ValueError(f"{path.name}: wheel changed during runtime inventory verification")
    return sorted(install_paths)


def validate_archive_member(
    wheel_name: str,
    info: zipfile.ZipInfo,
    seen: dict[str, zipfile.ZipInfo],
) -> None:
    filename = info.filename
    path = PurePosixPath(filename)
    canonical_filename = path.as_posix() + ("/" if info.is_dir() else "")
    if (
        not filename
        or "\x00" in filename
        or "\\" in filename
        or filename.startswith("/")
        or filename in seen
        or path.is_absolute()
        or filename != canonical_filename
        or any(part in {"", ".", ".."} for part in path.parts)
    ):
        raise ValueError(f"{wheel_name}: runtime inventory found an unsafe archive path")
    mode = (info.external_attr >> 16) & 0xFFFF
    file_type = stat.S_IFMT(mode)
    if file_type not in {0, stat.S_IFREG, stat.S_IFDIR} or (file_type == stat.S_IFDIR) != info.is_dir():
        raise ValueError(f"{wheel_name}: runtime inventory found a link or special archive member")
    if info.flag_bits & 0x1:
        raise ValueError(f"{wheel_name}: runtime inventory found an encrypted archive member")
    seen[filename] = info


def install_destination(member_name: str) -> str:
    parts = PurePosixPath(member_name).parts
    if len(parts) >= 3 and parts[0].endswith(".data"):
        scheme = parts[1]
        if scheme not in {"purelib", "platlib", "headers", "scripts", "data"}:
            raise ValueError(f"runtime inventory found unsupported .data scheme {scheme!r}")
        prefix = "site-packages" if scheme in {"purelib", "platlib"} else scheme
        return "/".join((prefix, *parts[2:]))
    return "/".join(("site-packages", *parts))


def is_data_scheme_member(member_name: str) -> bool:
    parts = PurePosixPath(member_name).parts
    return len(parts) >= 3 and parts[0].endswith(".data") and parts[1] == "data"


def validate_data_scheme_policy(
    wheel_name: str,
    size_bytes: int,
    wheel_sha256: str,
    members: set[str],
) -> None:
    policy = ALLOWED_DATA_SCHEME_WHEEL_POLICY.get(wheel_name)
    if not members:
        if policy is not None:
            raise ValueError(f"{wheel_name}: runtime inventory is missing reviewed .data/data members")
        return
    if (
        policy is not None
        and size_bytes == policy["sizeBytes"]
        and wheel_sha256 == policy["sha256"]
        and members == policy["members"]
    ):
        return
    raise ValueError(
        f"{wheel_name}: runtime inventory rejects the .data/data wheel identity or member set"
    )


def validate_reserved_venv_install_path(wheel_name: str, destination: str) -> None:
    parts = PurePosixPath(destination).parts
    if (
        len(parts) >= 2
        and parts[0] == "scripts"
        and parts[1].lower() in RESERVED_VENV_SCRIPT_ROOTS
    ):
        raise ValueError(f"{wheel_name}: runtime inventory found a reserved venv script collision")
    if len(parts) >= 2 and parts[0] == "site-packages":
        root = parts[1].lower()
        if root == "pip" or (root.startswith("pip-") and root.endswith(".dist-info")):
            raise ValueError(f"{wheel_name}: runtime inventory found a seeded pip collision")


def is_startup_hook_destination(destination: str) -> bool:
    parts = tuple(part.lower() for part in PurePosixPath(destination).parts)
    if len(parts) < 2 or parts[0] != "site-packages":
        return False
    if len(parts) == 2 and parts[1].endswith(".pth"):
        return True
    root = parts[1]
    return any(
        root == module or root.startswith(f"{module}.")
        for module in ("sitecustomize", "usercustomize")
    )


def validate_startup_hook_policy(
    wheel_name: str,
    size_bytes: int,
    wheel_sha256: str,
    candidates: list[dict[str, object]],
    declared_removals: list[object],
) -> None:
    for removal in declared_removals:
        validate_removal_shape(removal)
    if not candidates:
        if declared_removals:
            raise ValueError(f"{wheel_name}: runtime inventory found a removal without a startup hook")
        return
    policy = SETUPTOOLS_RUNTIME_WHEEL_POLICY
    expected_candidate = policy["startupHook"]
    expected_removal = {"wheelFilename": wheel_name, **expected_candidate}
    if (
        wheel_name != policy["filename"]
        or size_bytes != policy["sizeBytes"]
        or wheel_sha256 != policy["sha256"]
        or candidates != [expected_candidate]
        or declared_removals != [expected_removal]
    ):
        paths = sorted(str(candidate.get("archivePath")) for candidate in candidates)
        raise ValueError(
            f"{wheel_name}: runtime inventory rejects startup-hook candidates {paths}"
        )


def parse_entry_point_scripts(wheel_name: str, content: bytes | None) -> list[str]:
    if content is None:
        return []
    try:
        parser = configparser.ConfigParser(interpolation=None, strict=True)
        parser.optionxform = str
        parser.read_string(content.decode("utf-8"))
    except (UnicodeDecodeError, configparser.Error) as error:
        raise ValueError(f"{wheel_name}: runtime inventory cannot parse entry points") from error
    scripts: list[str] = []
    for section in ("console_scripts", "gui_scripts"):
        if not parser.has_section(section):
            continue
        for script_name, target in parser.items(section):
            if (
                not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]*", script_name)
                or not target.strip()
                or any(character in target for character in "\r\n\x00")
            ):
                raise ValueError(f"{wheel_name}: runtime inventory found invalid entry-point metadata")
            scripts.append(f"scripts/{script_name}")
    if len(scripts) != len(set(scripts)):
        raise ValueError(f"{wheel_name}: runtime inventory found duplicate generated scripts")
    return sorted(scripts)


def register_install_paths(
    wheel_name: str,
    install_paths: list[str],
    files: dict[str, str],
    directories: set[str],
) -> None:
    for destination in install_paths:
        if destination in files:
            raise ValueError(f"runtime inventory collision at {destination}")
        if destination in directories:
            raise ValueError(f"runtime inventory file/directory collision at {destination}")
        parts = destination.split("/")
        for index in range(1, len(parts)):
            ancestor = "/".join(parts[:index])
            if ancestor in files:
                raise ValueError(f"runtime inventory file/directory collision at {ancestor}")
            directories.add(ancestor)
        files[destination] = wheel_name


def validate_removal_shape(removal: object) -> None:
    if not isinstance(removal, dict) or set(removal) != {
        "archivePath", "installPath", "sha256", "sizeBytes", "wheelFilename",
    }:
        raise ValueError("runtime inventory manifest contains an invalid removal record")
    if not all(isinstance(removal[key], str) and removal[key] for key in (
        "archivePath", "installPath", "sha256", "wheelFilename",
    )):
        raise ValueError("runtime inventory removal contains an invalid string")
    if (
        isinstance(removal["sizeBytes"], bool)
        or not isinstance(removal["sizeBytes"], int)
        or removal["sizeBytes"] < 1
        or removal["sizeBytes"] > 1_000_000
    ):
        raise ValueError("runtime inventory removal contains an invalid size")
    if not re.fullmatch(r"sha256:[0-9a-f]{64}", str(removal["sha256"])):
        raise ValueError("runtime inventory removal contains an invalid digest")


def canonical_directory(path: Path, label: str) -> Path:
    absolute = path.absolute()
    if absolute.resolve(strict=True) != absolute:
        raise ValueError(f"{label} must be canonical and symlink-free")
    metadata = absolute.lstat()
    if not stat.S_ISDIR(metadata.st_mode) or absolute.is_symlink():
        raise ValueError(f"{label} must be a real directory")
    return absolute


def read_regular(path: Path, max_bytes: int) -> bytes:
    metadata = path.lstat()
    if (
        not stat.S_ISREG(metadata.st_mode)
        or path.is_symlink()
        or metadata.st_nlink != 1
        or metadata.st_size < 1
        or metadata.st_size > max_bytes
    ):
        raise ValueError(f"{path.name}: expected a bounded regular file")
    descriptor = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
    with os.fdopen(descriptor, "rb") as handle:
        opened = os.fstat(handle.fileno())
        if file_identity(opened) != file_identity(metadata):
            raise ValueError(f"{path.name}: file changed while it was being opened")
        content = handle.read(max_bytes + 1)
        closed = os.fstat(handle.fileno())
    if len(content) > max_bytes or file_identity(closed) != file_identity(opened):
        raise ValueError(f"{path.name}: file changed while it was being read")
    return content


def reject_duplicate_json_keys(pairs: list[tuple[str, object]]) -> dict[str, object]:
    result: dict[str, object] = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f"runtime inventory manifest contains duplicate key {key!r}")
        result[key] = value
    return result


def file_identity(metadata: os.stat_result) -> tuple[int, int, int, int]:
    return metadata.st_dev, metadata.st_ino, metadata.st_size, metadata.st_mtime_ns


def canonical_json(value: object) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode("utf-8")


def canonical_digest(value: object) -> str:
    return sha256(canonical_json(value))


def sha256(value: bytes) -> str:
    return "sha256:" + hashlib.sha256(value).hexdigest()


if __name__ == "__main__":
    raise SystemExit(main())
