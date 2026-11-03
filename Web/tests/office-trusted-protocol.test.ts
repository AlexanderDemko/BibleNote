import assert from 'node:assert/strict';
import test from 'node:test';
import { ensureOfficeTrustedProtocol, officeTrustedProtocolRegistryPaths } from '../src/office-trusted-protocol.js';

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

test('existing trusted policies do not need write access', { skip:process.platform !== 'win32' }, () => {
  for (const protocol of ['bnverse', 'isbtbibleverse']) {
    const commands: string[] = [];
    assert.equal(ensureOfficeTrustedProtocol(protocol, (operation, registryPath) => {
      commands.push(`${operation}:${registryPath}`);
      return operation === 'query';
    }), true);
    assert.deepEqual(commands, officeTrustedProtocolRegistryPaths(protocol).map(key => `query:${key}`));
  }
});

test('creates only missing trusted policies', { skip:process.platform !== 'win32' }, () => {
  const keys = officeTrustedProtocolRegistryPaths('bnverse');
  const commands: string[] = [];
  assert.equal(ensureOfficeTrustedProtocol('bnverse', (operation, registryPath) => {
    commands.push(`${operation}:${registryPath}`);
    return operation === 'add' || registryPath !== keys[1];
  }), true);
  assert.deepEqual(commands, [`query:${keys[0]}`, `query:${keys[1]}`, `add:${keys[1]}`, `query:${keys[2]}`]);
});

test('reports failure when a missing trusted policy cannot be created', { skip:process.platform !== 'win32' }, () => {
  assert.equal(ensureOfficeTrustedProtocol('bnverse', () => false), false);
});
