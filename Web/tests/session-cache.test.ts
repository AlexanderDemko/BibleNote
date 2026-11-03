import assert from 'node:assert/strict';
import test from 'node:test';
import { SessionCache } from '../src/session-cache.js';

test('session discovery shares concurrent requests and caches presence and absence', async () => {
  for (const value of ['legacy.exe', undefined, false]) {
    let calls = 0;
    const cache = new SessionCache(async () => { calls += 1; return value; });
    const first = cache.get();
    assert.equal(cache.get(), first);
    assert.deepEqual(await Promise.all([first, cache.get()]), [value, value]);
    assert.equal(await cache.get(), value);
    assert.equal(calls, 1);
  }
});

test('a failed discovery can be retried instead of caching a transient error', async () => {
  let calls = 0;
  const cache = new SessionCache(async () => {
    if (++calls === 1) throw new Error('discovery failed');
    return true;
  });
  await assert.rejects(cache.get(), /discovery failed/);
  assert.equal(await cache.get(), true);
  assert.equal(calls, 2);
});

test('changing integration updates its cached status and clearing reloads it', async () => {
  let calls = 0;
  const cache = new SessionCache(async () => { calls += 1; return { enabled:false }; });
  await cache.get();
  cache.set({ enabled:true });
  assert.deepEqual(await cache.get(), { enabled:true });
  assert.equal(calls, 1);
  cache.clear();
  assert.deepEqual(await cache.get(), { enabled:false });
  assert.equal(calls, 2);
});

test('an older rejected read cannot discard a newer integration setting', async () => {
  let reject!: (reason: Error) => void;
  const cache = new SessionCache(() => new Promise<boolean>((_, fail) => { reject = fail; }));
  const pending = cache.get();
  await Promise.resolve();
  cache.set(true);
  reject(new Error('outdated read'));
  await assert.rejects(pending, /outdated read/);
  assert.equal(await cache.get(), true);
});
