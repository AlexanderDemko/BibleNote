import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

type Listener = () => void;

class FakeElement {
  value = '';
  disabled = false;
  textContent = '';
  src = '';
  open = false;
  private readonly listeners = new Map<string, Listener[]>();

  addEventListener(name: string, listener: Listener): void {
    this.listeners.set(name, [...(this.listeners.get(name) ?? []), listener]);
  }

  dispatch(name: string): void {
    for (const listener of this.listeners.get(name) ?? []) listener();
  }

  showModal(): void {
    this.open = true;
  }

  close(): void {
    this.open = false;
    this.dispatch('close');
  }
}

function nextTurn(): Promise<void> {
  return new Promise(resolve => setImmediate(resolve));
}

test('MyBible map review can be selected, opened, and stopped from settings', async () => {
  const scriptPath = fileURLToPath(new URL('../ui/mybible-settings.js', import.meta.url));
  const script = fs.readFileSync(scriptPath, 'utf8');
  const ids = [
    'myBibleReviewMapPath', 'selectMyBibleReviewMap',
    'myBibleReviewFootnotesPath', 'selectMyBibleReviewFootnotes', 'openMyBibleReview',
    'myBibleReviewStatus', 'myBibleReviewDialog', 'myBibleReviewFrame',
    'myBibleReviewDialogPath', 'closeMyBibleReview'
  ];
  const elements = new Map(ids.map(id => [id, new FakeElement()]));
  const stored = new Map<string, string>();
  const requests: Array<{ pathname: string; options?: Record<string, unknown> }> = [];
  const mapPath = path.resolve('C:/maps/rst-plus-map.json');
  const footnotesPath = path.resolve('C:/maps/BTI.commentaries.SQLite3');

  const context = {
    document:{ getElementById:(id: string) => elements.get(id) },
    localStorage:{
      getItem:(key: string) => stored.get(key) ?? null,
      setItem:(key: string, value: string) => stored.set(key, value),
      removeItem:(key: string) => stored.delete(key)
    },
    api:async (pathname: string, options?: Record<string, unknown>) => {
      requests.push({ pathname, options });
      if (pathname.includes('kind=mybible-map')) return { canceled:false, filePath:mapPath };
      if (pathname.includes('kind=mybible-footnotes')) return { canceled:false, filePath:footnotesPath };
      if (pathname === '/api/mybible/review/start') {
        return { active:true, mapPath, url:'http://127.0.0.1:43210/?token=test' };
      }
      if (pathname === '/api/mybible/review/stop') return { active:false };
      throw new Error(`Unexpected request: ${pathname}`);
    }
  };
  vm.runInNewContext(script, context);

  const openButton = elements.get('openMyBibleReview')!;
  assert.equal(openButton.disabled, true);
  elements.get('selectMyBibleReviewMap')!.dispatch('click');
  await nextTurn();
  assert.equal(elements.get('myBibleReviewMapPath')!.value, mapPath);
  assert.equal(stored.get('biblenote.myBibleReviewMapPath'), mapPath);
  assert.equal(openButton.disabled, false);

  elements.get('selectMyBibleReviewFootnotes')!.dispatch('click');
  await nextTurn();
  assert.equal(elements.get('myBibleReviewFootnotesPath')!.value, footnotesPath);
  assert.equal(stored.get('biblenote.myBibleReviewFootnotesPath'), footnotesPath);

  openButton.dispatch('click');
  await nextTurn();
  assert.equal(elements.get('myBibleReviewDialog')!.open, true);
  assert.equal(elements.get('myBibleReviewFrame')!.src, 'http://127.0.0.1:43210/?token=test');
  assert.deepEqual(
    JSON.parse(String(requests.find(request => request.pathname === '/api/mybible/review/start')?.options?.body)),
    { mapPath, footnotesPath }
  );

  elements.get('closeMyBibleReview')!.dispatch('click');
  await nextTurn();
  assert.equal(elements.get('myBibleReviewDialog')!.open, false);
  assert.equal(elements.get('myBibleReviewFrame')!.src, 'about:blank');
  assert.equal(requests.some(request => request.pathname === '/api/mybible/review/stop'), true);
});
