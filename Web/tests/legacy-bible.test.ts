import assert from 'node:assert/strict';
import test from 'node:test';
import { legacyBibleChapterLink, legacyBibleVerseLink, legacyBibleLinkFromExternal, legacyHandlerFromCommand, openLegacyBibleChapter } from '../src/legacy-bible.js';

test('legacy verse navigation targets the first verse and excludes the rest of the range', () => {
  for (const range of [{ topVerse:18 }, { topChapter:4, topVerse:2 }]) {
    const link = legacyBibleVerseLink({ bookIndex:43, chapter:3, verse:16, bookName:'Ин', ...range });
    assert.equal(link.split(';')[0], 'isbtBibleVerse:/43 3:16');
    assert.equal(decodeURIComponent(link.split(';')[1]), 'Ин 3:16');
  }
  const single = legacyBibleVerseLink({ bookIndex:57, chapter:4, verse:4, bookName:'Флп' });
  assert.equal(decodeURIComponent(single.split(';')[1]), 'Флп 4:4');
});

test('a chapter reference opens its first verse in the verse dialog', () => {
  const link = legacyBibleVerseLink({ bookIndex:19, chapter:135, bookName:'Пс' });
  assert.equal(decodeURIComponent(link.split(';')[1]), 'Пс 135:1');
});

test('legacy verse navigation rejects invalid first-verse coordinates', () => {
  for (const verse of [0, -1, 1.5, '16', null, Number.POSITIVE_INFINITY]) {
    assert.throws(() => legacyBibleVerseLink({ bookIndex:43, chapter:3, bookName:'Ин', verse }));
  }
});

test('successful legacy launch also activates OneNote before completing', async () => {
  let activated = false;
  await openLegacyBibleChapter(process.execPath, '--version', async () => {
    activated = true;
    return true;
  });
  assert.equal(activated, true);
});

test('legacy launch failure does not activate OneNote', async () => {
  let activated = false;
  await assert.rejects(openLegacyBibleChapter(`${process.execPath}.missing`, '--version', async () => {
    activated = true;
    return true;
  }));
  assert.equal(activated, false);
});

test('activation failure does not turn successful legacy navigation into an error', async () => {
  await openLegacyBibleChapter(process.execPath, '--version', async () => { throw new Error('Window unavailable'); });
});

test('external bnVerse links preserve the reference and verse range when forwarding to v3', () => {
  for (const [link, expected] of [
    ['bnVerse:Иоанна%203:16-18', 'Иоанна 3:16-18'],
    ['bnVerse:rst/43%203:16-18;Ин%203:16-18', 'Ин 3:16-18'],
    ['bnVerse:rst/43%203:16-4:2', 'Ин 3:16-4:2'],
    ['bnVerse:/19%20135', 'Пс 135'],
    ['bnVerse:rst/52%203:16', 'Рим 3:16']
  ]) {
    assert.equal(legacyBibleLinkFromExternal(link), `isbtBibleVerse:/;${encodeURIComponent(expected)}`);
  }
  const legacyLink = 'isbtBibleVerse:rst/43 3:16;Ин%203:16';
  assert.equal(legacyBibleLinkFromExternal(legacyLink), legacyLink);
  for (const link of ['https://example.com', 'bnVerse:', 'bnVerse:rst/99%203:16', 'bnVerse:Ин%203:16%26bad']) {
    assert.throws(() => legacyBibleLinkFromExternal(link));
  }
});

test('legacy discovery accepts the v3 handler at a custom installation path', () => {
  assert.equal(legacyHandlerFromCommand('"D:\\My Bible\\tools\\ISBTCommandHandler\\ISBTCommandHandler.exe" "%1"'),
    'D:\\My Bible\\tools\\ISBTCommandHandler\\ISBTCommandHandler.exe');
  assert.equal(legacyHandlerFromCommand('C:\\Bible\\ISBTCommandHandler.exe "%1"'), 'C:\\Bible\\ISBTCommandHandler.exe');
});

test('legacy discovery rejects the new app and unrelated commands', () => {
  for (const command of ['"C:\\BibleNote\\BibleNote.exe" "%1"', 'cmd.exe /c anything', 'ISBTCommandHandler.exe "%1"', '']) {
    assert.equal(legacyHandlerFromCommand(command), undefined);
  }
});

test('legacy navigation opens a chapter using the display part read by v3', () => {
  const link = legacyBibleChapterLink({ bookIndex:43, chapter:3, bookName:'Ин', verse:16, topVerse:18, module:'kjv' });
  assert.equal(link.split(';')[0], 'isbtBibleVerse:/43 3');
  assert.equal(decodeURIComponent(link.split(';')[1]), 'Ин 3');
  assert.equal(legacyBibleChapterLink({ bookIndex:19, chapter:150, bookName:'Пс' }).split(';')[0], 'isbtBibleVerse:/19 150');
});

test('legacy navigation rejects invalid references and command delimiters', () => {
  for (const ref of [null, [], {}, { bookIndex:43, chapter:0, bookName:'Ин' },
    { bookIndex:43, chapter:1.5, bookName:'Ин' }, { bookIndex:'43', chapter:3, bookName:'Ин' },
    { bookIndex:43, chapter:3, bookName:'Ин;isbtExitApplication:' }]) {
    assert.throws(() => legacyBibleChapterLink(ref));
  }
});
