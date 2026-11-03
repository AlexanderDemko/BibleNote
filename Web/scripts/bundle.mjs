import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.join(webDir, 'dist');
for (const name of fs.readdirSync(outputDir)) {
  if (/^startup-.*\.js(?:\.map)?$/.test(name)) fs.unlinkSync(path.join(outputDir, name));
}
// Keep chunks next to entry points: resource paths are relative to import.meta.url.
// Native SQLite and parsers with their own worker/resource lookup stay external.
await build({
  absWorkingDir:webDir,
  entryPoints:['src/electron-main.ts', 'src/cache-ui.ts', 'src/ribbon-worker.ts'],
  outdir:'dist',
  bundle:true,
  splitting:true,
  format:'esm',
  platform:'node',
  target:'node22',
  external:['electron', 'better-sqlite3', '@azure/msal-node', 'pdfjs-dist/*', 'mammoth', 'jszip'],
  banner:{ js:"import { createRequire as __bundleCreateRequire } from 'node:module'; const require = __bundleCreateRequire(import.meta.url);" },
  chunkNames:'startup-[name]-[hash]',
  sourcemap:true,
  logLevel:'info'
});
