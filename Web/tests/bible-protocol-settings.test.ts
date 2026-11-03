import assert from 'node:assert/strict';
import test from 'node:test';
import { BibleProtocolSettings, type BibleProtocolDependencies } from '../src/bible-protocol-settings.js';

const legacy = 'D:\\BibleNote 3\\ISBTCommandHandler.exe';
const legacyCommand = `"${legacy}" "%1"`;
const newCommand = '"C:\\BibleNote 4\\BibleNote.exe" "%1"';
const bridgeCommand = '"C:\\BibleNote 4\\BibleNote.exe" "--open-legacy-bible-link" "%1"';
type Commands = Awaited<ReturnType<BibleProtocolDependencies['readCommands']>>;

function fixture(initial: Commands) {
  let current = { ...initial };
  let previous: Commands = {};
  let hasLegacy = true;
  let failWrite = false;
  let failRegister = false;
  let needsNotification = false;
  let notifications = 0;
  const dependencies: BibleProtocolDependencies = {
    registered:() => !needsNotification && current.bnverse === newCommand && current.isbtbibleverse === newCommand,
    register:() => {
      current = { bnverse:newCommand, isbtbibleverse:failRegister ? current.isbtbibleverse : newCommand };
      needsNotification = true;
      return !failRegister;
    },
    notifyChanged:async () => { needsNotification = false; notifications += 1; },
    readCommands:async () => ({ ...current }),
    writeCommands:async commands => {
      current.bnverse = commands.bnverse;
      if (failWrite) { failWrite = false; throw new Error('registry write failed'); }
      current.isbtbibleverse = commands.isbtbibleverse;
    },
    loadPrevious:() => ({ ...previous }),
    savePrevious:commands => { previous = { ...commands }; },
    findLegacy:async () => hasLegacy ? legacy : undefined,
    legacyBridgeCommand:() => bridgeCommand,
    exists:executable => hasLegacy && executable === legacy
  };
  return {
    controller:() => new BibleProtocolSettings(dependencies),
    current:() => current,
    previous:() => previous,
    notifications:() => notifications,
    removeLegacy:() => { hasLegacy = false; },
    failWrite:() => { failWrite = true; },
    failRegister:() => { failRegister = true; }
  };
}

test('switching back restores both saved legacy commands even after repeated enabling and restart', async () => {
  const initial = { bnverse:legacyCommand + ' --original', isbtbibleverse:legacyCommand };
  const app = fixture(initial);
  await app.controller().setEnabled(true);
  assert.deepEqual(app.previous(), initial);
  await app.controller().setEnabled(true);
  assert.deepEqual(app.previous(), initial);
  await app.controller().setEnabled(false);
  assert.deepEqual(app.current(), { bnverse:bridgeCommand, isbtbibleverse:initial.isbtbibleverse });
  await app.controller().setEnabled(true);
  assert.deepEqual(app.current(), { bnverse:newCommand, isbtbibleverse:newCommand });
});

test('enabling refreshes Windows associations before confirming the new handler', async () => {
  const app = fixture({ bnverse:bridgeCommand, isbtbibleverse:legacyCommand });
  await app.controller().setEnabled(true);
  assert.equal(app.notifications(), 1);
  assert.deepEqual(app.current(), { bnverse:newCommand, isbtbibleverse:newCommand });
});

test('existing installations can restore v3 from its other protocol registrations without a backup', async () => {
  const app = fixture({ bnverse:newCommand, isbtbibleverse:newCommand });
  await app.controller().setEnabled(false);
  assert.deepEqual(app.current(), { bnverse:bridgeCommand, isbtbibleverse:legacyCommand });
});

test('missing or uninstalled v3 leaves the current handlers unchanged', async () => {
  const app = fixture({ bnverse:legacyCommand, isbtbibleverse:legacyCommand });
  await app.controller().setEnabled(true);
  app.removeLegacy();
  await assert.rejects(app.controller().setEnabled(false), /Старый BibleNote не найден/);
  assert.deepEqual(app.current(), { bnverse:newCommand, isbtbibleverse:newCommand });
});

test('a partial registry failure rolls both protocols back to v4', async () => {
  const app = fixture({ bnverse:newCommand, isbtbibleverse:newCommand });
  app.failWrite();
  await assert.rejects(app.controller().setEnabled(false), /registry write failed/);
  assert.deepEqual(app.current(), { bnverse:newCommand, isbtbibleverse:newCommand });
});

test('a failed registration of v4 restores the original handlers', async () => {
  const initial = { bnverse:legacyCommand, isbtbibleverse:legacyCommand };
  const app = fixture(initial);
  app.failRegister();
  await assert.rejects(app.controller().setEnabled(true), /Windows не подтвердила/);
  assert.deepEqual(app.current(), initial);
});
