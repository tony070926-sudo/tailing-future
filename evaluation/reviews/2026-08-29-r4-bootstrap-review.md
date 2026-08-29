# R4 protected bootstrap review and R5 handoff

Decision: **CONDITIONAL · DO NOT PROMOTE OR DEPLOY**.

Three bounded read-only supervisors independently reviewed the protected run,
artifact contents, workflow semantics and current remediation. MatterSim has
the first real checkpoint smoke evidence in Tailing Future; MACE still has no
prediction evidence. No result in this review is a 693-record reproduction,
SOTA score or industrial recommendation.

## Protected run evidence

Workflow run
[`33221777626`](https://github.com/tony070926-sudo/tailing-future/actions/runs/33221777626)
is bound to protected-main commit
`9f2335070c1bd2cf441e4b549a16aca86e88eada`.

MatterSim attempt-one job
[`99017141491`](https://github.com/tony070926-sudo/tailing-future/actions/runs/33221777626/job/99017141491)
passed wheelhouse, resolve, freeze, cold install, build and smoke inference. The
independent inventory covered 157 wheels, 35,697 raw paths, 35,696 runtime
paths and the one exact setuptools startup-hook removal. The generated lock is
`sha256:9c990909d1307bb32608d31b9ed217d2368c28e2048f6dec39e8dc4a2b63642b`;
the immutable image digest is
`sha256:cb9393b34b8debaf050ce646fd270fcf2b708b78c22de5d63b1fcaa456ca7fe5`.

Artifact `9705471645` is 63,101 bytes with Actions archive digest
`sha256:7ae686cdaea87097c07a9fe1bdd8fe0277cf86b000f9afc71d907aa17095d005`.
Independent download found exactly the nine declared members. The ten-record
prediction file has digest
`sha256:14e89cfcb8d0d42b545b18b41a66b4a0899b080de014f913a91bd108d9e419cb`;
all ten unique IDs report finite energy, sixteen three-vector force rows and a
full 3x3 stress. Its outcome remains `bootstrap-not-reproduced`, and the
prediction objects contain no reference labels.

MACE attempt-one job
[`99017141610`](https://github.com/tony070926-sudo/tailing-future/actions/runs/33221777626/job/99017141610)
failed before its first `python-hostlist` source builder executed. Its artifact
`9705432248` is 2,370 bytes with Actions archive digest
`sha256:dbbf0e595b81e2135066b99b15d3935d554a3f08535fb010e1755adf25bff379`;
it records run attempt 1, `failureStage: wheelhouse` and no predictions. A native
failed-job rerun preserved the same commit and created attempt-two job
[`99017596056`](https://github.com/tony070926-sudo/tailing-future/actions/runs/33221777626/job/99017596056).
That job built the first clean wheel at 39,523 bytes and SHA-256
`498c59026aec1015aa07f970423d4b655ac45f5108bbc900f40f8afd3593ad1c`,
then failed to execute `/usr/bin/sh` in the second identical builder with
`resource temporarily unavailable`. Final artifact `9705485885` is 2,369
bytes with digest
`sha256:912f52f47027e8f4a7494700a119789662532343fe04d789ccda7dae6d827717`.
It contains only the three declared manifests and records
`failureStage: wheelhouse`, `predictionsPresent: false` and run attempt 2.

These GitHub Actions artifacts are short-lived operational evidence, not a
durable promoted benchmark bundle. At review time, attempt-one MACE artifact
`9705432248`, MatterSim artifact `9705471645` and attempt-two MACE artifact
`9705485885` were scheduled to expire on 2026-09-04 at 23:52:10Z, 23:54:22Z
and 23:55:09Z respectively. A later promotion loop must preserve a separately
attested durable bundle rather than relying on those expiring downloads.

## Root cause and remediation

The failing builder used the hosted runner's numeric UID, a container-local
`--pids-limit=64`, and a second `--ulimit nproc=64:64`. Docker explicitly
warns that `nproc` counts processes for a user rather than a container and can
fail with this exact error. Two different runners reproduced the same boundary;
the second did so only after one clean build. This is a workflow reliability
defect, not a package, hash or model failure.

R5 removes every UID-scoped `nproc` limit from the workflow and keeps the
container-scoped `pids-limit` plus the existing network, filesystem, privilege,
CPU, memory and file boundaries. The workflow policy rejects reintroduction of
`nproc` and requires the reviewed PID/file limits. A fresh protected-main run,
not another retry of the faulty commit, is the acceptance gate.

The failed artifacts expose only `failureStage: wheelhouse`; they do not encode
the source-build iteration or OCI error class. Adding bounded structured
`failureSubstage` and `errorClass` evidence is a tracked P2 for a later schema
revision, not a reason to weaken or reinterpret this run.

## R5 Sentinel supervision outcome

The supervisor loop found that the first R5 evaluator draft could read evidence
and source bytes at different times while the long physics gate was running.
It also loaded project policy modules before its first snapshot. Both defects
could bind a report to bytes different from those actually evaluated. The
revised Sentinel now uses a built-in-only launcher, a private regular-file
snapshot, and a fresh worker whose project modules, plans, schemas, ID manifests
and comparator receipts all resolve inside that frozen tree. The launcher
rejects malformed source inventory, undeclared regular-file roots, symlinks,
hard links, source drift and unbound worker
reports; CI additionally compares every raw source blob and executable bit with
the declared `GITHUB_SHA` commit before and after evaluation.

The review loop exercised stable publication, concurrent drift, malformed and
linked reports, direct and ancestor source links, CRLF-normalized Git content,
executable-mode changes, untracked source, exact artifact framing and ulimit
substitution. These controls protect evidence integrity but do not raise any
scientific evidence score. Git directory sentinels for adjacent untracked
repositories are excluded only outside declared source roots; an unexpanded
nested repository inside a source root remains a hard failure. Workspace
`node_modules`, the repository-owned launcher, and the frozen worker plus its
evaluator, policy and scientific module graph remain an explicit trusted
computing base. The launcher binds but does not independently recompute the
worker's verdict. Moving Sentinel to a fresh post-gate evaluation job with a
separately restored dependency closure is the next security-hardening task, not
evidence of external certification.

## SOTA gap and next loop

The refreshed AIDO Cell comparison remains claim-class and non-comparable.
AIDO Cell is useful as a sequence and architecture reference for persistent
multiscale state, actions and multimodal readouts. Tailing Future now has a
real, isolated atomistic checkpoint smoke, which improves executable
atomistic and provenance grounding, but it still lacks AIDO-like learned cross-scale state, multimodal
training, long-horizon validation and task-spanning evaluation. It also lacks
the materials-specific mesoscale, reactor and process-optimization layers in
its own roadmap.

The next supervised loop must:

1. obtain a complete MACE smoke from two byte-identical clean source builds;
2. add an independent artifact verifier and full 693-record dual-model run;
3. compute preregistered energy, force and stress metrics only after reference
   labels are joined outside the model containers;
4. keep AIDO Cell as a vendor-claim architecture comparator and reject any
   numerical SOTA or industrial-control claim until like-for-like evidence
   exists.
