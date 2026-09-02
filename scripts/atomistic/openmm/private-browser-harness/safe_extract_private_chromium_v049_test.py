from __future__ import annotations

import dataclasses
import hashlib
import json
import os
import stat
import struct
import tempfile
import unittest
import warnings
import zipfile
from pathlib import Path
from typing import Iterable, List, Mapping, Optional, Sequence, Tuple
from unittest import mock

import safe_extract_private_chromium_v049 as extractor_module
from safe_extract_private_chromium_v049 import (
    ExtractionPolicy,
    _extract_private_chromium_v049_for_test,
    extract_private_chromium_v049,
    main,
)


ROOT = "chrome-linux64"
Member = Tuple[str, bytes, int, bool]


def regular(path: str, data: bytes, mode: int = 0o644) -> Member:
    return path, data, stat.S_IFREG | mode, False


def directory(path: str, mode: int = 0o755) -> Member:
    return path, b"", stat.S_IFDIR | mode, True


def write_archive(
    path: Path,
    members: Sequence[Member],
    *,
    compression: int = zipfile.ZIP_DEFLATED,
    create_system: int = 3,
    archive_comment: bytes = b"",
    member_extra: bytes = b"",
    member_comment: bytes = b"",
) -> None:
    with zipfile.ZipFile(path, "w", allowZip64=False) as handle:
        handle.comment = archive_comment
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", UserWarning)
            for member_path, data, full_mode, is_directory in members:
                name = member_path + ("/" if is_directory and not member_path.endswith("/") else "")
                info = zipfile.ZipInfo(name)
                info.create_system = create_system
                info.external_attr = full_mode << 16
                info.extra = member_extra
                info.comment = member_comment
                handle.writestr(
                    info,
                    data,
                    compress_type=zipfile.ZIP_STORED if is_directory else compression,
                )


def digest_file(path: Path) -> str:
    return "sha256:" + hashlib.sha256(path.read_bytes()).hexdigest()


def digest_bytes(value: bytes) -> str:
    return "sha256:" + hashlib.sha256(value).hexdigest()


def policy_for(
    archive: Path,
    members: Sequence[Member],
    *,
    executable_member: str = "chrome",
    executable_members: Optional[Iterable[str]] = None,
    exact_counts: bool = False,
    expected_tree_digest: Optional[str] = None,
) -> ExtractionPolicy:
    executable_data = next(
        data for path, data, _mode, is_directory in members
        if path == f"{ROOT}/{executable_member}" and not is_directory
    )
    if executable_members is None:
        executable_members = {
            path[len(ROOT) + 1:]
            for path, _data, mode, is_directory in members
            if (not is_directory and path.startswith(ROOT + "/")
                and stat.S_IMODE(mode) & 0o111)
        }
    with zipfile.ZipFile(archive) as handle:
        infos = handle.infolist()
        expanded = sum(info.file_size for info in infos)
        compressed = sum(info.compress_size for info in infos)
    derived_directories = set()
    for path, _data, _mode, is_directory in members:
        if not path.startswith(ROOT + "/"):
            continue
        relative = path[len(ROOT) + 1:].rstrip("/")
        parts = relative.split("/")
        if is_directory:
            derived_directories.add(relative)
        for index in range(1, len(parts)):
            derived_directories.add("/".join(parts[:index]))
    return ExtractionPolicy(
        archive_bytes=archive.stat().st_size,
        archive_sha256=digest_file(archive),
        root_directory=ROOT,
        executable_member=executable_member,
        executable_bytes=len(executable_data),
        executable_sha256=digest_bytes(executable_data),
        executable_members=frozenset(executable_members),
        archive_mode=stat.S_IMODE(archive.stat().st_mode),
        require_current_uid=True,
        expected_tree_digest=expected_tree_digest,
        expected_frozen_tree_digest=None,
        expected_member_count=len(infos) if exact_counts else None,
        expected_file_count=(
            sum(not is_directory for _path, _data, _mode, is_directory in members)
            if exact_counts else None
        ),
        expected_directory_count=len(derived_directories) if exact_counts else None,
        expected_expanded_bytes=expanded if exact_counts else None,
        expected_compressed_bytes=compressed if exact_counts else None,
        max_members=max(32, len(infos) + 1),
        max_single_file_bytes=max(1024 * 1024, expanded + 1),
        max_expanded_bytes=max(2 * 1024 * 1024, expanded + 1),
        max_compressed_bytes=max(2 * 1024 * 1024, compressed + 1),
        max_member_compression_ratio=1000.0,
    )


def independent_tree_digest(
    archive: Path,
    members: Sequence[Member],
    policy: ExtractionPolicy,
) -> str:
    directories = set()
    entries: List[Mapping[str, object]] = []
    for path, data, full_mode, is_directory in members:
        relative = path[len(ROOT) + 1:].rstrip("/")
        parts = relative.split("/")
        if is_directory:
            directories.add(relative)
        else:
            entries.append({
                "mode": format(full_mode, "06o"),
                "path": relative,
                "sha256": digest_bytes(data),
                "sizeBytes": len(data),
                "type": "regular",
            })
        for index in range(1, len(parts)):
            directories.add("/".join(parts[:index]))
    entries.extend({
        "mode": "040755",
        "path": path,
        "type": "directory",
    } for path in directories)
    entries.sort(key=lambda entry: str(entry["path"]).encode("utf-8"))
    preimage = {
        "archiveSha256": digest_file(archive),
        "entries": entries,
        "platform": policy.platform,
        "rootDirectory": ROOT,
        "schemaVersion": policy.tree_schema_version,
    }
    encoded = (json.dumps(
        preimage,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ) + "\n").encode("utf-8")
    return "sha256:" + hashlib.sha256(encoded).hexdigest()


def private_output(root: Path) -> Path:
    output = root / "output"
    output.mkdir(mode=0o700)
    output.chmod(0o700)
    return output


def replace_all_same_length(path: Path, needle: bytes, replacement: bytes) -> None:
    if len(needle) != len(replacement):
        raise AssertionError("test mutation must preserve byte length")
    value = path.read_bytes()
    if value.count(needle) < 2:
        raise AssertionError("expected local and central filename copies")
    path.write_bytes(value.replace(needle, replacement))


def add_flag(path: Path, flag: int, *, local: bool = True, central: bool = True) -> None:
    value = bytearray(path.read_bytes())
    if local:
        local_offset = value.index(b"PK\x03\x04")
        current = struct.unpack_from("<H", value, local_offset + 6)[0]
        struct.pack_into("<H", value, local_offset + 6, current | flag)
    if central:
        central_offset = value.index(b"PK\x01\x02")
        current = struct.unpack_from("<H", value, central_offset + 8)[0]
        struct.pack_into("<H", value, central_offset + 8, current | flag)
    path.write_bytes(value)


class SafeExtractPrivateChromiumV049Tests(unittest.TestCase):
    def test_extracts_with_private_modes_and_canonical_tree_digest(self) -> None:
        members = [
            regular(f"{ROOT}/chrome", b"locked-chrome", 0o755),
            regular(f"{ROOT}/chrome-wrapper", b"wrapper", 0o755),
            regular(f"{ROOT}/README", b"read me", 0o644),
            regular(f"{ROOT}/deb.deps", b"deps", 0o600),
            directory(f"{ROOT}/resources"),
            regular(f"{ROOT}/resources/nested/value.bin", b"value", 0o644),
        ]
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            archive = root / "chromium.zip"
            write_archive(archive, members)
            output = private_output(root)
            policy = policy_for(archive, members, exact_counts=True)
            expected_digest = independent_tree_digest(archive, members, policy)
            policy = dataclasses.replace(policy, expected_tree_digest=expected_digest)

            summary = _extract_private_chromium_v049_for_test(
                archive,
                output,
                test_policy=policy,
            )

            self.assertEqual(summary["treeDigest"], expected_digest)
            self.assertEqual(summary["memberCount"], 6)
            self.assertEqual(summary["fileCount"], 5)
            self.assertEqual(summary["directoryCount"], 2)
            self.assertEqual(summary["executable"], {
                "byteLength": len(b"locked-chrome"),
                "sha256": digest_bytes(b"locked-chrome"),
            })
            self.assertEqual(summary["treeDigestSemantics"],
                             "archive-distribution-tree-identity")
            self.assertEqual(summary["plannedFrozenRuntimeTree"], {
                "digest": summary["plannedFrozenRuntimeTree"]["digest"],
                "schemaVersion": "tf.private-chromium-frozen-runtime-tree/0.4.9",
                "verified": False,
            })
            self.assertRegex(
                str(summary["plannedFrozenRuntimeTree"]["digest"]),
                r"^sha256:[0-9a-f]{64}$",
            )
            self.assertEqual(summary["claims"], {
                "completeRuntimeEnvironmentVerified": False,
                "immutableRuntimeSnapshotVerified": False,
                "browserExecutionVerified": False,
                "executionAuthenticityVerified": False,
                "reproduced": False,
                "promotionEligible": False,
                "publicDistributionEligible": False,
                "cloudflareDistributionEligible": False,
            })
            self.assertEqual(stat.S_IMODE(output.stat().st_mode), 0o700)
            self.assertEqual(stat.S_IMODE((output / ROOT).stat().st_mode), 0o700)
            self.assertEqual(
                stat.S_IMODE((output / ROOT / "resources" / "nested").stat().st_mode),
                0o700,
            )
            self.assertEqual(stat.S_IMODE((output / ROOT / "chrome").stat().st_mode), 0o700)
            self.assertEqual(
                stat.S_IMODE((output / ROOT / "chrome-wrapper").stat().st_mode),
                0o700,
            )
            self.assertEqual(stat.S_IMODE((output / ROOT / "README").stat().st_mode), 0o600)
            self.assertEqual(stat.S_IMODE((output / ROOT / "deb.deps").stat().st_mode), 0o600)
            serialized_summary = json.dumps(summary, sort_keys=True)
            self.assertNotIn(str(root), serialized_summary)
            self.assertNotIn('"path"', serialized_summary)

    def test_command_line_path_cannot_override_the_production_lock(self) -> None:
        members = [regular(f"{ROOT}/chrome", b"tiny", 0o755)]
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            archive = root / "chromium.zip"
            write_archive(archive, members)
            output = private_output(root)
            policy = policy_for(archive, members)
            with self.assertRaises(TypeError):
                extract_private_chromium_v049(
                    archive,
                    output,
                    test_policy=policy,  # type: ignore[call-arg]
                )
            archive.chmod(0o400)
            with self.assertRaisesRegex(ValueError, "byte length"):
                main(["--archive", str(archive), "--output", str(output)])
            self.assertEqual(list(output.iterdir()), [])
            with self.assertRaises(SystemExit):
                main([
                    "--archive", str(archive),
                    "--output", str(output),
                    "--test-policy", "unsafe",
                ])

    def test_rejects_traversal_backslash_duplicate_and_nul_paths(self) -> None:
        cases = {
            "traversal": [
                regular(f"{ROOT}/chrome", b"chrome", 0o755),
                regular(f"{ROOT}/../escape", b"bad"),
            ],
            "backslash": [
                regular(f"{ROOT}/chrome", b"chrome", 0o755),
                regular(f"{ROOT}\\escape", b"bad"),
            ],
            "duplicate": [
                regular(f"{ROOT}/chrome", b"chrome", 0o755),
                regular(f"{ROOT}/same", b"one"),
                regular(f"{ROOT}/same", b"two"),
            ],
            "casefold-collision": [
                regular(f"{ROOT}/chrome", b"chrome", 0o755),
                regular(f"{ROOT}/Value", b"one"),
                regular(f"{ROOT}/value", b"two"),
            ],
            "nul": [
                regular(f"{ROOT}/chrome", b"chrome", 0o755),
                regular(f"{ROOT}/badxx", b"bad"),
            ],
        }
        for case, members in cases.items():
            with self.subTest(case=case), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary).resolve()
                archive = root / "chromium.zip"
                write_archive(archive, members)
                if case == "nul":
                    replace_all_same_length(
                        archive,
                        f"{ROOT}/badxx".encode(),
                        f"{ROOT}/ba\x00xx".encode(),
                    )
                policy = policy_for(archive, members)
                output = private_output(root)
                with self.assertRaises((ValueError, zipfile.BadZipFile)):
                    _extract_private_chromium_v049_for_test(
                        archive, output, test_policy=policy,
                    )
                self.assertTrue(output.is_dir())
                self.assertEqual(list(output.iterdir()), [])
                self.assertFalse((root / "escape").exists())

    def test_rejects_symlink_special_and_non_unix_members(self) -> None:
        cases = (
            ("symlink", stat.S_IFLNK | 0o777, 3),
            ("fifo", stat.S_IFIFO | 0o600, 3),
            ("non-unix", stat.S_IFREG | 0o644, 0),
        )
        for case, unsafe_mode, create_system in cases:
            with self.subTest(case=case), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary).resolve()
                archive = root / "chromium.zip"
                members = [
                    regular(f"{ROOT}/chrome", b"chrome", 0o755),
                    (f"{ROOT}/unsafe", b"target", unsafe_mode, False),
                ]
                write_archive(archive, members, create_system=create_system)
                policy = policy_for(archive, members)
                output = private_output(root)
                with self.assertRaises(ValueError):
                    _extract_private_chromium_v049_for_test(
                        archive, output, test_policy=policy,
                    )
                self.assertEqual(list(output.iterdir()), [])

    def test_rejects_encryption_descriptor_zip64_and_unknown_extra(self) -> None:
        for case in ("encrypted", "descriptor", "zip64-extra", "unknown-extra"):
            with self.subTest(case=case), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary).resolve()
                archive = root / "chromium.zip"
                members = [regular(f"{ROOT}/chrome", b"chrome", 0o755)]
                extra = b""
                if case == "zip64-extra":
                    extra = struct.pack("<HHQ", 0x0001, 8, 6)
                elif case == "unknown-extra":
                    extra = struct.pack("<HHB", 0xCAFE, 1, 0)
                write_archive(archive, members, member_extra=extra)
                if case == "encrypted":
                    add_flag(archive, 0x1)
                elif case == "descriptor":
                    add_flag(archive, 0x8)
                policy = policy_for(archive, members)
                output = private_output(root)
                with self.assertRaises((ValueError, zipfile.BadZipFile, zipfile.LargeZipFile)):
                    _extract_private_chromium_v049_for_test(
                        archive, output, test_policy=policy,
                    )
                self.assertEqual(list(output.iterdir()), [])

    def test_rejects_file_directory_collisions(self) -> None:
        members = [
            regular(f"{ROOT}/chrome", b"chrome", 0o755),
            regular(f"{ROOT}/node", b"file"),
            regular(f"{ROOT}/node/child", b"child"),
        ]
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            archive = root / "chromium.zip"
            write_archive(archive, members)
            policy = policy_for(archive, members)
            output = private_output(root)
            with self.assertRaisesRegex(ValueError, "collision"):
                _extract_private_chromium_v049_for_test(
                    archive, output, test_policy=policy,
                )
            self.assertEqual(list(output.iterdir()), [])

    def test_enforces_count_single_file_total_and_ratio_bounds(self) -> None:
        for case in ("count", "single", "total", "ratio"):
            with self.subTest(case=case), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary).resolve()
                archive = root / "chromium.zip"
                members = [
                    regular(f"{ROOT}/chrome", b"A" * 4096, 0o755),
                    regular(f"{ROOT}/value", b"B" * 4096),
                ]
                write_archive(archive, members)
                policy = policy_for(archive, members)
                if case == "count":
                    policy = dataclasses.replace(policy, max_members=1)
                elif case == "single":
                    policy = dataclasses.replace(policy, max_single_file_bytes=4095)
                elif case == "total":
                    policy = dataclasses.replace(policy, max_expanded_bytes=8191)
                else:
                    policy = dataclasses.replace(policy, max_member_compression_ratio=2.0)
                output = private_output(root)
                with self.assertRaises(ValueError):
                    _extract_private_chromium_v049_for_test(
                        archive, output, test_policy=policy,
                    )
                self.assertEqual(list(output.iterdir()), [])

    def test_rejects_unexpected_executable_modes(self) -> None:
        members = [
            regular(f"{ROOT}/chrome", b"chrome", 0o755),
            regular(f"{ROOT}/surprise", b"surprise", 0o755),
        ]
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            archive = root / "chromium.zip"
            write_archive(archive, members)
            policy = policy_for(archive, members, executable_members={"chrome"})
            output = private_output(root)
            with self.assertRaisesRegex(ValueError, "allowlist"):
                _extract_private_chromium_v049_for_test(
                    archive, output, test_policy=policy,
                )
            self.assertEqual(list(output.iterdir()), [])

    def test_failure_removes_only_created_members_and_keeps_output_root(self) -> None:
        members = [
            regular(f"{ROOT}/chrome", b"chrome", 0o755),
            regular(f"{ROOT}/nested/value", b"value"),
        ]
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            archive = root / "chromium.zip"
            write_archive(archive, members)
            policy = policy_for(archive, members)
            policy = dataclasses.replace(
                policy,
                expected_tree_digest="sha256:" + "0" * 64,
            )
            output = private_output(root)
            with self.assertRaisesRegex(ValueError, "tree digest"):
                _extract_private_chromium_v049_for_test(
                    archive, output, test_policy=policy,
                )
            self.assertTrue(output.is_dir())
            self.assertEqual(stat.S_IMODE(output.stat().st_mode), 0o700)
            self.assertEqual(list(output.iterdir()), [])

            sentinel = output / "user-owned"
            sentinel.write_bytes(b"keep")
            with self.assertRaisesRegex(ValueError, "empty"):
                _extract_private_chromium_v049_for_test(
                    archive, output, test_policy=policy,
                )
            self.assertEqual(sentinel.read_bytes(), b"keep")

    def test_final_archive_rehash_detects_same_inode_mutation(self) -> None:
        members = [regular(f"{ROOT}/chrome", b"chrome", 0o755)]
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            archive = root / "chromium.zip"
            write_archive(archive, members)
            policy = policy_for(archive, members)
            output = private_output(root)
            original_hash = extractor_module._hash_extracted_files

            def hash_then_mutate(*args: object, **kwargs: object) -> object:
                result = original_hash(*args, **kwargs)
                with archive.open("r+b") as handle:
                    handle.seek(0)
                    handle.write(b"X")
                    handle.flush()
                    os.fsync(handle.fileno())
                return result

            with mock.patch.object(
                extractor_module,
                "_hash_extracted_files",
                side_effect=hash_then_mutate,
            ):
                with self.assertRaisesRegex(ValueError, "changed during extraction"):
                    _extract_private_chromium_v049_for_test(
                        archive, output, test_policy=policy,
                    )
            self.assertEqual(list(output.iterdir()), [])

    def test_cleanup_preserves_a_same_name_replacement(self) -> None:
        members = [regular(f"{ROOT}/chrome", b"chrome", 0o755)]
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            archive = root / "chromium.zip"
            write_archive(archive, members)
            policy = policy_for(archive, members)
            output = private_output(root)
            replacement = output / ROOT / "chrome"

            def replace_then_fail(*_args: object, **_kwargs: object) -> str:
                replacement.unlink()
                replacement.write_bytes(b"same-name replacement")
                replacement.chmod(0o700)
                raise ValueError("forced post-extraction failure")

            with mock.patch.object(
                extractor_module,
                "_tree_digest",
                side_effect=replace_then_fail,
            ):
                with self.assertRaisesRegex(ValueError, "forced post-extraction failure"):
                    _extract_private_chromium_v049_for_test(
                        archive, output, test_policy=policy,
                    )
            self.assertEqual(replacement.read_bytes(), b"same-name replacement")

    @unittest.skipUnless(hasattr(os, "symlink") and hasattr(os, "link"), "links required")
    def test_rejects_symlink_and_hardlinked_archive_and_unsafe_output(self) -> None:
        members = [regular(f"{ROOT}/chrome", b"chrome", 0o755)]
        for case in ("archive-symlink", "archive-hardlink", "output-symlink", "output-mode"):
            with self.subTest(case=case), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary).resolve()
                archive = root / "chromium.zip"
                write_archive(archive, members)
                policy = policy_for(archive, members)
                output = private_output(root)
                selected_archive = archive
                selected_output = output
                if case == "archive-symlink":
                    selected_archive = root / "archive-link.zip"
                    selected_archive.symlink_to(archive)
                elif case == "archive-hardlink":
                    selected_archive = root / "archive-hardlink.zip"
                    os.link(archive, selected_archive)
                elif case == "output-symlink":
                    selected_output = root / "output-link"
                    selected_output.symlink_to(output, target_is_directory=True)
                else:
                    output.chmod(0o755)
                with self.assertRaises(ValueError):
                    _extract_private_chromium_v049_for_test(
                        selected_archive,
                        selected_output,
                        test_policy=policy,
                    )
                self.assertEqual(list(output.iterdir()), [])

    def test_rejects_local_central_mismatch_and_comments(self) -> None:
        for case in ("mismatch", "archive-comment", "member-comment"):
            with self.subTest(case=case), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary).resolve()
                archive = root / "chromium.zip"
                members = [regular(f"{ROOT}/chrome", b"chrome", 0o755)]
                write_archive(
                    archive,
                    members,
                    archive_comment=b"comment" if case == "archive-comment" else b"",
                    member_comment=b"comment" if case == "member-comment" else b"",
                )
                if case == "mismatch":
                    add_flag(archive, 0x4, local=True, central=False)
                policy = policy_for(archive, members)
                output = private_output(root)
                with self.assertRaises(ValueError):
                    _extract_private_chromium_v049_for_test(
                        archive, output, test_policy=policy,
                    )
                self.assertEqual(list(output.iterdir()), [])


if __name__ == "__main__":
    unittest.main()
