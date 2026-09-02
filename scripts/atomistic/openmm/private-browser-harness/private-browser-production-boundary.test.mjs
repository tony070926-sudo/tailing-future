import {
  readdirSync,
  readFileSync,
  statSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const REPOSITORY_ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const PRODUCTION_ROOTS = [
  'app',
  'lib',
  'public',
];
const PRODUCTION_FILES = [
  'package.json',
  'next.config.ts',
  'vite.config.ts',
  '.openai/hosting.json',
];
const FORBIDDEN = [
  'TFP046P1',
  'TFP047P1',
  'tf.private-browser-webgl2-position-packet/0.4.6',
  'tf.private-browser-webgl2-observation/0.4.7',
  'private-browser-harness',
  'private-position-loopback-server-v046',
  'private-openmm-webgl2-harness-v046',
  'evaluation/latest-report.json',
];

describe('V047 private browser harness production isolation', () => {
  it('has no reverse import, marker, route, or binding in application and hosting sources', () => {
    const files = [];
    for (const relativeRoot of PRODUCTION_ROOTS) {
      const absoluteRoot = path.join(REPOSITORY_ROOT, relativeRoot);
      if (statSync(absoluteRoot).isDirectory()) collectTextFiles(absoluteRoot, files);
    }
    for (const relativePath of PRODUCTION_FILES) {
      const absolute = path.join(REPOSITORY_ROOT, relativePath);
      if (statSync(absolute).isFile()) files.push(absolute);
    }
    expect(files.length).toBeGreaterThan(20);
    for (const absolute of files) {
      const source = readFileSync(absolute, 'utf8');
      for (const needle of FORBIDDEN) {
        expect(source, `${path.relative(REPOSITORY_ROOT, absolute)} contains ${needle}`)
          .not.toContain(needle);
      }
    }
  });

  it('keeps generated browser code in memory and out of the harness source tree', () => {
    const harnessRoot = fileURLToPath(new URL('./', import.meta.url));
    const generated = readdirSync(harnessRoot, { recursive: true })
      .map((entry) => String(entry).split(path.sep).join('/'))
      .filter((entry) => entry === 'client.js'
        || entry.endsWith('/client.js')
        || entry.endsWith('.map'));
    expect(generated).toEqual([]);
  });
});

function collectTextFiles(directory, files) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      collectTextFiles(absolute, files);
    } else if (entry.isFile() && /\.(?:css|html|js|jsx|json|mjs|ts|tsx)$/.test(entry.name)) {
      files.push(absolute);
    }
  }
}
