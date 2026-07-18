import Database from 'better-sqlite3';
import { visibleBibleRefSql, visibleBibleScopeSql } from './cache-sql.js';
import type { BibleReferenceSearchResult, CacheSearchResult, NotebookRow, PageRow, SectionRow, WeightedBibleReferenceNote } from './cache-types.js';
import { toVerseId } from './cache-verse-id.js';

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
    WITH matching_refs AS (
      SELECT
        r.id,
        r.page_id,
        r.paragraph_index,
        r.normalized_ref,
        r.original_text
      FROM paragraph_verse_refs r
      JOIN pages p ON p.id = r.page_id
      LEFT JOIN sections s ON s.id = p.parent_section_id
      JOIN page_paragraphs pp ON pp.page_id = r.page_id AND pp.paragraph_index = r.paragraph_index
      WHERE ${filters.join(' AND ')}
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
  const targetVisibilityFilter = options.includeAuxiliaryRefs ? '1' : visibleBibleRefSql('target');
  const relatedVisibilityFilter = options.includeAuxiliaryRefs ? '1' : visibleBibleRefSql('r');
  const pageVisibilityFilter = options.includeAuxiliaryRefs ? '1' : visibleBibleScopeSql('p', 's');

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
        AND ${targetVisibilityFilter}
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
        AND ${targetVisibilityFilter}
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
    LEFT JOIN sections s ON s.id = p.parent_section_id
    WHERE p.deleted_at IS NULL
      AND ${relatedVisibilityFilter}
      AND ${pageVisibilityFilter}
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
    includeAuxiliaryRefs?: boolean;
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
  const targetVisibilityFilter = options.includeAuxiliaryRefs ? '1' : visibleBibleRefSql('target');
  const relatedVisibilityFilter = options.includeAuxiliaryRefs ? '1' : visibleBibleRefSql('r');
  const finalTargetVisibilityFilter = options.includeAuxiliaryRefs ? '1' : visibleBibleRefSql('target');
  const finalRelatedVisibilityFilter = options.includeAuxiliaryRefs ? '1' : visibleBibleRefSql('related');
  const pageVisibilityFilter = options.includeAuxiliaryRefs ? '1' : visibleBibleScopeSql('p', 's');

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
      FROM paragraph_verse_relations rel
      JOIN paragraph_verse_refs target ON target.id = rel.relative_verse_ref_id
      JOIN paragraph_verse_refs r ON r.id = rel.verse_ref_id
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
    LEFT JOIN sections s ON s.id = p.parent_section_id
    LEFT JOIN notebooks n ON n.id = p.parent_notebook_id
    JOIN paragraph_verse_refs target ON target.id = mr.target_ref_id
    JOIN paragraph_verse_refs related ON related.id = mr.related_ref_id
    JOIN page_paragraphs tpp ON tpp.page_id = mr.page_id AND tpp.paragraph_index = mr.target_paragraph_index
    JOIN page_paragraphs rpp ON rpp.page_id = mr.page_id AND rpp.paragraph_index = mr.related_paragraph_index
    WHERE p.deleted_at IS NULL
      AND ${finalTargetVisibilityFilter}
      AND ${finalRelatedVisibilityFilter}
      AND ${pageVisibilityFilter}
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
