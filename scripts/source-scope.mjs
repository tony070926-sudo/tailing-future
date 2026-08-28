const PROJECT_SOURCE_DIRECTORIES = Object.freeze([
  '.github/',
  '.openai/',
  'app/',
  'atomistic/',
  'docs/',
  'evaluation/',
  'lib/',
  'public/',
  'schemas/',
  'scripts/',
]);

const PROJECT_SOURCE_ROOT_FILES = new Set([
  '.dockerignore',
  '.gitignore',
  'README.md',
  'eslint.config.mjs',
  'next.config.ts',
  'package-lock.json',
  'package.json',
  'tsconfig.json',
  'vite.config.ts',
  'vitest.config.ts',
]);

export function isProjectSourcePath(relativePath) {
  if (typeof relativePath !== 'string'
    || relativePath.length < 1
    || relativePath.includes('\0')
    || relativePath.includes('\\')
    || relativePath.startsWith('/')
    || relativePath.split('/').some((part) => part === '' || part === '.' || part === '..')) return false;
  return PROJECT_SOURCE_ROOT_FILES.has(relativePath)
    || !relativePath.includes('/')
    || PROJECT_SOURCE_DIRECTORIES.some((prefix) => relativePath.startsWith(prefix));
}

export function selectProjectSourceFiles(relativePaths) {
  if (!Array.isArray(relativePaths)) throw new TypeError('relativePaths must be an array');
  return [...new Set(relativePaths.filter(isProjectSourcePath))]
    .filter((relativePath) => relativePath !== 'evaluation/latest-report.json'
      && relativePath !== 'evaluation/latest-report.md')
    .sort();
}
