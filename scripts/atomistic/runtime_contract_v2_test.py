#!/usr/bin/env python3
"""Discovery tests for the versioned atomistic v2 runner claim boundary."""

from __future__ import annotations

import ast
import hashlib
import importlib.util
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock


ATOMISTIC_DIR = Path(__file__).resolve().parent
V2_DIR = ATOMISTIC_DIR / "v2"
RUN_MODEL_PATH = V2_DIR / "run_model.py"
RUNTIME_CONTRACT_PATH = V2_DIR / "runtime_contract.py"


def _load_runtime_contract():
    module_name = "tailing_future_atomistic_runtime_contract_v2_test_subject"
    spec = importlib.util.spec_from_file_location(module_name, RUNTIME_CONTRACT_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("cannot load v2 runtime contract")
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


contract = _load_runtime_contract()


def _probe_runner(directory: Path) -> dict[str, object]:
    code = """
import json
from pathlib import Path
import run_model
container = run_model._resolve_runner_layout(
    Path(run_model.STANDARD_RUNNER_CONTAINER_PATHS["run_model.py"])
)
print(json.dumps({
    "layout": run_model.RUNNER_LAYOUT,
    "root": str(run_model.ROOT),
    "defaultPlan": str(run_model.DEFAULT_PLAN),
    "identity": run_model._runner_identity(),
    "containerLayout": [container[0], str(container[1]), str(container[2])],
}, sort_keys=True))
"""
    environment = dict(os.environ)
    environment["PYTHONPATH"] = str(directory)
    environment["PYTHONDONTWRITEBYTECODE"] = "1"
    completed = subprocess.run(
        [sys.executable, "-c", code],
        cwd=directory,
        env=environment,
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(completed.stdout)


def _claim_values(value):
    found = []
    if isinstance(value, dict):
        for key, child in value.items():
            if key in contract.PROMOTION_CLAIM_KEYS:
                found.append((key, child))
            found.extend(_claim_values(child))
    elif isinstance(value, (list, tuple)):
        for child in value:
            found.extend(_claim_values(child))
    return found


class RuntimeContractV2Tests(unittest.TestCase):
    workflow_revision = "a" * 40
    runtime_source_revision = "b" * 40
    config_image_id = "sha256:" + "c" * 64

    def _environment(self, lock_path: Path | None = None) -> dict[str, str]:
        environment = {
            contract.WORKFLOW_REVISION_ENV: self.workflow_revision,
            contract.RUNTIME_SOURCE_REVISION_ENV: self.runtime_source_revision,
            contract.DOCKER_CONFIG_IMAGE_ID_ENV: self.config_image_id,
        }
        if lock_path is not None:
            environment["TAILING_ATOMISTIC_LOCK_PATH"] = str(lock_path)
        return environment

    def test_complete_execution_identity_is_non_promotional(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            lock_path = Path(temporary_directory).resolve() / "requirements.lock"
            lock_bytes = b"example==1.0 --hash=sha256:" + b"d" * 64 + b"\n"
            lock_path.write_bytes(lock_bytes)
            provenance = contract.execution_provenance(self._environment(lock_path))

        self.assertTrue(provenance["executionIdentityComplete"])
        self.assertEqual(provenance["workflowRevision"], self.workflow_revision)
        self.assertEqual(
            provenance["runtimeSourceRevision"], self.runtime_source_revision
        )
        self.assertEqual(provenance["evidenceClass"], "bootstrap-not-reproduced")
        self.assertEqual(
            provenance["environmentLock"]["sha256"],
            "sha256:" + hashlib.sha256(lock_bytes).hexdigest(),
        )
        self.assertEqual(
            provenance["containerIdentity"],
            {
                "kind": "docker-local-load-config-id",
                "configImageId": self.config_image_id,
                "scope": "run-specific",
                "promotionTrustRoot": False,
                "registryManifestDigest": None,
            },
        )
        claims = _claim_values({"summary": {"environment": {"provenance": provenance}}})
        self.assertEqual(
            sorted(claims),
            [
                ("comparable", False),
                ("promotionEligible", False),
                ("promotionTrustRoot", False),
                ("reproduced", False),
            ],
        )
        contract.assert_no_positive_promotion_claims(provenance)

    def test_incomplete_identity_stays_non_promotional(self) -> None:
        provenance = contract.execution_provenance(self._environment())
        self.assertFalse(provenance["executionIdentityComplete"])
        self.assertTrue(all(value is False for _, value in _claim_values(provenance)))

        environment_without_config = self._environment()
        del environment_without_config[contract.DOCKER_CONFIG_IMAGE_ID_ENV]
        provenance = contract.execution_provenance(environment_without_config)
        self.assertFalse(provenance["executionIdentityComplete"])
        self.assertIsNone(provenance["containerIdentity"]["configImageId"])
        self.assertTrue(all(value is False for _, value in _claim_values(provenance)))

    def test_revisions_are_mandatory_full_lowercase_git_ids(self) -> None:
        for variable in (
            contract.WORKFLOW_REVISION_ENV,
            contract.RUNTIME_SOURCE_REVISION_ENV,
        ):
            for invalid in (None, "", "a" * 39, "A" * 40, "sha256:" + "a" * 40, "g" * 40):
                with self.subTest(variable=variable, invalid=invalid):
                    environment = self._environment()
                    if invalid is None:
                        del environment[variable]
                    else:
                        environment[variable] = invalid
                    with self.assertRaisesRegex(
                        contract.ContractViolation,
                        "full lowercase 40-hex Git revision",
                    ):
                        contract.execution_provenance(environment)

    def test_legacy_or_malformed_container_identity_cannot_complete(self) -> None:
        environment = self._environment()
        del environment[contract.DOCKER_CONFIG_IMAGE_ID_ENV]
        environment["TAILING_ATOMISTIC_CONTAINER_DIGEST"] = self.config_image_id
        provenance = contract.execution_provenance(environment)
        self.assertFalse(provenance["executionIdentityComplete"])
        self.assertIsNone(provenance["containerIdentity"]["configImageId"])

        for invalid in ("", "c" * 64, "sha256:" + "C" * 64, "sha256:" + "c" * 63):
            with self.subTest(invalid=invalid):
                environment = self._environment()
                environment[contract.DOCKER_CONFIG_IMAGE_ID_ENV] = invalid
                with self.assertRaisesRegex(
                    contract.ContractViolation,
                    contract.DOCKER_CONFIG_IMAGE_ID_ENV,
                ):
                    contract.execution_provenance(environment)

    def test_nested_positive_or_malformed_claims_are_rejected(self) -> None:
        self.assertEqual(
            contract.PROMOTION_CLAIM_KEYS,
            frozenset(
                ("promotionEligible", "promotionTrustRoot", "comparable", "reproduced")
            ),
        )
        for key in sorted(contract.PROMOTION_CLAIM_KEYS):
            for invalid in (True, None, 0, "false"):
                with self.subTest(key=key, invalid=invalid):
                    value = {"outer": [{"inner": {key: invalid}}]}
                    with self.assertRaisesRegex(
                        contract.ContractViolation, "must be exactly false"
                    ):
                        contract.assert_no_positive_promotion_claims(value)

    def test_lock_hash_rejects_hardlinks_and_path_replacement(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            directory = Path(temporary_directory).resolve()
            lock_path = directory / "requirements.lock"
            lock_path.write_bytes(b"original-lock\n")
            alias = directory / "requirements.alias.lock"
            os.link(lock_path, alias)
            with self.assertRaisesRegex(
                contract.ContractViolation, "single-link regular file"
            ):
                contract.execution_provenance(self._environment(lock_path))
            alias.unlink()

            replacement = directory / "replacement.lock"
            replacement.write_bytes(b"mutated-lock!\n")
            original_read = contract.os.read
            replaced = False

            def replace_after_read(descriptor: int, count: int) -> bytes:
                nonlocal replaced
                content = original_read(descriptor, count)
                if content and not replaced:
                    replaced = True
                    os.replace(replacement, lock_path)
                return content

            with mock.patch.object(contract.os, "read", side_effect=replace_after_read):
                with self.assertRaisesRegex(contract.ContractViolation, "changed"):
                    contract.execution_provenance(self._environment(lock_path))

    def test_environment_digest_input_binds_both_named_revisions(self) -> None:
        source = RUN_MODEL_PATH.read_text(encoding="utf-8")
        self.assertNotIn("sourceRevision", source)
        tree = ast.parse(source)
        environment_keys = set()
        hashes_environment_binding = False
        for node in ast.walk(tree):
            if isinstance(node, ast.Assign) and any(
                isinstance(target, ast.Name) and target.id == "environment_binding"
                for target in node.targets
            ) and isinstance(node.value, ast.Dict):
                environment_keys.update(
                    key.value
                    for key in node.value.keys
                    if isinstance(key, ast.Constant) and isinstance(key.value, str)
                )
            if (
                isinstance(node, ast.Call)
                and isinstance(node.func, ast.Name)
                and node.func.id == "sha256_json"
                and len(node.args) == 1
                and isinstance(node.args[0], ast.Name)
                and node.args[0].id == "environment_binding"
            ):
                hashes_environment_binding = True
        self.assertTrue(hashes_environment_binding)
        self.assertIn("workflowRevision", environment_keys)
        self.assertIn("runtimeSourceRevision", environment_keys)

    def test_runner_identity_hashes_both_v2_files_for_standard_paths(self) -> None:
        probe = _probe_runner(V2_DIR)
        identity = probe["identity"]
        self.assertEqual(probe["layout"], "source-v2")
        self.assertEqual(probe["root"], str(V2_DIR.parents[2]))
        self.assertEqual(
            probe["defaultPlan"],
            str(V2_DIR.parents[2] / "evaluation/atomistic/reproduction-plan.json"),
        )
        self.assertEqual(
            probe["containerLayout"],
            ["standard-container", "/", "/inputs/reproduction-plan.json"],
        )
        self.assertEqual(identity["implementation"], "tf.atomistic-runner/v2")
        self.assertEqual(
            identity["files"],
            [
                {
                    "name": "run_model.py",
                    "standardContainerPath": "/opt/tailing-venv/lib/python3.12/site-packages/run_model.py",
                    "sizeBytes": RUN_MODEL_PATH.stat().st_size,
                    "sha256": "sha256:" + hashlib.sha256(RUN_MODEL_PATH.read_bytes()).hexdigest(),
                },
                {
                    "name": "runtime_contract.py",
                    "standardContainerPath": "/opt/tailing-venv/lib/python3.12/site-packages/runtime_contract.py",
                    "sizeBytes": RUNTIME_CONTRACT_PATH.stat().st_size,
                    "sha256": "sha256:" + hashlib.sha256(RUNTIME_CONTRACT_PATH.read_bytes()).hexdigest(),
                },
            ],
        )
        expected_digest = contract.sha256_json(identity["files"])
        self.assertEqual(identity["digest"], expected_digest)

    def test_stage_s_materialization_preserves_identity_and_resolves_root(self) -> None:
        source_probe = _probe_runner(V2_DIR)
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory).resolve()
            materialized_directory = root / "scripts/atomistic"
            materialized_directory.mkdir(parents=True)
            shutil.copy2(RUN_MODEL_PATH, materialized_directory / "run_model.py")
            shutil.copy2(
                RUNTIME_CONTRACT_PATH, materialized_directory / "runtime_contract.py"
            )
            plan_path = root / "evaluation/atomistic/reproduction-plan.json"
            plan_path.parent.mkdir(parents=True)
            shutil.copy2(
                V2_DIR.parents[2] / "evaluation/atomistic/reproduction-plan.json",
                plan_path,
            )
            materialized_probe = _probe_runner(materialized_directory)

        self.assertEqual(materialized_probe["layout"], "stage-s-materialized")
        self.assertEqual(materialized_probe["root"], str(root))
        self.assertEqual(materialized_probe["defaultPlan"], str(plan_path))
        self.assertEqual(materialized_probe["identity"], source_probe["identity"])

    def test_v2_schema_and_default_plan_discovery_are_explicit(self) -> None:
        source = RUN_MODEL_PATH.read_text(encoding="utf-8")
        self.assertIn('RUNNER_IMPLEMENTATION = "tf.atomistic-runner/v2"', source)
        self.assertIn('RUNNER_SCHEMA = "tf.atomistic-run-summary/0.3"', source)
        self.assertTrue((V2_DIR.parents[2] / "evaluation/atomistic/reproduction-plan.json").is_file())


if __name__ == "__main__":
    unittest.main()
