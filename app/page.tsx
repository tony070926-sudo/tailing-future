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
import { MolecularLab } from './components/molecular-lab';

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
type ViewCamera = { yaw: number; pitch: number; zoom: number };
type CameraGesture = {
  pointerId: number;
  startX: number;
  startY: number;
  startCamera: ViewCamera;
  moved: boolean;
};
type Vector3 = { x: number; y: number; z: number };
type ProjectedPoint = { x: number; y: number; depth: number; scale: number };
type ProjectionFrame = {
  camera: Vector3;
  right: Vector3;
  up: Vector3;
  forward: Vector3;
  focal: number;
  centerX: number;
  centerY: number;
};

const BUILD_COMMIT = process.env.NEXT_PUBLIC_TAILING_COMMIT_SHA ?? 'local-build';
const INITIAL_VIEW_CAMERA: ViewCamera = { yaw: -35 * Math.PI / 180, pitch: 52 * Math.PI / 180, zoom: 1 };
const MIN_CAMERA_PITCH = 20 * Math.PI / 180;
const MAX_CAMERA_PITCH = 75 * Math.PI / 180;
const MIN_CAMERA_ZOOM = 0.72;
const MAX_CAMERA_ZOOM = 1.55;

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
  { key: 'velocity', category: 'DERIVED', label: '速度矢量', detail: 'vx / vy 投影到二维 x/y 状态平面 · 无 vz · 长度封顶 0.65σ' },
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

const INSPECTOR_TABS: ReadonlyArray<readonly [InspectorTab, string]> = [
  ['state', '状态'],
  ['layers', '叠层'],
  ['reference', '概念参考'],
];

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
  { id: 'L1', scale: '原子 / 分子', state: '真实 x/y/z 分子与离子坐标 · 部分/形式电荷', anchor: 'OpenMM TIP3P / NBS NaCl；LJ/Verlet 保留为数值基线', ai: 'MatterSim / MACE 10-frame smoke 已完成；693×2 未复现', status: '原型' },
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
    <main className={`app-shell ${activeView === 'lab' ? 'material-light-shell' : ''}`}>
      <Header activeView={activeView} onViewChange={setActiveView} />
      <MolecularLab active={activeView === 'lab'} />
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
      <div className="topbar-actions"><span className="pulse-dot" /><span className="evidence-state">R2 · CONDITIONAL · 10-frame smoke / 693×2 未复现</span></div>
    </header>
  );
}

export function LegacyThermochemicalLab({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cameraGestureRef = useRef<CameraGesture | null>(null);
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
  const [probeAnnouncement, setProbeAnnouncement] = useState('');
  const [camera, setCamera] = useState<ViewCamera>(INITIAL_VIEW_CAMERA);
  const cameraRef = useRef(camera);
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
    setProbeAnnouncement('状态探针已清除');
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

  const updateCamera = useCallback((next: ViewCamera) => {
    cameraRef.current = next;
    setCamera(next);
  }, []);

  const probeStateAtClientPoint = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const bounds = canvas.getBoundingClientRect();
    const frame = createProjectionFrame(bounds.width, bounds.height, snapshot, cameraRef.current);
    const worldPoint = unprojectToStatePlane(clientX - bounds.left, clientY - bounds.top, frame);
    if (!worldPoint) {
      setProbe(null);
      setProbeAnnouncement('状态探针已清除：当前射线未与二维状态平面相交。');
      return;
    }
    const x = worldPoint.x + snapshot.box.width / 2;
    const y = worldPoint.z + snapshot.box.height / 2;
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x >= snapshot.box.width || y >= snapshot.box.height) {
      setProbe(null);
      setProbeAnnouncement('状态探针已清除');
      return;
    }
    const cellX = Math.min(snapshot.field.width - 1, Math.floor(x / snapshot.box.width * snapshot.field.width));
    const cellY = Math.min(snapshot.field.height - 1, Math.floor(y / snapshot.box.height * snapshot.field.height));
    const nextProbe = buildProbe(snapshot, cellX, cellY, nearestParticleIndex(snapshot, x, y, 0.7));
    setProbe(nextProbe);
    setProbeAnnouncement(describeProbe(nextProbe));
  };

  const beginCameraGesture = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0 || cameraGestureRef.current) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    cameraGestureRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startCamera: cameraRef.current,
      moved: false,
    };
  };

  const moveCameraGesture = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const gesture = cameraGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - gesture.startX;
    const deltaY = event.clientY - gesture.startY;
    if (!gesture.moved && Math.hypot(deltaX, deltaY) < 6) return;
    gesture.moved = true;
    updateCamera({
      yaw: gesture.startCamera.yaw + deltaX * 0.008,
      pitch: clamp(gesture.startCamera.pitch - deltaY * 0.006, MIN_CAMERA_PITCH, MAX_CAMERA_PITCH),
      zoom: gesture.startCamera.zoom,
    });
  };

  const endCameraGesture = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const gesture = cameraGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    cameraGestureRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (gesture.moved) {
      const current = cameraRef.current;
      setProbeAnnouncement('三维视角已旋转；底层二维状态未改变。方位 ' + Math.round(current.yaw * 180 / Math.PI) + ' 度，俯角 ' + Math.round(current.pitch * 180 / Math.PI) + ' 度。');
      return;
    }
    probeStateAtClientPoint(event.clientX, event.clientY);
  };

  const cancelCameraGesture = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (cameraGestureRef.current?.pointerId !== event.pointerId) return;
    cameraGestureRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const resetCamera = useCallback(() => {
    updateCamera({ ...INITIAL_VIEW_CAMERA });
    setProbeAnnouncement('三维视角已复位；底层二维状态未改变。');
  }, [updateCamera]);

  const probeWithKeyboard = (event: ReactKeyboardEvent<HTMLCanvasElement>) => {
    const cameraDirection = event.shiftKey ? {
      ArrowLeft: [-0.12, 0],
      ArrowRight: [0.12, 0],
      ArrowUp: [0, 0.09],
      ArrowDown: [0, -0.09],
    }[event.key] : undefined;
    if (cameraDirection) {
      event.preventDefault();
      const next = {
        ...cameraRef.current,
        yaw: cameraRef.current.yaw + cameraDirection[0],
        pitch: clamp(cameraRef.current.pitch + cameraDirection[1], MIN_CAMERA_PITCH, MAX_CAMERA_PITCH),
      };
      updateCamera(next);
      setProbeAnnouncement('三维视角已调整；底层二维状态未改变。');
      return;
    }
    if (event.key === '0') {
      event.preventDefault();
      resetCamera();
      return;
    }
    if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      updateCamera({ ...cameraRef.current, zoom: clamp(cameraRef.current.zoom * 1.1, MIN_CAMERA_ZOOM, MAX_CAMERA_ZOOM) });
      setProbeAnnouncement('三维视角已放大；底层二维状态未改变。');
      return;
    }
    if (event.key === '-' || event.key === '_') {
      event.preventDefault();
      updateCamera({ ...cameraRef.current, zoom: clamp(cameraRef.current.zoom / 1.1, MIN_CAMERA_ZOOM, MAX_CAMERA_ZOOM) });
      setProbeAnnouncement('三维视角已缩小；底层二维状态未改变。');
      return;
    }
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
      const nextProbe = buildProbe(snapshot, cellX, cellY, nearestParticleIndex(snapshot, x, y, 0.9));
      setProbe(nextProbe);
      setProbeAnnouncement(describeProbe(nextProbe));
      return;
    }
    if (event.key === 'Enter' && probe) {
      event.preventDefault();
      if (probe.particleIndex !== null) {
        const nextProbe = buildProbe(snapshot, probe.cellX, probe.cellY, null);
        setProbe(nextProbe);
        setProbeAnnouncement(describeProbe(nextProbe));
      } else {
        const x = (probe.cellX + 0.5) * snapshot.box.width / snapshot.field.width;
        const y = (probe.cellY + 0.5) * snapshot.box.height / snapshot.field.height;
        const nextProbe = buildProbe(snapshot, probe.cellX, probe.cellY, nearestParticleIndex(snapshot, x, y));
        setProbe(nextProbe);
        setProbeAnnouncement(describeProbe(nextProbe));
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
    setVisualLayers((current) => {
      const next = { ...current, [key]: !current[key] };
      if (key === 'particles' && !next.particles) {
        next.species = false;
        next.periodicImages = false;
        next.proximity = false;
      }
      if ((key === 'species' || key === 'periodicImages' || key === 'proximity') && next[key]) next.particles = true;
      return next;
    });
  };

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
    window.requestAnimationFrame(() => document.getElementById('inspector-tab-' + nextTab)?.focus());
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
    drawMicroscopicSimulation(context, snapshot, canvas.clientWidth, canvas.clientHeight, visualLayers, probe?.particleIndex ?? null, camera);
  }, [active, camera, probe?.particleIndex, snapshot, visualLayers]);

  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    const viewport = canvas?.parentElement;
    if (!canvas || !viewport) return;
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const nextZoom = clamp(cameraRef.current.zoom * Math.exp(-event.deltaY * 0.0012), MIN_CAMERA_ZOOM, MAX_CAMERA_ZOOM);
      updateCamera({ ...cameraRef.current, zoom: nextZoom });
    };
    viewport.addEventListener('wheel', handleWheel, { capture: true, passive: false });
    return () => viewport.removeEventListener('wheel', handleWheel, true);
  }, [active, updateCamera]);

  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    const redrawCommittedState = () => {
      sizeSimulationCanvas(canvas, context);
      drawMicroscopicSimulation(context, committedSnapshotRef.current, canvas.clientWidth, canvas.clientHeight, visualLayers, probe?.particleIndex ?? null, cameraRef.current);
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
          <small>tf.observation/0.3 · 3D visual projection of a 2D reduced-unit demonstration</small>
        </div>
        <div className="context-badges" aria-label="模型适用边界">
          <span className={snapshot.validityDomain.status === 'in_domain' ? 'live' : 'danger'}>{validityLabel}</span>
          <span className="derived">3D VIEW · 2D STATE</span>
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
              <button type="button" className="view-reset-button" onClick={resetCamera} aria-label="复位三维观察视角">↺ 复位视角</button>
            </div>
          </div>

          <div className="micro-viewport">
            <canvas
              ref={canvasRef}
              className="particle-canvas"
              onPointerDown={beginCameraGesture}
              onPointerMove={moveCameraGesture}
              onPointerUp={endCameraGesture}
              onPointerCancel={cancelCameraGesture}
              onKeyDown={probeWithKeyboard}
              tabIndex={0}
              aria-label="二维 LJ 粒子与独立二维热场的可旋转三维视图。拖动旋转，滚轮缩放，点击或方向键读取二维状态探针，Shift 加方向键调整视角，加减键缩放，数字零复位视角。"
              aria-describedby="micro-boundary"
            />
            <p className="visually-hidden" aria-live="polite" aria-atomic="true">{probeAnnouncement}</p>
            <div className="viewport-label top-left"><span>3D VIEW OF 2D SOLVER</span><b>{snapshot.particles.length} LJ sites · {snapshot.field.width} × {snapshot.field.height} thermal cells</b></div>
            <div className="viewport-label top-right"><span>SYMMETRIC OPERATOR SPLIT</span><b>Δt {initialWorld.options.timeStep.toFixed(3)}τ · ≈ {timeStepFs.toFixed(2)} fs Argon mapping</b></div>
            <div className="state-stamp"><span>STATE</span>{snapshot.stateId}<small>{snapshot.stateDigest}</small></div>
            {visualLayers.heatField && <div className="heat-legend" aria-label="热场颜色图例"><span>{WORLD_DOMAIN.minimumResolvedTemperatureKelvin} K</span><i /><span>{WORLD_DOMAIN.maximumResolvedTemperatureKelvin} K</span></div>}
            {visualLayers.particles && visualLayers.species && (
              <div className="species-legend" aria-label="A 与 B 内部标签颜色图例">
                <span><i className="species-a" />A internal</span>
                <span><i className="species-b" />B internal</span>
              </div>
            )}
            {probe && (
              <div className="state-probe">
                <span>STATE PROBE · CELL {probe.cellX},{probe.cellY}</span>
                <b>{probe.temperatureKelvin.toFixed(2)} K</b>
                <small>{probe.particleIndex === null ? '该单元附近无已选粒子' : 'particle ' + probe.particleIndex + ' · internal label ' + probe.particleSpecies}</small>
                <small>{probe.stateDigest.slice(0, 30)}…</small>
              </div>
            )}
            <div className="canvas-help">DRAG rotate · WHEEL zoom · CLICK probe · SHIFT + ARROWS camera · 0 reset</div>
            <div className="axis-glyph" aria-hidden="true"><em>x / y state plane</em><strong>z = display depth only</strong></div>
            <div className="viewport-boundary" id="micro-boundary"><span>3D VIEW · 2D SOLVER</span>透视、球体与显示 z 不增加物理解自由度 · A/B ≠ 真实物种 · LJ 邻域 ≠ 化学键 · 不用于材料、工艺或安全决策</div>
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
            {INSPECTOR_TABS.map(([id, label], index) => (
              <button
                type="button"
                role="tab"
                id={'inspector-tab-' + id}
                aria-controls={inspectorTab === id ? 'inspector-panel-' + id : undefined}
                aria-selected={inspectorTab === id}
                tabIndex={inspectorTab === id ? 0 : -1}
                className={inspectorTab === id ? 'active' : ''}
                onClick={() => setInspectorTab(id)}
                onKeyDown={(event) => moveInspectorTab(event, index)}
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

function describeProbe(probe: StateProbe) {
  const particle = probe.particleIndex === null
    ? '附近没有选中粒子'
    : '粒子 ' + probe.particleIndex + '，内部标签 ' + probe.particleSpecies;
  return '单元 ' + probe.cellX + ',' + probe.cellY + '，温度 ' + probe.temperatureKelvin.toFixed(2) + ' K，' + particle;
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
  camera: ViewCamera,
) {
  context.clearRect(0, 0, width, height);
  context.fillStyle = '#070b0e';
  context.fillRect(0, 0, width, height);

  const ambient = context.createRadialGradient(width * 0.52, height * 0.52, 0, width * 0.52, height * 0.52, width * 0.74);
  ambient.addColorStop(0, 'rgba(54, 101, 92, 0.17)');
  ambient.addColorStop(0.58, 'rgba(13, 24, 25, 0.05)');
  ambient.addColorStop(1, 'rgba(7, 11, 14, 0)');
  context.fillStyle = ambient;
  context.fillRect(0, 0, width, height);

  drawPerspectiveBackdrop(context, width, height);
  const frame = createProjectionFrame(width, height, snapshot, camera);
  const statePoint = (x: number, y: number, displayZ = 0) => projectWorldPoint(
    {
      x: x - snapshot.box.width / 2,
      y: displayZ,
      z: y - snapshot.box.height / 2,
    },
    frame,
  );
  const temperatureRange = WORLD_DOMAIN.maximumResolvedTemperatureKelvin - WORLD_DOMAIN.minimumResolvedTemperatureKelvin;
  const topCorners = [
    statePoint(0, 0),
    statePoint(snapshot.box.width, 0),
    statePoint(snapshot.box.width, snapshot.box.height),
    statePoint(0, snapshot.box.height),
  ];
  const bottomCorners = [
    statePoint(0, 0, -0.28),
    statePoint(snapshot.box.width, 0, -0.28),
    statePoint(snapshot.box.width, snapshot.box.height, -0.28),
    statePoint(0, snapshot.box.height, -0.28),
  ];

  context.fillStyle = 'rgba(4, 8, 10, 0.68)';
  drawProjectedPolygon(context, bottomCorners, true, false);
  const slabFaces = topCorners.map((point, index) => [
    point,
    topCorners[(index + 1) % topCorners.length],
    bottomCorners[(index + 1) % bottomCorners.length],
    bottomCorners[index],
  ]).sort((a, b) => averageDepth(b) - averageDepth(a));
  slabFaces.forEach((face, index) => {
    context.fillStyle = index % 2 === 0 ? 'rgba(28, 48, 49, 0.72)' : 'rgba(16, 31, 34, 0.78)';
    context.strokeStyle = 'rgba(152, 190, 179, 0.16)';
    context.lineWidth = 1;
    drawProjectedPolygon(context, face, true, true);
  });

  const cellWidth = snapshot.box.width / snapshot.field.width;
  const cellHeight = snapshot.box.height / snapshot.field.height;
  const heatCells = snapshot.field.valuesKelvin.map((temperature, index) => {
    const cellX = index % snapshot.field.width;
    const cellY = Math.floor(index / snapshot.field.width);
    const x0 = cellX * cellWidth;
    const y0 = cellY * cellHeight;
    const points = [
      statePoint(x0, y0),
      statePoint(x0 + cellWidth, y0),
      statePoint(x0 + cellWidth, y0 + cellHeight),
      statePoint(x0, y0 + cellHeight),
    ];
    return { cellX, cellY, points, temperature, depth: averageDepth(points) };
  }).sort((a, b) => b.depth - a.depth || a.cellY - b.cellY || a.cellX - b.cellX);

  heatCells.forEach((cell) => {
    const normalized = clamp(
      (cell.temperature - WORLD_DOMAIN.minimumResolvedTemperatureKelvin) / temperatureRange,
      0,
      1,
    );
    context.fillStyle = layers.heatField ? heatColor(normalized) : 'rgba(16, 25, 29, 0.84)';
    context.strokeStyle = layers.thermalMesh ? 'rgba(196, 222, 213, 0.18)' : 'rgba(0, 0, 0, 0)';
    context.lineWidth = 1;
    drawProjectedPolygon(context, cell.points, true, layers.thermalMesh);
  });

  if (layers.proximity && selectedParticleIndex !== null && snapshot.particles[selectedParticleIndex]) {
    const selected = snapshot.particles[selectedParticleIndex];
    context.strokeStyle = 'rgba(119, 175, 255, 0.42)';
    context.lineWidth = 1;
    context.setLineDash([4, 5]);
    drawStatePlaneCircle(context, statePoint, selected.x, selected.y, 1.45);
    const ringXShifts = [0];
    const ringYShifts = [0];
    if (selected.x < 1.45) ringXShifts.push(snapshot.box.width);
    if (selected.x > snapshot.box.width - 1.45) ringXShifts.push(-snapshot.box.width);
    if (selected.y < 1.45) ringYShifts.push(snapshot.box.height);
    if (selected.y > snapshot.box.height - 1.45) ringYShifts.push(-snapshot.box.height);
    ringXShifts.forEach((shiftX) => ringYShifts.forEach((shiftY) => {
      if (shiftX === 0 && shiftY === 0) return;
      drawStatePlaneCircle(context, statePoint, selected.x + shiftX, selected.y + shiftY, 1.45);
    }));
    context.setLineDash([]);
    snapshot.particles.forEach((particle, index) => {
      if (index === selectedParticleIndex) return;
      const dx = minimumImage(particle.x - selected.x, snapshot.box.width);
      const dy = minimumImage(particle.y - selected.y, snapshot.box.height);
      if (Math.hypot(dx, dy) >= 1.45) return;
      context.strokeStyle = 'rgba(119, 175, 255, 0.55)';
      context.beginPath();
      const endpointX = selected.x + dx;
      const endpointY = selected.y + dy;
      const selectedPoint = statePoint(selected.x, selected.y, 0.015);
      const endpoint = statePoint(endpointX, endpointY, 0.015);
      context.moveTo(selectedPoint.x, selectedPoint.y);
      context.lineTo(endpoint.x, endpoint.y);
      context.stroke();
      const wrapX = endpointX < 0 ? snapshot.box.width : endpointX >= snapshot.box.width ? -snapshot.box.width : 0;
      const wrapY = endpointY < 0 ? snapshot.box.height : endpointY >= snapshot.box.height ? -snapshot.box.height : 0;
      if (wrapX !== 0 || wrapY !== 0) {
        const wrappedStart = statePoint(selected.x + wrapX, selected.y + wrapY, 0.015);
        const wrappedEnd = statePoint(endpointX + wrapX, endpointY + wrapY, 0.015);
        context.beginPath();
        context.moveTo(wrappedStart.x, wrappedStart.y);
        context.lineTo(wrappedEnd.x, wrappedEnd.y);
        context.stroke();
      }
    });
  }

  if (layers.velocity) {
    snapshot.particles.forEach((particle) => {
      const rawX = particle.vx * 0.32;
      const rawY = particle.vy * 0.32;
      const rawLength = Math.hypot(rawX, rawY);
      const vectorScale = rawLength > 0 ? Math.min(1, 0.65 / rawLength) : 0;
      const origin = statePoint(particle.x, particle.y, 0.025);
      const end = statePoint(particle.x + rawX * vectorScale, particle.y + rawY * vectorScale, 0.025);
      drawProjectedArrow(context, origin, end, 'rgba(119, 175, 255, 0.72)');
    });
  }

  const renderParticles: Array<{
    index: number;
    species: 'A' | 'B';
    position: ProjectedPoint;
    opacity: number;
    periodic: boolean;
  }> = [];
  if (layers.particles) snapshot.particles.forEach((particle, index) => {
    renderParticles.push({
      index,
      species: particle.species,
      position: statePoint(particle.x, particle.y, 0.04),
      opacity: 1,
      periodic: false,
    });
  });
  if (layers.periodicImages && layers.particles) {
    const edgeDistance = 0.8;
    snapshot.particles.forEach((particle, index) => {
      const xShifts = [0];
      const yShifts = [0];
      if (particle.x < edgeDistance) xShifts.push(snapshot.box.width);
      if (particle.x > snapshot.box.width - edgeDistance) xShifts.push(-snapshot.box.width);
      if (particle.y < edgeDistance) yShifts.push(snapshot.box.height);
      if (particle.y > snapshot.box.height - edgeDistance) yShifts.push(-snapshot.box.height);
      xShifts.forEach((shiftX) => yShifts.forEach((shiftY) => {
        if (shiftX === 0 && shiftY === 0) return;
        renderParticles.push({
          index,
          species: particle.species,
          position: statePoint(particle.x + shiftX, particle.y + shiftY, 0.04),
          opacity: 0.3,
          periodic: true,
        });
      }));
    });
  }

  renderParticles
    .sort((a, b) => b.position.depth - a.position.depth || Number(a.periodic) - Number(b.periodic) || a.index - b.index)
    .forEach((particle) => drawParticleGlyph(
      context,
      particle.position,
      layers.species ? particle.species : null,
      !particle.periodic && particle.index === selectedParticleIndex,
      particle.opacity,
    ));

  context.strokeStyle = 'rgba(174, 205, 195, 0.34)';
  context.lineWidth = 1;
  drawProjectedPolygon(context, topCorners, false, true);
  drawWorldAxes(context, statePoint, snapshot);
}

function drawParticleGlyph(
  context: CanvasRenderingContext2D,
  point: ProjectedPoint,
  species: 'A' | 'B' | null,
  selected: boolean,
  opacity: number,
) {
  const color = species === 'B' ? [242, 183, 107] : species === 'A' ? [109, 222, 198] : [199, 215, 210];
  const radius = clamp(point.scale * 0.22, 3.8, 10.5);
  context.fillStyle = `rgba(0, 0, 0, ${0.34 * opacity})`;
  context.beginPath();
  context.ellipse(point.x + radius * 0.42, point.y + radius * 0.62, radius * 0.92, radius * 0.4, 0, 0, Math.PI * 2);
  context.fill();
  const halo = context.createRadialGradient(point.x, point.y, 0, point.x, point.y, radius * 2.4);
  halo.addColorStop(0, `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${0.34 * opacity})`);
  halo.addColorStop(1, `rgba(${color[0]}, ${color[1]}, ${color[2]}, 0)`);
  context.fillStyle = halo;
  context.beginPath();
  context.arc(point.x, point.y, radius * 2.4, 0, Math.PI * 2);
  context.fill();
  const sphere = context.createRadialGradient(
    point.x - radius * 0.38,
    point.y - radius * 0.42,
    radius * 0.08,
    point.x,
    point.y,
    radius,
  );
  sphere.addColorStop(0, `rgba(244, 255, 251, ${0.98 * opacity})`);
  sphere.addColorStop(0.24, `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${0.98 * opacity})`);
  sphere.addColorStop(0.72, `rgba(${Math.round(color[0] * 0.55)}, ${Math.round(color[1] * 0.55)}, ${Math.round(color[2] * 0.55)}, ${0.96 * opacity})`);
  sphere.addColorStop(1, `rgba(3, 8, 10, ${0.98 * opacity})`);
  context.fillStyle = sphere;
  context.beginPath();
  context.arc(point.x, point.y, radius, 0, Math.PI * 2);
  context.fill();
  if (selected) {
    context.strokeStyle = 'rgba(237, 245, 242, 0.9)';
    context.lineWidth = 1.25;
    context.beginPath();
    context.arc(point.x, point.y, radius + 4.2, 0, Math.PI * 2);
    context.stroke();
  }
}

function heatColor(value: number) {
  const cold = [25, 83, 96];
  const hot = [208, 118, 61];
  const channel = (index: number) => Math.round(cold[index] + (hot[index] - cold[index]) * value);
  return `rgba(${channel(0)}, ${channel(1)}, ${channel(2)}, ${0.48 + value * 0.34})`;
}

function minimumImage(delta: number, extent: number) { return delta - extent * Math.round(delta / extent); }

function createProjectionFrame(
  width: number,
  height: number,
  snapshot: ThermochemicalSnapshot,
  cameraState: ViewCamera,
): ProjectionFrame {
  const maximumExtent = Math.max(snapshot.box.width, snapshot.box.height);
  const distance = maximumExtent * 2.35;
  const camera = {
    x: Math.sin(cameraState.yaw) * Math.cos(cameraState.pitch) * distance,
    y: Math.sin(cameraState.pitch) * distance,
    z: Math.cos(cameraState.yaw) * Math.cos(cameraState.pitch) * distance,
  };
  const forward = normalizeVector({ x: -camera.x, y: -camera.y, z: -camera.z });
  const right = normalizeVector(crossVector(forward, { x: 0, y: 1, z: 0 }));
  const up = normalizeVector(crossVector(right, forward));
  const rawFrame: ProjectionFrame = { camera, forward, right, up, focal: 1, centerX: 0, centerY: 0 };
  const rawCorners = [
    { x: -snapshot.box.width / 2, y: 0, z: -snapshot.box.height / 2 },
    { x: snapshot.box.width / 2, y: 0, z: -snapshot.box.height / 2 },
    { x: snapshot.box.width / 2, y: 0, z: snapshot.box.height / 2 },
    { x: -snapshot.box.width / 2, y: 0, z: snapshot.box.height / 2 },
  ].map((point) => projectWorldPoint(point, rawFrame));
  const minimumX = Math.min(...rawCorners.map((point) => point.x));
  const maximumX = Math.max(...rawCorners.map((point) => point.x));
  const minimumY = Math.min(...rawCorners.map((point) => point.y));
  const maximumY = Math.max(...rawCorners.map((point) => point.y));
  const availableWidth = Math.max(120, width - Math.min(84, width * 0.14));
  const availableHeight = Math.max(150, height - Math.min(132, height * 0.28));
  const fitFocal = Math.min(
    availableWidth / Math.max(maximumX - minimumX, 1e-9),
    availableHeight / Math.max(maximumY - minimumY, 1e-9),
  );
  const focal = fitFocal * cameraState.zoom;
  return {
    ...rawFrame,
    focal,
    centerX: width / 2 - (minimumX + maximumX) / 2 * focal,
    centerY: height * (width < 600 ? 0.58 : 0.54) - (minimumY + maximumY) / 2 * focal,
  };
}

function projectWorldPoint(point: Vector3, frame: ProjectionFrame): ProjectedPoint {
  const relative = {
    x: point.x - frame.camera.x,
    y: point.y - frame.camera.y,
    z: point.z - frame.camera.z,
  };
  const depth = Math.max(1e-6, dotVector(relative, frame.forward));
  const scale = frame.focal / depth;
  return {
    x: frame.centerX + dotVector(relative, frame.right) * scale,
    y: frame.centerY - dotVector(relative, frame.up) * scale,
    depth,
    scale,
  };
}

function unprojectToStatePlane(screenX: number, screenY: number, frame: ProjectionFrame): Vector3 | null {
  const viewX = (screenX - frame.centerX) / frame.focal;
  const viewY = -(screenY - frame.centerY) / frame.focal;
  const direction = normalizeVector({
    x: frame.forward.x + frame.right.x * viewX + frame.up.x * viewY,
    y: frame.forward.y + frame.right.y * viewX + frame.up.y * viewY,
    z: frame.forward.z + frame.right.z * viewX + frame.up.z * viewY,
  });
  if (Math.abs(direction.y) < 1e-8) return null;
  const distance = -frame.camera.y / direction.y;
  if (distance <= 0) return null;
  return {
    x: frame.camera.x + direction.x * distance,
    y: 0,
    z: frame.camera.z + direction.z * distance,
  };
}

function drawPerspectiveBackdrop(context: CanvasRenderingContext2D, width: number, height: number) {
  context.save();
  context.strokeStyle = 'rgba(109, 222, 198, 0.035)';
  context.lineWidth = 1;
  const spacing = Math.max(34, Math.min(58, width / 15));
  for (let x = width % spacing; x < width; x += spacing) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
  }
  for (let y = height % spacing; y < height; y += spacing) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }
  context.restore();
}

function drawProjectedPolygon(
  context: CanvasRenderingContext2D,
  points: ReadonlyArray<ProjectedPoint>,
  fill: boolean,
  stroke: boolean,
) {
  if (points.length === 0) return;
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  points.slice(1).forEach((point) => context.lineTo(point.x, point.y));
  context.closePath();
  if (fill) context.fill();
  if (stroke) context.stroke();
}

function drawStatePlaneCircle(
  context: CanvasRenderingContext2D,
  statePoint: (x: number, y: number, displayZ?: number) => ProjectedPoint,
  centerX: number,
  centerY: number,
  radius: number,
) {
  context.beginPath();
  const segments = 48;
  for (let index = 0; index <= segments; index += 1) {
    const angle = index / segments * Math.PI * 2;
    const point = statePoint(centerX + Math.cos(angle) * radius, centerY + Math.sin(angle) * radius, 0.018);
    if (index === 0) context.moveTo(point.x, point.y);
    else context.lineTo(point.x, point.y);
  }
  context.stroke();
}

function drawProjectedArrow(
  context: CanvasRenderingContext2D,
  origin: ProjectedPoint,
  end: ProjectedPoint,
  color: string,
) {
  context.strokeStyle = color;
  context.fillStyle = color;
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(origin.x, origin.y);
  context.lineTo(end.x, end.y);
  context.stroke();
  const angle = Math.atan2(end.y - origin.y, end.x - origin.x);
  context.beginPath();
  context.moveTo(end.x, end.y);
  context.lineTo(end.x - Math.cos(angle - 0.55) * 4, end.y - Math.sin(angle - 0.55) * 4);
  context.lineTo(end.x - Math.cos(angle + 0.55) * 4, end.y - Math.sin(angle + 0.55) * 4);
  context.closePath();
  context.fill();
}

function drawWorldAxes(
  context: CanvasRenderingContext2D,
  statePoint: (x: number, y: number, displayZ?: number) => ProjectedPoint,
  snapshot: ThermochemicalSnapshot,
) {
  const axisLength = Math.min(snapshot.box.width, snapshot.box.height) * 0.12;
  const originX = snapshot.box.width * 0.08;
  const originY = snapshot.box.height * 0.08;
  const origin = statePoint(originX, originY, 0.04);
  const xEnd = statePoint(originX + axisLength, originY, 0.04);
  const yEnd = statePoint(originX, originY + axisLength, 0.04);
  const displayZEnd = statePoint(originX, originY, axisLength * 0.72);
  drawProjectedArrow(context, origin, xEnd, 'rgba(242, 183, 107, 0.9)');
  drawProjectedArrow(context, origin, yEnd, 'rgba(109, 222, 198, 0.9)');
  drawProjectedArrow(context, origin, displayZEnd, 'rgba(119, 175, 255, 0.9)');
  context.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace';
  context.fillStyle = 'rgba(242, 183, 107, 0.96)';
  context.fillText('x', xEnd.x + 5, xEnd.y);
  context.fillStyle = 'rgba(109, 222, 198, 0.96)';
  context.fillText('y', yEnd.x + 5, yEnd.y);
  context.fillStyle = 'rgba(119, 175, 255, 0.96)';
  context.fillText('z display', displayZEnd.x + 5, displayZEnd.y);
}

function averageDepth(points: ReadonlyArray<ProjectedPoint>) {
  return points.reduce((sum, point) => sum + point.depth, 0) / Math.max(1, points.length);
}

function dotVector(left: Vector3, right: Vector3) {
  return left.x * right.x + left.y * right.y + left.z * right.z;
}

function crossVector(left: Vector3, right: Vector3): Vector3 {
  return {
    x: left.y * right.z - left.z * right.y,
    y: left.z * right.x - left.x * right.z,
    z: left.x * right.y - left.y * right.x,
  };
}

function normalizeVector(vector: Vector3): Vector3 {
  const length = Math.hypot(vector.x, vector.y, vector.z);
  if (length === 0) return { x: 0, y: 0, z: 0 };
  return { x: vector.x / length, y: vector.y / length, z: vector.z / length };
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function subscribeReducedMotion(callback: () => void) {
  const query = window.matchMedia('(prefers-reduced-motion: reduce)');
  query.addEventListener('change', callback);
  return () => query.removeEventListener('change', callback);
}

function getReducedMotion() { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
function getServerReducedMotion() { return false; }
