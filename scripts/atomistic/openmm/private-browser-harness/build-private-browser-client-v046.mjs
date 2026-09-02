import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const HARNESS_ROOT = fileURLToPath(new URL('./', import.meta.url));
const REPOSITORY_ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const CLIENT_ENTRY = path.join(HARNESS_ROOT, 'client/main.ts');
const INDEX_TEMPLATE = path.join(HARNESS_ROOT, 'client/index.html');
const MAXIMUM_CLIENT_BYTES = 2 * 1024 * 1024;
const FORBIDDEN_SPECIFIERS = [
  'server-only',
  'openmm-world-session-loader',
  'private-position-export-v046.server',
  'private-position-loopback-server-v046',
];

/** Build the harness client entirely in memory with no root Vite config. */
export async function buildPrivateBrowserClientV047() {
  const result = await build({
    configFile: false,
    root: REPOSITORY_ROOT,
    logLevel: 'silent',
    publicDir: false,
    plugins: [failClosedBrowserGraphPlugin()],
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
    || chunks[0].fileName !== 'client.js'
    || chunks[0].isEntry !== true
    || chunks[0].dynamicImports.length !== 0
    || assets.length !== 0) {
    throw new Error('private browser client must build as one in-memory JavaScript entry');
  }
  const clientJavaScript = chunks[0].code;
  const clientBytes = Buffer.byteLength(clientJavaScript, 'utf8');
  if (clientBytes < 1 || clientBytes > MAXIMUM_CLIENT_BYTES) {
    throw new Error('private browser client output is outside its byte bound');
  }
  assertNoForbiddenClientText(clientJavaScript);
  const indexHtmlTemplate = readFileSync(INDEX_TEMPLATE, 'utf8');
  if (!indexHtmlTemplate.includes('__TF_PRIVATE_CSP_NONCE__')
    || !indexHtmlTemplate.includes('src="/client.js"')) {
    throw new Error('private browser index template lost its nonce or fixed entry route');
  }
  return Object.freeze({
    indexHtmlTemplate,
    clientJavaScript,
    audit: Object.freeze({
      schemaVersion: 'tf.private-browser-client-build-audit/0.4.7',
      configFileLoaded: false,
      writtenToFilesystem: false,
      outputChunkCount: 1,
      outputAssetCount: 0,
      sourceModuleCount: Object.keys(chunks[0].modules).length,
      clientByteLength: clientBytes,
      clientSha256: `sha256:${createHash('sha256')
        .update(clientJavaScript, 'utf8').digest('hex')}`,
      sourceMapsIncluded: false,
      nodeBuiltinsIncluded: false,
      privateLoaderIncluded: false,
      serverIncluded: false,
      publicDistributionEligible: false,
      cloudflareDistributionEligible: false,
    }),
  });
}

function failClosedBrowserGraphPlugin() {
  return {
    name: 'tf-private-browser-graph-boundary-v047',
    enforce: 'pre',
    resolveId(source) {
      if (source.startsWith('node:')
        || FORBIDDEN_SPECIFIERS.some((specifier) => source.includes(specifier))) {
        throw new Error(`private browser graph rejected server import ${JSON.stringify(source)}`);
      }
      return null;
    },
    moduleParsed(moduleInfo) {
      const id = moduleInfo.id.split(path.sep).join('/');
      if (id.includes('/lib/simulation/openmm-world-session-loader')
        || id.includes('/private-position-export-v046.server')
        || id.includes('/private-position-loopback-server-v046')) {
        throw new Error('private browser graph reached a server-only module');
      }
    },
  };
}

function assertNoForbiddenClientText(clientJavaScript) {
  const forbidden = [
    'node:fs',
    'node:crypto',
    'server-only',
    'openmm-world-session-loader',
    'independentControlReceiptPath',
    'artifactRoot',
    'sourceArtifactPath',
    'sourceRevision',
    'payloadBundleRoot',
    'conversionReceipt',
    'artifactManifestDigest',
    'controlReceiptDigest',
    'velocityTemporalAlignment',
    'forceSemantics',
    'worldSessionMaterialization',
    'arrays/reference-a-velocities',
    'arrays/reference-a-potential-forces',
    'sourceMappingURL=',
  ];
  for (const needle of forbidden) {
    if (clientJavaScript.includes(needle)) {
      throw new Error(`private browser client output contains forbidden text ${needle}`);
    }
  }
}
