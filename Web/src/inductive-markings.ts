import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

export type InductiveStyle = {
  id: string;
  name: string;
  category: string;
  symbol: string;
  color: string;
  backgroundColor: string;
  decoration: string;
  builtIn: boolean;
  sortOrder: number;
};

export type InductiveAnnotationInput = {
  module: string;
  bookIndex: number;
  chapter: number;
  verse: number;
  startOffset: number;
  endOffset: number;
  quote: string;
  prefix?: string;
  suffix?: string;
  textHash?: string;
  styleId: string;
  note?: string;
};

export type InductiveRelationType = 'contrast' | 'comparison' | 'cause' | 'conclusion';

export type InductiveRelationEndpointInput = {
  verse: number;
  startOffset: number;
  endOffset: number;
  quote: string;
  prefix?: string;
  suffix?: string;
  textHash?: string;
};

export type InductiveRelationInput = {
  module: string;
  bookIndex: number;
  chapter: number;
  source: InductiveRelationEndpointInput;
  target: InductiveRelationEndpointInput;
  type: InductiveRelationType;
  note?: string;
};

export type LegacyInductiveRelationInput = {
  sourceAnnotationId: string;
  targetAnnotationId: string;
  type: InductiveRelationType | 'repetition';
  note?: string;
};

export type InductiveImportPayload = {
  location: { module: string; bookIndex: number; chapter: number };
  styles: InductiveStyle[];
  annotations: Array<InductiveAnnotationInput & { id: string }>;
  relations: Array<(InductiveRelationInput | LegacyInductiveRelationInput) & { id: string }>;
};

const defaultStyles: Array<Omit<InductiveStyle, 'builtIn'>> = [
  { id:'keyword', name:'Ключевое слово', category:'keyword', symbol:'◆', color:'#6d5200', backgroundColor:'#f6df88', decoration:'highlight', sortOrder:10 },
  { id:'god', name:'Бог', category:'keyword', symbol:'△', color:'#6d3fa0', backgroundColor:'#eee3fa', decoration:'box', sortOrder:20 },
  { id:'christ', name:'Христос', category:'keyword', symbol:'✚', color:'#b63232', backgroundColor:'#fae5e2', decoration:'box', sortOrder:30 },
  { id:'spirit', name:'Святой Дух', category:'keyword', symbol:'◇', color:'#236aa1', backgroundColor:'#dfeefa', decoration:'box', sortOrder:40 },
  { id:'time', name:'Время', category:'observation', symbol:'◷', color:'#277649', backgroundColor:'#e1f2e7', decoration:'highlight', sortOrder:50 },
  { id:'place', name:'Место', category:'observation', symbol:'⌖', color:'#277649', backgroundColor:'#ffffff', decoration:'double', sortOrder:60 },
  { id:'contrast', name:'Контраст', category:'structure', symbol:'↔', color:'#b34737', backgroundColor:'#f9e7e2', decoration:'wavy', sortOrder:70 },
  { id:'comparison', name:'Сравнение', category:'structure', symbol:'≈', color:'#2f639b', backgroundColor:'#e4eef8', decoration:'dashed', sortOrder:80 },
  { id:'conclusion', name:'Вывод', category:'structure', symbol:'∴', color:'#7041a0', backgroundColor:'#eee5f8', decoration:'double', sortOrder:90 },
  { id:'command', name:'Повеление', category:'structure', symbol:'!', color:'#a75a13', backgroundColor:'#f8ead8', decoration:'box', sortOrder:100 }
];

export function inductiveDbPath(cacheDbPath: string): string {
  return path.join(path.dirname(cacheDbPath), 'biblenote-user.sqlite');
}

export function openInductiveDb(cacheDbPath: string): Database.Database {
  const dbPath = inductiveDbPath(cacheDbPath);
  fs.mkdirSync(path.dirname(dbPath), { recursive:true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS inductive_styles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      symbol TEXT NOT NULL,
      color TEXT NOT NULL,
      background_color TEXT NOT NULL,
      decoration TEXT NOT NULL,
      is_builtin INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS inductive_annotations (
      id TEXT PRIMARY KEY,
      module TEXT NOT NULL,
      book_index INTEGER NOT NULL,
      chapter INTEGER NOT NULL,
      verse INTEGER NOT NULL,
      start_offset INTEGER NOT NULL,
      end_offset INTEGER NOT NULL,
      quote TEXT NOT NULL,
      prefix TEXT,
      suffix TEXT,
      text_hash TEXT,
      style_id TEXT NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(style_id) REFERENCES inductive_styles(id) ON DELETE RESTRICT,
      CHECK(start_offset >= 0),
      CHECK(end_offset > start_offset)
    );

    CREATE TABLE IF NOT EXISTS inductive_relations (
      id TEXT PRIMARY KEY,
      module TEXT NOT NULL,
      book_index INTEGER NOT NULL,
      chapter INTEGER NOT NULL,
      source_annotation_id TEXT NOT NULL,
      target_annotation_id TEXT NOT NULL,
      relation_type TEXT NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(source_annotation_id) REFERENCES inductive_annotations(id) ON DELETE CASCADE,
      FOREIGN KEY(target_annotation_id) REFERENCES inductive_annotations(id) ON DELETE CASCADE,
      CHECK(source_annotation_id <> target_annotation_id),
      UNIQUE(source_annotation_id, target_annotation_id, relation_type)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_inductive_annotation_unique
      ON inductive_annotations(module, book_index, chapter, verse, start_offset, end_offset, style_id);
    CREATE INDEX IF NOT EXISTS idx_inductive_annotation_chapter
      ON inductive_annotations(module, book_index, chapter, verse, start_offset);
    CREATE INDEX IF NOT EXISTS idx_inductive_annotation_style
      ON inductive_annotations(style_id, module, book_index, chapter);
    CREATE INDEX IF NOT EXISTS idx_inductive_relation_chapter
      ON inductive_relations(module, book_index, chapter);

    CREATE TABLE IF NOT EXISTS inductive_text_relations (
      id TEXT PRIMARY KEY,
      module TEXT NOT NULL,
      book_index INTEGER NOT NULL,
      chapter INTEGER NOT NULL,
      relation_type TEXT NOT NULL,
      note TEXT,
      source_verse INTEGER NOT NULL,
      source_start_offset INTEGER NOT NULL,
      source_end_offset INTEGER NOT NULL,
      source_quote TEXT NOT NULL,
      source_prefix TEXT,
      source_suffix TEXT,
      source_text_hash TEXT,
      target_verse INTEGER NOT NULL,
      target_start_offset INTEGER NOT NULL,
      target_end_offset INTEGER NOT NULL,
      target_quote TEXT NOT NULL,
      target_prefix TEXT,
      target_suffix TEXT,
      target_text_hash TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      CHECK(relation_type IN ('contrast', 'comparison', 'cause', 'conclusion')),
      CHECK(source_start_offset >= 0 AND source_end_offset > source_start_offset),
      CHECK(target_start_offset >= 0 AND target_end_offset > target_start_offset),
      UNIQUE(
        module, book_index, chapter, relation_type,
        source_verse, source_start_offset, source_end_offset,
        target_verse, target_start_offset, target_end_offset
      )
    );
    CREATE INDEX IF NOT EXISTS idx_inductive_text_relation_chapter
      ON inductive_text_relations(module, book_index, chapter, source_verse, target_verse);
  `);

  db.exec(`
    INSERT INTO inductive_text_relations(
      id, module, book_index, chapter, relation_type, note,
      source_verse, source_start_offset, source_end_offset, source_quote,
      source_prefix, source_suffix, source_text_hash,
      target_verse, target_start_offset, target_end_offset, target_quote,
      target_prefix, target_suffix, target_text_hash,
      created_at, updated_at
    )
    SELECT
      r.id, r.module, r.book_index, r.chapter, r.relation_type, r.note,
      source.verse, source.start_offset, source.end_offset, source.quote,
      source.prefix, source.suffix, source.text_hash,
      target.verse, target.start_offset, target.end_offset, target.quote,
      target.prefix, target.suffix, target.text_hash,
      r.created_at, r.updated_at
    FROM inductive_relations r
    JOIN inductive_annotations source ON source.id = r.source_annotation_id
    JOIN inductive_annotations target ON target.id = r.target_annotation_id
    WHERE r.relation_type IN ('contrast', 'comparison', 'cause', 'conclusion')
    ON CONFLICT DO NOTHING;
  `);

  const now = new Date().toISOString();
  const seed = db.prepare(`
    INSERT INTO inductive_styles(
      id, name, category, symbol, color, background_color, decoration,
      is_builtin, sort_order, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
    ON CONFLICT(id) DO NOTHING
  `);
  const seedDefaults = db.transaction(() => {
    for (const style of defaultStyles) {
      seed.run(
        style.id,
        style.name,
        style.category,
        style.symbol,
        style.color,
        style.backgroundColor,
        style.decoration,
        style.sortOrder,
        now,
        now
      );
    }
  });
  seedDefaults();
  return db;
}

function styleRow(row: any): InductiveStyle {
  return {
    id:row.id,
    name:row.name,
    category:row.category,
    symbol:row.symbol,
    color:row.color,
    backgroundColor:row.backgroundColor,
    decoration:row.decoration,
    builtIn:Boolean(row.builtIn),
    sortOrder:Number(row.sortOrder)
  };
}

export function listInductiveStyles(db: Database.Database): InductiveStyle[] {
  return (db.prepare(`
    SELECT
      id,
      name,
      category,
      symbol,
      color,
      background_color AS backgroundColor,
      decoration,
      is_builtin AS builtIn,
      sort_order AS sortOrder
    FROM inductive_styles
    ORDER BY sort_order, name COLLATE NOCASE
  `).all() as any[]).map(styleRow);
}

export function createInductiveStyle(
  db: Database.Database,
  input: Pick<InductiveStyle, 'name' | 'symbol' | 'color' | 'backgroundColor' | 'decoration'>
): InductiveStyle {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const nextOrder = Number((db.prepare('SELECT COALESCE(MAX(sort_order), 100) + 10 AS value FROM inductive_styles').get() as any)?.value ?? 110);
  db.prepare(`
    INSERT INTO inductive_styles(
      id, name, category, symbol, color, background_color, decoration,
      is_builtin, sort_order, created_at, updated_at
    ) VALUES (?, ?, 'keyword', ?, ?, ?, ?, 0, ?, ?, ?)
  `).run(id, input.name, input.symbol, input.color, input.backgroundColor, input.decoration, nextOrder, now, now);
  const row = db.prepare(`
    SELECT id, name, category, symbol, color, background_color AS backgroundColor,
      decoration, is_builtin AS builtIn, sort_order AS sortOrder
    FROM inductive_styles WHERE id = ?
  `).get(id);
  return styleRow(row);
}

export function updateInductiveStyle(
  db: Database.Database,
  id: string,
  input: Pick<InductiveStyle, 'name' | 'symbol' | 'color' | 'backgroundColor' | 'decoration'>
): InductiveStyle | undefined {
  const result = db.prepare(`
    UPDATE inductive_styles
    SET name = ?, symbol = ?, color = ?, background_color = ?, decoration = ?, updated_at = ?
    WHERE id = ?
  `).run(
    input.name,
    input.symbol,
    input.color,
    input.backgroundColor,
    input.decoration,
    new Date().toISOString(),
    id
  );
  if (result.changes === 0) return undefined;
  const row = db.prepare(`
    SELECT id, name, category, symbol, color, background_color AS backgroundColor,
      decoration, is_builtin AS builtIn, sort_order AS sortOrder
    FROM inductive_styles WHERE id = ?
  `).get(id);
  return styleRow(row);
}

function annotationSelect(): string {
  return `
    SELECT
      a.id,
      a.module,
      a.book_index AS bookIndex,
      a.chapter,
      a.verse,
      a.start_offset AS startOffset,
      a.end_offset AS endOffset,
      a.quote,
      a.prefix,
      a.suffix,
      a.text_hash AS textHash,
      a.style_id AS styleId,
      a.note,
      a.created_at AS createdAt,
      a.updated_at AS updatedAt,
      s.name AS styleName,
      s.category AS styleCategory,
      s.symbol AS styleSymbol,
      s.color AS styleColor,
      s.background_color AS styleBackgroundColor,
      s.decoration AS styleDecoration
    FROM inductive_annotations a
    JOIN inductive_styles s ON s.id = a.style_id
  `;
}

export function listInductiveAnnotations(
  db: Database.Database,
  location: { module: string; bookIndex: number; chapter: number }
): any[] {
  return db.prepare(`${annotationSelect()}
    WHERE a.module = ? AND a.book_index = ? AND a.chapter = ?
    ORDER BY a.verse, a.start_offset, a.created_at
  `).all(location.module, location.bookIndex, location.chapter) as any[];
}

export function createInductiveAnnotations(
  db: Database.Database,
  inputs: InductiveAnnotationInput[]
): any[] {
  const now = new Date().toISOString();
  const insert = db.prepare(`
    INSERT INTO inductive_annotations(
      id, module, book_index, chapter, verse, start_offset, end_offset,
      quote, prefix, suffix, text_hash, style_id, note, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(module, book_index, chapter, verse, start_offset, end_offset, style_id)
    DO UPDATE SET
      quote = excluded.quote,
      prefix = excluded.prefix,
      suffix = excluded.suffix,
      text_hash = excluded.text_hash,
      note = COALESCE(excluded.note, inductive_annotations.note),
      updated_at = excluded.updated_at
    RETURNING id
  `);
  const ids = db.transaction(() => inputs.map(input => {
    const id = crypto.randomUUID();
    const row = insert.get(
      id,
      input.module,
      input.bookIndex,
      input.chapter,
      input.verse,
      input.startOffset,
      input.endOffset,
      input.quote,
      input.prefix ?? null,
      input.suffix ?? null,
      input.textHash ?? null,
      input.styleId,
      input.note?.trim() || null,
      now,
      now
    ) as { id: string };
    return row.id;
  }))();
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(',');
  return db.prepare(`${annotationSelect()} WHERE a.id IN (${placeholders})`).all(...ids) as any[];
}

export function deleteInductiveAnnotation(db: Database.Database, id: string): boolean {
  return db.prepare('DELETE FROM inductive_annotations WHERE id = ?').run(id).changes > 0;
}

function relationSelect(): string {
  return `
    SELECT
      r.id,
      r.module,
      r.book_index AS bookIndex,
      r.chapter,
      r.relation_type AS type,
      r.note,
      r.source_verse AS sourceVerse,
      r.source_start_offset AS sourceStartOffset,
      r.source_end_offset AS sourceEndOffset,
      r.source_quote AS sourceQuote,
      r.source_prefix AS sourcePrefix,
      r.source_suffix AS sourceSuffix,
      r.source_text_hash AS sourceTextHash,
      r.target_verse AS targetVerse,
      r.target_start_offset AS targetStartOffset,
      r.target_end_offset AS targetEndOffset,
      r.target_quote AS targetQuote,
      r.target_prefix AS targetPrefix,
      r.target_suffix AS targetSuffix,
      r.target_text_hash AS targetTextHash,
      r.created_at AS createdAt,
      r.updated_at AS updatedAt
    FROM inductive_text_relations r
  `;
}

export function listInductiveRelations(
  db: Database.Database,
  location: { module: string; bookIndex: number; chapter: number }
): any[] {
  return db.prepare(`${relationSelect()}
    WHERE r.module = ? AND r.book_index = ? AND r.chapter = ?
    ORDER BY r.source_verse, r.source_start_offset, r.target_verse, r.target_start_offset
  `).all(location.module, location.bookIndex, location.chapter) as any[];
}

function compareRelationEndpoints(left: InductiveRelationEndpointInput, right: InductiveRelationEndpointInput): number {
  return left.verse - right.verse
    || left.startOffset - right.startOffset
    || left.endOffset - right.endOffset
    || left.quote.localeCompare(right.quote);
}

function normalizedRelationInput(input: InductiveRelationInput): InductiveRelationInput {
  if (compareRelationEndpoints(input.source, input.target) === 0) {
    throw new Error('A relation requires two different text ranges.');
  }
  let source = { ...input.source };
  let target = { ...input.target };
  if (['contrast', 'comparison'].includes(input.type) && compareRelationEndpoints(source, target) > 0) {
    [source, target] = [target, source];
  }
  return { ...input, source, target };
}

function findDuplicateRelation(
  db: Database.Database,
  input: InductiveRelationInput,
  excludedId?: string
): { id: string } | undefined {
  const symmetric = ['contrast', 'comparison'].includes(input.type);
  return db.prepare(`
    SELECT id FROM inductive_text_relations
    WHERE module = ? AND book_index = ? AND chapter = ? AND relation_type = ?
      AND id <> ?
      AND (
        (source_verse = ? AND source_start_offset = ? AND source_end_offset = ?
          AND target_verse = ? AND target_start_offset = ? AND target_end_offset = ?)
        OR (? = 1 AND source_verse = ? AND source_start_offset = ? AND source_end_offset = ?
          AND target_verse = ? AND target_start_offset = ? AND target_end_offset = ?)
      )
  `).get(
    input.module, input.bookIndex, input.chapter, input.type, excludedId ?? '',
    input.source.verse, input.source.startOffset, input.source.endOffset,
    input.target.verse, input.target.startOffset, input.target.endOffset,
    symmetric ? 1 : 0,
    input.target.verse, input.target.startOffset, input.target.endOffset,
    input.source.verse, input.source.startOffset, input.source.endOffset
  ) as { id: string } | undefined;
}

function relationValues(input: InductiveRelationInput, now: string): unknown[] {
  return [
    input.module, input.bookIndex, input.chapter, input.type, input.note?.trim() || null,
    input.source.verse, input.source.startOffset, input.source.endOffset, input.source.quote,
    input.source.prefix ?? null, input.source.suffix ?? null, input.source.textHash ?? null,
    input.target.verse, input.target.startOffset, input.target.endOffset, input.target.quote,
    input.target.prefix ?? null, input.target.suffix ?? null, input.target.textHash ?? null,
    now
  ];
}

export function createInductiveRelation(
  db: Database.Database,
  input: InductiveRelationInput
): any {
  const normalized = normalizedRelationInput(input);
  const now = new Date().toISOString();
  const duplicate = findDuplicateRelation(db, normalized);
  if (duplicate) {
    db.prepare(`
      UPDATE inductive_text_relations SET
        module = ?, book_index = ?, chapter = ?, relation_type = ?, note = ?,
        source_verse = ?, source_start_offset = ?, source_end_offset = ?, source_quote = ?,
        source_prefix = ?, source_suffix = ?, source_text_hash = ?,
        target_verse = ?, target_start_offset = ?, target_end_offset = ?, target_quote = ?,
        target_prefix = ?, target_suffix = ?, target_text_hash = ?, updated_at = ?
      WHERE id = ?
    `).run(...relationValues(normalized, now), duplicate.id);
    return db.prepare(`${relationSelect()} WHERE r.id = ?`).get(duplicate.id);
  }
  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO inductive_text_relations(
      id, module, book_index, chapter, relation_type, note,
      source_verse, source_start_offset, source_end_offset, source_quote,
      source_prefix, source_suffix, source_text_hash,
      target_verse, target_start_offset, target_end_offset, target_quote,
      target_prefix, target_suffix, target_text_hash, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, ...relationValues(normalized, now), now);
  return db.prepare(`${relationSelect()} WHERE r.id = ?`).get(id);
}

export function updateInductiveRelation(
  db: Database.Database,
  id: string,
  input: InductiveRelationInput
): any | undefined {
  const existing = db.prepare('SELECT id FROM inductive_text_relations WHERE id = ?').get(id);
  if (!existing) return undefined;
  const normalized = normalizedRelationInput(input);
  const duplicate = findDuplicateRelation(db, normalized, id);
  if (duplicate) throw new Error('An identical relation already exists.');
  db.prepare(`
    UPDATE inductive_text_relations SET
      module = ?, book_index = ?, chapter = ?, relation_type = ?, note = ?,
      source_verse = ?, source_start_offset = ?, source_end_offset = ?, source_quote = ?,
      source_prefix = ?, source_suffix = ?, source_text_hash = ?,
      target_verse = ?, target_start_offset = ?, target_end_offset = ?, target_quote = ?,
      target_prefix = ?, target_suffix = ?, target_text_hash = ?, updated_at = ?
    WHERE id = ?
  `).run(...relationValues(normalized, new Date().toISOString()), id);
  return db.prepare(`${relationSelect()} WHERE r.id = ?`).get(id);
}

export function deleteInductiveRelation(db: Database.Database, id: string): boolean {
  return db.prepare('DELETE FROM inductive_text_relations WHERE id = ?').run(id).changes > 0;
}

export function importInductiveMarkings(
  db: Database.Database,
  payload: InductiveImportPayload
): { location: InductiveImportPayload['location']; styles: number; annotations: number; relations: number } {
  let importedRelationCount = 0;
  const importTransaction = db.transaction(() => {
    const now = new Date().toISOString();
    const upsertStyle = db.prepare(`
      INSERT INTO inductive_styles(
        id, name, category, symbol, color, background_color, decoration,
        is_builtin, sort_order, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        category = excluded.category,
        symbol = excluded.symbol,
        color = excluded.color,
        background_color = excluded.background_color,
        decoration = excluded.decoration,
        is_builtin = MAX(inductive_styles.is_builtin, excluded.is_builtin),
        sort_order = excluded.sort_order,
        updated_at = excluded.updated_at
    `);
    for (const style of payload.styles) {
      upsertStyle.run(
        style.id,
        style.name,
        style.category,
        style.symbol,
        style.color,
        style.backgroundColor,
        style.decoration,
        style.builtIn ? 1 : 0,
        style.sortOrder,
        now,
        now
      );
    }

    const annotationByExportId = new Map(payload.annotations.map(annotation => [annotation.id, annotation]));
    const findByAnchor = db.prepare(`
      SELECT id FROM inductive_annotations
      WHERE module = ? AND book_index = ? AND chapter = ? AND verse = ?
        AND start_offset = ? AND end_offset = ? AND style_id = ?
    `);
    const findById = db.prepare('SELECT id FROM inductive_annotations WHERE id = ?');
    const insertAnnotation = db.prepare(`
      INSERT INTO inductive_annotations(
        id, module, book_index, chapter, verse, start_offset, end_offset,
        quote, prefix, suffix, text_hash, style_id, note, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const updateAnnotation = db.prepare(`
      UPDATE inductive_annotations SET
        quote = ?, prefix = ?, suffix = ?, text_hash = ?, note = ?, updated_at = ?
      WHERE id = ?
    `);
    for (const annotation of payload.annotations) {
      const anchored = findByAnchor.get(
        annotation.module,
        annotation.bookIndex,
        annotation.chapter,
        annotation.verse,
        annotation.startOffset,
        annotation.endOffset,
        annotation.styleId
      ) as { id: string } | undefined;
      let currentId = anchored?.id;
      if (currentId) {
        updateAnnotation.run(
          annotation.quote,
          annotation.prefix ?? null,
          annotation.suffix ?? null,
          annotation.textHash ?? null,
          annotation.note?.trim() || null,
          now,
          currentId
        );
      } else {
        currentId = findById.get(annotation.id) ? crypto.randomUUID() : annotation.id;
        insertAnnotation.run(
          currentId,
          annotation.module,
          annotation.bookIndex,
          annotation.chapter,
          annotation.verse,
          annotation.startOffset,
          annotation.endOffset,
          annotation.quote,
          annotation.prefix ?? null,
          annotation.suffix ?? null,
          annotation.textHash ?? null,
          annotation.styleId,
          annotation.note?.trim() || null,
          now,
          now
        );
      }
    }

    for (const relation of payload.relations) {
      if ('sourceAnnotationId' in relation) {
        if (relation.type === 'repetition') continue;
        const source = annotationByExportId.get(relation.sourceAnnotationId);
        const target = annotationByExportId.get(relation.targetAnnotationId);
        if (!source || !target) {
          throw new Error('Every imported relation must reference annotations from the same file.');
        }
        createInductiveRelation(db, {
          ...payload.location,
          source:{
            verse:source.verse,
            startOffset:source.startOffset,
            endOffset:source.endOffset,
            quote:source.quote,
            prefix:source.prefix,
            suffix:source.suffix,
            textHash:source.textHash
          },
          target:{
            verse:target.verse,
            startOffset:target.startOffset,
            endOffset:target.endOffset,
            quote:target.quote,
            prefix:target.prefix,
            suffix:target.suffix,
            textHash:target.textHash
          },
          type:relation.type,
          note:relation.note
        });
      } else {
        createInductiveRelation(db, relation);
      }
      importedRelationCount += 1;
    }
  });
  importTransaction();
  return {
    location:payload.location,
    styles:payload.styles.length,
    annotations:payload.annotations.length,
    relations:importedRelationCount
  };
}
