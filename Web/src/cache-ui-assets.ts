import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type UiAsset = {
  body: Buffer;
  contentType: string;
};

const uiDirectory = fileURLToPath(new URL('../ui/', import.meta.url));

function readUiFile(fileName: string): Buffer {
  return fs.readFileSync(path.join(uiDirectory, fileName));
}

export const cacheUiPageHtml = readUiFile('index.html');

const scriptNames = [
  'bootstrap.js',
  'navigation-search.js',
  'layout.js',
  'settings.js',
  'api-page-view.js',
  'notebooks-log.js',
  'bible-reader.js',
  'tree-pages.js',
  'bible-references.js',
  'sync.js'
] as const;

const cacheUiAssets = new Map<string, UiAsset>();
cacheUiAssets.set('/ui/styles.css', { body: readUiFile('styles.css'), contentType: 'text/css; charset=utf-8' });
for (const scriptName of scriptNames) {
  cacheUiAssets.set(`/ui/${scriptName}`, {
    body: readUiFile(scriptName),
    contentType: 'text/javascript; charset=utf-8'
  });
}

export function serveCacheUiAsset(pathname: string, response: import('node:http').ServerResponse): boolean {
  const asset = cacheUiAssets.get(pathname);
  if (!asset) return false;

  response.writeHead(200, {
    'Content-Type': asset.contentType,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  response.end(asset.body);
  return true;
}
