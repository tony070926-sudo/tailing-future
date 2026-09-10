import { describe, expect, it, vi } from 'vitest';
import { canonicalJson } from './canonical-json';
import * as canonicalModule from './canonical-json';
import * as radialModule from '../simulation/periodic-potentials';
import { createDefaultStructureDraft, finalizeStructureDocument, createValidationReceipt, createSolverAdmissionReceipt, makeFiniteNetCharge, makeAtomicFormalCharge, makeIsotopeDeclaration, makeSpinMultiplicity, structureDocumentToDraft, type StructureDocumentDraft } from './structure-document';
import { AR_INTERPRETATION, createCustomArAction, computeCustomArSinglePoint, exportCustomArResult, validateCustomArExport, createCustomArForceOverlay, stageCustomArResult, replayCustomArResult } from './custom-ar-singlepoint';

function grid(n: number): StructureDocumentDraft {
  const draft = createDefaultStructureDraft();
  draft.finiteSystem!.netCharge = makeFiniteNetCharge(0);
  draft.atoms = Array.from({ length: n }, (_, i) => {
    const x = i % 4, y = Math.floor(i / 4) % 4, z = Math.floor(i / 16);
    return { id: `ar-${String(i).padStart(3, '0')}`, element: { symbol: 'Ar', atomicNumber: 18 },
      position: { x: 3.8 * x + 0.01 * y, y: 3.8 * y + 0.02 * z, z: 3.8 * z + 0.03 * x }, isotope: null, formalCharge: null };
  });
  return draft;
}
function run(draft: StructureDocumentDraft) {
  const document = finalizeStructureDocument(draft), receipt = createValidationReceipt(document);
  const action = createCustomArAction(document, receipt, AR_INTERPRETATION);
  const result = computeCustomArSinglePoint(document, receipt, action);
  if (result.decision !== 'computed') throw new Error(result.reason);
  return { document, receipt, action, result };
}
// Independent all-pairs equations; deliberately no production radial evaluator import.
function reference(draft: StructureDocumentDraft) {
  const positions = draft.atoms.map((a) => [a.position.x, a.position.y, a.position.z]);
  const forces = positions.map(() => [0, 0, 0]); let energy = 0;
  const e = (r: number) => 4 * 0.997 * ((3.405 / r) ** 12 - (3.405 / r) ** 6);
  const f = (r: number) => 24 * 0.997 * (2 * (3.405 / r) ** 12 - (3.405 / r) ** 6) / r;
  for (let i = 0; i < positions.length; i++) for (let j = i + 1; j < positions.length; j++) {
    const d = positions[i].map((v, k) => v - positions[j][k]); const r = Math.hypot(...d);
    if (r >= 4.5) continue;
    energy += e(r) - e(4.5) + (r - 4.5) * f(4.5);
    d.forEach((v, k) => { const component = (f(r) - f(4.5)) * v / r; forces[i][k] += component; forces[j][k] -= component; });
  }
  return { energy, forces };
}
const coordinates = ['x', 'y', 'z'] as const;
function close(actual: number, expected: number, absolute = 1e-10, relative = 1e-12) {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(absolute + relative * Math.max(Math.abs(actual), Math.abs(expected)));
}

describe('explicit finite Ar single point 0.1', () => {
  it('observes zero radial evaluations until confirmation and one imported data snapshot', () => {
    const c = run(grid(12)), bytes = exportCustomArResult(c.document, c.receipt, c.action, c.result);
    const radialCalls = vi.spyOn(radialModule, 'evaluateForceShiftedRadialPotential');
    const serializations = vi.spyOn(canonicalModule, 'canonicalJson');
    try {
      const staged = stageCustomArResult(bytes);
      expect(radialCalls).not.toHaveBeenCalled();
      expect(() => replayCustomArResult(staged.value, null)).toThrow();
      expect(radialCalls).not.toHaveBeenCalled();
      expect(replayCustomArResult(staged.value, AR_INTERPRETATION).result).toEqual(c.result);
      expect(radialCalls.mock.calls.length).toBeGreaterThan(0);
      expect(serializations.mock.calls.filter(([input]) => input === staged.value)).toHaveLength(1);
    } finally {
      radialCalls.mockRestore(); serializations.mockRestore();
    }
  });
  it('stages strict result transport without evaluating values and requires new confirmation for replay', () => {
    const c = run(grid(12)), bytes = exportCustomArResult(c.document, c.receipt, c.action, c.result);
    const staged = stageCustomArResult(bytes, 'input.tf-ar-singlepoint.json');
    expect(staged.status).toBe('unverified-not-computed');
    expect(staged.transportReceipt.format).toBe('tf-ar-singlepoint-json');
    expect(() => replayCustomArResult(staged.value, null)).toThrow();
    expect(replayCustomArResult(staged.value, AR_INTERPRETATION).result).toEqual(c.result);
    const altered = JSON.parse(new TextDecoder().decode(bytes)); altered.result.energy.value += 1;
    const unverified = stageCustomArResult(new TextEncoder().encode(JSON.stringify(altered)));
    expect(unverified.status).toBe('unverified-not-computed');
    expect(() => replayCustomArResult(unverified.value, AR_INTERPRETATION)).toThrow();
    expect(() => stageCustomArResult(new TextEncoder().encode('{"document":{},"document":{},"result":{},"action":{},"validationReceipt":{}}'))).toThrow();
    expect(() => stageCustomArResult(new Uint8Array(16_777_217))).toThrow();
    for (const field of ['document', 'validation', 'action', 'unit', 'id', 'digest', 'extra']) {
      const changed = JSON.parse(new TextDecoder().decode(bytes));
      if (field === 'document') changed.document.atoms[0].position.x += 0.1;
      if (field === 'validation') changed.validationReceipt.receiptDigest = 'sha256:' + '0'.repeat(64);
      if (field === 'action') changed.action.interpretation = 'unconfirmed';
      if (field === 'unit') changed.result.energy.unit = 'eV';
      if (field === 'id') changed.result.atomicForces.values[0].atomId = 'unknown';
      if (field === 'digest') changed.result.resultDigest = 'sha256:' + '0'.repeat(64);
      if (field === 'extra') changed.result.extra = true;
      expect(() => replayCustomArResult(stageCustomArResult(new TextEncoder().encode(JSON.stringify(changed))).value, AR_INTERPRETATION)).toThrow();
    }
  });
  for (let n = 2; n <= 64; n++) it(`independent all-pairs, full 3N finite differences and symmetries N=${n}`, () => {
    const draft = grid(n), computed = run(draft), { result } = computed, ref = reference(draft);
    expect(result.atomCount).toBe(n);
    expect(result.atomicForces.values).toHaveLength(n);
    expect(result.atomicForces.values.map((force) => force.atomId).sort()).toEqual(draft.atoms.map((atom) => atom.id).sort());
    for (const force of result.atomicForces.values) {
      expect(Object.keys(force).sort()).toEqual(['atomId', 'x', 'y', 'z']);
      expect(coordinates.every((axis) => Number.isFinite(force[axis]))).toBe(true);
    }
    const observedComponents = result.atomicForces.values.reduce((count, force) => count + coordinates.filter((axis) => Number.isFinite(force[axis])).length, 0);
    expect(observedComponents).toBe(3 * n);
    close(result.energy.value, ref.energy);
    let worst = { error: 0, atomId: '', axis: '', expected: 0, actual: 0 };
    result.atomicForces.values.forEach((force, i) => coordinates.forEach((axis, k) => {
      close(force[axis], ref.forces[i][k]); const error = Math.abs(force[axis] - ref.forces[i][k]);
      if (error >= worst.error) worst = { error, atomId: force.atomId, axis, expected: ref.forces[i][k], actual: force[axis] };
    }));
    const fd = [0.001, 0.0005, 0.00025].map((h) => {
      let maximum = { error: 0, atomId: '', axis: '', expected: 0, actual: 0, threshold: 0 };
      draft.atoms.forEach((atom, i) => coordinates.forEach((axis, k) => {
        const original = atom.position[axis];
        atom.position[axis] = original + h; const plus = reference(draft).energy;
        atom.position[axis] = original - h; const minus = reference(draft).energy;
        atom.position[axis] = original;
        const actual = -(plus - minus) / (2 * h), expected = ref.forces[i][k];
        const error = Math.abs(actual - expected), threshold = 0.001 + 1e-5 * Math.abs(expected);
        expect(error).toBeLessThanOrEqual(threshold);
        if (error >= maximum.error) maximum = { error, atomId: atom.id, axis, expected, actual, threshold };
      }));
      return { h, ...maximum };
    });
    expect(fd[1].error).toBeLessThanOrEqual(fd[0].error + 1e-8);
    expect(fd[2].error).toBeLessThanOrEqual(fd[1].error + 1e-8);
    const netForce = coordinates.map((axis) => result.atomicForces.values.reduce((sum, f) => sum + f[axis], 0));
    netForce.forEach((v) => expect(Math.abs(v)).toBeLessThanOrEqual(1e-9));
    for (const kind of ['translation', 'rotation', 'permutation']) {
      const transformed = structureDocumentToDraft(computed.document);
      if (kind === 'permutation') transformed.atoms.reverse();
      else transformed.atoms.forEach((a) => { const { x, y, z } = a.position;
        a.position = kind === 'translation' ? { x: x + 1, y: y - 2, z: z + 3 } : { x: y === 0 ? 0 : -y, y: x, z }; });
      const other = run(transformed).result;
      close(other.energy.value, result.energy.value, 1e-9, 1e-11);
      other.atomicForces.values.forEach((force, i) => {
        const original = result.atomicForces.values[i];
        const expected = kind === 'rotation' ? [-original.y, original.x, original.z] : [original.x, original.y, original.z];
        coordinates.forEach((axis, k) => close(force[axis], expected[k], 1e-9, 1e-11));
      });
    }
    expect(canonicalJson(run(draft).result)).toBe(canonicalJson(result));
    const packet = JSON.parse(new TextDecoder().decode(exportCustomArResult(computed.document, computed.receipt, computed.action, result)));
    expect(validateCustomArExport(packet)).toEqual(result);
    expect(packet.document.provenance).toEqual(computed.document.provenance);
    const overlay = createCustomArForceOverlay(computed.document, computed.receipt, computed.action, result);
    expect(overlay.vectors.map((v) => v.atomId)).toEqual(result.atomicForces.values.map((v) => v.atomId));
    console.log(JSON.stringify({ kind: 'finite-ar-full-3N-evidence', n, components: observedComponents,
      semanticDigest: computed.document.semanticDigest, validationDigest: computed.receipt.receiptDigest, actionDigest: computed.action.actionDigest,
      resultDigest: result.resultDigest, parameterDigest: result.parameterDigest, energyAbsoluteError: Math.abs(result.energy.value - ref.energy), forceWorst: worst,
      fd, fdMonotonicFloor: 1e-8, fdMonotonicPassed: true, netForce }));
  });

  it('accepts rmin and all cutoff regimes; rejects next representable value below rmin', () => {
    for (const r of [2.724, 3.405, 2 ** (1 / 6) * 3.405, 4.5 - 1e-6, 4.5, 4.5 + 1e-6, 100]) {
      const draft = grid(2); draft.atoms[1].position = { x: r, y: 0, z: 0 };
      const { result, document, receipt, action } = run(draft), ref = reference(draft);
      close(result.energy.value, ref.energy); close(result.atomicForces.values[0].x, ref.forces[0][0]);
      if (r >= 4.5) { expect(result.energy.value).toBe(0); expect(result.atomicForces.values.every((f) => coordinates.every((a) => f[a] === 0))).toBe(true);
        expect(createCustomArForceOverlay(document, receipt, action, result).scale).toBeNull(); }
      if (r === 4.5 - 1e-6) { expect(Math.abs(result.energy.value)).toBeLessThanOrEqual(1e-10); expect(Math.abs(result.atomicForces.values[0].x)).toBeLessThanOrEqual(1e-5); }
    }
    const draft = grid(2); draft.atoms[1].position = { x: 2.724 - Number.EPSILON * 2, y: 0, z: 0 };
    const document = finalizeStructureDocument(draft), receipt = createValidationReceipt(document);
    expect(computeCustomArSinglePoint(document, receipt, createCustomArAction(document, receipt, AR_INTERPRETATION)).decision).toBe('abstain');
  });

  it('retains zero-call legacy admission and rejects stale, unconfirmed, malformed and altered results', () => {
    const c = run(grid(12)); let calls = 0;
    const forbidden = () => { calls++; throw new Error('Forbidden legacy call'); };
    const legacy = createSolverAdmissionReceipt(c.document, c.receipt, { classicalAtomistic: forbidden, machineLearnedInteratomic: forbidden, electronicStructure: forbidden });
    expect(calls).toBe(0); expect(legacy.channels.every((v) => v.decision === 'abstain' && !v.solverInvoked)).toBe(true);
    expect(() => createCustomArAction(c.document, c.receipt, null)).toThrow();
    expect(computeCustomArSinglePoint(c.document, c.receipt, { ...c.action, extra: true }).decision).toBe('abstain');
    expect(computeCustomArSinglePoint(c.document, run(grid(2)).receipt, c.action).decision).toBe('abstain');
    const packet = JSON.parse(new TextDecoder().decode(exportCustomArResult(c.document, c.receipt, c.action, c.result)));
    packet.result.atomicForces.values[0].x += 1;
    expect(() => validateCustomArExport(packet)).toThrow();
    for (const mutation of ['input', 'action', 'parameter', 'provenance']) {
      const altered = JSON.parse(new TextDecoder().decode(exportCustomArResult(c.document, c.receipt, c.action, c.result)));
      if (mutation === 'input') altered.document.atoms[0].position.x += 0.01;
      if (mutation === 'action') altered.action.interpretation = 'unconfirmed';
      if (mutation === 'parameter') altered.action.parameters.sigma.value = 3.4;
      if (mutation === 'provenance') altered.document.provenance.license.spdxExpression = 'invented';
      expect(() => validateCustomArExport(altered)).toThrow();
    }
  });
  it('abstains for unsupported declarations and malformed coordinates without filling unknowns', () => {
    const mutations: Array<(d: StructureDocumentDraft) => void> = [
      (d) => { d.atoms = d.atoms.slice(0, 1); }, (d) => { d.atoms = grid(65).atoms; },
      (d) => { d.atoms[0].element = { symbol: 'He', atomicNumber: 2 }; },
      (d) => { d.finiteSystem!.netCharge = null; }, (d) => { d.finiteSystem!.netCharge = makeFiniteNetCharge(1); },
      (d) => { d.finiteSystem!.spinMultiplicity = makeSpinMultiplicity(1); },
      (d) => { d.atoms[0].isotope = makeIsotopeDeclaration(40); },
      (d) => { d.atoms[0].formalCharge = makeAtomicFormalCharge(1); },
      (d) => { d.connections = [{ id: 'edge', atomAId: d.atoms[0].id, atomBId: d.atoms[1].id, order: 'unknown', provenance: 'user-declared', role: 'display-only', energeticInteraction: false, imageShiftForB: [0, 0, 0] }]; },
      (d) => { d.topology = 'periodic-3d'; d.finiteSystem = null; d.boundary = { periodicAxes: [true, true, true], cell: { convention: 'H=[a b c]-column-vectors', dimension: 'length', unit: 'angstrom', basis: 'structure-local-cartesian', vectors: [[20, 0, 0], [0, 20, 0], [0, 0, 20]] } }; },
      (d) => { d.atoms[1].position.x = NaN; }, (d) => { d.atoms[1].position.x = 10001; },
    ];
    for (const mutate of mutations) {
      const d = grid(2); mutate(d);
      const stale = run(grid(2));
      expect(computeCustomArSinglePoint({ ...d, semanticDigest: stale.document.semanticDigest }, stale.receipt, stale.action).decision).toBe('abstain');
      let document;
      try { document = finalizeStructureDocument(d); } catch { continue; }
      const receipt = createValidationReceipt(document);
      expect(computeCustomArSinglePoint(document, receipt, createCustomArAction(document, receipt, AR_INTERPRETATION)).decision).toBe('abstain');
    }
  });
});
