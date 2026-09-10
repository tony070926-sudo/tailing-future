import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, normalize, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';

const productionPaths = [
  ...walkProductionFiles('lib/structure'),
  'app/components/custom-structure-webgl.tsx',
  'app/components/custom-structure-workbench.tsx',
  'app/components/custom-ar-dynamics-controls.tsx',
  'app/components/custom-ar-branch-comparison.tsx',
  // Explicit action 0.1: only the existing pure radial formula and its exact imports.
  'lib/simulation/periodic-potentials.ts',
  'lib/molecular/molecular-interactions.ts',
  'lib/simulation/digest.ts',
].sort();
const customSources = productionPaths.map((path) => ({ path, source: readFileSync(path, 'utf8') }));
const allowedExternalImports = new Set([
  '@noble/hashes/sha256',
  '@noble/hashes/utils',
  'react',
  'three',
  'three/addons/controls/OrbitControls.js',
]);

describe('custom structure explicit single-point and bounded dynamics with static rendering', () => {
  it('walks the complete production import graph through an explicit allowlist', () => {
    expect(productionPaths).toContain('lib/structure/canonical-json.ts');
    expect(productionPaths).toContain('lib/structure/strict-json.ts');
    expect(productionPaths).toContain('lib/structure/element-catalog.ts');
    expect(productionPaths).toContain('lib/structure/data/iupac-element-identities-2022.json');
    const productionAbsolutePaths = new Set(productionPaths.map((path) => normalize(resolve(path))));
    for (const { path, source } of customSources) {
      for (const specifier of importSpecifiers(source)) {
        if (allowedExternalImports.has(specifier)) continue;
        const target = resolveProductionImport(path, specifier);
        expect(target, `${path} imports non-allowlisted ${specifier}`).not.toBeNull();
        expect(productionAbsolutePaths.has(normalize(target!)), `${path} reaches ${specifier}`).toBe(true);
      }
    }
  });

  it('allows the finite Ar radial kernel and bounded dynamics adapter without other solver adaptation', () => {
    const inherited = {
      'lib/simulation/periodic-potentials.ts': 'fe772e235558d19c4b38efda6bd9936b2c790e7fb8a0bce940d71c7aca944765',
      'lib/molecular/molecular-interactions.ts': '31174d60fca0b1ff071f22207ca23e1e4722e222a17e128a0b5d37e2378ab7e0',
      'lib/simulation/digest.ts': 'a671ae7c6b0d2dc34fa97f19f4ac677c8e97337ea46ca0cf760420b67fe74cc0',
    };
    for (const [path, digest] of Object.entries(inherited)) expect(createHash('sha256').update(readFileSync(path)).digest('hex')).toBe(digest);
    const kernel = readFileSync('lib/simulation/periodic-potentials.ts', 'utf8');
    expect(kernel.match(/^import[^\n]+$/gm)).toEqual([
      "import type { Vector3 } from '../molecular/molecular-interactions.ts';",
      "import { COULOMB_CONSTANT_KJ_MOL_ANGSTROM_E2 } from '../molecular/molecular-interactions.ts';",
    ]);
    const forbidden = [
      'molecular-world', 'periodic-atomistic-world', 'aqueous-dynamics-world',
      'OpenMM', 'MatterSim', 'MACE', 'DFT', 'LennardJonesSimulation', 'VelocityVerlet',
    ];
    for (const { path, source } of customSources) {
      for (const token of forbidden) {
        // Only unchanged inherited parameter-source prose; no OpenMM invocation import.
        if (token === 'OpenMM' && path === 'lib/molecular/molecular-interactions.ts') continue;
        expect(source, `${path} contains ${token}`).not.toContain(token);
      }
    }
  });

  it('admits the comparison edges without admitting the host, another solver or external capabilities', () => {
    const productionAbsolutePaths = new Set(productionPaths.map((path) => normalize(resolve(path))));
    const admitted = (importer: string, specifier: string) => {
      if (allowedExternalImports.has(specifier)) return true;
      const target = resolveProductionImport(importer, specifier);
      return target !== null && productionAbsolutePaths.has(normalize(target));
    };
    const component = 'app/components/custom-ar-branch-comparison.tsx';
    expect(productionPaths).toContain(component);
    expect(productionPaths).toContain('lib/structure/custom-ar-branch-comparison.ts');
    expect(admitted('app/components/custom-ar-dynamics-controls.tsx', './custom-ar-branch-comparison')).toBe(true);
    expect(admitted(component, '@/lib/structure/custom-ar-branch-comparison')).toBe(true);
    for (const specifier of ['./molecular-lab', '../../lib/simulation/aqueous-dynamics-world']) {
      expect(resolveProductionImport(component, specifier)).not.toBeNull();
      expect(admitted(component, specifier)).toBe(false);
    }
    for (const specifier of ['node:fs', '@/lib/simulation/aqueous-dynamics-world', '@/scripts/evaluate']) {
      expect(resolveProductionImport(component, specifier)).toBeNull();
      expect(admitted(component, specifier)).toBe(false);
    }
  });

  it('contains no interval, animation loop, damping, auto-rotate, or recursive RAF loop', () => {
    const webgl = customSources.find((entry) => entry.path.endsWith('custom-structure-webgl.tsx'))!.source;
    expect(webgl).not.toContain('setInterval');
    expect(webgl).not.toContain('setAnimationLoop');
    expect(webgl).not.toContain('enableDamping = true');
    expect(webgl).not.toContain('autoRotate = true');
    const rafBody = webgl.slice(webgl.indexOf('window.requestAnimationFrame(() => {'), webgl.indexOf('window.requestAnimationFrame(() => {') + 500);
    expect(rafBody).not.toContain('requestStaticRender()');
  });

  it('integrates one fifth entry after the four existing molecular scenes', () => {
    const host = readFileSync('app/components/molecular-lab.tsx', 'utf8');
    const existingFourth = host.indexOf('className="aqueous-solver-entry"');
    const fifth = host.indexOf('className="custom-structure-entry"');
    expect(existingFourth).toBeGreaterThan(0);
    expect(fifth).toBeGreaterThan(existingFourth);
    expect(host.slice(fifth, fifth + 400)).toContain('STRUCTURE ONLY · SOLVER NOT RUN');
    const handler = host.slice(host.indexOf('const openCustomStructure'), host.indexOf('const openCustomStructure') + 400);
    expect(handler).toContain('setIsScanPlaying(false)');
    expect(handler).toContain('setIsTrajectoryPlaying(false)');
  });
});

function walkProductionFiles(directory: string): string[] {
  const paths: string[] = [];
  for (const name of readdirSync(directory)) {
    const path = `${directory}/${name}`;
    if (statSync(path).isDirectory()) paths.push(...walkProductionFiles(path));
    else if (!name.includes('.test.') && ['.ts', '.tsx', '.json'].includes(extname(name))) paths.push(path);
  }
  return paths;
}

function importSpecifiers(source: string): string[] {
  return [
    ...source.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g),
    ...source.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g),
    ...source.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm),
  ].map((match) => match[1]);
}

function resolveProductionImport(importer: string, specifier: string): string | null {
  let unresolved: string;
  if (specifier.startsWith('@/lib/structure/')) {
    unresolved = specifier.slice(2);
  } else if (specifier === './custom-structure-webgl') {
    unresolved = `${dirname(importer)}/custom-structure-webgl`;
  } else if (specifier.startsWith('.')) {
    unresolved = resolve(dirname(importer), specifier);
  } else {
    return null;
  }
  const absolute = resolve(unresolved);
  for (const suffix of ['', '.ts', '.tsx', '.json']) {
    const candidate = `${absolute}${suffix}`;
    if (productionFileExists(candidate)) return candidate;
  }
  return null;
}

function productionFileExists(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}
