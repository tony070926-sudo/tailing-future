from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import resolve_lock
import verify_runtime_inventory
from resolve_lock_test import digest, make_complete_wheelhouse, make_wheel, run_main, write_plan


class VerifyRuntimeInventoryTests(unittest.TestCase):
    def test_rejects_noncanonical_archive_member_spelling(self) -> None:
        for unsafe_path in (
            "probe-1.0.dist-info//entry_points.txt",
            "probe-1.0.dist-info/./entry_points.txt",
        ):
            with self.subTest(path=unsafe_path), tempfile.TemporaryDirectory() as temporary:
                wheel = Path(temporary).resolve() / "probe-1.0-py3-none-any.whl"
                make_wheel(wheel, "probe", "1.0", extra_files={unsafe_path: b"forged"})
                with self.assertRaisesRegex(ValueError, "unsafe archive path"):
                    verify_runtime_inventory.inspect_install_inventory(wheel, [])

    def test_isolated_script_execution_ignores_a_sibling_stdlib_shadow(self) -> None:
        verifier_path = Path(verify_runtime_inventory.__file__).resolve()
        with tempfile.TemporaryDirectory() as temporary:
            isolated_directory = Path(temporary).resolve()
            isolated_verifier = isolated_directory / verifier_path.name
            isolated_verifier.write_bytes(verifier_path.read_bytes())
            (isolated_directory / "json.py").write_text(
                "raise RuntimeError('shadow imported')\n",
                encoding="utf-8",
            )
            result = subprocess.run(
                [sys.executable, "-I", "-S", "-B", str(isolated_verifier), "--help"],
                check=False,
                capture_output=True,
                text=True,
            )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("--wheelhouse", result.stdout)

    def test_independently_recomputes_raw_and_post_removal_paths(self) -> None:
        hook = (
            b"import os; var = 'SETUPTOOLS_USE_DISTUTILS'; enabled = os.environ.get(var, 'local') == 'local'; "
            b"enabled and __import__('_distutils_hack').add_shim(); \n"
        )
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            wheelhouse, package_path = make_complete_wheelhouse(
                root,
                model_entry_points={"tf-model": "mattersim.cli:main"},
            )
            setuptools_wheel = wheelhouse / "setuptools-84.0.0-py3-none-any.whl"
            make_wheel(
                setuptools_wheel,
                "setuptools",
                "84.0.0",
                extra_files={"distutils-precedence.pth": hook},
            )
            policy = json.loads(json.dumps(resolve_lock.SETUPTOOLS_RUNTIME_WHEEL_POLICY))
            policy["sizeBytes"] = setuptools_wheel.stat().st_size
            policy["sha256"] = digest(setuptools_wheel.read_bytes())
            plan_path = write_plan(root, package_path)
            with patch.object(resolve_lock, "SETUPTOOLS_RUNTIME_WHEEL_POLICY", policy):
                self.assertEqual(run_main(root, wheelhouse, plan_path), 0)

            manifest_path = root / "manifest"
            summary = verify_runtime_inventory.verify_runtime_inventory(wheelhouse, manifest_path)
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            self.assertEqual(summary["wheelCount"], manifest["wheelCount"])
            self.assertEqual(summary["removedFileCount"], 1)
            self.assertEqual(summary["installedFileCount"], manifest["installedFileCount"])
            self.assertEqual(summary["runtimeInstalledFileCount"], manifest["runtimeInstalledFileCount"])
            self.assertEqual(summary["installedPathDigest"], manifest["installedPathDigest"])
            self.assertEqual(summary["runtimeInstalledPathDigest"], manifest["runtimeInstalledPathDigest"])

            mutations = {
                "raw count": lambda value: value.update({"installedFileCount": 1}),
                "raw digest": lambda value: value.update({"installedPathDigest": "sha256:" + "1" * 64}),
                "runtime count": lambda value: value.update({"runtimeInstalledFileCount": 1}),
                "runtime digest": lambda value: value.update({"runtimeInstalledPathDigest": "sha256:" + "2" * 64}),
                "per-wheel digest": lambda value: value["wheels"][0].update({
                    "installPathDigest": "sha256:" + "3" * 64,
                }),
            }
            for label, mutate in mutations.items():
                with self.subTest(case=label):
                    forged = json.loads(json.dumps(manifest))
                    mutate(forged)
                    forged_path = root / f"forged-{label.replace(' ', '-')}.json"
                    forged_path.write_text(json.dumps(forged), encoding="utf-8")
                    with self.assertRaisesRegex(ValueError, "independently derived"):
                        verify_runtime_inventory.verify_runtime_inventory(wheelhouse, forged_path)


if __name__ == "__main__":
    unittest.main()
