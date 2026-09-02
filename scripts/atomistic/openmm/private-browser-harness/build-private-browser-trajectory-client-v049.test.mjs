import { afterEach, describe, expect, it, vi } from 'vitest';

const BUILD_MODULE = './build-private-browser-trajectory-client-v049.mjs';

afterEach(() => {
  vi.doUnmock('vite');
  vi.resetModules();
});

describe('V049 private trajectory browser-client build boundary', () => {
  it('builds exactly one browser-only chunk in memory without maps or private source text',
    async () => {
      const { buildPrivateBrowserTrajectoryClientV049 } = await import(BUILD_MODULE);
      const built = await buildPrivateBrowserTrajectoryClientV049();

      expect(Object.isFrozen(built)).toBe(true);
      expect(Object.isFrozen(built.audit)).toBe(true);
      expect(built.indexHtmlTemplate).toContain('__TF_PRIVATE_CSP_NONCE__');
      expect(built.indexHtmlTemplate).toContain('src="/client.js"');
      expect(built.indexHtmlTemplate).toContain('execution unattested');
      expect(built.indexHtmlTemplate).toContain('Continue from audited frame 37 barrier');
      expect(built.clientJavaScript).toContain('TFP049T1');
      expect(built.clientJavaScript).toContain('interruption-ready');
      expect(built.audit).toMatchObject({
        schemaVersion: 'tf.private-browser-trajectory-client-build-audit/0.4.9',
        configFileLoaded: false,
        writtenToFilesystem: false,
        outputChunkCount: 1,
        outputAssetCount: 0,
        sourceMapsIncluded: false,
        writeBundleHookInvoked: false,
        nodeBuiltinsIncluded: false,
        privateV048SourceIncluded: false,
        privateLoaderIncluded: false,
        serverIncluded: false,
        publicDistributionEligible: false,
        cloudflareDistributionEligible: false,
      });
      expect(built.audit.sourceModuleCount).toBeGreaterThan(1);
      expect(built.audit.clientByteLength).toBe(Buffer.byteLength(
        built.clientJavaScript,
        'utf8',
      ));
      expect(built.audit.clientByteLength).toBeLessThan(2 * 1024 * 1024);
      expect(built.audit.clientSha256).toMatch(/^sha256:[0-9a-f]{64}$/);

      for (const forbidden of [
        'server-only',
        'openmm-world-session-loader',
        'atomistic-private-position-trajectory-v048',
        'atomistic-private-trajectory-instancing-runtime-v048',
        'sourcePositionsF64Digest',
        'sourceGeometryGate',
        'artifactRoot',
        'independentControlReceiptPath',
        'sourceRevision',
        '.f64le',
        'sourceMappingURL=',
      ]) expect(built.clientJavaScript).not.toContain(forbidden);
    }, 120_000);

  it('actively rejects server, Node, remote, and V048 runtime graph references', async () => {
    let inspectedConfig = null;
    vi.resetModules();
    vi.doMock('vite', () => ({
      build: async (config) => {
        inspectedConfig = config;
        const plugin = config.plugins[0];
        for (const forbidden of [
          'node:fs',
          'fs/promises',
          'https://example.invalid/client.js',
          './private-openmm-webgl2-trajectory-harness-v049.server.mjs',
          '../../../../lib/simulation/openmm-world-session-loader.server.ts',
          '../../../../lib/simulation/atomistic-private-position-trajectory-v048.ts',
          '../../../../lib/molecular/atomistic-private-trajectory-instancing-runtime-v048.ts',
        ]) expect(() => plugin.resolveId(forbidden)).toThrow(/rejected import/);
        expect(() => plugin.moduleParsed({
          id: '/repo/private-source.server.ts',
        })).toThrow(/forbidden source module/);
        expect(plugin.resolveId('three')).toBeNull();
        expect(plugin.resolveId('../../../../lib/simulation/atomistic-private-browser-position-trajectory-v049.ts'))
          .toBeNull();
        plugin.moduleParsed({ id: config.build.rollupOptions.input });
        return {
          output: [{
            type: 'chunk',
            fileName: 'client.js',
            isEntry: true,
            facadeModuleId: config.build.rollupOptions.input,
            imports: [],
            dynamicImports: [],
            implicitlyLoadedBefore: [],
            referencedFiles: [],
            map: null,
            modules: { [config.build.rollupOptions.input]: {} },
            code: 'document.body.dataset.privateTrajectory = "ready";\n',
          }],
        };
      },
    }));

    const { buildPrivateBrowserTrajectoryClientV049 } = await import(BUILD_MODULE);
    const built = await buildPrivateBrowserTrajectoryClientV049();
    expect(inspectedConfig).not.toBeNull();
    expect(inspectedConfig).toMatchObject({
      configFile: false,
      publicDir: false,
      build: {
        write: false,
        sourcemap: false,
        cssCodeSplit: false,
        rollupOptions: { output: { codeSplitting: false } },
      },
    });
    expect(built.audit).toMatchObject({
      outputChunkCount: 1,
      outputAssetCount: 0,
      sourceModuleCount: 1,
      writtenToFilesystem: false,
      serverIncluded: false,
      privateV048SourceIncluded: false,
    });
  });

  it('fails closed if Rollup reaches its filesystem write hook', async () => {
    vi.resetModules();
    vi.doMock('vite', () => ({
      build: async (config) => {
        config.plugins[0].writeBundle();
        throw new Error('unreachable');
      },
    }));
    const { buildPrivateBrowserTrajectoryClientV049 } = await import(BUILD_MODULE);
    await expect(buildPrivateBrowserTrajectoryClientV049())
      .rejects.toThrow(/must never write its output/);
  });
});
