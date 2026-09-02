from __future__ import annotations

import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
DOCKERFILE = ROOT / "atomistic/containers/openmm-water.Dockerfile"
LOCK = ROOT / "atomistic/locks/openmm-water.requirements.lock"
DOCKERIGNORE = ROOT / "atomistic/containers/openmm-water.Dockerfile.dockerignore"


class ContainerContractTests(unittest.TestCase):
    def test_lock_contains_only_two_exact_hashed_distributions(self) -> None:
        text = LOCK.read_text(encoding="utf-8")
        requirements = re.findall(r"^([a-z0-9-]+)==([^\s\\]+)", text, re.MULTILINE)
        hashes = re.findall(r"--hash=sha256:([0-9a-f]{64})", text)
        self.assertEqual(requirements, [("numpy", "2.2.6"), ("openmm", "8.6.0")])
        self.assertEqual(
            hashes,
            [
                "fd83c01228a688733f1ded5201c678f0c53ecc1006ffbc404db9f7a899ac6249",
                "e7acafe671fe40c502623886b15a97bcc948a83a4a995da0336b7ee3ab4b0221",
            ],
        )
        self.assertNotRegex(text, r"https?://|git\+|^-e\s", msg="lock must be offline-only")

    def test_container_is_digest_pinned_offline_and_non_root(self) -> None:
        text = DOCKERFILE.read_text(encoding="utf-8")
        pinned = (
            "python:3.12.11-slim-bookworm@"
            "sha256:c00fc7b44d844b6da22861ec24af43968a5200eac4ec607b4725d585165d6b49"
        )
        self.assertEqual(text.count(pinned), 2)
        self.assertNotIn("ARG BASE_IMAGE", text)
        self.assertNotRegex(text, r"\b(curl|wget|apt-get|pip download)\b")
        self.assertGreaterEqual(text.count("RUN --network=none"), 3)
        self.assertIn("--no-index", text)
        self.assertIn("--require-hashes", text)
        self.assertIn("--only-binary=:all:", text)
        self.assertIn("USER 65532:65532", text)
        self.assertIn('"-P", "-s", "-B", "-m", "producer"', text)
        self.assertIn('"-u", "PYTHONPATH", "-u", "PYTHONHOME"', text)
        runtime_environment = text.split("ENV PATH=/opt/tailing-venv/bin", 1)[1]
        self.assertNotIn("OPENMM_CPU_THREADS", runtime_environment)

    def test_docker_context_explicitly_admits_only_runtime_producer_sources(self) -> None:
        lines = DOCKERIGNORE.read_text(encoding="utf-8").splitlines()
        expected = [
            "**",
            "!atomistic/",
            "!atomistic/containers/",
            "!atomistic/containers/openmm-water.Dockerfile",
            "!atomistic/containers/openmm-water.Dockerfile.dockerignore",
            "!atomistic/locks/",
            "!atomistic/locks/openmm-water.requirements.lock",
            "!scripts/",
            "!scripts/atomistic/",
            "!scripts/atomistic/openmm/",
            "!scripts/atomistic/openmm/contract.py",
            "!scripts/atomistic/openmm/binary_codec.py",
            "!scripts/atomistic/openmm/engine.py",
            "!scripts/atomistic/openmm/worker.py",
            "!scripts/atomistic/openmm/diagnostics.py",
            "!scripts/atomistic/openmm/outcome.py",
            "!scripts/atomistic/openmm/producer.py",
        ]
        self.assertEqual(lines, expected)
        self.assertNotIn("!scripts/atomistic/openmm/*.py", lines)


if __name__ == "__main__":
    unittest.main()
