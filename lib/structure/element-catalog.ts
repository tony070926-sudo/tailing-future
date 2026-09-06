import catalogAsset from './data/iupac-element-identities-2022.json';
import { sha256DigestValue } from './canonical-json';

export type ElementIdentity = Readonly<{
  atomicNumber: number;
  symbol: string;
  name: string;
}>;

const forbiddenPhysicalKeys = new Set([
  'abundance', 'atomicMass', 'atomicRadius', 'atomicWeight', 'color', 'covalentRadius',
  'electronegativity', 'isotope', 'isotopes', 'mass', 'radius', 'valence', 'weight',
]);

function assertCatalog(): readonly ElementIdentity[] {
  const entries = catalogAsset.elements;
  if (entries.length !== 118) throw new Error('Element identity catalog must contain exactly 118 entries.');
  const symbols = new Set<string>();
  const names = new Set<string>();
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (entry.atomicNumber !== index + 1) throw new Error('Element atomic numbers must be exactly 1 through 118.');
    if (!/^[A-Z][a-z]?$/.test(entry.symbol) || symbols.has(entry.symbol)) {
      throw new Error(`Invalid or duplicate element symbol: ${entry.symbol}`);
    }
    if (!/^[a-z]+$/.test(entry.name) || names.has(entry.name)) {
      throw new Error(`Invalid or duplicate IUPAC English name: ${entry.name}`);
    }
    const physicalKey = Object.keys(entry).find((key) => forbiddenPhysicalKeys.has(key));
    if (physicalKey) throw new Error(`Physical property ${physicalKey} is forbidden in the identity catalog.`);
    if (Object.keys(entry).sort().join(',') !== 'atomicNumber,name,symbol') {
      throw new Error('Element catalog entries are identity-only closed records.');
    }
    symbols.add(entry.symbol);
    names.add(entry.name);
  }
  return entries.map((entry) => Object.freeze({ ...entry }));
}

export const ELEMENT_IDENTITIES = Object.freeze(assertCatalog());
const elementByAtomicNumber = new Map(
  ELEMENT_IDENTITIES.map((entry) => [entry.atomicNumber, entry] as const),
);

export const ELEMENT_IDENTITY_CATALOG_SEMANTIC_DIGEST = sha256DigestValue({
  schemaVersion: catalogAsset.schemaVersion,
  elements: ELEMENT_IDENTITIES,
});

export function requireElementPair(atomicNumber: number, symbol: string): ElementIdentity {
  const identity = elementByAtomicNumber.get(atomicNumber);
  if (!identity || identity.symbol !== symbol) {
    throw new RangeError(`Element pair Z=${atomicNumber}, symbol=${symbol} is not in the locked IUPAC catalog.`);
  }
  return identity;
}
