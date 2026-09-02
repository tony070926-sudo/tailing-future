from __future__ import annotations

import hashlib
import json
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import contract
import worker


PARTICLES = contract.PARTICLE_COUNT
FRAMES = contract.FRAME_COUNT


class ArtifactManifestTests(unittest.TestCase):
    def test_manifest_exactly_inventories_independent_verifier_payload(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            (root / "arrays").mkdir()
            (root / "manifests").mkdir()
            prepare = [
                self._array(root, "cell", "arrays/cell.f64le", "float64-le", [9], "nanometer"),
                self._array(root, "masses", "arrays/masses.f64le", "float64-le", [PARTICLES], "dalton"),
                self._array(root, "constraints", "arrays/constraints.u32le", "uint32-le", [PARTICLES, 2], "index"),
                self._array(root, "constraint-targets", "arrays/constraint-targets.f64le", "float64-le", [PARTICLES], "nanometer"),
                self._array(root, "comparison-steps", "arrays/comparison-steps.u32le", "uint32-le", [5], "step"),
                self._array(root, "start-positions", "arrays/start-positions.f64le", "float64-le", [PARTICLES, 3], "nanometer"),
                self._array(root, "start-velocities", "arrays/start-velocities.f64le", "float64-le", [PARTICLES, 3], "nanometer-per-picosecond"),
            ]
            reference_a = self._reference(root, "reference-a")
            reference_b = self._reference(root, "reference-b")
            cpu = [
                self._array(root, "cpu-readback-positions", "arrays/cpu-readback-positions.f64le", "float64-le", [5, PARTICLES, 3], "nanometer"),
                self._array(root, "cpu-readback-cells", "arrays/cpu-readback-cells.f64le", "float64-le", [5, 9], "nanometer"),
                self._array(root, "cpu-comparison-group-energies", "arrays/cpu-comparison-group-energies.f64le", "float64-le", [5, 5], "kilojoule-per-mole"),
                self._array(root, "cpu-comparison-group-forces", "arrays/cpu-comparison-group-forces.f64le", "float64-le", [5, 5, PARTICLES, 3], "kilojoule-per-mole-per-nanometer"),
            ]
            contract.atomic_write_json(root / "manifests/runtime-inventory.json", {"runtime": True})
            contract.atomic_write_json(root / "manifests/prepare-receipt.json", {"arrays": prepare})
            contract.atomic_write_json(root / "manifests/reference-a-run.json", {"arrays": reference_a})
            contract.atomic_write_json(root / "manifests/reference-b-run.json", {"arrays": reference_b})
            contract.atomic_write_json(root / "manifests/cpu-fixed-coordinate-run.json", {"arrays": cpu})

            manifest = worker.write_artifact_manifest(
                root, "7" * 40, "sha256:" + "8" * 64
            )
            self.assertEqual(
                set(manifest),
                {
                    "schemaVersion",
                    "profile",
                    "systemDigest",
                    "planDigest",
                    "sourceRevision",
                    "producerOutcomeDigest",
                    "artifacts",
                    "bundleRoot",
                    "publicationPolicy",
                },
            )
            self.assertEqual(len(manifest["artifacts"]), 32)
            self.assertEqual(
                [record["id"] for record in manifest["artifacts"]],
                sorted(record["id"] for record in manifest["artifacts"]),
            )
            self.assertNotIn("producer-diagnostics", {record["id"] for record in manifest["artifacts"]})
            payload = {
                "schemaVersion": "tf.openmm-tip3p-artifact-bundle-root/0.4.5",
                "artifacts": manifest["artifacts"],
            }
            expected = "sha256:" + hashlib.sha256(
                json.dumps(payload, ensure_ascii=True, sort_keys=True, separators=(",", ":")).encode("ascii")
            ).hexdigest()
            self.assertEqual(manifest["bundleRoot"], expected)

            changed = [dict(record) for record in prepare]
            changed[0]["shape"] = [8]
            with self.assertRaises(contract.ContractViolation):
                worker._validate_source_array_descriptors(
                    changed, worker._expected_array_contracts()[0]
                )

    def _reference(self, root: Path, prefix: str) -> list[dict[str, object]]:
        return [
            self._array(root, f"{prefix}-sample-steps", f"arrays/{prefix}-sample-steps.u32le", "uint32-le", [FRAMES], "step"),
            self._array(root, f"{prefix}-sample-times", f"arrays/{prefix}-sample-times.f64le", "float64-le", [FRAMES], "picosecond"),
            self._array(root, f"{prefix}-positions", f"arrays/{prefix}-positions.f64le", "float64-le", [FRAMES, PARTICLES, 3], "nanometer"),
            self._array(root, f"{prefix}-velocities", f"arrays/{prefix}-velocities.f64le", "float64-le", [FRAMES, PARTICLES, 3], "nanometer-per-picosecond"),
            self._array(root, f"{prefix}-potential-forces", f"arrays/{prefix}-potential-forces.f64le", "float64-le", [FRAMES, PARTICLES, 3], "kilojoule-per-mole-per-nanometer"),
            self._array(root, f"{prefix}-energies", f"arrays/{prefix}-energies.f64le", "float64-le", [FRAMES, 3], "kilojoule-per-mole"),
            self._array(root, f"{prefix}-comparison-group-energies", f"arrays/{prefix}-comparison-group-energies.f64le", "float64-le", [5, 5], "kilojoule-per-mole"),
            self._array(root, f"{prefix}-comparison-group-forces", f"arrays/{prefix}-comparison-group-forces.f64le", "float64-le", [5, 5, PARTICLES, 3], "kilojoule-per-mole-per-nanometer"),
        ]

    def _array(
        self,
        root: Path,
        artifact_id: str,
        relative: str,
        dtype: str,
        shape: list[int],
        unit: str,
    ) -> dict[str, object]:
        size = (8 if dtype == "float64-le" else 4)
        for value in shape:
            size *= value
        data = bytes(size)
        contract.atomic_write_bytes(root / relative, data)
        return {
            "id": artifact_id,
            "path": relative,
            "kind": "array",
            "dtype": dtype,
            "shape": shape,
            "unit": unit,
            "sizeBytes": size,
            "sha256": contract.digest_bytes(data),
        }


if __name__ == "__main__":
    unittest.main()
