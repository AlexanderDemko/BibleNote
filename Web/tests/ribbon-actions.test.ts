import assert from 'node:assert/strict';
import test from 'node:test';
import { quickAnalyzeCurrentPage } from '../src/ribbon-api.js';
import { analyzeCurrentOneNotePage, type AnalyzeCurrentPageDependencies } from '../src/ribbon-worker.js';
import type { SyncOptions, SyncResult } from '../src/sync.js';

test('quick Ribbon analysis calls the .NET API directly', async () => {
  let requestedUrl = '';
  let requestedMethod = '';
  const result = await quickAnalyzeCurrentPage('http://127.0.0.1:5000', async (input, init) => {
    requestedUrl = String(input);
    requestedMethod = init?.method ?? '';
    return new Response(JSON.stringify({ pageUpdated:true, versesCount:3 }), {
      status:200,
      headers:{ 'Content-Type':'application/json' }
    });
  });

  assert.equal(requestedUrl, 'http://127.0.0.1:5000/api/OneNoteIntegration/QuickAnalyzeCurrentPage');
  assert.equal(requestedMethod, 'POST');
  assert.deepEqual(result, { pageUpdated:true, versesCount:3 });
});

test('current-page Ribbon synchronization runs without the cache UI server', async () => {
  const syncOptions: SyncOptions[] = [];
  const history: Array<{ pageId: string; result: SyncResult }> = [];
  const syncResult: SyncResult = {
    dbPath:'C:\\temp\\onenote-cache.sqlite',
    cacheReset:false,
    notebooks:1,
    sections:1,
    sectionGroups:0,
    pages:1,
    contentDownloaded:1,
    contentSkipped:0,
    contentErrors:0,
    sectionScanErrors:0,
    bibleRefsPagesParsed:1,
    bibleRefsParseSkipped:0,
    bibleRefsParseErrors:0,
    bibleRefsRecognized:2,
    deletedPagesMarked:0,
    startedAt:'2026-09-25T10:00:00.000Z',
    finishedAt:'2026-09-25T10:00:01.000Z',
    status:{}
  };
  const dependencies: AnalyzeCurrentPageDependencies = {
    currentPage:async () => ({ pageId:'page-1', title:'  Страница  ', clientUrl:'onenote:https://example/page' }),
    syncPage:async options => {
      syncOptions.push(options);
      return syncResult;
    },
    quickAnalyze:async () => ({ pageUpdated:true, versesCount:2 }),
    saveHistory:(page, result) => history.push({ pageId:page.pageId, result })
  };

  const result = await analyzeCurrentOneNotePage('C:\\temp\\onenote-cache.sqlite', dependencies);

  assert.deepEqual(syncOptions, [{
    dbPath:'C:\\temp\\onenote-cache.sqlite',
    pageId:'page-1',
    forceContent:true,
    parseBibleRefs:true,
    forceBibleParse:true,
    dataSource:'com'
  }]);
  assert.deepEqual(history, [{ pageId:'page-1', result:syncResult }]);
  assert.deepEqual(result, {
    currentPage:{ id:'page-1', title:'Страница', clientUrl:'onenote:https://example/page' },
    sync:syncResult,
    comAnalysis:{ pageUpdated:true, versesCount:2 }
  });
});

test('quick Ribbon analysis exposes a non-JSON API error', async () => {
  await assert.rejects(
    () => quickAnalyzeCurrentPage('http://127.0.0.1:5000', async () => new Response('System.Collection error', { status:500 })),
    /System\.Collection error/
  );
});
