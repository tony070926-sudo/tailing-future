'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPeriodicAtomisticRenderFrame } from '@/lib/molecular/periodic-atomistic-render-frame';
import {
  createPeriodicArgonCalibrationWorld,
  type PeriodicAtomisticObservationV041,
  type PeriodicAtomisticWorld,
} from '@/lib/simulation/periodic-atomistic-world';
import { INITIAL_MOLECULAR_CAMERA, type MolecularCamera } from './molecular-canvas';
import {
  PeriodicAtomisticCanvas,
  type PeriodicAtomisticVisualLayers,
} from './periodic-atomistic-canvas';

const INITIAL_LAYERS: PeriodicAtomisticVisualLayers = {
  labels: true,
  unitCell: true,
  neighbors: true,
  periodicImages: true,
  trajectories: true,
  velocity: true,
  force: true,
  localVirial: true,
};

export function PeriodicAtomisticLab({ active, onBack }: { active: boolean; onBack: () => void }) {
  const [initialSession] = useState(() => {
    const world = createPeriodicArgonCalibrationWorld();
    return { world, observation: world.observe(), neighborCacheBuildCount: world.neighborCacheDiagnostics().buildCount };
  });
  const worldRef = useRef<PeriodicAtomisticWorld>(initialSession.world);
  const [history, setHistory] = useState<ReadonlyArray<PeriodicAtomisticObservationV041>>(() => [initialSession.observation]);
  const [cursor, setCursor] = useState(0);
  const [selectedAtomId, setSelectedAtomId] = useState('Ar-00');
  const [camera, setCamera] = useState<MolecularCamera>({ ...INITIAL_MOLECULAR_CAMERA });
  const [layers, setLayers] = useState<PeriodicAtomisticVisualLayers>(INITIAL_LAYERS);
  const [playing, setPlaying] = useState(false);
  const [wallRate, setWallRate] = useState(1);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('三维周期 FCC Ar 校准晶胞已载入。');
  const [neighborCacheBuildCount, setNeighborCacheBuildCount] = useState(initialSession.neighborCacheBuildCount);
  const observation = history[Math.min(cursor, history.length - 1)]!;
  const renderFrame = useMemo(() => createPeriodicAtomisticRenderFrame(observation), [observation]);
  const renderHistory = useMemo(() => history
    .slice(Math.max(0, cursor - 47), cursor + 1)
    .map(createPeriodicAtomisticRenderFrame), [cursor, history]);
  const selectedAtom = observation.atoms.find((atom) => atom.id === selectedAtomId) ?? observation.atoms[0];
  const selectedNeighbors = observation.pairInteractions.filter((pair) => pair.role === 'nonbonded'
    && (pair.atomAId === selectedAtom.id || pair.atomBId === selectedAtom.id));
  const selectedVirialTrace = selectedAtom.localVirialKjMol.xx + selectedAtom.localVirialKjMol.yy + selectedAtom.localVirialKjMol.zz;

  const append = useCallback((next: PeriodicAtomisticObservationV041) => {
    setHistory((current) => {
      const frames = [...current, next].slice(-240);
      setCursor(frames.length - 1);
      return frames;
    });
  }, []);

  const advance = useCallback((substeps: number, automatic: boolean) => {
    try {
      const next = worldRef.current!.advance(substeps);
      append(next);
      setNeighborCacheBuildCount(worldRef.current!.neighborCacheDiagnostics().buildCount);
      setError(null);
      if (!automatic) setAnnouncement(`周期 NVE 求解器推进 ${substeps} 步；当前 ${next.step} / ${next.timePicoseconds.toFixed(4)} ps。`);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setPlaying(false);
      setError(message);
      setAnnouncement(`周期求解器硬门停止：${message}`);
    }
  }, [append]);

  const reset = useCallback(() => {
    worldRef.current = createPeriodicArgonCalibrationWorld();
    const initial = worldRef.current.observe();
    setHistory([initial]);
    setCursor(0);
    setPlaying(false);
    setError(null);
    setSelectedAtomId('Ar-00');
    setNeighborCacheBuildCount(worldRef.current.neighborCacheDiagnostics().buildCount);
    setAnnouncement('周期晶胞已复位到锁定 FCC Ar 初态；相机和图层未写入 solver state。');
  }, []);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => {
      setReducedMotion(query.matches);
      if (query.matches) setPlaying(false);
    };
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    if (active) return;
    const timeout = window.setTimeout(() => setPlaying(false), 0);
    return () => window.clearTimeout(timeout);
  }, [active]);
  useEffect(() => {
    if (!playing || !active || reducedMotion) return;
    const interval = window.setInterval(() => advance(5, true), Math.max(40, Math.round(220 / wallRate)));
    return () => window.clearInterval(interval);
  }, [active, advance, playing, reducedMotion, wallRate]);

  const togglePlaying = () => {
    if (reducedMotion) {
      setAnnouncement('减少动态效果已启用；自动推进关闭，但“求解一步”仍可使用。');
      return;
    }
    setCursor(history.length - 1);
    setPlaying((current) => !current);
  };
  const seek = (next: number) => {
    const bounded = Math.max(0, Math.min(next, history.length - 1));
    setPlaying(false);
    setCursor(bounded);
    setAnnouncement(`正在检查缓存 observation：step ${history[bounded]!.step}；求解器已暂停。`);
  };
  const toggleLayer = (key: keyof PeriodicAtomisticVisualLayers, label: string) => {
    const before = worldRef.current!.serialize();
    setLayers((current) => ({ ...current, [key]: !current[key] }));
    if (JSON.stringify(worldRef.current!.serialize()) !== JSON.stringify(before)) {
      setError('render-state isolation failed');
      setPlaying(false);
      return;
    }
    setAnnouncement(`${label}图层已切换；solver bytes 与 physical digest 未改变。`);
  };
  const selectAtom = (id: string) => {
    setSelectedAtomId(id);
    const atom = observation.atoms.find((candidate) => candidate.id === id);
    if (atom) setAnnouncement(`已选择 ${atom.label}；邻居、力、速度和局部 virial 均来自 step ${observation.step}。`);
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([`${JSON.stringify(observation, null, 2)}\n`], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `periodic-fcc-argon-step-${observation.step.toString().padStart(5, '0')}.json`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  };
  const back = () => {
    setPlaying(false);
    onBack();
  };

  return (
    <section className="lab-workbench periodic-atomistic-workbench" hidden={!active}>
      <div className="lab-context-bar periodic-context-bar">
        <div>
          <span>TAILING FUTURE / PERIODIC ATOMISTIC WORLD</span>
          <b>3D fixed cell → Verlet neighbors → atomic forces → Velocity Verlet → immutable observation</b>
          <small>tf.periodic-atomistic-observation/0.4.1 · local short-range calibration</small>
        </div>
        <div className="context-badges" aria-label="周期求解器适用边界">
          <span className="live">SOLVER DRIVEN</span><span className="derived">3D PBC · NVE</span><span>SHORT RANGE</span><span>NOT NaCl–H₂O</span>
        </div>
      </div>

      <div className="periodic-stage-heading">
        <div>
          <button type="button" className="periodic-back" onClick={back}>← 返回分子与离子场景</button>
          <p className="eyebrow">ATOMISTIC DYNAMICS FOUNDATION / v0.4.1</p>
          <h1>由求解器驱动的三维周期原子实验台。</h1>
          <p>这里没有随机漂浮小球：每个密度轮廓对应一个真实 Ar 原子位点；位置、邻居、速度、力、virial 与跨边界镜像都来自同一 observation。</p>
        </div>
        <div className="periodic-stage-readout">
          <span><i className={playing ? 'running' : ''} />{playing ? 'RUNNING' : 'PAUSED'} · NVE</span>
          <b>step {observation.step} · {observation.timePicoseconds.toFixed(4)} ps</b>
          <small>{observation.atoms.length} atoms · {observation.neighborList.activePairCount} active pairs</small>
        </div>
      </div>

      <div className="periodic-lab-grid">
        <main className="periodic-main">
          <div className="periodic-viewport">
            <PeriodicAtomisticCanvas
              frame={renderFrame}
              history={renderHistory}
              camera={camera}
              selectedAtomId={selectedAtom.id}
              layers={layers}
              onCameraChange={setCamera}
              onAtomSelect={selectAtom}
              onAnnouncement={setAnnouncement}
            />
            <p className="visually-hidden" aria-live="polite" aria-atomic="true">{announcement}</p>
            <div className="periodic-viewport-label"><span>WRAPPED XYZ · TRUE PBC</span><b>FCC Ar / force-shifted LJ</b></div>
            <div className="periodic-viewport-digest"><span>PHYSICAL</span><b>{observation.physicalDigest}</b></div>
            <div className="periodic-visual-boundary"><b>VISUAL ENVELOPE · NOT ELECTRON DENSITY</b><span>轮廓仅编码原子身份与局部 virial proxy；没有 DFT 电子密度、轨道或极化。</span></div>
          </div>

          <div className="periodic-transport" aria-label="周期原子动力学时间控制">
            <div><span>PHYSICAL TIME</span><b>Δt 0.0010000 ps</b><small>wall rate 与固定物理时间步分离</small></div>
            <div className="periodic-transport-buttons" role="group">
              <button type="button" className={playing ? 'active' : ''} onClick={togglePlaying} aria-pressed={playing} aria-disabled={reducedMotion}>{playing ? 'Ⅱ 暂停' : '▶ 求解'}</button>
              <button type="button" disabled={cursor === 0} onClick={() => seek(cursor - 1)}>← 缓存</button>
              <button type="button" disabled={cursor === history.length - 1} onClick={() => seek(cursor + 1)}>缓存 →</button>
              <button type="button" onClick={() => advance(1, false)}>求解一步</button>
              <button type="button" onClick={reset}>↺ 初态</button>
            </div>
            <label><span>缓存时间轴</span><input type="range" min="0" max={Math.max(0, history.length - 1)} value={cursor} onChange={(event) => seek(Number(event.target.value))} /><b>{history.length} frames</b></label>
            <div className="periodic-wall-rate" role="group" aria-label="墙钟显示速率"><small>WALL RATE</small>{[1, 2, 4].map((rate) => <button type="button" key={rate} className={wallRate === rate ? 'active' : ''} onClick={() => setWallRate(rate)} disabled={reducedMotion}>{rate}×</button>)}</div>
            {error && <p className="trajectory-error" role="alert"><b>HARD GATE STOP</b>{error}</p>}
          </div>

          <div className="periodic-layer-grid" aria-label="周期原子可视图层">
            {(Object.entries({
              unitCell: ['三维晶胞', 'H=[a b c]'], neighbors: ['选中原子邻居', 'minimum image'], periodicImages: ['周期镜像', 'cross-face ghost'], trajectories: ['真实轨迹', 'face-split'], velocity: ['速度矢量', 'solver v'], force: ['受力矢量', 'solver F'], localVirial: ['局部 virial', 'stress proxy'], labels: ['原子标识', 'stable ID'],
            }) as Array<[keyof PeriodicAtomisticVisualLayers, [string, string]]>).map(([key, [label, detail]]) => (
              <button type="button" key={key} className={layers[key] ? 'active' : ''} aria-pressed={layers[key]} onClick={() => toggleLayer(key, label)}><b>{label}</b><small>{detail}</small></button>
            ))}
            <button type="button" className="periodic-download" onClick={download}><b>导出 observation</b><small>完整可审计 JSON</small></button>
          </div>
        </main>

        <aside className="periodic-inspector">
          <section className="periodic-selected">
            <span>SELECTED ATOM</span><h2>{selectedAtom.label}</h2><b>{selectedAtom.id}</b>
            <dl>
              <div><dt>wrapped XYZ</dt><dd>{formatVector(selectedAtom.wrappedPositionAngstrom, 4)} Å</dd></div>
              <div><dt>image</dt><dd>{formatIntVector(selectedAtom.image)}</dd></div>
              <div><dt>velocity</dt><dd>{formatVector(selectedAtom.velocityAngstromPerPicosecond, 5)} Å ps⁻¹</dd></div>
              <div><dt>force</dt><dd>{formatVector(selectedAtom.forceKjMolAngstrom, 5)} kJ mol⁻¹ Å⁻¹</dd></div>
              <div><dt>neighbors</dt><dd>{selectedNeighbors.length}</dd></div>
              <div><dt>local virial trace</dt><dd>{selectedVirialTrace.toExponential(4)} kJ mol⁻¹</dd></div>
            </dl>
          </section>

          <section className="periodic-metric-grid" aria-label="周期原子求解指标">
            <Metric label="TOTAL E" value={`${observation.energy.totalKjMol.toFixed(7)} kJ/mol`} />
            <Metric label="MAX |ΔE| / REF" value={observation.energy.maximumRelativeExcursion.toExponential(3)} />
            <Metric label="TEMPERATURE" value={`${observation.thermodynamics.temperatureKelvin.toFixed(3)} K`} />
            <Metric label="PRESSURE" value={`${observation.thermodynamics.pressureKjMolAngstrom3.toExponential(3)} kJ mol⁻¹ Å⁻³`} />
            <Metric label="MOMENTUM RESIDUAL" value={observation.conservation.momentumResidual.toExponential(3)} />
            <Metric label="INTERNAL FORCE" value={observation.conservation.internalForceResidualKjMolAngstrom.toExponential(3)} />
            <Metric label="FACE CROSSINGS" value={String(observation.events.faceCrossingCount)} />
            <Metric label="SESSION CACHE BUILDS" value={`${neighborCacheBuildCount} · ephemeral`} />
          </section>

          <section className="periodic-state-card">
            <span>STATE LINEAGE</span><b>{observation.stateId}</b><small>state · {observation.stateDigest}</small><small>topology · {observation.topologyDigest}</small>
          </section>
          <section className="periodic-boundaries">
            <div><span>NOT CLAIMED</span><small>hard scientific boundary</small></div>
            {observation.boundaries.map((boundary) => <p key={boundary}>{boundary}</p>)}
          </section>
        </aside>
      </div>
      <div className="periodic-disclaimer"><b>CALIBRATION, NOT MATERIAL PREDICTION</b><span>这是三维周期短程 NVE 基础门，不是 NaCl–水、Ewald/PME、MACE/MatterSim 或工业工艺建议。</span></div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><span>{label}</span><b>{value}</b></div>;
}

function formatVector(vector: { x: number; y: number; z: number }, digits: number) {
  return `(${vector.x.toFixed(digits)}, ${vector.y.toFixed(digits)}, ${vector.z.toFixed(digits)})`;
}

function formatIntVector(vector: { x: number; y: number; z: number }) {
  return `(${vector.x}, ${vector.y}, ${vector.z})`;
}
