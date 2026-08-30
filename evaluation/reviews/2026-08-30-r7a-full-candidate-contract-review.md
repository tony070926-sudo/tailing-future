# R7a full-candidate contract review — 2026-08-30

## Decision

**GO for the R7a candidate contract only.** Tailing Future now has a frozen,
non-promotional contract for one 693-structure MatterSim partition and one
693-structure MACE partition, plus a label-bearing verifier that recomputes all
reported metrics from frozen raw data and observed producer artifact bytes.

This decision does not report a full inference run, a Random-TP result, a model
comparison, a formal reproduction, an industrial-fitness result, a release or a
Cloudflare deployment. Sentinel remains **41 / 100, CONDITIONAL**.

Final review severity:

- P0: 0
- P1: 0
- P2: 0 blocking or deferred code defects in the candidate contract

## Frozen scope and claim boundary

The contract freezes:

- the exact 1,514,015-byte Random-TP source and its dataset, ID-set,
  scientific-record, structure-only and reference-label commitments;
- 693 frames, 11,088 atoms, 89 elements and exactly 16 atoms per frame;
- one complete ASCII-ordered partition for `mattersim-v1.0.0-5m` and one for
  `mace-mpa-0-medium`;
- CPU, float32, batch size one, one thread and offline inference after the
  online fetch/build phase;
- three distinguishable outcomes: `complete-pass`, `complete-fail` and
  `incomplete`;
- all promotion, comparison, reproduction, superiority and industrial-fitness
  claims as exactly false.

Random-TP is not Matbench Discovery/WBM. The MatterSim check is only a frozen
protocol-equivalent interval check against its published Random-TP model-card
means. MACE has no published Random-TP target in this contract and is therefore
only a blind engineering baseline; fitting offsets, scales or signs after
observing the result is forbidden.

## Scientific metric contract

For each structure `i`, the verifier computes:

- energy error: `abs(E_pred - E_ref) / atom_count`;
- force error: the mean per-atom Euclidean force-vector error;
- stress gate error: the full 3×3 Frobenius error multiplied by
  `160.21766208 GPa / (eV/Å³)`.

It also records spectral-norm, unweighted Voigt-6 L2 and all six
`xx, yy, zz, yz, xz, xy` component diagnostics. Aggregation follows ASCII ID
order and a finite-input port of CPython 3.12 `math.fsum`, divided by 693.
Quantiles use Hyndman–Fan type 7; worst values break ties by descending error
then ascending ASCII ID. Every primary and diagnostic report carries both a
canonical-JSON per-ID root and a domain-separated binary64 Merkle root.

MatterSim requires the strict three-way AND of these closed intervals:

| Metric | Accepted interval |
| --- | ---: |
| energy MAE, eV/atom | `[0.19502, 0.20298]` |
| force-vector MAE, eV/Å | `[0.80752, 0.84048]` |
| stress Frobenius MAE, GPa | `[1.95902, 2.03898]` |

The independent scientific review matched the JavaScript dataset commitments
to the frozen Python codec, matched 503 finite sums bit-for-bit against Python
`math.fsum`, and compared 10,000 random symmetric-matrix spectral norms to an
independent Jacobi solver with maximum relative error about `5.03e-14`.

## Review loop findings and corrections

Three review roles independently examined scientific correctness, receipt
integrity and GitHub/evaluator integration. Their findings were handed back to
the implementation loop before this decision.

The loop corrected:

1. environment-digest filtering that had not proved every row used one valid
   environment identity;
2. missing or unknown producer states that could otherwise be mistaken for a
   completed partition;
3. caller-supplied verification booleans, permissive replacement schemas and
   unbound plan/schema bytes;
4. missing producer revision, run, attempt and distinct-job cross-checks;
5. loss of producer and rejected-artifact observations on failed or cancelled
   jobs;
6. non-canonical JSONL, label-like fields, malformed-row accounting and
   incomplete coverage invariants;
7. diagnostic summaries without the full evidence-bound reports;
8. verifier, artifact-file and termination digests that were not independently
   cross-checked;
9. a receipt-only validation path that could not authenticate metric reports or
   roots because a public checksum is not a signature.

The last issue is now an explicit API boundary. `validateFullCandidateReceiptEnvelope`
checks only the frozen schema and internally derivable envelope semantics.
`validateFullCandidateReceipt` is authoritative only when given the frozen
candidate plan, scientific plan, runtime lock, raw dataset and observed artifact
bytes; it reruns the label-bearing verifier and requires an exact deep match.
Missing raw evidence fails closed.

## Data and workflow boundary

The Random-TP catalog entry remains `NOASSERTION` with `redistribute: false`.
No dataset or generated structure bundle is added to Git. A future public
GitHub Actions workflow must not expose the complete structure set as a public
artifact until a dataset-specific redistribution determination permits it. A
private, non-persistent handoff or another reviewed isolation design is needed.

CODEOWNERS covers the plan, schemas, verifier, evaluator, catalog and workflows,
but the current repository settings do not yet force a Code Owner approval.
Before treating protected-main provenance as a scientific gate, the next loop
must add a required review, derive source tree identity independently, obtain
producer job/run/attempt identities from trusted GitHub metadata, keep producers
label-free and offline during inference, and attest the exact verifier receipt.

## AIDO Cell / SOTA gap handed to R7b

[AIDO Cell 1.0](https://genbio.ai/aido-cell-simulator/) remains an architecture
and sequencing reference: linked molecular representations feed a persistent
multi-scale state, perturb/simulate/branch operations and multiple readout
families. R7a strengthens only Tailing Future's atomistic evidence contract. It
does not add an AIDO-like learned persistent state, learned atomistic-to-mesoscale
bridge, mesoscale evolution, reactor dynamics, process optimization or measured
1/5/20-step rollout accuracy.

The next loop must:

1. implement the protected-main label-free producer and independent
   label-bearing verifier workflow without redistributing restricted data;
2. retain `complete-fail`, cancelled and partial runs as valid evidence instead
   of rerunning until a pass appears;
3. obtain two independent protected-main receipts with durable attestations;
4. add 40 invariance checks, 89 force finite-difference checks and 60 stress
   finite-difference checks per model before any formal reproduction claim;
5. then proceed to the pinned NIST PFHub Benchmark 3 and Cantera 3.2 CSTR
   anchors for mesoscale and reactor/process coupling.

No full 693×2 inference or deployment was performed in R7a.
