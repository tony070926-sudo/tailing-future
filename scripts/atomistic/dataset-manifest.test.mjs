import { describe, expect, it } from 'vitest';
import { inspectRandomTp } from './dataset-manifest.mjs';

const frame = ({ id = 'random-TP-000000', symbol = 'Si', force = '0 0 0', energy = '-1' } = {}) => Buffer.from([
  '1',
  `Lattice="1 0 0 0 1 0 0 0 1" Properties=species:S:1:pos:R:3:forces:R:3 internal_id=${id} energy_unit=eV forces_unit=eV/A stress_unit=eV/A^3 energy=${energy} stress="0 0 0 0 0 0 0 0 0" pbc="T T T"`,
  `${symbol} 0 0 0 ${force}`,
  '',
].join('\n'));

describe('Random-TP record manifest', () => {
  it('is independent of frame ordering while preserving each raw record and atomic order', () => {
    const first = frame({ id: 'random-TP-000001', symbol: 'C' });
    const second = frame({ id: 'random-TP-000000', symbol: 'Si' });
    const left = inspectRandomTp(Buffer.concat([first, second]), ['random-TP-000001']);
    const right = inspectRandomTp(Buffer.concat([second, first]), ['random-TP-000001']);

    expect(left.recordManifestSha256).toBe(right.recordManifestSha256);
    expect(left.smokeManifestSha256).toBe(right.smokeManifestSha256);
    expect(left.ids).toEqual(['random-TP-000000', 'random-TP-000001']);
    expect(left).toMatchObject({ frames: 2, atoms: 2, elements: 2, smokeElements: 1 });
  });

  it('changes the record and smoke manifests when a bound scientific value changes', () => {
    const original = inspectRandomTp(frame(), ['random-TP-000000']);
    const changed = inspectRandomTp(frame({ force: '0 0 0.1' }), ['random-TP-000000']);
    expect(changed.recordManifestSha256).not.toBe(original.recordManifestSha256);
    expect(changed.smokeRecordManifestSha256).not.toBe(original.smokeRecordManifestSha256);
    expect(changed.smokeManifestSha256).toBe(original.smokeManifestSha256);
  });

  it('rejects duplicate IDs, non-finite values, missing smoke IDs and unit drift', () => {
    expect(() => inspectRandomTp(Buffer.concat([frame(), frame()]))).toThrow(/duplicate/);
    expect(() => inspectRandomTp(frame({ energy: 'NaN' }))).toThrow(/canonical decimal/);
    expect(() => inspectRandomTp(frame(), ['random-TP-000001'])).toThrow(/missing/);
    expect(() => inspectRandomTp(Buffer.from(frame().toString().replace('stress_unit=eV/A^3', 'stress_unit=GPa')))).toThrow(/stress_unit/);
  });

  it('rejects ambiguous numeric syntax, singular cells, asymmetric stress and reordered properties', () => {
    expect(() => inspectRandomTp(frame({ energy: '0x1' }))).toThrow(/canonical decimal/);
    expect(() => inspectRandomTp(Buffer.from(frame().toString().replace('Lattice="1 0 0 0 1 0 0 0 1"', 'Lattice="1 0 0 0 1 0 0 0 0"')))).toThrow(/singular/);
    expect(() => inspectRandomTp(Buffer.from(frame().toString().replace('stress="0 0 0 0 0 0 0 0 0"', 'stress="0 1 0 0 0 0 0 0 0"')))).toThrow(/symmetric/);
    expect(() => inspectRandomTp(Buffer.from(frame().toString().replace('Properties=species:S:1:pos:R:3:forces:R:3', 'Properties=species:S:1:forces:R:3:pos:R:3')))).toThrow(/Properties/);
  });
});
