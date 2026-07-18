import assert from 'node:assert/strict';
import test from 'node:test';
import { getVerseTextWithBibleNote } from '../src/bible.js';

const request = {
  apiUrl:'http://127.0.0.1:5000',
  module:'rst',
  bookIndex:1,
  chapter:15,
  verse:16,
  timeoutMs:5000
};

test('verse text retries a transient 404 response', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return calls === 1
      ? new Response('Verse text was not found.', { status:404 })
      : Response.json({ reference:'Бытие 15:16', text:'Текст', verses:[] });
  };
  try {
    const result = await getVerseTextWithBibleNote(request);
    assert.equal(result.reference, 'Бытие 15:16');
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('verse text does not retry a permanent 400 response', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response('Invalid reference.', { status:400 });
  };
  try {
    await assert.rejects(() => getVerseTextWithBibleNote(request), /returned 400/);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
