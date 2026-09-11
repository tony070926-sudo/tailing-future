import { describe, expect, it, vi } from 'vitest';
import * as adapter from './ar-vv-adapter';
import * as radial from '../simulation/periodic-potentials';
import { compareDynamicsBranches } from './custom-ar-branch-comparison';
import { createDefaultStructureDraft, finalizeStructureDocument, makeFiniteNetCharge } from './structure-document';
import type { DynamicsSession } from './custom-ar-dynamics-session';

function fixture(identity = false) {
  const draft = createDefaultStructureDraft(); draft.finiteSystem!.netCharge = makeFiniteNetCharge(0);
  draft.atoms = Array.from({ length: 8 }, (_, i) => ({ id: `atom-${i}`, element: { atomicNumber: 18, symbol: 'Ar' }, position: { x: (i % 2) * 4.1, y: (Math.floor(i / 2) % 2) * 4.1, z: Math.floor(i / 4) * 4.1 }, formalCharge: null, isotope: null }));
  const root = adapter.initialize({ document: finalizeStructureDocument(draft), velocities: draft.atoms.map(atom => ({ atomId: atom.id, velocity: [0, 0, 0] })), dtTicks: 2, confirmation: adapter.AR_INTERPRETATION });
  const advance = (state: adapter.State, steps: number) => { const result = adapter.advance(state, steps); if (result.decision === 'abstain') throw new Error(result.reason); return result.state; };
  const parent = advance(root, 2), a = advance(parent, 2);
  const p = parent.physical.sites[0].position;
  const fork = adapter.fork(parent, identity ? [] : [{ atomId: 'atom-0', position: [p[0] + 0.005, p[1], p[2]] }]);
  const b = advance(fork, 2);
  const session: DynamicsSession = { history: [root, parent, a, fork, b], head: 4, view: 2 };
  return { root, parent, a, fork, b, session, advance };
}

describe('accepted branch comparison', () => {
  it('compares N8 at exactly 1 fs with signed ID-bound arithmetic and immutable source evidence, without numerical calls', () => {
    const { session, parent, a, b } = fixture();
    const before = session.history.map(adapter.exportCheckpoint), serialized = JSON.stringify(session);
    const spies = [vi.spyOn(radial, 'evaluateForceShiftedRadialPotential'), ...(['initialize', 'advance', 'fork', 'restoreCheckpoint'] as const).map(name => vi.spyOn(adapter, name))];
    const result = compareDynamicsBranches(session, a, b);
    expect(result.decision).toBe('compared');
    if (!result.comparison) throw new Error('missing comparison');
    const c = result.comparison;
    expect(c.sources.parent).toBe(parent.stateDigest); expect(c.timeFs).toBe(1);
    expect(c.energy.h.delta).toBe(b.physical.h - a.physical.h);
    expect(c.units.force.dimension).toBe('energy/(amount*length)'); expect(c.units.energy.dimension).toBe('energy/amount');
    for (const atom of c.atoms) for (const kind of ['position', 'velocity', 'force'] as const) {
      const left = a.physical.sites.find(site => site.atomId === atom.atomId)!, right = b.physical.sites.find(site => site.atomId === atom.atomId)!;
      expect(atom[kind].delta).toEqual(left[kind].map((value, axis) => right[kind][axis] - value));
      const max = c.maximumAbsoluteComponentDifference[kind];
      expect(max.value).toBe(Math.max(...c.atoms.flatMap(row => row[kind].delta.map(Math.abs))));
      expect(Math.abs(c.atoms.find(row => row.atomId === max.atomId)![kind].delta[['x', 'y', 'z'].indexOf(max.axis)])).toBe(max.value);
    }
    expect(JSON.stringify(compareDynamicsBranches(session, a, b))).toBe(JSON.stringify(result));
    expect(Object.isFrozen(c.atoms[0].force.delta)).toBe(true);
    expect(JSON.stringify(session)).toBe(serialized); expect(session.history.map(adapter.exportCheckpoint)).toEqual(before);
    spies.forEach(spy => { expect(spy).not.toHaveBeenCalled(); spy.mockRestore(); });
  });
  it('identity forks retain distinct provenance with deterministic positive zero differences', () => {
    const { session, a, b } = fixture(true), result = compareDynamicsBranches(session, a, b);
    expect(a.stateDigest).not.toBe(b.stateDigest);
    const c = result.comparison!;
    expect(Object.values(c.energy).every(value => Object.is(value.delta, 0))).toBe(true);
    expect(c.atoms.every(atom => ['position', 'velocity', 'force'].every(kind => atom[kind as 'position'].delta.every(value => Object.is(value, 0))))).toBe(true);
    expect(c.maximumAbsoluteComponentDifference.position).toEqual({ value: 0, atomId: 'atom-0', axis: 'x' });
  });
  it('abstains on parsed/unretained endpoints, missing parent, time, initializer, reversed roles and extra fork', () => {
    const { session, parent, a, b, fork, advance } = fixture();
    const reason = (s: DynamicsSession, left: adapter.State, right: adapter.State, expected: string) => expect(compareDynamicsBranches(s, left, right)).toEqual({ decision: 'abstain', reason: expected, comparison: null });
    reason(session, JSON.parse(JSON.stringify(a)), b, 'unaccepted-endpoint');
    reason({ ...session, history: [parent, b] }, a, b, 'endpoint-not-retained');
    reason({ ...session, history: [a, b] }, a, b, 'parent-not-retained');
    reason(session, a, fork, 'time-mismatch');
    reason(session, b, a, 'missing-fork-parent');
    const forkedA = advance(adapter.fork(parent, []), 2);
    reason({ ...session, history: [...session.history, forkedA] }, forkedA, b, 'a-not-unedited-continuation');
    const other = adapter.restoreCheckpoint(adapter.exportCheckpoint(adapter.initialize({ ...a.initializer, dtTicks: 1 })));
    reason({ ...session, history: [...session.history, other] }, other, b, 'initializer-mismatch');
    const changedConditions = adapter.initialize({ ...a.initializer, velocities: a.initializer.velocities.map(row => ({ ...row, velocity: [0.00001, 0, 0] })) });
    reason({ ...session, history: [...session.history, changedConditions] }, changedConditions, b, 'initializer-mismatch');
    const differentIdsDraft = createDefaultStructureDraft(); differentIdsDraft.finiteSystem!.netCharge = makeFiniteNetCharge(0);
    differentIdsDraft.atoms = a.initializer.document.atoms.map(atom => ({ ...atom, id: `other-${atom.id}`, position: { ...atom.position }, element: { ...atom.element } }));
    const differentIds = adapter.initialize({ ...a.initializer, document: finalizeStructureDocument(differentIdsDraft), velocities: differentIdsDraft.atoms.map(atom => ({ atomId: atom.id, velocity: [0, 0, 0] })) });
    reason({ ...session, history: [...session.history, differentIds] }, differentIds, b, 'initializer-mismatch');
    const extra = advance(adapter.fork(fork, []), 2);
    reason({ ...session, history: [...session.history, extra] }, a, extra, 'parent-journal-mismatch');
  });
  it('accepts a logically identical replayed retained parent without replaying during comparison', () => {
    const { session, parent, a, b } = fixture();
    const duplicate = adapter.restoreCheckpoint(adapter.exportCheckpoint(parent));
    const replaced = { ...session, history: session.history.map(state => state === parent ? duplicate : state) };
    expect(compareDynamicsBranches(replaced, a, b).decision).toBe('compared');
  });
});
