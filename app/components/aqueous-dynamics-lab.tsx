'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createAqueousDynamicsRenderFrameV042,
  createAqueousDynamicsRenderTrajectoryV043,
  getLocallyExecutedAqueousDynamicsRenderTrajectorySampleV043,
  type AqueousDynamicsRenderTrajectoryV043,
} from '@/lib/molecular/aqueous-dynamics-render-frame';
import {
  createAqueousDynamicsWebglSceneV042,
  createAqueousDynamicsWebglSceneFromTrajectoryV043,
  type AqueousDynamicsWebglSceneV042,
} from '@/lib/molecular/aqueous-dynamics-webgl-scene';
import {
  createNaClTip3pFiniteSizeCalibrationWorldV042,
  type AqueousDynamicsObservationV042,
  type AqueousDynamicsWorldV042,
} from '@/lib/simulation/aqueous-dynamics-world';
import {
  AqueousDynamicsWebgl,
  type AqueousWebglRenderStats,
  type AqueousWebglStatus,
  type AqueousWebglVisualLayers,
} from './aqueous-dynamics-webgl';

const INITIAL_LAYERS: AqueousWebglVisualLayers = {
  atoms: true,
  structuralOH: true,
  constraintDiagnostic: false,
  evaluatedLJ: true,
  triclinicCell: true,
  totalForce: true,
  forceComponents: false,
};

const FORCE_COMPONENTS = [
  ['ewaldRealSpace', 'Ewald 实空间'],
  ['ewaldReciprocalSpace', 'Ewald 倒空间'],
  ['ewaldSelfCorrection', 'Ewald 自修正'],
  ['coulombExceptionCorrection', 'Coulomb 例外修正'],
  ['lennardJonesFinal', 'Lennard–Jones'],
] as const;

type UnavailableSourceLayerKey = keyof AqueousDynamicsWebglSceneV042['unavailableSourceLayers'];
type SourceLayerAvailabilityKey = keyof AqueousDynamicsWebglSceneV042['sourceFrameLayerAvailability'];

const UNAVAILABLE_LAYER_COPY = {
  trajectory: { label: '帧内轨迹字段', availabilityKey: 'trajectory' },
  coulombPairInteractions: { label: 'Coulomb 配对边', availabilityKey: 'coulombPair' },
  electricField: { label: '电场', availabilityKey: 'electricField' },
  electronDensity: { label: '电子密度', availabilityKey: 'electronDensity' },
  orbital: { label: '分子轨道', availabilityKey: 'orbital' },
  electrostaticPotential: { label: '静电势', availabilityKey: 'esp' },
  pressureBar: { label: '压力', availabilityKey: 'pressure' },
  totalStressKjMolAngstrom3: { label: '总应力', availabilityKey: 'stress' },
  localVirialByAtom: { label: '原子局部 virial', availabilityKey: 'localVirial' },
  bondOrder: { label: '键级', availabilityKey: 'bondOrder' },
  reaction: { label: '化学反应', availabilityKey: 'reaction' },
} as const satisfies Record<UnavailableSourceLayerKey, Readonly<{
  label: string;
  availabilityKey: SourceLayerAvailabilityKey;
}>>;

export function AqueousDynamicsLab({ active, onBack }: { active: boolean; onBack: () => void }) {
  const [initialSession] = useState(() => {
    const world = createNaClTip3pFiniteSizeCalibrationWorldV042();
    return { world, observation: world.observe() };
  });
  const worldRef = useRef<AqueousDynamicsWorldV042>(initialSession.world);
  const [observation, setObservation] = useState<AqueousDynamicsObservationV042>(initialSession.observation);
  const [selectedAtomId, setSelectedAtomId] = useState('sodium-na');
  const [layers, setLayers] = useState<AqueousWebglVisualLayers>(INITIAL_LAYERS);
  const [rendererStatus, setRendererStatus] = useState<AqueousWebglStatus>('checking-webgl2');
  const [renderStats, setRenderStats] = useState<AqueousWebglRenderStats>({
    drawCalls: 0,
    triangles: 0,
    geometries: 0,
    textures: 0,
  });
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('NaCl–TIP3P 冻结初态已载入，正在建立 WebGL2 场景。');
  const [trajectory, setTrajectory] = useState<AqueousDynamicsRenderTrajectoryV043 | null>(null);
  const [trajectorySampleIndex, setTrajectorySampleIndex] = useState(0);
  const [trajectoryBusy, setTrajectoryBusy] = useState(false);
  const [playing, setPlaying] = useState(false);

  const trajectorySample = useMemo(
    () => trajectory
      ? getLocallyExecutedAqueousDynamicsRenderTrajectorySampleV043(
        trajectory,
        trajectorySampleIndex,
      )
      : null,
    [trajectory, trajectorySampleIndex],
  );
  const displayObservation = trajectorySample?.observation ?? observation;
  const manualRenderFrame = useMemo(
    () => createAqueousDynamicsRenderFrameV042(observation),
    [observation],
  );
  const renderFrame = trajectorySample?.renderFrame ?? manualRenderFrame;
  const sceneModel = useMemo(
    () => trajectory
      ? createAqueousDynamicsWebglSceneFromTrajectoryV043(
        trajectory,
        trajectorySampleIndex,
        selectedAtomId,
      )
      : createAqueousDynamicsWebglSceneV042(
        manualRenderFrame,
        observation,
        selectedAtomId,
      ),
    [manualRenderFrame, observation, selectedAtomId, trajectory, trajectorySampleIndex],
  );
  const selectedAtom = renderFrame.atoms.find((atom) => atom.id === selectedAtomId)
    ?? renderFrame.atoms[0];
  const selectedPlacement = sceneModel.atomSpheres.find((atom) => atom.atomId === selectedAtom.id)!;
  const selectedMoleculeGauge = sceneModel.projection.coordinateGauge.moleculeLatticeShifts
    .find((entry) => entry.moleculeId === selectedAtom.moleculeId)!;
  const selectedLennardJonesPairs = sceneModel.evaluatedLennardJonesSegments.filter(
    (pair) => pair.atomAId === selectedAtom.id || pair.atomBId === selectedAtom.id,
  );
  const totalForceMagnitude = magnitude(selectedAtom.forceKjMolAngstrom);
  const unavailableLayerKeys = Object.keys(
    sceneModel.unavailableSourceLayers,
  ) as UnavailableSourceLayerKey[];

  useEffect(() => {
    if (!playing || !trajectory) return;
    const finalIndex = trajectory.samples.length - 1;
    if (trajectorySampleIndex >= finalIndex) return;
    const timer = window.setTimeout(() => {
      const nextIndex = Math.min(trajectorySampleIndex + 1, finalIndex);
      setTrajectorySampleIndex(nextIndex);
      if (nextIndex >= finalIndex) setPlaying(false);
    }, 320);
    return () => window.clearTimeout(timer);
  }, [playing, trajectory, trajectorySampleIndex]);

  const advanceOneStep = useCallback(() => {
    if (trajectory) {
      setAnnouncement('精确轨迹回放期间，播放和 seek 只移动显示游标，不会再次调用求解器。');
      return;
    }
    if (observation.step !== 0) {
      setAnnouncement('当前可视适配器只接受锁定的初态与一步结果；继续推进已被硬门阻止。');
      return;
    }
    try {
      const next = worldRef.current.advance({ kind: 'advance', substeps: 1 });
      setObservation(next);
      setError(null);
      setAnnouncement(`求解器完成且仅完成一步：step ${next.step}，物理时间 ${next.timePicoseconds.toFixed(6)} ps。`);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setError(message);
      setAnnouncement(`一步求解被数值硬门停止：${message}`);
    }
  }, [observation.step, trajectory]);

  const generateExactTrajectory = useCallback(() => {
    if (trajectoryBusy) return;
    setTrajectoryBusy(true);
    setPlaying(false);
    setError(null);
    setAnnouncement('正在独立执行并重放 0–10 accepted-step 前缀；只有逐帧摘要完全相等才会载入。');
    window.setTimeout(() => {
      try {
        const next = createAqueousDynamicsRenderTrajectoryV043(10);
        setTrajectory(next);
        setTrajectorySampleIndex(0);
        setError(null);
        setAnnouncement(`已载入 ${next.samples.length} 个精确求解端点；播放、seek 与 WebGL RAF 均不会推进 solver。`);
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : String(caught);
        setError(message);
        setAnnouncement(`轨迹构建被确定性或数值硬门停止：${message}`);
      } finally {
        setTrajectoryBusy(false);
      }
    }, 0);
  }, [trajectoryBusy]);

  const togglePlayback = useCallback(() => {
    if (!trajectory) return;
    const finalIndex = trajectory.samples.length - 1;
    if (!playing && trajectorySampleIndex >= finalIndex) setTrajectorySampleIndex(0);
    setPlaying((current) => !current);
    setAnnouncement('播放时钟只选择已验证 exact endpoint；本次操作产生 0 次 solver 调用且不执行插值。');
  }, [playing, trajectory, trajectorySampleIndex]);

  const seekTrajectory = useCallback((nextIndex: number) => {
    if (!trajectory) return;
    const bounded = Math.max(0, Math.min(trajectory.samples.length - 1, Math.trunc(nextIndex)));
    setPlaying(false);
    setTrajectorySampleIndex(bounded);
    const sample = trajectory.samples[bounded];
    setAnnouncement(`显示游标已定位到 exact step ${sample.step}；seek 产生 0 次 solver 调用。`);
  }, [trajectory]);

  const reset = useCallback(() => {
    const world = createNaClTip3pFiniteSizeCalibrationWorldV042();
    worldRef.current = world;
    setObservation(world.observe());
    setTrajectory(null);
    setTrajectorySampleIndex(0);
    setPlaying(false);
    setSelectedAtomId('sodium-na');
    setError(null);
    setAnnouncement('已回到锁定 step 0；相机与显示图层不属于 solver state。');
  }, []);

  const selectAtom = useCallback((atomId: string) => {
    const atom = renderFrame.atoms.find((candidate) => candidate.id === atomId);
    if (!atom) return;
    setSelectedAtomId(atomId);
    setAnnouncement(`已选择 ${atom.siteName}（${atomId}）；坐标、电荷、速度和力均来自 step ${renderFrame.step} observation。`);
  }, [renderFrame]);

  const toggleLayer = (key: keyof AqueousWebglVisualLayers, label: string) => {
    setLayers((current) => ({ ...current, [key]: !current[key] }));
    setAnnouncement(`${label}显示已切换；observation digest 与 solver state 未改变。`);
  };

  const downloadObservation = () => {
    const url = URL.createObjectURL(new Blob(
      [`${JSON.stringify(displayObservation, null, 2)}\n`],
      { type: 'application/json' },
    ));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `nacl-tip3p-step-${displayObservation.step}.json`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  };

  const back = () => {
    setPlaying(false);
    onBack();
  };

  return (
    <section className="lab-workbench aqueous-dynamics-workbench" hidden={!active}>
      <div className="lab-context-bar aqueous-context-bar">
        <div>
          <span>TAILING FUTURE / AQUEOUS ATOMISTIC WORLD</span>
          <b>solver endpoints → independent replay receipt → fixed-gauge scene → WebGL2 depth</b>
          <small>{trajectory ? 'tf.aqueous-dynamics-render-trajectory/0.4.3 · exact endpoint playback' : 'tf.aqueous-dynamics-observation/0.4.2 · finite-size integration calibration'}</small>
        </div>
        <div className="context-badges" aria-label="水溶液求解器适用边界">
          <span className="live">SOLVER DRIVEN</span><span className="derived">{rendererStatus === 'ready' ? 'WEBGL2 · TRUE DEPTH' : 'WEBGL2 · FALLBACK'}</span><span>3D PBC · NVE</span><span>{trajectory ? '11 EXACT ENDPOINTS' : 'STEP 0 / 1'}</span><span>8 ATOMS · NOT BULK</span>
        </div>
      </div>

      <div className="aqueous-stage-heading">
        <div>
          <button type="button" className="aqueous-back" onClick={back}>← 返回分子与周期场景</button>
          <p className="eyebrow">ATOMISTIC DYNAMICS LAB / {trajectory ? 'v0.4.3 EXACT TRAJECTORY' : 'v0.4.2 FRAME ORACLE'}</p>
          <h1>真实分子结构、周期边界与粒子作用进入同一个三维空间。</h1>
          <p>不是随机漂浮的小球：两个刚性 TIP3P 水分子、一对 Na⁺/Cl⁻ 离子、三斜晶胞、实际求值的 Lennard–Jones 对和原子力都绑定到同一份冻结 observation。</p>
        </div>
        <div className="aqueous-stage-readout">
          <span><i className={rendererStatus === 'ready' ? 'ready' : ''} />{formatRendererStatus(rendererStatus)}</span>
          <b>step {displayObservation.step} · {displayObservation.timePicoseconds.toFixed(6)} ps</b>
          <small>{renderFrame.atoms.length} atoms · {sceneModel.evaluatedLennardJonesSegments.length} evaluated LJ pairs · {renderStats.drawCalls} GPU calls</small>
        </div>
      </div>

      <div className="aqueous-lab-grid">
        <main className="aqueous-main">
          <div className="aqueous-viewport">
            <AqueousDynamicsWebgl
              active={active}
              sceneModel={sceneModel}
              selectedAtomId={selectedAtom.id}
              layers={layers}
              onAtomSelect={selectAtom}
              onAnnouncement={setAnnouncement}
              onStatusChange={setRendererStatus}
              onRenderStats={setRenderStats}
            />
            <p className="visually-hidden" aria-live="polite" aria-atomic="true">{announcement}</p>
            <div className="aqueous-viewport-label">
              <span>{trajectory ? 'SOURCE UNWRAPPED · FIXED TRAJECTORY EPOCH · NO DISPLAY REBASE' : 'SODIUM-NA ANCHORED · INTACT-MOLECULE MINIMUM-IMAGE GAUGE'}</span>
              <b>NaCl + 2 TIP3P H₂O / direct Ewald + plain-cutoff LJ</b>
            </div>
            <div className="aqueous-viewport-digest"><span>PHYSICAL DIGEST · EXACT ENDPOINT</span><b>{displayObservation.physicalDigest}</b></div>
            <div className="aqueous-force-scale"><b>FORCE DISPLAY SCALE</b><span>0.002 Å per kJ mol⁻¹ Å⁻¹ · direction exact, length is a labeled visual transform</span></div>
          </div>

          <div className="aqueous-transport" aria-label="NaCl–TIP3P 精确端点轨迹控制">
            <div><span>{trajectory ? 'EXACT SOLVER ENDPOINT' : 'LOCKED PHYSICAL STEP'}</span><b>Δt 0.001000 ps · NVE</b><small>{trajectory ? '0–10 全前缀已独立重放；renderer interpolation = null' : 'v0.4.2 frame oracle 只接受 step 0 / 1'}</small></div>
            <div className="aqueous-transport-buttons" role="group">
              {trajectory ? (
                <>
                  <button type="button" className="primary" onClick={togglePlayback}>{playing ? '暂停' : '播放 exact'}</button>
                  <button type="button" onClick={() => seekTrajectory(trajectorySampleIndex - 1)} disabled={trajectorySampleIndex === 0}>← 前一帧</button>
                  <button type="button" onClick={() => seekTrajectory(trajectorySampleIndex + 1)} disabled={trajectorySampleIndex === trajectory.samples.length - 1}>后一帧 →</button>
                </>
              ) : (
                <>
                  <button type="button" className="primary" onClick={generateExactTrajectory} disabled={trajectoryBusy}>{trajectoryBusy ? '双重执行中…' : '生成 0–10 精确轨迹'}</button>
                  <button type="button" onClick={advanceOneStep} disabled={observation.step !== 0 || trajectoryBusy}>仅求解一步</button>
                </>
              )}
              <button type="button" onClick={reset}>↺ 回到初态</button>
              <button type="button" onClick={downloadObservation}>导出 observation</button>
            </div>
            {trajectory ? (
              <div className="aqueous-trajectory-track">
                <div><span>EXACT ENDPOINT · NO INTERPOLATION</span><b>{trajectorySampleIndex} / {trajectory.samples.length - 1}</b></div>
                <input
                  type="range"
                  min={0}
                  max={trajectory.samples.length - 1}
                  step={1}
                  value={trajectorySampleIndex}
                  aria-label="选择精确求解端点"
                  aria-valuetext={`step ${displayObservation.step}, ${displayObservation.timePicoseconds.toFixed(6)} ps`}
                  onChange={(event) => seekTrajectory(Number(event.currentTarget.value))}
                />
                <small>PLAYBACK CURSOR ONLY · 0 SOLVER CALLS ON PLAY / SEEK · RASTER RAF READ-ONLY</small>
              </div>
            ) : (
              <div className="aqueous-step-track" role="group" aria-label="锁定观察帧">
                <button type="button" className={observation.step === 0 ? 'active' : ''} onClick={reset} aria-pressed={observation.step === 0}><span>0</span><b>初态</b></button>
                <i aria-hidden="true" />
                <button type="button" className={observation.step === 1 ? 'active' : ''} onClick={observation.step === 0 ? advanceOneStep : undefined} aria-pressed={observation.step === 1}><span>1</span><b>一步结果</b></button>
              </div>
            )}
            {error && <p className="trajectory-error" role="alert"><b>HARD GATE STOP</b>{error}</p>}
          </div>

          <div className="aqueous-layer-grid" aria-label="可审计三维图层">
            {(Object.entries({
              atoms: ['原子 / 离子位点', '8 个小型元素位点，非物理半径'],
              structuralOH: ['O–H 结构', '刚性距离约束，非能量键'],
              constraintDiagnostic: ['H–H 诊断', '刚性约束诊断，非能量项'],
              evaluatedLJ: ['LJ 相互作用', '实际 evaluated pair；B 端可为周期镜像，不新增原子'],
              triclinicCell: ['三斜晶胞', '12 条真实边'],
              totalForce: ['总受力', '选中原子的 solver F'],
              forceComponents: ['力分解', '5 项 composer 分量'],
            }) as Array<[keyof AqueousWebglVisualLayers, [string, string]]>).map(([key, [label, detail]]) => (
              <button type="button" key={key} className={layers[key] ? 'active' : ''} aria-pressed={layers[key]} onClick={() => toggleLayer(key, label)}>
                <b>{label}</b><small>{detail}</small>
              </button>
            ))}
          </div>

          <div className="aqueous-atom-strip" aria-label="按元素和稳定 ID 选择原子">
            {sceneModel.atomSpheres.map((atom) => {
              const source = renderFrame.atoms.find((candidate) => candidate.id === atom.atomId)!;
              return (
                <button
                  type="button"
                  key={atom.atomId}
                  className={`${selectedAtom.id === atom.atomId ? 'active ' : ''}element-${atom.element.toLowerCase()}`}
                  aria-pressed={selectedAtom.id === atom.atomId}
                  onClick={() => selectAtom(atom.atomId)}
                >
                  <span>{formatElement(atom.element, source.chargeE)}</span><b>{source.siteName}</b><small>{atom.atomId}</small>
                </button>
              );
            })}
          </div>
        </main>

        <aside className="aqueous-inspector">
          <section className="aqueous-selected">
            <span>SELECTED ATOM / SOLVER TRUTH</span>
            <div className={`aqueous-element-mark element-${selectedAtom.element.toLowerCase()}`}><b>{formatElement(selectedAtom.element, selectedAtom.chargeE)}</b><small>{selectedAtom.siteName}</small></div>
            <h2>{selectedAtom.id}</h2>
            <dl>
              <div><dt>display XYZ / gauge</dt><dd>{formatVector(selectedPlacement.positionAngstrom, 5)} Å</dd></div>
              <div><dt>wrapped XYZ</dt><dd>{formatVector(selectedAtom.wrappedPositionAngstrom, 5)} Å</dd></div>
              <div><dt>molecule gauge shift</dt><dd>{formatInt3(selectedMoleculeGauge.latticeImageShift)} · whole molecule</dd></div>
              <div><dt>site image from wrapped</dt><dd>{formatInt3(selectedPlacement.latticeImageShiftFromWrapped)} · {selectedPlacement.usesPeriodicContinuityCopy ? 'includes internal water continuity' : 'anchor-consistent placement'}</dd></div>
              <div><dt>velocity</dt><dd>{formatVector(selectedAtom.velocityAngstromPerPicosecond, 6)} Å ps⁻¹</dd></div>
              <div><dt>charge</dt><dd>{selectedAtom.chargeE.toFixed(4)} e</dd></div>
              <div><dt>mass</dt><dd>{selectedAtom.massDalton.toFixed(6)} Da</dd></div>
              <div><dt>|total force|</dt><dd>{totalForceMagnitude.toFixed(6)} kJ mol⁻¹ Å⁻¹</dd></div>
              <div><dt>evaluated LJ neighbors</dt><dd>{selectedLennardJonesPairs.length}</dd></div>
            </dl>
          </section>

          <section className="aqueous-force-card">
            <div><span>FORCE DECOMPOSITION</span><small>exact vectors · display scale separate</small></div>
            <p><b>TOTAL</b><span>{formatVector(selectedAtom.forceKjMolAngstrom, 5)}</span><em>{magnitude(selectedAtom.forceKjMolAngstrom).toFixed(5)}</em></p>
            {FORCE_COMPONENTS.map(([key, label]) => {
              const vector = selectedAtom.forceComponentsKjMolAngstrom[key];
              return <p key={key}><b>{label}</b><span>{formatVector(vector, 5)}</span><em>{magnitude(vector).toFixed(5)}</em></p>;
            })}
          </section>

          <section className="aqueous-metric-grid" aria-label="数值守恒和 WebGL 指标">
            <Metric label="TOTAL ENERGY" value={`${displayObservation.energy.totalKjMol.toFixed(6)} kJ/mol`} />
            <Metric label="RELATIVE ΔE" value={displayObservation.energy.relativeExcursion.toExponential(3)} />
            <Metric label="TEMPERATURE" value={`${displayObservation.thermodynamics.temperatureKelvin.toFixed(4)} K`} />
            <Metric label="POSITION RESIDUAL" value={`${displayObservation.constraints.maximumPositionResidualAngstrom.toExponential(3)} Å`} />
            <Metric label="MOMENTUM RESIDUAL" value={displayObservation.conservation.momentumResidual.toExponential(3)} />
            <Metric label="INTERNAL FORCE" value={displayObservation.conservation.internalForceResidualKjMolAngstrom.toExponential(3)} />
            <Metric label="GPU TRIANGLES" value={renderStats.triangles.toLocaleString()} />
            <Metric label="GPU RESOURCES" value={`${renderStats.geometries} geo · ${renderStats.textures} tex`} />
          </section>

          <section className="aqueous-unavailable">
            <div><span>FAIL-CLOSED LAYERS</span><small>没有数据就不绘制</small></div>
            {unavailableLayerKeys.map((key) => {
              const copy = UNAVAILABLE_LAYER_COPY[key];
              return (
                <button type="button" key={key} disabled aria-disabled="true">
                  <b>{copy.label}</b>
                  <small>{sceneModel.sourceFrameLayerAvailability[copy.availabilityKey]}</small>
                </button>
              );
            })}
          </section>

          <section className="aqueous-lineage">
            <span>STATE LINEAGE</span>
            <b>{displayObservation.stateId}</b>
            <small>observation · {displayObservation.observationDigest}</small>
            <small>render · {renderFrame.renderDigest}</small>
            <small>scene · {sceneModel.sceneDigest}</small>
            <small>step work · {displayObservation.integration.lastStepWorkUnitsConsumed.toLocaleString()} units</small>
            {trajectory && <small>trajectory · {trajectory.trajectoryDigest}</small>}
            {trajectory && <small>independent replay · {trajectory.determinism.receiptDigest}</small>}
          </section>
        </aside>
      </div>

      <div className="aqueous-disclaimer">
        <b>FINITE-SIZE CALIBRATION · NOT BULK SOLUTION</b>
        <span>原子表面尺寸是明确标注的显示半径，不是离子半径或电子密度；结构 O–H 线是刚性距离约束；LJ 线段的 B 端可使用周期相互作用映像但不新增位点；Coulomb pair、完整压力/应力和化学反应尚未声明。</span>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><span>{label}</span><b>{value}</b></div>;
}

function magnitude(vector: Readonly<{ x: number; y: number; z: number }>) {
  return Math.hypot(vector.x, vector.y, vector.z);
}

function formatVector(vector: Readonly<{ x: number; y: number; z: number }>, digits: number) {
  return `[${vector.x.toFixed(digits)}, ${vector.y.toFixed(digits)}, ${vector.z.toFixed(digits)}]`;
}

function formatInt3(vector: Readonly<{ x: number; y: number; z: number }>) {
  return `[${vector.x}, ${vector.y}, ${vector.z}]`;
}

function formatElement(element: string, chargeE: number) {
  if (element === 'Na') return 'Na⁺';
  if (element === 'Cl') return 'Cl⁻';
  if (chargeE > 0) return `${element}δ+`;
  if (chargeE < 0) return `${element}δ−`;
  return element;
}

function formatRendererStatus(status: AqueousWebglStatus) {
  if (status === 'ready') return 'WEBGL2 READY · ON DEMAND';
  if (status === 'webgl2-unavailable') return 'WEBGL2 UNAVAILABLE';
  if (status === 'context-lost') return 'GPU CONTEXT LOST';
  if (status === 'initialization-failed') return 'WEBGL2 INIT FAILED';
  return 'CHECKING WEBGL2';
}
