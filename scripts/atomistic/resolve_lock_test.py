from __future__ import annotations

import base64
import csv
import hashlib
import io
import json
import os
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

import resolve_lock


main = resolve_lock.main


class ResolveLockTests(unittest.TestCase):
    def test_generates_exact_dependency_closure_and_deterministic_manifest(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            wheelhouse, package_path = make_complete_wheelhouse(
                root,
                model_requires=[
                    "dependency>=2.0",
                    'linux-only==3.0; sys_platform == "linux"',
                    'windows-only==4.0; sys_platform == "win32"',
                ],
                dependencies=[("dependency", "2.0"), ("linux-only", "3.0")],
            )
            plan_path = write_plan(root, package_path)
            lock_path = root / "requirements.lock"
            manifest_path = root / "manifest.json"

            with trust_test_plan(plan_path):
                self.assertEqual(main([
                    "--wheelhouse", str(wheelhouse), "--output-lock", str(lock_path),
                    "--output-manifest", str(manifest_path), "--plan", str(plan_path), "--model", "mattersim",
                ]), 0)
            lock = lock_path.read_text(encoding="utf-8")
            self.assertIn("mattersim==1.2.5", lock)
            self.assertIn("dependency==2.0", lock)
            self.assertIn("linux-only==3.0", lock)
            self.assertNotIn("windows-only", lock)
            self.assertEqual(lock.count("--hash=sha256:"), 7)
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            self.assertEqual(manifest["wheelCount"], 7)
            self.assertEqual(manifest["lockDigest"], digest(lock_path.read_bytes()))
            self.assertRegex(manifest["dependencyGraphDigest"], r"^sha256:[0-9a-f]{64}$")
            self.assertRegex(manifest["installedPathDigest"], r"^sha256:[0-9a-f]{64}$")
            self.assertEqual(manifest["planDigest"], digest(plan_path.read_bytes()))
            self.assertEqual(
                manifest["resolverDigest"],
                digest((Path(__file__).resolve().parent / "resolve_lock.py").read_bytes()),
            )
            self.assertRegex(manifest["resolverRuntime"]["pip"], r"^[0-9]+(?:\.[0-9]+)+")
            self.assertGreater(manifest["installedFileCount"], 7)

    def test_rejects_orphan_distribution_and_missing_dependency(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            wheelhouse, package_path = make_complete_wheelhouse(root)
            make_wheel(wheelhouse / "orphan-1.0-py3-none-any.whl", "orphan", "1.0")
            with self.assertRaisesRegex(ValueError, "orphan distributions"):
                run_main(root, wheelhouse, write_plan(root, package_path))

        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            wheelhouse, package_path = make_complete_wheelhouse(
                root, model_requires=["missing-package>=1"],
            )
            with self.assertRaisesRegex(ValueError, "dependency closure is missing"):
                run_main(root, wheelhouse, write_plan(root, package_path))

    def test_rejects_direct_url_and_wrong_frozen_root_version(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            wheelhouse, package_path = make_complete_wheelhouse(
                root, model_requires=["dependency @ https://example.invalid/dependency.whl"],
            )
            with self.assertRaisesRegex(ValueError, "direct-URL Requires-Dist is forbidden"):
                run_main(root, wheelhouse, write_plan(root, package_path))

        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            wheelhouse, package_path = make_complete_wheelhouse(root, torch_version="2.9.0+cpu")
            with self.assertRaisesRegex(ValueError, r"does not satisfy ==2.8.0\+cpu"):
                run_main(root, wheelhouse, write_plan(root, package_path))

    def test_rejects_duplicate_distribution(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            wheelhouse, package_path = make_complete_wheelhouse(root)
            second = wheelhouse / "mattersim-1.2.5-1-py3-none-any.whl"
            make_wheel(second, "mattersim", "1.2.5")
            with self.assertRaisesRegex(ValueError, "multiple files"):
                run_main(root, wheelhouse, write_plan(root, package_path))

    def test_rejects_install_path_collision_and_bad_record(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            wheelhouse, package_path = make_complete_wheelhouse(
                root,
                model_extra_files={"shared_namespace/value.py": b"model"},
                ase_extra_files={"shared_namespace/value.py": b"ase"},
            )
            with self.assertRaisesRegex(ValueError, "install-path collision"):
                run_main(root, wheelhouse, write_plan(root, package_path))

        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            wheelhouse = root / "wheelhouse"
            wheelhouse.mkdir()
            package_path = wheelhouse / "mattersim-1.2.5-py3-none-any.whl"
            make_wheel(package_path, "mattersim", "1.2.5", omit_from_record="mattersim/__init__.py")
            with self.assertRaisesRegex(ValueError, "RECORD does not enumerate every archive file"):
                run_main(root, wheelhouse, write_plan(root, package_path))

        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            wheelhouse = root / "wheelhouse"
            wheelhouse.mkdir()
            package_path = wheelhouse / "mattersim-1.2.5-py3-none-any.whl"
            make_wheel(
                package_path, "mattersim", "1.2.5",
                record_hash_overrides={"mattersim/__init__.py": "sha256=" + "A" * 43},
            )
            with self.assertRaisesRegex(ValueError, "RECORD member hash does not match archive bytes"):
                run_main(root, wheelhouse, write_plan(root, package_path))

    def test_extra_markers_match_pip_union_semantics(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            wheelhouse, package_path = make_complete_wheelhouse(
                root, model_requires=["feature[gpu]==1.0"],
            )
            make_wheel(
                wheelhouse / "feature-1.0-py3-none-any.whl", "feature", "1.0",
                provides_extra=["gpu"],
                requires_dist=[
                    'gpu-dependency==1.0; extra == "gpu"',
                    'not-gpu-dependency==1.0; extra != "gpu"',
                ],
            )
            make_wheel(wheelhouse / "gpu_dependency-1.0-py3-none-any.whl", "gpu-dependency", "1.0")
            make_wheel(wheelhouse / "not_gpu_dependency-1.0-py3-none-any.whl", "not-gpu-dependency", "1.0")
            self.assertEqual(run_main(root, wheelhouse, write_plan(root, package_path)), 0)

        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            wheelhouse, package_path = make_complete_wheelhouse(
                root,
                model_requires=["feature[gpu]==1.0"],
                ase_requires=["feature[cpu]==1.0"],
            )
            make_wheel(
                wheelhouse / "feature-1.0-py3-none-any.whl", "feature", "1.0",
                provides_extra=["gpu", "cpu"],
                requires_dist=[
                    'gpu-dependency==1.0; extra == "gpu"',
                    'cpu-dependency==1.0; extra == "cpu"',
                ],
            )
            make_wheel(wheelhouse / "gpu_dependency-1.0-py3-none-any.whl", "gpu-dependency", "1.0")
            make_wheel(wheelhouse / "cpu_dependency-1.0-py3-none-any.whl", "cpu-dependency", "1.0")
            self.assertEqual(run_main(root, wheelhouse, write_plan(root, package_path)), 0)

    def test_rejects_unfrozen_markers_startup_hooks_and_generated_script_collisions(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            wheelhouse = root / "wheelhouse"
            wheelhouse.mkdir()
            package_path = wheelhouse / "mattersim-1.2.5-py3-none-any.whl"
            make_wheel(
                package_path, "mattersim", "1.2.5",
                requires_dist=['dependency; platform_release == "forged"'],
            )
            with self.assertRaisesRegex(ValueError, "unfrozen kernel version"):
                run_main(root, wheelhouse, write_plan(root, package_path))

        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            wheelhouse = root / "wheelhouse"
            wheelhouse.mkdir()
            package_path = wheelhouse / "mattersim-1.2.5-py3-none-any.whl"
            make_wheel(package_path, "mattersim", "1.2.5", extra_files={"startup.pth": b"import bad\n"})
            with self.assertRaisesRegex(ValueError, "startup-hook path is forbidden"):
                run_main(root, wheelhouse, write_plan(root, package_path))

        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            wheelhouse, package_path = make_complete_wheelhouse(
                root,
                model_entry_points={"tailing-run": "mattersim.cli:main"},
                ase_entry_points={"tailing-run": "ase.cli:main"},
            )
            with self.assertRaisesRegex(ValueError, "install-path collision"):
                run_main(root, wheelhouse, write_plan(root, package_path))

    def test_rejects_wrong_model_bytes_and_filename(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            wheelhouse, package_path = make_complete_wheelhouse(root)
            plan = make_plan(package_path)
            plan["models"][0]["package"]["sha256"] = "sha256:" + "f" * 64
            plan_path = write_plan(root, package_path, plan=plan)
            with self.assertRaisesRegex(ValueError, "bytes differ"):
                run_main(root, wheelhouse, plan_path)

            plan = make_plan(package_path)
            plan["models"][0]["package"]["filename"] = "renamed-1.2.5-py3-none-any.whl"
            plan_path.write_text(json.dumps(plan), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "filename differs"):
                run_main(root, wheelhouse, plan_path)

    def test_frozen_plan_trust_root_matches_checkout_and_rejects_a_self_consistent_forgery(self) -> None:
        checked_in_plan = Path(__file__).resolve().parents[2] / "evaluation/atomistic/reproduction-plan.json"
        self.assertEqual(digest(checked_in_plan.read_bytes()), resolve_lock.FROZEN_PLAN_RAW_DIGEST)

        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            wheelhouse, package_path = make_complete_wheelhouse(root)
            forged_plan = write_plan(root, package_path)
            with self.assertRaisesRegex(ValueError, "frozen preregistration"):
                main([
                    "--wheelhouse", str(wheelhouse), "--output-lock", str(root / "lock"),
                    "--output-manifest", str(root / "manifest"), "--plan", str(forged_plan),
                    "--model", "mattersim",
                ])

    def test_rejects_aggregate_wheelhouse_resource_limit_overruns(self) -> None:
        policies = [
            ("MAX_WHEELHOUSE_BYTES", "compressed bytes exceed policy"),
            ("MAX_WHEELHOUSE_EXPANDED_BYTES", "expanded bytes exceed policy"),
            ("MAX_WHEELHOUSE_MEMBERS", "archive member count exceeds policy"),
        ]
        for constant, message in policies:
            with self.subTest(policy=constant), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary).resolve()
                wheelhouse, package_path = make_complete_wheelhouse(root)
                with patch.object(resolve_lock, constant, 1):
                    with self.assertRaisesRegex(ValueError, message):
                        run_main(root, wheelhouse, write_plan(root, package_path))

    def test_rejects_incompatible_or_mismatched_wheel_tags(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            wheelhouse = root / "wheelhouse"
            wheelhouse.mkdir()
            incompatible = wheelhouse / "mattersim-1.2.5-py3-none-win_amd64.whl"
            make_wheel(incompatible, "mattersim", "1.2.5", tag="py3-none-win_amd64")
            with self.assertRaisesRegex(ValueError, "incompatible with cp312/Linux x86_64"):
                run_main(root, wheelhouse, write_plan(root, incompatible))

        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            wheelhouse = root / "wheelhouse"
            wheelhouse.mkdir()
            mismatched = wheelhouse / "mattersim-1.2.5-py3-none-any.whl"
            make_wheel(mismatched, "mattersim", "1.2.5", tag="py3-none-win_amd64")
            with self.assertRaisesRegex(ValueError, "filename and WHEEL metadata tags do not match"):
                run_main(root, wheelhouse, write_plan(root, mismatched))

    def test_rejects_filename_metadata_drift_and_incompatible_requires_python(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            wheelhouse = root / "wheelhouse"
            wheelhouse.mkdir()
            package_path = wheelhouse / "mattersim-1.2.5-py3-none-any.whl"
            make_wheel(package_path, "different-model", "1.2.5")
            with self.assertRaisesRegex(ValueError, "filename distribution/version differs"):
                run_main(root, wheelhouse, write_plan(root, package_path, name="different-model"))

        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            wheelhouse = root / "wheelhouse"
            wheelhouse.mkdir()
            package_path = wheelhouse / "mattersim-1.2.5-py3-none-any.whl"
            make_wheel(package_path, "mattersim", "1.2.5", requires_python=">=3.13")
            with self.assertRaisesRegex(ValueError, "Requires-Python excludes 3.12.13"):
                run_main(root, wheelhouse, write_plan(root, package_path))

    @unittest.skipUnless(hasattr(os, "symlink"), "symlink support required")
    def test_rejects_symlinked_wheelhouse_and_plan(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            real_wheelhouse, package_path = make_complete_wheelhouse(root, directory="real-wheelhouse")
            wheelhouse_link = root / "wheelhouse"
            wheelhouse_link.symlink_to(real_wheelhouse, target_is_directory=True)
            real_plan = write_plan(root, package_path, filename="real-plan.json")
            plan_link = root / "plan.json"
            plan_link.symlink_to(real_plan)
            with self.assertRaisesRegex(ValueError, "canonical and symlink-free"):
                run_main(root, wheelhouse_link, real_plan)
            with self.assertRaisesRegex(ValueError, "canonical and symlink-free"):
                run_main(root, real_wheelhouse, plan_link)

    @unittest.skipUnless(hasattr(os, "symlink"), "symlink support required")
    def test_does_not_create_output_directories_through_a_symlink_ancestor(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            wheelhouse, package_path = make_complete_wheelhouse(root)
            plan_path = write_plan(root, package_path)
            outside = root / "outside"
            outside.mkdir()
            redirect = root / "redirect"
            redirect.symlink_to(outside, target_is_directory=True)
            with trust_test_plan(plan_path):
                with self.assertRaisesRegex(ValueError, "symbolic link"):
                    main([
                        "--wheelhouse", str(wheelhouse),
                        "--output-lock", str(redirect / "created" / "lock"),
                        "--output-manifest", str(root / "manifest"),
                        "--plan", str(plan_path), "--model", "mattersim",
                    ])
            self.assertFalse((outside / "created").exists())


def make_complete_wheelhouse(
    root: Path,
    *,
    directory: str = "wheelhouse",
    model_requires: list[str] | None = None,
    dependencies: list[tuple[str, str]] | None = None,
    torch_version: str = "2.8.0+cpu",
    model_extra_files: dict[str, bytes] | None = None,
    ase_extra_files: dict[str, bytes] | None = None,
    ase_requires: list[str] | None = None,
    model_entry_points: dict[str, str] | None = None,
    ase_entry_points: dict[str, str] | None = None,
) -> tuple[Path, Path]:
    wheelhouse = root / directory
    wheelhouse.mkdir()
    package_path = wheelhouse / "mattersim-1.2.5-py3-none-any.whl"
    make_wheel(
        package_path, "mattersim", "1.2.5",
        requires_dist=model_requires,
        extra_files=model_extra_files,
        entry_points=model_entry_points,
    )
    roots = [
        ("torch", torch_version),
        ("torchvision", "0.23.0+cpu"),
        ("torchaudio", "2.8.0+cpu"),
        ("ase", "3.28.0"),
    ]
    for name, version in roots:
        filename = f"{name.replace('-', '_')}-{version}-py3-none-any.whl"
        make_wheel(
            wheelhouse / filename, name, version,
            extra_files=ase_extra_files if name == "ase" else None,
            requires_dist=ase_requires if name == "ase" else None,
            entry_points=ase_entry_points if name == "ase" else None,
        )
    for name, version in dependencies or []:
        filename = f"{name.replace('-', '_')}-{version}-py3-none-any.whl"
        make_wheel(wheelhouse / filename, name, version)
    return wheelhouse, package_path


def make_wheel(
    path: Path,
    name: str,
    version: str,
    *,
    tag: str = "py3-none-any",
    requires_python: str | None = None,
    requires_dist: list[str] | None = None,
    extra_files: dict[str, bytes] | None = None,
    omit_from_record: str | None = None,
    provides_extra: list[str] | None = None,
    record_hash_overrides: dict[str, str] | None = None,
    entry_points: dict[str, str] | None = None,
) -> None:
    distribution = name.replace("-", "_")
    dist_info = f"{distribution}-{version}.dist-info"
    python_metadata = f"Requires-Python: {requires_python}\n" if requires_python else ""
    dependency_metadata = "".join(f"Requires-Dist: {requirement}\n" for requirement in requires_dist or [])
    extras_metadata = "".join(f"Provides-Extra: {extra}\n" for extra in provides_extra or [])
    entries: dict[str, bytes] = {
        f"{dist_info}/METADATA": (
            f"Metadata-Version: 2.4\nName: {name}\nVersion: {version}\n"
            f"{python_metadata}{dependency_metadata}{extras_metadata}"
        ).encode("utf-8"),
        f"{dist_info}/WHEEL": f"Wheel-Version: 1.0\nTag: {tag}\n".encode("utf-8"),
        f"{distribution}/__init__.py": b"",
    }
    if entry_points:
        entries[f"{dist_info}/entry_points.txt"] = (
            "[console_scripts]\n"
            + "".join(f"{script_name} = {target}\n" for script_name, target in entry_points.items())
        ).encode("utf-8")
    entries.update(extra_files or {})
    record_path = f"{dist_info}/RECORD"
    record_buffer = io.StringIO(newline="")
    writer = csv.writer(record_buffer, lineterminator="\n")
    for member_path, content in sorted(entries.items()):
        if member_path == omit_from_record:
            continue
        encoded_hash = base64.urlsafe_b64encode(hashlib.sha256(content).digest()).rstrip(b"=").decode("ascii")
        member_hash = (record_hash_overrides or {}).get(member_path, f"sha256={encoded_hash}")
        writer.writerow([member_path, member_hash, str(len(content))])
    writer.writerow([record_path, "", ""])
    entries[record_path] = record_buffer.getvalue().encode("utf-8")
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for member_path, content in entries.items():
            archive.writestr(member_path, content)


def make_plan(package_path: Path, *, name: str = "mattersim") -> dict:
    package_bytes = package_path.read_bytes()
    return {
        "schemaVersion": "tf.atomistic-reproduction/0.2",
        "models": [{
            "id": "mattersim-v1.0.0-5m",
            "package": {
                "name": name, "version": "1.2.5", "sizeBytes": len(package_bytes),
                "sha256": digest(package_bytes), "filename": package_path.name,
            },
        }],
        "protocol": {"runner": {
            "python": "3.12.13", "platform": "linux", "architecture": "x86_64",
            "baseImage": "python@example", "baseImageAmd64Digest": "sha256:" + "0" * 64,
        }},
    }


def write_plan(
    root: Path,
    package_path: Path,
    *,
    name: str = "mattersim",
    filename: str = "plan.json",
    plan: dict | None = None,
) -> Path:
    plan_path = root / filename
    plan_path.write_text(json.dumps(plan or make_plan(package_path, name=name)), encoding="utf-8")
    return plan_path


def digest(value: bytes) -> str:
    return "sha256:" + hashlib.sha256(value).hexdigest()


def run_main(root: Path, wheelhouse: Path, plan_path: Path) -> int:
    with trust_test_plan(plan_path):
        return main([
            "--wheelhouse", str(wheelhouse), "--output-lock", str(root / "lock"),
            "--output-manifest", str(root / "manifest"), "--plan", str(plan_path), "--model", "mattersim",
        ])


def trust_test_plan(plan_path: Path):
    return patch.object(resolve_lock, "FROZEN_PLAN_RAW_DIGEST", digest(plan_path.read_bytes()))


if __name__ == "__main__":
    unittest.main()
