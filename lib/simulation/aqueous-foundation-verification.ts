import type { Vector3 } from '../molecular/molecular-interactions.ts';
import { AMBER14_TIP3P_PARAMETERS_V042 } from './amber14-tip3p-parameters.ts';
import { digestValue } from './digest.ts';
import { PeriodicCell, type Int3, type WrappedPeriodicPosition } from './periodic-cell.ts';
import {
  DEFAULT_EWALD_ELECTROSTATIC_CONSTANT_KJ_MOL_ANGSTROM_E2,
  evaluateDirectPeriodicEwald,
  type DirectEwaldAtomV042,
  type DirectEwaldOptionsV042,
} from './periodic-ewald.ts';
import {
  applyShakePositionConstraints,
  applyShakeRattleConstraints,
  MAXIMUM_RIGID_CONSTRAINT_ITERATIONS,
  type RigidConstraintAtom,
  type RigidDistanceConstraint,
} from './rigid-constraints.ts';

export const AQUEOUS_FOUNDATION_GATE_NAMES = Object.freeze([
  'naclRocksaltMadelung',
  'triclinicFiniteDifferenceForce',
  'alphaCutoffConsistency',
  'ewaldNonNeutralRejected',
  'ewaldRelativePermittivityRejected',
  'ewaldWorkBudgetRejected',
  'ewaldHugeImageGaugeInvariance',
  'tip3pPositionConstraints',
  'tip3pVelocityConstraints',
  'tip3pCenterOfMassPosition',
  'tip3pCenterOfMassMomentum',
  'tip3pConsistentPeriodicLoop',
  'tip3pInconsistentPeriodicLoopRejected',
  'tip3pHugeImageGaugeInvariance',
  'rigidWorkBudgetRejected',
] as const);

export type AqueousFoundationGateName = typeof AQUEOUS_FOUNDATION_GATE_NAMES[number];

export type AqueousFoundationVerificationReportV042 = Readonly<{
  schemaVersion: 'tf.aqueous-foundation-verification/0.4.2';
  status: 'foundation-only-not-reproduction';
  sourcePins: Readonly<{
    openmmTip3p: Readonly<{
      product: 'OpenMM';
      version: '8.5.1';
      repository: 'https://github.com/openmm/openmm';
      tag: '8.5.1';
      sourceCommit: 'f7fa0c27c1f8d943c339d67b3bf22f026d0bd8b5';
      pinClass: 'immutable-git-commit-path-size-and-sha256-metadata';
      assets: readonly [
        Readonly<{
          role: 'bare-tip3p-xml';
          filePath: 'wrappers/python/openmm/app/data/tip3p.xml';
          sizeBytes: 891;
          sha256: 'sha256:607f0fc9566c3770db2d9eb579fed68c4157578445eed1ec0aa7dccc23d57a6c';
          sourceUrl: 'https://github.com/openmm/openmm/blob/f7fa0c27c1f8d943c339d67b3bf22f026d0bd8b5/wrappers/python/openmm/app/data/tip3p.xml';
        }>,
        Readonly<{
          role: 'amber14-tip3p-xml';
          filePath: 'wrappers/python/openmm/app/data/amber14/tip3p.xml';
          sizeBytes: 19070;
          sha256: 'sha256:3f4b188dbcb6c02863230eaca231e927fb6bf3307ce947d8a50d0f46f6dd83d9';
          sourceUrl: 'https://github.com/openmm/openmm/blob/f7fa0c27c1f8d943c339d67b3bf22f026d0bd8b5/wrappers/python/openmm/app/data/amber14/tip3p.xml';
        }>
      ];
      executionPerformed: false;
    }>;
  }>;
  gates: Readonly<Record<AqueousFoundationGateName, boolean>>;
  naclPointChargeReference: Readonly<{
    latticeAngstrom: 5.64;
    nearestNeighborAngstrom: 2.82;
    madelungConstant: 1.7475645946331822;
    expectedCellEnergyKjMol: number;
    observedCellEnergyKjMol: number;
    absoluteEnergyErrorKjMol: number;
    netForceKjMolAngstrom: number;
  }>;
  triclinicForceCheck: Readonly<{
    centralDifferenceStepAngstrom: 1e-5;
    maximumAbsoluteForceErrorKjMolAngstrom: number;
    netForceKjMolAngstrom: number;
  }>;
  alphaCutoffCheck: Readonly<{
    referenceEnergyKjMol: number;
    looseAbsoluteErrorKjMol: number;
    mediumAbsoluteErrorKjMol: number;
    tightAbsoluteErrorKjMol: number;
    maximumAlphaAbsoluteErrorKjMol: number;
  }>;
  hugeImageGaugeCheck: Readonly<{
    ewald: Readonly<{
      commonImage: Readonly<{ x: 1000000000; y: -1000000000; z: 1000000000 }>;
      exactEvaluationEquality: boolean;
      referenceEvaluationDigest: string;
      gaugedEvaluationDigest: string;
    }>;
    rigidTip3p: Readonly<{
      commonImage: Readonly<{ x: 100000000; y: -100000000; z: 100000000 }>;
      exactNormalizedResultEquality: boolean;
      referenceResultDigest: string;
      normalizedGaugedResultDigest: string;
    }>;
  }>;
  rejectionEvidence: Readonly<{
    nonNeutral: string;
    relativePermittivity: string;
    ewaldRealWorkBudget: string;
    ewaldReciprocalWorkBudget: string;
    inconsistentPeriodicConstraintLoop: string;
    rigidWorkBudget: string;
  }>;
  tip3pConstraintFixture: Readonly<{
    cellKind: 'strongly-sheared-triclinic';
    periodicFaceCrossing: true;
    targetDistancesAngstrom: Readonly<{
      oh1: 0.9572;
      oh2: 0.9572;
      hh: 1.5139006545247014;
    }>;
    maximumPositionResidualAngstrom: number;
    maximumVelocityDerivativeResidualAngstrom2PerPicosecond: number;
    maximumCenterOfMassPositionChangeAngstrom: number;
    centerOfMassMomentumChangeDaltonAngstromPerPicosecond: number;
    shakeIterations: number;
    rattleIterations: number;
    constraintOrder: ReadonlyArray<string>;
  }>;
  boundaries: Readonly<{
    naclWaterTrajectory: false;
    pmeExecution: false;
    openmmExecution: false;
    intramolecularExclusions: false;
    virialOrStress: false;
    fullVelocityVerletRattleIntegrator: false;
    constraintImpulseEnergyAudit: false;
    licenseClearance: false;
    externalModelReproduction: false;
    scorePromotionEligible: false;
    statements: ReadonlyArray<string>;
  }>;
  verificationDigest: string;
}>;

const COULOMB = DEFAULT_EWALD_ELECTROSTATIC_CONSTANT_KJ_MOL_ANGSTROM_E2;
const TIP3P_OH_ANGSTROM = AMBER14_TIP3P_PARAMETERS_V042.rigidWaterGeometry
  .oxygenHydrogenDistanceAngstrom;
const TIP3P_HH_ANGSTROM = AMBER14_TIP3P_PARAMETERS_V042.rigidWaterGeometry
  .hydrogenHydrogenDistanceAngstrom;
const TIP3P_OXYGEN_MASS_DALTON = AMBER14_TIP3P_PARAMETERS_V042.sites.waterOxygen.massDalton;
const TIP3P_HYDROGEN_MASS_DALTON = AMBER14_TIP3P_PARAMETERS_V042.sites.waterHydrogen.massDalton;

export function runAqueousFoundationVerification(): AqueousFoundationVerificationReportV042 {
  const nacl = verifyRocksaltMadelung();
  const force = verifyTriclinicFiniteDifferenceForce();
  const convergence = verifyAlphaCutoffConsistency();
  const ewaldRejections = verifyEwaldRejections();
  const ewaldGauge = verifyEwaldHugeImageGauge();
  const rigid = verifyTip3pRigidConstraints();
  const boundaries = {
    naclWaterTrajectory: false,
    pmeExecution: false,
    openmmExecution: false,
    intramolecularExclusions: false,
    virialOrStress: false,
    fullVelocityVerletRattleIntegrator: false,
    constraintImpulseEnergyAudit: false,
    licenseClearance: false,
    externalModelReproduction: false,
    scorePromotionEligible: false,
    statements: [
      'No NaCl-water trajectory, dissolution, hydration or crystallization simulation is executed.',
      'No PME, mesh electrostatics or OpenMM runtime is executed; electrostatics evidence is the local direct Ewald reference only.',
      'No intramolecular exclusions, virial/stress, complete constrained Velocity Verlet integrator or constraint-impulse energy audit is present.',
      'The immutable OpenMM asset pins are source-integrity metadata, not runtime execution, license clearance or external-model reproduction.',
      'This foundation-only verification cannot increase a scorecard or support industrial, force-field or current-SOTA claims.',
    ],
  } as const;
  const gates = {
    naclRocksaltMadelung: nacl.absoluteEnergyErrorKjMol <= 1e-8 && nacl.netForceKjMolAngstrom <= 1e-12,
    triclinicFiniteDifferenceForce:
      force.maximumAbsoluteForceErrorKjMolAngstrom <= 5e-8 && force.netForceKjMolAngstrom <= 1e-12,
    alphaCutoffConsistency: convergence.tightAbsoluteErrorKjMol < convergence.mediumAbsoluteErrorKjMol
      && convergence.mediumAbsoluteErrorKjMol < convergence.looseAbsoluteErrorKjMol
      && convergence.tightAbsoluteErrorKjMol <= 1e-9
      && convergence.maximumAlphaAbsoluteErrorKjMol <= 1e-9,
    ewaldNonNeutralRejected: ewaldRejections.nonNeutral.accepted === false,
    ewaldRelativePermittivityRejected: ewaldRejections.relativePermittivity.accepted === false,
    ewaldWorkBudgetRejected: ewaldRejections.realWorkBudget.accepted === false
      && ewaldRejections.reciprocalWorkBudget.accepted === false,
    ewaldHugeImageGaugeInvariance: ewaldGauge.exactEvaluationEquality,
    tip3pPositionConstraints: rigid.maximumPositionResidualAngstrom <= 1e-12,
    tip3pVelocityConstraints:
      rigid.maximumVelocityDerivativeResidualAngstrom2PerPicosecond <= 1e-12,
    tip3pCenterOfMassPosition: rigid.maximumCenterOfMassPositionChangeAngstrom <= 1e-10,
    tip3pCenterOfMassMomentum:
      rigid.centerOfMassMomentumChangeDaltonAngstromPerPicosecond <= 1e-10,
    tip3pConsistentPeriodicLoop: rigid.periodicFaceCrossing && rigid.constraintOrder.length === 3,
    tip3pInconsistentPeriodicLoopRejected: rigid.inconsistentLoop.accepted === false,
    tip3pHugeImageGaugeInvariance: rigid.gauge.exactNormalizedResultEquality,
    rigidWorkBudgetRejected: rigid.workBudget.accepted === false,
  } satisfies Record<AqueousFoundationGateName, boolean>;
  const payload = {
    schemaVersion: 'tf.aqueous-foundation-verification/0.4.2' as const,
    status: 'foundation-only-not-reproduction' as const,
    sourcePins: {
      openmmTip3p: {
        product: 'OpenMM' as const,
        version: '8.5.1' as const,
        repository: 'https://github.com/openmm/openmm' as const,
        tag: '8.5.1' as const,
        sourceCommit: 'f7fa0c27c1f8d943c339d67b3bf22f026d0bd8b5' as const,
        pinClass: 'immutable-git-commit-path-size-and-sha256-metadata' as const,
        assets: [
          {
            role: 'bare-tip3p-xml' as const,
            filePath: 'wrappers/python/openmm/app/data/tip3p.xml' as const,
            sizeBytes: 891 as const,
            sha256: 'sha256:607f0fc9566c3770db2d9eb579fed68c4157578445eed1ec0aa7dccc23d57a6c' as const,
            sourceUrl: 'https://github.com/openmm/openmm/blob/f7fa0c27c1f8d943c339d67b3bf22f026d0bd8b5/wrappers/python/openmm/app/data/tip3p.xml' as const,
          },
          {
            role: 'amber14-tip3p-xml' as const,
            filePath: 'wrappers/python/openmm/app/data/amber14/tip3p.xml' as const,
            sizeBytes: 19_070 as const,
            sha256: 'sha256:3f4b188dbcb6c02863230eaca231e927fb6bf3307ce947d8a50d0f46f6dd83d9' as const,
            sourceUrl: 'https://github.com/openmm/openmm/blob/f7fa0c27c1f8d943c339d67b3bf22f026d0bd8b5/wrappers/python/openmm/app/data/amber14/tip3p.xml' as const,
          },
        ] as const,
        executionPerformed: false as const,
      },
    },
    gates,
    naclPointChargeReference: nacl,
    triclinicForceCheck: force,
    alphaCutoffCheck: convergence,
    hugeImageGaugeCheck: {
      ewald: ewaldGauge,
      rigidTip3p: rigid.gauge,
    },
    rejectionEvidence: {
      nonNeutral: ewaldRejections.nonNeutral.message,
      relativePermittivity: ewaldRejections.relativePermittivity.message,
      ewaldRealWorkBudget: ewaldRejections.realWorkBudget.message,
      ewaldReciprocalWorkBudget: ewaldRejections.reciprocalWorkBudget.message,
      inconsistentPeriodicConstraintLoop: rigid.inconsistentLoop.message,
      rigidWorkBudget: rigid.workBudget.message,
    },
    tip3pConstraintFixture: {
      cellKind: 'strongly-sheared-triclinic' as const,
      periodicFaceCrossing: true as const,
      targetDistancesAngstrom: {
        oh1: TIP3P_OH_ANGSTROM as 0.9572,
        oh2: TIP3P_OH_ANGSTROM as 0.9572,
        hh: TIP3P_HH_ANGSTROM as 1.5139006545247014,
      },
      maximumPositionResidualAngstrom: rigid.maximumPositionResidualAngstrom,
      maximumVelocityDerivativeResidualAngstrom2PerPicosecond:
        rigid.maximumVelocityDerivativeResidualAngstrom2PerPicosecond,
      maximumCenterOfMassPositionChangeAngstrom: rigid.maximumCenterOfMassPositionChangeAngstrom,
      centerOfMassMomentumChangeDaltonAngstromPerPicosecond:
        rigid.centerOfMassMomentumChangeDaltonAngstromPerPicosecond,
      shakeIterations: rigid.shakeIterations,
      rattleIterations: rigid.rattleIterations,
      constraintOrder: rigid.constraintOrder,
    },
    boundaries,
  };
  return deepFreeze({ ...payload, verificationDigest: digestValue(payload) });
}

export function assertAqueousFoundationVerification(
  report: AqueousFoundationVerificationReportV042,
): asserts report is AqueousFoundationVerificationReportV042 {
  if (!report || report.schemaVersion !== 'tf.aqueous-foundation-verification/0.4.2'
    || report.status !== 'foundation-only-not-reproduction') {
    throw new Error('unsupported aqueous foundation verification report');
  }
  const failed = AQUEOUS_FOUNDATION_GATE_NAMES.filter((name) => report.gates[name] !== true);
  if (failed.length > 0) throw new Error(`aqueous foundation verification gates failed: ${failed.join(', ')}`);
  const { verificationDigest, ...payload } = report;
  if (verificationDigest !== digestValue(payload)) {
    throw new Error('aqueous foundation verification digest mismatch');
  }
}

function verifyRocksaltMadelung() {
  const latticeAngstrom = 5.64 as const;
  const nearestNeighborAngstrom = 2.82 as const;
  const madelungConstant = 1.7475645946331822 as const;
  const expectedCellEnergyKjMol = -4 * madelungConstant * COULOMB / nearestNeighborAngstrom;
  const evaluation = evaluateDirectPeriodicEwald(
    cubicCell(latticeAngstrom),
    rocksaltAtoms(),
    ewaldOptions({
      alphaInverseAngstrom: 0.5,
      realSpaceCutoffAngstrom: 24,
      reciprocalCutoffInverseAngstrom: 10,
    }),
  );
  return {
    latticeAngstrom,
    nearestNeighborAngstrom,
    madelungConstant,
    expectedCellEnergyKjMol,
    observedCellEnergyKjMol: evaluation.energyKjMol.total,
    absoluteEnergyErrorKjMol: Math.abs(evaluation.energyKjMol.total - expectedCellEnergyKjMol),
    netForceKjMolAngstrom: magnitude(evaluation.netForceKjMolAngstrom),
  };
}

function verifyTriclinicFiniteDifferenceForce() {
  const cell = referenceTriclinicCell();
  const atoms = neutralTriclinicAtoms();
  const configuration = ewaldOptions();
  const evaluation = evaluateDirectPeriodicEwald(cell, atoms, configuration);
  const centralDifferenceStepAngstrom = 1e-5 as const;
  let maximumAbsoluteForceErrorKjMolAngstrom = 0;
  for (let atomIndex = 0; atomIndex < atoms.length; atomIndex += 1) {
    for (const axis of ['x', 'y', 'z'] as const) {
      const cartesianStep = {
        x: axis === 'x' ? centralDifferenceStepAngstrom : 0,
        y: axis === 'y' ? centralDifferenceStepAngstrom : 0,
        z: axis === 'z' ? centralDifferenceStepAngstrom : 0,
      };
      const fractionalStep = cell.cartesianVectorToFractional(cartesianStep);
      const plus = displacedAtom(atoms, atomIndex, fractionalStep, 1);
      const minus = displacedAtom(atoms, atomIndex, fractionalStep, -1);
      const finiteDifferenceForce = -(
        evaluateDirectPeriodicEwald(cell, plus, configuration).energyKjMol.total
        - evaluateDirectPeriodicEwald(cell, minus, configuration).energyKjMol.total
      ) / (2 * centralDifferenceStepAngstrom);
      maximumAbsoluteForceErrorKjMolAngstrom = Math.max(
        maximumAbsoluteForceErrorKjMolAngstrom,
        Math.abs(finiteDifferenceForce - evaluation.forceByAtomIdKjMolAngstrom[atoms[atomIndex].id][axis]),
      );
    }
  }
  return {
    centralDifferenceStepAngstrom,
    maximumAbsoluteForceErrorKjMolAngstrom,
    netForceKjMolAngstrom: magnitude(evaluation.netForceKjMolAngstrom),
  };
}

function verifyAlphaCutoffConsistency() {
  const cell = new PeriodicCell([
    { x: 9, y: 0, z: 0 },
    { x: 1.7, y: 8.4, z: 0 },
    { x: -0.8, y: 1.1, z: 10.2 },
  ]);
  const atoms = neutralTriclinicAtoms();
  const energy = (overrides: Partial<DirectEwaldOptionsV042>) =>
    evaluateDirectPeriodicEwald(cell, atoms, ewaldOptions(overrides)).energyKjMol.total;
  const referenceEnergyKjMol = energy({ realSpaceCutoffAngstrom: 28, reciprocalCutoffInverseAngstrom: 10 });
  const looseAbsoluteErrorKjMol = Math.abs(energy({
    realSpaceCutoffAngstrom: 7,
    reciprocalCutoffInverseAngstrom: 2,
  }) - referenceEnergyKjMol);
  const mediumAbsoluteErrorKjMol = Math.abs(energy({
    realSpaceCutoffAngstrom: 10,
    reciprocalCutoffInverseAngstrom: 3,
  }) - referenceEnergyKjMol);
  const tightAbsoluteErrorKjMol = Math.abs(energy({
    realSpaceCutoffAngstrom: 14,
    reciprocalCutoffInverseAngstrom: 5,
  }) - referenceEnergyKjMol);
  const alphaErrors = [0.3, 0.45, 0.65].map((alphaInverseAngstrom) => Math.abs(energy({
    alphaInverseAngstrom,
    realSpaceCutoffAngstrom: 24,
    reciprocalCutoffInverseAngstrom: 9,
  }) - referenceEnergyKjMol));
  return {
    referenceEnergyKjMol,
    looseAbsoluteErrorKjMol,
    mediumAbsoluteErrorKjMol,
    tightAbsoluteErrorKjMol,
    maximumAlphaAbsoluteErrorKjMol: Math.max(...alphaErrors),
  };
}

function verifyEwaldRejections() {
  const cell = cubicCell();
  const neutral = neutralTriclinicAtoms();
  return {
    nonNeutral: rejection(() => evaluateDirectPeriodicEwald(cell, [
      ewaldAtom('positive', 1, { x: 0, y: 0, z: 0 }),
      ewaldAtom('negative', -0.9, { x: 0.5, y: 0.5, z: 0.5 }),
    ], ewaldOptions()), /electrically neutral/),
    relativePermittivity: rejection(() => evaluateDirectPeriodicEwald(
      cell,
      neutral,
      { ...ewaldOptions(), relativePermittivity: 78.3 } as unknown as DirectEwaldOptionsV042,
    ), /relativePermittivity is locked to 1/),
    realWorkBudget: rejection(() => evaluateDirectPeriodicEwald(
      referenceTriclinicCell(),
      neutral,
      ewaldOptions({ maximumRealSpaceCandidates: 1 }),
    ), /real-space work-unit limit exceeded/),
    reciprocalWorkBudget: rejection(() => evaluateDirectPeriodicEwald(
      referenceTriclinicCell(),
      neutral,
      ewaldOptions({ maximumReciprocalCandidates: 1 }),
    ), /reciprocal-space work-unit limit exceeded/),
  };
}

function verifyEwaldHugeImageGauge() {
  const cell = referenceTriclinicCell();
  const atoms = neutralTriclinicAtoms();
  const commonImage = { x: 1_000_000_000, y: -1_000_000_000, z: 1_000_000_000 } as const;
  const reference = evaluateDirectPeriodicEwald(cell, atoms, ewaldOptions());
  const gauged = evaluateDirectPeriodicEwald(cell, shiftEwaldImages(atoms, commonImage), ewaldOptions());
  const referenceEvaluationDigest = digestValue(reference);
  const gaugedEvaluationDigest = digestValue(gauged);
  return {
    commonImage,
    exactEvaluationEquality: JSON.stringify(gauged) === JSON.stringify(reference),
    referenceEvaluationDigest,
    gaugedEvaluationDigest,
  };
}

function verifyTip3pRigidConstraints() {
  const cell = strongShearTriclinicCell();
  const fixture = tip3pConstraintFixture(cell);
  const periodicFaceCrossing = new Set(
    fixture.atoms.map((atom) => JSON.stringify(atom.position.image)),
  ).size > 1;
  const result = applyShakeRattleConstraints(cell, fixture.atoms, fixture.constraints, {
    positionToleranceAngstrom: 1e-12,
    velocityDerivativeToleranceAngstrom2PerPicosecond: 1e-12,
    centerOfMassPositionToleranceAngstrom: 1e-10,
    momentumToleranceDaltonAngstromPerPicosecond: 1e-10,
  });
  const commonImage = { x: 100_000_000, y: -100_000_000, z: 100_000_000 } as const;
  const gaugedAtoms = shiftRigidImages(fixture.atoms, commonImage);
  const gaugedResult = applyShakeRattleConstraints(cell, gaugedAtoms, fixture.constraints, {
    positionToleranceAngstrom: 1e-12,
    velocityDerivativeToleranceAngstrom2PerPicosecond: 1e-12,
    centerOfMassPositionToleranceAngstrom: 1e-10,
    momentumToleranceDaltonAngstromPerPicosecond: 1e-10,
  });
  const normalizedReference = normalizeRigidResult(result, { x: 0, y: 0, z: 0 });
  const normalizedGauged = normalizeRigidResult(gaugedResult, commonImage);
  const maximumPositionResidualAngstrom = Math.max(...fixture.constraints.map((constraint) =>
    Math.abs(periodicDistance(cell, result.atoms, constraint) - constraint.distanceAngstrom)));
  const maximumVelocityDerivativeResidualAngstrom2PerPicosecond = Math.max(
    ...fixture.constraints.map((constraint) => Math.abs(periodicVelocityDerivative(
      cell,
      result.atoms,
      constraint,
    ))),
  );
  const inconsistentLoop = rejection(() => applyShakePositionConstraints(
    cell,
    inconsistentPeriodicRingAtoms(cell),
    inconsistentPeriodicRingConstraints(),
  ), /inconsistent periodic image loop/);
  const workBudget = rejection(() => applyShakeRattleConstraints(
    cell,
    fixture.atoms,
    fixture.constraints,
    { maximumIterations: MAXIMUM_RIGID_CONSTRAINT_ITERATIONS },
  ), /work units/);
  return {
    periodicFaceCrossing,
    maximumPositionResidualAngstrom,
    maximumVelocityDerivativeResidualAngstrom2PerPicosecond,
    maximumCenterOfMassPositionChangeAngstrom: result.maximumCenterOfMassPositionChangeAngstrom,
    centerOfMassMomentumChangeDaltonAngstromPerPicosecond:
      result.centerOfMassMomentumChangeDaltonAngstromPerPicosecond,
    shakeIterations: result.shakeIterations,
    rattleIterations: result.rattleIterations,
    constraintOrder: result.constraintOrder,
    gauge: {
      commonImage,
      exactNormalizedResultEquality: JSON.stringify(normalizedGauged) === JSON.stringify(normalizedReference),
      referenceResultDigest: digestValue(normalizedReference),
      normalizedGaugedResultDigest: digestValue(normalizedGauged),
    },
    inconsistentLoop,
    workBudget,
  };
}

function ewaldOptions(overrides: Partial<DirectEwaldOptionsV042> = {}): DirectEwaldOptionsV042 {
  return {
    alphaInverseAngstrom: 0.45,
    realSpaceCutoffAngstrom: 18,
    reciprocalCutoffInverseAngstrom: 7,
    relativePermittivity: 1,
    neutralityToleranceE: 1e-12,
    electrostaticConstantKjMolAngstromE2: COULOMB,
    maximumRealSpaceCandidates: 10_000_000,
    maximumReciprocalCandidates: 10_000_000,
    ...overrides,
  };
}

function cubicCell(edge = 10) {
  return new PeriodicCell([
    { x: edge, y: 0, z: 0 },
    { x: 0, y: edge, z: 0 },
    { x: 0, y: 0, z: edge },
  ]);
}

function referenceTriclinicCell() {
  return new PeriodicCell([
    { x: 11, y: 0, z: 0 },
    { x: 2.1, y: 10.3, z: 0 },
    { x: -0.7, y: 1.4, z: 12.2 },
  ]);
}

function strongShearTriclinicCell() {
  return new PeriodicCell([
    { x: 10, y: 0, z: 0 },
    { x: 8.7, y: 4.9, z: 0 },
    { x: 4.5, y: 2.1, z: 7.2 },
  ]);
}

function rocksaltAtoms(): DirectEwaldAtomV042[] {
  const positive = [[0.5, 0, 0], [0, 0.5, 0], [0, 0, 0.5], [0.5, 0.5, 0.5]] as const;
  const negative = [[0, 0, 0], [0, 0.5, 0.5], [0.5, 0, 0.5], [0.5, 0.5, 0]] as const;
  return [
    ...positive.map(([x, y, z], index) => ewaldAtom(`na-${index}`, 1, { x, y, z })),
    ...negative.map(([x, y, z], index) => ewaldAtom(`cl-${index}`, -1, { x, y, z })),
  ];
}

function neutralTriclinicAtoms(): DirectEwaldAtomV042[] {
  return [
    ewaldAtom('charge-a', 1, { x: 0.17, y: 0.23, z: 0.31 }),
    ewaldAtom('charge-b', -0.6, { x: 0.62, y: 0.44, z: 0.73 }),
    ewaldAtom('charge-c', -0.4, { x: 0.83, y: 0.12, z: 0.54 }),
  ];
}

function tip3pConstraintFixture(cell: PeriodicCell) {
  const oxygen = cell.fractionalToCartesian({ x: 0.97, y: 0.93, z: 0.45 });
  const cosine = (2 * TIP3P_OH_ANGSTROM ** 2 - TIP3P_HH_ANGSTROM ** 2)
    / (2 * TIP3P_OH_ANGSTROM ** 2);
  const sine = Math.sqrt(1 - cosine ** 2);
  const idealH1 = add(oxygen, { x: TIP3P_OH_ANGSTROM, y: 0, z: 0 });
  const idealH2 = add(oxygen, {
    x: TIP3P_OH_ANGSTROM * cosine,
    y: TIP3P_OH_ANGSTROM * sine,
    z: 0,
  });
  const atoms: RigidConstraintAtom[] = [
    rigidAtom(cell, 'tip3p-o', TIP3P_OXYGEN_MASS_DALTON, add(oxygen, { x: -0.012, y: 0.007, z: 0.004 }), { x: 0.2, y: -0.3, z: 0.1 }),
    rigidAtom(cell, 'tip3p-h1', TIP3P_HYDROGEN_MASS_DALTON, add(idealH1, { x: 0.018, y: -0.011, z: 0.006 }), { x: 0.8, y: 0.4, z: -0.2 }),
    rigidAtom(cell, 'tip3p-h2', TIP3P_HYDROGEN_MASS_DALTON, add(idealH2, { x: -0.015, y: 0.014, z: -0.005 }), { x: -0.5, y: 0.7, z: 0.3 }),
  ];
  const constraints: RigidDistanceConstraint[] = [
    { id: 'tip3p-oh1', atomAId: 'tip3p-o', atomBId: 'tip3p-h1', distanceAngstrom: TIP3P_OH_ANGSTROM },
    { id: 'tip3p-oh2', atomAId: 'tip3p-o', atomBId: 'tip3p-h2', distanceAngstrom: TIP3P_OH_ANGSTROM },
    { id: 'tip3p-hh', atomAId: 'tip3p-h1', atomBId: 'tip3p-h2', distanceAngstrom: TIP3P_HH_ANGSTROM },
  ];
  return { atoms, constraints };
}

function inconsistentPeriodicRingAtoms(cell: PeriodicCell): RigidConstraintAtom[] {
  return [
    rigidAtom(cell, 'ring-a', 1, cell.fractionalToCartesian({ x: 0.1, y: 0.2, z: 0.2 }), zero()),
    rigidAtom(cell, 'ring-b', 1, cell.fractionalToCartesian({ x: 0.4, y: 0.2, z: 0.2 }), zero()),
    rigidAtom(cell, 'ring-c', 1, cell.fractionalToCartesian({ x: 0.8, y: 0.2, z: 0.2 }), zero()),
  ];
}

function inconsistentPeriodicRingConstraints(): RigidDistanceConstraint[] {
  return [
    { id: 'ring-ab', atomAId: 'ring-a', atomBId: 'ring-b', distanceAngstrom: 1 },
    { id: 'ring-bc', atomAId: 'ring-b', atomBId: 'ring-c', distanceAngstrom: 1 },
    { id: 'ring-ca', atomAId: 'ring-c', atomBId: 'ring-a', distanceAngstrom: 1 },
  ];
}

function rigidAtom(
  cell: PeriodicCell,
  id: string,
  massDalton: number,
  cartesian: Vector3,
  velocityAngstromPerPicosecond: Vector3,
): RigidConstraintAtom {
  return {
    id,
    massDalton,
    position: cell.wrapCartesian(cartesian),
    velocityAngstromPerPicosecond,
  };
}

function periodicDistance(
  cell: PeriodicCell,
  atoms: ReadonlyArray<RigidConstraintAtom>,
  constraint: RigidDistanceConstraint,
) {
  const atomA = requireAtom(atoms, constraint.atomAId);
  const atomB = requireAtom(atoms, constraint.atomBId);
  return cell.minimumImageFromFractional(
    atomA.position.wrappedFractional,
    atomB.position.wrappedFractional,
  ).distanceAngstrom;
}

function periodicVelocityDerivative(
  cell: PeriodicCell,
  atoms: ReadonlyArray<RigidConstraintAtom>,
  constraint: RigidDistanceConstraint,
) {
  const atomA = requireAtom(atoms, constraint.atomAId);
  const atomB = requireAtom(atoms, constraint.atomBId);
  const displacement = cell.minimumImageFromFractional(
    atomA.position.wrappedFractional,
    atomB.position.wrappedFractional,
  ).displacementAngstrom;
  return dot(displacement, subtract(
    atomB.velocityAngstromPerPicosecond,
    atomA.velocityAngstromPerPicosecond,
  ));
}

function displacedAtom(
  atoms: ReadonlyArray<DirectEwaldAtomV042>,
  atomIndex: number,
  fractionalStep: Vector3,
  direction: number,
) {
  return atoms.map((atom, index) => index === atomIndex
    ? {
      ...atom,
      position: wrappedPosition(add(
        atom.position.wrappedFractional,
        scale(fractionalStep, direction),
      )),
    }
    : atom);
}

function ewaldAtom(id: string, chargeE: number, wrappedFractional: Vector3): DirectEwaldAtomV042 {
  return { id, chargeE, position: wrappedPosition(wrappedFractional) };
}

function wrappedPosition(fractional: Vector3): WrappedPeriodicPosition {
  const x = wrapScalar(fractional.x);
  const y = wrapScalar(fractional.y);
  const z = wrapScalar(fractional.z);
  return {
    wrappedFractional: { x: x.wrapped, y: y.wrapped, z: z.wrapped },
    image: { x: x.image, y: y.image, z: z.image },
  };
}

function wrapScalar(value: number) {
  const image = Math.floor(value);
  return { wrapped: value - image, image };
}

function shiftEwaldImages(atoms: ReadonlyArray<DirectEwaldAtomV042>, image: Int3) {
  return atoms.map((atom) => ({
    ...atom,
    position: {
      wrappedFractional: { ...atom.position.wrappedFractional },
      image: addInt3(atom.position.image, image),
    },
  }));
}

function shiftRigidImages(atoms: ReadonlyArray<RigidConstraintAtom>, image: Int3) {
  return atoms.map((atom) => ({
    ...atom,
    position: {
      wrappedFractional: { ...atom.position.wrappedFractional },
      image: addInt3(atom.position.image, image),
    },
  }));
}

function normalizeRigidResult(
  result: ReturnType<typeof applyShakeRattleConstraints>,
  image: Int3,
) {
  return {
    ...result,
    atoms: result.atoms.map((atom) => ({
      ...atom,
      position: {
        wrappedFractional: { ...atom.position.wrappedFractional },
        image: subtractInt3(atom.position.image, image),
      },
      velocityAngstromPerPicosecond: { ...atom.velocityAngstromPerPicosecond },
    })),
  };
}

function addInt3(left: Int3, right: Int3): Int3 {
  return { x: left.x + right.x, y: left.y + right.y, z: left.z + right.z };
}

function subtractInt3(left: Int3, right: Int3): Int3 {
  return { x: left.x - right.x, y: left.y - right.y, z: left.z - right.z };
}

function rejection(run: () => unknown, expected: RegExp) {
  try {
    run();
    return { accepted: true, message: 'unexpectedly accepted' } as const;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { accepted: !expected.test(message), message } as const;
  }
}

function requireAtom(atoms: ReadonlyArray<RigidConstraintAtom>, id: string) {
  const atom = atoms.find((candidate) => candidate.id === id);
  if (!atom) throw new Error(`aqueous verification atom ${id} is missing`);
  return atom;
}

function zero(): Vector3 { return { x: 0, y: 0, z: 0 }; }
function add(left: Vector3, right: Vector3): Vector3 { return { x: left.x + right.x, y: left.y + right.y, z: left.z + right.z }; }
function subtract(left: Vector3, right: Vector3): Vector3 { return { x: left.x - right.x, y: left.y - right.y, z: left.z - right.z }; }
function scale(vector: Vector3, factor: number): Vector3 { return { x: vector.x * factor, y: vector.y * factor, z: vector.z * factor }; }
function dot(left: Vector3, right: Vector3) { return left.x * right.x + left.y * right.y + left.z * right.z; }
function magnitude(vector: Vector3) { return Math.sqrt(dot(vector, vector)); }

function deepFreeze<Value>(value: Value): Value {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
