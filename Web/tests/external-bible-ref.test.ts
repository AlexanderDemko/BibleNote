import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeExternalBibleRefText, parseExternalBibleRef } from '../src/biblenote-gateway.js';

test('keeps parsing legacy isbtBibleVerse links', async () => {
  const reference = await parseExternalBibleRef(
    'isbtBibleVerse:rst/50%204:1-3;%D0%9A%20%D0%A4%D0%B8%D0%BB%D0%B8%D0%BF%D0%BF%D0%B8%D0%B9%D1%86%D0%B0%D0%BC%204:1-3'
  );

  assert.equal(reference.module, 'rst');
  assert.equal(reference.bookIndex, 50);
  assert.equal(reference.chapter, 4);
  assert.equal(reference.verse, 1);
  assert.equal(reference.topVerse, 3);
  assert.equal(reference.originalText, 'К Филиппийцам 4:1-3');
});

test('parses full bnVerse links without losing module and book identity', async () => {
  const reference = await parseExternalBibleRef(
    'bnVerse:rst/50%204:1-3;%D0%9A%20%D0%A4%D0%B8%D0%BB%D0%B8%D0%BF%D0%BF%D0%B8%D0%B9%D1%86%D0%B0%D0%BC%204:1-3'
  );

  assert.equal(reference.module, 'rst');
  assert.equal(reference.bookIndex, 50);
  assert.equal(reference.chapter, 4);
  assert.equal(reference.verse, 1);
  assert.equal(reference.topVerse, 3);
  assert.equal(reference.originalText, 'К Филиппийцам 4:1-3');

  const fullyEncodedReference = await parseExternalBibleRef(
    'bnVerse:rst%2F50%204%3A1-3%3B%D0%9A%20%D0%A4%D0%B8%D0%BB%D0%B8%D0%BF%D0%BF%D0%B8%D0%B9%D1%86%D0%B0%D0%BC%204%3A1-3'
  );
  assert.equal(fullyEncodedReference.module, 'rst');
  assert.equal(fullyEncodedReference.bookIndex, 50);
  assert.equal(fullyEncodedReference.originalText, 'К Филиппийцам 4:1-3');
});

test('decodes already-created short bnVerse links before parsing them', () => {
  assert.equal(
    decodeExternalBibleRefText('bnVerse:%D0%95%D1%84%D0%B5%D1%81%D1%8F%D0%BD%D0%B0%D0%BC%204:1'),
    'Ефесянам 4:1'
  );
});

test('keeps opening malformed bnVerse links created without a module', async () => {
  const reference = await parseExternalBibleRef(
    'bnVerse://59%204:1;%D0%98%D0%B0%D0%BA%D0%BE%D0%B2%D0%B0%204:1/',
    'rst'
  );

  assert.equal(reference.module, 'rst');
  assert.equal(reference.bookIndex, 59);
  assert.equal(reference.chapter, 4);
  assert.equal(reference.verse, 1);
  assert.equal(reference.originalText, 'Иакова 4:1');
});
