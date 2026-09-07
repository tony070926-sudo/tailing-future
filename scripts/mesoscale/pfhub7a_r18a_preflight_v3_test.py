#!/usr/bin/env python3
"""Focused scientific, identity, mutation, and lifecycle tests for R18a."""

from __future__ import annotations

import copy
import importlib.util
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import stat
import sys
import tempfile
import time
import unittest


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
SUPERVISOR_PATH = REPOSITORY_ROOT / "scripts/mesoscale/pfhub7a_r18a_supervise_v3.py"
PYTHON_SOURCE_VALUE = os.environ.get("TF_R18A_PYTHON_SOURCE")
WHEELHOUSE_VALUE = os.environ.get("TF_R18A_WHEELHOUSE")
PYTHON_SOURCE = Path(PYTHON_SOURCE_VALUE) if PYTHON_SOURCE_VALUE else None
WHEELHOUSE = Path(WHEELHOUSE_VALUE) if WHEELHOUSE_VALUE else None
INTEGRATION_AVAILABLE = PYTHON_SOURCE is not None and WHEELHOUSE is not None


def load_supervisor():
    spec = importlib.util.spec_from_file_location("pfhub7a_r18a_supervise_subject", SUPERVISOR_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("unable to load R18a supervisor")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def load_worker():
    path = REPOSITORY_ROOT / "scripts/mesoscale/pfhub7a_r18a_worker.py"
    spec = importlib.util.spec_from_file_location("pfhub7a_r18a_worker_subject", path)
    if spec is None or spec.loader is None:
        raise RuntimeError("unable to load R18a worker")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


subject = load_supervisor()
worker_subject = load_worker()


class R18aPreflightTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not INTEGRATION_AVAILABLE:
            return
        lock_payload = subject.read_regular_file(REPOSITORY_ROOT / subject.LOCK_PATH)
        cls.lock = subject.strict_json(lock_payload, "$TEST_LOCK")
        cls.snapshot, cls.candidate_payloads, cls.candidate_records = subject.candidate_snapshot(REPOSITORY_ROOT)
        cls.runtime_root, cls.runtime_records = subject.materialize(
            REPOSITORY_ROOT, PYTHON_SOURCE, WHEELHOUSE, cls.lock
        )
        cls.oracle = subject.run_child(
            cls.runtime_root, cls.snapshot / "oracle.py", [], REPOSITORY_ROOT
        )
        cls.worker = subject.run_child(
            cls.runtime_root, cls.snapshot / "worker.py", [], REPOSITORY_ROOT
        )

    def require_integration(self):
        if not INTEGRATION_AVAILABLE:
            self.skipTest("set TF_R18A_PYTHON_SOURCE and TF_R18A_WHEELHOUSE for locked integration tests")

    def test_actual_candidate_matches_clean_room_oracle(self):
        self.require_integration()
        subject.validate_worker_result(self.worker)
        comparisons = subject.compare_oracle(self.worker, self.oracle)
        self.assertEqual([item["trackId"] for item in comparisons], ["official-literal", "exact-trace-companion"])
        for track in comparisons:
            self.assertLessEqual(track["endpointMaximumAbsoluteDifference"], 2e-12)
            for step in track["steps"]:
                self.assertLessEqual(step["matrixMaximumAbsoluteDifference"], 2e-13)
                self.assertLessEqual(step["rhsMaximumAbsoluteDifference"], 2e-13)

    def test_strict_json_rejects_literal_and_escape_equivalent_duplicates(self):
        for payload in (b'{"a":1,"a":2}', b'{"a":1,"\\u0061":2}'):
            with self.subTest(payload=payload):
                with self.assertRaisesRegex(subject.GateFailure, "duplicate key"):
                    subject.strict_json(payload, "$MUTANT")

    def test_oracle_static_and_runtime_import_restrictions(self):
        self.require_integration()
        identity = subject.verify_oracle_source(self.snapshot / "oracle.py")
        self.assertTrue(identity["staticRestrictionPassed"])
        self.assertTrue(self.oracle["runtimeImportSentinelPassed"])
        with self.assertRaises(subject.GateFailure):
            subject.run_child(
                self.runtime_root,
                self.snapshot / "oracle.py",
                ["--forbidden-input"],
                REPOSITORY_ROOT,
            )

    def test_oracle_static_positive_candidate_without_runtime_inputs(self):
        identity = subject.verify_oracle_source(REPOSITORY_ROOT / subject.ORACLE_PATH)
        self.assertTrue(identity["staticRestrictionPassed"])

    def test_semantic_source_lines_are_explicit(self):
        self.require_integration()
        worker_source = self.candidate_payloads["worker.py"].decode("utf-8")
        oracle_source = self.candidate_payloads["oracle.py"].decode("utf-8")
        self.assertIn("reaction = -4.0 * eta.old", worker_source)
        self.assertIn("manufactured_source(np, x_cell, y_cell, time_old)", worker_source)
        self.assertIn("boundary_values(np, track, face_x, time_new)", worker_source)
        self.assertIn("((i - 1) % NX)", oracle_source)
        self.assertIn("2.0 * ry * bottom[i]", oracle_source)
        self.assertIn("2.0 * ry * top[i]", oracle_source)

    def test_registered_semantic_source_mutants_fail_specific_gates(self):
        self.require_integration()
        probes = subject.run_semantic_negative_probes(
            self.runtime_root,
            self.worker,
            self.candidate_payloads,
            REPOSITORY_ROOT,
        )
        self.assertEqual(
            [probe["probeId"] for probe in probes],
            [
                "reaction-time-level",
                "source-time-level",
                "exact-trace-time-level",
                "periodic-wrap",
                "dirichlet-factor-of-two",
                "track-provenance-boolean",
                "duplicate-json-literal",
                "duplicate-json-escaped",
            ],
        )
        reaction = probes[0]
        self.assertEqual(reaction["probeMode"], "in-memory-worker-source-ast-mutant")
        self.assertEqual(reaction["reasonCode"], "WORKER_REACTION_TIME_LEVEL")
        executed = {probe["probeId"]: probe for probe in probes[1:5]}
        self.assertGreater(executed["source-time-level"]["observation"]["maximumRhsAbsoluteDifference"], 2e-13)
        self.assertGreater(executed["exact-trace-time-level"]["observation"]["boundaryDigestMismatchCount"], 0)
        self.assertGreater(executed["periodic-wrap"]["observation"]["maximumMatrixAbsoluteDifference"], 2e-13)
        self.assertGreater(executed["dirichlet-factor-of-two"]["observation"]["maximumRhsAbsoluteDifference"], 2e-13)

    def test_oracle_static_allowlist_rejects_io_and_dynamic_builtin_evasions(self):
        payload = (REPOSITORY_ROOT / subject.ORACLE_PATH).read_bytes()
        insert_at = payload.index(b"def main() -> int:\n") + len(b"def main() -> int:\n")
        evasions = {
            "numpy-load": b"    np.load('/tmp/forbidden.npy')\n",
            "sys-modules-open": b"    sys.modules['builtins'].open('/tmp/forbidden')\n",
            "getattr-alias": b"    getattr(sys, 'modules')['builtins'].open('/tmp/forbidden')\n",
            "protected-call-rebind": b"    range = np.load\n    range('/tmp/forbidden.npy')\n",
            "allowed-attribute-rebind": b"    np.sin = np.load\n    np.sin('/tmp/forbidden.npy')\n",
        }
        for name, statement in evasions.items():
            with self.subTest(evasion=name):
                mutant = payload[:insert_at] + statement + payload[insert_at:]
                with self.assertRaisesRegex(subject.GateFailure, "oracle"):
                    subject.verify_oracle_source_payload(mutant)

    def test_track_provenance_boolean_mutation_fails(self):
        self.require_integration()
        mutant = copy.deepcopy(self.worker)
        mutant["preflight"]["tracks"][1]["metricSpecifiedByPfhub"] = True
        with self.assertRaisesRegex(subject.GateFailure, "provenance"):
            subject.validate_worker_result(mutant)

    def test_non_allowlisted_warning_abstains(self):
        self.require_integration()
        with self.assertRaisesRegex(subject.GateFailure, "WARNING_NOT_ALLOWLISTED"):
            subject.run_child(
                self.runtime_root,
                self.snapshot / "worker.py",
                ["--inject-warning"],
                REPOSITORY_ROOT,
            )

    def test_worker_cli_rejects_duplicate_injection_argument(self):
        self.require_integration()
        with self.assertRaises(subject.GateFailure):
            subject.run_child(
                self.runtime_root,
                self.snapshot / "worker.py",
                ["--inject-warning", "--inject-warning"],
                REPOSITORY_ROOT,
            )

    def test_runtime_and_candidate_capsules_are_sealed(self):
        self.require_integration()
        runtime_parent = self.runtime_root.parent
        self.assertEqual(stat.S_IMODE(runtime_parent.stat().st_mode), 0o700)
        self.assertEqual(stat.S_IMODE(self.runtime_root.stat().st_mode), 0o555)
        self.assertEqual(subject.materialized_closure(self.runtime_root), self.runtime_records)
        self.assertEqual(stat.S_IMODE(self.snapshot.parent.stat().st_mode), 0o700)
        self.assertEqual(stat.S_IMODE(self.snapshot.stat().st_mode), 0o555)
        for member in self.snapshot.iterdir():
            self.assertEqual(stat.S_IMODE(member.stat().st_mode), 0o444)

    def test_dynamic_inventories_are_ordered_unique_and_origin_typed(self):
        self.require_integration()
        modules = self.worker["runtime"]["moduleInventory"]["records"]
        module_names = [record["module"] for record in modules]
        self.assertEqual(module_names, sorted(set(module_names)))
        synthetic = {
            record["module"]
            for record in modules
            if record["classification"] == "registered-synthetic-no-origin"
        }
        self.assertEqual(synthetic, worker_subject.REGISTERED_SYNTHETIC_MODULES)
        worker_records = [
            record for record in modules if record["classification"] == "worker"
        ]
        self.assertEqual(len(worker_records), 1)
        self.assertEqual(worker_records[0]["module"], "__main__")
        self.assertEqual(worker_records[0]["origin"], "$WORKER")
        for record in modules:
            if record["classification"] == "namespace":
                self.assertTrue(record["locations"])
                self.assertEqual(record["locations"], sorted(set(record["locations"])))
        images = self.worker["runtime"]["dyldInventory"]["records"]
        self.assertEqual([record["index"] for record in images], list(range(len(images))))
        image_paths = [record["path"] for record in images]
        self.assertEqual(image_paths, sorted(set(image_paths), key=lambda value: value.encode("utf-8")))

    def test_private_runtime_parent_rejects_symlink_ancestor(self):
        with tempfile.TemporaryDirectory(prefix="tf-r18a-parent-") as directory:
            root = Path(directory) / "repository"
            outside = Path(directory) / "outside"
            root.mkdir()
            outside.mkdir()
            (root / ".tf-runtime").symlink_to(outside, target_is_directory=True)
            with self.assertRaisesRegex(subject.GateFailure, "real directory"):
                subject.private_runtime_parent(
                    root,
                    PurePosixPath(".tf-runtime/pfhub7a-r18a"),
                )

    def test_dyld_path_normalization_precedes_system_allowlist(self):
        valid = worker_subject.normalized_dyld_image_path("/usr/lib/libSystem.B.dylib")
        self.assertEqual(valid.as_posix(), "/usr/lib/libSystem.B.dylib")
        for mutant in (
            "/usr/lib/../private/tmp/escape.dylib",
            "/System/Library//private/escape.dylib",
            "/usr/lib/./escape.dylib",
        ):
            with self.subTest(mutant=mutant):
                with self.assertRaises(worker_subject.PreflightFailure):
                    worker_subject.normalized_dyld_image_path(mutant)

    def test_fresh_materialization_uses_no_replace_install_and_exact_closure(self):
        self.require_integration()
        with tempfile.TemporaryDirectory(prefix="tf-r18a-materialize-") as directory:
            temporary_repository = Path(directory)
            try:
                runtime_root, records = subject.materialize(
                    temporary_repository, PYTHON_SOURCE, WHEELHOUSE, self.lock
                )
                self.assertEqual(len(records), 3415)
                self.assertEqual(sum(record["byteSize"] for record in records), 125336192)
                self.assertEqual(
                    subject.sha256_bytes(subject.canonical_records(records)),
                    "sha256:55f3f0353e053a0eca5cf92af57019c16cdf33f50a126922993ed8cdbf2a2b7c",
                )
                self.assertEqual(stat.S_IMODE(runtime_root.stat().st_mode), 0o555)
            finally:
                for root, directory_names, file_names in os.walk(
                    temporary_repository, topdown=False
                ):
                    for name in file_names:
                        os.chmod(Path(root) / name, 0o600, follow_symlinks=False)
                    for name in directory_names:
                        os.chmod(Path(root) / name, 0o700, follow_symlinks=False)

    def test_rename_no_replace_preserves_existing_destination(self):
        with tempfile.TemporaryDirectory(prefix="tf-r18a-rename-") as directory:
            root = Path(directory)
            source = root / "source"
            destination = root / "destination"
            source.mkdir()
            destination.mkdir()
            (source / "source-marker").write_text("source", encoding="utf-8")
            (destination / "destination-marker").write_text("destination", encoding="utf-8")
            with self.assertRaises(FileExistsError):
                subject.rename_no_replace(source, destination)
            self.assertTrue((source / "source-marker").is_file())
            self.assertTrue((destination / "destination-marker").is_file())

    def test_publication_is_exclusive_and_read_only(self):
        with tempfile.TemporaryDirectory(prefix="tf-r18a-publish-") as directory:
            output = Path(directory) / "receipt.json"
            subject.atomic_write(output, b"first\n")
            self.assertEqual(output.read_bytes(), b"first\n")
            self.assertEqual(stat.S_IMODE(output.stat().st_mode), 0o444)
            with self.assertRaises(FileExistsError):
                subject.atomic_write(output, b"second\n")
            self.assertEqual(output.read_bytes(), b"first\n")

    def test_child_stdout_limit_kills_process_group(self):
        command = [sys.executable, "-c", f"import os; os.write(1, b'x' * {subject.CHILD_STDOUT_LIMIT + 1})"]
        with self.assertRaisesRegex(subject.GateFailure, "stdout"):
            subject.run_bounded_process(command, REPOSITORY_ROOT, dict(os.environ))

    def test_leader_exit_descendant_pipe_holder_is_killed_on_timeout(self):
        with tempfile.TemporaryDirectory(prefix="tf-r18a-lifecycle-") as directory:
            pid_path = Path(directory) / "descendant.pid"
            program = (
                "import os,time\n"
                "pid=os.fork()\n"
                "if pid==0:\n"
                "    time.sleep(60)\n"
                "    os._exit(0)\n"
                f"open({str(pid_path)!r},'w').write(str(pid))\n"
                "os._exit(0)\n"
            )
            previous_timeout = subject.CHILD_TIMEOUT_SECONDS
            subject.CHILD_TIMEOUT_SECONDS = 0.2
            try:
                with self.assertRaisesRegex(subject.GateFailure, "deadline"):
                    subject.run_bounded_process(
                        [sys.executable, "-c", program], REPOSITORY_ROOT, dict(os.environ)
                    )
            finally:
                subject.CHILD_TIMEOUT_SECONDS = previous_timeout
            descendant_pid = int(pid_path.read_text(encoding="utf-8"))
            deadline = time.monotonic() + 2.0
            while time.monotonic() < deadline:
                try:
                    os.kill(descendant_pid, 0)
                except ProcessLookupError:
                    break
                time.sleep(0.02)
            else:
                self.fail("descendant survived bounded-process cleanup")

    def test_successful_leader_with_closed_pipe_descendant_is_rejected(self):
        with tempfile.TemporaryDirectory(prefix="tf-r18a-success-descendant-") as directory:
            pid_path = Path(directory) / "descendant.pid"
            program = (
                "import os,time\n"
                "pid=os.fork()\n"
                "if pid==0:\n"
                "    os.close(0); os.close(1); os.close(2)\n"
                "    time.sleep(60)\n"
                "    os._exit(0)\n"
                f"open({str(pid_path)!r},'w').write(str(pid))\n"
                "os.write(1,b'{}')\n"
                "os._exit(0)\n"
            )
            with self.assertRaisesRegex(subject.GateFailure, "live descendant"):
                subject.run_bounded_process(
                    [sys.executable, "-c", program],
                    REPOSITORY_ROOT,
                    dict(os.environ),
                )
            descendant_pid = int(pid_path.read_text(encoding="utf-8"))
            deadline = time.monotonic() + 2.0
            while time.monotonic() < deadline:
                try:
                    os.kill(descendant_pid, 0)
                except ProcessLookupError:
                    break
                time.sleep(0.02)
            else:
                self.fail("closed-pipe descendant survived successful-path cleanup")

    def test_wheel_byte_mutation_is_rejected(self):
        self.require_integration()
        distribution = self.lock["wheelhouse"]["distributions"][0]
        with tempfile.TemporaryDirectory(prefix="tf-r18a-wheel-") as directory:
            mutant_root = Path(directory)
            for item in self.lock["wheelhouse"]["distributions"]:
                shutil.copyfile(WHEELHOUSE / item["filename"], mutant_root / item["filename"])
            target = mutant_root / distribution["filename"]
            payload = bytearray(target.read_bytes())
            payload[-1] ^= 1
            target.write_bytes(payload)
            with self.assertRaisesRegex(subject.GateFailure, "wheel identity"):
                subject.wheel_closure(self.lock, mutant_root)


if __name__ == "__main__":
    unittest.main(verbosity=2)
