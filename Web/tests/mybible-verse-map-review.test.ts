import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { once } from 'node:events';
import Database from 'better-sqlite3';
import { startCacheUi } from '../src/cache-ui.js';
import { createVerseMapDraft, readVerseMapDocument } from '../src/mybible-verse-map.js';
import { parseReviewVerseMapArgs } from '../src/mybible-verse-map-review-cli.js';
import { startVerseMapReviewServer } from '../src/mybible-verse-map-review.js';

function temporaryDirectory(t: TestContext): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'biblenote-map-review-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

async function reviewFixture(t: TestContext, verseCount = 1): Promise<string> {
  const directory = temporaryDirectory(t);
  const referencePath = path.join(directory, 'reference.xml');
  const modulePath = path.join(directory, 'module.SQLite3');
  const mapPath = path.join(directory, 'map.json');
  const verses = Array.from({ length: verseCount }, (_, index) => index + 1);
  fs.writeFileSync(referencePath, `<?xml version="1.0"?>
<XMLBIBLE><INFORMATION><title>Review reference</title></INFORMATION><BIBLEBOOK bnumber="1"><CHAPTER cnumber="1">
${verses.map(verse => `<VERS vnumber="${verse}">A sufficiently long review verse number ${verse}.</VERS>`).join('\n')}
</CHAPTER></BIBLEBOOK></XMLBIBLE>`);
  const db = new Database(modulePath);
  try {
    db.exec(`
      CREATE TABLE info(name TEXT, value TEXT);
      CREATE TABLE verses(book_number NUMERIC, chapter NUMERIC, verse NUMERIC, text TEXT);
      INSERT INTO info VALUES ('description', 'Review module');
      ${verses.map(verse => `INSERT INTO verses VALUES (10, 1, ${verse}, '<i>A sufficiently long review verse number ${verse}.</i>');`).join('\n')}
    `);
  } finally {
    db.close();
  }
  const document = await createVerseMapDraft({ referencePath, modulePath });
  document.reviewGroups[0].status = 'candidate';
  document.reviewGroups[0].autoConfirmed = false;
  fs.writeFileSync(mapPath, `${JSON.stringify(document, null, 2)}\n`);
  return mapPath;
}

test('review server serves paged verse text and saves decisions with a backup', async t => {
  const mapPath = await reviewFixture(t);
  const review = await startVerseMapReviewServer({ mapPath, port: 0 });
  try {
    const headers = { 'X-BibleNote-Review-Token': review.token };
    const stateResponse = await fetch(`${review.origin}/api/state`, { headers });
    assert.equal(stateResponse.status, 200);
    const state = await stateResponse.json() as { counts: { candidate: number }; groups: Array<{ id: string }> };
    assert.equal(state.counts.candidate, 1);
    const groupId = state.groups[0].id;

    const prematureBuild = await fetch(`${review.origin}/api/build-module`, {
      method:'POST', headers:{ ...headers, Origin:review.origin }
    });
    assert.equal(prematureBuild.status, 409);

    const groupResponse = await fetch(`${review.origin}/api/groups/${encodeURIComponent(groupId)}?limit=1`, { headers });
    const page = await groupResponse.json() as {
      total: number;
      entries: Array<{
        reference: Array<{ text: string }>;
        module: Array<{ text: string }>;
        context: {
          reference: Array<{ text: string; affected: boolean }>;
          module: Array<{ text: string; affected: boolean }>;
        };
      }>;
    };
    assert.equal(page.total, 1);
    assert.match(page.entries[0].reference[0].text, /sufficiently long review verse/);
    assert.match(page.entries[0].module[0].text, /<i>/);
    assert.equal(page.entries[0].context.reference.length, 1);
    assert.equal(page.entries[0].context.reference[0].affected, true);
    assert.match(page.entries[0].context.reference[0].text, /sufficiently long review verse/);
    assert.equal(page.entries[0].context.module.length, 1);
    assert.equal(page.entries[0].context.module[0].affected, true);
    assert.match(page.entries[0].context.module[0].text, /<i>/);

    const mapBeforeValidation = fs.readFileSync(mapPath, 'utf8');
    const validationResponse = await fetch(`${review.origin}/api/validate`, {
      method: 'POST', headers: { ...headers, Origin: review.origin }
    });
    assert.equal(validationResponse.status, 200);
    const validationUpdate = await validationResponse.json() as { backupCreated: boolean };
    assert.equal(validationUpdate.backupCreated, false);
    assert.equal(fs.readFileSync(mapPath, 'utf8'), mapBeforeValidation);
    assert.deepEqual(
      fs.readdirSync(path.dirname(mapPath)).filter(name => name.startsWith('map.json.backup-')),
      []
    );

    const mappingResponse = await fetch(`${review.origin}/api/groups/${encodeURIComponent(groupId)}/entries/${page.entries[0].id}`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json', Origin: review.origin },
      body: JSON.stringify({ referenceCoordinates: '1 1:1', moduleCoordinates: '1 1:1' })
    });
    assert.equal(mappingResponse.status, 200);
    const mappingUpdate = await mappingResponse.json() as { backupPath: string; backupCreated: boolean };
    assert.equal(mappingUpdate.backupCreated, true);
    assert.equal(fs.existsSync(mappingUpdate.backupPath), true);
    const mapped = readVerseMapDocument(mapPath);
    assert.deepEqual(mapped.entries[0].evidence, ['manual-review']);
    assert.equal(mapped.reviewGroups[0].autoConfirmed, false);

    const invalidMappingResponse = await fetch(`${review.origin}/api/groups/${encodeURIComponent(groupId)}/entries/${page.entries[0].id}`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json', Origin: review.origin },
      body: JSON.stringify({ referenceCoordinates: '1 1:99', moduleCoordinates: '1 1:1' })
    });
    assert.equal(invalidMappingResponse.status, 500);

    const updateResponse = await fetch(`${review.origin}/api/groups/${encodeURIComponent(groupId)}`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json', Origin: review.origin },
      body: JSON.stringify({ status: 'confirmed', allowNonMonotonic: false })
    });
    assert.equal(updateResponse.status, 200);
    const update = await updateResponse.json() as { backupPath: string; backupCreated: boolean };
    assert.equal(update.backupCreated, false);
    assert.equal(update.backupPath, mappingUpdate.backupPath);
    assert.equal(fs.existsSync(update.backupPath), true);
    assert.equal(readVerseMapDocument(mapPath).reviewGroups[0].status, 'confirmed');

    const unauthorized = await fetch(`${review.origin}/api/state`);
    assert.equal(unauthorized.status, 401);
    const foreignOrigin = await fetch(`${review.origin}/api/validate`, {
      method: 'POST', headers: { ...headers, Origin: 'https://example.invalid' }
    });
    assert.equal(foreignOrigin.status, 403);
    const html = await fetch(review.url);
    assert.equal(html.status, 200);
    assert.match(await html.text(), /Проверка соответствия стихов/);
  } finally {
    await review.close();
  }
});

test('review server accepts verse ranges in manual correspondences', async t => {
  const mapPath = await reviewFixture(t, 3);
  const review = await startVerseMapReviewServer({ mapPath, port: 0 });
  try {
    const headers = { 'X-BibleNote-Review-Token': review.token, 'Content-Type': 'application/json', Origin: review.origin };
    const state = await (await fetch(`${review.origin}/api/state`, { headers })).json() as { groups: Array<{ id: string }> };
    const groupId = state.groups[0].id;
    const page = await (await fetch(`${review.origin}/api/groups/${encodeURIComponent(groupId)}?limit=1`, { headers })).json() as {
      entries: Array<{ id: string }>;
    };
    const entryUrl = `${review.origin}/api/groups/${encodeURIComponent(groupId)}/entries/${page.entries[0].id}`;

    const rangeResponse = await fetch(entryUrl, {
      method: 'POST', headers,
      body: JSON.stringify({ referenceCoordinates: '1 1:1-3', moduleCoordinates: '1 1:1, 1 1:2 - 3' })
    });
    assert.equal(rangeResponse.status, 200);
    const saved = await rangeResponse.json() as { entry: { reference: Array<{ verse: number }>; module: Array<{ verse: number }> } };
    assert.deepEqual(saved.entry.reference.map(location => location.verse), [1, 2, 3]);
    assert.deepEqual(saved.entry.module.map(location => location.verse), [1, 2, 3]);

    const reversed = await fetch(entryUrl, {
      method: 'POST', headers,
      body: JSON.stringify({ referenceCoordinates: '1 1:3-1', moduleCoordinates: '1 1:1' })
    });
    assert.equal(reversed.status, 500);
    assert.match(((await reversed.json()) as { error: string }).error, /lower verse to a higher one/);

    const beyond = await fetch(entryUrl, {
      method: 'POST', headers,
      body: JSON.stringify({ referenceCoordinates: '1 1:2-4', moduleCoordinates: '1 1:1' })
    });
    assert.equal(beyond.status, 500);
    assert.match(((await beyond.json()) as { error: string }).error, /verse '1 1:4' does not exist/);
  } finally {
    await review.close();
  }
});

test('manual correspondence takes its verses away from other entries and groups', async t => {
  const mapPath = await reviewFixture(t, 4);
  // Split the auto-generated identity entries into two groups so the manual mapping crosses group boundaries.
  const draft = readVerseMapDocument(mapPath);
  assert.equal(draft.entries.length, 4);
  const [firstGroup] = draft.reviewGroups;
  const secondGroup = { ...firstGroup, id: `${firstGroup.id}-b`, status: 'candidate' as const, autoConfirmed: false };
  draft.reviewGroups.push(secondGroup);
  for (const entry of draft.entries.slice(2)) entry.reviewGroupId = secondGroup.id;
  fs.writeFileSync(mapPath, `${JSON.stringify(draft, null, 2)}\n`);

  const review = await startVerseMapReviewServer({ mapPath, port: 0 });
  try {
    const headers = { 'X-BibleNote-Review-Token': review.token, 'Content-Type': 'application/json', Origin: review.origin };
    const state = await (await fetch(`${review.origin}/api/state`, { headers })).json() as { counts: { groups: number; entries: number } };
    assert.equal(state.counts.groups, 2);
    assert.equal(state.counts.entries, 4);

    // Entry #3 (verse 3, second group) now maps reference verses 1-4 onto module verse 3.
    const editedEntry = draft.entries[2];
    const response = await fetch(`${review.origin}/api/groups/${encodeURIComponent(secondGroup.id)}/entries/${editedEntry.id}`, {
      method: 'POST', headers,
      body: JSON.stringify({ referenceCoordinates: '1 1:1-4', moduleCoordinates: '1 1:3' })
    });
    assert.equal(response.status, 200);
    const result = await response.json() as {
      adjustments: { trimmedEntries: number; removedEntries: number; removedGroups: number; affectedGroupIds: string[] };
      validation: { confirmedOnly: { duplicateReferenceAssignments: number }; candidateAndConfirmed: { duplicateReferenceAssignments: number; duplicateModuleAssignments: number } };
    };
    // Verses 1 and 2 (first group) lose their reference side; verse 4 (second group) too; verse 3 entry is the edited one.
    assert.equal(result.adjustments.removedEntries, 0);
    assert.equal(result.adjustments.trimmedEntries, 3);
    assert.equal(result.adjustments.removedGroups, 0);
    assert.deepEqual(result.adjustments.affectedGroupIds, [firstGroup.id, secondGroup.id].sort());
    assert.equal(result.validation.candidateAndConfirmed.duplicateReferenceAssignments, 0);
    assert.equal(result.validation.candidateAndConfirmed.duplicateModuleAssignments, 0);

    const saved = readVerseMapDocument(mapPath);
    assert.equal(saved.entries.length, 4);
    const trimmed = saved.entries.filter(entry => entry.id !== editedEntry.id);
    for (const entry of trimmed) {
      assert.deepEqual(entry.reference, []);
      assert.equal(entry.kind, 'unmatched-module');
      assert.ok(entry.evidence.includes('manual-review-adjusted'));
    }
    assert.equal(saved.reviewGroups.find(group => group.id === firstGroup.id)?.status, 'candidate');

    // Claim the remaining module verses too: the other entries disappear together with their emptied group.
    const second = await fetch(`${review.origin}/api/groups/${encodeURIComponent(secondGroup.id)}/entries/${editedEntry.id}`, {
      method: 'POST', headers,
      body: JSON.stringify({ referenceCoordinates: '1 1:1-4', moduleCoordinates: '1 1:1-4' })
    });
    assert.equal(second.status, 200);
    const secondResult = await second.json() as { adjustments: { removedEntries: number; removedGroups: number } };
    assert.equal(secondResult.adjustments.removedEntries, 3);
    assert.equal(secondResult.adjustments.removedGroups, 1);
    const finalDocument = readVerseMapDocument(mapPath);
    assert.equal(finalDocument.entries.length, 1);
    assert.equal(finalDocument.reviewGroups.length, 1);
    assert.equal(finalDocument.reviewGroups[0].id, secondGroup.id);
    assert.equal(finalDocument.reviewGroups[0].entryCount, 1);
  } finally {
    await review.close();
  }
});

test('review server falls back to a module next to the map and reports missing modules clearly', async t => {
  const mapPath = await reviewFixture(t);
  const document = readVerseMapDocument(mapPath);
  const storedModulePath = document.module.path;
  const staleFolder = path.join(path.dirname(mapPath), 'removed-temp-folder');
  document.module.path = path.join(staleFolder, document.module.fileName);
  fs.writeFileSync(mapPath, `${JSON.stringify(document, null, 2)}\n`);

  const review = await startVerseMapReviewServer({ mapPath, port: 0 });
  try {
    const response = await fetch(`${review.origin}/api/state`, { headers: { 'X-BibleNote-Review-Token': review.token } });
    assert.equal(response.status, 200);
  } finally {
    await review.close();
  }

  fs.renameSync(storedModulePath, `${storedModulePath}.moved`);
  await assert.rejects(
    startVerseMapReviewServer({ mapPath, port: 0 }),
    (error: Error) => {
      assert.match(error.message, /MyBible module 'module\.SQLite3' referenced by the map was not found/);
      assert.match(error.message, /removed-temp-folder/);
      assert.doesNotMatch(error.message, /Cannot open database/);
      return true;
    }
  );
});

test('parses review-server arguments', () => {
  assert.deepEqual(parseReviewVerseMapArgs(['--map', 'map.json', '--footnotes', 'notes.SQLite3', '--port', '0']), {
    mapPath: 'map.json', footnotesPath: 'notes.SQLite3', port: 0, help: false
  });
});

test('cache UI starts and stops the MyBible reviewer for a selected map path', async t => {
  const mapPath = await reviewFixture(t);
  const dbPath = path.join(path.dirname(mapPath), 'cache.sqlite');
  const uiServer = startCacheUi({ dbPath, port:0 });
  await once(uiServer, 'listening');
  const address = uiServer.address();
  assert.ok(address && typeof address === 'object');
  const origin = `http://127.0.0.1:${address.port}`;
  try {
    const startResponse = await fetch(`${origin}/api/mybible/review/start`, {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body:JSON.stringify({ mapPath })
    });
    assert.equal(startResponse.status, 200);
    const started = await startResponse.json() as { active: boolean; mapPath: string; url: string };
    assert.equal(started.active, true);
    assert.equal(started.mapPath, fs.realpathSync(mapPath));
    assert.match(started.url, /^http:\/\/127\.0\.0\.1:\d+\/\?token=/);
    assert.equal((await fetch(started.url)).status, 200);

    const stopResponse = await fetch(`${origin}/api/mybible/review/stop`, { method:'POST' });
    assert.equal(stopResponse.status, 200);
    assert.deepEqual(await stopResponse.json(), { active:false });
  } finally {
    await new Promise(resolve => setTimeout(resolve, 1300));
    await new Promise<void>(resolve => uiServer.close(() => resolve()));
  }
});
