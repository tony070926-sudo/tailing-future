'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  ARGON_UNITS,
  LennardJonesSimulation,
  type SimulationSnapshot,
} from '@/lib/simulation/lennard-jones';

type View = 'lab' | 'architecture' | 'sentinel';

const SCALE_STEPS = [
  { label: '电子', detail: '量子态', status: 'planned' },
  { label: '原子', detail: '分子动力学', status: 'active' },
  { label: '介观', detail: '微结构演化', status: 'planned' },
  { label: '连续体', detail: '多物理场', status: 'planned' },
  { label: '工艺', detail: '流程优化', status: 'planned' },
] as const;

const ARCHITECTURE_LAYERS = [
  { id: 'L0', scale: '电子 / 量子', state: '电子密度 · 能带 · 势垒', anchor: 'DFT / Quantum ESPRESSO', ai: 'Hamiltonian / density surrogate', status: '规划' },
  { id: 'L1', scale: '原子 / 分子', state: '元素 · 坐标 · 速度 · 晶胞', anchor: 'MD / LAMMPS / ASE', ai: 'UMA · MACE · MatterSim', status: '原型' },
  { id: 'L2', scale: '介观 / 微结构', state: '相场 · 晶粒 · 缺陷 · 孔隙', anchor: 'MOOSE / CALPHAD / kMC', ai: 'neural operator / closure', status: '规划' },
  { id: 'L3', scale: '连续体 / 部件', state: '温度 · 浓度 · 流场 · 应力', anchor: 'OpenFOAM / FEniCSx', ai: 'FNO / MeshGraphNet', status: '规划' },
  { id: 'L4', scale: '反应器 / 设备', state: '动力学 · 传递 · RTD · 结垢', anchor: 'Cantera / CFD / PBM', ai: 'hybrid ROM / state model', status: '规划' },
  { id: 'L5', scale: '流程 / 工厂', state: '物流 · 库存 · KPI · 约束', anchor: 'IDAES / Pyomo / DAE', ai: 'advisory policy / MPC', status: '规划' },
] as const;

const SCORECARD = [
  ['状态 / 动作 / 观测契约', 8, 1, 'schema + replay'],
  ['数据与来源追踪', 8, 0, '尚无训练数据'],
  ['原子层物理', 12, 1, 'LJ toy solver'],
  ['介观层', 8, 0, '未接入'],
  ['连续场', 10, 0, '未接入'],
  ['反应器与流程', 10, 0, '未接入'],
  ['跨尺度耦合', 14, 0, '仅接口设计'],
  ['多轮世界行为', 8, 1, '确定性回放'],
  ['UQ / OOD', 8, 0, '尚无拒答校准'],
  ['可复现性与成本', 6, 1, '固定种子 + CI'],
  ['可视化真实性', 4, 1, '状态绑定标签'],
  ['安全 / 许可 / 治理', 4, 1, 'advisory-only'],
] as const;

const COMPARATORS = [
  { name: 'AIDO Cell 1.0', role: '跨领域架构参照', evidence: '厂商报告', gap: '缺少共享多尺度状态与多模态 decoder' },
  { name: 'UMA / MatterSim / MACE', role: '原子基础模型', evidence: '论文 / 模型卡', gap: '尚未跑公共 held-out 原子基准' },
  { name: 'PhysicsNeMo / MOOSE', role: '连续体与介观', evidence: '官方文档', gap: '尚未接入 PDE / phase-field 求解器' },
  { name: 'IDAES / Aspen Hybrid', role: '流程与混合模型', evidence: '官方文档', gap: '尚无设备或流程状态' },
] as const;

export default function Home() {
  const [activeView, setActiveView] = useState<View>('lab');

  return (
    <main className="app-shell">
      <Header activeView={activeView} onViewChange={setActiveView} />
      {activeView === 'lab' && <SimulationLab />}
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
      <div className="topbar-actions"><span className="pulse-dot" /><span className="evidence-state">R0 · E1 解析演示</span></div>
    </header>
  );
}

function SimulationLab() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number | null>(null);
  const lastUiUpdateRef = useRef(0);
  const [initialSimulation] = useState(() => new LennardJonesSimulation());
  const simulationRef = useRef(initialSimulation);
  const [snapshot, setSnapshot] = useState<SimulationSnapshot>(() => initialSimulation.observe());
  const [running, setRunning] = useState(true);
  const [temperature, setTemperature] = useState(92);
  const [branchCount, setBranchCount] = useState(0);
  const [eventNote, setEventNote] = useState('初始状态已创建');
  const [error, setError] = useState<string | null>(null);
  const prefersReducedMotion = useSyncExternalStore(subscribeReducedMotion, getReducedMotion, getServerReducedMotion);
  const isAdvancing = running && !prefersReducedMotion;

  const resetSimulation = useCallback(() => {
    const next = new LennardJonesSimulation({ temperatureKelvin: temperature });
    simulationRef.current = next;
    setSnapshot(next.observe());
    setBranchCount(0);
    setError(null);
    setEventNote('已回到确定性初始状态');
  }, [temperature]);

  const cloneBranch = useCallback(() => {
    const branch = simulationRef.current!.clone();
    simulationRef.current = branch;
    setSnapshot(branch.observe());
    setBranchCount((count) => count + 1);
    setEventNote(`已从 step ${branch.stepCount} 克隆实验分支`);
  }, []);

  const changeTemperature = (kelvin: number) => {
    setTemperature(kelvin);
    simulationRef.current!.setTargetTemperatureKelvin(kelvin);
    setEventNote(`动作：热浴目标设为 ${kelvin} K`);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(bounds.width * ratio);
      canvas.height = Math.floor(bounds.height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };

    const render = (time: number) => {
      const simulation = simulationRef.current!;
      let current = simulation.observe();
      if (isAdvancing && !error) {
        try {
          current = simulation.advance(3);
        } catch (cause) {
          setRunning(false);
          setError(cause instanceof Error ? cause.message : '数值状态异常');
        }
      }
      drawSimulation(context, current, canvas.clientWidth, canvas.clientHeight);
      if (time - lastUiUpdateRef.current > 180) {
        lastUiUpdateRef.current = time;
        setSnapshot(current);
      }
      frameRef.current = requestAnimationFrame(render);
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    frameRef.current = requestAnimationFrame(render);
    return () => {
      observer.disconnect();
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [isAdvancing, error]);

  const { metrics } = snapshot;
  const timeStepFs = 0.002 * ARGON_UNITS.timePicoseconds * 1000;

  return (
    <div className="workspace">
      <aside className="scale-rail" aria-label="多尺度模型层级">
        <div className="rail-heading"><span>尺度栈</span><small>01 / 05</small></div>
        <ol>{SCALE_STEPS.map((step, index) => (
          <li key={step.label} className={step.status === 'active' ? 'active' : ''}>
            <span className="step-index">0{index + 1}</span>
            <span className="step-copy"><b>{step.label}</b><small>{step.detail}</small></span>
            <span className="step-state" aria-hidden="true" />
          </li>
        ))}</ol>
        <div className="model-note"><span>MODEL BASIS</span><p>Force-shifted Lennard–Jones</p><small>2D · reduced units · velocity Verlet</small></div>
      </aside>

      <section className="simulation-stage">
        <div className="stage-heading">
          <div><p className="eyebrow">MICROSCOPIC STATE / 微观状态</p><h1>从粒子运动，连接到工艺决策。</h1></div>
          <div className={`stage-status ${isAdvancing ? '' : 'paused'}`}><span />{error ? '数值保护已触发' : isAdvancing ? '真实数值步进中' : prefersReducedMotion ? '减弱动态模式' : '已暂停'}</div>
        </div>
        <div className="viewport-card">
          <canvas ref={canvasRef} className="particle-canvas" aria-label="二维 Lennard-Jones 粒子动力学可视化" />
          <div className="viewport-grid" aria-hidden="true" />
          <div className="viewport-label top-left"><span>ARGON-LIKE PROXY</span><b>2D triangular / {snapshot.particles.length} particles</b></div>
          <div className="viewport-label top-right"><span>VELOCITY VERLET</span><b>{timeStepFs.toFixed(2)} fs / step</b></div>
          <div className="state-stamp"><span>STATE</span>{snapshot.stateId}</div>
          <div className="axis-glyph" aria-hidden="true"><i className="axis-x" /><i className="axis-y" /><em>x</em><strong>y</strong></div>
          <div className="honesty-badge"><span>数值演示</span>二维 · 经典 · 无量纲；不用于工程决策</div>
        </div>
        <div className="transport-bar">
          <div className="transport-buttons">
            <button type="button" onClick={() => setRunning((value) => !value)} aria-label={isAdvancing ? '暂停仿真' : '继续仿真'}>{isAdvancing ? 'Ⅱ' : '▶'}</button>
            <button type="button" onClick={resetSimulation} aria-label="重置仿真">↺</button>
            <button type="button" className="branch-button" onClick={cloneBranch}>分支 +</button>
          </div>
          <div className="timeline"><div className="timeline-copy"><span>{eventNote}</span><b>{snapshot.step.toLocaleString()} steps · {snapshot.timePicoseconds.toFixed(2)} ps</b></div><div className="timeline-track"><i style={{ width: `${18 + (snapshot.step % 12000) / 148}%` }} /></div></div>
          <label className="temperature-control"><span>热浴目标</span><input type="range" min="45" max="180" value={temperature} onChange={(event) => changeTemperature(Number(event.target.value))} aria-label="热浴目标温度" /><b>{temperature} K</b></label>
        </div>
      </section>

      <aside className="telemetry-panel">
        <div className="telemetry-heading"><span>STATE VECTOR</span><small>{branchCount} branch</small></div>
        <div className="metric-primary"><span>势能 / 粒子</span><strong>{metrics.potentialEnergyPerParticle.toFixed(3)} <small>ε</small></strong><div className="sparkline" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /><i /><i /></div></div>
        <dl className="metric-grid">
          <div><dt>实际温度</dt><dd>{metrics.temperatureKelvin.toFixed(1)} K</dd></div>
          <div><dt>压力估计</dt><dd>{metrics.pressureReduced.toFixed(2)} P*</dd></div>
          <div><dt>配位数</dt><dd>{metrics.coordinationNumber.toFixed(2)}</dd></div>
          <div><dt>均方位移</dt><dd>{metrics.meanSquaredDisplacement.toFixed(3)} σ²</dd></div>
        </dl>
        <div className="coupling-card">
          <div className="card-title"><span>尺度桥接</span><small>1 / 4 prototype</small></div>
          <div className="bridge-row active"><i />原子 → 扩散 proxy<b>MSD 可观测</b></div>
          <div className="bridge-row"><i />介观 → 本构关系<b>待校准</b></div>
          <div className="bridge-row"><i />连续体 → 反应器<b>待连接</b></div>
        </div>
        <div className="confidence-card"><div className="confidence-top"><span>证据等级</span><b>E1 · 解析 toy case</b></div><p>力连续性、有限差分、动量、周期边界、确定性回放与 NVE 能量漂移已进入自动测试。尚无真实材料或工厂验证。</p></div>
      </aside>
    </div>
  );
}

function ArchitectureView() {
  return (
    <section className="content-view architecture-view">
      <div className="view-intro"><div><p className="eyebrow">TAILING CORE / SYSTEM MAP</p><h1>不是一个万能模型，而是一套可验证的尺度协议。</h1></div><p>显式物理状态由可信求解器锚定，AI 负责表征、闭合、代理与候选设计；任何尺度桥都必须携带单位、守恒残差、不确定性与来源。</p></div>
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
        <div><span>SHARED WORLD STATE</span><b>composition · structure · fields · equipment · uncertainty · provenance</b></div>
        <div><span>ACTION</span><b>perturb · step · branch · replay · abstain</b></div>
        <div><span>HARD GATES</span><b>mass · elements · momentum · energy · domain · safety</b></div>
      </div>
      <div className="roadmap-row"><span><b>R0</b> 可信核心</span><i /><span><b>R1</b> 独立模块</span><i /><span><b>R2</b> 尺度连接</span><i /><span><b>R3</b> 设备耦合</span><i /><span><b>R4+</b> 流程 / Foundry</span></div>
    </section>
  );
}

function SentinelView() {
  const weightedScore = SCORECARD.reduce((total, [, weight, score]) => total + Number(weight) * Number(score) / 4, 0);
  return (
    <section className="content-view sentinel-view">
      <div className="view-intro"><div><p className="eyebrow">TAILING SENTINEL / ITERATION 00</p><h1>每次构建都要留下证据，也要暴露差距。</h1></div><div className="score-orbit"><strong>{weightedScore.toFixed(1)}</strong><span>/ 100<br />证据成熟度</span></div></div>
      <div className="sentinel-grid">
        <article className="scorecard-panel panel-block">
          <div className="panel-heading"><span>锁定评分卡</span><small>0–4 evidence scale</small></div>
          <div className="score-table">{SCORECARD.map(([label, weight, score, note]) => (
            <div className="score-row" key={label}>
              <span className="score-label">{label}<small>{note}</small></span>
              <span className="score-weight">{weight}%</span>
              <span className="score-track"><i style={{ width: `${Number(score) * 25}%` }} /></span>
              <b>E{score}</b>
            </div>
          ))}</div>
          <p className="score-disclaimer">总分只表示工程与证据成熟度，不代表达到 SOTA。任何守恒、安全或许可硬门槛失败都会直接阻断版本晋级。</p>
        </article>
        <article className="loop-panel panel-block">
          <div className="panel-heading"><span>监督闭环</span><small>champion / challenger</small></div>
          <ol className="loop-steps">
            <li className="complete"><i>01</i><span><b>SOTA Scout</b><small>刷新官方模型卡与论文</small></span></li>
            <li className="complete"><i>02</i><span><b>Builder</b><small>生成候选与 run manifest</small></span></li>
            <li className="active"><i>03</i><span><b>Independent Evaluator</b><small>只读运行物理与回归门禁</small></span></li>
            <li><i>04</i><span><b>Gap Planner</b><small>最多输出 3 个验收任务</small></span></li>
            <li><i>05</i><span><b>Supervisor Gate</b><small>accept / reject / conditional</small></span></li>
          </ol>
          <div className="loop-rule">Builder 不能批准自己；LLM 解释证据，但不能替代数值测试。</div>
        </article>
      </div>
      <article className="comparators-panel panel-block">
        <div className="panel-heading"><span>外部比较器注册表</span><small>snapshot · 2026-08-28</small></div>
        <div className="comparator-head"><span>比较器</span><span>角色</span><span>证据</span><span>当前最大差距</span></div>
        {COMPARATORS.map((item) => <div className="comparator-row" key={item.name}><b>{item.name}</b><span>{item.role}</span><em>{item.evidence}</em><p>{item.gap}</p></div>)}
      </article>
      <div className="next-gaps"><span>NEXT ITERATION</span><b>P0 · 固化 world-state 与 scorecard schema</b><b>P0 · 接入两个开放原子模型公共基准</b><b>P1 · 建立多孔催化最窄端到端耦合</b></div>
    </section>
  );
}

function drawSimulation(context: CanvasRenderingContext2D, snapshot: SimulationSnapshot, width: number, height: number) {
  context.clearRect(0, 0, width, height);
  const gradient = context.createRadialGradient(width * 0.5, height * 0.48, 0, width * 0.5, height * 0.48, width * 0.65);
  gradient.addColorStop(0, 'rgba(57, 104, 93, 0.18)');
  gradient.addColorStop(0.6, 'rgba(14, 21, 22, 0.03)');
  gradient.addColorStop(1, 'rgba(8, 12, 13, 0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  const padding = Math.min(58, width * 0.08);
  const scale = Math.min((width - padding * 2) / snapshot.box.width, (height - padding * 2) / snapshot.box.height);
  const offsetX = (width - snapshot.box.width * scale) / 2;
  const offsetY = (height - snapshot.box.height * scale) / 2;
  const points = snapshot.particles.map((particle) => ({ x: offsetX + particle.x * scale, y: offsetY + particle.y * scale, speed: Math.hypot(particle.vx, particle.vy) }));

  context.lineWidth = 0.7;
  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      const dx = snapshot.particles[j].x - snapshot.particles[i].x;
      const dy = snapshot.particles[j].y - snapshot.particles[i].y;
      const distance = Math.hypot(dx, dy);
      if (distance < 1.42) {
        context.strokeStyle = `rgba(117, 180, 166, ${Math.max(0.025, 0.13 - distance * 0.055)})`;
        context.beginPath(); context.moveTo(points[i].x, points[i].y); context.lineTo(points[j].x, points[j].y); context.stroke();
      }
    }
  }

  points.forEach((point, index) => {
    const tracer = index % 17 === 0;
    const radius = 2.6 + Math.min(point.speed, 2) * 0.55;
    const halo = context.createRadialGradient(point.x, point.y, 0, point.x, point.y, radius * 3.8);
    halo.addColorStop(0, tracer ? 'rgba(225, 176, 96, .98)' : 'rgba(139, 218, 198, .96)');
    halo.addColorStop(0.3, tracer ? 'rgba(225, 176, 96, .34)' : 'rgba(139, 218, 198, .28)');
    halo.addColorStop(1, 'rgba(0, 0, 0, 0)');
    context.fillStyle = halo; context.beginPath(); context.arc(point.x, point.y, radius * 3.8, 0, Math.PI * 2); context.fill();
    context.fillStyle = tracer ? '#e3b267' : '#99d7c7'; context.beginPath(); context.arc(point.x, point.y, radius, 0, Math.PI * 2); context.fill();
  });
}

function subscribeReducedMotion(callback: () => void) {
  const query = window.matchMedia('(prefers-reduced-motion: reduce)');
  query.addEventListener('change', callback);
  return () => query.removeEventListener('change', callback);
}

function getReducedMotion() { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }

function getServerReducedMotion() { return false; }
