from __future__ import annotations

import hashlib
import importlib.util
import json
import os
from pathlib import Path
import stat
import sys
import tempfile
import unittest
from unittest import mock


HERE = Path(__file__).resolve().parent
MODULE_PATH = HERE / "freeze-private-chromium-runtime-v049.py"
SPEC = importlib.util.spec_from_file_location("freeze_private_chromium_runtime_v049", MODULE_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("failed to load Chromium runtime freeze module")
module = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = module
SPEC.loader.exec_module(module)


class ChromiumRuntimeFreezeTests(unittest.TestCase):
    def test_nonroot_fixture_plan_is_read_only_and_non_promotional(self) -> None:
        with fixture() as value:
            before = modes(value.runtime_root)
            audit = module._test_only_plan_private_chromium_runtime_v049(
                value.runtime_root, value.policy
            )
            self.assertEqual(modes(value.runtime_root), before)
            self.assertEqual(audit["operation"], "plan")
            self.assertTrue(audit["testFixture"])
            self.assertFalse(audit["rootPrivilegeVerified"])
            self.assertTrue(audit["mutableStagingTreeVerified"])
            self.assertFalse(audit["frozenModeTransitionApplied"])
            self.assertIsNone(audit["frozenRuntimeTreeDigest"])
            self.assertFalse(audit["runtimeRootReadOnlyMountVerified"])
            self.assertFalse(audit["mountNamespaceIsolationVerified"])
            self.assertFalse(audit["immutableRuntimeSnapshotVerified"])
            self.assertEqual(
                audit["extendedAttributeInspectionAvailable"],
                hasattr(module.os, "listxattr"),
            )
            self.assertEqual(
                audit["extendedAttributesAndAclMetadataAbsent"],
                hasattr(module.os, "listxattr"),
            )
            self.assertTrue(all(claim is False for claim in audit["claims"].values()))
            self.assertNotIn(str(value.runtime_root), json.dumps(audit))

    def test_nonroot_fixture_execution_applies_only_locked_modes_and_reverifies(self) -> None:
        with fixture() as value:
            audit = module._test_only_freeze_private_chromium_runtime_v049(
                value.runtime_root, value.policy
            )
            self.assertEqual(stat.S_IMODE(value.runtime_root.stat().st_mode), 0o555)
            self.assertEqual(stat.S_IMODE(value.distribution_root.stat().st_mode), 0o555)
            self.assertEqual(stat.S_IMODE((value.distribution_root / "resources").stat().st_mode), 0o555)
            self.assertEqual(stat.S_IMODE((value.distribution_root / "chrome").stat().st_mode), 0o555)
            self.assertEqual(stat.S_IMODE((value.distribution_root / "README").stat().st_mode), 0o444)
            self.assertEqual(
                audit["plannedFrozenRuntimeTreeDigest"], value.policy.expected_frozen_tree_digest
            )
            self.assertEqual(audit["frozenRuntimeTreeDigest"], value.policy.expected_frozen_tree_digest)
            self.assertTrue(audit["frozenModeTransitionApplied"])
            self.assertTrue(audit["frozenRuntimeTreeVerified"])
            self.assertFalse(audit["runtimeRootReadOnlyMountVerified"])
            self.assertFalse(audit["privilegedConcurrentMutationExcluded"])

    def test_production_plan_and_execution_are_effective_root_only(self) -> None:
        with fixture() as value, mock.patch.object(module.os, "geteuid", return_value=1001):
            with self.assertRaisesRegex(PermissionError, "effective UID zero"):
                module.plan_private_chromium_runtime_v049(value.runtime_root)
            with self.assertRaisesRegex(PermissionError, "effective UID zero"):
                module.freeze_private_chromium_runtime_v049(value.runtime_root)

    def test_rejects_content_mode_owner_and_cardinality_changes(self) -> None:
        with fixture() as value:
            target = value.distribution_root / "README"
            original = target.read_bytes()
            target.write_bytes(bytes([original[0] ^ 1]) + original[1:])
            os.chmod(target, 0o600)
            with self.assertRaisesRegex(ValueError, "digest differs"):
                module._test_only_plan_private_chromium_runtime_v049(
                    value.runtime_root, value.policy
                )

        with fixture() as value:
            os.chmod(value.distribution_root / "README", 0o644)
            with self.assertRaisesRegex(ValueError, "mode or identity"):
                module._test_only_plan_private_chromium_runtime_v049(
                    value.runtime_root, value.policy
                )

        with fixture() as value:
            changed = dataclass_replace(value.policy, owner_uid=value.policy.owner_uid + 1)
            with self.assertRaisesRegex(ValueError, "ownership or mode"):
                module._test_only_plan_private_chromium_runtime_v049(
                    value.runtime_root, changed
                )

        with fixture() as value:
            (value.distribution_root / "extra").write_bytes(b"extra")
            os.chmod(value.distribution_root / "extra", 0o600)
            with self.assertRaisesRegex(ValueError, "file count exceeded"):
                module._test_only_plan_private_chromium_runtime_v049(
                    value.runtime_root, value.policy
                )

    def test_rejects_symlink_hardlink_xattr_and_nested_mount_indicators(self) -> None:
        with fixture() as value:
            os.symlink("README", value.distribution_root / "alias")
            with self.assertRaisesRegex(ValueError, "non-regular"):
                module._test_only_plan_private_chromium_runtime_v049(
                    value.runtime_root, value.policy
                )

        with fixture() as value:
            os.link(
                value.distribution_root / "README",
                value.distribution_root / "linked",
            )
            with self.assertRaisesRegex(ValueError, "identity is unsafe"):
                module._test_only_plan_private_chromium_runtime_v049(
                    value.runtime_root, value.policy
                )

        if hasattr(os, "setxattr"):
            with fixture() as value:
                target = value.distribution_root / "README"
                try:
                    os.setxattr(target, "user.tailing-test", b"1", follow_symlinks=False)
                except OSError:
                    pass
                else:
                    with self.assertRaisesRegex(ValueError, "extended attributes"):
                        module._test_only_plan_private_chromium_runtime_v049(
                            value.runtime_root, value.policy
                        )

        with fixture() as value, mock.patch.object(
            module.os.path, "ismount", side_effect=lambda path: Path(path).name == "resources"
        ):
            with self.assertRaisesRegex(ValueError, "nested mount"):
                module._test_only_plan_private_chromium_runtime_v049(
                    value.runtime_root, value.policy
                )

    def test_rejects_a_production_like_or_unbounded_test_policy(self) -> None:
        with fixture() as value:
            for changed in [
                dataclass_replace(value.policy, test_fixture=False),
                dataclass_replace(value.policy, require_root_authority=True),
                dataclass_replace(value.policy, require_trusted_ancestors=True),
                dataclass_replace(value.policy, regular_file_count=65),
                dataclass_replace(value.policy, expanded_byte_length=1024 * 1024 + 1),
            ]:
                with self.assertRaisesRegex(ValueError, "test-only"):
                    module._test_only_plan_private_chromium_runtime_v049(
                        value.runtime_root, changed
                    )

    def test_required_extended_attribute_inspection_fails_closed_when_unavailable(self) -> None:
        with fixture() as value, mock.patch.object(
            module.os,
            "listxattr",
            create=True,
            side_effect=NotImplementedError,
        ):
            policy = dataclass_replace(
                value.policy,
                require_extended_attribute_inspection=True,
            )
            with self.assertRaisesRegex(RuntimeError, "inspection is unavailable"):
                module._test_only_plan_private_chromium_runtime_v049(
                    value.runtime_root, policy
                )


class fixture:
    def __init__(self) -> None:
        self.temporary: tempfile.TemporaryDirectory[str] | None = None

    def __enter__(self) -> "fixture":
        self.temporary = tempfile.TemporaryDirectory(prefix="tf-chromium-freeze-v049-")
        self.outer_root = Path(self.temporary.name).resolve()
        self.runtime_root = self.outer_root / "runtime"
        self.distribution_root = self.runtime_root / "chrome-linux64"
        resources = self.distribution_root / "resources"
        resources.mkdir(parents=True, mode=0o700)
        (self.distribution_root / "chrome").write_bytes(b"#!/bin/sh\nexit 0\n")
        (self.distribution_root / "README").write_bytes(b"frozen fixture\n")
        (resources / "value.txt").write_bytes(b"locked value\n")
        os.chmod(self.distribution_root / "chrome", 0o700)
        os.chmod(self.distribution_root / "README", 0o600)
        os.chmod(resources / "value.txt", 0o600)
        os.chmod(resources, 0o700)
        os.chmod(self.distribution_root, 0o700)
        os.chmod(self.runtime_root, 0o700)
        owner = self.runtime_root.stat()
        entries = frozen_entries(self.distribution_root)
        distribution_digest = "sha256:" + "a" * 64
        schema_version = "tf.private-chromium-frozen-runtime-tree-test/0.4.9"
        frozen_digest = sha256(canonical_bytes({
            "distributionTreeDigest": distribution_digest,
            "entries": entries,
            "platform": "linux-x64",
            "rootDirectory": "chrome-linux64",
            "schemaVersion": schema_version,
        }))
        main = next(entry for entry in entries if entry["path"] == "chrome")
        self.policy = module._FreezePolicy(
            schema_version=schema_version,
            distribution_tree_digest=distribution_digest,
            expected_frozen_tree_digest=frozen_digest,
            root_directory="chrome-linux64",
            regular_file_count=3,
            directory_count=1,
            expanded_byte_length=sum(
                int(entry["sizeBytes"]) for entry in entries if entry["type"] == "regular"
            ),
            executable_paths=frozenset({"chrome"}),
            main_executable="chrome",
            main_executable_size=int(main["sizeBytes"]),
            main_executable_sha256=str(main["sha256"]),
            owner_uid=owner.st_uid,
            owner_gid=owner.st_gid,
            require_root_authority=False,
            require_trusted_ancestors=False,
            require_extended_attribute_inspection=False,
            test_fixture=True,
        )
        return self

    def __exit__(self, _kind, _value, _traceback) -> None:
        restore_write_modes(self.outer_root)
        if self.temporary is not None:
            self.temporary.cleanup()


def frozen_entries(distribution_root: Path) -> list[dict[str, object]]:
    entries: list[dict[str, object]] = []

    def walk(directory: Path, relative: str) -> None:
        for child in sorted(directory.iterdir(), key=lambda path: os.fsencode(path.name)):
            child_relative = child.name if not relative else f"{relative}/{child.name}"
            if child.is_dir():
                entries.append({
                    "mode": "040555",
                    "path": child_relative,
                    "type": "directory",
                })
                walk(child, child_relative)
            else:
                data = child.read_bytes()
                entries.append({
                    "mode": "100555" if child_relative == "chrome" else "100444",
                    "path": child_relative,
                    "sha256": sha256(data),
                    "sizeBytes": len(data),
                    "type": "regular",
                })

    walk(distribution_root, "")
    return sorted(entries, key=lambda entry: os.fsencode(str(entry["path"])))


def modes(root: Path) -> dict[str, int]:
    result = {".": stat.S_IMODE(root.stat().st_mode)}
    for child in root.rglob("*"):
        result[str(child.relative_to(root))] = stat.S_IMODE(child.lstat().st_mode)
    return result


def restore_write_modes(root: Path) -> None:
    if not root.exists() or root.is_symlink():
        return
    if root.is_dir():
        os.chmod(root, 0o700)
        for child in root.iterdir():
            if child.is_dir() and not child.is_symlink():
                restore_write_modes(child)


def dataclass_replace(value, **changes):
    fields = {field.name: getattr(value, field.name) for field in value.__dataclass_fields__.values()}
    fields.update(changes)
    return type(value)(**fields)


def canonical_bytes(value: object) -> bytes:
    return (
        json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n"
    ).encode("utf-8")


def sha256(value: bytes) -> str:
    return "sha256:" + hashlib.sha256(value).hexdigest()


if __name__ == "__main__":
    unittest.main()
