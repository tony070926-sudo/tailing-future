'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import scorecard from '@/evaluation/current-scorecard.json' with { type: 'json' };
import latestReport from '@/evaluation/latest-report.json' with { type: 'json' };
import comparatorRegistry from '@/evaluation/baselines/registry.json' with { type: 'json' };
import { ARGON_UNITS } from '@/lib/simulation/lennard-jones';
import {
  ThermochemicalWorld,
  WORLD_DOMAIN,
  type ThermochemicalSnapshot,
} from '@/lib/simulation/thermochemical-world';

type View = 'lab' | 'architecture' | 'sentinel';
type InspectorTab = 'state' | 'layers' | 'reference';
type VisualLayerKey = 'heatField' | 'thermalMesh' | 'particles' | 'species' | 'velocity' | 'periodicImages' | 'proximity';
type VisualLayers = Record<VisualLayerKey, boolean>;
type ReferenceTopic = 'orbitals' | 'hybridization' | 'bonds';
type ReferencePreset = 's' | 'p' | 'sp' | 'sp2' | 'sp3' | 'sigma' | 'pi';
type StateProbe = {
  stateId: string;
  stateDigest: string;
  cellX: number;
  cellY: number;
  temperatureKelvin: number;
  particleIndex: number | null;
  particleSpecies: 'A' | 'B' | null;
};

const BUILD_COMMIT = process.env.NEXT_PUBLIC_TAILING_COMMIT_SHA ?? 'local-build';

const INITIAL_VISUAL_LAYERS: VisualLayers = {
  heatField: true,
  thermalMesh: true,
  particles: true,
  species: true,
  velocity: false,
  periodicImages: false,
  proximity: false,
};

const VISUAL_LAYER_META: ReadonlyArray<{
  key: VisualLayerKey;
  category: 'LIVE' | 'DERIVED';
  label: string;
  detail: string;
}> = [
  { key: 'heatField', category: 'LIVE', label: '连续热场', detail: 'snapshot.field.valuesKelvin' },
  { key: 'thermalMesh', category: 'LIVE', label: '6 × 4 热单元', detail: '与后台网格逐格对齐' },
  { key: 'particles', category: 'LIVE', label: 'LJ 粒子位置', detail: '二维周期位置' },
  { key: 'species', category: 'LIVE', label: 'A / B 内部标签', detail: '非元素、非真实物种' },
  { key: 'velocity', category: 'DERIVED', label: '速度矢量', detail: 'vx / vy 方向真实 · 显示长度封顶 0.65σ' },
  { key: 'periodicImages', category: 'DERIVED', label: '周期边界映像', detail: '最小像边界的视觉副本' },
  { key: 'proximity', category: 'DERIVED', label: 'LJ 近邻范围', detail: '仅选中粒子 · r < 1.45σ · ≠ 键' },
];

const REFERENCE_PRESETS: Record<ReferenceTopic, ReadonlyArray<{ id: ReferencePreset; label: string }>> = {
  orbitals: [{ id: 's', label: 's orbital' }, { id: 'p', label: 'p orbital' }],
  hybridization: [{ id: 'sp', label: 'sp' }, { id: 'sp2', label: 'sp²' }, { id: 'sp3', label: 'sp³' }],
  bonds: [{ id: 'sigma', label: 'σ overlap' }, { id: 'pi', label: 'π overlap' }],
};

const REFERENCE_DEFAULTS: Record<ReferenceTopic, ReferencePreset> = {
  orbitals: 'p',
  hybridization: 'sp2',
  bonds: 'sigma',
};

const REFERENCE_NOTES: Record<ReferenceTopic, string> = {
  orbitals: '概率振幅与相位的二维示意；不是电子沿路径绕核运动。',
  hybridization: '规范方向的教学投影；不从 A/B 标签或 LJ 配位数推断。',
  bonds: 'σ 头碰头与 π 侧向重叠的概念图；当前世界没有 bond-order payload。',
};

const SCALE_STEPS = [
  { id: 'L0', label: '电子', detail: '量子态', status: 'planned' },
  { id: 'L1', label: '原子', detail: 'LJ 动力学', status: 'active' },
  { id: 'L2', label: '介观', detail: '微结构', status: 'planned' },
  { id: 'L3', label: '连续体', detail: '二维热场', status: 'active' },
  { id: 'L4', label: '设备', detail: '反应器', status: 'planned' },
  { id: 'L5', label: '流程', detail: '优化建议', status: 'planned' },
] as const;

const ARCHITECTURE_LAYERS = [
  { id: 'L0', scale: '电子 / 量子', state: '电子密度 · 能带 · 势垒', anchor: 'DFT / Quantum ESPRESSO', ai: 'Hamiltonian / density surrogate', status: '规划' },
  { id: 'L1', scale: '原子 / 分子', state: '坐标 · 速度 · A/B 内部标签', anchor: 'force-shifted LJ / Verlet', ai: 'MatterSim / MACE 10-frame smoke 已完成；693×2 未复现', status: '原型' },
  { id: 'L2', scale: '介观 / 微结构', state: '相场 · 晶粒 · 缺陷 · 孔隙', anchor: 'PFHub / MOOSE / CALPHAD', ai: 'neural operator / closure', status: '规划' },
  { id: 'L3', scale: '连续体 / 部件', state: '温度场 · 通量 · 边界条件', anchor: 'periodic Fourier heat solver', ai: 'closure calibration / UQ', status: '原型' },
  { id: 'L4', scale: '反应器 / 设备', state: '动力学 · 传递 · RTD · 结垢', anchor: 'Cantera / CFD / PBM', ai: 'hybrid ROM / state model', status: '规划' },
  { id: 'L5', scale: '流程 / 工厂', state: '物流 · 库存 · KPI · 约束', anchor: 'IDAES / Pyomo / DAE', ai: 'advisory policy / MPC', status: '规划' },
] as const;

const EVIDENCE_LABELS: Record<string, string> = {
  claim: '厂商 / 作者声明',
  auditable: '公开产物可审计',
  reference: '社区参考',
  reproduced: '本项目已复现',
};

const COMPARATOR_GAPS: Record<string, string> = {
  'aido-cell-1.0': '借鉴持久状态与动作原语；24/31 仍是闭源 alpha 自报。',
  'equiformerv3-dens-oam': '尚未在锁定 runner 重跑推理。',
  'tece-oam-rra-1.0': '热输运前沿产物可审计，尚无本地复现。',
  'mattersim-1.0.0-5m': 'checkpoint 已锁定且 10-frame smoke 完成；693-record 指标仍为空。',
  'mace-mpa-0': 'challenger 已锁定且 10-frame smoke 完成；693-record 盲跑仍未执行。',
  'pfhub-benchmark-3': 'Fourier 门已过，尚未完成相场—热耦合。',
  'cantera-3.2-cstr': 'A/B 标签不是反应器；下一轮先锁定 CSTR。',
  'idaes-2.12': '尚无设备、flowsheet 或优化建议。',
};

const NEXT_ACTIONS: Record<string, string> = {
  process: '锁定并复现 Cantera 3.2 CSTR 全轨迹',
  atomistic: '在同一锁定作者测试基准重跑两个开放原子基础势（未完成泄漏认证）',
  mesoscale: '实现 NIST PFHub BM3 相场—热耦合基准',
};

const weightedScore = scorecard.dimensions.reduce((total, dimension) => total + dimension.weight * dimension.score / 4, 0);

export default function Home() {
  const [activeView, setActiveView] = useState<View>('lab');

  return (
    <main className="app-shell">
      <Header activeView={activeView} onViewChange={setActiveView} />
      <SimulationLab active={activeView === 'lab'} />
      {activeView === 'architecture' && <ArchitectureView />}
      {activeView === 'sentinel' && <SentinelView />}
    </main>
  );
}

function Header({ activeView, onViewChange }: { activeView: View; onViewChange: (view: View) => void }) {
  const items: Array<{ id: View; label: string }> = [
    { id: 'lab', label: '微观实验室' },
    { id: 'architecture', label: '多尺度图谱' },
    { id: 'sentinel', label: '评测哨兵' },
  ];

  return (
    <header className="topbar">
      <button type="button" className="brand-lockup" onClick={() => onViewChange('lab')} aria-label="返回微观实验室">
        <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
        <span><b className="brand-name">TAILING FUTURE</b><small className="brand-subtitle">材料世界模型实验室</small></span>
      </button>
      <nav className="view-nav" aria-label="产品视图">
        {items.map((item) => <button type="button" key={item.id} className={activeView === item.id ? 'active' : ''} onClick={() => onViewChange(item.id)}>{item.label}</button>)}
      </nav>
      <div className="topbar-actions"><span className="pulse-dot" /><span className="evidence-state">R2 · 10-frame smoke 完成 / 693×2 未复现</span></div>
    </header>
  );
}

function SimulationLab({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number | null>(null);
  const lastPresentedAtRef = useRef(0);
  const lastWallTimeRef = useRef<number | null>(null);
  const stepAccumulatorRef = useRef(0);
  const [initialWorld] = useState(() => new ThermochemicalWorld());
  const worldRef = useRef(initialWorld);
  const [snapshot, setSnapshot] = useState<ThermochemicalSnapshot>(() => initialWorld.observe());
  const committedSnapshotRef = useRef(snapshot);
  const [running, setRunning] = useState(true);
  const [temperature, setTemperature] = useState(92);
  const [branchCount, setBranchCount] = useState(0);
  const [eventNote, setEventNote] = useState('共享热化学状态已创建');
  const [error, setError] = useState<string | null>(null);
  const [probe, setProbe] = useState<StateProbe | null>(null);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('state');
  const [visualLayers, setVisualLayers] = useState<VisualLayers>(INITIAL_VISUAL_LAYERS);
  const [referenceTopic, setReferenceTopic] = useState<ReferenceTopic>('orbitals');
  const [referencePreset, setReferencePreset] = useState<ReferencePreset>('p');
  const prefersReducedMotion = useSyncExternalStore(subscribeReducedMotion, getReducedMotion, getServerReducedMotion);
  const isAdvancing = running && !prefersReducedMotion && active;

  const present = useCallback((next: ThermochemicalSnapshot) => {
    setProbe((current) => current ? refreshProbe(next, current) : null);
    setSnapshot(next);
  }, []);

  const resetWorld = useCallback(() => {
    const next = new ThermochemicalWorld({ temperatureKelvin: temperature });
    worldRef.current = next;
    stepAccumulatorRef.current = 0;
    lastWallTimeRef.current = null;
    lastPresentedAtRef.current = 0;
    present(next.observe());
    setBranchCount(0);
    setError(null);
    setProbe(null);
    setEventNote('已回到带完整账本的确定性初始状态');
  }, [present, temperature]);

  const cloneBranch = useCallback(() => {
    try {
      const branch = worldRef.current.clone(branchCount + 1);
      worldRef.current = branch;
      const next = branch.observe();
      present(next);
      setBranchCount((count) => count + 1);
      setError(null);
      setEventNote('分支动作：从 step ' + branch.stepCount + ' 克隆 · ' + (next.lastAction?.actionId ?? 'branch'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '分支动作被适用域拒绝');
    }
  }, [branchCount, present]);

  const changeTemperature = (kelvin: number) => {
    try {
      const next = worldRef.current.setFieldTemperatureKelvin(kelvin);
      setTemperature(kelvin);
      present(next);
      setError(null);
      setEventNote('外部热动作：连续场设为 ' + kelvin + ' K · 已记入 Qext');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '热动作被适用域拒绝');
    }
  };

  const injectPulse = () => {
    try {
      const next = worldRef.current.injectCentralHeatPulse(45);
      present(next);
      setError(null);
      setEventNote('动作：中心 Gaussian 热脉冲 +45 K equivalent · 已记入 Qext');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '热脉冲被适用域拒绝');
    }
  };

  const stepOnce = () => {
    try {
      setRunning(false);
      const next = worldRef.current.advance(1);
      present(next);
      setError(null);
      setEventNote('单步动作：提交 1 个完整对称算子步');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '单步动作被适用域拒绝');
    }
  };

  const probeState = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const bounds = canvas.getBoundingClientRect();
    const layout = simulationLayout(bounds.width, bounds.height, snapshot);
    const x = (event.clientX - bounds.left - layout.offsetX) / layout.scale;
    const y = (event.clientY - bounds.top - layout.offsetY) / layout.scale;
    if (x < 0 || y < 0 || x >= snapshot.box.width || y >= snapshot.box.height) {
      setProbe(null);
      return;
    }
    const cellX = Math.min(snapshot.field.width - 1, Math.floor(x / snapshot.box.width * snapshot.field.width));
    const cellY = Math.min(snapshot.field.height - 1, Math.floor(y / snapshot.box.height * snapshot.field.height));
    setProbe(buildProbe(snapshot, cellX, cellY, nearestParticleIndex(snapshot, x, y, 0.7)));
  };

  const probeWithKeyboard = (event: ReactKeyboardEvent<HTMLCanvasElement>) => {
    const direction = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    }[event.key];
    if (direction) {
      event.preventDefault();
      const startX = probe?.cellX ?? Math.floor(snapshot.field.width / 2);
      const startY = probe?.cellY ?? Math.floor(snapshot.field.height / 2);
      const cellX = (startX + direction[0] + snapshot.field.width) % snapshot.field.width;
      const cellY = (startY + direction[1] + snapshot.field.height) % snapshot.field.height;
      const x = (cellX + 0.5) * snapshot.box.width / snapshot.field.width;
      const y = (cellY + 0.5) * snapshot.box.height / snapshot.field.height;
      setProbe(buildProbe(snapshot, cellX, cellY, nearestParticleIndex(snapshot, x, y, 0.9)));
      return;
    }
    if (event.key === 'Enter' && probe) {
      event.preventDefault();
      if (probe.particleIndex !== null) {
        setProbe(buildProbe(snapshot, probe.cellX, probe.cellY, null));
      } else {
        const x = (probe.cellX + 0.5) * snapshot.box.width / snapshot.field.width;
        const y = (probe.cellY + 0.5) * snapshot.box.height / snapshot.field.height;
        setProbe(buildProbe(snapshot, probe.cellX, probe.cellY, nearestParticleIndex(snapshot, x, y)));
      }
    }
  };

  const downloadObservation = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(snapshot, null, 2) + '\n'], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'observation-' + snapshot.stateId + '.json';
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  };

  const toggleLayer = (key: VisualLayerKey) => {
    setVisualLayers((current) => ({ ...current, [key]: !current[key] }));
  };

  const chooseReferenceTopic = (topic: ReferenceTopic) => {
    setReferenceTopic(topic);
    setReferencePreset(REFERENCE_DEFAULTS[topic]);
  };

  useEffect(() => {
    if (!active) return;
    const render = (wallTime: number) => {
      const world = worldRef.current;
      if (lastWallTimeRef.current === null) lastWallTimeRef.current = wallTime;
      const elapsedSeconds = Math.min((wallTime - lastWallTimeRef.current) / 1000, 0.1);
      lastWallTimeRef.current = wallTime;
      let current = world.observe();

      if (isAdvancing && !error) {
        stepAccumulatorRef.current += elapsedSeconds * 90;
        const steps = Math.min(Math.floor(stepAccumulatorRef.current), 12);
        if (steps > 0) {
          stepAccumulatorRef.current -= steps;
          try {
            current = world.advance(steps);
          } catch (cause) {
            setRunning(false);
            setError(cause instanceof Error ? cause.message : '数值状态异常');
          }
        }
      }

      if (wallTime - lastPresentedAtRef.current > 100) {
        lastPresentedAtRef.current = wallTime;
        present(current);
      }
      frameRef.current = requestAnimationFrame(render);
    };

    lastWallTimeRef.current = null;
    frameRef.current = requestAnimationFrame(render);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [active, error, isAdvancing, present]);

  useLayoutEffect(() => {
    committedSnapshotRef.current = snapshot;
    if (!active) return;
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    sizeSimulationCanvas(canvas, context);
    drawMicroscopicSimulation(context, snapshot, canvas.clientWidth, canvas.clientHeight, visualLayers, probe?.particleIndex ?? null);
  }, [active, probe?.particleIndex, snapshot, visualLayers]);

  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    const redrawCommittedState = () => {
      sizeSimulationCanvas(canvas, context);
      drawMicroscopicSimulation(context, committedSnapshotRef.current, canvas.clientWidth, canvas.clientHeight, visualLayers, probe?.particleIndex ?? null);
    };
    const observer = new ResizeObserver(redrawCommittedState);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [active, probe?.particleIndex, visualLayers]);

  const { metrics, conservation } = snapshot;
  const timeStepFs = initialWorld.options.timeStep * ARGON_UNITS.timePicoseconds * 1000;
  const horizonProgress = Math.min(100, snapshot.step / WORLD_DOMAIN.maximumTotalSteps * 100);
  const activeLayerCount = Object.values(visualLayers).filter(Boolean).length;
  const validityLabel = snapshot.validityDomain.status === 'in_domain' ? 'IN DOMAIN' : 'ABSTAIN';
  const simulationStatus = error
    ? '适用域保护已触发'
    : isAdvancing
      ? '固定步时钟运行中'
      : prefersReducedMotion
        ? '减弱动态 · 使用单步'
        : '已暂停';

  return (
    <section className="lab-workbench" hidden={!active}>
      <div className="lab-context-bar">
        <div>
          <span>ACTIVE BRIDGE</span>
          <b>L1 LJ particles ↔ L3 independent heat carrier</b>
          <small>tf.observation/0.3 · 2D reduced-unit demonstration</small>
        </div>
        <div className="context-badges" aria-label="模型适用边界">
          <span className={snapshot.validityDomain.status === 'in_domain' ? 'live' : 'danger'}>{validityLabel}</span>
          <span>TOY ONLY</span>
          <span>UNCALIBRATED</span>
        </div>
      </div>

      <div className="lab-grid">
        <aside className="lab-scale-rail" aria-label="L0 到 L5 多尺度层级">
          <div className="scale-rail-count"><b>2</b><span>/ 6</span><small>LIVE</small></div>
          <ol>{SCALE_STEPS.map((step) => (
            <li key={step.id} className={step.status === 'active' ? 'active' : ''} title={step.label + ' · ' + step.detail}>
              <span>{step.id}</span>
              <b>{step.label}</b>
              <i aria-hidden="true" />
            </li>
          ))}</ol>
        </aside>

        <section className="micro-stage">
          <div className="micro-stage-heading">
            <div>
              <p className="eyebrow">MICROSCOPIC WORKBENCH / 微观工作台</p>
              <h1>从一个可追溯状态观察粒子、热与因果动作。</h1>
            </div>
            <div className="stage-readout">
              <span className={error ? 'danger' : isAdvancing ? 'active' : ''} aria-live="polite"><i aria-hidden="true" />{simulationStatus}</span>
              <small>{activeLayerCount} layers · snapshot-derived</small>
            </div>
          </div>

          <div className="micro-viewport">
            <canvas
              ref={canvasRef}
              className="particle-canvas"
              onPointerDown={probeState}
              onKeyDown={probeWithKeyboard}
              tabIndex={0}
              aria-label="二维 LJ 粒子、独立连续热场与 A/B 内部标签；点击或使用方向键读取状态探针"
              aria-describedby="micro-boundary"
            />
            <div className="viewport-label top-left"><span>COMMITTED SNAPSHOT</span><b>{snapshot.particles.length} LJ sites · {snapshot.field.width} × {snapshot.field.height} thermal cells</b></div>
            <div className="viewport-label top-right"><span>SYMMETRIC OPERATOR SPLIT</span><b>Δt {initialWorld.options.timeStep.toFixed(3)}τ · ≈ {timeStepFs.toFixed(2)} fs Argon mapping</b></div>
            <div className="state-stamp"><span>STATE</span>{snapshot.stateId}<small>{snapshot.stateDigest}</small></div>
            {visualLayers.heatField && <div className="heat-legend" aria-label="热场颜色图例"><span>{WORLD_DOMAIN.minimumResolvedTemperatureKelvin} K</span><i /><span>{WORLD_DOMAIN.maximumResolvedTemperatureKelvin} K</span></div>}
            {probe && (
              <div className="state-probe" aria-live="polite">
                <span>STATE PROBE · CELL {probe.cellX},{probe.cellY}</span>
                <b>{probe.temperatureKelvin.toFixed(2)} K</b>
                <small>{probe.particleIndex === null ? '该单元附近无已选粒子' : 'particle ' + probe.particleIndex + ' · internal label ' + probe.particleSpecies}</small>
                <small>{probe.stateDigest.slice(0, 30)}…</small>
              </div>
            )}
            <div className="canvas-help">CLICK / ARROWS · ENTER toggles nearest particle</div>
            <div className="axis-glyph" aria-hidden="true"><i className="axis-x" /><i className="axis-y" /><em>x</em><strong>y</strong></div>
            <div className="viewport-boundary" id="micro-boundary"><span>TOY WORLD</span>LJ 粒子 ≠ 原子结构 · A/B ≠ 真实物种 · LJ 邻域 ≠ 化学键</div>
          </div>

          <div className="micro-transport">
            <div className="transport-primary">
              <div className="action-cluster" aria-label="世界动作">
                <button type="button" onClick={() => setRunning((value) => !value)} disabled={prefersReducedMotion} aria-label={isAdvancing ? '暂停仿真' : '继续仿真'}>{isAdvancing ? 'Ⅱ' : '▶'}<span>{isAdvancing ? '暂停' : '运行'}</span></button>
                <button type="button" onClick={stepOnce} aria-label="单步推进一个完整算子步">›<span>单步</span></button>
                <button type="button" onClick={resetWorld} aria-label="重置仿真">↺<span>重置</span></button>
                <button type="button" onClick={cloneBranch}>⑂<span>分支</span></button>
                <button type="button" className="warm" onClick={injectPulse}>＋<span>热脉冲</span></button>
              </div>
              <div className="horizon-track">
                <div><span>{error ?? eventNote}</span><b>{snapshot.step.toLocaleString()} / {WORLD_DOMAIN.maximumTotalSteps.toLocaleString()} steps</b></div>
                <i><em style={{ width: horizonProgress + '%' }} /></i>
                <small>{snapshot.timePicoseconds.toFixed(2)} ps approximate Argon mapping · action {snapshot.lastAction?.kind ?? 'initial'}</small>
              </div>
              <button type="button" className="export-button" onClick={downloadObservation}>导出观测</button>
            </div>
            <label className="temperature-control">
              <span>外部热场动作</span>
              <input type="range" min="55" max="170" value={temperature} onChange={(event) => changeTemperature(Number(event.target.value))} aria-label="连续热场温度" />
              <b>{temperature} K</b>
            </label>
          </div>
        </section>

        <aside className="inspector-panel" aria-label="状态、叠层与概念参考">
          <div className="inspector-safety">
            <span className={snapshot.validityDomain.status === 'in_domain' ? 'live' : 'danger'}>{validityLabel}</span>
            <span>MODEL FORM · TOY</span>
            <span>PARAMETERS · UNCALIBRATED</span>
          </div>
          <div className="inspector-tabs" role="tablist" aria-label="检查器页面">
            {([
              ['state', '状态'],
              ['layers', '叠层'],
              ['reference', '概念参考'],
            ] as const).map(([id, label]) => (
              <button
                type="button"
                role="tab"
                id={'inspector-tab-' + id}
                aria-controls={'inspector-panel-' + id}
                aria-selected={inspectorTab === id}
                className={inspectorTab === id ? 'active' : ''}
                onClick={() => setInspectorTab(id)}
                key={id}
              >{label}</button>
            ))}
          </div>

          {inspectorTab === 'state' && (
            <div className="inspector-body" role="tabpanel" id="inspector-panel-state" aria-labelledby="inspector-tab-state">
              <div className="metric-primary truthful">
                <span>总能量闭合 / Eref</span>
                <strong>{Math.abs(conservation.relativeEnergyResidual).toExponential(2)}</strong>
                <small>当前快照 · 非历史曲线</small>
              </div>
              <dl className="metric-grid expanded">
                <div><dt>粒子温度</dt><dd>{metrics.particleTemperatureKelvin.toFixed(1)} K</dd></div>
                <div><dt>热场均温</dt><dd>{metrics.fieldTemperatureKelvin.toFixed(1)} K</dd></div>
                <div><dt>B 内部标签</dt><dd>{(metrics.conversionFraction * 100).toFixed(1)}%</dd></div>
                <div><dt>耦合覆盖</dt><dd>{(metrics.couplingCoverage * 100).toFixed(0)}%</dd></div>
                <div><dt>近邻计数</dt><dd>{metrics.coordinationNumber.toFixed(2)}</dd></div>
                <div><dt>reduced pressure</dt><dd>{metrics.pressureReduced.toFixed(3)}</dd></div>
              </dl>
              <div className="ledger-card compact">
                <div className="card-title"><span>守恒账本</span><small>{validityLabel}</small></div>
                <div><span>质量 / 标签残差</span><b>{conservation.massResidual} / {conservation.speciesResidual}</b></div>
                <div><span>动量残差</span><b>{conservation.momentumResidual.toExponential(1)}</b></div>
                <div><span>交换闭合 / Eref</span><b>{conservation.exchangeClosureRelative.toExponential(1)}</b></div>
                <div><span>反应闭合 / Eref</span><b>{conservation.reactionClosureRelative.toExponential(1)}</b></div>
                <div><span>外部热 Qext</span><b>{conservation.externalEnergyReduced.toFixed(2)} ε</b></div>
              </div>
              <div className="coupling-card compact">
                <div className="card-title"><span>已实现尺度桥</span><small>2 primitives</small></div>
                <div className="bridge-row active"><i />LJ 粒子 ↔ 独立热场<b>局部 COM 交换</b></div>
                <div className="bridge-row active"><i />A→B 标签 → 热场<b>hazard + 热账本</b></div>
                <div className="bridge-row"><i />介观 → 反应器<b>未实现</b></div>
              </div>
              <div className="evidence-note">
                <b>R2 · CONDITIONAL</b>
                <p>MatterSim / MACE 的 10-frame 隔离 smoke 已完成；693×2 全基准未复现。当前画面仍是未校准的 LJ toy world。</p>
              </div>
            </div>
          )}

          {inspectorTab === 'layers' && (
            <div className="inspector-body" role="tabpanel" id="inspector-panel-layers" aria-labelledby="inspector-tab-layers">
              {(['LIVE', 'DERIVED'] as const).map((category) => (
                <section className="layer-section" key={category}>
                  <div className="inspector-section-title"><span>{category}</span><small>{category === 'LIVE' ? 'same snapshot' : 'positions / velocities only'}</small></div>
                  {VISUAL_LAYER_META.filter((item) => item.category === category).map((item) => (
                    <LayerToggle key={item.key} item={item} pressed={visualLayers[item.key]} onToggle={() => toggleLayer(item.key)} />
                  ))}
                </section>
              ))}
              <section className="layer-section">
                <div className="inspector-section-title"><span>UNAVAILABLE</span><small>missing observation payload</small></div>
                <div className="unavailable-layer"><span>局部能量交换箭头</span><small>后台未发布逐事件交换向量</small><em>LOCKED</em></div>
                <div className="unavailable-layer"><span>反应事件轨迹</span><small>后台只提交 A/B 结果，不提供机理路径</small><em>LOCKED</em></div>
              </section>
              {visualLayers.proximity && probe?.particleIndex === null && <p className="layer-guidance">选择一个粒子后才显示 r &lt; 1.45σ 的位置近邻。该线不是化学键、力截断或 bond order。</p>}
            </div>
          )}

          {inspectorTab === 'reference' && (
            <ConceptReferencePanel
              topic={referenceTopic}
              preset={referencePreset}
              onTopicChange={chooseReferenceTopic}
              onPresetChange={setReferencePreset}
            />
          )}
        </aside>
      </div>

      <div className="lab-disclaimer" role="note">
        <b>SCIENTIFIC BOUNDARY</b>
        <span>二维 force-shifted LJ + periodic Fourier heat + A→B internal label；无电子结构、真实反应势、轨道占据或 bond-order 求解。</span>
        <em>不用于材料选择、工艺设定或安全决策</em>
      </div>
    </section>
  );
}

function LayerToggle({
  item,
  pressed,
  onToggle,
}: {
  item: (typeof VISUAL_LAYER_META)[number];
  pressed: boolean;
  onToggle: () => void;
}) {
  return (
    <button type="button" className={'layer-toggle ' + (pressed ? 'active' : '')} aria-pressed={pressed} onClick={onToggle}>
      <span><b>{item.label}</b><small>{item.detail}</small></span>
      <i aria-hidden="true"><em /></i>
    </button>
  );
}

function ConceptReferencePanel({
  topic,
  preset,
  onTopicChange,
  onPresetChange,
}: {
  topic: ReferenceTopic;
  preset: ReferencePreset;
  onTopicChange: (topic: ReferenceTopic) => void;
  onPresetChange: (preset: ReferencePreset) => void;
}) {
  const topics: ReadonlyArray<[ReferenceTopic, string]> = [
    ['orbitals', '电子轨道'],
    ['hybridization', '杂化'],
    ['bonds', 'σ / π 键'],
  ];

  return (
    <div className="inspector-body reference-panel" role="tabpanel" id="inspector-panel-reference" aria-labelledby="inspector-tab-reference">
      <div className="reference-warning">
        <b>NOT SOLVED</b>
        <span>REFERENCE SCHEMATIC</span>
        <span>NOT BOUND TO CURRENT STATE</span>
      </div>
      <div className="reference-topics" aria-label="概念参考主题">
        {topics.map(([id, label]) => <button type="button" className={topic === id ? 'active' : ''} onClick={() => onTopicChange(id)} key={id}>{label}</button>)}
      </div>
      <div className="reference-presets" aria-label="概念参考预设">
        {REFERENCE_PRESETS[topic].map((item) => <button type="button" aria-pressed={preset === item.id} className={preset === item.id ? 'active' : ''} onClick={() => onPresetChange(item.id)} key={item.id}>{item.label}</button>)}
      </div>
      <div className={'reference-figure reference-' + topic + ' preset-' + preset} role="img" aria-label={REFERENCE_NOTES[topic]}>
        {topic === 'orbitals' && (
          <>
            <i className="reference-axis horizontal" />
            <i className="reference-axis vertical" />
            <i className="reference-core" />
            <i className="orbital-shell" />
            <i className="orbital-lobe lobe-left" />
            <i className="orbital-lobe lobe-right" />
            <span>phase −</span><span>phase +</span>
          </>
        )}
        {topic === 'hybridization' && (
          <>
            <i className="reference-core" />
            <i className="hybrid-arm arm-0" /><i className="hybrid-arm arm-1" />
            <i className="hybrid-arm arm-2" /><i className="hybrid-arm arm-3" />
            <span>{preset === 'sp3' ? 'tetrahedral projection' : preset === 'sp2' ? 'trigonal planar' : 'linear'}</span>
          </>
        )}
        {topic === 'bonds' && (
          <>
            <i className="bond-center atom-left" /><i className="bond-center atom-right" />
            <i className="sigma-overlap" />
            <i className="pi-lobe pi-top-left" /><i className="pi-lobe pi-top-right" />
            <i className="pi-lobe pi-bottom-left" /><i className="pi-lobe pi-bottom-right" />
            <span>{preset === 'pi' ? 'side-on overlap · π concept' : 'head-on overlap · σ concept'}</span>
          </>
        )}
      </div>
      <p className="reference-note">{REFERENCE_NOTES[topic]}</p>
      <div className="reference-rule"><b>升级条件</b><span>只有后台提供并验证 electron-density / orbital 或 bond-order payload 后，才可从 REFERENCE 晋级为 STATE。</span></div>
    </div>
  );
}

function buildProbe(snapshot: ThermochemicalSnapshot, cellX: number, cellY: number, particleIndex: number | null): StateProbe {
  const boundedCellX = Math.max(0, Math.min(snapshot.field.width - 1, cellX));
  const boundedCellY = Math.max(0, Math.min(snapshot.field.height - 1, cellY));
  const validParticleIndex = particleIndex !== null && snapshot.particles[particleIndex] ? particleIndex : null;
  return {
    stateId: snapshot.stateId,
    stateDigest: snapshot.stateDigest,
    cellX: boundedCellX,
    cellY: boundedCellY,
    temperatureKelvin: snapshot.field.valuesKelvin[boundedCellY * snapshot.field.width + boundedCellX],
    particleIndex: validParticleIndex,
    particleSpecies: validParticleIndex === null ? null : snapshot.particles[validParticleIndex].species,
  };
}

function refreshProbe(snapshot: ThermochemicalSnapshot, current: StateProbe) {
  if (current.particleIndex !== null && snapshot.particles[current.particleIndex]) {
    const particle = snapshot.particles[current.particleIndex];
    const cellX = Math.min(snapshot.field.width - 1, Math.floor(particle.x / snapshot.box.width * snapshot.field.width));
    const cellY = Math.min(snapshot.field.height - 1, Math.floor(particle.y / snapshot.box.height * snapshot.field.height));
    return buildProbe(snapshot, cellX, cellY, current.particleIndex);
  }
  return buildProbe(snapshot, current.cellX, current.cellY, null);
}

function nearestParticleIndex(snapshot: ThermochemicalSnapshot, x: number, y: number, maximumDistance = Number.POSITIVE_INFINITY) {
  let index: number | null = null;
  let nearest = maximumDistance;
  snapshot.particles.forEach((particle, particleIndex) => {
    const distance = Math.hypot(
      minimumImage(particle.x - x, snapshot.box.width),
      minimumImage(particle.y - y, snapshot.box.height),
    );
    if (distance < nearest) {
      nearest = distance;
      index = particleIndex;
    }
  });
  return index;
}

function ArchitectureView() {
  return (
    <section className="content-view architecture-view">
      <div className="view-intro"><div><p className="eyebrow">TAILING CORE / SYSTEM MAP</p><h1>先验证尺度协议，再让 AI 学习未知闭合。</h1></div><p>R2 已把热容、交换、反应和资源域变成可执行硬门；MatterSim 与 MACE 的 10-frame 隔离 smoke 已完成，693×2 全基准尚未复现。</p></div>
      <div className="layer-stack">
        {ARCHITECTURE_LAYERS.map((layer, index) => (
          <article className={layer.status === '原型' ? 'layer-card active' : 'layer-card'} key={layer.id}>
            <div className="layer-id"><span>{layer.id}</span><small>{layer.status}</small></div>
            <div className="layer-copy"><h2>{layer.scale}</h2><p>{layer.state}</p></div>
            <div className="layer-engine"><span>PHYSICS ANCHOR</span><b>{layer.anchor}</b></div>
            <div className="layer-ai"><span>AI ROLE</span><b>{layer.ai}</b></div>
            {index < ARCHITECTURE_LAYERS.length - 1 && <i className="layer-connector" aria-hidden="true" />}
          </article>
        ))}
      </div>
      <div className="core-contract">
        <div><span>SHARED WORLD STATE</span><b>particles · thermal field · species · ledger · UQ · provenance</b></div>
        <div><span>TYPED ACTION</span><b>step · heat · pulse · branch · replay · abstain</b></div>
        <div><span>HARD GATES</span><b>schema · identity · mass · momentum · energy · domain</b></div>
      </div>
      <div className="roadmap-row"><span><b>R0</b> LJ 核心</span><i /><span><b>R1</b> 热化学桥</span><i /><span className="current"><b>R2</b> 原子势盲跑</span><i /><span><b>R3</b> 材料桥</span><i /><span><b>R4+</b> 流程 / Foundry</span></div>
    </section>
  );
}

function SentinelView() {
  return (
    <section className="content-view sentinel-view">
      <div className="view-intro"><div><p className="eyebrow">TAILING SENTINEL / ITERATION 02</p><h1>候选版本必须同时通过物理、契约与证据门。</h1><small className="build-provenance">commit {BUILD_COMMIT.slice(0, 12)} · report {latestReport.artifactDigest.slice(7, 19)}</small></div><div className="score-orbit"><strong>{weightedScore.toFixed(1)}</strong><span>/ 100<br />证据成熟度</span><em>{latestReport.verdict.toUpperCase()}</em></div></div>
      <div className="sentinel-grid">
        <article className="scorecard-panel panel-block">
          <div className="panel-heading"><span>锁定评分卡</span><small>{scorecard.candidateVersion}</small></div>
          <div className="score-table">{scorecard.dimensions.map((dimension) => (
            <div className="score-row" key={dimension.id}>
              <span className="score-label">{dimension.displayLabel}<small>{dimension.summary}</small></span>
              <span className="score-weight">{dimension.weight}%</span>
              <span className="score-track"><i style={{ width: `${dimension.score * 25}%` }} /></span>
              <b>E{dimension.score}</b>
            </div>
          ))}</div>
          <p className="score-disclaimer">{weightedScore.toFixed(1)} 只表示证据成熟度，不代表模型精度或达到 SOTA。CLAIM / AUDITABLE 不会被计作本项目复现结果。</p>
        </article>
        <article className="loop-panel panel-block">
          <div className="panel-heading"><span>监督闭环</span><small>champion / challenger</small></div>
          <ol className="loop-steps">
            <li className="complete"><i>01</i><span><b>SOTA Scout</b><small>锁定一手来源、版本与证据等级</small></span></li>
            <li className="complete"><i>02</i><span><b>Builder</b><small>生成候选、schema 与 artifact digest</small></span></li>
            <li className="complete"><i>03</i><span><b>Independent Evaluator</b><small>只读运行解析、守恒和回归门禁</small></span></li>
            <li className="active"><i>04</i><span><b>Gap Planner</b><small>只交付三项可验收任务</small></span></li>
            <li><i>05</i><span><b>Supervisor Gate</b><small>accept / conditional / reject</small></span></li>
          </ol>
          <div className="loop-rule">CI 任一上游门禁失败都会生成新的 REJECT；本地未报告状态保持 CONDITIONAL，且不会复用旧 PASS。</div>
        </article>
      </div>
      <article className="comparators-panel panel-block">
        <div className="panel-heading"><span>外部比较器注册表</span><small>snapshot · {comparatorRegistry.snapshotDate}</small></div>
        <div className="comparator-head"><span>比较器</span><span>角色</span><span>证据</span><span>当前最大差距</span></div>
        {comparatorRegistry.comparators.map((item) => <div className="comparator-row" key={item.id}><b>{item.name}</b><span>{item.scope}</span><em>{EVIDENCE_LABELS[item.evidenceClass]}</em><p>{COMPARATOR_GAPS[item.id] ?? item.reason}</p></div>)}
      </article>
      <div className="next-gaps"><span>NEXT ITERATION · SENTINEL OUTPUT</span>{latestReport.gaps.map((gap) => <b key={gap.dimension}>{gap.severity} · {NEXT_ACTIONS[gap.dimension] ?? gap.recommendedChange}</b>)}</div>
    </section>
  );
}

function sizeSimulationCanvas(canvas: HTMLCanvasElement, context: CanvasRenderingContext2D) {
  const bounds = canvas.getBoundingClientRect();
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.floor(bounds.width * ratio));
  const height = Math.max(1, Math.floor(bounds.height * ratio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function drawMicroscopicSimulation(
  context: CanvasRenderingContext2D,
  snapshot: ThermochemicalSnapshot,
  width: number,
  height: number,
  layers: VisualLayers,
  selectedParticleIndex: number | null,
) {
  context.clearRect(0, 0, width, height);
  context.fillStyle = '#070b0e';
  context.fillRect(0, 0, width, height);

  const ambient = context.createRadialGradient(width * 0.52, height * 0.45, 0, width * 0.52, height * 0.45, width * 0.7);
  ambient.addColorStop(0, 'rgba(54, 101, 92, 0.12)');
  ambient.addColorStop(0.58, 'rgba(13, 24, 25, 0.04)');
  ambient.addColorStop(1, 'rgba(7, 11, 14, 0)');
  context.fillStyle = ambient;
  context.fillRect(0, 0, width, height);

  const { scale, offsetX, offsetY } = simulationLayout(width, height, snapshot);
  const worldWidth = snapshot.box.width * scale;
  const worldHeight = snapshot.box.height * scale;
  const cellWidth = worldWidth / snapshot.field.width;
  const cellHeight = worldHeight / snapshot.field.height;
  const temperatureRange = WORLD_DOMAIN.maximumResolvedTemperatureKelvin - WORLD_DOMAIN.minimumResolvedTemperatureKelvin;
  const point = (index: number) => ({
    x: offsetX + snapshot.particles[index].x * scale,
    y: offsetY + snapshot.particles[index].y * scale,
  });

  context.save();
  context.beginPath();
  context.rect(offsetX, offsetY, worldWidth, worldHeight);
  context.clip();

  if (layers.heatField) {
    snapshot.field.valuesKelvin.forEach((temperature, index) => {
      const cellX = index % snapshot.field.width;
      const cellY = Math.floor(index / snapshot.field.width);
      const normalized = Math.min(1, Math.max(0, (temperature - WORLD_DOMAIN.minimumResolvedTemperatureKelvin) / temperatureRange));
      context.fillStyle = heatColor(normalized);
      context.fillRect(offsetX + cellX * cellWidth, offsetY + cellY * cellHeight, cellWidth + 0.6, cellHeight + 0.6);
    });
  } else {
    context.fillStyle = 'rgba(16, 25, 29, 0.72)';
    context.fillRect(offsetX, offsetY, worldWidth, worldHeight);
  }

  if (layers.thermalMesh) {
    context.strokeStyle = 'rgba(189, 212, 204, 0.13)';
    context.lineWidth = 1;
    for (let column = 1; column < snapshot.field.width; column += 1) {
      const x = offsetX + column * cellWidth;
      context.beginPath();
      context.moveTo(x, offsetY);
      context.lineTo(x, offsetY + worldHeight);
      context.stroke();
    }
    for (let row = 1; row < snapshot.field.height; row += 1) {
      const y = offsetY + row * cellHeight;
      context.beginPath();
      context.moveTo(offsetX, y);
      context.lineTo(offsetX + worldWidth, y);
      context.stroke();
    }
  }

  if (layers.proximity && selectedParticleIndex !== null && snapshot.particles[selectedParticleIndex]) {
    const selected = snapshot.particles[selectedParticleIndex];
    const selectedPoint = point(selectedParticleIndex);
    context.strokeStyle = 'rgba(119, 175, 255, 0.42)';
    context.lineWidth = 1;
    context.setLineDash([4, 5]);
    context.beginPath();
    context.arc(selectedPoint.x, selectedPoint.y, 1.45 * scale, 0, Math.PI * 2);
    context.stroke();
    context.setLineDash([]);
    snapshot.particles.forEach((particle, index) => {
      if (index === selectedParticleIndex) return;
      const dx = minimumImage(particle.x - selected.x, snapshot.box.width);
      const dy = minimumImage(particle.y - selected.y, snapshot.box.height);
      if (Math.hypot(dx, dy) >= 1.45) return;
      context.strokeStyle = 'rgba(119, 175, 255, 0.55)';
      context.beginPath();
      context.moveTo(selectedPoint.x, selectedPoint.y);
      context.lineTo(selectedPoint.x + dx * scale, selectedPoint.y + dy * scale);
      context.stroke();
    });
  }

  if (layers.velocity) {
    snapshot.particles.forEach((particle, index) => {
      const origin = point(index);
      const rawX = particle.vx * scale * 0.32;
      const rawY = particle.vy * scale * 0.32;
      const rawLength = Math.hypot(rawX, rawY);
      const clamp = rawLength > 0 ? Math.min(1, scale * 0.65 / rawLength) : 0;
      const vectorX = rawX * clamp;
      const vectorY = rawY * clamp;
      context.strokeStyle = 'rgba(119, 175, 255, 0.7)';
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(origin.x, origin.y);
      context.lineTo(origin.x + vectorX, origin.y + vectorY);
      context.stroke();
    });
  }

  if (layers.particles) {
    snapshot.particles.forEach((particle, index) => {
      const position = point(index);
      drawParticleGlyph(context, position.x, position.y, layers.species ? particle.species : null, index === selectedParticleIndex, 1);
    });
  }
  context.restore();

  if (layers.periodicImages && layers.particles) {
    const edgeDistance = 0.8;
    snapshot.particles.forEach((particle) => {
      const xShifts = [0];
      const yShifts = [0];
      if (particle.x < edgeDistance) xShifts.push(snapshot.box.width);
      if (particle.x > snapshot.box.width - edgeDistance) xShifts.push(-snapshot.box.width);
      if (particle.y < edgeDistance) yShifts.push(snapshot.box.height);
      if (particle.y > snapshot.box.height - edgeDistance) yShifts.push(-snapshot.box.height);
      xShifts.forEach((shiftX) => yShifts.forEach((shiftY) => {
        if (shiftX === 0 && shiftY === 0) return;
        drawParticleGlyph(
          context,
          offsetX + (particle.x + shiftX) * scale,
          offsetY + (particle.y + shiftY) * scale,
          layers.species ? particle.species : null,
          false,
          0.34,
        );
      }));
    });
  }

  context.strokeStyle = 'rgba(174, 205, 195, 0.34)';
  context.lineWidth = 1;
  context.strokeRect(offsetX + 0.5, offsetY + 0.5, worldWidth - 1, worldHeight - 1);
}

function drawParticleGlyph(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  species: 'A' | 'B' | null,
  selected: boolean,
  opacity: number,
) {
  const color = species === 'B' ? [242, 183, 107] : species === 'A' ? [109, 222, 198] : [199, 215, 210];
  const halo = context.createRadialGradient(x, y, 0, x, y, 11);
  halo.addColorStop(0, `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${0.34 * opacity})`);
  halo.addColorStop(1, `rgba(${color[0]}, ${color[1]}, ${color[2]}, 0)`);
  context.fillStyle = halo;
  context.beginPath();
  context.arc(x, y, 11, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${0.94 * opacity})`;
  context.beginPath();
  context.arc(x, y, 3.2, 0, Math.PI * 2);
  context.fill();
  if (selected) {
    context.strokeStyle = 'rgba(237, 245, 242, 0.9)';
    context.lineWidth = 1.25;
    context.beginPath();
    context.arc(x, y, 7.4, 0, Math.PI * 2);
    context.stroke();
  }
}

function heatColor(value: number) {
  const cold = [25, 83, 96];
  const hot = [208, 118, 61];
  const channel = (index: number) => Math.round(cold[index] + (hot[index] - cold[index]) * value);
  return `rgba(${channel(0)}, ${channel(1)}, ${channel(2)}, ${0.18 + value * 0.38})`;
}

function minimumImage(delta: number, extent: number) { return delta - extent * Math.round(delta / extent); }

function simulationLayout(width: number, height: number, snapshot: ThermochemicalSnapshot) {
  const padding = Math.min(58, width * 0.08);
  const scale = Math.min((width - padding * 2) / snapshot.box.width, (height - padding * 2) / snapshot.box.height);
  return {
    scale,
    offsetX: (width - snapshot.box.width * scale) / 2,
    offsetY: (height - snapshot.box.height * scale) / 2,
  };
}

function subscribeReducedMotion(callback: () => void) {
  const query = window.matchMedia('(prefers-reduced-motion: reduce)');
  query.addEventListener('change', callback);
  return () => query.removeEventListener('change', callback);
}

function getReducedMotion() { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
function getServerReducedMotion() { return false; }
