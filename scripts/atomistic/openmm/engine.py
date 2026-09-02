"""OpenMM-backed execution primitives for the locked 895-water control.

Importing this module does not import or execute OpenMM.  The dependency is
loaded only by ``load_openmm()`` inside the locked runtime worker.
"""

from __future__ import annotations

import importlib
import importlib.metadata
import math
import os
import platform
import re
import sys
from pathlib import Path
from typing import Mapping, Sequence

from binary_codec import decode_f64le, encode_f64le
from contract import (
    CELL_NANOMETER,
    COMPONENT_COUNT,
    CONSTRAINT_COUNT,
    CONSTRAINT_TOLERANCE,
    MINIMIZATION_MAX_ITERATIONS,
    MINIMIZATION_TOLERANCE_KJ_MOL_NM,
    NONBONDED_CUTOFF_NANOMETER,
    OPENMM_VERSION,
    OPENMM_FULL_VERSION,
    OPENMM_RELEASE_FLAG,
    OPENMM_SOURCE_COMMIT,
    PARTICLE_COUNT,
    PME_ALPHA_INVERSE_NANOMETER,
    PME_GRID,
    TEMPERATURE_KELVIN,
    TIME_STEP_PICOSECONDS,
    VELOCITY_SEED,
    WATER_COUNT,
    ContractViolation,
    digest_bytes,
    digest_value,
    read_regular_file,
)


PME_WARMUP_OPERATION = "getState-getEnergy-true-after-setPositions"


def load_openmm() -> tuple[object, object, object]:
    """Load the exact runtime packages and reject a version substitution."""

    mm = importlib.import_module("openmm")
    app = importlib.import_module("openmm.app")
    unit = importlib.import_module("openmm.unit")
    version = getattr(mm, "__version__", None)
    if version != OPENMM_VERSION:
        raise ContractViolation(f"OpenMM version {version!r} is not the locked {OPENMM_VERSION}")
    version_module = importlib.import_module("openmm.version")
    observed_source = (
        str(version_module.full_version),
        str(version_module.git_revision),
        bool(version_module.release),
    )
    expected_source = (OPENMM_FULL_VERSION, OPENMM_SOURCE_COMMIT, OPENMM_RELEASE_FLAG)
    if observed_source != expected_source:
        raise ContractViolation(
            f"OpenMM source identity {observed_source!r} is not the locked {expected_source!r}"
        )
    numpy_version = importlib.metadata.version("numpy")
    if numpy_version != "2.2.6":
        raise ContractViolation(f"NumPy version {numpy_version!r} is not the locked 2.2.6")
    return mm, app, unit


def vectors_to_plain(quantity: object, target_unit: object) -> list[list[float]]:
    value = quantity.value_in_unit(target_unit) if hasattr(quantity, "value_in_unit") else quantity
    result: list[list[float]] = []
    for vector in value:
        row = [float(vector[0]), float(vector[1]), float(vector[2])]
        if any(not math.isfinite(component) for component in row):
            raise ContractViolation("OpenMM returned a non-finite vector component")
        result.append(row)
    return result


def scalar_to_float(quantity: object, target_unit: object) -> float:
    value = quantity.value_in_unit(target_unit) if hasattr(quantity, "value_in_unit") else quantity
    result = float(value)
    if not math.isfinite(result):
        raise ContractViolation("OpenMM returned a non-finite scalar")
    return 0.0 if result == 0.0 else result


def flatten_vectors(values: Sequence[Sequence[float]]) -> list[float]:
    if len(values) != PARTICLE_COUNT:
        raise ContractViolation("particle-vector array does not contain 2,685 particles")
    flattened: list[float] = []
    for row in values:
        if len(row) != 3:
            raise ContractViolation("particle-vector row is not xyz")
        flattened.extend(float(value) for value in row)
    if len(flattened) != COMPONENT_COUNT or any(not math.isfinite(value) for value in flattened):
        raise ContractViolation("particle-vector array is incomplete or non-finite")
    return flattened


def reshape_particle_vectors(flattened: Sequence[float]) -> list[list[float]]:
    if len(flattened) != COMPONENT_COUNT:
        raise ContractViolation("flat particle-vector component count changed")
    return [list(map(float, flattened[index : index + 3])) for index in range(0, len(flattened), 3)]


def minimum_image_component(delta: float, length: float) -> float:
    return delta - length * math.floor(delta / length + 0.5)


def maximum_constraint_relative_residual(
    positions: Sequence[Sequence[float]],
    constraints: Sequence[tuple[int, int, float]],
    cell: Sequence[Sequence[float]] = CELL_NANOMETER,
) -> float:
    if len(cell) != 3 or any(len(row) != 3 for row in cell):
        raise ContractViolation("constraint residual requires one 3x3 cell")
    if any(cell[i][j] != (3.0 if i == j else 0.0) for i in range(3) for j in range(3)):
        raise ContractViolation("v0.4.5 residual helper is locked to the orthorhombic 3 nm cell")
    maximum = 0.0
    for first, second, target in constraints:
        if not (0 <= first < len(positions) and 0 <= second < len(positions) and target > 0):
            raise ContractViolation("constraint tuple is outside the particle/target domain")
        delta = [
            minimum_image_component(positions[second][axis] - positions[first][axis], 3.0)
            for axis in range(3)
        ]
        distance = math.sqrt(sum(value * value for value in delta))
        maximum = max(maximum, abs(distance - target) / target)
    return maximum


def remove_mass_weighted_center_of_mass_velocity(
    velocities: Sequence[Sequence[float]], masses: Sequence[float]
) -> tuple[list[list[float]], tuple[float, float, float]]:
    if len(velocities) != PARTICLE_COUNT or len(masses) != PARTICLE_COUNT:
        raise ContractViolation("COM removal requires the complete particle domain")
    total_mass = sum(float(value) for value in masses)
    if not math.isfinite(total_mass) or total_mass <= 0:
        raise ContractViolation("COM removal received invalid particle masses")
    center = tuple(
        sum(float(masses[index]) * float(velocities[index][axis]) for index in range(PARTICLE_COUNT))
        / total_mass
        for axis in range(3)
    )
    corrected = [
        [float(row[axis]) - center[axis] for axis in range(3)]
        for row in velocities
    ]
    if any(len(row) != 3 or any(not math.isfinite(value) for value in row) for row in corrected):
        raise ContractViolation("COM removal produced an invalid velocity")
    return corrected, center


def center_of_mass_velocity(
    velocities: Sequence[Sequence[float]], masses: Sequence[float]
) -> tuple[float, float, float]:
    _, removed = remove_mass_weighted_center_of_mass_velocity(velocities, masses)
    return removed


def mass_weighted_momentum_relative_residual(
    velocities: Sequence[Sequence[float]], masses: Sequence[float]
) -> float:
    """Return ``||sum(m*v)|| / sum(||m*v||)`` for the full particle domain.

    This is dimensionless and is deliberately distinct from center-of-mass
    speed, which has units of nm/ps.  A completely stationary system has zero
    residual by definition.
    """

    if len(velocities) != PARTICLE_COUNT or len(masses) != PARTICLE_COUNT:
        raise ContractViolation("momentum residual requires the complete particle domain")
    momentum_components = [0.0, 0.0, 0.0]
    momentum_magnitudes: list[float] = []
    for index, row in enumerate(velocities):
        mass = float(masses[index])
        if len(row) != 3 or not math.isfinite(mass) or mass <= 0:
            raise ContractViolation("momentum residual received invalid masses or velocities")
        components = [mass * float(row[axis]) for axis in range(3)]
        if any(not math.isfinite(value) for value in components):
            raise ContractViolation("momentum residual received invalid masses or velocities")
        for axis in range(3):
            momentum_components[axis] += components[axis]
        momentum_magnitudes.append(math.sqrt(sum(value * value for value in components)))
    numerator = math.sqrt(sum(value * value for value in momentum_components))
    denominator = math.fsum(momentum_magnitudes)
    if not math.isfinite(numerator) or not math.isfinite(denominator):
        raise ContractViolation("momentum residual is non-finite")
    return 0.0 if denominator == 0.0 else numerator / denominator


def validate_compiled_force_inventory(
    force_counts: Mapping[str, int], total_force_count: int
) -> None:
    """Reject omitted, duplicated, or silently added compiled force objects."""

    expected = {
        "HarmonicAngleForce": 1,
        "HarmonicBondForce": 1,
        "NonbondedForce": 1,
    }
    normalized = {str(name): int(count) for name, count in force_counts.items()}
    if total_force_count != 3 or normalized != expected:
        raise ContractViolation(
            f"compiled System force inventory changed: total={total_force_count}, classes={normalized}"
        )


def maximum_velocity_constraint_rate(
    positions: Sequence[Sequence[float]],
    velocities: Sequence[Sequence[float]],
    constraints: Sequence[tuple[int, int, float]],
) -> float:
    maximum = 0.0
    for first, second, _target in constraints:
        delta = [
            minimum_image_component(positions[second][axis] - positions[first][axis], 3.0)
            for axis in range(3)
        ]
        distance = math.sqrt(sum(value * value for value in delta))
        if distance <= 0:
            raise ContractViolation("velocity constraint rate found a zero constrained distance")
        relative_velocity = [velocities[second][axis] - velocities[first][axis] for axis in range(3)]
        relative_speed = math.sqrt(sum(value * value for value in relative_velocity))
        numerator = abs(sum(delta[axis] * relative_velocity[axis] for axis in range(3)))
        relative_residual = numerator / max(distance * relative_speed, 1e-12)
        maximum = max(maximum, relative_residual)
    return maximum


def _plain_box_vectors(box_vectors: object, unit: object) -> list[list[float]]:
    return vectors_to_plain(box_vectors, unit.nanometer)


def _assert_locked_cell(cell: Sequence[Sequence[float]]) -> None:
    if len(cell) != 3 or any(len(row) != 3 for row in cell):
        raise ContractViolation("OpenMM topology does not expose a 3x3 periodic cell")
    maximum = max(abs(cell[i][j] - CELL_NANOMETER[i][j]) for i in range(3) for j in range(3))
    if maximum > 1e-12:
        raise ContractViolation(f"OpenMM periodic cell differs from the locked 3 nm cube ({maximum})")


def compile_system(input_root: Path) -> dict[str, object]:
    """Compile and validate the exact PDB/XML system without a Context."""

    mm, app, unit = load_openmm()
    pdb = app.PDBFile(str(input_root / "tip3p.pdb"))
    atoms = list(pdb.topology.atoms())
    residues = list(pdb.topology.residues())
    bonds = list(pdb.topology.bonds())
    if len(atoms) != PARTICLE_COUNT or len(residues) != WATER_COUNT or len(bonds) != 2 * WATER_COUNT:
        raise ContractViolation("PDB topology counts differ from the locked 895-water system")
    for residue_index, residue in enumerate(residues):
        residue_atoms = list(residue.atoms())
        if residue.name != "HOH" or [atom.name for atom in residue_atoms] != ["O", "H1", "H2"]:
            raise ContractViolation(f"water residue {residue_index} changed identity or atom order")
    topology_cell = _plain_box_vectors(pdb.topology.getPeriodicBoxVectors(), unit)
    _assert_locked_cell(topology_cell)

    forcefield = app.ForceField(str(input_root / "tip3p.xml"))
    system = forcefield.createSystem(
        pdb.topology,
        nonbondedMethod=app.PME,
        nonbondedCutoff=NONBONDED_CUTOFF_NANOMETER * unit.nanometer,
        constraints=app.HBonds,
        rigidWater=True,
        flexibleConstraints=False,
        removeCMMotion=False,
    )
    if system.getNumParticles() != PARTICLE_COUNT or system.getNumConstraints() != CONSTRAINT_COUNT:
        raise ContractViolation("compiled System particle or rigid-constraint count changed")

    allowed_force_names = {"HarmonicBondForce", "HarmonicAngleForce", "NonbondedForce"}
    force_counts: dict[str, int] = {}
    harmonic_bond_terms = 0
    harmonic_angle_terms = 0
    nonbonded = None
    for force in system.getForces():
        name = force.__class__.__name__
        force_counts[name] = force_counts.get(name, 0) + 1
        if name not in allowed_force_names:
            raise ContractViolation(f"unexpected compiled force class: {name}")
        if name == "HarmonicBondForce":
            force.setForceGroup(0)
            harmonic_bond_terms = int(force.getNumBonds())
        elif name == "HarmonicAngleForce":
            force.setForceGroup(1)
            harmonic_angle_terms = int(force.getNumAngles())
        elif name == "NonbondedForce":
            force.setForceGroup(2)
            force.setReciprocalSpaceForceGroup(3)
            force.setUseDispersionCorrection(True)
            force.setUseSwitchingFunction(False)
            force.setExceptionsUsePeriodicBoundaryConditions(False)
            force.setPMEParameters(PME_ALPHA_INVERSE_NANOMETER / unit.nanometer, *PME_GRID)
            nonbonded = force
    validate_compiled_force_inventory(force_counts, int(system.getNumForces()))
    if nonbonded is None:
        raise ContractViolation("compiled System does not contain exactly one NonbondedForce")
    if getattr(nonbonded, "getNonbondedMethod")() != nonbonded.PME:
        raise ContractViolation("compiled NonbondedForce is not PME")
    if harmonic_bond_terms != 0 or harmonic_angle_terms != 0:
        raise ContractViolation("rigid TIP3P unexpectedly retained harmonic bond or angle terms")
    if int(nonbonded.getNumExceptions()) != CONSTRAINT_COUNT:
        raise ContractViolation("compiled NonbondedForce exception count changed")

    masses = [scalar_to_float(system.getParticleMass(index), unit.dalton) for index in range(PARTICLE_COUNT)]
    constraints: list[tuple[int, int, float]] = []
    for index in range(system.getNumConstraints()):
        first, second, distance = system.getConstraintParameters(index)
        constraints.append((int(first), int(second), scalar_to_float(distance, unit.nanometer)))
    positions = vectors_to_plain(pdb.positions, unit.nanometer)
    if len(positions) != PARTICLE_COUNT:
        raise ContractViolation("PDB position count differs from the particle count")
    topology_payload = {
        "atoms": [
            {
                "index": atom.index,
                "name": atom.name,
                "element": atom.element.symbol if atom.element is not None else None,
                "residueIndex": atom.residue.index,
                "residueName": atom.residue.name,
            }
            for atom in atoms
        ],
        "bonds": sorted((min(first.index, second.index), max(first.index, second.index)) for first, second in bonds),
        "cellNanometer": topology_cell,
    }
    serialized_system = mm.XmlSerializer.serialize(system).encode("utf-8")
    return {
        "mm": mm,
        "app": app,
        "unit": unit,
        "pdb": pdb,
        "system": system,
        "nonbonded": nonbonded,
        "masses": masses,
        "constraints": constraints,
        "initialPositions": positions,
        "cell": topology_cell,
        "atomOrderDigest": digest_value(topology_payload["atoms"]),
        "compiledTopologyDigest": digest_value(topology_payload),
        "serializedSystemDigest": digest_bytes(serialized_system),
        "forceClassCounts": dict(sorted(force_counts.items())),
        "topologyInventory": {
            "waterMoleculeCount": WATER_COUNT,
            "particleCount": PARTICLE_COUNT,
            "topologyBondCount": 2 * WATER_COUNT,
            "constraintCount": CONSTRAINT_COUNT,
            "exceptionCount": int(nonbonded.getNumExceptions()),
            "harmonicBondTermCount": harmonic_bond_terms,
            "harmonicAngleTermCount": harmonic_angle_terms,
            "totalForceCount": int(system.getNumForces()),
            "nonbondedForceCount": force_counts.get("NonbondedForce", 0),
            "centerOfMassRemoverCount": force_counts.get("CMMotionRemover", 0),
        },
    }


def create_context(compiled: dict[str, object], platform_name: str) -> dict[str, object]:
    if platform_name not in ("Reference", "CPU"):
        raise ContractViolation("OpenMM platform must be Reference or CPU")
    mm = compiled["mm"]
    unit = compiled["unit"]
    integrator = mm.VerletIntegrator(TIME_STEP_PICOSECONDS * unit.picoseconds)
    integrator.setConstraintTolerance(CONSTRAINT_TOLERANCE)
    integrator.setIntegrationForceGroups(15)
    requested_platform = mm.Platform.getPlatformByName(platform_name)
    properties = {"Threads": "1"} if platform_name == "CPU" else {}
    context = mm.Context(compiled["system"], integrator, requested_platform, properties)
    actual_platform = context.getPlatform()
    if actual_platform.getName() != platform_name:
        raise ContractViolation("OpenMM silently substituted the requested platform")
    property_values = {
        str(name): str(actual_platform.getPropertyValue(context, name))
        for name in sorted(actual_platform.getPropertyNames())
    }
    if platform_name == "CPU" and property_values.get("Threads") != "1":
        raise ContractViolation("CPU Context did not retain the locked single-thread property")
    return {
        "integrator": integrator,
        "context": context,
        "platform": actual_platform,
        "platformProperties": property_values,
    }


def _context_cell(context: object, unit: object) -> list[list[float]]:
    cell = _plain_box_vectors(context.getState().getPeriodicBoxVectors(), unit)
    _assert_locked_cell(cell)
    return cell


def warmup_and_pme_readback(compiled: dict[str, object], lane: dict[str, object]) -> dict[str, object]:
    """Evaluate energy after setPositions, then read actual PME parameters."""

    context = lane["context"]
    unit = compiled["unit"]
    warmup_state = context.getState(getEnergy=True, enforcePeriodicBox=False)
    warmup_energy = scalar_to_float(warmup_state.getPotentialEnergy(), unit.kilojoule_per_mole)
    alpha, nx, ny, nz = compiled["nonbonded"].getPMEParametersInContext(context)
    alpha_value = scalar_to_float(alpha, 1 / unit.nanometer)
    return {
        "warmupOperation": PME_WARMUP_OPERATION,
        "warmupPotentialEnergyKjMol": warmup_energy,
        "actualPmeContextParameters": {
            "alphaInverseNanometer": alpha_value,
            "grid": [int(nx), int(ny), int(nz)],
            "readbackSource": "OpenMM-NonbondedForce-getPMEParametersInContext",
        },
        "cellNanometer": _context_cell(context, unit),
        "platformProperties": lane["platformProperties"],
    }


def set_positions(context: object, mm: object, unit: object, positions: Sequence[Sequence[float]]) -> None:
    if len(positions) != PARTICLE_COUNT or any(len(row) != 3 for row in positions):
        raise ContractViolation("cannot set an incomplete position array")
    vectors = [mm.Vec3(*map(float, row)) for row in positions]
    context.setPositions(vectors * unit.nanometer)


def set_velocities(context: object, mm: object, unit: object, velocities: Sequence[Sequence[float]]) -> None:
    if len(velocities) != PARTICLE_COUNT or any(len(row) != 3 for row in velocities):
        raise ContractViolation("cannot set an incomplete velocity array")
    vectors = [mm.Vec3(*map(float, row)) for row in velocities]
    context.setVelocities(vectors * unit.nanometer / unit.picosecond)


def state_payload(context: object, unit: object) -> dict[str, object]:
    """Return raw Verlet state plus OpenMM's time-aligned State energies.

    Step 0 exposes the explicitly prepared velocity; after integration,
    ``State.getVelocities()`` exposes the Verlet integrator's raw half-step
    velocity.  Neither may be used to reinterpret ``State.getKineticEnergy()``.
    The pinned Reference kernel computes that energy with
    ``computeShiftedKineticEnergy``: it shifts by +dt/2 and applies velocity
    constraints before evaluating the kinetic energy at the position time.
    """
    state = context.getState(
        getPositions=True,
        getVelocities=True,
        getForces=True,
        getEnergy=True,
        enforcePeriodicBox=False,
    )
    potential = scalar_to_float(state.getPotentialEnergy(), unit.kilojoule_per_mole)
    kinetic = scalar_to_float(state.getKineticEnergy(), unit.kilojoule_per_mole)
    return {
        "positions": vectors_to_plain(state.getPositions(), unit.nanometer),
        "velocities": vectors_to_plain(state.getVelocities(), unit.nanometer / unit.picosecond),
        "forces": vectors_to_plain(
            state.getForces(), unit.kilojoule_per_mole / unit.nanometer
        ),
        "energies": [potential, kinetic, potential + kinetic],
        "timePicoseconds": scalar_to_float(state.getTime(), unit.picoseconds),
        "cell": _plain_box_vectors(state.getPeriodicBoxVectors(), unit),
    }


def group_payload(context: object, unit: object) -> tuple[list[float], list[list[list[float]]]]:
    energies: list[float] = []
    forces: list[list[list[float]]] = []
    for slot in (None, 0, 1, 2, 3):
        groups = -1 if slot is None else (1 << slot)
        state = context.getState(getEnergy=True, getForces=True, groups=groups)
        energies.append(scalar_to_float(state.getPotentialEnergy(), unit.kilojoule_per_mole))
        forces.append(
            vectors_to_plain(state.getForces(), unit.kilojoule_per_mole / unit.nanometer)
        )
    return energies, forces


def runtime_inventory() -> dict[str, object]:
    if (
        not bool(getattr(sys.flags, "safe_path", False))
        or not bool(sys.flags.no_user_site)
        or not bool(sys.flags.dont_write_bytecode)
        or bool(sys.flags.ignore_environment)
    ):
        raise ContractViolation("fresh worker Python isolation flags differ from the locked runtime")
    mm, _app, _unit = load_openmm()
    cpuinfo = _read_proc_text(Path("/proc/cpuinfo"), 4 * 1024 * 1024)
    cpu_records = _parse_cpuinfo(cpuinfo)
    platforms = []
    for index in range(mm.Platform.getNumPlatforms()):
        candidate = mm.Platform.getPlatform(index)
        platforms.append(
            {
                "index": index,
                "name": candidate.getName(),
                "speed": float(candidate.getSpeed()),
                "propertyNames": sorted(str(name) for name in candidate.getPropertyNames()),
            }
        )
    required_names = {"Reference", "CPU"}
    if not required_names.issubset({str(record["name"]) for record in platforms}):
        raise ContractViolation("OpenMM runtime lacks the Reference or CPU platform")
    # Enumerating platforms loads their registered plugins.  Snapshot maps only
    # afterwards so the inventory cannot omit a lazily loaded CPU plugin.
    maps = _read_proc_text(Path("/proc/self/maps"), 32 * 1024 * 1024)
    loaded_libraries = sorted(
        {
            match.group(1)
            for line in maps.splitlines()
            if (match := re.search(r"\s(/[^\s]+\.so(?:\.[^\s/]+)*)$", line)) is not None
        }
    )
    version_module = importlib.import_module("openmm.version")
    inventory = {
        "schemaVersion": "tf.openmm-runtime-inventory/0.4.5",
        "scope": "cpu-model-flags-microcode-kernel-glibc-loaded-libraries-openmm-plugins-platform-properties",
        "python": {
            "version": platform.python_version(),
            "implementation": platform.python_implementation(),
            "executable": sys.executable,
            "flags": {
                "safePath": bool(getattr(sys.flags, "safe_path", False)),
                "noUserSite": bool(sys.flags.no_user_site),
                "dontWriteBytecode": bool(sys.flags.dont_write_bytecode),
                "ignoreEnvironment": bool(sys.flags.ignore_environment),
            },
        },
        "host": {
            "system": platform.system(),
            "machine": platform.machine(),
            "kernelRelease": platform.release(),
            "kernelVersion": platform.version(),
            "glibc": list(platform.libc_ver()),
            "cpu": cpu_records,
        },
        "packages": {"openmm": mm.__version__, "numpy": importlib.metadata.version("numpy")},
        "openmm": {
            "defaultPluginsDirectory": str(mm.Platform.getDefaultPluginsDirectory()),
            "pluginLoadFailures": list(mm.Platform.getPluginLoadFailures()),
            "platforms": platforms,
        },
        "loadedLibraries": loaded_libraries,
        "containerIndexDigest": "sha256:519591d6871b7bc437060736b9f7456b8731f1499a57e22e6c285135ae657bf7",
        "containerPlatformDigest": "sha256:c00fc7b44d844b6da22861ec24af43968a5200eac4ec607b4725d585165d6b49",
        "pythonVersion": platform.python_version(),
        "numpyVersion": importlib.metadata.version("numpy"),
        "openmmDistributionVersion": importlib.metadata.version("openmm"),
        "openmmFullVersion": str(version_module.full_version),
        "openmmGitRevision": str(version_module.git_revision),
        "openmmReleaseFlag": bool(version_module.release),
        "pluginLoadFailures": list(mm.Platform.getPluginLoadFailures()),
    }
    inventory["inventoryDigest"] = digest_value(inventory)
    return inventory


def _read_proc_text(path: Path, maximum: int) -> str:
    if not path.exists():
        return ""
    descriptor = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
    chunks: list[bytes] = []
    consumed = 0
    with os.fdopen(descriptor, "rb") as handle:
        while True:
            chunk = handle.read(min(1024 * 1024, maximum - consumed + 1))
            if not chunk:
                break
            consumed += len(chunk)
            if consumed > maximum:
                raise ContractViolation(f"{path}: proc inventory input exceeds its bound")
            chunks.append(chunk)
    return b"".join(chunks).decode("utf-8", errors="strict")


def _parse_cpuinfo(text: str) -> dict[str, object]:
    records: dict[str, list[str]] = {}
    for line in text.splitlines():
        if ":" not in line:
            continue
        key, value = (part.strip() for part in line.split(":", 1))
        if key in ("model name", "flags", "microcode", "vendor_id"):
            records.setdefault(key, []).append(value)
    return {
        "modelNames": sorted(set(records.get("model name", []))),
        "vendorIds": sorted(set(records.get("vendor_id", []))),
        "microcodes": sorted(set(records.get("microcode", []))),
        "flagSets": sorted(set(records.get("flags", []))),
    }


def read_particle_array(path: Path, *, unit_label: str) -> list[list[float]]:
    data = read_regular_file(path, maximum_bytes=COMPONENT_COUNT * 8)
    if len(data) != COMPONENT_COUNT * 8:
        raise ContractViolation(f"{unit_label} array byte length changed")
    return reshape_particle_vectors(decode_f64le(data))


def array_bytes_digest(values: Sequence[Sequence[float]]) -> str:
    return digest_bytes(encode_f64le(values))
