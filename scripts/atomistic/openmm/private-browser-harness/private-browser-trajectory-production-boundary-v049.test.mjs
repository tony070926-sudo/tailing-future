import {
  readdirSync,
  readFileSync,
  statSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const REPOSITORY_ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const PRODUCTION_SOURCE_ROOTS = Object.freeze([
  'app',
  'public',
]);
const HOSTING_AND_BUILD_CONFIGS = Object.freeze([
  '.openai/hosting.json',
  'package.json',
  'next.config.ts',
  'vite.config.ts',
]);
const BROWSER_SAFE_V049_LIBRARIES = Object.freeze([
  'lib/simulation/atomistic-private-browser-position-trajectory-v049.ts',
  'lib/molecular/atomistic-private-browser-trajectory-instancing-runtime-v049.ts',
]);
const FORBIDDEN_V049_PRODUCTION_MARKERS = Object.freeze([
  'TFP049T1',
  'tf.atomistic-private-browser-position-frame/0.4.9',
  'tf.atomistic-private-browser-position-frame-order/0.4.9',
  'tf.atomistic-private-browser-position-trajectory-revocation/0.4.9',
  'tf.atomistic-private-browser-position-trajectory/0.4.9',
  'tf.atomistic-private-browser-trajectory-instancing-plan/0.4.9',
  'tf.atomistic-private-browser-trajectory-instancing-runtime/0.4.9',
  'tf.atomistic-private-browser-trajectory-instancing-snapshot/0.4.9',
  'tf.atomistic-private-browser-trajectory-instancing-update/0.4.9',
  'tf.private-browser-trajectory-client-build-audit/0.4.9',
  'tf.private-chromium-runtime-lock/0.4.9',
  'tf.private-browser-webgl2-trajectory-observation/0.4.9',
  'tf.private-position-trajectory-loopback-server/0.4.9',
  'tf.private-openmm-position-trajectory-packet-export/0.4.9',
  'private-position-trajectory-envelope-v049',
  'private-position-trajectory-export-v049',
  'private-position-trajectory-loopback-server-v049',
  'private-openmm-webgl2-trajectory-harness-v049',
  'build-private-browser-trajectory-client-v049',
  'chromium-v049-lock',
  'startPrivatePositionTrajectoryLoopbackServerV049',
  'exportPrivateOpenMmPositionTrajectoryPacketV049',
  'X-Private-Packet-Digest',
  '__TF_PRIVATE_CSP_NONCE__',
  'sourceOwnerRevocationReceipt',
  'privateTrajectoryMetadataDigest',
  '/trajectory',
]);

describe('V049 private trajectory browser path production boundary', () => {
  it('keeps V049 magic, schemas, modules, route, and bindings out of production sources',
    () => {
      const productionFiles = [];
      for (const relativeRoot of PRODUCTION_SOURCE_ROOTS) {
        collectTextFiles(path.join(REPOSITORY_ROOT, relativeRoot), productionFiles);
      }
      for (const relativePath of HOSTING_AND_BUILD_CONFIGS) {
        const absolute = path.join(REPOSITORY_ROOT, relativePath);
        expect(statSync(absolute).isFile(), `${relativePath} must remain a regular file`).toBe(true);
        productionFiles.push(absolute);
      }
      expect(productionFiles.length).toBeGreaterThan(10);

      for (const absolute of productionFiles) {
        const source = readFileSync(absolute, 'utf8');
        const relativePath = path.relative(REPOSITORY_ROOT, absolute);
        for (const marker of FORBIDDEN_V049_PRODUCTION_MARKERS) {
          expect(source, `${relativePath} contains private V049 marker ${marker}`)
            .not.toContain(marker);
        }
      }
    });

  it('keeps browser-safe V049 model libraries in lib and outside the source exclusion scope',
    () => {
      for (const relativePath of BROWSER_SAFE_V049_LIBRARIES) {
        const absolute = path.join(REPOSITORY_ROOT, relativePath);
        expect(statSync(absolute).isFile(), `${relativePath} must remain available`).toBe(true);
      }
      expect(PRODUCTION_SOURCE_ROOTS).not.toContain('lib');
    });

  it('leaves no generated client, source map, or trajectory packet in the private harness tree',
    () => {
      const harnessRoot = fileURLToPath(new URL('./', import.meta.url));
      const generatedArtifacts = readdirSync(harnessRoot, { recursive: true })
        .map((entry) => String(entry).split(path.sep).join('/'))
        .filter((entry) => {
          const lower = entry.toLowerCase();
          return lower === 'client.js'
            || lower.endsWith('/client.js')
            || lower.endsWith('.map')
            || lower.endsWith('.packet')
            || lower.endsWith('.packet.bin')
            || lower.endsWith('.tfp049')
            || lower.endsWith('.bin');
        });
      expect(generatedArtifacts).toEqual([]);
    });
});

function collectTextFiles(directory, files) {
  expect(statSync(directory).isDirectory(), `${directory} must be a directory`).toBe(true);
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      collectTextFiles(absolute, files);
    } else if (entry.isFile() && /\.(?:css|html|js|jsx|json|mjs|ts|tsx)$/.test(entry.name)) {
      files.push(absolute);
    }
  }
}
