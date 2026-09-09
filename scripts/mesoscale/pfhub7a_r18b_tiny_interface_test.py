"""One shared baseline per bounded suite; semantic mutations never advance time."""
import argparse
import copy
import importlib.util
import json
from pathlib import Path
import sys
import unittest


spec=importlib.util.spec_from_file_location("r18b_interface",Path(__file__).with_name("pfhub7a_r18b_tiny_interface.py"))
h=importlib.util.module_from_spec(spec); sys.modules[spec.name]=h; spec.loader.exec_module(h)


def mutations(np):
    def set_value(path, value):
        def change(rec):
            node=rec
            for key in path[:-1]:
                node=node[key]
            before=copy.deepcopy(node[path[-1]])
            node[path[-1]]=value
            return {"path":path,"before":before,"after":value}
        return change
    def matrix_change(rec):
        path=["tracks",0,"steps",0,"A","data",0]
        return set_value(path,rec["tracks"][0]["steps"][0]["A"]["data"][0]+1e-4)(rec)
    def add_value(path, value):
        def change(rec):
            node=rec
            for key in path[:-1]:
                node=node[key]
            h.require(path[-1] not in node,"MUTATION_PRECONDITION")
            node[path[-1]]=copy.deepcopy(value)
            return {"path":path,"before":"missing","after":value}
        return change
    def remove_value(path):
        def change(rec):
            node=rec
            for key in path[:-1]:
                node=node[key]
            before=node.pop(path[-1])
            return {"path":path,"before":before,"after":"missing"}
        return change
    def state_change(rec):
        path=["tracks",0,"steps",0,"new",0]
        return set_value(path,rec["tracks"][0]["steps"][0]["new"][0]+1e-4)(rec)
    def wrong_native_info(rec):
        stop=rec["tracks"][0]["steps"][0]["stop"]
        value=0 if stop["nativeCgInfo"] is None else None
        return set_value(["tracks",0,"steps",0,"stop","nativeCgInfo"],value)(rec)
    def reverse_triangle(rec):
        tri=rec["tracks"][2]["triangles"][0]
        return set_value(["tracks",2,"triangles",0],[tri[0],tri[2],tri[1]])(rec)
    def wrong_rule(rec):
        bary=np.array(rec["quadratureRule"]["barycentric"])
        w=np.array(rec["quadratureRule"]["weights"])/(1-bary[:,1])
        return set_value(["quadratureRule","weights"],w.tolist())(rec)
    def mass_reaction(rec):
        tr=rec["tracks"][2]; old=np.array(tr["steps"][0]["old"])
        wrong=h.csr_read(tr["M"])@(-4*old*(old-1)*(old-.5))
        return set_value(["tracks",2,"steps",0,"R"],wrong.tolist())(rec)
    def old_boundary(rec):
        tr=rec["tracks"][2]; old=np.array(tr["steps"][0]["old"])
        old[tr["B"]]=np.r_[np.ones(8),np.zeros(8)]
        return set_value(["tracks",2,"steps",0,"old"],old.tolist())(rec)
    def omit_boundary_mass(rec):
        tr=rec["tracks"][2]; step=tr["steps"][0]; m=h.csr_read(tr["M"])
        correction=m[tr["I"]][:,tr["B"]]@np.array(step["old"])[tr["B"]]
        return set_value(["tracks",2,"steps",0,"b"],(np.array(step["b"])-correction).tolist())(rec)
    def omit_source_balance(rec):
        step=rec["tracks"][2]["steps"][0]
        return set_value(["tracks",2,"steps",0,"d"],(np.array(step["d"])+.01*np.array(step["F"])).tolist())(rec)
    def flip_boundary(rec):
        step=rec["tracks"][2]["steps"][0]
        return set_value(["tracks",2,"steps",0,"boundaryReaction"],(-np.array(step["boundaryReaction"])).tolist())(rec)
    def no_old(rec):
        before=rec["tracks"][0]["steps"][0].pop("old")
        return {"path":["tracks",0,"steps",0,"old"],"before":before,"after":"missing"}
    def actual_source_time(rec):
        step=rec["tracks"][0]["steps"][0]
        x=np.tile((np.arange(8)+.5)/8,4); y=np.repeat((np.arange(4)+.5)/8,8)
        ff=h.worker.manufactured_source(np,x,y,step["timeNew"])
        before={"F":step["F"],"b":step["b"]}
        step["b"]=(np.array(step["b"])+.015625*(ff-np.array(step["F"]))).tolist()
        step["F"]=ff.tolist()
        return {"path":["tracks",0,"steps",0],"changedFields":["F","b"],"before":before,
                "after":{"F":step["F"],"b":step["b"]},"claimedSourceTimeUnchanged":step["sourceTime"]}
    def actual_q2(rec):
        tr=rec["tracks"][2]; step=tr["steps"][0]
        before={"F":step["F"],"b":step["b"]}; q2=np.array(step["forcesQ"][2])
        step["b"]=(np.array(step["b"])+.01*(q2-np.array(step["F"]))[tr["I"]]).tolist()
        step["F"]=q2.tolist()
        return {"path":["tracks",2,"steps",0],"changedFields":["F","b"],"before":before,
                "after":{"F":step["F"],"b":step["b"]},"claimedRuleUnchanged":step["actualForcingRule"]}
    return [
        ("T01-M01-lock","RUNTIME_IDENTITY",set_value(["runtime","lockSha256"],"0"*64)),
        ("T02-M01-nx","SCOPE_EXCEEDED",set_value(["scope","Nx"],16)),
        ("T02-M02-nt","SCOPE_EXCEEDED",set_value(["scope","Nt"],3)),
        ("T03-M01-csr","OPERATOR_DIGEST",matrix_change),
        ("T04-M01-periodic","PERIODIC_MAP",set_value(["tracks",2,"mapping",8],8)),
        ("T04-M02-orientation","ORIENTATION",reverse_triangle),
        ("T05-M01-jacobian","QUADRATURE_POLYNOMIAL",wrong_rule),
        ("T06-M01-mass-reaction","REACTION_ASSEMBLY",mass_reaction),
        ("T07-M01-old-boundary","OLD_BOUNDARY_STATE",old_boundary),
        ("T07-M02-mass-boundary","BOUNDARY_ELIMINATION",omit_boundary_mass),
        ("T08-M01-state","ALGEBRAIC_RESIDUAL",state_change),
        ("T08-M02-source-time","SOURCE_SCHEDULE",actual_source_time),
        ("T08-M03-source-time-metadata","SOURCE_SCHEDULE",set_value(["tracks",0,"steps",0,"sourceTime"],.01)),
        ("T08-M04-stop-owner","STOP_CERTIFICATE",set_value(["tracks",0,"steps",0,"stop","terminationOwner"],"scipy-native-global")),
        ("T08-M05-stop-system","STOP_CERTIFICATE",set_value(["tracks",0,"steps",0,"stop","certificate","Asha256"],"0"*64)),
        ("T08-M06-stop-native-info","STOP_CERTIFICATE",wrong_native_info),
        ("T08-M07-stop-state","STOP_CERTIFICATE",set_value(["tracks",0,"steps",0,"stop","certificate","xsha256"],"0"*64)),
        ("T09-M01-omitted-source","BALANCE_DEFINITION",omit_source_balance),
        ("T09-M02-boundary-sign","BALANCE_DEFINITION",flip_boundary),
        ("T10-M04-omitted-boundary-dofs-metadata","FULL_DOF_LOAD",set_value(["tracks",2,"steps",0,"loadDOFs"],list(range(8,32)))),
        ("T10-M02-actual-q2","ACTUAL_FORCING_RULE",actual_q2),
        ("T10-M03-q2-metadata","ACTUAL_FORCING_RULE",set_value(["tracks",2,"steps",0,"actualForcingRule"],"Q2")),
        ("T11-M01-missing-old","CHECKPOINT_INPUT",no_old),
        ("T11-M02-projection-native","OBSERVATION_BASIS",set_value(["tracks",0,"fields",0,"projectionBasis"],"native-error")),
        ("T11-M03-fv-extra-native-q","METHOD_FIELD_SEPARATION",add_value(["tracks",0,"fields",0,"nativeL2Q"],[1.,2.,3.])),
        ("T11-M04-p1-extra-native","METHOD_FIELD_SEPARATION",add_value(["tracks",2,"fields",0,"nativeL2"],1.)),
        ("T11-M05-fv-missing-native","METHOD_FIELD_SEPARATION",remove_value(["tracks",0,"fields",0,"nativeL2"])),
        ("T11-M06-p1-missing-native-q","METHOD_FIELD_SEPARATION",remove_value(["tracks",2,"fields",0,"nativeL2Q"])),
        ("T11-M07-fv-extra-p1-step","METHOD_FIELD_SEPARATION",add_value(["tracks",0,"steps",0,"R"],[1.]*40)),
        ("T11-M08-p1-extra-fv-step","METHOD_FIELD_SEPARATION",add_value(["tracks",2,"steps",0,"normalization"],.64)),
        ("T11-M09-fv-extra-p1-track","METHOD_FIELD_SEPARATION",lambda rec:add_value(["tracks",0,"M"],rec["tracks"][2]["M"])(rec)),
        ("T11-M10-p1-extra-track","METHOD_FIELD_SEPARATION",add_value(["tracks",2,"normalization"],.64)),
        ("T12-M01-nonfinite","NONFINITE",set_value(["tracks",0,"steps",0,"new",0],float("nan"))),
        ("T12-M02-missing-track","INCOMPLETE_TRACKS",lambda rec:set_value(["tracks"],rec["tracks"][:3])(rec)),
        ("T12-M03-formal","CLAIM_BOUNDARY",set_value(["formalEligible"],True)),
        ("T12-M04-version","SCHEMA_VERSION",set_value(["schemaVersion"],"tf.pfhub7a-r18b-tiny/0.0")),
        ("T12-M05-dimension","QUANTITY_BASIS",set_value(["quantity","dimension"],"length")),
        ("T12-M06-basis","QUANTITY_BASIS",set_value(["quantity","basis"],"SI")),
        ("T12-M07-lane","SCIENTIFIC_LANE",set_value(["tracks",0,"fields",0,"scientificLabel"],"strict MMS error")),
    ]


def json_safe(value):
    # Diagnostics only: malformed NaN mutation remains in memory for actual rejection.
    import math
    if isinstance(value,float) and not math.isfinite(value):
        return {"nonfiniteToken":str(value)}
    if isinstance(value,dict):
        return {k:json_safe(v) for k,v in value.items()}
    if isinstance(value,list):
        return [json_safe(v) for v in value]
    return value


def stopping_protocol_tests(h):
    """v9 STOP01--06: manufactured algebra only; fake callable, never SciPy CG.

    Root must check every returned group['passed'] before starting the baseline.
    This fragment does not import or inspect any historical numerical evidence.
    """
    import copy
    import math

    np = h.np
    groups = []

    def safe(value):
        if isinstance(value, np.ndarray):
            return safe(value.tolist())
        if isinstance(value, np.generic):
            return safe(value.item())
        if isinstance(value, float) and not math.isfinite(value):
            return {"nonfinite": "positive-infinity" if value > 0 else
                    "negative-infinity" if value < 0 else "NaN"}
        if isinstance(value, dict):
            return {str(k): safe(v) for k, v in value.items()}
        if isinstance(value, (tuple, list)):
            return [safe(v) for v in value]
        return value

    def check(condition, detail):
        if not condition:
            raise AssertionError(detail)

    def group(name):
        record = {"id": name, "basis": "manufactured 2x2 SPD algebra / fake-CG protocol",
                  "pdeSteps": 0, "actualCgCalls": 0, "physicalValidation": False, "subcases": []}
        groups.append(record)
        return record

    def case(target, name, expected, function):
        observed, detail = "PASS", None
        try:
            detail = function()
        except Exception as exc:
            observed = getattr(exc, "code", type(exc).__name__)
            detail = {"exception": type(exc).__name__, "detail": str(exc)}
        target["subcases"].append({"id": name, "expected": expected, "observed": observed,
                                   "passed": observed == expected, "detail": safe(detail)})

    def ordinary():
        return (h.sp.csr_matrix([[2., 0.], [0., 3.]], dtype=np.float64),
                np.array([2., 3.]), np.array([0., 0.]), np.array([1., 1.]))

    def policy(kwargs):
        check(set(kwargs) == {"rtol", "atol", "maxiter", "M", "callback"}, "unexpected fake kwargs")
        check(kwargs["rtol"] == 0. and kwargs["atol"] == 0. and kwargs["maxiter"] == 2000
              and kwargs["M"] is None and callable(kwargs["callback"]), "effective policy mismatch")

    def record_check(a, b, state, record, mode, calls, callbacks):
        check(record["terminationOwner"] == "project-true-componentwise", "owner")
        check(record["mode"] == mode, "mode")
        check(record["nativeCgInfo"] is None if mode == "callback-certificate"
              else type(record["nativeCgInfo"]) is int and record["nativeCgInfo"] == 0, "native info")
        check(record["effectiveRtol"] == 0. and record["effectiveAtol"] == 0.
              and record["maxIterations"] == 2000 and record["preconditioner"] == "none", "record policy")
        check(record["adapterCalls"] == 1 and record["cgCalls"] == calls
              and record["callbackCount"] == callbacks, "record counts")
        check(record["unit"] == "1" and record["dimension"] == "dimensionless", "quantity metadata")
        check(all(isinstance(record[k], str) and record[k] for k in ("equationBasis", "ratioBasis")), "basis")
        h.check_stop_certificate(a, b, state, record["certificate"])

    g1 = group("STOP-01")

    def small_row(bad):
        a = h.sp.csr_matrix([[1e-20, 0.], [0., 1.]], dtype=np.float64)
        b = np.array([0., 1.]); x = np.array([1., 1.]) if bad else np.array([0., 1.])
        if bad:
            metrics = h.stop_metrics(a, b, x)
            check(metrics["l2"] <= 1e-12 and metrics["componentwise"] > 1e-11,
                  "manufactured global/componentwise distinction not observed")
        cert = h.stop_certificate(a, b, x)
        h.check_stop_certificate(a, b, x, cert)
        return {"state": x, "certificate": cert}

    case(g1, "STOP-01-global-small-componentwise-fail", "COMPONENTWISE_NOT_SATISFIED", lambda: small_row(True))
    case(g1, "STOP-01-exact-manufactured-pass", "PASS", lambda: small_row(False))

    g2 = group("STOP-02")

    def successive():
        a, b, initial, good = ordinary(); calls = [0]; seen = []
        def fake(aa, bb, x0, **kwargs):
            calls[0] += 1; policy(kwargs)
            check(np.array_equal(x0, initial), "changed initial state")
            first = np.array([.5, .5]); seen.append(first.tolist()); kwargs["callback"](first)
            seen.append(good.tolist()); kwargs["callback"](good.copy())
            raise AssertionError("passing callback did not terminate")
        state, rec = h.test_only_componentwise_protocol(fake, a, b, initial)
        check(calls[0] == 1 and np.array_equal(state, good) and len(seen) == 2, "fake invocation/state")
        record_check(a, b, state, rec, "callback-certificate", 1, 2)
        return {"externalFakeCalls": calls[0], "suppliedIterates": seen, "record": rec, "state": state}
    case(g2, "STOP-02-one-call-two-callbacks", "PASS", successive)

    g3 = group("STOP-03")

    def actual_policy():
        a, b, initial, good = ordinary(); calls = [0]; captured = {}
        def fake(aa, bb, x0, **kwargs):
            calls[0] += 1; policy(kwargs)
            captured.update({k: kwargs[k] for k in ("rtol", "atol", "maxiter", "M")})
            return good.copy(), 0
        state, rec = h.test_only_componentwise_protocol(fake, a, b, initial)
        check(calls[0] == 1, "fake call count")
        record_check(a, b, state, rec, "native-return-certified", 1, 0)
        return {"actualKwargs": captured, "externalFakeCalls": calls[0], "record": rec}
    case(g3, "STOP-03-actual-kwargs", "PASS", actual_policy)

    for key, value in (("rtol", 1e-12), ("atol", 1e-14), ("maxiter", 1999), ("M", "unexpected")):
        def bad_policy(key=key, value=value):
            a, b, initial, good = ordinary(); calls = [0]
            def fake(*args, **kwargs):
                calls[0] += 1
                return good.copy(), 0
            requested = {"rtol": 0., "atol": 0., "maxiter": 2000, "M": None}
            requested[key] = value
            try:
                h.test_only_componentwise_protocol(fake, a, b, initial, policy=requested)
            finally:
                check(calls[0] == 0, "bad policy reached fake")
        case(g3, "STOP-03-reject-" + key, "POLICY_MISMATCH", bad_policy)

    g4 = group("STOP-04")
    def zero_zero():
        value = h.stop_ratio(0., 0.)
        check(value == 0., "zero/zero")
        return {"ratio": value}
    def nonzero_zero():
        value = h.stop_ratio(1., 0.)
        check(math.isinf(value) and value > 0, "nonzero/zero")
        return {"ratio": value, "admissible": False}
    case(g4, "STOP-04-zero-zero", "PASS", zero_zero)
    case(g4, "STOP-04-nonzero-zero", "PASS", nonzero_zero)
    for label, pair in (("nan-r", (float("nan"), 1.)), ("infinite-s", (1., float("inf")))):
        case(g4, "STOP-04-" + label, "STOP_NONFINITE", lambda pair=pair: h.stop_ratio(*pair))

    def initial_good():
        a, b, _, good = ordinary(); calls = [0]
        def fake(*args, **kwargs):
            calls[0] += 1
            return good.copy(), 0
        try:
            h.test_only_componentwise_protocol(fake, a, b, good.copy())
        finally:
            check(calls[0] == 0, "initial pass reached fake")
    case(g4, "STOP-04-initially-certified", "INITIAL_ALREADY_SOLVED_REQUIRES_DISPOSITION", initial_good)

    def invalid_input(which):
        a, b, initial, _ = ordinary()
        if which == "matrix":
            a.data[0] = float("inf")
        elif which == "rhs":
            b[0] = float("nan")
        else:
            initial[0] = float("inf")
        with np.errstate(all="ignore"):
            return h.stop_metrics(a, b, initial)
    for which in ("matrix", "rhs", "state"):
        case(g4, "STOP-04-nonfinite-" + which, "STOP_NONFINITE", lambda which=which: invalid_input(which))

    def intermediate_overflow(kind):
        if kind == "product":
            a = h.sp.csr_matrix([[1e308, 0.], [0., 1.]], dtype=np.float64)
            x = np.array([2., 1.]); b = np.zeros(2)
        elif kind == "sum":
            a = h.sp.csr_matrix([[1e308, 5e307], [5e307, 1e308]], dtype=np.float64)
            x = np.array([1.5, 1.5]); b = np.zeros(2)
        elif kind == "norm":
            a = h.sp.csr_matrix([[1., 0.], [0., 1.]], dtype=np.float64)
            x = np.array([1.7e308, 1.7e308]); b = np.zeros(2)
        else:
            with np.errstate(all="ignore"):
                return h.stop_ratio(1e308, 1e-308)
        with np.errstate(all="ignore"):
            return h.stop_metrics(a, b, x)
    for kind in ("product", "sum", "norm", "ratio"):
        case(g4, "STOP-04-finite-input-" + kind + "-overflow", "STOP_NONFINITE",
             lambda kind=kind: intermediate_overflow(kind))

    g5 = group("STOP-05")

    def alien_exception():
        a, b, initial, _ = ordinary(); calls = [0]
        alien = RuntimeError("manufactured alien exception")
        def fake(*args, **kwargs):
            calls[0] += 1
            raise alien
        try:
            h.test_only_componentwise_protocol(fake, a, b, initial)
        except Exception as exc:
            check(exc is alien and calls[0] == 1, "alien was transformed/swallowed")
            return {"sameExceptionObject": True, "externalFakeCalls": calls[0]}
        raise AssertionError("alien swallowed")
    case(g5, "STOP-05-alien-propagates", "PASS", alien_exception)

    def returned(info, good_result):
        a, b, initial, good = ordinary(); calls = [0]
        def fake(aa, bb, x0, **kwargs):
            calls[0] += 1; policy(kwargs)
            return (good.copy() if good_result else np.array([.5, .5])), info
        try:
            state, rec = h.test_only_componentwise_protocol(fake, a, b, initial)
        finally:
            check(calls[0] == 1, "native-return fake count")
        record_check(a, b, state, rec, "native-return-certified", 1, 0)
        return {"externalFakeCalls": calls[0], "record": rec}
    case(g5, "STOP-05-info-zero-bad-state", "CG_RETURN_WITHOUT_CERTIFICATE", lambda: returned(0, False))
    case(g5, "STOP-05-info-zero-good-state", "PASS", lambda: returned(0, True))
    case(g5, "STOP-05-maxiter-even-good-state", "CG_NATIVE_FAILURE", lambda: returned(2000, True))
    case(g5, "STOP-05-negative-info-even-good-state", "CG_NATIVE_FAILURE", lambda: returned(-1, True))

    def copy_before_raise():
        a, b, initial, good = ordinary(); calls = [0]; original = good.copy(); captured = [False]
        def fake(aa, bb, x0, **kwargs):
            calls[0] += 1; policy(kwargs)
            try:
                kwargs["callback"](original)
            except Exception:
                captured[0] = True
                original[:] = -99.
                raise
            raise AssertionError("passing callback did not raise")
        state, rec = h.test_only_componentwise_protocol(fake, a, b, initial)
        check(calls[0] == 1 and captured[0] and np.array_equal(state, good), "accepted state aliased fake input")
        check(not np.shares_memory(state, original), "accepted state shares fake memory")
        record_check(a, b, state, rec, "callback-certificate", 1, 1)
        return {"externalFakeCalls": calls[0], "mutatedOriginal": original,
                "preservedState": state, "record": rec}
    case(g5, "STOP-05-callback-copy-before-original-mutation", "PASS", copy_before_raise)

    def earlier_invocation_exception():
        a, b, initial, good = ordinary(); calls = [0, 0]; prior = []
        def first(aa, bb, x0, **kwargs):
            calls[0] += 1
            try:
                kwargs["callback"](good.copy())
            except Exception as exc:
                prior.append(exc)
                raise
        h.test_only_componentwise_protocol(first, a, b, initial)
        check(len(prior) == 1, "no invocation-owned stop captured")
        def second(*args, **kwargs):
            calls[1] += 1
            raise prior[0]
        try:
            h.test_only_componentwise_protocol(second, a, b, initial)
        except Exception as exc:
            check(exc is prior[0] and calls == [1, 1], "unbound stop accepted or transformed")
            return {"externalFakeCallsByInvocation": calls, "priorStopPropagated": True}
        raise AssertionError("prior invocation stop accepted")
    case(g5, "STOP-05-prior-invocation-stop-not-owned", "PASS", earlier_invocation_exception)

    g6 = group("STOP-06")

    def certificate_drift(kind):
        a, b, _, good = ordinary()
        cert = copy.deepcopy(h.stop_certificate(a, b, good))
        if kind == "matrix":
            a.data[0] += 1.
        elif kind == "rhs":
            b[0] += .125
        elif kind == "state":
            good[0] += .125
        elif kind == "scalar":
            cert["residual"]["componentwise"] = 1e-4
        elif kind == "l2":
            cert["residual"]["l2"] = 1e-4
        elif kind == "linf":
            cert["residual"]["linf"] = 1e-4
        else:
            cert[kind] = "0" * 64
        return h.check_stop_certificate(a, b, good, cert)
    for kind in ("matrix", "rhs", "state", "scalar", "l2", "linf", "Asha256", "bsha256", "xsha256"):
        case(g6, "STOP-06-certificate-" + kind + "-drift", "STALE_STOP_CERTIFICATE",
             lambda kind=kind: certificate_drift(kind))

    def during_fake(kind, use_callback):
        a, b, initial, good = ordinary(); calls = [0]
        def fake(aa, bb, x0, **kwargs):
            calls[0] += 1
            if kind == "matrix":
                aa.data[0] += 1.
            else:
                bb[0] += .125
            if use_callback:
                kwargs["callback"](good.copy())
            return good.copy(), 0
        try:
            h.test_only_componentwise_protocol(fake, a, b, initial)
        finally:
            check(calls[0] == 1, "drift caused extra fake call")
    for kind in ("matrix", "rhs"):
        for callback in (True, False):
            case(g6, "STOP-06-invocation-" + kind + ("-callback" if callback else "-return"),
                 "STALE_STOP_CERTIFICATE", lambda kind=kind, callback=callback: during_fake(kind, callback))

    for result in groups:
        result["passed"] = bool(result["subcases"]) and all(item["passed"] for item in result["subcases"])
    return groups


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--evidence-dir",required=True)
    parser.add_argument("--source-snapshot",required=True)
    parser.add_argument("--evidence-limit-bytes",type=int,required=True)
    args=parser.parse_args()
    writer=h.EvidenceWriter(args.evidence_dir,args.evidence_limit_bytes)
    h.CHECKPOINT_WRITER=writer
    report={"status":"running","baselineGlobalStepsUpperBound":8,"mutationTrajectorySteps":0,
            "tests":[],"formalEligible":False,"fullConvergenceComplete":False}
    try:
        runtime=h.initialize(args.source_snapshot)
        verifier=h.load_module("r18b_verifier","pfhub7a_r18b_tiny_verify.py")
        # Imports precede trajectory; T01 inventories the complete numerical interface.
        h.load_module("r18b_oracle","pfhub7a_r18b_tiny_oracle.py")
        allowed={h.ROOT/r["path"] for r in runtime["snapshot"]["files"] if r["path"].endswith(".py")}
        runtime["before"]=h.inventory(h.worker,allowed)
        report["stoppingProtocolTests"] = stopping_protocol_tests(h)
        h.require(len(report["stoppingProtocolTests"]) == 6 and
                  all(group["passed"] for group in report["stoppingProtocolTests"]), "STOP_PROTOCOL_TEST_FAILED")
        receipt=h.baseline(runtime)
        writer.write("receipt.json",receipt)
        cache={}
        result=verifier.verify(receipt,runtime["snapshot"],cache)
        report["baseline"]=result
        suite=unittest.TestSuite()
        for test_id,expected,mutate in mutations(h.np):
            def check(test_id=test_id,expected=expected,mutate=mutate):
                changed=copy.deepcopy(receipt); delta=mutate(changed)
                observed="ACCEPTED"
                try:
                    verifier.verify(changed,runtime["snapshot"],cache)
                except h.Rejected as exc:
                    observed=exc.code
                except Exception as exc:
                    observed="UNEXPECTED_"+type(exc).__name__
                record={"id":test_id,"expected":expected,"observed":observed,
                        "passed":observed==expected,"mutation":json_safe(delta)}
                report["tests"].append(record)
                if observed!=expected:
                    raise AssertionError(f"{test_id}: expected {expected}, observed {observed}")
            suite.addTest(unittest.FunctionTestCase(check,description=test_id))
        def scope_guard(test_id, kwargs):
            observed="ACCEPTED"
            try:
                h.guard(**kwargs)
            except h.Rejected as exc:
                observed=exc.code
            report["tests"].append({"id":test_id,"expected":"SCOPE_EXCEEDED",
                "observed":observed,"passed":observed=="SCOPE_EXCEEDED","allocatedDenseMatrix":False})
            if observed!="SCOPE_EXCEEDED":
                raise AssertionError(observed)
        for test_id,kwargs in (("T02-M03-nontiny-dense",{"nx":256,"ny":128,"dense":True}),
                               ("T02-M04-nx-before-solve",{"nx":16}), ("T02-M05-nt-before-solve",{"nt":3})):
            suite.addTest(unittest.FunctionTestCase(lambda test_id=test_id,kwargs=kwargs:scope_guard(test_id,kwargs)))
        def boundary_only_sensitivity():
            np=h.np; tr=receipt["tracks"][2]; w=np.array(tr["w"])
            interior=np.array(tr["I"]); boundary=np.array(tr["B"])
            df=np.zeros(40); df[boundary]=w[boundary]/.01
            actual=h.load_sensitivity(w,df,interior,boundary)
            verifier.verify_load_sensitivity(w,df,interior,boundary,actual)
            # Incorrect assembly drops B but keeps a full-DOF interpretation.
            z=.01*df/w; squared=w*z*z
            wrong={"full":float(np.sqrt(squared[interior].sum())),
                   "interiorSquared":float(squared[interior].sum()),"boundarySquared":0.}
            observed="ACCEPTED"
            try:
                verifier.verify_load_sensitivity(w,df,interior,boundary,wrong)
            except h.Rejected as exc:
                observed=exc.code
            report["tests"].append({"id":"T10-M01-omitted-boundary-dofs","expected":"FULL_DOF_LOAD",
                "observed":observed,"passed":observed=="FULL_DOF_LOAD","syntheticLoadOnly":True,
                "newTrajectorySteps":0,"w":w.tolist(),"deltaForce":df.tolist(),"fullDOFClaim":list(range(40)),
                "actualProductionResult":actual,"wrongInteriorOnlyResult":wrong,
                "absoluteFullDifference":abs(actual["full"]-wrong["full"]),
                "fullComparisonThreshold":512*h.EPS*max(1.,abs(actual["full"])),
                "basis":"manufactured algebraic boundary-only load, no physical validation"})
            if observed!="FULL_DOF_LOAD":
                raise AssertionError(observed)
        suite.addTest(unittest.FunctionTestCase(boundary_only_sensitivity))
        outcome=unittest.TextTestRunner(stream=sys.stderr,verbosity=1).run(suite)
        report["status"]="pass-for-tiny-interface-only" if outcome.wasSuccessful() else "failed"
        report["baselineGlobalStepsActual"]=8
        report["afterTestsInventory"]=h.inventory(h.worker,allowed)
        writer.write("tests.json",report)
        print(json.dumps({"status":report["status"],"mutationCount":len(report["tests"]),
                          "evidenceDir":str(writer.directory),"fullConvergenceComplete":False}))
        return 0 if outcome.wasSuccessful() else 1
    except Exception as exc:
        report.update(status="abstain",reason=getattr(exc,"code",type(exc).__name__),detail=str(exc))
        report["partialNumericalEvidence"]=json_safe(h.RUN_PROGRESS)
        writer.write("failure.json",report,failure=True)
        raise


if __name__=="__main__":
    sys.exit(main())
