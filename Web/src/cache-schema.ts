import Database from 'better-sqlite3';

export function migrateCacheSchema(
  db: Database.Database,
  logStartupTiming: (message: string) => void
): void {
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
      pages_seen_count INTEGER,
      pages_scan_error TEXT
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
      order_index INTEGER,
      page_level INTEGER,
      fetch_error TEXT,
      fetch_error_at TEXT,
      fetch_retry_after TEXT,
      fetch_error_count INTEGER NOT NULL DEFAULT 0,
      fetch_error_terminal INTEGER NOT NULL DEFAULT 0,
      fetch_error_source_modified_date_time TEXT
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

    CREATE TABLE IF NOT EXISTS page_access (
      page_id TEXT PRIMARY KEY,
      last_opened_at TEXT NOT NULL
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

    CREATE TABLE IF NOT EXISTS page_html_parse_state (
      page_id TEXT PRIMARY KEY,
      html_hash TEXT NOT NULL,
      module TEXT NOT NULL,
      parser_version TEXT NOT NULL,
      parsed_at TEXT NOT NULL,
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
    CREATE INDEX IF NOT EXISTS idx_page_access_last_opened ON page_access(last_opened_at DESC);
    CREATE INDEX IF NOT EXISTS idx_bible_refs_page ON paragraph_verse_refs(page_id);
    CREATE INDEX IF NOT EXISTS idx_bible_refs_page_paragraph ON paragraph_verse_refs(page_id, paragraph_index);
    CREATE INDEX IF NOT EXISTS idx_bible_refs_ref ON paragraph_verse_refs(book_index, chapter, verse, top_chapter, top_verse);
    CREATE INDEX IF NOT EXISTS idx_bible_refs_normalized ON paragraph_verse_refs(normalized_ref);
    CREATE INDEX IF NOT EXISTS idx_bible_relations_verse_ref ON paragraph_verse_relations(verse_ref_id);
    CREATE INDEX IF NOT EXISTS idx_bible_relations_relative_verse_ref ON paragraph_verse_relations(relative_verse_ref_id);
    CREATE INDEX IF NOT EXISTS idx_bible_relations_verse ON paragraph_verse_relations(verse_id);
    CREATE INDEX IF NOT EXISTS idx_bible_relations_relative ON paragraph_verse_relations(relative_verse_id);
    CREATE INDEX IF NOT EXISTS idx_bible_relations_page ON paragraph_verse_relations(page_id);
    CREATE INDEX IF NOT EXISTS idx_bible_relations_page_paragraph ON paragraph_verse_relations(page_id, paragraph_index);
    CREATE INDEX IF NOT EXISTS idx_bible_relations_page_relative_paragraph ON paragraph_verse_relations(page_id, relative_paragraph_index);
    CREATE INDEX IF NOT EXISTS idx_bible_not_found_page_paragraph ON paragraph_verse_not_found(page_id, paragraph_index);
    CREATE INDEX IF NOT EXISTS idx_page_bible_parse_state_module ON page_bible_parse_state(module, parser_version);
    CREATE INDEX IF NOT EXISTS idx_page_html_parse_state_module ON page_html_parse_state(module, parser_version);

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
  if (!pageColumns.some(column => column.name === 'page_level')) {
    db.exec('ALTER TABLE pages ADD COLUMN page_level INTEGER');
  }
  if (!pageColumns.some(column => column.name === 'fetch_error_at')) {
    db.exec('ALTER TABLE pages ADD COLUMN fetch_error_at TEXT');
  }
  if (!pageColumns.some(column => column.name === 'fetch_retry_after')) {
    db.exec('ALTER TABLE pages ADD COLUMN fetch_retry_after TEXT');
  }
  if (!pageColumns.some(column => column.name === 'fetch_error_count')) {
    db.exec('ALTER TABLE pages ADD COLUMN fetch_error_count INTEGER NOT NULL DEFAULT 0');
  }
  if (!pageColumns.some(column => column.name === 'fetch_error_terminal')) {
    db.exec('ALTER TABLE pages ADD COLUMN fetch_error_terminal INTEGER NOT NULL DEFAULT 0');
  }
  if (!pageColumns.some(column => column.name === 'fetch_error_source_modified_date_time')) {
    db.exec('ALTER TABLE pages ADD COLUMN fetch_error_source_modified_date_time TEXT');
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
  if (!sectionColumns.some(column => column.name === 'pages_scan_error')) {
    db.exec('ALTER TABLE sections ADD COLUMN pages_scan_error TEXT');
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
  logStartupTiming('migrate complete');
}
