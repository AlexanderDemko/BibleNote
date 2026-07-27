import assert from 'node:assert/strict';
import test from 'node:test';
import { officeTrustedProtocolRegistryPaths } from '../src/office-trusted-protocol.js';

test('trusts the BibleNote protocol only for supported Office generations', () => {
  assert.deepEqual(officeTrustedProtocolRegistryPaths('bnVerse:'), [
    'HKCU\\Software\\Policies\\Microsoft\\Office\\14.0\\Common\\Security\\Trusted Protocols\\All Applications\\bnVerse:',
    'HKCU\\Software\\Policies\\Microsoft\\Office\\15.0\\Common\\Security\\Trusted Protocols\\All Applications\\bnVerse:',
    'HKCU\\Software\\Policies\\Microsoft\\Office\\16.0\\Common\\Security\\Trusted Protocols\\All Applications\\bnVerse:'
  ]);
});

test('keeps the legacy BibleNote protocol trusted for existing links', () => {
  assert.deepEqual(officeTrustedProtocolRegistryPaths('isbtBibleVerse:'), [
    'HKCU\\Software\\Policies\\Microsoft\\Office\\14.0\\Common\\Security\\Trusted Protocols\\All Applications\\isbtBibleVerse:',
    'HKCU\\Software\\Policies\\Microsoft\\Office\\15.0\\Common\\Security\\Trusted Protocols\\All Applications\\isbtBibleVerse:',
    'HKCU\\Software\\Policies\\Microsoft\\Office\\16.0\\Common\\Security\\Trusted Protocols\\All Applications\\isbtBibleVerse:'
  ]);
});

test('rejects an unsafe protocol name before constructing a registry path', () => {
  assert.throws(
    () => officeTrustedProtocolRegistryPaths('isbtBibleVerse\\shell\\open'),
    /Invalid URL protocol name/
  );
});
