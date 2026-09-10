'use client';

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { CustomStructureWebgl, type CustomStructureWebglStatus } from './custom-structure-webgl';
import { CustomArDynamicsControls } from './custom-ar-dynamics-controls';
import { dynamicsView, projectDynamicsState, type DynamicsSession } from '@/lib/structure/custom-ar-dynamics-session';
import { ELEMENT_IDENTITIES } from '@/lib/structure/element-catalog';
import {
  createDefaultStructureDraft,
  createSolverAdmissionReceipt,
  createValidationReceipt,
  exportStructureNativeJson,
  finalizeStructureDocument,
  makeAtomicFormalCharge,
  makeFiniteNetCharge,
  makeIsotopeDeclaration,
  makePeriodicCellFormalCharge,
  makeSpinMultiplicity,
  parseAndValidateStructureNativeJson,
  structureDocumentToDraft,
  type StructureConnection,
  type StructureDocument,
  type StructureDocumentDraft,
  type StructureSolverAdmissionReceipt,
  type StructureTransportReceipt,
} from '@/lib/structure/structure-document';
import { STRUCTURE_MAX_FILE_BYTES, STRUCTURE_NATIVE_EXTENSION } from '@/lib/structure/strict-json';
import { createStructureRenderModel, type StructureRenderModel } from '@/lib/structure/structure-render-model';
import { parseAndValidateXyz, XYZ_INTERPRETATION, type XyzImportReceipt } from '@/lib/structure/xyz-import';

import { AR_INTERPRETATION, AR_RESULT_EXTENSION, stageCustomArResult, replayCustomArResult, createCustomArAction, computeCustomArSinglePoint, createCustomArForceOverlay, exportCustomArResult, type CustomArAction, type CustomArResult } from '@/lib/structure/custom-ar-singlepoint';

const EDITOR_PAGE_SIZE = 64;

type Props = Readonly<{
  active: boolean;
  onBack: () => void;
}>;

type AcceptedState = Readonly<{
  document: StructureDocument;
  renderModel: StructureRenderModel;
  validationReceipt: ReturnType<typeof createValidationReceipt>;
  admissionReceipt: StructureSolverAdmissionReceipt;
}>;

type DraftMutationScope = Readonly<{
  atoms?: true;
  atomIndex?: number;
  connections?: true;
  connectionIndex?: number;
  boundary?: true;
  finiteSystem?: true;
}>;

export function CustomStructureWorkbench({ active, onBack }: Props) {
  const initial = useMemo(() => acceptDocument(finalizeStructureDocument(createDefaultStructureDraft())), []);
  const [draft, setDraft] = useState<StructureDocumentDraft>(() => structureDocumentToDraft(initial.document));
  const [accepted, setAccepted] = useState<AcceptedState>(initial);
  const [selectedAtomId, setSelectedAtomId] = useState<string | null>(initial.document.atoms[0]?.id ?? null);
  const [draftIssue, setDraftIssue] = useState<string | null>(null);
  const [draftDirty, setDraftDirty] = useState(false);
  const [transportIssue, setTransportIssue] = useState<string | null>(null);
  const [transportReceipt, setTransportReceipt] = useState<StructureTransportReceipt | XyzImportReceipt | ReturnType<typeof stageCustomArResult>['transportReceipt'] | null>(null);
  const [importFormat, setImportFormat] = useState('native');
  const [xyzConfirmed, setXyzConfirmed] = useState(false);
  const [announcement, setAnnouncement] = useState('Static custom structure workbench ready.');
  const [webglStatus, setWebglStatus] = useState<CustomStructureWebglStatus>('checking-webgl2');
  const [arConfirmed, setArConfirmed] = useState(false);
  const [arState, setArState] = useState<Readonly<{ action: CustomArAction; result: CustomArResult }> | null>(null);
  const [arIssue, setArIssue] = useState<string | null>(null);
  const [stagedAr, setStagedAr] = useState<ReturnType<typeof stageCustomArResult> | null>(null);
  const [importPending, setImportPending] = useState(false);
  const [previousActive, setPreviousActive] = useState(active);
  const [dynamics, setDynamics] = useState<DynamicsSession | null>(null);
  const [dynamicsEpoch, setDynamicsEpoch] = useState(0);
  const invalidateDynamics = () => { setDynamics(null); setDynamicsEpoch(epoch => epoch + 1); };
  const invalidateAr = () => { setArState(null); setArConfirmed(false); setArIssue(null); setStagedAr(null); invalidateDynamics(); };
  const [atomPage, setAtomPage] = useState(0);
  const [connectionPage, setConnectionPage] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importSequenceRef = useRef(0);
  const mountedRef = useRef(true);

  // Reset derived action state before committing a changed visibility state.
  if (previousActive !== active) {
    setPreviousActive(active);
    if (!active) {
      setArState(null);
      setArConfirmed(false);
      setArIssue(null);
      setStagedAr(null);
      setImportPending(false);
      setDynamics(null);
      setDynamicsEpoch(epoch => epoch + 1);
    }
  }

  useEffect(() => {
    if (!active) importSequenceRef.current += 1;
  }, [active]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      importSequenceRef.current += 1;
    };
  }, []);

  const atomPageCount = Math.max(1, Math.ceil(draft.atoms.length / EDITOR_PAGE_SIZE));
  const connectionPageCount = Math.max(1, Math.ceil(draft.connections.length / EDITOR_PAGE_SIZE));
  const currentAtomPage = Math.min(atomPage, atomPageCount - 1);
  const currentConnectionPage = Math.min(connectionPage, connectionPageCount - 1);

  const applyDraft = () => {
    importSequenceRef.current += 1;
    invalidateAr(); setImportPending(false);
    try {
      const nextAccepted = acceptDocument(finalizeStructureDocument(draft));
      setAccepted(nextAccepted);
      setDraftIssue(null);
      setDraftDirty(false);
      setTransportReceipt(null);
      setTransportIssue(null);
      setSelectedAtomId((current) => (
        nextAccepted.document.atoms.some((atom) => atom.id === current)
          ? current
          : nextAccepted.document.atoms[0]?.id ?? null
      ));
      setAnnouncement(`Validated draft ${nextAccepted.document.semanticDigest.slice(0, 23)}… and updated the accepted static viewer state.`);
    } catch (error) {
      setDraftIssue(error instanceof Error ? error.message : 'Unknown validation failure.');
      setDraftDirty(false);
    }
  };

  const mutateDraft = (mutate: (next: StructureDocumentDraft) => void, scope: DraftMutationScope = {}) => {
    importSequenceRef.current += 1;
    invalidateAr(); setImportPending(false);
    setDraft((current) => {
      const next = cloneDraftForMutation(current, scope);
      mutate(next);
      return next;
    });
    setDraftDirty(true);
    setDraftIssue(null);
    setTransportIssue(null);
  };

  const setTopology = (topology: StructureDocumentDraft['topology']) => {
    mutateDraft((next) => {
      next.topology = topology;
      if (topology === 'finite') {
        next.boundary = { periodicAxes: [false, false, false], cell: null };
        next.finiteSystem = { netCharge: null, spinMultiplicity: null };
        next.periodicCellFormalCharge = null;
        next.connections = next.connections.map((connection) => ({ ...connection, imageShiftForB: [0, 0, 0] }));
      } else {
        next.boundary = {
          periodicAxes: [true, true, true],
          cell: {
            convention: 'H=[a b c]-column-vectors',
            dimension: 'length',
            unit: 'angstrom',
            basis: 'structure-local-cartesian',
            vectors: [[10, 0, 0], [0, 10, 0], [0, 0, 10]],
          },
        };
        next.finiteSystem = null;
        next.periodicCellFormalCharge = null;
      }
    });
  };

  const addAtom = () => {
    mutateDraft((next) => {
      const used = new Set(next.atoms.map((atom) => atom.id));
      let serial = next.atoms.length + 1;
      while (used.has(`atom-${serial}`)) serial += 1;
      next.atoms.push({
        id: `atom-${serial}`,
        element: { atomicNumber: 1, symbol: 'H' },
        position: { x: 0, y: 0, z: 0 },
        isotope: null,
        formalCharge: null,
      });
    }, { atoms: true });
    setAtomPage(Math.floor(draft.atoms.length / EDITOR_PAGE_SIZE));
  };

  const addConnection = () => {
    mutateDraft((next) => {
      const used = new Set(next.connections.map((connection) => connection.id));
      let serial = next.connections.length + 1;
      while (used.has(`connection-${serial}`)) serial += 1;
      const atomAId = next.atoms[0].id;
      const atomBId = next.atoms[1]?.id ?? atomAId;
      const imageShiftForB: [number, number, number] = atomAId === atomBId ? [1, 0, 0] : [0, 0, 0];
      next.connections.push({
        id: `connection-${serial}`,
        atomAId,
        atomBId,
        order: 'unknown',
        provenance: 'user-declared',
        role: 'display-only',
        energeticInteraction: false,
        imageShiftForB,
      });
    }, { connections: true });
    setConnectionPage(Math.floor(draft.connections.length / EDITOR_PAGE_SIZE));
  };

  const importStructure = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    const importSequence = ++importSequenceRef.current;
    invalidateAr();
    setImportPending(false);
    if (!file) return;
    const selectedFormat = importFormat;
    const confirmed = xyzConfirmed;
    if (selectedFormat === 'xyz' && !confirmed) {
      setTransportIssue('Confirm the XYZ interpretation before importing.');
      return;
    }
    const extension = selectedFormat === 'ar-result' ? AR_RESULT_EXTENSION : selectedFormat === 'xyz' ? '.xyz' : STRUCTURE_NATIVE_EXTENSION;
    // Browsers may insert a positive duplicate counter before the final .json.
    // Only the Ar filename hint is normalized; bytes and replay validation are unchanged.
    const importName = selectedFormat === 'ar-result'
      ? file.name.replace(/ \([1-9][0-9]*\)(?=\.json$)/u, '')
      : file.name;
    if (!importName.endsWith(extension)) {
      setTransportIssue(`Only ${extension} files are accepted.`);
      return;
    }
    if (file.size > STRUCTURE_MAX_FILE_BYTES) {
      setTransportIssue(`Structure file exceeds ${STRUCTURE_MAX_FILE_BYTES} bytes.`);
      return;
    }
    try {
      setImportPending(true);
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (!mountedRef.current || importSequence !== importSequenceRef.current) return;
      invalidateAr(); setImportPending(false);
      if (selectedFormat === 'ar-result') {
        const staged = stageCustomArResult(bytes, file.name);
        setStagedAr(staged); setTransportIssue(null);
        setAnnouncement('Ar result package staged, unverified. Confirm the model and explicitly recompute before accepting any imported result.');
        return;
      }
      const parsed = selectedFormat === 'xyz'
        ? parseAndValidateXyz(bytes, file.name, XYZ_INTERPRETATION)
        : parseAndValidateStructureNativeJson(bytes, file.name);
      const nextAccepted: AcceptedState = {
        document: parsed.document,
        renderModel: createStructureRenderModel(parsed.document),
        validationReceipt: parsed.validationReceipt,
        admissionReceipt: parsed.solverAdmissionReceipt,
      };
      setDraft(structureDocumentToDraft(parsed.document));
      setAccepted(nextAccepted);
      setTransportReceipt(parsed.transportReceipt);
      setTransportIssue(null);
      setDraftIssue(null);
      setDraftDirty(false);
      setSelectedAtomId(parsed.document.atoms[0]?.id ?? null);
      setAtomPage(0);
      setConnectionPage(0);
      setAnnouncement(`Imported ${selectedFormat} structure bytes ${parsed.transportReceipt.rawSha256.slice(0, 23)}…; source provenance was not inferred.`);
    } catch (error) {
      if (!mountedRef.current || importSequence !== importSequenceRef.current) return;
      invalidateAr(); setImportPending(false);
      setTransportIssue(error instanceof Error ? error.message : 'Structure import failed.');
    }
  };

  const exportNative = () => {
    try {
      const bytes = exportStructureNativeJson(accepted.document);
      const blobBytes = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      const blob = new Blob([blobBytes], { type: 'application/vnd.tailing-future.structure+json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${accepted.document.documentId}${STRUCTURE_NATIVE_EXTENSION}`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
      setAnnouncement(`Exported ${bytes.byteLength} native JSON bytes for ${accepted.document.semanticDigest.slice(0, 23)}….`);
      setTransportIssue(null);
    } catch (error) {
      setTransportIssue(error instanceof Error ? error.message : 'Native export failed.');
    }
  };

  const arOverlay = useMemo(() => {
    if (!arState) return null;
    try { return createCustomArForceOverlay(accepted.document, accepted.validationReceipt, arState.action, arState.result); }
    catch { return null; }
  }, [accepted, arState]);
  const computeAr = () => {
    if (!active || draftDirty || draftIssue || importPending || !arConfirmed) return;
    invalidateDynamics();
    const action = createCustomArAction(accepted.document, accepted.validationReceipt, AR_INTERPRETATION);
    const result = computeCustomArSinglePoint(accepted.document, accepted.validationReceipt, action);
    if (result.decision === 'abstain') { setArState(null); setArIssue(result.reason); return; }
    setArState({ action, result }); setArIssue(null);
  };
  const replayAr = () => {
    if (!active || importPending || !arConfirmed || !stagedAr) return;
    invalidateDynamics();
    try {
      const replay = replayCustomArResult(stagedAr.value, AR_INTERPRETATION);
      const next = acceptDocument(replay.document);
      // Complete all validation/render preparation before committing either structure or result.
      createCustomArForceOverlay(replay.document, replay.validationReceipt, replay.action, replay.result);
      setAccepted(next); setDraft(structureDocumentToDraft(replay.document));
      setArState({ action: replay.action, result: replay.result });
      setTransportReceipt(stagedAr.transportReceipt); setStagedAr(null);
      setDraftIssue(null); setDraftDirty(false); setTransportIssue(null); setArIssue(null);
      setSelectedAtomId(replay.document.atoms[0]?.id ?? null); setAtomPage(0); setConnectionPage(0);
      setAnnouncement('Imported Ar package explicitly recomputed and accepted with bound structure and result. Local exploratory single point only; no external backend or trajectory invocation.');
    } catch (error) { setArIssue(error instanceof Error ? error.message : 'Ar replay failed.'); setStagedAr(null); setArConfirmed(false); setArState(null); }
  };
  const exportAr = () => {
    if (!arState) return;
    const bytes = exportCustomArResult(accepted.document, accepted.validationReceipt, arState.action, arState.result);
    const url = URL.createObjectURL(new Blob([bytes.buffer as ArrayBuffer], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = accepted.document.documentId + '.tf-ar-singlepoint.json'; anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const selectedForce = arState?.result.atomicForces.values.find((f) => f.atomId === selectedAtomId);
  const dynamicsState = dynamics ? dynamicsView(dynamics) : null;
  const dynamicsProjection = useMemo(() => dynamicsState ? projectDynamicsState(dynamicsState) : null, [dynamicsState]);
  const selectedDynamicsSite = dynamicsState?.physical.sites.find(site => site.atomId === selectedAtomId);
  const acceptDynamics = (next: DynamicsSession) => {
    const state = dynamicsView(next);
    projectDynamicsState(state);
    const document = acceptDocument(state.document);
    const nextDraft = structureDocumentToDraft(state.document);
    // Prepare every bound representation before committing any UI state.
    setAccepted(document); setDraft(nextDraft); setDynamics(next);
    setArState(null); setArIssue(null); setArConfirmed(false); setStagedAr(null);
    setDraftDirty(false); setDraftIssue(null); setTransportIssue(null); setTransportReceipt(null);
    setSelectedAtomId(id => state.document.atoms.some(atom => atom.id === id) ? id : state.document.atoms[0]?.id ?? null);
    setAnnouncement(`Accepted discrete dynamics state ${state.physicalDigest}; ${state.physical.timeFs} fs. Exploratory model only.`);
  };
  const atomRows = draft.atoms.slice(currentAtomPage * EDITOR_PAGE_SIZE, (currentAtomPage + 1) * EDITOR_PAGE_SIZE);
  const connectionRows = draft.connections.slice(
    currentConnectionPage * EDITOR_PAGE_SIZE,
    (currentConnectionPage + 1) * EDITOR_PAGE_SIZE,
  );
  const selectedAtom = accepted.document.atoms.find((atom) => atom.id === selectedAtomId) ?? null;
  const acceptedByteLength = useMemo(() => exportStructureNativeJson(accepted.document).byteLength, [accepted.document]);
  const atomIdOptions = useMemo(() => (
    draft.atoms.map((atom, index) => <option key={`${index}-${atom.id}`} value={atom.id} />)
  ), [draft.atoms]);

  return (
    <main className="custom-structure-workbench" data-testid="custom-structure-workbench" hidden={!active}>
      <header className="custom-structure-header">
        <button type="button" onClick={() => { invalidateAr(); onBack(); }}>← Molecular lab</button>
        <div>
          <p className="custom-structure-kicker">H-CUSTOM-STRUCTURE / 0.1</p>
          <h1>Custom Structure Workbench</h1>
          <p>All 118 element identities · finite or fully periodic topology · native JSON + limited plain XYZ</p>
        </div>
        <div className="custom-structure-lock" role="status">
          <strong>{dynamicsState ? 'EXPLORATORY DYNAMICS' : arState ? 'EXPLORATORY SINGLE POINT' : 'STRUCTURE ONLY'}</strong>
          <span>{dynamicsState ? 'FINITE Ar ACCEPTED DISCRETE STATE' : arState ? 'FINITE Ar ENERGY + FORCES' : 'SOLVER NOT RUN'}</span>
        </div>
      </header>

      <div className="custom-structure-banner" aria-live="polite">
        <span>Accepted semantic state: {accepted.document.semanticDigest}</span>
        <span>{draftDirty
          ? 'Draft changed — validate to update the accepted viewer state.'
          : draftIssue
            ? `Draft invalid — last valid accepted state retained: ${draftIssue}`
            : 'Draft validated and accepted for the static viewer.'}</span>
        <span>Static viewer status: {webglStatus}. Only ready means a WebGL2 frame is available.</span>
        {transportIssue ? <span>Transport refused — accepted structure unchanged: {transportIssue}</span> : null}
        <span>{announcement}</span>
      </div>

      <section className="custom-structure-main-grid">
        <div>
          <CustomStructureWebgl
            active={active}
            model={accepted.renderModel}
            forceOverlay={dynamicsProjection?.overlay ?? arOverlay}
            physicalDigest={dynamicsState?.physicalDigest ?? null}
            selectedAtomId={selectedAtomId}
            onAtomSelect={setSelectedAtomId}
            onAnnouncement={setAnnouncement}
            onStatusChange={setWebglStatus}
          />
          <section className="custom-structure-inspector" aria-label="Exact selected atom inspector">
            <h2>Exact double-precision inspector</h2>
            <p className="custom-structure-note">Sphere radius and Z-derived color are deterministic visual-only conventions, not measured atomic radii or an external color standard.</p>
            {selectedAtom ? (
              <dl>
                <div><dt>ID</dt><dd>{selectedAtom.id}</dd></div>
                <div><dt>Identity</dt><dd>Z={selectedAtom.element.atomicNumber} · {selectedAtom.element.symbol}</dd></div>
                <div><dt>x / y / z</dt><dd>{selectedAtom.position.x} / {selectedAtom.position.y} / {selectedAtom.position.z} Å</dd></div>
                {selectedForce && <div><dt>Fx / Fy / Fz</dt><dd data-testid="selected-ar-force">{selectedForce.x} / {selectedForce.y} / {selectedForce.z} kJ mol^-1 Å^-1</dd></div>}
                {selectedDynamicsSite && <>
                  <div><dt>Dynamics position x / y / z</dt><dd data-testid="selected-dynamics-position" data-physical-digest={dynamicsState?.physicalDigest}>{selectedDynamicsSite.position.join(' / ')} Å</dd></div>
                  <div><dt>vx / vy / vz</dt><dd data-testid="selected-dynamics-velocity">{selectedDynamicsSite.velocity.join(' / ')} Å/fs, per atom</dd></div>
                  <div><dt>Fx / Fy / Fz</dt><dd data-testid="selected-dynamics-force">{selectedDynamicsSite.force.join(' / ')} kJ mol^-1 Å^-1, per atom per mole identical finite systems</dd></div>
                </>}
                <div><dt>Isotope</dt><dd>{selectedAtom.isotope ? `A=${selectedAtom.isotope.massNumber} · user-declared, existence unverified` : 'not declared'}</dd></div>
                <div><dt>Formal charge</dt><dd>{selectedAtom.formalCharge ? `${selectedAtom.formalCharge.value} e · user-declared, unverified bookkeeping` : 'not declared'}</dd></div>
              </dl>
            ) : <p>No atom selected.</p>}
            {accepted.renderModel.warnings.map((warning) => (
              <p className="custom-structure-warning" key={warning.segmentId}>{warning.code}: {warning.segmentId}</p>
            ))}
          </section>
        </div>

        <aside className="custom-structure-controls" aria-label="Custom structure editor" style={{ minWidth: 0, gridTemplateColumns: 'minmax(0, 1fr)', overflowWrap: 'anywhere' }}>
          <section aria-label="Exploratory finite Ar single point">
            <h2>Finite Ar single point · exploratory, not calibrated</h2>
            <p>2–64 Ar; nonperiodic; ε=0.997 kJ/mol, σ=3.405 Å, force-shift cutoff 4.5 Å; every pair ≥2.724 Å. No stress, pressure, electrons, trajectory or calibrated uncertainty.</p>
            <p>Declared total charge zero is unverified bookkeeping, not proof of neutral atoms. This model separately assumes neutral atoms and excludes isotope, spin and bonded descriptions.</p>
            <label><input type="checkbox" aria-label="Confirm exploratory finite Ar model" checked={arConfirmed} disabled={(!stagedAr && (draftDirty || !!draftIssue)) || importPending || !active} onChange={(event) => { importSequenceRef.current += 1; invalidateDynamics(); setArConfirmed(event.target.checked); setArState(null); setArIssue(null); if (!event.target.checked) setStagedAr(null); }} />I explicitly accept the exploratory neutral-atom finite-system interpretation; no calibrated material applicability.</label>
            <button type="button" onClick={computeAr} disabled={!!stagedAr || !active || !arConfirmed || draftDirty || !!draftIssue || importPending}>Compute Ar single point</button>
            {stagedAr && <div data-testid="ar-staged-package">
              <p>Unverified imported result package — no calculation performed during loading.</p>
              <p>Raw tf-ar-singlepoint-json: {stagedAr.transportReceipt.rawSha256}</p>
              <button type="button" onClick={replayAr} disabled={!active || !arConfirmed || importPending}>Recompute &amp; accept Ar result package</button>
            </div>}
            {arIssue && <p role="status">ABSTAIN: {arIssue}</p>}
            {arState && <>
              <p data-testid="ar-energy">Energy: {arState.result.energy.value} kJ/mol · per mole of identical finite systems</p>
              <p>Forces: negative Cartesian energy gradient per atom; binary64 inspector, binary32 GPU display.</p>
              <p data-testid="ar-result-digest">{arState.result.resultDigest}</p>
              <p data-testid="ar-action-digest">{arState.action.actionDigest}</p>
              <p data-testid="ar-input-digest">{arState.result.semanticDigest}</p>
              <p data-testid="ar-force-scale">{arOverlay ? (arOverlay.scale === null ? 'All forces zero: no arrows.' : 'Common force scale: ' + arOverlay.scale + ' Å/(kJ mol^-1 Å^-1); maximum arrow 2 Å.') : 'Force overlay unavailable; numeric result preserved.'}</p>
              <p>Scale dimension length²/energy, one shared scale per result. Arrow lengths cannot be compared across results; tiny forces may be amplified and weak arrows occluded. Raw forces and coordinates are unchanged.</p>
              <button type="button" onClick={exportAr}>Export Ar single-point result</button>
            </>}
          </section>
          <section className="custom-structure-apply-panel">
            <h2>Draft transaction</h2>
            <button type="button" onClick={applyDraft} disabled={!draftDirty && !draftIssue}>Validate &amp; update preview</button>
            <p className="custom-structure-note">Edits remain a draft until validation succeeds. The last accepted 3D state and its import receipt remain bound after a refused draft.</p>
          </section>
          <section>
            <h2>Document and topology</h2>
            <label>Document ID
              <input value={draft.documentId} onChange={(event) => mutateDraft((next) => { next.documentId = event.target.value; })} />
            </label>
            <label>Title
              <input value={draft.title} onChange={(event) => mutateDraft((next) => { next.title = event.target.value; })} />
            </label>
            <label>User classification (unverified)
              <input
                value={draft.classification?.value ?? ''}
                placeholder="optional; no class is inferred"
                onChange={(event) => mutateDraft((next) => {
                  next.classification = event.target.value === '' ? null : {
                    value: event.target.value,
                    status: 'user-declared-unverified',
                    projectVerified: false,
                  };
                })}
              />
            </label>
            <div className="custom-structure-segmented">
              <button type="button" aria-pressed={draft.topology === 'finite'} onClick={() => setTopology('finite')}>finite</button>
              <button type="button" aria-pressed={draft.topology === 'periodic-3d'} onClick={() => setTopology('periodic-3d')}>periodic-3d</button>
            </div>
            <p className="custom-structure-note">Topology is boundary geometry only. It does not infer molecule, crystal, phase, material or solver support.</p>
          </section>

          {draft.topology === 'periodic-3d' && draft.boundary.cell ? (
            <section>
              <h2>Cell H=[a b c] column vectors (Å)</h2>
              <div className="custom-structure-cell-grid">
                {draft.boundary.cell.vectors.flatMap((vector, column) => vector.map((value, row) => (
                  <label key={`${column}-${row}`}>{['a', 'b', 'c'][column]}{['x', 'y', 'z'][row]}
                    <input
                      type="number"
                      step="any"
                      value={numericInputValue(value)}
                      onChange={(event) => mutateDraft((next) => {
                        const cell = next.boundary.cell!;
                        const vectors = cell.vectors.map((entry) => [...entry]) as [[number, number, number], [number, number, number], [number, number, number]];
                        vectors[column][row] = parseNumericInput(event.target.value);
                        next.boundary = { ...next.boundary, cell: { ...cell, vectors } };
                      }, { boundary: true })}
                    />
                  </label>
                )))}
              </div>
              <label>Per-cell formal charge (e, optional bookkeeping only)
                <input
                  type="number"
                  step="1"
                  value={nullableNumericInputValue(draft.periodicCellFormalCharge?.value ?? null)}
                  onChange={(event) => mutateDraft((next) => {
                    next.periodicCellFormalCharge = event.target.value === ''
                      ? null
                      : makePeriodicCellFormalCharge(parseNumericInput(event.target.value));
                  })}
                />
              </label>
            </section>
          ) : (
            <section>
              <h2>Finite-system declarations</h2>
              <div className="custom-structure-two-columns">
                <label>Net charge Q (e)
                  <input
                    type="number"
                    step="1"
                    value={nullableNumericInputValue(draft.finiteSystem?.netCharge?.value ?? null)}
                    onChange={(event) => mutateDraft((next) => {
                      if (!next.finiteSystem) return;
                      next.finiteSystem.netCharge = event.target.value === '' ? null : makeFiniteNetCharge(parseNumericInput(event.target.value));
                      if (next.finiteSystem.netCharge === null) next.finiteSystem.spinMultiplicity = null;
                    }, { finiteSystem: true })}
                  />
                </label>
                <label>Spin multiplicity M
                  <input
                    type="number"
                    min="1"
                    step="1"
                    disabled={!draft.finiteSystem?.netCharge}
                    value={nullableNumericInputValue(draft.finiteSystem?.spinMultiplicity?.value ?? null)}
                    onChange={(event) => mutateDraft((next) => {
                      if (!next.finiteSystem) return;
                      next.finiteSystem.spinMultiplicity = event.target.value === '' ? null : makeSpinMultiplicity(parseNumericInput(event.target.value));
                    }, { finiteSystem: true })}
                  />
                </label>
              </div>
              <p className="custom-structure-note">Q=+1 means one electron fewer than ΣZ. Spin requires explicit Q; neutrality is never silently inferred.</p>
            </section>
          )}

          <section>
            <div className="custom-structure-section-heading">
              <h2>Atoms ({draft.atoms.length}/4096)</h2>
              <button type="button" onClick={addAtom} disabled={draft.atoms.length >= 4096}>Add atom</button>
            </div>
            <p className="custom-structure-note">Element identity is catalog-validated. Optional isotope A and formal charge are user declarations; they are not isotope-existence, partial-charge or electronic-structure results.</p>
            <Pager page={currentAtomPage} count={atomPageCount} onPage={setAtomPage} />
            <div className="custom-structure-row-list">
              {atomRows.map((atom, visibleIndex) => {
                const atomIndex = currentAtomPage * EDITOR_PAGE_SIZE + visibleIndex;
                return (
                  <fieldset className="custom-structure-atom-row" key={`atom-editor-${atomIndex}`}>
                    <legend>Atom {atomIndex + 1}</legend>
                    <button type="button" aria-label={`Inspect atom ${atom.id}`} disabled={draftDirty || !!draftIssue || !accepted.document.atoms.some((a) => a.id === atom.id)} onClick={() => setSelectedAtomId(atom.id)}>Inspect accepted atom</button>
                    <label>ID
                      <input value={atom.id} onChange={(event) => mutateDraft((next) => { next.atoms[atomIndex].id = event.target.value; }, { atomIndex })} />
                    </label>
                    <label>Element
                      <select
                        aria-label={`Element for atom ${atomIndex + 1}`}
                        value={atom.element.atomicNumber}
                        onChange={(event) => mutateDraft((next) => {
                          const identity = ELEMENT_IDENTITIES[Number(event.target.value) - 1];
                          next.atoms[atomIndex].element = { atomicNumber: identity.atomicNumber, symbol: identity.symbol };
                        }, { atomIndex })}
                      >
                        {ELEMENT_IDENTITIES.map((identity) => (
                          <option key={identity.atomicNumber} value={identity.atomicNumber}>
                            {identity.atomicNumber} · {identity.symbol} · {identity.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    {(['x', 'y', 'z'] as const).map((axis) => (
                      <label key={axis}>{axis} (Å)
                        <input
                          aria-label={`${axis} coordinate for atom ${atomIndex + 1}`}
                          type="number"
                          step="any"
                          value={numericInputValue(atom.position[axis])}
                          onChange={(event) => mutateDraft((next) => {
                            next.atoms[atomIndex].position[axis] = parseNumericInput(event.target.value);
                          }, { atomIndex })}
                        />
                      </label>
                    ))}
                    <label>Isotope A (optional)
                      <input
                        type="number"
                        step="1"
                        value={nullableNumericInputValue(atom.isotope?.massNumber ?? null)}
                        onChange={(event) => mutateDraft((next) => {
                          next.atoms[atomIndex].isotope = event.target.value === '' ? null : makeIsotopeDeclaration(parseNumericInput(event.target.value));
                        }, { atomIndex })}
                      />
                    </label>
                    <label>Formal charge (e)
                      <input
                        type="number"
                        step="1"
                        value={nullableNumericInputValue(atom.formalCharge?.value ?? null)}
                        onChange={(event) => mutateDraft((next) => {
                          next.atoms[atomIndex].formalCharge = event.target.value === '' ? null : makeAtomicFormalCharge(parseNumericInput(event.target.value));
                        }, { atomIndex })}
                      />
                    </label>
                    <button
                      type="button"
                      disabled={draft.atoms.length <= 1}
                      onClick={() => mutateDraft((next) => { next.atoms.splice(atomIndex, 1); }, { atoms: true })}
                    >Remove</button>
                  </fieldset>
                );
              })}
            </div>
          </section>

          <section>
            <div className="custom-structure-section-heading">
              <h2>Explicit display connections ({draft.connections.length}/8192)</h2>
              <button
                type="button"
                onClick={addConnection}
                disabled={draft.connections.length >= 8192 || (draft.atoms.length < 2 && draft.topology === 'finite')}
              >Add connection</button>
            </div>
            <p className="custom-structure-note">No inference. No energetic interaction. Empty means no connection is drawn. For finite topology, n=[0,0,0] is required and no lattice mapping is applied. For periodic-3d only, n is a dimensionless integer coefficient of the declared cell columns, B image = rB + Hn, and the viewer uses one canonical undirected periodic-edge representative that may differ from literal endpoint order by a whole-cell translation.</p>
            <Pager page={currentConnectionPage} count={connectionPageCount} onPage={setConnectionPage} />
            <datalist id="custom-structure-atom-ids">
              {atomIdOptions}
            </datalist>
            <div className="custom-structure-row-list">
              {connectionRows.map((connection, visibleIndex) => {
                const connectionIndex = currentConnectionPage * EDITOR_PAGE_SIZE + visibleIndex;
                return (
                  <fieldset className="custom-structure-connection-row" key={`connection-editor-${connectionIndex}`}>
                    <legend>Connection {connectionIndex + 1} · display-only</legend>
                    <label>ID
                      <input value={connection.id} onChange={(event) => updateConnection(mutateDraft, connectionIndex, { id: event.target.value })} />
                    </label>
                    <label>Endpoint A
                      <input aria-label={`Endpoint A for connection ${connectionIndex + 1}`} list="custom-structure-atom-ids" value={connection.atomAId} onChange={(event) => updateConnection(mutateDraft, connectionIndex, { atomAId: event.target.value })} />
                    </label>
                    <label>Endpoint B
                      <input aria-label={`Endpoint B for connection ${connectionIndex + 1}`} list="custom-structure-atom-ids" value={connection.atomBId} onChange={(event) => updateConnection(mutateDraft, connectionIndex, { atomBId: event.target.value })} />
                    </label>
                    <label>Order (display declaration)
                      <select value={connection.order} onChange={(event) => updateConnection(mutateDraft, connectionIndex, { order: event.target.value as StructureConnection['order'] })}>
                        {['unknown', 'single', 'double', 'triple', 'aromatic'].map((order) => <option key={order}>{order}</option>)}
                      </select>
                    </label>
                    <label>Provenance
                      <select value={connection.provenance} onChange={(event) => updateConnection(mutateDraft, connectionIndex, { provenance: event.target.value as StructureConnection['provenance'] })}>
                        <option value="user-declared">user-declared</option>
                        <option value="explicit-import">explicit-import</option>
                      </select>
                    </label>
                    {connection.imageShiftForB.map((value, axis) => (
                      <label key={axis}>n{['a', 'b', 'c'][axis]}
                        <input
                          type="number"
                          min="-16"
                          max="16"
                          step="1"
                          value={numericInputValue(value)}
                          disabled={draft.topology === 'finite'}
                          onChange={(event) => mutateDraft((next) => {
                            const shift = [...next.connections[connectionIndex].imageShiftForB] as [number, number, number];
                            shift[axis] = parseNumericInput(event.target.value);
                            next.connections[connectionIndex].imageShiftForB = shift;
                          }, { connectionIndex })}
                        />
                      </label>
                    ))}
                    <button type="button" onClick={() => mutateDraft((next) => { next.connections.splice(connectionIndex, 1); }, { connections: true })}>Remove</button>
                  </fieldset>
                );
              })}
            </div>
          </section>

          <section>
            <h2>Structure file transport</h2>
            <label>Import format
              <select aria-label="Import format" value={importFormat} onChange={(event) => {
                importSequenceRef.current += 1;
                invalidateAr(); setImportPending(false);
                setImportFormat(event.target.value);
                setXyzConfirmed(false);
              }}>
                <option value="native">Native JSON</option>
                <option value="xyz">Limited plain XYZ</option>
                <option value="ar-result">Ar single-point result package</option>
              </select>
            </label>
            {importFormat === 'xyz' && <label>
              <input type="checkbox" aria-label="Confirm XYZ interpretation" checked={xyzConfirmed} onChange={(event) => {
                importSequenceRef.current += 1;
                invalidateAr(); setImportPending(false);
                setXyzConfirmed(event.target.checked);
              }} />
              I explicitly interpret coordinates as Å, finite/nonperiodic, and the comment as uninterpreted text.
            </label>}
            <div className="custom-structure-file-actions">
              <input
                ref={fileInputRef}
                className="custom-structure-file-input"
                type="file"
                accept={importFormat === 'ar-result' ? AR_RESULT_EXTENSION : importFormat === 'xyz' ? '.xyz' : STRUCTURE_NATIVE_EXTENSION}
                onChange={importStructure}
              />
              <button type="button" onClick={() => fileInputRef.current?.click()}>Import {importFormat === 'ar-result' ? AR_RESULT_EXTENSION : importFormat === 'xyz' ? '.xyz' : STRUCTURE_NATIVE_EXTENSION}</button>
              <button type="button" onClick={exportNative}>Export native JSON</button>
            </div>
            <p className="custom-structure-note">Limited plain XYZ only: one frame, four columns, no = in comments (even ordinary prose). extXYZ, CIF and V3000 remain unavailable. Decimal coordinates round to binary64; GPU display rounds to binary32. File transport never fabricates scientific source, revision or license clearance.</p>
            <p className="custom-structure-note">Native JSON export preserves the structure, not the XYZ comment or transport receipt. Generated XYZ row IDs are not persistent physical identities.</p>
            <p className="custom-structure-note">Accepted native size: {acceptedByteLength.toLocaleString('en-US')} / {STRUCTURE_MAX_FILE_BYTES.toLocaleString('en-US')} bytes.</p>
            <dl className="custom-structure-receipt">
              <div><dt>Raw import receipt</dt><dd>{transportReceipt?.rawSha256 ?? 'none — no bound import receipt'}</dd></div>
              <div><dt>Actual imported format</dt><dd>{transportReceipt?.format ?? 'none'}</dd></div>
              {transportReceipt?.format === 'plain-xyz-single-frame' && <>
                <div><dt>XYZ comment (uninterpreted)</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{transportReceipt.comment}</dd></div>
                <div><dt>XYZ interpretation</dt><dd>{transportReceipt.interpretation}</dd></div>
                <div><dt>XYZ receipt</dt><dd>{transportReceipt.receiptDigest}</dd></div>
                <div><dt>Not provided by XYZ</dt><dd>{transportReceipt.omittedProperties.join(', ')}</dd></div>
              </>}
              <div><dt>License</dt><dd>{accepted.document.provenance.license.spdxExpression} · projectVerified=false</dd></div>
              <div><dt>Validation</dt><dd>{accepted.validationReceipt.receiptDigest}</dd></div>
            </dl>
          </section>
          {active && <CustomArDynamicsControls
            key={dynamicsEpoch}
            document={accepted.document}
            disabled={draftDirty || !!draftIssue || importPending}
            session={dynamics}
            selectedAtomId={selectedAtomId}
            onCommit={acceptDynamics}
            onBegin={() => { importSequenceRef.current += 1; setImportPending(false); setArState(null); setArConfirmed(false); setArIssue(null); setStagedAr(null); }}
          />}
        </aside>
      </section>

      <section className="custom-structure-abstentions" aria-label="Solver admission abstentions">
        <h2>Import / validation receipt: zero automatic calls (not the current explicit action)</h2>
        {accepted.admissionReceipt.channels.map((channel) => (
          <article key={channel.channel}>
            <span>{channel.channel}</span>
            <strong>ABSTAIN</strong>
            <p>not evaluated / not invoked</p>
            <code>{channel.validationReceiptDigest.slice(0, 23)}…</code>
            <small>attempted=false · solverInvoked=false · backend=null · physical outputs=null</small>
          </article>
        ))}
      </section>
    </main>
  );
}

function acceptDocument(document: StructureDocument): AcceptedState {
  const validationReceipt = createValidationReceipt(document);
  return {
    document,
    renderModel: createStructureRenderModel(document),
    validationReceipt,
    admissionReceipt: createSolverAdmissionReceipt(document, validationReceipt),
  };
}

function Pager({ page, count, onPage }: Readonly<{ page: number; count: number; onPage: (page: number) => void }>) {
  return (
    <div className="custom-structure-pager">
      <button type="button" disabled={page <= 0} onClick={() => onPage(page - 1)}>Previous 64</button>
      <span>Page {page + 1} / {count}</span>
      <button type="button" disabled={page + 1 >= count} onClick={() => onPage(page + 1)}>Next 64</button>
    </div>
  );
}

function updateConnection(
  mutateDraft: (mutate: (next: StructureDocumentDraft) => void, scope?: DraftMutationScope) => void,
  index: number,
  patch: Partial<StructureDocumentDraft['connections'][number]>,
) {
  mutateDraft((next) => {
    next.connections[index] = { ...next.connections[index], ...patch };
  }, { connectionIndex: index });
}

function cloneDraftForMutation(current: StructureDocumentDraft, scope: DraftMutationScope): StructureDocumentDraft {
  const next = { ...current } as StructureDocumentDraft;
  if (scope.atoms || scope.atomIndex !== undefined) {
    next.atoms = [...current.atoms];
    if (scope.atomIndex !== undefined) next.atoms[scope.atomIndex] = structuredClone(current.atoms[scope.atomIndex]);
  }
  if (scope.connections || scope.connectionIndex !== undefined) {
    next.connections = [...current.connections];
    if (scope.connectionIndex !== undefined) {
      next.connections[scope.connectionIndex] = structuredClone(current.connections[scope.connectionIndex]);
    }
  }
  if (scope.boundary) next.boundary = structuredClone(current.boundary);
  if (scope.finiteSystem) next.finiteSystem = structuredClone(current.finiteSystem);
  return next;
}

function parseNumericInput(value: string): number {
  return value.trim() === '' ? Number.NaN : Number(value);
}

function numericInputValue(value: number): string | number {
  return Number.isNaN(value) ? '' : value;
}

function nullableNumericInputValue(value: number | null): string | number {
  return value === null ? '' : numericInputValue(value);
}
