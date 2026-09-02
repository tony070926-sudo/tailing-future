import { describe, expect, it } from 'vitest';
import {
  buildPrivateBrowserClientV047,
} from './build-private-browser-client-v046.mjs';

describe('V047 private browser client build boundary', () => {
  it('builds one browser-only in-memory entry without the application config or server graph', async () => {
    const built = await buildPrivateBrowserClientV047();
    expect(built.indexHtmlTemplate).toContain('__TF_PRIVATE_CSP_NONCE__');
    expect(built.clientJavaScript).toContain('TFP047P1');
    expect(built.clientJavaScript).toContain('local-real-webgl2-draw-observed-execution-unattested');
    expect(built.audit).toMatchObject({
      schemaVersion: 'tf.private-browser-client-build-audit/0.4.7',
      configFileLoaded: false,
      writtenToFilesystem: false,
      outputChunkCount: 1,
      outputAssetCount: 0,
      sourceMapsIncluded: false,
      nodeBuiltinsIncluded: false,
      privateLoaderIncluded: false,
      serverIncluded: false,
      publicDistributionEligible: false,
      cloudflareDistributionEligible: false,
    });
    expect(built.audit.clientByteLength).toBeGreaterThan(100_000);
    expect(built.audit.clientByteLength).toBeLessThan(2 * 1024 * 1024);
    expect(built.audit.clientSha256).toMatch(/^sha256:[0-9a-f]{64}$/);
  }, 120_000);
});
