import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Tests exercise the private implementation directly; production builds
    // still use the framework's real server-only import-chain enforcement.
    alias: {
      'server-only': fileURLToPath(new URL(
        './node_modules/next/dist/compiled/server-only/empty.js',
        import.meta.url,
      )),
    },
    tsconfigPaths: true,
  },
  test: {
    environment: 'node',
    // /0.3 executes both unchanged predecessor suites in verified historical
    // trees. Their actual-tree assertions cannot describe this newer base.
    exclude: [
      '**/node_modules/**',
      'scripts/backend-migration/verify-r18a-origin-main-admission.test.mjs',
      'scripts/backend-migration/verify-r18a-origin-main-admission-v0.2.test.mjs',
    ],
    testTimeout: 20_000,
    // Several suites execute long, CPU-bound molecular trajectories. Running
    // those files concurrently makes wall-clock time depend on host load and
    // can trip their unchanged per-test scientific timeouts. Keep file-level
    // scheduling deterministic while retaining process isolation.
    fileParallelism: false,
    include: [
      'lib/**/*.test.ts',
      'scripts/**/*.test.mjs',
      'app/components/molecular-visual-guides.test.ts',
    ],
    reporters: ['default'],
  },
});
