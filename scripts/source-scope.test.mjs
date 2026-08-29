import { describe, expect, it } from 'vitest';
import { isProjectSourcePath, selectProjectSourceFiles } from './source-scope.mjs';

describe('Tailing Future source scope', () => {
  it('includes declared project roots and excludes adjacent projects', () => {
    expect(isProjectSourcePath('atomistic/containers/mace.Dockerfile')).toBe(true);
    expect(isProjectSourcePath('scripts/atomistic/run_model.py')).toBe(true);
    expect(isProjectSourcePath('package-lock.json')).toBe(true);
    expect(isProjectSourcePath('.npmrc')).toBe(true);
    expect(isProjectSourcePath('tailing-future-health/src/App.tsx')).toBe(false);
    expect(isProjectSourcePath('another-project/package.json')).toBe(false);
  });

  it('rejects traversal, platform-ambiguous and malformed paths', () => {
    for (const candidate of ['../scripts/evaluate.mjs', '/app/page.tsx', 'app\\page.tsx', 'app//page.tsx', 'app/./page.tsx', 'app/control\n.ts', '']) {
      expect(isProjectSourcePath(candidate)).toBe(false);
    }
  });

  it('sorts and de-duplicates while excluding self-referential reports', () => {
    expect(selectProjectSourceFiles([
      'scripts/evaluate.mjs',
      'evaluation/latest-report.json',
      'tailing-future-health/src/App.tsx',
      'app/page.tsx',
      'scripts/evaluate.mjs',
    ])).toEqual(['app/page.tsx', 'scripts/evaluate.mjs']);
  });
});
