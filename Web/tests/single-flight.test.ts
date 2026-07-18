import assert from 'node:assert/strict';
import test from 'node:test';
import { SingleFlight } from '../src/single-flight.js';

test('single flight shares concurrent work for the same key', async () => {
  const flights = new SingleFlight<number>();
  let resolveTask!: (value: number) => void;
  let starts = 0;
  const task = () => {
    starts += 1;
    return new Promise<number>(resolve => { resolveTask = resolve; });
  };

  const first = flights.run('page-1:rst', task);
  const duplicate = flights.run('page-1:rst', task);

  assert.equal(first.started, true);
  assert.equal(duplicate.started, false);
  assert.strictEqual(duplicate.promise, first.promise);
  assert.equal(flights.size, 1);

  await Promise.resolve();
  assert.equal(starts, 1);
  resolveTask(42);
  assert.equal(await first.promise, 42);
  assert.equal(await duplicate.promise, 42);
  assert.equal(flights.size, 0);
});

test('single flight allows a retry after failed work', async () => {
  const flights = new SingleFlight<void>();
  const failed = flights.run('page-1:rst', async () => {
    throw new Error('parse failed');
  });

  await assert.rejects(failed.promise, /parse failed/);
  assert.equal(flights.has('page-1:rst'), false);

  const retry = flights.run('page-1:rst', async () => {});
  assert.equal(retry.started, true);
  await retry.promise;
  assert.equal(flights.size, 0);
});

test('single flight can serialize work for different keys', async () => {
  const flights = new SingleFlight<void>(1);
  let releaseFirst!: () => void;
  const order: string[] = [];
  const first = flights.run('page-1:rst', async () => {
    order.push('first-start');
    await new Promise<void>(resolve => { releaseFirst = resolve; });
    order.push('first-finish');
  });
  const second = flights.run('page-2:rst', async () => {
    order.push('second-start');
  });

  await Promise.resolve();
  assert.deepEqual(order, ['first-start']);
  releaseFirst();
  await Promise.all([first.promise, second.promise]);
  assert.deepEqual(order, ['first-start', 'first-finish', 'second-start']);
});
