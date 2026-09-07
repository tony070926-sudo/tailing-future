#!/usr/bin/env python3
"""Clean-room dense finite-volume oracle for the frozen R18a preflight.

This module intentionally imports neither FiPy nor any R17 implementation.
It owns its equation assembly and advances the two registered tracks with
exactly one dense solve per step.
"""

from __future__ import annotations

import hashlib
import json
import math
import struct
import sys

import numpy as np


NX = 8
NY = 4
DX = 0.125
DY = 0.125
DT = 0.01
STEP_COUNT = 2
KAPPA = 1.0 / 2500.0
A1 = 3.0 / 400.0
A2 = 3.0 / 100.0
B1 = 8.0 * math.pi
B2 = 22.0 * math.pi
C2 = math.pi / 16.0
TRACKS = ("official-literal", "exact-trace-companion")


def canonical_digest(value: object) -> str:
    payload = json.dumps(
        value, ensure_ascii=True, allow_nan=False, separators=(",", ":"), sort_keys=True
    ).encode("utf-8")
    return "sha256:" + hashlib.sha256(payload).hexdigest()


def float64_digest(values: np.ndarray) -> str:
    flat = np.asarray(values, dtype=np.float64).reshape(-1)
    payload = b"".join(struct.pack("<d", float(value)) for value in flat)
    return "sha256:" + hashlib.sha256(payload).hexdigest()


def alpha(x: np.ndarray, time_value: float) -> np.ndarray:
    return (
        0.25
        + A1 * time_value * np.sin(B1 * x)
        + A2 * np.sin(B2 * x + C2 * time_value)
    )


def manufactured_field(x: np.ndarray, y: np.ndarray, time_value: float) -> np.ndarray:
    z = (y - alpha(x, time_value)) / math.sqrt(2.0 * KAPPA)
    return 0.5 * (1.0 - np.tanh(z))


def manufactured_source(x: np.ndarray, y: np.ndarray, time_value: float) -> np.ndarray:
    phase1 = B1 * x
    phase2 = B2 * x + C2 * time_value
    alpha_x = A1 * time_value * B1 * np.cos(phase1) + A2 * B2 * np.cos(phase2)
    alpha_xx = (
        -A1 * time_value * B1 * B1 * np.sin(phase1)
        - A2 * B2 * B2 * np.sin(phase2)
    )
    alpha_t = A1 * np.sin(phase1) + A2 * C2 * np.cos(phase2)
    z = (y - alpha(x, time_value)) / math.sqrt(2.0 * KAPPA)
    sech_squared = 1.0 / np.cosh(z) ** 2
    return sech_squared / (4.0 * math.sqrt(KAPPA)) * (
        -2.0 * math.sqrt(KAPPA) * np.tanh(z) * alpha_x * alpha_x
        + math.sqrt(2.0) * (alpha_t - KAPPA * alpha_xx)
    )


def cell_centres() -> tuple[np.ndarray, np.ndarray]:
    xs = (np.arange(NX, dtype=np.float64) + 0.5) * DX
    ys = (np.arange(NY, dtype=np.float64) + 0.5) * DY
    x_grid, y_grid = np.meshgrid(xs, ys, indexing="xy")
    return x_grid.reshape(-1), y_grid.reshape(-1)


def boundary_values(track: str, time_value: float) -> tuple[np.ndarray, np.ndarray]:
    face_x = (np.arange(NX, dtype=np.float64) + 0.5) * DX
    if track == "official-literal":
        return np.ones(NX, dtype=np.float64), np.zeros(NX, dtype=np.float64)
    if track == "exact-trace-companion":
        return (
            manufactured_field(face_x, np.zeros(NX), time_value),
            manufactured_field(face_x, np.full(NX, 0.5), time_value),
        )
    raise ValueError(f"unregistered track: {track}")


def assemble_dense(
    old_state: np.ndarray,
    source: np.ndarray,
    bottom: np.ndarray,
    top: np.ndarray,
) -> tuple[np.ndarray, np.ndarray]:
    """Assemble normalized A and b without consulting FiPy state or matrices."""

    immutable_old = np.array(old_state, dtype=np.float64, copy=True)
    immutable_source = np.array(source, dtype=np.float64, copy=True)
    rx = DT * KAPPA / (DX * DX)
    ry = DT * KAPPA / (DY * DY)
    matrix = np.zeros((NX * NY, NX * NY), dtype=np.float64)
    reaction = -4.0 * immutable_old * (immutable_old - 1.0) * (immutable_old - 0.5)
    rhs = immutable_old + DT * (reaction + immutable_source)

    for j in range(NY):
        for i in range(NX):
            row = j * NX + i
            matrix[row, row] = 1.0 + 2.0 * rx + (3.0 * ry if j in (0, NY - 1) else 2.0 * ry)
            matrix[row, j * NX + ((i - 1) % NX)] = -rx
            matrix[row, j * NX + ((i + 1) % NX)] = -rx
            if j == 0:
                rhs[row] += 2.0 * ry * bottom[i]
            else:
                matrix[row, (j - 1) * NX + i] = -ry
            if j == NY - 1:
                rhs[row] += 2.0 * ry * top[i]
            else:
                matrix[row, (j + 1) * NX + i] = -ry
    return matrix, rhs


def run_track(track: str) -> dict[str, object]:
    x_cell, y_cell = cell_centres()
    state = manufactured_field(x_cell, y_cell, 0.0)
    initial_digest = float64_digest(state)
    steps: list[dict[str, object]] = []
    for step_index in range(STEP_COUNT):
        time_old = step_index * DT
        time_new = (step_index + 1) * DT
        old_state = np.array(state, copy=True)
        source = manufactured_source(x_cell, y_cell, time_old)
        bottom, top = boundary_values(track, time_new)
        matrix, rhs = assemble_dense(old_state, source, bottom, top)
        state = np.linalg.solve(matrix, rhs)
        steps.append(
            {
                "stepIndex": step_index + 1,
                "timeOld": time_old,
                "timeNew": time_new,
                "oldStateDigest": float64_digest(old_state),
                "matrix": matrix.tolist(),
                "rhs": rhs.tolist(),
                "matrixDigest": float64_digest(matrix),
                "rhsDigest": float64_digest(rhs),
                "endpointDigest": float64_digest(state),
                "boundaryDigest": canonical_digest(
                    {"bottom": bottom.tolist(), "time": time_new, "top": top.tolist(), "trackId": track}
                ),
                "solveCount": 1,
            }
        )
    return {
        "trackId": track,
        "requiredLabel": "non-PFHub exact-trace companion" if track == "exact-trace-companion" else None,
        "initialDigest": initial_digest,
        "endpoint": state.tolist(),
        "endpointDigest": float64_digest(state),
        "steps": steps,
    }


def main() -> int:
    if sys.argv[1:]:
        raise RuntimeError("clean-room oracle accepts no command-line arguments")
    forbidden = tuple(name for name in sys.modules if name == "fipy" or name.startswith("fipy.") or "r17" in name.lower())
    if forbidden:
        raise RuntimeError(f"clean-room import sentinel failed before execution: {forbidden!r}")
    tracks = [run_track(track) for track in TRACKS]
    forbidden = tuple(name for name in sys.modules if name == "fipy" or name.startswith("fipy.") or "r17" in name.lower())
    if forbidden:
        raise RuntimeError(f"clean-room import sentinel failed after execution: {forbidden!r}")
    result = {
        "schemaVersion": "tf.pfhub7a-r18a-clean-room-oracle/0.1",
        "status": "pass",
        "layout": "index=j*Nx+i; x-fastest; modulo-x",
        "dependencies": ["Python standard library", "NumPy dense linear algebra"],
        "runtimeImportSentinelPassed": True,
        "tracks": tracks,
    }
    sys.stdout.write(json.dumps(result, ensure_ascii=True, allow_nan=False, separators=(",", ":"), sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
