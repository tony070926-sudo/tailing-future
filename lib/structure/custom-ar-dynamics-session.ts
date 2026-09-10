import { advance, exportCheckpoint, fork, initialize, restoreCheckpoint, type State } from './ar-vv-adapter';
import { sha256DigestBytes } from './canonical-json';
import { deepFreeze } from './structure-document';
import { parseStructureNativeJsonBytes } from './strict-json';
import { createStructureRenderModel } from './structure-render-model';

export const DYNAMICS_EXTENSION = '.tf-ar-dynamics.json';
export const CHECKPOINT_BYTE_LIMIT = 1_048_576;
export type DynamicsSession = Readonly<{ history: readonly State[]; head: number; view: number }>;
export type DynamicsFailure = Readonly<{ decision: 'abstain'; reason: string; state: null }>;
export type DynamicsOutcome = Readonly<{ decision: 'accepted'; session: DynamicsSession }> | DynamicsFailure;
export type StagedCheckpoint = Readonly<{ rawDigest: string; byteLength: number; bytes: readonly number[] }>;

/** Staging parses bounded transport only. Serialized confirmation is never UI consent. */
export function stageDynamicsCheckpoint(bytes: Uint8Array): StagedCheckpoint {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength > CHECKPOINT_BYTE_LIMIT) throw new Error('checkpoint byte limit');
  const value = parseStructureNativeJsonBytes(bytes, null).value as Record<string, unknown>;
  if (!value || value.schemaVersion !== 'tf.custom-ar-dynamics-checkpoint/0.1') throw new Error('checkpoint version');
  return deepFreeze({ rawDigest: sha256DigestBytes(bytes), byteLength: bytes.byteLength, bytes: Array.from(bytes) });
}

export function dynamicsView(session: DynamicsSession): State { return session.history[session.view]; }

/** No solver call: export requires the strict adapter's accepted-State identity. */
export function projectDynamicsState(state: State) {
  exportCheckpoint(state);
  const model = createStructureRenderModel(state.document);
  const maximum = Math.max(...state.physical.sites.map(site => Math.hypot(...site.force)));
  const scale = maximum === 0 ? null : 2 / maximum;
  if (scale !== null && !Number.isFinite(scale)) throw new Error('force arrow scale is nonfinite');
  const vectors = state.physical.sites.map(site => {
    const atom = model.atoms.find(atom => atom.id === site.atomId);
    if (!atom || site.position.some((x, k) => x !== atom.exactPositionAngstrom[k])) throw new Error('physical/document position binding');
    const start = [...site.position];
    const end = start.map((x, k) => x + (scale ?? 0) * site.force[k]);
    if (![...start, ...end].every(x => Number.isFinite(Math.fround(x)))) throw new Error('force GPU projection');
    return { atomId: site.atomId, start, end };
  });
  return deepFreeze({ model, overlay: {
    semanticDigest: state.document.semanticDigest, physicalDigest: state.physicalDigest,
    resultDigest: state.physicalDigest, scale,
    scaleUnit: 'angstrom/(kJ mol^-1 angstrom^-1)', scaleDimension: 'length^2/energy',
    scaleBasis: 'one-common-scale-per-accepted-frame-maximum-arrow-2-angstrom', vectors,
  } });
}

export function initializeDynamics(value: unknown): DynamicsOutcome {
  return transaction(() => { const state = initialize(value); return { history: [state], head: 0, view: 0 }; });
}
export function advanceDynamics(session: DynamicsSession, steps: number): DynamicsOutcome {
  return transaction(() => {
    requireHead(session);
    const outcome = advance(dynamicsView(session), steps);
    if (outcome.decision === 'abstain') throw new Error(outcome.reason);
    // Kernel frames are Physical diagnostics, never resumable accepted states.
    return append(session, outcome.state);
  });
}
export function forkDynamics(session: DynamicsSession, changes: unknown): DynamicsOutcome {
  return transaction(() => { requireHead(session); return append(session, fork(dynamicsView(session), changes)); });
}
export function restoreDynamics(session: DynamicsSession | null, staged: StagedCheckpoint, confirmed: boolean): DynamicsOutcome {
  return transaction(() => {
    if (!confirmed) throw new Error('fresh explicit checkpoint replay confirmation required');
    const state = restoreCheckpoint(Uint8Array.from(staged.bytes));
    return session ? append(session, state) : { history: [state], head: 0, view: 0 };
  });
}
export function selectDynamicsView(session: DynamicsSession, index: number): DynamicsSession {
  if (!Number.isInteger(index) || index < 0 || index >= session.history.length) throw new Error('unknown accepted state');
  return deepFreeze({ ...session, view: index });
}
export function resumeDynamicsView(session: DynamicsSession): DynamicsSession {
  exportCheckpoint(dynamicsView(session));
  return deepFreeze({ ...session, head: session.view });
}
function requireHead(session: DynamicsSession) {
  if (session.head !== session.view) throw new Error('explicitly resume the selected accepted state before acting');
}
function append(session: DynamicsSession, state: State): DynamicsSession {
  if (session.history.length >= 128) throw new Error('local accepted-history capacity; export before starting a new session');
  const history = [...session.history, state];
  return { history, head: history.length - 1, view: history.length - 1 };
}
function transaction(candidate: () => DynamicsSession): DynamicsOutcome {
  try {
    const session = candidate();
    projectDynamicsState(dynamicsView(session));
    return deepFreeze({ decision: 'accepted', session });
  } catch (error) {
    return deepFreeze({ decision: 'abstain', reason: error instanceof Error ? error.message : 'invalid dynamics candidate', state: null });
  }
}
