export type MainBibleAction = 'reader' | 'notes' | 'parallel';

export function isMainBibleAction(value: unknown): value is MainBibleAction {
  return value === 'reader' || value === 'notes' || value === 'parallel';
}

export function mainBibleActionScript(action: MainBibleAction, ref: Record<string, unknown>): string {
  const serializedRef = JSON.stringify(ref);
  if (action === 'reader') {
    return `Promise.resolve(openBibleTextInReader(${serializedRef})).then(() => true)`;
  }
  const openAction = action === 'notes'
    ? `showBibleReaderVerseNotes(${serializedRef})`
    : `openBibleParallelPanel(${serializedRef})`;
  return `Promise.resolve((bibleTextDialog.open && bibleTextDialog.close(), ${openAction})).then(() => true)`;
}
