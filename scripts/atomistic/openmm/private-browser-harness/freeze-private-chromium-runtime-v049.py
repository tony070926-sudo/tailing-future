#!/usr/bin/env python3
"""Root-only V049 Chromium staging-tree planner and mode freezer.

The production entry accepts one already-extracted, root-owned mutable staging
tree under root-owned non-writable ancestors.  It verifies every byte before it
changes permissions, applies only the locked 0555/0444 frozen modes, and then
re-verifies the complete frozen-tree digest.  It does not create a read-only
mount or a mount namespace; those remain separate protected-run hard gates.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from dataclasses import dataclass
from pathlib import Path
import stat
import sys
from typing import Dict, Iterable, Mapping, Optional, Sequence, Tuple


_AUDIT_SCHEMA_VERSION = "tf.private-chromium-runtime-freeze-audit/0.4.9"
_TEST_AUDIT_SCHEMA_VERSION = "tf.private-chromium-runtime-freeze-test-audit/0.4.9"
_FROZEN_TREE_SCHEMA_VERSION = "tf.private-chromium-frozen-runtime-tree/0.4.9"
_DISTRIBUTION_TREE_DIGEST = (
    "sha256:ef61b26dc6a3b390355d5a4c1ea60b9ae4839bb3add815fadb26c626e7fae658"
)
_FROZEN_TREE_DIGEST = (
    "sha256:379be99b95a5b092c51dee46cc3053b08ec513618fe939a945df1f3a9a04adb3"
)
_ROOT_DIRECTORY = "chrome-linux64"
_REGULAR_FILE_COUNT = 303
_DIRECTORY_COUNT = 11
_EXPANDED_BYTE_LENGTH = 406_847_046
_MAIN_EXECUTABLE = "chrome"
_MAIN_EXECUTABLE_SIZE = 290_614_600
_MAIN_EXECUTABLE_SHA256 = (
    "sha256:0b20b130e7edd9dd51873be867761295fe0cfad490c2b9a64f95bd3cfc08fa71"
)
_EXECUTABLE_PATHS = frozenset({
    "WidevineCdm/_platform_specific/linux_x64/libwidevinecdm.so",
    "chrome",
    "chrome-wrapper",
    "chrome_crashpad_handler",
    "chrome_sandbox",
    "libEGL.so",
    "libGLESv2.so",
    "libvk_swiftshader.so",
    "libvulkan.so.1",
})
_READ_BUFFER_BYTES = 1024 * 1024


@dataclass(frozen=True)
class _FreezePolicy:
    schema_version: str
    distribution_tree_digest: str
    expected_frozen_tree_digest: str
    root_directory: str
    regular_file_count: int
    directory_count: int
    expanded_byte_length: int
    executable_paths: frozenset[str]
    main_executable: str
    main_executable_size: int
    main_executable_sha256: str
    owner_uid: int
    owner_gid: int
    require_root_authority: bool
    require_trusted_ancestors: bool
    require_extended_attribute_inspection: bool
    test_fixture: bool


@dataclass(frozen=True)
class _Identity:
    device: int
    inode: int
    mode: int
    links: int
    uid: int
    gid: int
    size: int


@dataclass(frozen=True)
class _TreeSnapshot:
    entries: Tuple[Mapping[str, object], ...]
    identities: Mapping[str, _Identity]
    directories_deepest_first: Tuple[str, ...]
    expanded_byte_length: int
    frozen_digest: str
    trusted_ancestor_count: int
    extended_attribute_inspection_verified: bool


_PRODUCTION_POLICY = _FreezePolicy(
    schema_version=_FROZEN_TREE_SCHEMA_VERSION,
    distribution_tree_digest=_DISTRIBUTION_TREE_DIGEST,
    expected_frozen_tree_digest=_FROZEN_TREE_DIGEST,
    root_directory=_ROOT_DIRECTORY,
    regular_file_count=_REGULAR_FILE_COUNT,
    directory_count=_DIRECTORY_COUNT,
    expanded_byte_length=_EXPANDED_BYTE_LENGTH,
    executable_paths=_EXECUTABLE_PATHS,
    main_executable=_MAIN_EXECUTABLE,
    main_executable_size=_MAIN_EXECUTABLE_SIZE,
    main_executable_sha256=_MAIN_EXECUTABLE_SHA256,
    owner_uid=0,
    owner_gid=0,
    require_root_authority=True,
    require_trusted_ancestors=True,
    require_extended_attribute_inspection=True,
    test_fixture=False,
)


def plan_private_chromium_runtime_v049(runtime_root: Path) -> Mapping[str, object]:
    """Verify and describe the exact production staging tree without mutation."""
    return _run_freeze(runtime_root, _PRODUCTION_POLICY, execute=False)


def freeze_private_chromium_runtime_v049(runtime_root: Path) -> Mapping[str, object]:
    """Verify, freeze and re-verify the exact production staging tree."""
    return _run_freeze(runtime_root, _PRODUCTION_POLICY, execute=True)


def _test_only_plan_private_chromium_runtime_v049(
    runtime_root: Path,
    policy: _FreezePolicy,
) -> Mapping[str, object]:
    """Exercise the production planner against a bounded non-root fixture."""
    _validate_test_policy(policy)
    return _run_freeze(runtime_root, policy, execute=False)


def _test_only_freeze_private_chromium_runtime_v049(
    runtime_root: Path,
    policy: _FreezePolicy,
) -> Mapping[str, object]:
    """Exercise the production mode transition against a bounded fixture."""
    _validate_test_policy(policy)
    return _run_freeze(runtime_root, policy, execute=True)


def _run_freeze(
    runtime_root: Path,
    policy: _FreezePolicy,
    *,
    execute: bool,
) -> Mapping[str, object]:
    _validate_policy(policy)
    if policy.require_root_authority and os.geteuid() != 0:
        raise PermissionError("production Chromium runtime freeze requires effective UID zero")
    runtime = _canonical_runtime_root(Path(runtime_root))
    before = _inspect_tree(runtime, policy, phase="mutable-staging")
    if execute:
        _apply_frozen_modes(runtime, policy, before)
        after = _inspect_tree(runtime, policy, phase="frozen")
        if _content_projection(before.entries) != _content_projection(after.entries):
            raise RuntimeError("Chromium runtime content changed while freezing")
    else:
        after = None
    return _audit(policy, before, after, execute)


def _inspect_tree(
    runtime_root: Path,
    policy: _FreezePolicy,
    *,
    phase: str,
) -> _TreeSnapshot:
    if phase not in {"mutable-staging", "frozen"}:
        raise ValueError("unknown Chromium freeze inspection phase")
    root_mode = 0o700 if phase == "mutable-staging" else 0o555
    directory_mode = root_mode
    executable_mode = 0o700 if phase == "mutable-staging" else 0o555
    other_mode = 0o600 if phase == "mutable-staging" else 0o444

    root_metadata = _lstat_directory(runtime_root, policy, root_mode, "runtime root")
    extended_attribute_inspection_verified = _require_no_extended_attributes(
        runtime_root, policy.require_extended_attribute_inspection
    )
    trusted_ancestor_count = 0
    if policy.require_trusted_ancestors:
        trusted_ancestor_count = _verify_trusted_ancestors(runtime_root.parent)

    children = sorted(os.scandir(runtime_root), key=lambda entry: os.fsencode(entry.name))
    if len(children) != 1 or children[0].name != policy.root_directory:
        raise ValueError("Chromium runtime root does not contain the exact distribution root")
    distribution_root = runtime_root / policy.root_directory
    distribution_metadata = _lstat_directory(
        distribution_root, policy, directory_mode, "distribution root"
    )
    if distribution_metadata.st_dev != root_metadata.st_dev:
        raise ValueError("Chromium distribution root crosses a filesystem boundary")
    extended_attribute_inspection_verified = (
        _require_no_extended_attributes(
            distribution_root, policy.require_extended_attribute_inspection
        )
        and extended_attribute_inspection_verified
    )

    entries: list[Mapping[str, object]] = []
    identities: Dict[str, _Identity] = {
        "": _identity(root_metadata),
        policy.root_directory: _identity(distribution_metadata),
    }
    directories: list[str] = []
    seen_casefolded: set[str] = set()
    executable_paths: set[str] = set()
    expanded_byte_length = 0
    regular_file_count = 0
    directory_count = 0

    def walk(directory: Path, relative_directory: str) -> None:
        nonlocal directory_count, expanded_byte_length, regular_file_count
        nonlocal extended_attribute_inspection_verified
        directory_before = directory.lstat()
        for child in sorted(os.scandir(directory), key=lambda entry: os.fsencode(entry.name)):
            if not _safe_child_name(child.name):
                raise ValueError("Chromium runtime contains an unsafe path")
            relative_path = (
                child.name
                if not relative_directory
                else f"{relative_directory}/{child.name}"
            )
            folded = relative_path.casefold()
            if folded in seen_casefolded:
                raise ValueError("Chromium runtime contains a path collision")
            seen_casefolded.add(folded)
            absolute_path = directory / child.name
            metadata = absolute_path.lstat()
            if stat.S_ISDIR(metadata.st_mode) and not stat.S_ISLNK(metadata.st_mode):
                directory_count += 1
                if directory_count > policy.directory_count:
                    raise ValueError("Chromium runtime directory count exceeded the lock")
                _assert_directory_metadata(metadata, policy, directory_mode, "tree directory")
                if metadata.st_dev != root_metadata.st_dev or os.path.ismount(absolute_path):
                    raise ValueError("Chromium runtime contains a nested mount")
                extended_attribute_inspection_verified = (
                    _require_no_extended_attributes(
                        absolute_path, policy.require_extended_attribute_inspection
                    )
                    and extended_attribute_inspection_verified
                )
                identities[f"{policy.root_directory}/{relative_path}"] = _identity(metadata)
                directories.append(f"{policy.root_directory}/{relative_path}")
                entries.append({
                    "mode": "040555",
                    "path": relative_path,
                    "type": "directory",
                })
                walk(absolute_path, relative_path)
                continue
            if not stat.S_ISREG(metadata.st_mode) or stat.S_ISLNK(metadata.st_mode):
                raise ValueError("Chromium runtime contains a non-regular entry")
            regular_file_count += 1
            if regular_file_count > policy.regular_file_count:
                raise ValueError("Chromium runtime file count exceeded the lock")
            is_executable = relative_path in policy.executable_paths
            expected_mode = executable_mode if is_executable else other_mode
            if is_executable:
                executable_paths.add(relative_path)
            remaining = policy.expanded_byte_length - expanded_byte_length
            digest, size, stable, file_xattr_inspection_verified = _hash_regular_file(
                absolute_path,
                metadata,
                policy,
                expected_mode,
                remaining,
                root_metadata.st_dev,
            )
            extended_attribute_inspection_verified = (
                file_xattr_inspection_verified
                and extended_attribute_inspection_verified
            )
            expanded_byte_length += size
            identities[f"{policy.root_directory}/{relative_path}"] = stable
            entries.append({
                "mode": "100555" if is_executable else "100444",
                "path": relative_path,
                "sha256": digest,
                "sizeBytes": size,
                "type": "regular",
            })
        if _identity(directory.lstat()) != _identity(directory_before):
            raise RuntimeError("Chromium runtime directory changed during inspection")

    walk(distribution_root, "")
    entries.sort(key=lambda entry: os.fsencode(str(entry["path"])))
    if (
        regular_file_count != policy.regular_file_count
        or directory_count != policy.directory_count
        or expanded_byte_length != policy.expanded_byte_length
        or executable_paths != set(policy.executable_paths)
    ):
        raise ValueError("Chromium runtime cardinality differs from the lock")
    main = next(
        (entry for entry in entries if entry["path"] == policy.main_executable), None
    )
    if (
        main is None
        or main.get("sizeBytes") != policy.main_executable_size
        or main.get("sha256") != policy.main_executable_sha256
        or main.get("mode") != "100555"
    ):
        raise ValueError("Chromium main executable differs from the lock")
    preimage = {
        "distributionTreeDigest": policy.distribution_tree_digest,
        "entries": entries,
        "platform": "linux-x64",
        "rootDirectory": policy.root_directory,
        "schemaVersion": policy.schema_version,
    }
    frozen_digest = _sha256(_canonical_bytes(preimage))
    if frozen_digest != policy.expected_frozen_tree_digest:
        raise ValueError("Chromium frozen runtime digest differs from the lock")
    if _identity(runtime_root.lstat()) != _identity(root_metadata):
        raise RuntimeError("Chromium runtime root changed during inspection")
    return _TreeSnapshot(
        entries=tuple(entries),
        identities=dict(identities),
        directories_deepest_first=tuple(sorted(
            directories,
            key=lambda value: (-value.count("/"), os.fsencode(value)),
        )),
        expanded_byte_length=expanded_byte_length,
        frozen_digest=frozen_digest,
        trusted_ancestor_count=trusted_ancestor_count,
        extended_attribute_inspection_verified=extended_attribute_inspection_verified,
    )


def _apply_frozen_modes(
    runtime_root: Path,
    policy: _FreezePolicy,
    snapshot: _TreeSnapshot,
) -> None:
    distribution_prefix = f"{policy.root_directory}/"
    for entry in snapshot.entries:
        if entry["type"] != "regular":
            continue
        relative = str(entry["path"])
        key = f"{distribution_prefix}{relative}"
        target_mode = 0o555 if relative in policy.executable_paths else 0o444
        _fchmod_exact(runtime_root / key, snapshot.identities[key], target_mode, False)
    for key in snapshot.directories_deepest_first:
        _fchmod_exact(runtime_root / key, snapshot.identities[key], 0o555, True)
    _fchmod_exact(
        runtime_root / policy.root_directory,
        snapshot.identities[policy.root_directory],
        0o555,
        True,
    )
    _fchmod_exact(runtime_root, snapshot.identities[""], 0o555, True)


def _fchmod_exact(
    path: Path,
    expected: _Identity,
    target_mode: int,
    directory: bool,
) -> None:
    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
    if directory:
        flags |= getattr(os, "O_DIRECTORY", 0)
    descriptor = os.open(path, flags)
    try:
        before = os.fstat(descriptor)
        if _identity(before) != expected:
            raise RuntimeError("Chromium runtime entry changed before mode freeze")
        os.fchmod(descriptor, target_mode)
        after = os.fstat(descriptor)
        if (
            after.st_dev != before.st_dev
            or after.st_ino != before.st_ino
            or stat.S_IMODE(after.st_mode) != target_mode
            or after.st_uid != expected.uid
            or after.st_gid != expected.gid
        ):
            raise RuntimeError("Chromium runtime entry failed its mode freeze")
    finally:
        os.close(descriptor)


def _hash_regular_file(
    path: Path,
    path_metadata: os.stat_result,
    policy: _FreezePolicy,
    expected_mode: int,
    maximum_bytes: int,
    root_device: int,
) -> Tuple[str, int, _Identity, bool]:
    _assert_regular_metadata(path_metadata, policy, expected_mode, maximum_bytes)
    if path_metadata.st_dev != root_device:
        raise ValueError("Chromium runtime file crosses a filesystem boundary")
    extended_attribute_inspection_verified = _require_no_extended_attributes(
        path, policy.require_extended_attribute_inspection
    )
    if policy.require_extended_attribute_inspection and not extended_attribute_inspection_verified:
        raise RuntimeError("extended-attribute inspection did not complete")
    descriptor = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
    try:
        before = os.fstat(descriptor)
        if _identity(before) != _identity(path_metadata):
            raise RuntimeError("Chromium runtime file changed while opening")
        digest = hashlib.sha256()
        consumed = 0
        while True:
            chunk = os.read(descriptor, _READ_BUFFER_BYTES)
            if not chunk:
                break
            consumed += len(chunk)
            if consumed > maximum_bytes:
                raise ValueError("Chromium runtime expanded bytes exceeded the lock")
            digest.update(chunk)
        after = os.fstat(descriptor)
        if _identity(after) != _identity(before) or consumed != before.st_size:
            raise RuntimeError("Chromium runtime file changed while hashing")
        if _identity(path.lstat()) != _identity(before):
            raise RuntimeError("Chromium runtime file path changed while hashing")
        return (
            f"sha256:{digest.hexdigest()}",
            consumed,
            _identity(after),
            extended_attribute_inspection_verified,
        )
    finally:
        os.close(descriptor)


def _canonical_runtime_root(runtime_root: Path) -> Path:
    value = str(runtime_root)
    if not runtime_root.is_absolute() or os.path.normpath(value) != value:
        raise ValueError("Chromium runtime root must be a normalized absolute path")
    resolved = runtime_root.resolve(strict=True)
    if resolved != runtime_root:
        raise ValueError("Chromium runtime root must be canonical")
    return resolved


def _lstat_directory(
    path: Path,
    policy: _FreezePolicy,
    expected_mode: int,
    label: str,
) -> os.stat_result:
    metadata = path.lstat()
    _assert_directory_metadata(metadata, policy, expected_mode, label)
    if path.resolve(strict=True) != path:
        raise ValueError(f"{label} is not canonical")
    return metadata


def _assert_directory_metadata(
    metadata: os.stat_result,
    policy: _FreezePolicy,
    expected_mode: int,
    label: str,
) -> None:
    if (
        not stat.S_ISDIR(metadata.st_mode)
        or stat.S_ISLNK(metadata.st_mode)
        or metadata.st_uid != policy.owner_uid
        or metadata.st_gid != policy.owner_gid
        or stat.S_IMODE(metadata.st_mode) != expected_mode
    ):
        raise ValueError(f"{label} ownership or mode differs from the freeze policy")


def _assert_regular_metadata(
    metadata: os.stat_result,
    policy: _FreezePolicy,
    expected_mode: int,
    maximum_bytes: int,
) -> None:
    if (
        not stat.S_ISREG(metadata.st_mode)
        or stat.S_ISLNK(metadata.st_mode)
        or metadata.st_nlink != 1
        or metadata.st_uid != policy.owner_uid
        or metadata.st_gid != policy.owner_gid
        or stat.S_IMODE(metadata.st_mode) != expected_mode
        or metadata.st_size < 0
        or metadata.st_size > maximum_bytes
    ):
        raise ValueError("Chromium runtime file ownership, mode or identity is unsafe")


def _verify_trusted_ancestors(start: Path) -> int:
    count = 0
    current = start
    while True:
        metadata = current.lstat()
        if (
            not stat.S_ISDIR(metadata.st_mode)
            or stat.S_ISLNK(metadata.st_mode)
            or metadata.st_uid != 0
            or metadata.st_gid != 0
            or stat.S_IMODE(metadata.st_mode) & 0o022
            or current.resolve(strict=True) != current
        ):
            raise ValueError("Chromium runtime ancestor is not root-owned and non-writable")
        count += 1
        if current.parent == current:
            break
        current = current.parent
    return count


def _require_no_extended_attributes(path: Path, required: bool) -> bool:
    try:
        attributes = os.listxattr(path, follow_symlinks=False)
    except (AttributeError, NotImplementedError) as error:
        if required:
            raise RuntimeError("extended-attribute inspection is unavailable") from error
        return False
    if attributes:
        raise ValueError("Chromium runtime entry has extended attributes or ACL metadata")
    return True


def _identity(metadata: os.stat_result) -> _Identity:
    return _Identity(
        device=metadata.st_dev,
        inode=metadata.st_ino,
        mode=metadata.st_mode,
        links=metadata.st_nlink,
        uid=metadata.st_uid,
        gid=metadata.st_gid,
        size=metadata.st_size,
    )


def _content_projection(entries: Iterable[Mapping[str, object]]) -> str:
    projected = [
        {
            "path": entry["path"],
            "sha256": entry.get("sha256"),
            "sizeBytes": entry.get("sizeBytes"),
            "type": entry["type"],
        }
        for entry in entries
    ]
    return _canonical_json(projected)


def _audit(
    policy: _FreezePolicy,
    before: _TreeSnapshot,
    after: Optional[_TreeSnapshot],
    execute: bool,
) -> Mapping[str, object]:
    return {
        "schemaVersion": (
            _TEST_AUDIT_SCHEMA_VERSION if policy.test_fixture else _AUDIT_SCHEMA_VERSION
        ),
        "profile": (
            "tiny-fixture-runtime-mode-freeze"
            if policy.test_fixture
            else "root-only-verified-runtime-mode-freeze"
        ),
        "operation": "execute" if execute else "plan",
        "testFixture": policy.test_fixture,
        "rootOnlyProductionEntry": True,
        "rootPrivilegeVerified": not policy.test_fixture,
        "rootOwnedMutableStagingTreeVerified": not policy.test_fixture,
        "trustedAncestorCount": before.trusted_ancestor_count,
        "trustedAncestorDacModePolicyVerified": policy.require_trusted_ancestors,
        "regularFileCount": policy.regular_file_count,
        "directoryCount": policy.directory_count,
        "expandedByteLength": before.expanded_byte_length,
        "executableFileCount": len(policy.executable_paths),
        "distributionTreeDigest": policy.distribution_tree_digest,
        "plannedFrozenRuntimeTreeDigest": before.frozen_digest,
        "frozenRuntimeTreeDigest": after.frozen_digest if after is not None else None,
        "mutableStagingTreeVerified": True,
        "frozenModeTransitionApplied": execute,
        "frozenRuntimeTreeVerified": after is not None,
        "ownerUid": policy.owner_uid,
        "ownerGid": policy.owner_gid,
        "rootAndDirectoryMode": "040555",
        "executableFileMode": "100555",
        "otherFileMode": "100444",
        "regularFilesSingleLinkVerified": True,
        "extendedAttributeInspectionAvailable": (
            before.extended_attribute_inspection_verified
            and (after is None or after.extended_attribute_inspection_verified)
        ),
        "extendedAttributesAndAclMetadataAbsent": (
            before.extended_attribute_inspection_verified
            and (after is None or after.extended_attribute_inspection_verified)
        ),
        "singleFilesystemTreeVerified": True,
        "runtimeRootReadOnlyMountVerified": False,
        "mountNamespaceIsolationVerified": False,
        "privilegedConcurrentMutationExcluded": False,
        "immutableRuntimeSnapshotVerified": False,
        "preAndPostExecutionVerificationRequired": True,
        "completeHostRuntimeClosureVerified": False,
        "claims": {
            "realBrowserExecutionVerified": False,
            "executionAuthenticityVerified": False,
            "reproduced": False,
            "promotionEligible": False,
            "publicDistributionEligible": False,
            "cloudflareDistributionEligible": False,
        },
    }


def _validate_policy(policy: _FreezePolicy) -> None:
    if not isinstance(policy, _FreezePolicy):
        raise TypeError("Chromium freeze policy is invalid")
    if (
        not _is_digest(policy.distribution_tree_digest)
        or not _is_digest(policy.expected_frozen_tree_digest)
        or not _safe_child_name(policy.root_directory)
        or not _safe_relative_path(policy.main_executable)
        or policy.main_executable not in policy.executable_paths
        or not _is_digest(policy.main_executable_sha256)
        or policy.main_executable_size < 1
        or policy.regular_file_count < 1
        or policy.directory_count < 0
        or policy.expanded_byte_length < 1
        or len(policy.executable_paths) < 1
        or any(not _safe_relative_path(value) for value in policy.executable_paths)
        or policy.owner_uid < 0
        or policy.owner_gid < 0
        or not isinstance(policy.require_extended_attribute_inspection, bool)
    ):
        raise ValueError("Chromium freeze policy differs from its closed invariants")


def _validate_test_policy(policy: _FreezePolicy) -> None:
    _validate_policy(policy)
    if (
        not policy.test_fixture
        or policy.require_root_authority
        or policy.require_trusted_ancestors
        or policy.regular_file_count > 64
        or policy.directory_count > 32
        or policy.expanded_byte_length > 1024 * 1024
    ):
        raise ValueError("test-only Chromium freeze policy is invalid")


def _safe_child_name(value: str) -> bool:
    return (
        isinstance(value, str)
        and bool(value)
        and value not in {".", ".."}
        and "/" not in value
        and "\\" not in value
        and "\0" not in value
        and "\ufffd" not in value
    )


def _safe_relative_path(value: str) -> bool:
    if not isinstance(value, str) or not value or value.startswith("/"):
        return False
    parts = value.split("/")
    return all(_safe_child_name(part) for part in parts) and "/".join(parts) == value


def _is_digest(value: object) -> bool:
    if not isinstance(value, str) or not value.startswith("sha256:"):
        return False
    hexadecimal = value.removeprefix("sha256:")
    return len(hexadecimal) == 64 and all(character in "0123456789abcdef" for character in hexadecimal)


def _canonical_json(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _canonical_bytes(value: object) -> bytes:
    return f"{_canonical_json(value)}\n".encode("utf-8")


def _sha256(value: bytes) -> str:
    return f"sha256:{hashlib.sha256(value).hexdigest()}"


def _parse_arguments(argv: Optional[Sequence[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("--runtime-root", type=Path, required=True)
    operation = parser.add_mutually_exclusive_group(required=True)
    operation.add_argument("--plan", action="store_true")
    operation.add_argument("--execute", action="store_true")
    return parser.parse_args(argv)


def main(argv: Optional[Sequence[str]] = None) -> int:
    try:
        arguments = _parse_arguments(argv)
        result = (
            freeze_private_chromium_runtime_v049(arguments.runtime_root)
            if arguments.execute
            else plan_private_chromium_runtime_v049(arguments.runtime_root)
        )
        sys.stdout.buffer.write(_canonical_bytes(result))
        return 0
    except BaseException:
        sys.stderr.write("private Chromium runtime freeze failed\n")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
