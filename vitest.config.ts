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
    // R18b runs unchanged /0.4 + current-root-v3 in fixed dc6e history.
    // That one compatibility entry retains /0.3 + /0.2 + /0.1 and Node29.
    exclude: [
      '**/node_modules/**',
      'scripts/backend-migration/verify-r18a-origin-main-admission.test.mjs',
      'scripts/backend-migration/verify-r18a-origin-main-admission-v0.2.test.mjs',
      'scripts/backend-migration/verify-r18a-origin-main-admission-v0.3.test.mjs',
      'scripts/mesoscale/pfhub7a_r18a_current_root_v2.test.mjs',
      'scripts/backend-migration/verify-r18a-wrangler-admission-v0.4.test.mjs',
      'scripts/mesoscale/pfhub7a_r18a_current_root_v3.test.mjs',
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
