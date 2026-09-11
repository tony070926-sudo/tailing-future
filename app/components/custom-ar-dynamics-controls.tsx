'use client';

import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { CustomArBranchComparison } from './custom-ar-branch-comparison';
import { AR_INTERPRETATION, UNITS, exportCheckpoint } from '@/lib/structure/ar-vv-adapter';
import type { StructureDocument } from '@/lib/structure/structure-document';
import {
  advanceDynamics, CHECKPOINT_BYTE_LIMIT, DYNAMICS_EXTENSION, dynamicsView, forkDynamics,
  initializeDynamics, projectDynamicsState, restoreDynamics, resumeDynamicsView,
  selectDynamicsView, stageDynamicsCheckpoint,
  type DynamicsOutcome, type DynamicsSession, type StagedCheckpoint,
} from '@/lib/structure/custom-ar-dynamics-session';

type Props = Readonly<{
  document: StructureDocument;
  disabled: boolean;
  session: DynamicsSession | null;
  selectedAtomId?: string | null;
  onCommit: (session: DynamicsSession) => void;
  onBegin: () => void;
}>;

/** All numerical calls originate in explicit button handlers. Unmount cancels pending transport. */
export function CustomArDynamicsControls({ document: structure, disabled, session, selectedAtomId = null, onCommit, onBegin }: Props) {
  const [velocityMode, setVelocityMode] = useState('');
  const [comparisonEpoch, setComparisonEpoch] = useState(0);
  const [velocityText, setVelocityText] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [dtTicks, setDtTicks] = useState<1 | 2>(2);
  const [steps, setSteps] = useState('1');
  const [changes, setChanges] = useState('[]');
  const [issue, setIssue] = useState<string | null>(null);
  const [staged, setStaged] = useState<StagedCheckpoint | null>(null);
  const [replayConfirmed, setReplayConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const sequence = useRef(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; sequence.current += 1; };
  }, []);
  const state = session ? dynamicsView(session) : null;
  const blocked = disabled || pending;
  const canAct = !blocked && confirmed && session !== null && session.head === session.view;
  const commit = (outcome: DynamicsOutcome) => {
    if (outcome.decision === 'abstain') { setIssue(outcome.reason); return; }
    try { onCommit(outcome.session); setIssue(null); setStaged(null); setReplayConfirmed(false); }
    catch (error) { setIssue(error instanceof Error ? error.message : 'presentation validation failed'); }
  };
  const begin = () => { sequence.current += 1; onBegin(); };
  const initialize = () => {
    if (blocked || !confirmed || !velocityMode) return;
    setComparisonEpoch(value => value + 1);
    begin();
    try {
      const velocities = velocityMode === 'zero'
        ? structure.atoms.map(atom => ({ atomId: atom.id, velocity: [0, 0, 0] }))
        : JSON.parse(velocityText);
      commit(initializeDynamics({ document: structure, velocities, dtTicks, confirmation: AR_INTERPRETATION }));
    } catch (error) { setIssue(error instanceof Error ? error.message : 'invalid initial velocities'); }
  };
  const loadCheckpoint = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = '';
    const token = ++sequence.current;
    onBegin(); setStaged(null); setReplayConfirmed(false); setPending(false); setIssue(null);
    if (!file) return;
    if (!file.name.replace(/ \([1-9][0-9]*\)(?=\.json$)/u, '').endsWith(DYNAMICS_EXTENSION)) { setIssue('checkpoint file extension'); return; }
    if (file.size > CHECKPOINT_BYTE_LIMIT) { setIssue('checkpoint byte limit'); return; }
    setPending(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (!mounted.current || token !== sequence.current) return;
      const candidate = stageDynamicsCheckpoint(bytes);
      setStaged(candidate); setPending(false);
    } catch (error) {
      if (!mounted.current || token !== sequence.current) return;
      setPending(false); setIssue(error instanceof Error ? error.message : 'checkpoint staging failed');
    }
  };
  const exportCurrent = () => {
    if (!state || blocked) return;
    const bytes = exportCheckpoint(state);
    const url = URL.createObjectURL(new Blob([bytes.buffer as ArrayBuffer], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = structure.documentId + DYNAMICS_EXTENSION; anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <section aria-label="Exploratory finite Ar dynamics">
    <h2>Finite Ar dynamics · exploratory model</h2>
    <p>Neutral Ar, 2–64 sites, finite nonperiodic force-shift Lennard–Jones. Nominal mass 39.95 g/mol; ε=0.997 kJ/mol; σ=3.405 Å; cutoff 4.5 Å; minimum separation 2.724 Å. Excludes isotope, spin, bonded and periodic descriptions.</p>
    <p>Numerical qualification is limited to four frozen recipes, two time steps, 100 fs. New structures and coordinate forks do not inherit that qualification. No material calibration, causal effect, stress, pressure, electrons or calibrated uncertainty.</p>
    <h3>New initialization draft</h3>
    <p data-testid="dynamics-initialization-scope">The velocity and time-step controls below apply only when you press Initialize Ar dynamics. They do not modify an accepted state. Advance and Fork use the selected accepted state’s stored step and velocities, including after checkpoint restore or history selection.</p>
    <label>Initial velocity selection<select aria-label="Initial velocity selection" value={velocityMode} disabled={blocked} onChange={event => { setVelocityMode(event.target.value); setConfirmed(false); }}>
      <option value="">Choose explicit initial conditions</option><option value="zero">Explicit zero initial velocities</option><option value="manual">Manual velocities by stable atom ID</option>
    </select></label>
    {velocityMode === 'manual' && <label>Initial velocities JSON<textarea aria-label="Initial velocities JSON" value={velocityText} disabled={blocked} onChange={event => { setVelocityText(event.target.value); setConfirmed(false); }} placeholder={'[{"atomId":"atom-1","velocity":[0,0,0]}]'} /></label>}
    <p>Initial velocities are user assumptions, not experimental observations. Each component must be finite and within ±0.01 Å/fs; supply exactly one vector per atom ID.</p>
    <label>Next initialization time step<select aria-label="Dynamics time step" value={dtTicks} disabled={blocked} onChange={event => { setDtTicks(Number(event.target.value) as 1 | 2); setConfirmed(false); }}><option value="1">0.125 fs</option><option value="2">0.25 fs</option></select></label>
    <label><input type="checkbox" aria-label="Confirm exploratory dynamics" checked={confirmed} disabled={blocked} onChange={event => setConfirmed(event.target.checked)} />I explicitly accept the exploratory neutral-Ar model assumptions. This draft sets initial conditions only on Initialize; continuing an accepted state uses its stored conditions.</label>
    <button type="button" disabled={blocked || !confirmed || !velocityMode} onClick={initialize}>Initialize Ar dynamics</button>
    <p>Maximum 400 steps per action, 32 journal actions per branch, root horizon 100 fs. The local view retains up to 128 accepted action endpoints; it does not interpolate intermediate states.</p>
    <label>Steps this action<input aria-label="Dynamics steps" type="number" min="1" max="400" step="1" value={steps} disabled={blocked} onChange={event => setSteps(event.target.value)} /></label>
    <button type="button" disabled={!canAct} onClick={() => { if (!session || !canAct) return; begin(); commit(advanceDynamics(session, Number(steps))); }}>Advance accepted state</button>
    {session && <>
      <label>Accepted state history<select aria-label="Accepted dynamics history" value={session.view} disabled={blocked} onChange={event => { begin(); onCommit(selectDynamicsView(session, Number(event.target.value))); setIssue(null); }}>
        {session.history.map((entry, index) => <option key={`${index}-${entry.stateDigest}`} value={index}>{index}: {entry.physical.timeFs} fs · {entry.stateDigest.slice(0, 19)}</option>)}
      </select></label>
      {session.view !== session.head && <p>Viewing retained history. Explicitly resume this accepted state before advancing or forking.</p>}
      <button type="button" disabled={blocked || session.view === session.head} onClick={() => { begin(); onCommit(resumeDynamicsView(session)); }}>Resume selected accepted state</button>
      <label>Coordinate fork JSON<textarea aria-label="Coordinate fork JSON" value={changes} disabled={blocked} onChange={event => setChanges(event.target.value)} /></label>
      <p>Supply [{'{"atomId":"…","position":[x,y,z]}'}] in Å; [] creates an identity fork. A fork retains its parent and velocities at the same tick. ΔH is a coordinate-edit energy discontinuity, not work.</p>
      <button type="button" disabled={!canAct} onClick={() => { if (!canAct) return; begin(); try { commit(forkDynamics(session, JSON.parse(changes))); } catch (error) { setIssue(error instanceof Error ? error.message : 'invalid fork JSON'); } }}>Fork accepted coordinates</button>
      <button type="button" disabled={blocked} onClick={exportCurrent}>Export selected dynamics checkpoint</button>
    </>}
    <label>Stage dynamics checkpoint<input type="file" aria-label="Stage dynamics checkpoint" accept={DYNAMICS_EXTENSION} disabled={disabled} onChange={loadCheckpoint} /></label>
    {pending && <p>Reading bounded checkpoint bytes; no solver invoked.</p>}
    {staged && <div data-testid="dynamics-staged">
      <p>Unverified staged checkpoint: {staged.rawDigest}. No solver invoked during staging.</p>
      <label><input type="checkbox" aria-label="Confirm full checkpoint replay" checked={replayConfirmed} disabled={blocked} onChange={event => setReplayConfirmed(event.target.checked)} />I explicitly authorize complete journal replay under the exploratory neutral-Ar interpretation, including the serialized initial velocities. Serialized confirmation does not supply this consent.</label>
      <button type="button" disabled={blocked || !replayConfirmed} onClick={() => { if (blocked || !replayConfirmed) return; begin(); commit(restoreDynamics(session, staged, replayConfirmed)); setReplayConfirmed(false); setConfirmed(false); }}>Replay &amp; restore dynamics checkpoint</button>
      <p>This is full application journal replay, not a LAMMPS native restart or authenticated provenance.</p>
    </div>}
    {issue && <output data-testid="dynamics-abstention">{JSON.stringify({ decision: 'abstain', reason: issue, state: null })}</output>}
    {state && <div data-testid="dynamics-readouts" data-physical-digest={state.physicalDigest}>
      <h3>Current accepted state — independent of the initialization draft</h3>
      <p data-testid="dynamics-physical-digest">{state.physicalDigest}</p><p>Accepted state: {state.stateDigest}</p>
      <p>Root time: {state.physical.timeFs} fs; tick {state.physical.tick}/800; actual step {state.physical.dtTicks * 0.125} fs.</p>
      <p>PE {state.physical.pe}; KE {state.physical.ke}; H {state.physical.h} kJ/mol, per mole of identical finite systems.</p>
      <p>Branch H₀ {state.branch.h0}; maximum |H−H₀| {state.branch.maxEnergyDrift}; coordinate ΔH {state.branch.deltaH} kJ/mol, per mole of identical finite systems; ΔH is not work.</p>
      <p>Parent: {state.branch.parentStateDigest ?? 'root'}. Root P₀ [{state.branch.p0.join(', ')}]; P [{state.physical.momentum.join(', ')}]; maximum component residual [{state.branch.maxMomentumResidual.join(', ')}] g mol⁻¹ Å fs⁻¹, summed over sites.</p>
      <p data-testid="dynamics-arrow-scale">{projectDynamicsState(state).overlay.scale === null ? 'All forces zero: no arrows.' : `One shared scale per accepted frame: ${projectDynamicsState(state).overlay.scale} Å/(kJ mol⁻¹ Å⁻¹); maximum arrow 2 Å. Visual normalization is not a cross-frame magnitude comparison.`}</p>
      <p>Scientific values are binary64; GPU geometry is binary32. Render callbacks and camera actions do not advance time.</p>
      <p>Arrow scale dimension: length²/energy; basis: one common scale across all sites in this accepted frame.</p>
      <details><summary>Quantity units, dimensions and bases</summary>{Object.entries(UNITS).map(([name, quantity]) => <p key={name}>{name}: {quantity.unit}; dimension {quantity.dimension}; basis {quantity.basis}.</p>)}</details>
      <p>authenticatedProvenance=false; calibratedValidation=false; stress=null; pressure=null; electrons=null; uncertainty=null.</p>
    </div>}
    {session && !disabled && <CustomArBranchComparison key={`${comparisonEpoch}-${session.history[0].stateDigest}`} session={session} selectedAtomId={selectedAtomId} />}
  </section>;
}
