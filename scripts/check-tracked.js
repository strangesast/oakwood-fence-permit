import { execFileSync } from 'node:child_process';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');

const trackedFiles = execFileSync('git', ['ls-files'], {
  cwd: repoRoot,
  encoding: 'utf8',
})
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean);

const forbiddenPrefixes = [
  'dist/',
  'node_modules/',
  'playwright-report/',
  'test-results/',
  'src/vendor/',
  'public/vendor/',
  '.openai/',
];

const forbiddenTracked = trackedFiles.filter((file) =>
  forbiddenPrefixes.some((prefix) => file.startsWith(prefix))
);

if (forbiddenTracked.length > 0) {
  console.error('Error: generated or vendored files are tracked in git:', forbiddenTracked);
  process.exit(1);
}

const stagedFiles = execFileSync('git', ['diff', '--cached', '--name-only'], {
  cwd: repoRoot,
  encoding: 'utf8',
})
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean);

const forbiddenStaged = stagedFiles.filter((file) =>
  forbiddenPrefixes.some((prefix) => file.startsWith(prefix))
);

if (forbiddenStaged.length > 0) {
  console.error('Error: generated or vendored files are staged in git:', forbiddenStaged);
  process.exit(1);
}

if (trackedFiles.length > 0) {
  const modifiedTracked = execFileSync('git', ['diff', '--name-only'], {
    cwd: repoRoot,
    encoding: 'utf8',
  }).trim();

  if (modifiedTracked) {
    console.error('Error: tracked source files were modified:', modifiedTracked);
    process.exit(1);
  }
}

console.log(
  'PASS: no generated or vendored assets are tracked or staged, and tracked source is clean.'
);
