'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type { Vector3 } from '@/lib/molecular/molecular-interactions';
import {
  buildWrappedTrajectorySegments,
  type PeriodicAtomisticRenderFrame,
  type PeriodicRenderAtom,
} from '@/lib/molecular/periodic-atomistic-render-frame';
import { INITIAL_MOLECULAR_CAMERA, type MolecularCamera } from './molecular-canvas';

export type PeriodicAtomisticVisualLayers = Readonly<{
  labels: boolean;
  unitCell: boolean;
  neighbors: boolean;
  periodicImages: boolean;
  trajectories: boolean;
  velocity: boolean;
  force: boolean;
  localVirial: boolean;
}>;

type ProjectedPoint = Readonly<{ x: number; y: number; depth: number; scale: number }>;
type ProjectedAtom = Readonly<{ atom: PeriodicRenderAtom; point: ProjectedPoint; hitRadius: number }>;
type Gesture = { pointerId: number; startX: number; startY: number; startCamera: MolecularCamera; moved: boolean };

export function PeriodicAtomisticCanvas({
  frame,
  history,
  camera,
  selectedAtomId,
  layers,
  onCameraChange,
  onAtomSelect,
  onAnnouncement,
}: {
  frame: PeriodicAtomisticRenderFrame;
  history: ReadonlyArray<PeriodicAtomisticRenderFrame>;
  camera: MolecularCamera;
  selectedAtomId: string;
  layers: PeriodicAtomisticVisualLayers;
  onCameraChange: (camera: MolecularCamera) => void;
  onAtomSelect: (atomId: string) => void;
  onAnnouncement: (message: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const projectedAtomsRef = useRef<ReadonlyArray<ProjectedAtom>>([]);
  const cameraRef = useRef(camera);

  useLayoutEffect(() => { cameraRef.current = camera; }, [camera]);
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    sizeCanvas(canvas, context);
    projectedAtomsRef.current = drawFrame(context, canvas.clientWidth, canvas.clientHeight, frame, history, camera, selectedAtomId, layers);
  }, [camera, frame, history, layers, selectedAtomId]);
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
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      onCameraChange({ ...cameraRef.current, zoom: clamp(cameraRef.current.zoom * Math.exp(-event.deltaY * 0.0012), 0.58, 1.9) });
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [onCameraChange]);

  const begin = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0 || gestureRef.current) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    gestureRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, startCamera: cameraRef.current, moved: false };
  };
  const move = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const dx = event.clientX - gesture.startX;
    const dy = event.clientY - gesture.startY;
    if (!gesture.moved && Math.hypot(dx, dy) < 5) return;
    gesture.moved = true;
    onCameraChange({ yaw: gesture.startCamera.yaw + dx * 0.008, pitch: clamp(gesture.startCamera.pitch - dy * 0.007, -1.35, 1.35), zoom: gesture.startCamera.zoom });
  };
  const end = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    gestureRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (gesture.moved) {
      onAnnouncement('周期晶胞观察视角已旋转；求解器 state 与摘要没有改变。');
      return;
    }
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const y = event.clientY - bounds.top;
    const hit = [...projectedAtomsRef.current].reverse().find(({ point, hitRadius }) => Math.hypot(point.x - x, point.y - y) <= hitRadius);
    if (hit) onAtomSelect(hit.atom.id);
  };
  const cancel = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (gestureRef.current?.pointerId !== event.pointerId) return;
    gestureRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const keyboard = (event: ReactKeyboardEvent<HTMLCanvasElement>) => {
    const next = { ...cameraRef.current };
    if (event.key === 'ArrowLeft') next.yaw -= 0.12;
    else if (event.key === 'ArrowRight') next.yaw += 0.12;
    else if (event.key === 'ArrowUp') next.pitch = clamp(next.pitch + 0.1, -1.35, 1.35);
    else if (event.key === 'ArrowDown') next.pitch = clamp(next.pitch - 0.1, -1.35, 1.35);
    else if (event.key === '+' || event.key === '=') next.zoom = clamp(next.zoom * 1.1, 0.58, 1.9);
    else if (event.key === '-' || event.key === '_') next.zoom = clamp(next.zoom / 1.1, 0.58, 1.9);
    else if (event.key === '0') Object.assign(next, INITIAL_MOLECULAR_CAMERA);
    else return;
    event.preventDefault();
    onCameraChange(next);
  };

  return (
    <canvas
      ref={canvasRef}
      className="particle-canvas periodic-atomistic-canvas"
      tabIndex={0}
      onPointerDown={begin}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={cancel}
      onLostPointerCapture={cancel}
      onKeyDown={keyboard}
      aria-label="三维周期 FCC 氩原子求解场景。拖动旋转，Control 或 Command 加滚轮缩放，点击选择原子；所有位置、邻居、速度和力来自当前 observation。"
    />
  );
}

function drawFrame(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  frame: PeriodicAtomisticRenderFrame,
  history: ReadonlyArray<PeriodicAtomisticRenderFrame>,
  camera: MolecularCamera,
  selectedAtomId: string,
  layers: PeriodicAtomisticVisualLayers,
) {
  drawBackdrop(context, width, height);
  const projection = createProjection(frame.cell.verticesAngstrom, width, height, camera);
  if (layers.trajectories) drawTrajectories(context, history, selectedAtomId, projection.project);
  if (layers.unitCell) drawCell(context, frame.cell.verticesAngstrom, projection.project);

  const atomById = new Map(frame.atoms.map((atom) => [atom.id, atom]));
  if (layers.neighbors) {
    for (const edge of frame.neighborEdges) {
      if (edge.atomAId !== selectedAtomId && edge.atomBId !== selectedAtomId) continue;
      const source = edge.atomAId === selectedAtomId ? edge.atomAPositionAngstrom : edge.atomBImagePositionAngstrom;
      const target = edge.atomAId === selectedAtomId ? edge.atomBImagePositionAngstrom : edge.atomAPositionAngstrom;
      drawNeighbor(context, projection.project(source), projection.project(target), edge.energyKjMol);
      const crosses = edge.imageShiftForB.x !== 0 || edge.imageShiftForB.y !== 0 || edge.imageShiftForB.z !== 0;
      if (crosses && layers.periodicImages) drawGhostDensity(context, projection.project(edge.atomBImagePositionAngstrom));
    }
  }

  const projected = frame.atoms.map((atom) => ({ atom, point: projection.project(atom.wrappedPositionAngstrom), hitRadius: 16 }))
    .sort((left, right) => right.point.depth - left.point.depth);
  for (const { atom, point } of projected) {
    drawAtomDensity(context, atom, point, atom.id === selectedAtomId, layers.labels, layers.localVirial);
  }
  const selected = atomById.get(selectedAtomId);
  if (selected) {
    if (layers.velocity) drawVectorArrow(context, projection.project, selected.wrappedPositionAngstrom, selected.velocityAngstromPerPicosecond, '#79a7ff', 0.75);
    if (layers.force) drawVectorArrow(context, projection.project, selected.wrappedPositionAngstrom, selected.forceKjMolAngstrom, '#ffc66d', 0.95);
  }
  return projected;
}

function drawBackdrop(context: CanvasRenderingContext2D, width: number, height: number) {
  context.clearRect(0, 0, width, height);
  const background = context.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, '#07131b');
  background.addColorStop(0.52, '#0b2025');
  background.addColorStop(1, '#071018');
  context.fillStyle = background;
  context.fillRect(0, 0, width, height);
  const glow = context.createRadialGradient(width * 0.5, height * 0.48, 0, width * 0.5, height * 0.48, width * 0.58);
  glow.addColorStop(0, 'rgba(82, 219, 190, .16)');
  glow.addColorStop(0.48, 'rgba(89, 127, 224, .08)');
  glow.addColorStop(1, 'rgba(5, 13, 20, 0)');
  context.fillStyle = glow;
  context.fillRect(0, 0, width, height);
}

function drawCell(context: CanvasRenderingContext2D, vertices: ReadonlyArray<Vector3>, project: (position: Vector3) => ProjectedPoint) {
  const points = vertices.map(project);
  const edges = [[0, 1], [0, 2], [1, 3], [2, 3], [4, 5], [4, 6], [5, 7], [6, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  context.save();
  context.strokeStyle = 'rgba(100, 235, 212, .42)';
  context.setLineDash([5, 6]);
  context.lineWidth = 1;
  for (const [a, b] of edges) drawLine(context, points[a], points[b]);
  context.restore();
}

function drawTrajectories(
  context: CanvasRenderingContext2D,
  history: ReadonlyArray<PeriodicAtomisticRenderFrame>,
  atomId: string,
  project: (position: Vector3) => ProjectedPoint,
) {
  const segments = buildWrappedTrajectorySegments(history, atomId);
  context.save();
  context.strokeStyle = 'rgba(121, 167, 255, .58)';
  context.lineWidth = 1.7;
  context.setLineDash([4, 5]);
  for (const segment of segments) {
    if (segment.length < 2) continue;
    const points = segment.map(project);
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    for (const point of points.slice(1)) context.lineTo(point.x, point.y);
    context.stroke();
  }
  context.restore();
}

function drawNeighbor(context: CanvasRenderingContext2D, start: ProjectedPoint, end: ProjectedPoint, energyKjMol: number) {
  const gradient = context.createLinearGradient(start.x, start.y, end.x, end.y);
  gradient.addColorStop(0, energyKjMol < 0 ? 'rgba(92, 230, 192, .12)' : 'rgba(255, 171, 110, .12)');
  gradient.addColorStop(0.5, energyKjMol < 0 ? 'rgba(92, 230, 192, .72)' : 'rgba(255, 171, 110, .7)');
  gradient.addColorStop(1, energyKjMol < 0 ? 'rgba(92, 230, 192, .12)' : 'rgba(255, 171, 110, .12)');
  context.save();
  context.strokeStyle = gradient;
  context.lineWidth = 1.2;
  context.setLineDash([3, 6]);
  drawLine(context, start, end);
  context.restore();
}

function drawAtomDensity(
  context: CanvasRenderingContext2D,
  atom: PeriodicRenderAtom,
  point: ProjectedPoint,
  selected: boolean,
  labels: boolean,
  localVirial: boolean,
) {
  const baseRadius = clamp(7.5 * point.scale, 4.8, 12);
  const virialColor = atom.localVirialTraceKjMol >= 0 ? '108, 226, 192' : '139, 165, 255';
  context.save();
  if (localVirial) {
    const halo = baseRadius * (2.15 + 0.25 * Math.tanh(Math.abs(atom.localVirialTraceKjMol) / 3));
    const field = context.createRadialGradient(point.x, point.y, 0, point.x, point.y, halo);
    field.addColorStop(0, `rgba(${virialColor}, .16)`);
    field.addColorStop(0.58, `rgba(${virialColor}, .07)`);
    field.addColorStop(1, `rgba(${virialColor}, 0)`);
    context.fillStyle = field;
    context.beginPath();
    context.arc(point.x, point.y, halo, 0, Math.PI * 2);
    context.fill();
  }
  for (const [factor, alpha] of [[1.75, 0.12], [1.35, 0.2], [1, 0.46]] as const) {
    context.beginPath();
    context.ellipse(point.x, point.y, baseRadius * factor, baseRadius * factor * 0.78, 0, 0, Math.PI * 2);
    context.strokeStyle = `rgba(156, 204, 255, ${alpha})`;
    context.lineWidth = factor === 1 ? 1.2 : 0.8;
    context.stroke();
  }
  const nucleus = context.createRadialGradient(point.x - 1.5, point.y - 1.8, 0, point.x, point.y, baseRadius * 0.5);
  nucleus.addColorStop(0, '#f0fbff');
  nucleus.addColorStop(0.35, '#78d8cf');
  nucleus.addColorStop(1, '#276876');
  context.fillStyle = nucleus;
  context.beginPath();
  context.arc(point.x, point.y, baseRadius * 0.5, 0, Math.PI * 2);
  context.fill();
  if (selected) {
    context.beginPath();
    context.arc(point.x, point.y, baseRadius * 2.05, 0, Math.PI * 2);
    context.strokeStyle = '#ffc66d';
    context.lineWidth = 1.8;
    context.shadowColor = '#ffc66d';
    context.shadowBlur = 12;
    context.stroke();
  }
  if (labels && selected) {
    context.fillStyle = '#eaf8f4';
    context.font = '10px SFMono-Regular, monospace';
    context.textAlign = 'center';
    context.fillText(atom.label, point.x, point.y - baseRadius * 2.5);
  }
  context.restore();
}

function drawGhostDensity(context: CanvasRenderingContext2D, point: ProjectedPoint) {
  context.save();
  context.globalAlpha = 0.34;
  context.strokeStyle = '#79a7ff';
  context.setLineDash([2, 3]);
  context.beginPath();
  context.arc(point.x, point.y, 7 * point.scale, 0, Math.PI * 2);
  context.stroke();
  context.restore();
}

function drawVectorArrow(
  context: CanvasRenderingContext2D,
  project: (position: Vector3) => ProjectedPoint,
  origin: Vector3,
  vector: Vector3,
  color: string,
  worldLength: number,
) {
  const length = magnitude(vector);
  if (length < 1e-12) return;
  const start = project(origin);
  const end = project(add(origin, scale(vector, worldLength / length)));
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  context.save();
  context.strokeStyle = color;
  context.fillStyle = color;
  context.lineWidth = 2;
  drawLine(context, start, end);
  context.beginPath();
  context.moveTo(end.x, end.y);
  context.lineTo(end.x - Math.cos(angle - Math.PI / 6) * 7, end.y - Math.sin(angle - Math.PI / 6) * 7);
  context.lineTo(end.x - Math.cos(angle + Math.PI / 6) * 7, end.y - Math.sin(angle + Math.PI / 6) * 7);
  context.closePath();
  context.fill();
  context.restore();
}

function createProjection(vertices: ReadonlyArray<Vector3>, width: number, height: number, camera: MolecularCamera) {
  const center = scale(vertices.reduce(add, { x: 0, y: 0, z: 0 }), 1 / vertices.length);
  const radius = Math.max(...vertices.map((vertex) => magnitude(subtract(vertex, center))));
  const pixelsPerAngstrom = Math.min(width, height) * 0.38 / radius * camera.zoom;
  const focalDistance = radius * 5.2;
  const project = (position: Vector3): ProjectedPoint => {
    const centered = subtract(position, center);
    const yawed = rotateY(centered, camera.yaw);
    const pitched = rotateX(yawed, camera.pitch);
    const perspective = clamp(focalDistance / (focalDistance + pitched.z), 0.6, 1.75);
    return {
      x: width / 2 + pitched.x * pixelsPerAngstrom * perspective,
      y: height / 2 - pitched.y * pixelsPerAngstrom * perspective,
      depth: pitched.z,
      scale: perspective,
    };
  };
  return { project };
}

function sizeCanvas(canvas: HTMLCanvasElement, context: CanvasRenderingContext2D) {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
  const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function drawLine(context: CanvasRenderingContext2D, start: ProjectedPoint, end: ProjectedPoint) {
  context.beginPath();
  context.moveTo(start.x, start.y);
  context.lineTo(end.x, end.y);
  context.stroke();
}

function rotateY(vector: Vector3, angle: number): Vector3 {
  const cosine = Math.cos(angle); const sine = Math.sin(angle);
  return { x: vector.x * cosine + vector.z * sine, y: vector.y, z: -vector.x * sine + vector.z * cosine };
}
function rotateX(vector: Vector3, angle: number): Vector3 {
  const cosine = Math.cos(angle); const sine = Math.sin(angle);
  return { x: vector.x, y: vector.y * cosine - vector.z * sine, z: vector.y * sine + vector.z * cosine };
}
function add(left: Vector3, right: Vector3): Vector3 { return { x: left.x + right.x, y: left.y + right.y, z: left.z + right.z }; }
function subtract(left: Vector3, right: Vector3): Vector3 { return { x: left.x - right.x, y: left.y - right.y, z: left.z - right.z }; }
function scale(vector: Vector3, factor: number): Vector3 { return { x: vector.x * factor, y: vector.y * factor, z: vector.z * factor }; }
function magnitude(vector: Vector3) { return Math.hypot(vector.x, vector.y, vector.z); }
function clamp(value: number, minimum: number, maximum: number) { return Math.max(minimum, Math.min(maximum, value)); }
