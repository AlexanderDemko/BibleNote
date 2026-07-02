import './env.js';
import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { BibleParseResult } from './bible.js';

export type NotebookRow = {
  id: string;
  display_name: string | null;
  custom_display_name: string | null;
  is_default: number | null;
  last_modified_date_time: string | null;
  links_json: string | null;
  synced_at: string;
};

export type SectionRow = {
  id: string;
  display_name: string | null;
  last_modified_date_time: string | null;
  pages_url: string | null;
  parent_notebook_id: string | null;
  parent_notebook_name: string | null;
  parent_section_group_id: string | null;
  parent_section_group_name: string | null;
  section_group_path: string | null;
  order_index: number | null;
  links_json: string | null;
  synced_at: string;
  pages_scanned_at: string | null;
  pages_scan_complete: number | null;
  pages_seen_count: number | null;
};

export type PageRow = {
  id: string;
  title: string | null;
  created_date_time: string | null;
  last_modified_date_time: string | null;
  content_url: string | null;
  parent_section_id: string | null;
  parent_section_name: string | null;
  parent_notebook_id: string | null;
  parent_notebook_name: string | null;
  links_json: string | null;
  content_text: string | null;
  content_html: string | null;
  content_hash: string | null;
  content_source_modified_date_time: string | null;
  content_chars: number | null;
  content_bytes: number | null;
  content_synced_at: string | null;
  metadata_synced_at: string | null;
  deleted_at: string | null;
  fetch_error: string | null;
  order_index: number | null;
};

export type SectionGroupRow = {
  id: string;
  display_name: string | null;
  parent_notebook_id: string | null;
  parent_notebook_name: string | null;
  parent_section_group_id: string | null;
  section_group_path: string | null;
  order_index: number | null;
  last_modified_date_time: string | null;
  synced_at: string;
};

export type CacheSearchResult = {
  id: string;
  title: string | null;
  parent_notebook_id: string | null;
  parent_notebook_name: string | null;
  parent_section_name: string | null;
  last_modified_date_time: string | null;
  content_synced_at: string | null;
  snippet: string | null;
  score: number;
};

export type BibleParseStateRow = {
  page_id: string;
  content_hash: string | null;
  module: string;
  parser_version: string;
  parsed_at: string | null;
  parse_error: string | null;
  refs_count: number;
  paragraphs_count: number;
};

export type BibleReferenceSearchResult = {
  page_id: string;
  title: string | null;
  parent_notebook_id: string | null;
  parent_notebook_name: string | null;
  parent_section_name: string | null;
  paragraph_index: number;
  paragraph_text: string | null;
  original_text: string | null;
  normalized_ref: string | null;
  book_index: number | null;
  book_name: string | null;
  chapter: number | null;
  verse: number | null;
  top_chapter: number | null;
  top_verse: number | null;
};

type StoredBibleReference = {
  id: number;
  page_id: string;
  paragraph_index: number;
  paragraph_path: string | null;
  original_text: string | null;
  normalized_ref: string | null;
  book_index: number | null;
  book_name: string | null;
  book_short_name: string | null;
  chapter: number | null;
  verse: number | null;
  top_chapter: number | null;
  top_verse: number | null;
  start_index: number | null;
  end_index: number | null;
};

type RelationVerse = {
  refId: number;
  verseId: number;
};

type ParagraphWithReferences = {
  index: number;
  path: string | null;
  refs: StoredBibleReference[];
};

export const defaultCacheDir = path.join(os.homedir(), '.codex-onenote-mcp');
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
  logStartupTiming('sqlite pragmas applied');
  migrate(db);
  logStartupTiming('openCacheDb complete');
  return db;
}

function migrate(db: Database.Database): void {
  logStartupTiming('migrate schema start');
  db.exec(`
    CREATE TABLE IF NOT EXISTS notebooks (
      id TEXT PRIMARY KEY,
      display_name TEXT,
      custom_display_name TEXT,
      is_default INTEGER,
      last_modified_date_time TEXT,
      links_json TEXT,
      synced_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sections (
      id TEXT PRIMARY KEY,
      display_name TEXT,
      last_modified_date_time TEXT,
      pages_url TEXT,
      parent_notebook_id TEXT,
      parent_notebook_name TEXT,
      parent_section_group_id TEXT,
      parent_section_group_name TEXT,
      section_group_path TEXT,
      order_index INTEGER,
      links_json TEXT,
      synced_at TEXT NOT NULL,
      pages_scanned_at TEXT,
      pages_scan_complete INTEGER,
      pages_seen_count INTEGER
    );

    CREATE TABLE IF NOT EXISTS pages (
      id TEXT PRIMARY KEY,
      title TEXT,
      created_date_time TEXT,
      last_modified_date_time TEXT,
      content_url TEXT,
      parent_section_id TEXT,
      parent_section_name TEXT,
      parent_notebook_id TEXT,
      parent_notebook_name TEXT,
      links_json TEXT,
      content_text TEXT,
      content_html TEXT,
      content_hash TEXT,
      content_source_modified_date_time TEXT,
      content_chars INTEGER,
      content_bytes INTEGER,
      content_synced_at TEXT,
      metadata_synced_at TEXT,
      deleted_at TEXT,
      fetch_error TEXT
    );

    CREATE TABLE IF NOT EXISTS section_groups (
      id TEXT PRIMARY KEY,
      display_name TEXT,
      parent_notebook_id TEXT,
      parent_notebook_name TEXT,
      parent_section_group_id TEXT,
      section_group_path TEXT,
      order_index INTEGER,
      last_modified_date_time TEXT,
      synced_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sync_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS page_bible_parse_state (
      page_id TEXT PRIMARY KEY,
      content_hash TEXT,
      module TEXT NOT NULL,
      parser_version TEXT NOT NULL,
      parsed_at TEXT,
      parse_error TEXT,
      refs_count INTEGER NOT NULL DEFAULT 0,
      paragraphs_count INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY(page_id) REFERENCES pages(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS page_paragraphs (
      page_id TEXT NOT NULL,
      paragraph_index INTEGER NOT NULL,
      paragraph_path TEXT,
      text TEXT,
      text_hash TEXT,
      parsed_at TEXT NOT NULL,
      parser_version TEXT NOT NULL,
      module TEXT NOT NULL,
      PRIMARY KEY(page_id, paragraph_index),
      FOREIGN KEY(page_id) REFERENCES pages(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS paragraph_verse_refs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      page_id TEXT NOT NULL,
      paragraph_index INTEGER NOT NULL,
      original_text TEXT,
      normalized_ref TEXT,
      verse_id INTEGER,
      top_verse_id INTEGER,
      book_index INTEGER,
      book_name TEXT,
      book_short_name TEXT,
      chapter INTEGER,
      verse INTEGER,
      top_chapter INTEGER,
      top_verse INTEGER,
      is_chapter INTEGER,
      start_index INTEGER,
      end_index INTEGER,
      entry_type TEXT,
      entry_options TEXT,
      module TEXT NOT NULL,
      parser_version TEXT NOT NULL,
      parsed_at TEXT NOT NULL,
      FOREIGN KEY(page_id, paragraph_index) REFERENCES page_paragraphs(page_id, paragraph_index) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS paragraph_verse_relations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      page_id TEXT NOT NULL,
      verse_ref_id INTEGER NOT NULL,
      relative_verse_ref_id INTEGER NOT NULL,
      verse_id INTEGER NOT NULL,
      relative_verse_id INTEGER NOT NULL,
      paragraph_index INTEGER NOT NULL,
      relative_paragraph_index INTEGER NOT NULL,
      relation_weight REAL NOT NULL,
      module TEXT NOT NULL,
      parser_version TEXT NOT NULL,
      parsed_at TEXT NOT NULL,
      FOREIGN KEY(verse_ref_id) REFERENCES paragraph_verse_refs(id) ON DELETE CASCADE,
      FOREIGN KEY(relative_verse_ref_id) REFERENCES paragraph_verse_refs(id) ON DELETE CASCADE,
      FOREIGN KEY(page_id, paragraph_index) REFERENCES page_paragraphs(page_id, paragraph_index) ON DELETE CASCADE,
      FOREIGN KEY(page_id, relative_paragraph_index) REFERENCES page_paragraphs(page_id, paragraph_index) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS paragraph_verse_not_found (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      page_id TEXT NOT NULL,
      paragraph_index INTEGER NOT NULL,
      normalized_ref TEXT,
      book_index INTEGER,
      chapter INTEGER,
      verse INTEGER,
      top_chapter INTEGER,
      top_verse INTEGER,
      is_chapter INTEGER,
      module TEXT NOT NULL,
      parser_version TEXT NOT NULL,
      parsed_at TEXT NOT NULL,
      FOREIGN KEY(page_id, paragraph_index) REFERENCES page_paragraphs(page_id, paragraph_index) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_sections_parent_notebook ON sections(parent_notebook_id);
    CREATE INDEX IF NOT EXISTS idx_section_groups_parent_notebook ON section_groups(parent_notebook_id);
    CREATE INDEX IF NOT EXISTS idx_section_groups_parent_group ON section_groups(parent_section_group_id);
    CREATE INDEX IF NOT EXISTS idx_pages_parent_section ON pages(parent_section_id);
    CREATE INDEX IF NOT EXISTS idx_pages_parent_notebook ON pages(parent_notebook_id);
    CREATE INDEX IF NOT EXISTS idx_pages_last_modified ON pages(last_modified_date_time);
    CREATE INDEX IF NOT EXISTS idx_pages_content_synced ON pages(content_synced_at);
    CREATE INDEX IF NOT EXISTS idx_pages_deleted ON pages(deleted_at);
    CREATE INDEX IF NOT EXISTS idx_bible_refs_page ON paragraph_verse_refs(page_id);
    CREATE INDEX IF NOT EXISTS idx_bible_refs_ref ON paragraph_verse_refs(book_index, chapter, verse, top_chapter, top_verse);
    CREATE INDEX IF NOT EXISTS idx_bible_refs_normalized ON paragraph_verse_refs(normalized_ref);
    CREATE INDEX IF NOT EXISTS idx_bible_relations_verse ON paragraph_verse_relations(verse_id);
    CREATE INDEX IF NOT EXISTS idx_bible_relations_relative ON paragraph_verse_relations(relative_verse_id);
    CREATE INDEX IF NOT EXISTS idx_bible_relations_page ON paragraph_verse_relations(page_id);
    CREATE INDEX IF NOT EXISTS idx_page_bible_parse_state_module ON page_bible_parse_state(module, parser_version);

    CREATE VIRTUAL TABLE IF NOT EXISTS pages_fts USING fts5(
      page_id UNINDEXED,
      title,
      content,
      notebook,
      section,
      tokenize = 'unicode61 remove_diacritics 2',
      prefix = '2 3 4'
    );
  `);
  logStartupTiming('migrate schema base complete');

  const pageColumns = db.pragma('table_info(pages)') as Array<{ name: string }>;
  if (!pageColumns.some(column => column.name === 'content_source_modified_date_time')) {
    db.exec('ALTER TABLE pages ADD COLUMN content_source_modified_date_time TEXT');
  }
  if (!pageColumns.some(column => column.name === 'order_index')) {
    db.exec('ALTER TABLE pages ADD COLUMN order_index INTEGER');
  }
  const sectionColumns = db.pragma('table_info(sections)') as Array<{ name: string }>;
  if (!sectionColumns.some(column => column.name === 'pages_scanned_at')) {
    db.exec('ALTER TABLE sections ADD COLUMN pages_scanned_at TEXT');
  }
  if (!sectionColumns.some(column => column.name === 'pages_scan_complete')) {
    db.exec('ALTER TABLE sections ADD COLUMN pages_scan_complete INTEGER');
  }
  if (!sectionColumns.some(column => column.name === 'pages_seen_count')) {
    db.exec('ALTER TABLE sections ADD COLUMN pages_seen_count INTEGER');
  }
  if (!sectionColumns.some(column => column.name === 'parent_section_group_id')) {
    db.exec('ALTER TABLE sections ADD COLUMN parent_section_group_id TEXT');
  }
  if (!sectionColumns.some(column => column.name === 'parent_section_group_name')) {
    db.exec('ALTER TABLE sections ADD COLUMN parent_section_group_name TEXT');
  }
  if (!sectionColumns.some(column => column.name === 'section_group_path')) {
    db.exec('ALTER TABLE sections ADD COLUMN section_group_path TEXT');
  }
  if (!sectionColumns.some(column => column.name === 'order_index')) {
    db.exec('ALTER TABLE sections ADD COLUMN order_index INTEGER');
  }
  db.exec('CREATE INDEX IF NOT EXISTS idx_sections_parent_group ON sections(parent_section_group_id)');
  db.exec(`
    INSERT OR IGNORE INTO section_groups(
      id, display_name, parent_notebook_id, parent_notebook_name,
      parent_section_group_id, section_group_path, order_index,
      last_modified_date_time, synced_at
    )
    SELECT DISTINCT
      parent_section_group_id, parent_section_group_name,
      parent_notebook_id, parent_notebook_name,
      NULL, section_group_path, NULL, NULL, synced_at
    FROM sections
    WHERE parent_section_group_id IS NOT NULL
  `);
  const notebookColumns = db.pragma('table_info(notebooks)') as Array<{ name: string }>;
  if (!notebookColumns.some(column => column.name === 'custom_display_name')) {
    db.exec('ALTER TABLE notebooks ADD COLUMN custom_display_name TEXT');
  }
  const bibleRefColumns = db.pragma('table_info(paragraph_verse_refs)') as Array<{ name: string }>;
  if (!bibleRefColumns.some(column => column.name === 'verse_id')) {
    db.exec('ALTER TABLE paragraph_verse_refs ADD COLUMN verse_id INTEGER');
  }
  if (!bibleRefColumns.some(column => column.name === 'top_verse_id')) {
    db.exec('ALTER TABLE paragraph_verse_refs ADD COLUMN top_verse_id INTEGER');
  }
  db.exec('CREATE INDEX IF NOT EXISTS idx_bible_refs_verse_id ON paragraph_verse_refs(verse_id)');
  logStartupTiming('migrate schema incremental complete');
  const bibleRefsCount = (db.prepare('SELECT COUNT(*) AS value FROM paragraph_verse_refs').get() as { value: number }).value;
  const bibleRelationsCount = (db.prepare('SELECT COUNT(*) AS value FROM paragraph_verse_relations').get() as { value: number }).value;
  logStartupTiming(`migrate relation counts refs=${bibleRefsCount} relations=${bibleRelationsCount}`);
  if (bibleRefsCount > 0 && bibleRelationsCount === 0) {
    logStartupTiming('rebuildBibleReferenceRelations start');
    rebuildBibleReferenceRelations(db);
    logStartupTiming('rebuildBibleReferenceRelations complete');
  }
  logStartupTiming('migrate complete');
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
      pages_seen_count = ?
    WHERE id = ?
  `).run(scannedAt, Number(complete), pagesSeen, sectionId);
}

export function getCachedPage(db: Database.Database, pageId: string): PageRow | undefined {
  return db.prepare('SELECT * FROM pages WHERE id = ?').get(pageId) as PageRow | undefined;
}

export function upsertPageMetadata(db: Database.Database, page: any, syncedAt = nowIso()): void {
  const upsert = db.prepare(`
    INSERT INTO pages(
      id, title, created_date_time, last_modified_date_time, content_url,
      parent_section_id, parent_section_name, parent_notebook_id, parent_notebook_name,
      links_json, metadata_synced_at, deleted_at, order_index
    )
    VALUES (
      @id, @title, @created_date_time, @last_modified_date_time, @content_url,
      @parent_section_id, @parent_section_name, @parent_notebook_id, @parent_notebook_name,
      @links_json, @metadata_synced_at, NULL, @order_index
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
    order_index: page.order ?? page.orderIndex ?? null
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
        fetch_error = NULL
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

export function setPageFetchError(db: Database.Database, pageId: string, error: string): void {
  db.prepare('UPDATE pages SET fetch_error = ? WHERE id = ?').run(error.slice(0, 4000), pageId);
}

export function getBibleParseState(db: Database.Database, pageId: string): BibleParseStateRow | undefined {
  return db.prepare('SELECT * FROM page_bible_parse_state WHERE page_id = ?').get(pageId) as BibleParseStateRow | undefined;
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

function toVerseId(bookIndex: number | null | undefined, chapter: number | null | undefined, verse: number | null | undefined): number | null {
  if (!Number.isInteger(bookIndex) || !Number.isInteger(chapter) || !Number.isInteger(verse) || !verse) return null;
  return Number(`${String(bookIndex).padStart(2, '0')}${String(chapter).padStart(3, '0')}${String(verse).padStart(3, '0')}`);
}

function expandReferenceVerseIds(ref: {
  bookIndex?: number | null;
  chapter?: number | null;
  verse?: number | null;
  topChapter?: number | null;
  topVerse?: number | null;
}): number[] {
  const firstVerseId = toVerseId(ref.bookIndex, ref.chapter, ref.verse);
  if (firstVerseId == null) return [];

  const topChapter = ref.topChapter ?? ref.chapter ?? null;
  const topVerse = ref.topVerse ?? ref.verse ?? null;
  if (
    ref.chapter != null
    && ref.verse != null
    && topChapter === ref.chapter
    && topVerse != null
    && topVerse > ref.verse
    && topVerse - ref.verse <= 300
  ) {
    const result: number[] = [];
    for (let verse = ref.verse; verse <= topVerse; verse++) {
      const verseId = toVerseId(ref.bookIndex, ref.chapter, verse);
      if (verseId != null) result.push(verseId);
    }
    return result;
  }

  return [firstVerseId];
}

function getStoredReferenceVerseIds(ref: StoredBibleReference): RelationVerse[] {
  return expandReferenceVerseIds({
    bookIndex: ref.book_index,
    chapter: ref.chapter,
    verse: ref.verse,
    topChapter: ref.top_chapter,
    topVerse: ref.top_verse
  }).map(verseId => ({ refId: ref.id, verseId }));
}

function getWithinParagraphRelationWeight(verseEntry: StoredBibleReference, relativeVerseEntry: StoredBibleReference): number {
  const start = relativeVerseEntry.start_index ?? 0;
  const end = verseEntry.end_index ?? start;
  const distance = start - end;
  if (distance < 5) return 1;
  if (distance < 50) return 0.8;
  return Number((40 / distance).toFixed(4));
}

function paragraphDepth(path: string | null): number {
  if (!path) return 0;
  const matches = path.match(/\d+/g);
  return matches ? Math.max(0, matches.length - 1) : 0;
}

function getParagraphsWeight(paragraphs: ParagraphWithReferences[], index: number, relationIndex: number): number {
  const minWeight = 0.01;
  const baseDepth = paragraphDepth(paragraphs[index]?.path ?? null);
  const relationDepth = paragraphDepth(paragraphs[relationIndex]?.path ?? null);
  if (relationDepth < baseDepth) return minWeight;

  let result = 0.5;
  for (let nextIndex = index + 1; nextIndex < relationIndex && result > minWeight; nextIndex++) {
    const nextDepth = paragraphDepth(paragraphs[nextIndex]?.path ?? null);
    if (nextDepth >= baseDepth) {
      result = result / 2;
    } else {
      result = minWeight;
      break;
    }
  }

  return Math.max(result, minWeight);
}

function buildBibleRelations(pageId: string, paragraphs: ParagraphWithReferences[], module: string, parserVersion: string, parsedAt: string): Array<Record<string, unknown>> {
  const rows: Array<Record<string, unknown>> = [];

  const addRelations = (
    source: StoredBibleReference,
    target: StoredBibleReference,
    relationWeight: number
  ) => {
    const sourceVerses = getStoredReferenceVerseIds(source);
    const targetVerses = getStoredReferenceVerseIds(target);
    for (const sourceVerse of sourceVerses) {
      for (const targetVerse of targetVerses) {
        if (sourceVerse.verseId === targetVerse.verseId) continue;
        rows.push({
          page_id: pageId,
          verse_ref_id: sourceVerse.refId,
          relative_verse_ref_id: targetVerse.refId,
          verse_id: sourceVerse.verseId,
          relative_verse_id: targetVerse.verseId,
          paragraph_index: source.paragraph_index,
          relative_paragraph_index: target.paragraph_index,
          relation_weight: Number(relationWeight.toFixed(4)),
          module,
          parser_version: parserVersion,
          parsed_at: parsedAt
        });
      }
    }
  };

  for (let paragraphIndex = 0; paragraphIndex < paragraphs.length; paragraphIndex++) {
    const paragraph = paragraphs[paragraphIndex];
    for (let refIndex = 0; refIndex < paragraph.refs.length; refIndex++) {
      const source = paragraph.refs[refIndex];

      for (let nextRefIndex = refIndex + 1; nextRefIndex < paragraph.refs.length; nextRefIndex++) {
        const target = paragraph.refs[nextRefIndex];
        addRelations(source, target, getWithinParagraphRelationWeight(source, target));
      }

      for (let nextParagraphIndex = paragraphIndex + 1; nextParagraphIndex < paragraphs.length; nextParagraphIndex++) {
        const relationWeight = getParagraphsWeight(paragraphs, paragraphIndex, nextParagraphIndex);
        for (const target of paragraphs[nextParagraphIndex].refs) {
          addRelations(source, target, relationWeight);
        }
      }
    }
  }

  return rows;
}

export function rebuildBibleReferenceRelations(db: Database.Database, pageId?: string, rebuiltAt = nowIso()): number {
  const pageRows = pageId
    ? [{ page_id: pageId }]
    : db.prepare('SELECT DISTINCT page_id FROM paragraph_verse_refs ORDER BY page_id').all() as Array<{ page_id: string }>;
  let relationsCount = 0;

  const deleteRelations = pageId
    ? db.prepare('DELETE FROM paragraph_verse_relations WHERE page_id = ?')
    : db.prepare('DELETE FROM paragraph_verse_relations');
  const updateRefVerseIds = db.prepare(`
    UPDATE paragraph_verse_refs
    SET verse_id = @verse_id, top_verse_id = @top_verse_id
    WHERE id = @id
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
  const selectRefs = db.prepare(`
    SELECT
      r.id,
      r.page_id,
      r.paragraph_index,
      pp.paragraph_path,
      r.original_text,
      r.normalized_ref,
      r.book_index,
      r.book_name,
      r.book_short_name,
      r.chapter,
      r.verse,
      r.top_chapter,
      r.top_verse,
      r.start_index,
      r.end_index,
      r.module,
      r.parser_version
    FROM paragraph_verse_refs r
    JOIN page_paragraphs pp ON pp.page_id = r.page_id AND pp.paragraph_index = r.paragraph_index
    WHERE r.page_id = ?
    ORDER BY r.paragraph_index, r.start_index
  `);

  const tx = db.transaction(() => {
    if (pageId) deleteRelations.run(pageId);
    else deleteRelations.run();

    for (const row of pageRows) {
      const refs = selectRefs.all(row.page_id) as Array<StoredBibleReference & { module: string; parser_version: string }>;
      const paragraphs = new Map<number, ParagraphWithReferences>();
      let module = 'rst';
      let parserVersion = 'unknown';

      for (const ref of refs) {
        module = ref.module || module;
        parserVersion = ref.parser_version || parserVersion;
        const verseId = toVerseId(ref.book_index, ref.chapter, ref.verse);
        const topVerseId = toVerseId(ref.book_index, ref.top_chapter ?? ref.chapter, ref.top_verse ?? ref.verse);
        updateRefVerseIds.run({ id: ref.id, verse_id: verseId, top_verse_id: topVerseId });

        if (!paragraphs.has(ref.paragraph_index)) {
          paragraphs.set(ref.paragraph_index, {
            index: ref.paragraph_index,
            path: ref.paragraph_path,
            refs: []
          });
        }
        paragraphs.get(ref.paragraph_index)?.refs.push(ref);
      }

      const relationParagraphs = [...paragraphs.values()]
        .map(paragraph => ({
          ...paragraph,
          refs: paragraph.refs.sort((a, b) => (a.start_index ?? 0) - (b.start_index ?? 0))
        }))
        .sort((a, b) => a.index - b.index);
      for (const relation of buildBibleRelations(row.page_id, relationParagraphs, module, parserVersion, rebuiltAt)) {
        insertRelation.run(relation);
        relationsCount++;
      }
    }
  });

  tx();
  return relationsCount;
}

export function upsertBibleParseResult(
  db: Database.Database,
  pageId: string,
  contentHash: string,
  result: BibleParseResult,
  parserVersion: string,
  parsedAt = nowIso()
): void {
  const module = result.module || 'rst';
  const paragraphs = result.paragraphs ?? [];
  const valuableParagraphs = paragraphs.filter(paragraph =>
    (paragraph.references?.length ?? 0) > 0 || (paragraph.notFound?.length ?? 0) > 0
  );
  const refsCount = valuableParagraphs.reduce((sum, paragraph) => sum + (paragraph.references?.length ?? 0), 0);

  const tx = db.transaction(() => {
    db.prepare('DELETE FROM paragraph_verse_relations WHERE page_id = ?').run(pageId);
    db.prepare('DELETE FROM paragraph_verse_refs WHERE page_id = ?').run(pageId);
    db.prepare('DELETE FROM paragraph_verse_not_found WHERE page_id = ?').run(pageId);
    db.prepare('DELETE FROM page_paragraphs WHERE page_id = ?').run(pageId);
    const storedParagraphs = new Map<number, ParagraphWithReferences>();

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
      storedParagraphs.set(paragraphIndex, {
        index: paragraphIndex,
        path: paragraph.path ?? null,
        refs: []
      });

      for (const ref of paragraph.references ?? []) {
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
        storedParagraphs.get(paragraphIndex)?.refs.push({
          id: Number(insertResult.lastInsertRowid),
          page_id: pageId,
          paragraph_index: paragraphIndex,
          paragraph_path: paragraph.path ?? null,
          original_text: refValues.original_text,
          normalized_ref: refValues.normalized_ref,
          book_index: refValues.book_index,
          book_name: refValues.book_name,
          book_short_name: refValues.book_short_name,
          chapter: refValues.chapter,
          verse: refValues.verse,
          top_chapter: refValues.top_chapter,
          top_verse: refValues.top_verse,
          start_index: refValues.start_index,
          end_index: refValues.end_index
        });
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

    const relationParagraphs = [...storedParagraphs.values()]
      .map(paragraph => ({
        ...paragraph,
        refs: paragraph.refs.sort((a, b) => (a.start_index ?? 0) - (b.start_index ?? 0))
      }))
      .sort((a, b) => a.index - b.index);
    for (const relation of buildBibleRelations(pageId, relationParagraphs, module, parserVersion, parsedAt)) {
      insertRelation.run(relation);
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
    bibleParsedPages: one("SELECT COUNT(*) AS value FROM page_bible_parse_state WHERE parsed_at IS NOT NULL AND parse_error IS NULL"),
    bibleParseErrors: one("SELECT COUNT(*) AS value FROM page_bible_parse_state WHERE parse_error IS NOT NULL"),
    bibleReferencedParagraphs: one('SELECT COUNT(*) AS value FROM page_paragraphs'),
    bibleReferences: one('SELECT COUNT(*) AS value FROM paragraph_verse_refs'),
    bibleReferenceRelations: one('SELECT COUNT(*) AS value FROM paragraph_verse_relations'),
    content: size,
    lastSync
  };
}

export function buildFtsQuery(query: string, mode: 'and' | 'or' | 'phrase' = 'and'): string {
  const trimmed = query.trim();
  if (!trimmed) throw new Error('Search query is empty.');

  if (mode === 'phrase') {
    return `"${trimmed.replaceAll('"', '""')}"`;
  }

  const terms = trimmed.match(/[\p{L}\p{N}_-]+/gu) ?? [];
  if (terms.length === 0) return `"${trimmed.replaceAll('"', '""')}"`;
  const operator = mode === 'or' ? ' OR ' : ' AND ';
  return terms.map(term => `${term.replaceAll('"', '""')}*`).join(operator);
}

export function searchCache(
  db: Database.Database,
  query: string,
  options: {
    limit?: number;
    mode?: 'and' | 'or' | 'phrase';
    notebookId?: string;
    notebookIds?: string[];
    sectionId?: string;
  } = {}
): CacheSearchResult[] {
  const limit = Math.max(1, Math.min(options.limit ?? 20, 100));
  const ftsQuery = buildFtsQuery(query, options.mode ?? 'and');
  const filters: string[] = ['p.deleted_at IS NULL'];
  const params: any = { ftsQuery, limit };

  if (options.notebookIds) {
    const notebookIds = [...new Set(options.notebookIds)];
    if (notebookIds.length === 0) return [];
    const placeholders = notebookIds.map((_, index) => `@notebookId${index}`);
    filters.push(`p.parent_notebook_id IN (${placeholders.join(', ')})`);
    notebookIds.forEach((id, index) => {
      params[`notebookId${index}`] = id;
    });
  } else if (options.notebookId) {
    filters.push('p.parent_notebook_id = @notebookId');
    params.notebookId = options.notebookId;
  }
  if (options.sectionId) {
    filters.push('p.parent_section_id = @sectionId');
    params.sectionId = options.sectionId;
  }

  const sql = `
    SELECT
      p.id,
      p.title,
      p.parent_notebook_id,
      COALESCE(n.custom_display_name, p.parent_notebook_name) AS parent_notebook_name,
      p.parent_section_name,
      p.last_modified_date_time,
      p.content_synced_at,
      snippet(pages_fts, 2, '[', ']', ' … ', 24) AS snippet,
      bm25(pages_fts) AS score
    FROM pages_fts
    JOIN pages p ON p.id = pages_fts.page_id
    LEFT JOIN notebooks n ON n.id = p.parent_notebook_id
    WHERE pages_fts MATCH @ftsQuery
      AND ${filters.join(' AND ')}
    ORDER BY score ASC
    LIMIT @limit
  `;

  return db.prepare(sql).all(params) as CacheSearchResult[];
}

export function listCachedNotebooks(db: Database.Database): NotebookRow[] {
  return db.prepare('SELECT * FROM notebooks ORDER BY COALESCE(custom_display_name, display_name) COLLATE NOCASE').all() as NotebookRow[];
}

export function listCachedSections(db: Database.Database, notebookId?: string): SectionRow[] {
  if (notebookId) {
    return db.prepare('SELECT * FROM sections WHERE parent_notebook_id = ? ORDER BY section_group_path COLLATE NOCASE, display_name COLLATE NOCASE').all(notebookId) as SectionRow[];
  }
  return db.prepare('SELECT * FROM sections ORDER BY parent_notebook_name COLLATE NOCASE, section_group_path COLLATE NOCASE, display_name COLLATE NOCASE').all() as SectionRow[];
}

export function readCachedPage(db: Database.Database, pageId: string, includeHtml: boolean, maxTextChars: number): Record<string, unknown> {
  const row = getCachedPage(db, pageId);
  if (!row || row.deleted_at) throw new Error(`Page is not in local cache or was marked deleted: ${pageId}`);
  const notebook = row.parent_notebook_id
    ? db.prepare('SELECT custom_display_name FROM notebooks WHERE id = ?').get(row.parent_notebook_id) as { custom_display_name: string | null } | undefined
    : undefined;
  return {
    id: row.id,
    title: row.title,
    createdDateTime: row.created_date_time,
    lastModifiedDateTime: row.last_modified_date_time,
    contentSyncedAt: row.content_synced_at,
    parentNotebook: { id: row.parent_notebook_id, displayName: notebook?.custom_display_name ?? row.parent_notebook_name },
    parentSection: { id: row.parent_section_id, displayName: row.parent_section_name },
    text: (row.content_text ?? '').slice(0, maxTextChars),
    html: includeHtml ? row.content_html : undefined,
    links: row.links_json ? JSON.parse(row.links_json) : undefined,
    fetchError: row.fetch_error
  };
}

export function searchBibleReferences(
  db: Database.Database,
  options: {
    normalized?: string;
    bookIndex?: number;
    chapter?: number;
    verse?: number;
    limit?: number;
  }
): BibleReferenceSearchResult[] {
  const limit = Math.max(1, Math.min(options.limit ?? 50, 200));
  const filters = ['p.deleted_at IS NULL'];
  const params: Record<string, unknown> = { limit };

  if (options.normalized?.trim()) {
    filters.push('r.normalized_ref LIKE @normalized');
    params.normalized = `%${options.normalized.trim()}%`;
  }
  if (options.bookIndex != null) {
    filters.push('r.book_index = @bookIndex');
    params.bookIndex = options.bookIndex;
  }
  if (options.chapter != null) {
    params.chapter = options.chapter;
    if (options.verse != null) {
      params.verse = options.verse;
      filters.push(`
        (
          (r.chapter < @chapter OR (r.chapter = @chapter AND COALESCE(r.verse, 0) <= @verse))
          AND
          (COALESCE(r.top_chapter, r.chapter) > @chapter OR (COALESCE(r.top_chapter, r.chapter) = @chapter AND COALESCE(r.top_verse, r.verse, 999) >= @verse))
        )
      `);
    } else {
      filters.push('r.chapter = @chapter');
    }
  }

  if (filters.length === 1) throw new Error('Specify normalized or bookIndex/chapter.');

  return db.prepare(`
    SELECT
      r.page_id,
      p.title,
      p.parent_notebook_id,
      COALESCE(n.custom_display_name, p.parent_notebook_name) AS parent_notebook_name,
      p.parent_section_name,
      r.paragraph_index,
      pp.text AS paragraph_text,
      r.original_text,
      r.normalized_ref,
      r.book_index,
      r.book_name,
      r.chapter,
      r.verse,
      r.top_chapter,
      r.top_verse
    FROM paragraph_verse_refs r
    JOIN pages p ON p.id = r.page_id
    JOIN page_paragraphs pp ON pp.page_id = r.page_id AND pp.paragraph_index = r.paragraph_index
    LEFT JOIN notebooks n ON n.id = p.parent_notebook_id
    WHERE ${filters.join(' AND ')}
    ORDER BY p.last_modified_date_time DESC, r.page_id, r.paragraph_index, r.start_index
    LIMIT @limit
  `).all(params) as BibleReferenceSearchResult[];
}

export function findParallelBibleReferences(
  db: Database.Database,
  options: {
    bookIndex: number;
    chapter: number;
    verse?: number;
    limit?: number;
  }
): Array<Record<string, unknown>> {
  const limit = Math.max(1, Math.min(options.limit ?? 50, 200));
  const targetVerseId = options.verse == null ? null : toVerseId(options.bookIndex, options.chapter, options.verse);
  const params = {
    bookIndex: options.bookIndex,
    chapter: options.chapter,
    verse: options.verse ?? null,
    targetVerseId,
    limit
  };
  const targetFilter = options.verse == null
    ? 'target.book_index = @bookIndex AND target.chapter = @chapter'
    : `
      target.book_index = @bookIndex
      AND (
        (target.chapter < @chapter OR (target.chapter = @chapter AND COALESCE(target.verse, 0) <= @verse))
        AND
        (COALESCE(target.top_chapter, target.chapter) > @chapter OR (COALESCE(target.top_chapter, target.chapter) = @chapter AND COALESCE(target.top_verse, target.verse, 999) >= @verse))
      )
    `;
  const relatedFilter = options.verse == null
    ? 'r.book_index = @bookIndex AND r.chapter = @chapter'
    : `
      r.book_index = @bookIndex
      AND (
        (r.chapter < @chapter OR (r.chapter = @chapter AND COALESCE(r.verse, 0) <= @verse))
        AND
        (COALESCE(r.top_chapter, r.chapter) > @chapter OR (COALESCE(r.top_chapter, r.chapter) = @chapter AND COALESCE(r.top_verse, r.verse, 999) >= @verse))
      )
    `;
  const sourceVerseFilter = options.verse == null ? '' : 'AND rel.verse_id = @targetVerseId';
  const relativeVerseFilter = options.verse == null ? '' : 'AND rel.relative_verse_id = @targetVerseId';

  return db.prepare(`
    WITH matched_relations AS (
      SELECT
        rel.relative_verse_ref_id AS ref_id,
        rel.page_id,
        rel.paragraph_index,
        rel.relative_paragraph_index,
        rel.relation_weight
      FROM paragraph_verse_relations rel
      JOIN paragraph_verse_refs target ON target.id = rel.verse_ref_id
      WHERE ${targetFilter}
        ${sourceVerseFilter}

      UNION ALL

      SELECT
        rel.verse_ref_id AS ref_id,
        rel.page_id,
        rel.relative_paragraph_index AS paragraph_index,
        rel.paragraph_index AS relative_paragraph_index,
        rel.relation_weight
      FROM paragraph_verse_relations rel
      JOIN paragraph_verse_refs target ON target.id = rel.relative_verse_ref_id
      WHERE ${targetFilter}
        ${relativeVerseFilter}
    )
    SELECT
      r.normalized_ref AS normalizedRef,
      r.book_index AS bookIndex,
      r.book_name AS bookName,
      r.chapter,
      r.verse,
      r.top_chapter AS topChapter,
      r.top_verse AS topVerse,
      ROUND(SUM(mr.relation_weight), 4) AS relationWeight,
      ROUND(MAX(mr.relation_weight), 4) AS maxRelationWeight,
      COUNT(*) AS relations,
      COUNT(DISTINCT r.page_id) AS pages,
      COUNT(DISTINCT r.page_id || ':' || r.paragraph_index) AS paragraphs,
      MIN(r.original_text) AS sampleOriginalText
    FROM matched_relations mr
    JOIN paragraph_verse_refs r ON r.id = mr.ref_id
    JOIN pages p ON p.id = r.page_id
    WHERE p.deleted_at IS NULL
      AND NOT (${relatedFilter})
    GROUP BY r.normalized_ref, r.book_index, r.book_name, r.chapter, r.verse, r.top_chapter, r.top_verse
    ORDER BY relationWeight DESC, maxRelationWeight DESC, pages DESC, normalizedRef COLLATE NOCASE
    LIMIT @limit
  `).all(params) as Array<Record<string, unknown>>;
}

export function findParallelBibleReferenceNotes(
  db: Database.Database,
  options: {
    bookIndex: number;
    chapter: number;
    verse?: number;
    relatedBookIndex: number;
    relatedChapter: number;
    relatedVerse?: number;
    limit?: number;
  }
): Array<Record<string, unknown>> {
  const limit = Math.max(1, Math.min(options.limit ?? 50, 200));
  const targetVerseId = options.verse == null ? null : toVerseId(options.bookIndex, options.chapter, options.verse);
  const relatedVerseId = options.relatedVerse == null ? null : toVerseId(options.relatedBookIndex, options.relatedChapter, options.relatedVerse);
  const params = {
    bookIndex: options.bookIndex,
    chapter: options.chapter,
    verse: options.verse ?? null,
    targetVerseId,
    relatedBookIndex: options.relatedBookIndex,
    relatedChapter: options.relatedChapter,
    relatedVerse: options.relatedVerse ?? null,
    relatedVerseId,
    limit
  };
  const targetFilter = options.verse == null
    ? 'target.book_index = @bookIndex AND target.chapter = @chapter'
    : `
      target.book_index = @bookIndex
      AND (
        (target.chapter < @chapter OR (target.chapter = @chapter AND COALESCE(target.verse, 0) <= @verse))
        AND
        (COALESCE(target.top_chapter, target.chapter) > @chapter OR (COALESCE(target.top_chapter, target.chapter) = @chapter AND COALESCE(target.top_verse, target.verse, 999) >= @verse))
      )
    `;
  const relatedFilter = options.relatedVerse == null
    ? 'r.book_index = @relatedBookIndex AND r.chapter = @relatedChapter'
    : `
      r.book_index = @relatedBookIndex
      AND (
        (r.chapter < @relatedChapter OR (r.chapter = @relatedChapter AND COALESCE(r.verse, 0) <= @relatedVerse))
        AND
        (COALESCE(r.top_chapter, r.chapter) > @relatedChapter OR (COALESCE(r.top_chapter, r.chapter) = @relatedChapter AND COALESCE(r.top_verse, r.verse, 999) >= @relatedVerse))
      )
    `;
  const sourceVerseFilter = options.verse == null ? '' : 'AND rel.verse_id = @targetVerseId';
  const relativeVerseFilter = options.verse == null ? '' : 'AND rel.relative_verse_id = @targetVerseId';
  const relatedAsRelativeVerseFilter = options.relatedVerse == null ? '' : 'AND rel.relative_verse_id = @relatedVerseId';
  const relatedAsSourceVerseFilter = options.relatedVerse == null ? '' : 'AND rel.verse_id = @relatedVerseId';

  return db.prepare(`
    WITH matched_relations AS (
      SELECT
        rel.page_id,
        rel.verse_ref_id AS target_ref_id,
        rel.relative_verse_ref_id AS related_ref_id,
        rel.paragraph_index AS target_paragraph_index,
        rel.relative_paragraph_index AS related_paragraph_index,
        rel.relation_weight
      FROM paragraph_verse_relations rel
      JOIN paragraph_verse_refs target ON target.id = rel.verse_ref_id
      JOIN paragraph_verse_refs r ON r.id = rel.relative_verse_ref_id
      WHERE ${targetFilter}
        ${sourceVerseFilter}
        AND ${relatedFilter}
        ${relatedAsRelativeVerseFilter}

      UNION ALL

      SELECT
        rel.page_id,
        rel.relative_verse_ref_id AS target_ref_id,
        rel.verse_ref_id AS related_ref_id,
        rel.relative_paragraph_index AS target_paragraph_index,
        rel.paragraph_index AS related_paragraph_index,
        rel.relation_weight
      FROM paragraph_verse_relations rel
      JOIN paragraph_verse_refs target ON target.id = rel.relative_verse_ref_id
      JOIN paragraph_verse_refs r ON r.id = rel.verse_ref_id
      WHERE ${targetFilter}
        ${relativeVerseFilter}
        AND ${relatedFilter}
        ${relatedAsSourceVerseFilter}
    )
    SELECT
      mr.page_id AS pageId,
      p.title AS pageTitle,
      COALESCE(n.custom_display_name, p.parent_notebook_name) AS notebook,
      p.parent_section_name AS section,
      mr.target_paragraph_index AS targetParagraphIndex,
      tpp.text AS targetParagraphText,
      MIN(target.original_text) AS targetOriginalText,
      MIN(target.normalized_ref) AS targetNormalizedRef,
      mr.related_paragraph_index AS relatedParagraphIndex,
      rpp.text AS relatedParagraphText,
      MIN(related.original_text) AS relatedOriginalText,
      MIN(related.normalized_ref) AS relatedNormalizedRef,
      ROUND(SUM(mr.relation_weight), 4) AS relationWeight,
      ROUND(MAX(mr.relation_weight), 4) AS maxRelationWeight,
      COUNT(*) AS relations
    FROM matched_relations mr
    JOIN pages p ON p.id = mr.page_id
    LEFT JOIN notebooks n ON n.id = p.parent_notebook_id
    JOIN paragraph_verse_refs target ON target.id = mr.target_ref_id
    JOIN paragraph_verse_refs related ON related.id = mr.related_ref_id
    JOIN page_paragraphs tpp ON tpp.page_id = mr.page_id AND tpp.paragraph_index = mr.target_paragraph_index
    JOIN page_paragraphs rpp ON rpp.page_id = mr.page_id AND rpp.paragraph_index = mr.related_paragraph_index
    WHERE p.deleted_at IS NULL
    GROUP BY
      mr.page_id,
      mr.target_paragraph_index,
      mr.related_paragraph_index
    ORDER BY relationWeight DESC, maxRelationWeight DESC, p.last_modified_date_time DESC, p.title COLLATE NOCASE
    LIMIT @limit
  `).all(params) as Array<Record<string, unknown>>;
}
