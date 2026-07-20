import Database from 'better-sqlite3';
import { visibleBibleRefSql, visibleBibleScopeSql } from './cache-sql.js';
import type { BibleReferenceSearchResult, CacheSearchResult, NotebookRow, PageRow, SectionRow, WeightedBibleReferenceNote } from './cache-types.js';
import { fromVerseId, toVerseId } from './cache-verse-id.js';

export function getCachedPage(db: Database.Database, pageId: string): PageRow | undefined {
  return db.prepare('SELECT * FROM pages WHERE id = ?').get(pageId) as PageRow | undefined;
}

export function listCachedPagesForBibleParse(
  db: Database.Database,
  options: { limit?: number } = {}
): PageRow[] {
  const limit = options.limit && options.limit > 0
    ? Math.max(1, Math.floor(options.limit))
    : -1;
  return db.prepare(`
    SELECT *
    FROM pages
    WHERE deleted_at IS NULL
      AND content_text IS NOT NULL
      AND content_hash IS NOT NULL
    ORDER BY COALESCE(last_modified_date_time, content_synced_at, metadata_synced_at) DESC, id
    LIMIT ?
  `).all(limit) as PageRow[];
}

export function listCachedPagesNeedingBibleParse(
  db: Database.Database,
  options: {
    module: string;
    parserVersion: string;
    notebookIds?: readonly string[];
    limit?: number;
  }
): PageRow[] {
  const uniqueNotebookIds = options.notebookIds
    ? [...new Set(options.notebookIds.filter(Boolean))]
    : undefined;
  if (uniqueNotebookIds?.length === 0) return [];

  const notebookScope = uniqueNotebookIds
    ? `AND p.parent_notebook_id IN (${uniqueNotebookIds.map(() => '?').join(',')})`
    : '';
  const limit = options.limit && options.limit > 0
    ? Math.max(1, Math.floor(options.limit))
    : -1;

  return db.prepare(`
    SELECT p.*
    FROM pages p
    LEFT JOIN page_bible_parse_state state ON state.page_id = p.id
    WHERE p.deleted_at IS NULL
      AND p.content_text IS NOT NULL
      AND p.content_text <> ''
      AND p.content_hash IS NOT NULL
      AND (
        state.page_id IS NULL
        OR state.parse_error IS NOT NULL
        OR state.content_hash IS NOT p.content_hash
        OR state.module IS NOT ?
        OR state.parser_version IS NOT ?
      )
      ${notebookScope}
    ORDER BY
      CASE
        WHEN state.page_id IS NULL THEN 0
        WHEN state.parse_error IS NOT NULL THEN 1
        ELSE 2
      END,
      COALESCE(p.last_modified_date_time, p.content_synced_at, p.metadata_synced_at) DESC,
      p.id
    LIMIT ?
  `).all(options.module, options.parserVersion, ...(uniqueNotebookIds ?? []), limit) as PageRow[];
}

export function listCachedPagesWithFetchErrors(
  db: Database.Database,
  notebookIds?: readonly string[]
): PageRow[] {
  const uniqueNotebookIds = notebookIds ? [...new Set(notebookIds.filter(Boolean))] : undefined;
  if (uniqueNotebookIds?.length === 0) return [];
  const scope = uniqueNotebookIds
    ? `AND parent_notebook_id IN (${uniqueNotebookIds.map(() => '?').join(',')})`
    : '';
  return db.prepare(`
    SELECT *
    FROM pages
    WHERE deleted_at IS NULL
      AND fetch_error IS NOT NULL
      ${scope}
    ORDER BY COALESCE(fetch_retry_after, fetch_error_at, content_synced_at, metadata_synced_at), id
  `).all(...(uniqueNotebookIds ?? [])) as PageRow[];
}

export function listCachedPagesWithStaleSectionContent(
  db: Database.Database,
  notebookIds?: readonly string[]
): PageRow[] {
  const uniqueNotebookIds = notebookIds ? [...new Set(notebookIds.filter(Boolean))] : undefined;
  if (uniqueNotebookIds?.length === 0) return [];
  const scope = uniqueNotebookIds
    ? `AND p.parent_notebook_id IN (${uniqueNotebookIds.map(() => '?').join(',')})`
    : '';
  return db.prepare(`
    SELECT p.*
    FROM pages p
    JOIN sections s ON s.id = p.parent_section_id
    WHERE p.deleted_at IS NULL
      AND p.fetch_error IS NULL
      AND s.last_modified_date_time IS NOT NULL
      AND p.content_source_section_modified_date_time IS NOT s.last_modified_date_time
      ${scope}
    ORDER BY s.last_modified_date_time DESC, p.order_index IS NULL, p.order_index, p.id
  `).all(...(uniqueNotebookIds ?? [])) as PageRow[];
}

export function listOldestCachedPagesForContentRefresh(
  db: Database.Database,
  options: { notebookIds?: readonly string[]; limit?: number } = {}
): PageRow[] {
  const uniqueNotebookIds = options.notebookIds
    ? [...new Set(options.notebookIds.filter(Boolean))]
    : undefined;
  if (uniqueNotebookIds?.length === 0) return [];
  const scope = uniqueNotebookIds
    ? `AND parent_notebook_id IN (${uniqueNotebookIds.map(() => '?').join(',')})`
    : '';
  const limit = Math.max(1, Math.min(Math.trunc(options.limit ?? 25), 250));
  return db.prepare(`
    SELECT *
    FROM pages
    WHERE deleted_at IS NULL
      AND fetch_error IS NULL
      ${scope}
    ORDER BY content_synced_at IS NOT NULL, content_synced_at, metadata_synced_at, id
    LIMIT ?
  `).all(...(uniqueNotebookIds ?? []), limit) as PageRow[];
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
  const section = row.parent_section_id
    ? db.prepare('SELECT section_group_path FROM sections WHERE id = ?').get(row.parent_section_id) as { section_group_path: string | null } | undefined
    : undefined;
  return {
    id: row.id,
    title: row.title,
    createdDateTime: row.created_date_time,
    lastModifiedDateTime: row.last_modified_date_time,
    contentSyncedAt: row.content_synced_at,
    hasContent: row.content_text != null,
    parentNotebook: { id: row.parent_notebook_id, displayName: notebook?.custom_display_name ?? row.parent_notebook_name },
    parentSection: { id: row.parent_section_id, displayName: row.parent_section_name },
    sectionGroupPath: section?.section_group_path ?? undefined,
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
    includeAuxiliaryRefs?: boolean;
  }
): BibleReferenceSearchResult[] {
  const limit = Math.max(1, Math.min(options.limit ?? 50, 200));
  const filters = ['p.deleted_at IS NULL'];
  if (!options.includeAuxiliaryRefs) {
    filters.push(visibleBibleRefSql('r', 'pp'));
    filters.push(visibleBibleScopeSql('p', 's'));
  }
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

  if (!options.normalized?.trim() && options.bookIndex == null && options.chapter == null) {
    throw new Error('Specify normalized or bookIndex/chapter.');
  }

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
    LEFT JOIN sections s ON s.id = p.parent_section_id
    JOIN page_paragraphs pp ON pp.page_id = r.page_id AND pp.paragraph_index = r.paragraph_index
    LEFT JOIN notebooks n ON n.id = p.parent_notebook_id
    WHERE ${filters.join(' AND ')}
    ORDER BY p.last_modified_date_time DESC, r.page_id, r.paragraph_index, r.start_index
    LIMIT @limit
  `).all(params) as BibleReferenceSearchResult[];
}

export function searchBibleReferenceNotesByWeight(
  db: Database.Database,
  options: {
    bookIndex: number;
    chapter: number;
    verse: number;
    topChapter?: number;
    topVerse?: number;
    notebookIds?: string[];
    limit?: number;
    includeAuxiliaryRefs?: boolean;
    orderByWeight?: boolean;
  }
): WeightedBibleReferenceNote[] {
  const limit = Math.max(1, Math.min(options.limit ?? 100, 200));
  const topChapter = options.topChapter ?? options.chapter;
  const topVerse = options.topVerse ?? options.verse;
  const targetVerseId = toVerseId(options.bookIndex, options.chapter, options.verse);
  if (targetVerseId == null) throw new Error('bookIndex, chapter, and verse must identify a verse.');

  const filters = [
    'p.deleted_at IS NULL',
    'r.book_index = @bookIndex',
    'r.chapter = @chapter',
    'COALESCE(r.verse, 0) = @verse',
    'COALESCE(r.top_chapter, r.chapter) = @topChapter',
    'COALESCE(r.top_verse, r.verse, 0) = @topVerse'
  ];
  if (!options.includeAuxiliaryRefs) {
    filters.push(visibleBibleRefSql('r', 'pp'));
    filters.push(visibleBibleScopeSql('p', 's'));
  }

  const params: Record<string, unknown> = {
    bookIndex: options.bookIndex,
    chapter: options.chapter,
    verse: options.verse,
    topChapter,
    topVerse,
    targetVerseId,
    limit
  };
  const notebookIds = [...new Set(options.notebookIds?.filter(Boolean) ?? [])];
  if (notebookIds.length > 0) {
    const placeholders = notebookIds.map((notebookId, index) => {
      const key = `notebookId${index}`;
      params[key] = notebookId;
      return `@${key}`;
    });
    filters.push(`p.parent_notebook_id IN (${placeholders.join(', ')})`);
  }

  const orderBy = options.orderByWeight
    ? 'bibleWeight DESC, p.last_modified_date_time DESC, p.title COLLATE NOCASE'
    : 'p.last_modified_date_time DESC, p.title COLLATE NOCASE';
  const rows = db.prepare(`
    WITH candidate_refs AS (
      SELECT
        r.id,
        r.page_id,
        r.paragraph_index,
        r.normalized_ref,
        r.original_text,
        pp.text AS paragraph_text,
        p.title AS page_title
      FROM paragraph_verse_refs r
      JOIN pages p ON p.id = r.page_id
      LEFT JOIN sections s ON s.id = p.parent_section_id
      JOIN page_paragraphs pp ON pp.page_id = r.page_id AND pp.paragraph_index = r.paragraph_index
      WHERE ${filters.join(' AND ')}
    ), matching_refs AS (
      SELECT id, page_id, paragraph_index, normalized_ref, original_text
      FROM (
        SELECT
          candidate_refs.*,
          ROW_NUMBER() OVER (
            PARTITION BY page_id,
              CASE
                WHEN TRIM(paragraph_text) = TRIM(page_title) THEN 'title'
                ELSE 'ref:' || id
              END
            ORDER BY paragraph_index, id
          ) AS occurrence_rank
        FROM candidate_refs
      )
      WHERE occurrence_rank = 1
    ), relation_weights AS (
      SELECT rel.verse_ref_id AS ref_id, SUM(rel.relation_weight) AS relation_weight
      FROM paragraph_verse_relations rel
      JOIN matching_refs mr ON mr.id = rel.verse_ref_id
      WHERE rel.verse_id = @targetVerseId
      GROUP BY rel.verse_ref_id

      UNION ALL

      SELECT rel.relative_verse_ref_id AS ref_id, SUM(rel.relation_weight) AS relation_weight
      FROM paragraph_verse_relations rel
      JOIN matching_refs mr ON mr.id = rel.relative_verse_ref_id
      WHERE rel.relative_verse_id = @targetVerseId
      GROUP BY rel.relative_verse_ref_id
    ), combined_weights AS (
      SELECT ref_id, SUM(relation_weight) AS relation_weight
      FROM relation_weights
      GROUP BY ref_id
    )
    SELECT
      mr.page_id AS id,
      p.title,
      p.parent_notebook_id,
      COALESCE(n.custom_display_name, p.parent_notebook_name) AS parent_notebook_name,
      p.parent_section_name,
      MIN(mr.paragraph_index) AS paragraphIndex,
      GROUP_CONCAT(DISTINCT mr.paragraph_index) AS paragraphIndexes,
      MIN(pp.text) AS snippet,
      MIN(COALESCE(mr.normalized_ref, mr.original_text)) AS bibleRef,
      0 AS bibleMatchScore,
      ROUND(SUM(1.0 / (1.0 + COALESCE(cw.relation_weight, 0))), 4) AS bibleWeight
    FROM matching_refs mr
    JOIN pages p ON p.id = mr.page_id
    LEFT JOIN notebooks n ON n.id = p.parent_notebook_id
    JOIN page_paragraphs pp ON pp.page_id = mr.page_id AND pp.paragraph_index = mr.paragraph_index
    LEFT JOIN combined_weights cw ON cw.ref_id = mr.id
    GROUP BY mr.page_id
    ORDER BY ${orderBy}
    LIMIT @limit
  `).all(params) as Array<Omit<WeightedBibleReferenceNote, 'paragraphIndexes'> & { paragraphIndexes: string | null }>;

  return rows.map(row => ({
    ...row,
    paragraphIndexes: String(row.paragraphIndexes ?? '')
      .split(',')
      .map(value => Number(value))
      .filter(Number.isInteger)
      .sort((left, right) => left - right)
  }));
}

export function findParallelBibleReferences(
  db: Database.Database,
  options: {
    bookIndex: number;
    chapter: number;
    verse?: number;
    limit?: number;
    includeAuxiliaryRefs?: boolean;
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
  const excludeTargetFilter = options.verse == null
    ? `NOT (${relatedFilter})`
    : 'mr.related_verse_id <> @targetVerseId';
  const targetVisibilityFilter = options.includeAuxiliaryRefs ? '1' : visibleBibleRefSql('target');
  const relatedVisibilityFilter = options.includeAuxiliaryRefs ? '1' : visibleBibleRefSql('r');
  const pageVisibilityFilter = options.includeAuxiliaryRefs ? '1' : visibleBibleScopeSql('p', 's');

  const rows = db.prepare(`
    WITH relation_ref_verses AS (
      SELECT verse_ref_id AS ref_id, verse_id
      FROM paragraph_verse_relations
      UNION
      SELECT relative_verse_ref_id AS ref_id, relative_verse_id AS verse_id
      FROM paragraph_verse_relations
    ), relation_ref_verse_counts AS (
      SELECT ref_id, COUNT(DISTINCT verse_id) AS verse_count
      FROM relation_ref_verses
      GROUP BY ref_id
    ), matched_relations AS (
      SELECT
        rel.relative_verse_ref_id AS ref_id,
        rel.relative_verse_id AS related_verse_id,
        rel.page_id,
        rel.relative_paragraph_index AS paragraph_index,
        rel.relation_weight
          / CASE
              WHEN COALESCE(target.top_chapter, target.chapter) = target.chapter
                AND target.verse IS NOT NULL
                AND COALESCE(target.top_verse, target.verse) >= target.verse
                THEN COALESCE(target.top_verse, target.verse) - target.verse + 1
              ELSE MAX(1, COALESCE(target_counts.verse_count, 1))
            END
          / CASE
              WHEN COALESCE(r.top_chapter, r.chapter) = r.chapter
                AND r.verse IS NOT NULL
                AND COALESCE(r.top_verse, r.verse) >= r.verse
                THEN COALESCE(r.top_verse, r.verse) - r.verse + 1
              ELSE MAX(1, COALESCE(related_counts.verse_count, 1))
            END AS relation_weight
      FROM paragraph_verse_relations rel
      JOIN paragraph_verse_refs target ON target.id = rel.verse_ref_id
      JOIN paragraph_verse_refs r ON r.id = rel.relative_verse_ref_id
      LEFT JOIN relation_ref_verse_counts target_counts ON target_counts.ref_id = target.id
      LEFT JOIN relation_ref_verse_counts related_counts ON related_counts.ref_id = r.id
      WHERE ${targetFilter}
        AND ${targetVisibilityFilter}
        ${sourceVerseFilter}

      UNION ALL

      SELECT
        rel.verse_ref_id AS ref_id,
        rel.verse_id AS related_verse_id,
        rel.page_id,
        rel.paragraph_index AS paragraph_index,
        rel.relation_weight
          / CASE
              WHEN COALESCE(target.top_chapter, target.chapter) = target.chapter
                AND target.verse IS NOT NULL
                AND COALESCE(target.top_verse, target.verse) >= target.verse
                THEN COALESCE(target.top_verse, target.verse) - target.verse + 1
              ELSE MAX(1, COALESCE(target_counts.verse_count, 1))
            END
          / CASE
              WHEN COALESCE(r.top_chapter, r.chapter) = r.chapter
                AND r.verse IS NOT NULL
                AND COALESCE(r.top_verse, r.verse) >= r.verse
                THEN COALESCE(r.top_verse, r.verse) - r.verse + 1
              ELSE MAX(1, COALESCE(related_counts.verse_count, 1))
            END AS relation_weight
      FROM paragraph_verse_relations rel
      JOIN paragraph_verse_refs target ON target.id = rel.relative_verse_ref_id
      JOIN paragraph_verse_refs r ON r.id = rel.verse_ref_id
      LEFT JOIN relation_ref_verse_counts target_counts ON target_counts.ref_id = target.id
      LEFT JOIN relation_ref_verse_counts related_counts ON related_counts.ref_id = r.id
      WHERE ${targetFilter}
        AND ${targetVisibilityFilter}
        ${relativeVerseFilter}
    ), page_evidence AS (
      SELECT
        mr.related_verse_id,
        mr.page_id,
        MIN(r.book_name) AS book_name,
        MIN(r.original_text) AS sample_original_text,
        SUM(mr.relation_weight) AS page_weight,
        COUNT(*) AS relations,
        COUNT(DISTINCT mr.paragraph_index) AS paragraphs
      FROM matched_relations mr
      JOIN paragraph_verse_refs r ON r.id = mr.ref_id
      JOIN pages p ON p.id = mr.page_id
      LEFT JOIN sections s ON s.id = p.parent_section_id
      WHERE p.deleted_at IS NULL
        AND ${relatedVisibilityFilter}
        AND ${pageVisibilityFilter}
        AND ${excludeTargetFilter}
      GROUP BY mr.related_verse_id, mr.page_id
    )
    SELECT
      pe.related_verse_id AS relatedVerseId,
      MIN(pe.book_name) AS bookName,
      ROUND(SUM(pe.page_weight), 4) AS relationWeight,
      ROUND(MAX(pe.page_weight), 4) AS maxRelationWeight,
      SUM(pe.relations) AS relations,
      COUNT(*) AS pages,
      SUM(pe.paragraphs) AS paragraphs,
      MIN(pe.sample_original_text) AS sampleOriginalText,
      GROUP_CONCAT(pe.page_id, char(31)) AS commonNotePageIds
    FROM page_evidence pe
    GROUP BY pe.related_verse_id
    ORDER BY relationWeight DESC, maxRelationWeight DESC, pages DESC, relatedVerseId
    LIMIT @limit
  `).all(params) as Array<Record<string, unknown>>;

  return rows.map(row => {
    const location = fromVerseId(Number(row.relatedVerseId));
    if (!location) return row;
    const normalizedRef = `${row.bookName || row.sampleOriginalText || ''} ${location.chapter}:${location.verse}`.trim();
    const commonNotePageIds = String(row.commonNotePageIds || '')
      .split('\u001f')
      .filter(Boolean)
      .sort();
    return {
      ...row,
      commonNotePageIds,
      normalizedRef,
      bookIndex:location.bookIndex,
      chapter:location.chapter,
      verse:location.verse,
      topChapter:location.chapter,
      topVerse:location.verse
    };
  });
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
    notebookIds?: string[];
    limit?: number;
    includeAuxiliaryRefs?: boolean;
  }
): Array<Record<string, unknown>> {
  const limit = Math.max(1, Math.min(options.limit ?? 50, 200));
  const targetVerseId = options.verse == null ? null : toVerseId(options.bookIndex, options.chapter, options.verse);
  const relatedVerseId = options.relatedVerse == null ? null : toVerseId(options.relatedBookIndex, options.relatedChapter, options.relatedVerse);
  const params: Record<string, unknown> = {
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
  const targetVisibilityFilter = options.includeAuxiliaryRefs ? '1' : visibleBibleRefSql('target');
  const relatedVisibilityFilter = options.includeAuxiliaryRefs ? '1' : visibleBibleRefSql('r');
  const finalTargetVisibilityFilter = options.includeAuxiliaryRefs ? '1' : visibleBibleRefSql('target');
  const finalRelatedVisibilityFilter = options.includeAuxiliaryRefs ? '1' : visibleBibleRefSql('related');
  const allRefVisibilityFilter = options.includeAuxiliaryRefs ? '1' : visibleBibleRefSql('all_ref', 'all_pp');
  const pageVisibilityFilter = options.includeAuxiliaryRefs ? '1' : visibleBibleScopeSql('p', 's');
  const allPairFilter = `
    (
      all_ref.book_index = @bookIndex
      AND (all_ref.chapter < @chapter OR (all_ref.chapter = @chapter AND COALESCE(all_ref.verse, 0) <= @verse))
      AND (
        COALESCE(all_ref.top_chapter, all_ref.chapter) > @chapter
        OR (COALESCE(all_ref.top_chapter, all_ref.chapter) = @chapter AND COALESCE(all_ref.top_verse, all_ref.verse, 999) >= @verse)
      )
    )
    OR
    (
      all_ref.book_index = @relatedBookIndex
      AND (all_ref.chapter < @relatedChapter OR (all_ref.chapter = @relatedChapter AND COALESCE(all_ref.verse, 0) <= @relatedVerse))
      AND (
        COALESCE(all_ref.top_chapter, all_ref.chapter) > @relatedChapter
        OR (COALESCE(all_ref.top_chapter, all_ref.chapter) = @relatedChapter AND COALESCE(all_ref.top_verse, all_ref.verse, 999) >= @relatedVerse)
      )
    )
  `;
  const pageFilters = [
    'p.deleted_at IS NULL',
    finalTargetVisibilityFilter,
    finalRelatedVisibilityFilter,
    pageVisibilityFilter
  ];
  const notebookIds = [...new Set(options.notebookIds?.filter(Boolean) ?? [])];
  if (notebookIds.length > 0) {
    const placeholders = notebookIds.map((notebookId, index) => {
      const key = `notebookId${index}`;
      params[key] = notebookId;
      return `@${key}`;
    });
    pageFilters.push(`p.parent_notebook_id IN (${placeholders.join(', ')})`);
  }

  return db.prepare(`
    WITH relation_ref_verses AS (
      SELECT verse_ref_id AS ref_id, verse_id
      FROM paragraph_verse_relations
      UNION
      SELECT relative_verse_ref_id AS ref_id, relative_verse_id AS verse_id
      FROM paragraph_verse_relations
    ), relation_ref_verse_counts AS (
      SELECT ref_id, COUNT(DISTINCT verse_id) AS verse_count
      FROM relation_ref_verses
      GROUP BY ref_id
    ), matched_relations AS (
      SELECT
        rel.page_id,
        rel.verse_ref_id AS target_ref_id,
        rel.relative_verse_ref_id AS related_ref_id,
        rel.paragraph_index AS target_paragraph_index,
        rel.relative_paragraph_index AS related_paragraph_index,
        rel.relation_weight
          / CASE
              WHEN COALESCE(target.top_chapter, target.chapter) = target.chapter
                AND target.verse IS NOT NULL
                AND COALESCE(target.top_verse, target.verse) >= target.verse
                THEN COALESCE(target.top_verse, target.verse) - target.verse + 1
              ELSE MAX(1, COALESCE(target_counts.verse_count, 1))
            END
          / CASE
              WHEN COALESCE(r.top_chapter, r.chapter) = r.chapter
                AND r.verse IS NOT NULL
                AND COALESCE(r.top_verse, r.verse) >= r.verse
                THEN COALESCE(r.top_verse, r.verse) - r.verse + 1
              ELSE MAX(1, COALESCE(related_counts.verse_count, 1))
            END AS relation_weight
      FROM paragraph_verse_relations rel
      JOIN paragraph_verse_refs target ON target.id = rel.verse_ref_id
      JOIN paragraph_verse_refs r ON r.id = rel.relative_verse_ref_id
      LEFT JOIN relation_ref_verse_counts target_counts ON target_counts.ref_id = target.id
      LEFT JOIN relation_ref_verse_counts related_counts ON related_counts.ref_id = r.id
      WHERE ${targetFilter}
        AND ${targetVisibilityFilter}
        ${sourceVerseFilter}
        AND ${relatedFilter}
        AND ${relatedVisibilityFilter}
        ${relatedAsRelativeVerseFilter}

      UNION ALL

      SELECT
        rel.page_id,
        rel.relative_verse_ref_id AS target_ref_id,
        rel.verse_ref_id AS related_ref_id,
        rel.relative_paragraph_index AS target_paragraph_index,
        rel.paragraph_index AS related_paragraph_index,
        rel.relation_weight
          / CASE
              WHEN COALESCE(target.top_chapter, target.chapter) = target.chapter
                AND target.verse IS NOT NULL
                AND COALESCE(target.top_verse, target.verse) >= target.verse
                THEN COALESCE(target.top_verse, target.verse) - target.verse + 1
              ELSE MAX(1, COALESCE(target_counts.verse_count, 1))
            END
          / CASE
              WHEN COALESCE(r.top_chapter, r.chapter) = r.chapter
                AND r.verse IS NOT NULL
                AND COALESCE(r.top_verse, r.verse) >= r.verse
                THEN COALESCE(r.top_verse, r.verse) - r.verse + 1
              ELSE MAX(1, COALESCE(related_counts.verse_count, 1))
            END AS relation_weight
      FROM paragraph_verse_relations rel
      JOIN paragraph_verse_refs target ON target.id = rel.relative_verse_ref_id
      JOIN paragraph_verse_refs r ON r.id = rel.verse_ref_id
      LEFT JOIN relation_ref_verse_counts target_counts ON target_counts.ref_id = target.id
      LEFT JOIN relation_ref_verse_counts related_counts ON related_counts.ref_id = r.id
      WHERE ${targetFilter}
        AND ${targetVisibilityFilter}
        ${relativeVerseFilter}
        AND ${relatedFilter}
        AND ${relatedVisibilityFilter}
        ${relatedAsSourceVerseFilter}
    )
    SELECT
      mr.page_id AS pageId,
      p.title AS pageTitle,
      p.parent_notebook_id AS parentNotebookId,
      COALESCE(n.custom_display_name, p.parent_notebook_name) AS notebook,
      p.parent_section_name AS section,
      mr.target_paragraph_index AS targetParagraphIndex,
      tpp.text AS targetParagraphText,
      MIN(target.original_text) AS targetOriginalText,
      MIN(target.normalized_ref) AS targetNormalizedRef,
      mr.related_paragraph_index AS relatedParagraphIndex,
      rpp.text AS relatedParagraphText,
      (
        SELECT GROUP_CONCAT(DISTINCT all_ref.paragraph_index)
        FROM paragraph_verse_refs all_ref
        JOIN page_paragraphs all_pp ON all_pp.page_id = all_ref.page_id AND all_pp.paragraph_index = all_ref.paragraph_index
        WHERE all_ref.page_id = mr.page_id
          AND (${allPairFilter})
          AND ${allRefVisibilityFilter}
      ) AS pairParagraphIndexes,
      MIN(related.original_text) AS relatedOriginalText,
      MIN(related.normalized_ref) AS relatedNormalizedRef,
      ROUND(SUM(mr.relation_weight), 4) AS relationWeight,
      ROUND(MAX(mr.relation_weight), 4) AS maxRelationWeight,
      COUNT(*) AS relations
    FROM matched_relations mr
    JOIN pages p ON p.id = mr.page_id
    LEFT JOIN sections s ON s.id = p.parent_section_id
    LEFT JOIN notebooks n ON n.id = p.parent_notebook_id
    JOIN paragraph_verse_refs target ON target.id = mr.target_ref_id
    JOIN paragraph_verse_refs related ON related.id = mr.related_ref_id
    JOIN page_paragraphs tpp ON tpp.page_id = mr.page_id AND tpp.paragraph_index = mr.target_paragraph_index
    JOIN page_paragraphs rpp ON rpp.page_id = mr.page_id AND rpp.paragraph_index = mr.related_paragraph_index
    WHERE ${pageFilters.join('\n      AND ')}
    GROUP BY
      mr.page_id,
      mr.target_paragraph_index,
      mr.related_paragraph_index
    ORDER BY relationWeight DESC, maxRelationWeight DESC, p.last_modified_date_time DESC, p.title COLLATE NOCASE
    LIMIT @limit
  `).all(params) as Array<Record<string, unknown>>;
}

export function searchCacheAdvanced(
  db: Database.Database,
  query: string,
  options: { mode: 'and' | 'phrase' | 'regex'; caseSensitive: boolean; notebookIds: string[]; limit: number }
): Array<Record<string, unknown>> {
  if (!query) throw new Error('Search query is empty.');
  let regex: RegExp | undefined;
  let terms: string[] = [];
  if (options.mode === 'regex') {
    try {
      regex = new RegExp(query, 'u' + (options.caseSensitive ? '' : 'i'));
    } catch (error: any) {
      throw new Error(`Некорректное регулярное выражение: ${error?.message ?? String(error)}`);
    }
  } else if (options.mode === 'and') {
    terms = query.match(/[\p{L}\p{N}_-]+/gu) ?? [];
    if (terms.length === 0) terms = [query];
  }

  const filters = ['p.deleted_at IS NULL'];
  const params: Record<string, unknown> = {};
  if (options.notebookIds.length > 0) {
    const placeholders = options.notebookIds.map((_, index) => `@notebookId${index}`);
    filters.push(`p.parent_notebook_id IN (${placeholders.join(', ')})`);
    options.notebookIds.forEach((id, index) => { params[`notebookId${index}`] = id; });
  }
  const rows = db.prepare(`
    SELECT
      p.id, p.title, p.content_text AS contentText,
      p.parent_notebook_id AS parentNotebookId,
      COALESCE(n.custom_display_name, p.parent_notebook_name) AS notebook,
      p.parent_section_name AS section,
      p.last_modified_date_time AS lastModifiedDateTime,
      p.content_synced_at AS contentSyncedAt
    FROM pages p
    LEFT JOIN notebooks n ON n.id = p.parent_notebook_id
    WHERE ${filters.join(' AND ')}
  `).all(params) as Array<Record<string, any>>;

  const needle = options.caseSensitive ? query : query.toLocaleLowerCase();
  const normalizedTerms = options.caseSensitive ? terms : terms.map(term => term.toLocaleLowerCase());
  const results: Array<Record<string, unknown>> = [];
  for (const row of rows) {
    const haystack = `${row.title ?? ''}\n${row.contentText ?? ''}`;
    const comparable = options.caseSensitive ? haystack : haystack.toLocaleLowerCase();
    let matchIndex = -1;
    if (regex) {
      const match = regex.exec(haystack);
      regex.lastIndex = 0;
      matchIndex = match?.index ?? -1;
    } else if (options.mode === 'phrase') {
      matchIndex = comparable.indexOf(needle);
    } else if (normalizedTerms.every(term => comparable.includes(term))) {
      matchIndex = comparable.indexOf(normalizedTerms[0] ?? '');
    }
    if (matchIndex < 0) continue;
    const start = Math.max(0, matchIndex - 45);
    const end = Math.min(haystack.length, matchIndex + Math.max(query.length, 12) + 75);
    results.push({
      id:row.id,
      title:row.title,
      parent_notebook_id:row.parentNotebookId,
      parent_notebook_name:row.notebook,
      parent_section_name:row.section,
      last_modified_date_time:row.lastModifiedDateTime,
      content_synced_at:row.contentSyncedAt,
      snippet:(start > 0 ? '…' : '') + haystack.slice(start, end).replace(/\s+/g, ' ') + (end < haystack.length ? '…' : ''),
      score:matchIndex
    });
    if (results.length >= options.limit) break;
  }
  return results;
}
