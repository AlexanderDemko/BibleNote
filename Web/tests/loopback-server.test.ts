import assert from 'node:assert/strict';
import http, { type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { listenOnLoopbackWithFallback } from '../src/loopback-server.js';

function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  });
}

test('uses the preferred loopback port when it is available', async () => {
  const server = http.createServer();
  try {
    const result = await listenOnLoopbackWithFallback(server, 0);
    assert.equal(result.port, (server.address() as AddressInfo).port);
    assert.equal(result.usedFallback, false);
  } finally {
    await close(server);
  }
});

test('uses another loopback port when the preferred port is occupied', async () => {
  const occupied = http.createServer();
  const server = http.createServer();
  try {
    const occupiedResult = await listenOnLoopbackWithFallback(occupied, 0);
    const result = await listenOnLoopbackWithFallback(server, occupiedResult.port);

    assert.notEqual(result.port, occupiedResult.port);
    assert.equal(result.port, (server.address() as AddressInfo).port);
    assert.equal(result.usedFallback, true);
  } finally {
    if (server.listening) await close(server);
    await close(occupied);
  }
});
