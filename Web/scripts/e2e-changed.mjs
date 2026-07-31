import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { areasForChangedFiles } from '../e2e/areas.mjs';

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(webRoot, '..');
const input = process.argv.slice(2);
const baseIndex = input.indexOf('--base');
const base = baseIndex >= 0 && input[baseIndex + 1] ? input[baseIndex + 1] : 'origin/main';
const forwarded = input.filter((_, index) => index !== baseIndex && index !== baseIndex + 1);

function gitLines(args, allowFailure = false) {
  const result = spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8' });
  if (result.status !== 0) {
    if (allowFailure) return [];
    process.stderr.write(result.stderr || `git ${args.join(' ')} failed\n`);
    process.exit(result.status || 1);
  }
  return result.stdout.split(/\r?\n/).map(value => value.trim()).filter(Boolean);
}

let committed = gitLines(['diff', '--name-only', '--diff-filter=ACMRT', `${base}...HEAD`], true);
if (committed.length === 0 && gitLines(['rev-parse', '--verify', base], true).length === 0) {
  committed = gitLines(['diff', '--name-only', '--diff-filter=ACMRT', 'HEAD~1...HEAD'], true);
}
const working = gitLines(['diff', '--name-only', '--diff-filter=ACMRT', 'HEAD']);
const untracked = gitLines(['ls-files', '--others', '--exclude-standard']);
const files = [...new Set([...committed, ...working, ...untracked])].sort();
const areas = areasForChangedFiles(files);

console.log(`Changed files (${files.length}):`);
for (const file of files) console.log(`  ${file}`);
console.log(`E2E areas: ${areas.join(', ')}`);

const executable = process.execPath;
const playwrightCli = path.join(webRoot, 'node_modules', '@playwright', 'test', 'cli.js');
const grep = `@(?:${areas.join('|')})`;
const result = spawnSync(executable, [playwrightCli, 'test', '--grep', grep, ...forwarded], {
  cwd: webRoot,
  stdio: 'inherit'
});
if (result.error) {
  console.error(`Unable to start Playwright: ${result.error.message}`);
  console.error('Run npm install and npm run e2e:install first.');
  process.exit(1);
}
process.exit(result.status ?? 1);
