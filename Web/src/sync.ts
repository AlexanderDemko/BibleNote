import './env.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bibleParseConfigFromEnv, bibleParserVersion, parsePageWithBibleNote } from './bible.js';
import { ContentPriorityQueue } from './content-priority.js';
import { runtimeLog } from './runtime-logging.js';
import { htmlToText } from './html.js';
import {
  cacheStatus,
  checkpointCacheDb,
  clearSyncState,
  defaultDbPath,
  getCachedPage,
  listPageAccess,
  listRecentlyOpenedPageIds,
  markMissingPagesDeleted,
  markSectionPagesScanFailed,
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
import { graphJson, graphListAll, graphText, setGraphRetryObserver } from './graph.js';

export type Notebook = {
  id: string;
  displayName?: string;
  isDefault?: boolean;
  lastModifiedDateTime?: string;
  links?: any;
};

export type Section = {
  id: string;
  displayName?: string;
  lastModifiedDateTime?: string;
  pagesUrl?: string;
  parentNotebook?: { id?: string; displayName?: string };
  parentSectionGroup?: { id?: string; displayName?: string };
  sectionGroupPath?: string;
  sectionGroupInfoKnown?: boolean;
  orderIndex?: number;
  links?: any;
};

export type SectionGroup = {
  id: string;
  displayName?: string;
  lastModifiedDateTime?: string;
  links?: any;
  sections?: Section[];
  sectionGroups?: SectionGroup[];
  'sections@odata.nextLink'?: string;
  'sectionGroups@odata.nextLink'?: string;
  parentNotebook?: { id?: string; displayName?: string };
  parentSectionGroup?: { id?: string; displayName?: string };
  sectionGroupPath?: string;
  orderIndex?: number;
};

export type Page = {
  id: string;
  title?: string;
  createdDateTime?: string;
  lastModifiedDateTime?: string;
  contentUrl?: string;
  parentSection?: { id?: string; displayName?: string };
  parentNotebook?: { id?: string; displayName?: string };
  links?: any;
  order?: number;
  orderIndex?: number;
};

export type SyncOptions = {
  dbPath?: string;
  replaceAll?: boolean;
  forceContent?: boolean;
  metadataOnly?: boolean;
  includeHtml?: boolean;
  maxPages?: number;
  concurrency?: number;
  refreshOlderThanHours?: number;
  sectionId?: string;
  pageId?: string;
  notebookIds?: string[];
  parseBibleRefs?: boolean;
  forceBibleParse?: boolean;
  bibleNoteApiUrl?: string;
  bibleModule?: string;
  onProgress?: (event: SyncProgressEvent) => void;
};

export type SyncProgressEvent = {
  phase: string;
  message?: string;
  notebooks?: number;
  sections?: number;
  sectionTotal?: number;
  sectionGroups?: number;
  pages?: number;
  contentDone?: number;
  contentTotal?: number;
  contentSkipped?: number;
  bibleParseDone?: number;
  bibleParseTotal?: number;
  bibleParseSkipped?: number;
  bibleRefsRecognized?: number;
  errors?: number;
};

export type SyncResult = {
  dbPath: string;
  cacheReset: boolean;
  notebooks: number;
  sections: number;
  sectionGroups: number;
  pages: number;
  contentDownloaded: number;
  contentSkipped: number;
  contentErrors: number;
  sectionScanErrors: number;
  bibleRefsPagesParsed: number;
  bibleRefsParseSkipped: number;
  bibleRefsParseErrors: number;
  bibleRefsRecognized: number;
  deletedPagesMarked: number;
  startedAt: string;
  finishedAt: string;
  status: Record<string, unknown>;
};

function countBibleReferences(result: Awaited<ReturnType<typeof parsePageWithBibleNote>>): number {
  return (result.paragraphs ?? []).reduce((sum, paragraph) => sum + (paragraph.references?.length ?? 0), 0);
}

async function mapWithConcurrency<T>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<void>
): Promise<void> {
  const safeConcurrency = Math.max(1, Math.min(concurrency, 3));
  let cursor = 0;

  async function worker() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      await fn(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: safeConcurrency }, () => worker()));
}

function shouldRefreshContent(
  cached: ReturnType<typeof getCachedPage>,
  page: Page,
  options: SyncOptions
): boolean {
  if (options.forceContent) return true;
  if (!cached?.content_text) return true;
  if (cached.fetch_error) return true;
  if (options.includeHtml && !cached.content_html) return true;
  if ((cached.content_source_modified_date_time ?? null) !== (page.lastModifiedDateTime ?? null)) return true;

  const refreshOlderThanHours = options.refreshOlderThanHours ?? 0;
  if (refreshOlderThanHours > 0 && cached.content_synced_at) {
    const ageMs = Date.now() - new Date(cached.content_synced_at).getTime();
    return ageMs > refreshOlderThanHours * 60 * 60 * 1000;
  }

  return false;
}

export async function loadNotebookSectionsRecursively(
  notebook: Notebook,
  top: number,
  onGroupsLoaded?: (count: number) => void,
  concurrency = 2
): Promise<{ sections: Section[]; groups: SectionGroup[]; sectionGroups: number }> {
  const notebookId = encodeURIComponent(notebook.id);
  const sectionQuery = `$top=${top}&$select=id,displayName,lastModifiedDateTime,pagesUrl,links&$expand=parentNotebook`;
  const groupQuery = `$top=${top}&$select=id,displayName,lastModifiedDateTime&$expand=sections,sectionGroups`;
  const groupDetailsQuery = `$select=id,displayName,lastModifiedDateTime&$expand=sections,sectionGroups`;
  const sections = await graphListAll<Section>(`/me/onenote/notebooks/${notebookId}/sections?${sectionQuery}`);
  for (const [index, section] of sections.entries()) {
    section.parentNotebook ??= { id: notebook.id, displayName: notebook.displayName };
    section.parentSectionGroup = undefined;
    section.sectionGroupPath = undefined;
    section.sectionGroupInfoKnown = true;
    section.orderIndex = index;
  }

  const rootGroups = await graphListAll<SectionGroup>(`/me/onenote/notebooks/${notebookId}/sectionGroups?${groupQuery}`);
  for (const [index, group] of rootGroups.entries()) {
    group.parentNotebook = { id: notebook.id, displayName: notebook.displayName };
    group.parentSectionGroup = undefined;
    group.sectionGroupPath = group.displayName || '(unnamed group)';
    group.orderIndex = index;
  }
  const groups: SectionGroup[] = [];
  const queue = rootGroups.map(group => ({ group, path: [group.displayName || '(unnamed group)'], depth: 1 }));
  const visited = new Set<string>();

  const groupConcurrency = Math.max(1, Math.min(concurrency, 3));
  while (queue.length > 0) {
    const batch: typeof queue = [];
    while (queue.length > 0 && batch.length < groupConcurrency) {
      const current = queue.shift()!;
      if (visited.has(current.group.id)) continue;
      if (current.depth > 32) throw new Error(`OneNote section group nesting exceeds 32 levels at: ${current.path.join(' / ')}`);
      visited.add(current.group.id);
      if (visited.size > 10_000) throw new Error('OneNote section group count exceeds the safety limit of 10000.');
      onGroupsLoaded?.(visited.size);
      groups.push(current.group);
      batch.push(current);
    }
    if (batch.length === 0) continue;

    const results = await Promise.all(batch.map(async current => {
      const groupId = encodeURIComponent(current.group.id);
      const hydrated = Array.isArray(current.group.sections) && Array.isArray(current.group.sectionGroups)
        ? current.group
        : await graphJson<SectionGroup>(`/me/onenote/sectionGroups/${groupId}?${groupDetailsQuery}`);
      const groupSections = [...(hydrated.sections ?? [])];
      if (hydrated['sections@odata.nextLink']) {
        groupSections.push(...await graphListAll<Section>(hydrated['sections@odata.nextLink']));
      }
      for (const [index, section] of groupSections.entries()) {
        section.parentNotebook ??= { id: notebook.id, displayName: notebook.displayName };
        section.parentSectionGroup = { id: current.group.id, displayName: current.group.displayName };
        section.sectionGroupPath = current.path.join(' / ');
        section.sectionGroupInfoKnown = true;
        section.orderIndex = index;
      }
      const childGroups = [...(hydrated.sectionGroups ?? [])];
      if (hydrated['sectionGroups@odata.nextLink']) {
        childGroups.push(...await graphListAll<SectionGroup>(hydrated['sectionGroups@odata.nextLink']));
      }
      return { current, groupSections, childGroups };
    }));

    for (const { current, groupSections, childGroups } of results) {
      sections.push(...groupSections);
      for (const [index, child] of childGroups.entries()) {
        child.parentNotebook = { id: notebook.id, displayName: notebook.displayName };
        child.parentSectionGroup = { id: current.group.id, displayName: current.group.displayName };
        child.sectionGroupPath = [...current.path, child.displayName || '(unnamed group)'].join(' / ');
        child.orderIndex = index;
        queue.push({
          group: child,
          path: [...current.path, child.displayName || '(unnamed group)'],
          depth: current.depth + 1
        });
      }
    }
  }

  const uniqueSections = [...new Map(sections.map(section => [section.id, section])).values()];
  return { sections: uniqueSections, groups, sectionGroups: visited.size };
}

export async function syncOneNoteCache(options: SyncOptions = {}): Promise<SyncResult> {
  const startedAt = nowIso();
  runtimeLog('sync-core', 'syncOneNoteCache start', {
    maxPages: options.maxPages,
    concurrency: options.concurrency,
    replaceAll: options.replaceAll,
    metadataOnly: options.metadataOnly,
    forceContent: options.forceContent,
    includeHtml: options.includeHtml,
    parseBibleRefs: options.parseBibleRefs,
    forceBibleParse: options.forceBibleParse,
    notebookIds: options.notebookIds,
    sectionId: options.sectionId,
    pageId: options.pageId,
    bibleModule: options.bibleModule
  });
  const db = openCacheDb(options.dbPath ?? defaultDbPath);
  if (options.replaceAll && (options.pageId || options.sectionId || options.maxPages || options.metadataOnly)) {
    db.close();
    throw new Error('replaceAll requires a full content sync; pageId, sectionId, maxPages, and metadataOnly are not allowed.');
  }
  setSyncState(db, 'last_sync_started_at', startedAt);
  setSyncState(db, 'last_sync_status', 'running');
  clearSyncState(db, 'last_sync_error');
  try {
  setGraphRetryObserver(event => {
    const waitSeconds = Math.max(1, Math.ceil(event.retryAfterMs / 1000));
    options.onProgress?.({
      phase: 'graph-retry',
      message: event.status === 429
        ? `Microsoft Graph throttling: retry in ${waitSeconds}s (${event.attempt}/${event.maxAttempts})`
        : `Microsoft Graph temporary error ${event.status}: retry in ${waitSeconds}s (${event.attempt}/${event.maxAttempts})`
    });
  });
  const syncedAt = nowIso();
  const top = 100;
  const maxPages = options.maxPages && options.maxPages > 0 ? options.maxPages : undefined;
  const concurrency = options.concurrency ?? Number(process.env.ONENOTE_SYNC_CONCURRENCY ?? '1');
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 3) {
    throw new Error('Sync concurrency must be an integer from 1 to 3.');
  }
  const includeHtml = options.includeHtml ?? process.env.ONENOTE_CACHE_INCLUDE_HTML === 'true';
  const seenPageIds = new Set<string>();
  const pagesNeedingContent = new Set<string>();

  let contentDownloaded = 0;
  let contentSkipped = 0;
  let contentErrors = 0;
  let sectionScanErrors = 0;
  let bibleRefsPagesParsed = 0;
  let bibleRefsParseSkipped = 0;
  let bibleRefsParseErrors = 0;
  let bibleRefsRecognized = 0;

  const selectedNotebookIds = options.notebookIds
    ? [...new Set(options.notebookIds.filter(Boolean))]
    : undefined;
  const fetchedPageHtml = new Map<string, string>();
  const scopeCount = Number(Boolean(options.pageId)) + Number(Boolean(options.sectionId)) + Number(Boolean(selectedNotebookIds));
  if (scopeCount > 1) throw new Error('Specify only one sync scope: notebookIds, sectionId, or pageId.');
  if (selectedNotebookIds?.length === 0) throw new Error('At least one notebook must be selected.');
  let notebooks: Notebook[] = [];
  if (!options.pageId && !options.sectionId) {
    options.onProgress?.({ phase: 'notebooks', message: 'Loading notebooks' });
    notebooks = await graphListAll<Notebook>(
      `/me/onenote/notebooks?$top=${top}&$select=id,displayName,isDefault,lastModifiedDateTime,links&$orderby=displayName`
    );
  }
  if (selectedNotebookIds) {
    const knownNotebookIds = new Set(notebooks.map(notebook => notebook.id));
    const unknownNotebookIds = selectedNotebookIds.filter(id => !knownNotebookIds.has(id));
    if (unknownNotebookIds.length > 0) {
      throw new Error(`Unknown notebook ID: ${unknownNotebookIds.join(', ')}`);
    }
  }
  if (options.replaceAll) {
    options.onProgress?.({ phase: 'reset-cache', message: 'Recreating local cache tables' });
    resetCacheDb(db);
    checkpointCacheDb(db, 'TRUNCATE');
    setSyncState(db, 'last_sync_started_at', startedAt);
    setSyncState(db, 'last_sync_status', 'running');
    runtimeLog('sync-core', 'Local cache tables recreated for full replacement sync');
  }
  if (!options.pageId && !options.sectionId) {
    const upsertNotebooksTx = db.transaction((items: Notebook[]) => {
      for (const notebook of items) upsertNotebook(db, notebook, syncedAt);
    });
    upsertNotebooksTx(notebooks);
    options.onProgress?.({ phase: 'notebooks', notebooks: notebooks.length });
  }

  options.onProgress?.({ phase: 'sections', message: options.pageId ? 'Loading target page metadata' : 'Loading sections' });
  let effectiveSections: Section[];
  let sectionGroupsFound = 0;
  const effectiveSectionGroups: SectionGroup[] = [];
  let targetedPage: Page | undefined;
  if (options.pageId) {
    targetedPage = await graphJson<Page>(
      `/me/onenote/pages/${encodeURIComponent(options.pageId)}?$select=id,title,createdDateTime,lastModifiedDateTime,contentUrl,links,order&$expand=parentSection,parentNotebook`
    );
    effectiveSections = targetedPage.parentSection?.id
      ? [await graphJson<Section>(
          `/me/onenote/sections/${encodeURIComponent(targetedPage.parentSection.id)}?$select=id,displayName,lastModifiedDateTime,pagesUrl,links&$expand=parentNotebook`
        )]
      : [];
  } else if (options.sectionId) {
    effectiveSections = [await graphJson<Section>(
      `/me/onenote/sections/${encodeURIComponent(options.sectionId)}?$select=id,displayName,lastModifiedDateTime,pagesUrl,links&$expand=parentNotebook`
    )];
  } else if (selectedNotebookIds) {
    effectiveSections = [];
    for (const notebookId of selectedNotebookIds) {
      const notebook = notebooks.find(item => item.id === notebookId)!;
      const tree = await loadNotebookSectionsRecursively(notebook, top, count => {
        options.onProgress?.({
          phase: 'section-groups',
          message: `Loading section groups in ${notebook.displayName || notebook.id}`,
          sectionGroups: sectionGroupsFound + count,
          sections: effectiveSections.length
        });
      }, concurrency);
      effectiveSections.push(...tree.sections);
      effectiveSectionGroups.push(...tree.groups);
      sectionGroupsFound += tree.sectionGroups;
    }
  } else {
    effectiveSections = [];
    for (const notebook of notebooks) {
      const tree = await loadNotebookSectionsRecursively(notebook, top, count => {
        options.onProgress?.({
          phase: 'section-groups',
          message: `Loading section groups in ${notebook.displayName || notebook.id}`,
          sectionGroups: sectionGroupsFound + count,
          sections: effectiveSections.length
        });
      }, concurrency);
      effectiveSections.push(...tree.sections);
      effectiveSectionGroups.push(...tree.groups);
      sectionGroupsFound += tree.sectionGroups;
    }
  }

  const upsertSectionsTx = db.transaction((items: Section[]) => {
    for (const section of items) upsertSection(db, section, syncedAt);
  });
  upsertSectionsTx(effectiveSections);
  const upsertSectionGroupsTx = db.transaction((items: SectionGroup[]) => {
    for (const group of items) upsertSectionGroup(db, group, syncedAt);
  });
  upsertSectionGroupsTx(effectiveSectionGroups);
  options.onProgress?.({ phase: 'sections', sections: effectiveSections.length, sectionGroups: sectionGroupsFound });

  options.onProgress?.({ phase: 'pages', message: 'Scanning sections', sectionTotal: effectiveSections.length });
  const pages: Page[] = [];

  if (targetedPage) {
    seenPageIds.add(targetedPage.id);
    if (shouldRefreshContent(getCachedPage(db, targetedPage.id), targetedPage, { ...options, includeHtml })) {
      pagesNeedingContent.add(targetedPage.id);
    }
    upsertPageMetadata(db, targetedPage, syncedAt);
    pages.push(targetedPage);
    options.onProgress?.({ phase: 'pages', pages: 1, message: 'Target page metadata loaded' });
  } else for (const [sectionIndex, section] of effectiveSections.entries()) {
    if (maxPages && pages.length >= maxPages) break;
    const remaining = maxPages ? maxPages - pages.length : undefined;
    let sectionScanComplete = false;
    let sectionPages: Page[] = [];
    try {
      sectionPages = await graphListAll<Page>(
        `/me/onenote/sections/${encodeURIComponent(section.id)}/pages?$top=${top}&$select=id,title,createdDateTime,lastModifiedDateTime,contentUrl,links,order&$expand=parentSection,parentNotebook`,
        {
          maxItems: remaining,
          onFinished: complete => {
            sectionScanComplete = complete;
          }
        }
      );
    } catch (error: any) {
      sectionScanErrors++;
      const message = error?.message ?? String(error);
      markSectionPagesScanFailed(db, section.id, message, syncedAt);
      runtimeLog('sync-core', 'Section page metadata scan failed', {
        sectionId: section.id,
        sectionName: section.displayName,
        notebookId: section.parentNotebook?.id,
        notebookName: section.parentNotebook?.displayName,
        error: error?.stack ?? message
      });
      options.onProgress?.({
        phase: 'pages',
        sections: sectionIndex + 1,
        sectionTotal: effectiveSections.length,
        pages: pages.length,
        errors: sectionScanErrors,
        message: 'Scanning sections'
      });
      continue;
    }

    const tx = db.transaction((items: Page[]) => {
      for (const [pageIndex, page] of items.entries()) {
        page.orderIndex = page.order ?? pageIndex;
        seenPageIds.add(page.id);
        if (shouldRefreshContent(getCachedPage(db, page.id), page, { ...options, includeHtml })) {
          pagesNeedingContent.add(page.id);
        }
        upsertPageMetadata(db, page, syncedAt);
      }
    });
    tx(sectionPages);
    markSectionPagesScanned(db, section.id, sectionScanComplete, sectionPages.length, syncedAt);
    pages.push(...sectionPages);

    options.onProgress?.({
      phase: 'pages',
      sections: sectionIndex + 1,
      sectionTotal: effectiveSections.length,
      pages: pages.length,
      errors: sectionScanErrors,
      message: 'Scanning sections'
    });
  }

  let deletedPagesMarked = 0;
  if (!options.pageId && !options.sectionId && !maxPages && sectionScanErrors === 0) {
    deletedPagesMarked = markMissingPagesDeleted(db, seenPageIds, syncedAt, selectedNotebookIds);
  } else if (sectionScanErrors > 0) {
    runtimeLog('sync-core', 'Skipping missing page deletion because section scans failed', {
      sectionScanErrors
    });
  }

  if (!options.metadataOnly) {
    const pagesToFetch = pages.filter(page => pagesNeedingContent.has(page.id));
    contentSkipped = pages.length - pagesToFetch.length;
    const openedAtByPage = new Map(
      listPageAccess(db).map(access => [access.page_id, access.last_opened_at])
    );
    const contentQueue = new ContentPriorityQueue(pagesToFetch, openedAtByPage);
    runtimeLog('sync-core', 'Content download candidates', {
      pages: pages.length,
      pagesToFetch: pagesToFetch.length,
      contentSkipped,
      includeHtml,
      previouslyOpened: pagesToFetch.filter(page => openedAtByPage.has(page.id)).length,
      priority: 'opened-then-last-modified'
    });

    options.onProgress?.({
      phase: 'content',
      contentDone: 0,
      contentTotal: pagesToFetch.length,
      contentSkipped,
      message: 'Downloading opened and recent pages in background'
    });

    while (contentQueue.size > 0) {
      const recentlyOpenedPageIds = listRecentlyOpenedPageIds(db);
      const page = contentQueue.take(recentlyOpenedPageIds);
      if (!page) break;
      const prioritizedByOpen = recentlyOpenedPageIds.includes(page.id);
      try {
        runtimeLog('sync-core', 'Downloading page content', {
          pageId: page.id,
          title: page.title,
          priority: prioritizedByOpen ? 'opened' : 'recent'
        });
        const html = await graphText(`/me/onenote/pages/${encodeURIComponent(page.id)}/content`);
        const text = htmlToText(html);
        fetchedPageHtml.set(page.id, html);
        updatePageContent(db, page.id, text, includeHtml ? html : null, page.lastModifiedDateTime ?? null, nowIso());
        contentDownloaded += 1;
        runtimeLog('sync-core', 'Downloaded page content', { pageId: page.id, title: page.title, htmlBytes: html.length, textChars: text.length });
      } catch (error: any) {
        contentErrors += 1;
        setPageFetchError(db, page.id, error?.message ?? String(error));
        runtimeLog('sync-core', 'Page content download failed', { pageId: page.id, title: page.title, error: error?.stack ?? error?.message ?? String(error) });
      }

      if ((contentDownloaded + contentErrors) % 25 === 0 || contentDownloaded + contentErrors === pagesToFetch.length) {
        options.onProgress?.({
          phase: 'content',
          contentDone: contentDownloaded + contentErrors,
          contentTotal: pagesToFetch.length,
          contentSkipped,
          errors: contentErrors,
          message: 'Downloading opened and recent pages in background'
        });
      }
    }

    checkpointCacheDb(db);

    const bibleConfig = bibleParseConfigFromEnv({
      enabled: options.parseBibleRefs ?? undefined,
      apiUrl: options.bibleNoteApiUrl ?? undefined,
      module: options.bibleModule ?? undefined
    });

    if (bibleConfig.enabled) {
      const parseCandidates = pages
        .map(page => getCachedPage(db, page.id))
        .filter((page): page is NonNullable<ReturnType<typeof getCachedPage>> => Boolean(page?.content_text && page.content_hash && !page.deleted_at));
      const pagesToParse = parseCandidates.filter(page =>
        shouldParseBibleRefs(db, page.id, page.content_hash!, bibleConfig.module, bibleParserVersion, options.forceBibleParse)
      );
      bibleRefsParseSkipped = parseCandidates.length - pagesToParse.length;
      runtimeLog('sync-core', 'Bible parse candidates', {
        parseCandidates: parseCandidates.length,
        pagesToParse: pagesToParse.length,
        skipped: bibleRefsParseSkipped,
        module: bibleConfig.module
      });

      options.onProgress?.({
        phase: 'bible-parse',
        bibleParseDone: 0,
        bibleParseTotal: pagesToParse.length,
        bibleParseSkipped: bibleRefsParseSkipped,
        bibleRefsRecognized,
        message: 'Parsing Bible references with BibleNote'
      });

      await mapWithConcurrency(pagesToParse, Math.min(concurrency, 2), async page => {
        try {
          const htmlForBibleNote = includeHtml ? (fetchedPageHtml.get(page.id) ?? page.content_html ?? null) : null;
          runtimeLog('sync-core', 'Parsing page with BibleNote', {
            pageId: page.id,
            title: page.title,
            module: bibleConfig.module,
            updateHtml: Boolean(htmlForBibleNote)
          });
          const result = await parsePageWithBibleNote({
            apiUrl: bibleConfig.apiUrl,
            pageId: page.id,
            title: page.title,
            html: htmlForBibleNote,
            text: page.content_text,
            module: bibleConfig.module,
            useCommaDelimiter: bibleConfig.useCommaDelimiter,
            timeoutMs: bibleConfig.timeoutMs,
            updateHtml: Boolean(htmlForBibleNote)
          });
          if (result.html && htmlForBibleNote) {
            updatePageHtml(db, page.id, result.html, nowIso());
            runtimeLog('sync-core', 'Updated cached page HTML with BibleNote links', {
              pageId: page.id,
              title: page.title,
              htmlBytes: result.html.length
            });
          }
          upsertBibleParseResult(db, page.id, page.content_hash!, result, bibleParserVersion, nowIso());
          const refsCount = countBibleReferences(result);
          bibleRefsRecognized += refsCount;
          bibleRefsPagesParsed += 1;
          runtimeLog('sync-core', 'Parsed page with BibleNote', {
            pageId: page.id,
            title: page.title,
            paragraphs: result.paragraphs?.length ?? 0,
            refs: refsCount,
            hasHtml: Boolean(result.html)
          });
        } catch (error: any) {
          bibleRefsParseErrors += 1;
          setBibleParseError(
            db,
            page.id,
            page.content_hash,
            bibleConfig.module,
            bibleParserVersion,
            error?.message ?? String(error)
          );
          runtimeLog('sync-core', 'BibleNote page parse failed', { pageId: page.id, title: page.title, error: error?.stack ?? error?.message ?? String(error) });
        }

        const done = bibleRefsPagesParsed + bibleRefsParseErrors;
        if (done > 0 && done % 100 === 0) checkpointCacheDb(db);
        if (done % 25 === 0 || done === pagesToParse.length) {
          options.onProgress?.({
            phase: 'bible-parse',
            bibleParseDone: done,
            bibleParseTotal: pagesToParse.length,
            bibleParseSkipped: bibleRefsParseSkipped,
            bibleRefsRecognized,
            errors: bibleRefsParseErrors
          });
        }
      });
    }
  }

  setSyncState(db, 'last_sync_finished_at', nowIso());
  setSyncState(db, 'last_sync_page_count', String(pages.length));
  setSyncState(db, 'last_sync_content_downloaded', String(contentDownloaded));
  setSyncState(db, 'last_sync_content_errors', String(contentErrors));
  setSyncState(db, 'last_sync_section_scan_errors', String(sectionScanErrors));
  setSyncState(db, 'last_sync_bible_refs_pages_parsed', String(bibleRefsPagesParsed));
  setSyncState(db, 'last_sync_bible_refs_recognized', String(bibleRefsRecognized));
  setSyncState(db, 'last_sync_bible_refs_parse_errors', String(bibleRefsParseErrors));
  setSyncState(db, 'last_sync_status', contentErrors === 0 && sectionScanErrors === 0 && bibleRefsParseErrors === 0 ? 'success' : 'completed_with_errors');

  checkpointCacheDb(db, 'TRUNCATE');

  const finishedAt = nowIso();
  const status = cacheStatus(db);
  const result = {
    dbPath: db.name,
    cacheReset: options.replaceAll === true,
    notebooks: notebooks.length,
    sections: effectiveSections.length,
    sectionGroups: sectionGroupsFound,
    pages: pages.length,
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
    status
  };
  runtimeLog('sync-core', 'syncOneNoteCache completed', result);
  return result;
  } catch (error: any) {
    let stateWriteError: unknown;
    try {
      setSyncState(db, 'last_sync_status', 'failed');
      setSyncState(db, 'last_sync_error', (error?.message ?? String(error)).slice(0, 4000));
    } catch (persistError) {
      stateWriteError = persistError;
    }
    runtimeLog('sync-core', 'syncOneNoteCache failed', {
      error: error?.stack ?? error?.message ?? String(error),
      stateWriteError: stateWriteError instanceof Error
        ? stateWriteError.stack ?? stateWriteError.message
        : stateWriteError == null ? undefined : String(stateWriteError)
    });
    throw error;
  } finally {
    setGraphRetryObserver(undefined);
    checkpointCacheDb(db);
    db.close();
  }
}

function optionValue(name: string, value: string | undefined): string {
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value.`);
  return value;
}

function integerOption(name: string, value: string | undefined, min: number, max = Number.MAX_SAFE_INTEGER): number {
  const parsed = Number(optionValue(name, value));
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} must be an integer from ${min} to ${max}.`);
  }
  return parsed;
}

function parseArgs(argv: string[]): SyncOptions & { statusOnly?: boolean } {
  const result: SyncOptions & { statusOnly?: boolean } = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    switch (arg) {
      case '--db':
        result.dbPath = optionValue(arg, next);
        i += 1;
        break;
      case '--force-content':
        result.forceContent = true;
        break;
      case '--replace-all':
        result.replaceAll = true;
        break;
      case '--metadata-only':
        result.metadataOnly = true;
        break;
      case '--include-html':
        result.includeHtml = true;
        break;
      case '--max-pages':
        result.maxPages = integerOption(arg, next, 1);
        i += 1;
        break;
      case '--concurrency':
        result.concurrency = integerOption(arg, next, 1, 3);
        i += 1;
        break;
      case '--refresh-older-than-hours':
        result.refreshOlderThanHours = integerOption(arg, next, 0);
        i += 1;
        break;
      case '--section-id':
        result.sectionId = optionValue(arg, next);
        i += 1;
        break;
      case '--page-id':
        result.pageId = optionValue(arg, next);
        i += 1;
        break;
      case '--notebook-id':
        (result.notebookIds ??= []).push(optionValue(arg, next));
        i += 1;
        break;
      case '--parse-bible-refs':
        result.parseBibleRefs = true;
        break;
      case '--force-bible-parse':
        result.forceBibleParse = true;
        break;
      case '--biblenote-api-url':
        result.bibleNoteApiUrl = optionValue(arg, next);
        i += 1;
        break;
      case '--bible-module':
        result.bibleModule = optionValue(arg, next);
        i += 1;
        break;
      case '--status':
        result.statusOnly = true;
        break;
      default:
        if (arg === '--help' || arg === '-h') {
          console.log(`Usage: npm run sync -- [options]\n\nOptions:\n  --status                         Print cache status only\n  --db <path>                      SQLite cache path\n  --replace-all                    Recreate all cache tables before a full content sync\n  --force-content                  Re-download content even if lastModifiedDateTime is unchanged\n  --metadata-only                  Sync notebooks/sections/page metadata only\n  --include-html                   Store raw page HTML as well as plain text\n  --max-pages <n>                  Limit page count for testing\n  --concurrency <n>                Graph concurrency for metadata (1..3), default 1; content downloads are serialized\n  --refresh-older-than-hours <n>   Re-download content older than n hours\n  --section-id <id>                Sync one section only\n  --page-id <id>                   Sync one page only\n  --notebook-id <id>               Sync one notebook; repeat for multiple notebooks\n  --parse-bible-refs               Parse cached page content with the local BibleNote API\n  --force-bible-parse              Re-parse Bible references even if parser state is current\n  --biblenote-api-url <url>        BibleNote API base URL, default http://127.0.0.1:5000\n  --bible-module <name>            BibleNote module, default rst\n`);
          process.exit(0);
        }
        throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return result;
}

const isMainModule = process.argv[1]
  ? path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1])
  : false;

if (isMainModule) {
  const options = parseArgs(process.argv.slice(2));

  if (options.statusOnly) {
    const db = openCacheDb(options.dbPath ?? defaultDbPath);
    console.log(JSON.stringify(cacheStatus(db), null, 2));
    db.close();
    process.exit(0);
  }

  const result = await syncOneNoteCache({
    ...options,
    onProgress: event => {
      const parts = [event.phase];
      if (event.message) parts.push(event.message);
      if (event.notebooks != null) parts.push(`notebooks=${event.notebooks}`);
      if (event.sectionGroups != null) parts.push(`sectionGroups=${event.sectionGroups}`);
      if (event.sections != null) parts.push(`sections=${event.sectionTotal ? `${event.sections}/${event.sectionTotal}` : event.sections}`);
      if (event.pages != null) parts.push(`pages=${event.pages}`);
      if (event.contentDone != null && event.contentTotal != null) parts.push(`content=${event.contentDone}/${event.contentTotal}`);
      if (event.contentSkipped != null) parts.push(`skipped=${event.contentSkipped}`);
      if (event.bibleParseDone != null && event.bibleParseTotal != null) parts.push(`bibleParse=${event.bibleParseDone}/${event.bibleParseTotal}`);
      if (event.bibleParseSkipped != null) parts.push(`bibleSkipped=${event.bibleParseSkipped}`);
      if (event.bibleRefsRecognized != null) parts.push(`bibleRefs=${event.bibleRefsRecognized}`);
      if (event.errors != null) parts.push(`errors=${event.errors}`);
      console.error(`[sync] ${parts.join(' | ')}`);
    }
  });

  console.log(JSON.stringify(result, null, 2));
}
