#!/usr/bin/env python3
"""Fail-closed extractor for the one locked V049 Linux Chromium archive.

This is deliberately not a general ZIP extractor.  The command-line entry
point accepts only the byte-for-byte locked Chrome-for-Testing archive and an
already-created, canonical, empty, mode-0700 output directory.  Unit tests can
pass an explicit ``test_policy`` to exercise the structural checks with small
archives; no command-line option exposes that seam.
"""

from __future__ import annotations

import argparse
import dataclasses
import hashlib
import json
import os
import stat
import struct
import sys
import unicodedata
import zipfile
from pathlib import Path, PurePosixPath
from typing import Dict, FrozenSet, Iterable, List, Mapping, Optional, Sequence, Set, Tuple


_ARCHIVE_BYTES = 193_282_658
_ARCHIVE_SHA256 = "sha256:ae8736ac28bc69278551500f219fc749575648263c43ec5990749eff43b9fcf8"
_EXECUTABLE_BYTES = 290_614_600
_EXECUTABLE_SHA256 = "sha256:0b20b130e7edd9dd51873be867761295fe0cfad490c2b9a64f95bd3cfc08fa71"
_EXPECTED_TREE_DIGEST = "sha256:ef61b26dc6a3b390355d5a4c1ea60b9ae4839bb3add815fadb26c626e7fae658"
_ROOT_DIRECTORY = "chrome-linux64"
_FROZEN_TREE_SCHEMA_VERSION = "tf.private-chromium-frozen-runtime-tree/0.4.9"
_EXPECTED_FROZEN_TREE_DIGEST = (
    "sha256:379be99b95a5b092c51dee46cc3053b08ec513618fe939a945df1f3a9a04adb3"
)

_EXECUTABLE_MEMBERS = frozenset({
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

_EOCD = struct.Struct("<4s4H2IH")
_CENTRAL = struct.Struct("<4s4B4H3I5H2I")
_LOCAL = struct.Struct("<4s2B4H3I2H")
_EOCD_SIGNATURE = b"PK\x05\x06"
_ZIP64_LOCATOR_SIGNATURE = b"PK\x06\x07"
_CENTRAL_SIGNATURE = b"PK\x01\x02"
_LOCAL_SIGNATURE = b"PK\x03\x04"
_ZIP64_EXTRA_TAG = 0x0001
_EXTENDED_TIMESTAMP_TAG = 0x5455
_UNIX_UID_GID_TAG = 0x7875
_ALLOWED_EXTRA_TAGS = frozenset({_EXTENDED_TIMESTAMP_TAG, _UNIX_UID_GID_TAG})
_ALLOWED_FLAG_MASK = 0x0806  # deflate tuning bits and UTF-8 names only
_READ_CHUNK_BYTES = 1024 * 1024


@dataclasses.dataclass(frozen=True)
class ExtractionPolicy:
    """Immutable policy; callers must name it through ``test_policy``."""

    archive_bytes: int
    archive_sha256: str
    root_directory: str
    executable_member: str
    executable_bytes: int
    executable_sha256: str
    executable_members: FrozenSet[str]
    archive_mode: int
    require_current_uid: bool
    expected_tree_digest: Optional[str]
    expected_frozen_tree_digest: Optional[str]
    expected_member_count: Optional[int]
    expected_file_count: Optional[int]
    expected_directory_count: Optional[int]
    expected_expanded_bytes: Optional[int]
    expected_compressed_bytes: Optional[int]
    max_members: int
    max_single_file_bytes: int
    max_expanded_bytes: int
    max_compressed_bytes: int
    max_member_compression_ratio: float
    max_central_directory_bytes: int = 2_000_000
    max_name_bytes: int = 83
    max_path_components: int = 4
    platform: str = "linux-x64"
    tree_schema_version: str = "tf.private-chromium-runtime-tree/0.4.9"


_PRODUCTION_POLICY = ExtractionPolicy(
    archive_bytes=_ARCHIVE_BYTES,
    archive_sha256=_ARCHIVE_SHA256,
    root_directory=_ROOT_DIRECTORY,
    executable_member="chrome",
    executable_bytes=_EXECUTABLE_BYTES,
    executable_sha256=_EXECUTABLE_SHA256,
    executable_members=_EXECUTABLE_MEMBERS,
    archive_mode=0o400,
    require_current_uid=True,
    expected_tree_digest=_EXPECTED_TREE_DIGEST,
    expected_frozen_tree_digest=_EXPECTED_FROZEN_TREE_DIGEST,
    expected_member_count=308,
    expected_file_count=303,
    expected_directory_count=11,
    expected_expanded_bytes=406_847_046,
    expected_compressed_bytes=193_220_360,
    max_members=512,
    max_single_file_bytes=300_000_000,
    max_expanded_bytes=420_000_000,
    max_compressed_bytes=200_000_000,
    max_member_compression_ratio=8.0,
)


@dataclasses.dataclass(frozen=True)
class _CentralRecord:
    raw_name: bytes
    decoded_name: str
    flag_bits: int
    compression: int
    modified_time: int
    modified_date: int
    crc32: int
    compressed_size: int
    file_size: int
    external_attr: int
    local_header_offset: int
    create_system: int
    create_version: int
    extract_system: int
    extract_version: int


@dataclasses.dataclass(frozen=True)
class _MemberPlan:
    info: zipfile.ZipInfo
    archive_parts: Tuple[str, ...]
    manifest_path: str
    kind: str
    source_mode: int
    output_mode: int


@dataclasses.dataclass(frozen=True)
class _Preflight:
    members: Tuple[_MemberPlan, ...]
    directory_paths: FrozenSet[str]
    expanded_bytes: int
    compressed_bytes: int


class _PrivateOutputTree:
    """Directory-fd based writer that only removes members it created."""

    def __init__(self, output: Path) -> None:
        if not hasattr(os, "O_NOFOLLOW") or not hasattr(os, "O_DIRECTORY"):
            raise OSError("O_NOFOLLOW and O_DIRECTORY are required")
        self.output = output
        self.root_fd = os.open(
            str(output),
            os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW,
        )
        self.directory_fds: Dict[Tuple[str, ...], int] = {(): self.root_fd}
        self.created_directories: List[Tuple[str, ...]] = []
        self.created_files: List[Tuple[str, ...]] = []
        self.created_directory_identities: Dict[Tuple[str, ...], Tuple[int, int]] = {}
        self.created_file_identities: Dict[Tuple[str, ...], Tuple[int, int]] = {}
        try:
            metadata = os.fstat(self.root_fd)
            self._root_identity = _directory_identity(metadata)
            path_metadata = output.lstat()
            if (stat.S_IMODE(metadata.st_mode) != 0o700
                    or _directory_identity(path_metadata) != self._root_identity
                    or stat.S_ISLNK(path_metadata.st_mode)
                    or metadata.st_uid != os.geteuid()
                    or os.listdir(self.root_fd)):
                raise ValueError("Chromium output directory changed before extraction")
        except BaseException:
            os.close(self.root_fd)
            self.directory_fds.clear()
            raise

    def create_directory(self, parts: Tuple[str, ...]) -> None:
        if not parts or parts in self.directory_fds:
            return
        parent = parts[:-1]
        parent_fd = self.directory_fds[parent]
        os.mkdir(parts[-1], 0o700, dir_fd=parent_fd)
        self.created_directories.append(parts)
        created_metadata = os.stat(
            parts[-1],
            dir_fd=parent_fd,
            follow_symlinks=False,
        )
        self.created_directory_identities[parts] = _directory_identity(created_metadata)
        descriptor = os.open(
            parts[-1],
            os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW,
            dir_fd=parent_fd,
        )
        try:
            metadata = os.fstat(descriptor)
            if not stat.S_ISDIR(metadata.st_mode):
                raise ValueError("created Chromium output member is not a directory")
            os.fchmod(descriptor, 0o700)
            if stat.S_IMODE(os.fstat(descriptor).st_mode) != 0o700:
                raise ValueError("Chromium output directory mode is not 0700")
        except BaseException:
            os.close(descriptor)
            raise
        self.directory_fds[parts] = descriptor

    def create_file(self, parts: Tuple[str, ...], mode: int) -> int:
        parent_fd = self.directory_fds[parts[:-1]]
        descriptor = os.open(
            parts[-1],
            os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
            mode,
            dir_fd=parent_fd,
        )
        self.created_files.append(parts)
        created_metadata = os.fstat(descriptor)
        self.created_file_identities[parts] = (
            created_metadata.st_dev,
            created_metadata.st_ino,
        )
        try:
            os.fchmod(descriptor, mode)
            metadata = os.fstat(descriptor)
            if (not stat.S_ISREG(metadata.st_mode) or metadata.st_nlink != 1
                    or stat.S_IMODE(metadata.st_mode) != mode):
                raise ValueError("Chromium output file identity or mode is unsafe")
        except BaseException:
            os.close(descriptor)
            raise
        return descriptor

    def open_file_for_verification(self, parts: Tuple[str, ...], mode: int) -> int:
        descriptor = os.open(
            parts[-1],
            os.O_RDONLY | os.O_NOFOLLOW,
            dir_fd=self.directory_fds[parts[:-1]],
        )
        metadata = os.fstat(descriptor)
        if (not stat.S_ISREG(metadata.st_mode) or metadata.st_nlink != 1
                or stat.S_IMODE(metadata.st_mode) != mode):
            os.close(descriptor)
            raise ValueError("extracted Chromium file identity or mode changed")
        return descriptor

    def verify_exact_children(self) -> None:
        expected: Dict[Tuple[str, ...], Set[str]] = {
            parts: set() for parts in self.directory_fds
        }
        for parts in self.created_directories:
            expected[parts[:-1]].add(parts[-1])
        for parts in self.created_files:
            expected[parts[:-1]].add(parts[-1])
        for parts, descriptor in self.directory_fds.items():
            actual = set(os.listdir(descriptor))
            if actual != expected[parts]:
                raise ValueError("Chromium output tree gained an unexpected member")

    def sync_and_verify_root(self) -> None:
        for parts in sorted(self.directory_fds, key=len, reverse=True):
            os.fsync(self.directory_fds[parts])
        metadata = os.fstat(self.root_fd)
        if (_directory_identity(metadata) != self._root_identity
                or stat.S_IMODE(metadata.st_mode) != 0o700
                or metadata.st_uid != os.geteuid()):
            raise ValueError("Chromium output directory identity or mode changed")
        path_metadata = self.output.lstat()
        if (_directory_identity(path_metadata) != self._root_identity
                or stat.S_ISLNK(path_metadata.st_mode)):
            raise ValueError("Chromium output path identity changed")

    def cleanup_created_members(self) -> None:
        for parts in reversed(self.created_files):
            parent_fd = self.directory_fds.get(parts[:-1])
            if parent_fd is None:
                continue
            try:
                metadata = os.stat(
                    parts[-1],
                    dir_fd=parent_fd,
                    follow_symlinks=False,
                )
                if ((metadata.st_dev, metadata.st_ino)
                        != self.created_file_identities.get(parts)):
                    continue
                os.unlink(parts[-1], dir_fd=parent_fd)
            except FileNotFoundError:
                pass
            except OSError:
                # Never broaden cleanup beyond the exact file we created.
                pass
        for parts in sorted(self.created_directories, key=len, reverse=True):
            descriptor = self.directory_fds.pop(parts, None)
            if descriptor is not None:
                try:
                    os.close(descriptor)
                except OSError:
                    pass
            parent_fd = self.directory_fds.get(parts[:-1])
            if parent_fd is None:
                continue
            try:
                metadata = os.stat(
                    parts[-1],
                    dir_fd=parent_fd,
                    follow_symlinks=False,
                )
                if (_directory_identity(metadata)
                        != self.created_directory_identities.get(parts)):
                    continue
                os.rmdir(parts[-1], dir_fd=parent_fd)
            except FileNotFoundError:
                pass
            except (OSError, ValueError):
                # A concurrently-added member is not ours and must survive.
                pass
        try:
            os.fsync(self.root_fd)
        except OSError:
            pass

    def close(self) -> None:
        for parts in sorted(self.directory_fds, key=len, reverse=True):
            descriptor = self.directory_fds.pop(parts)
            try:
                os.close(descriptor)
            except OSError:
                pass


def parse_args(argv: Sequence[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Extract the exact V049 Linux Chromium archive",
    )
    parser.add_argument("--archive", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    return parser.parse_args(argv)


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = parse_args(sys.argv[1:] if argv is None else argv)
    summary = extract_private_chromium_v049(args.archive, args.output)
    sys.stdout.write(_canonical_json(summary))
    return 0


def extract_private_chromium_v049(
    archive_path: Path,
    output_path: Path,
) -> Mapping[str, object]:
    """Extract only the production-locked archive."""

    return _extract_private_chromium_v049(
        archive_path,
        output_path,
        policy=_PRODUCTION_POLICY,
    )


def _extract_private_chromium_v049_for_test(
    archive_path: Path,
    output_path: Path,
    *,
    test_policy: ExtractionPolicy,
) -> Mapping[str, object]:
    """Exercise the implementation with a bounded explicit test-only policy."""

    return _extract_private_chromium_v049(
        archive_path,
        output_path,
        policy=test_policy,
    )


def _extract_private_chromium_v049(
    archive_path: Path,
    output_path: Path,
    *,
    policy: ExtractionPolicy,
) -> Mapping[str, object]:
    """Shared implementation behind the closed production and test entries."""

    _validate_policy(policy)
    archive = _canonical_single_link_regular_file(Path(archive_path), policy)
    output = _canonical_empty_private_directory(Path(output_path))
    archive_fd = os.open(str(archive), os.O_RDONLY | os.O_NOFOLLOW)
    output_tree: Optional[_PrivateOutputTree] = None
    try:
        archive_identity = _regular_file_identity(os.fstat(archive_fd))
        archive_digest = _sha256_fd(archive_fd, policy.archive_bytes)
        if archive_digest != policy.archive_sha256:
            raise ValueError("Chromium archive digest does not match the locked policy")

        output_tree = _PrivateOutputTree(output)
        with os.fdopen(os.dup(archive_fd), "rb") as raw_archive:
            with zipfile.ZipFile(raw_archive, "r", allowZip64=False) as archive_zip:
                preflight = _preflight_archive(
                    archive_fd,
                    policy.archive_bytes,
                    archive_zip,
                    policy,
                )
                archive_hashes = _extract_members(
                    archive_zip,
                    preflight,
                    output_tree,
                    policy,
                )

        output_tree.verify_exact_children()
        output_tree.sync_and_verify_root()
        archive_entries = _canonical_entries(preflight, archive_hashes)
        archive_tree_digest = _tree_digest(policy, archive_entries)
        extracted_hashes = _hash_extracted_files(preflight, output_tree, policy)
        extracted_entries = _canonical_entries(preflight, extracted_hashes)
        extracted_tree_digest = _tree_digest(policy, extracted_entries)
        if archive_tree_digest != extracted_tree_digest:
            raise ValueError("archive and extracted Chromium tree digests differ")
        if (policy.expected_tree_digest is not None
                and archive_tree_digest != policy.expected_tree_digest):
            raise ValueError("Chromium runtime tree digest does not match the lock")
        planned_frozen_tree_digest = _frozen_runtime_tree_digest(
            policy,
            archive_tree_digest,
            archive_entries,
        )
        if (policy.expected_frozen_tree_digest is not None
                and planned_frozen_tree_digest != policy.expected_frozen_tree_digest):
            raise ValueError("frozen Chromium runtime tree digest does not match the lock")

        _verify_archive_identity(archive, archive_fd, archive_identity, policy)
        final_archive_digest = _sha256_fd(archive_fd, policy.archive_bytes)
        if final_archive_digest != policy.archive_sha256:
            raise ValueError("Chromium archive changed during extraction")
        _verify_archive_identity(archive, archive_fd, archive_identity, policy)
        output_tree.sync_and_verify_root()
        executable_hash = extracted_hashes[policy.executable_member]
        summary: Mapping[str, object] = {
            "archiveByteLength": policy.archive_bytes,
            "archiveSha256": archive_digest,
            "compressedPayloadByteLength": preflight.compressed_bytes,
            "directoryCount": len(preflight.directory_paths),
            "executable": {
                "byteLength": policy.executable_bytes,
                "sha256": executable_hash,
            },
            "expandedByteLength": preflight.expanded_bytes,
            "fileCount": sum(member.kind == "regular" for member in preflight.members),
            "memberCount": len(preflight.members),
            "outputModes": {
                "directories": "0700",
                "executableFiles": "0700",
                "otherFiles": "0600",
            },
            "schemaVersion": "tf.private-chromium-safe-extract-summary/0.4.9",
            "plannedFrozenRuntimeTree": {
                "digest": planned_frozen_tree_digest,
                "schemaVersion": _FROZEN_TREE_SCHEMA_VERSION,
                "verified": False,
            },
            "treeDigest": archive_tree_digest,
            "treeDigestSemantics": "archive-distribution-tree-identity",
            "claims": {
                "completeRuntimeEnvironmentVerified": False,
                "immutableRuntimeSnapshotVerified": False,
                "browserExecutionVerified": False,
                "executionAuthenticityVerified": False,
                "reproduced": False,
                "promotionEligible": False,
                "publicDistributionEligible": False,
                "cloudflareDistributionEligible": False,
            },
        }
        return summary
    except BaseException:
        if output_tree is not None:
            output_tree.cleanup_created_members()
        raise
    finally:
        if output_tree is not None:
            output_tree.close()
        os.close(archive_fd)


def _validate_policy(policy: ExtractionPolicy) -> None:
    if (policy.archive_bytes < 1 or policy.executable_bytes < 1
            or policy.max_members < 1 or policy.max_single_file_bytes < 1
            or policy.max_expanded_bytes < 1 or policy.max_compressed_bytes < 1
            or policy.max_member_compression_ratio < 1.0
            or not isinstance(policy.archive_mode, int)
            or policy.archive_mode & ~0o777
            or not policy.archive_mode & 0o400
            or policy.archive_mode & 0o022
            or not _is_sha256(policy.archive_sha256)
            or not _is_sha256(policy.executable_sha256)
            or (policy.expected_tree_digest is not None
                and not _is_sha256(policy.expected_tree_digest))
            or (policy.expected_frozen_tree_digest is not None
                and not _is_sha256(policy.expected_frozen_tree_digest))):
        raise ValueError("invalid private Chromium extraction policy")
    _validate_policy_relative_path(policy.root_directory, allow_slash=False)
    _validate_policy_relative_path(policy.executable_member, allow_slash=True)
    if policy.executable_member not in policy.executable_members:
        raise ValueError("locked Chromium executable is absent from its mode allowlist")
    for member in policy.executable_members:
        _validate_policy_relative_path(member, allow_slash=True)


def _validate_policy_relative_path(value: str, *, allow_slash: bool) -> None:
    parts = PurePosixPath(value).parts
    if (not value or value.startswith("/") or "\\" in value or "\x00" in value
            or any(part in {"", ".", ".."} for part in parts)
            or "/".join(parts) != value or (not allow_slash and len(parts) != 1)):
        raise ValueError("invalid path in private Chromium extraction policy")


def _canonical_single_link_regular_file(path: Path, policy: ExtractionPolicy) -> Path:
    if not path.is_absolute() or path != Path(os.path.abspath(str(path))):
        raise ValueError("archive path must be a normalized absolute path")
    resolved = path.resolve(strict=True)
    metadata = path.lstat()
    if (resolved != path or not stat.S_ISREG(metadata.st_mode)
            or stat.S_ISLNK(metadata.st_mode) or metadata.st_nlink != 1
            or stat.S_IMODE(metadata.st_mode) != policy.archive_mode
            or (policy.require_current_uid and metadata.st_uid != os.geteuid())):
        raise ValueError("archive must be a canonical, single-link regular file")
    if metadata.st_size != policy.archive_bytes:
        raise ValueError("Chromium archive byte length does not match the lock")
    return resolved


def _canonical_empty_private_directory(path: Path) -> Path:
    if not path.is_absolute() or path != Path(os.path.abspath(str(path))):
        raise ValueError("output path must be a normalized absolute path")
    resolved = path.resolve(strict=True)
    metadata = path.lstat()
    if (resolved != path or not stat.S_ISDIR(metadata.st_mode)
            or stat.S_ISLNK(metadata.st_mode) or metadata.st_uid != os.geteuid()):
        raise ValueError("output must be a canonical real directory")
    if stat.S_IMODE(metadata.st_mode) != 0o700:
        raise ValueError("output directory mode must be exactly 0700")
    if any(path.iterdir()):
        raise ValueError("output directory must be empty")
    return resolved


def _preflight_archive(
    archive_fd: int,
    archive_bytes: int,
    archive_zip: zipfile.ZipFile,
    policy: ExtractionPolicy,
) -> _Preflight:
    if archive_zip.comment:
        raise ValueError("Chromium archive comments are forbidden")
    central_records = _parse_and_validate_zip_structure(
        archive_fd,
        archive_bytes,
        policy,
    )
    infos = archive_zip.infolist()
    if len(infos) != len(central_records):
        raise ValueError("ZIP parser and central directory member counts differ")
    if len(infos) < 1 or len(infos) > policy.max_members:
        raise ValueError("Chromium archive member count is outside policy")
    if (policy.expected_member_count is not None
            and len(infos) != policy.expected_member_count):
        raise ValueError("Chromium archive member count does not match the lock")

    seen: Set[str] = set()
    seen_casefolded: Set[str] = set()
    explicit_kinds: Dict[str, str] = {}
    members: List[_MemberPlan] = []
    executable_members: Set[str] = set()
    expanded_bytes = 0
    compressed_bytes = 0
    for info, central in zip(infos, central_records):
        _match_zipinfo_to_central(info, central)
        manifest_path, archive_parts, kind = _validate_member_path_and_type(
            info,
            central,
            policy,
        )
        if manifest_path in seen:
            raise ValueError("Chromium archive contains a duplicate canonical path")
        casefolded_path = manifest_path.casefold()
        if casefolded_path in seen_casefolded:
            raise ValueError("Chromium archive contains a case-folded path collision")
        seen.add(manifest_path)
        seen_casefolded.add(casefolded_path)
        explicit_kinds[manifest_path] = kind
        source_mode = (central.external_attr >> 16) & 0xFFFF
        if kind == "directory":
            if source_mode != (stat.S_IFDIR | 0o755):
                raise ValueError("Chromium directory mode is outside policy")
            output_mode = 0o700
        else:
            if source_mode not in {
                stat.S_IFREG | 0o600,
                stat.S_IFREG | 0o644,
                stat.S_IFREG | 0o755,
            }:
                raise ValueError("Chromium regular-file mode is outside policy")
            is_executable = bool(stat.S_IMODE(source_mode) & 0o111)
            if is_executable != (manifest_path in policy.executable_members):
                raise ValueError("Chromium executable mode allowlist mismatch")
            if is_executable:
                executable_members.add(manifest_path)
            output_mode = 0o700 if is_executable else 0o600
            if info.file_size > policy.max_single_file_bytes:
                raise ValueError("Chromium member exceeds the single-file size limit")
            if info.file_size > 0 and info.compress_size == 0:
                raise ValueError("nonempty Chromium member has zero compressed bytes")
            ratio = info.file_size / max(1, info.compress_size)
            if ratio > policy.max_member_compression_ratio:
                raise ValueError("Chromium member compression ratio exceeds policy")
        expanded_bytes += info.file_size
        compressed_bytes += info.compress_size
        if expanded_bytes > policy.max_expanded_bytes:
            raise ValueError("Chromium archive expanded size exceeds policy")
        if compressed_bytes > policy.max_compressed_bytes:
            raise ValueError("Chromium archive compressed payload exceeds policy")
        members.append(_MemberPlan(
            info=info,
            archive_parts=archive_parts,
            manifest_path=manifest_path,
            kind=kind,
            source_mode=source_mode,
            output_mode=output_mode,
        ))

    if executable_members != set(policy.executable_members):
        raise ValueError("Chromium executable member set does not match the lock")
    if policy.executable_member not in explicit_kinds:
        raise ValueError("locked Chromium executable member is absent")

    directories: Set[str] = set()
    for member in members:
        parts = tuple(member.manifest_path.split("/"))
        if member.kind == "directory":
            directories.add(member.manifest_path)
        for index in range(1, len(parts)):
            ancestor = "/".join(parts[:index])
            if explicit_kinds.get(ancestor) == "regular":
                raise ValueError("Chromium archive has a file/directory collision")
            directories.add(ancestor)
    for member in members:
        if member.kind == "regular" and member.manifest_path in directories:
            raise ValueError("Chromium archive has a file/directory collision")

    file_count = sum(member.kind == "regular" for member in members)
    if (policy.expected_file_count is not None
            and file_count != policy.expected_file_count):
        raise ValueError("Chromium file count does not match the lock")
    if (policy.expected_directory_count is not None
            and len(directories) != policy.expected_directory_count):
        raise ValueError("Chromium directory count does not match the lock")
    if (policy.expected_expanded_bytes is not None
            and expanded_bytes != policy.expected_expanded_bytes):
        raise ValueError("Chromium expanded byte length does not match the lock")
    if (policy.expected_compressed_bytes is not None
            and compressed_bytes != policy.expected_compressed_bytes):
        raise ValueError("Chromium compressed payload length does not match the lock")
    return _Preflight(
        members=tuple(members),
        directory_paths=frozenset(directories),
        expanded_bytes=expanded_bytes,
        compressed_bytes=compressed_bytes,
    )


def _parse_and_validate_zip_structure(
    archive_fd: int,
    archive_bytes: int,
    policy: ExtractionPolicy,
) -> Tuple[_CentralRecord, ...]:
    tail_bytes = min(archive_bytes, _EOCD.size + 65_535 + 20)
    tail_offset = archive_bytes - tail_bytes
    tail = _pread_exact(archive_fd, tail_bytes, tail_offset)
    relative_eocd = tail.rfind(_EOCD_SIGNATURE)
    if relative_eocd < 0:
        raise ValueError("Chromium ZIP end-of-central-directory record is absent")
    eocd_offset = tail_offset + relative_eocd
    if relative_eocd + _EOCD.size > len(tail):
        raise ValueError("Chromium ZIP EOCD is truncated")
    eocd = _EOCD.unpack_from(tail, relative_eocd)
    (_, disk_number, central_disk, disk_members, total_members,
     central_size, central_offset, comment_length) = eocd
    if comment_length != 0 or eocd_offset + _EOCD.size != archive_bytes:
        raise ValueError("Chromium ZIP trailing data or archive comment is forbidden")
    if (disk_number != 0 or central_disk != 0 or disk_members != total_members
            or total_members in {0, 0xFFFF}
            or central_size in {0, 0xFFFFFFFF}
            or central_offset == 0xFFFFFFFF):
        raise ValueError("multi-disk or ZIP64 Chromium archives are forbidden")
    if central_size > policy.max_central_directory_bytes:
        raise ValueError("Chromium central directory exceeds policy")
    if central_offset + central_size != eocd_offset:
        raise ValueError("Chromium central directory boundaries are noncanonical")
    if eocd_offset >= 20:
        possible_locator = _pread_exact(archive_fd, 4, eocd_offset - 20)
        if possible_locator == _ZIP64_LOCATOR_SIGNATURE:
            raise ValueError("ZIP64 locator is forbidden")
    if _pread_exact(archive_fd, 4, 0) != _LOCAL_SIGNATURE:
        raise ValueError("prepended or noncanonical Chromium ZIP data is forbidden")

    records: List[_CentralRecord] = []
    cursor = central_offset
    for _ in range(total_members):
        header = _pread_exact(archive_fd, _CENTRAL.size, cursor)
        values = _CENTRAL.unpack(header)
        if values[0] != _CENTRAL_SIGNATURE:
            raise ValueError("Chromium central directory signature is invalid")
        (create_version, create_system, extract_version, extract_system,
         flag_bits, compression, modified_time, modified_date, crc32,
         compressed_size, file_size, name_length, extra_length, comment_length,
         disk_start, _internal_attr, external_attr, local_header_offset) = values[1:]
        cursor += _CENTRAL.size
        if name_length < 1 or name_length > policy.max_name_bytes:
            raise ValueError("Chromium member name byte length is outside policy")
        raw_name = _pread_exact(archive_fd, name_length, cursor)
        cursor += name_length
        extra = _pread_exact(archive_fd, extra_length, cursor)
        cursor += extra_length
        member_comment = _pread_exact(archive_fd, comment_length, cursor)
        cursor += comment_length
        if member_comment or comment_length:
            raise ValueError("Chromium ZIP member comments are forbidden")
        if (create_version >= 45 or extract_version >= 45 or disk_start != 0
                or compressed_size == 0xFFFFFFFF or file_size == 0xFFFFFFFF
                or local_header_offset == 0xFFFFFFFF):
            raise ValueError("ZIP64 or multi-disk Chromium member is forbidden")
        _validate_flags_and_compression(flag_bits, compression)
        _validate_extra(extra, central=True)
        decoded_name = _decode_member_name(raw_name, flag_bits)
        records.append(_CentralRecord(
            raw_name=raw_name,
            decoded_name=decoded_name,
            flag_bits=flag_bits,
            compression=compression,
            modified_time=modified_time,
            modified_date=modified_date,
            crc32=crc32,
            compressed_size=compressed_size,
            file_size=file_size,
            external_attr=external_attr,
            local_header_offset=local_header_offset,
            create_system=create_system,
            create_version=create_version,
            extract_system=extract_system,
            extract_version=extract_version,
        ))
    if cursor != central_offset + central_size:
        raise ValueError("Chromium central directory size is noncanonical")

    previous_end = 0
    for record in sorted(records, key=lambda candidate: candidate.local_header_offset):
        if record.local_header_offset != previous_end:
            raise ValueError("Chromium local members overlap or contain descriptor/gap data")
        local = _pread_exact(archive_fd, _LOCAL.size, record.local_header_offset)
        values = _LOCAL.unpack(local)
        if values[0] != _LOCAL_SIGNATURE:
            raise ValueError("Chromium local member signature is invalid")
        (extract_version, extract_system, flag_bits, compression, modified_time,
         modified_date, crc32, compressed_size, file_size,
         name_length, extra_length) = values[1:]
        name_offset = record.local_header_offset + _LOCAL.size
        raw_name = _pread_exact(archive_fd, name_length, name_offset)
        extra = _pread_exact(archive_fd, extra_length, name_offset + name_length)
        if (extract_version >= 45 or raw_name != record.raw_name
                or extract_version != record.extract_version
                or extract_system != record.extract_system
                or flag_bits != record.flag_bits
                or compression != record.compression
                or modified_time != record.modified_time
                or modified_date != record.modified_date
                or crc32 != record.crc32
                or compressed_size != record.compressed_size
                or file_size != record.file_size):
            raise ValueError("Chromium local and central member metadata differ")
        _validate_flags_and_compression(flag_bits, compression)
        _validate_extra(extra, central=False)
        previous_end = name_offset + name_length + extra_length + compressed_size
        if previous_end > central_offset:
            raise ValueError("Chromium member data overlaps its central directory")
    if previous_end != central_offset:
        raise ValueError("Chromium local member area has trailing descriptor data")
    return tuple(records)


def _validate_flags_and_compression(flag_bits: int, compression: int) -> None:
    if flag_bits & 0x1:
        raise ValueError("encrypted Chromium ZIP members are forbidden")
    if flag_bits & 0x8:
        raise ValueError("Chromium ZIP data descriptors are forbidden")
    if flag_bits & ~_ALLOWED_FLAG_MASK:
        raise ValueError("Chromium ZIP member flags are outside policy")
    if compression not in {zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED}:
        raise ValueError("Chromium ZIP compression method is outside policy")


def _validate_extra(extra: bytes, *, central: bool) -> None:
    cursor = 0
    seen: Set[int] = set()
    while cursor < len(extra):
        if len(extra) - cursor < 4:
            raise ValueError("Chromium ZIP extra field is truncated")
        tag, length = struct.unpack_from("<HH", extra, cursor)
        cursor += 4
        end = cursor + length
        if end > len(extra):
            raise ValueError("Chromium ZIP extra field length is invalid")
        value = extra[cursor:end]
        cursor = end
        if tag == _ZIP64_EXTRA_TAG:
            raise ValueError("ZIP64 Chromium member extra fields are forbidden")
        if tag not in _ALLOWED_EXTRA_TAGS or tag in seen:
            raise ValueError("unknown or duplicate Chromium ZIP extra field")
        seen.add(tag)
        if tag == _EXTENDED_TIMESTAMP_TAG:
            if not value or value[0] & ~0x7:
                raise ValueError("Chromium timestamp extra field is invalid")
            expected = 5 if central else 1 + 4 * _bit_count(value[0] & 0x7)
            if len(value) != expected:
                raise ValueError("Chromium timestamp extra field length is invalid")
        elif tag == _UNIX_UID_GID_TAG:
            if len(value) < 4 or value[0] != 1:
                raise ValueError("Chromium Unix identity extra field is invalid")
            uid_length = value[1]
            gid_length_index = 2 + uid_length
            if (uid_length < 1 or uid_length > 8 or gid_length_index >= len(value)):
                raise ValueError("Chromium Unix identity extra field is invalid")
            gid_length = value[gid_length_index]
            if (gid_length < 1 or gid_length > 8
                    or gid_length_index + 1 + gid_length != len(value)):
                raise ValueError("Chromium Unix identity extra field is invalid")


def _bit_count(value: int) -> int:
    return bin(value).count("1")


def _decode_member_name(raw_name: bytes, flag_bits: int) -> str:
    if b"\x00" in raw_name or b"\\" in raw_name:
        raise ValueError("Chromium ZIP member contains NUL or backslash")
    encoding = "utf-8" if flag_bits & 0x800 else "cp437"
    try:
        name = raw_name.decode(encoding, errors="strict")
    except UnicodeDecodeError as error:
        raise ValueError("Chromium ZIP member name encoding is invalid") from error
    if unicodedata.normalize("NFC", name) != name:
        raise ValueError("Chromium ZIP member name is not NFC-normalized")
    if any(unicodedata.category(character).startswith("C") for character in name):
        raise ValueError("Chromium ZIP member name contains a control character")
    return name


def _match_zipinfo_to_central(info: zipfile.ZipInfo, record: _CentralRecord) -> None:
    if (info.orig_filename != record.decoded_name
            or info.flag_bits != record.flag_bits
            or info.compress_type != record.compression
            or info.CRC != record.crc32
            or info.compress_size != record.compressed_size
            or info.file_size != record.file_size
            or info.external_attr != record.external_attr
            or info.header_offset != record.local_header_offset
            or info.create_system != record.create_system
            or info.create_version != record.create_version
            or info.extract_version != record.extract_version):
        raise ValueError("Python ZIP view differs from validated central metadata")


def _validate_member_path_and_type(
    info: zipfile.ZipInfo,
    record: _CentralRecord,
    policy: ExtractionPolicy,
) -> Tuple[str, Tuple[str, ...], str]:
    name = record.decoded_name
    is_directory = name.endswith("/")
    canonical_name = name[:-1] if is_directory else name
    parts = PurePosixPath(canonical_name).parts
    if (not canonical_name or name.startswith("/") or "//" in canonical_name
            or any(part in {"", ".", ".."} for part in parts)
            or "/".join(parts) != canonical_name
            or len(parts) < 2 or parts[0] != policy.root_directory
            or len(parts) - 1 > policy.max_path_components):
        raise ValueError("Chromium ZIP member path is noncanonical or unsafe")
    if info.is_dir() != is_directory:
        raise ValueError("Chromium ZIP directory marker is inconsistent")
    full_mode = (record.external_attr >> 16) & 0xFFFF
    file_type = stat.S_IFMT(full_mode)
    expected_type = stat.S_IFDIR if is_directory else stat.S_IFREG
    if record.create_system != 3 or file_type != expected_type:
        raise ValueError("Chromium ZIP contains a link, special, or non-Unix member")
    manifest_path = "/".join(parts[1:])
    return manifest_path, tuple(parts), "directory" if is_directory else "regular"


def _extract_members(
    archive_zip: zipfile.ZipFile,
    preflight: _Preflight,
    output: _PrivateOutputTree,
    policy: ExtractionPolicy,
) -> Dict[str, str]:
    all_directories: Set[Tuple[str, ...]] = {(policy.root_directory,)}
    for member in preflight.members:
        for index in range(1, len(member.archive_parts)):
            all_directories.add(member.archive_parts[:index])
        if member.kind == "directory":
            all_directories.add(member.archive_parts)
    for parts in sorted(all_directories, key=lambda value: (len(value), _path_bytes(value))):
        output.create_directory(parts)

    hashes: Dict[str, str] = {}
    for member in sorted(preflight.members, key=lambda value: value.manifest_path.encode("utf-8")):
        if member.kind == "directory":
            continue
        descriptor = output.create_file(member.archive_parts, member.output_mode)
        digest = hashlib.sha256()
        expanded = 0
        try:
            with archive_zip.open(member.info, "r") as source:
                while True:
                    chunk = source.read(_READ_CHUNK_BYTES)
                    if not chunk:
                        break
                    expanded += len(chunk)
                    if (expanded > member.info.file_size
                            or expanded > policy.max_single_file_bytes):
                        raise ValueError("Chromium member expanded past its declared limit")
                    digest.update(chunk)
                    _write_all(descriptor, chunk)
            if expanded != member.info.file_size:
                raise ValueError("Chromium member length differs from ZIP metadata")
            os.fsync(descriptor)
            metadata = os.fstat(descriptor)
            if metadata.st_size != expanded:
                raise ValueError("Chromium output file length differs after write")
        finally:
            os.close(descriptor)
        member_digest = "sha256:" + digest.hexdigest()
        hashes[member.manifest_path] = member_digest
        if member.manifest_path == policy.executable_member:
            if expanded != policy.executable_bytes or member_digest != policy.executable_sha256:
                raise ValueError("locked Chromium executable bytes or digest differ")
    return hashes


def _hash_extracted_files(
    preflight: _Preflight,
    output: _PrivateOutputTree,
    policy: ExtractionPolicy,
) -> Dict[str, str]:
    hashes: Dict[str, str] = {}
    for member in sorted(preflight.members, key=lambda value: value.manifest_path.encode("utf-8")):
        if member.kind == "directory":
            continue
        descriptor = output.open_file_for_verification(member.archive_parts, member.output_mode)
        try:
            digest = hashlib.sha256()
            total = 0
            while True:
                chunk = os.read(descriptor, _READ_CHUNK_BYTES)
                if not chunk:
                    break
                total += len(chunk)
                if total > member.info.file_size:
                    raise ValueError("extracted Chromium member grew during verification")
                digest.update(chunk)
            if total != member.info.file_size:
                raise ValueError("extracted Chromium member length changed")
        finally:
            os.close(descriptor)
        value = "sha256:" + digest.hexdigest()
        hashes[member.manifest_path] = value
        if member.manifest_path == policy.executable_member:
            if total != policy.executable_bytes or value != policy.executable_sha256:
                raise ValueError("extracted Chromium executable does not match its lock")
    return hashes


def _canonical_entries(
    preflight: _Preflight,
    hashes: Mapping[str, str],
) -> List[Mapping[str, object]]:
    entries: List[Mapping[str, object]] = []
    for directory in preflight.directory_paths:
        entries.append({
            "mode": "040755",
            "path": directory,
            "type": "directory",
        })
    for member in preflight.members:
        if member.kind != "regular":
            continue
        entries.append({
            "mode": format(member.source_mode, "06o"),
            "path": member.manifest_path,
            "sha256": hashes[member.manifest_path],
            "sizeBytes": member.info.file_size,
            "type": "regular",
        })
    return sorted(entries, key=lambda entry: str(entry["path"]).encode("utf-8"))


def _tree_digest(
    policy: ExtractionPolicy,
    entries: Sequence[Mapping[str, object]],
) -> str:
    preimage: Mapping[str, object] = {
        "archiveSha256": policy.archive_sha256,
        "entries": list(entries),
        "platform": policy.platform,
        "rootDirectory": policy.root_directory,
        "schemaVersion": policy.tree_schema_version,
    }
    return "sha256:" + hashlib.sha256(_canonical_json(preimage).encode("utf-8")).hexdigest()


def _frozen_runtime_tree_digest(
    policy: ExtractionPolicy,
    distribution_tree_digest: str,
    entries: Sequence[Mapping[str, object]],
) -> str:
    frozen_entries: List[Mapping[str, object]] = []
    for entry in entries:
        frozen = dict(entry)
        if frozen["type"] == "directory":
            frozen["mode"] = "040555"
        elif frozen["path"] in policy.executable_members:
            frozen["mode"] = "100555"
        else:
            frozen["mode"] = "100444"
        frozen_entries.append(frozen)
    preimage: Mapping[str, object] = {
        "distributionTreeDigest": distribution_tree_digest,
        "entries": frozen_entries,
        "platform": policy.platform,
        "rootDirectory": policy.root_directory,
        "schemaVersion": _FROZEN_TREE_SCHEMA_VERSION,
    }
    return "sha256:" + hashlib.sha256(_canonical_json(preimage).encode("utf-8")).hexdigest()


def _canonical_json(value: object) -> str:
    return json.dumps(
        value,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ) + "\n"


def _sha256_fd(descriptor: int, expected_bytes: int) -> str:
    digest = hashlib.sha256()
    offset = 0
    while offset < expected_bytes:
        chunk = os.pread(descriptor, min(_READ_CHUNK_BYTES, expected_bytes - offset), offset)
        if not chunk:
            raise ValueError("file ended before its locked byte length")
        digest.update(chunk)
        offset += len(chunk)
    if os.pread(descriptor, 1, expected_bytes):
        raise ValueError("file exceeds its locked byte length")
    return "sha256:" + digest.hexdigest()


def _pread_exact(descriptor: int, length: int, offset: int) -> bytes:
    if length < 0 or offset < 0:
        raise ValueError("negative ZIP read range is forbidden")
    result = bytearray()
    while len(result) < length:
        chunk = os.pread(descriptor, length - len(result), offset + len(result))
        if not chunk:
            raise ValueError("Chromium ZIP metadata is truncated")
        result.extend(chunk)
    return bytes(result)


def _write_all(descriptor: int, data: bytes) -> None:
    remaining = memoryview(data)
    while remaining:
        written = os.write(descriptor, remaining)
        if written < 1:
            raise OSError("short write while extracting Chromium member")
        remaining = remaining[written:]


def _verify_archive_identity(
    path: Path,
    descriptor: int,
    identity: Tuple[int, int, int, int],
    policy: ExtractionPolicy,
) -> None:
    descriptor_metadata = os.fstat(descriptor)
    path_metadata = path.lstat()
    if (_regular_file_identity(descriptor_metadata) != identity
            or _regular_file_identity(path_metadata) != identity
            or descriptor_metadata.st_size != policy.archive_bytes
            or path_metadata.st_size != policy.archive_bytes
            or stat.S_ISLNK(path_metadata.st_mode)
            or stat.S_IMODE(descriptor_metadata.st_mode) != policy.archive_mode
            or stat.S_IMODE(path_metadata.st_mode) != policy.archive_mode
            or (policy.require_current_uid
                and (descriptor_metadata.st_uid != os.geteuid()
                     or path_metadata.st_uid != os.geteuid()))):
        raise ValueError("Chromium archive identity changed during extraction")


def _regular_file_identity(metadata: os.stat_result) -> Tuple[int, int, int, int]:
    if not stat.S_ISREG(metadata.st_mode) or metadata.st_nlink != 1:
        raise ValueError("archive is no longer a single-link regular file")
    return metadata.st_dev, metadata.st_ino, metadata.st_nlink, metadata.st_size


def _directory_identity(metadata: os.stat_result) -> Tuple[int, int]:
    if not stat.S_ISDIR(metadata.st_mode):
        raise ValueError("output is no longer a real directory")
    return metadata.st_dev, metadata.st_ino


def _path_bytes(parts: Iterable[str]) -> bytes:
    return "/".join(parts).encode("utf-8")


def _is_sha256(value: str) -> bool:
    if not value.startswith("sha256:") or len(value) != 71:
        return False
    try:
        int(value[7:], 16)
    except ValueError:
        return False
    return value[7:] == value[7:].lower()


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError, zipfile.BadZipFile, zipfile.LargeZipFile) as error:
        print(f"private Chromium extraction failed: {error}", file=sys.stderr)
        raise SystemExit(1)
