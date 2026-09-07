#!/usr/bin/env python3
"""FiPy worker for the frozen R18a semantic/runtime preflight.

The worker is intentionally standalone and imports no R17 implementation.
It must be launched by the R18a supervisor from the locked private runtime.
"""

from __future__ import annotations

import ctypes
import hashlib
import importlib.metadata
import json
import math
import os
from pathlib import Path, PurePosixPath
import platform
import re
import struct
import sys
import unicodedata
import warnings


LOCK_DIGEST_HEX = "cd7f8e8a47d67596c025a8035890e99f5a367be562289e84ae4f6d87e79c08ee"
NX = 8
NY = 4
DX = 0.125
DY = 0.125
DT = 0.01
STEP_COUNT = 2
FINAL_TIME = 0.02
KAPPA = 1.0 / 2500.0
A1 = 3.0 / 400.0
A2 = 3.0 / 100.0
B1 = 8.0 * math.pi
B2 = 22.0 * math.pi
C2 = math.pi / 16.0
TRACKS = ("official-literal", "exact-trace-companion")
REGISTERED_SYNTHETIC_MODULES = {
    "_cython_3_2_9",
    "_cython_3_3_0",
    "cython_runtime",
    "pyexpat.errors",
    "pyexpat.model",
    "typing.io",
    "typing.re",
    "xml.parsers.expat.errors",
    "xml.parsers.expat.model",
}
REQUIRED_ENVIRONMENT = {
    "LANG": "C",
    "LC_ALL": "C",
    "TZ": "UTC",
    "FIPY_SOLVERS": "scipy",
    "OMP_NUM_THREADS": "1",
    "OPENBLAS_NUM_THREADS": "1",
    "MKL_NUM_THREADS": "1",
    "VECLIB_MAXIMUM_THREADS": "1",
    "NUMEXPR_NUM_THREADS": "1",
}
WARNING_MESSAGE = (
    "numpy.core is deprecated and has been renamed to numpy._core. The numpy._core namespace "
    "contains private NumPy internals and its use is discouraged, as NumPy internals can change "
    "without warning in any release. In practice, most real-world usage of numpy.core is to access "
    "functionality in the public NumPy API. If that is the case, use the public NumPy API. If not, "
    "you are using NumPy internals. If you would still like to access an internal attribute, use "
    "numpy._core.umath."
)


class PreflightFailure(RuntimeError):
    def __init__(self, code: str, detail: str):
        super().__init__(detail)
        self.code = code
        self.detail = detail


def require(condition: bool, code: str, detail: str) -> None:
    if not condition:
        raise PreflightFailure(code, detail)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        while chunk := stream.read(1024 * 1024):
            digest.update(chunk)
    return "sha256:" + digest.hexdigest()


def canonical_digest(value: object) -> str:
    payload = json.dumps(
        value, ensure_ascii=True, allow_nan=False, separators=(",", ":"), sort_keys=True
    ).encode("utf-8")
    return "sha256:" + hashlib.sha256(payload).hexdigest()


def float64_digest(values: object) -> str:
    import numpy as np

    flat = np.asarray(values, dtype=np.float64).reshape(-1)
    payload = b"".join(struct.pack("<d", float(value)) for value in flat)
    return "sha256:" + hashlib.sha256(payload).hexdigest()


def import_fipy_with_exact_warning_policy() -> tuple[object, object, object, object, list[dict[str, object]]]:
    captured: list[dict[str, object]] = []
    original_showwarning = warnings.showwarning
    expected_warning_origin = (
        Path(sys.prefix).resolve(strict=True)
        / "lib/python3.12/site-packages/fipy/tools/numerix.py"
    )

    def record_warning(message, category, filename, lineno, file=None, line=None):
        observed_origin = Path(filename).resolve(strict=True)
        require(
            observed_origin == expected_warning_origin,
            "WARNING_ALLOWLIST_ORIGIN",
            "allowlisted warning originated outside the locked FiPy numerix module",
        )
        captured.append(
            {
                "category": category.__name__,
                "message": str(message),
                "origin": "$RUNTIME/lib/python3.12/site-packages/fipy/tools/numerix.py",
                "line": int(lineno),
            }
        )

    warnings.filterwarnings("error")
    warnings.filterwarnings(
        "always",
        message=r"\A" + re.escape(WARNING_MESSAGE) + r"\Z",
        category=DeprecationWarning,
        module=r"\Afipy\.tools\.numerix\Z",
    )
    warnings.showwarning = record_warning
    try:
        import fipy
        import numpy as np
        import packaging
        import scipy
    finally:
        warnings.showwarning = original_showwarning

    require(len(captured) == 2, "WARNING_ALLOWLIST_COUNT", f"expected 2 registered import warnings, observed {len(captured)}")
    require(
        all(
            record["category"] == "DeprecationWarning"
            and record["message"] == WARNING_MESSAGE
            and record["line"] == 61
            for record in captured
        ),
        "WARNING_ALLOWLIST_MISMATCH",
        "captured import warning did not exactly match the frozen allowlist",
    )
    warnings.filterwarnings("error")
    warnings.filterwarnings(
        "ignore",
        message=r"\A" + re.escape(WARNING_MESSAGE) + r"\Z",
        category=DeprecationWarning,
        module=r"\Afipy\.tools\.numerix\Z",
    )
    return fipy, np, scipy, packaging, captured


def alpha(np, x, time_value: float):
    return 0.25 + A1 * time_value * np.sin(B1 * x) + A2 * np.sin(B2 * x + C2 * time_value)


def manufactured_field(np, x, y, time_value: float):
    z = (y - alpha(np, x, time_value)) / math.sqrt(2.0 * KAPPA)
    return 0.5 * (1.0 - np.tanh(z))


def manufactured_source(np, x, y, time_value: float):
    phase1 = B1 * x
    phase2 = B2 * x + C2 * time_value
    alpha_x = A1 * time_value * B1 * np.cos(phase1) + A2 * B2 * np.cos(phase2)
    alpha_xx = -A1 * time_value * B1 * B1 * np.sin(phase1) - A2 * B2 * B2 * np.sin(phase2)
    alpha_t = A1 * np.sin(phase1) + A2 * C2 * np.cos(phase2)
    z = (y - alpha(np, x, time_value)) / math.sqrt(2.0 * KAPPA)
    sech_squared = 1.0 / np.cosh(z) ** 2
    return sech_squared / (4.0 * math.sqrt(KAPPA)) * (
        -2.0 * math.sqrt(KAPPA) * np.tanh(z) * alpha_x * alpha_x
        + math.sqrt(2.0) * (alpha_t - KAPPA * alpha_xx)
    )


def boundary_values(np, track: str, face_x, time_value: float):
    if track == "official-literal":
        return np.ones(NX, dtype=np.float64), np.zeros(NX, dtype=np.float64)
    if track == "exact-trace-companion":
        return (
            manufactured_field(np, face_x, np.zeros(NX), time_value),
            manufactured_field(np, face_x, np.full(NX, 0.5), time_value),
        )
    raise PreflightFailure("TRACK_ID", f"unregistered track: {track}")


def finite_summary(np, values) -> dict[str, float]:
    array = np.asarray(values, dtype=np.float64)
    require(bool(np.all(np.isfinite(array))), "NONFINITE", "non-finite numerical value")
    return {"minimum": float(np.min(array)), "maximum": float(np.max(array))}


def verify_mesh(np, mesh) -> dict[str, object]:
    x_cell = np.asarray(mesh.cellCenters[0], dtype=np.float64)
    y_cell = np.asarray(mesh.cellCenters[1], dtype=np.float64)
    pairs = {(float(x), float(y)) for x, y in zip(x_cell, y_cell, strict=True)}
    expected_x = {(i + 0.5) * DX for i in range(NX)}
    expected_y = {(j + 0.5) * DY for j in range(NY)}
    require(mesh.numberOfCells == NX * NY and len(pairs) == NX * NY, "TOPOLOGY_CELL_COUNT", "cell centres are not unique")
    require(set(map(float, x_cell)) == expected_x and set(map(float, y_cell)) == expected_y, "TOPOLOGY_CENTRES", "unexpected cell centres")
    exterior = np.asarray(mesh.exteriorFaces, dtype=bool)
    left_ids = np.flatnonzero(np.asarray(mesh.facesLeft, dtype=bool))
    right_ids = np.flatnonzero(np.asarray(mesh.facesRight, dtype=bool))
    cell_face_ids = np.asarray(mesh.cellFaceIDs, dtype=np.int64)
    require(int(np.count_nonzero(exterior)) == 2 * NX + NY, "TOPOLOGY_EXTERIOR", "FiPy periodic mesh has unexpected exterior-face representation")
    require(len(left_ids) == NY and len(right_ids) == NY, "TOPOLOGY_PERIODIC", "FiPy periodic face counts differ from the registered representation")
    for row in range(NY):
        paired_face = int(left_ids[row])
        require(
            paired_face in cell_face_ids[:, row * NX] and paired_face in cell_face_ids[:, row * NX + NX - 1],
            "TOPOLOGY_PERIODIC",
            "periodic face does not connect the leftmost and rightmost cells",
        )
        require(int(right_ids[row]) not in cell_face_ids, "TOPOLOGY_PERIODIC", "redundant right face unexpectedly participates in a cell")
    return {
        "Nx": NX,
        "Ny": NY,
        "cellCount": int(mesh.numberOfCells),
        "uniqueCellCentreCount": len(pairs),
        "dx": DX,
        "dy": DY,
        "xPeriodic": True,
        "duplicatePeriodicEndpoint": False,
        "exteriorFaceCount": int(np.count_nonzero(exterior)),
        "pairedPeriodicFaceIds": left_ids.tolist(),
        "redundantRightFaceIds": right_ids.tolist(),
        "pairedPeriodicFacesConnectOppositeCells": True,
        "redundantRightFacesAbsentFromCellFaceIds": True,
    }


def run_track(fipy, np, track: str) -> dict[str, object]:
    mesh = fipy.PeriodicGrid2DLeftRight(dx=DX, dy=DY, nx=NX, ny=NY)
    mesh_record = verify_mesh(np, mesh)
    x_cell = np.asarray(mesh.cellCenters[0], dtype=np.float64)
    y_cell = np.asarray(mesh.cellCenters[1], dtype=np.float64)
    initial = manufactured_field(np, x_cell, y_cell, 0.0)
    eta = fipy.CellVariable(mesh=mesh, hasOld=True, value=initial, name="eta")
    source_variable = fipy.CellVariable(mesh=mesh, value=np.zeros(NX * NY), name="source")
    face_values = fipy.FaceVariable(mesh=mesh, value=np.zeros(mesh.numberOfFaces), name="yBoundary")
    y_boundary_mask = mesh.facesBottom | mesh.facesTop
    eta.constrain(face_values, where=y_boundary_mask)
    reaction = -4.0 * eta.old * (eta.old - 1.0) * (eta.old - 0.5)
    equation = fipy.TransientTerm(var=eta) == fipy.DiffusionTerm(coeff=KAPPA, var=eta) + reaction + source_variable
    equation.cacheMatrix()
    equation.cacheRHSvector()
    face_x_all = np.asarray(mesh.faceCenters[0], dtype=np.float64)
    bottom_mask = np.asarray(mesh.facesBottom, dtype=bool)
    top_mask = np.asarray(mesh.facesTop, dtype=bool)
    face_x = face_x_all[bottom_mask]
    steps: list[dict[str, object]] = []

    class CountingPCG(fipy.LinearPCGSolver):
        def _doSolve(self, *args, **kwargs):
            self.solveCallCount += 1
            return super()._doSolve(*args, **kwargs)

    for step_index in range(STEP_COUNT):
        time_old = step_index * DT
        time_new = (step_index + 1) * DT
        eta.updateOld()
        old_state = np.array(eta.old.value, dtype=np.float64, copy=True)
        source = manufactured_source(np, x_cell, y_cell, time_old)
        source_variable.setValue(source)
        bottom, top = boundary_values(np, track, face_x, time_new)
        scheduled_faces = np.zeros(mesh.numberOfFaces, dtype=np.float64)
        scheduled_faces[bottom_mask] = bottom
        scheduled_faces[top_mask] = top
        face_values.setValue(scheduled_faces)
        solver = CountingPCG(
            criterion="RHS", tolerance=1e-12, absolute_tolerance=1e-14, iterations=2000, precon=None
        )
        solver.solveCallCount = 0
        pre_residual = float(equation.sweep(var=eta, dt=DT, solver=solver))
        normalization = DT / (DX * DY)
        matrix = np.asarray(equation.matrix.numpyArray, dtype=np.float64) * normalization
        rhs = np.asarray(equation.RHSvector, dtype=np.float64).reshape(-1) * normalization
        state = np.asarray(eta.value, dtype=np.float64).reshape(-1)
        post_residual = float(solver._calcResidual())
        independent_residual = np.asarray(equation.matrix.numpyArray, dtype=np.float64) @ state - np.asarray(
            equation.RHSvector, dtype=np.float64
        ).reshape(-1)
        independent_residual_l2 = float(np.linalg.norm(independent_residual))
        actual_faces = np.asarray(eta.faceValue, dtype=np.float64)
        bottom_face_error = float(np.max(np.abs(actual_faces[bottom_mask] - bottom)))
        top_face_error = float(np.max(np.abs(actual_faces[top_mask] - top)))
        require(solver.solveCallCount == 1, "SOLVE_COUNT", "solver did not execute exactly once")
        require(int(solver.actualIterations) <= 2000, "SOLVER_ITERATIONS", "solver exceeded iteration ceiling")
        require(post_residual <= 1e-10 and independent_residual_l2 <= 1e-10, "ALGEBRAIC_RESIDUAL", "post-solve residual exceeded tolerance")
        require(bottom_face_error <= 2e-15 and top_face_error <= 2e-15, "BOUNDARY_APPLICATION", "actual FiPy face values differ from scheduled Dirichlet values")
        step_record = {
            "stepIndex": step_index + 1,
            "timeOld": time_old,
            "timeNew": time_new,
            "oldStateDigest": float64_digest(old_state),
            "oldStateSummary": finite_summary(np, old_state),
            "sourceSummary": finite_summary(np, source),
            "newStateSummary": finite_summary(np, state),
            "preSolveResidualL2": pre_residual,
            "postSolveResidualL2": post_residual,
            "independentPostSolveResidualL2": independent_residual_l2,
            "actualIterations": int(solver.actualIterations),
            "solveCount": solver.solveCallCount,
            "bottomFaceMaximumAbsoluteError": bottom_face_error,
            "topFaceMaximumAbsoluteError": top_face_error,
            "matrix": matrix.tolist(),
            "rhs": rhs.tolist(),
            "matrixDigest": float64_digest(matrix),
            "rhsDigest": float64_digest(rhs),
            "endpointDigest": float64_digest(state),
            "boundaryDigest": canonical_digest(
                {"bottom": bottom.tolist(), "time": time_new, "top": top.tolist(), "trackId": track}
            ),
        }
        require(all(math.isfinite(value) for value in (pre_residual, post_residual, independent_residual_l2)), "NONFINITE_RESIDUAL", "non-finite residual")
        steps.append(step_record)

    endpoint = np.asarray(eta.value, dtype=np.float64).reshape(-1)
    exact = manufactured_field(np, x_cell, y_cell, FINAL_TIME)
    discrepancy = float(math.sqrt(float(np.sum((endpoint - exact) ** 2)) * DX * DY))
    require(math.isfinite(discrepancy), "NONFINITE_METRIC", "non-finite endpoint metric")
    return {
        "trackId": track,
        "requiredLabel": "non-PFHub exact-trace companion" if track == "exact-trace-companion" else None,
        "boundaryDefinition": (
            {
                "type": "literal Dirichlet face values",
                "bottom": 1.0,
                "top": 0.0,
                "evaluationTime": "all registered times",
            }
            if track == "official-literal"
            else {
                "type": "manufactured-field face traces",
                "evaluationTime": "t_(n+1)",
                "requiredLabel": "non-PFHub exact-trace companion",
            }
        ),
        "problemUsesOfficialLiteralBoundary": track == "official-literal",
        "metricSpecifiedByPfhub": track == "official-literal",
        "strictMms": track == "exact-trace-companion",
        "mesh": mesh_record,
        "initialDigest": float64_digest(initial),
        "endpoint": endpoint.tolist(),
        "endpointDigest": float64_digest(endpoint),
        "diagnosticDiscreteL2": discrepancy,
        "steps": steps,
    }


def runtime_module_inventory(runtime_root: Path, worker_path: Path) -> list[dict[str, object]]:
    records: list[dict[str, object]] = []
    observed_synthetic: set[str] = set()
    for name in sorted(sys.modules):
        module = sys.modules[name]
        spec = getattr(module, "__spec__", None)
        origin = getattr(spec, "origin", None) if spec is not None else getattr(module, "__file__", None)
        if origin in ("built-in", "frozen"):
            records.append({"module": name, "classification": origin})
            continue
        if origin is None:
            locations = list(getattr(spec, "submodule_search_locations", ()) or ())
            if not locations:
                require(
                    name in REGISTERED_SYNTHETIC_MODULES,
                    "MODULE_ORIGIN",
                    f"unregistered origin-less module: {name}",
                )
                observed_synthetic.add(name)
                records.append(
                    {
                        "module": name,
                        "classification": "registered-synthetic-no-origin",
                        "basis": "exact-name allowlist for a runtime-created module object with no origin or search location",
                    }
                )
                continue
            normalized: list[str] = []
            for location in locations:
                path = Path(location).resolve(strict=True)
                require(path.is_relative_to(runtime_root), "MODULE_ORIGIN", f"namespace module escaped runtime: {name}")
                normalized.append("$RUNTIME/" + path.relative_to(runtime_root).as_posix())
            normalized = sorted(set(normalized), key=lambda value: value.encode("utf-8"))
            require(normalized, "MODULE_ORIGIN", f"namespace module has no runtime search location: {name}")
            records.append({"module": name, "classification": "namespace", "locations": normalized})
            continue
        path = Path(origin).resolve(strict=True)
        if path == worker_path:
            logical = "$WORKER"
            classification = "worker"
        elif path.is_relative_to(runtime_root):
            logical = "$RUNTIME/" + path.relative_to(runtime_root).as_posix()
            classification = "runtime"
        else:
            raise PreflightFailure("MODULE_ORIGIN", f"module escaped runtime: {name}")
        records.append(
            {
                "module": name,
                "classification": classification,
                "origin": logical,
                "byteSize": path.stat().st_size,
                "rawDigest": sha256_file(path),
            }
        )
    require(
        observed_synthetic == REGISTERED_SYNTHETIC_MODULES,
        "MODULE_ORIGIN",
        "registered origin-less module set changed",
    )
    return records


def normalized_dyld_image_path(rendered: str) -> PurePosixPath:
    require(rendered.startswith("/"), "DYLD_IMAGE", "dyld image path is not absolute")
    require(
        unicodedata.normalize("NFC", rendered) == rendered,
        "DYLD_IMAGE",
        "dyld image path is not NFC-normalized",
    )
    segments = rendered.split("/")[1:]
    require(
        bool(segments)
        and all(segment not in {"", ".", ".."} for segment in segments),
        "DYLD_IMAGE",
        "dyld image path contains an empty or traversal segment",
    )
    normalized = PurePosixPath(rendered)
    require(
        normalized.as_posix() == rendered,
        "DYLD_IMAGE",
        "dyld image path is not lexically normalized",
    )
    return normalized


def dyld_inventory(runtime_root: Path) -> list[dict[str, object]]:
    require(platform.system() == "Darwin", "PLATFORM", "R18a runtime is locked to Darwin")
    process = ctypes.CDLL(None)
    count = process._dyld_image_count
    count.restype = ctypes.c_uint32
    get_name = process._dyld_get_image_name
    get_name.argtypes = [ctypes.c_uint32]
    get_name.restype = ctypes.c_char_p
    records: list[dict[str, object]] = []
    for dyld_index in range(int(count())):
        encoded = get_name(dyld_index)
        require(encoded is not None, "DYLD_IMAGE", "dyld returned a null image name")
        rendered = encoded.decode("utf-8")
        normalized = normalized_dyld_image_path(rendered)
        if normalized.is_relative_to(PurePosixPath("/usr/lib")) or normalized.is_relative_to(
            PurePosixPath("/System/Library")
        ):
            records.append({"classification": "host-system-boundary", "path": rendered})
            continue
        path = Path(rendered).resolve(strict=True)
        if path.is_relative_to(runtime_root):
            records.append(
                {
                    "classification": "runtime",
                    "path": "$RUNTIME/" + path.relative_to(runtime_root).as_posix(),
                    "byteSize": path.stat().st_size,
                    "rawDigest": sha256_file(path),
                }
            )
        else:
            raise PreflightFailure("DYLD_IMAGE", "non-system native image escaped the private runtime")
    records.sort(key=lambda record: str(record["path"]).encode("utf-8"))
    require(
        len({str(record["path"]) for record in records}) == len(records),
        "DYLD_IMAGE",
        "dyld image paths are not unique",
    )
    return [{"index": index, **record} for index, record in enumerate(records)]


def run(inject_warning: bool) -> dict[str, object]:
    runtime_root = Path(sys.prefix).resolve(strict=True)
    worker_path = Path(__file__).resolve(strict=True)
    require(runtime_root.name == LOCK_DIGEST_HEX, "RUNTIME_ADDRESS", "runtime root is not lock-addressed")
    require(Path(sys.base_prefix).resolve(strict=True) == runtime_root, "RUNTIME_PREFIX", "base prefix escaped private runtime")
    require(Path(sys.executable).resolve(strict=True).is_relative_to(runtime_root), "RUNTIME_EXECUTABLE", "executable escaped private runtime")
    require(sys.flags.isolated == 1 and sys.flags.dont_write_bytecode == 1, "PYTHON_FLAGS", "required -I/-B flags are absent")
    require("error" in sys.warnoptions, "PYTHON_FLAGS", "required -W error flag is absent")
    observed_environment = dict(os.environ)
    require(
        all(observed_environment.get(key) == value for key, value in REQUIRED_ENVIRONMENT.items()),
        "RUNTIME_ENVIRONMENT",
        "a frozen child environment key is absent or changed",
    )
    environment_extras = set(observed_environment) - set(REQUIRED_ENVIRONMENT)
    require(environment_extras <= {"__CF_USER_TEXT_ENCODING"}, "RUNTIME_ENVIRONMENT", "child environment contains an unregistered extra key")
    if "__CF_USER_TEXT_ENCODING" in observed_environment:
        require(
            observed_environment["__CF_USER_TEXT_ENCODING"] == "0x1F5:0x0:0x0",
            "RUNTIME_ENVIRONMENT",
            "Darwin-injected text encoding environment value changed",
        )
    expected_search = [
        runtime_root / "lib/python312.zip",
        runtime_root / "lib/python3.12",
        runtime_root / "lib/python3.12/lib-dynload",
        runtime_root / "lib/python3.12/site-packages",
    ]
    require([Path(item) for item in sys.path] == expected_search, "RUNTIME_SEARCH_PATH", "sys.path differs from the frozen private-runtime search path")
    fipy, np, scipy, packaging, captured_warnings = import_fipy_with_exact_warning_policy()
    if inject_warning:
        warnings.warn("r18a injected non-allowlisted warning", RuntimeWarning)
    require(platform.system() == "Darwin" and platform.machine() == "arm64", "PLATFORM", "unexpected host platform")
    require(fipy.__version__ == "4.0.3", "VERSION", "unexpected FiPy version")
    require(np.__version__ == "2.5.3" and scipy.__version__ == "1.18.1", "VERSION", "unexpected NumPy/SciPy version")
    require(importlib.metadata.version("packaging") == "26.3", "VERSION", "unexpected packaging version")
    require(fipy.solvers.solver_suite == "scipy", "SOLVER_SUITE", "FiPy did not select scipy")
    tracks = [run_track(fipy, np, track) for track in TRACKS]
    require(abs(STEP_COUNT * DT - FINAL_TIME) <= 2.0 * math.ulp(FINAL_TIME), "ENDPOINT_TIME", "registered step count does not reach final time")
    require(
        all(
            step["timeOld"] == index * DT and step["timeNew"] == (index + 1) * DT
            for track in tracks
            for index, step in enumerate(track["steps"])
        ),
        "ENDPOINT_TIME",
        "executed step time differs from exact integer-loop schedule",
    )
    require(tracks[0]["initialDigest"] == tracks[1]["initialDigest"], "TRACK_INITIAL", "track initial fields differ")
    require(tracks[0]["endpointDigest"] != tracks[1]["endpointDigest"], "TRACK_SEPARATION", "track endpoints are not distinct")
    require(
        tracks[0]["steps"][0]["boundaryDigest"] != tracks[1]["steps"][0]["boundaryDigest"],
        "TRACK_SEPARATION",
        "track boundary definitions are not distinct",
    )
    endpoint_difference = np.asarray(tracks[0]["endpoint"]) - np.asarray(tracks[1]["endpoint"])
    endpoint_difference_l2 = float(math.sqrt(float(np.sum(endpoint_difference**2)) * DX * DY))
    l2_oracle = float(math.sqrt(float(np.sum(np.full(NX * NY, 2.0) ** 2)) * DX * DY))
    require(abs(l2_oracle - math.sqrt(2.0)) <= 2e-15, "L2_ORACLE", "constant-field L2 oracle failed")
    fine_x = (np.arange(2 * NX, dtype=np.float64) + 0.5) * (DX / 2.0)
    fine_y = (np.arange(2 * NY, dtype=np.float64) + 0.5) * (DY / 2.0)
    fx, fy = np.meshgrid(fine_x, fine_y, indexing="xy")
    fine = 2.0 + 3.0 * fx - 5.0 * fy
    restricted = fine.reshape(NY, 2, NX, 2).mean(axis=(1, 3))
    coarse_x = (np.arange(NX, dtype=np.float64) + 0.5) * DX
    coarse_y = (np.arange(NY, dtype=np.float64) + 0.5) * DY
    cx, cy = np.meshgrid(coarse_x, coarse_y, indexing="xy")
    restriction_error = float(np.max(np.abs(restricted - (2.0 + 3.0 * cx - 5.0 * cy))))
    require(restriction_error <= 2e-15, "RESTRICTION_ORACLE", "2-by-2 conservative restriction oracle failed")
    sampled_tail = 0.0
    for time_value in (0.0, DT, FINAL_TIME):
        face_x = (np.arange(NX, dtype=np.float64) + 0.5) * DX
        bottom = manufactured_field(np, face_x, np.zeros(NX), time_value)
        top = manufactured_field(np, face_x, np.full(NX, 0.5), time_value)
        sampled_tail = max(sampled_tail, float(np.max(1.0 - bottom)), float(np.max(top)))
    require(0.0 < sampled_tail < 0.000012204318378838, "BOUNDARY_TAIL", "analytic face-tail diagnostic violated bound")
    modules = runtime_module_inventory(runtime_root, worker_path)
    images = dyld_inventory(runtime_root)
    return {
        "schemaVersion": "tf.pfhub7a-r18a-worker-result/0.1",
        "status": "pass",
        "runtime": {
            "prefix": "$RUNTIME",
            "basePrefix": "$RUNTIME",
            "executable": "$RUNTIME/bin/python3.12",
            "searchPath": [
                "$RUNTIME/lib/python312.zip",
                "$RUNTIME/lib/python3.12",
                "$RUNTIME/lib/python3.12/lib-dynload",
                "$RUNTIME/lib/python3.12/site-packages",
            ],
            "flags": {"isolated": True, "dontWriteBytecode": True, "warningsAsErrors": True},
            "worker": {
                "path": "$WORKER",
                "byteSize": worker_path.stat().st_size,
                "rawDigest": sha256_file(worker_path),
            },
            "versions": {
                "python": platform.python_version(),
                "fipy": fipy.__version__,
                "numpy": np.__version__,
                "scipy": scipy.__version__,
                "packaging": importlib.metadata.version("packaging"),
                "solverSuite": fipy.solvers.solver_suite,
            },
            "environment": {
                "required": REQUIRED_ENVIRONMENT,
                "darwinInjected": (
                    {"__CF_USER_TEXT_ENCODING": observed_environment["__CF_USER_TEXT_ENCODING"]}
                    if "__CF_USER_TEXT_ENCODING" in observed_environment
                    else {}
                ),
            },
            "warningPolicy": {
                "defaultAction": "error",
                "allowlistedObservedCount": len(captured_warnings),
                "records": captured_warnings,
            },
            "moduleInventory": {
                "recordCount": len(modules),
                "recordsDigest": canonical_digest(modules),
                "records": modules,
            },
            "dyldInventory": {
                "recordCount": len(images),
                "recordsDigest": canonical_digest(images),
                "records": images,
            },
        },
        "preflight": {
            "matrix": {"Nx": NX, "Ny": NY, "dx": DX, "dy": DY, "dt": DT, "stepCount": STEP_COUNT, "finalTime": FINAL_TIME},
            "tracks": tracks,
            "trackEndpointDifferenceL2": endpoint_difference_l2,
            "constantTwoDiscreteL2": l2_oracle,
            "restrictionMaximumAbsoluteError": restriction_error,
            "analyticBoundaryTailMismatchAtExecutedFaces": sampled_tail,
            "initialBoundaryCompatibility": False,
        },
    }


def emit(value: object) -> None:
    sys.stdout.write(json.dumps(value, ensure_ascii=True, allow_nan=False, separators=(",", ":"), sort_keys=True))


def main() -> int:
    try:
        arguments = sys.argv[1:]
        require(arguments in ([], ["--inject-warning"]), "ARGUMENT", "worker accepts zero arguments or one --inject-warning")
        emit(run(arguments == ["--inject-warning"]))
        return 0
    except PreflightFailure as error:
        emit({"schemaVersion": "tf.pfhub7a-r18a-abstention/0.1", "status": "abstain", "reasonCode": error.code, "detail": error.detail})
        return 1
    except Warning as error:
        emit(
            {
                "schemaVersion": "tf.pfhub7a-r18a-abstention/0.1",
                "status": "abstain",
                "reasonCode": "WARNING_NOT_ALLOWLISTED",
                "detail": f"{type(error).__name__}: warning rejected by default-error policy",
            }
        )
        return 1
    except Exception as error:
        emit(
            {
                "schemaVersion": "tf.pfhub7a-r18a-abstention/0.1",
                "status": "abstain",
                "reasonCode": "UNEXPECTED_WORKER_FAILURE",
                "detail": f"{type(error).__name__}: {error}",
            }
        )
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
