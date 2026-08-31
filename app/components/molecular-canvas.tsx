'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  magnitude,
  type MolecularAtom,
  type MolecularScene,
  type PairInteraction,
  type Vector3,
} from '@/lib/molecular/molecular-interactions';

export type MolecularCamera = Readonly<{ yaw: number; pitch: number; zoom: number }>;

export const INITIAL_MOLECULAR_CAMERA: MolecularCamera = {
  yaw: -34 * Math.PI / 180,
  pitch: 21 * Math.PI / 180,
  zoom: 1,
};

type ProjectedPoint = Readonly<{ x: number; y: number; depth: number; scale: number }>;
type ProjectedAtom = Readonly<{ atom: MolecularAtom; point: ProjectedPoint; radius: number }>;
type Gesture = {
  pointerId: number;
  startX: number;
  startY: number;
  startCamera: MolecularCamera;
  moved: boolean;
};

export function MolecularCanvas({
  scene,
  camera,
  selectedAtomId,
  showLabels,
  showInteractions,
  showForces,
  onCameraChange,
  onAtomSelect,
  onAnnouncement,
}: {
  scene: MolecularScene;
  camera: MolecularCamera;
  selectedAtomId: string;
  showLabels: boolean;
  showInteractions: boolean;
  showForces: boolean;
  onCameraChange: (camera: MolecularCamera) => void;
  onAtomSelect: (atomId: string) => void;
  onAnnouncement: (message: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const projectedAtomsRef = useRef<ReadonlyArray<ProjectedAtom>>([]);
  const cameraRef = useRef(camera);

  useLayoutEffect(() => {
    cameraRef.current = camera;
  }, [camera]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    sizeCanvas(canvas, context);
    projectedAtomsRef.current = drawMolecularScene(
      context,
      canvas.clientWidth,
      canvas.clientHeight,
      scene,
      camera,
      selectedAtomId,
      { showLabels, showInteractions, showForces },
    );
  }, [camera, scene, selectedAtomId, showForces, showInteractions, showLabels]);

  useLayoutEffect(draw, [draw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [draw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const next = {
        ...cameraRef.current,
        zoom: clamp(cameraRef.current.zoom * Math.exp(-event.deltaY * 0.0012), 0.62, 1.85),
      };
      onCameraChange(next);
    };
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleWheel);
  }, [onCameraChange]);

  const beginGesture = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0 || gestureRef.current) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    gestureRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startCamera: cameraRef.current,
      moved: false,
    };
  };

  const moveGesture = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - gesture.startX;
    const deltaY = event.clientY - gesture.startY;
    if (!gesture.moved && Math.hypot(deltaX, deltaY) < 5) return;
    gesture.moved = true;
    onCameraChange({
      yaw: gesture.startCamera.yaw + deltaX * 0.008,
      pitch: clamp(gesture.startCamera.pitch - deltaY * 0.007, -1.35, 1.35),
      zoom: gesture.startCamera.zoom,
    });
  };

  const endGesture = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    gestureRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (gesture.moved) {
      onAnnouncement('三维观察视角已旋转；分子和离子的 x/y/z 物理坐标没有改变。');
      return;
    }
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const y = event.clientY - bounds.top;
    const hit = [...projectedAtomsRef.current]
      .reverse()
      .find(({ atom, point, radius }) => scene.selectableAtomIds.includes(atom.id)
        && Math.hypot(point.x - x, point.y - y) <= Math.max(18, radius + 6));
    if (hit) {
      onAtomSelect(hit.atom.id);
    }
  };

  const cancelGesture = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (gestureRef.current?.pointerId !== event.pointerId) return;
    gestureRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const handleKeyboard = (event: ReactKeyboardEvent<HTMLCanvasElement>) => {
    const next = { ...cameraRef.current };
    if (event.key === 'ArrowLeft') next.yaw -= 0.12;
    else if (event.key === 'ArrowRight') next.yaw += 0.12;
    else if (event.key === 'ArrowUp') next.pitch = clamp(next.pitch + 0.1, -1.35, 1.35);
    else if (event.key === 'ArrowDown') next.pitch = clamp(next.pitch - 0.1, -1.35, 1.35);
    else if (event.key === '+' || event.key === '=') next.zoom = clamp(next.zoom * 1.1, 0.62, 1.85);
    else if (event.key === '-' || event.key === '_') next.zoom = clamp(next.zoom / 1.1, 0.62, 1.85);
    else if (event.key === '0') Object.assign(next, INITIAL_MOLECULAR_CAMERA);
    else return;
    event.preventDefault();
    onCameraChange(next);
    onAnnouncement('三维观察视角已通过键盘调整；物理坐标没有改变。');
  };

  return (
    <canvas
      ref={canvasRef}
      className="particle-canvas molecular-canvas"
      tabIndex={0}
      onPointerDown={beginGesture}
      onPointerMove={moveGesture}
      onPointerUp={endGesture}
      onPointerCancel={cancelGesture}
      onKeyDown={handleKeyboard}
      aria-label={`${scene.name}的真实 x/y/z 结构视图。拖动旋转，滚轮或加减键缩放，点击选择原子或离子，方向键调整视角，数字零复位。`}
      aria-describedby="molecular-boundary"
    />
  );
}

function drawMolecularScene(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  scene: MolecularScene,
  camera: MolecularCamera,
  selectedAtomId: string,
  layers: Readonly<{ showLabels: boolean; showInteractions: boolean; showForces: boolean }>,
) {
  context.clearRect(0, 0, width, height);
  context.fillStyle = '#05090c';
  context.fillRect(0, 0, width, height);
  drawBackdrop(context, width, height);

  const projection = createProjection(scene, width, height, camera);
  const atomById = new Map(scene.atoms.map((atom) => [atom.id, atom]));
  const projectedAtoms = scene.atoms.map((atom) => {
    const point = projection.project(atom.positionAngstrom);
    return {
      atom,
      point,
      radius: Math.max(4, atom.displayRadiusAngstrom * projection.pixelsPerAngstrom * point.scale),
    };
  }).sort((first, second) => second.point.depth - first.point.depth);

  if (scene.unitCell) drawUnitCell(context, scene.unitCell.originAngstrom, scene.unitCell.edgeAngstrom, projection.project);

  scene.bonds.forEach((bond) => {
    const atomA = atomById.get(bond.atomAId);
    const atomB = atomById.get(bond.atomBId);
    if (!atomA || !atomB) return;
    drawBondCylinder(context, projection.project(atomA.positionAngstrom), projection.project(atomB.positionAngstrom));
  });

  if (layers.showInteractions) {
    scene.guides.forEach((guide) => {
      const atomA = atomById.get(guide.atomAId);
      const atomB = atomById.get(guide.atomBId);
      if (!atomA || !atomB) return;
      drawGuide(context, projection.project(atomA.positionAngstrom), projection.project(atomB.positionAngstrom), guide.kind);
    });
    scene.pairInteractions.forEach((interaction) => {
      if (interaction.sourceAtomId !== selectedAtomId && interaction.targetAtomId !== selectedAtomId) return;
      const source = atomById.get(interaction.sourceAtomId);
      const target = atomById.get(interaction.targetAtomId);
      if (!source || !target) return;
      drawPairInfluence(
        context,
        projection.project(source.positionAngstrom),
        projection.project(target.positionAngstrom),
        interaction,
      );
    });
  }

  if (layers.showForces) {
    const selected = atomById.get(selectedAtomId);
    if (selected) {
      drawPairForceArrows(context, scene, selected, projection.project);
      drawNetForceArrow(context, scene, selected, projection.project);
    }
  }

  const localInteractionAtomIds = new Set(scene.guides.flatMap((guide) => [guide.atomAId, guide.atomBId]));
  projectedAtoms.forEach(({ atom, point, radius }) => {
    const emphasized = scene.kind === 'water-dimer' || localInteractionAtomIds.has(atom.id);
    drawAtomSurface(
      context,
      atom,
      point,
      radius,
      atom.id === selectedAtomId,
      layers.showLabels && emphasized,
      emphasized ? 1 : 0.28,
    );
  });

  return projectedAtoms;
}

function createProjection(scene: MolecularScene, width: number, height: number, camera: MolecularCamera) {
  const bounds = scene.atoms.reduce((current, atom) => ({
    minimum: {
      x: Math.min(current.minimum.x, atom.positionAngstrom.x),
      y: Math.min(current.minimum.y, atom.positionAngstrom.y),
      z: Math.min(current.minimum.z, atom.positionAngstrom.z),
    },
    maximum: {
      x: Math.max(current.maximum.x, atom.positionAngstrom.x),
      y: Math.max(current.maximum.y, atom.positionAngstrom.y),
      z: Math.max(current.maximum.z, atom.positionAngstrom.z),
    },
  }), {
    minimum: { x: Number.POSITIVE_INFINITY, y: Number.POSITIVE_INFINITY, z: Number.POSITIVE_INFINITY },
    maximum: { x: Number.NEGATIVE_INFINITY, y: Number.NEGATIVE_INFINITY, z: Number.NEGATIVE_INFINITY },
  });
  const center = {
    x: (bounds.minimum.x + bounds.maximum.x) / 2,
    y: (bounds.minimum.y + bounds.maximum.y) / 2,
    z: (bounds.minimum.z + bounds.maximum.z) / 2,
  };
  const radius = Math.max(1.2, ...scene.atoms.map((atom) => magnitude(subtract(atom.positionAngstrom, center))));
  const pixelsPerAngstrom = Math.min(width, height) * (scene.kind === 'water-dimer' ? 0.37 : 0.42) / radius * camera.zoom;
  const focalDistance = radius * 5.5;

  const project = (position: Vector3): ProjectedPoint => {
    const centered = subtract(position, center);
    const yawed = rotateY(centered, camera.yaw);
    const pitched = rotateX(yawed, camera.pitch);
    const perspective = clamp(focalDistance / (focalDistance + pitched.z), 0.58, 1.8);
    return {
      x: width / 2 + pitched.x * pixelsPerAngstrom * perspective,
      y: height / 2 - pitched.y * pixelsPerAngstrom * perspective,
      depth: pitched.z,
      scale: perspective,
    };
  };
  return { project, pixelsPerAngstrom };
}

function drawBackdrop(context: CanvasRenderingContext2D, width: number, height: number) {
  const glow = context.createRadialGradient(width * 0.52, height * 0.46, 0, width * 0.52, height * 0.46, width * 0.72);
  glow.addColorStop(0, 'rgba(52, 100, 105, .2)');
  glow.addColorStop(0.52, 'rgba(16, 31, 37, .08)');
  glow.addColorStop(1, 'rgba(5, 9, 12, 0)');
  context.fillStyle = glow;
  context.fillRect(0, 0, width, height);
  context.save();
  context.strokeStyle = 'rgba(112, 151, 151, .06)';
  context.lineWidth = 1;
  for (let x = 0; x <= width; x += 48) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
  }
  for (let y = 0; y <= height; y += 48) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }
  context.restore();
}

function drawUnitCell(
  context: CanvasRenderingContext2D,
  origin: Vector3,
  edge: number,
  project: (position: Vector3) => ProjectedPoint,
) {
  const vertices = [
    { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 1, y: 1, z: 0 },
    { x: 0, y: 0, z: 1 }, { x: 1, y: 0, z: 1 }, { x: 0, y: 1, z: 1 }, { x: 1, y: 1, z: 1 },
  ].map((fraction) => project({
    x: origin.x + fraction.x * edge,
    y: origin.y + fraction.y * edge,
    z: origin.z + fraction.z * edge,
  }));
  const edges = [[0, 1], [0, 2], [1, 3], [2, 3], [4, 5], [4, 6], [5, 7], [6, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  context.save();
  context.setLineDash([5, 6]);
  context.strokeStyle = 'rgba(119, 175, 255, .34)';
  context.lineWidth = 1;
  edges.forEach(([start, end]) => drawLine(context, vertices[start], vertices[end]));
  context.restore();
}

function drawBondCylinder(context: CanvasRenderingContext2D, start: ProjectedPoint, end: ProjectedPoint) {
  context.save();
  context.lineCap = 'round';
  context.strokeStyle = 'rgba(2, 5, 7, .86)';
  context.lineWidth = Math.max(9, 13 * (start.scale + end.scale) / 2);
  drawLine(context, start, end);
  const gradient = context.createLinearGradient(start.x, start.y, end.x, end.y);
  gradient.addColorStop(0, '#cbd4dc');
  gradient.addColorStop(0.48, '#7e8f9b');
  gradient.addColorStop(1, '#e7edf0');
  context.strokeStyle = gradient;
  context.lineWidth = Math.max(5, 8 * (start.scale + end.scale) / 2);
  drawLine(context, start, end);
  context.restore();
}

function drawGuide(context: CanvasRenderingContext2D, start: ProjectedPoint, end: ProjectedPoint, kind: string) {
  context.save();
  context.setLineDash(kind === 'hydrogen-bond-guide' ? [4, 7] : [3, 7]);
  context.strokeStyle = kind === 'hydrogen-bond-guide' ? 'rgba(111, 220, 234, .62)' : 'rgba(173, 143, 255, .36)';
  context.lineWidth = kind === 'hydrogen-bond-guide' ? 2 : 1.2;
  drawLine(context, start, end);
  context.restore();
}

function drawPairInfluence(context: CanvasRenderingContext2D, start: ProjectedPoint, end: ProjectedPoint, interaction: PairInteraction) {
  context.save();
  context.setLineDash([2, 9]);
  context.strokeStyle = interaction.coulombEnergyKjMol < 0 ? 'rgba(109, 222, 198, .4)' : 'rgba(255, 125, 131, .38)';
  context.lineWidth = 1.2;
  drawLine(context, start, end);
  context.restore();
}

function drawPairForceArrows(
  context: CanvasRenderingContext2D,
  scene: MolecularScene,
  selected: MolecularAtom,
  project: (position: Vector3) => ProjectedPoint,
) {
  scene.pairInteractions.forEach((interaction) => {
    let force: Vector3 | null = null;
    if (interaction.targetAtomId === selected.id) force = interaction.forceOnTargetKjMolAngstrom;
    if (interaction.sourceAtomId === selected.id) force = scale(interaction.forceOnTargetKjMolAngstrom, -1);
    if (!force || magnitude(force) < 1e-10) return;
    const endWorld = add(selected.positionAngstrom, scale(normalize(force), scene.kind === 'water-dimer' ? 0.38 : 0.7));
    drawArrow(context, project(selected.positionAngstrom), project(endWorld), 'rgba(242, 183, 107, .72)', 1.2, 5);
  });
}

function drawNetForceArrow(
  context: CanvasRenderingContext2D,
  scene: MolecularScene,
  selected: MolecularAtom,
  project: (position: Vector3) => ProjectedPoint,
) {
  const force = scene.forceByAtomIdKjMolAngstrom[selected.id];
  if (!force || magnitude(force) < 1e-8) return;
  const endWorld = add(selected.positionAngstrom, scale(normalize(force), scene.kind === 'water-dimer' ? 0.9 : 1.25));
  drawArrow(context, project(selected.positionAngstrom), project(endWorld), '#77afff', 3, 9);
}

function drawArrow(
  context: CanvasRenderingContext2D,
  start: ProjectedPoint,
  end: ProjectedPoint,
  color: string,
  width: number,
  headSize: number,
) {
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  context.save();
  context.strokeStyle = color;
  context.fillStyle = color;
  context.lineWidth = width;
  context.beginPath();
  context.moveTo(start.x, start.y);
  context.lineTo(end.x, end.y);
  context.stroke();
  context.beginPath();
  context.moveTo(end.x, end.y);
  context.lineTo(end.x - Math.cos(angle - Math.PI / 6) * headSize, end.y - Math.sin(angle - Math.PI / 6) * headSize);
  context.lineTo(end.x - Math.cos(angle + Math.PI / 6) * headSize, end.y - Math.sin(angle + Math.PI / 6) * headSize);
  context.closePath();
  context.fill();
  context.restore();
}

function drawAtomSurface(
  context: CanvasRenderingContext2D,
  atom: MolecularAtom,
  point: ProjectedPoint,
  radius: number,
  selected: boolean,
  showLabel: boolean,
  opacity: number,
) {
  const colors = {
    H: ['#ffffff', '#aab6c0', '#46525d'],
    O: ['#ffb4b9', '#e34d5a', '#6d1520'],
    Na: ['#d3c9ff', '#8872ee', '#30276d'],
    Cl: ['#c3f6d4', '#55c984', '#175b39'],
  }[atom.element];
  context.save();
  context.globalAlpha = opacity;
  if (selected) {
    context.beginPath();
    context.arc(point.x, point.y, radius + 9, 0, Math.PI * 2);
    context.strokeStyle = '#77afff';
    context.lineWidth = 2;
    context.shadowColor = '#77afff';
    context.shadowBlur = 18;
    context.stroke();
  }
  const gradient = context.createRadialGradient(
    point.x - radius * 0.34,
    point.y - radius * 0.42,
    Math.max(1, radius * 0.05),
    point.x,
    point.y,
    radius,
  );
  gradient.addColorStop(0, colors[0]);
  gradient.addColorStop(0.38, colors[1]);
  gradient.addColorStop(1, colors[2]);
  context.fillStyle = gradient;
  context.shadowColor = colors[1];
  context.shadowBlur = selected ? 16 : 8;
  context.beginPath();
  context.arc(point.x, point.y, radius, 0, Math.PI * 2);
  context.fill();
  context.shadowBlur = 0;
  context.strokeStyle = 'rgba(255, 255, 255, .26)';
  context.lineWidth = 1;
  context.stroke();
  if (showLabel && (selected || atom.element !== 'H' || radius > 12)) {
    context.font = `${Math.round(clamp(radius * 0.55, 9, 15))}px SFMono-Regular, monospace`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle = atom.element === 'H' ? '#1d272e' : '#f8fbfa';
    context.fillText(atom.label, point.x, point.y + 1);
  }
  context.restore();
}

function sizeCanvas(canvas: HTMLCanvasElement, context: CanvasRenderingContext2D) {
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

function drawLine(context: CanvasRenderingContext2D, start: Pick<ProjectedPoint, 'x' | 'y'>, end: Pick<ProjectedPoint, 'x' | 'y'>) {
  context.beginPath();
  context.moveTo(start.x, start.y);
  context.lineTo(end.x, end.y);
  context.stroke();
}

function rotateY(vector: Vector3, radians: number): Vector3 {
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return {
    x: vector.x * cosine + vector.z * sine,
    y: vector.y,
    z: -vector.x * sine + vector.z * cosine,
  };
}

function rotateX(vector: Vector3, radians: number): Vector3 {
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return {
    x: vector.x,
    y: vector.y * cosine - vector.z * sine,
    z: vector.y * sine + vector.z * cosine,
  };
}

function add(a: Vector3, b: Vector3): Vector3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function subtract(a: Vector3, b: Vector3): Vector3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function scale(vector: Vector3, factor: number): Vector3 {
  return { x: vector.x * factor, y: vector.y * factor, z: vector.z * factor };
}

function normalize(vector: Vector3): Vector3 {
  const length = magnitude(vector);
  if (!Number.isFinite(length) || length <= 0) return { x: 0, y: 0, z: 0 };
  return scale(vector, 1 / length);
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}
