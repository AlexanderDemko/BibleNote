import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type UiAsset = {
  filePath: string;
  body?: Promise<Buffer>;
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
  'tabs.js',
  'layout.js',
  'settings.js',
  'mybible-settings.js',
  'api-page-view.js',
  'page-outline.js',
  'page-frame-bridge.js',
  'content-theme.js',
  'pdf-link-matching.js',
  'pdf-viewer.js',
  'notebooks-log.js',
  'bible-reader.js',
  'tree-pages.js',
  'bible-references.js',
  'sync.js'
] as const;

const cacheUiAssets = new Map<string, UiAsset>();
cacheUiAssets.set('/ui/styles.css', { filePath: path.join(uiDirectory, 'styles.css'), contentType: 'text/css; charset=utf-8' });
cacheUiAssets.set('/ui/pdf-viewer.html', { filePath: path.join(uiDirectory, 'pdf-viewer.html'), contentType: 'text/html; charset=utf-8' });
cacheUiAssets.set('/ui/pdf-viewer.css', { filePath: path.join(uiDirectory, 'pdf-viewer.css'), contentType: 'text/css; charset=utf-8' });
for (const scriptName of scriptNames) {
  cacheUiAssets.set(`/ui/${scriptName}`, {
    filePath: path.join(uiDirectory, scriptName),
    contentType: 'text/javascript; charset=utf-8'
  });
}

cacheUiAssets.set('/vendor/pdfjs/pdf.min.mjs', {
  filePath:path.join(pdfJsBuildDirectory, 'pdf.min.mjs'),
  contentType:'text/javascript; charset=utf-8'
});
cacheUiAssets.set('/vendor/pdfjs/pdf.worker.min.mjs', {
  filePath:path.join(pdfJsBuildDirectory, 'pdf.worker.min.mjs'),
  contentType:'text/javascript; charset=utf-8'
});
cacheUiAssets.set('/vendor/pdfjs/pdf_viewer.mjs', {
  filePath:path.join(pdfJsWebDirectory, 'pdf_viewer.mjs'),
  contentType:'text/javascript; charset=utf-8'
});
cacheUiAssets.set('/vendor/pdfjs/pdf_viewer.css', {
  filePath:path.join(pdfJsWebDirectory, 'pdf_viewer.css'),
  contentType:'text/css; charset=utf-8'
});

export async function serveCacheUiAsset(pathname: string, response: import('node:http').ServerResponse): Promise<boolean> {
  let asset = cacheUiAssets.get(pathname);
  if (!asset && pathname.startsWith('/vendor/pdfjs/images/')) {
    const imageName = pathname.slice('/vendor/pdfjs/images/'.length);
    if (!/^[a-zA-Z0-9_-]+\.(?:svg|png|gif)$/.test(imageName)) return false;
    const filePath = path.join(pdfJsWebDirectory, 'images', imageName);
    try {
      if (!(await fs.promises.stat(filePath)).isFile()) return false;
    } catch { return false; }
    asset = { filePath, contentType:imageName.endsWith('.svg') ? 'image/svg+xml' : imageName.endsWith('.gif') ? 'image/gif' : 'image/png' };
    cacheUiAssets.set(pathname, asset);
  }
  if (!asset) return false;

  // Only requested assets are read, and concurrent requests share the read.
  asset.body ??= fs.promises.readFile(asset.filePath).catch(error => {
    asset!.body = undefined;
    throw error;
  });
  const body = await asset.body;
  response.writeHead(200, {
    'Content-Type': asset.contentType,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  response.end(body);
  return true;
}
