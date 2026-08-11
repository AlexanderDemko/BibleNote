import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type UiAsset = {
  body: Buffer;
  contentType: string;
};

const uiDirectory = fileURLToPath(new URL('../ui/', import.meta.url));
const pdfJsBuildDirectory = fileURLToPath(new URL('../node_modules/pdfjs-dist/build/', import.meta.url));
const pdfJsWebDirectory = fileURLToPath(new URL('../node_modules/pdfjs-dist/web/', import.meta.url));

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
  'page-frame-bridge.js',
  'pdf-link-matching.js',
  'pdf-viewer.js',
  'notebooks-log.js',
  'bible-reader.js',
  'tree-pages.js',
  'bible-references.js',
  'sync.js'
] as const;

const cacheUiAssets = new Map<string, UiAsset>();
cacheUiAssets.set('/ui/styles.css', { body: readUiFile('styles.css'), contentType: 'text/css; charset=utf-8' });
cacheUiAssets.set('/ui/pdf-viewer.html', { body: readUiFile('pdf-viewer.html'), contentType: 'text/html; charset=utf-8' });
cacheUiAssets.set('/ui/pdf-viewer.css', { body: readUiFile('pdf-viewer.css'), contentType: 'text/css; charset=utf-8' });
for (const scriptName of scriptNames) {
  cacheUiAssets.set(`/ui/${scriptName}`, {
    body: readUiFile(scriptName),
    contentType: 'text/javascript; charset=utf-8'
  });
}

cacheUiAssets.set('/vendor/pdfjs/pdf.min.mjs', {
  body: fs.readFileSync(path.join(pdfJsBuildDirectory, 'pdf.min.mjs')),
  contentType:'text/javascript; charset=utf-8'
});
cacheUiAssets.set('/vendor/pdfjs/pdf.worker.min.mjs', {
  body: fs.readFileSync(path.join(pdfJsBuildDirectory, 'pdf.worker.min.mjs')),
  contentType:'text/javascript; charset=utf-8'
});
cacheUiAssets.set('/vendor/pdfjs/pdf_viewer.mjs', {
  body: fs.readFileSync(path.join(pdfJsWebDirectory, 'pdf_viewer.mjs')),
  contentType:'text/javascript; charset=utf-8'
});
cacheUiAssets.set('/vendor/pdfjs/pdf_viewer.css', {
  body: fs.readFileSync(path.join(pdfJsWebDirectory, 'pdf_viewer.css')),
  contentType:'text/css; charset=utf-8'
});
for (const imageName of fs.readdirSync(path.join(pdfJsWebDirectory, 'images'))) {
  const imagePath = path.join(pdfJsWebDirectory, 'images', imageName);
  if (!fs.statSync(imagePath).isFile()) continue;
  cacheUiAssets.set(`/vendor/pdfjs/images/${imageName}`, {
    body:fs.readFileSync(imagePath),
    contentType:imageName.endsWith('.svg') ? 'image/svg+xml' : imageName.endsWith('.png') ? 'image/png' : 'application/octet-stream'
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
