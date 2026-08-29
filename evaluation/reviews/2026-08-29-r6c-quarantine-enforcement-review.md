# R6c protected-main legacy-runner quarantine enforcement review

Date: 2026-08-29
Decision: **PASS — the quarantined R5 runner failed closed before bootstrap; zero accepted replicas**

## Scope

Protected-main `workflow_dispatch` run
[`33234001808`](https://github.com/tony070926-sudo/tailing-future/actions/runs/33234001808)
executed Commit P at
`f861b3e30572f1db366554a2e330d5d6c78bdb56`. Its purpose was limited to
proving that the active exact-byte quarantine rejects the known contradictory
R5 runner. It was not a prediction, replication or benchmark run.

| Model | Job | Conclusion | Artifact ID | Archive bytes | Archive SHA-256 |
|---|---:|---|---:|---:|---|
| MatterSim | `99051659276` | failure at `guard` | `9709349386` | 531 | `sha256:c6f9963f4e9af726b4e7103adc28b766bb01149a2c6363f88ea8440c4c8646da` |
| MACE | `99051659145` | failure at `guard` | `9709349902` | 528 | `sha256:34a88e709162f6d194948660a17dabe4ca68a11e4c76034884e90b4509bcdf22` |

Both jobs reached the same explicit `BOOTSTRAP_QUARANTINE_ACTIVE` failure.
The message identifies legacy runner digest
`sha256:2c708fc0220808cc4b2e2f3043623f604793f7bd8a5913472440f91f17a3987c`,
preserves accepted-replica count `0`, and names prior runs `33231316217` and
`33231323492` as non-retroactive.

## Independent artifact inspection

GitHub's artifact API names, run bindings, byte sizes and SHA-256 digests
matched independently downloaded archive bytes. Both ZIPs passed the bounded,
no-link safe extractor. Each archive contained exactly one allowlisted file,
`manifests/bootstrap-outcome.json`, and no prediction or diagnostic payload.

Both outcome manifests state:

- schema `tf.atomistic-bootstrap-outcome/0.1`;
- `status: failed` and `failureStage: guard`;
- `evidenceClass: bootstrap-not-reproduced`;
- `inferenceSucceeded: false` and `predictionsPresent: false`;
- `guard: failure`, with every later stage `skipped`; and
- `publishedFiles` containing only the outcome manifest itself.

The failed workflow conclusion is therefore the expected security result, not
a scientific failure or a valid replica. No artifact from this dispatch can be
promoted or counted toward the required two fresh S-version executions.

## Boundary for Commit S

Commit S may activate only the exact v2 runner that was prepositioned in
Commit P. The guard must continue to reject the R5 digest and any unknown
runner, while allowing the exact v2 identity only after its immutable P Git
blobs have been verified and materialized into an isolated build context. The
runtime lock remains discovery-only, all promotion/comparison/reproduction
claims remain false, accepted observations remain empty, and the two rejected
R6b runs remain non-retroactive.

The evidence maturity score remains **41 / 100 CONDITIONAL**. Cloudflare is
unchanged and no deployment is authorized by this quarantine proof.
