import { describe, expect, it, vi } from 'vitest';
import { AR_INTERPRETATION, exportCheckpoint } from './ar-vv-adapter';
import { advanceDynamics, dynamicsView, forkDynamics, initializeDynamics, projectDynamicsState, restoreDynamics, resumeDynamicsView, selectDynamicsView, stageDynamicsCheckpoint, type DynamicsOutcome } from './custom-ar-dynamics-session';
import { createDefaultStructureDraft, finalizeStructureDocument, makeFiniteNetCharge } from './structure-document';
import * as radial from '../simulation/periodic-potentials';

function fixture() {
  const draft = createDefaultStructureDraft();
  draft.finiteSystem!.netCharge = makeFiniteNetCharge(0);
  draft.atoms = [[0, 0, 0], [4.1, 0, 0], [0, 4.2, 0.1]].map((p, i) => ({ id: `session-${i}`, element: { atomicNumber: 18, symbol: 'Ar' }, position: { x: p[0], y: p[1], z: p[2] }, formalCharge: null, isotope: null }));
  return { document: finalizeStructureDocument(draft), velocities: draft.atoms.map((a, i) => ({ atomId: a.id, velocity: [i * 0.00001, 0, 0] })), dtTicks: 2, confirmation: AR_INTERPRETATION };
}
function accepted(outcome: DynamicsOutcome) {
  if (outcome.decision === 'abstain') throw new Error(outcome.reason);
  return outcome.session;
}
describe('accepted dynamics session transactions', () => {
  it('stages without solver, requires fresh consent, replays all state and splits 400 steps exactly', () => {
    const root = accepted(initializeDynamics(fixture()));
    const half = accepted(advanceDynamics(root, 200));
    const bytes = exportCheckpoint(dynamicsView(half));
    const spy = vi.spyOn(radial, 'evaluateForceShiftedRadialPotential');
    const staged = stageDynamicsCheckpoint(bytes);
    expect(spy).not.toHaveBeenCalled();
    expect(restoreDynamics(half, staged, false).decision).toBe('abstain');
    expect(spy).not.toHaveBeenCalled();
    const replayed = accepted(restoreDynamics(half, staged, true));
    expect(spy).toHaveBeenCalled(); spy.mockRestore();
    const split = accepted(advanceDynamics(replayed, 200));
    const direct = accepted(advanceDynamics(root, 400));
    expect(dynamicsView(split).physical).toEqual(dynamicsView(direct).physical);
    expect(dynamicsView(split).physicalDigest).toBe(dynamicsView(direct).physicalDigest);
    expect(advanceDynamics(split, 1)).toMatchObject({ decision: 'abstain', state: null });
    expect(dynamicsView(half).physical.tick).toBe(400);
  });
  it('retains full parents and requires explicit resume when inspecting history', () => {
    const root = accepted(initializeDynamics(fixture()));
    const moved = accepted(advanceDynamics(root, 3));
    const viewing = selectDynamicsView(moved, 0);
    expect(advanceDynamics(viewing, 1)).toMatchObject({ decision: 'abstain', state: null });
    expect(forkDynamics(viewing, [])).toMatchObject({ decision: 'abstain', state: null });
    const forked = accepted(forkDynamics(resumeDynamicsView(viewing), []));
    expect(forked.history).toHaveLength(3);
    expect(forked.history[1]).toBe(moved.history[1]);
    expect(dynamicsView(forked).branch.parentStateDigest).toBe(dynamicsView(root).stateDigest);
    expect(dynamicsView(forked).physicalDigest).toBe(dynamicsView(root).physicalDigest);
  });
  it('binds exact physical IDs and coordinates with binary32 projection and shared force scale', () => {
    const session = accepted(advanceDynamics(accepted(initializeDynamics(fixture())), 5));
    const state = dynamicsView(session), projected = projectDynamicsState(state);
    expect(projected.overlay.physicalDigest).toBe(state.physicalDigest);
    expect(projected.model.sourceSemanticDigest).toBe(state.document.semanticDigest);
    state.physical.sites.forEach(site => {
      const atom = projected.model.atoms.find(a => a.id === site.atomId)!;
      expect(atom.exactPositionAngstrom).toEqual(site.position);
      expect(atom.uploadPosition).toEqual(site.position.map(Math.fround));
      const arrow = projected.overlay.vectors.find(a => a.atomId === site.atomId)!;
      expect(arrow.start).toEqual(site.position);
      expect(arrow.end).toEqual(site.position.map((x, k) => x + projected.overlay.scale! * site.force[k]));
    });
    expect(() => projectDynamicsState(JSON.parse(JSON.stringify(state)))).toThrow(/accepted|initialization|replay/);
  });
  it('rejects full checkpoint tampering and bad coordinate forks without replacing accepted state', () => {
    const session = accepted(advanceDynamics(accepted(initializeDynamics(fixture())), 3));
    const state = dynamicsView(session), before = exportCheckpoint(state);
    const payload = JSON.parse(new TextDecoder().decode(before)); payload.state.physical.ke += 0.001;
    expect(restoreDynamics(session, stageDynamicsCheckpoint(new TextEncoder().encode(JSON.stringify(payload))), true)).toMatchObject({ decision: 'abstain', state: null });
    expect(forkDynamics(session, [{ atomId: 'session-0', position: [0.01, 4.2, 0.1] }]).decision).toBe('abstain');
    expect(exportCheckpoint(dynamicsView(session))).toEqual(before);
    const p = state.physical.sites[0].position;
    const child = dynamicsView(accepted(forkDynamics(session, [{ atomId: 'session-0', position: [p[0] + 0.005, p[1], p[2]] }])));
    expect(child.physical.ke).toBe(state.physical.ke);
    expect(child.physical.tick).toBe(state.physical.tick);
    expect(child.branch.p0).toEqual(state.branch.p0);
    expect(child.branch.deltaH).toBe(child.physical.h - state.physical.h);
    expect(child.branch.deltaHIsWork).toBe(false);
    expect(child.branch.h0).toBe(child.physical.h);
  });
});
