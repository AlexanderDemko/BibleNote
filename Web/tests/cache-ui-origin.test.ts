import assert from 'node:assert/strict';
import test from 'node:test';
import { isCrossOriginStateChangingApiRequest } from '../src/cache-ui.js';

function request(method: string, origin?: string, host = '127.0.0.1:4310') {
  return {
    method,
    headers:{
      host,
      ...(origin ? { origin } : {})
    }
  };
}

test('state-changing API requests reject only a foreign Origin', () => {
  const ownOrigin = 'http://127.0.0.1:4310';
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    assert.equal(isCrossOriginStateChangingApiRequest(request(method, ownOrigin), '/api/test', 4310), false);
    assert.equal(isCrossOriginStateChangingApiRequest(request(method, 'https://example.com'), '/api/test', 4310), true);
    assert.equal(isCrossOriginStateChangingApiRequest(request(method), '/api/test', 4310), false);
  }
});

test('origin guard does not affect reads or non-API paths', () => {
  const foreign = request('GET', 'https://example.com');
  assert.equal(isCrossOriginStateChangingApiRequest(foreign, '/api/test', 4310), false);
  assert.equal(
    isCrossOriginStateChangingApiRequest(request('POST', 'https://example.com'), '/page/test', 4310),
    false
  );
});

test('origin guard uses the configured port when Host is absent', () => {
  const withoutHost = {
    method:'POST',
    headers:{ origin:'http://127.0.0.1:4310' }
  };
  assert.equal(isCrossOriginStateChangingApiRequest(withoutHost, '/api/test', 4310), false);
});
