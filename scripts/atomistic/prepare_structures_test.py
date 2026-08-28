from __future__ import annotations

import copy
import hashlib
import json
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))

import prepare_structures
import runtime_contract as contract


class StructureIsolationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.plan_path = ROOT / "evaluation/atomistic/reproduction-plan.json"
        cls.dataset_path = ROOT / ".atomistic-cache/atomistic/random-TP.xyz"
        cls.raw = contract.inspect_random_tp(cls.dataset_path) if cls.dataset_path.exists() else None

    def test_frozen_structure_bundle_is_deterministic_and_label_free(self) -> None:
        if self.raw is None:
            self.skipTest("frozen Random-TP cache is not present")
        bundle, manifest = prepare_structures.build_outputs(self.raw)
        structures = [json.loads(line) for line in bundle.splitlines()]
        trust = contract.EXPECTED_STRUCTURE_BUNDLE_TRUST_ROOT
        self.assertEqual(len(bundle), trust["bundle"]["sizeBytes"])
        self.assertEqual(
            f"sha256:{hashlib.sha256(bundle).hexdigest()}",
            trust["bundle"]["sha256"],
        )
        self.assertEqual(
            manifest["structureManifestSha256"],
            trust["structureManifestSha256"],
        )
        allowed = {
            "schemaVersion", "id", "atomCount", "atomicNumbers", "lattice",
            "positions", "pbc", "inputStructureDigest",
        }
        for structure in structures:
            self.assertEqual(set(structure), allowed)
            contract.validate_structure_record(structure)

        # Reference values deliberately read by the trusted preprocessor never
        # appear as scalar values in the corresponding model-visible record.
        first_raw = self.raw[0]
        first_structure = next(item for item in structures
                               if item["id"] == first_raw["id"])
        visible_scalars = set(_scalars(first_structure))
        sensitive = [first_raw["energy"], first_raw["forces"][0], first_raw["stress"][0]]
        for value in sensitive:
            self.assertNotIn(value, visible_scalars)

    def test_structure_or_digest_tampering_fails(self) -> None:
        original = contract.build_structure_record(_synthetic_raw())
        tampered = copy.deepcopy(original)
        tampered["positions"][0][0] += 0.125
        with self.assertRaisesRegex(contract.ContractViolation, "digest mismatch"):
            contract.validate_structure_record(tampered)

        # Even a coherent per-record rehash changes the frozen full manifest.
        tampered["inputStructureDigest"] = contract.structure_digest(
            identifier=tampered["id"], atom_count=tampered["atomCount"],
            atomic_numbers=tampered["atomicNumbers"],
            lattice=[value for row in tampered["lattice"] for value in row],
            positions=[value for row in tampered["positions"] for value in row],
            pbc=tampered["pbc"],
        )
        self.assertNotEqual(
            contract.structure_manifest_digest([tampered]),
            contract.structure_manifest_digest([original]),
        )

    def test_synthetic_reference_fields_and_values_are_stripped(self) -> None:
        raw = _synthetic_raw()
        structure = contract.build_structure_record(raw)
        self.assertEqual(set(structure), {
            "schemaVersion", "id", "atomCount", "atomicNumbers", "lattice",
            "positions", "pbc", "inputStructureDigest",
        })
        visible_scalars = set(_scalars(structure))
        for value in (raw["energy"], raw["forces"][0], raw["stress"][0],
                      raw["recordDigest"]):
            self.assertNotIn(value, visible_scalars)

    def test_coherent_forged_plan_fails_embedded_trust_root(self) -> None:
        plan = json.loads(self.plan_path.read_bytes())
        forged = copy.deepcopy(plan)
        forged["models"][0]["package"]["sha256"] = "sha256:" + "1" * 64
        forged["models"][0]["checkpoint"]["sha256"] = "sha256:" + "2" * 64
        artifact = forged["benchmarks"][0]["artifact"]
        artifact["sha256"] = "sha256:" + "3" * 64
        artifact["recordManifestSha256"] = "sha256:" + "4" * 64
        artifact["smokeRecordManifestSha256"] = "sha256:" + "5" * 64
        with self.assertRaisesRegex(contract.ContractViolation, "trust root"):
            contract.validate_scientific_plan_trust_root(forged)

    def test_python_runtime_accepts_only_the_exact_preregistered_plan_bytes(self) -> None:
        payload = self.plan_path.read_bytes()
        self.assertEqual(
            f"sha256:{hashlib.sha256(payload).hexdigest()}",
            contract.EXPECTED_REPRODUCTION_PLAN_SHA256,
        )
        contract.validate_reproduction_plan_bytes(payload)
        forged = payload.replace(
            b'"status": "planned-not-reproduced"',
            b'"status": "forged-but-self-consistent"',
        )
        with self.assertRaisesRegex(contract.ContractViolation, "frozen preregistration"):
            contract.validate_reproduction_plan_bytes(forged)


def _scalars(value):
    if isinstance(value, dict):
        for child in value.values():
            yield from _scalars(child)
    elif isinstance(value, list):
        for child in value:
            yield from _scalars(child)
    else:
        yield value


def _synthetic_raw():
    return {
        "id": "random-TP-999999",
        "atomCount": 2,
        "atomicNumbers": [14, 8],
        "lattice": (4.0, 0.0, 0.0, 0.0, 4.0, 0.0, 0.0, 0.0, 4.0),
        "positions": (0.1, 0.2, 0.3, 1.1, 1.2, 1.3),
        "energy": -987654.125,
        "forces": (876543.25, 0.0, 0.0, 0.0, 0.0, 0.0),
        "stress": (765432.5, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0),
        "recordDigest": "sha256:" + "f" * 64,
    }


if __name__ == "__main__":
    unittest.main()
