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
import {
  deriveMolecularReferenceGeometry,
  type CoordinationEdge,
  type WaterDonorAcceptorAxisGuide,
  type WaterValenceFrame,
} from './molecular-visual-guides';
import type { MolecularObservationV04 } from '@/lib/simulation/molecular-world';

export type MolecularCamera = Readonly<{ yaw: number; pitch: number; zoom: number }>;

export type MolecularVisualLayers = Readonly<{
  labels: boolean;
  bonds: boolean;
  unitCell: boolean;
  interactions: boolean;
  pairForces: boolean;
  netForce: boolean;
  trajectories: boolean;
  velocities: boolean;
  valenceDirections: boolean;
  hybridizationGuide: boolean;
  bondAxisGuide: boolean;
  donorAcceptorAxisGuide: boolean;
}>;

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
  layers,
  onCameraChange,
  onAtomSelect,
  onAnnouncement,
  trajectoryFrames = [],
  projectionReferenceFrame,
}: {
  scene: MolecularScene;
  camera: MolecularCamera;
  selectedAtomId: string;
  layers: MolecularVisualLayers;
  onCameraChange: (camera: MolecularCamera) => void;
  onAtomSelect: (atomId: string) => void;
  onAnnouncement: (message: string) => void;
  trajectoryFrames?: ReadonlyArray<MolecularObservationV04>;
  projectionReferenceFrame?: MolecularObservationV04;
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
      layers,
      trajectoryFrames,
      projectionReferenceFrame,
    );
  }, [camera, layers, projectionReferenceFrame, scene, selectedAtomId, trajectoryFrames]);

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
      if (!event.ctrlKey && !event.metaKey) return;
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
      onLostPointerCapture={cancelGesture}
      onKeyDown={handleKeyboard}
      aria-label={`${scene.name}的真实 x/y/z 结构视图。拖动旋转，Control 或 Command 加滚轮、或加减键缩放，点击选择原子或离子，方向键调整视角，数字零复位。`}
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
  layers: MolecularVisualLayers,
  trajectoryFrames: ReadonlyArray<MolecularObservationV04>,
  projectionReferenceFrame?: MolecularObservationV04,
) {
  context.clearRect(0, 0, width, height);
  context.fillStyle = '#f2f7f3';
  context.fillRect(0, 0, width, height);
  drawBackdrop(context, width, height);

  const referencePositions = (projectionReferenceFrame ?? trajectoryFrames[0])?.atoms
    .map((atom) => atom.positionAngstrom);
  const projection = createProjection(scene, width, height, camera, referencePositions);
  const atomById = new Map(scene.atoms.map((atom) => [atom.id, atom]));
  const projectedAtoms = scene.atoms.map((atom) => {
    const point = projection.project(atom.positionAngstrom);
    return {
      atom,
      point,
      radius: Math.max(4, atom.displayRadiusAngstrom * projection.pixelsPerAngstrom * point.scale),
    };
  }).sort((first, second) => second.point.depth - first.point.depth);

  if (layers.trajectories && trajectoryFrames.length > 1) {
    drawSolverTrajectory(context, trajectoryFrames, selectedAtomId, projection.project);
  }

  if (scene.unitCell && layers.unitCell) {
    drawUnitCell(context, scene.unitCell.originAngstrom, scene.unitCell.edgeAngstrom, projection.project);
  }

  const referenceGeometry = deriveMolecularReferenceGeometry(scene);
  const waterValenceFrames = referenceGeometry.waterValenceFrames;
  if (layers.valenceDirections) drawWaterValenceDirections(context, waterValenceFrames, projection.project);
  if (layers.hybridizationGuide) drawWaterHybridizationGuide(context, waterValenceFrames, projection.project);
  if (layers.bondAxisGuide) drawWaterBondAxisGuide(context, scene, atomById, projection.project);
  if (layers.donorAcceptorAxisGuide) {
    drawWaterDonorAcceptorAxisGuide(context, referenceGeometry.waterDonorAcceptorAxis, projection.project);
  }

  if (scene.kind === 'nacl-rocksalt' && layers.interactions) {
    drawCoordinationPolyhedron(context, referenceGeometry.coordinationEdges, atomById, projection.project);
  }

  if (layers.bonds) {
    scene.bonds.forEach((bond) => {
      const atomA = atomById.get(bond.atomAId);
      const atomB = atomById.get(bond.atomBId);
      if (!atomA || !atomB) return;
      drawBondCylinder(context, projection.project(atomA.positionAngstrom), projection.project(atomB.positionAngstrom));
    });
  }

  if (layers.interactions) {
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

  if (layers.pairForces || layers.netForce) {
    const selected = atomById.get(selectedAtomId);
    if (selected) {
      if (layers.pairForces) drawPairForceArrows(context, scene, selected, projection.project);
      if (layers.netForce) drawNetForceArrow(context, scene, selected, projection.project);
    }
  }

  if (layers.velocities && trajectoryFrames.length > 0) {
    const dynamicAtom = trajectoryFrames.at(-1)?.atoms.find((atom) => atom.id === selectedAtomId);
    const selected = atomById.get(selectedAtomId);
    if (dynamicAtom && selected) {
      drawVelocityArrow(context, selected, dynamicAtom.velocityAngstromPerPicosecond, projection.project);
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
      layers.labels && emphasized,
      emphasized ? 1 : 0.38,
    );
  });

  return projectedAtoms;
}

function createProjection(
  scene: MolecularScene,
  width: number,
  height: number,
  camera: MolecularCamera,
  referencePositions: ReadonlyArray<Vector3> = scene.atoms.map((atom) => atom.positionAngstrom),
) {
  const bounds = referencePositions.reduce((current, position) => ({
    minimum: {
      x: Math.min(current.minimum.x, position.x),
      y: Math.min(current.minimum.y, position.y),
      z: Math.min(current.minimum.z, position.z),
    },
    maximum: {
      x: Math.max(current.maximum.x, position.x),
      y: Math.max(current.maximum.y, position.y),
      z: Math.max(current.maximum.z, position.z),
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
  const radius = Math.max(1.2, ...referencePositions.map((position) => magnitude(subtract(position, center))));
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
  glow.addColorStop(0, 'rgba(70, 211, 128, .22)');
  glow.addColorStop(0.48, 'rgba(82, 198, 218, .09)');
  glow.addColorStop(1, 'rgba(242, 247, 243, 0)');
  context.fillStyle = glow;
  context.fillRect(0, 0, width, height);
  context.save();
  context.strokeStyle = 'rgba(13, 154, 81, .08)';
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
  context.strokeStyle = 'rgba(9, 139, 167, .42)';
  context.lineWidth = 1;
  edges.forEach(([start, end]) => drawLine(context, vertices[start], vertices[end]));
  context.restore();
}

function drawBondCylinder(context: CanvasRenderingContext2D, start: ProjectedPoint, end: ProjectedPoint) {
  context.save();
  context.lineCap = 'round';
  context.strokeStyle = 'rgba(14, 24, 18, .74)';
  context.lineWidth = Math.max(9, 13 * (start.scale + end.scale) / 2);
  drawLine(context, start, end);
  const gradient = context.createLinearGradient(start.x, start.y, end.x, end.y);
  gradient.addColorStop(0, '#f8fbf7');
  gradient.addColorStop(0.48, '#728078');
  gradient.addColorStop(1, '#dce5de');
  context.strokeStyle = gradient;
  context.lineWidth = Math.max(5, 8 * (start.scale + end.scale) / 2);
  drawLine(context, start, end);
  context.restore();
}

function drawGuide(context: CanvasRenderingContext2D, start: ProjectedPoint, end: ProjectedPoint, kind: string) {
  context.save();
  context.setLineDash(kind === 'hydrogen-bond-guide' ? [4, 7] : [3, 7]);
  context.strokeStyle = kind === 'hydrogen-bond-guide' ? 'rgba(8, 125, 152, .68)' : 'rgba(79, 95, 177, .44)';
  context.lineWidth = kind === 'hydrogen-bond-guide' ? 2 : 1.2;
  drawLine(context, start, end);
  context.restore();
}

function drawWaterValenceDirections(
  context: CanvasRenderingContext2D,
  frames: ReadonlyArray<WaterValenceFrame>,
  project: (position: Vector3) => ProjectedPoint,
) {
  frames.forEach((frame) => {
    frame.bondDirections.forEach((direction) => drawReferenceAxis(
      context,
      project(frame.oxygenPositionAngstrom),
      project(add(frame.oxygenPositionAngstrom, scale(direction, 0.88))),
      'rgba(6, 122, 62, .72)',
    ));
    frame.lonePairDirections.forEach((direction) => drawReferenceAxis(
      context,
      project(frame.oxygenPositionAngstrom),
      project(add(frame.oxygenPositionAngstrom, scale(direction, 0.92))),
      'rgba(79, 95, 177, .72)',
    ));
  });
}

function drawWaterHybridizationGuide(
  context: CanvasRenderingContext2D,
  frames: ReadonlyArray<WaterValenceFrame>,
  project: (position: Vector3) => ProjectedPoint,
) {
  frames.forEach((frame) => {
    frame.bondDirections.forEach((direction) => drawWireLobe(
      context,
      project(frame.oxygenPositionAngstrom),
      project(add(frame.oxygenPositionAngstrom, scale(direction, 0.72))),
      'rgba(6, 122, 62, .74)',
    ));
    frame.lonePairDirections.forEach((direction) => drawWireLobe(
      context,
      project(frame.oxygenPositionAngstrom),
      project(add(frame.oxygenPositionAngstrom, scale(direction, 0.84))),
      'rgba(79, 95, 177, .76)',
    ));
  });
}

function drawWaterBondAxisGuide(
  context: CanvasRenderingContext2D,
  scene: MolecularScene,
  atomById: ReadonlyMap<string, MolecularAtom>,
  project: (position: Vector3) => ProjectedPoint,
) {
  if (scene.kind !== 'water-dimer') return;
  scene.bonds.forEach((bond) => {
    const atomA = atomById.get(bond.atomAId);
    const atomB = atomById.get(bond.atomBId);
    if (!atomA || !atomB) return;
    drawWireOverlap(
      context,
      project(atomA.positionAngstrom),
      project(atomB.positionAngstrom),
      'rgba(8, 120, 145, .66)',
      'rgba(79, 95, 177, .62)',
    );
  });
}

function drawWaterDonorAcceptorAxisGuide(
  context: CanvasRenderingContext2D,
  guide: WaterDonorAcceptorAxisGuide | null,
  project: (position: Vector3) => ProjectedPoint,
) {
  if (!guide) return;
  const acceptor = project(guide.acceptorPositionAngstrom);
  const lonePairEnd = project(add(guide.acceptorPositionAngstrom, scale(guide.selectedLonePairDirection, 0.92)));
  const contact = project(guide.donorHydrogenPositionAngstrom);
  const donor = project(guide.donorOxygenPositionAngstrom);
  const donorAxisEnd = project(add(guide.donorHydrogenPositionAngstrom, scale(guide.donorBondDirection, 0.55)));
  context.save();
  context.setLineDash([3, 6]);
  context.strokeStyle = 'rgba(79, 95, 177, .82)';
  context.lineWidth = 1.6;
  drawLine(context, acceptor, lonePairEnd);
  context.strokeStyle = 'rgba(79, 95, 177, .32)';
  context.lineWidth = 1;
  drawLine(context, acceptor, contact);
  context.setLineDash([2, 4]);
  context.strokeStyle = 'rgba(8, 120, 145, .7)';
  drawLine(context, donor, donorAxisEnd);
  const centerX = (acceptor.x + contact.x) / 2;
  const centerY = (acceptor.y + contact.y) / 2;
  context.setLineDash([]);
  context.fillStyle = 'rgba(53, 70, 132, .94)';
  context.font = '9px SFMono-Regular, monospace';
  context.textAlign = 'center';
  context.fillText(`LP / A···H AXIS OFFSET ${guide.lonePairToContactAngleDegrees.toFixed(1)}°`, centerX, centerY - 11);
  context.fillText(
    `D–H···A ${guide.donorHydrogenAcceptorAngleDegrees.toFixed(1)}° · ${guide.axesCollinearWithinFiveDegrees ? 'AXES COLLINEAR ≤5°' : 'CURRENT AXES NOT COLLINEAR'}`,
    centerX,
    centerY + 2,
  );
  context.restore();
}

function drawCoordinationPolyhedron(
  context: CanvasRenderingContext2D,
  edges: ReadonlyArray<CoordinationEdge>,
  atomById: ReadonlyMap<string, MolecularAtom>,
  project: (position: Vector3) => ProjectedPoint,
) {
  context.save();
  context.setLineDash([4, 6]);
  context.strokeStyle = 'rgba(8, 120, 145, .25)';
  context.lineWidth = 1;
  edges.forEach((edge) => {
    const atomA = atomById.get(edge.atomAId);
    const atomB = atomById.get(edge.atomBId);
    if (atomA && atomB) drawLine(context, project(atomA.positionAngstrom), project(atomB.positionAngstrom));
  });
  context.restore();
}

function drawReferenceAxis(
  context: CanvasRenderingContext2D,
  start: ProjectedPoint,
  end: ProjectedPoint,
  color: string,
) {
  context.save();
  context.setLineDash([3, 5]);
  context.strokeStyle = color;
  context.lineWidth = 1.2;
  drawLine(context, start, end);
  context.setLineDash([]);
  context.beginPath();
  context.arc(end.x, end.y, 3, 0, Math.PI * 2);
  context.stroke();
  context.restore();
}

function drawWireLobe(
  context: CanvasRenderingContext2D,
  start: ProjectedPoint,
  end: ProjectedPoint,
  color: string,
) {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const length = Math.hypot(deltaX, deltaY);
  if (length < 2) return;
  const angle = Math.atan2(deltaY, deltaX);
  const width = Math.max(5, length * 0.2);
  context.save();
  context.translate(start.x, start.y);
  context.rotate(angle);
  context.strokeStyle = color;
  context.lineWidth = 1.3;
  context.setLineDash([4, 3]);
  context.beginPath();
  context.moveTo(0, 0);
  context.bezierCurveTo(length * 0.3, -width, length * 0.82, -width * 0.55, length, 0);
  context.bezierCurveTo(length * 0.82, width * 0.55, length * 0.3, width, 0, 0);
  context.stroke();
  context.restore();
}

function drawWireOverlap(
  context: CanvasRenderingContext2D,
  start: ProjectedPoint,
  end: ProjectedPoint,
  firstColor: string,
  secondColor: string,
) {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const length = Math.hypot(deltaX, deltaY);
  if (length < 4) return;
  const angle = Math.atan2(deltaY, deltaX);
  context.save();
  context.translate(start.x, start.y);
  context.rotate(angle);
  context.setLineDash([4, 3]);
  [
    { center: length * 0.42, radiusX: length * 0.34, color: firstColor },
    { center: length * 0.62, radiusX: length * 0.3, color: secondColor },
  ].forEach(({ center, radiusX, color }) => {
    context.strokeStyle = color;
    context.lineWidth = 1.2;
    context.beginPath();
    context.ellipse(center, 0, radiusX, Math.max(5, length * 0.16), 0, 0, Math.PI * 2);
    context.stroke();
  });
  context.restore();
}

function drawPairInfluence(context: CanvasRenderingContext2D, start: ProjectedPoint, end: ProjectedPoint, interaction: PairInteraction) {
  context.save();
  context.setLineDash([2, 9]);
  context.strokeStyle = interaction.coulombEnergyKjMol < 0 ? 'rgba(7, 153, 74, .52)' : 'rgba(166, 58, 66, .48)';
  context.lineWidth = 1.2;
  drawLine(context, start, end);
  context.restore();
}

function drawSolverTrajectory(
  context: CanvasRenderingContext2D,
  frames: ReadonlyArray<MolecularObservationV04>,
  selectedAtomId: string,
  project: (position: Vector3) => ProjectedPoint,
) {
  const points = frames
    .map((frame) => frame.atoms.find((atom) => atom.id === selectedAtomId)?.positionAngstrom)
    .filter((position): position is Vector3 => Boolean(position))
    .map(project);
  if (points.length < 2) return;
  context.save();
  context.strokeStyle = 'rgba(79, 95, 177, .62)';
  context.lineWidth = 2;
  context.setLineDash([5, 5]);
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  points.slice(1).forEach((point) => context.lineTo(point.x, point.y));
  context.stroke();
  context.setLineDash([]);
  points.forEach((point, index) => {
    if (index % Math.max(1, Math.floor(points.length / 8)) !== 0 && index !== points.length - 1) return;
    context.beginPath();
    context.arc(point.x, point.y, index === points.length - 1 ? 3.2 : 1.8, 0, Math.PI * 2);
    context.fillStyle = index === points.length - 1 ? '#4f5fb1' : 'rgba(79, 95, 177, .42)';
    context.fill();
  });
  context.restore();
}

function drawVelocityArrow(
  context: CanvasRenderingContext2D,
  atom: MolecularAtom,
  velocity: Vector3,
  project: (position: Vector3) => ProjectedPoint,
) {
  if (magnitude(velocity) < 1e-10) return;
  const endWorld = add(atom.positionAngstrom, scale(normalize(velocity), 0.72));
  drawArrow(context, project(atom.positionAngstrom), project(endWorld), '#4f5fb1', 2.2, 7);
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
    drawArrow(context, project(selected.positionAngstrom), project(endWorld), 'rgba(148, 82, 13, .82)', 1.2, 5);
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
  drawArrow(context, project(selected.positionAngstrom), project(endWorld), '#087d98', 3, 9);
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
    H: ['#ffffff', '#e7ece7', '#a8b4ab'],
    O: ['#ffd6cd', '#e96754', '#9e2e25'],
    Na: ['#d7f7fb', '#43bdd0', '#11758a'],
    Cl: ['#d1f6d9', '#4bc173', '#167840'],
  }[atom.element];
  context.save();
  context.globalAlpha = opacity;
  if (selected) {
    context.beginPath();
    context.arc(point.x, point.y, radius + 9, 0, Math.PI * 2);
    context.strokeStyle = '#087d98';
    context.lineWidth = 2;
    context.shadowColor = '#087d98';
    context.shadowBlur = 14;
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
  context.shadowBlur = selected ? 12 : 0;
  context.beginPath();
  context.arc(point.x, point.y, radius, 0, Math.PI * 2);
  context.fill();
  context.shadowBlur = 0;
  context.strokeStyle = atom.element === 'H' ? 'rgba(18, 31, 22, .55)' : 'rgba(18, 31, 22, .34)';
  context.lineWidth = 1;
  context.stroke();
  if (showLabel && (selected || atom.element !== 'H' || radius > 12)) {
    context.font = `${Math.round(clamp(radius * 0.55, 9, 15))}px SFMono-Regular, monospace`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle = '#132219';
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
