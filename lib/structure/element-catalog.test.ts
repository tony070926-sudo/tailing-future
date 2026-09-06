import { describe, expect, it } from 'vitest';
import catalogAsset from './data/iupac-element-identities-2022.json' with { type: 'json' };
import {
  ELEMENT_IDENTITIES,
  ELEMENT_IDENTITY_CATALOG_SEMANTIC_DIGEST,
  requireElementPair,
} from './element-catalog';

describe('identity-only IUPAC 118-element catalog', () => {
  it('locks exact continuous and unique identities plus primary-source evidence', () => {
    expect(ELEMENT_IDENTITIES).toHaveLength(118);
    expect(ELEMENT_IDENTITIES.map((entry) => entry.atomicNumber)).toEqual(
      Array.from({ length: 118 }, (_, index) => index + 1),
    );
    expect(new Set(ELEMENT_IDENTITIES.map((entry) => entry.symbol)).size).toBe(118);
    expect(new Set(ELEMENT_IDENTITIES.map((entry) => entry.name)).size).toBe(118);
    expect(ELEMENT_IDENTITIES[0]).toEqual({ atomicNumber: 1, symbol: 'H', name: 'hydrogen' });
    expect(ELEMENT_IDENTITIES[12]).toEqual({ atomicNumber: 13, symbol: 'Al', name: 'aluminium' });
    expect(ELEMENT_IDENTITIES[15]).toEqual({ atomicNumber: 16, symbol: 'S', name: 'sulfur' });
    expect(ELEMENT_IDENTITIES[54]).toEqual({ atomicNumber: 55, symbol: 'Cs', name: 'caesium' });
    expect(ELEMENT_IDENTITIES[117]).toEqual({ atomicNumber: 118, symbol: 'Og', name: 'oganesson' });
    expect(catalogAsset.source).toMatchObject({
      url: 'https://iupac.org/wp-content/uploads/2022/07/IUPAC_Periodic_Table-04May22_CRA.pdf',
      retrievedOn: '2026-09-06',
      artifactByteLength: 55_608,
      artifactSha256: 'sha256:ef6ca2f6d46554f96e30ad3a60693d6630fe45ad81ce83cb14e508c6cbb7d3b3',
      presentationRedistributed: false,
      derivedCatalogLicense: 'NOASSERTION',
    });
    expect(ELEMENT_IDENTITY_CATALOG_SEMANTIC_DIGEST).toBe('sha256:8c687f5aee2fd1379616e47546ea660feaeab8d78381b459f7c15b4ffbbfd0d0');
  });

  it('contains no accidental physical properties and rejects mismatched pairs', () => {
    const forbidden = /mass|weight|radius|color|abundance|isotope|valence|electronegativity/i;
    for (const entry of catalogAsset.elements) {
      expect(Object.keys(entry).some((key) => forbidden.test(key))).toBe(false);
    }
    expect(() => requireElementPair(8, 'O')).not.toThrow();
    expect(() => requireElementPair(8, 'N')).toThrow(/locked IUPAC catalog/);
    expect(() => requireElementPair(0, 'H')).toThrow();
    expect(Object.isFrozen(ELEMENT_IDENTITIES)).toBe(true);
    expect(ELEMENT_IDENTITIES.every(Object.isFrozen)).toBe(true);
  });
});
