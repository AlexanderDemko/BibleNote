import './env.js';
import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { BibleParseResult } from './bible.js';
import { migrateCacheSchema } from './cache-schema.js';
import { getCachedPage } from './cache-search.js';
import type { BibleParseStateRow, PageAccessRow } from './cache-types.js';
import { toVerseId } from './cache-verse-id.js';
import { defaultBibleNoteDir } from './paths.js';
import { runtimeLog } from './runtime-logging.js';

export type * from './cache-types.js';
export {
  buildFtsQuery,
  findParallelBibleReferenceNotes,
  findParallelBibleReferences,
  getCachedPage,
  listCachedPagesForBibleParse,
  listCachedPagesWithFetchErrors,
  listCachedNotebooks,
  listCachedSections,
  readCachedPage,
  searchBibleReferenceNotesByWeight,
  searchBibleReferences,
  searchCache,
  searchCacheAdvanced
} from './cache-search.js';

export const defaultCacheDir = defaultBibleNoteDir;
export const defaultDbPath = process.env.ONENOTE_CACHE_DB ?? path.join(defaultCacheDir, 'onenote-cache.sqlite');

const startupTimingStartedAt = Date.now();

function logStartupTiming(message: string): void {
  if (process.env.ONENOTE_STARTUP_TIMING !== '1') return;
  const line = `[cache startup +${Date.now() - startupTimingStartedAt}ms] ${message}`;
  console.log(line);
  if (process.env.ONENOTE_STARTUP_LOG) {
    try {
      fs.appendFileSync(process.env.ONENOTE_STARTUP_LOG, `${new Date().toISOString()} ${line}\n`, 'utf8');
    } catch {
      // Startup timing must never block the app if the log path is unavailable.
    }
  }
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function openCacheDb(dbPath = defaultDbPath): Database.Database {
  logStartupTiming(`openCacheDb start db=${dbPath}`);
  if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
  logStartupTiming('cache directory ready');
  const db = new Database(dbPath);
  logStartupTiming('sqlite connection opened');
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.pragma('wal_autocheckpoint = 1000');
  db.pragma('journal_size_limit = 67108864');
  logStartupTiming('sqlite pragmas applied');
  migrateCacheSchema(db, logStartupTiming);
  logStartupTiming('openCacheDb complete');
  return db;
}

export function checkpointCacheDb(
  db: Database.Database,
  mode: 'PASSIVE' | 'TRUNCATE' = 'PASSIVE'
): { busy: number; log: number; checkpointed: number } | undefined {
  try {
    const [result] = db.pragma(`wal_checkpoint(${mode})`) as Array<{
      busy: number;
      log: number;
      checkpointed: number;
    }>;
    runtimeLog('cache', `SQLite WAL checkpoint ${mode.toLowerCase()}`, result);
    return result;
  } catch (error: any) {
    runtimeLog('cache', `SQLite WAL checkpoint ${mode.toLowerCase()} failed`, {
      error: error?.stack ?? error?.message ?? String(error)
    });
    return undefined;
  }
}

export function resetCacheDb(db: Database.Database): void {
  const startedAt = Date.now();
  const previousSecureDelete = Number(db.pragma('secure_delete', { simple: true }));
  runtimeLog('cache', 'Resetting SQLite cache tables');

  // This cache contains no secrets. Disabling secure_delete prevents SQLite
  // from writing zeros for millions of discarded relation/index pages into WAL.
  db.pragma('secure_delete = OFF');
  try {
    const reset = db.transaction(() => {
      // page_access intentionally survives a cache rebuild so a new hydration
      // run can still prioritize pages the user has opened before.
      db.exec(`
        DROP TABLE IF EXISTS pages_fts;
        DROP TABLE IF EXISTS paragraph_verse_relations;
        DROP TABLE IF EXISTS paragraph_verse_not_found;
        DROP TABLE IF EXISTS paragraph_verse_refs;
        DROP TABLE IF EXISTS page_paragraphs;
        DROP TABLE IF EXISTS page_html_parse_state;
        DROP TABLE IF EXISTS page_bible_parse_state;
        DROP TABLE IF EXISTS pages;
        DROP TABLE IF EXISTS section_groups;
        DROP TABLE IF EXISTS sections;
        DROP TABLE IF EXISTS notebooks;
        DROP TABLE IF EXISTS sync_state;
      `);
      migrateCacheSchema(db, logStartupTiming);
    });
    reset();
  } finally {
    db.pragma(`secure_delete = ${previousSecureDelete}`);
  }

  runtimeLog('cache', 'Reset SQLite cache tables', { durationMs: Date.now() - startedAt });
}

export function getSyncState(db: Database.Database, key: string): string | undefined {
  const row = db.prepare('SELECT value FROM sync_state WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value;
}

export function setSyncState(db: Database.Database, key: string, value: string): void {
  db.prepare(`
    INSERT INTO sync_state(key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(key, value, nowIso());
}

export function clearSyncState(db: Database.Database, key: string): void {
  db.prepare('DELETE FROM sync_state WHERE key = ?').run(key);
}

export function upsertNotebook(db: Database.Database, notebook: any, syncedAt = nowIso()): void {
  db.prepare(`
    INSERT INTO notebooks(id, display_name, is_default, last_modified_date_time, links_json, synced_at)
    VALUES (@id, @display_name, @is_default, @last_modified_date_time, @links_json, @synced_at)
    ON CONFLICT(id) DO UPDATE SET
      display_name = excluded.display_name,
      is_default = excluded.is_default,
      last_modified_date_time = excluded.last_modified_date_time,
      links_json = excluded.links_json,
      synced_at = excluded.synced_at
  `).run({
    id: notebook.id,
    display_name: notebook.displayName ?? null,
    is_default: notebook.isDefault == null ? null : Number(Boolean(notebook.isDefault)),
    last_modified_date_time: notebook.lastModifiedDateTime ?? null,
    links_json: notebook.links ? JSON.stringify(notebook.links) : null,
    synced_at: syncedAt
  });
}

export function upsertSection(db: Database.Database, section: any, syncedAt = nowIso()): void {
  db.prepare(`
    INSERT INTO sections(
      id, display_name, last_modified_date_time, pages_url,
      parent_notebook_id, parent_notebook_name,
      parent_section_group_id, parent_section_group_name, section_group_path, order_index,
      links_json, synced_at
    )
    VALUES (
      @id, @display_name, @last_modified_date_time, @pages_url,
      @parent_notebook_id, @parent_notebook_name,
      @parent_section_group_id, @parent_section_group_name, @section_group_path, @order_index,
      @links_json, @synced_at
    )
    ON CONFLICT(id) DO UPDATE SET
      display_name = excluded.display_name,
      last_modified_date_time = excluded.last_modified_date_time,
      pages_url = excluded.pages_url,
      parent_notebook_id = excluded.parent_notebook_id,
      parent_notebook_name = excluded.parent_notebook_name,
      parent_section_group_id = CASE WHEN @section_group_info_known = 1 THEN excluded.parent_section_group_id ELSE sections.parent_section_group_id END,
      parent_section_group_name = CASE WHEN @section_group_info_known = 1 THEN excluded.parent_section_group_name ELSE sections.parent_section_group_name END,
      section_group_path = CASE WHEN @section_group_info_known = 1 THEN excluded.section_group_path ELSE sections.section_group_path END,
      order_index = CASE WHEN @section_group_info_known = 1 THEN excluded.order_index ELSE sections.order_index END,
      links_json = excluded.links_json,
      synced_at = excluded.synced_at
  `).run({
    id: section.id,
    display_name: section.displayName ?? null,
    last_modified_date_time: section.lastModifiedDateTime ?? null,
    pages_url: section.pagesUrl ?? null,
    parent_notebook_id: section.parentNotebook?.id ?? null,
    parent_notebook_name: section.parentNotebook?.displayName ?? null,
    parent_section_group_id: section.parentSectionGroup?.id ?? null,
    parent_section_group_name: section.parentSectionGroup?.displayName ?? null,
    section_group_path: section.sectionGroupPath ?? null,
    order_index: section.orderIndex ?? null,
    section_group_info_known: Number(section.sectionGroupInfoKnown === true),
    links_json: section.links ? JSON.stringify(section.links) : null,
    synced_at: syncedAt
  });
}

export function upsertSectionGroup(db: Database.Database, group: any, syncedAt = nowIso()): void {
  db.prepare(`
    INSERT INTO section_groups(
      id, display_name, parent_notebook_id, parent_notebook_name,
      parent_section_group_id, section_group_path, order_index,
      last_modified_date_time, synced_at
    ) VALUES (
      @id, @display_name, @parent_notebook_id, @parent_notebook_name,
      @parent_section_group_id, @section_group_path, @order_index,
      @last_modified_date_time, @synced_at
    )
    ON CONFLICT(id) DO UPDATE SET
      display_name = excluded.display_name,
      parent_notebook_id = excluded.parent_notebook_id,
      parent_notebook_name = excluded.parent_notebook_name,
      parent_section_group_id = excluded.parent_section_group_id,
      section_group_path = excluded.section_group_path,
      order_index = excluded.order_index,
      last_modified_date_time = excluded.last_modified_date_time,
      synced_at = excluded.synced_at
  `).run({
    id: group.id,
    display_name: group.displayName ?? null,
    parent_notebook_id: group.parentNotebook?.id ?? null,
    parent_notebook_name: group.parentNotebook?.displayName ?? null,
    parent_section_group_id: group.parentSectionGroup?.id ?? null,
    section_group_path: group.sectionGroupPath ?? null,
    order_index: group.orderIndex ?? null,
    last_modified_date_time: group.lastModifiedDateTime ?? null,
    synced_at: syncedAt
  });
}

export function markSectionPagesScanned(
  db: Database.Database,
  sectionId: string,
  complete: boolean,
  pagesSeen: number,
  scannedAt = nowIso()
): void {
  db.prepare(`
    UPDATE sections SET
      pages_scanned_at = ?,
      pages_scan_complete = ?,
      pages_seen_count = ?,
      pages_scan_error = NULL
    WHERE id = ?
  `).run(scannedAt, Number(complete), pagesSeen, sectionId);
}

export function markSectionPagesScanFailed(
  db: Database.Database,
  sectionId: string,
  error: string,
  scannedAt = nowIso()
): void {
  db.prepare(`
    UPDATE sections SET
      pages_scanned_at = ?,
      pages_scan_complete = 0,
      pages_seen_count = NULL,
      pages_scan_error = ?
    WHERE id = ?
  `).run(scannedAt, error.slice(0, 4000), sectionId);
}

export function markPageOpened(db: Database.Database, pageId: string, openedAt = nowIso()): void {
  db.prepare(`
    INSERT INTO page_access(page_id, last_opened_at)
    VALUES (?, ?)
    ON CONFLICT(page_id) DO UPDATE SET
      last_opened_at = MAX(page_access.last_opened_at, excluded.last_opened_at)
  `).run(pageId, openedAt);
}

export function listPageAccess(db: Database.Database): PageAccessRow[] {
  return db.prepare(`
    SELECT page_id, last_opened_at
    FROM page_access
    ORDER BY last_opened_at DESC
  `).all() as PageAccessRow[];
}

export function listRecentlyOpenedPageIds(db: Database.Database, limit = 100): string[] {
  const safeLimit = Math.max(1, Math.min(Math.trunc(limit), 1000));
  const rows = db.prepare(`
    SELECT page_id
    FROM page_access
    ORDER BY last_opened_at DESC
    LIMIT ?
  `).all(safeLimit) as Array<{ page_id: string }>;
  return rows.map(row => row.page_id);
}

export function upsertPageMetadata(db: Database.Database, page: any, syncedAt = nowIso()): void {
  const upsert = db.prepare(`
    INSERT INTO pages(
      id, title, created_date_time, last_modified_date_time, content_url,
      parent_section_id, parent_section_name, parent_notebook_id, parent_notebook_name,
      links_json, metadata_synced_at, deleted_at, order_index, page_level
    )
    VALUES (
      @id, @title, @created_date_time, @last_modified_date_time, @content_url,
      @parent_section_id, @parent_section_name, @parent_notebook_id, @parent_notebook_name,
      @links_json, @metadata_synced_at, NULL, @order_index, @page_level
    )
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      created_date_time = excluded.created_date_time,
      last_modified_date_time = excluded.last_modified_date_time,
      content_url = excluded.content_url,
      parent_section_id = excluded.parent_section_id,
      parent_section_name = excluded.parent_section_name,
      parent_notebook_id = excluded.parent_notebook_id,
      parent_notebook_name = excluded.parent_notebook_name,
      links_json = excluded.links_json,
      metadata_synced_at = excluded.metadata_synced_at,
      order_index = COALESCE(excluded.order_index, pages.order_index),
      page_level = COALESCE(excluded.page_level, pages.page_level),
      deleted_at = NULL
  `);
  const values = {
    id: page.id,
    title: page.title ?? null,
    created_date_time: page.createdDateTime ?? null,
    last_modified_date_time: page.lastModifiedDateTime ?? null,
    content_url: page.contentUrl ?? null,
    parent_section_id: page.parentSection?.id ?? null,
    parent_section_name: page.parentSection?.displayName ?? null,
    parent_notebook_id: page.parentNotebook?.id ?? null,
    parent_notebook_name: page.parentNotebook?.displayName ?? null,
    links_json: page.links ? JSON.stringify(page.links) : null,
    metadata_synced_at: syncedAt,
    order_index: page.orderIndex ?? page.order ?? null,
    page_level: page.level ?? page.pageLevel ?? null
  };
  const tx = db.transaction(() => {
    upsert.run(values);
    db.prepare(`
      UPDATE pages_fts
      SET title = @title, notebook = @parent_notebook_name, section = @parent_section_name
      WHERE page_id = @id
    `).run(values);
  });
  tx();
}

export function updatePageContent(
  db: Database.Database,
  pageId: string,
  text: string,
  html: string | null,
  sourceModifiedDateTime: string | null = null,
  fetchedAt = nowIso()
): void {
  const page = getCachedPage(db, pageId);
  const hash = sha256(text);
  const byteLength = Buffer.byteLength(text, 'utf8') + (html ? Buffer.byteLength(html, 'utf8') : 0);

  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE pages SET
        content_text = @content_text,
        content_html = @content_html,
        content_hash = @content_hash,
        content_source_modified_date_time = @content_source_modified_date_time,
        content_chars = @content_chars,
        content_bytes = @content_bytes,
        content_synced_at = @content_synced_at,
        fetch_error = NULL,
        fetch_error_at = NULL,
        fetch_retry_after = NULL,
        fetch_error_count = 0,
        fetch_error_terminal = 0,
        fetch_error_source_modified_date_time = NULL
      WHERE id = @id
    `).run({
      id: pageId,
      content_text: text,
      content_html: html,
      content_hash: hash,
      content_source_modified_date_time: sourceModifiedDateTime,
      content_chars: text.length,
      content_bytes: byteLength,
      content_synced_at: fetchedAt
    });

    db.prepare('DELETE FROM pages_fts WHERE page_id = ?').run(pageId);
    db.prepare(`
      INSERT INTO pages_fts(page_id, title, content, notebook, section)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      pageId,
      page?.title ?? '',
      text,
      page?.parent_notebook_name ?? '',
      page?.parent_section_name ?? ''
    );
  });

  tx();
}

export function updatePageHtml(db: Database.Database, pageId: string, html: string, updatedAt = nowIso()): void {
  db.prepare(`
    UPDATE pages SET
      content_html = ?,
      content_synced_at = ?
    WHERE id = ?
  `).run(html, updatedAt, pageId);
}

export function setPageFetchError(
  db: Database.Database,
  pageId: string,
  error: string,
  options: {
    failedAt?: string;
    retryAfter?: string | null;
    terminal?: boolean;
    sourceModifiedDateTime?: string | null;
  } = {}
): void {
  db.prepare(`
    UPDATE pages SET
      fetch_error = @fetch_error,
      fetch_error_at = @fetch_error_at,
      fetch_retry_after = @fetch_retry_after,
      fetch_error_count = COALESCE(fetch_error_count, 0) + 1,
      fetch_error_terminal = @fetch_error_terminal,
      fetch_error_source_modified_date_time = @fetch_error_source_modified_date_time
    WHERE id = @id
  `).run({
    id: pageId,
    fetch_error: error.slice(0, 4000),
    fetch_error_at: options.failedAt ?? nowIso(),
    fetch_retry_after: options.retryAfter ?? null,
    fetch_error_terminal: Number(options.terminal === true),
    fetch_error_source_modified_date_time: options.sourceModifiedDateTime ?? null
  });
}

export function markMissingSectionPagesDeleted(
  db: Database.Database,
  sectionId: string,
  seenPageIds: ReadonlySet<string>,
  deletedAt = nowIso()
): number {
  const existing = db.prepare(`
    SELECT id FROM pages
    WHERE deleted_at IS NULL AND parent_section_id = ?
  `).all(sectionId) as Array<{ id: string }>;
  const missing = existing.filter(page => !seenPageIds.has(page.id)).map(page => page.id);
  if (missing.length === 0) return 0;
  const tx = db.transaction((ids: string[]) => {
    const mark = db.prepare('UPDATE pages SET deleted_at = ? WHERE id = ?');
    const removeFts = db.prepare('DELETE FROM pages_fts WHERE page_id = ?');
    for (const id of ids) {
      mark.run(deletedAt, id);
      removeFts.run(id);
    }
  });
  tx(missing);
  return missing.length;
}

export function getBibleParseState(db: Database.Database, pageId: string): BibleParseStateRow | undefined {
  return db.prepare('SELECT * FROM page_bible_parse_state WHERE page_id = ?').get(pageId) as BibleParseStateRow | undefined;
}

export function shouldParsePageHtml(
  db: Database.Database,
  pageId: string,
  html: string,
  module: string,
  parserVersion: string
): boolean {
  const state = db.prepare(`
    SELECT html_hash, module, parser_version
    FROM page_html_parse_state
    WHERE page_id = ?
  `).get(pageId) as { html_hash: string; module: string; parser_version: string } | undefined;
  if (!state) return true;
  return state.html_hash !== sha256(html)
    || state.module !== module
    || state.parser_version !== parserVersion;
}

export function markPageHtmlParsed(
  db: Database.Database,
  pageId: string,
  html: string,
  module: string,
  parserVersion: string,
  parsedAt = nowIso()
): void {
  db.prepare(`
    INSERT INTO page_html_parse_state(page_id, html_hash, module, parser_version, parsed_at)
    VALUES (@page_id, @html_hash, @module, @parser_version, @parsed_at)
    ON CONFLICT(page_id) DO UPDATE SET
      html_hash = excluded.html_hash,
      module = excluded.module,
      parser_version = excluded.parser_version,
      parsed_at = excluded.parsed_at
  `).run({
    page_id: pageId,
    html_hash: sha256(html),
    module,
    parser_version: parserVersion,
    parsed_at: parsedAt
  });
}

export function shouldParseBibleRefs(
  db: Database.Database,
  pageId: string,
  contentHash: string,
  module: string,
  parserVersion: string,
  force = false
): boolean {
  if (force) return true;
  const state = getBibleParseState(db, pageId);
  if (!state) return true;
  if (state.parse_error) return true;
  return state.content_hash !== contentHash
    || state.module !== module
    || state.parser_version !== parserVersion;
}

export function upsertBibleParseResult(
  db: Database.Database,
  pageId: string,
  contentHash: string,
  result: BibleParseResult,
  parserVersion: string,
  parsedAt = nowIso()
): void {
  const startedAt = Date.now();
  const module = result.module || 'rst';
  const paragraphs = result.paragraphs ?? [];
  if (!Array.isArray(result.relations)) {
    throw new Error('BibleNote API ParsePage response does not contain relations. Update the BibleNote API before parsing with biblenote-http-v4.');
  }
  const relations = result.relations;
  const valuableParagraphs = paragraphs.filter(paragraph =>
    (paragraph.references?.length ?? 0) > 0 || (paragraph.notFound?.length ?? 0) > 0
  );
  const refsCount = valuableParagraphs.reduce((sum, paragraph) => sum + (paragraph.references?.length ?? 0), 0);
  if (refsCount > 1 && relations.length === 0) {
    throw new Error(
      `BibleNote API returned no relations for ${refsCount} recognized references; existing cached relations were preserved.`
    );
  }
  runtimeLog('cache', 'Upserting Bible parse result', {
    pageId,
    module,
    paragraphs: paragraphs.length,
    valuableParagraphs: valuableParagraphs.length,
    refsCount,
    relations: relations.length,
    relationsCapped: result.relationsCapped === true
  });

  const tx = db.transaction(() => {
    runtimeLog('cache', 'Deleting old Bible relations', { pageId, elapsedMs: Date.now() - startedAt });
    db.prepare('DELETE FROM paragraph_verse_relations WHERE page_id = ?').run(pageId);
    runtimeLog('cache', 'Deleted old Bible relations', { pageId, elapsedMs: Date.now() - startedAt });
    runtimeLog('cache', 'Deleting old Bible refs', { pageId, elapsedMs: Date.now() - startedAt });
    db.prepare('DELETE FROM paragraph_verse_refs WHERE page_id = ?').run(pageId);
    runtimeLog('cache', 'Deleted old Bible refs', { pageId, elapsedMs: Date.now() - startedAt });
    runtimeLog('cache', 'Deleting old Bible not-found refs', { pageId, elapsedMs: Date.now() - startedAt });
    db.prepare('DELETE FROM paragraph_verse_not_found WHERE page_id = ?').run(pageId);
    runtimeLog('cache', 'Deleted old Bible not-found refs', { pageId, elapsedMs: Date.now() - startedAt });
    runtimeLog('cache', 'Deleting old Bible paragraphs', { pageId, elapsedMs: Date.now() - startedAt });
    db.prepare('DELETE FROM page_paragraphs WHERE page_id = ?').run(pageId);
    runtimeLog('cache', 'Deleted old Bible paragraphs', { pageId, elapsedMs: Date.now() - startedAt });
    const storedRefIds = new Map<string, number>();

    const insertParagraph = db.prepare(`
      INSERT INTO page_paragraphs(
        page_id, paragraph_index, paragraph_path, text, text_hash,
        parsed_at, parser_version, module
      ) VALUES (
        @page_id, @paragraph_index, @paragraph_path, @text, @text_hash,
        @parsed_at, @parser_version, @module
      )
    `);
    const insertRef = db.prepare(`
      INSERT INTO paragraph_verse_refs(
        page_id, paragraph_index, original_text, normalized_ref,
        verse_id, top_verse_id,
        book_index, book_name, book_short_name,
        chapter, verse, top_chapter, top_verse, is_chapter,
        start_index, end_index, entry_type, entry_options,
        module, parser_version, parsed_at
      ) VALUES (
        @page_id, @paragraph_index, @original_text, @normalized_ref,
        @verse_id, @top_verse_id,
        @book_index, @book_name, @book_short_name,
        @chapter, @verse, @top_chapter, @top_verse, @is_chapter,
        @start_index, @end_index, @entry_type, @entry_options,
        @module, @parser_version, @parsed_at
      )
    `);
    const insertRelation = db.prepare(`
      INSERT INTO paragraph_verse_relations(
        page_id, verse_ref_id, relative_verse_ref_id,
        verse_id, relative_verse_id,
        paragraph_index, relative_paragraph_index,
        relation_weight, module, parser_version, parsed_at
      ) VALUES (
        @page_id, @verse_ref_id, @relative_verse_ref_id,
        @verse_id, @relative_verse_id,
        @paragraph_index, @relative_paragraph_index,
        @relation_weight, @module, @parser_version, @parsed_at
      )
    `);
    const insertNotFound = db.prepare(`
      INSERT INTO paragraph_verse_not_found(
        page_id, paragraph_index, normalized_ref,
        book_index, chapter, verse, top_chapter, top_verse, is_chapter,
        module, parser_version, parsed_at
      ) VALUES (
        @page_id, @paragraph_index, @normalized_ref,
        @book_index, @chapter, @verse, @top_chapter, @top_verse, @is_chapter,
        @module, @parser_version, @parsed_at
      )
    `);

    for (const paragraph of valuableParagraphs) {
      const text = paragraph.text ?? '';
      const paragraphIndex = Number.isInteger(paragraph.index) ? paragraph.index : 0;
      insertParagraph.run({
        page_id: pageId,
        paragraph_index: paragraphIndex,
        paragraph_path: paragraph.path ?? null,
        text,
        text_hash: sha256(text),
        parsed_at: parsedAt,
        parser_version: parserVersion,
        module
      });
      for (const [referenceIndex, ref] of (paragraph.references ?? []).entries()) {
        const verseId = toVerseId(ref.bookIndex, ref.chapter, ref.verse);
        const topVerseId = toVerseId(ref.bookIndex, ref.topChapter ?? ref.chapter, ref.topVerse ?? ref.verse);
        const refValues = {
          page_id: pageId,
          paragraph_index: paragraphIndex,
          original_text: ref.originalText ?? null,
          normalized_ref: ref.normalized ?? null,
          verse_id: verseId,
          top_verse_id: topVerseId,
          book_index: ref.bookIndex ?? null,
          book_name: ref.bookName ?? null,
          book_short_name: ref.bookShortName ?? null,
          chapter: ref.chapter ?? null,
          verse: ref.verse ?? null,
          top_chapter: ref.topChapter ?? null,
          top_verse: ref.topVerse ?? null,
          is_chapter: ref.isChapter == null ? null : Number(Boolean(ref.isChapter)),
          start_index: ref.startIndex ?? null,
          end_index: ref.endIndex ?? null,
          entry_type: ref.entryType ?? null,
          entry_options: ref.entryOptions ?? null,
          module,
          parser_version: parserVersion,
          parsed_at: parsedAt
        };
        const insertResult = insertRef.run(refValues);
        storedRefIds.set(`${paragraphIndex}:${referenceIndex}`, Number(insertResult.lastInsertRowid));
      }

      for (const ref of paragraph.notFound ?? []) {
        insertNotFound.run({
          page_id: pageId,
          paragraph_index: paragraphIndex,
          normalized_ref: ref.normalized ?? null,
          book_index: ref.bookIndex ?? null,
          chapter: ref.chapter ?? null,
          verse: ref.verse ?? null,
          top_chapter: ref.topChapter ?? null,
          top_verse: ref.topVerse ?? null,
          is_chapter: ref.isChapter == null ? null : Number(Boolean(ref.isChapter)),
          module,
          parser_version: parserVersion,
          parsed_at: parsedAt
        });
      }
    }
    runtimeLog('cache', 'Inserted Bible refs', { pageId, refsCount, paragraphsCount: valuableParagraphs.length, elapsedMs: Date.now() - startedAt });

    runtimeLog('cache', 'Inserting API-calculated Bible relations', {
      pageId,
      refsCount,
      relations: relations.length,
      capped: result.relationsCapped === true
    });
    for (const relation of relations) {
      const paragraphIndex = Number(relation.paragraphIndex);
      const referenceIndex = Number(relation.referenceIndex);
      const relativeParagraphIndex = Number(relation.relativeParagraphIndex);
      const relativeReferenceIndex = Number(relation.relativeReferenceIndex);
      const verseRefId = storedRefIds.get(`${paragraphIndex}:${referenceIndex}`);
      const relativeVerseRefId = storedRefIds.get(`${relativeParagraphIndex}:${relativeReferenceIndex}`);
      if (verseRefId == null || relativeVerseRefId == null) {
        throw new Error(
          `BibleNote API relation points to an unknown reference: ${paragraphIndex}:${referenceIndex} -> ${relativeParagraphIndex}:${relativeReferenceIndex}`
        );
      }
      const verseId = Number(relation.verseId);
      const relativeVerseId = Number(relation.relativeVerseId);
      const relationWeight = Number(relation.relationWeight);
      if (!Number.isInteger(verseId) || !Number.isInteger(relativeVerseId) || !Number.isFinite(relationWeight)) {
        throw new Error('BibleNote API relation contains an invalid verse id or relation weight.');
      }
      insertRelation.run({
        page_id: pageId,
        verse_ref_id: verseRefId,
        relative_verse_ref_id: relativeVerseRefId,
        verse_id: verseId,
        relative_verse_id: relativeVerseId,
        paragraph_index: paragraphIndex,
        relative_paragraph_index: relativeParagraphIndex,
        relation_weight: relationWeight,
        module,
        parser_version: parserVersion,
        parsed_at: parsedAt
      });
    }

    db.prepare(`
      INSERT INTO page_bible_parse_state(
        page_id, content_hash, module, parser_version, parsed_at,
        parse_error, refs_count, paragraphs_count
      ) VALUES (
        @page_id, @content_hash, @module, @parser_version, @parsed_at,
        NULL, @refs_count, @paragraphs_count
      )
      ON CONFLICT(page_id) DO UPDATE SET
        content_hash = excluded.content_hash,
        module = excluded.module,
        parser_version = excluded.parser_version,
        parsed_at = excluded.parsed_at,
        parse_error = NULL,
        refs_count = excluded.refs_count,
        paragraphs_count = excluded.paragraphs_count
    `).run({
      page_id: pageId,
      content_hash: contentHash,
      module,
      parser_version: parserVersion,
      parsed_at: parsedAt,
      refs_count: refsCount,
      paragraphs_count: valuableParagraphs.length
    });
  });

  tx();
  runtimeLog('cache', 'Upserted Bible parse result', {
    pageId,
    refsCount,
    paragraphsCount: valuableParagraphs.length,
    durationMs: Date.now() - startedAt
  });
}

export function setBibleParseError(
  db: Database.Database,
  pageId: string,
  contentHash: string | null,
  module: string,
  parserVersion: string,
  error: string,
  parsedAt = nowIso()
): void {
  db.prepare(`
    INSERT INTO page_bible_parse_state(
      page_id, content_hash, module, parser_version, parsed_at,
      parse_error, refs_count, paragraphs_count
    ) VALUES (
      @page_id, @content_hash, @module, @parser_version, @parsed_at,
      @parse_error, 0, 0
    )
    ON CONFLICT(page_id) DO UPDATE SET
      content_hash = excluded.content_hash,
      module = excluded.module,
      parser_version = excluded.parser_version,
      parsed_at = excluded.parsed_at,
      parse_error = excluded.parse_error
  `).run({
    page_id: pageId,
    content_hash: contentHash,
    module,
    parser_version: parserVersion,
    parsed_at: parsedAt,
    parse_error: error.slice(0, 4000)
  });
}

export function markMissingPagesDeleted(
  db: Database.Database,
  seenPageIds: Set<string>,
  deletedAt = nowIso(),
  notebookIds?: readonly string[]
): number {
  const uniqueNotebookIds = notebookIds ? [...new Set(notebookIds)] : undefined;
  if (uniqueNotebookIds?.length === 0) return 0;
  const sql = uniqueNotebookIds
    ? `SELECT id FROM pages WHERE deleted_at IS NULL AND parent_notebook_id IN (${uniqueNotebookIds.map(() => '?').join(',')})`
    : 'SELECT id FROM pages WHERE deleted_at IS NULL';
  const existing = db.prepare(sql).all(...(uniqueNotebookIds ?? [])) as Array<{ id: string }>;
  const missing = existing.map(p => p.id).filter(id => !seenPageIds.has(id));
  if (missing.length === 0) return 0;

  const tx = db.transaction((ids: string[]) => {
    const mark = db.prepare('UPDATE pages SET deleted_at = ? WHERE id = ?');
    const removeFts = db.prepare('DELETE FROM pages_fts WHERE page_id = ?');
    for (const id of ids) {
      mark.run(deletedAt, id);
      removeFts.run(id);
    }
  });
  tx(missing);
  return missing.length;
}

export function cacheStatus(db: Database.Database): Record<string, unknown> {
  const one = (sql: string) => (db.prepare(sql).get() as any)?.value ?? 0;
  const lastSync = db.prepare('SELECT key, value, updated_at FROM sync_state ORDER BY key').all();
  const size = db.prepare(`
    SELECT
      COALESCE(SUM(content_chars), 0) AS content_chars,
      COALESCE(SUM(content_bytes), 0) AS content_bytes
    FROM pages
    WHERE deleted_at IS NULL
  `).get();

  return {
    dbPath: db.name,
    notebooks: one('SELECT COUNT(*) AS value FROM notebooks'),
    sections: one('SELECT COUNT(*) AS value FROM sections'),
    pages: one('SELECT COUNT(*) AS value FROM pages WHERE deleted_at IS NULL'),
    deletedPages: one('SELECT COUNT(*) AS value FROM pages WHERE deleted_at IS NOT NULL'),
    pagesWithContent: one('SELECT COUNT(*) AS value FROM pages WHERE deleted_at IS NULL AND content_text IS NOT NULL'),
    pagesWithErrors: one("SELECT COUNT(*) AS value FROM pages WHERE deleted_at IS NULL AND fetch_error IS NOT NULL"),
    sectionsWithScanErrors: one("SELECT COUNT(*) AS value FROM sections WHERE pages_scan_error IS NOT NULL"),
    bibleParsedPages: one("SELECT COUNT(*) AS value FROM page_bible_parse_state WHERE parsed_at IS NOT NULL AND parse_error IS NULL"),
    bibleParseErrors: one("SELECT COUNT(*) AS value FROM page_bible_parse_state WHERE parse_error IS NOT NULL"),
    bibleReferencedParagraphs: one('SELECT COUNT(*) AS value FROM page_paragraphs'),
    bibleReferences: one('SELECT COUNT(*) AS value FROM paragraph_verse_refs'),
    bibleReferenceRelations: one('SELECT COUNT(*) AS value FROM paragraph_verse_relations'),
    content: size,
    lastSync
  };
}
