import { exportCheckpoint, type State } from './ar-vv-adapter';
import { canonicalJson } from './canonical-json';
import { deepFreeze } from './structure-document';
import type { DynamicsSession } from './custom-ar-dynamics-session';

export const COMPARISON_UNITS = deepFreeze({
  position: { unit: 'angstrom', dimension: 'length', basis: 'per-atom-structure-local-cartesian' },
  velocity: { unit: 'angstrom/fs', dimension: 'length/time', basis: 'per-atom-structure-local-cartesian' },
  force: { unit: 'kJ mol^-1 angstrom^-1', dimension: 'energy/(amount*length)', basis: 'per-atom-per-mole-identical-finite-systems-structure-local-cartesian' },
  energy: { unit: 'kJ/mol', dimension: 'energy/amount', basis: 'per-mole-identical-finite-systems' },
  time: { unit: 'fs', dimension: 'time', basis: 'elapsed-from-common-initializer' },
  tick: { unit: '1', dimension: 'dimensionless', basis: 'count-of-source-model-time-ticks' },
});
type VectorQuantity = 'position' | 'velocity' | 'force';
const axes = ['x', 'y', 'z'] as const;
const same = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b);
class ComparisonAbstention extends Error {}
function requirePair(ok: boolean, reason: string): asserts ok { if (!ok) throw new ComparisonAbstention(reason); }
function difference(a: number, b: number) {
  const delta = b - a;
  requirePair(Number.isFinite(delta), 'nonfinite-difference');
  return delta === 0 ? 0 : delta;
}
const scalar = (a: number, b: number) => ({ a, b, delta: difference(a, b) });
function identities(state: State) {
  return [...state.document.atoms].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    .map(atom => ({ id: atom.id, element: atom.element, isotope: atom.isotope, formalCharge: atom.formalCharge }));
}

/** Read-only accepted-state inspection. exportCheckpoint checks adapter identity without replay. */
export function compareDynamicsBranches(session: DynamicsSession, a: State, b: State) {
  try {
    try { exportCheckpoint(a); exportCheckpoint(b); } catch { throw new ComparisonAbstention('unaccepted-endpoint'); }
    requirePair(session.history.includes(a) && session.history.includes(b), 'endpoint-not-retained');
    const parentDigest = b.branch.parentStateDigest;
    requirePair(parentDigest !== null, 'missing-fork-parent');
    const parent = session.history.find(state => state.stateDigest === parentDigest);
    requirePair(parent !== undefined, 'parent-not-retained');
    try { exportCheckpoint(parent); } catch { throw new ComparisonAbstention('unaccepted-parent'); }
    for (const state of [a, b]) {
      requirePair(same(state.initializer, parent.initializer), 'initializer-mismatch');
      requirePair(state.schemaVersion === parent.schemaVersion && state.physical.schemaVersion === parent.physical.schemaVersion, 'schema-mismatch');
      requirePair(same(state.physical.model, parent.physical.model) && same(state.physical.parameters, parent.physical.parameters), 'model-mismatch');
      requirePair(same(state.physical.units, parent.physical.units), 'units-mismatch');
      requirePair(same(state.document.coordinateFrame, parent.document.coordinateFrame) && same(state.document.boundary, parent.document.boundary) && same(state.document.finiteSystem, parent.document.finiteSystem), 'frame-or-boundary-mismatch');
      requirePair(state.physical.dtTicks === parent.physical.dtTicks, 'step-mismatch');
      requirePair(same(identities(state), identities(parent)), 'identity-mismatch');
      requirePair(same(state.journal.slice(0, parent.journal.length), parent.journal), 'parent-journal-mismatch');
      requirePair(state.physical.tick >= parent.physical.tick && state.physical.timeFs >= parent.physical.timeFs, 'time-before-parent');
    }
    requirePair(a.physical.tick === b.physical.tick && a.physical.timeFs === b.physical.timeFs, 'time-mismatch');
    const aSuffix = a.journal.slice(parent.journal.length), bSuffix = b.journal.slice(parent.journal.length);
    requirePair(aSuffix.every(entry => entry.kind === 'advance'), 'a-not-unedited-continuation');
    requirePair(bSuffix[0]?.kind === 'fork' && bSuffix.slice(1).every(entry => entry.kind === 'advance'), 'b-not-single-fork-continuation');
    const aSites = new Map(a.physical.sites.map(site => [site.atomId, site]));
    const bSites = new Map(b.physical.sites.map(site => [site.atomId, site]));
    const ids = identities(parent).map(atom => atom.id);
    requirePair(aSites.size === ids.length && bSites.size === ids.length && a.physical.sites.length === ids.length && b.physical.sites.length === ids.length && ids.every(id => aSites.has(id) && bSites.has(id)), 'site-id-bijection');
    const atoms = ids.map(atomId => {
      const left = aSites.get(atomId)!, right = bSites.get(atomId)!;
      const values = (kind: VectorQuantity) => ({ a: left[kind], b: right[kind], delta: left[kind].map((value, axis) => difference(value, right[kind][axis])) });
      return { atomId, position: values('position'), velocity: values('velocity'), force: values('force') };
    });
    const maximum = (kind: VectorQuantity) => {
      let result = { value: -1, atomId: ids[0], axis: axes[0] as typeof axes[number] };
      for (const atom of atoms) atom[kind].delta.forEach((delta, axis) => {
        if (Math.abs(delta) > result.value) result = { value: Math.abs(delta), atomId: atom.atomId, axis: axes[axis] };
      });
      return result;
    };
    return deepFreeze({ decision: 'compared' as const, comparison: {
      schemaVersion: 'tf.custom-ar-branch-comparison/0.1', convention: 'B-minus-A',
      claim: 'differences-between-accepted-exploratory-model-states', calibratedValidation: false, causalEffect: false,
      applicability: 'neutral-Ar-finite-nonperiodic-force-shift-Lennard-Jones; no material calibration or inherited fork qualification',
      sources: { a: a.stateDigest, b: b.stateDigest, parent: parent.stateDigest, aPhysical: a.physicalDigest, bPhysical: b.physicalDigest },
      initializer: parent.initializer, model: a.physical.model, parameters: a.physical.parameters,
      sourceUnits: a.physical.units, units: COMPARISON_UNITS, coordinateFrame: a.document.coordinateFrame, boundary: a.document.boundary,
      timeFs: a.physical.timeFs, tick: a.physical.tick, dtTicks: a.physical.dtTicks,
      energy: { pe: scalar(a.physical.pe, b.physical.pe), ke: scalar(a.physical.ke, b.physical.ke), h: scalar(a.physical.h, b.physical.h) },
      branchDiagnostics: { a: a.branch, b: b.branch, coordinateDeltaHIsWork: false },
      atoms, maximumAbsoluteComponentDifference: { position: maximum('position'), velocity: maximum('velocity'), force: maximum('force') },
    } });
  } catch (error) {
    return deepFreeze({ decision: 'abstain' as const, reason: error instanceof ComparisonAbstention ? error.message : 'invalid-comparison', comparison: null });
  }
}
