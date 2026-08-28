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


EXPECTED_RESERVED_VENV_SCRIPT_ROOTS = frozenset({
    "activate",
    "activate.csh",
    "activate.fish",
    "activate.nu",
    "activate.ps1",
    "pip",
    "pip3",
    "pip3.12",
    "python",
    "python3",
    "python3.12",
})


class VerifyRuntimeInventoryTests(unittest.TestCase):
    def test_independent_policy_constants_match_the_resolver(self) -> None:
        self.assertEqual(
            verify_runtime_inventory.ALLOWED_DATA_SCHEME_WHEEL_POLICY,
            resolve_lock.ALLOWED_DATA_SCHEME_WHEEL_POLICY,
        )
        self.assertEqual(
            verify_runtime_inventory.RESERVED_VENV_SCRIPT_ROOTS,
            EXPECTED_RESERVED_VENV_SCRIPT_ROOTS,
        )
        self.assertEqual(
            resolve_lock.RESERVED_VENV_SCRIPT_ROOTS,
            EXPECTED_RESERVED_VENV_SCRIPT_ROOTS,
        )
        self.assertEqual(
            verify_runtime_inventory.SETUPTOOLS_RUNTIME_WHEEL_POLICY,
            resolve_lock.SETUPTOOLS_RUNTIME_WHEEL_POLICY,
        )
        self.assertEqual(
            resolve_lock.ALLOWED_DATA_SCHEME_WHEEL_POLICY[
                resolve_lock.PYTHON_HOSTLIST_WHEEL_FILENAME
            ]["sha256"],
            "sha256:498c59026aec1015aa07f970423d4b655ac45f5108bbc900f40f8afd3593ad1c",
        )

    def test_exact_data_scheme_policy_binds_every_conjunct(self) -> None:
        wheel_name = "fonttools-4.63.0-cp312-cp312-manylinux2014_x86_64.manylinux_2_17_x86_64.whl"
        policy = verify_runtime_inventory.ALLOWED_DATA_SCHEME_WHEEL_POLICY[wheel_name]
        members = set(policy["members"])
        verify_runtime_inventory.validate_data_scheme_policy(
            wheel_name,
            policy["sizeBytes"],
            policy["sha256"],
            members,
        )
        mutations = (
            ("filename", f"forged-{wheel_name}", policy["sizeBytes"], policy["sha256"], members),
            ("size", wheel_name, policy["sizeBytes"] + 1, policy["sha256"], members),
            ("digest", wheel_name, policy["sizeBytes"], "sha256:" + "0" * 64, members),
            ("missing", wheel_name, policy["sizeBytes"], policy["sha256"], set(sorted(members)[1:])),
            (
                "extra",
                wheel_name,
                policy["sizeBytes"],
                policy["sha256"],
                {*members, "fonttools-4.63.0.data/data/extra"},
            ),
        )
        for label, candidate_name, size_bytes, wheel_sha256, candidate_members in mutations:
            with self.subTest(case=label):
                with self.assertRaisesRegex(ValueError, r"\.data/data"):
                    verify_runtime_inventory.validate_data_scheme_policy(
                        candidate_name,
                        size_bytes,
                        wheel_sha256,
                        candidate_members,
                    )

    def test_independently_rejects_direct_hooks_and_allows_nested_pth_data(self) -> None:
        for unsafe_path in (
            "startup.pth",
            "sitecustomize.py",
            "usercustomize/__init__.py",
            "probe-1.0.data/purelib/relocated.pth",
            "probe-1.0.data/platlib/sitecustomize.py",
        ):
            with self.subTest(path=unsafe_path), tempfile.TemporaryDirectory() as temporary:
                wheel = Path(temporary).resolve() / "probe-1.0-py3-none-any.whl"
                make_wheel(wheel, "probe", "1.0", extra_files={unsafe_path: b"unsafe"})
                with self.assertRaisesRegex(ValueError, "startup-hook candidates"):
                    verify_runtime_inventory.inspect_install_inventory(wheel, [])

        with tempfile.TemporaryDirectory() as temporary:
            wheel = Path(temporary).resolve() / "probe-1.0-py3-none-any.whl"
            make_wheel(
                wheel,
                "probe",
                "1.0",
                extra_files={
                    "probe/data/model.pth": b"weights",
                    "probe/_vendor/sitecustomize/__init__.py": b"vendored",
                },
            )
            paths = verify_runtime_inventory.inspect_install_inventory(wheel, [])
            self.assertIn("site-packages/probe/data/model.pth", paths)
            self.assertIn("site-packages/probe/_vendor/sitecustomize/__init__.py", paths)

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

    def test_rejects_data_scheme_prefix_aliases_except_reviewed_hostlist_manpages(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            unsafe = root / "probe-1.0-py3-none-any.whl"
            make_wheel(
                unsafe,
                "probe",
                "1.0",
                extra_files={
                    "probe-1.0.data/data/lib/python3.12/site-packages/evil.pth": b"unsafe",
                },
            )
            with self.assertRaisesRegex(ValueError, r"\.data/data wheel identity"):
                verify_runtime_inventory.inspect_install_inventory(unsafe, [])

            allowed = root / verify_runtime_inventory.PYTHON_HOSTLIST_WHEEL_FILENAME
            make_wheel(
                allowed,
                "python-hostlist",
                "2.3.0",
                extra_files={
                    path: b"manual"
                    for path in verify_runtime_inventory.PYTHON_HOSTLIST_ALLOWED_DATA_MEMBERS
                },
            )
            synthetic_policy = dict(verify_runtime_inventory.ALLOWED_DATA_SCHEME_WHEEL_POLICY)
            synthetic_policy[allowed.name] = {
                "sizeBytes": allowed.stat().st_size,
                "sha256": digest(allowed.read_bytes()),
                "members": verify_runtime_inventory.PYTHON_HOSTLIST_ALLOWED_DATA_MEMBERS,
            }
            with patch.object(
                verify_runtime_inventory,
                "ALLOWED_DATA_SCHEME_WHEEL_POLICY",
                synthetic_policy,
            ):
                paths = verify_runtime_inventory.inspect_install_inventory(allowed, [])
            self.assertTrue(
                all(
                    f"data/share/man/man1/{name}.1" in paths
                    for name in ("dbuck", "hostgrep", "hostlist", "pshbak")
                )
            )

    def test_rejects_preexisting_venv_script_and_seeded_pip_collisions(self) -> None:
        for unsafe_path in ("pip/__init__.py",):
            with self.subTest(path=unsafe_path), tempfile.TemporaryDirectory() as temporary:
                wheel = Path(temporary).resolve() / "probe-1.0-py3-none-any.whl"
                make_wheel(wheel, "probe", "1.0", extra_files={unsafe_path: b"unsafe"})
                with self.assertRaisesRegex(ValueError, r"reserved venv script|seeded pip"):
                    verify_runtime_inventory.inspect_install_inventory(wheel, [])

        with tempfile.TemporaryDirectory() as temporary:
            pip_wheel = Path(temporary).resolve() / "pip-25.0.1-py3-none-any.whl"
            make_wheel(pip_wheel, "pip", "25.0.1")
            with self.assertRaisesRegex(ValueError, "seeded pip"):
                verify_runtime_inventory.inspect_install_inventory(pip_wheel, [])

        for reserved_name in sorted(EXPECTED_RESERVED_VENV_SCRIPT_ROOTS):
            tested_name = "Activate.ps1" if reserved_name == "activate.ps1" else reserved_name
            for source in ("wheel-script", "entry-point"):
                with self.subTest(name=tested_name, source=source), tempfile.TemporaryDirectory() as temporary:
                    wheel = Path(temporary).resolve() / "probe-1.0-py3-none-any.whl"
                    if source == "wheel-script":
                        make_wheel(
                            wheel,
                            "probe",
                            "1.0",
                            extra_files={f"probe-1.0.data/scripts/{tested_name}": b"unsafe"},
                        )
                    else:
                        make_wheel(
                            wheel,
                            "probe",
                            "1.0",
                            entry_points={tested_name: "probe.cli:main"},
                        )
                    with self.assertRaisesRegex(ValueError, "reserved venv script"):
                        verify_runtime_inventory.inspect_install_inventory(wheel, [])

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
            with patch.object(
                verify_runtime_inventory,
                "SETUPTOOLS_RUNTIME_WHEEL_POLICY",
                policy,
            ):
                summary = verify_runtime_inventory.verify_runtime_inventory(
                    wheelhouse, manifest_path
                )
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
                    with patch.object(
                        verify_runtime_inventory,
                        "SETUPTOOLS_RUNTIME_WHEEL_POLICY",
                        policy,
                    ):
                        with self.assertRaisesRegex(ValueError, "independently derived"):
                            verify_runtime_inventory.verify_runtime_inventory(
                                wheelhouse, forged_path
                            )


if __name__ == "__main__":
    unittest.main()
