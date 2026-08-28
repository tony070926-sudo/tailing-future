'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent } from 'react';
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

const SCALE_STEPS = [
  { label: '电子', detail: '量子态', status: 'planned' },
  { label: '原子', detail: '分子动力学', status: 'active' },
  { label: '介观', detail: '微结构演化', status: 'planned' },
  { label: '连续体', detail: '二维热场', status: 'active' },
  { label: '工艺', detail: '流程优化', status: 'planned' },
] as const;

const ARCHITECTURE_LAYERS = [
  { id: 'L0', scale: '电子 / 量子', state: '电子密度 · 能带 · 势垒', anchor: 'DFT / Quantum ESPRESSO', ai: 'Hamiltonian / density surrogate', status: '规划' },
  { id: 'L1', scale: '原子 / 分子', state: '坐标 · 速度 · A/B 内部标签', anchor: 'force-shifted LJ / Verlet', ai: 'MatterSim 5M / MACE 已冻结，尚未运行', status: '原型' },
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
  'mattersim-1.0.0-5m': 'checkpoint 与 Random-TP 已锁定；尚无本地推理产物。',
  'mace-mpa-0': 'challenger 字节已锁定；尚未完成盲跑。',
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
      <div className="topbar-actions"><span className="pulse-dot" /><span className="evidence-state">R2 · 物理门已加固 / 原子势待运行</span></div>
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
  const prefersReducedMotion = useSyncExternalStore(subscribeReducedMotion, getReducedMotion, getServerReducedMotion);
  const isAdvancing = running && !prefersReducedMotion && active;

  const present = useCallback((next: ThermochemicalSnapshot) => {
    setProbe((current) => current?.stateId === next.stateId ? current : null);
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
      setEventNote(`分支动作：从 step ${branch.stepCount} 克隆 · ${next.lastAction?.actionId ?? 'branch'}`);
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
      setEventNote(`外部热动作：连续场设为 ${kelvin} K · 已记入 Qext`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '热动作被适用域拒绝');
    }
  };

  const injectPulse = () => {
    try {
      const next = worldRef.current.injectCentralHeatPulse(45);
      present(next);
      setError(null);
      setEventNote('动作：中心热脉冲 +45 K equivalent · 已记入 Qext');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '热脉冲被适用域拒绝');
    }
  };

  const probeState = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const bounds = canvas.getBoundingClientRect();
    const layout = simulationLayout(bounds.width, bounds.height, snapshot);
    const x = (event.clientX - bounds.left - layout.offsetX) / layout.scale;
    const y = (event.clientY - bounds.top - layout.offsetY) / layout.scale;
    if (x < 0 || y < 0 || x >= snapshot.box.width || y >= snapshot.box.height) return setProbe(null);
    const cellX = Math.min(snapshot.field.width - 1, Math.floor(x / snapshot.box.width * snapshot.field.width));
    const cellY = Math.min(snapshot.field.height - 1, Math.floor(y / snapshot.box.height * snapshot.field.height));
    let particleIndex: number | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;
    snapshot.particles.forEach((particle, index) => {
      const distance = Math.hypot(minimumImage(particle.x - x, snapshot.box.width), minimumImage(particle.y - y, snapshot.box.height));
      if (distance < nearestDistance) { nearestDistance = distance; particleIndex = index; }
    });
    if (nearestDistance > 0.7) particleIndex = null;
    setProbe({
      stateId: snapshot.stateId,
      stateDigest: snapshot.stateDigest,
      cellX,
      cellY,
      temperatureKelvin: snapshot.field.valuesKelvin[cellY * snapshot.field.width + cellX],
      particleIndex,
      particleSpecies: particleIndex === null ? null : snapshot.particles[particleIndex].species,
    });
  };

  const downloadObservation = () => {
    const url = URL.createObjectURL(new Blob([`${JSON.stringify(snapshot, null, 2)}\n`], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `observation-${snapshot.stateId}.json`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
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
        stepAccumulatorRef.current += elapsedSeconds * 180;
        const steps = Math.min(Math.floor(stepAccumulatorRef.current), 18);
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
    drawSimulation(context, snapshot, canvas.clientWidth, canvas.clientHeight);
  }, [active, snapshot]);

  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    const redrawCommittedState = () => {
      sizeSimulationCanvas(canvas, context);
      drawSimulation(context, committedSnapshotRef.current, canvas.clientWidth, canvas.clientHeight);
    };
    const observer = new ResizeObserver(redrawCommittedState);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [active]);

  const { metrics, conservation } = snapshot;
  const timeStepFs = initialWorld.options.timeStep * ARGON_UNITS.timePicoseconds * 1000;

  return (
    <div className="workspace" hidden={!active}>
      <aside className="scale-rail" aria-label="多尺度模型层级">
        <div className="rail-heading"><span>尺度栈</span><small>02 / 05 active</small></div>
        <ol>{SCALE_STEPS.map((step, index) => (
          <li key={step.label} className={step.status === 'active' ? 'active' : ''}>
            <span className="step-index">0{index + 1}</span>
            <span className="step-copy"><b>{step.label}</b><small>{step.detail}</small></span>
            <span className="step-state" aria-hidden="true" />
          </li>
        ))}</ol>
        <div className="model-note"><span>MODEL BASIS</span><p>LJ + Fourier heat + A→B</p><small>2D · symmetric split · explicit ledger</small></div>
      </aside>

      <section className="simulation-stage">
        <div className="stage-heading">
          <div><p className="eyebrow">THERMOCHEMICAL WORLD / 热化学世界</p><h1>看见能量如何在粒子、热场与反应间流动。</h1></div>
          <div className={`stage-status ${isAdvancing ? '' : 'paused'}`}><span />{error ? '适用域保护已触发' : isAdvancing ? '固定步时钟运行中' : prefersReducedMotion ? '减弱动态模式' : '已暂停'}</div>
        </div>
        <div className="viewport-card">
          <canvas ref={canvasRef} className="particle-canvas" onPointerDown={probeState} aria-label="同一状态中的二维粒子、连续热场与反应标签可视化；点击可读取状态探针" />
          <div className="viewport-grid" aria-hidden="true" />
          <div className="viewport-label top-left"><span>A / B INTERNAL LABELS</span><b>{snapshot.particles.length} particles · {snapshot.field.width}×{snapshot.field.height} thermal cells</b></div>
          <div className="viewport-label top-right"><span>SYMMETRIC OPERATOR SPLIT</span><b>{timeStepFs.toFixed(2)} fs / MD step</b></div>
          <div className="state-stamp"><span>STATE</span>{snapshot.stateId}<small>{snapshot.stateDigest}</small></div>
          <div className="heat-legend" aria-hidden="true"><span>20 K</span><i /><span>260 K</span><b><em />A</b><b><em />B</b></div>
          {probe && <div className="state-probe"><span>STATE PROBE · cell {probe.cellX},{probe.cellY}</span><b>{probe.temperatureKelvin.toFixed(2)} K</b><small>{probe.particleIndex === null ? '附近无粒子' : `particle ${probe.particleIndex} · label ${probe.particleSpecies}`} · {probe.stateDigest.slice(0, 22)}…</small></div>}
          <div className="axis-glyph" aria-hidden="true"><i className="axis-x" /><i className="axis-y" /><em>x</em><strong>y</strong></div>
          <div className="honesty-badge"><span>保守 toy world</span>邻居参考线 ≠ 化学键；A/B 非真实物种；不用于工程决策</div>
        </div>
        <div className="transport-bar">
          <div className="transport-buttons">
            <button type="button" onClick={() => setRunning((value) => !value)} aria-label={isAdvancing ? '暂停仿真' : '继续仿真'}>{isAdvancing ? 'Ⅱ' : '▶'}</button>
            <button type="button" onClick={resetWorld} aria-label="重置仿真">↺</button>
            <button type="button" className="branch-button" onClick={cloneBranch}>分支 +</button>
            <button type="button" className="pulse-button" onClick={injectPulse}>热脉冲</button>
            <button type="button" className="download-button" onClick={downloadObservation}>下载观测</button>
          </div>
          <div className="timeline"><div className="timeline-copy"><span>{error ?? eventNote}</span><b>{snapshot.step.toLocaleString()} steps · {snapshot.timePicoseconds.toFixed(2)} ps</b></div><div className="timeline-track"><i style={{ width: `${18 + (snapshot.step % 12000) / 148}%` }} /></div></div>
          <label className="temperature-control"><span>连续热场</span><input type="range" min="55" max="170" value={temperature} onChange={(event) => changeTemperature(Number(event.target.value))} aria-label="连续热场温度" /><b>{temperature} K</b></label>
        </div>
      </section>

      <aside className="telemetry-panel">
        <div className="telemetry-heading"><span>SHARED STATE</span><small>{branchCount} branch</small></div>
        <div className="metric-primary"><span>总能量闭合 / Eref</span><strong>{Math.abs(conservation.relativeEnergyResidual).toExponential(2)}</strong><div className="sparkline" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /><i /><i /></div></div>
        <dl className="metric-grid">
          <div><dt>粒子温度</dt><dd>{metrics.particleTemperatureKelvin.toFixed(1)} K</dd></div>
          <div><dt>热场均温</dt><dd>{metrics.fieldTemperatureKelvin.toFixed(1)} K</dd></div>
          <div><dt>B 转化率</dt><dd>{(metrics.conversionFraction * 100).toFixed(1)}%</dd></div>
          <div><dt>耦合覆盖</dt><dd>{(metrics.couplingCoverage * 100).toFixed(0)}%</dd></div>
        </dl>
        <div className="ledger-card">
          <div className="card-title"><span>守恒账本</span><small>{snapshot.validityDomain.status === 'in_domain' ? 'IN DOMAIN' : 'ABSTAIN'}</small></div>
          <div><span>质量 / 物种残差</span><b>{conservation.massResidual} / {conservation.speciesResidual}</b></div>
          <div><span>动量残差</span><b>{conservation.momentumResidual.toExponential(1)}</b></div>
          <div><span>交换闭合 / Eref</span><b>{conservation.exchangeClosureRelative.toExponential(1)}</b></div>
          <div><span>原始粒子动量残差</span><b>{conservation.rawParticleMomentumResidual.toExponential(1)}</b></div>
          <div><span>外部热 Qext</span><b>{conservation.externalEnergyReduced.toFixed(2)} ε</b></div>
        </div>
        <div className="coupling-card">
          <div className="card-title"><span>尺度桥接</span><small>2 verified primitives</small></div>
          <div className="bridge-row active"><i />原子 ↔ 连续热场<b>局部 COM 能量交换</b></div>
          <div className="bridge-row active"><i />A→B → 热场<b>冻结 hazard + 放热账本</b></div>
          <div className="bridge-row"><i />介观 → 反应器<b>待 PFHub / Cantera</b></div>
        </div>
        <div className="confidence-card"><div className="confidence-top"><span>证据等级</span><b>R2 · CONDITIONAL</b></div><p>三模态收敛、73 组解析交换、原子反应结算与 8×5000 尾部均由 CI 门禁；真实原子势仍为 manifest-only，参数尚未对材料校准。</p></div>
      </aside>
    </div>
  );
}

function ArchitectureView() {
  return (
    <section className="content-view architecture-view">
      <div className="view-intro"><div><p className="eyebrow">TAILING CORE / SYSTEM MAP</p><h1>先验证尺度协议，再让 AI 学习未知闭合。</h1></div><p>R2 已把热容、交换、反应和资源域变成可执行硬门；MatterSim 与 MACE 只完成了哈希冻结，尚未获得“已复现”资格。</p></div>
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

function drawSimulation(context: CanvasRenderingContext2D, snapshot: ThermochemicalSnapshot, width: number, height: number) {
  context.clearRect(0, 0, width, height);
  const gradient = context.createRadialGradient(width * 0.5, height * 0.48, 0, width * 0.5, height * 0.48, width * 0.65);
  gradient.addColorStop(0, 'rgba(57, 104, 93, 0.12)');
  gradient.addColorStop(0.6, 'rgba(14, 21, 22, 0.03)');
  gradient.addColorStop(1, 'rgba(8, 12, 13, 0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  const { scale, offsetX, offsetY } = simulationLayout(width, height, snapshot);
  const fieldWidth = snapshot.box.width * scale / snapshot.field.width;
  const fieldHeight = snapshot.box.height * scale / snapshot.field.height;
  const range = WORLD_DOMAIN.maximumResolvedTemperatureKelvin - WORLD_DOMAIN.minimumResolvedTemperatureKelvin;

  context.save();
  context.beginPath();
  context.rect(offsetX, offsetY, snapshot.box.width * scale, snapshot.box.height * scale);
  context.clip();
  snapshot.field.valuesKelvin.forEach((temperature, index) => {
    const cellX = index % snapshot.field.width;
    const cellY = Math.floor(index / snapshot.field.width);
    const normalized = Math.min(1, Math.max(0, (temperature - WORLD_DOMAIN.minimumResolvedTemperatureKelvin) / range));
    context.fillStyle = heatColor(normalized);
    context.fillRect(offsetX + cellX * fieldWidth, offsetY + cellY * fieldHeight, fieldWidth + 0.7, fieldHeight + 0.7);
  });

  const points = snapshot.particles.map((particle) => ({
    x: offsetX + particle.x * scale,
    y: offsetY + particle.y * scale,
    speed: Math.hypot(particle.vx, particle.vy),
    species: particle.species,
  }));

  context.lineWidth = 0.7;
  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      const dx = minimumImage(snapshot.particles[j].x - snapshot.particles[i].x, snapshot.box.width);
      const dy = minimumImage(snapshot.particles[j].y - snapshot.particles[i].y, snapshot.box.height);
      const distance = Math.hypot(dx, dy);
      if (distance >= 1.42) continue;
      context.strokeStyle = `rgba(159, 205, 193, ${Math.max(0.03, 0.15 - distance * 0.06)})`;
      context.beginPath();
      context.moveTo(points[i].x, points[i].y);
      context.lineTo(points[i].x + dx * scale, points[i].y + dy * scale);
      context.stroke();
      context.beginPath();
      context.moveTo(points[j].x, points[j].y);
      context.lineTo(points[j].x - dx * scale, points[j].y - dy * scale);
      context.stroke();
    }
  }

  points.forEach((point) => {
    const isProduct = point.species === 'B';
    const radius = 2.6 + Math.min(point.speed, 2) * 0.5;
    const halo = context.createRadialGradient(point.x, point.y, 0, point.x, point.y, radius * 3.8);
    halo.addColorStop(0, isProduct ? 'rgba(229, 164, 91, .98)' : 'rgba(139, 218, 198, .96)');
    halo.addColorStop(0.3, isProduct ? 'rgba(229, 164, 91, .34)' : 'rgba(139, 218, 198, .28)');
    halo.addColorStop(1, 'rgba(0, 0, 0, 0)');
    context.fillStyle = halo;
    context.beginPath(); context.arc(point.x, point.y, radius * 3.8, 0, Math.PI * 2); context.fill();
    context.fillStyle = isProduct ? '#e4a45e' : '#99d7c7';
    context.beginPath(); context.arc(point.x, point.y, radius, 0, Math.PI * 2); context.fill();
  });
  context.restore();
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
