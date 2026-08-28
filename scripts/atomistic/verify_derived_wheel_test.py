from __future__ import annotations

import base64
import contextlib
import csv
import hashlib
import io
import json
import os
import stat
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

import verify_derived_wheel


EXPECTED_FILENAME = verify_derived_wheel.EXPECTED_WHEEL_FILENAME


class DerivedWheelVerifierTests(unittest.TestCase):
    def test_accepts_exact_wheel_and_emits_deterministic_bounded_provenance(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            wheel = make_wheel(Path(temporary).resolve())
            arguments = valid_arguments(wheel)
            first = run_main(arguments)
            second = run_main(arguments)
            self.assertEqual(first, second)
            self.assertLessEqual(
                len(first.encode("utf-8")), verify_derived_wheel.MAX_PROVENANCE_BYTES
            )
            provenance = json.loads(first)
            self.assertEqual(provenance["schemaVersion"], verify_derived_wheel.SCHEMA_VERSION)
            self.assertFalse(provenance["promotionEligible"])
            self.assertEqual(provenance["source"], verify_derived_wheel.EXPECTED_SDIST)
            self.assertTrue(provenance["reproducibility"]["byteIdentical"])
            self.assertEqual(provenance["wheel"]["filename"], EXPECTED_FILENAME)
            self.assertEqual(provenance["wheel"]["sha256"], digest(wheel.read_bytes()))
            self.assertRegex(provenance["wheel"]["memberDigest"], r"^sha256:[0-9a-f]{64}$")
            self.assertRegex(provenance["wheel"]["installedPathDigest"], r"^sha256:[0-9a-f]{64}$")

    def test_rejects_source_identity_and_unpinned_builder_or_tool_inputs(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            wheel = make_wheel(Path(temporary).resolve())
            cases = [
                ("--sdist-url", "https://example.invalid/source.tar.gz", "sdist URL"),
                ("--sdist-filename", "other.tar.gz", "sdist filename"),
                ("--sdist-size", "37327", "sdist size"),
                ("--sdist-sha256", "sha256:" + "0" * 64, "sdist digest"),
                ("--builder-image", "python:3.12.13", "immutable OCI"),
                (
                    "--builder-image",
                    "https://registry.invalid/python@sha256:" + "0" * 64,
                    "immutable OCI",
                ),
                ("--build-tool-lock-digest", "0" * 64, "canonical lowercase SHA-256"),
                ("--build-script-digest", "sha256:" + "A" * 64, "canonical lowercase SHA-256"),
            ]
            for option, value, message in cases:
                with self.subTest(option=option), self.assertRaisesRegex(ValueError, message):
                    verify_derived_wheel.main(
                        replace_argument(valid_arguments(wheel), option, value)
                    )

    def test_rejects_nonidentical_or_actual_mismatched_build_digests(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            wheel = make_wheel(Path(temporary).resolve())
            with self.assertRaisesRegex(ValueError, "two clean builds"):
                verify_derived_wheel.main(replace_argument(
                    valid_arguments(wheel), "--second-build-digest", "sha256:" + "1" * 64
                ))
            mismatched = "sha256:" + "2" * 64
            arguments = replace_argument(valid_arguments(wheel), "--first-build-digest", mismatched)
            arguments = replace_argument(arguments, "--second-build-digest", mismatched)
            with self.assertRaisesRegex(ValueError, "actual wheel bytes"):
                verify_derived_wheel.main(arguments)

    def test_rejects_wrong_filename_relative_noncanonical_symlink_and_hardlink(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            wheel = make_wheel(root)
            renamed = root / "renamed.whl"
            wheel.rename(renamed)
            with self.assertRaisesRegex(ValueError, "filename must be exactly"):
                verify_derived_wheel.main(valid_arguments(renamed))

        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            wheel = make_wheel(root)
            relative = Path(os.path.relpath(wheel, Path.cwd()))
            with self.assertRaisesRegex(ValueError, "absolute"):
                verify_derived_wheel.main(valid_arguments(relative, digest_path=wheel))
            nested = root / "nested"
            nested.mkdir()
            noncanonical = nested / ".." / EXPECTED_FILENAME
            with self.assertRaisesRegex(ValueError, "canonical"):
                verify_derived_wheel.main(valid_arguments(noncanonical, digest_path=wheel))

        if hasattr(os, "symlink"):
            with tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary).resolve()
                target_dir = root / "target"
                target_dir.mkdir()
                target = make_wheel(target_dir)
                link_dir = root / "link"
                link_dir.mkdir()
                link = link_dir / EXPECTED_FILENAME
                link.symlink_to(target)
                with self.assertRaisesRegex(ValueError, "canonical and symlink-free"):
                    verify_derived_wheel.main(valid_arguments(link, digest_path=target))

        if hasattr(os, "link"):
            with tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary).resolve()
                target_dir = root / "target"
                target_dir.mkdir()
                target = make_wheel(target_dir)
                link_dir = root / "link"
                link_dir.mkdir()
                linked = link_dir / EXPECTED_FILENAME
                os.link(target, linked)
                with self.assertRaisesRegex(ValueError, "hard link"):
                    verify_derived_wheel.main(valid_arguments(linked, digest_path=target))

    def test_rejects_wrong_name_version_tag_and_dependencies(self) -> None:
        cases = [
            ({"name": "other"}, "Name or Version"),
            ({"version": "2.3.1"}, "Name or Version"),
            ({"tag": "py2.py3-none-any"}, "py3-none-any tag"),
            ({"extra_tags": ["py3-none-any"]}, "py3-none-any tag"),
            ({"requires_dist": ["dependency>=1"]}, "no Requires-Dist"),
            ({"provides_extra": ["slurm"]}, "no Provides-Extra"),
            ({"requires_python": ">=3.9"}, "unexpected Requires-Python"),
            ({"root_is_purelib": "false"}, "Root-Is-Purelib true"),
            ({"wheel_version": "1.1"}, "Wheel-Version 1.0"),
        ]
        for options, message in cases:
            with self.subTest(options=options), tempfile.TemporaryDirectory() as temporary:
                wheel = make_wheel(Path(temporary).resolve(), **options)
                with self.assertRaisesRegex(ValueError, message):
                    verify_derived_wheel.main(valid_arguments(wheel))

    def test_rejects_missing_unexpected_startup_and_unsafe_members(self) -> None:
        cases = [
            ({"omit_member": "hostlist.py"}, "missing required members"),
            ({"extra_files": {"unexpected.py": b"pass\n"}}, "unexpected members"),
            ({"extra_files": {"startup.pth": b"import bad\n"}}, "startup-hook"),
            ({"extra_files": {"../escape.py": b"bad\n"}}, "unsafe archive path"),
        ]
        for options, message in cases:
            with self.subTest(options=options), tempfile.TemporaryDirectory() as temporary:
                wheel = make_wheel(Path(temporary).resolve(), **options)
                with self.assertRaisesRegex(ValueError, message):
                    verify_derived_wheel.main(valid_arguments(wheel))

        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            symlink_info = zipfile.ZipInfo("unexpected-link")
            symlink_info.create_system = 3
            symlink_info.external_attr = (stat.S_IFLNK | 0o777) << 16
            wheel = make_wheel(root, extra_zip_infos=[(symlink_info, b"hostlist.py")])
            with self.assertRaisesRegex(ValueError, "link, special member"):
                verify_derived_wheel.main(valid_arguments(wheel))

    def test_rejects_record_omission_bad_hash_bad_size_and_self_hash(self) -> None:
        cases = [
            ({"record_omit": "hostlist.py"}, "does not enumerate every archive member"),
            ({"record_hash_overrides": {"hostlist.py": "sha256=" + "A" * 43}}, "does not match"),
            ({"record_size_overrides": {"hostlist.py": "999"}}, "incorrect member size"),
            ({"record_self": ("sha256=" + "A" * 43, "1")}, "self-row"),
        ]
        for options, message in cases:
            with self.subTest(options=options), tempfile.TemporaryDirectory() as temporary:
                wheel = make_wheel(Path(temporary).resolve(), **options)
                with self.assertRaisesRegex(ValueError, message):
                    verify_derived_wheel.main(valid_arguments(wheel))

    def test_rejects_duplicate_member_zip_comment_and_size_limits(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            wheel = make_wheel(Path(temporary).resolve(), duplicate_member="hostlist.py")
            with self.assertRaisesRegex(ValueError, "duplicate"):
                verify_derived_wheel.main(valid_arguments(wheel))

        with tempfile.TemporaryDirectory() as temporary:
            wheel = make_wheel(Path(temporary).resolve(), archive_comment=b"not allowed")
            with self.assertRaisesRegex(ValueError, "comment, suffix"):
                verify_derived_wheel.main(valid_arguments(wheel))

        with tempfile.TemporaryDirectory() as temporary:
            wheel = make_wheel(Path(temporary).resolve())
            with patch.object(verify_derived_wheel, "MAX_WHEEL_BYTES", wheel.stat().st_size - 1):
                with self.assertRaisesRegex(ValueError, "wheel byte length"):
                    verify_derived_wheel.main(valid_arguments(wheel))

        with tempfile.TemporaryDirectory() as temporary:
            wheel = make_wheel(Path(temporary).resolve())
            with patch.object(verify_derived_wheel, "MAX_EXPANDED_BYTES", 1):
                with self.assertRaisesRegex(ValueError, "expanded byte length"):
                    verify_derived_wheel.main(valid_arguments(wheel))


def make_wheel(
    root: Path,
    *,
    name: str = "python_hostlist",
    version: str = "2.3.0",
    tag: str = "py3-none-any",
    extra_tags: list[str] | None = None,
    wheel_version: str = "1.0",
    root_is_purelib: str = "true",
    requires_dist: list[str] | None = None,
    provides_extra: list[str] | None = None,
    requires_python: str | None = None,
    extra_files: dict[str, bytes] | None = None,
    omit_member: str | None = None,
    record_omit: str | None = None,
    record_hash_overrides: dict[str, str] | None = None,
    record_size_overrides: dict[str, str] | None = None,
    record_self: tuple[str, str] = ("", ""),
    duplicate_member: str | None = None,
    archive_comment: bytes = b"",
    extra_zip_infos: list[tuple[zipfile.ZipInfo, bytes]] | None = None,
) -> Path:
    dist_info = verify_derived_wheel.EXPECTED_DIST_INFO
    data_directory = verify_derived_wheel.EXPECTED_DATA_DIRECTORY
    dependencies = "".join(f"Requires-Dist: {value}\n" for value in requires_dist or [])
    extras = "".join(f"Provides-Extra: {value}\n" for value in provides_extra or [])
    python = f"Requires-Python: {requires_python}\n" if requires_python else ""
    wheel_tags = "".join(f"Tag: {value}\n" for value in [tag, *(extra_tags or [])])
    entries: dict[str, bytes] = {
        "hostlist.py": b"def expand_hostlist(value):\n    return [value]\n",
        **{
            f"{data_directory}/scripts/{script}": f"#!/usr/bin/python3\n# {script}\n".encode()
            for script in verify_derived_wheel.SCRIPT_NAMES
        },
        **{
            f"{data_directory}/data/share/man/man1/{script}.1": f".{script}\n".encode()
            for script in verify_derived_wheel.SCRIPT_NAMES
        },
        f"{dist_info}/METADATA": (
            f"Metadata-Version: 2.1\nName: {name}\nVersion: {version}\n"
            f"{python}{dependencies}{extras}\npython-hostlist fixture\n"
        ).encode(),
        f"{dist_info}/WHEEL": (
            f"Wheel-Version: {wheel_version}\nGenerator: test\n"
            f"Root-Is-Purelib: {root_is_purelib}\n{wheel_tags}"
        ).encode(),
        f"{dist_info}/top_level.txt": b"hostlist\n",
    }
    entries.update(extra_files or {})
    if omit_member:
        entries.pop(omit_member)

    record_path = f"{dist_info}/RECORD"
    record_buffer = io.StringIO(newline="")
    writer = csv.writer(record_buffer, lineterminator="\n")
    for member_path, content in sorted(entries.items()):
        if member_path == record_omit:
            continue
        encoded = base64.urlsafe_b64encode(hashlib.sha256(content).digest()).rstrip(b"=").decode()
        writer.writerow([
            member_path,
            (record_hash_overrides or {}).get(member_path, f"sha256={encoded}"),
            (record_size_overrides or {}).get(member_path, str(len(content))),
        ])
    writer.writerow([record_path, *record_self])
    entries[record_path] = record_buffer.getvalue().encode()

    wheel = root / EXPECTED_FILENAME
    with zipfile.ZipFile(wheel, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for member_path, content in entries.items():
            archive.writestr(member_path, content)
        if duplicate_member:
            with contextlib.redirect_stderr(io.StringIO()):
                archive.writestr(duplicate_member, entries[duplicate_member])
        for info, content in extra_zip_infos or []:
            archive.writestr(info, content)
        archive.comment = archive_comment
    return wheel


def valid_arguments(wheel: Path, *, digest_path: Path | None = None) -> list[str]:
    actual_digest = digest((digest_path or wheel).read_bytes())
    source = verify_derived_wheel.EXPECTED_SDIST
    return [
        "--wheel", str(wheel),
        "--sdist-url", str(source["url"]),
        "--sdist-filename", str(source["filename"]),
        "--sdist-size", str(source["sizeBytes"]),
        "--sdist-sha256", str(source["sha256"]),
        "--builder-image", "python:3.12.13@sha256:" + "3" * 64,
        "--build-tool-lock-digest", "sha256:" + "4" * 64,
        "--build-script-digest", "sha256:" + "5" * 64,
        "--first-build-digest", actual_digest,
        "--second-build-digest", actual_digest,
    ]


def replace_argument(arguments: list[str], option: str, value: str) -> list[str]:
    result = list(arguments)
    result[result.index(option) + 1] = value
    return result


def run_main(arguments: list[str]) -> str:
    output = io.StringIO()
    with contextlib.redirect_stdout(output):
        self_result = verify_derived_wheel.main(arguments)
    if self_result != 0:
        raise AssertionError(f"unexpected exit status {self_result}")
    return output.getvalue()


def digest(content: bytes) -> str:
    return "sha256:" + hashlib.sha256(content).hexdigest()


if __name__ == "__main__":
    unittest.main()
