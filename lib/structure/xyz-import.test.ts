import { describe, expect, it, vi } from 'vitest';
import { parseAndValidateXyz, XYZ_INTERPRETATION } from './xyz-import';
import { ELEMENT_IDENTITIES } from './element-catalog';
import { createSolverAdmissionReceipt, exportStructureNativeJson, parseAndValidateStructureNativeJson } from './structure-document';
import { createStructureRenderModel } from './structure-render-model';
import { STRUCTURE_MAX_FILE_BYTES } from './strict-json';

const bytes = (text: string) => new TextEncoder().encode(text);
const parse = (text: string) => parseAndValidateXyz(bytes(text), 'input.xyz', XYZ_INTERPRETATION);

describe('limited explicitly interpreted plain XYZ', () => {
  it('preserves all 118 identities and generated row ordering without scientific inference', () => {
    const result = parse(`118\n units and charge are unknown \n${ELEMENT_IDENTITIES.map((e, i) => `${e.symbol} ${i} -1.25 2e-2`).join('\n')}`);
    expect(result.document.atoms.map(a => a.element.symbol)).toEqual(ELEMENT_IDENTITIES.map(e => e.symbol));
    expect(createStructureRenderModel(result.document).atoms.map(a => a.id)).toEqual(result.document.atoms.map(a => a.id));
    expect(result.transportReceipt.comment).toBe(' units and charge are unknown ');
    expect(result.document.provenance.source).toBeNull();
    expect(result.document.provenance.license.spdxExpression).toBe('NOASSERTION');
    expect(result.document.boundary).toEqual({ periodicAxes: [false, false, false], cell: null });
    expect(result.document.finiteSystem).toEqual({ netCharge: null, spinMultiplicity: null });
    expect(result.document.connections).toEqual([]);
    expect(result.document.atoms.every(a => a.isotope === null && a.formalCharge === null)).toBe(true);
    const sentinel = vi.fn((): never => { throw new Error('solver invoked'); });
    const receipt = createSolverAdmissionReceipt(result.document, result.validationReceipt, { classicalAtomistic: sentinel, machineLearnedInteratomic: sentinel, electronicStructure: sentinel });
    expect(sentinel).not.toHaveBeenCalled();
    for (const channel of receipt.channels) {
      expect(channel).toMatchObject({ decision: 'abstain', attempted: false, solverInvoked: false, backend: null });
      expect(Object.values(channel.outputs).every(value => value === null)).toBe(true);
    }
  });
  it('retains binary64 values, deterministic identity and native structure round-trip', () => {
    const input = '2\n<script>not source</script>\nH 1.00000001 5e-324 0e-999\nHe 1.00000002 -2.5 10000\n';
    const a = parse(input), b = parse(input);
    expect(a).toEqual(b);
    expect(a.document.atoms[0].position).toEqual({ x: 1.00000001, y: 5e-324, z: 0 });
    expect(Math.fround(a.document.atoms[0].position.x)).toBe(Math.fround(a.document.atoms[1].position.x));
    expect(a.document.atoms[0].position.x).not.toBe(a.document.atoms[1].position.x);
    expect(parseAndValidateStructureNativeJson(exportStructureNativeJson(a.document), 'x.tfstructure.json').document).toEqual(a.document);
    expect(parse(input.replace('0e-999', '0')).transportReceipt.rawSha256).not.toBe(a.transportReceipt.rawSha256);
  });
  it.each(['1\n\nH 0 0 0', '1\n\nH 0 0 0\n', '1\r\n\r\n H\t0 0 0 \r\n'])('accepts exact line grammar %j', text => {
    expect(parse(text).document.atoms).toHaveLength(1);
  });
  it('scans only endpoint ASCII spaces and tabs without trimming comment or accepting Unicode separators', () => {
    const result = parse(' \t1\t \n \tcomment kept \t\n \tH \t1  2\t3 \t');
    expect(result.document.atoms[0].position).toEqual({ x: 1, y: 2, z: 3 });
    expect(result.transportReceipt.comment).toBe(' \tcomment kept \t');
    expect(() => parse('\u00a01\n\nH 0 0 0')).toThrow();
    expect(() => parse('1\n\nH 0 0 0\u00a0')).toThrow();
  });
  it.each(['NaN', 'Infinity', '0x1', '-0', '-0e10', '1e-999', '1e999', '10000.1', '1_0', '1foo'])('rejects numeric token %s', token => {
    expect(() => parse(`1\n\nH ${token} 0 0`)).toThrow();
  });
  it.each(['0\n\n', '01\n\nH 0 0 0', '1\nH 0 0 0', '1\n\nH 0 0 0\n\n', '1\n\nH 0 0 0\n1\n\nH 0 0 0', '1\n\nH 0 0 0 extra', '1\n\nD 0 0 0', '1\r\n\nH 0 0\r0', '1\n\nH\u00a00 0 0'])('rejects malformed frame %j', text => {
    expect(() => parse(text)).toThrow();
  });
  it.each(['a=b', 'Properties=species:S:1:pos:R:3', 'Lattice=1', 'pbc=F', '\0', '\ufeff', '\u202e', '\u2066', '\u2028', '\u0085'])('rejects unsupported comment %j', comment => {
    expect(() => parse(`1\n${comment}\nH 0 0 0`)).toThrow();
  });
  it('enforces explicit interpretation, filenames, UTF8, BOM and exact bounds', () => {
    const raw = bytes('1\n\nH -10000 0 10000');
    expect(() => parseAndValidateXyz(raw, 'x.xyz', undefined as never)).toThrow();
    for (const name of ['x.XYZ', 'x.json', 'x\n.xyz', 'x'.repeat(253) + '.xyz']) expect(() => parseAndValidateXyz(raw, name, XYZ_INTERPRETATION)).toThrow();
    expect(parseAndValidateXyz(raw, 'x'.repeat(252) + '.xyz', XYZ_INTERPRETATION).document.atoms).toHaveLength(1);
    expect(() => parseAndValidateXyz(new Uint8Array([255]), null, XYZ_INTERPRETATION)).toThrow();
    expect(() => parse('\ufeff1\n\nH 0 0 0')).toThrow();
    const atoms = parse(`4096\n\n${Array.from({ length: 4096 }, (_, i) => `H ${i} 0 0`).join('\n')}`);
    expect(createStructureRenderModel(atoms.document).atoms.map(a => a.id)).toEqual(atoms.document.atoms.map(a => a.id));
    expect(() => parse(`4097\n\n${'H 0 0 0\n'.repeat(4097)}`)).toThrow();
    const skeleton = '1\n\nH 0 0 0';
    expect(parse('1\n' + 'a'.repeat(STRUCTURE_MAX_FILE_BYTES - bytes(skeleton).length) + '\nH 0 0 0').transportReceipt.byteLength).toBe(STRUCTURE_MAX_FILE_BYTES);
    expect(() => parseAndValidateXyz(new Uint8Array(STRUCTURE_MAX_FILE_BYTES + 1), null, XYZ_INTERPRETATION)).toThrow();
  });
});
