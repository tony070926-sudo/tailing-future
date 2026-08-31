'use client';

import { useCallback, useMemo, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import {
  createNaclRocksaltScene,
  createWaterDimerScene,
  magnitude,
  type MolecularAtom,
  type MolecularSceneKind,
  type PairInteraction,
  type Vector3,
} from '@/lib/molecular/molecular-interactions';
import {
  INITIAL_MOLECULAR_CAMERA,
  MolecularCanvas,
  type MolecularCamera,
} from './molecular-canvas';

type InspectorTab = 'structure' | 'interactions' | 'evidence';

const SCALE_STEPS = [
  { id: 'L0', label: '电子', status: 'planned' },
  { id: 'L1', label: '原子', status: 'active' },
  { id: 'L2', label: '介观', status: 'planned' },
  { id: 'L3', label: '连续体', status: 'active' },
  { id: 'L4', label: '设备', status: 'planned' },
  { id: 'L5', label: '流程', status: 'planned' },
] as const;

const INSPECTOR_TABS: ReadonlyArray<readonly [InspectorTab, string]> = [
  ['structure', '结构'],
  ['interactions', '作用'],
  ['evidence', '模型证据'],
];

export function MolecularLab({ active }: { active: boolean }) {
  const [sceneKind, setSceneKind] = useState<MolecularSceneKind>('water-dimer');
  const [oxygenSeparation, setOxygenSeparation] = useState(2.9);
  const [donorAngle, setDonorAngle] = useState(0);
  const [ionDisplacement, setIonDisplacement] = useState(0);
  const [camera, setCamera] = useState<MolecularCamera>(INITIAL_MOLECULAR_CAMERA);
  const [selectedAtomId, setSelectedAtomId] = useState('water-b-o');
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('structure');
  const [showLabels, setShowLabels] = useState(true);
  const [showInteractions, setShowInteractions] = useState(true);
  const [showForces, setShowForces] = useState(true);
  const [announcement, setAnnouncement] = useState('真实三维分子结构已载入。');

  const scene = useMemo(() => sceneKind === 'water-dimer'
    ? createWaterDimerScene({ oxygenSeparationAngstrom: oxygenSeparation, donorAngleDegrees: donorAngle })
    : createNaclRocksaltScene({ selectedDisplacementAngstrom: ionDisplacement }),
  [donorAngle, ionDisplacement, oxygenSeparation, sceneKind]);
  const atomById = useMemo(() => new Map(scene.atoms.map((atom) => [atom.id, atom])), [scene]);
  const selectedAtom = atomById.get(selectedAtomId) ?? atomById.get(scene.defaultSelectedAtomId) ?? scene.atoms[0];
  const selectedForce = scene.forceByAtomIdKjMolAngstrom[selectedAtom.id];
  const selectedForceMagnitude = selectedForce ? magnitude(selectedForce) : null;
  const relevantInteractions = scene.pairInteractions.filter((interaction) =>
    interaction.sourceAtomId === selectedAtom.id || interaction.targetAtomId === selectedAtom.id,
  );
  const focusAtoms = scene.kind === 'water-dimer'
    ? scene.atoms
    : scene.atoms.filter((atom) => scene.selectableAtomIds.includes(atom.id));

  const changeScene = (nextKind: MolecularSceneKind) => {
    const next = nextKind === 'water-dimer'
      ? createWaterDimerScene({ oxygenSeparationAngstrom: oxygenSeparation, donorAngleDegrees: donorAngle })
      : createNaclRocksaltScene({ selectedDisplacementAngstrom: ionDisplacement });
    setSceneKind(nextKind);
    setSelectedAtomId(next.defaultSelectedAtomId);
    setCamera({ ...INITIAL_MOLECULAR_CAMERA });
    setAnnouncement(`已切换到${next.name}；结构、参数、能量和适用边界已同步更新。`);
  };

  const handleCameraChange = useCallback((next: MolecularCamera) => setCamera(next), []);
  const moveInspectorTab = (event: ReactKeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex = index;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % INSPECTOR_TABS.length;
    else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + INSPECTOR_TABS.length) % INSPECTOR_TABS.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = INSPECTOR_TABS.length - 1;
    else return;
    event.preventDefault();
    const nextTab = INSPECTOR_TABS[nextIndex][0];
    setInspectorTab(nextTab);
    window.requestAnimationFrame(() => document.getElementById(`molecular-tab-${nextTab}`)?.focus());
  };
  const resetCamera = () => {
    setCamera({ ...INITIAL_MOLECULAR_CAMERA });
    setAnnouncement('观察视角已复位；物理坐标和相互作用没有改变。');
  };

  const selectAtom = (atomId: string) => {
    setSelectedAtomId(atomId);
    const atom = atomById.get(atomId);
    if (atom) setAnnouncement(`已选择 ${atom.label}，电荷 ${formatCharge(atom)}，坐标 ${formatVector(atom.positionAngstrom, 3)} Å。`);
  };

  const downloadSnapshot = () => {
    const url = URL.createObjectURL(new Blob([`${JSON.stringify(scene, null, 2)}\n`], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${scene.kind}-${scene.stateId.split('/').at(-1)}.json`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  };

  return (
    <section className="lab-workbench molecular-workbench" hidden={!active}>
      <div className="lab-context-bar">
        <div>
          <span>TAILING FUTURE / ATOMIC STATE</span>
          <b>One structure state → inspectable interactions and readouts</b>
          <small>tf.molecular-scene/0.1 · deterministic, parameter-sourced classical snapshot</small>
        </div>
        <div className="context-badges" aria-label="模型适用边界">
          <span className="live">PARAMETER SOURCED</span>
          <span className="derived">EXPLICIT XYZ STATE</span>
          <span>0 VALIDATED BRIDGES</span>
          <span>NO MD CLAIM</span>
        </div>
      </div>

      <div className="lab-grid">
        <aside className="lab-scale-rail" aria-label="L0 到 L5 多尺度层级">
          <div className="scale-rail-count"><b>2</b><span>/ 6</span><small>STANDALONE</small><em>0 BRIDGES</em></div>
          <ol>{SCALE_STEPS.map((step) => (
            <li key={step.id} className={step.status === 'active' ? 'active' : ''} title={`${step.id} ${step.label} · ${step.status === 'active' ? 'standalone prototype' : 'planned'}`}>
              <span>{step.id}</span><b>{step.label}</b><i aria-hidden="true" />
            </li>
          ))}</ol>
        </aside>

        <section className="micro-stage">
          <div className="micro-stage-heading molecular-stage-heading">
            <div>
              <p className="eyebrow">MATERIAL STATE / L1 ATOMIC VIEWER</p>
              <h1>从真实三维结构，读取粒子之间的作用。</h1>
              <p className="stage-deck">不是随机粒子云：每个原子或离子都有身份、x/y/z 坐标、连接关系与可检查的作用读出。</p>
            </div>
            <div className="stage-readout">
              <span className="active"><i aria-hidden="true" />{scene.name}</span>
              <small>{scene.atoms.length} atoms / ions · {scene.pairInteractions.length} evaluated pairs</small>
              <button type="button" className="view-reset-button" onClick={resetCamera}>↺ 复位视角</button>
            </div>
          </div>

          <div className="scene-switcher" role="group" aria-label="分子与离子结构场景">
            <button type="button" className={sceneKind === 'water-dimer' ? 'active' : ''} aria-pressed={sceneKind === 'water-dimer'} onClick={() => changeScene('water-dimer')}>
              <span>H₂O···H₂O</span><b>水分子二聚体</b><small>刚性 TIP3P · 6 个原子</small>
            </button>
            <button type="button" className={sceneKind === 'nacl-rocksalt' ? 'active' : ''} aria-pressed={sceneKind === 'nacl-rocksalt'} onClick={() => changeScene('nacl-rocksalt')}>
              <span>Na⁺ / Cl⁻</span><b>岩盐离子晶格</b><small>Fm-3m · 4×4×4 片段</small>
            </button>
          </div>

          <div className="material-state-flow" role="list" aria-label="当前结构状态的操作和读取流程">
            <div role="listitem"><span>01</span><b>STRUCTURE</b><small>parameter-sourced geometry</small></div>
            <div role="listitem"><span>02</span><b>CONTROL</b><small>configuration coordinate</small></div>
            <div role="listitem"><span>03</span><b>EVALUATE</b><small>pair energy + force</small></div>
            <div role="listitem"><span>04</span><b>READOUT</b><small>inspect + export</small></div>
            <em>STATIC CONFIGURATION · NOT TIME</em>
          </div>

          <div className="micro-viewport molecular-viewport">
            <MolecularCanvas
              scene={scene}
              camera={camera}
              selectedAtomId={selectedAtom.id}
              showLabels={showLabels}
              showInteractions={showInteractions}
              showForces={showForces}
              onCameraChange={handleCameraChange}
              onAtomSelect={selectAtom}
              onAnnouncement={setAnnouncement}
            />
            <p className="visually-hidden" aria-live="polite" aria-atomic="true">{announcement}</p>
            <div className="viewport-label top-left"><span>EXPLICIT 3D COORDINATES</span><b>{scene.kind === 'water-dimer' ? 'H₂O molecular geometry + rigid O–H bonds' : 'NaCl rocksalt lattice + octahedral coordination'}</b></div>
            <div className="viewport-label top-right"><span>MODEL</span><b>{scene.modelName}</b></div>
            <div className="state-stamp"><span>STATE</span>{scene.stateId}<small>{scene.stateDigest}</small></div>
            <div className="molecular-legend" aria-label="元素与离子颜色图例">
              {scene.kind === 'water-dimer'
                ? <><span><i className="element-o" />O · −0.834e</span><span><i className="element-h" />H · +0.417e</span></>
                : <><span><i className="element-na" />Na⁺</span><span><i className="element-cl" />Cl⁻</span></>}
            </div>
            <div className="molecular-probe">
              <span>SELECTED · {selectedAtom.id}</span>
              <b>{selectedAtom.label} <em>{formatCharge(selectedAtom)}</em></b>
              <small>x/y/z = {formatVector(selectedAtom.positionAngstrom, 3)} Å</small>
              <small>|ΣF| = {selectedForceMagnitude === null ? 'NOT EVALUATED' : `${selectedForceMagnitude.toExponential(3)} kJ mol⁻¹ Å⁻¹`}</small>
            </div>
            <div className="force-legend"><span><i className="pair-force" />成对力方向</span><span><i className="net-force" />选中粒子净力</span><small>箭头长度已归一化；数值见检查器</small></div>
            <div className="canvas-help">DRAG rotate · WHEEL / + − zoom · CLICK select · ARROWS camera · 0 reset</div>
            <div className="viewport-boundary" id="molecular-boundary">
              <span>{scene.kind === 'water-dimer' ? 'FIXED-CHARGE TIP3P' : 'FINITE FIRST SHELL'}</span>
              原子表面仅用于元素识别，未按离子或范德华物理半径缩放，也不是电子密度；虚线是非键或配位指引。
            </div>
          </div>

          <div className="molecular-controls">
            <div className="molecular-slider-stack">
              {scene.kind === 'water-dimer' ? (
                <>
                  <label><span>O···O 分离距离</span><input type="range" min="2.55" max="4.8" step="0.01" value={oxygenSeparation} aria-valuetext={`${oxygenSeparation.toFixed(2)} Å`} onChange={(event) => { const value = Number(event.target.value); setOxygenSeparation(value); setAnnouncement(`O···O 分离距离已设为 ${value.toFixed(2)} Å。`); }} /><b>{oxygenSeparation.toFixed(2)} Å</b></label>
                  <label><span>供体取向</span><input type="range" min="-45" max="45" step="1" value={donorAngle} aria-valuetext={`${donorAngle.toFixed(0)} 度`} onChange={(event) => { const value = Number(event.target.value); setDonorAngle(value); setAnnouncement(`供体取向已设为 ${value.toFixed(0)} 度。`); }} /><b>{donorAngle.toFixed(0)}°</b></label>
                </>
              ) : (
                <label><span>中央 Na⁺ 的 x 位移探针</span><input type="range" min="-0.4" max="0.4" step="0.01" value={ionDisplacement} aria-valuetext={`${ionDisplacement.toFixed(2)} Å`} onChange={(event) => { const value = Number(event.target.value); setIonDisplacement(value); setAnnouncement(`中央 Na⁺ 的 x 位移已设为 ${value.toFixed(2)} Å。`); }} /><b>{ionDisplacement.toFixed(2)} Å</b></label>
              )}
            </div>
            <div className="molecular-layer-buttons" aria-label="三维画面叠层">
              <LayerButton label="元素标签" pressed={showLabels} onClick={() => setShowLabels((value) => !value)} />
              <LayerButton label="作用连线" pressed={showInteractions} onClick={() => setShowInteractions((value) => !value)} />
              <LayerButton label="力箭头" pressed={showForces} onClick={() => setShowForces((value) => !value)} />
              <button type="button" className="snapshot-download" onClick={downloadSnapshot}>导出结构 JSON</button>
            </div>
          </div>
        </section>

        <aside className="inspector-panel molecular-inspector" aria-label="结构、相互作用与模型证据">
          <div className="inspector-safety">
            <span className="live">XYZ · Å</span><span>ENERGY · kJ/mol</span><span>FORCE · kJ mol⁻¹ Å⁻¹</span>
          </div>
          <div className="inspector-tabs" role="tablist" aria-label="分子检查器页面">
            {INSPECTOR_TABS.map(([id, label], index) => (
              <button type="button" role="tab" id={`molecular-tab-${id}`} aria-controls={`molecular-panel-${id}`} aria-selected={inspectorTab === id} tabIndex={inspectorTab === id ? 0 : -1} className={inspectorTab === id ? 'active' : ''} onClick={() => setInspectorTab(id)} onKeyDown={(event) => moveInspectorTab(event, index)} key={id}>{label}</button>
            ))}
          </div>

          {inspectorTab === 'structure' && (
            <div className="inspector-body molecular-panel" role="tabpanel" id="molecular-panel-structure" aria-labelledby="molecular-tab-structure">
              <section className="selected-atom-card">
                <span>SELECTED STRUCTURAL SITE</span>
                <h2>{selectedAtom.label}<small>{selectedAtom.id}</small></h2>
                <dl>
                  <div><dt>身份</dt><dd>{selectedAtom.element} · {selectedAtom.chargeKind === 'partial' ? '部分电荷' : '形式电荷'}</dd></div>
                  <div><dt>电荷</dt><dd>{formatCharge(selectedAtom)}</dd></div>
                  <div><dt>质量</dt><dd>{selectedAtom.massDalton === null ? '静态点电荷模型未使用' : `${selectedAtom.massDalton.toFixed(5)} u`}</dd></div>
                  <div><dt>x / y / z</dt><dd>{formatVector(selectedAtom.positionAngstrom, 4)} Å</dd></div>
                </dl>
              </section>
              <section className="molecular-parameter-list">
                <div className="inspector-section-title"><span>LOCKED STRUCTURE</span><small>same scene state</small></div>
                {scene.parameters.map((parameter) => <div key={parameter.label}><span>{parameter.label}</span><b>{parameter.value}</b></div>)}
              </section>
              <section className="atom-selector">
                <div className="inspector-section-title"><span>{scene.kind === 'water-dimer' ? 'ALL ATOMS' : 'EVALUATED CENTRAL SITE'}</span><small>keyboard accessible</small></div>
                <div>{focusAtoms.map((atom) => (
                  <button type="button" key={atom.id} className={atom.id === selectedAtom.id ? 'active' : ''} aria-pressed={atom.id === selectedAtom.id} onClick={() => selectAtom(atom.id)}><b>{atom.label}</b><span>{atom.id}</span></button>
                ))}</div>
              </section>
            </div>
          )}

          {inspectorTab === 'interactions' && (
            <div className="inspector-body molecular-panel" role="tabpanel" id="molecular-panel-interactions" aria-labelledby="molecular-tab-interactions">
              <div className="molecular-energy-grid">
                <EnergyMetric label="Coulomb" value={scene.energy.coulombKjMol} />
                <EnergyMetric label={scene.kind === 'water-dimer' ? 'O–O LJ' : 'SHORT RANGE / POLARIZATION'} value={scene.kind === 'water-dimer' ? scene.energy.lennardJonesKjMol : null} />
                <EnergyMetric label={scene.kind === 'water-dimer' ? 'TOTAL' : 'FIRST-SHELL SUM'} value={scene.energy.totalKjMol} wide />
              </div>
              <p className="energy-boundary">{scene.energy.label}。已建模分项与所示合计数值闭合；蓝色净力箭头与黄色成对箭头只归一化显示方向。</p>
              <section className="net-force-card">
                <div className="inspector-section-title"><span>SELECTED NET FORCE</span><small>raw vector</small></div>
                <b>{selectedForce ? formatVector(selectedForce, 5) : 'NOT EVALUATED'}</b>
                <span>{selectedForce ? `kJ mol⁻¹ Å⁻¹ · |F| ${magnitude(selectedForce).toExponential(5)}` : '该位点不在当前局部作用求值范围内。'}</span>
              </section>
              <section className="pair-table">
                <div className="inspector-section-title"><span>PAIR CONTRIBUTIONS</span><small>{relevantInteractions.length} touching selected site</small></div>
                {relevantInteractions.length === 0 && <p>该可见片段未计算与当前边缘离子的成对贡献；选择高亮中心位点查看第一配位壳。</p>}
                {relevantInteractions.map((interaction) => (
                  <PairContribution key={interaction.id} interaction={interaction} selectedAtom={selectedAtom} atomById={atomById} />
                ))}
              </section>
              <div className="formula-card">
                <span>{scene.kind === 'water-dimer' ? 'U = Σ kₑqᵢqⱼ/rᵢⱼ + 4ε[(σ/rOO)¹² − (σ/rOO)⁶]' : 'U₁ₙₙ(selected) = Σ₆ kₑqₛqⱼ/rₛⱼ'}</span>
                <small>{scene.kind === 'water-dimer' ? '仅跨两个刚性水分子；无分子内谐振项。' : '只含选定离子第一配位壳；不是周期晶格能。'}</small>
              </div>
            </div>
          )}

          {inspectorTab === 'evidence' && (
            <div className="inspector-body molecular-panel" role="tabpanel" id="molecular-panel-evidence" aria-labelledby="molecular-tab-evidence">
              <section className="model-summary-card"><span>MODEL FORM</span><h2>{scene.modelName}</h2><p>{scene.modelSummary}</p></section>
              <section className="source-list">
                <div className="inspector-section-title"><span>PRIMARY / OFFICIAL SOURCES</span><small>click to inspect</small></div>
                {scene.sources.map((source) => <a href={source.url} target="_blank" rel="noreferrer" key={source.url}><b>{source.title}</b><span>{source.role}</span></a>)}
              </section>
              <section className="boundary-list">
                <div className="inspector-section-title"><span>NOT CLAIMED</span><small>hard boundary</small></div>
                {scene.boundaries.map((boundary) => <p key={boundary}>{boundary}</p>)}
              </section>
            </div>
          )}
        </aside>
      </div>

      <div className="lab-disclaimer" role="note">
        <b>SCIENTIFIC BOUNDARY</b>
        <span>{scene.boundaries.join(' ')}</span>
        <em>不用于材料、工艺或安全决策</em>
      </div>
    </section>
  );
}

function LayerButton({ label, pressed, onClick }: { label: string; pressed: boolean; onClick: () => void }) {
  return <button type="button" className={pressed ? 'active' : ''} aria-pressed={pressed} onClick={onClick}><i aria-hidden="true" />{label}</button>;
}

function EnergyMetric({ label, value, wide = false }: { label: string; value: number | null; wide?: boolean }) {
  return <div className={`${wide ? 'wide ' : ''}${value === null ? 'not-modeled' : ''}`}><span>{label}</span><b>{value === null ? 'NOT MODELED' : formatSigned(value, 4)}</b><small>{value === null ? 'outside this model' : 'kJ/mol'}</small></div>;
}

function PairContribution({
  interaction,
  selectedAtom,
  atomById,
}: {
  interaction: PairInteraction;
  selectedAtom: MolecularAtom;
  atomById: ReadonlyMap<string, MolecularAtom>;
}) {
  const partnerId = interaction.sourceAtomId === selectedAtom.id ? interaction.targetAtomId : interaction.sourceAtomId;
  const partner = atomById.get(partnerId);
  const forceOnSelected = interaction.targetAtomId === selectedAtom.id
    ? interaction.forceOnTargetKjMolAngstrom
    : scale(interaction.forceOnTargetKjMolAngstrom, -1);
  return (
    <div className="pair-row">
      <div><b>{selectedAtom.label} ↔ {partner?.label ?? partnerId}</b><small>{interaction.distanceAngstrom.toFixed(4)} Å · {interaction.coulombEnergyKjMol < 0 ? 'attractive Coulomb' : 'repulsive Coulomb'}</small></div>
      <div><span>U</span><b>{formatSigned(interaction.totalEnergyKjMol, 3)}</b></div>
      <div><span>|F|</span><b>{magnitude(forceOnSelected).toExponential(2)}</b></div>
    </div>
  );
}

function formatCharge(atom: MolecularAtom) {
  const sign = atom.chargeE > 0 ? '+' : atom.chargeE < 0 ? '−' : '';
  return `${sign}${Math.abs(atom.chargeE).toFixed(atom.chargeKind === 'formal' ? 0 : 3)}e`;
}

function formatVector(vector: Vector3, digits: number) {
  return `(${vector.x.toFixed(digits)}, ${vector.y.toFixed(digits)}, ${vector.z.toFixed(digits)})`;
}

function formatSigned(value: number, digits: number) {
  if (Math.abs(value) < 10 ** (-digits)) return (0).toFixed(digits);
  return `${value > 0 ? '+' : '−'}${Math.abs(value).toFixed(digits)}`;
}

function scale(vector: Vector3, factor: number): Vector3 {
  return { x: vector.x * factor, y: vector.y * factor, z: vector.z * factor };
}
