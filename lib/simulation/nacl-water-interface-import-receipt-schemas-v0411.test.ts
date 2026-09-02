import { describe, expect, it } from 'vitest';
import Ajv2020 from 'ajv/dist/2020.js';
import importReceiptSchema from '../../schemas/nacl-water-interface-import-receipt.schema.json' with { type: 'json' };
import { digestValue } from './digest.ts';
import { createNaClWaterInterfacePlanV0410 } from './nacl-water-interface-system-v0410.ts';

const LOCKED_DIGESTS: Readonly<Record<string, string>> = Object.freeze({
  coordinatePayload: 'sha256:17631204745ab1bb264d2052c9cfefb6afbd989a6559d6de1ef5c091c1d8ae99',
  topology: 'sha256:e9d7293e55709ffe8e964c266fe936d597d30d2dd244b398e20b4d0239709183',
  coordinateConstruction: 'sha256:7b77acefe148d5e6adb4e27829589cb0e34e17d5cfe78fb0c83d0816ceb05fbb',
  system: 'sha256:d47785bc641fd6483c58b8549bf7c0dc7e116a5892c0c13864c98e87c712133a',
  coordinateSeed: 'sha256:beb7f2c4f997e2e8b8158a05d6083a7d6569bd1f11457f922844646cac0cc426',
  plan: 'sha256:f6f271d255de31ab655e62b7539b65e58a4e85994870232b675ef7b40f2fd0b8',
});

const ARTIFACT_DIGESTS: Readonly<Record<string, string>> = Object.freeze({
  'cell-vectors': 'sha256:46328762b79ce95928d77163e21368a549421a86aa0164ae3a40af6da540851e',
  positions: 'sha256:1f6c3c4f7dcf27cff1fcbb713c076b7889f393601dc4224f492ce2065af80dec',
  masses: 'sha256:bbd28b64b526680e2d7c08da06ca017859983943d4e2ae129b7ff1d4c4c279ad',
  'formal-charges': 'sha256:4fda1541a147f0abff10a0a4994a8145319b7919129823cc00ff677a995d3a51',
  'model-point-charges': 'sha256:1730261d435116a07ff7314a560e3f63b4b224c0489e40c3b159df120bced4f9',
  'species-codes': 'sha256:ecd55a1c585d2c53d9ac3ce6f360ceab591b409e3e5341a5d454af02f32d49f5',
  'structural-bond-indices': 'sha256:e0c8ed00b99e9264efff8d3054424420203e9e3fc76f31e46b029f7ddcc1a9ca',
  'rigid-constraint-indices': 'sha256:80f2b92fd3c8550b9780be0ec81fc7a26520fe87e5b5c4abeb365932c81c9870',
  'rigid-constraint-targets': 'sha256:42bca76c6eca0eff826d2079d4a9c1e9376aa04d0ebb0aa9f8571c7a7ab2ed70',
  'identity-ledger': 'sha256:935e1bb04abc0494a96525b033688ff6763bc3ddff63e601fc53408692aefd90',
});

type ArtifactIdentity = readonly [string, string, string, readonly number[], string, number];

const ARTIFACT_IDENTITIES: ReadonlyArray<ArtifactIdentity> = Object.freeze([
  ['cell-vectors', 'arrays/cell-vectors.f64le', 'float64-le', [3, 3], 'nanometer', 72],
  ['positions', 'arrays/positions.f64le', 'float64-le', [6336, 3], 'nanometer', 152064],
  ['masses', 'arrays/masses.f64le', 'float64-le', [6336], 'dalton', 50688],
  ['formal-charges', 'arrays/formal-charges.f64le', 'float64-le', [6336], 'elementary-charge', 50688],
  ['model-point-charges', 'arrays/model-point-charges.f64le', 'float64-le', [6336], 'elementary-charge', 50688],
  ['species-codes', 'arrays/species-codes.u32le', 'uint32-le', [6336], 'species-code', 25344],
  ['structural-bond-indices', 'arrays/structural-bond-indices.u32le', 'uint32-le', [3456, 2], 'index', 27648],
  ['rigid-constraint-indices', 'arrays/rigid-constraint-indices.u32le', 'uint32-le', [5184, 2], 'index', 41472],
  ['rigid-constraint-targets', 'arrays/rigid-constraint-targets.f64le', 'float64-le', [5184], 'nanometer', 41472],
  ['identity-ledger', 'manifests/identity-ledger.json', 'canonical-json', [6336], 'atom-identity', 2075702],
]);

function validator() {
  const ajv = new Ajv2020({ allErrors: true, strict: true, strictNumbers: true });
  const validate = ajv.compile(importReceiptSchema);
  return validate;
}

function sampleReceipt() {
  return {
    schemaVersion: 'tf.nacl-water-interface-import-receipt/0.4.11',
    profile: 'nacl-water-interface-stdlib-python-semantic-import',
    statusDomain: 'semantic-import-integrity-only-not-solver-admission',
    status: 'verified-pass',
    subject: {
      schemaVersion: 'tf.nacl-water-interface-plan/0.4.10',
      byteCount: 5053426,
      rawSha256: 'sha256:473eaab96bb5d90c8ee2f298860aaec624a7124ad7fa99ef362ef9213c7334bd',
      canonicalValueSha256: 'sha256:183c0cf628a5963064134277d2caea70ad3ecad998d4a576f53f0fd8ac8ac52b',
    },
    canonicalization: {
      profile: 'tf.digest-value-no-lf/1',
      encoding: 'utf-8',
      keyOrder: 'utf-16-code-unit-ascending',
      numberSerialization: 'ecmascript-json-stringify-finite-number',
      trailingNewlineInDigest: false,
      strictIJson: true,
      goldenVector: [0, 0, 0, 1e-7, 1e21],
      goldenVectorDigest: 'sha256:42a312db6567a94c25c159743cdfad37637d8d07600423f4b102c5536633cd6d',
    },
    verifier: {
      version: 'tf.nacl-water-interface-semantic-importer/0.4.11',
      implementationLanguage: 'python-3',
      dependencyProfile: 'python-standard-library-only',
      sourceSha256: fixedDigest('2'),
    },
    digests: {
      expected: { ...LOCKED_DIGESTS },
      recomputed: { ...LOCKED_DIGESTS },
      allMatched: true,
    },
    semanticAudit: {
      checks: {
        closedShapeAndCardinality: true,
        digestDependencyGraph: true,
        atomIndexBijection: true,
        uniqueAtomIdentity: true,
        canonicalAtomOrder: true,
        speciesChargeMassConsistency: true,
        phaseAndSiteConsistency: true,
        moleculeAndResidueIntegrity: true,
        topologyReferenceIntegrity: true,
        rigidConstraintGeometry: true,
        primaryCellBounds: true,
        periodicCellConsistency: true,
        constructionReceiptConsistency: true,
        sourcePinMetadataConsistency: true,
      },
      particleCount: 6336,
      structuralBondCount: 3456,
      rigidConstraintCount: 5184,
      speciesCounts: {
        sodiumIonCount: 576,
        chlorideIonCount: 576,
        tip3pOxygenCount: 1728,
        tip3pHydrogenCount: 3456,
      },
      waterMoleculeCount: 1728,
      waterCountsPerRegion: { lowerWaterRegion: 864, upperWaterRegion: 864 },
      crystalLayerCount: 8,
      neutralCrystalLayerCount: 8,
      totalFormalChargeE: 0,
      totalModelPointChargeE: 0,
      totalMassDalton: 64791.919872000544,
      minimumDifferentMoleculeDistanceNanometer: 0.16483354467600186,
      minimumIonWaterDistanceNanometer: 0.26000364891955763,
      crystalCoordination: {
        surfaceOppositeChargeNearestNeighbors: 5,
        interiorOppositeChargeNearestNeighbors: 6,
      },
      cellLengthsNanometer: { x: 3.38412, y: 3.38412, z: 6.76824 },
      cellVolumeNanometer3: 77.51169954870105,
    },
    normalizedArtifacts: {
      speciesCodebook: { 'Na+': 0, 'Cl-': 1, 'TIP3P-O': 2, 'TIP3P-H': 3 },
      artifacts: ARTIFACT_IDENTITIES.map(([id, path, dtype, shape, unit, sizeBytes]) => ({
        id,
        path,
        dtype,
        shape: [...shape],
        unit,
        sizeBytes,
        sha256: ARTIFACT_DIGESTS[id],
      })),
      semanticRoot: 'sha256:8bd306fbb9cfcef6756bcfce682d63baf31482c8d39e65e974868cce5f39325f',
    },
    prerequisiteGates: [
      { gateId: 'pure-water-openmm-control', status: 'required-not-satisfied', receiptDigest: null },
      { gateId: 'single-pair-low-salt-pme-control', status: 'required-not-satisfied', receiptDigest: null },
      { gateId: 'dry-nacl-100-slab-stability-control', status: 'required-not-satisfied', receiptDigest: null },
      { gateId: 'solid-water-interface-potential-domain-qualification', status: 'required-not-satisfied', receiptDigest: null },
    ],
    sourceEvidence: {
      sourceMetadataPinned: true,
      sourceBytesVerified: false,
      redistributionCleared: false,
    },
    execution: {
      openmmImported: false,
      systemCompiled: false,
      contextCreated: false,
      solverInvoked: false,
      minimized: false,
      equilibrated: false,
      executionEligible: false,
    },
    claims: {
      sourceAuthenticityVerified: false,
      potentialDomainQualified: false,
      dynamicsExecuted: false,
      scientificReproduction: false,
      interfaceSimulated: false,
      industrialPrediction: false,
      promotionEligible: false,
      publicReleaseEligible: false,
    },
    stableEvidenceDigest: fixedDigest('c'),
    receiptDigest: fixedDigest('d'),
  };
}

describe('NaCl{100}-water v0.4.11 semantic-import receipt schema', () => {
  it('compiles in strict Draft 2020-12 and closes and bounds every typed container', () => {
    validator();
    expect(importReceiptSchema.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(importReceiptSchema.$id)
      .toBe('https://tailing.future/schemas/nacl-water-interface-import-receipt/0.4.11');
    expect(openObjectSchemaPaths(importReceiptSchema)).toEqual([]);
    expect(unboundedNumericSchemaPaths(importReceiptSchema)).toEqual([]);
    expect(unboundedArraySchemaPaths(importReceiptSchema)).toEqual([]);
  });

  it('accepts exactly one successful stdlib-only semantic import receipt', () => {
    const validate = validator();
    const receipt = sampleReceipt();
    expect(validate(receipt), JSON.stringify(validate.errors)).toBe(true);
    expect(receipt.normalizedArtifacts.artifacts.map((artifact) => artifact.id))
      .toEqual(ARTIFACT_IDENTITIES.map(([id]) => id));
  });

  it('pins the no-LF numeric golden vector and complete canonical plan value', () => {
    const receipt = sampleReceipt();
    expect(digestValue([0, -0, 0.0, 1e-7, 1e21]))
      .toBe(receipt.canonicalization.goldenVectorDigest);
    expect(digestValue(createNaClWaterInterfacePlanV0410()))
      .toBe(receipt.subject.canonicalValueSha256);
  }, 60_000);

  it('rejects identity, canonicalization and six-level digest drift', () => {
    const validate = validator();
    const mutations: Array<(receipt: ReturnType<typeof sampleReceipt>) => void> = [
      (receipt) => { receipt.statusDomain = 'solver-admission'; },
      (receipt) => { receipt.status = 'verified-fail'; },
      (receipt) => { receipt.subject.byteCount = 8388609; },
      (receipt) => { receipt.subject.canonicalValueSha256 = fixedDigest('0'); },
      (receipt) => { receipt.canonicalization.trailingNewlineInDigest = true; },
      (receipt) => { receipt.canonicalization.numberSerialization = 'python-json'; },
      (receipt) => { receipt.canonicalization.goldenVector[3] = 0.000001; },
      (receipt) => { receipt.verifier.dependencyProfile = 'third-party-packages'; },
      (receipt) => { receipt.digests.expected.coordinatePayload = fixedDigest('0'); },
      (receipt) => { receipt.digests.recomputed.topology = fixedDigest('0'); },
      (receipt) => { receipt.digests.recomputed.coordinateConstruction = fixedDigest('0'); },
      (receipt) => { receipt.digests.recomputed.system = fixedDigest('0'); },
      (receipt) => { receipt.digests.recomputed.coordinateSeed = fixedDigest('0'); },
      (receipt) => { receipt.digests.recomputed.plan = fixedDigest('0'); },
      (receipt) => { receipt.digests.allMatched = false; },
      (receipt) => { (receipt as unknown as Record<string, unknown>).extra = true; },
    ];
    for (const mutate of mutations) {
      const receipt = sampleReceipt();
      mutate(receipt);
      expect(validate(receipt)).toBe(false);
    }
  });

  it('rejects semantic, gate, source, execution and claim escalation', () => {
    const validate = validator();
    const mutations: Array<(receipt: ReturnType<typeof sampleReceipt>) => void> = [
      (receipt) => { receipt.semanticAudit.checks.atomIndexBijection = false; },
      (receipt) => { receipt.semanticAudit.particleCount = 6335; },
      (receipt) => { receipt.semanticAudit.speciesCounts.sodiumIonCount = 575; },
      (receipt) => { receipt.semanticAudit.minimumIonWaterDistanceNanometer = 0.1; },
      (receipt) => { receipt.semanticAudit.cellLengthsNanometer.z = 6.7; },
      (receipt) => { receipt.prerequisiteGates.pop(); },
      (receipt) => { receipt.prerequisiteGates[0].status = 'satisfied'; },
      (receipt) => { receipt.sourceEvidence.sourceBytesVerified = true; },
      (receipt) => { receipt.sourceEvidence.redistributionCleared = true; },
      (receipt) => { receipt.execution.openmmImported = true; },
      (receipt) => { receipt.execution.solverInvoked = true; },
      (receipt) => { receipt.claims.potentialDomainQualified = true; },
      (receipt) => { receipt.claims.scientificReproduction = true; },
      (receipt) => { receipt.claims.publicReleaseEligible = true; },
    ];
    for (const mutate of mutations) {
      const receipt = sampleReceipt();
      mutate(receipt);
      expect(validate(receipt)).toBe(false);
    }
  });

  it('locks normalized artifact order, identity, shapes, units and byte counts', () => {
    const validate = validator();
    const mutations: Array<(receipt: ReturnType<typeof sampleReceipt>) => void> = [
      (receipt) => { receipt.normalizedArtifacts.artifacts.reverse(); },
      (receipt) => { receipt.normalizedArtifacts.artifacts.pop(); },
      (receipt) => {
        receipt.normalizedArtifacts.artifacts.push(receipt.normalizedArtifacts.artifacts[0]);
      },
      (receipt) => { receipt.normalizedArtifacts.artifacts[0].id = 'positions'; },
      (receipt) => { receipt.normalizedArtifacts.artifacts[1].path = 'arrays/positions.u32le'; },
      (receipt) => { receipt.normalizedArtifacts.artifacts[2].dtype = 'uint32-le'; },
      (receipt) => { receipt.normalizedArtifacts.artifacts[3].shape = [6335]; },
      (receipt) => { receipt.normalizedArtifacts.artifacts[4].unit = 'dalton'; },
      (receipt) => { receipt.normalizedArtifacts.artifacts[5].sizeBytes = 25345; },
      (receipt) => { receipt.normalizedArtifacts.artifacts[9].sizeBytes = 8388609; },
      (receipt) => { receipt.normalizedArtifacts.speciesCodebook['Na+'] = 1; },
      (receipt) => { receipt.normalizedArtifacts.semanticRoot = fixedDigest('e'); },
      (receipt) => {
        (receipt.normalizedArtifacts.artifacts[0] as unknown as Record<string, unknown>)
          .unexpected = true;
      },
    ];
    for (const mutate of mutations) {
      const receipt = sampleReceipt();
      mutate(receipt);
      expect(validate(receipt)).toBe(false);
    }
  });

  it('leaves stable-evidence and self-digest recomputation to the verifier', () => {
    const validate = validator();
    const structurallyValidButRehashed = sampleReceipt();
    structurallyValidButRehashed.stableEvidenceDigest = fixedDigest('f');
    structurallyValidButRehashed.receiptDigest = fixedDigest('9');
    expect(validate(structurallyValidButRehashed), JSON.stringify(validate.errors)).toBe(true);
  });
});

function fixedDigest(character: string) {
  return `sha256:${character.repeat(64)}`;
}

function openObjectSchemaPaths(value: unknown, path = '#'): string[] {
  if (!value || typeof value !== 'object') return [];
  const record = value as Record<string, unknown>;
  const own = record.type === 'object' && record.additionalProperties !== false ? [path] : [];
  return Object.entries(record).reduce(
    (paths, [key, child]) => [...paths, ...openObjectSchemaPaths(child, `${path}/${key}`)],
    own,
  );
}

function unboundedNumericSchemaPaths(value: unknown, path = '#'): string[] {
  if (!value || typeof value !== 'object') return [];
  const record = value as Record<string, unknown>;
  const numeric = record.type === 'number' || record.type === 'integer';
  const hasLower = record.minimum !== undefined || record.exclusiveMinimum !== undefined
    || record.const !== undefined;
  const hasUpper = record.maximum !== undefined || record.exclusiveMaximum !== undefined
    || record.const !== undefined;
  const own = numeric && (!hasLower || !hasUpper) ? [path] : [];
  return Object.entries(record).reduce(
    (paths, [key, child]) => [...paths, ...unboundedNumericSchemaPaths(child, `${path}/${key}`)],
    own,
  );
}

function unboundedArraySchemaPaths(value: unknown, path = '#'): string[] {
  if (!value || typeof value !== 'object') return [];
  const record = value as Record<string, unknown>;
  const own = record.type === 'array'
    && record.const === undefined
    && (record.minItems === undefined || record.maxItems === undefined)
    ? [path]
    : [];
  return Object.entries(record).reduce(
    (paths, [key, child]) => [...paths, ...unboundedArraySchemaPaths(child, `${path}/${key}`)],
    own,
  );
}
