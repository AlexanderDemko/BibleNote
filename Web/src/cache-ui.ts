import './env.js';
import fs from 'node:fs';
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import path from 'node:path';
import { pathToFileURL, URL } from 'node:url';
import * as z from 'zod/v4';
import { bibleParseConfigFromEnv, bibleParserVersion, getVerseTextWithBibleNote, parsePageWithBibleNote, type BibleVerseText } from './bible.js';
import { bibleNoteBooks, bibleNoteHealth, bibleNoteModules, electronControl, ensureBibleNoteAvailable, parseExternalBibleRef, uploadBibleNoteModule } from './biblenote-gateway.js';
import { cacheUiPageHtml, serveCacheUiAsset } from './cache-ui-assets.js';
import { cacheStatus, defaultDbPath, findParallelBibleReferenceNotes, findParallelBibleReferences, getBibleParseState, getCachedPage, getSyncState, markPageHtmlParsed, markPageOpened, openCacheDb, readCachedPage, searchBibleReferenceNotesByWeight, searchCache, searchCacheAdvanced, shouldParseBibleRefs, shouldParsePageHtml, updatePageHtml, upsertBibleParseResult } from './cache.js';
import { visibleBibleRefSql, visibleBibleScopeSql } from './cache-sql.js';
import { hasRenderableHtmlBody } from './html.js';
import { oneNoteImage } from './image-proxy.js';
import { readOneNoteAccessSettings, saveOneNoteAccessSettings } from './onenote-settings.js';
import { configureRuntimeLogging, readRuntimeLoggingSettings, runtimeLog, saveRuntimeLoggingSettings } from './runtime-logging.js';
import { SingleFlight } from './single-flight.js';
import { syncOneNoteCache, type SyncProgressEvent, type SyncResult } from './sync.js';

type UiOptions = {
  dbPath: string;
  port: number;
};

type SyncUiState = {
  status: 'idle' | 'running' | 'success' | 'failed';
  startedAt?: string;
  finishedAt?: string;
  progress?: SyncProgressEvent;
  result?: SyncResult;
  error?: string;
};

type CacheDb = ReturnType<typeof openCacheDb>;

const syncRequestSchema = z.object({
  maxPages: z.number().int().min(1).max(1_000_000).optional(),
  concurrency: z.number().int().min(1).max(3).optional(),
  refreshOlderThanHours: z.number().int().min(0).max(1_000_000).optional(),
  notebookIds: z.array(z.string().min(1)).max(1000).optional(),
  sectionId: z.string().min(1).optional(),
  pageId: z.string().min(1).optional(),
  bibleModule: z.string().min(1).optional(),
  metadataOnly: z.boolean().optional(),
  replaceAll: z.boolean().optional(),
  forceContent: z.boolean().optional(),
  includeHtml: z.boolean().optional(),
  parseBibleRefs: z.boolean().optional(),
  forceBibleParse: z.boolean().optional(),
  localBibleReparse: z.boolean().optional(),
  incrementalMetadata: z.boolean().optional()
});

const uploadBibleNoteModuleRequestSchema = z.object({
  fileName: z.string().min(1),
  contentBase64: z.string().min(1)
});

const notebookDisplayNameRequestSchema = z.object({
  notebookId: z.string().min(1),
  displayName: z.string().nullable().optional()
});

const startupTimingStartedAt = Date.now();
function logStartupTiming(message: string): void {
  if (process.env.ONENOTE_STARTUP_TIMING !== '1') return;
  const line = `[cache-ui startup +${Date.now() - startupTimingStartedAt}ms] ${message}`;
  console.log(line);
  if (process.env.ONENOTE_STARTUP_LOG) {
    try {
      fs.appendFileSync(process.env.ONENOTE_STARTUP_LOG, `${new Date().toISOString()} ${line}\n`, 'utf8');
    } catch {
      // Startup timing must never block the app if the log path is unavailable.
    }
  }
}

function parseArgs(argv: string[]): UiOptions {
  let dbPath = defaultDbPath;
  let port = 4312;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--db') {
      if (!next) throw new Error('--db requires a path.');
      dbPath = path.resolve(next);
      i += 1;
    } else if (arg === '--port') {
      port = Number(next);
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error('--port must be an integer from 1 to 65535.');
      }
      i += 1;
    } else if (arg === '--help' || arg === '-h') {
      console.log('Usage: npm run cache:ui -- [--db <path>] [--port <1..65535>]');
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return { dbPath, port };
}

function json(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  response.end(JSON.stringify(value));
}

function page(response: ServerResponse): void {
  response.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'",
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY'
  });
  response.end(cacheUiPageHtml);
}

function required(url: URL, name: string): string {
  const value = url.searchParams.get(name);
  if (!value) throw new Error(`Missing query parameter: ${name}`);
  return value;
}

function includeAuxiliaryBibleRefs(url: URL): boolean {
  return url.searchParams.get('includeAux') === '1' || url.searchParams.get('includeAux') === 'true';
}

async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 75_000_000) throw new Error('Request body is too large.');
    chunks.push(buffer);
  }
  if (chunks.length === 0) return {};
  const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('JSON object expected.');
  return parsed as Record<string, unknown>;
}

export function startCacheUi(options: UiOptions): http.Server {
  configureRuntimeLogging(path.dirname(options.dbPath));
  let cacheDb: CacheDb | undefined;
  let dbInitStarted = false;
  let dbInitError: Error | undefined;
  let syncState: SyncUiState = { status: 'idle' };
  const pageHtmlRefreshes = new SingleFlight<void>(1);
  const verseTextRequests = new SingleFlight<BibleVerseText>(1);

  function startDbInit(): void {
    if (cacheDb || dbInitStarted) return;
    dbInitStarted = true;
    logStartupTiming('db init scheduled');
    setTimeout(() => {
      try {
        logStartupTiming('db init start');
        cacheDb = openCacheDb(options.dbPath);
        logStartupTiming('db init complete');
      } catch (error: any) {
        dbInitError = error instanceof Error ? error : new Error(String(error));
        logStartupTiming(`db init failed: ${dbInitError.message}`);
      }
    }, 1200);
  }

  function requireDb(): CacheDb {
    if (cacheDb) return cacheDb;
    if (dbInitError) {
      const error = new Error(`Local cache failed to start: ${dbInitError.message}`) as Error & { statusCode?: number };
      error.statusCode = 500;
      throw error;
    }
    const error = new Error('Local cache is starting. Try again in a moment.') as Error & { statusCode?: number };
    error.statusCode = 503;
    throw error;
  }

  function startPageHtmlRefresh(pageId: string, module: string): boolean {
    const key = `${pageId}\u0000${module}`;
    const flight = pageHtmlRefreshes.run(key, async () => {
      const db = requireDb();
      const sourceRow = getCachedPage(db, pageId);
      if (!sourceRow?.content_html || sourceRow.deleted_at) return;
      if (!shouldParsePageHtml(db, pageId, sourceRow.content_html, module, bibleParserVersion)) return;

      const sourceHtml = sourceRow.content_html;
      const sourceContentHash = sourceRow.content_hash;
      const bibleConfig = bibleParseConfigFromEnv();
      await ensureBibleNoteAvailable();
      const parsed = await parsePageWithBibleNote({
        apiUrl: bibleConfig.apiUrl,
        pageId,
        title: sourceRow.title,
        html: sourceHtml,
        text: sourceRow.content_text,
        module,
        useCommaDelimiter: bibleConfig.useCommaDelimiter,
        timeoutMs: bibleConfig.timeoutMs,
        updateHtml: true
      });

      const currentRow = getCachedPage(db, pageId);
      if (!currentRow?.content_html || currentRow.deleted_at) return;
      if (currentRow.content_html !== sourceHtml || currentRow.content_hash !== sourceContentHash) {
        runtimeLog('http', 'Skipped stale background page HTML refresh', { pageId, module });
        return;
      }

      const parsedAt = new Date().toISOString();
      const finalHtml = parsed.html || sourceHtml;
      if (finalHtml !== sourceHtml) {
        updatePageHtml(db, pageId, finalHtml);
        runtimeLog('http', 'Updated cached page HTML in background', {
          pageId,
          module,
          htmlBytes: finalHtml.length
        });
      }
      if (sourceContentHash) {
        upsertBibleParseResult(
          db,
          pageId,
          sourceContentHash,
          { ...parsed, module:parsed.module || module },
          bibleParserVersion,
          parsedAt
        );
      }
      markPageHtmlParsed(db, pageId, finalHtml, module, bibleParserVersion, parsedAt);
    });

    if (flight.started) {
      runtimeLog('http', 'Scheduled background page HTML refresh', { pageId, module });
      void flight.promise.catch((error: any) => {
        runtimeLog('http-error', 'Background page HTML refresh failed', {
          pageId,
          module,
          error:error?.stack ?? error?.message ?? String(error)
        });
      });
    } else {
      runtimeLog('http', 'Reused background page HTML refresh', { pageId, module });
    }
    return flight.started;
  }

  const server = http.createServer(async (request: IncomingMessage, response: ServerResponse) => {
    try {
      const url = new URL(request.url ?? '/', `http://${request.headers.host ?? '127.0.0.1'}`);
      const requestStartedAt = Date.now();
      response.on('finish', () => {
        if (url.pathname !== '/api/runtime-log') {
          runtimeLog('http', `${request.method ?? 'GET'} ${url.pathname}`, {
            statusCode: response.statusCode,
            durationMs: Date.now() - requestStartedAt,
            query: Object.fromEntries(url.searchParams.entries())
          });
        }
      });
      if (request.method === 'GET' && serveCacheUiAsset(url.pathname, response)) return;
      if (request.method === 'GET' && (url.pathname === '/' || url.pathname.startsWith('/page/') || url.pathname.startsWith('/bible/'))) return page(response);
      if (url.pathname === '/api/onenote-image' && request.method === 'GET') {
        await oneNoteImage(response, required(url, 'src'));
        return;
      }
      if (url.pathname === '/api/sync' && request.method === 'GET') return json(response, 200, syncState);
      if (url.pathname === '/api/startup' && request.method === 'GET') return json(response, dbInitError ? 500 : 200, {
        ready: Boolean(cacheDb),
        starting: dbInitStarted && !cacheDb && !dbInitError,
        error: dbInitError?.message
      });
      if (url.pathname === '/api/runtime-settings' && request.method === 'GET') {
        return json(response, 200, readRuntimeLoggingSettings());
      }
      if (url.pathname === '/api/runtime-settings' && request.method === 'PUT') {
        const ownOrigin = `http://${request.headers.host ?? `127.0.0.1:${options.port}`}`;
        if (request.headers.origin && request.headers.origin !== ownOrigin) {
          return json(response, 403, { error: 'Cross-origin runtime settings requests are not allowed.' });
        }
        return json(response, 200, await saveRuntimeLoggingSettings(await readJsonBody(request)));
      }
      if (url.pathname === '/api/runtime-log' && request.method === 'POST') {
        const ownOrigin = `http://${request.headers.host ?? `127.0.0.1:${options.port}`}`;
        if (request.headers.origin && request.headers.origin !== ownOrigin) {
          return json(response, 403, { error: 'Cross-origin runtime log requests are not allowed.' });
        }
        const body = await readJsonBody(request);
        runtimeLog('ui', typeof body.action === 'string' ? body.action : 'event', body.details);
        return json(response, 200, {});
      }
      if (url.pathname === '/api/onenote/access-settings' && request.method === 'GET') {
        return json(response, 200, readOneNoteAccessSettings());
      }
      if (url.pathname === '/api/onenote/access-settings' && request.method === 'PUT') {
        const ownOrigin = `http://${request.headers.host ?? `127.0.0.1:${options.port}`}`;
        if (request.headers.origin && request.headers.origin !== ownOrigin) {
          return json(response, 403, { error: 'Cross-origin OneNote settings requests are not allowed.' });
        }
        return json(response, 200, await saveOneNoteAccessSettings(await readJsonBody(request)));
      }
      if (url.pathname === '/api/biblenote/health' && request.method === 'GET') {
        try {
          const health = await bibleNoteHealth();
          return json(response, 200, { available:true, ...health });
        } catch (error: any) {
          return json(response, 200, { available:false, error:error?.message ?? String(error) });
        }
      }
      if (url.pathname === '/api/biblenote/modules' && request.method === 'GET') {
        try {
          const modules = await bibleNoteModules();
          return json(response, 200, { available:true, modules });
        } catch (error: any) {
          return json(response, 200, { available:false, error:error?.message ?? String(error), modules:[] });
        }
      }
      if (url.pathname === '/api/system/protocol' && request.method === 'GET') {
        return json(response, 200, await electronControl('/protocol/status'));
      }
      if (url.pathname === '/api/system/protocol/register' && request.method === 'POST') {
        const ownOrigin = `http://${request.headers.host ?? `127.0.0.1:${options.port}`}`;
        if (request.headers.origin && request.headers.origin !== ownOrigin) {
          return json(response, 403, { error: 'Cross-origin protocol requests are not allowed.' });
        }
        return json(response, 200, await electronControl('/protocol/register', 'POST'));
      }
      if (url.pathname === '/api/system/main-bible-action' && request.method === 'POST') {
        const ownOrigin = `http://${request.headers.host ?? `127.0.0.1:${options.port}`}`;
        if (request.headers.origin && request.headers.origin !== ownOrigin) {
          return json(response, 403, { error: 'Cross-origin Bible actions are not allowed.' });
        }
        const body = await readJsonBody(request);
        const action = body.action === 'reader' || body.action === 'notes' ? body.action : undefined;
        const ref = body.ref;
        if (!action || !ref || typeof ref !== 'object' || Array.isArray(ref)) {
          return json(response, 400, { error: 'A valid Bible action and reference are required.' });
        }
        const params = new URLSearchParams({ action, ref:JSON.stringify(ref) });
        return json(response, 200, await electronControl(`/main/bible-action?${params.toString()}`, 'POST'));
      }
      if (url.pathname === '/api/biblenote/modules/upload' && request.method === 'POST') {
        const ownOrigin = `http://${request.headers.host ?? `127.0.0.1:${options.port}`}`;
        if (request.headers.origin && request.headers.origin !== ownOrigin) {
          return json(response, 403, { error: 'Cross-origin module upload requests are not allowed.' });
        }
        const body = uploadBibleNoteModuleRequestSchema.parse(await readJsonBody(request));
        return json(response, 200, await uploadBibleNoteModule(body.fileName, body.contentBase64));
      }
      if (url.pathname === '/api/bible/parse-link' && request.method === 'GET') {
        const rawRef = required(url, 'ref');
        const module = url.searchParams.get('module')?.trim() || undefined;
        return json(response, 200, { reference:await parseExternalBibleRef(rawRef, module) });
      }
      const db = requireDb();
      if (url.pathname === '/api/sync' && request.method === 'POST') {
        const ownOrigin = `http://${request.headers.host ?? `127.0.0.1:${options.port}`}`;
        if (request.headers.origin && request.headers.origin !== ownOrigin) {
          return json(response, 403, { error: 'Cross-origin sync requests are not allowed.' });
        }
        if (syncState.status === 'running') return json(response, 409, { error: 'Synchronization is already running.' });
        const body = syncRequestSchema.parse(await readJsonBody(request));
        const maxPages = body.maxPages;
        const concurrency = body.concurrency ?? 1;
        const refreshOlderThanHours = body.refreshOlderThanHours;
        const notebookIds = body.notebookIds ? [...new Set(body.notebookIds)] : undefined;
        const sectionId = body.sectionId;
        const pageId = body.pageId;
        const bibleModule = body.bibleModule;
        const scopeCount = Number(Boolean(notebookIds)) + Number(Boolean(sectionId)) + Number(Boolean(pageId));
        if (scopeCount > 1) throw new Error('Specify only one sync scope: notebookIds, sectionId, or pageId.');
        const startedAt = new Date().toISOString();
        syncState = { status: 'running', startedAt, progress: { phase: 'starting', message: 'Подготовка' } };
        runtimeLog('sync', 'Sync started', {
          maxPages,
          concurrency,
          refreshOlderThanHours,
          metadataOnly: body.metadataOnly === true,
          replaceAll: body.replaceAll === true,
          forceContent: body.forceContent === true,
          includeHtml: body.includeHtml === true,
          parseBibleRefs: body.parseBibleRefs === true,
          forceBibleParse: body.forceBibleParse === true,
          localBibleReparse: body.localBibleReparse === true,
          incrementalMetadata: body.incrementalMetadata === true,
          bibleModule,
          notebookIds,
          sectionId,
          pageId
        });
        void syncOneNoteCache({
          dbPath: options.dbPath,
          maxPages,
          concurrency,
          refreshOlderThanHours,
          metadataOnly: body.metadataOnly === true,
          replaceAll: body.replaceAll === true,
          forceContent: body.forceContent === true,
          includeHtml: body.includeHtml === true,
          parseBibleRefs: body.parseBibleRefs === true,
          forceBibleParse: body.forceBibleParse === true,
          localBibleReparse: body.localBibleReparse === true,
          incrementalMetadata: body.incrementalMetadata === true,
          bibleModule,
          notebookIds,
          sectionId,
          pageId,
          onProgress: progress => {
            runtimeLog('sync-progress', progress.phase || 'progress', progress);
            syncState = { ...syncState, progress };
          }
        }).then(result => {
          console.log(`Sync completed: pages=${result.pages}, contentDownloaded=${result.contentDownloaded}, bibleRefsRecognized=${result.bibleRefsRecognized}, contentErrors=${result.contentErrors}, bibleParseErrors=${result.bibleRefsParseErrors}`);
          runtimeLog('sync', 'Sync completed', result);
          syncState = { status: 'success', startedAt, finishedAt: new Date().toISOString(), result };
        }).catch(error => {
          console.error(`Sync failed: ${(error?.message ?? String(error)).slice(0, 4000)}`);
          runtimeLog('sync', 'Sync failed', { error: error?.stack ?? error?.message ?? String(error) });
          syncState = {
            status: 'failed',
            startedAt,
            finishedAt: new Date().toISOString(),
            error: (error?.message ?? String(error)).slice(0, 4000)
          };
        });
        return json(response, 202, syncState);
      }
      if (url.pathname === '/api/notebook-display-name' && request.method === 'PATCH') {
        const ownOrigin = `http://${request.headers.host ?? `127.0.0.1:${options.port}`}`;
        if (request.headers.origin && request.headers.origin !== ownOrigin) {
          return json(response, 403, { error: 'Cross-origin cache changes are not allowed.' });
        }
        const body = notebookDisplayNameRequestSchema.parse(await readJsonBody(request));
        const customDisplayName = typeof body.displayName === 'string' ? body.displayName.trim() || null : null;
        if (customDisplayName && customDisplayName.length > 120) throw new Error('displayName must not exceed 120 characters.');
        if (customDisplayName && /[\u0000-\u001f\u007f]/.test(customDisplayName)) throw new Error('displayName contains unsupported control characters.');
        const update = db.prepare('UPDATE notebooks SET custom_display_name = ? WHERE id = ?').run(customDisplayName, body.notebookId);
        if (update.changes === 0) return json(response, 404, { error: 'Notebook is not in the local cache.' });
        const notebook = db.prepare(`
          SELECT
            id,
            display_name AS originalDisplayName,
            custom_display_name AS customDisplayName,
            COALESCE(custom_display_name, display_name) AS displayName
          FROM notebooks
          WHERE id = ?
        `).get(body.notebookId);
        return json(response, 200, notebook);
      }
      if (request.method !== 'GET') return json(response, 405, { error: 'Method not allowed.' });
      if (url.pathname === '/' || url.pathname.startsWith('/page/') || url.pathname.startsWith('/bible/')) return page(response);
      if (url.pathname === '/api/status') return json(response, 200, cacheStatus(db));
      if (url.pathname === '/api/bible/stats') {
        const one = (sql: string) => (db.prepare(sql).get() as any)?.value ?? 0;
        const includeAux = includeAuxiliaryBibleRefs(url);
        const refFilter = includeAux ? '1' : visibleBibleRefSql('r');
        const scopeFilter = includeAux ? '1' : visibleBibleScopeSql('p', 's');
        const statsFrom = `paragraph_verse_refs r
          JOIN pages p ON p.id = r.page_id
          LEFT JOIN sections s ON s.id = p.parent_section_id`;
        const statsWhere = `${refFilter} AND ${scopeFilter}`;
        return json(response, 200, {
          pages: one(`SELECT COUNT(DISTINCT r.page_id) AS value FROM ${statsFrom} WHERE ${statsWhere}`),
          paragraphs: one(`SELECT COUNT(DISTINCT r.page_id || ':' || r.paragraph_index) AS value FROM ${statsFrom} WHERE ${statsWhere}`),
          references: one(`SELECT COUNT(*) AS value FROM ${statsFrom} WHERE ${statsWhere}`),
          errors: one("SELECT COUNT(*) AS value FROM page_bible_parse_state WHERE parse_error IS NOT NULL")
        });
      }
      if (url.pathname === '/api/bible/books') {
        const bibleConfig = bibleParseConfigFromEnv();
        const module = url.searchParams.get('module')?.trim() || bibleConfig.module;
        await ensureBibleNoteAvailable();
        return json(response, 200, { module, books:await bibleNoteBooks(module) });
      }
      if (url.pathname === '/api/bible/text') {
        const bookIndex = Number(required(url, 'bookIndex'));
        const chapter = Number(required(url, 'chapter'));
        const verseValue = url.searchParams.get('verse');
        const topChapterValue = url.searchParams.get('topChapter');
        const topVerseValue = url.searchParams.get('topVerse');
        const contextVersesValue = url.searchParams.get('contextVerses');
        const verse = verseValue ? Number(verseValue) : undefined;
        const topChapter = topChapterValue ? Number(topChapterValue) : undefined;
        const topVerse = topVerseValue ? Number(topVerseValue) : undefined;
        const contextVerses = contextVersesValue ? Number(contextVersesValue) : undefined;
        if (!Number.isInteger(bookIndex) || !Number.isInteger(chapter)
          || (verse != null && !Number.isInteger(verse))
          || (topChapter != null && !Number.isInteger(topChapter))
          || (topVerse != null && !Number.isInteger(topVerse))
          || (contextVerses != null && (!Number.isInteger(contextVerses) || contextVerses < 0 || contextVerses > 100))) {
          throw new Error('bookIndex, chapter, verse, topChapter, topVerse, and contextVerses must be integers.');
        }
        const bibleConfig = bibleParseConfigFromEnv();
        const module = url.searchParams.get('module')?.trim() || bibleConfig.module;
        await ensureBibleNoteAvailable();
        const verseTextKey = new URLSearchParams(url.searchParams);
        verseTextKey.set('module', module);
        const verseText = verseTextRequests.run(verseTextKey.toString(), () => getVerseTextWithBibleNote({
          apiUrl: bibleConfig.apiUrl,
          module,
          bookIndex,
          bookName: url.searchParams.get('bookName'),
          bookShortName: url.searchParams.get('bookShortName'),
          originalText: url.searchParams.get('originalText'),
          chapter,
          verse,
          topChapter,
          topVerse,
          contextVerses,
          timeoutMs: bibleConfig.timeoutMs
        }));
        return json(response, 200, await verseText.promise);
      }
      if (url.pathname === '/api/bible/page') {
        const pageId = required(url, 'id');
        const includeAux = includeAuxiliaryBibleRefs(url);
        const refFilter = includeAux ? '1' : visibleBibleRefSql('r', 'pp');
        const scopeFilter = includeAux ? '1' : visibleBibleScopeSql('p', 's');
        const rows = db.prepare(`
          SELECT
            pp.paragraph_index AS paragraphIndex,
            pp.paragraph_path AS paragraphPath,
            pp.text AS paragraphText,
            r.original_text AS originalText,
            r.normalized_ref AS normalizedRef,
            r.book_index AS bookIndex,
            r.book_name AS bookName,
            r.book_short_name AS bookShortName,
            r.chapter,
            r.verse,
            r.top_chapter AS topChapter,
            r.top_verse AS topVerse,
            r.is_chapter AS isChapter,
            r.start_index AS startIndex,
            r.end_index AS endIndex,
            r.entry_type AS entryType,
            r.entry_options AS entryOptions
          FROM page_paragraphs pp
          JOIN paragraph_verse_refs r ON r.page_id = pp.page_id AND r.paragraph_index = pp.paragraph_index
          JOIN pages p ON p.id = r.page_id
          LEFT JOIN sections s ON s.id = p.parent_section_id
          WHERE pp.page_id = ?
            AND ${refFilter}
            AND ${scopeFilter}
          ORDER BY pp.paragraph_index, r.start_index
        `).all(pageId) as Array<Record<string, any>>;
        const paragraphs = new Map<number, any>();
        for (const row of rows) {
          if (!paragraphs.has(row.paragraphIndex)) {
            paragraphs.set(row.paragraphIndex, {
              index: row.paragraphIndex,
              path: row.paragraphPath,
              text: row.paragraphText,
              references: []
            });
          }
          paragraphs.get(row.paragraphIndex).references.push({
            originalText: row.originalText,
            normalizedRef: row.normalizedRef,
            bookIndex: row.bookIndex,
            bookName: row.bookName,
            bookShortName: row.bookShortName,
            chapter: row.chapter,
            verse: row.verse,
            topChapter: row.topChapter,
            topVerse: row.topVerse,
            isChapter: Boolean(row.isChapter),
            startIndex: row.startIndex,
            endIndex: row.endIndex,
            entryType: row.entryType,
            entryOptions: row.entryOptions
          });
        }
        return json(response, 200, { pageId, paragraphs:[...paragraphs.values()] });
      }
      if (url.pathname === '/api/bible/search') {
        const query = (url.searchParams.get('q') ?? '').trim();
        const limit = Math.max(1, Math.min(Number(url.searchParams.get('limit') ?? '80') || 80, 200));
        const notebookIds = [...new Set(url.searchParams.getAll('notebookId').filter(Boolean))];
        const filters = ['p.deleted_at IS NULL'];
        if (!includeAuxiliaryBibleRefs(url)) {
          filters.push(visibleBibleRefSql('r', 'pp'));
          filters.push(visibleBibleScopeSql('p', 's'));
        }
        const params: Record<string, unknown> = { limit };
        if (query) {
          params.query = `%${query}%`;
          const textFilter = '(r.normalized_ref LIKE @query OR r.original_text LIKE @query OR r.book_name LIKE @query OR r.book_short_name LIKE @query OR pp.text LIKE @query)';
          let referenceFilter = '';
          try {
            const parsedRef = await parseExternalBibleRef(query, url.searchParams.get('module')?.trim() || undefined);
            const bookIndex = Number(parsedRef.bookIndex);
            const chapter = Number(parsedRef.chapter);
            const verse = Number(parsedRef.verse);
            if (Number.isInteger(bookIndex) && Number.isInteger(chapter)) {
              params.refBookIndex = bookIndex;
              params.refStartChapter = chapter;
              params.refEndChapter = Number.isInteger(Number(parsedRef.topChapter)) ? Number(parsedRef.topChapter) : chapter;
              if (Number.isInteger(verse)) {
                params.refStartVerse = verse;
                params.refEndVerse = Number.isInteger(Number(parsedRef.topVerse)) ? Number(parsedRef.topVerse) : verse;
                referenceFilter = `
                  (
                    r.book_index = @refBookIndex
                    AND r.chapter = @refStartChapter
                    AND COALESCE(r.verse, 0) = @refStartVerse
                    AND COALESCE(r.top_chapter, r.chapter) = @refEndChapter
                    AND COALESCE(r.top_verse, r.verse, 0) = @refEndVerse
                  )
                `;
              } else {
                referenceFilter = '(r.book_index = @refBookIndex AND r.chapter = @refStartChapter)';
              }
            }
          } catch {
            // Keep text search behavior when BibleNote does not recognize the query as a reference.
          }
          filters.push(referenceFilter ? `(${textFilter} OR ${referenceFilter})` : textFilter);
        }
        if (notebookIds.length > 0) {
          const placeholders = notebookIds.map((_, index) => {
            params[`notebookId${index}`] = notebookIds[index];
            return `@notebookId${index}`;
          });
          filters.push(`p.parent_notebook_id IN (${placeholders.join(', ')})`);
        }
        const whereSql = filters.join(' AND ');
        const total = (db.prepare(`
          SELECT COUNT(*) AS value
          FROM paragraph_verse_refs r
          JOIN pages p ON p.id = r.page_id
          LEFT JOIN sections s ON s.id = p.parent_section_id
          JOIN page_paragraphs pp ON pp.page_id = r.page_id AND pp.paragraph_index = r.paragraph_index
          WHERE ${whereSql}
        `).get(params) as { value: number }).value;
        const rows = db.prepare(`
          SELECT
            r.page_id AS pageId,
            p.title AS pageTitle,
            COALESCE(n.custom_display_name, p.parent_notebook_name) AS notebook,
            p.parent_section_name AS section,
            r.paragraph_index AS paragraphIndex,
            pp.text AS paragraphText,
            r.original_text AS originalText,
            r.normalized_ref AS normalizedRef,
            r.book_index AS bookIndex,
            r.chapter,
            r.verse
          FROM paragraph_verse_refs r
          JOIN pages p ON p.id = r.page_id
          LEFT JOIN sections s ON s.id = p.parent_section_id
          JOIN page_paragraphs pp ON pp.page_id = r.page_id AND pp.paragraph_index = r.paragraph_index
          LEFT JOIN notebooks n ON n.id = p.parent_notebook_id
          WHERE ${whereSql}
          ORDER BY p.last_modified_date_time DESC, r.page_id, r.paragraph_index, r.start_index
          LIMIT @limit
        `).all(params);
        return json(response, 200, { total, rows });
      }
      if (url.pathname === '/api/bible/parallel') {
        const bookIndex = Number(required(url, 'bookIndex'));
        const chapter = Number(required(url, 'chapter'));
        const verseValue = url.searchParams.get('verse');
        const verse = verseValue ? Number(verseValue) : undefined;
        const limit = Math.max(1, Math.min(Number(url.searchParams.get('limit') ?? '20') || 20, 200));
        if (!Number.isInteger(bookIndex) || !Number.isInteger(chapter) || (verse != null && !Number.isInteger(verse))) {
          throw new Error('bookIndex, chapter, and verse must be integers.');
        }
        return json(response, 200, { rows:findParallelBibleReferences(db, {
          bookIndex,
          chapter,
          verse,
          limit,
          includeAuxiliaryRefs:includeAuxiliaryBibleRefs(url)
        }) });
      }
      if (url.pathname === '/api/bible/parallel/notes') {
        const bookIndex = Number(required(url, 'bookIndex'));
        const chapter = Number(required(url, 'chapter'));
        const verseValue = url.searchParams.get('verse');
        const verse = verseValue ? Number(verseValue) : undefined;
        const relatedBookIndex = Number(required(url, 'relatedBookIndex'));
        const relatedChapter = Number(required(url, 'relatedChapter'));
        const relatedVerseValue = url.searchParams.get('relatedVerse');
        const relatedVerse = relatedVerseValue ? Number(relatedVerseValue) : undefined;
        const limit = Math.max(1, Math.min(Number(url.searchParams.get('limit') ?? '50') || 50, 200));
        if (!Number.isInteger(bookIndex) || !Number.isInteger(chapter)
          || (verse != null && !Number.isInteger(verse))
          || !Number.isInteger(relatedBookIndex) || !Number.isInteger(relatedChapter)
          || (relatedVerse != null && !Number.isInteger(relatedVerse))) {
          throw new Error('bookIndex, chapter, verse, relatedBookIndex, relatedChapter, and relatedVerse must be integers.');
        }
        return json(response, 200, {
          rows:findParallelBibleReferenceNotes(db, {
            bookIndex,
            chapter,
            verse,
            relatedBookIndex,
            relatedChapter,
            relatedVerse,
            limit,
            includeAuxiliaryRefs:includeAuxiliaryBibleRefs(url)
          })
        });
      }
      if (url.pathname === '/api/download-log') {
        const allowedFilters = new Set(['downloaded-last-sync', 'downloaded', 'missing', 'errors', 'all']);
        const filter = url.searchParams.get('filter') ?? 'downloaded-last-sync';
        if (!allowedFilters.has(filter)) throw new Error('Unknown download log filter.');
        const limit = Math.max(1, Math.min(Number(url.searchParams.get('limit') ?? '100') || 100, 200));
        const offset = Math.max(0, Number(url.searchParams.get('offset') ?? '0') || 0);
        const notebookIds = [...new Set(url.searchParams.getAll('notebookId').filter(Boolean))];
        const params: Record<string, unknown> = { limit, offset };
        const scopeConditions = ['deleted_at IS NULL'];
        if (notebookIds.length > 0) {
          const placeholders = notebookIds.map((id, index) => {
            params[`notebookId${index}`] = id;
            return `@notebookId${index}`;
          });
          scopeConditions.push(`parent_notebook_id IN (${placeholders.join(', ')})`);
        }
        const lastSyncStartedAt = getSyncState(db, 'last_sync_started_at');
        if (lastSyncStartedAt) params.lastSyncStartedAt = lastSyncStartedAt;
        const filterCondition = filter === 'errors'
          ? 'fetch_error IS NOT NULL'
          : filter === 'missing'
            ? 'content_text IS NULL AND fetch_error IS NULL'
            : filter === 'downloaded'
              ? 'content_text IS NOT NULL AND fetch_error IS NULL'
              : filter === 'downloaded-last-sync'
                ? lastSyncStartedAt
                  ? 'content_synced_at >= @lastSyncStartedAt AND fetch_error IS NULL'
                  : '0'
                : '1';
        const scopeSql = scopeConditions.join(' AND ');
        const counts = db.prepare(`
          SELECT
            SUM(CASE WHEN content_text IS NOT NULL AND fetch_error IS NULL THEN 1 ELSE 0 END) AS downloaded,
            SUM(CASE WHEN content_text IS NULL AND fetch_error IS NULL THEN 1 ELSE 0 END) AS missing,
            SUM(CASE WHEN fetch_error IS NOT NULL THEN 1 ELSE 0 END) AS errors,
            COUNT(*) AS total
          FROM pages
          WHERE ${scopeSql}
        `).get(params) as Record<string, number>;
        const total = (db.prepare(`
          SELECT COUNT(*) AS value FROM pages WHERE ${scopeSql} AND (${filterCondition})
        `).get(params) as { value: number }).value;
        const rows = db.prepare(`
          SELECT
            p.id,
            p.title,
            COALESCE(n.custom_display_name, p.parent_notebook_name) AS notebook,
            p.parent_section_name AS section,
            p.content_synced_at AS contentSyncedAt,
            p.metadata_synced_at AS metadataSyncedAt,
            p.fetch_error AS error,
            CASE
              WHEN fetch_error IS NOT NULL THEN 'error'
              WHEN content_text IS NOT NULL THEN 'downloaded'
              ELSE 'missing'
            END AS status
          FROM pages p
          LEFT JOIN notebooks n ON n.id = p.parent_notebook_id
          WHERE ${scopeSql} AND (${filterCondition})
          ORDER BY
            CASE WHEN fetch_error IS NOT NULL THEN 0 WHEN content_text IS NULL THEN 1 ELSE 2 END,
            COALESCE(content_synced_at, metadata_synced_at) DESC,
            title COLLATE NOCASE
          LIMIT @limit OFFSET @offset
        `).all(params);
        return json(response, 200, { filter, lastSyncStartedAt, counts, total, limit, offset, rows });
      }
      if (url.pathname === '/api/notebooks') {
        const rows = db.prepare(`
          SELECT
            n.id,
            n.display_name AS originalDisplayName,
            n.custom_display_name AS customDisplayName,
            COALESCE(n.custom_display_name, n.display_name) AS displayName,
            COUNT(p.id) AS pageCount
          FROM notebooks n
          LEFT JOIN pages p ON p.parent_notebook_id = n.id AND p.deleted_at IS NULL
          GROUP BY n.id
          ORDER BY COALESCE(n.custom_display_name, n.display_name) COLLATE NOCASE
        `).all();
        return json(response, 200, rows);
      }
      if (url.pathname === '/api/sections') {
        const rows = db.prepare(`
          SELECT
            s.id,
            s.display_name AS displayName,
            s.pages_scan_complete AS scanComplete,
            s.pages_scanned_at AS scannedAt,
            s.pages_seen_count AS pagesSeenCount,
            s.pages_scan_error AS scanError,
            s.section_group_path AS groupPath,
            s.parent_section_group_id AS parentGroupId,
            s.order_index AS orderIndex,
            COUNT(p.id) AS pageCount
          FROM sections s
          LEFT JOIN pages p ON p.parent_section_id = s.id AND p.deleted_at IS NULL
          WHERE s.parent_notebook_id = ?
          GROUP BY s.id
          ORDER BY s.parent_section_group_id, s.order_index IS NULL, s.order_index, s.display_name COLLATE NOCASE
        `).all(required(url, 'notebookId'));
        return json(response, 200, rows);
      }
      if (url.pathname === '/api/section-groups') {
        const rows = db.prepare(`
          SELECT
            g.id,
            g.display_name AS displayName,
            g.parent_section_group_id AS parentGroupId,
            g.section_group_path AS groupPath,
            g.order_index AS orderIndex,
            COUNT(s.id) AS sectionCount
          FROM section_groups g
          LEFT JOIN sections s ON s.parent_section_group_id = g.id
          WHERE g.parent_notebook_id = ?
          GROUP BY g.id
          ORDER BY g.parent_section_group_id, g.order_index IS NULL, g.order_index, g.display_name COLLATE NOCASE
        `).all(required(url, 'notebookId'));
        return json(response, 200, rows);
      }
      if (url.pathname === '/api/pages') {
        const rows = db.prepare(`
          SELECT id, title, order_index AS orderIndex, page_level AS pageLevel,
            content_text IS NOT NULL AS hasContent, fetch_error AS fetchError
          FROM pages
          WHERE parent_section_id = ? AND deleted_at IS NULL
          ORDER BY order_index IS NULL, order_index, title COLLATE NOCASE
        `).all(required(url, 'sectionId')) as Array<{ title: string | null }>;
        return json(response, 200, rows);
      }
      if (url.pathname === '/api/search') {
        const notebookIds = url.searchParams.getAll('notebookId').filter(Boolean);
        let query = required(url, 'q');
        let mode = url.searchParams.get('mode') ?? 'and';
        const caseSensitive = url.searchParams.get('caseSensitive') === 'true';
        const searchView = url.searchParams.get('view') ?? 'structure';
        if (mode === 'and' && query.length >= 2 && query.startsWith('"') && query.endsWith('"')) {
          query = query.slice(1, -1);
          mode = 'phrase';
        }
        if (!['and', 'phrase', 'regex'].includes(mode)) throw new Error(`Unknown search mode: ${mode}`);
        if (!['structure', 'weight'].includes(searchView)) throw new Error(`Unknown search view: ${searchView}`);
        let parsedSearchRef: Awaited<ReturnType<typeof parseExternalBibleRef>> | null = null;
        let parsedParallelSearchRefs: Array<Awaited<ReturnType<typeof parseExternalBibleRef>>> | null = null;
        if (mode !== 'regex' && /(?:\d|:|bnVerse:|isbtBibleVerse:)/i.test(query)) {
          const pairQueries = query.split(';').map(part => part.trim()).filter(Boolean);
          try {
            if (pairQueries.length === 2) {
              const parsedPair = await Promise.all(pairQueries.map(part =>
                parseExternalBibleRef(part, url.searchParams.get('module')?.trim() || undefined)
              ));
              if (parsedPair.every(parsed =>
                Number.isInteger(Number(parsed.bookIndex))
                && Number.isInteger(Number(parsed.chapter))
                && Number.isInteger(Number(parsed.verse))
              )) {
                parsedParallelSearchRefs = parsedPair;
              }
            } else {
              const parsed = await parseExternalBibleRef(query, url.searchParams.get('module')?.trim() || undefined);
              if (Number.isInteger(Number(parsed.bookIndex)) && Number.isInteger(Number(parsed.chapter))) {
                parsedSearchRef = parsed;
              }
            }
          } catch {
            parsedSearchRef = null;
            parsedParallelSearchRefs = null;
          }
        }
        const rawResults = parsedSearchRef || parsedParallelSearchRefs
          ? []
          : mode === 'and' && !caseSensitive
          ? searchCache(db, query, {
              limit:100,
              mode:'and',
              notebookIds:notebookIds.length > 0 ? notebookIds : undefined
            })
          : searchCacheAdvanced(db, query, {
              limit:100,
              mode:mode as 'and' | 'phrase' | 'regex',
              caseSensitive,
              notebookIds
            });
        const resultsById = new Map<string, Record<string, unknown>>();
        const addResult = (item: Record<string, any>) => {
          const id = String(item.id);
          const incomingParagraphIndexes = Array.isArray(item.paragraphIndexes)
            ? item.paragraphIndexes.filter(Number.isInteger)
            : (Number.isInteger(item.paragraphIndex) ? [item.paragraphIndex] : []);
          const paragraphIndex = incomingParagraphIndexes[0];
          const existing = resultsById.get(id);
          if (existing) {
            if (existing.paragraphIndex == null && paragraphIndex != null) existing.paragraphIndex = paragraphIndex;
            if (incomingParagraphIndexes.length > 0) {
              const paragraphIndexes = Array.isArray(existing.paragraphIndexes) ? existing.paragraphIndexes : [];
              for (const incomingIndex of incomingParagraphIndexes) {
                if (!paragraphIndexes.includes(incomingIndex)) paragraphIndexes.push(incomingIndex);
              }
              existing.paragraphIndexes = paragraphIndexes;
            }
            if (!existing.snippet && item.snippet) existing.snippet = item.snippet;
            if (!existing.bibleRef && item.bibleRef) existing.bibleRef = item.bibleRef;
            if (item.bibleMatchScore != null) {
              const currentScore = Number(existing.bibleMatchScore ?? Number.POSITIVE_INFINITY);
              const nextScore = Number(item.bibleMatchScore);
              if (Number.isFinite(nextScore) && nextScore < currentScore) existing.bibleMatchScore = nextScore;
            }
            return;
          }
          resultsById.set(id, {
            id:item.id,
            title:item.title,
            notebookId:item.parent_notebook_id,
            notebook:item.parent_notebook_name,
            section:item.parent_section_name,
            snippet:item.snippet,
            paragraphIndex,
            paragraphIndexes:incomingParagraphIndexes,
            bibleRef:item.bibleRef,
            bibleMatchScore:item.bibleMatchScore,
            bibleWeight:item.bibleWeight
          });
        };
        rawResults.forEach((item: any) => addResult(item));

        if (parsedParallelSearchRefs) {
          const [targetRef, relatedRef] = parsedParallelSearchRefs;
          const parallelRows = findParallelBibleReferenceNotes(db, {
            bookIndex:Number(targetRef.bookIndex),
            chapter:Number(targetRef.chapter),
            verse:Number(targetRef.verse),
            relatedBookIndex:Number(relatedRef.bookIndex),
            relatedChapter:Number(relatedRef.chapter),
            relatedVerse:Number(relatedRef.verse),
            notebookIds,
            limit:200,
            includeAuxiliaryRefs:includeAuxiliaryBibleRefs(url)
          });
          const pages = new Map<string, Record<string, any>>();
          for (const row of parallelRows as Array<Record<string, any>>) {
            const pageId = String(row.pageId);
            const page = pages.get(pageId) ?? {
              id:pageId,
              title:row.pageTitle,
              parent_notebook_id:row.parentNotebookId,
              parent_notebook_name:row.notebook,
              parent_section_name:row.section,
              paragraphIndexes:[],
              snippet:null,
              snippetIndex:Number.POSITIVE_INFINITY,
              bibleRef:query,
              bibleMatchScore:0,
              bibleWeight:0
            };
            const paragraphIndexes = String(row.pairParagraphIndexes || '')
              .split(',')
              .concat([row.targetParagraphIndex, row.relatedParagraphIndex])
              .map(Number)
              .filter(Number.isInteger);
            page.paragraphIndexes.push(...paragraphIndexes);
            const firstIndex = Math.min(...paragraphIndexes);
            if (firstIndex < page.snippetIndex) {
              page.snippetIndex = firstIndex;
              page.snippet = firstIndex === Number(row.targetParagraphIndex)
                ? row.targetParagraphText
                : row.relatedParagraphText;
            }
            page.bibleWeight += Number(row.relationWeight || 0);
            pages.set(pageId, page);
          }
          pages.forEach(page => addResult(page));
        }

        if (parsedSearchRef) {
          try {
            const parsedRef = parsedSearchRef;
            const bookIndex = Number(parsedRef.bookIndex);
            const chapter = Number(parsedRef.chapter);
            const verse = Number(parsedRef.verse);
            if (Number.isInteger(bookIndex) && Number.isInteger(chapter)) {
              if (Number.isInteger(verse)) {
                const bibleRows = searchBibleReferenceNotesByWeight(db, {
                  bookIndex,
                  chapter,
                  verse,
                  topChapter:Number.isInteger(Number(parsedRef.topChapter)) ? Number(parsedRef.topChapter) : chapter,
                  topVerse:Number.isInteger(Number(parsedRef.topVerse)) ? Number(parsedRef.topVerse) : verse,
                  notebookIds,
                  limit:100,
                  includeAuxiliaryRefs:includeAuxiliaryBibleRefs(url),
                  orderByWeight:searchView === 'weight'
                });
                bibleRows.forEach(addResult);
              } else {
              const filters = ['p.deleted_at IS NULL'];
              if (!includeAuxiliaryBibleRefs(url)) {
                filters.push(visibleBibleRefSql('r', 'pp'));
                filters.push(visibleBibleScopeSql('p', 's'));
              }
              const bibleParams: Record<string, unknown> = {
                limit:100,
                refBookIndex:bookIndex,
                refStartChapter:chapter,
                refEndChapter:Number.isInteger(Number(parsedRef.topChapter)) ? Number(parsedRef.topChapter) : chapter,
                refStartVerse:null,
                refEndVerse:null
              };
              filters.push('r.book_index = @refBookIndex AND r.chapter = @refStartChapter');
              if (notebookIds.length > 0) {
                const placeholders = notebookIds.map((_, index) => {
                  bibleParams[`notebookId${index}`] = notebookIds[index];
                  return `@notebookId${index}`;
                });
                filters.push(`p.parent_notebook_id IN (${placeholders.join(', ')})`);
              }
              const bibleRows = db.prepare(`
                SELECT
                  r.page_id AS id,
                  p.title,
                  p.parent_notebook_id,
                  COALESCE(n.custom_display_name, p.parent_notebook_name) AS parent_notebook_name,
                  p.parent_section_name,
                  r.paragraph_index AS paragraphIndex,
                  pp.text AS snippet,
                  COALESCE(r.normalized_ref, r.original_text) AS bibleRef,
                  CASE
                    WHEN @refStartVerse IS NULL THEN 0
                    WHEN r.chapter = @refStartChapter AND COALESCE(r.verse, 0) = @refStartVerse
                      AND COALESCE(r.top_chapter, r.chapter) = @refEndChapter
                      AND COALESCE(r.top_verse, r.verse, 0) = @refEndVerse THEN 0
                    WHEN r.chapter = @refStartChapter AND COALESCE(r.verse, 0) = @refStartVerse THEN 1
                    WHEN COALESCE(r.top_chapter, r.chapter) = @refEndChapter
                      AND COALESCE(r.top_verse, r.verse, 0) = @refEndVerse THEN 2
                    ELSE 10
                  END AS bibleMatchScore
                FROM paragraph_verse_refs r
                JOIN pages p ON p.id = r.page_id
                LEFT JOIN sections s ON s.id = p.parent_section_id
                JOIN page_paragraphs pp ON pp.page_id = r.page_id AND pp.paragraph_index = r.paragraph_index
                LEFT JOIN notebooks n ON n.id = p.parent_notebook_id
                WHERE ${filters.join(' AND ')}
                ORDER BY p.last_modified_date_time DESC, r.page_id, r.paragraph_index, r.start_index
                LIMIT @limit
              `).all(bibleParams) as Array<Record<string, unknown>>;
              bibleRows.forEach(addResult);
              }
            }
          } catch (error) {
            runtimeLog('search', 'Bible reference search skipped', {
              query,
              error:error instanceof Error ? error.message : String(error)
            });
          }
        }
        for (const result of resultsById.values()) {
          if (Array.isArray(result.paragraphIndexes)) {
            const paragraphIndexes = result.paragraphIndexes as unknown[];
            const sortedParagraphIndexes = [...new Set(paragraphIndexes)]
              .filter((value): value is number => Number.isInteger(value))
              .sort((left, right) => left - right);
            result.paragraphIndexes = sortedParagraphIndexes;
            result.paragraphIndex = sortedParagraphIndexes[0] ?? result.paragraphIndex;
          }
        }
        const results = [...resultsById.values()]
          .sort((left, right) => {
            const bibleCompare = Number(Boolean(right.bibleRef)) - Number(Boolean(left.bibleRef));
            if (bibleCompare !== 0) return bibleCompare;
            if (searchView === 'weight' && left.bibleWeight != null && right.bibleWeight != null) {
              const weightCompare = Number(right.bibleWeight) - Number(left.bibleWeight);
              if (weightCompare !== 0) return weightCompare;
            }
            return Number(left.bibleMatchScore ?? 1000) - Number(right.bibleMatchScore ?? 1000);
          })
          .slice(0, 100);
        return json(response, 200, results);
      }
      if (url.pathname === '/api/page') {
        const pageId = required(url, 'id');
        const cached = readCachedPage(db, pageId, false, 2_000_000);
        const row = getCachedPage(db, pageId);
        markPageOpened(db, pageId);
        const text = typeof cached.text === 'string'
          ? cached.text.replace(/[\t ]+\n/g, '\n').replace(/\n{3,}/g, '\n\n')
          : cached.text;
        const hasHtml = Boolean(row?.content_html && hasRenderableHtmlBody(row.content_html));
        const normalizedText = typeof text === 'string' ? text.trim() : '';
        const normalizedTitle = typeof row?.title === 'string' ? row.title.trim() : '';
        const isEmpty = !cached.fetchError && !hasHtml && (!normalizedText || normalizedText === normalizedTitle);
        return json(response, 200, { ...cached, text, hasHtml, isEmpty });
      }
      if (url.pathname === '/api/page-status') {
        const pageId = required(url, 'id');
        const row = getCachedPage(db, pageId);
        if (!row || row.deleted_at) return json(response, 404, { error: 'Page is not in the local cache.' });
        markPageOpened(db, pageId);
        return json(response, 200, {
          hasContent: row.content_text != null,
          contentSyncedAt: row.content_synced_at,
          fetchError: row.fetch_error
        });
      }
      if (url.pathname === '/api/page-html') {
        const pageId = required(url, 'id');
        const row = getCachedPage(db, pageId);
        if (!row || row.deleted_at) return json(response, 404, { error: 'Page is not in the active cache.' });
        if (!row.content_html) return json(response, 404, { error: 'HTML is not cached for this page.' });
        if (url.searchParams.get('raw') === '1') return json(response, 200, { id: pageId, html: row.content_html });
        const bibleConfig = bibleParseConfigFromEnv();
        const module = url.searchParams.get('module') || bibleConfig.module;
        if (!shouldParsePageHtml(db, pageId, row.content_html, module, bibleParserVersion)) {
          runtimeLog('http', 'Serving current cached page HTML', { pageId, module, parserVersion:bibleParserVersion });
          return json(response, 200, { id: pageId, html: row.content_html });
        }
        const bibleState = getBibleParseState(db, pageId);
        const bibleStateIsCurrent = Boolean(
          row.content_hash
          && bibleState
          && !shouldParseBibleRefs(db, pageId, row.content_hash, module, bibleParserVersion)
        );
        const legacyHtmlLooksParsed = bibleState?.refs_count === 0
          || /(?:isbtBibleVerse|bnVerse):/i.test(row.content_html);
        if (bibleStateIsCurrent && legacyHtmlLooksParsed) {
          markPageHtmlParsed(db, pageId, row.content_html, module, bibleParserVersion);
          runtimeLog('http', 'Adopted current legacy page HTML parse state', { pageId, module, parserVersion:bibleParserVersion });
          return json(response, 200, { id: pageId, html: row.content_html });
        }
        startPageHtmlRefresh(pageId, module);
        return json(response, 200, { id: pageId, html: row.content_html, refreshing:true });
      }
      return json(response, 404, { error: 'Not found.' });
    } catch (error: any) {
      const statusCode = Number.isInteger(error?.statusCode) ? error.statusCode : 400;
      runtimeLog('http-error', `${request.method ?? 'GET'} ${request.url ?? ''}`, {
        statusCode,
        error: error?.stack ?? error?.message ?? String(error)
      });
      return json(response, statusCode, { error: error?.message ?? String(error) });
    }
  });

  server.on('close', () => cacheDb?.close());
  server.listen(options.port, '127.0.0.1', () => {
    logStartupTiming(`server listening port=${options.port}`);
    console.log(`BibleNote: http://127.0.0.1:${options.port}`);
    console.log(`Database: ${options.dbPath}`);
    console.log('Press Ctrl+C to stop.');
    startDbInit();
  });
  return server;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const options = parseArgs(process.argv.slice(2));
  const server = startCacheUi(options);
  process.once('SIGINT', () => server.close(() => process.exit(0)));
  process.once('SIGTERM', () => server.close(() => process.exit(0)));
}
