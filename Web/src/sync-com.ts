import { bibleParseConfigFromEnv, bibleParserVersion, parsePageWithBibleNote } from './bible.js';
import {
  cacheStatus,
  checkpointCacheDb,
  clearSyncState,
  defaultDbPath,
  getCachedPageContent,
  getCachedPageSyncState,
  markMissingPagesDeleted,
  markPageDeleted,
  markPageHtmlParsed,
  markSectionPagesScanned,
  nowIso,
  openCacheDb,
  resetCacheDb,
  setBibleParseError,
  setPageFetchError,
  setSyncState,
  shouldParseBibleRefs,
  updatePageContent,
  updatePageHtml,
  upsertBibleParseResult,
  upsertNotebook,
  upsertPageMetadata,
  upsertSection,
  upsertSectionGroup
} from './cache.js';
import { htmlToText } from './html.js';
import { loadOneNoteComPageHtml, loadOneNoteComSnapshot } from './onenote-com.js';
import { runtimeLog } from './runtime-logging.js';
import type { Page, SyncOptions, SyncResult } from './sync.js';

function shouldFetchPage(
  cached: ReturnType<typeof getCachedPageSyncState>,
  page: Page,
  options: SyncOptions
): boolean {
  if (options.metadataOnly) return false;
  if (options.forceContent) return true;
  if (!cached?.content_synced_at || !cached.has_nonempty_content_text) return true;
  if (!cached.has_content_html) return true;
  return (cached.content_source_modified_date_time ?? null) !== (page.lastModifiedDateTime ?? null);
}

function countBibleReferences(result: Awaited<ReturnType<typeof parsePageWithBibleNote>>): number {
  return (result.paragraphs ?? []).reduce((sum, paragraph) => sum + (paragraph.references?.length ?? 0), 0);
}

export async function syncOneNoteComCache(options: SyncOptions = {}): Promise<SyncResult> {
  const startedAt = nowIso();
  const db = openCacheDb(options.dbPath ?? defaultDbPath);
  if (options.replaceAll && (options.pageId || options.sectionId || options.maxPages || options.metadataOnly || options.incrementalMetadata)) {
    db.close();
    throw new Error('replaceAll requires a full content sync; pageId, sectionId, maxPages, and metadataOnly are not allowed.');
  }
  setSyncState(db, 'last_sync_started_at', startedAt);
  setSyncState(db, 'last_sync_status', 'running');
  clearSyncState(db, 'last_sync_error');

  try {
    if (options.replaceAll) {
      options.onProgress?.({ phase:'reset-cache', message:'Recreating local cache tables' });
      resetCacheDb(db);
      checkpointCacheDb(db, 'TRUNCATE');
      setSyncState(db, 'last_sync_started_at', startedAt);
      setSyncState(db, 'last_sync_status', 'running');
    }

    options.onProgress?.({ phase:'notebooks', message:'Reading classic OneNote hierarchy' });
    const snapshot = await loadOneNoteComSnapshot();
    if (snapshot.notebooks.length === 0) {
      throw new Error('Классический OneNote не вернул ни одной открытой записной книжки.');
    }

    const requestedNotebookIds = options.notebookIds
      ? [...new Set(options.notebookIds.filter(Boolean))]
      : undefined;
    let selectedNotebookIds = requestedNotebookIds;
    if (requestedNotebookIds) {
      const availableIds = new Set(snapshot.notebooks.map(notebook => notebook.id));
      const known = requestedNotebookIds.filter(id => availableIds.has(id));
      if (known.length === 0 && options.replaceAll) {
        selectedNotebookIds = snapshot.notebooks.map(notebook => notebook.id);
      } else if (known.length !== requestedNotebookIds.length) {
        const unknown = requestedNotebookIds.filter(id => !availableIds.has(id));
        throw new Error(`Unknown local OneNote notebook ID: ${unknown.join(', ')}`);
      }
    }
    if (selectedNotebookIds?.length === 0) throw new Error('At least one notebook must be selected.');

    const selectedSet = selectedNotebookIds ? new Set(selectedNotebookIds) : undefined;
    let notebooks = snapshot.notebooks.filter(notebook => !selectedSet || selectedSet.has(notebook.id));
    let sections = snapshot.sections.filter(section =>
      !selectedSet || Boolean(section.parentNotebook?.id && selectedSet.has(section.parentNotebook.id))
    );
    let sectionGroups = snapshot.sectionGroups.filter(group =>
      !selectedSet || Boolean(group.parentNotebook?.id && selectedSet.has(group.parentNotebook.id))
    );
    let pages = snapshot.pages.filter(page =>
      !selectedSet || Boolean(page.parentNotebook?.id && selectedSet.has(page.parentNotebook.id))
    );

    if (options.sectionId) {
      sections = sections.filter(section => section.id === options.sectionId);
      if (sections.length === 0) throw new Error(`Local OneNote section was not found: ${options.sectionId}`);
      const section = sections[0];
      notebooks = snapshot.notebooks.filter(notebook => notebook.id === section.parentNotebook?.id);
      sectionGroups = snapshot.sectionGroups.filter(group => group.parentNotebook?.id === section.parentNotebook?.id);
      pages = snapshot.pages.filter(page => page.parentSection?.id === options.sectionId);
    }
    if (options.pageId) {
      pages = pages.filter(page => page.id === options.pageId);
      if (pages.length === 0) {
        const deletedPagesMarked = markPageDeleted(db, options.pageId, startedAt);
        if (deletedPagesMarked === 0) {
          throw new Error('Страница не найдена в классическом OneNote.');
        }
        const finishedAt = nowIso();
        setSyncState(db, 'last_data_source', 'com');
        setSyncState(db, 'last_sync_finished_at', finishedAt);
        setSyncState(db, 'last_sync_page_count', '0');
        setSyncState(db, 'last_sync_content_downloaded', '0');
        setSyncState(db, 'last_sync_content_errors', '0');
        setSyncState(db, 'last_sync_section_scan_errors', '0');
        setSyncState(db, 'last_sync_bible_refs_pages_parsed', '0');
        setSyncState(db, 'last_sync_bible_refs_recognized', '0');
        setSyncState(db, 'last_sync_bible_refs_parse_errors', '0');
        setSyncState(db, 'last_sync_status', 'success');
        checkpointCacheDb(db, 'TRUNCATE');
        return {
          dbPath:db.name,
          cacheReset:false,
          notebooks:0,
          sections:0,
          sectionGroups:0,
          pages:0,
          contentDownloaded:0,
          contentSkipped:0,
          contentErrors:0,
          sectionScanErrors:0,
          bibleRefsPagesParsed:0,
          bibleRefsParseSkipped:0,
          bibleRefsParseErrors:0,
          bibleRefsRecognized:0,
          deletedPagesMarked,
          startedAt,
          finishedAt,
          status:cacheStatus(db)
        };
      }
      const page = pages[0];
      sections = snapshot.sections.filter(section => section.id === page.parentSection?.id);
      notebooks = snapshot.notebooks.filter(notebook => notebook.id === page.parentNotebook?.id);
      sectionGroups = snapshot.sectionGroups.filter(group => group.parentNotebook?.id === page.parentNotebook?.id);
    }
    if (options.maxPages) pages = pages.slice(0, options.maxPages);

    const syncedAt = nowIso();
    const structureTransaction = db.transaction(() => {
      for (const notebook of notebooks) upsertNotebook(db, notebook, syncedAt);
      for (const group of sectionGroups) upsertSectionGroup(db, group, syncedAt);
      for (const section of sections) upsertSection(db, section, syncedAt);
      for (const page of pages) upsertPageMetadata(db, page, syncedAt);
      for (const section of sections) {
        markSectionPagesScanned(
          db,
          section.id,
          !options.maxPages,
          pages.filter(page => page.parentSection?.id === section.id).length,
          syncedAt
        );
      }
    });
    structureTransaction();
    options.onProgress?.({ phase:'notebooks', notebooks:notebooks.length });
    options.onProgress?.({
      phase:'sections',
      sections:sections.length,
      sectionGroups:sectionGroups.length
    });
    options.onProgress?.({ phase:'pages', pages:pages.length, sectionTotal:sections.length });

    const pagesToFetch = pages.filter(page =>
      shouldFetchPage(getCachedPageSyncState(db, page.id), page, options)
    );
    let contentDownloaded = 0;
    let contentErrors = 0;
    const contentSkipped = pages.length - pagesToFetch.length;
    options.onProgress?.({
      phase:'content',
      contentDone:0,
      contentTotal:pagesToFetch.length,
      contentSkipped,
      message:'Reading pages from classic OneNote'
    });

    for (const page of pagesToFetch) {
      try {
        const html = await loadOneNoteComPageHtml(page.id);
        updatePageContent(
          db,
          page.id,
          htmlToText(html),
          html,
          page.lastModifiedDateTime ?? null,
          nowIso(),
          null
        );
        contentDownloaded += 1;
      } catch (error: any) {
        contentErrors += 1;
        setPageFetchError(db, page.id, error?.message ?? String(error), {
          failedAt:nowIso(),
          terminal:false,
          sourceModifiedDateTime:page.lastModifiedDateTime ?? null
        });
        runtimeLog('sync-com', 'Local OneNote page read failed', {
          pageId:page.id,
          title:page.title,
          error:error?.stack ?? error?.message ?? String(error)
        });
      }
      options.onProgress?.({
        phase:'content',
        contentDone:contentDownloaded + contentErrors,
        contentTotal:pagesToFetch.length,
        contentSkipped,
        errors:contentErrors,
        message:'Reading pages from classic OneNote'
      });
    }

    let bibleRefsPagesParsed = 0;
    let bibleRefsParseSkipped = 0;
    let bibleRefsParseErrors = 0;
    let bibleRefsRecognized = 0;
    if (!options.metadataOnly) {
      const bibleConfig = bibleParseConfigFromEnv({
        enabled:options.parseBibleRefs ?? undefined,
        apiUrl:options.bibleNoteApiUrl ?? undefined,
        module:options.bibleModule ?? undefined
      });
      if (bibleConfig.enabled) {
        const candidates = pages
          .map(page => getCachedPageSyncState(db, page.id))
          .filter((page): page is NonNullable<ReturnType<typeof getCachedPageSyncState>> =>
            Boolean(page?.has_nonempty_content_text && page.content_hash && !page.deleted_at));
        const pagesToParse = candidates.filter(page =>
          shouldParseBibleRefs(
            db,
            page.id,
            page.content_hash!,
            bibleConfig.module,
            bibleParserVersion,
            options.forceBibleParse
          )
        );
        bibleRefsParseSkipped = candidates.length - pagesToParse.length;
        options.onProgress?.({
          phase:'bible-parse',
          bibleParseDone:0,
          bibleParseTotal:pagesToParse.length,
          bibleParseSkipped:bibleRefsParseSkipped
        });
        for (const candidate of pagesToParse) {
          const page = getCachedPageContent(db, candidate.id);
          try {
            if (!page?.content_text || !page.content_hash || page.deleted_at) {
              throw new Error(`Cached page content is unavailable for Bible parsing: ${candidate.id}`);
            }
            const sourceHtml = page.content_html;
            const result = await parsePageWithBibleNote({
              apiUrl:bibleConfig.apiUrl,
              pageId:page.id,
              title:page.title,
              html:sourceHtml,
              text:page.content_text,
              module:bibleConfig.module,
              useCommaDelimiter:bibleConfig.useCommaDelimiter,
              timeoutMs:bibleConfig.timeoutMs,
              updateHtml:Boolean(sourceHtml)
            });
            const parsedAt = nowIso();
            if (result.html && sourceHtml) {
              updatePageHtml(db, page.id, result.html);
              markPageHtmlParsed(db, page.id, result.html, result.module || bibleConfig.module, bibleParserVersion, parsedAt);
            }
            upsertBibleParseResult(db, page.id, page.content_hash, result, bibleParserVersion, parsedAt);
            bibleRefsRecognized += countBibleReferences(result);
            bibleRefsPagesParsed += 1;
          } catch (error: any) {
            bibleRefsParseErrors += 1;
            setBibleParseError(
              db,
              candidate.id,
              candidate.content_hash,
              bibleConfig.module,
              bibleParserVersion,
              error?.message ?? String(error)
            );
          }
          options.onProgress?.({
            phase:'bible-parse',
            bibleParseDone:bibleRefsPagesParsed + bibleRefsParseErrors,
            bibleParseTotal:pagesToParse.length,
            bibleParseSkipped:bibleRefsParseSkipped,
            bibleRefsRecognized,
            errors:bibleRefsParseErrors
          });
        }
      }
    }

    const seenPageIds = new Set(pages.map(page => page.id));
    const reconciliationNotebookIds = selectedNotebookIds ?? notebooks.map(notebook => notebook.id);
    const deletedPagesMarked = !options.pageId && !options.sectionId && !options.maxPages
      ? markMissingPagesDeleted(db, seenPageIds, syncedAt, reconciliationNotebookIds)
      : 0;
    const finishedAt = nowIso();
    setSyncState(db, 'last_data_source', 'com');
    setSyncState(db, 'last_sync_finished_at', finishedAt);
    setSyncState(db, 'last_sync_page_count', String(pages.length));
    setSyncState(db, 'last_sync_content_downloaded', String(contentDownloaded));
    setSyncState(db, 'last_sync_content_errors', String(contentErrors));
    setSyncState(db, 'last_sync_section_scan_errors', '0');
    setSyncState(db, 'last_sync_bible_refs_pages_parsed', String(bibleRefsPagesParsed));
    setSyncState(db, 'last_sync_bible_refs_recognized', String(bibleRefsRecognized));
    setSyncState(db, 'last_sync_bible_refs_parse_errors', String(bibleRefsParseErrors));
    setSyncState(
      db,
      'last_sync_status',
      contentErrors === 0 && bibleRefsParseErrors === 0 ? 'success' : 'completed_with_errors'
    );
    checkpointCacheDb(db, 'TRUNCATE');
    return {
      dbPath:db.name,
      cacheReset:options.replaceAll === true,
      notebooks:notebooks.length,
      sections:sections.length,
      sectionGroups:sectionGroups.length,
      pages:pages.length,
      contentDownloaded,
      contentSkipped,
      contentErrors,
      sectionScanErrors:0,
      bibleRefsPagesParsed,
      bibleRefsParseSkipped,
      bibleRefsParseErrors,
      bibleRefsRecognized,
      deletedPagesMarked,
      startedAt,
      finishedAt,
      status:cacheStatus(db)
    };
  } catch (error: any) {
    const message = error?.name === 'TimeoutError' || /timed?\s*out|timeout/i.test(error?.message ?? '')
      ? 'Классический OneNote не ответил за 60 секунд. Откройте или перезапустите OneNote и повторите синхронизацию.'
      : error?.message ?? String(error);
    setSyncState(db, 'last_sync_status', 'failed');
    setSyncState(db, 'last_sync_error', message.slice(0, 4000));
    if (message !== (error?.message ?? String(error))) throw new Error(message, { cause:error });
    throw error;
  } finally {
    checkpointCacheDb(db);
    db.close();
  }
}
