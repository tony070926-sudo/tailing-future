import type { Vector3 } from '../molecular/molecular-interactions.ts';
import { PeriodicCell, type Int3, type WrappedPeriodicPosition } from './periodic-cell.ts';

/**
 * Deterministic distance-constraint projection under periodic boundaries.
 * This module is not a complete Velocity Verlet/RATTLE integrator and does not
 * yet account for constraint impulses in an energy or work audit.
 */

export type RigidConstraintAtom = Readonly<{
  id: string;
  massDalton: number;
  position: WrappedPeriodicPosition;
  velocityAngstromPerPicosecond: Vector3;
}>;

export type RigidDistanceConstraint = Readonly<{
  id: string;
  atomAId: string;
  atomBId: string;
  distanceAngstrom: number;
}>;

export type RigidConstraintOptions = Readonly<{
  positionToleranceAngstrom: number;
  velocityDerivativeToleranceAngstrom2PerPicosecond: number;
  maximumIterations: number;
  momentumToleranceDaltonAngstromPerPicosecond: number;
  centerOfMassPositionToleranceAngstrom: number;
}>;

export type ShakeConstraintResult = Readonly<{
  atoms: ReadonlyArray<RigidConstraintAtom>;
  iterations: number;
  maximumPositionResidualAngstrom: number;
  maximumCenterOfMassPositionChangeAngstrom: number;
  constraintOrder: ReadonlyArray<string>;
}>;

export type RattleConstraintResult = Readonly<{
  atoms: ReadonlyArray<RigidConstraintAtom>;
  iterations: number;
  maximumVelocityDerivativeResidualAngstrom2PerPicosecond: number;
  centerOfMassMomentumChangeDaltonAngstromPerPicosecond: number;
  constraintOrder: ReadonlyArray<string>;
}>;

export type ShakeRattleConstraintResult = Readonly<{
  atoms: ReadonlyArray<RigidConstraintAtom>;
  shakeIterations: number;
  rattleIterations: number;
  maximumPositionResidualAngstrom: number;
  maximumCenterOfMassPositionChangeAngstrom: number;
  maximumVelocityDerivativeResidualAngstrom2PerPicosecond: number;
  centerOfMassMomentumChangeDaltonAngstromPerPicosecond: number;
  constraintOrder: ReadonlyArray<string>;
}>;

const DEFAULT_OPTIONS: RigidConstraintOptions = Object.freeze({
  positionToleranceAngstrom: 1e-10,
  velocityDerivativeToleranceAngstrom2PerPicosecond: 1e-10,
  maximumIterations: 1_000,
  momentumToleranceDaltonAngstromPerPicosecond: 1e-10,
  centerOfMassPositionToleranceAngstrom: 1e-10,
});
export const MAXIMUM_RIGID_CONSTRAINT_ATOMS = 100_000;
export const MAXIMUM_RIGID_DISTANCE_CONSTRAINTS = 200_000;
export const MAXIMUM_RIGID_CONSTRAINT_ITERATIONS = 1_000_000;
export const MAXIMUM_RIGID_CONSTRAINT_WORK_UNITS = 10_000_000;
const STABLE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const MINIMUM_RESOLVABLE_DISTANCE_ANGSTROM = 1e-14;

/**
 * Mass-weighted SHAKE position projection for fixed pair distances under PBC.
 * This is a constraint kernel only: it does not select a water model, force
 * field, integration time step or thermodynamic ensemble.
 */
export function applyShakePositionConstraints(
  cell: PeriodicCell,
  atoms: ReadonlyArray<RigidConstraintAtom>,
  constraints: ReadonlyArray<RigidDistanceConstraint>,
  options: Partial<RigidConstraintOptions> = {},
): ShakeConstraintResult {
  const prepared = prepare(cell, atoms, constraints, options);
  const mutable = cloneAtoms(prepared.atoms);
  const initialCentersOfMass = componentCentersOfMass(cell, mutable, prepared.constraints);
  let maximumResidual = maximumPositionResidual(cell, mutable, prepared.constraints);
  if (maximumResidual <= prepared.options.positionToleranceAngstrom) {
    const centerOfMassChange = assertCenterOfMassPositionConservation(
      cell,
      mutable,
      prepared.constraints,
      initialCentersOfMass,
      prepared.options.centerOfMassPositionToleranceAngstrom,
    );
    return freezeShake(mutable, 0, maximumResidual, centerOfMassChange, prepared.constraintOrder);
  }

  for (let iteration = 1; iteration <= prepared.options.maximumIterations; iteration += 1) {
    const lifted = consistentLiftedCartesian(cell, mutable, prepared.constraints);
    const liftedPositions = lifted.cartesianByAtom;
    for (const constraint of prepared.constraints) {
      const atomA = mutable[constraint.atomAIndex];
      const atomB = mutable[constraint.atomBIndex];
      const displacement = subtract(
        liftedPositions[constraint.atomBIndex],
        liftedPositions[constraint.atomAIndex],
      );
      const pairDistance = magnitude(displacement);
      assertResolvablePair(pairDistance, constraint.id);
      const residual = pairDistance - constraint.distanceAngstrom;
      if (Math.abs(residual) <= prepared.options.positionToleranceAngstrom) continue;

      const inverseMassA = 1 / atomA.massDalton;
      const inverseMassB = 1 / atomB.massDalton;
      const inverseMassSum = inverseMassA + inverseMassB;
      const distanceSquared = pairDistance * pairDistance;
      const constraintValue = distanceSquared - constraint.distanceAngstrom * constraint.distanceAngstrom;
      const denominator = 2 * inverseMassSum * distanceSquared;
      if (!(Number.isFinite(denominator) && denominator > 0)) {
        throw new Error(`SHAKE constraint ${constraint.id} has a singular mass-distance denominator`);
      }
      const lagrangeMultiplier = constraintValue / denominator;
      liftedPositions[constraint.atomAIndex] = add(
        liftedPositions[constraint.atomAIndex],
        scale(displacement, inverseMassA * lagrangeMultiplier),
      );
      liftedPositions[constraint.atomBIndex] = add(
        liftedPositions[constraint.atomBIndex],
        scale(displacement, -inverseMassB * lagrangeMultiplier),
      );
    }

    storeLocalLiftedCartesian(cell, mutable, lifted);

    maximumResidual = maximumPositionResidual(cell, mutable, prepared.constraints);
    if (maximumResidual <= prepared.options.positionToleranceAngstrom) {
      const centerOfMassChange = assertCenterOfMassPositionConservation(
        cell,
        mutable,
        prepared.constraints,
        initialCentersOfMass,
        prepared.options.centerOfMassPositionToleranceAngstrom,
      );
      return freezeShake(mutable, iteration, maximumResidual, centerOfMassChange, prepared.constraintOrder);
    }
  }

  throw new Error(
    `SHAKE constraints did not converge after ${prepared.options.maximumIterations} iterations; maximum position residual ${maximumResidual}`,
  );
}

/**
 * Mass-weighted RATTLE projection enforcing d(|r_ij|^2)/dt = 2 r_ij·v_ij = 0.
 * Every pair impulse is equal and opposite, so total COM linear momentum is
 * preserved apart from bounded floating-point roundoff.
 */
export function applyRattleVelocityConstraints(
  cell: PeriodicCell,
  atoms: ReadonlyArray<RigidConstraintAtom>,
  constraints: ReadonlyArray<RigidDistanceConstraint>,
  options: Partial<RigidConstraintOptions> = {},
): RattleConstraintResult {
  const prepared = prepare(cell, atoms, constraints, options);
  const mutable = cloneAtoms(prepared.atoms);
  const positionResidual = maximumPositionResidual(cell, mutable, prepared.constraints);
  if (positionResidual > prepared.options.positionToleranceAngstrom) {
    throw new Error(`RATTLE requires SHAKE-converged positions; maximum position residual ${positionResidual}`);
  }
  const initialMomentum = totalMomentum(mutable);
  assertFiniteVector(initialMomentum, 'initial total momentum');
  let maximumResidual = maximumVelocityDerivativeResidual(cell, mutable, prepared.constraints);
  if (maximumResidual <= prepared.options.velocityDerivativeToleranceAngstrom2PerPicosecond) {
    return freezeRattle(mutable, 0, maximumResidual, 0, prepared.constraintOrder);
  }

  for (let iteration = 1; iteration <= prepared.options.maximumIterations; iteration += 1) {
    const liftedPositions = consistentLiftedCartesian(cell, mutable, prepared.constraints).cartesianByAtom;
    for (const constraint of prepared.constraints) {
      const atomA = mutable[constraint.atomAIndex];
      const atomB = mutable[constraint.atomBIndex];
      const displacement = subtract(
        liftedPositions[constraint.atomBIndex],
        liftedPositions[constraint.atomAIndex],
      );
      const pairDistance = magnitude(displacement);
      assertResolvablePair(pairDistance, constraint.id);
      const relativeVelocity = subtract(
        atomB.velocityAngstromPerPicosecond,
        atomA.velocityAngstromPerPicosecond,
      );
      const derivativeResidual = dot(displacement, relativeVelocity);
      if (Math.abs(derivativeResidual)
        <= prepared.options.velocityDerivativeToleranceAngstrom2PerPicosecond) continue;

      const inverseMassA = 1 / atomA.massDalton;
      const inverseMassB = 1 / atomB.massDalton;
      const denominator = (inverseMassA + inverseMassB) * pairDistance * pairDistance;
      if (!(Number.isFinite(denominator) && denominator > 0)) {
        throw new Error(`RATTLE constraint ${constraint.id} has a singular mass-distance denominator`);
      }
      const lagrangeVelocity = derivativeResidual / denominator;
      const impulseDirection = scale(displacement, lagrangeVelocity);
      atomA.velocityAngstromPerPicosecond = add(
        atomA.velocityAngstromPerPicosecond,
        scale(impulseDirection, inverseMassA),
      );
      atomB.velocityAngstromPerPicosecond = add(
        atomB.velocityAngstromPerPicosecond,
        scale(impulseDirection, -inverseMassB),
      );
    }

    maximumResidual = maximumVelocityDerivativeResidual(cell, mutable, prepared.constraints);
    if (maximumResidual <= prepared.options.velocityDerivativeToleranceAngstrom2PerPicosecond) {
      const momentumChange = magnitude(subtract(totalMomentum(mutable), initialMomentum));
      if (momentumChange > prepared.options.momentumToleranceDaltonAngstromPerPicosecond) {
        throw new Error(`RATTLE changed COM momentum by ${momentumChange}, above the explicit tolerance`);
      }
      return freezeRattle(mutable, iteration, maximumResidual, momentumChange, prepared.constraintOrder);
    }
  }

  throw new Error(
    `RATTLE constraints did not converge after ${prepared.options.maximumIterations} iterations; maximum velocity derivative residual ${maximumResidual}`,
  );
}

export function applyShakeRattleConstraints(
  cell: PeriodicCell,
  atoms: ReadonlyArray<RigidConstraintAtom>,
  constraints: ReadonlyArray<RigidDistanceConstraint>,
  options: Partial<RigidConstraintOptions> = {},
): ShakeRattleConstraintResult {
  const resolvedOptions = validateOptions({ ...DEFAULT_OPTIONS, ...options });
  assertWorkUnitBound(atoms.length, constraints.length, resolvedOptions.maximumIterations, 2);
  const shake = applyShakePositionConstraints(cell, atoms, constraints, options);
  const rattle = applyRattleVelocityConstraints(cell, shake.atoms, constraints, options);
  return Object.freeze({
    atoms: rattle.atoms,
    shakeIterations: shake.iterations,
    rattleIterations: rattle.iterations,
    maximumPositionResidualAngstrom: shake.maximumPositionResidualAngstrom,
    maximumCenterOfMassPositionChangeAngstrom: shake.maximumCenterOfMassPositionChangeAngstrom,
    maximumVelocityDerivativeResidualAngstrom2PerPicosecond:
      rattle.maximumVelocityDerivativeResidualAngstrom2PerPicosecond,
    centerOfMassMomentumChangeDaltonAngstromPerPicosecond:
      rattle.centerOfMassMomentumChangeDaltonAngstromPerPicosecond,
    constraintOrder: shake.constraintOrder,
  });
}

type MutableAtom = {
  id: string;
  massDalton: number;
  position: WrappedPeriodicPosition;
  velocityAngstromPerPicosecond: Vector3;
};

type IndexedConstraint = RigidDistanceConstraint & Readonly<{
  atomAIndex: number;
  atomBIndex: number;
}>;

function prepare(
  cell: PeriodicCell,
  atoms: ReadonlyArray<RigidConstraintAtom>,
  constraints: ReadonlyArray<RigidDistanceConstraint>,
  optionOverrides: Partial<RigidConstraintOptions>,
) {
  if (!(cell instanceof PeriodicCell)) throw new TypeError('rigid constraints require a PeriodicCell');
  if (!Array.isArray(atoms) || atoms.length < 2) throw new TypeError('rigid constraints require at least two atoms');
  if (!Array.isArray(constraints) || constraints.length < 1) throw new TypeError('rigid constraints require at least one distance constraint');
  if (atoms.length > MAXIMUM_RIGID_CONSTRAINT_ATOMS) {
    throw new Error(`rigid constraint atom count exceeds ${MAXIMUM_RIGID_CONSTRAINT_ATOMS}`);
  }
  if (constraints.length > MAXIMUM_RIGID_DISTANCE_CONSTRAINTS) {
    throw new Error(`rigid distance constraint count exceeds ${MAXIMUM_RIGID_DISTANCE_CONSTRAINTS}`);
  }
  const options = validateOptions({ ...DEFAULT_OPTIONS, ...optionOverrides });
  assertWorkUnitBound(atoms.length, constraints.length, options.maximumIterations, 1);
  const atomIndex = new Map<string, number>();
  const canonicalAtoms = atoms.map((atom, index) => {
    assertStableToken(atom.id, 'atom id');
    if (atomIndex.has(atom.id)) throw new Error(`duplicate rigid-constraint atom id: ${atom.id}`);
    atomIndex.set(atom.id, index);
    if (!(Number.isFinite(atom.massDalton) && atom.massDalton > 0
      && Number.isFinite(1 / atom.massDalton) && 1 / atom.massDalton > 0)) {
      throw new Error(`atom ${atom.id} mass and inverse mass must be finite and positive`);
    }
    assertFiniteVector(atom.velocityAngstromPerPicosecond, `atom ${atom.id} velocity`);
    assertFiniteVector(
      scale(atom.velocityAngstromPerPicosecond, atom.massDalton),
      `atom ${atom.id} momentum`,
    );
    cell.wrappedCartesian(atom.position);
    cell.unwrappedCartesian(atom.position);
    return cloneAtom(atom);
  });

  const constraintIds = new Set<string>();
  const pairIds = new Set<string>();
  const indexed = constraints.map((constraint) => {
    assertStableToken(constraint.id, 'constraint id');
    if (constraintIds.has(constraint.id)) throw new Error(`duplicate rigid constraint id: ${constraint.id}`);
    constraintIds.add(constraint.id);
    assertStableToken(constraint.atomAId, `constraint ${constraint.id} atomAId`);
    assertStableToken(constraint.atomBId, `constraint ${constraint.id} atomBId`);
    if (constraint.atomAId === constraint.atomBId) throw new Error(`constraint ${constraint.id} cannot constrain an atom to itself`);
    const atomAIndex = atomIndex.get(constraint.atomAId);
    const atomBIndex = atomIndex.get(constraint.atomBId);
    if (atomAIndex === undefined || atomBIndex === undefined) throw new Error(`constraint ${constraint.id} references an unknown atom`);
    if (!(Number.isFinite(constraint.distanceAngstrom) && constraint.distanceAngstrom > 0
      && constraint.distanceAngstrom < cell.minimumImageRadiusAngstrom)) {
      throw new Error(`constraint ${constraint.id} distance must be positive and below the cell minimum-image radius`);
    }
    const pairId = [constraint.atomAId, constraint.atomBId].sort(compareAscii).join('\0');
    if (pairIds.has(pairId)) throw new Error(`duplicate rigid atom pair in constraint ${constraint.id}`);
    pairIds.add(pairId);
    return Object.freeze({ ...constraint, atomAIndex, atomBIndex });
  }).sort(compareConstraints);

  const liftedPositions = consistentLiftedCartesian(cell, canonicalAtoms, indexed).cartesianByAtom;
  for (const constraint of indexed) {
    const distance = magnitude(subtract(
      liftedPositions[constraint.atomBIndex],
      liftedPositions[constraint.atomAIndex],
    ));
    assertResolvablePair(distance, constraint.id);
  }

  return {
    atoms: canonicalAtoms,
    constraints: indexed,
    constraintOrder: Object.freeze(indexed.map((constraint) => constraint.id)),
    options,
  };
}

function validateOptions(options: RigidConstraintOptions): RigidConstraintOptions {
  if (!(Number.isFinite(options.positionToleranceAngstrom) && options.positionToleranceAngstrom > 0)) {
    throw new Error('positionToleranceAngstrom must be finite and positive');
  }
  if (!(Number.isFinite(options.velocityDerivativeToleranceAngstrom2PerPicosecond)
    && options.velocityDerivativeToleranceAngstrom2PerPicosecond > 0)) {
    throw new Error('velocityDerivativeToleranceAngstrom2PerPicosecond must be finite and positive');
  }
  if (!(Number.isSafeInteger(options.maximumIterations) && options.maximumIterations >= 1
    && options.maximumIterations <= MAXIMUM_RIGID_CONSTRAINT_ITERATIONS)) {
    throw new Error(`maximumIterations must be a safe integer in [1, ${MAXIMUM_RIGID_CONSTRAINT_ITERATIONS}]`);
  }
  if (!(Number.isFinite(options.momentumToleranceDaltonAngstromPerPicosecond)
    && options.momentumToleranceDaltonAngstromPerPicosecond > 0)) {
    throw new Error('momentumToleranceDaltonAngstromPerPicosecond must be finite and positive');
  }
  if (!(Number.isFinite(options.centerOfMassPositionToleranceAngstrom)
    && options.centerOfMassPositionToleranceAngstrom > 0)) {
    throw new Error('centerOfMassPositionToleranceAngstrom must be finite and positive');
  }
  return Object.freeze({ ...options });
}

function assertWorkUnitBound(
  atomCount: number,
  constraintCount: number,
  maximumIterations: number,
  projectionPasses: number,
) {
  const workUnits = (atomCount + constraintCount) * maximumIterations * projectionPasses;
  if (!Number.isSafeInteger(workUnits) || workUnits > MAXIMUM_RIGID_CONSTRAINT_WORK_UNITS) {
    throw new Error(`rigid constraint projection exceeds ${MAXIMUM_RIGID_CONSTRAINT_WORK_UNITS} work units`);
  }
}

type ComponentCenterOfMass = Readonly<{
  anchorAtomId: string;
  positionAngstrom: Vector3;
}>;

function componentCentersOfMass(
  cell: PeriodicCell,
  atoms: ReadonlyArray<MutableAtom>,
  constraints: ReadonlyArray<IndexedConstraint>,
): ReadonlyArray<ComponentCenterOfMass> {
  const liftedPositions = consistentLiftedCartesian(cell, atoms, constraints).cartesianByAtom;
  return constraintComponents(atoms, constraints).map((component) => {
    let totalMass = 0;
    let massWeightedPosition = zero();
    for (const atomIndex of component.atomIndices) {
      const atom = atoms[atomIndex];
      totalMass += atom.massDalton;
      massWeightedPosition = add(massWeightedPosition, scale(liftedPositions[atomIndex], atom.massDalton));
    }
    const positionAngstrom = scale(massWeightedPosition, 1 / totalMass);
    assertFiniteVector(positionAngstrom, `component ${component.anchorAtomId} center of mass`);
    return Object.freeze({ anchorAtomId: component.anchorAtomId, positionAngstrom: Object.freeze(positionAngstrom) });
  });
}

function assertCenterOfMassPositionConservation(
  cell: PeriodicCell,
  atoms: ReadonlyArray<MutableAtom>,
  constraints: ReadonlyArray<IndexedConstraint>,
  initial: ReadonlyArray<ComponentCenterOfMass>,
  toleranceAngstrom: number,
) {
  const final = componentCentersOfMass(cell, atoms, constraints);
  if (initial.length !== final.length) throw new Error('SHAKE changed the number of constrained molecular components');
  let maximumChange = 0;
  for (let index = 0; index < initial.length; index += 1) {
    if (initial[index].anchorAtomId !== final[index].anchorAtomId) {
      throw new Error('SHAKE changed a constrained molecular component anchor');
    }
    maximumChange = Math.max(
      maximumChange,
      magnitude(subtract(final[index].positionAngstrom, initial[index].positionAngstrom)),
    );
  }
  if (maximumChange > toleranceAngstrom) {
    throw new Error(`SHAKE changed a mass-weighted component COM position by ${maximumChange}, above the explicit tolerance`);
  }
  return maximumChange;
}

function constraintComponents(
  atoms: ReadonlyArray<MutableAtom>,
  constraints: ReadonlyArray<IndexedConstraint>,
) {
  const adjacency = atoms.map(() => [] as number[]);
  for (const constraint of constraints) {
    adjacency[constraint.atomAIndex].push(constraint.atomBIndex);
    adjacency[constraint.atomBIndex].push(constraint.atomAIndex);
  }
  for (const neighbors of adjacency) {
    neighbors.sort((left, right) => compareAscii(atoms[left].id, atoms[right].id));
  }
  const visited = new Set<number>();
  const anchors = atoms
    .map((atom, index) => ({ atom, index }))
    .filter(({ index }) => adjacency[index].length > 0)
    .sort((left, right) => compareAscii(left.atom.id, right.atom.id));
  return anchors.flatMap(({ atom, index: anchorIndex }) => {
    if (visited.has(anchorIndex)) return [];
    visited.add(anchorIndex);
    const queue = [anchorIndex];
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      for (const neighborIndex of adjacency[queue[cursor]]) {
        if (!visited.has(neighborIndex)) {
          visited.add(neighborIndex);
          queue.push(neighborIndex);
        }
      }
    }
    queue.sort((left, right) => compareAscii(atoms[left].id, atoms[right].id));
    return [{ anchorAtomId: atom.id, atomIndices: queue }];
  });
}

function maximumPositionResidual(
  cell: PeriodicCell,
  atoms: ReadonlyArray<MutableAtom>,
  constraints: ReadonlyArray<IndexedConstraint>,
) {
  const liftedPositions = consistentLiftedCartesian(cell, atoms, constraints).cartesianByAtom;
  let maximum = 0;
  for (const constraint of constraints) {
    const distance = magnitude(subtract(
      liftedPositions[constraint.atomBIndex],
      liftedPositions[constraint.atomAIndex],
    ));
    assertResolvablePair(distance, constraint.id);
    maximum = Math.max(maximum, Math.abs(distance - constraint.distanceAngstrom));
  }
  return maximum;
}

function maximumVelocityDerivativeResidual(
  cell: PeriodicCell,
  atoms: ReadonlyArray<MutableAtom>,
  constraints: ReadonlyArray<IndexedConstraint>,
) {
  const liftedPositions = consistentLiftedCartesian(cell, atoms, constraints).cartesianByAtom;
  let maximum = 0;
  for (const constraint of constraints) {
    const atomA = atoms[constraint.atomAIndex];
    const atomB = atoms[constraint.atomBIndex];
    const displacement = subtract(
      liftedPositions[constraint.atomBIndex],
      liftedPositions[constraint.atomAIndex],
    );
    assertResolvablePair(magnitude(displacement), constraint.id);
    const relativeVelocity = subtract(
      atomB.velocityAngstromPerPicosecond,
      atomA.velocityAngstromPerPicosecond,
    );
    maximum = Math.max(maximum, Math.abs(dot(displacement, relativeVelocity)));
  }
  return maximum;
}

type LiftEdge = Readonly<{
  neighborIndex: number;
  imageShiftForNeighbor: Int3;
  constraintId: string;
}>;

type LocalLiftedCartesian = Readonly<{
  cartesianByAtom: Vector3[];
  /** One exact integer gauge per constrained component; undefined means unconstrained. */
  componentImageGaugeByAtom: Array<Int3 | undefined>;
}>;

/**
 * Builds one graph-consistent integer image lift per connected constraint
 * component. The ASCII-smallest atom id anchors each component to its current
 * image. Independent per-edge minimum images are accepted only when every
 * cycle closes to the same integer lift.
 */
function consistentLiftedCartesian(
  cell: PeriodicCell,
  atoms: ReadonlyArray<MutableAtom>,
  constraints: ReadonlyArray<IndexedConstraint>,
): LocalLiftedCartesian {
  const adjacency = atoms.map(() => [] as LiftEdge[]);
  for (const constraint of constraints) {
    const atomA = atoms[constraint.atomAIndex];
    const atomB = atoms[constraint.atomBIndex];
    const imageShiftForB = cell.minimumImageFromFractional(
      atomA.position.wrappedFractional,
      atomB.position.wrappedFractional,
    ).imageShiftForTarget;
    adjacency[constraint.atomAIndex].push({
      neighborIndex: constraint.atomBIndex,
      imageShiftForNeighbor: imageShiftForB,
      constraintId: constraint.id,
    });
    adjacency[constraint.atomBIndex].push({
      neighborIndex: constraint.atomAIndex,
      imageShiftForNeighbor: negateInt3(imageShiftForB),
      constraintId: constraint.id,
    });
  }
  for (const edges of adjacency) {
    edges.sort((left, right) => compareAscii(atoms[left.neighborIndex].id, atoms[right.neighborIndex].id)
      || compareAscii(left.constraintId, right.constraintId));
  }

  const relativeLifts: Array<Int3 | undefined> = new Array(atoms.length);
  const componentImageGaugeByAtom: Array<Int3 | undefined> = new Array(atoms.length);
  const anchors = atoms
    .map((atom, index) => ({ atom, index }))
    .filter(({ index }) => adjacency[index].length > 0)
    .sort((left, right) => compareAscii(left.atom.id, right.atom.id));
  for (const { index: anchorIndex } of anchors) {
    if (relativeLifts[anchorIndex]) continue;
    relativeLifts[anchorIndex] = { x: 0, y: 0, z: 0 };
    const componentImageGauge = cloneInt3(atoms[anchorIndex].position.image);
    componentImageGaugeByAtom[anchorIndex] = componentImageGauge;
    const queue = [anchorIndex];
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const currentIndex = queue[cursor];
      const currentLift = relativeLifts[currentIndex];
      if (!currentLift) throw new Error('internal rigid-constraint lift traversal lost its current image');
      for (const edge of adjacency[currentIndex]) {
        const expected = addInt3(currentLift, edge.imageShiftForNeighbor);
        const existing = relativeLifts[edge.neighborIndex];
        if (existing && !equalInt3(existing, expected)) {
          throw new Error(
            `constraint ${edge.constraintId} closes an inconsistent periodic image loop in the component anchored at ${atoms[anchorIndex].id}`,
          );
        }
        if (!existing) {
          relativeLifts[edge.neighborIndex] = expected;
          componentImageGaugeByAtom[edge.neighborIndex] = componentImageGauge;
          queue.push(edge.neighborIndex);
        }
      }
    }
  }

  return {
    // Keep all floating-point work in a bounded, origin-free local lattice
    // frame. Absolute image counters can approach 1e9 and must never be added
    // to fractional coordinates before the constraint residual is resolved.
    cartesianByAtom: atoms.map((atom, index) => cell.latticeVector(add(
      atom.position.wrappedFractional,
      relativeLifts[index] ?? { x: 0, y: 0, z: 0 },
    ))),
    componentImageGaugeByAtom,
  };
}

function storeLocalLiftedCartesian(
  cell: PeriodicCell,
  atoms: MutableAtom[],
  lifted: LocalLiftedCartesian,
) {
  for (let atomIndex = 0; atomIndex < atoms.length; atomIndex += 1) {
    const componentGauge = lifted.componentImageGaugeByAtom[atomIndex];
    if (!componentGauge) continue;
    const localFractional = cell.cartesianVectorToFractional(lifted.cartesianByAtom[atomIndex]);
    const localWrapped = cell.wrapFractional(localFractional);
    atoms[atomIndex].position = {
      wrappedFractional: localWrapped.wrappedFractional,
      image: addInt3(componentGauge, localWrapped.image),
    };
  }
}

function totalMomentum(atoms: ReadonlyArray<MutableAtom>) {
  return atoms.reduce((sum, atom) => add(sum, scale(atom.velocityAngstromPerPicosecond, atom.massDalton)), zero());
}

function cloneAtoms(atoms: ReadonlyArray<RigidConstraintAtom>): MutableAtom[] {
  return atoms.map(cloneAtom);
}

function cloneAtom(atom: RigidConstraintAtom): MutableAtom {
  return {
    id: atom.id,
    massDalton: atom.massDalton,
    position: {
      wrappedFractional: { ...atom.position.wrappedFractional },
      image: { ...atom.position.image },
    },
    velocityAngstromPerPicosecond: { ...atom.velocityAngstromPerPicosecond },
  };
}

function freezeAtoms(atoms: ReadonlyArray<MutableAtom>): ReadonlyArray<RigidConstraintAtom> {
  return Object.freeze(atoms.map((atom) => Object.freeze({
    id: atom.id,
    massDalton: atom.massDalton,
    position: Object.freeze({
      wrappedFractional: Object.freeze({ ...atom.position.wrappedFractional }),
      image: Object.freeze({ ...atom.position.image }),
    }),
    velocityAngstromPerPicosecond: Object.freeze({ ...atom.velocityAngstromPerPicosecond }),
  })));
}

function freezeShake(
  atoms: ReadonlyArray<MutableAtom>,
  iterations: number,
  maximumResidual: number,
  maximumCenterOfMassPositionChangeAngstrom: number,
  constraintOrder: ReadonlyArray<string>,
): ShakeConstraintResult {
  return Object.freeze({
    atoms: freezeAtoms(atoms),
    iterations,
    maximumPositionResidualAngstrom: maximumResidual,
    maximumCenterOfMassPositionChangeAngstrom,
    constraintOrder,
  });
}

function freezeRattle(
  atoms: ReadonlyArray<MutableAtom>,
  iterations: number,
  maximumResidual: number,
  momentumChange: number,
  constraintOrder: ReadonlyArray<string>,
): RattleConstraintResult {
  return Object.freeze({
    atoms: freezeAtoms(atoms),
    iterations,
    maximumVelocityDerivativeResidualAngstrom2PerPicosecond: maximumResidual,
    centerOfMassMomentumChangeDaltonAngstromPerPicosecond: momentumChange,
    constraintOrder,
  });
}

function compareConstraints(left: IndexedConstraint, right: IndexedConstraint) {
  const leftPair = [left.atomAId, left.atomBId].sort(compareAscii);
  const rightPair = [right.atomAId, right.atomBId].sort(compareAscii);
  return compareAscii(leftPair[0], rightPair[0])
    || compareAscii(leftPair[1], rightPair[1])
    || compareAscii(left.id, right.id);
}

function compareAscii(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function cloneInt3(value: Int3): Int3 {
  return { x: value.x, y: value.y, z: value.z };
}

function negateInt3(value: Int3): Int3 {
  return { x: -value.x, y: -value.y, z: -value.z };
}

function addInt3(left: Int3, right: Int3): Int3 {
  const result = { x: left.x + right.x, y: left.y + right.y, z: left.z + right.z };
  if (![result.x, result.y, result.z].every(Number.isSafeInteger)) {
    throw new Error('rigid-constraint molecular image lift exceeded the safe integer domain');
  }
  return result;
}

function equalInt3(left: Int3, right: Int3) {
  return left.x === right.x && left.y === right.y && left.z === right.z;
}

function assertStableToken(value: string, label: string) {
  if (typeof value !== 'string' || !STABLE_TOKEN.test(value)) throw new Error(`${label} must be a stable ASCII token`);
}

function assertResolvablePair(distanceAngstrom: number, constraintId: string) {
  if (!(Number.isFinite(distanceAngstrom) && distanceAngstrom > MINIMUM_RESOLVABLE_DISTANCE_ANGSTROM)) {
    throw new Error(`constraint ${constraintId} has coincident or non-finite atom positions`);
  }
}

function assertFiniteVector(vector: Vector3, label: string) {
  if (!vector || ![vector.x, vector.y, vector.z].every(Number.isFinite)) {
    throw new Error(`${label} must contain finite x, y and z components`);
  }
}

function zero(): Vector3 {
  return { x: 0, y: 0, z: 0 };
}

function add(left: Vector3, right: Vector3): Vector3 {
  return { x: left.x + right.x, y: left.y + right.y, z: left.z + right.z };
}

function subtract(left: Vector3, right: Vector3): Vector3 {
  return { x: left.x - right.x, y: left.y - right.y, z: left.z - right.z };
}

function scale(vector: Vector3, scalar: number): Vector3 {
  return { x: vector.x * scalar, y: vector.y * scalar, z: vector.z * scalar };
}

function dot(left: Vector3, right: Vector3) {
  return left.x * right.x + left.y * right.y + left.z * right.z;
}

function magnitude(vector: Vector3) {
  return Math.sqrt(dot(vector, vector));
}
