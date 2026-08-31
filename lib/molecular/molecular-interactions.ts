import { digestValue, shortDigest } from '../simulation/digest';

export type Vector3 = Readonly<{ x: number; y: number; z: number }>;
export type MolecularSceneKind = 'water-dimer' | 'nacl-rocksalt';
export type ChemicalElement = 'H' | 'O' | 'Na' | 'Cl';
export type ChargeKind = 'partial' | 'formal';

export type MolecularAtom = Readonly<{
  id: string;
  label: string;
  element: ChemicalElement;
  groupId: string;
  chargeE: number;
  chargeKind: ChargeKind;
  massDalton: number | null;
  positionAngstrom: Vector3;
  displayRadiusAngstrom: number;
}>;

export type MolecularBond = Readonly<{
  id: string;
  atomAId: string;
  atomBId: string;
  kind: 'rigid-covalent';
  lengthAngstrom: number;
}>;

export type InteractionGuide = Readonly<{
  id: string;
  atomAId: string;
  atomBId: string;
  kind: 'hydrogen-bond-guide' | 'coordination-guide';
  label: string;
}>;

export type PairInteraction = Readonly<{
  id: string;
  sourceAtomId: string;
  targetAtomId: string;
  distanceAngstrom: number;
  coulombEnergyKjMol: number;
  lennardJonesEnergyKjMol: number;
  lennardJonesModel: 'tip3p-oxygen-oxygen' | 'not-applied';
  totalEnergyKjMol: number;
  forceOnTargetKjMolAngstrom: Vector3;
}>;

export type ModelSource = Readonly<{
  title: string;
  url: string;
  role: 'primary-paper' | 'parameter-snapshot' | 'experimental-structure' | 'crystallographic-reference' | 'unit-definition';
}>;

export type MolecularScene = Readonly<{
  kind: MolecularSceneKind;
  name: string;
  modelName: string;
  modelSummary: string;
  atoms: ReadonlyArray<MolecularAtom>;
  bonds: ReadonlyArray<MolecularBond>;
  guides: ReadonlyArray<InteractionGuide>;
  pairInteractions: ReadonlyArray<PairInteraction>;
  forceByAtomIdKjMolAngstrom: Readonly<Record<string, Vector3 | null>>;
  energy: Readonly<{
    coulombKjMol: number;
    lennardJonesKjMol: number | null;
    totalKjMol: number;
    label: string;
  }>;
  stateId: string;
  stateDigest: string;
  defaultSelectedAtomId: string;
  selectableAtomIds: ReadonlyArray<string>;
  parameters: ReadonlyArray<Readonly<{ label: string; value: string }>>;
  sources: ReadonlyArray<ModelSource>;
  boundaries: ReadonlyArray<string>;
  unitCell: Readonly<{
    originAngstrom: Vector3;
    edgeAngstrom: number;
  }> | null;
  metadata: Readonly<Record<string, string | number>>;
}>;

export const COULOMB_CONSTANT_KJ_MOL_ANGSTROM_E2 = 1_389.35458;

export const OPENMM_TIP3P = Object.freeze({
  version: 'OpenMM 8.5.1',
  ohBondAngstrom: 0.9572,
  hohAngleDegrees: 104.52,
  oxygenChargeE: -0.834,
  hydrogenChargeE: 0.417,
  oxygenSigmaAngstrom: 3.150752406575124,
  oxygenEpsilonKjMol: 0.635968,
  oxygenMassDalton: 15.99943,
  hydrogenMassDalton: 1.007947,
});

export const NACL_ROCKSALT = Object.freeze({
  latticeConstantAngstrom: 5.6402,
  temperatureCelsius: 26,
  spaceGroup: 'Fm-3m (No. 225)',
  nearestNeighborAngstrom: 2.8201,
  secondNeighborAngstrom: 3.988223667,
});

export const MODEL_SOURCES = {
  'water-dimer': [
    {
      title: 'Jorgensen et al. (1983), Comparison of simple potential functions for simulating liquid water',
      url: 'https://doi.org/10.1063/1.445869',
      role: 'primary-paper',
    },
    {
      title: 'OpenMM 8.5.1 tip3p.xml parameter snapshot',
      url: 'https://github.com/openmm/openmm/blob/8.5.1/wrappers/python/openmm/app/data/tip3p.xml',
      role: 'parameter-snapshot',
    },
    {
      title: 'GROMACS reference manual: unit system and electrostatic constant',
      url: 'https://manual.gromacs.org/2026.3/reference-manual/definitions.html',
      role: 'unit-definition',
    },
  ],
  'nacl-rocksalt': [
    {
      title: 'NBS Circular 539 Vol. II: standard X-ray diffraction powder patterns',
      url: 'https://doi.org/10.6028/NBS.CIRC.539v2',
      role: 'experimental-structure',
    },
    {
      title: 'IUCr inorganic structure types: NaCl six-coordinate Fm-3m structure',
      url: 'https://www.iucr.org/resources/commissions/crystallographic-nomenclature/inorganic',
      role: 'crystallographic-reference',
    },
    {
      title: 'GROMACS reference manual: unit system and electrostatic constant',
      url: 'https://manual.gromacs.org/2026.3/reference-manual/definitions.html',
      role: 'unit-definition',
    },
  ],
} as const satisfies Readonly<Record<MolecularSceneKind, ReadonlyArray<ModelSource>>>;

export const NACL_PERIODIC_FIRST_SHELL: ReadonlyArray<Vector3> = Object.freeze([
  { x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 },
  { x: 0, y: 1, z: 0 }, { x: 0, y: -1, z: 0 },
  { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 },
]);

export function createWaterDimerScene(options: Readonly<{
  oxygenSeparationAngstrom?: number;
  donorAngleDegrees?: number;
}> = {}): MolecularScene {
  const oxygenSeparationAngstrom = options.oxygenSeparationAngstrom ?? 2.9;
  const donorAngleDegrees = options.donorAngleDegrees ?? 0;
  assertRange('oxygenSeparationAngstrom', oxygenSeparationAngstrom, 2.4, 6);
  assertRange('donorAngleDegrees', donorAngleDegrees, -55, 55);

  const leftOxygen = { x: -oxygenSeparationAngstrom / 2, y: 0, z: 0 };
  const rightOxygen = { x: oxygenSeparationAngstrom / 2, y: 0, z: 0 };
  const atoms = [
    ...createRigidWater('water-a', leftOxygen, 180, 22),
    ...createRigidWater('water-b', rightOxygen, 180 + donorAngleDegrees, -27),
  ];
  assertMinimumPairDistance(atoms, 0.35);

  const bonds = createWaterBonds(atoms);
  const pairInteractions: PairInteraction[] = [];
  const forceByAtomIdKjMolAngstrom = zeroForceRecord(atoms);
  const waterA = atoms.filter((atom) => atom.groupId === 'water-a');
  const waterB = atoms.filter((atom) => atom.groupId === 'water-b');

  for (const source of waterA) {
    for (const target of waterB) {
      const includeOxygenLennardJones = source.element === 'O' && target.element === 'O';
      const interaction = createPairInteraction(source, target, includeOxygenLennardJones);
      pairInteractions.push(interaction);
      forceByAtomIdKjMolAngstrom[target.id] = add(
        forceByAtomIdKjMolAngstrom[target.id],
        interaction.forceOnTargetKjMolAngstrom,
      );
      forceByAtomIdKjMolAngstrom[source.id] = subtract(
        forceByAtomIdKjMolAngstrom[source.id],
        interaction.forceOnTargetKjMolAngstrom,
      );
    }
  }

  const coulombKjMol = sum(pairInteractions.map((interaction) => interaction.coulombEnergyKjMol));
  const lennardJonesKjMol = sum(pairInteractions.map((interaction) => interaction.lennardJonesEnergyKjMol));
  const totalKjMol = coulombKjMol + lennardJonesKjMol;
  const identityPayload = {
    schema: 'tf.molecular-scene/0.1',
    kind: 'water-dimer',
    oxygenSeparationAngstrom,
    donorAngleDegrees,
    parameters: OPENMM_TIP3P,
    atoms: atoms.map(({ id, chargeE, positionAngstrom }) => ({ id, chargeE, positionAngstrom })),
    pairInteractions,
    forceByAtomIdKjMolAngstrom,
    energy: { coulombKjMol, lennardJonesKjMol, totalKjMol },
    sources: MODEL_SOURCES['water-dimer'],
  };

  return {
    kind: 'water-dimer',
    name: '水分子二聚体',
    modelName: 'OpenMM 8.5.1 TIP3P · rigid 3-site dimer',
    modelSummary: '两个刚性 H₂O 的真实三维坐标；跨分子 3×3 固定电荷库仑项 + 单个 O–O 12–6 Lennard–Jones 项。',
    atoms,
    bonds,
    guides: [{
      id: 'water-hbond-guide',
      atomAId: 'water-a-o',
      atomBId: 'water-b-h1',
      kind: 'hydrogen-bond-guide',
      label: 'O···H 非键几何指引（不是额外势能项）',
    }],
    pairInteractions,
    forceByAtomIdKjMolAngstrom,
    energy: {
      coulombKjMol,
      lennardJonesKjMol,
      totalKjMol,
      label: '两分子之间的经典势能',
    },
    stateId: `tf.molecular/water-dimer/${shortDigest(identityPayload)}`,
    stateDigest: digestValue(identityPayload),
    defaultSelectedAtomId: 'water-b-o',
    selectableAtomIds: atoms.map((atom) => atom.id),
    parameters: [
      { label: 'O···O', value: `${oxygenSeparationAngstrom.toFixed(3)} Å` },
      { label: 'O–H 刚性键长', value: `${OPENMM_TIP3P.ohBondAngstrom.toFixed(4)} Å` },
      { label: 'H–O–H 刚性键角', value: `${OPENMM_TIP3P.hohAngleDegrees.toFixed(2)}°` },
      { label: '部分电荷', value: `O ${OPENMM_TIP3P.oxygenChargeE.toFixed(3)}e · H +${OPENMM_TIP3P.hydrogenChargeE.toFixed(3)}e` },
      { label: 'O–O LJ', value: `σ ${OPENMM_TIP3P.oxygenSigmaAngstrom.toFixed(4)} Å · ε ${OPENMM_TIP3P.oxygenEpsilonKjMol.toFixed(6)} kJ/mol` },
    ],
    sources: MODEL_SOURCES['water-dimer'],
    boundaries: [
      '固定电荷、非极化的经典 TIP3P 参数快照；分子内几何被刚性约束。',
      '单体几何与力场参数有来源；二聚体相对姿态是受控交互构型，不是实验或量子优化的平衡构型。',
      '虚线仅标注 O···H 非键几何；能量没有额外“氢键势”。',
      '静态参数扫描，不是分子动力学；无电子重排、质子转移、断键或反应。',
    ],
    unitCell: null,
    metadata: {
      oxygenSeparationAngstrom,
      donorAngleDegrees,
      crossMoleculePairCount: pairInteractions.length,
      totalChargeWaterA: sum(waterA.map((atom) => atom.chargeE)),
      totalChargeWaterB: sum(waterB.map((atom) => atom.chargeE)),
    },
  };
}

export function createNaclRocksaltScene(options: Readonly<{
  selectedDisplacementAngstrom?: number;
}> = {}): MolecularScene {
  const selectedDisplacementAngstrom = options.selectedDisplacementAngstrom ?? 0;
  assertRange('selectedDisplacementAngstrom', selectedDisplacementAngstrom, -0.45, 0.45);
  const spacing = NACL_ROCKSALT.nearestNeighborAngstrom;
  const selectedLatticeIndex = { x: 1, y: 1, z: 2 };
  const selectedAtomId = latticeAtomId(selectedLatticeIndex.x, selectedLatticeIndex.y, selectedLatticeIndex.z);
  const atoms: MolecularAtom[] = [];

  for (let ix = 0; ix < 4; ix += 1) {
    for (let iy = 0; iy < 4; iy += 1) {
      for (let iz = 0; iz < 4; iz += 1) {
        const isSodium = (ix + iy + iz) % 2 === 0;
        const isSelected = ix === selectedLatticeIndex.x && iy === selectedLatticeIndex.y && iz === selectedLatticeIndex.z;
        atoms.push({
          id: latticeAtomId(ix, iy, iz),
          label: isSodium ? 'Na⁺' : 'Cl⁻',
          element: isSodium ? 'Na' : 'Cl',
          groupId: 'nacl-visible-cluster-4x4x4',
          chargeE: isSodium ? 1 : -1,
          chargeKind: 'formal',
          massDalton: null,
          positionAngstrom: {
            x: (ix - 1.5) * spacing + (isSelected ? selectedDisplacementAngstrom : 0),
            y: (iy - 1.5) * spacing,
            z: (iz - 1.5) * spacing,
          },
          displayRadiusAngstrom: isSodium ? 0.54 : 0.78,
        });
      }
    }
  }

  const atomById = new Map(atoms.map((atom) => [atom.id, atom]));
  const selectedAtom = requireAtom(atomById, selectedAtomId);
  const forceByAtomIdKjMolAngstrom = unavailableForceRecord(atoms);
  forceByAtomIdKjMolAngstrom[selectedAtom.id] = { x: 0, y: 0, z: 0 };
  const pairInteractions: PairInteraction[] = [];
  const guides: InteractionGuide[] = [];

  NACL_PERIODIC_FIRST_SHELL.forEach((direction, index) => {
    const neighborIndex = {
      x: selectedLatticeIndex.x + direction.x,
      y: selectedLatticeIndex.y + direction.y,
      z: selectedLatticeIndex.z + direction.z,
    };
    const neighbor = requireAtom(atomById, latticeAtomId(neighborIndex.x, neighborIndex.y, neighborIndex.z));
    const interaction = createPairInteraction(neighbor, selectedAtom, false);
    pairInteractions.push(interaction);
    forceByAtomIdKjMolAngstrom[selectedAtom.id] = add(
      forceByAtomIdKjMolAngstrom[selectedAtom.id] ?? { x: 0, y: 0, z: 0 },
      interaction.forceOnTargetKjMolAngstrom,
    );
    guides.push({
      id: `nacl-coordination-${index}`,
      atomAId: selectedAtom.id,
      atomBId: neighbor.id,
      kind: 'coordination-guide',
      label: '第一配位壳指引（不是共价键）',
    });
  });

  const coulombKjMol = sum(pairInteractions.map((interaction) => interaction.coulombEnergyKjMol));
  const identityPayload = {
    schema: 'tf.molecular-scene/0.1',
    kind: 'nacl-rocksalt',
    selectedDisplacementAngstrom,
    structure: NACL_ROCKSALT,
    selectedAtomId,
    atoms: atoms.map(({ id, chargeE, positionAngstrom }) => ({ id, chargeE, positionAngstrom })),
    pairInteractions,
    forceByAtomIdKjMolAngstrom,
    selectedFirstShellCoulombKjMol: coulombKjMol,
    sources: MODEL_SOURCES['nacl-rocksalt'],
  };

  return {
    kind: 'nacl-rocksalt',
    name: 'NaCl 岩盐离子晶格',
    modelName: 'NBS 26 °C rocksalt · central-ion first-shell electrostatics',
    modelSummary: 'NBS Fm-3m 晶格生成的 4×4×4 可见片段；作用读数仅包含中央 Na⁺ 与六个第一配位 Cl⁻ 的真空形式电荷库仑项。',
    atoms,
    bonds: [],
    guides,
    pairInteractions,
    forceByAtomIdKjMolAngstrom,
    energy: {
      coulombKjMol,
      lennardJonesKjMol: null,
      totalKjMol: coulombKjMol,
      label: '中央 Na⁺ 的第一配位壳成对和（不是晶格能）',
    },
    stateId: `tf.molecular/nacl-rocksalt/${shortDigest(identityPayload)}`,
    stateDigest: digestValue(identityPayload),
    defaultSelectedAtomId: selectedAtomId,
    selectableAtomIds: [selectedAtomId],
    parameters: [
      { label: '空间群', value: NACL_ROCKSALT.spaceGroup },
      { label: '晶格常数', value: `${NACL_ROCKSALT.latticeConstantAngstrom.toFixed(4)} Å @ ${NACL_ROCKSALT.temperatureCelsius} °C` },
      { label: '最近异号邻居', value: `6 × ${NACL_ROCKSALT.nearestNeighborAngstrom.toFixed(4)} Å` },
      { label: '形式电荷', value: 'Na +1e · Cl −1e' },
      { label: '可见片段', value: '4 × 4 × 4 simple-grid sites · 32 Na⁺ + 32 Cl⁻' },
      { label: '可选择求值位点', value: '中央 Na⁺；其余离子仅为不可交互的晶格背景' },
    ],
    sources: MODEL_SOURCES['nacl-rocksalt'],
    boundaries: [
      '第一配位壳的点形式电荷真空库仑贡献；不是周期 Ewald/PME 或体相晶格能。',
      '只有中央 Na⁺ 的六邻域被求值；其余可见离子是结构背景，力保持 NOT EVALUATED。',
      '没有短程 Pauli/Born–Mayer 排斥、极化或色散，不能预测平衡晶格、振动或缺陷。',
      '静态位移探针，不是分子动力学；可见片段边缘配位被截断。',
    ],
    unitCell: {
      originAngstrom: {
        x: -NACL_ROCKSALT.latticeConstantAngstrom / 2,
        y: -NACL_ROCKSALT.latticeConstantAngstrom / 2,
        z: -NACL_ROCKSALT.latticeConstantAngstrom / 2,
      },
      edgeAngstrom: NACL_ROCKSALT.latticeConstantAngstrom,
    },
    metadata: {
      selectedDisplacementAngstrom,
      visibleSodiumCount: atoms.filter((atom) => atom.element === 'Na').length,
      visibleChlorideCount: atoms.filter((atom) => atom.element === 'Cl').length,
      visibleClusterFormalChargeE: sum(atoms.map((atom) => atom.chargeE)),
      selectedFirstShellCount: pairInteractions.length,
    },
  };
}

export function distanceAngstrom(a: Vector3, b: Vector3) {
  return magnitude(subtract(a, b));
}

export function magnitude(vector: Vector3) {
  return Math.hypot(vector.x, vector.y, vector.z);
}

export function vectorSum(vectors: ReadonlyArray<Vector3>): Vector3 {
  return vectors.reduce<Vector3>((total, vector) => add(total, vector), { x: 0, y: 0, z: 0 });
}

export function angleDegrees(a: Vector3, vertex: Vector3, b: Vector3) {
  const fromVertexA = subtract(a, vertex);
  const fromVertexB = subtract(b, vertex);
  const denominator = magnitude(fromVertexA) * magnitude(fromVertexB);
  if (!Number.isFinite(denominator) || denominator <= 0) throw new Error('angle requires nonzero finite vectors');
  const cosine = clamp(dot(fromVertexA, fromVertexB) / denominator, -1, 1);
  return Math.acos(cosine) * 180 / Math.PI;
}

function createRigidWater(groupId: 'water-a' | 'water-b', oxygen: Vector3, yawDegrees: number, tiltDegrees: number) {
  const radius = OPENMM_TIP3P.ohBondAngstrom;
  const angleRadians = OPENMM_TIP3P.hohAngleDegrees * Math.PI / 180;
  const localHydrogens = [
    { x: radius, y: 0, z: 0 },
    { x: radius * Math.cos(angleRadians), y: radius * Math.sin(angleRadians), z: 0 },
  ];
  const atoms: MolecularAtom[] = [{
    id: `${groupId}-o`,
    label: 'O',
    element: 'O',
    groupId,
    chargeE: OPENMM_TIP3P.oxygenChargeE,
    chargeKind: 'partial',
    massDalton: OPENMM_TIP3P.oxygenMassDalton,
    positionAngstrom: oxygen,
    displayRadiusAngstrom: 0.6,
  }];
  localHydrogens.forEach((localPosition, index) => {
    const rotated = rotateZ(rotateX(localPosition, tiltDegrees), yawDegrees);
    atoms.push({
      id: `${groupId}-h${index + 1}`,
      label: `H${index + 1}`,
      element: 'H',
      groupId,
      chargeE: OPENMM_TIP3P.hydrogenChargeE,
      chargeKind: 'partial',
      massDalton: OPENMM_TIP3P.hydrogenMassDalton,
      positionAngstrom: add(oxygen, rotated),
      displayRadiusAngstrom: 0.34,
    });
  });
  return atoms;
}

function createWaterBonds(atoms: ReadonlyArray<MolecularAtom>): MolecularBond[] {
  const atomById = new Map(atoms.map((atom) => [atom.id, atom]));
  return (['water-a', 'water-b'] as const).flatMap((groupId) => [1, 2].map((hydrogenIndex) => {
    const oxygen = requireAtom(atomById, `${groupId}-o`);
    const hydrogen = requireAtom(atomById, `${groupId}-h${hydrogenIndex}`);
    return {
      id: `${groupId}-o-h${hydrogenIndex}`,
      atomAId: oxygen.id,
      atomBId: hydrogen.id,
      kind: 'rigid-covalent' as const,
      lengthAngstrom: distanceAngstrom(oxygen.positionAngstrom, hydrogen.positionAngstrom),
    };
  }));
}

function createPairInteraction(source: MolecularAtom, target: MolecularAtom, includeOxygenLennardJones: boolean): PairInteraction {
  const displacement = subtract(target.positionAngstrom, source.positionAngstrom);
  const distance = magnitude(displacement);
  if (!Number.isFinite(distance) || distance <= 0.2) throw new Error(`invalid pair distance for ${source.id} and ${target.id}`);
  const chargeProduct = source.chargeE * target.chargeE;
  const coulombEnergyKjMol = COULOMB_CONSTANT_KJ_MOL_ANGSTROM_E2 * chargeProduct / distance;
  const coulombForceScale = COULOMB_CONSTANT_KJ_MOL_ANGSTROM_E2 * chargeProduct / distance ** 3;
  let lennardJonesEnergyKjMol = 0;
  let lennardJonesForceScale = 0;

  if (includeOxygenLennardJones) {
    const sigmaByDistance = OPENMM_TIP3P.oxygenSigmaAngstrom / distance;
    const sigma6 = sigmaByDistance ** 6;
    const sigma12 = sigma6 ** 2;
    lennardJonesEnergyKjMol = 4 * OPENMM_TIP3P.oxygenEpsilonKjMol * (sigma12 - sigma6);
    lennardJonesForceScale = 24 * OPENMM_TIP3P.oxygenEpsilonKjMol * (2 * sigma12 - sigma6) / distance ** 2;
  }

  const forceOnTargetKjMolAngstrom = scale(displacement, coulombForceScale + lennardJonesForceScale);
  assertFiniteNumbers('pair interaction', [
    distance,
    coulombEnergyKjMol,
    lennardJonesEnergyKjMol,
    forceOnTargetKjMolAngstrom.x,
    forceOnTargetKjMolAngstrom.y,
    forceOnTargetKjMolAngstrom.z,
  ]);
  return {
    id: `${source.id}→${target.id}`,
    sourceAtomId: source.id,
    targetAtomId: target.id,
    distanceAngstrom: distance,
    coulombEnergyKjMol,
    lennardJonesEnergyKjMol,
    lennardJonesModel: includeOxygenLennardJones ? 'tip3p-oxygen-oxygen' : 'not-applied',
    totalEnergyKjMol: coulombEnergyKjMol + lennardJonesEnergyKjMol,
    forceOnTargetKjMolAngstrom,
  };
}

function zeroForceRecord(atoms: ReadonlyArray<MolecularAtom>) {
  return Object.fromEntries(atoms.map((atom) => [atom.id, { x: 0, y: 0, z: 0 }])) as Record<string, Vector3>;
}

function unavailableForceRecord(atoms: ReadonlyArray<MolecularAtom>) {
  return Object.fromEntries(atoms.map((atom) => [atom.id, null])) as Record<string, Vector3 | null>;
}

function latticeAtomId(x: number, y: number, z: number) {
  return `nacl-${x}-${y}-${z}`;
}

function requireAtom(atomById: ReadonlyMap<string, MolecularAtom>, atomId: string) {
  const atom = atomById.get(atomId);
  if (!atom) throw new Error(`missing atom ${atomId}`);
  return atom;
}

function assertMinimumPairDistance(atoms: ReadonlyArray<MolecularAtom>, minimumAngstrom: number) {
  for (let first = 0; first < atoms.length; first += 1) {
    for (let second = first + 1; second < atoms.length; second += 1) {
      if (distanceAngstrom(atoms[first].positionAngstrom, atoms[second].positionAngstrom) < minimumAngstrom) {
        throw new Error(`atoms ${atoms[first].id} and ${atoms[second].id} are too close`);
      }
    }
  }
}

function assertRange(label: string, value: number, minimum: number, maximum: number) {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new RangeError(`${label} must be finite and within [${minimum}, ${maximum}]`);
  }
}

function assertFiniteNumbers(label: string, values: ReadonlyArray<number>) {
  if (values.some((value) => !Number.isFinite(value))) throw new Error(`${label} produced a non-finite value`);
}

function rotateX(vector: Vector3, degrees: number): Vector3 {
  const radians = degrees * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return {
    x: vector.x,
    y: vector.y * cosine - vector.z * sine,
    z: vector.y * sine + vector.z * cosine,
  };
}

function rotateZ(vector: Vector3, degrees: number): Vector3 {
  const radians = degrees * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return {
    x: vector.x * cosine - vector.y * sine,
    y: vector.x * sine + vector.y * cosine,
    z: vector.z,
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

function dot(a: Vector3, b: Vector3) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function sum(values: ReadonlyArray<number>) {
  return values.reduce((total, value) => total + value, 0);
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}
