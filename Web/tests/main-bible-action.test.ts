import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { isMainBibleAction, mainBibleActionScript } from '../src/main-bible-action.js';

test('main Bible action accepts the parallel view', () => {
  assert.equal(isMainBibleAction('parallel'), true);
  assert.equal(isMainBibleAction('unknown'), false);
});

test('parallel action opens the selected verse in the main window', async () => {
  const ref = { module:'rst', bookIndex:19, chapter:135, verse:26 };
  const events: string[] = [];
  const context = {
    bibleTextDialog:{ open:true, close:() => { events.push('dialog.close'); } },
    openBibleParallelPanel:async (received: unknown) => {
      assert.deepEqual(JSON.parse(JSON.stringify(received)), ref);
      events.push('parallel.open');
    }
  };

  const opened = await vm.runInNewContext(mainBibleActionScript('parallel', ref), context);
  assert.equal(opened, true);
  assert.deepEqual(events, ['dialog.close', 'parallel.open']);
});
