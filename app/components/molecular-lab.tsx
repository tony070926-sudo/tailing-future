'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
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
  type MolecularVisualLayers,
} from './molecular-canvas';
import { MOLECULAR_REFERENCE_CONTRACTS } from './molecular-visual-guides';

type InspectorTab = 'structure' | 'interactions' | 'evidence';
type WaterScanAxis = 'separation' | 'orientation';

const INITIAL_MOLECULAR_LAYERS: MolecularVisualLayers = {
  labels: true,
  bonds: true,
  unitCell: false,
  interactions: true,
  pairForces: false,
  netForce: true,
  valenceDirections: false,
  hybridizationGuide: false,
  bondAxisGuide: false,
  donorAcceptorAxisGuide: false,
};

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
  const [layers, setLayers] = useState<MolecularVisualLayers>(INITIAL_MOLECULAR_LAYERS);
  const [waterScanAxis, setWaterScanAxis] = useState<WaterScanAxis>('separation');
  const [scanSpeed, setScanSpeed] = useState(1);
  const [isScanPlaying, setIsScanPlaying] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [announcement, setAnnouncement] = useState('真实三维分子结构已载入。');
  const scanDirectionRef = useRef<1 | -1>(1);

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
  const hasElectronicReferenceLayer = scene.kind === 'water-dimer'
    && (layers.valenceDirections
      || layers.hybridizationGuide
      || layers.bondAxisGuide
      || layers.donorAcceptorAxisGuide);

  const advanceConfigurationScan = useCallback((direction: 1 | -1, automatic: boolean) => {
    const move = (current: number, minimum: number, maximum: number, step: number, digits: number) => {
      let next = current + direction * step;
      if (next >= maximum) {
        next = maximum;
        if (automatic) scanDirectionRef.current = -1;
      } else if (next <= minimum) {
        next = minimum;
        if (automatic) scanDirectionRef.current = 1;
      }
      return Number(next.toFixed(digits));
    };
    if (sceneKind === 'nacl-rocksalt') {
      setIonDisplacement((current) => move(current, -0.4, 0.4, 0.02, 2));
    } else if (waterScanAxis === 'orientation') {
      setDonorAngle((current) => move(current, -45, 45, 3, 0));
    } else {
      setOxygenSeparation((current) => move(current, 2.55, 4.8, 0.05, 2));
    }
  }, [sceneKind, waterScanAxis]);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updatePreference = () => {
      setReducedMotion(query.matches);
      if (query.matches) setIsScanPlaying(false);
    };
    updatePreference();
    query.addEventListener('change', updatePreference);
    return () => query.removeEventListener('change', updatePreference);
  }, []);

  useEffect(() => {
    if (active) return;
    const pause = window.setTimeout(() => setIsScanPlaying(false), 0);
    return () => window.clearTimeout(pause);
  }, [active]);

  useEffect(() => {
    const pauseWhenHidden = () => {
      if (document.hidden) setIsScanPlaying(false);
    };
    document.addEventListener('visibilitychange', pauseWhenHidden);
    return () => document.removeEventListener('visibilitychange', pauseWhenHidden);
  }, []);

  useEffect(() => {
    if (!isScanPlaying || !active || reducedMotion) return;
    const interval = window.setInterval(
      () => advanceConfigurationScan(scanDirectionRef.current, true),
      Math.max(100, Math.round(300 / scanSpeed)),
    );
    return () => window.clearInterval(interval);
  }, [active, advanceConfigurationScan, isScanPlaying, reducedMotion, scanSpeed]);

  const changeScene = (nextKind: MolecularSceneKind) => {
    const next = nextKind === 'water-dimer'
      ? createWaterDimerScene({ oxygenSeparationAngstrom: oxygenSeparation, donorAngleDegrees: donorAngle })
      : createNaclRocksaltScene({ selectedDisplacementAngstrom: ionDisplacement });
    setSceneKind(nextKind);
    setIsScanPlaying(false);
    scanDirectionRef.current = 1;
    setLayers((current) => ({
      ...current,
      bonds: nextKind === 'water-dimer',
      unitCell: nextKind === 'nacl-rocksalt',
      valenceDirections: false,
      hybridizationGuide: false,
      bondAxisGuide: false,
      donorAcceptorAxisGuide: false,
    }));
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

  const zoomCamera = (factor: number) => {
    setCamera((current) => ({ ...current, zoom: clamp(current.zoom * factor, 0.62, 1.85) }));
    setAnnouncement('观察视角缩放已调整；结构坐标没有改变。');
  };

  const toggleLayer = (key: keyof MolecularVisualLayers, label: string) => {
    setLayers((current) => {
      const next = !current[key];
      setAnnouncement(`${label}${next ? '已显示' : '已隐藏'}；物理状态和导出 JSON 没有改变。`);
      return { ...current, [key]: next };
    });
  };

  const stopScanForManualControl = () => {
    if (isScanPlaying) setAnnouncement('配置扫描已暂停；现在使用手动参数。');
    setIsScanPlaying(false);
  };

  const toggleScan = () => {
    if (reducedMotion) {
      setAnnouncement('系统已启用减少动态效果；请使用前后步或参数滑杆检查静态构型。');
      return;
    }
    setIsScanPlaying((current) => {
      const next = !current;
      setAnnouncement(next
        ? '配置扫描已开始；这是连续重算的静态构型序列，不是时间或分子动力学。'
        : '配置扫描已暂停。');
      return next;
    });
  };

  const stepScan = (direction: 1 | -1) => {
    setIsScanPlaying(false);
    advanceConfigurationScan(direction, false);
    setAnnouncement(`配置扫描已${direction > 0 ? '前进' : '后退'}一步；这不是时间步。`);
  };

  const resetConfiguration = () => {
    setIsScanPlaying(false);
    scanDirectionRef.current = 1;
    if (sceneKind === 'water-dimer') {
      setOxygenSeparation(2.9);
      setDonorAngle(0);
    } else {
      setIonDisplacement(0);
    }
    setAnnouncement('受控构型参数已复位；相机和图层保持不变。');
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

          <div className="molecular-workspace">
            <div className="molecular-primary">
              <div className="micro-viewport molecular-viewport">
                <MolecularCanvas
                  scene={scene}
                  camera={camera}
                  selectedAtomId={selectedAtom.id}
                  layers={layers}
                  onCameraChange={handleCameraChange}
                  onAtomSelect={selectAtom}
                  onAnnouncement={setAnnouncement}
                />
                <p className="visually-hidden" aria-live="polite" aria-atomic="true">{announcement}</p>
                <div className="viewport-label top-left"><span>EXPLICIT 3D COORDINATES</span><b>{scene.kind === 'water-dimer' ? 'H₂O geometry + rigid O–H bonds' : 'NaCl lattice + octahedral first shell'}</b></div>
                <div className="scan-state-badge"><i className={isScanPlaying ? 'running' : ''} />{isScanPlaying ? 'SCANNING STATIC STATES' : 'STATIC STATE'}</div>
                <div className="camera-tools" role="group" aria-label="三维视角快捷控制">
                  <button type="button" onClick={() => zoomCamera(1.12)} aria-label="放大三维结构">＋</button>
                  <button type="button" onClick={() => zoomCamera(1 / 1.12)} aria-label="缩小三维结构">−</button>
                  <button type="button" onClick={resetCamera} aria-label="复位三维视角">↺</button>
                </div>
                {hasElectronicReferenceLayer && (
                  <div className="reference-viewport-badge" role="note">
                    <b>REFERENCE · NOT ELECTRONIC STRUCTURE</b>
                    <small>显示比例与颜色仅为线框约定；不进入能量、力、state 或 JSON。</small>
                  </div>
                )}
                <div className="viewport-boundary" id="molecular-boundary">
                  <span>{scene.kind === 'water-dimer' ? 'FIXED-CHARGE TIP3P' : 'FINITE FIRST SHELL'}</span>
                  原子表面只编码元素身份，不是物理半径或电子密度；虚线是非键、配位或明确标注的几何参考。
                </div>
              </div>

              <div className="configuration-transport" aria-label="静态构型扫描控制">
                <div className="configuration-transport-title">
                  <span>CONFIGURATION SCAN</span>
                  <b>NOT TIME · NOT MD</b>
                  <small>每一步都重新调用同一确定性场景构建器；画面、能量、力与 JSON 属于同一 state。</small>
                </div>
                <div className="configuration-buttons" role="group" aria-label="播放与逐步控制">
                  <button type="button" className={isScanPlaying ? 'active' : ''} onClick={toggleScan} aria-pressed={isScanPlaying} aria-disabled={reducedMotion} aria-describedby={reducedMotion ? 'reduced-motion-scan-note' : undefined}>{isScanPlaying ? 'Ⅱ 暂停' : '▶ 播放'}</button>
                  <button type="button" onClick={() => stepScan(-1)} aria-label="配置扫描后退一步">← 一步</button>
                  <button type="button" onClick={() => stepScan(1)} aria-label="配置扫描前进一步">一步 →</button>
                  <button type="button" onClick={resetConfiguration}>↺ 构型</button>
                </div>
                {scene.kind === 'water-dimer' && (
                  <div className="scan-axis-buttons" role="group" aria-label="水分子配置扫描坐标">
                    <button type="button" className={waterScanAxis === 'separation' ? 'active' : ''} aria-pressed={waterScanAxis === 'separation'} onClick={() => { setIsScanPlaying(false); setWaterScanAxis('separation'); }}>O···O 距离</button>
                    <button type="button" className={waterScanAxis === 'orientation' ? 'active' : ''} aria-pressed={waterScanAxis === 'orientation'} onClick={() => { setIsScanPlaying(false); setWaterScanAxis('orientation'); }}>供体取向</button>
                  </div>
                )}
                <div className="scan-speed-buttons" role="group" aria-label="配置扫描速度">
                  {[1, 2, 4].map((speed) => <button type="button" key={speed} className={scanSpeed === speed ? 'active' : ''} aria-pressed={scanSpeed === speed} disabled={reducedMotion} onClick={() => setScanSpeed(speed)}>{speed}×</button>)}
                  {reducedMotion && <small id="reduced-motion-scan-note">减少动态效果已启用：连续播放关闭，逐步检查可用。</small>}
                </div>
              </div>

              <div className="molecular-controls">
                <div className="molecular-slider-stack">
                  {scene.kind === 'water-dimer' ? (
                    <>
                      <label><span>O···O 分离距离</span><input type="range" min="2.55" max="4.8" step="0.01" value={oxygenSeparation} aria-valuetext={`${oxygenSeparation.toFixed(2)} Å`} onChange={(event) => { stopScanForManualControl(); const value = Number(event.target.value); setOxygenSeparation(value); setAnnouncement(`O···O 分离距离已设为 ${value.toFixed(2)} Å。`); }} /><b>{oxygenSeparation.toFixed(2)} Å</b></label>
                      <label><span>供体取向</span><input type="range" min="-45" max="45" step="1" value={donorAngle} aria-valuetext={`${donorAngle.toFixed(0)} 度`} onChange={(event) => { stopScanForManualControl(); const value = Number(event.target.value); setDonorAngle(value); setAnnouncement(`供体取向已设为 ${value.toFixed(0)} 度。`); }} /><b>{donorAngle.toFixed(0)}°</b></label>
                    </>
                  ) : (
                    <label><span>中央 Na⁺ 的 x 位移探针</span><input type="range" min="-0.4" max="0.4" step="0.01" value={ionDisplacement} aria-valuetext={`${ionDisplacement.toFixed(2)} Å`} onChange={(event) => { stopScanForManualControl(); const value = Number(event.target.value); setIonDisplacement(value); setAnnouncement(`中央 Na⁺ 的 x 位移已设为 ${value.toFixed(2)} Å。`); }} /><b>{ionDisplacement.toFixed(2)} Å</b></label>
                  )}
                </div>
                <button type="button" className="snapshot-download" onClick={downloadSnapshot}>导出当前结构 JSON</button>
              </div>
            </div>

            <aside className="molecular-view-rail" aria-label="三维结构图层与电子参考选项">
              <div className="view-rail-heading"><span>VIEW RAIL</span><b>图层与参考</b><small>选项始终可见；参考层不写入物理 state。</small></div>
              <div className="rail-state-card"><span>STATE</span><b>{scene.stateId}</b><small>{scene.stateDigest}</small></div>
              <div className="rail-probe">
                <span>SELECTED · {selectedAtom.id}</span>
                <b>{selectedAtom.label} <em>{formatCharge(selectedAtom)}</em></b>
                <small>x/y/z = {formatVector(selectedAtom.positionAngstrom, 3)} Å</small>
                <small>|ΣF| = {selectedForceMagnitude === null ? 'NOT EVALUATED' : `${selectedForceMagnitude.toExponential(3)} kJ mol⁻¹ Å⁻¹`}</small>
              </div>

              <section className="rail-layer-group">
                <div className="rail-section-title"><span>PHYSICAL / STRUCTURAL</span><small>typed scene</small></div>
                <LayerButton label="元素标签" detail="元素与位点身份" badge="VIEW" pressed={layers.labels} onClick={() => toggleLayer('labels', '元素标签')} />
                <LayerButton label="刚性 O–H 键" detail={scene.kind === 'water-dimer' ? '来自 scene.bonds' : 'NaCl 场景没有共价键'} badge={scene.kind === 'water-dimer' ? 'STATE' : 'N/A'} pressed={layers.bonds} disabled={scene.kind !== 'water-dimer'} onClick={() => toggleLayer('bonds', '刚性键')} />
                <LayerButton label="晶胞边界" detail={scene.kind === 'nacl-rocksalt' ? 'NBS 晶格常数构建' : '水二聚体没有晶胞'} badge={scene.kind === 'nacl-rocksalt' ? 'STATE' : 'N/A'} pressed={layers.unitCell} disabled={scene.kind !== 'nacl-rocksalt'} onClick={() => toggleLayer('unitCell', '晶胞边界')} />
                <LayerButton label="非键 / 配位" detail="scene.guides + selected pair" badge="GUIDE" pressed={layers.interactions} onClick={() => toggleLayer('interactions', '非键与配位导向')} />
                <LayerButton label="成对力方向" detail="归一化方向；数值见检查器" badge="COMPUTED" pressed={layers.pairForces} onClick={() => toggleLayer('pairForces', '成对力方向')} />
                <LayerButton label="净力方向" detail="选中位点的求和向量" badge="COMPUTED" pressed={layers.netForce} onClick={() => toggleLayer('netForce', '净力方向')} />
              </section>

              <section className="rail-layer-group reference-layer-group">
                <div className="rail-section-title"><span>ELECTRONIC CONCEPT</span><small>not solved</small></div>
                <LayerButton label="价层方向" detail={scene.kind === 'water-dimer' ? '由 O→H 几何构造的 VSEPR-like 方向' : '形式点电荷模型无价层载荷'} badge={scene.kind === 'water-dimer' ? 'REFERENCE' : 'N/A'} pressed={layers.valenceDirections} disabled={scene.kind !== 'water-dimer'} onClick={() => toggleLayer('valenceDirections', '价层方向参考')} />
                <LayerButton label="“sp³”线框" detail={scene.kind === 'water-dimer' ? '两键向 + 两理想孤对向；不是轨道' : 'NaCl 不适用杂化参考'} badge={scene.kind === 'water-dimer' ? 'REFERENCE' : 'N/A'} pressed={layers.hybridizationGuide} disabled={scene.kind !== 'water-dimer'} onClick={() => toggleLayer('hybridizationGuide', 'sp3 几何参考')} />
                <LayerButton label="O–H σ 轴向线框" detail={scene.kind === 'water-dimer' ? '沿真实刚性键的教学轴；未计算重叠积分' : 'NaCl 无共价 O–H 键'} badge={scene.kind === 'water-dimer' ? 'REFERENCE' : 'N/A'} pressed={layers.bondAxisGuide} disabled={scene.kind !== 'water-dimer'} onClick={() => toggleLayer('bondAxisGuide', 'sigma 轴向教学参考')} />
                <LayerButton label="孤对 / σ* 轴向参考" detail={scene.kind === 'water-dimer' ? '显示推导孤对轴、D–H 延长轴及实际偏角' : 'NaCl 无对应载荷'} badge={scene.kind === 'water-dimer' ? 'REFERENCE' : 'N/A'} pressed={layers.donorAcceptorAxisGuide} disabled={scene.kind !== 'water-dimer'} onClick={() => toggleLayer('donorAcceptorAxisGuide', '供受体轴向教学参考')} />
              </section>

              <div className="reference-contract-card" role="note">
                <b>GEOMETRY-DERIVED REFERENCE · NOT ELECTRONIC STRUCTURE</b>
                <small>{MOLECULAR_REFERENCE_CONTRACTS.geometry.role} + {MOLECULAR_REFERENCE_CONTRACTS.qualitativeElectronic.role} · quantitative false · electronicStructureSolved false · participatesInEnergy false</small>
                {scene.kind === 'water-dimer' ? (
                  <>
                    <p>价层与“sp³”方向是依据当前 XYZ 构造的 VSEPR / 教科书导向，不是波函数、电子密度、占据、能级或量子化学结果。</p>
                    <p>σ 线框的长宽、颜色和孤对轴长度均为显示约定，不代表电子密度、轨道尺度或重叠积分。</p>
                    <p>孤对 / σ* 轴向参考只报告当前几何偏角；未计算电荷转移、键级、σ* 占据或氢键能。</p>
                    <p>能量和力仍且仅来自固定电荷 TIP3P Coulomb + O–O LJ；参考层不参与求值。</p>
                  </>
                ) : <p>当前第一壳形式点电荷模型没有离子轨道、电子密度、极化、成键或能带载荷；电子参考层因此保持禁用。</p>}
              </div>

              <div className="rail-legends" aria-label="画面图例">
                <div>{scene.kind === 'water-dimer'
                  ? <><span><i className="element-o" />O · −0.834e</span><span><i className="element-h" />H · +0.417e</span></>
                  : <><span><i className="element-na" />Na⁺</span><span><i className="element-cl" />Cl⁻</span></>}</div>
                <div><span><i className="pair-force" />成对力</span><span><i className="net-force" />净力</span></div>
                <small>DRAG rotate · WHEEL / + − zoom · CLICK select · ARROWS camera · 0 reset</small>
              </div>
            </aside>
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
              <section className="evidence-state-flow" aria-label="静态结构的求值路径">
                <div className="inspector-section-title"><span>STATE → READOUT</span><small>not a timeline</small></div>
                <ol>
                  <li><span>01</span><div><b>STRUCTURE</b><small>parameter-sourced geometry</small></div></li>
                  <li><span>02</span><div><b>CONTROL</b><small>configuration coordinate</small></div></li>
                  <li><span>03</span><div><b>EVALUATE</b><small>pair energy + force</small></div></li>
                  <li><span>04</span><div><b>READOUT</b><small>inspect + export</small></div></li>
                </ol>
                <em>STATIC CONFIGURATION · NOT TIME</em>
              </section>
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

function LayerButton({
  label,
  detail,
  badge,
  pressed,
  disabled = false,
  onClick,
}: {
  label: string;
  detail: string;
  badge: string;
  pressed: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`rail-layer-button${pressed ? ' active' : ''}`}
      aria-pressed={disabled ? undefined : pressed}
      disabled={disabled}
      onClick={onClick}
    >
      <span><i aria-hidden="true" /><b>{label}</b><em>{badge}</em></span>
      <small>{detail}</small>
    </button>
  );
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

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}
