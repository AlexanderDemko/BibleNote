import { promises as fs } from 'node:fs';
import { bibleParseConfigFromEnv, bibleParserVersion, parsePageWithBibleNote } from './bible.js';
import {
  cacheStatus,
  checkpointCacheDb,
  clearSyncState,
  defaultDbPath,
  getCachedPage,
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
import { extractFolderFile, WordComUnavailableError } from './folder-extract.js';
import { loadFolderSnapshot, type FolderPage } from './folder-source.js';
import { folderSourcePaths } from './onenote-settings.js';
import { runtimeLog, runtimeWarning } from './runtime-logging.js';
import type { SyncOptions, SyncResult } from './sync.js';

function shouldReadFile(cached: ReturnType<typeof getCachedPage>, page: FolderPage, options: SyncOptions): boolean {
  if (options.metadataOnly) return false;
  if (options.forceContent) return true;
  if (!cached?.content_synced_at || cached.content_text == null || !cached.content_html) return true;
  if (page.links.folder.extractionVersion != null
    && page.cachedExtractionVersion !== page.links.folder.extractionVersion) return true;
  return (cached.content_source_modified_date_time ?? null) !== page.lastModifiedDateTime;
}

function countBibleReferences(result: Awaited<ReturnType<typeof parsePageWithBibleNote>>): number {
  return (result.paragraphs ?? []).reduce((sum, paragraph) => sum + (paragraph.references?.length ?? 0), 0);
}

function mergeCachedFolderDiagnostics(cached: ReturnType<typeof getCachedPage>, page: FolderPage): void {
  if (!cached?.links_json) return;
  try {
    const links = JSON.parse(cached.links_json);
    const previous = links?.folder;
    if (!previous || previous.path !== page.links.folder.path) return;
    page.cachedExtractionVersion = typeof previous.extractionVersion === 'number'
      ? previous.extractionVersion
      : undefined;
    page.links.folder = {
      ...page.links.folder,
      quality:previous.quality,
      qualityMessage:previous.qualityMessage,
      warnings:Array.isArray(previous.warnings) ? previous.warnings : undefined
    };
  } catch {
    // Invalid legacy link metadata is replaced by the current folder metadata.
  }
}

export async function syncFolderCache(options: SyncOptions = {}): Promise<SyncResult> {
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
    const roots = options.folderSourcePaths ?? folderSourcePaths();
    if (roots.length === 0) throw new Error('Добавьте хотя бы одну папку в параметрах источника Folder.');
    if (options.replaceAll) {
      options.onProgress?.({ phase:'reset-cache', message:'Recreating local cache tables' });
      resetCacheDb(db);
      checkpointCacheDb(db, 'TRUNCATE');
      setSyncState(db, 'last_sync_started_at', startedAt);
      setSyncState(db, 'last_sync_status', 'running');
    }

    options.onProgress?.({ phase:'notebooks', message:'Scanning folders' });
    const snapshot = await loadFolderSnapshot(roots, {
      deduplicateFilesByName:options.deduplicateFolderFilesByName === true
    });
    const requestedNotebookIds = options.notebookIds
      ? [...new Set(options.notebookIds.filter(Boolean))]
      : undefined;
    const availableNotebookIds = new Set(snapshot.notebooks.map(notebook => notebook.id));
    if (requestedNotebookIds?.some(id => !availableNotebookIds.has(id))) {
      throw new Error(`Unknown folder source ID: ${requestedNotebookIds.filter(id => !availableNotebookIds.has(id)).join(', ')}`);
    }
    const selectedNotebookIds = requestedNotebookIds ?? snapshot.notebooks.map(notebook => notebook.id);
    const selectedSet = new Set(selectedNotebookIds);
    let notebooks = snapshot.notebooks.filter(notebook => selectedSet.has(notebook.id));
    let sectionGroups = snapshot.sectionGroups.filter(group => selectedSet.has(group.parentNotebook.id));
    let sections = snapshot.sections.filter(section => selectedSet.has(section.parentNotebook.id));
    let pages = snapshot.pages.filter(page => selectedSet.has(page.parentNotebook.id));

    if (options.sectionId) {
      sections = sections.filter(section => section.id === options.sectionId);
      if (sections.length === 0) throw new Error(`Folder section was not found: ${options.sectionId}`);
      const section = sections[0];
      notebooks = notebooks.filter(notebook => notebook.id === section.parentNotebook.id);
      sectionGroups = sectionGroups.filter(group => group.parentNotebook.id === section.parentNotebook.id);
      pages = pages.filter(page => page.parentSection.id === section.id);
    }
    if (options.pageId) {
      pages = pages.filter(page => page.id === options.pageId);
      if (pages.length === 0) {
        const deletedPagesMarked = markPageDeleted(db, options.pageId, startedAt);
        if (deletedPagesMarked === 0) throw new Error('Файл не найден в настроенных папках.');
        const finishedAt = nowIso();
        setSyncState(db, 'last_data_source', 'folder');
        setSyncState(db, 'last_sync_finished_at', finishedAt);
        setSyncState(db, 'last_sync_status', 'success');
        return {
          dbPath:db.name, cacheReset:false, notebooks:0, sections:0, sectionGroups:0, pages:0,
          contentDownloaded:0, contentSkipped:0, contentErrors:0, sectionScanErrors:snapshot.scanErrors.length,
          bibleRefsPagesParsed:0, bibleRefsParseSkipped:0, bibleRefsParseErrors:0, bibleRefsRecognized:0,
          deletedPagesMarked, startedAt, finishedAt, status:cacheStatus(db)
        };
      }
      const page = pages[0];
      sections = sections.filter(section => section.id === page.parentSection.id);
      notebooks = notebooks.filter(notebook => notebook.id === page.parentNotebook.id);
      sectionGroups = sectionGroups.filter(group => group.parentNotebook.id === page.parentNotebook.id);
    }
    if (options.maxPages) pages = pages.slice(0, options.maxPages);

    const syncedAt = nowIso();
    const structureTransaction = db.transaction(() => {
      for (const notebook of notebooks) upsertNotebook(db, notebook, syncedAt);
      for (const group of sectionGroups) upsertSectionGroup(db, group, syncedAt);
      for (const section of sections) upsertSection(db, section, syncedAt);
      for (const page of pages) {
        mergeCachedFolderDiagnostics(getCachedPage(db, page.id), page);
        upsertPageMetadata(db, page, syncedAt);
      }
      for (const section of sections) {
        markSectionPagesScanned(
          db,
          section.id,
          !options.maxPages,
          pages.filter(page => page.parentSection.id === section.id).length,
          syncedAt
        );
      }
    });
    structureTransaction();
    options.onProgress?.({ phase:'notebooks', notebooks:notebooks.length });
    options.onProgress?.({ phase:'sections', sections:sections.length, sectionGroups:sectionGroups.length });
    options.onProgress?.({ phase:'pages', pages:pages.length, sectionTotal:sections.length });

    const pagesToRead = pages.filter(page => shouldReadFile(getCachedPage(db, page.id), page, options));
    const contentSkipped = pages.length - pagesToRead.length;
    let contentDownloaded = 0;
    let contentErrors = 0;
    let wordComUnavailable: WordComUnavailableError | undefined;
    options.onProgress?.({
      phase:'content', contentDone:0, contentTotal:pagesToRead.length, contentSkipped,
      message:'Reading files from folders'
    });
    for (const page of pagesToRead) {
      try {
        const stat = await fs.stat(page.links.folder.path);
        if (stat.size > 100 * 1024 * 1024) throw new Error('Файл больше 100 МБ и пропущен для безопасной локальной обработки.');
        if (page.links.folder.extension === '.doc' && wordComUnavailable) {
          throw new WordComUnavailableError(wordComUnavailable.message);
        }
        const extracted = await extractFolderFile(page.links.folder.path, {
          legacyDocConverter:options.legacyDocConverter
        });
        page.links.folder.quality = extracted.quality;
        page.links.folder.qualityMessage = extracted.qualityMessage;
        page.links.folder.warnings = extracted.warnings;
        upsertPageMetadata(db, page, nowIso());
        updatePageContent(db, page.id, extracted.text, extracted.html, page.lastModifiedDateTime, nowIso(), null);
        contentDownloaded += 1;
        runtimeLog('sync-folder', 'Extracted folder file', {
          pageId:page.id, path:page.links.folder.path, format:extracted.format,
          quality:extracted.quality, textChars:extracted.text.length, warnings:extracted.warnings
        });
      } catch (error) {
        contentErrors += 1;
        if (error instanceof WordComUnavailableError) {
          wordComUnavailable = error;
          runtimeWarning('sync-folder', 'Legacy .doc file found, but Microsoft Word COM is unavailable', {
            path:page.links.folder.path,
            platform:process.platform,
            reason:error.message
          });
        } else {
          runtimeLog('sync-folder', 'Folder file extraction failed', {
            path:page.links.folder.path,
            extension:page.links.folder.extension,
            error:error instanceof Error ? error.stack ?? error.message : String(error)
          });
        }
        setPageFetchError(db, page.id, error instanceof Error ? error.message : String(error), {
          failedAt:nowIso(), terminal:false, sourceModifiedDateTime:page.lastModifiedDateTime
        });
      }
      options.onProgress?.({
        phase:'content', contentDone:contentDownloaded + contentErrors, contentTotal:pagesToRead.length,
        contentSkipped, errors:contentErrors, message:'Reading files from folders'
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
          .map(page => getCachedPage(db, page.id))
          .filter(page => Boolean(page?.content_text && page.content_html && page.content_hash && !page.deleted_at));
        const pagesToParse = candidates.filter(page => shouldParseBibleRefs(
          db, page!.id, page!.content_hash!, bibleConfig.module, bibleParserVersion, options.forceBibleParse
        ));
        bibleRefsParseSkipped = candidates.length - pagesToParse.length;
        options.onProgress?.({
          phase:'bible-parse', bibleParseDone:0, bibleParseTotal:pagesToParse.length,
          bibleParseSkipped:bibleRefsParseSkipped
        });
        for (const page of pagesToParse) {
          try {
            const result = await parsePageWithBibleNote({
              apiUrl:bibleConfig.apiUrl,
              pageId:page!.id,
              title:page!.title,
              html:page!.content_html,
              module:bibleConfig.module,
              useCommaDelimiter:bibleConfig.useCommaDelimiter,
              timeoutMs:bibleConfig.timeoutMs,
              updateHtml:true
            });
            const parsedAt = nowIso();
            if (result.html) {
              updatePageHtml(db, page!.id, result.html);
              markPageHtmlParsed(db, page!.id, result.html, result.module || bibleConfig.module, bibleParserVersion, parsedAt);
            }
            upsertBibleParseResult(db, page!.id, page!.content_hash!, result, bibleParserVersion, parsedAt);
            bibleRefsRecognized += countBibleReferences(result);
            bibleRefsPagesParsed += 1;
          } catch (error) {
            bibleRefsParseErrors += 1;
            setBibleParseError(
              db, page!.id, page!.content_hash, bibleConfig.module, bibleParserVersion,
              error instanceof Error ? error.message : String(error)
            );
          }
          options.onProgress?.({
            phase:'bible-parse', bibleParseDone:bibleRefsPagesParsed + bibleRefsParseErrors,
            bibleParseTotal:pagesToParse.length, bibleParseSkipped:bibleRefsParseSkipped,
            bibleRefsRecognized, errors:bibleRefsParseErrors
          });
        }
      }
    }

    const seenPageIds = new Set(pages.map(page => page.id));
    const deletedPagesMarked = !options.pageId && !options.sectionId && !options.maxPages
      ? markMissingPagesDeleted(db, seenPageIds, syncedAt, selectedNotebookIds)
      : 0;
    const finishedAt = nowIso();
    const sectionScanErrors = snapshot.scanErrors.length;
    setSyncState(db, 'last_data_source', 'folder');
    setSyncState(db, 'last_sync_finished_at', finishedAt);
    setSyncState(db, 'last_sync_page_count', String(pages.length));
    setSyncState(db, 'last_sync_content_downloaded', String(contentDownloaded));
    setSyncState(db, 'last_sync_content_errors', String(contentErrors));
    setSyncState(db, 'last_sync_section_scan_errors', String(sectionScanErrors));
    setSyncState(db, 'last_sync_bible_refs_pages_parsed', String(bibleRefsPagesParsed));
    setSyncState(db, 'last_sync_bible_refs_recognized', String(bibleRefsRecognized));
    setSyncState(db, 'last_sync_bible_refs_parse_errors', String(bibleRefsParseErrors));
    setSyncState(
      db,
      'last_sync_status',
      contentErrors === 0 && sectionScanErrors === 0 && bibleRefsParseErrors === 0 ? 'success' : 'completed_with_errors'
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
      sectionScanErrors,
      bibleRefsPagesParsed,
      bibleRefsParseSkipped,
      bibleRefsParseErrors,
      bibleRefsRecognized,
      deletedPagesMarked,
      startedAt,
      finishedAt,
      status:cacheStatus(db)
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setSyncState(db, 'last_sync_status', 'failed');
    setSyncState(db, 'last_sync_error', message.slice(0, 4000));
    throw error;
  } finally {
    checkpointCacheDb(db);
    db.close();
  }
}
