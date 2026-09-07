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
    // /0.4 mandatorily executes the exact 84f /0.3 + current-root-v2 suites
    // (including /0.2 + /0.1 and Node29) in verified historical trees.
    // New /0.4 and current-root-v3 suites assert the actual current tree.
    exclude: [
      '**/node_modules/**',
      'scripts/backend-migration/verify-r18a-origin-main-admission.test.mjs',
      'scripts/backend-migration/verify-r18a-origin-main-admission-v0.2.test.mjs',
      'scripts/backend-migration/verify-r18a-origin-main-admission-v0.3.test.mjs',
      'scripts/mesoscale/pfhub7a_r18a_current_root_v2.test.mjs',
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
