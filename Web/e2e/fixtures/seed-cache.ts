import type Database from 'better-sqlite3';
import {
  markPageOpened,
  markSectionPagesScanned,
  openCacheDb,
  sha256,
  updatePageContent,
  upsertNotebook,
  upsertPageMetadata,
  upsertSection
} from '../../src/cache.js';
import { bibleParserVersion } from '../../src/bible.js';

export const seeded = {
  notebookId: 'notebook-study',
  sectionId: 'section-gospel',
  firstPageId: 'page-grace',
  secondPageId: 'page-prayer'
} as const;

export function seedCache(dbPath: string): void {
  const db = openCacheDb(dbPath);
  const syncedAt = new Date().toISOString();
  try {
    upsertNotebook(db, {
      id: seeded.notebookId,
      displayName: 'Учебный блокнот',
      isDefault: true,
      lastModifiedDateTime: syncedAt
    }, syncedAt);
    upsertSection(db, {
      id: seeded.sectionId,
      displayName: 'Евангелие от Иоанна',
      lastModifiedDateTime: syncedAt,
      pagesUrl: `/me/onenote/sections/${seeded.sectionId}/pages`,
      parentNotebook: { id: seeded.notebookId, displayName: 'Учебный блокнот' },
      sectionGroupInfoKnown: true,
      orderIndex: 0
    }, syncedAt);

    const longHtmlGap = Array.from(
      { length:30 },
      (_, index) => `<p>Дополнительный абзац длинной заметки ${index + 1}.</p>`
    ).join('');
    const pages = [
      {
        id: seeded.firstPageId,
        title: 'Благодать и надежда',
        orderIndex: 0,
        level: 0,
        text: [
          'Благодать и надежда',
          'В тяжбе каждый сначала прав. Ин 3:14-16 и Ин 3:16.',
          'Воскресение даёт надежду и изменяет всё. Ин 3:16.'
        ].join('\n'),
        html: '<html><body><h1>Благодать и надежда</h1><p>В тяжбе каждый сначала прав. <a href="bnVerse:rst/43%203:14-16;Ин%203:14-16">Ин 3:14-16</a> и <a href="bnVerse:rst/43%203:16;Ин%203:16">Ин 3:16</a>.</p>'
          + longHtmlGap
          + '<p>Воскресение даёт <strong>надежду</strong> и изменяет всё. <a href="bnVerse:rst/43%203:16;Ин%203:16">Ин 3:16</a>.</p></body></html>'
      },
      {
        id: seeded.secondPageId,
        title: 'Молитва учеников',
        orderIndex: 1,
        level: 1,
        text: 'Ученики молились вместе и сохраняли верность.',
        html: '<html><body><h1>Молитва учеников</h1><p>Ученики молились вместе и сохраняли верность.</p></body></html>'
      }
    ];

    for (const page of pages) {
      upsertPageMetadata(db, {
        id: page.id,
        title: page.title,
        createdDateTime: syncedAt,
        lastModifiedDateTime: syncedAt,
        contentUrl: `/me/onenote/pages/${page.id}/content`,
        parentSection: { id: seeded.sectionId, displayName: 'Евангелие от Иоанна' },
        parentNotebook: { id: seeded.notebookId, displayName: 'Учебный блокнот' },
        orderIndex: page.orderIndex,
        level: page.level
      }, syncedAt);
      updatePageContent(db, page.id, page.text, page.html, syncedAt, syncedAt, syncedAt);
    }
    markSectionPagesScanned(db, seeded.sectionId, true, pages.length, syncedAt);
    markPageOpened(db, seeded.firstPageId, syncedAt);

    const parserVersion = bibleParserVersion;
    const module = 'rst';
    const paragraphs = [
      { index:0, path:'0', text:'Благодать и надежда' },
      { index:1, path:'1', text:'В тяжбе каждый сначала прав. Ин 3:14-16 и Ин 3:16.' },
      { index:2, path:'2', text:'Воскресение даёт надежду и изменяет всё. Ин 3:16.' }
    ];
    const insertParagraph = db.prepare(`
      INSERT INTO page_paragraphs(
        page_id, paragraph_index, paragraph_path, text, text_hash,
        parsed_at, parser_version, module
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const paragraph of paragraphs) {
      insertParagraph.run(
        seeded.firstPageId,
        paragraph.index,
        paragraph.path,
        paragraph.text,
        sha256(paragraph.text),
        syncedAt,
        parserVersion,
        module
      );
    }
    const insertReference = db.prepare(`
      INSERT INTO paragraph_verse_refs(
        page_id, paragraph_index, original_text, normalized_ref,
        verse_id, top_verse_id, book_index, book_name, book_short_name,
        chapter, verse, top_chapter, top_verse, is_chapter,
        start_index, end_index, entry_type, entry_options,
        module, parser_version, parsed_at
      ) VALUES (?, ?, ?, ?, ?, ?, 43, 'От Иоанна', 'Ин', 3, ?, 3, ?, 0, ?, ?, NULL, NULL, ?, ?, ?)
    `);
    insertReference.run(seeded.firstPageId, 1, 'Ин 3:14-16', 'Ин 3:14-16', 43003014, 43003016, 14, 16, 31, 41, module, parserVersion, syncedAt);
    insertReference.run(seeded.firstPageId, 1, 'Ин 3:16', 'Ин 3:16', 43003016, 43003016, 16, 16, 44, 50, module, parserVersion, syncedAt);
    insertReference.run(seeded.firstPageId, 2, 'Ин 3:16', 'Ин 3:16', 43003016, 43003016, 16, 16, 42, 48, module, parserVersion, syncedAt);
    db.prepare(`
      INSERT INTO page_bible_parse_state(
        page_id, content_hash, module, parser_version, parsed_at,
        parse_error, refs_count, paragraphs_count
      ) VALUES (?, ?, ?, ?, ?, NULL, 3, 3)
    `).run(seeded.firstPageId, sha256(pages[0].text), module, parserVersion, syncedAt);
  } finally {
    db.close();
  }
}

export function readScalar(dbPath: string, sql: string, ...parameters: unknown[]): unknown {
  const db = openCacheDb(dbPath) as Database.Database;
  try {
    const row = db.prepare(sql).get(...parameters) as Record<string, unknown> | undefined;
    return row ? Object.values(row)[0] : undefined;
  } finally {
    db.close();
  }
}
