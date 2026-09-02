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
