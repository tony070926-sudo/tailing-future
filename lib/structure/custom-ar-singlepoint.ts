import { evaluateForceShiftedRadialPotential } from '../simulation/periodic-potentials';
import { canonicalJson, sha256DigestValue } from './canonical-json';
import { createSolverAdmissionReceipt, deepFreeze, validateStructureDocument, type StructureDocument, type StructureValidationReceipt } from './structure-document';
import { parseStructureNativeJsonBytes } from './strict-json';

export const AR_RESULT_EXTENSION = '.tf-ar-singlepoint.json';
export function stageCustomArResult(bytes: Uint8Array, fileName: string | null = null) {
  const parsed = parseStructureNativeJsonBytes(bytes, fileName);
  const value = parsed.value;
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join(',') !== 'action,document,result,validationReceipt') throw new Error('Closed Ar result package required.');
  return deepFreeze({ value, transportReceipt: { ...parsed.transportReceipt, schemaVersion: 'tf.ar-result-transport-receipt/0.1' as const, format: 'tf-ar-singlepoint-json' as const, mediaType: 'application/json' as const }, status: 'unverified-not-computed' as const });
}

export function replayCustomArResult(value: unknown, confirmation: unknown) {
  if (confirmation !== AR_INTERPRETATION) throw new Error('Explicit current exploratory model confirmation required.');
  // Every subsequent check and output consumes one private data snapshot.
  const packet = JSON.parse(canonicalJson(value)) as { document: StructureDocument; validationReceipt: StructureValidationReceipt };
  const result = validateCustomArExport(packet);
  const document = validateStructureDocument(packet.document);
  const action = createCustomArAction(document, packet.validationReceipt, confirmation);
  return deepFreeze({ document, validationReceipt: packet.validationReceipt, action, result });
}

export const AR_INTERPRETATION = 'exploratory-neutral-argon-atoms-finite-nonperiodic-not-calibrated' as const;
export const AR_PARAMETERS = deepFreeze({
  epsilon: { value: 0.997, unit: 'kJ/mol', dimension: 'energy', basis: 'per-mole-of-identical-finite-systems' },
  sigma: { value: 3.405, unit: 'angstrom', dimension: 'length', basis: 'pair-separation' },
  cutoff: { value: 4.5, unit: 'angstrom', dimension: 'length', basis: 'pair-separation' },
  minimumSeparation: { value: 2.724, unit: 'angstrom', dimension: 'length', basis: 'pair-separation' },
  shift: 'force-shifted', boundary: 'finite-no-images-no-tail-correction',
});
const BACKEND = 'tf.finite-ar-force-shifted-lj/0.1' as const;
const zero = (value: number) => value === 0 ? 0 : value;

export function createCustomArAction(document: StructureDocument, receipt: StructureValidationReceipt, interpretation: unknown) {
  const validated = validateStructureDocument(document);
  createSolverAdmissionReceipt(validated, receipt);
  if (interpretation !== AR_INTERPRETATION) throw new Error('Explicit exploratory finite neutral-atom interpretation is required.');
  const base = { schemaVersion: 'tf.custom-ar-singlepoint-action/0.1' as const, semanticDigest: validated.semanticDigest,
    validationReceiptDigest: receipt.receiptDigest, interpretation: AR_INTERPRETATION, backend: BACKEND,
    parameters: AR_PARAMETERS, parameterDigest: sha256DigestValue(AR_PARAMETERS) };
  return deepFreeze({ ...base, actionDigest: sha256DigestValue(base) });
}
export type CustomArAction = ReturnType<typeof createCustomArAction>;

/** New explicit action only: the representation-only admission policy is unchanged. */
export function computeCustomArSinglePoint(document: StructureDocument, receipt: StructureValidationReceipt, action: unknown) {
  try {
    const validated = validateStructureDocument(document);
    const expected = createCustomArAction(validated, receipt, AR_INTERPRETATION);
    if (canonicalJson(action) !== canonicalJson(expected)) throw new Error('Action does not match the closed versioned input, confirmation and parameters.');
    if (validated.topology !== 'finite' || validated.boundary.cell !== null || validated.boundary.periodicAxes.some(Boolean)
      || validated.finiteSystem?.netCharge?.value !== 0 || validated.finiteSystem.spinMultiplicity !== null
      || validated.periodicCellFormalCharge !== null || validated.connections.length !== 0) {
      throw new Error('Requires declared zero total charge, no spin, connections or periodic boundary. Neutral atoms remain a model assumption, not a charge measurement.');
    }
    const atoms = [...validated.atoms].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    if (atoms.length < 2 || atoms.length > 64 || atoms.some((a) => a.element.atomicNumber !== 18 || a.element.symbol !== 'Ar'
      || a.isotope !== null || (a.formalCharge !== null && a.formalCharge.value !== 0))) throw new Error('Requires 2–64 Ar atoms without isotope or nonzero formal-charge declarations.');
    const forces = atoms.map(() => [0, 0, 0]);
    let energy = 0;
    const potential = { kind: 'lennard-jones-12-6' as const, epsilonKjMol: AR_PARAMETERS.epsilon.value, sigmaAngstrom: AR_PARAMETERS.sigma.value };
    for (let i = 0; i < atoms.length; i += 1) for (let j = i + 1; j < atoms.length; j += 1) {
      const a = atoms[i].position; const b = atoms[j].position;
      const delta = [a.x - b.x, a.y - b.y, a.z - b.z];
      const r = Math.hypot(...delta);
      if (r < AR_PARAMETERS.minimumSeparation.value) throw new Error('Pair separation below 2.724 angstrom applicability boundary.');
      const pair = evaluateForceShiftedRadialPotential(potential, r, AR_PARAMETERS.cutoff.value);
      energy += pair.energyKjMol;
      for (let axis = 0; axis < 3; axis += 1) {
        const f = pair.forceMagnitudeOnTargetKjMolAngstrom * delta[axis] / r;
        forces[i][axis] += f; forces[j][axis] -= f;
      }
    }
    if (![energy, ...forces.flat()].every(Number.isFinite)) throw new Error('Non-finite computed quantity.');
    const base = { schemaVersion: 'tf.custom-ar-singlepoint-result/0.1' as const, decision: 'computed' as const,
      backend: BACKEND, semanticDigest: validated.semanticDigest, validationReceiptDigest: receipt.receiptDigest,
      actionDigest: expected.actionDigest, parameterDigest: expected.parameterDigest, atomCount: atoms.length,
      atomCountUnit: 'atom', atomCountDimension: 'dimensionless', atomCountBasis: 'accepted-finite-system-atoms',
      energy: { value: zero(energy), unit: 'kJ/mol', dimension: 'energy', basis: 'per-mole-of-identical-finite-systems' },
      atomicForces: { values: atoms.map((a, i) => ({ atomId: a.id, x: zero(forces[i][0]), y: zero(forces[i][1]), z: zero(forces[i][2]) })),
        unit: 'kJ mol^-1 angstrom^-1', dimension: 'energy/length', basis: 'negative-cartesian-energy-gradient-per-atom-per-mole-of-identical-finite-systems' },
      applicability: AR_INTERPRETATION, uncertainty: null, stress: null, pressure: null, electrons: null, trajectory: null,
      calibratedValidation: false, sourceProvenanceVerified: false };
    return deepFreeze({ ...base, resultDigest: sha256DigestValue(base) });
  } catch (error) {
    return deepFreeze({ schemaVersion: 'tf.custom-ar-singlepoint-result/0.1' as const, decision: 'abstain' as const,
      reason: error instanceof Error ? error.message : 'Invalid single-point input.', energy: null, atomicForces: null,
      stress: null, pressure: null, electrons: null, trajectory: null, uncertainty: null });
  }
}
export type CustomArResult = Extract<ReturnType<typeof computeCustomArSinglePoint>, { decision: 'computed' }>;

export function exportCustomArResult(document: StructureDocument, receipt: StructureValidationReceipt, action: CustomArAction, result: CustomArResult): Uint8Array {
  const recomputed = computeCustomArSinglePoint(document, receipt, action);
  if (recomputed.decision !== 'computed' || canonicalJson(recomputed) !== canonicalJson(result)) throw new Error('Result export failed recomputation binding.');
  return new TextEncoder().encode(canonicalJson({ document: validateStructureDocument(document), validationReceipt: receipt, action, result: recomputed }));
}

export function validateCustomArExport(value: unknown): CustomArResult {
  // Canonical serialization rejects accessors, nonfinite values and non-data records before any field access.
  const snapshot = JSON.parse(canonicalJson(value));
  if (Object.keys(snapshot).sort().join(',') !== 'action,document,result,validationReceipt') throw new Error('Closed result export required.');
  const result = computeCustomArSinglePoint(snapshot.document, snapshot.validationReceipt, snapshot.action);
  if (result.decision !== 'computed' || canonicalJson(result) !== canonicalJson(snapshot.result)) throw new Error('Result export does not recompute.');
  return result;
}

export function createCustomArForceOverlay(document: StructureDocument, receipt: StructureValidationReceipt, action: CustomArAction, result: CustomArResult) {
  // Recompute before presenting externally supplied numbers as bound force arrows.
  exportCustomArResult(document, receipt, action, result);
  const maximumForce = Math.max(...result.atomicForces.values.map((f) => Math.hypot(f.x, f.y, f.z)));
  const scale = maximumForce === 0 ? null : 2 / maximumForce;
  if (scale !== null && !Number.isFinite(scale)) throw new Error('Force visualization scale is not finite.');
  const vectors = result.atomicForces.values.map((force) => {
    const atom = document.atoms.find((a) => a.id === force.atomId)!;
    const start = [atom.position.x, atom.position.y, atom.position.z];
    const end = start.map((v, i) => zero(v + (scale ?? 0) * [force.x, force.y, force.z][i]));
    if (![...start, ...end].every((v) => Number.isFinite(Math.fround(v)))) throw new Error('Force geometry is not finite at GPU precision.');
    return { atomId: atom.id, start, end };
  });
  return deepFreeze({ semanticDigest: document.semanticDigest, resultDigest: result.resultDigest, scale,
    scaleUnit: 'angstrom/(kJ mol^-1 angstrom^-1)', scaleDimension: 'length^2/energy',
    scaleBasis: 'one-common-scale-per-result-maximum-arrow-2-angstrom', vectors });
}
export type CustomArForceOverlay = ReturnType<typeof createCustomArForceOverlay>;
