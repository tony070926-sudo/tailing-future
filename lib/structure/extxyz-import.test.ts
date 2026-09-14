import { describe, expect, it } from 'vitest';
import { EXTXYZ_INTERPRETATION, parseAndValidateExtXyz } from './extxyz-import';
import { ELEMENT_IDENTITIES } from './element-catalog';
import { sha256DigestBytes } from './canonical-json';
import { exportStructureNativeJson, parseAndValidateStructureNativeJson } from './structure-document';
import { createStructureRenderModel } from './structure-render-model';
import { STRUCTURE_MAX_FILE_BYTES } from './strict-json';

const bytes = (s: string) => new TextEncoder().encode(s);
const header = 'Properties=species:S:1:pos:R:3 pbc="F F F"';
const parse = (s: string) => parseAndValidateExtXyz(bytes(s), 'input.extxyz', EXTXYZ_INTERPRETATION);
const frame = (h = header, row = 'H 0 0 0') => `1\n${h}\n${row}\n`;

describe('tf.extxyz-geometry/0.1 bounded geometry profile', () => {
  it('reports the refused field/type and scans only endpoint ASCII whitespace', () => {
    expect(() => parse(frame(`${header} energy=-5`))).toThrow('header key energy is unsupported by tf.extxyz-geometry/0.1');
    expect(() => parse(frame('Properties=species:S:1:pos:R:3:forces:R:3 pbc="F F F"'))).toThrow('Properties field forces is unsupported');
    expect(() => parse(frame('Properties=species:S:1:pos:I:3 pbc="F F F"'))).toThrow('Properties field pos requires R:3');
    expect(() => parse(frame(`${header} pbc="F F F"`))).toThrow('duplicate header key pbc');
    expect(() => parse(frame('Properties=species:S:1:pos:R:3:pos:R:3 pbc="F F F"'))).toThrow('duplicate Properties field pos');
    expect(parse(` \t1\t \n${header}\n \tH${' '.repeat(65536)}1 2 3\t `).document.atoms[0].position).toEqual({ x: 1, y: 2, z: 3 });
    expect(() => parse(`\u00a01\n${header}\nH 0 0 0`)).toThrow();
  });
  it('preserves all 118 identities by species and Z, without scientific admission', () => {
    for (const property of ['species:S:1', 'Z:I:1', 'species:S:1:Z:I:1']) {
      const rows = ELEMENT_IDENTITIES.map(e => `${property.startsWith('species') ? e.symbol : e.atomicNumber}${property.includes(':Z:') ? ` ${e.atomicNumber}` : ''} 0 -1.25 2e-2`);
      const result = parse(`118\nProperties=${property}:pos:R:3 pbc="F F F"\n${rows.join('\n')}`);
      expect(result.document.atoms.map(a => a.element)).toEqual(ELEMENT_IDENTITIES.map(({ symbol, atomicNumber }) => ({ symbol, atomicNumber })));
      expect(result.document.boundary).toEqual({ periodicAxes: [false, false, false], cell: null });
      expect(result.document.provenance.source).toBeNull();
      expect(result.document.connections).toEqual([]);
      expect(result.document.atoms.every(a => a.formalCharge === null && a.isotope === null)).toBe(true);
      for (const c of result.solverAdmissionReceipt.channels) {
        expect(c).toMatchObject({ decision: 'abstain', attempted: false, solverInvoked: false, backend: null });
        expect(Object.values(c.outputs).every(v => v === null)).toBe(true);
      }
    }
  });
  it('maps nonorthogonal consecutive lattice triples to a,b,c columns without wrapping', () => {
    const r = parse(frame('pbc="T T T" Lattice="2 0 0 1 3 0 -1 0.5 4" Properties=pos:R:3:id:S:1:Z:I:1', '5 -2 9 source.A 8'));
    expect(r.document.boundary.cell?.vectors).toEqual([[2, 0, 0], [1, 3, 0], [-1, 0.5, 4]]);
    expect(r.document.atoms[0]).toMatchObject({ id: 'source.A', position: { x: 5, y: -2, z: 9 }, element: { symbol: 'O', atomicNumber: 8 } });
    expect(r.document.finiteSystem).toBeNull();
    const model = createStructureRenderModel(r.document);
    expect(model.atoms[0].id).toBe('source.A');
    expect(model.cellEdges).toHaveLength(12);
    const corners = new Set(model.cellEdges.flatMap(e => [JSON.stringify(e.exactRepresentativeStartAngstrom), JSON.stringify(e.exactRepresentativeEndAngstrom)]));
    expect(corners).toEqual(new Set([[0, 0, 0], [2, 0, 0], [1, 3, 0], [-1, 0.5, 4], [3, 3, 0], [1, 0.5, 4], [0, 3.5, 4], [2, 3.5, 4]].map(v => JSON.stringify(v))));
    const [a, b, c] = r.document.boundary.cell!.vectors;
    const volumeCubicAngstrom = a[0] * (b[1] * c[2] - b[2] * c[1]) - b[0] * (a[1] * c[2] - a[2] * c[1]) + c[0] * (a[1] * b[2] - a[2] * b[1]);
    expect(volumeCubicAngstrom).toBe(24);
    expect(r.transportReceipt.atomIdentity).toContain('source-declared-unverified');
  });
  it('preserves binary64, CRLF raw digest, exact header and native geometry round-trip', () => {
    const raw = `2\r\n ${header} \t\r\nH 1.00000001 5e-324 0e-999\r\nHe 1.00000002 -2.5 10000\r\n`;
    const r = parse(raw);
    expect(r).toEqual(parse(raw));
    expect(r.transportReceipt.rawHeader).toBe(` ${header} \t`);
    expect(r.transportReceipt.rawSha256).toBe(sha256DigestBytes(bytes(raw)));
    expect(r.transportReceipt.rawSha256).not.toBe(parse(raw.replaceAll('\r\n', '\n')).transportReceipt.rawSha256);
    expect(r.document.atoms[0].position).toEqual({ x: 1.00000001, y: 5e-324, z: 0 });
    expect(r.document.atoms[0].position.x).not.toBe(r.document.atoms[1].position.x);
    expect(parseAndValidateStructureNativeJson(exportStructureNativeJson(r.document), 'x.tfstructure.json').document).toEqual(r.document);
    expect(r.transportReceipt.nativeExportLoss).toContain('not-exported');
    expect(Object.isFrozen(r.transportReceipt)).toBe(true);
  });
  it('keeps explicit IDs paired across reordered rows and Properties; no-ID rows are generated', () => {
    const a = parse('2\nProperties=species:S:1:pos:R:3:id:S:1 pbc="F F F"\nH 1 2 3 alpha\nHe 4 5 6 beta');
    const b = parse('2\nProperties=id:S:1:pos:R:3:species:S:1 pbc="F F F"\nbeta 4 5 6 He\nalpha 1 2 3 H');
    expect([...a.document.atoms].sort((a, b) => a.id.localeCompare(b.id))).toEqual([...b.document.atoms].sort((a, b) => a.id.localeCompare(b.id)));
    expect(parse(frame()).document.atoms[0].id).toBe('extxyz-row-0001');
  });
  it.each(['energy=0', 'force="0 0 0"', 'stress=0', 'charge=0', 'spin=1', 'units=angstrom', 'source=x', 'foo=bar', 'pbc="F F F"', 'Properties=species:S:1:pos:R:3'])('rejects additional metadata %s', extra => {
    expect(() => parse(frame(`${header} ${extra}`))).toThrow();
  });
  it.each(['forces:R:3', 'energy:R:1', 'charge:R:1', 'spin:I:1', 'stress:R:9', 'foo:S:1', 'species:S:1', 'id:I:1', 'pos:I:3', 'id:S:2'])('rejects unsupported/duplicate Properties %s', extra => {
    const name = extra.split(':')[0];
    const diagnostic = name === 'species' || name === 'pos' ? `duplicate Properties field ${name}`
      : name === 'id' ? 'Properties field id requires S:1'
        : `Properties field ${name} is unsupported by tf.extxyz-geometry/0.1`;
    expect(() => parse(frame(`Properties=species:S:1:pos:R:3:${extra} pbc="F F F"`, 'H 0 0 0 0 0 0 0 0 0 0 0 0'))).toThrow(diagnostic);
  });
  it.each(['', 'Properties=species:S:1:pos:R:3', 'pbc="F F F"', 'Properties=species:S:1:pos:R:3 pbc="T F T"', 'Properties=species:S:1:pos:R:3 pbc=FFF', 'Properties=species:S:1:pos:R:3 pbc="T T T"', `${header} Lattice="1 0 0 0 1 0 0 0 1"`, `${header}garbage`, `${header} foo`, `${header}\\`, `${header}\u202e`, `Properties='species:S:1:pos:R:3' pbc="F F F"`])('rejects incomplete/unsafe header %j', h => {
    expect(() => parse(frame(h))).toThrow();
  });
  it.each(['1 0 0 0 1 0 0 0 -1', '1 0 0 0 1 0 0 0 0', '1 0 0 0 1 0 0 0', '1 0 0 0 1 0 0 0 NaN', '1 0 0 0 1 0 0 0 1e-999'])('rejects invalid cell %s', lattice => {
    expect(() => parse(frame(`Properties=species:S:1:pos:R:3 pbc="T T T" Lattice="${lattice}"`))).toThrow();
  });
  it.each(['NaN', 'Infinity', '-0', '-0e10', '1e-999', '1e999', '10000.1', '0x10', '1_0', '1foo'])('rejects numeric %s', n => expect(() => parse(frame(header, `H ${n} 0 0`))).toThrow());
  it.each(['H 0 0 0 extra', 'H 0 0', 'h 0 0 0', 'D 0 0 0', 'H\u00a00 0 0', 'H 0 0 0\u0000'])('rejects row grammar %j', row => expect(() => parse(frame(header, row))).toThrow());
  it('rejects duplicate/bad IDs and contradictory/noncanonical Z', () => {
    for (const row of ['H 2 0 0 0', 'H 01 0 0 0', 'H 119 0 0 0']) expect(() => parse(frame('Properties=species:S:1:Z:I:1:pos:R:3 pbc="F F F"', row))).toThrow();
    for (const id of ['1bad', '__proto__', 'a'.repeat(65)]) expect(() => parse(frame('Properties=species:S:1:pos:R:3:id:S:1 pbc="F F F"', `H 0 0 0 ${id}`))).toThrow();
    expect(() => parse(`2\nProperties=species:S:1:pos:R:3:id:S:1 pbc="F F F"\nH 0 0 0 same\nHe 1 0 0 same`)).toThrow();
  });
  it('enforces exact byte/count/header/UTF8/line limits and explicit interpretation', () => {
    const input = bytes(frame());
    expect(() => parseAndValidateExtXyz(input, null, undefined as never)).toThrow();
    for (const name of ['x.XYZ', 'x.json', 'x\n.xyz', 'x'.repeat(257) + '.xyz']) expect(() => parseAndValidateExtXyz(input, name, EXTXYZ_INTERPRETATION)).toThrow();
    expect(parseAndValidateExtXyz(input, 'x.xyz', EXTXYZ_INTERPRETATION).document.atoms).toHaveLength(1);
    expect(() => parseAndValidateExtXyz(new Uint8Array([255]), null, EXTXYZ_INTERPRETATION)).toThrow();
    expect(() => parseAndValidateExtXyz(new Uint8Array(STRUCTURE_MAX_FILE_BYTES + 1), null, EXTXYZ_INTERPRETATION)).toThrow();
    for (const s of ['\ufeff' + frame(), frame() + '\n', frame() + frame(), frame().replace('1\n', '01\n'), frame().replace('1\n', '0\n'), frame().replace('H 0', 'H\r0')]) expect(() => parse(s)).toThrow();
    expect(parse(frame(header.padEnd(8192, ' '))).transportReceipt.rawHeader).toHaveLength(8192);
    expect(() => parse(frame(header.padEnd(8193, ' ')))).toThrow();
    expect(parse(`4096\n${header}\n${'H 0 0 0\n'.repeat(4096)}`).document.atoms).toHaveLength(4096);
    expect(() => parse(`4097\n${header}\n${'H 0 0 0\n'.repeat(4097)}`)).toThrow();
  });
});
