"""Independent v0.4.11 semantic importer for the locked NaCl{100}-water seed.

The module is intentionally Python-standard-library-only.  It validates the
frozen v0.4.10 plan, independently reconstructs its digest dependency graph,
geometry and topology, and emits deterministic normalized artifacts.  It does
not import a molecular-dynamics package, compile a system, create a context, or
invoke a solver.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import stat
import struct
import sys
from pathlib import Path
from typing import Iterable, Mapping, Sequence


IMPORTER_VERSION = "tf.nacl-water-interface-semantic-importer/0.4.11"
RECEIPT_SCHEMA_VERSION = "tf.nacl-water-interface-import-receipt/0.4.11"
SYSTEM_SCHEMA_VERSION = "tf.nacl-water-interface-system/0.4.10"
SEED_SCHEMA_VERSION = "tf.nacl-water-interface-coordinate-seed/0.4.10"
SYSTEM_ID = "nacl-100-tip3p-balanced-double-interface-6x6x4-geometric-seed"
SEED_ID = "nacl-100-tip3p-balanced-double-interface-6x6x4-seed-20260902"

MAX_PLAN_BYTES = 8 * 1024 * 1024
MAX_IMPORTER_SOURCE_BYTES = 2 * 1024 * 1024
MAX_PATH_BYTES = 4096
MAX_TREE_DEPTH = 32
MAX_TREE_NODES = 1_000_000
MAX_SAFE_INTEGER = 9_007_199_254_740_991
EXPECTED_PLAN_BYTES = 5_053_426
EXPECTED_PLAN_RAW_SHA256 = (
    "sha256:473eaab96bb5d90c8ee2f298860aaec624a7124ad7fa99ef362ef9213c7334bd"
)
EXPECTED_CANONICAL_VALUE_SHA256 = (
    "sha256:183c0cf628a5963064134277d2caea70ad3ecad998d4a576f53f0fd8ac8ac52b"
)


def _capture_importer_source_sha256() -> str:
    """Bind receipts to one stable source inode at module initialization."""

    supplied = Path(os.path.abspath(__file__))
    if len(os.fsencode(str(supplied))) > MAX_PATH_BYTES:
        raise RuntimeError("importer source path exceeds the byte bound")
    parent = supplied.parent
    parent_before = parent.lstat()
    if (
        not stat.S_ISDIR(parent_before.st_mode)
        or parent.is_symlink()
        or parent.resolve(strict=True) != parent
    ):
        raise RuntimeError("importer source parent is not one canonical directory")
    before = supplied.lstat()
    if (
        not stat.S_ISREG(before.st_mode)
        or supplied.is_symlink()
        or before.st_nlink != 1
        or before.st_size < 1
        or before.st_size > MAX_IMPORTER_SOURCE_BYTES
    ):
        raise RuntimeError("importer source is not one bounded single-link regular file")
    descriptor = os.open(supplied, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
    try:
        opened = os.fstat(descriptor)
        identity = lambda metadata: (
            metadata.st_dev,
            metadata.st_ino,
            metadata.st_size,
            metadata.st_mtime_ns,
            metadata.st_ctime_ns,
        )
        if identity(opened) != identity(before):
            raise RuntimeError("importer source identity changed while opening")
        digest = hashlib.sha256()
        consumed = 0
        while True:
            chunk = os.read(descriptor, 1024 * 1024)
            if not chunk:
                break
            consumed += len(chunk)
            if consumed > MAX_IMPORTER_SOURCE_BYTES:
                raise RuntimeError("importer source exceeds the byte bound")
            digest.update(chunk)
        closed = os.fstat(descriptor)
        after = supplied.lstat()
        parent_after = parent.lstat()
        if (
            identity(closed) != identity(opened)
            or identity(after) != identity(opened)
            or (parent_after.st_dev, parent_after.st_ino)
                != (parent_before.st_dev, parent_before.st_ino)
            or parent.resolve(strict=True) != parent
        ):
            raise RuntimeError("importer source path identity changed while reading")
        return "sha256:" + digest.hexdigest()
    finally:
        os.close(descriptor)


IMPORTER_SOURCE_SHA256 = _capture_importer_source_sha256()

LOCKED_DIGESTS = {
    "coordinatePayload": "sha256:17631204745ab1bb264d2052c9cfefb6afbd989a6559d6de1ef5c091c1d8ae99",
    "topology": "sha256:e9d7293e55709ffe8e964c266fe936d597d30d2dd244b398e20b4d0239709183",
    "coordinateConstruction": "sha256:7b77acefe148d5e6adb4e27829589cb0e34e17d5cfe78fb0c83d0816ceb05fbb",
    "system": "sha256:d47785bc641fd6483c58b8549bf7c0dc7e116a5892c0c13864c98e87c712133a",
    "coordinateSeed": "sha256:beb7f2c4f997e2e8b8158a05d6083a7d6569bd1f11457f922844646cac0cc426",
    "plan": "sha256:f6f271d255de31ab655e62b7539b65e58a4e85994870232b675ef7b40f2fd0b8",
}

LATTICE_NM = 0.56402
CELL_LENGTHS = (3.38412, 3.38412, 6.76824)
CELL_VOLUME_NM3 = 77.51169954870105
OH_NM = 0.09572
HH_NM = 0.15139006545247014
HOH_RAD = 1.82421813418
PARTICLE_COUNT = 6336
CRYSTAL_COUNT = 1152
WATER_COUNT = 1728
BOND_COUNT = 3456
CONSTRAINT_COUNT = 5184
EXPECTED_TOTAL_MASS = 64791.919872000544
EXPECTED_MIN_DIFFERENT_MOLECULE_NM = 0.16483354467600186
EXPECTED_MIN_ION_WATER_NM = 0.26000364891955763
SPECIES_CODEBOOK = {"Na+": 0, "Cl-": 1, "TIP3P-O": 2, "TIP3P-H": 3}

ROCKSALT_BASIS = (
    ("Na", 0.0, 0.0, 0.0),
    ("Na", 0.0, 0.5, 0.5),
    ("Na", 0.5, 0.0, 0.5),
    ("Na", 0.5, 0.5, 0.0),
    ("Cl", 0.5, 0.5, 0.5),
    ("Cl", 0.5, 0.0, 0.0),
    ("Cl", 0.0, 0.5, 0.0),
    ("Cl", 0.0, 0.0, 0.5),
)
ORIENTATIONS = (
    ("+x", (1.0, 0.0, 0.0), (0.0, 1.0, 0.0)),
    ("-x", (-1.0, 0.0, 0.0), (0.0, 1.0, 0.0)),
    ("+y", (0.0, 1.0, 0.0), (0.0, 0.0, 1.0)),
    ("-y", (0.0, -1.0, 0.0), (0.0, 0.0, 1.0)),
    ("+z", (0.0, 0.0, 1.0), (1.0, 0.0, 0.0)),
    ("-z", (0.0, 0.0, -1.0), (1.0, 0.0, 0.0)),
)

SOURCE_PINS = [
    {
        "sourceId": "nist-nbs-circular-539-volume-2-nacl-26c",
        "role": "crystal-structure-reference",
        "owner": "NIST/NBS",
        "title": "Standard X-ray Diffraction Powder Patterns, NBS Circular 539 Volume 2",
        "url": "https://nvlpubs.nist.gov/nistpubs/Legacy/circ/nbscircular539v2.pdf",
        "doi": "10.6028/NBS.CIRC.539v2",
        "repository": None,
        "release": None,
        "commit": None,
        "path": None,
        "byteCount": 6_365_255,
        "sha256": "sha256:ad69a84ba964e66caf2de506b7ac044531e0721e2b626ddcfce6d1f839652426",
        "evidenceStatus": "downloaded-byte-pin",
        "redistributionCleared": False,
    },
    {
        "sourceId": "openmm-8.6-amber14-tip3p-parameter-candidate",
        "role": "candidate-parameter-input",
        "owner": "OpenMM",
        "title": "OpenMM 8.6 amber14/tip3p.xml",
        "url": "https://raw.githubusercontent.com/openmm/openmm/c6173db6e8edd705eb59172bd21e9ce69c572405/wrappers/python/openmm/app/data/amber14/tip3p.xml",
        "doi": None,
        "repository": "https://github.com/openmm/openmm",
        "release": "8.6.0",
        "commit": "c6173db6e8edd705eb59172bd21e9ce69c572405",
        "path": "wrappers/python/openmm/app/data/amber14/tip3p.xml",
        "byteCount": 19_070,
        "sha256": "sha256:3f4b188dbcb6c02863230eaca231e927fb6bf3307ce947d8a50d0f46f6dd83d9",
        "evidenceStatus": "pinned-upstream-byte-identity",
        "redistributionCleared": False,
    },
    {
        "sourceId": "openmm-8.6-license-notices",
        "role": "license-notices",
        "owner": "OpenMM",
        "title": "OpenMM 8.6 license notices",
        "url": "https://raw.githubusercontent.com/openmm/openmm/c6173db6e8edd705eb59172bd21e9ce69c572405/docs-source/licenses/Licenses.txt",
        "doi": None,
        "repository": "https://github.com/openmm/openmm",
        "release": "8.6.0",
        "commit": "c6173db6e8edd705eb59172bd21e9ce69c572405",
        "path": "docs-source/licenses/Licenses.txt",
        "byteCount": 9_305,
        "sha256": "sha256:437b7168cc997abea3b5f2a9e0fb6894f96de77b9c69be428ccfcfe9bed58293",
        "evidenceStatus": "pinned-upstream-byte-identity",
        "redistributionCleared": False,
    },
]

PREREQUISITE_GATES = [
    {
        "gateId": "pure-water-openmm-control",
        "requirement": "protected OpenMM 8.6 Reference replay and CPU fixed-coordinate comparison",
        "status": "required-not-satisfied",
        "receiptDigest": None,
    },
    {
        "gateId": "single-pair-low-salt-pme-control",
        "requirement": "same force-family periodic water plus one neutral NaCl pair with preregistered bulk gates",
        "status": "required-not-satisfied",
        "receiptDigest": None,
    },
    {
        "gateId": "dry-nacl-100-slab-stability-control",
        "requirement": "mobile dry slab stability, force closure and lattice-order audit",
        "status": "required-not-satisfied",
        "receiptDigest": None,
    },
    {
        "gateId": "solid-water-interface-potential-domain-qualification",
        "requirement": "independent evidence that the selected potential is valid for solid, solution and interface use",
        "status": "required-not-satisfied",
        "receiptDigest": None,
    },
]


class ImportViolation(ValueError):
    """The candidate cannot be admitted to the normalized semantic bundle."""


def digest_bytes(data: bytes) -> str:
    return "sha256:" + hashlib.sha256(data).hexdigest()


def _number_text(value: int | float) -> str:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ImportViolation("canonical number must be an integer or binary64 value")
    if isinstance(value, int):
        if abs(value) > MAX_SAFE_INTEGER:
            raise ImportViolation("integer lies outside the locked safe-integer domain")
        return str(value)
    if not math.isfinite(value):
        raise ImportViolation("canonical number must be finite")
    if value == 0.0:
        return "0"

    negative = value < 0
    rendered = repr(abs(value)).lower()
    if "e" in rendered:
        mantissa, raw_exponent = rendered.split("e", 1)
        exponent = int(raw_exponent)
    else:
        mantissa = rendered
        exponent = 0
    if "." in mantissa:
        whole, fraction = mantissa.split(".", 1)
    else:
        whole, fraction = mantissa, ""
    digits = whole + fraction
    decimal_position = len(whole) + exponent
    leading = len(digits) - len(digits.lstrip("0"))
    digits = digits[leading:]
    decimal_position -= leading
    digits = digits.rstrip("0")
    if not digits:
        return "0"

    magnitude = abs(value)
    if 1e-6 <= magnitude < 1e21:
        if decimal_position <= 0:
            body = "0." + "0" * (-decimal_position) + digits
        elif decimal_position >= len(digits):
            body = digits + "0" * (decimal_position - len(digits))
        else:
            body = digits[:decimal_position] + "." + digits[decimal_position:]
    else:
        coefficient = digits[0] + (("." + digits[1:]) if len(digits) > 1 else "")
        scientific_exponent = decimal_position - 1
        exponent_text = f"+{scientific_exponent}" if scientific_exponent >= 0 else str(scientific_exponent)
        body = coefficient + "e" + exponent_text
    return "-" + body if negative else body


def _assert_valid_string(value: str) -> None:
    for character in value:
        codepoint = ord(character)
        if 0xD800 <= codepoint <= 0xDFFF:
            raise ImportViolation("strict I-JSON rejects lone surrogate code points")


def _utf16_sort_key(value: str) -> bytes:
    _assert_valid_string(value)
    return value.encode("utf-16-be")


def canonical_json_bytes(value: object) -> bytes:
    """Serialize strict JSON using the digest.ts no-LF value semantics."""

    def render(candidate: object) -> str:
        if candidate is None:
            return "null"
        if candidate is True:
            return "true"
        if candidate is False:
            return "false"
        if isinstance(candidate, str):
            _assert_valid_string(candidate)
            return json.dumps(candidate, ensure_ascii=False, allow_nan=False)
        if isinstance(candidate, (int, float)) and not isinstance(candidate, bool):
            return _number_text(candidate)
        if isinstance(candidate, list):
            return "[" + ",".join(render(item) for item in candidate) + "]"
        if isinstance(candidate, dict):
            if any(not isinstance(key, str) for key in candidate):
                raise ImportViolation("canonical JSON object keys must be strings")
            keys = sorted(candidate, key=_utf16_sort_key)
            return "{" + ",".join(
                render(key) + ":" + render(candidate[key]) for key in keys
            ) + "}"
        raise ImportViolation(f"unsupported canonical JSON value: {type(candidate).__name__}")

    return render(value).encode("utf-8")


def digest_value(value: object) -> str:
    return digest_bytes(canonical_json_bytes(value))


def _parse_integer(token: str) -> int:
    value = int(token)
    if abs(value) > MAX_SAFE_INTEGER:
        raise ImportViolation("JSON integer lies outside the locked safe-integer domain")
    return value


def _parse_float(token: str) -> float:
    value = float(token)
    if not math.isfinite(value):
        raise ImportViolation("JSON number is not finite binary64")
    return value


def _reject_constant(token: str) -> object:
    raise ImportViolation(f"JSON constant {token} is forbidden")


def _closed_object(pairs: list[tuple[str, object]]) -> dict[str, object]:
    result: dict[str, object] = {}
    for key, value in pairs:
        if key in result:
            raise ImportViolation(f"duplicate JSON key: {key}")
        result[key] = value
    return result


def parse_strict_json(data: bytes) -> object:
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError as error:
        raise ImportViolation("plan is not valid UTF-8") from error
    if text.startswith("\ufeff"):
        raise ImportViolation("UTF-8 BOM is forbidden")
    try:
        value = json.loads(
            text,
            object_pairs_hook=_closed_object,
            parse_int=_parse_integer,
            parse_float=_parse_float,
            parse_constant=_reject_constant,
        )
    except (json.JSONDecodeError, RecursionError) as error:
        raise ImportViolation("plan is not bounded strict JSON") from error
    counter = [0]

    def visit(candidate: object, depth: int) -> None:
        if depth > MAX_TREE_DEPTH:
            raise ImportViolation("JSON tree exceeds the depth bound")
        counter[0] += 1
        if counter[0] > MAX_TREE_NODES:
            raise ImportViolation("JSON tree exceeds the node bound")
        if isinstance(candidate, str):
            _assert_valid_string(candidate)
            if len(candidate.encode("utf-8")) > MAX_PATH_BYTES:
                raise ImportViolation("JSON string exceeds the per-value byte bound")
        elif isinstance(candidate, list):
            for child in candidate:
                visit(child, depth + 1)
        elif isinstance(candidate, dict):
            for key, child in candidate.items():
                _assert_valid_string(key)
                visit(child, depth + 1)
        elif isinstance(candidate, float) and not math.isfinite(candidate):
            raise ImportViolation("JSON tree contains a non-finite number")

    visit(value, 0)
    return value


def _file_identity(metadata: os.stat_result) -> tuple[int, int, int, int, int]:
    return (
        metadata.st_dev,
        metadata.st_ino,
        metadata.st_size,
        metadata.st_mtime_ns,
        metadata.st_ctime_ns,
    )


def _normalized_absolute(path: Path, label: str) -> Path:
    supplied = Path(path)
    if (
        not supplied.is_absolute()
        or supplied != Path(os.path.abspath(str(supplied)))
        or len(os.fsencode(str(supplied))) > MAX_PATH_BYTES
    ):
        raise ImportViolation(f"{label} must be one normalized absolute path")
    return supplied


def _canonical_directory(path: Path, label: str) -> Path:
    supplied = _normalized_absolute(path, label)
    if supplied.resolve(strict=False) != supplied:
        raise ImportViolation(f"{label} must not traverse a symbolic-link ancestor")
    metadata = supplied.lstat()
    if (
        not stat.S_ISDIR(metadata.st_mode)
        or supplied.is_symlink()
        or supplied.resolve(strict=True) != supplied
    ):
        raise ImportViolation(f"{label} must be one real canonical directory")
    return supplied


def read_plan_file(path: Path) -> bytes:
    supplied = _normalized_absolute(path, "plan path")
    _canonical_directory(supplied.parent, "plan parent")
    metadata = supplied.lstat()
    if (
        not stat.S_ISREG(metadata.st_mode)
        or supplied.is_symlink()
        or metadata.st_nlink != 1
        or metadata.st_size < 1
        or metadata.st_size > MAX_PLAN_BYTES
    ):
        raise ImportViolation("plan must be one bounded single-link regular file")
    descriptor = os.open(supplied, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
    try:
        opened = os.fstat(descriptor)
        if _file_identity(opened) != _file_identity(metadata):
            raise ImportViolation("plan identity changed while opening")
        chunks: list[bytes] = []
        consumed = 0
        while True:
            chunk = os.read(descriptor, 1024 * 1024)
            if not chunk:
                break
            consumed += len(chunk)
            if consumed > MAX_PLAN_BYTES:
                raise ImportViolation("plan exceeds its byte bound")
            chunks.append(chunk)
        closed = os.fstat(descriptor)
        if _file_identity(closed) != _file_identity(opened):
            raise ImportViolation("plan changed while reading")
    finally:
        os.close(descriptor)
    return b"".join(chunks)


def _expect_keys(value: object, expected: Sequence[str], label: str) -> dict[str, object]:
    if not isinstance(value, dict) or set(value) != set(expected):
        raise ImportViolation(f"{label} keys differ from the closed contract")
    return value


def _number(value: object, label: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ImportViolation(f"{label} must be one finite number, not a boolean")
    return float(value)


def _integer(value: object, label: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise ImportViolation(f"{label} must be one integer, not a boolean")
    return value


def _close(actual: object, expected: float, label: str, tolerance: float = 1e-12) -> None:
    if abs(_number(actual, label) - expected) > tolerance:
        raise ImportViolation(f"{label} differs from the independently reconstructed value")


def _vector(value: object, label: str) -> tuple[float, float, float]:
    record = _expect_keys(value, ("x", "y", "z"), label)
    return tuple(_number(record[axis], f"{label}.{axis}") for axis in ("x", "y", "z"))  # type: ignore[return-value]


def _minimum_image_distance(
    first: Sequence[float], second: Sequence[float], lengths: Sequence[float]
) -> float:
    delta = [
        second[axis] - first[axis]
        - lengths[axis] * round((second[axis] - first[axis]) / lengths[axis])
        for axis in range(3)
    ]
    return math.sqrt(sum(component * component for component in delta))


def _validate_system_metadata(system: Mapping[str, object]) -> None:
    if system["schemaVersion"] != SYSTEM_SCHEMA_VERSION or system["systemId"] != SYSTEM_ID:
        raise ImportViolation("system identity changed")
    if system["status"] != "geometric-coordinate-seed-not-executed":
        raise ImportViolation("system status changed")
    if system["sourcePins"] != SOURCE_PINS:
        raise ImportViolation("source pin order or metadata changed")
    if system["prerequisiteGates"] != PREREQUISITE_GATES:
        raise ImportViolation("prerequisite gate contract changed")
    if system["scientificIdentity"] != {
        "role": "pre-equilibration-balanced-double-interface-nacl-100-water-coordinate-seed",
        "surfaceFamily": "{100}",
        "representedPlane": "(001)-cubic-equivalent-member-of-{100}",
        "surfaceNormalMiller": [0, 0, 1],
        "surfaceNormalCartesianAxis": "z",
        "interfaceCount": 2,
        "vacuumRegionPresent": False,
        "slabCorrectionRequiredByConstruction": False,
    }:
        raise ImportViolation("scientific identity changed")
    if system["composition"] != {
        "conventionalCellCount": 144,
        "sodiumIonCount": 576,
        "chlorideIonCount": 576,
        "crystalIonCount": 1152,
        "waterMoleculeCount": 1728,
        "waterCountPerRegion": 864,
        "particleCount": 6336,
        "residueCount": 2880,
        "structuralWaterBondCount": 3456,
        "rigidWaterConstraintCount": 5184,
        "totalFormalChargeE": 0,
        "totalModelPointChargeE": 0,
        "totalMassDalton": 64791.919872,
        "nominalWaterSeedDensityKgM3": 1000.3659761772168,
    }:
        raise ImportViolation("system composition metadata changed")
    periodic = _expect_keys(
        system["periodicCell"],
        (
            "kind", "vectorsNanometer", "lengthsNanometer", "periodicAxes",
            "volumeNanometer3", "nominalSlabThicknessNanometer",
            "nominalWaterThicknessPerSideNanometer", "combinedWaterThicknessNanometer",
            "periodicSurfacePlaneSeparationNanometer",
            "twoWaterRegionsHaveEqualCompositionAndPackingRecipe",
        ),
        "periodic cell",
    )
    expected_periodic_scalars = {
        "kind": "orthorhombic-fully-periodic",
        "periodicAxes": [True, True, True],
        "volumeNanometer3": CELL_VOLUME_NM3,
        "nominalSlabThicknessNanometer": 2.25608,
        "nominalWaterThicknessPerSideNanometer": 2.25608,
        "combinedWaterThicknessNanometer": 4.51216,
        "periodicSurfacePlaneSeparationNanometer": 4.794169999999999,
        "twoWaterRegionsHaveEqualCompositionAndPackingRecipe": True,
    }
    for key, expected in expected_periodic_scalars.items():
        if periodic[key] != expected:
            raise ImportViolation(f"periodic cell {key} changed")
    if _vector(periodic["lengthsNanometer"], "periodic lengths") != CELL_LENGTHS:
        raise ImportViolation("periodic cell lengths changed")
    vectors = periodic["vectorsNanometer"]
    if not isinstance(vectors, list) or len(vectors) != 3:
        raise ImportViolation("periodic vectors changed")
    if [_vector(item, f"periodic vector {index}") for index, item in enumerate(vectors)] != [
        (CELL_LENGTHS[0], 0.0, 0.0),
        (0.0, CELL_LENGTHS[1], 0.0),
        (0.0, 0.0, CELL_LENGTHS[2]),
    ]:
        raise ImportViolation("periodic vectors are not the locked orthorhombic cell")
    coordinate_contract = system["coordinateContract"]
    expected_coordinate_contract = {
        "seedId": SEED_ID,
        "algorithmVersion": SEED_SCHEMA_VERSION,
        "unit": "nanometer",
        "atomOrder": "crystal-cell-z-y-x-basis-then-lower-water-z-y-x-ohh-then-upper-water-z-y-x-ohh",
        "wrapping": "all-sites-inside-primary-cell-no-post-generation-wrap",
        "coordinateConstructionDigest": LOCKED_DIGESTS["coordinateConstruction"],
        "coordinatePayloadDigest": LOCKED_DIGESTS["coordinatePayload"],
        "topologyDigest": LOCKED_DIGESTS["topology"],
    }
    if coordinate_contract != expected_coordinate_contract:
        raise ImportViolation("coordinate contract changed")
    if system["crystalConstruction"] != {
        "algorithm": "replicated-fm-3m-conventional-basis-v0410",
        "spaceGroup": "Fm-3m",
        "latticeConstantNanometer": LATTICE_NM,
        "latticeConstantTemperatureCelsius": 26,
        "latticeConstantRole": "experimental-geometric-seed-not-force-field-equilibrium",
        "conventionalCellRepeats": [6, 6, 4],
        "formulaUnitsPerConventionalCell": 4,
        "basis": [
            {
                "element": element,
                "fractional": {"x": x, "y": y, "z": z},
            }
            for element, x, y, z in ROCKSALT_BASIS
        ],
        "atomicPlaneCount": 8,
        "ionsPerAtomicPlane": 144,
        "sodiumPerAtomicPlane": 72,
        "chloridePerAtomicPlane": 72,
        "planeFormalChargeE": 0,
        "firstPlaneZNanometer": 2.3970849999999997,
        "lastPlaneZNanometer": 4.371155,
        "lowerAndUpperTermination": "neutral-mixed-na-cl-{100}-planes",
    }:
        raise ImportViolation("crystal construction metadata changed")
    if system["waterConstruction"] != {
        "algorithm": "balanced-six-orientation-rigid-tip3p-grid-seed-v0410",
        "role": "deterministic-pre-minimization-packing-not-equilibrated-water",
        "gridsPerRegion": [12, 12, 6],
        "regionOrder": ["lower-water-region", "upper-water-region"],
        "oxygenHydrogenDistanceNanometer": OH_NM,
        "hydrogenHydrogenDistanceNanometer": HH_NM,
        "hydrogenOxygenHydrogenAngleRadian": HOH_RAD,
        "orientationIds": [orientation[0] for orientation in ORIENTATIONS],
        "occurrencesPerOrientationPerRegion": 144,
        "netDipoleDirectionSumPerRegion": {"x": 0, "y": 0, "z": 0},
    }:
        raise ImportViolation("water construction metadata changed")
    if system["candidateForceModel"] != {
        "familyId": "openmm-amber14-tip3p-joung-cheatham-candidate",
        "waterModel": "rigid-TIP3P",
        "ionModel": "Joung-Cheatham-monovalent-ions-for-TIP3P",
        "combiningRule": "Lorentz-Berthelot",
        "electrostaticsPlan": "three-dimensional-PME",
        "cutoffNanometer": 1,
        "dispersionCorrection": True,
        "solidInterfaceDomainValidated": False,
        "saturationOrPhaseEquilibriumValidated": False,
        "executionEligibility": "blocked-until-all-prerequisite-gates-have-independent-receipts",
    }:
        raise ImportViolation("candidate force-model boundary changed")
    if system["evidenceSemantics"] != {
        "coordinateConstructionExecutedLocally": True,
        "molecularDynamicsExecuted": False,
        "openmmExecuted": False,
        "pmeExecuted": False,
        "minimized": False,
        "equilibrated": False,
        "trajectoryAvailable": False,
        "forceOrEnergyAvailable": False,
        "protectedMainArtifact": False,
    }:
        raise ImportViolation("evidence semantics changed")
    if system["plannedReadouts"] != {
        "availableFromGeometricSeed": [
            "atom-identity-formal-and-model-point-charge",
            "exact-coordinate-and-cell",
            "crystal-layer-and-surface-labels",
            "rigid-water-topology",
        ],
        "requireExecutedVerifiedTrajectory": [
            "energy-and-potential-force",
            "z-resolved-species-density",
            "water-dipole-orientation",
            "na-o-cl-h-cl-o-geometric-coordination",
            "surface-site-displacement-and-occupancy",
        ],
        "requireQualifiedPotentialAndMultiSeedStatistics": [
            "persistent-detachment-and-reattachment-events",
            "largest-crystal-cluster-and-local-q8",
            "dissolution-or-crystallization-rate",
        ],
    }:
        raise ImportViolation("planned readout boundary changed")
    if system["claimBoundaries"] != {
        "lowSaltQualified": False,
        "drySlabQualified": False,
        "interfacePotentialQualified": False,
        "interfaceDynamicsSimulated": False,
        "hydrationStructureMeasured": False,
        "dissolutionObserved": False,
        "crystallizationObserved": False,
        "kineticRateEstimated": False,
        "electronicStructureComputed": False,
        "learnedWorldModelTrained": False,
        "industrialPrediction": False,
        "publicReleaseEligible": False,
    }:
        raise ImportViolation("scientific claim boundary changed")


def _validate_digest_graph(plan: Mapping[str, object]) -> dict[str, str]:
    system = plan["system"]
    seed = plan["coordinateSeed"]
    if not isinstance(system, dict) or not isinstance(seed, dict):
        raise ImportViolation("plan system and coordinate seed must be objects")
    atoms = seed["atoms"]
    if not isinstance(atoms, list):
        raise ImportViolation("coordinate seed atoms must be an array")
    coordinate_preimage = [
        {
            "atomIndex": atom["atomIndex"],
            "atomId": atom["atomId"],
            "positionNanometer": atom["positionNanometer"],
        }
        for atom in atoms
    ]
    topology_preimage = {
        "atomIdentity": [
            {
                key: atom[key]
                for key in (
                    "atomIndex", "atomId", "moleculeId", "residueId", "element",
                    "species", "phase", "formalChargeE", "modelPointChargeE",
                    "massDalton", "crystalSite", "waterSite",
                )
            }
            for atom in atoms
        ],
        "structuralBonds": seed["structuralBonds"],
        "rigidConstraints": seed["rigidConstraints"],
    }
    construction_preimage = {
        key: value for key, value in seed.items() if key not in ("systemDigest", "seedDigest")
    }
    system_preimage = {key: value for key, value in system.items() if key != "systemDigest"}
    seed_preimage = {key: value for key, value in seed.items() if key != "seedDigest"}
    recomputed = {
        "coordinatePayload": digest_value(coordinate_preimage),
        "topology": digest_value(topology_preimage),
        "coordinateConstruction": digest_value(construction_preimage),
        "system": digest_value(system_preimage),
        "coordinateSeed": digest_value(seed_preimage),
        "plan": digest_value({"system": system, "coordinateSeed": seed}),
    }
    if recomputed != LOCKED_DIGESTS:
        mismatched = [key for key in LOCKED_DIGESTS if recomputed[key] != LOCKED_DIGESTS[key]]
        raise ImportViolation("digest dependency graph differs at: " + ", ".join(mismatched))
    if (
        plan["planDigest"] != LOCKED_DIGESTS["plan"]
        or system["systemDigest"] != LOCKED_DIGESTS["system"]
        or seed["systemDigest"] != LOCKED_DIGESTS["system"]
        or seed["seedDigest"] != LOCKED_DIGESTS["coordinateSeed"]
    ):
        raise ImportViolation("embedded digest identity changed")
    return recomputed


def _validate_atoms(atoms: list[object]) -> dict[str, object]:
    if len(atoms) != PARTICLE_COUNT:
        raise ImportViolation("coordinate seed must contain exactly 6,336 atoms")
    atom_keys = (
        "atomIndex", "atomId", "moleculeId", "residueId", "element", "species",
        "phase", "formalChargeE", "modelPointChargeE", "massDalton",
        "positionNanometer", "crystalSite", "waterSite",
    )
    atom_ids: set[str] = set()
    species_counts = {key: 0 for key in SPECIES_CODEBOOK}
    layer_counts = [{"Na+": 0, "Cl-": 0, "charge": 0} for _ in range(8)]
    orientation_counts = {
        region: {orientation[0]: 0 for orientation in ORIENTATIONS}
        for region in ("lower-water-region", "upper-water-region")
    }
    positions: list[tuple[float, float, float]] = []
    total_formal = 0
    total_model = 0.0
    total_mass = 0.0

    for array_index, candidate in enumerate(atoms):
        atom = _expect_keys(candidate, atom_keys, f"atom[{array_index}]")
        if _integer(atom["atomIndex"], f"atom[{array_index}].atomIndex") != array_index:
            raise ImportViolation("atomIndex is not the zero-based array bijection")
        atom_id = atom["atomId"]
        if not isinstance(atom_id, str) or atom_id in atom_ids:
            raise ImportViolation("atomId values must be unique strings")
        atom_ids.add(atom_id)
        position = _vector(atom["positionNanometer"], f"atom[{array_index}].position")
        if any(value < 0.0 or value >= CELL_LENGTHS[axis] for axis, value in enumerate(position)):
            raise ImportViolation("an atom lies outside the half-open primary cell")
        positions.append(position)

        if array_index < CRYSTAL_COUNT:
            cell_linear, basis_index = divmod(array_index, 8)
            cell_x = cell_linear % 6
            cell_y = (cell_linear // 6) % 6
            cell_z = cell_linear // 36
            element, frac_x, frac_y, frac_z = ROCKSALT_BASIS[basis_index]
            species = "Na+" if element == "Na" else "Cl-"
            layer = 2 * cell_z + (1 if frac_z == 0.5 else 0)
            expected_id = f"crystal:{cell_z}:{cell_y}:{cell_x}:{basis_index}:{element}"
            surface_role = (
                "lower-surface-plane" if layer == 0
                else "upper-surface-plane" if layer == 7
                else "interior-plane"
            )
            expected_site = {
                "cellIndex": [cell_x, cell_y, cell_z],
                "basisIndex": basis_index,
                "layerIndex": layer,
                "surfaceRole": surface_role,
            }
            expected_position = (
                (cell_x + frac_x + 0.25) * LATTICE_NM,
                (cell_y + frac_y + 0.25) * LATTICE_NM,
                (cell_z + frac_z + 4.25) * LATTICE_NM,
            )
            expected_scalars = {
                "atomId": expected_id,
                "moleculeId": expected_id,
                "residueId": f"ion:{array_index}",
                "element": element,
                "species": species,
                "phase": "solid-coordinate-seed",
                "formalChargeE": 1 if species == "Na+" else -1,
                "modelPointChargeE": 1 if species == "Na+" else -1,
                "massDalton": 22.99 if species == "Na+" else 35.45,
                "crystalSite": expected_site,
                "waterSite": None,
            }
            for key, expected in expected_scalars.items():
                if atom[key] != expected:
                    raise ImportViolation(f"crystal atom {array_index} {key} changed")
            for axis in range(3):
                _close(position[axis], expected_position[axis], f"crystal atom {array_index} coordinate")
            layer_counts[layer][species] += 1
            layer_counts[layer]["charge"] += 1 if species == "Na+" else -1
        else:
            water_atom_offset = array_index - CRYSTAL_COUNT
            water_index, role_index = divmod(water_atom_offset, 3)
            region_index, local_index = divmod(water_index, 864)
            region = "lower-water-region" if region_index == 0 else "upper-water-region"
            grid_x = local_index % 12
            grid_y = (local_index // 12) % 12
            grid_z = local_index // 144
            orientation_id, dipole, perpendicular = ORIENTATIONS[(grid_x + grid_y + grid_z) % 6]
            role = ("O", "H1", "H2")[role_index]
            molecule_id = f"water:{region}:{local_index:04d}"
            oxygen = (
                (grid_x + 0.5) * CELL_LENGTHS[0] / 12,
                (grid_y + 0.5) * CELL_LENGTHS[1] / 12,
                region_index * 8 * LATTICE_NM + (grid_z + 0.5) * (4 * LATTICE_NM / 6),
            )
            half_angle = HOH_RAD / 2
            along = OH_NM * math.cos(half_angle)
            across = OH_NM * math.sin(half_angle) * (1 if role == "H1" else -1)
            expected_position = oxygen if role == "O" else tuple(
                oxygen[axis] + dipole[axis] * along + perpendicular[axis] * across
                for axis in range(3)
            )
            expected_scalars = {
                "atomId": f"{molecule_id}:{role}",
                "moleculeId": molecule_id,
                "residueId": molecule_id,
                "element": "O" if role == "O" else "H",
                "species": "TIP3P-O" if role == "O" else "TIP3P-H",
                "phase": "water-coordinate-seed",
                "formalChargeE": 0,
                "modelPointChargeE": -0.834 if role == "O" else 0.417,
                "massDalton": 15.99943 if role == "O" else 1.007947,
                "crystalSite": None,
                "waterSite": {
                    "region": region,
                    "gridIndex": [grid_x, grid_y, grid_z],
                    "orientationId": orientation_id,
                    "siteRole": role,
                },
            }
            for key, expected in expected_scalars.items():
                if atom[key] != expected:
                    raise ImportViolation(f"water atom {array_index} {key} changed")
            for axis in range(3):
                _close(position[axis], expected_position[axis], f"water atom {array_index} coordinate")
            if role == "O":
                orientation_counts[region][orientation_id] += 1

        species = atom["species"]
        if species not in species_counts:
            raise ImportViolation("unknown species")
        species_counts[species] += 1
        total_formal += _integer(atom["formalChargeE"], "formal charge")
        total_model += _number(atom["modelPointChargeE"], "model point charge")
        total_mass += _number(atom["massDalton"], "mass")

    if species_counts != {"Na+": 576, "Cl-": 576, "TIP3P-O": 1728, "TIP3P-H": 3456}:
        raise ImportViolation("species cardinalities changed")
    if any(layer != {"Na+": 72, "Cl-": 72, "charge": 0} for layer in layer_counts):
        raise ImportViolation("crystal layers are not eight neutral mixed planes")
    if any(any(count != 144 for count in region.values()) for region in orientation_counts.values()):
        raise ImportViolation("water orientation schedule is not balanced per region")
    if total_formal != 0 or abs(total_model) > 1e-12:
        raise ImportViolation("formal or model point charge is not neutral")
    _close(total_mass, EXPECTED_TOTAL_MASS, "coordinate total mass", 1e-9)
    return {
        "positions": positions,
        "speciesCounts": species_counts,
        "totalFormalChargeE": total_formal,
        "totalModelPointChargeE": 0,
        "totalMassDalton": total_mass,
        "layerCounts": layer_counts,
    }


def _validate_topology(
    atoms: list[object], bonds: list[object], constraints: list[object]
) -> None:
    if len(bonds) != BOND_COUNT or len(constraints) != CONSTRAINT_COUNT:
        raise ImportViolation("water topology cardinality changed")
    bond_keys = (
        "bondId", "atomAIndex", "atomBIndex", "atomAId", "atomBId", "role",
        "energeticInteraction",
    )
    constraint_keys = (
        "constraintId", "atomAIndex", "atomBIndex", "atomAId", "atomBId",
        "sitePair", "targetDistanceNanometer",
    )
    for water_index in range(WATER_COUNT):
        region = "lower-water-region" if water_index < 864 else "upper-water-region"
        local_index = water_index if water_index < 864 else water_index - 864
        molecule_id = f"water:{region}:{local_index:04d}"
        oxygen_index = CRYSTAL_COUNT + water_index * 3
        atom_ids = [atoms[oxygen_index + offset]["atomId"] for offset in range(3)]
        for offset, suffix in enumerate(("oh1", "oh2")):
            bond = _expect_keys(bonds[water_index * 2 + offset], bond_keys, "water bond")
            expected = {
                "bondId": f"{molecule_id}:{suffix}",
                "atomAIndex": oxygen_index,
                "atomBIndex": oxygen_index + offset + 1,
                "atomAId": atom_ids[0],
                "atomBId": atom_ids[offset + 1],
                "role": "structural-rigid-water-oh-link",
                "energeticInteraction": False,
            }
            if bond != expected:
                raise ImportViolation("water structural bond identity changed")
        for offset, (site_pair, first_offset, second_offset, target) in enumerate((
            ("O-H1", 0, 1, OH_NM),
            ("O-H2", 0, 2, OH_NM),
            ("H1-H2", 1, 2, HH_NM),
        )):
            constraint = _expect_keys(
                constraints[water_index * 3 + offset], constraint_keys, "water constraint"
            )
            expected = {
                "constraintId": f"{molecule_id}:{site_pair}",
                "atomAIndex": oxygen_index + first_offset,
                "atomBIndex": oxygen_index + second_offset,
                "atomAId": atom_ids[first_offset],
                "atomBId": atom_ids[second_offset],
                "sitePair": site_pair,
                "targetDistanceNanometer": target,
            }
            if constraint != expected:
                raise ImportViolation("water rigid constraint identity changed")
            first = _vector(atoms[oxygen_index + first_offset]["positionNanometer"], "constraint atom A")
            second = _vector(atoms[oxygen_index + second_offset]["positionNanometer"], "constraint atom B")
            actual = _minimum_image_distance(first, second, CELL_LENGTHS)
            _close(actual, target, "water rigid constraint geometry")


def _distance_audit(
    atoms: list[object], positions: list[tuple[float, float, float]]
) -> tuple[float, float]:
    bin_counts = (9, 9, 19)
    bin_widths = tuple(CELL_LENGTHS[axis] / bin_counts[axis] for axis in range(3))
    bins: dict[tuple[int, int, int], list[int]] = {}
    for index, position in enumerate(positions):
        key = tuple(
            min(bin_counts[axis] - 1, int(position[axis] / bin_widths[axis]))
            for axis in range(3)
        )
        bins.setdefault(key, []).append(index)
    minimum = math.inf
    minimum_ion_water = math.inf
    for index, position in enumerate(positions):
        center = tuple(
            min(bin_counts[axis] - 1, int(position[axis] / bin_widths[axis]))
            for axis in range(3)
        )
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for dz in (-1, 0, 1):
                    neighbor = (
                        (center[0] + dx) % bin_counts[0],
                        (center[1] + dy) % bin_counts[1],
                        (center[2] + dz) % bin_counts[2],
                    )
                    for other_index in bins.get(neighbor, ()):
                        if other_index <= index:
                            continue
                        if atoms[index]["moleculeId"] == atoms[other_index]["moleculeId"]:
                            continue
                        distance = _minimum_image_distance(position, positions[other_index], CELL_LENGTHS)
                        minimum = min(minimum, distance)
                        phases = {atoms[index]["phase"], atoms[other_index]["phase"]}
                        if phases == {"solid-coordinate-seed", "water-coordinate-seed"}:
                            minimum_ion_water = min(minimum_ion_water, distance)
    _close(minimum, EXPECTED_MIN_DIFFERENT_MOLECULE_NM, "minimum different-molecule distance")
    _close(minimum_ion_water, EXPECTED_MIN_ION_WATER_NM, "minimum ion-water distance")
    return minimum, minimum_ion_water


def _validate_crystal_coordination(positions: list[tuple[float, float, float]]) -> None:
    nearest = LATTICE_NM / 2
    for index in range(CRYSTAL_COUNT):
        count = 0
        species_is_sodium = index % 8 < 4
        for other in range(CRYSTAL_COUNT):
            if (other % 8 < 4) == species_is_sodium:
                continue
            distance = _minimum_image_distance(positions[index], positions[other], CELL_LENGTHS)
            if abs(distance - nearest) <= 1e-10:
                count += 1
        cell_z = (index // 8) // 36
        frac_z = ROCKSALT_BASIS[index % 8][3]
        layer = 2 * cell_z + (1 if frac_z == 0.5 else 0)
        expected = 5 if layer in (0, 7) else 6
        if count != expected:
            raise ImportViolation("crystal nearest-neighbor coordination changed")


def verify_plan_value(plan: object) -> tuple[dict[str, object], dict[str, str]]:
    root = _expect_keys(plan, ("system", "coordinateSeed", "planDigest"), "plan")
    system = _expect_keys(
        root["system"],
        (
            "schemaVersion", "systemId", "status", "scientificIdentity", "sourcePins",
            "composition", "periodicCell", "crystalConstruction", "waterConstruction",
            "coordinateContract", "candidateForceModel", "prerequisiteGates",
            "plannedReadouts", "evidenceSemantics", "claimBoundaries", "systemDigest",
        ),
        "system",
    )
    seed = _expect_keys(
        root["coordinateSeed"],
        (
            "schemaVersion", "seedId", "status", "systemId", "systemDigest", "atoms",
            "structuralBonds", "rigidConstraints", "constructionReceipt", "seedDigest",
        ),
        "coordinate seed",
    )
    if (
        seed["schemaVersion"] != SEED_SCHEMA_VERSION
        or seed["seedId"] != SEED_ID
        or seed["systemId"] != SYSTEM_ID
        or seed["status"] != "geometric-coordinate-seed-not-minimized-or-executed"
    ):
        raise ImportViolation("coordinate seed envelope changed")
    atoms = seed["atoms"]
    bonds = seed["structuralBonds"]
    constraints = seed["rigidConstraints"]
    if not isinstance(atoms, list) or not isinstance(bonds, list) or not isinstance(constraints, list):
        raise ImportViolation("coordinate arrays changed type")

    _validate_system_metadata(system)
    atom_audit = _validate_atoms(atoms)
    _validate_topology(atoms, bonds, constraints)
    minimum, minimum_ion_water = _distance_audit(atoms, atom_audit["positions"])
    _validate_crystal_coordination(atom_audit["positions"])
    receipt = seed["constructionReceipt"]
    expected_receipt = {
        "atomCount": PARTICLE_COUNT,
        "sodiumIonCount": 576,
        "chlorideIonCount": 576,
        "waterMoleculeCount": WATER_COUNT,
        "lowerWaterCount": 864,
        "upperWaterCount": 864,
        "crystalLayerCount": 8,
        "neutralCrystalLayerCount": 8,
        "balancedWaterOrientationRegions": 2,
        "allSitesInsidePrimaryCell": True,
        "totalFormalChargeE": 0,
        "totalModelPointChargeE": 0,
        "totalMassDalton": EXPECTED_TOTAL_MASS,
        "minimumDifferentMoleculeDistanceNanometer": EXPECTED_MIN_DIFFERENT_MOLECULE_NM,
        "coordinatePayloadDigest": LOCKED_DIGESTS["coordinatePayload"],
        "topologyDigest": LOCKED_DIGESTS["topology"],
    }
    if receipt != expected_receipt:
        raise ImportViolation("coordinate construction receipt changed")
    recomputed = _validate_digest_graph(root)
    semantic_audit = {
        "checks": {
            "closedShapeAndCardinality": True,
            "digestDependencyGraph": True,
            "atomIndexBijection": True,
            "uniqueAtomIdentity": True,
            "canonicalAtomOrder": True,
            "speciesChargeMassConsistency": True,
            "phaseAndSiteConsistency": True,
            "moleculeAndResidueIntegrity": True,
            "topologyReferenceIntegrity": True,
            "rigidConstraintGeometry": True,
            "primaryCellBounds": True,
            "periodicCellConsistency": True,
            "constructionReceiptConsistency": True,
            "sourcePinMetadataConsistency": True,
        },
        "particleCount": PARTICLE_COUNT,
        "structuralBondCount": BOND_COUNT,
        "rigidConstraintCount": CONSTRAINT_COUNT,
        "speciesCounts": {
            "sodiumIonCount": atom_audit["speciesCounts"]["Na+"],
            "chlorideIonCount": atom_audit["speciesCounts"]["Cl-"],
            "tip3pOxygenCount": atom_audit["speciesCounts"]["TIP3P-O"],
            "tip3pHydrogenCount": atom_audit["speciesCounts"]["TIP3P-H"],
        },
        "waterMoleculeCount": WATER_COUNT,
        "waterCountsPerRegion": {"lowerWaterRegion": 864, "upperWaterRegion": 864},
        "crystalLayerCount": 8,
        "neutralCrystalLayerCount": 8,
        "totalFormalChargeE": atom_audit["totalFormalChargeE"],
        "totalModelPointChargeE": atom_audit["totalModelPointChargeE"],
        "totalMassDalton": atom_audit["totalMassDalton"],
        "minimumDifferentMoleculeDistanceNanometer": minimum,
        "minimumIonWaterDistanceNanometer": minimum_ion_water,
        "crystalCoordination": {
            "surfaceOppositeChargeNearestNeighbors": 5,
            "interiorOppositeChargeNearestNeighbors": 6,
        },
        "cellLengthsNanometer": {"x": CELL_LENGTHS[0], "y": CELL_LENGTHS[1], "z": CELL_LENGTHS[2]},
        "cellVolumeNanometer3": CELL_VOLUME_NM3,
    }
    return semantic_audit, recomputed


def _pack_f64(values: Iterable[float]) -> bytes:
    normalized = []
    for value in values:
        numeric = _number(value, "normalized float64 value")
        normalized.append(0.0 if numeric == 0.0 else numeric)
    return struct.pack("<" + "d" * len(normalized), *normalized)


def _pack_u32(values: Iterable[int]) -> bytes:
    normalized = []
    for value in values:
        integer = _integer(value, "normalized uint32 value")
        if integer < 0 or integer > 0xFFFFFFFF:
            raise ImportViolation("normalized uint32 value lies outside its domain")
        normalized.append(integer)
    return struct.pack("<" + "I" * len(normalized), *normalized)


def _artifact_descriptor(
    artifact_id: str,
    relative_path: str,
    dtype: str,
    shape: list[int],
    unit: str,
    data: bytes,
) -> dict[str, object]:
    return {
        "id": artifact_id,
        "path": relative_path,
        "dtype": dtype,
        "shape": shape,
        "unit": unit,
        "sizeBytes": len(data),
        "sha256": digest_bytes(data),
    }


def build_normalized_artifacts(plan: Mapping[str, object]) -> list[tuple[dict[str, object], bytes]]:
    system = plan["system"]
    seed = plan["coordinateSeed"]
    atoms = seed["atoms"]
    bonds = seed["structuralBonds"]
    constraints = seed["rigidConstraints"]
    vectors = system["periodicCell"]["vectorsNanometer"]
    cell_data = _pack_f64(
        component
        for vector in vectors
        for component in _vector(vector, "normalized cell vector")
    )
    position_data = _pack_f64(
        component
        for atom in atoms
        for component in _vector(atom["positionNanometer"], "normalized position")
    )
    mass_data = _pack_f64(atom["massDalton"] for atom in atoms)
    formal_charge_data = _pack_f64(atom["formalChargeE"] for atom in atoms)
    model_charge_data = _pack_f64(atom["modelPointChargeE"] for atom in atoms)
    species_data = _pack_u32(SPECIES_CODEBOOK[atom["species"]] for atom in atoms)
    bond_data = _pack_u32(
        index for bond in bonds for index in (bond["atomAIndex"], bond["atomBIndex"])
    )
    constraint_data = _pack_u32(
        index
        for constraint in constraints
        for index in (constraint["atomAIndex"], constraint["atomBIndex"])
    )
    target_data = _pack_f64(constraint["targetDistanceNanometer"] for constraint in constraints)
    identity_ledger = [
        {
            key: atom[key]
            for key in (
                "atomIndex", "atomId", "moleculeId", "residueId", "element", "species",
                "phase", "crystalSite", "waterSite",
            )
        }
        for atom in atoms
    ]
    ledger_data = canonical_json_bytes(identity_ledger) + b"\n"
    specifications = (
        ("cell-vectors", "arrays/cell-vectors.f64le", "float64-le", [3, 3], "nanometer", cell_data),
        ("positions", "arrays/positions.f64le", "float64-le", [6336, 3], "nanometer", position_data),
        ("masses", "arrays/masses.f64le", "float64-le", [6336], "dalton", mass_data),
        ("formal-charges", "arrays/formal-charges.f64le", "float64-le", [6336], "elementary-charge", formal_charge_data),
        ("model-point-charges", "arrays/model-point-charges.f64le", "float64-le", [6336], "elementary-charge", model_charge_data),
        ("species-codes", "arrays/species-codes.u32le", "uint32-le", [6336], "species-code", species_data),
        ("structural-bond-indices", "arrays/structural-bond-indices.u32le", "uint32-le", [3456, 2], "index", bond_data),
        ("rigid-constraint-indices", "arrays/rigid-constraint-indices.u32le", "uint32-le", [5184, 2], "index", constraint_data),
        ("rigid-constraint-targets", "arrays/rigid-constraint-targets.f64le", "float64-le", [5184], "nanometer", target_data),
        ("identity-ledger", "manifests/identity-ledger.json", "canonical-json", [6336], "atom-identity", ledger_data),
    )
    return [
        (_artifact_descriptor(*specification[:-1], specification[-1]), specification[-1])
        for specification in specifications
    ]


def _entry_metadata(directory_descriptor: int, name: str) -> os.stat_result | None:
    try:
        return os.stat(name, dir_fd=directory_descriptor, follow_symlinks=False)
    except FileNotFoundError:
        return None


def _same_inode(metadata: os.stat_result, identity: tuple[int, int]) -> bool:
    return (metadata.st_dev, metadata.st_ino) == identity


def _safe_unlink_owned(
    directory_descriptor: int,
    name: str,
    identity: tuple[int, int] | None,
) -> None:
    if identity is None:
        return
    try:
        current = _entry_metadata(directory_descriptor, name)
        if current is not None and stat.S_ISREG(current.st_mode) and _same_inode(current, identity):
            os.unlink(name, dir_fd=directory_descriptor)
            os.fsync(directory_descriptor)
    except OSError:
        pass


def _write_exclusive(directory_descriptor: int, name: str, data: bytes) -> tuple[int, int]:
    if not name or Path(name).name != name or "\x00" in name:
        raise ImportViolation("artifact output name is not one safe path segment")
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0)
    descriptor: int | None = None
    identity: tuple[int, int] | None = None
    try:
        descriptor = os.open(name, flags, 0o600, dir_fd=directory_descriptor)
        created_identity = os.fstat(descriptor)
        identity = (created_identity.st_dev, created_identity.st_ino)
        if not stat.S_ISREG(created_identity.st_mode) or created_identity.st_nlink != 1:
            raise ImportViolation("artifact output is not a single-link regular file")
        offset = 0
        while offset < len(data):
            written = os.write(descriptor, data[offset:])
            if written < 1:
                raise ImportViolation("artifact output write made no progress")
            offset += written
        os.fchmod(descriptor, 0o444)
        os.fsync(descriptor)
        final = os.fstat(descriptor)
        if (
            not _same_inode(final, identity)
            or final.st_nlink != 1
            or final.st_size != len(data)
            or stat.S_IMODE(final.st_mode) != 0o444
        ):
            raise ImportViolation("artifact output identity changed while writing")
        current = _entry_metadata(directory_descriptor, name)
        if current is None or not stat.S_ISREG(current.st_mode) or not _same_inode(current, identity):
            raise ImportViolation("artifact output path identity changed while writing")
        return identity
    except Exception:
        if descriptor is not None:
            try:
                os.close(descriptor)
            except OSError:
                pass
            descriptor = None
        _safe_unlink_owned(directory_descriptor, name, identity)
        raise
    finally:
        if descriptor is not None:
            os.close(descriptor)


def _open_owned_directory(
    parent_descriptor: int,
    name: str,
    label: str,
) -> tuple[int, tuple[int, int]]:
    descriptor = os.open(
        name,
        os.O_RDONLY | getattr(os, "O_DIRECTORY", 0) | getattr(os, "O_NOFOLLOW", 0),
        dir_fd=parent_descriptor,
    )
    try:
        opened = os.fstat(descriptor)
        current = _entry_metadata(parent_descriptor, name)
        identity = (opened.st_dev, opened.st_ino)
        if (
            not stat.S_ISDIR(opened.st_mode)
            or current is None
            or not stat.S_ISDIR(current.st_mode)
            or not _same_inode(current, identity)
        ):
            raise ImportViolation(f"{label} identity changed while opening")
        return descriptor, identity
    except Exception:
        os.close(descriptor)
        raise


def _safe_remove_owned_directory(
    parent_descriptor: int,
    name: str,
    identity: tuple[int, int] | None,
) -> None:
    if identity is None:
        return
    try:
        current = _entry_metadata(parent_descriptor, name)
        if current is not None and stat.S_ISDIR(current.st_mode) and _same_inode(current, identity):
            os.rmdir(name, dir_fd=parent_descriptor)
            os.fsync(parent_descriptor)
    except OSError:
        pass


def _assert_closed_output_inventory(
    bundle_descriptor: int,
    arrays_descriptor: int,
    manifests_descriptor: int,
    descriptors: Sequence[Mapping[str, object]],
) -> None:
    expected_arrays = sorted(
        str(descriptor["path"]).split("/", 1)[1]
        for descriptor in descriptors
        if str(descriptor["path"]).startswith("arrays/")
    )
    if (
        sorted(os.listdir(bundle_descriptor))
            != ["arrays", "manifests", "semantic-import-receipt.json"]
        or sorted(os.listdir(arrays_descriptor)) != expected_arrays
        or os.listdir(manifests_descriptor) != ["identity-ledger.json"]
    ):
        raise ImportViolation("normalized output inventory changed before publication")


def _stable_evidence_preimage(receipt: Mapping[str, object]) -> dict[str, object]:
    return {
        key: receipt[key]
        for key in (
            "subject", "canonicalization", "verifier", "digests", "semanticAudit",
            "normalizedArtifacts", "prerequisiteGates", "sourceEvidence", "execution", "claims",
        )
    }


def build_receipt(
    plan: Mapping[str, object],
    raw_plan: bytes,
    semantic_audit: dict[str, object],
    recomputed: dict[str, str],
    descriptors: list[dict[str, object]],
) -> dict[str, object]:
    canonical_value_sha = digest_value(plan)
    if canonical_value_sha != EXPECTED_CANONICAL_VALUE_SHA256:
        raise ImportViolation("complete canonical plan value changed")
    golden_vector = [0, 0, 0, 1e-7, 1e21]
    golden_digest = digest_value(golden_vector)
    if golden_digest != "sha256:42a312db6567a94c25c159743cdfad37637d8d07600423f4b102c5536633cd6d":
        raise ImportViolation("Python canonical number profile does not match the locked golden vector")
    normalized = {
        "speciesCodebook": dict(SPECIES_CODEBOOK),
        "artifacts": descriptors,
        "semanticRoot": digest_value(descriptors),
    }
    receipt: dict[str, object] = {
        "schemaVersion": RECEIPT_SCHEMA_VERSION,
        "profile": "nacl-water-interface-stdlib-python-semantic-import",
        "statusDomain": "semantic-import-integrity-only-not-solver-admission",
        "status": "verified-pass",
        "subject": {
            "schemaVersion": "tf.nacl-water-interface-plan/0.4.10",
            "byteCount": len(raw_plan),
            "rawSha256": digest_bytes(raw_plan),
            "canonicalValueSha256": canonical_value_sha,
        },
        "canonicalization": {
            "profile": "tf.digest-value-no-lf/1",
            "encoding": "utf-8",
            "keyOrder": "utf-16-code-unit-ascending",
            "numberSerialization": "ecmascript-json-stringify-finite-number",
            "trailingNewlineInDigest": False,
            "strictIJson": True,
            "goldenVector": golden_vector,
            "goldenVectorDigest": golden_digest,
        },
        "verifier": {
            "version": IMPORTER_VERSION,
            "implementationLanguage": "python-3",
            "dependencyProfile": "python-standard-library-only",
            "sourceSha256": IMPORTER_SOURCE_SHA256,
        },
        "digests": {
            "expected": dict(LOCKED_DIGESTS),
            "recomputed": recomputed,
            "allMatched": True,
        },
        "semanticAudit": semantic_audit,
        "normalizedArtifacts": normalized,
        "prerequisiteGates": [
            {key: gate[key] for key in ("gateId", "status", "receiptDigest")}
            for gate in PREREQUISITE_GATES
        ],
        "sourceEvidence": {
            "sourceMetadataPinned": True,
            "sourceBytesVerified": False,
            "redistributionCleared": False,
        },
        "execution": {
            "openmmImported": False,
            "systemCompiled": False,
            "contextCreated": False,
            "solverInvoked": False,
            "minimized": False,
            "equilibrated": False,
            "executionEligible": False,
        },
        "claims": {
            "sourceAuthenticityVerified": False,
            "potentialDomainQualified": False,
            "dynamicsExecuted": False,
            "scientificReproduction": False,
            "interfaceSimulated": False,
            "industrialPrediction": False,
            "promotionEligible": False,
            "publicReleaseEligible": False,
        },
    }
    receipt["stableEvidenceDigest"] = digest_value(_stable_evidence_preimage(receipt))
    receipt["receiptDigest"] = digest_value(receipt)
    return receipt


def import_plan(plan_path: Path, output_directory: Path) -> dict[str, object]:
    raw_plan = read_plan_file(plan_path)
    plan = parse_strict_json(raw_plan)
    if len(raw_plan) != EXPECTED_PLAN_BYTES or digest_bytes(raw_plan) != EXPECTED_PLAN_RAW_SHA256:
        raise ImportViolation("plan wire bytes differ from the locked exporter artifact")
    if not isinstance(plan, dict):
        raise ImportViolation("plan root must be an object")
    semantic_audit, recomputed = verify_plan_value(plan)
    artifacts = build_normalized_artifacts(plan)

    output = _normalized_absolute(output_directory, "output directory")
    parent = _canonical_directory(output.parent, "output parent")
    output_name = output.name
    parent_descriptor = os.open(
        parent,
        os.O_RDONLY | getattr(os, "O_DIRECTORY", 0) | getattr(os, "O_NOFOLLOW", 0),
    )
    bundle_descriptor: int | None = None
    arrays_descriptor: int | None = None
    manifests_descriptor: int | None = None
    bundle_identity: tuple[int, int] | None = None
    arrays_identity: tuple[int, int] | None = None
    manifests_identity: tuple[int, int] | None = None
    created_files: list[tuple[int, str, tuple[int, int]]] = []
    try:
        opened_parent = os.fstat(parent_descriptor)
        supplied_parent = parent.lstat()
        parent_identity = (opened_parent.st_dev, opened_parent.st_ino)
        if (
            not stat.S_ISDIR(opened_parent.st_mode)
            or not _same_inode(supplied_parent, parent_identity)
            or parent.resolve(strict=True) != parent
        ):
            raise ImportViolation("output parent identity changed while opening")
        if _entry_metadata(parent_descriptor, output_name) is not None:
            raise ImportViolation("output directory must not already exist")
        os.mkdir(output_name, 0o700, dir_fd=parent_descriptor)
        bundle_descriptor, bundle_identity = _open_owned_directory(
            parent_descriptor, output_name, "output directory"
        )
        os.mkdir("arrays", 0o700, dir_fd=bundle_descriptor)
        arrays_descriptor, arrays_identity = _open_owned_directory(
            bundle_descriptor, "arrays", "array directory"
        )
        os.mkdir("manifests", 0o700, dir_fd=bundle_descriptor)
        manifests_descriptor, manifests_identity = _open_owned_directory(
            bundle_descriptor, "manifests", "manifest directory"
        )
        for descriptor, data in artifacts:
            prefix, name = str(descriptor["path"]).split("/", 1)
            target_descriptor = arrays_descriptor if prefix == "arrays" else manifests_descriptor
            identity = _write_exclusive(target_descriptor, name, data)
            created_files.append((target_descriptor, name, identity))
        descriptors = [descriptor for descriptor, _ in artifacts]
        receipt = build_receipt(plan, raw_plan, semantic_audit, recomputed, descriptors)
        receipt_bytes = canonical_json_bytes(receipt) + b"\n"
        receipt_identity = _write_exclusive(
            bundle_descriptor, "semantic-import-receipt.json", receipt_bytes
        )
        created_files.append((bundle_descriptor, "semantic-import-receipt.json", receipt_identity))
        _assert_closed_output_inventory(
            bundle_descriptor, arrays_descriptor, manifests_descriptor, descriptors
        )
        for descriptor in (arrays_descriptor, manifests_descriptor):
            os.fsync(descriptor)
            os.fchmod(descriptor, 0o555)
        os.fsync(bundle_descriptor)
        os.fchmod(bundle_descriptor, 0o555)
        os.fsync(parent_descriptor)
        current_parent = parent.lstat()
        current_bundle = _entry_metadata(parent_descriptor, output_name)
        current_arrays = _entry_metadata(bundle_descriptor, "arrays")
        current_manifests = _entry_metadata(bundle_descriptor, "manifests")
        if (
            not _same_inode(current_parent, parent_identity)
            or parent.resolve(strict=True) != parent
            or current_bundle is None
            or not _same_inode(current_bundle, bundle_identity)
            or current_arrays is None
            or not _same_inode(current_arrays, arrays_identity)
            or current_manifests is None
            or not _same_inode(current_manifests, manifests_identity)
        ):
            raise ImportViolation("normalized output path identity changed before publication")
        _assert_closed_output_inventory(
            bundle_descriptor, arrays_descriptor, manifests_descriptor, descriptors
        )
        return receipt
    except Exception:
        for descriptor in (bundle_descriptor, arrays_descriptor, manifests_descriptor):
            if descriptor is not None:
                try:
                    os.fchmod(descriptor, 0o700)
                except OSError:
                    pass
        for directory_descriptor, name, identity in reversed(created_files):
            _safe_unlink_owned(directory_descriptor, name, identity)
        if bundle_descriptor is not None:
            _safe_remove_owned_directory(bundle_descriptor, "manifests", manifests_identity)
            _safe_remove_owned_directory(bundle_descriptor, "arrays", arrays_identity)
        _safe_remove_owned_directory(parent_descriptor, output_name, bundle_identity)
        raise
    finally:
        for descriptor in (manifests_descriptor, arrays_descriptor, bundle_descriptor):
            if descriptor is not None:
                try:
                    os.close(descriptor)
                except OSError:
                    pass
        try:
            os.close(parent_descriptor)
        except OSError:
            pass


def _arguments(argv: Sequence[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Verify and normalize the locked v0.4.10 NaCl-water plan without a solver"
    )
    parser.add_argument("--plan", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    try:
        arguments = _arguments(sys.argv[1:] if argv is None else argv)
        receipt = import_plan(arguments.plan, arguments.output)
        summary = {
            "schemaVersion": RECEIPT_SCHEMA_VERSION,
            "status": receipt["status"],
            "receiptDigest": receipt["receiptDigest"],
            "semanticRoot": receipt["normalizedArtifacts"]["semanticRoot"],
            "solverInvoked": False,
            "publicReleaseEligible": False,
        }
        sys.stdout.buffer.write(canonical_json_bytes(summary) + b"\n")
        return 0
    except (ImportViolation, OSError) as error:
        sys.stderr.write(f"{error}\n")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
