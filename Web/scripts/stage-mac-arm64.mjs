import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.dirname(scriptDir);
const repoDir = path.dirname(webDir);
const buildDir = path.join(repoDir, '.codex-build', 'mac-arm64');
const apiProject = path.join(repoDir, 'Api', 'Application', 'Application.csproj');
const apiBuildOutput = path.join(repoDir, 'Api', 'Application', 'bin', 'Release', 'net10.0', 'osx-arm64');
const apiModules = path.join(repoDir, 'Api', 'Modules');
const apiOutput = path.join(webDir, 'vendor', 'BibleNote', 'osx-arm64');
const nativeOutput = path.join(webDir, 'vendor', 'native', 'darwin-arm64');
const nativeWorkDir = path.join(buildDir, 'better-sqlite3');
const prebuildInstall = path.join(webDir, 'node_modules', 'prebuild-install', 'bin.js');
const betterSqliteSource = path.join(webDir, 'node_modules', 'better-sqlite3');
const electronPackage = JSON.parse(fs.readFileSync(path.join(webDir, 'node_modules', 'electron', 'package.json'), 'utf8'));

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: webDir,
    stdio: 'inherit',
    shell: false,
    ...options
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} exited with code ${result.status ?? 'unknown'}`);
  }
}

function recreateDirectory(directory) {
  const resolved = path.resolve(directory);
  const allowedRoot = path.resolve(repoDir) + path.sep;
  if (!resolved.startsWith(allowedRoot)) {
    throw new Error(`Refusing to recreate a directory outside the repository: ${resolved}`);
  }
  fs.rmSync(resolved, { recursive: true, force: true });
  fs.mkdirSync(resolved, { recursive: true });
}

console.log('Building BibleNote API for macOS arm64...');
run('dotnet', [
  'build',
  apiProject,
  '-c', 'Release',
  '-r', 'osx-arm64',
  '--self-contained', 'true',
  '-p:GenerateCode=False'
]);

recreateDirectory(apiOutput);
fs.cpSync(apiBuildOutput, apiOutput, { recursive: true });
fs.cpSync(apiModules, path.join(apiOutput, 'Modules'), { recursive: true });

const apiExecutable = path.join(apiOutput, 'BibleNote.Application');
const macCoreClr = path.join(apiOutput, 'libcoreclr.dylib');
if (!fs.existsSync(apiExecutable) || !fs.existsSync(macCoreClr)) {
  throw new Error(`The self-contained macOS API was not produced at ${apiOutput}`);
}

console.log(`Downloading better-sqlite3 for Electron ${electronPackage.version} (darwin-arm64)...`);
recreateDirectory(nativeWorkDir);
fs.cpSync(betterSqliteSource, nativeWorkDir, {
  recursive: true,
  filter: source => !source.includes(`${path.sep}build${path.sep}`)
});
run(process.execPath, [
  prebuildInstall,
  '--platform', 'darwin',
  '--arch', 'arm64',
  '--runtime', 'electron',
  '--target', electronPackage.version,
  '--force'
], { cwd: nativeWorkDir });

const nativeBinary = path.join(nativeWorkDir, 'build', 'Release', 'better_sqlite3.node');
if (!fs.existsSync(nativeBinary)) {
  throw new Error(`The darwin-arm64 better-sqlite3 binary was not produced at ${nativeBinary}`);
}
recreateDirectory(nativeOutput);
fs.copyFileSync(nativeBinary, path.join(nativeOutput, 'better_sqlite3.node'));

console.log(`macOS arm64 staging completed:\n  API: ${apiOutput}\n  native module: ${nativeOutput}`);
