import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const HARNESS_ROOT = fileURLToPath(new URL('./', import.meta.url));
const REPOSITORY_ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const CLIENT_ENTRY = path.join(HARNESS_ROOT, 'client-v049/main.ts');
const INDEX_TEMPLATE = path.join(HARNESS_ROOT, 'client-v049/index.html');
const MAXIMUM_INDEX_BYTES = 64 * 1024;
const MAXIMUM_CLIENT_BYTES = 2 * 1024 * 1024;
const NODE_BUILTIN_SPECIFIERS = new Set(builtinModules.flatMap((specifier) => {
  const bare = specifier.startsWith('node:') ? specifier.slice(5) : specifier;
  return [bare, `node:${bare}`];
}));
const FORBIDDEN_SPECIFIERS = Object.freeze([
  'server-only',
  'openmm-world-session-loader',
  'private-position-trajectory-export-v049.server',
  'private-position-trajectory-loopback-server-v049',
  'private-openmm-webgl2-trajectory-harness-v049.server',
  'atomistic-private-position-trajectory-v048',
  'atomistic-private-trajectory-instancing-runtime-v048',
]);
const FORBIDDEN_CLIENT_TEXT = Object.freeze([
  'node:fs',
  'node:crypto',
  'server-only',
  'openmm-world-session-loader',
  'private-position-trajectory-export-v049.server',
  'private-position-trajectory-loopback-server-v049',
  'private-openmm-webgl2-trajectory-harness-v049.server',
  'atomistic-private-position-trajectory-v048',
  'atomistic-private-trajectory-instancing-runtime-v048',
  'sessionId',
  'sourcePositionsArtifactDigest',
  'sourcePositionsF64Digest',
  'sourceGeometryGate',
  'derivedGeometryGate',
  'probeDisplacement',
  'artifactRoot',
  'independentControlReceiptPath',
  'sourceRevision',
  'artifactManifestDigest',
  'controlReceiptDigest',
  'payloadBundleRoot',
  'velocityTemporalAlignment',
  'forceSemantics',
  'worldSessionMaterialization',
  'arrays/reference-a-positions',
  'arrays/reference-a-velocities',
  'arrays/reference-a-potential-forces',
  'independent-control-receipt.json',
  '.f64le',
  'sourceMappingURL=',
]);

/** Build the V049 private trajectory browser client entirely in memory. */
export async function buildPrivateBrowserTrajectoryClientV049() {
  const graphAudit = {
    moduleIds: new Set(),
    writeBundleHookInvoked: false,
  };
  const result = await build({
    configFile: false,
    root: REPOSITORY_ROOT,
    logLevel: 'silent',
    publicDir: false,
    plugins: [failClosedBrowserGraphPlugin(graphAudit)],
    build: {
      write: false,
      sourcemap: false,
      minify: false,
      target: 'es2022',
      cssCodeSplit: false,
      assetsInlineLimit: 0,
      reportCompressedSize: false,
      rollupOptions: {
        input: CLIENT_ENTRY,
        output: {
          format: 'es',
          codeSplitting: false,
          hoistTransitiveImports: false,
          entryFileNames: 'client.js',
          chunkFileNames: 'unexpected-[name].js',
          assetFileNames: 'unexpected-[name][extname]',
        },
      },
    },
  });
  const outputs = Array.isArray(result) ? result : [result];
  const items = outputs.flatMap((output) => output.output);
  const chunks = items.filter((item) => item.type === 'chunk');
  const assets = items.filter((item) => item.type === 'asset');
  if (chunks.length !== 1
    || items.length !== 1
    || chunks[0].fileName !== 'client.js'
    || chunks[0].isEntry !== true
    || chunks[0].facadeModuleId !== CLIENT_ENTRY
    || chunks[0].imports.length !== 0
    || chunks[0].dynamicImports.length !== 0
    || (chunks[0].implicitlyLoadedBefore?.length ?? 0) !== 0
    || (chunks[0].referencedFiles?.length ?? 0) !== 0
    || chunks[0].map != null
    || assets.length !== 0) {
    throw new Error('private trajectory browser client must be one in-memory JavaScript entry');
  }
  if (graphAudit.writeBundleHookInvoked) {
    throw new Error('private trajectory browser client invoked a filesystem write hook');
  }
  const moduleIds = Object.keys(chunks[0].modules);
  if (moduleIds.length < 1
    || moduleIds.some((id) => !graphAudit.moduleIds.has(id))) {
    throw new Error('private trajectory browser client module inventory changed after graph audit');
  }
  const clientJavaScript = chunks[0].code;
  const clientByteLength = Buffer.byteLength(clientJavaScript, 'utf8');
  if (clientByteLength < 1 || clientByteLength > MAXIMUM_CLIENT_BYTES) {
    throw new Error('private trajectory browser client output is outside its byte bound');
  }
  assertNoForbiddenClientText(clientJavaScript);
  const indexHtmlTemplate = readFileSync(INDEX_TEMPLATE, 'utf8');
  const indexByteLength = Buffer.byteLength(indexHtmlTemplate, 'utf8');
  const noncePlaceholderCount = countOccurrences(
    indexHtmlTemplate,
    '__TF_PRIVATE_CSP_NONCE__',
  );
  if (indexByteLength < 1 || indexByteLength > MAXIMUM_INDEX_BYTES
    || indexHtmlTemplate.includes('\0')
    || noncePlaceholderCount < 2
    || noncePlaceholderCount > 8
    || !indexHtmlTemplate.includes('src="/client.js"')) {
    throw new Error('private trajectory browser index is outside its locked transport boundary');
  }
  return Object.freeze({
    indexHtmlTemplate,
    clientJavaScript,
    audit: Object.freeze({
      schemaVersion: 'tf.private-browser-trajectory-client-build-audit/0.4.9',
      configFileLoaded: false,
      writtenToFilesystem: false,
      outputChunkCount: 1,
      outputAssetCount: 0,
      sourceModuleCount: moduleIds.length,
      clientByteLength,
      clientSha256: `sha256:${createHash('sha256')
        .update(clientJavaScript, 'utf8').digest('hex')}`,
      sourceMapsIncluded: false,
      writeBundleHookInvoked: false,
      nodeBuiltinsIncluded: false,
      privateV048SourceIncluded: false,
      privateLoaderIncluded: false,
      serverIncluded: false,
      publicDistributionEligible: false,
      cloudflareDistributionEligible: false,
    }),
  });
}

function failClosedBrowserGraphPlugin(graphAudit) {
  return {
    name: 'tf-private-browser-trajectory-graph-boundary-v049',
    enforce: 'pre',
    resolveId(source) {
      if (isForbiddenGraphReference(source)) {
        throw new Error(`private trajectory browser graph rejected import ${JSON.stringify(source)}`);
      }
      return null;
    },
    moduleParsed(moduleInfo) {
      const id = normalizeModuleId(moduleInfo.id);
      if (isForbiddenGraphReference(id)) {
        throw new Error('private trajectory browser graph reached a forbidden source module');
      }
      graphAudit.moduleIds.add(moduleInfo.id);
    },
    writeBundle() {
      graphAudit.writeBundleHookInvoked = true;
      throw new Error('private trajectory browser graph must never write its output');
    },
  };
}

function assertNoForbiddenClientText(clientJavaScript) {
  for (const needle of FORBIDDEN_CLIENT_TEXT) {
    if (clientJavaScript.includes(needle)) {
      throw new Error(`private trajectory browser client contains forbidden text ${needle}`);
    }
  }
}

function isForbiddenGraphReference(source) {
  if (typeof source !== 'string' || source.length < 1) return true;
  const normalized = normalizeModuleId(source);
  const withoutQuery = normalized.split(/[?#]/u, 1)[0];
  return NODE_BUILTIN_SPECIFIERS.has(withoutQuery)
    || normalized.startsWith('http:')
    || normalized.startsWith('https:')
    || normalized.startsWith('data:')
    || normalized.includes('.server.')
    || normalized.endsWith('.server')
    || normalized.includes('-v048')
    || FORBIDDEN_SPECIFIERS.some((specifier) => normalized.includes(specifier));
}

function normalizeModuleId(value) {
  return value.split(path.sep).join('/').replaceAll('\\', '/');
}

function countOccurrences(value, needle) {
  let count = 0;
  let offset = 0;
  while ((offset = value.indexOf(needle, offset)) !== -1) {
    count += 1;
    offset += needle.length;
  }
  return count;
}
