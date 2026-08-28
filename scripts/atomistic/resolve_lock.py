#!/usr/bin/env python3
"""Turn one already-resolved wheelhouse into a single-hash offline lock.

This script never resolves dependencies or accesses the network. The caller
must first use pip download in the pinned Linux/cp312 base image, then prove the
generated lock by recreating an empty environment with --network=none,
--no-index, --require-hashes and pip check.
"""

from __future__ import annotations

import argparse
import base64
import configparser
import csv
import hashlib
import hmac
import io
import json
import os
import re
import stat
import sys
import zipfile
from collections import deque
from email.parser import BytesParser
from pathlib import Path, PurePosixPath
from pip._vendor.packaging.markers import InvalidMarker
from pip._vendor.packaging.requirements import InvalidRequirement, Requirement
from pip._vendor.packaging.specifiers import InvalidSpecifier, SpecifierSet
from pip._vendor.packaging.utils import InvalidWheelFilename, parse_wheel_filename
from pip._vendor.packaging.version import InvalidVersion, Version
import pip
import pip._vendor.packaging as vendored_packaging


SCHEMA_VERSION = "tf.atomistic-wheelhouse-manifest/0.1"
DERIVED_WHEEL_PROVENANCE_SCHEMA_VERSION = "tf.python-hostlist-derived-wheel-provenance/0.1"
FROZEN_PLAN_RAW_DIGEST = "sha256:d3a58524029b51c598d00a7bb9f60b6479a9973a0f9907cbf94a31e61bf1c9c2"
PYTHON_HOSTLIST_SOURCE = {
    "url": "https://files.pythonhosted.org/packages/90/cc/bb6395c3f2b6bb739b1d3fc0e71f94e6a1c2e256df496237cbfd13cd74a6/python_hostlist-2.3.0.tar.gz",
    "filename": "python_hostlist-2.3.0.tar.gz",
    "sizeBytes": 37_326,
    "sha256": "sha256:e1a0b18e525a5fca573cb9862799f11b3f2bd3ba7aec70c4ecd8b95341bb71ea",
}
PYTHON_HOSTLIST_BUILD_TOOL_LOCK_DIGEST = "sha256:dffc06ecc2faab2b6e0fe729ac1c16dda524edff76297a06e20b839832e1e120"
PYTHON_HOSTLIST_BUILD_SCRIPT_DIGEST = "sha256:f004a9c004d4a91f985c0bc87b76e3ad9b7d9cb8a5428413b4732d3ff6d0cb84"
PYTHON_HOSTLIST_MEMBER_DIGEST_DOMAIN = b"tf.python-hostlist-wheel-members/v1\0"
PYTHON_HOSTLIST_INSTALL_PATH_DIGEST_DOMAIN = b"tf.python-hostlist-install-paths/v1\0"
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
NORMALIZE_PATTERN = re.compile(r"[-_.]+")
MAX_WHEEL_BYTES = 1_500_000_000
MAX_EXPANDED_BYTES = 4_000_000_000
MAX_ARCHIVE_MEMBERS = 250_000
MAX_WHEELHOUSE_BYTES = 5_000_000_000
MAX_WHEELHOUSE_EXPANDED_BYTES = 15_000_000_000
MAX_WHEELHOUSE_MEMBERS = 750_000
TARGET_MARKER_ENVIRONMENT = {
    "implementation_name": "cpython",
    "implementation_version": "3.12.13",
    "os_name": "posix",
    "platform_machine": "x86_64",
    "platform_python_implementation": "CPython",
    "platform_release": "",
    "platform_system": "Linux",
    "platform_version": "",
    "python_full_version": "3.12.13",
    "python_version": "3.12",
    "sys_platform": "linux",
}
ROOT_REQUIREMENTS = {
    "mattersim": (
        "mattersim==1.2.5",
        "torch==2.8.0+cpu",
        "torchvision==0.23.0+cpu",
        "torchaudio==2.8.0+cpu",
        "ase==3.28.0",
        "pymatgen==2025.4.17",
        "pymatgen-io-validation==0.1.2",
        "setuptools==84.0.0",
    ),
    "mace": (
        "mace-torch==0.3.16",
        "python-hostlist==2.3.0",
        "torch==2.8.0+cpu",
        "ase==3.28.0",
        "e3nn==0.4.4",
        "setuptools==84.0.0",
    ),
}


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--wheelhouse", type=Path, required=True)
    parser.add_argument("--output-lock", type=Path, required=True)
    parser.add_argument("--output-manifest", type=Path, required=True)
    parser.add_argument("--plan", type=Path, required=True)
    parser.add_argument("--model", choices=("mattersim", "mace"), required=True)
    parser.add_argument("--derived-wheel-manifest", type=Path)
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(sys.argv[1:] if argv is None else argv)
    plan_bytes = read_regular(args.plan, max_bytes=5_000_000)
    if sha256(plan_bytes) != FROZEN_PLAN_RAW_DIGEST:
        raise ValueError("reproduction plan bytes differ from the frozen preregistration")
    plan = json.loads(plan_bytes)
    if plan.get("schemaVersion") != "tf.atomistic-reproduction/0.2":
        raise ValueError("reproduction plan must use tf.atomistic-reproduction/0.2")
    model_id = "mattersim-v1.0.0-5m" if args.model == "mattersim" else "mace-mpa-0-medium"
    model = next((entry for entry in plan["models"] if entry.get("id") == model_id), None)
    if model is None:
        raise ValueError(f"plan does not contain {model_id}")

    wheelhouse = canonical_directory(args.wheelhouse, "wheelhouse")
    wheel_paths = sorted(wheelhouse.iterdir(), key=lambda candidate: candidate.name)
    if not wheel_paths:
        raise ValueError("wheelhouse is empty")
    if any(candidate.suffix != ".whl" for candidate in wheel_paths):
        names = [candidate.name for candidate in wheel_paths if candidate.suffix != ".whl"]
        raise ValueError(f"wheelhouse contains non-wheel artifacts: {names}")

    distributions: dict[str, dict[str, object]] = {}
    installed_files: dict[str, str] = {}
    installed_directories: set[str] = set()
    startup_hook_removals: list[dict[str, object]] = []
    for wheel_path in wheel_paths:
        wheel = inspect_wheel(wheel_path)
        normalized = normalize_name(wheel["name"])
        if normalized in distributions:
            raise ValueError(f"wheelhouse contains multiple files for {normalized}")
        register_install_paths(wheel, installed_files, installed_directories)
        startup_hook_removals.extend(wheel["startupHookRemovals"])
        distributions[normalized] = wheel
    if sum(int(wheel["sizeBytes"]) for wheel in distributions.values()) > MAX_WHEELHOUSE_BYTES:
        raise ValueError("wheelhouse compressed bytes exceed policy")
    if sum(int(wheel["expandedSizeBytes"]) for wheel in distributions.values()) > MAX_WHEELHOUSE_EXPANDED_BYTES:
        raise ValueError("wheelhouse expanded bytes exceed policy")
    if sum(int(wheel["archiveMemberCount"]) for wheel in distributions.values()) > MAX_WHEELHOUSE_MEMBERS:
        raise ValueError("wheelhouse archive member count exceeds policy")

    expected_package = model["package"]
    expected_name = normalize_name(expected_package["name"])
    package = distributions.get(expected_name)
    if package is None:
        raise ValueError(f"wheelhouse does not contain the pinned {expected_name} package")
    expected_digest = expected_package["sha256"]
    if package["filename"] != expected_package["filename"]:
        raise ValueError("model package filename differs from the plan")
    if package["version"] != expected_package["version"]:
        raise ValueError("model package version differs from the plan")
    if package["sizeBytes"] != expected_package["sizeBytes"] or package["sha256"] != expected_digest:
        raise ValueError("model package bytes differ from the plan")

    if args.model == "mace":
        if args.derived_wheel_manifest is None:
            raise ValueError("MACE resolution requires the python-hostlist derived-wheel provenance")
        derived_wheel_provenance = validate_derived_wheel_provenance(
            read_regular(args.derived_wheel_manifest, max_bytes=8_192),
            distributions,
            str(plan["protocol"]["runner"]["baseImage"]),
        )
    else:
        if args.derived_wheel_manifest is not None:
            raise ValueError("MatterSim resolution may not accept a derived-wheel provenance")
        derived_wheel_provenance = None

    dependency_graph = validate_dependency_closure(args.model, distributions)
    removed_install_paths = {str(entry["installPath"]) for entry in startup_hook_removals}
    runtime_installed_files = {
        destination: wheel_name
        for destination, wheel_name in installed_files.items()
        if destination not in removed_install_paths
    }

    lock_lines = [
        "# Generated from one reviewed cp312/Linux x86_64 wheelhouse.",
        "# Install only with --no-index --require-hashes --only-binary=:all:.",
    ]
    for normalized, wheel in sorted(distributions.items()):
        lock_lines.extend([
            f"{normalized}=={wheel['version']} \\",
            f"    --hash={wheel['sha256']}",
        ])
    lock_bytes = ("\n".join(lock_lines) + "\n").encode("utf-8")
    lock_digest = sha256(lock_bytes)

    manifest = {
        "schemaVersion": SCHEMA_VERSION,
        "model": args.model,
        "modelId": model_id,
        "planDigest": sha256(plan_bytes),
        "python": plan["protocol"]["runner"]["python"],
        "platform": plan["protocol"]["runner"]["platform"],
        "architecture": plan["protocol"]["runner"]["architecture"],
        "baseImage": plan["protocol"]["runner"]["baseImage"],
        "baseImageAmd64Digest": plan["protocol"]["runner"]["baseImageAmd64Digest"],
        "lockDigest": lock_digest,
        "wheelCount": len(distributions),
        "dependencyRoots": list(ROOT_REQUIREMENTS[args.model]),
        "dependencyGraphDigest": canonical_digest(dependency_graph),
        "derivedWheelProvenance": derived_wheel_provenance,
        "resolverDigest": sha256(read_regular(Path(__file__).resolve(), max_bytes=2_000_000)),
        "resolverRuntime": {
            "pip": pip.__version__,
            "vendoredPackaging": getattr(vendored_packaging, "__version__", "unknown"),
        },
        "installedFileCount": len(installed_files),
        "installedPathDigest": canonical_digest(sorted(installed_files)),
        "startupHookRemovals": sorted(
            startup_hook_removals,
            key=lambda entry: (str(entry["wheelFilename"]), str(entry["installPath"])),
        ),
        "runtimeInstalledFileCount": len(runtime_installed_files),
        "runtimeInstalledPathDigest": canonical_digest(sorted(runtime_installed_files)),
        "wheels": [public_wheel(distributions[name]) for name in sorted(distributions)],
    }
    manifest_bytes = (json.dumps(manifest, ensure_ascii=True, indent=2, sort_keys=True) + "\n").encode("utf-8")
    write_new(args.output_lock, lock_bytes)
    write_new(args.output_manifest, manifest_bytes)
    print(json.dumps({"model": args.model, "wheelCount": len(distributions), "lockDigest": lock_digest}, sort_keys=True))
    return 0


def validate_derived_wheel_provenance(
    content: bytes,
    distributions: dict[str, dict[str, object]],
    expected_builder_image: str,
) -> dict[str, object]:
    try:
        manifest = json.loads(content, object_pairs_hook=reject_duplicate_json_keys)
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise ValueError("derived-wheel provenance is not strict UTF-8 JSON") from error
    if not isinstance(manifest, dict) or set(manifest) != {
        "schemaVersion", "derivationId", "promotionEligible", "source",
        "builder", "reproducibility", "wheel",
    }:
        raise ValueError("derived-wheel provenance has an unexpected claim surface")
    if (
        manifest["schemaVersion"] != DERIVED_WHEEL_PROVENANCE_SCHEMA_VERSION
        or manifest["derivationId"] != "python-hostlist-2.3.0"
        or manifest["promotionEligible"] is not False
        or manifest["source"] != PYTHON_HOSTLIST_SOURCE
    ):
        raise ValueError("derived-wheel provenance identity or source drifted")

    builder = manifest["builder"]
    if not isinstance(builder, dict) or set(builder) != {
        "image", "buildToolLockDigest", "buildScriptDigest",
    } or builder != {
        "image": expected_builder_image,
        "buildToolLockDigest": PYTHON_HOSTLIST_BUILD_TOOL_LOCK_DIGEST,
        "buildScriptDigest": PYTHON_HOSTLIST_BUILD_SCRIPT_DIGEST,
    }:
        raise ValueError("derived-wheel builder trust roots drifted")

    wheel = manifest["wheel"]
    expected_wheel_keys = {
        "filename", "name", "normalizedName", "version", "tag", "sizeBytes",
        "sha256", "archiveMemberCount", "expandedSizeBytes", "memberDigest",
        "installedPathDigest",
    }
    distribution = distributions.get("python-hostlist")
    if not isinstance(wheel, dict) or set(wheel) != expected_wheel_keys or distribution is None:
        raise ValueError("derived-wheel provenance lacks the exact python-hostlist wheel")
    if (
        wheel["filename"] != "python_hostlist-2.3.0-py3-none-any.whl"
        or wheel["name"] != "python_hostlist"
        or wheel["normalizedName"] != "python-hostlist"
        or wheel["version"] != "2.3.0"
        or wheel["tag"] != "py3-none-any"
        or wheel["filename"] != distribution["filename"]
        or wheel["version"] != distribution["version"]
        or wheel["sizeBytes"] != distribution["sizeBytes"]
        or wheel["sha256"] != distribution["sha256"]
        or wheel["archiveMemberCount"] != distribution["archiveMemberCount"]
        or wheel["expandedSizeBytes"] != distribution["expandedSizeBytes"]
        or wheel["memberDigest"] != distribution.get("_derivedMemberDigest")
        or wheel["installedPathDigest"] != distribution.get("_derivedInstalledPathDigest")
    ):
        raise ValueError("derived-wheel provenance does not bind the wheelhouse bytes")
    for digest_field in ("sha256", "memberDigest", "installedPathDigest"):
        if not isinstance(wheel[digest_field], str) or not re.fullmatch(r"sha256:[0-9a-f]{64}", wheel[digest_field]):
            raise ValueError("derived-wheel provenance contains a malformed digest")
    for integer_field in ("sizeBytes", "archiveMemberCount", "expandedSizeBytes"):
        value = wheel[integer_field]
        if isinstance(value, bool) or not isinstance(value, int) or value < 1:
            raise ValueError("derived-wheel provenance contains an invalid bounded count")

    reproducibility = manifest["reproducibility"]
    if not isinstance(reproducibility, dict) or set(reproducibility) != {
        "firstBuildDigest", "secondBuildDigest", "byteIdentical",
    } or reproducibility != {
        "firstBuildDigest": distribution["sha256"],
        "secondBuildDigest": distribution["sha256"],
        "byteIdentical": True,
    }:
        raise ValueError("derived-wheel dual-build evidence does not bind the wheel bytes")
    return {
        "schemaVersion": DERIVED_WHEEL_PROVENANCE_SCHEMA_VERSION,
        "manifestDigest": sha256(content),
        "sourceSha256": PYTHON_HOSTLIST_SOURCE["sha256"],
        "wheelFilename": wheel["filename"],
        "wheelSha256": wheel["sha256"],
        "promotionEligible": False,
    }


def reject_duplicate_json_keys(pairs: list[tuple[str, object]]) -> dict[str, object]:
    result: dict[str, object] = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f"derived-wheel provenance contains duplicate key {key!r}")
        result[key] = value
    return result


def inspect_wheel(path: Path) -> dict[str, object]:
    metadata = path.lstat()
    if not stat.S_ISREG(metadata.st_mode) or path.is_symlink():
        raise ValueError(f"{path.name}: wheel is not a regular file")
    if metadata.st_nlink != 1:
        raise ValueError(f"{path.name}: wheel must not be a hard link")
    if metadata.st_size < 1 or metadata.st_size > MAX_WHEEL_BYTES:
        raise ValueError(f"{path.name}: wheel byte length is outside policy")
    try:
        filename_name, filename_version, _, parsed_filename_tags = parse_wheel_filename(path.name)
    except InvalidWheelFilename as error:
        raise ValueError(f"{path.name}: malformed wheel filename") from error
    filename_tags = {(tag.interpreter, tag.abi, tag.platform) for tag in parsed_filename_tags}
    descriptor = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
    derived_member_digest: str | None = None
    with os.fdopen(descriptor, "rb") as handle:
        opened = os.fstat(handle.fileno())
        if (opened.st_dev, opened.st_ino, opened.st_size, opened.st_mtime_ns) != (metadata.st_dev, metadata.st_ino, metadata.st_size, metadata.st_mtime_ns):
            raise ValueError(f"{path.name}: wheel changed while it was being opened")
        digest = hashlib.sha256()
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
        handle.seek(0)
        with zipfile.ZipFile(handle) as archive:
            members = archive.infolist()
            if len(members) > MAX_ARCHIVE_MEMBERS:
                raise ValueError(f"{path.name}: wheel contains too many archive members")
            member_names: set[str] = set()
            for info in members:
                validate_archive_member(path.name, info, member_names)
            expanded_size = sum(info.file_size for info in members)
            if expanded_size > MAX_EXPANDED_BYTES:
                raise ValueError(f"{path.name}: expanded wheel size exceeds policy")
            member_by_name = {info.filename: info for info in members}
            top_level_dist_info = sorted({
                parts[0]
                for info in members
                if (parts := PurePosixPath(info.filename).parts)
                and parts[0].endswith(".dist-info")
            })
            if len(top_level_dist_info) != 1:
                raise ValueError(f"{path.name}: wheel must contain exactly one top-level dist-info directory")
            dist_info = top_level_dist_info[0]
            metadata_member = member_by_name.get(f"{dist_info}/METADATA")
            wheel_member = member_by_name.get(f"{dist_info}/WHEEL")
            record_member = member_by_name.get(f"{dist_info}/RECORD")
            if metadata_member is None or metadata_member.is_dir() or metadata_member.file_size > 10_000_000:
                raise ValueError(f"{path.name}: wheel must contain one bounded top-level METADATA file")
            if wheel_member is None or wheel_member.is_dir() or wheel_member.file_size > 1_000_000:
                raise ValueError(f"{path.name}: wheel must contain one bounded top-level WHEEL file")
            if record_member is None or record_member.is_dir() or record_member.file_size > 50_000_000:
                raise ValueError(f"{path.name}: wheel must contain one bounded top-level RECORD file")
            entry_point_member = member_by_name.get(f"{dist_info}/entry_points.txt")
            if entry_point_member is not None and (
                entry_point_member.is_dir() or entry_point_member.file_size > 1_000_000
            ):
                raise ValueError(f"{path.name}: wheel contains invalid top-level entry_points.txt metadata")
            message = BytesParser().parsebytes(archive.read(metadata_member))
            wheel_message = BytesParser().parsebytes(archive.read(wheel_member))
            validate_record(path.name, archive, members, record_member)
            if path.name == "python_hostlist-2.3.0-py3-none-any.whl":
                member_records = [
                    {
                        "path": info.filename,
                        "sizeBytes": info.file_size,
                        "sha256": sha256(archive.read(info)),
                    }
                    for info in sorted(members, key=lambda entry: entry.filename)
                    if not info.is_dir()
                ]
                derived_member_digest = canonical_domain_digest(
                    PYTHON_HOSTLIST_MEMBER_DIGEST_DOMAIN, member_records
                )
            generated_script_paths = parse_entry_point_scripts(
                path.name,
                archive.read(entry_point_member) if entry_point_member is not None else None,
            )
            for generated_script_path in generated_script_paths:
                validate_reserved_venv_install_path(path.name, generated_script_path)
            startup_hook_candidates = []
            for info in members:
                validate_reserved_venv_install_path(path.name, install_destination(info.filename))
                if info.is_dir():
                    continue
                destination = install_destination(info.filename)
                if is_startup_hook_destination(destination):
                    startup_hook_candidates.append({
                        "archivePath": info.filename,
                        "installPath": destination,
                        "sizeBytes": info.file_size,
                        "sha256": sha256(archive.read(info)),
                    })
        closed = os.fstat(handle.fileno())
        if (closed.st_dev, closed.st_ino, closed.st_size, closed.st_mtime_ns) != (opened.st_dev, opened.st_ino, opened.st_size, opened.st_mtime_ns):
            raise ValueError(f"{path.name}: wheel changed while it was being inspected")
    names = message.get_all("Name", [])
    versions = message.get_all("Version", [])
    if len(names) != 1 or len(versions) != 1:
        raise ValueError(f"{path.name}: wheel metadata must contain exactly one Name and Version")
    name = names[0].strip()
    version = versions[0].strip()
    if not name or not version or any(character.isspace() for character in version):
        raise ValueError(f"{path.name}: wheel metadata lacks a valid Name or Version")
    try:
        metadata_version = Version(version)
    except InvalidVersion as error:
        raise ValueError(f"{path.name}: wheel metadata contains an invalid Version") from error
    if metadata_version.is_prerelease or metadata_version.is_devrelease:
        raise ValueError(f"{path.name}: pre-release and development wheels are forbidden")
    if normalize_name(name) != normalize_name(str(filename_name)) or metadata_version != filename_version:
        raise ValueError(f"{path.name}: filename distribution/version differs from METADATA")
    dist_info_name, dist_info_version = parse_dist_info_directory(path.name, dist_info)
    if normalize_name(name) != normalize_name(dist_info_name) or metadata_version != dist_info_version:
        raise ValueError(f"{path.name}: dist-info distribution/version differs from METADATA")
    wheel_digest = f"sha256:{digest.hexdigest()}"
    validate_data_scheme_policy(
        path.name,
        opened.st_size,
        wheel_digest,
        {info.filename for info in members if is_data_scheme_member(info.filename)},
    )
    startup_hook_removals = validate_startup_hook_policy(
        path.name,
        name,
        version,
        opened.st_size,
        wheel_digest,
        startup_hook_candidates,
    )
    requires_python = message.get("Requires-Python")
    if requires_python:
        try:
            python_compatible = Version("3.12.13") in SpecifierSet(requires_python)
        except (InvalidSpecifier, InvalidVersion) as error:
            raise ValueError(f"{path.name}: invalid Requires-Python metadata") from error
        if not python_compatible:
            raise ValueError(f"{path.name}: Requires-Python excludes 3.12.13")
    metadata_tags: set[tuple[str, str, str]] = set()
    for raw_tag in wheel_message.get_all("Tag", []):
        metadata_tags.update(expand_tag(raw_tag.strip(), f"{path.name}: WHEEL Tag"))
    if not metadata_tags:
        raise ValueError(f"{path.name}: WHEEL metadata contains no Tag")
    matching_tags = filename_tags & metadata_tags
    if not matching_tags:
        raise ValueError(f"{path.name}: filename and WHEEL metadata tags do not match")
    if not any(cp312_linux_x86_64_compatible(tag) for tag in matching_tags):
        raise ValueError(f"{path.name}: wheel is incompatible with cp312/Linux x86_64")
    requires_dist = message.get_all("Requires-Dist", [])
    requirements: list[Requirement] = []
    for raw_requirement in requires_dist:
        try:
            requirement = Requirement(raw_requirement)
        except InvalidRequirement as error:
            raise ValueError(f"{path.name}: invalid Requires-Dist metadata") from error
        if requirement.url is not None:
            raise ValueError(f"{path.name}: direct-URL Requires-Dist is forbidden")
        if requirement.marker and re.search(r"\bplatform_(?:release|version)\b", str(requirement.marker)):
            raise ValueError(f"{path.name}: Requires-Dist marker depends on an unfrozen kernel version")
        requirements.append(requirement)
    raw_provided_extras = message.get_all("Provides-Extra", [])
    if any(not re.fullmatch(r"[A-Za-z0-9]+(?:[-_.][A-Za-z0-9]+)*", extra) for extra in raw_provided_extras):
        raise ValueError(f"{path.name}: invalid Provides-Extra metadata")
    provided_extras = sorted({normalize_name(extra) for extra in raw_provided_extras})
    install_paths = sorted([
        install_destination(info.filename)
        for info in members
        if not info.is_dir()
    ] + generated_script_paths)
    installed_metadata_roots: set[str] = set()
    for info in members:
        if info.is_dir():
            continue
        destination_parts = PurePosixPath(install_destination(info.filename)).parts
        if len(destination_parts) < 2 or destination_parts[0] != "site-packages":
            continue
        runtime_root = destination_parts[1]
        lowered_root = runtime_root.lower()
        if not (lowered_root.endswith(".dist-info") or lowered_root.endswith(".egg-info")):
            continue
        installed_metadata_roots.add(runtime_root)
        archive_parts = PurePosixPath(info.filename).parts
        if runtime_root != dist_info or archive_parts[0] != dist_info:
            raise ValueError(
                f"{path.name}: installed metadata must come only from its direct top-level dist-info directory"
            )
    if installed_metadata_roots != {dist_info}:
        raise ValueError(f"{path.name}: wheel must install exactly its one direct top-level dist-info directory")
    derived_install_path_digest = (
        canonical_domain_digest(
            PYTHON_HOSTLIST_INSTALL_PATH_DIGEST_DOMAIN, install_paths
        )
        if path.name == "python_hostlist-2.3.0-py3-none-any.whl"
        else None
    )
    return {
        "filename": path.name,
        "name": name,
        "normalizedName": normalize_name(name),
        "version": version,
        "requiresPython": requires_python,
        "python31213Compatible": True,
        "sizeBytes": opened.st_size,
        "expandedSizeBytes": expanded_size,
        "archiveMemberCount": len(members),
        "sha256": wheel_digest,
        "requiresDist": requires_dist,
        "requirements": requirements,
        "providesExtras": provided_extras,
        "installPaths": install_paths,
        "installPathDigest": canonical_digest(install_paths),
        "_derivedMemberDigest": derived_member_digest,
        "_derivedInstalledPathDigest": derived_install_path_digest,
        "generatedScripts": generated_script_paths,
        "startupHookRemovals": startup_hook_removals,
    }


def validate_archive_member(wheel_name: str, info: zipfile.ZipInfo, seen: set[str]) -> None:
    filename = info.filename
    if (not filename or "\x00" in filename or "\\" in filename or filename.startswith("/")
            or filename in seen):
        raise ValueError(f"{wheel_name}: wheel contains a duplicate or unsafe archive path")
    path = PurePosixPath(filename)
    canonical_filename = path.as_posix() + ("/" if info.is_dir() else "")
    if (
        path.is_absolute()
        or filename != canonical_filename
        or any(part in {"", ".", ".."} for part in path.parts)
    ):
        raise ValueError(f"{wheel_name}: wheel contains an unsafe archive path")
    seen.add(filename)
    mode = (info.external_attr >> 16) & 0xFFFF
    file_type = stat.S_IFMT(mode)
    if file_type not in {0, stat.S_IFREG, stat.S_IFDIR} or (file_type == stat.S_IFDIR) != info.is_dir():
        raise ValueError(f"{wheel_name}: wheel contains a link or special archive member")
    if info.flag_bits & 0x1:
        raise ValueError(f"{wheel_name}: encrypted wheel members are forbidden")
    if info.file_size < 0 or info.compress_size < 0:
        raise ValueError(f"{wheel_name}: wheel member has an invalid size")


def validate_record(wheel_name: str, archive: zipfile.ZipFile,
                    members: list[zipfile.ZipInfo], record_member: zipfile.ZipInfo) -> None:
    try:
        record_text = archive.read(record_member).decode("utf-8")
        rows = list(csv.reader(io.StringIO(record_text, newline="")))
    except (UnicodeDecodeError, csv.Error) as error:
        raise ValueError(f"{wheel_name}: RECORD is not valid UTF-8 CSV") from error
    record_paths: set[str] = set()
    member_by_name = {member.filename: member for member in members if not member.is_dir()}
    for row in rows:
        if len(row) != 3 or not row[0] or row[0] in record_paths:
            raise ValueError(f"{wheel_name}: RECORD contains malformed or duplicate rows")
        path = row[0]
        path_info = zipfile.ZipInfo(path)
        validate_archive_member(wheel_name, path_info, record_paths)
        if path not in member_by_name:
            raise ValueError(f"{wheel_name}: RECORD references a missing archive member")
        if path == record_member.filename:
            if row[1] or row[2]:
                raise ValueError(f"{wheel_name}: RECORD self-row must have empty hash and size")
            continue
        if not row[2] or not row[2].isdigit() or int(row[2]) != member_by_name[path].file_size:
            raise ValueError(f"{wheel_name}: RECORD contains an incorrect member size")
        if not row[1]:
            raise ValueError(f"{wheel_name}: RECORD omits a required member hash")
        match = re.fullmatch(r"(sha(?:256|384|512))=([A-Za-z0-9_-]+)", row[1])
        if not match:
            raise ValueError(f"{wheel_name}: RECORD contains a weak or malformed member hash")
        algorithm, encoded = match.groups()
        digest_size = hashlib.new(algorithm).digest_size
        expected_encoded_length = (digest_size * 8 + 5) // 6
        if len(encoded) != expected_encoded_length:
            raise ValueError(f"{wheel_name}: RECORD member hash has the wrong length")
        try:
            claimed_digest = base64.b64decode(
                encoded + "=" * (-len(encoded) % 4), altchars=b"-_", validate=True,
            )
        except (ValueError, TypeError) as error:
            raise ValueError(f"{wheel_name}: RECORD member hash is not canonical base64url") from error
        if len(claimed_digest) != digest_size:
            raise ValueError(f"{wheel_name}: RECORD member hash has the wrong decoded length")
        canonical_encoded = base64.urlsafe_b64encode(claimed_digest).rstrip(b"=").decode("ascii")
        if not hmac.compare_digest(canonical_encoded, encoded):
            raise ValueError(f"{wheel_name}: RECORD member hash is not canonical base64url")
        actual_hash = hashlib.new(algorithm)
        expanded_bytes = 0
        with archive.open(member_by_name[path], "r") as member_handle:
            for chunk in iter(lambda: member_handle.read(1024 * 1024), b""):
                expanded_bytes += len(chunk)
                actual_hash.update(chunk)
        if (expanded_bytes != member_by_name[path].file_size
                or not hmac.compare_digest(actual_hash.digest(), claimed_digest)):
            raise ValueError(f"{wheel_name}: RECORD member hash does not match archive bytes")
    unsigned_signatures = {
        name for name in member_by_name
        if name in {record_member.filename + ".jws", record_member.filename + ".p7s"}
    }
    if record_paths != set(member_by_name) - unsigned_signatures:
        raise ValueError(f"{wheel_name}: RECORD does not enumerate every archive file")


def parse_dist_info_directory(wheel_name: str, dist_info: str) -> tuple[str, Version]:
    directory = PurePosixPath(dist_info).name
    stem = directory.removesuffix(".dist-info")
    if "-" not in stem:
        raise ValueError(f"{wheel_name}: malformed dist-info directory")
    distribution, raw_version = stem.rsplit("-", 1)
    try:
        return distribution, Version(raw_version)
    except InvalidVersion as error:
        raise ValueError(f"{wheel_name}: invalid dist-info version") from error


def parse_entry_point_scripts(wheel_name: str, content: bytes | None) -> list[str]:
    if content is None:
        return []
    try:
        text = content.decode("utf-8")
        parser = configparser.ConfigParser(interpolation=None, strict=True)
        parser.optionxform = str
        parser.read_string(text)
    except (UnicodeDecodeError, configparser.Error) as error:
        raise ValueError(f"{wheel_name}: entry_points.txt is not strict UTF-8 INI") from error
    scripts: list[str] = []
    for section in ("console_scripts", "gui_scripts"):
        if not parser.has_section(section):
            continue
        for script_name, target in parser.items(section):
            if (not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]*", script_name)
                    or not target.strip() or any(character in target for character in "\r\n\x00")):
                raise ValueError(f"{wheel_name}: entry point script metadata is invalid")
            scripts.append(f"scripts/{script_name}")
    if len(scripts) != len(set(scripts)):
        raise ValueError(f"{wheel_name}: duplicate generated entry point script")
    return sorted(scripts)


def install_destination(member_name: str) -> str:
    parts = PurePosixPath(member_name).parts
    if len(parts) >= 3 and parts[0].endswith(".data"):
        scheme = parts[1]
        if scheme not in {"purelib", "platlib", "headers", "scripts", "data"}:
            raise ValueError(f"wheel contains an unsupported .data installation scheme {scheme!r}")
        prefix = "site-packages" if scheme in {"purelib", "platlib"} else scheme
        destination_parts = (prefix, *parts[2:])
    else:
        destination_parts = ("site-packages", *parts)
    return "/".join(destination_parts)


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
            raise ValueError(f"{wheel_name}: reviewed .data/data member set is missing")
        return
    if (
        policy is not None
        and size_bytes == policy["sizeBytes"]
        and wheel_sha256 == policy["sha256"]
        and members == policy["members"]
    ):
        return
    raise ValueError(
        f"{wheel_name}: .data/data wheel identity or complete member set is outside policy"
    )


def validate_reserved_venv_install_path(wheel_name: str, destination: str) -> None:
    parts = PurePosixPath(destination).parts
    if (
        len(parts) >= 2
        and parts[0] == "scripts"
        and parts[1].lower() in RESERVED_VENV_SCRIPT_ROOTS
    ):
        raise ValueError(f"{wheel_name}: install path collides with a reserved venv script")
    if len(parts) >= 2 and parts[0] == "site-packages":
        root = parts[1].lower()
        if root == "pip" or (root.startswith("pip-") and root.endswith(".dist-info")):
            raise ValueError(f"{wheel_name}: install path collides with the venv's seeded pip")


def is_startup_hook_destination(destination: str) -> bool:
    parts = tuple(part.lower() for part in PurePosixPath(destination).parts)
    if len(parts) < 2 or parts[0] != "site-packages":
        return False
    # Python's site bootstrap processes only .pth files that are direct
    # children of a site-packages directory. Nested .pth payloads (for
    # example, model weights) are inert data rather than startup hooks.
    if len(parts) == 2 and parts[1].endswith(".pth"):
        return True
    # sitecustomize and usercustomize are imported by top-level module name.
    # Match their direct module/package root without treating vendored nested
    # paths that happen to contain those names as importable customization.
    root = parts[1]
    startup_modules = ("sitecustomize", "usercustomize")
    return any(
        root == module or root.startswith(f"{module}.")
        for module in startup_modules
    )


def validate_startup_hook_policy(
    wheel_filename: str,
    name: str,
    version: str,
    size_bytes: int,
    wheel_sha256: str,
    candidates: list[dict[str, object]],
) -> list[dict[str, object]]:
    if not candidates:
        return []
    policy = SETUPTOOLS_RUNTIME_WHEEL_POLICY
    expected_hook = policy["startupHook"]
    if (
        wheel_filename != policy["filename"]
        or normalize_name(name) != normalize_name(str(policy["name"]))
        or version != policy["version"]
        or size_bytes != policy["sizeBytes"]
        or wheel_sha256 != policy["sha256"]
        or candidates != [expected_hook]
    ):
        paths = sorted(str(candidate.get("archivePath")) for candidate in candidates)
        raise ValueError(f"{wheel_filename}: wheel startup-hook path is forbidden: {paths}")
    return [{"wheelFilename": wheel_filename, **expected_hook}]


def register_install_paths(wheel: dict[str, object], files: dict[str, str],
                           directories: set[str]) -> None:
    wheel_name = str(wheel["filename"])
    for destination in wheel["installPaths"]:
        if destination in files:
            raise ValueError(f"wheel install-path collision at {destination}: {files[destination]} and {wheel_name}")
        if destination in directories:
            raise ValueError(f"wheel file/directory collision at {destination}")
        parts = destination.split("/")
        for index in range(1, len(parts)):
            ancestor = "/".join(parts[:index])
            if ancestor in files:
                raise ValueError(f"wheel file/directory collision at {ancestor}")
            directories.add(ancestor)
        files[destination] = wheel_name


def validate_dependency_closure(model: str, distributions: dict[str, dict[str, object]]) -> dict[str, object]:
    roots = [parse_requirement(raw, "root requirement") for raw in ROOT_REQUIREMENTS[model]]
    reached: set[str] = set()
    requested_extras: dict[str, set[str]] = {}
    processed: dict[str, set[str]] = {}
    edges: list[dict[str, object]] = []
    edge_keys: set[str] = set()
    queue: deque[tuple[str, Requirement, str]] = deque((normalize_name(root.name), root, "<root>") for root in roots)
    while queue:
        normalized, requirement, parent = queue.popleft()
        wheel = distributions.get(normalized)
        if wheel is None:
            raise ValueError(f"dependency closure is missing {requirement.name!r}, required by {parent}")
        try:
            version_satisfies = requirement.specifier.contains(Version(str(wheel["version"])), prereleases=True)
        except (InvalidSpecifier, InvalidVersion) as error:
            raise ValueError(f"invalid dependency version constraint for {requirement.name}") from error
        if not version_satisfies:
            raise ValueError(
                f"dependency {requirement.name}=={wheel['version']} does not satisfy {requirement.specifier or '<any>'}, required by {parent}"
            )
        normalized_requirement_extras = {normalize_name(extra) for extra in requirement.extras}
        unknown_extras = normalized_requirement_extras - set(wheel["providesExtras"])
        if unknown_extras:
            raise ValueError(f"dependency {requirement.name} requests undeclared extras {sorted(unknown_extras)}")
        reached.add(normalized)
        extras = requested_extras.setdefault(normalized, set())
        extras.update(normalized_requirement_extras)
        # pip evaluates dependency markers once for the base distribution and
        # once for every requested extra. The empty base context remains active
        # even when one or more extras are requested.
        contexts = {"", *extras}
        new_contexts = contexts - processed.setdefault(normalized, set())
        if not new_contexts:
            continue
        processed[normalized].update(new_contexts)
        for child in wheel["requirements"]:
            if not marker_applies(child, new_contexts, wheel_name=str(wheel["filename"])):
                continue
            child_normalized = normalize_name(child.name)
            edge = {
                "from": normalized,
                "to": child_normalized,
                "specifier": str(child.specifier),
                "extras": sorted(normalize_name(extra) for extra in child.extras),
                "marker": str(child.marker) if child.marker else None,
            }
            edge_key = json.dumps(edge, sort_keys=True, separators=(",", ":"))
            if edge_key not in edge_keys:
                edges.append(edge)
                edge_keys.add(edge_key)
            queue.append((child_normalized, child, normalized))
    orphans = sorted(set(distributions) - reached)
    if orphans:
        raise ValueError(f"wheelhouse contains orphan distributions outside the exact dependency closure: {orphans}")
    return {
        "roots": list(ROOT_REQUIREMENTS[model]),
        "distributions": sorted(reached),
        "edges": sorted(edges, key=lambda edge: json.dumps(edge, sort_keys=True, separators=(",", ":"))),
    }


def parse_requirement(raw: str, label: str) -> Requirement:
    try:
        requirement = Requirement(raw)
    except InvalidRequirement as error:
        raise ValueError(f"invalid {label}") from error
    if requirement.url is not None:
        raise ValueError(f"direct URL in {label} is forbidden")
    return requirement


def marker_applies(requirement: Requirement, extras: set[str], *, wheel_name: str) -> bool:
    if requirement.marker is None:
        return True
    try:
        return any(requirement.marker.evaluate({**TARGET_MARKER_ENVIRONMENT, "extra": extra}) for extra in extras)
    except (InvalidMarker, KeyError, TypeError, ValueError) as error:
        raise ValueError(f"{wheel_name}: cannot evaluate Requires-Dist marker for the frozen target") from error


def public_wheel(wheel: dict[str, object]) -> dict[str, object]:
    return {
        key: value
        for key, value in wheel.items()
        if key not in {
            "requirements", "installPaths", "_derivedMemberDigest",
            "_derivedInstalledPathDigest",
        }
    }


def expand_tag(raw_tag: str, label: str) -> set[tuple[str, str, str]]:
    parts = raw_tag.split("-")
    if len(parts) != 3 or any(not part for part in parts):
        raise ValueError(f"{label} is malformed")
    interpreters, abis, platforms = (part.split(".") for part in parts)
    if any(not token or not re.fullmatch(r"[A-Za-z0-9_]+", token) for tokens in (interpreters, abis, platforms) for token in tokens):
        raise ValueError(f"{label} contains an invalid tag token")
    return {(interpreter.lower(), abi.lower(), platform_tag.lower()) for interpreter in interpreters for abi in abis for platform_tag in platforms}


def cp312_linux_x86_64_compatible(tag: tuple[str, str, str]) -> bool:
    interpreter, abi, platform_tag = tag
    if interpreter in {"py3", "py312"}:
        interpreter_compatible = abi == "none"
    elif interpreter == "cp312":
        interpreter_compatible = abi in {"cp312", "abi3", "none"}
    else:
        abi3_match = re.fullmatch(r"cp3([0-9]+)", interpreter)
        interpreter_compatible = bool(abi3_match and int(abi3_match.group(1)) <= 12 and abi == "abi3")
    if not interpreter_compatible:
        return False
    if platform_tag == "any":
        return abi == "none"
    if platform_tag in {"linux_x86_64", "manylinux1_x86_64", "manylinux2010_x86_64", "manylinux2014_x86_64"}:
        return True
    manylinux = re.fullmatch(r"manylinux_([0-9]+)_([0-9]+)_x86_64", platform_tag)
    return bool(manylinux and int(manylinux.group(1)) == 2 and int(manylinux.group(2)) <= 36)


def canonical_directory(path: Path, label: str) -> Path:
    if not path.is_absolute():
        raise ValueError(f"{label} must be an absolute path")
    resolved = path.resolve(strict=True)
    if resolved != path:
        raise ValueError(f"{label} must be canonical and symlink-free")
    metadata = path.lstat()
    if not stat.S_ISDIR(metadata.st_mode):
        raise ValueError(f"{label} must be a real directory")
    return resolved


def normalize_name(value: str) -> str:
    normalized = NORMALIZE_PATTERN.sub("-", value).lower()
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]*", normalized):
        raise ValueError(f"invalid distribution name {value!r}")
    return normalized


def read_regular(path: Path, max_bytes: int) -> bytes:
    if not path.is_absolute():
        raise ValueError(f"{path}: input path must be absolute")
    resolved = path.resolve(strict=True)
    if resolved != path:
        raise ValueError(f"{path}: input must be canonical and symlink-free")
    metadata = path.lstat()
    if not stat.S_ISREG(metadata.st_mode) or metadata.st_nlink != 1 or metadata.st_size > max_bytes:
        raise ValueError(f"{path}: input is not a bounded regular file")
    descriptor = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
    with os.fdopen(descriptor, "rb") as handle:
        opened = os.fstat(handle.fileno())
        if (opened.st_dev, opened.st_ino, opened.st_size, opened.st_mtime_ns) != (metadata.st_dev, metadata.st_ino, metadata.st_size, metadata.st_mtime_ns):
            raise ValueError(f"{path}: input changed while it was being opened")
        content = handle.read(max_bytes + 1)
        closed = os.fstat(handle.fileno())
    if len(content) > max_bytes or (closed.st_dev, closed.st_ino, closed.st_size, closed.st_mtime_ns) != (opened.st_dev, opened.st_ino, opened.st_size, opened.st_mtime_ns):
        raise ValueError(f"{path}: input changed or exceeded its byte limit while reading")
    return content


def write_new(path: Path, content: bytes) -> None:
    if not path.is_absolute():
        raise ValueError(f"{path}: output path must be absolute")
    ensure_canonical_directory(path.parent, "output parent")
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0), 0o600)
    with os.fdopen(descriptor, "wb") as handle:
        handle.write(content)
        handle.flush()
        os.fsync(handle.fileno())


def ensure_canonical_directory(directory: Path, label: str) -> Path:
    if not directory.is_absolute() or directory != Path(os.path.abspath(directory)):
        raise ValueError(f"{label} must be a normalized absolute path")
    missing: list[str] = []
    existing = directory
    while True:
        try:
            metadata = existing.lstat()
            if not stat.S_ISDIR(metadata.st_mode) or stat.S_ISLNK(metadata.st_mode):
                raise ValueError(f"{label} contains a symbolic link or non-directory ancestor")
            break
        except FileNotFoundError:
            parent = existing.parent
            if parent == existing:
                raise ValueError(f"{label} has no existing directory ancestor")
            missing.insert(0, existing.name)
            existing = parent
    if existing.resolve(strict=True) != existing:
        raise ValueError(f"{label} contains a symbolic link ancestor")
    current = existing
    for component in missing:
        candidate = current / component
        try:
            candidate.mkdir(mode=0o700)
        except FileExistsError:
            pass
        metadata = candidate.lstat()
        if not stat.S_ISDIR(metadata.st_mode) or stat.S_ISLNK(metadata.st_mode) or candidate.resolve(strict=True) != candidate:
            raise ValueError(f"{label} contains a symbolic link or non-directory component")
        current = candidate
    return current


def sha256(value: bytes) -> str:
    return f"sha256:{hashlib.sha256(value).hexdigest()}"


def canonical_digest(value: object) -> str:
    encoded = json.dumps(value, ensure_ascii=True, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return sha256(encoded)


def canonical_domain_digest(domain: bytes, value: object) -> str:
    encoded = json.dumps(value, ensure_ascii=True, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return sha256(domain + encoded)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError, KeyError, json.JSONDecodeError, zipfile.BadZipFile) as error:
        print(f"atomistic lock resolution failed: {error}", file=sys.stderr)
        raise SystemExit(1)
