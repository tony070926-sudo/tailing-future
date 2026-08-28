import { createHash } from 'node:crypto';

const ID_PATTERN = /^random-TP-[0-9]{6}$/;
const EXPECTED_UNITS = Object.freeze({
  energy_unit: 'eV',
  forces_unit: 'eV/A',
  stress_unit: 'eV/A^3',
});
const DECIMAL_PATTERN = /^[+-]?(?:(?:[0-9]+(?:\.[0-9]*)?)|(?:\.[0-9]+))(?:[eE][+-]?[0-9]+)?$/;
const EXPECTED_PROPERTIES = 'species:S:1:pos:R:3:forces:R:3';

const PERIODIC_SYMBOLS = Object.freeze([
  '', 'H', 'He', 'Li', 'Be', 'B', 'C', 'N', 'O', 'F', 'Ne', 'Na', 'Mg', 'Al', 'Si', 'P', 'S', 'Cl', 'Ar', 'K', 'Ca',
  'Sc', 'Ti', 'V', 'Cr', 'Mn', 'Fe', 'Co', 'Ni', 'Cu', 'Zn', 'Ga', 'Ge', 'As', 'Se', 'Br', 'Kr', 'Rb', 'Sr', 'Y', 'Zr',
  'Nb', 'Mo', 'Tc', 'Ru', 'Rh', 'Pd', 'Ag', 'Cd', 'In', 'Sn', 'Sb', 'Te', 'I', 'Xe', 'Cs', 'Ba', 'La', 'Ce', 'Pr', 'Nd',
  'Pm', 'Sm', 'Eu', 'Gd', 'Tb', 'Dy', 'Ho', 'Er', 'Tm', 'Yb', 'Lu', 'Hf', 'Ta', 'W', 'Re', 'Os', 'Ir', 'Pt', 'Au', 'Hg',
  'Tl', 'Pb', 'Bi', 'Po', 'At', 'Rn', 'Fr', 'Ra', 'Ac', 'Th', 'Pa', 'U', 'Np', 'Pu', 'Am', 'Cm', 'Bk', 'Cf', 'Es', 'Fm',
  'Md', 'No', 'Lr', 'Rf', 'Db', 'Sg', 'Bh', 'Hs', 'Mt', 'Ds', 'Rg', 'Cn', 'Nh', 'Fl', 'Mc', 'Lv', 'Ts', 'Og',
]);
const ATOMIC_NUMBER = new Map(PERIODIC_SYMBOLS.map((symbol, index) => [symbol, index]).slice(1));

export const RANDOM_TP_RECORD_DOMAIN = 'tf.random-tp.record/v1';
export const RANDOM_TP_RECORD_MANIFEST_DOMAIN = 'tf.random-tp.record-manifest/v1';

export function inspectRandomTp(buffer, smokeIds = []) {
  if (!Buffer.isBuffer(buffer)) throw new TypeError('Random-TP input must be a Buffer.');
  if (buffer.length === 0) throw new Error('Random-TP input is empty.');
  if (buffer.includes(0)) throw new Error('Random-TP input contains a NUL byte.');

  const lines = splitLines(buffer);
  const records = [];
  const ids = new Set();
  const elements = new Set();
  let cursor = 0;
  let atomTotal = 0;

  while (cursor < lines.length) {
    const frameStart = lines[cursor].start;
    const countLine = decodeLine(buffer, lines[cursor], cursor + 1).trim();
    if (!/^[1-9][0-9]*$/.test(countLine)) throw new Error(`Random-TP line ${cursor + 1} does not contain a positive atom count.`);
    const atomCount = Number(countLine);
    const headerIndex = cursor + 1;
    const finalAtomIndex = cursor + 1 + atomCount;
    if (finalAtomIndex >= lines.length) throw new Error(`Random-TP frame at line ${cursor + 1} is truncated.`);

    const header = decodeLine(buffer, lines[headerIndex], headerIndex + 1);
    const id = capture(header, /(?:^|\s)internal_id=([^\s]+)/, 'internal_id', headerIndex + 1);
    if (!ID_PATTERN.test(id)) throw new Error(`Random-TP frame has invalid internal_id ${JSON.stringify(id)}.`);
    if (ids.has(id)) throw new Error(`Random-TP contains duplicate internal_id ${id}.`);
    ids.add(id);

    for (const [key, expected] of Object.entries(EXPECTED_UNITS)) {
      const actual = capture(header, new RegExp(`(?:^|\\s)${key}=([^\\s]+)`), key, headerIndex + 1);
      if (actual !== expected) throw new Error(`${id}: expected ${key}=${expected}, received ${actual}.`);
    }
    if (capture(header, /(?:^|\s)Properties=([^\s]+)/, 'Properties', headerIndex + 1) !== EXPECTED_PROPERTIES) throw new Error(`${id}: unsupported or reordered Properties declaration.`);
    if (capture(header, /(?:^|\s)pbc="([^"]+)"/, 'pbc', headerIndex + 1) !== 'T T T') throw new Error(`${id}: Random-TP requires three-dimensional periodic boundary conditions.`);
    const lattice = numericVector(capture(header, /(?:^|\s)Lattice="([^"]+)"/, 'Lattice', headerIndex + 1), 9, `${id} lattice`);
    const stress = numericVector(capture(header, /(?:^|\s)stress="([^"]+)"/, 'stress', headerIndex + 1), 9, `${id} stress`);
    const energy = finiteNumber(capture(header, /(?:^|\s)energy=([^\s]+)/, 'energy', headerIndex + 1), `${id} energy`);
    const determinant = lattice[0] * (lattice[4] * lattice[8] - lattice[5] * lattice[7])
      - lattice[1] * (lattice[3] * lattice[8] - lattice[5] * lattice[6])
      + lattice[2] * (lattice[3] * lattice[7] - lattice[4] * lattice[6]);
    if (!Number.isFinite(determinant) || Math.abs(determinant) <= 1e-12) throw new Error(`${id}: lattice is singular.`);
    if (Math.abs(stress[1] - stress[3]) > 1e-12 || Math.abs(stress[2] - stress[6]) > 1e-12 || Math.abs(stress[5] - stress[7]) > 1e-12) throw new Error(`${id}: stress tensor is not symmetric.`);

    const atomicSymbols = [];
    const atomicNumbers = [];
    const positions = [];
    const forces = [];
    for (let offset = 0; offset < atomCount; offset += 1) {
      const lineIndex = cursor + 2 + offset;
      const fields = decodeLine(buffer, lines[lineIndex], lineIndex + 1).trim().split(/\s+/);
      if (fields.length !== 7 || !/^[A-Z][a-z]?$/.test(fields[0])) throw new Error(`${id}: invalid atom row at line ${lineIndex + 1}.`);
      const numericFields = fields.slice(1).map((value, index) => finiteNumber(value, `${id} atom ${offset} column ${index + 1}`));
      const atomicNumber = ATOMIC_NUMBER.get(fields[0]);
      if (!atomicNumber) throw new Error(`${id}: unknown element ${fields[0]} at atom ${offset}.`);
      atomicSymbols.push(fields[0]);
      atomicNumbers.push(atomicNumber);
      positions.push(...numericFields.slice(0, 3));
      forces.push(...numericFields.slice(3));
      elements.add(fields[0]);
    }

    const frameEnd = lines[finalAtomIndex].endWithNewline;
    const rawDigest = digest(buffer.subarray(frameStart, frameEnd));
    const atomicOrderDigest = digest(Buffer.from(`${atomicSymbols.join('\0')}\n`, 'utf8'));
    const recordDigest = scientificRecordDigest({ id, atomCount, atomicNumbers, lattice, positions, energy, forces, stress });
    records.push({
      id,
      atomCount,
      atomicOrderDigest,
      rawDigest,
      recordDigest,
      elements: [...new Set(atomicSymbols)].sort(),
      energy,
      lattice,
      stress,
    });
    atomTotal += atomCount;
    cursor = finalAtomIndex + 1;
  }

  const sortedRecords = [...records].sort((left, right) => left.id.localeCompare(right.id));
  const idSetSha256 = idSetDigest(sortedRecords.map((record) => record.id));
  const recordManifestSha256 = recordManifestDigest(sortedRecords);
  const smokeSet = new Set(smokeIds);
  if (smokeSet.size !== smokeIds.length) throw new Error('Random-TP smoke IDs must be unique.');
  const smokeRecords = sortedRecords.filter((record) => smokeSet.has(record.id));
  const smokeElements = new Set(smokeRecords.flatMap((record) => record.elements));
  const missingSmokeIds = smokeIds.filter((id) => !ids.has(id));
  if (missingSmokeIds.length > 0) throw new Error(`Random-TP smoke IDs are missing: ${missingSmokeIds.join(', ')}.`);
  const smokeManifestSha256 = idSetDigest(smokeRecords.map((record) => record.id));
  const smokeRecordManifestSha256 = recordManifestDigest(smokeRecords);

  return {
    frames: records.length,
    atoms: atomTotal,
    elements: elements.size,
    ids: sortedRecords.map((record) => record.id),
    records: sortedRecords,
    smokeElements: smokeElements.size,
    idSetSha256,
    recordManifestSha256,
    smokeManifestSha256,
    smokeRecordManifestSha256,
  };
}

export function idSetDigest(ids) {
  return digest(Buffer.from(`${[...ids].sort().join('\n')}\n`, 'utf8'));
}

export function recordManifestDigest(records) {
  const hash = createHash('sha256');
  hash.update(`${RANDOM_TP_RECORD_MANIFEST_DOMAIN}\0`, 'utf8');
  for (const record of [...records].sort((left, right) => left.id.localeCompare(right.id))) {
    hash.update(`${record.id}\0`, 'utf8');
    hash.update(Buffer.from(record.recordDigest.slice('sha256:'.length), 'hex'));
  }
  return `sha256:${hash.digest('hex')}`;
}

export function scientificRecordDigest({ id, atomCount, atomicNumbers, lattice, positions, energy, forces, stress }) {
  const chunks = [Buffer.from(`${RANDOM_TP_RECORD_DOMAIN}\0${id}\0`, 'utf8')];
  const count = Buffer.alloc(4);
  count.writeUInt32LE(atomCount);
  chunks.push(count);
  const numbers = Buffer.alloc(atomCount * 2);
  atomicNumbers.forEach((value, index) => numbers.writeUInt16LE(value, index * 2));
  chunks.push(numbers, Buffer.from([1, 1, 1]));
  chunks.push(float64Buffer([...lattice, ...positions, energy, ...forces, ...stress]));
  return digest(Buffer.concat(chunks));
}

function splitLines(buffer) {
  const lines = [];
  let start = 0;
  for (let index = 0; index < buffer.length; index += 1) {
    if (buffer[index] !== 0x0a) continue;
    const end = index > start && buffer[index - 1] === 0x0d ? index - 1 : index;
    lines.push({ start, end, endWithNewline: index + 1 });
    start = index + 1;
  }
  if (start < buffer.length) lines.push({ start, end: buffer.length, endWithNewline: buffer.length });
  return lines;
}

function decodeLine(buffer, line, lineNumber) {
  const value = buffer.toString('utf8', line.start, line.end);
  if (Buffer.byteLength(value, 'utf8') !== line.end - line.start) throw new Error(`Random-TP line ${lineNumber} is not valid UTF-8.`);
  return value;
}

function capture(value, pattern, label, lineNumber) {
  const match = value.match(pattern);
  if (!match) throw new Error(`Random-TP line ${lineNumber} is missing ${label}.`);
  return match[1];
}

function numericVector(value, expectedLength, label) {
  const entries = value.trim().split(/\s+/).map((entry) => finiteNumber(entry, label));
  if (entries.length !== expectedLength) throw new Error(`${label} must contain ${expectedLength} finite numbers.`);
  return entries;
}

function finiteNumber(value, label) {
  if (typeof value !== 'string' || !DECIMAL_PATTERN.test(value)) throw new Error(`${label} is not a canonical decimal number.`);
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} is not finite.`);
  return parsed;
}

function float64Buffer(values) {
  const output = Buffer.alloc(values.length * 8);
  values.forEach((value, index) => output.writeDoubleLE(Object.is(value, -0) ? 0 : value, index * 8));
  return output;
}

function digest(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}
