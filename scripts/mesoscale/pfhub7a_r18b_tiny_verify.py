"""Read-only R18b stored-equation replay. Never advances a trajectory."""
import argparse
import importlib.util
import json
from pathlib import Path
import sys


def bootstrap():
    name = "r18b_interface"
    if name in sys.modules:
        return sys.modules[name]
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name("pfhub7a_r18b_tiny_interface.py"))
    module = importlib.util.module_from_spec(spec); sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


h = bootstrap()


def validate_schema(value, schema, root):
    """Small explicit interpreter for only the keywords in this frozen schema."""
    if "oneOf" in schema:
        matches = 0
        for branch in schema["oneOf"]:
            try:
                validate_schema(value, branch, root)
                matches += 1
            except h.Rejected as exc:
                if exc.code != "SCHEMA":
                    raise
        h.require(matches == 1, "SCHEMA")
    if "$ref" in schema:
        target=root
        for part in schema["$ref"].split("/")[1:]:
            target=target[part]
        return validate_schema(value,target,root)
    if "const" in schema:
        h.require(type(value) is type(schema["const"]) and value==schema["const"],"SCHEMA")
    if "enum" in schema:
        h.require(any(type(value) is type(v) and value==v for v in schema["enum"]),"SCHEMA")
    kind=schema.get("type")
    if kind:
        types={"object":dict,"array":list,"number":(int,float),"integer":int,"string":str,"null":type(None)}
        h.require(isinstance(value,types[kind]) and not (kind in ("number","integer") and isinstance(value,bool)),"SCHEMA")
    if type(value) in (int, float):
        h.require("minimum" not in schema or value >= schema["minimum"], "SCHEMA")
        h.require("maximum" not in schema or value <= schema["maximum"], "SCHEMA")
    if isinstance(value,dict):
        h.require(all(k in value for k in schema.get("required",[])),"SCHEMA")
        props=schema.get("properties",{})
        extra=schema.get("additionalProperties",True)
        for key,item in value.items():
            if key in props:
                validate_schema(item,props[key],root)
            elif extra is False:
                raise h.Rejected("SCHEMA")
            elif isinstance(extra,dict):
                validate_schema(item,extra,root)
    if isinstance(value,list):
        h.require(schema.get("minItems",0)<=len(value)<=schema.get("maxItems",len(value)),"SCHEMA")
        if "items" in schema:
            for item in value:
                validate_schema(item,schema["items"],root)


def validate_method_fields(track):
    """Reject foreign scientific channels before any method-specific numerical use."""
    method = track["method"]
    common_track = {"method", "lane", "fields", "steps", "initialBoundaryMismatch"}
    common_field = {"time", "state", "projectionBasis", "projection", "nativeBasis", "scientificLabel"}
    common_step = {"step", "timeOld", "timeNew", "dt", "sourceTime", "old", "new", "A", "b", "F",
                   "solveCount", "iterations"}
    if method == "FV":
        track_keys = common_track
        field_keys = common_field | {"nativeL2"}
        step_keys = common_step | {"normalization", "bottom", "top", "actualBottom", "actualTop", "stop"}
    elif method == "P1":
        track_keys = common_track | {"coords", "mapping", "triangles", "I", "B", "M", "K", "w"}
        field_keys = common_field | {"nativeL2Q"}
        step_keys = common_step | {"g", "R", "forcesQ", "actualForcingRule", "loadDOFs", "loadSensitivity",
                                   "relativeForceSensitivity", "relativeForceReason", "d", "boundaryReaction",
                                   "C", "solverInfo"}
    else:
        raise h.Rejected("METHOD_FIELD_SEPARATION")
    h.require(set(track) == track_keys, "METHOD_FIELD_SEPARATION")
    for saved in track["fields"]:
        h.require(set(saved) == field_keys, "METHOD_FIELD_SEPARATION")
    for step in track["steps"]:
        h.require("old" in step and "new" in step, "CHECKPOINT_INPUT")
        h.require(set(step) == step_keys, "METHOD_FIELD_SEPARATION")


def finite(value):
    import math
    if isinstance(value, float):
        h.require(math.isfinite(value), "NONFINITE")
    elif isinstance(value, dict):
        for item in value.values():
            finite(item)
    elif isinstance(value, list):
        for item in value:
            finite(item)


def close(actual, expected, factor, code):
    np = h.np
    actual, expected = np.asarray(actual), np.asarray(expected)
    h.require(actual.shape == expected.shape, code)
    h.require(bool(np.all(np.abs(actual-expected) <= factor*max(1., float(np.max(np.abs(expected)))))), code)


def residual(a, b, u):
    np=h.np
    r=a@u-b; s=abs(a)@abs(u)+abs(b)
    h.require(bool(np.all((s != 0) | (r == 0))), "ALGEBRAIC_RESIDUAL")
    ratio=np.divide(abs(r), s, out=np.zeros_like(r), where=s != 0)
    h.require(float(ratio.max()) <= 1e-11, "ALGEBRAIC_RESIDUAL")
    return {"componentwise": float(ratio.max()), "linf": float(abs(r).max()), "l2": float(np.linalg.norm(r))}


def verify_load_sensitivity(weights, delta_force, interior, boundary, actual):
    np=h.np
    sq=np.array([float(w)*(.01*float(df)/float(w))**2 for w,df in zip(weights,delta_force)])
    expected={"full":float(np.sqrt(sq.sum())),"interiorSquared":float(sq[interior].sum()),
              "boundarySquared":float(sq[boundary].sum())}
    for key in expected:
        close(actual[key],expected[key],512*h.EPS,"FULL_DOF_LOAD")


def verify_fv_stop(stop, step, a, b, state, actual_residual):
    """Independent saved-state admission; never trust producer certificate scalars."""
    fixed = {"terminationOwner": "project-true-componentwise", "effectiveRtol": 0, "effectiveAtol": 0,
             "maxIterations": 2000, "preconditioner": "none", "adapterCalls": 1, "cgCalls": 1,
             "unit": "1", "dimension": "dimensionless", "equationBasis": "FV actual cell-area/time equation",
             "ratioBasis": "max abs(A*x-b)/(abs(A)*abs(x)+abs(b)); componentwise backward residual, not forward error"}
    h.require(set(stop) == set(fixed) | {"mode", "nativeCgInfo", "callbackCount", "certificate"}, "STOP_CERTIFICATE")
    h.require(all(type(stop[k]) is type(v) and stop[k] == v for k, v in fixed.items()), "STOP_CERTIFICATE")
    count = stop["callbackCount"]
    h.require(type(count) is int and 0 <= count <= 2000 and count == step["iterations"], "STOP_CERTIFICATE")
    if stop["mode"] == "callback-certificate":
        h.require(stop["nativeCgInfo"] is None and count > 0, "STOP_CERTIFICATE")
    else:
        h.require(stop["mode"] == "native-return-certified" and type(stop["nativeCgInfo"]) is int and
                  stop["nativeCgInfo"] == 0, "STOP_CERTIFICATE")
    expected = {"Asha256": h.csr_record(a)["sha256"], "bsha256": h.digest(b.tolist()),
                "xsha256": h.digest(state.tolist()), "residual": actual_residual}
    h.require(stop["certificate"] == expected, "STOP_CERTIFICATE")


def verify(receipt, snapshot, cache=None):
    np=h.np; eps=h.EPS
    oracle=h.load_module("r18b_oracle", "pfhub7a_r18b_tiny_oracle.py")
    finite(receipt)
    h.require(set(receipt) == {"schemaVersion", "scope", "quantity", "formalEligible", "rankingEligible",
                             "physicalValidation", "runtime", "tracks", "quadratureRule", "limitations", "quantityBases"}, "SCHEMA")
    h.require(receipt["schemaVersion"] == "tf.pfhub7a-r18b-tiny/0.1", "SCHEMA_VERSION")
    h.require(receipt["quantity"] == h.META, "QUANTITY_BASIS")
    h.require(receipt["quantityBases"] == h.BASES,"QUANTITY_BASIS")
    h.require(all(receipt[k] is False for k in ("formalEligible", "rankingEligible", "physicalValidation")), "CLAIM_BOUNDARY")
    h.require(receipt["runtime"]["lockSha256"] == h.LOCK and receipt["runtime"]["snapshot"] == snapshot,
              "RUNTIME_IDENTITY")
    h.require(receipt["scope"] == {"Nx": 8, "Ny": 4, "Nt": 2, "dt": .01}, "SCOPE_EXCEEDED")
    tracks=receipt["tracks"]
    h.require(len(tracks) == 4 and {(t["method"],t["lane"]) for t in tracks} ==
              {(m,l) for m in ("FV","P1") for l in h.LANES}, "INCOMPLETE_TRACKS")
    bary=np.array(receipt["quadratureRule"]["barycentric"]); qw=np.array(receipt["quadratureRule"]["weights"])
    import math
    for a in range(5):
        for b in range(5-a):
            terms=qw*bary[:,1]**a*bary[:,2]**b
            exact=math.factorial(a)*math.factorial(b)/math.factorial(a+b+2)
            h.require(abs(terms.sum()-exact) <= 256*eps*abs(terms).sum(), "QUADRATURE_POLYNOMIAL")
    if cache is None:
        cache={}
    def cached(key, fn):
        if key not in cache:
            cache[key]=fn()
        return cache[key]
    results=[]
    for track in tracks:
        method, lane=track["method"],track["lane"]
        h.require(len(track["fields"]) == 3 and len(track["steps"]) == 2, "CHECKPOINT_INPUT")
        validate_method_fields(track)
        if method == "P1":
            coords=np.array(track["coords"]); mapping=np.array(track["mapping"]); triangles=np.array(track["triangles"])
            rc, rm, rt=oracle.geometry_reference()
            h.require(np.array_equal(coords,rc) and np.array_equal(mapping,rm), "PERIODIC_MAP")
            for tri in triangles:
                p=coords[tri]
                h.require(np.linalg.det(np.column_stack([p[1]-p[0],p[2]-p[0]])) > 0, "ORIENTATION")
            h.require(np.array_equal(triangles,rt), "ORIENTATION")
            interior=np.array(track["I"]); boundary=np.array(track["B"])
            h.require(np.array_equal(interior,np.arange(8,32)) and np.array_equal(boundary,np.r_[np.arange(8),np.arange(32,40)]), "PERIODIC_MAP")
            m=h.csr_read(track["M"]); k=h.csr_read(track["K"])
            mr,kr=cached("MK",lambda:oracle.dense_matrices(rc,rm,rt))
            close(m.toarray(),mr,512*eps,"MASS_ASSEMBLY"); close(k.toarray(),kr,512*eps,"STIFFNESS_ASSEMBLY")
            w=np.array(track["w"])
            close(w,m@np.ones(40),512*eps,"GEOMETRY_WEIGHT")
            h.require(bool(np.all(w>0)) and abs(w.sum()-.5)<=256*eps*.5,"GEOMETRY_WEIGHT")
            h.require(abs(k@np.ones(40)).max()<=256*eps*max(1.,float(abs(k).sum(axis=1).max())),"STIFFNESS_ASSEMBLY")
            unique=rc[np.array([j*9+i for j in range(5) for i in range(8)])]
            initial=oracle.field(unique[:,0],unique[:,1],0.)
        else:
            coords=mapping=triangles=None
            x=np.tile((np.arange(8)+.5)/8,4); y=np.repeat((np.arange(4)+.5)/8,8)
            initial=oracle.field(x,y,0.)
        close(track["fields"][0]["state"],initial,512*eps,"OLD_BOUNDARY_STATE")
        trace0 = initial[boundary] if method=="P1" else np.r_[oracle.field((np.arange(8)+.5)/8,np.zeros(8),0.),oracle.field((np.arange(8)+.5)/8,np.full(8,.5),0.)]
        g0 = np.r_[np.ones(8),np.zeros(8)] if lane=="official-literal" else trace0
        close(track["initialBoundaryMismatch"],trace0-g0,512*eps,"OLD_BOUNDARY_STATE")
        for index, saved in enumerate(track["fields"]):
            h.require(saved["time"] == index*.01, "CHECKPOINT_INPUT")
            state=np.array(saved["state"])
            expected_label="discrepancy" if lane=="official-literal" else "non-PFHub strict MMS error"
            h.require(saved["scientificLabel"]==expected_label,"SCIENTIFIC_LANE")
            h.require(saved["projectionBasis"]=="4x2 aligned coarse-cell area averages", "OBSERVATION_BASIS")
            proj,areas=oracle.projection(method,state,coords,mapping,triangles)
            h.require(abs(areas.sum()-.5)<=256*eps*.5,"PROJECTION_WEIGHT")
            close(saved["projection"],proj,512*eps,"PROJECTION_WEIGHT")
            if method=="P1":
                h.require(saved["nativeBasis"]=="continuous P1 area-integrated L2","OBSERVATION_BASIS")
                key=("errors",lane,index,h.digest(saved["state"]))
                er=cached(key,lambda:oracle.continuous_errors(coords,mapping,triangles,state,index*.01))
                close(saved["nativeL2Q"],er,512*eps,"ERROR_QUADRATURE")
            else:
                h.require(saved["nativeBasis"]=="cell-centre discrete area-weighted L2","OBSERVATION_BASIS")
                er=np.sqrt(.015625*np.sum((state-oracle.field(x,y,index*.01))**2))
                close(saved["nativeL2"],er,512*eps,"OBSERVATION_BASIS")
        cumulative_c=0.; cumulative_scale=0.
        for index, step in enumerate(track["steps"]):
            h.require("old" in step and "new" in step,"CHECKPOINT_INPUT")
            old=np.array(step["old"]); new=np.array(step["new"])
            h.require(step["step"]==index+1 and step["timeOld"]==index*.01 and step["timeNew"]==(index+1)*.01 and step["dt"]==.01,"SOURCE_SCHEDULE")
            h.require(step["sourceTime"]==step["timeOld"],"SOURCE_SCHEDULE")
            close(old,track["fields"][index]["state"],0.,"OLD_BOUNDARY_STATE")
            # Residual precedes checkpoint new-state equality, making numeric mutation observable.
            a=h.csr_read(step["A"]); b=np.array(step["b"])
            h.require(h.csr_record(a)==step["A"],"OPERATOR_DIGEST")
            if method=="P1":
                rr=cached(("reaction",lane,index,h.digest(step["old"])),lambda:oracle.reaction_exact(coords,mapping,triangles,old))
                close(step["R"],rr,512*eps,"REACTION_ASSEMBLY")
                fr=[cached(("force",index,q),lambda q=q:oracle.force_load(coords,mapping,triangles,step["timeOld"],q)) for q in range(3)]
                h.require(step["actualForcingRule"]=="Q0","ACTUAL_FORCING_RULE")
                if np.max(abs(np.array(step["F"])-fr[0]))>512*eps*max(1.,float(np.max(abs(fr[0])))):
                    if np.max(abs(np.array(step["F"])-fr[2]))<=512*eps*max(1.,float(np.max(abs(fr[2])))):
                        raise h.Rejected("ACTUAL_FORCING_RULE")
                close(step["F"],fr[0],512*eps,"SOURCE_ASSEMBLY")
                g=np.r_[np.ones(8),np.zeros(8)] if lane=="official-literal" else oracle.field(unique[boundary,0],unique[boundary,1],step["timeNew"])
                full=mr+.01*.0004*kr
                expected=(mr@old+.01*(rr+fr[0]))[interior]-full[np.ix_(interior,boundary)]@g
                close(b,expected,1e-12,"BOUNDARY_ELIMINATION")
            else:
                old_force=oracle.forcing(x,y,step["timeOld"])
                if np.max(abs(np.array(step["F"])-old_force))>512*eps*max(1.,float(np.max(abs(old_force)))):
                    new_force=oracle.forcing(x,y,step["timeNew"])
                    if np.max(abs(np.array(step["F"])-new_force))<=512*eps*max(1.,float(np.max(abs(new_force)))):
                        raise h.Rejected("SOURCE_SCHEDULE")
                close(step["F"],old_force,512*eps,"SOURCE_ASSEMBLY")
            solve_state=new[interior] if method=="P1" else new
            diag=residual(a,b,solve_state)
            if method == "FV":
                verify_fv_stop(step["stop"], step, a, b, solve_state, diag)
            matvec_scale=max(1.,float(np.max(abs(a)@abs(solve_state))))
            h.require(float(np.max(abs(a@solve_state-a.toarray()@solve_state)))<=256*eps*matvec_scale,
                      "CSR_MATVEC")
            close(solve_state,np.linalg.solve(a.toarray(),b),1e-10,"DENSE_SOLVE")
            close(new,track["fields"][index+1]["state"],0.,"CHECKPOINT_INPUT")
            h.require(step["solveCount"]==1 and 0<=step["iterations"]<=2000,"SOLVE_COUNT")
            if method=="P1":
                g=np.r_[np.ones(8),np.zeros(8)] if lane=="official-literal" else oracle.field(unique[boundary,0],unique[boundary,1],step["timeNew"])
                close(step["g"],g,32*eps,"BOUNDARY_APPLICATION")
                close(new[boundary],g,32*eps,"BOUNDARY_APPLICATION")
                rr=cached(("reaction",lane,index,h.digest(step["old"])),lambda:oracle.reaction_exact(coords,mapping,triangles,old))
                close(step["R"],rr,512*eps,"REACTION_ASSEMBLY")
                fr=[cached(("force",index,q),lambda q=q:oracle.force_load(coords,mapping,triangles,step["timeOld"],q)) for q in range(3)]
                h.require(step["actualForcingRule"]=="Q0","ACTUAL_FORCING_RULE")
                close(step["F"],fr[0],512*eps,"SOURCE_ASSEMBLY")
                close(step["forcesQ"],fr,512*eps,"FORCE_QUADRATURE")
                full=mr+.01*.0004*kr
                expected=(mr@old+.01*(rr+fr[0]))[interior]-full[np.ix_(interior,boundary)]@g
                close(b,expected,1e-12,"BOUNDARY_ELIMINATION")
                close(a.toarray(),full[np.ix_(interior,interior)],512*eps,"BOUNDARY_ELIMINATION")
                h.require(step["loadDOFs"]==list(range(40)),"FULL_DOF_LOAD")
                h.require(step["relativeForceSensitivity"] is None and step["relativeForceReason"]=="relative-force-scale-unfrozen","FULL_DOF_LOAD")
                for q in range(2):
                    verify_load_sensitivity(w,np.array(step["forcesQ"][q+1])-step["forcesQ"][q],interior,boundary,step["loadSensitivity"][q])
                r=np.array(step["R"]); f=np.array(step["F"])
                d=m@(new-old)+.01*.0004*(k@new)-.01*(r+f)
                close(step["d"],d,512*eps,"BALANCE_DEFINITION")
                close(step["boundaryReaction"],d[boundary],512*eps,"BALANCE_DEFINITION")
                c=float(d[interior].sum()); other=float(d.sum()-d[boundary].sum())
                h.require(abs(c-other)<=512*eps*abs(d).sum(),"BALANCE_DEFINITION")
                close(step["C"],c,512*eps,"BALANCE_DEFINITION")
                scale=float(abs(m@(new-old)).sum()+.01*.0004*abs(k@new).sum()+.01*abs(r).sum()+.01*abs(f).sum()+abs(d[boundary]).sum())
                h.require(abs(c)<=1e-11*scale,"BALANCE_CLOSURE")
                cumulative_c+=abs(c); cumulative_scale+=scale
            else:
                bottom=np.ones(8) if lane=="official-literal" else oracle.field((np.arange(8)+.5)/8,np.zeros(8),step["timeNew"])
                top=np.zeros(8) if lane=="official-literal" else oracle.field((np.arange(8)+.5)/8,np.full(8,.5),step["timeNew"])
                for name, ref in (("bottom",bottom),("top",top),("actualBottom",bottom),("actualTop",top)):
                    close(step[name],ref,32*eps,"BOUNDARY_APPLICATION")
                ff=oracle.forcing(x,y,step["timeOld"])
                close(step["F"],ff,512*eps,"SOURCE_ASSEMBLY")
                ar,br=oracle.fv_equation(old,ff,bottom,top)
                h.require(step["normalization"]==.01/.015625,"OBSERVATION_BASIS")
                close(a.toarray()*step["normalization"],ar,512*eps,"FV_ASSEMBLY")
                close(b*step["normalization"],br,1e-12,"FV_ASSEMBLY")
                # Actual volume-integrated FV equation residual (not a physical flux certificate).
                c=float((a@new-b).sum()*.01)
                scale=float((abs(a)@abs(new)+abs(b)).sum()*.01)
                h.require(abs(c)<=1e-11*scale,"BALANCE_CLOSURE")
                cumulative_c+=abs(c); cumulative_scale+=scale
            results.append({"method":method,"lane":lane,"step":index+1,"actualResidual":diag})
        h.require(cumulative_c<=1e-11*cumulative_scale,"BALANCE_CLOSURE")
    schema=h.strict_load(h.ROOT/"schemas/pfhub7a-r18b-tiny-interface-v0.1.schema.json")
    validate_schema(receipt,schema,schema)
    return {"status":"pass-for-tiny-interface-only","testIds":[f"T{i:02d}" for i in range(1,13)],
            "stepsReplayed":8,"newTrajectorySteps":0,"results":results,
            "formalEligible":False,"fullConvergenceComplete":False}


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--evidence-dir",required=True)
    parser.add_argument("--source-snapshot",required=True)
    args=parser.parse_args()
    runtime=h.initialize(args.source_snapshot)
    receipt=h.strict_load(Path(args.evidence_dir)/"receipt.json")
    result=verify(receipt,runtime["snapshot"])
    allowed={h.ROOT/r["path"] for r in runtime["snapshot"]["files"] if r["path"].endswith(".py")}
    result["replayInventory"]=h.inventory(h.worker,allowed)
    print(json.dumps(result,sort_keys=True,allow_nan=False))


if __name__ == "__main__":
    main()
