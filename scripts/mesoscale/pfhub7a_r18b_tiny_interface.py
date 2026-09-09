"""Frozen R18b tiny CSR/P1 prerequisite; never an unrestricted solver."""
from __future__ import annotations

import hashlib
import importlib.util
import json
import math
import os
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
LOCK = "cd7f8e8a47d67596c025a8035890e99f5a367be562289e84ae4f6d87e79c08ee"
RUNTIME = Path("/Users/tonywilliam/Documents/ChatGPT/Tailing Future/.tf-runtime/pfhub7a-r18a") / LOCK
LOCK_PATH = "evaluation/mesoscale/dependencies/pfhub7a-r18a-fipy/runtime-lock-v1.json"
NEW = ["scripts/mesoscale/pfhub7a_r18b_tiny_" + name + ".py" for name in
       ("interface", "oracle", "interface_test", "verify")] + [
    "evaluation/mesoscale/preregistrations/pfhub7a-r18b-csr-p1-tiny-v1.json",
    "schemas/pfhub7a-r18b-tiny-interface-v0.1.schema.json",
    "evaluation/reviews/2026-09-07-r18b-csr-p1-tiny-v1-builder-evidence.json"]
READ_ONLY = ["scripts/mesoscale/pfhub7a_r18a_" + name + ".py" for name in
             ("worker", "supervise_v3", "oracle")] + [LOCK_PATH]
DT = .01
KAPPA = .0004
EPS = 2.0 ** -52
LANES = ("official-literal", "exact-trace-companion")
RUN_PROGRESS = {"completedTracks": [], "currentTrack": None, "attemptedStep": None}
CHECKPOINT_WRITER = None
META = {"unit": "1", "dimension": "dimensionless", "basis": "PFHub7a native nondimensional"}
BASES = {
    "M": "consistent P1 test-function area integral", "K": "P1 gradient inner-product area integral",
    "R": "test-function weighted area reaction load", "F": "P1 test-function weighted area load or FV cell-centre source rate",
    "w": "full periodic-unique DOF lumped area weight, including Dirichlet DOFs",
    "d": "discrete area-integrated order-parameter change per step",
    "A": "actual unscaled linear system; FV cell-area/time equation, FEM consistent-mass increment equation",
    "b": "actual RHS in the same equation basis as A", "state": "order parameter at declared nodes or cell centres",
    "time": "native nondimensional time", "projection": "4x2 aligned coarse-cell area average; lossy",
    "L2": "square root of area integral, not divided by domain area",
    "loadSensitivity": "full-DOF area-weighted L2 of dt*deltaF/w; not forward error",
}


class Rejected(RuntimeError):
    def __init__(self, code, detail=""):
        super().__init__(detail or code)
        self.code = code


def require(ok, code, detail=""):
    if not ok:
        raise Rejected(code, detail)


def encoded(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()


def digest(value):
    return hashlib.sha256(encoded(value)).hexdigest()


def strict_load(path):
    def pairs(items):
        out = {}
        for key, value in items:
            require(key not in out, "DUPLICATE_KEY")
            out[key] = value
        return out
    return json.loads(Path(path).read_bytes(), object_pairs_hook=pairs,
                      parse_constant=lambda _: (_ for _ in ()).throw(Rejected("NONFINITE")))


def load_module(name, filename):
    path = ROOT / "scripts/mesoscale" / filename
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def snapshot_check(path):
    snap = strict_load(path)
    require(set(snap) == {"files"}, "SOURCE_SNAPSHOT")
    records = snap["files"]
    require(len(records) == len(NEW[:-1] + READ_ONLY), "SOURCE_SNAPSHOT")
    require({r["path"] for r in records} == set(NEW[:-1] + READ_ONLY), "SOURCE_SNAPSHOT")
    for rec in records:
        require(set(rec) == {"path", "sha256"}, "SOURCE_SNAPSHOT")
        src = ROOT / rec["path"]
        require(not src.is_symlink() and src.is_file(), "SOURCE_SNAPSHOT")
        require(hashlib.sha256(src.read_bytes()).hexdigest() == rec["sha256"], "SOURCE_SNAPSHOT")
    return snap


def inventory(worker, allowed):
    records = []
    synthetic = set()
    for name, module in sorted(sys.modules.items()):
        spec = getattr(module, "__spec__", None)
        origin = getattr(spec, "origin", None) if spec else getattr(module, "__file__", None)
        if origin in ("built-in", "frozen"):
            records.append({"module": name, "origin": origin})
        elif origin is None:
            locations = list(getattr(spec, "submodule_search_locations", ()) or ())
            if locations:
                require(all(Path(p).resolve().is_relative_to(RUNTIME) for p in locations), "MODULE_ORIGIN")
                records.append({"module": name, "namespace": locations})
            else:
                require(name in worker.REGISTERED_SYNTHETIC_MODULES, "MODULE_ORIGIN", name)
                synthetic.add(name)
                records.append({"module": name, "origin": "registered-synthetic"})
        else:
            src = Path(origin).resolve()
            require(src.is_relative_to(RUNTIME) or src in allowed, "MODULE_ORIGIN", str(src))
            records.append({"module": name, "path": str(src), "sha256": hashlib.sha256(src.read_bytes()).hexdigest()})
    require(synthetic == worker.REGISTERED_SYNTHETIC_MODULES, "MODULE_ORIGIN")
    return {"modules": records, "nativeImages": worker.dyld_inventory(RUNTIME)}


def initialize(snapshot_path):
    global np, sp, fipy, worker
    snap = snapshot_check(snapshot_path)
    require(Path(sys.prefix).resolve() == RUNTIME and Path(sys.base_prefix).resolve() == RUNTIME,
            "RUNTIME_IDENTITY")
    require(Path(sys.executable).resolve() == RUNTIME / "bin/python3.12", "RUNTIME_IDENTITY")
    require(sys.flags.isolated == 1 and sys.flags.dont_write_bytecode == 1, "RUNTIME_IDENTITY")
    lock_bytes = (ROOT / LOCK_PATH).read_bytes()
    require(hashlib.sha256(lock_bytes).hexdigest() == LOCK, "RUNTIME_IDENTITY")
    supervisor = load_module("r18b_runtime_supervisor", "pfhub7a_r18a_supervise_v3.py")
    lock = strict_load(ROOT / LOCK_PATH)
    supervisor.validate_closure(supervisor.materialized_closure(RUNTIME), lock["combinedClosure"], "RUNTIME_IDENTITY")
    worker = load_module("r18b_fv_source", "pfhub7a_r18a_worker.py")
    require(all(os.environ.get(k) == v for k, v in worker.REQUIRED_ENVIRONMENT.items()), "RUNTIME_ENVIRONMENT")
    require(set(os.environ) <= set(worker.REQUIRED_ENVIRONMENT) | {"__CF_USER_TEXT_ENCODING"}, "RUNTIME_ENVIRONMENT")
    if "__CF_USER_TEXT_ENCODING" in os.environ:
        require(os.environ["__CF_USER_TEXT_ENCODING"] == "0x1F5:0x0:0x0", "RUNTIME_ENVIRONMENT")
    expected = [RUNTIME / "lib/python312.zip", RUNTIME / "lib/python3.12",
                RUNTIME / "lib/python3.12/lib-dynload", RUNTIME / "lib/python3.12/site-packages"]
    require([Path(p) for p in sys.path] == expected, "RUNTIME_IDENTITY")
    fipy, np, scipy, packaging, warning_records = worker.import_fipy_with_exact_warning_policy()
    import scipy.sparse as sparse
    sp = sparse
    import platform
    require((platform.python_version(), np.__version__, scipy.__version__, fipy.__version__, packaging.__version__)
            == ("3.12.14", "2.5.3", "1.18.1", "4.0.3", "26.3"), "RUNTIME_IDENTITY")
    require(fipy.solvers.solver_suite == "scipy", "RUNTIME_IDENTITY")
    allowed = {ROOT / r["path"] for r in snap["files"] if r["path"].endswith(".py")}
    return {"lockSha256": LOCK, "snapshot": snap, "warnings": warning_records,
            "before": inventory(worker, allowed)}


def guard(nx=8, ny=4, nt=2, dense=False):
    require((nx, ny, nt) == (8, 4, 2), "SCOPE_EXCEEDED")
    return dense


def csr_record(matrix):
    matrix = matrix.tocsr(copy=True)
    matrix.sum_duplicates()
    matrix.sort_indices()
    rec = {"shape": list(matrix.shape), "indptr": matrix.indptr.tolist(),
           "indices": matrix.indices.tolist(), "data": matrix.data.tolist(),
           "dtype": "float64", "endian": "little"}
    rec["sha256"] = digest(rec)
    return rec


def csr_read(rec):
    require(digest({k: v for k, v in rec.items() if k != "sha256"}) == rec["sha256"], "OPERATOR_DIGEST")
    require(rec["dtype"] == "float64" and rec["endian"] == "little", "OPERATOR_DIGEST")
    require(rec["shape"] in ([24,24],[32,32],[40,40]), "SCOPE_EXCEEDED")
    out = sp.csr_matrix((np.array(rec["data"]), np.array(rec["indices"]), np.array(rec["indptr"])), shape=rec["shape"])
    require(out.has_canonical_format, "OPERATOR_DIGEST")
    return out


def stop_ratio(residual, scale):
    """Scalar zero convention for the native dimensionless backward residual."""
    require(math.isfinite(residual) and math.isfinite(scale) and scale >= 0, "STOP_NONFINITE")
    if scale == 0:
        return 0. if residual == 0 else math.inf
    result = abs(residual) / scale
    require(math.isfinite(result), "STOP_NONFINITE")
    return result


def stop_metrics(a, b, state):
    """Fresh actual-CSR residual; neither a global-only nor a forward-error test."""
    b = np.asarray(b); state = np.asarray(state)
    require(a.format == "csr" and a.has_canonical_format, "STOP_SYSTEM_SHAPE")
    require(b.ndim == state.ndim == 1 and b.shape == state.shape and
            a.shape == (b.size, b.size), "STOP_SYSTEM_SHAPE")
    require(bool(np.all(np.isfinite(a.data))) and bool(np.all(np.isfinite(b))) and
            bool(np.all(np.isfinite(state))), "STOP_NONFINITE")
    with np.errstate(all="ignore"):
        r = a @ state - b
        s = abs(a) @ abs(state) + abs(b)
        require(bool(np.all(np.isfinite(r))) and bool(np.all(np.isfinite(s))), "STOP_NONFINITE")
        require(bool(np.all((s != 0) | (r == 0))), "COMPONENTWISE_NOT_SATISFIED")
        ratios = np.divide(abs(r), s, out=np.zeros_like(r), where=s != 0)
        result = {"componentwise": float(ratios.max()), "linf": float(abs(r).max()),
                  "l2": float(np.linalg.norm(r))}
    require(all(math.isfinite(v) for v in result.values()), "STOP_NONFINITE")
    return result


def stop_certificate(a, b, state):
    metrics = stop_metrics(a, b, state)
    require(metrics["componentwise"] <= 1e-11, "COMPONENTWISE_NOT_SATISFIED")
    return {"Asha256": csr_record(a)["sha256"], "bsha256": digest(np.asarray(b).tolist()),
            "xsha256": digest(np.asarray(state).tolist()), "residual": metrics}


def check_stop_certificate(a, b, state, certificate):
    try:
        expected = stop_certificate(a, b, state)
    except Rejected as exc:
        raise Rejected("STALE_STOP_CERTIFICATE") from exc
    require(certificate == expected, "STALE_STOP_CERTIFICATE")


def _run_componentwise_protocol(cg_function, a, b, initial, policy):
    """One invocation; callback termination is project-owned, never native info=0."""
    require(isinstance(policy, dict) and set(policy) == {"rtol", "atol", "maxiter", "M"} and
            all(type(policy[k]) in (int, float) and policy[k] == 0 for k in ("rtol", "atol")) and
            type(policy["maxiter"]) is int and policy["maxiter"] == 2000 and policy["M"] is None,
            "POLICY_MISMATCH")
    counters = {"adapterCalls": 0, "cgCalls": 0, "callbackCount": 0}
    counters["adapterCalls"] += 1
    try:
        stop_certificate(a, b, initial)
    except Rejected as exc:
        if exc.code != "COMPONENTWISE_NOT_SATISFIED":
            raise
    else:
        raise Rejected("INITIAL_ALREADY_SOLVED_REQUIRES_DISPOSITION")
    a_identity = csr_record(a)["sha256"]; b_identity = digest(np.asarray(b).tolist())
    accepted = {}

    class CallbackCertified(Exception):
        pass

    def bound_system():
        require(csr_record(a)["sha256"] == a_identity and digest(np.asarray(b).tolist()) == b_identity,
                "STALE_STOP_CERTIFICATE")

    def callback(value):
        counters["callbackCount"] += 1
        require(counters["callbackCount"] <= 2000, "CG_CALLBACK_LIMIT")
        bound_system()
        copied = np.array(value, copy=True)
        try:
            certificate = stop_certificate(a, b, copied)
        except Rejected as exc:
            if exc.code == "COMPONENTWISE_NOT_SATISFIED":
                return
            raise
        accepted.update(state=copied, certificate=certificate)
        raise CallbackCertified()

    counters["cgCalls"] += 1
    try:
        state, info = cg_function(a, b, x0=np.array(initial, copy=True), callback=callback, **policy)
    except CallbackCertified:
        require(set(accepted) == {"state", "certificate"} and counters["callbackCount"] > 0,
                "UNBOUND_STOP_CERTIFICATE")
        state = accepted["state"]; certificate = accepted["certificate"]
        mode = "callback-certificate"; native_info = None
    else:
        require(type(info) is int and info == 0, "CG_NATIVE_FAILURE")
        bound_system()
        state = np.array(state, copy=True)
        try:
            certificate = stop_certificate(a, b, state)
        except Rejected as exc:
            raise Rejected("CG_RETURN_WITHOUT_CERTIFICATE") from exc
        mode = "native-return-certified"; native_info = info
    bound_system()
    check_stop_certificate(a, b, state, certificate)
    return state, {"terminationOwner": "project-true-componentwise", "mode": mode,
                   "nativeCgInfo": native_info, "effectiveRtol": 0, "effectiveAtol": 0,
                   "maxIterations": 2000, "preconditioner": "none", **counters,
                   "certificate": certificate, "unit": "1", "dimension": "dimensionless",
                   "equationBasis": "FV actual cell-area/time equation",
                   "ratioBasis": "max abs(A*x-b)/(abs(A)*abs(x)+abs(b)); componentwise backward residual, not forward error"}


def fv_componentwise_solve(a, b, initial):
    from scipy.sparse.linalg import cg
    return _run_componentwise_protocol(cg, a, b, initial,
                                       {"rtol": 0., "atol": 0., "maxiter": 2000, "M": None})


def test_only_componentwise_protocol(fake_cg, a, b, initial, policy=None):
    """Manufactured/fake-call protocol tests only; production never calls this entry."""
    if policy is None:
        policy = {"rtol": 0., "atol": 0., "maxiter": 2000, "M": None}
    return _run_componentwise_protocol(fake_cg, a, b, initial, policy)


def geometry():
    coords = np.array([(i / 8, j / 8) for j in range(5) for i in range(9)])
    mapping = np.array([j * 8 + i % 8 for j in range(5) for i in range(9)])
    triangles = []
    for j in range(4):
        for i in range(8):
            a = j * 9 + i
            triangles.extend(((a, a + 1, a + 10), (a, a + 10, a + 9)))
    boundary = np.r_[np.arange(8), np.arange(32, 40)]
    return coords, mapping, np.array(triangles), np.arange(8, 32), boundary


def matrices(coords, mapping, triangles):
    rows, cols, masses, stiffness = [], [], [], []
    for tri in triangles:
        p = coords[tri]
        jac = np.column_stack((p[1] - p[0], p[2] - p[0]))
        det = float(np.linalg.det(jac))
        require(det > 0, "ORIENTATION")
        area = det / 2
        grad = np.array([[-1., -1.], [1., 0.], [0., 1.]]) @ np.linalg.inv(jac)
        local_m = area / 12 * (np.ones((3, 3)) + np.eye(3))
        local_k = area * grad @ grad.T
        for a, i in enumerate(mapping[tri]):
            for b, j in enumerate(mapping[tri]):
                rows.append(i); cols.append(j)
                masses.append(local_m[a, b]); stiffness.append(local_k[a, b])
    return (sp.coo_matrix((vals, (rows, cols)), shape=(40, 40)).tocsr() for vals in (masses, stiffness))


def quadrature(level=0):
    vertices = [np.eye(3)]
    for _ in range(level):
        refined = []
        for a, b, c in vertices:
            ab, ac, bc = (a + b) / 2, (a + c) / 2, (b + c) / 2
            refined.extend((np.array([a, ab, ac]), np.array([ab, b, bc]),
                            np.array([ac, bc, c]), np.array([ab, bc, ac])))
        vertices = refined
    points = ((1 - math.sqrt(3 / 5)) / 2, .5, (1 + math.sqrt(3 / 5)) / 2)
    weights = (5 / 18, 4 / 9, 5 / 18)
    bary, w = [], []
    for vertex in vertices:
        scale = 4. ** (-level)
        for s, ws in zip(points, weights):
            for t, wt in zip(points, weights):
                bary.append(np.array([(1-s)*(1-t), s, (1-s)*t]) @ vertex)
                w.append(ws * wt * (1-s) * scale)
    return np.array(bary), np.array(w)


def loads(coords, mapping, triangles, state, time_value, level=0):
    bary, weights = quadrature(level)
    reaction, force = np.zeros(40), np.zeros(40)
    for tri in triangles:
        p, ids = coords[tri], mapping[tri]
        det = float(np.linalg.det(np.column_stack((p[1]-p[0], p[2]-p[0]))))
        xy, u = bary @ p, bary @ state[ids]
        rr = -4*u*(u-1)*(u-.5)
        ff = worker.manufactured_source(np, xy[:, 0], xy[:, 1], time_value)
        np.add.at(reaction, ids, bary.T @ (weights * det * rr))
        np.add.at(force, ids, bary.T @ (weights * det * ff))
    return reaction, force


def load_sensitivity(weights, delta_force, interior, boundary):
    z = DT*delta_force/weights
    sq = weights*z*z
    return {"full":float(np.sqrt(sq.sum())), "interiorSquared":float(sq[interior].sum()),
            "boundarySquared":float(sq[boundary].sum())}


def project(method, state, coords=None, mapping=None, triangles=None):
    result = np.zeros(8)
    if method == "FV":
        for j in range(4):
            for i in range(8):
                result[(j//2)*4+i//2] += state[j*8+i] * .015625 / .0625
    else:
        for tri in triangles:
            p = coords[tri]
            center = p.mean(axis=0)
            target = int(center[1] / .25) * 4 + int(center[0] / .25)
            area = np.linalg.det(np.column_stack((p[1]-p[0], p[2]-p[0]))) / 2
            result[target] += area * state[mapping[tri]].mean() / .0625
    return result


def field_record(method, lane, state, time_value, coords=None, mapping=None, triangles=None):
    rec = {"time": time_value, "state": state.tolist(), "projectionBasis": "4x2 aligned coarse-cell area averages",
           "projection": project(method, state, coords, mapping, triangles).tolist()}
    if method == "FV":
        x = np.tile((np.arange(8)+.5)/8, 4); y = np.repeat((np.arange(4)+.5)/8, 8)
        e = state - worker.manufactured_field(np, x, y, time_value)
        rec.update(nativeBasis="cell-centre discrete area-weighted L2", nativeL2=float(np.sqrt(.015625*np.sum(e*e))))
    else:
        errors = []
        for level in range(3):
            bary, weights = quadrature(level)
            total = 0.
            for tri in triangles:
                p = coords[tri]; xy = bary @ p
                det = float(np.linalg.det(np.column_stack((p[1]-p[0], p[2]-p[0]))))
                err = bary @ state[mapping[tri]] - worker.manufactured_field(np, xy[:, 0], xy[:, 1], time_value)
                total += float(np.dot(weights, err*err)) * det
            errors.append(math.sqrt(total))
        rec.update(nativeBasis="continuous P1 area-integrated L2", nativeL2Q=errors)
    rec["scientificLabel"] = "discrepancy" if lane == "official-literal" else "non-PFHub strict MMS error"
    return rec


def fem_track(lane):
    from scipy.sparse.linalg import cg
    coords, mapping, triangles, interior, boundary = geometry()
    mass, stiffness = matrices(coords, mapping, triangles)
    unique = coords[np.array([j*9+i for j in range(5) for i in range(8)])]
    state = worker.manufactured_field(np, unique[:, 0], unique[:, 1], 0.)
    weights = mass @ np.ones(40)
    track = {"method": "P1", "lane": lane, "coords": coords.tolist(), "mapping": mapping.tolist(),
             "triangles": triangles.tolist(), "I": interior.tolist(), "B": boundary.tolist(),
             "M": csr_record(mass), "K": csr_record(stiffness), "w": weights.tolist(),
             "fields": [field_record("P1", lane, state, 0., coords, mapping, triangles)], "steps": []}
    g0 = np.r_[np.ones(8), np.zeros(8)] if lane == "official-literal" else state[boundary]
    track["initialBoundaryMismatch"] = (state[boundary]-g0).tolist()
    RUN_PROGRESS["currentTrack"] = track
    for step in (1, 2):
        old = state.copy(); t_old = (step-1)*DT; t_new = step*DT
        reaction, force = loads(coords, mapping, triangles, old, t_old)
        forces = [force] + [loads(coords, mapping, triangles, old, t_old, q)[1] for q in (1, 2)]
        g = (np.r_[np.ones(8), np.zeros(8)] if lane == "official-literal" else
             worker.manufactured_field(np, unique[boundary, 0], unique[boundary, 1], t_new))
        full_a = mass + DT*KAPPA*stiffness
        a = full_a[interior][:, interior].tocsr()
        b = (mass @ old + DT*(reaction + force))[interior] - full_a[interior][:, boundary] @ g
        RUN_PROGRESS["attemptedStep"] = {"method":"P1", "lane":lane, "step":step,
            "old":old.tolist(), "g":g.tolist(), "A":csr_record(a), "b":b.tolist(), "sourceTime":t_old}
        iterations = [0]
        def counted(_):
            iterations[0] += 1
        solved, info = cg(a, b, rtol=1e-12, atol=1e-14, maxiter=2000, callback=counted)
        require(info == 0, "ALGEBRAIC_RESIDUAL")
        state = np.empty(40); state[interior] = solved; state[boundary] = g
        d = mass @ (state-old) + DT*KAPPA*(stiffness @ state) - DT*(reaction+force)
        sensitivities = []
        for lo, hi in zip(forces, forces[1:]):
            sensitivities.append(load_sensitivity(weights,hi-lo,interior,boundary))
        track["steps"].append({"step": step, "timeOld": t_old, "timeNew": t_new, "dt": DT,
            "sourceTime": t_old, "old": old.tolist(), "new": state.tolist(), "g": g.tolist(),
            "A": csr_record(a), "b": b.tolist(), "R": reaction.tolist(), "F": force.tolist(),
            "forcesQ": [f.tolist() for f in forces], "actualForcingRule": "Q0",
            "loadSensitivity": sensitivities, "loadDOFs": list(range(40)), "relativeForceSensitivity": None,
            "relativeForceReason": "relative-force-scale-unfrozen", "d": d.tolist(),
            "boundaryReaction": d[boundary].tolist(), "C": float(d[interior].sum()),
            "solveCount": 1, "iterations": iterations[0], "solverInfo": info})
        track["fields"].append(field_record("P1", lane, state, t_new, coords, mapping, triangles))
        if CHECKPOINT_WRITER is not None:
            CHECKPOINT_WRITER.write(f"checkpoint-P1-{lane}-{step}.json",
                                    {"step":track["steps"][-1],"field":track["fields"][-1]})
    return track


def fv_track(lane):
    mesh = fipy.PeriodicGrid2DLeftRight(nx=8, ny=4, dx=.125, dy=.125)
    worker.verify_mesh(np, mesh)
    xy = np.asarray(mesh.cellCenters)
    initial = worker.manufactured_field(np, xy[0], xy[1], 0.)
    eta = fipy.CellVariable(mesh=mesh, hasOld=True, value=initial)
    source = fipy.CellVariable(mesh=mesh, value=0.)
    face = fipy.FaceVariable(mesh=mesh, value=0.)
    eta.constrain(face, where=mesh.facesBottom | mesh.facesTop)
    reaction = -4*eta.old*(eta.old-1)*(eta.old-.5)
    equation = fipy.TransientTerm(var=eta) == fipy.DiffusionTerm(coeff=KAPPA, var=eta) + reaction + source
    equation.cacheMatrix(); equation.cacheRHSvector()
    bottom_mask = np.asarray(mesh.facesBottom); top_mask = np.asarray(mesh.facesTop)
    face_x = np.asarray(mesh.faceCenters[0])[bottom_mask]
    track = {"method": "FV", "lane": lane, "fields": [field_record("FV", lane, initial, 0.)], "steps": []}
    initial_trace = np.r_[worker.manufactured_field(np, face_x, np.zeros(8), 0.),
                          worker.manufactured_field(np, face_x, np.full(8,.5), 0.)]
    g0 = np.r_[np.ones(8),np.zeros(8)] if lane == "official-literal" else initial_trace
    track["initialBoundaryMismatch"] = (initial_trace-g0).tolist()
    RUN_PROGRESS["currentTrack"] = track
    class CountPCG(fipy.LinearPCGSolver):
        def _solve_(self, a, initial_state, b):
            self.calls += 1
            require(self.calls == 1, "SOLVE_COUNT")
            state, self.stop = fv_componentwise_solve(a, b, initial_state)
            self.actualIterations = self.stop["callbackCount"]
            return state
    for step in (1, 2):
        eta.updateOld(); old = np.array(eta.old.value)
        t_old = (step-1)*DT; t_new = step*DT
        ff = worker.manufactured_source(np, xy[0], xy[1], t_old); source.setValue(ff)
        bottom, top = worker.boundary_values(np, lane, face_x, t_new)
        gv = np.zeros(mesh.numberOfFaces); gv[bottom_mask] = bottom; gv[top_mask] = top
        face.setValue(gv)
        solver = CountPCG(criterion="RHS", tolerance=0., absolute_tolerance=0., iterations=2000, precon=None)
        solver.calls = 0
        RUN_PROGRESS["attemptedStep"] = {"method":"FV", "lane":lane, "step":step,
            "old":old.tolist(), "source":ff.tolist(), "sourceTime":t_old,
            "bottom":bottom.tolist(), "top":top.tolist()}
        equation.sweep(var=eta, dt=DT, solver=solver)
        raw_a = equation.matrix.matrix.tocsr(copy=True)
        raw_b = np.array(equation.RHSvector)
        state = np.array(eta.value)
        actual_faces = np.asarray(eta.faceValue)
        track["steps"].append({"step": step, "timeOld": t_old, "timeNew": t_new, "dt": DT,
            "sourceTime": t_old, "old": old.tolist(), "new": state.tolist(), "F": ff.tolist(),
            "A": csr_record(raw_a), "b": raw_b.tolist(), "normalization": DT/.015625,
            "bottom": bottom.tolist(), "top": top.tolist(),
            "actualBottom": actual_faces[bottom_mask].tolist(), "actualTop": actual_faces[top_mask].tolist(),
            "solveCount": solver.calls, "iterations": int(solver.actualIterations), "stop": solver.stop})
        track["fields"].append(field_record("FV", lane, state, t_new))
        if CHECKPOINT_WRITER is not None:
            CHECKPOINT_WRITER.write(f"checkpoint-FV-{lane}-{step}.json",
                                    {"step":track["steps"][-1],"field":track["fields"][-1]})
    return track


def baseline(runtime):
    guard()
    tracks = []
    for run in (fv_track, fem_track):
        for lane in LANES:
            track = run(lane)
            tracks.append(track)
            RUN_PROGRESS["completedTracks"] = tracks.copy()
            RUN_PROGRESS["currentTrack"] = None
            RUN_PROGRESS["attemptedStep"] = None
    allowed = {ROOT / r["path"] for r in runtime["snapshot"]["files"] if r["path"].endswith(".py")}
    runtime["after"] = inventory(worker, allowed)
    return {"schemaVersion": "tf.pfhub7a-r18b-tiny/0.1", "scope": {"Nx": 8, "Ny": 4, "Nt": 2, "dt": DT},
            "quantity": META, "quantityBases": BASES, "formalEligible": False, "rankingEligible": False, "physicalValidation": False,
            "runtime": runtime, "tracks": tracks,
            "quadratureRule": {"barycentric": quadrature()[0].tolist(), "weights": quadrature()[1].tolist()},
            "limitations": ["tiny interface only; no full-t8 or convergence certification",
                "literal-self requires later same-BVP refinement", "projection loses fine-scale information; no reverse reconstruction",
                "load quadrature sensitivity is not a forward-error bound", "host Darwin libraries not byte-locked",
                "no material calibration, identified causal effect, industrial or control authority"]}


class EvidenceWriter:
    def __init__(self, directory, limit_bytes):
        self.directory = Path(directory)
        require(self.directory.is_absolute(), "EVIDENCE_PATH")
        require(1024*1024 < limit_bytes <= 24*1024*1024, "EVIDENCE_BUDGET")
        self.limit_bytes = limit_bytes
        self.directory.mkdir(mode=0o700, parents=False, exist_ok=False)
        require(not self.directory.is_symlink() and self.directory.is_dir(), "EVIDENCE_PATH")

    def write(self, name, value, failure=False):
        allowed = {f"checkpoint-{method}-{lane}-{step}.json" for method in ("FV","P1") for lane in LANES for step in (1,2)}
        require(name in allowed | {"receipt.json", "tests.json", "failure.json"}, "EVIDENCE_PATH")
        data = encoded(value) + b"\n"
        files = list(self.directory.iterdir())
        require(all(p.is_file() and not p.is_symlink() for p in files), "EVIDENCE_PATH")
        used = sum(p.stat().st_size for p in files)
        limit = self.limit_bytes - (0 if failure else 1024*1024)
        require(used+len(data) <= limit, "EVIDENCE_BUDGET")
        with (self.directory/name).open("xb") as stream:
            stream.write(data)
