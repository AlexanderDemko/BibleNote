import assert from 'node:assert/strict';
import test from 'node:test';
import {
  findCachedGraphSectionIdByOneNoteGuid,
  findCachedPageByOneNoteGuid,
  openCacheDb,
  upsertPageMetadata
} from '../src/cache.js';
import {
  extractOneNotePageGuid,
  extractOneNotePageTitle,
  extractOneNoteSectionGuid,
  findGraphPageForOneNoteClientPage,
  findGraphSectionForOneNoteClientPage
} from '../src/onenote-page-link.js';

test('extractOneNotePageTitle reads the title from a COM client URL', () => {
  assert.equal(
    extractOneNotePageTitle('onenote:https://example/notebook.one#Небесное%20гражданство%20(Фил%204%3A1-3)&section-id={ID}'),
    'Небесное гражданство (Фил 4:1-3)'
  );
  assert.equal(extractOneNotePageTitle('onenote:https://example/notebook.one'), undefined);
});

test('extractOneNotePageGuid reads COM and URL-encoded page identifiers', () => {
  assert.equal(
    extractOneNotePageGuid('{AABBCCDD-1122-3344-5566-77889900AABB}{1}{B0}'),
    'aabbccdd-1122-3344-5566-77889900aabb'
  );
  assert.equal(
    extractOneNotePageGuid('onenote:https://example/notebook.one#Page&page-id=%7BAABBCCDD-1122-3344-5566-77889900AABB%7D&end'),
    'aabbccdd-1122-3344-5566-77889900aabb'
  );
});

test('maps the current COM page to its Graph section before listing pages', () => {
  const currentClientUrl = 'onenote:https://example/notebook.one#Page'
    + '&section-id={FBDEE750-8F4D-4892-A7FE-1B7C3C1DC961}'
    + '&page-id={A4FDAF87-8DD7-427A-B379-C54620793B9F}&end';
  const sections = [
    {
      id:'graph-section-1',
      links:{ oneNoteClientUrl:{ href:'onenote:https://example/a.one#A&section-id={11111111-1111-1111-1111-111111111111}&end' } }
    },
    {
      id:'graph-section-2',
      links:{ oneNoteClientUrl:{ href:'onenote:https://example/b.one#B&section-id=%7BFBDEE750-8F4D-4892-A7FE-1B7C3C1DC961%7D&end' } }
    }
  ];

  assert.equal(extractOneNoteSectionGuid(currentClientUrl), 'fbdee750-8f4d-4892-a7fe-1b7c3c1dc961');
  assert.equal(findGraphSectionForOneNoteClientPage(sections, currentClientUrl)?.id, 'graph-section-2');
});

test('finds the current Graph page in the local cache without listing every Graph section', () => {
  const db = openCacheDb(':memory:');
  try {
    upsertPageMetadata(db, {
      id:'graph-page-2',
      title:'Current page',
      links:{
        oneNoteClientUrl:{
          href:'onenote:https://example/notebook.one#Page'
            + '&section-id={FBDEE750-8F4D-4892-A7FE-1B7C3C1DC961}'
            + '&page-id={A4FDAF87-8DD7-427A-B379-C54620793B9F}&end'
        }
      }
    });

    assert.equal(
      findCachedPageByOneNoteGuid(db, 'a4fdaf87-8dd7-427a-b379-c54620793b9f')?.id,
      'graph-page-2'
    );
  } finally {
    db.close();
  }
});

test('maps a native OneNote section to its cached Graph section id', () => {
  const db = openCacheDb(':memory:');
  try {
    upsertPageMetadata(db, {
      id:'graph-page-in-section',
      title:'Another page in the section',
      parentSection:{ id:'graph-section-2', displayName:'Sermons' },
      links:{
        oneNoteClientUrl:{
          href:'onenote:https://example/notebook.one#Another-page'
            + '&section-id={FBDEE750-8F4D-4892-A7FE-1B7C3C1DC961}'
            + '&page-id={11111111-1111-1111-1111-111111111111}&end'
        }
      }
    });

    assert.equal(
      findCachedGraphSectionIdByOneNoteGuid(db, 'fbdee750-8f4d-4892-a7fe-1b7c3c1dc961'),
      'graph-section-2'
    );
  } finally {
    db.close();
  }
});

test('findGraphPageForOneNoteClientPage maps a COM page to its Graph page', () => {
  const pages = [
    {
      id:'graph-page-1',
      links:{ oneNoteClientUrl:{ href:'onenote:https://example/a.one#A&page-id={11111111-1111-1111-1111-111111111111}&end' } }
    },
    {
      id:'graph-page-2',
      links:{ oneNoteClientUrl:{ href:'onenote:https://example/b.one#B&page-id={AABBCCDD-1122-3344-5566-77889900AABB}&end' } }
    }
  ];
  assert.equal(
    findGraphPageForOneNoteClientPage(
      pages,
      '{AABBCCDD-1122-3344-5566-77889900AABB}{1}{B0}',
      undefined
    )?.id,
    'graph-page-2'
  );
});
