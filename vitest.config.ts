import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'lib/**/*.test.ts',
      'scripts/**/*.test.mjs',
      'app/components/molecular-visual-guides.test.ts',
    ],
    reporters: ['default'],
  },
});
