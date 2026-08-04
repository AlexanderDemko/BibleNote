import type { Page } from '@playwright/test';
import { test, expect, type E2EApp } from '../../fixtures/app.fixture.js';

async function seedRelationEndpoints(page: Page, app: E2EApp) {
  const response = await page.request.post(`${app.baseUrl}/api/inductive/annotations`, {
    data:{ annotations:[
      {
        module:'rst', bookIndex:43, chapter:1, verse:1,
        startOffset:0, endOffset:8, quote:'В начале', styleId:'keyword'
      },
      {
        module:'rst', bookIndex:43, chapter:1, verse:2,
        startOffset:9, endOffset:17, quote:'в начале', styleId:'keyword'
      }
    ] }
  });
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  expect(body.annotations).toHaveLength(2);
  return body.annotations as Array<{ id:string }>;
}

async function chapterRelations(page: Page, app: E2EApp) {
  const response = await page.request.get(`${app.baseUrl}/api/inductive/relations?module=rst&bookIndex=43&chapter=1`);
  expect(response.ok()).toBeTruthy();
  return (await response.json()).relations as Array<Record<string, string>>;
}

function relationPayload(type:'contrast' | 'comparison' | 'cause' | 'conclusion', note?:string) {
  return {
    module:'rst',
    bookIndex:43,
    chapter:1,
    source:{ verse:1, startOffset:0, endOffset:8, quote:'В начале' },
    target:{ verse:2, startOffset:9, endOffset:17, quote:'в начале' },
    type,
    note
  };
}

async function selectVerseRange(page:Page, verse:number, startOffset:number, endOffset:number) {
  await page.locator(`#bible-verse-1-${verse} .bible-reader-verse-text`).evaluate((element, offsets) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const nodes:Array<{ node:Text; start:number; end:number }> = [];
    let cursor = 0;
    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      nodes.push({ node, start:cursor, end:cursor + node.data.length });
      cursor += node.data.length;
    }
    const start = nodes.find(item => offsets.startOffset >= item.start && offsets.startOffset <= item.end);
    const end = nodes.find(item => offsets.endOffset >= item.start && offsets.endOffset <= item.end);
    if (!start || !end) throw new Error('Selection offsets are outside verse text.');
    const range = document.createRange();
    range.setStart(start.node, offsets.startOffset - start.start);
    range.setEnd(end.node, offsets.endOffset - end.start);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    const rect = range.getBoundingClientRect();
    const eventOptions = {
      bubbles:true,
      clientX:rect.right - Math.min(2, rect.width / 2),
      clientY:rect.top + rect.height / 2
    };
    element.dispatchEvent(new MouseEvent('mouseup', eventOptions));
    element.dispatchEvent(new MouseEvent('click', eventOptions));
  }, { startOffset, endOffset });
}

async function clickVerseWord(page:Page, verse:number, startOffset:number, endOffset:number) {
  const point = await page.locator(`#bible-verse-1-${verse} .bible-reader-verse-text`).evaluate((element, offsets) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const nodes:Array<{ node:Text; start:number; end:number }> = [];
    let cursor = 0;
    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      nodes.push({ node, start:cursor, end:cursor + node.data.length });
      cursor += node.data.length;
    }
    const start = nodes.find(item => offsets.startOffset >= item.start && offsets.startOffset <= item.end);
    const end = nodes.find(item => offsets.endOffset >= item.start && offsets.endOffset <= item.end);
    if (!start || !end) throw new Error('Word offsets are outside verse text.');
    const range = document.createRange();
    range.setStart(start.node, offsets.startOffset - start.start);
    range.setEnd(end.node, offsets.endOffset - end.start);
    const rect = range.getBoundingClientRect();
    return { x:rect.left + rect.width / 2, y:rect.top + rect.height / 2 };
  }, { startOffset, endOffset });
  await page.mouse.click(point.x, point.y);
}

test('@inductive связь редактируется, меняет направление и выделяет обе отметки', async ({ app, appPage:page }) => {
  await seedRelationEndpoints(page, app);
  const createResponse = await page.request.post(`${app.baseUrl}/api/inductive/relations`, {
    data:relationPayload('comparison', 'исходная связь')
  });
  expect(createResponse.ok()).toBeTruthy();
  const original = (await createResponse.json()).relation as Record<string, string>;

  await page.goto(`${app.baseUrl}/bible/rst/43/1`);
  await page.locator('#bible-verse-1-1 .inductive-mark').click();

  await expect(page.locator('.inductive-mark.relation-active')).toHaveCount(2);
  await expect(page.locator('.inductive-relation-overlay')).toHaveCount(0);
  await expect(page.locator('.inductive-relation-endpoint[data-relations="≈"]')).toHaveCount(2);

  await page.locator(`.inductive-relation-row[data-relation-id="${original.id}"] .inductive-relation-edit`).click();
  const editForm = page.locator('.inductive-relation-form[data-mode="edit"]');
  await expect(editForm).toBeVisible();
  await editForm.locator('select[name="type"]').selectOption('cause');
  await editForm.locator('.inductive-relation-reverse').click();
  await editForm.locator('input[name="note"]').fill('обновлённая связь');
  await editForm.getByRole('button', { name:'Сохранить' }).click();

  await expect(page.locator(`.inductive-relation-row[data-relation-id="${original.id}"]`)).toContainText('обновлённая связь');
  await expect(page.locator('.inductive-mark.relation-active')).toHaveCount(2);
  const [updated] = await chapterRelations(page, app);
  expect(updated.type).toBe('cause');
  expect(updated.note).toBe('обновлённая связь');
  expect(updated.sourceVerse).toBe(original.targetVerse);
  expect(updated.sourceStartOffset).toBe(original.targetStartOffset);
  expect(updated.targetVerse).toBe(original.sourceVerse);
  expect(updated.targetStartOffset).toBe(original.sourceStartOffset);
  await expect(page.locator('#bible-verse-1-2 .inductive-relation-endpoint[data-relations="①→"]')).toHaveCount(1);
  await expect(page.locator('#bible-verse-1-1 .inductive-relation-endpoint[data-relations="→②"]')).toHaveCount(1);
});

test('@inductive создание, изменение и удаление связи имеют многошаговые Отменить и Вернуть', async ({ app, appPage:page }) => {
  await page.goto(`${app.baseUrl}/bible/rst/43/1`);
  await page.locator('.inductive-mode-button').click();

  await selectVerseRange(page, 1, 0, 8);
  await page.locator('.inductive-popover-relation[data-type="cause"]').click();
  await expect(page.locator('.inductive-relation-status')).toContainText('нажмите на второе слово');
  const chapterHint = page.locator('.inductive-relation-chapter-hint');
  await expect(chapterHint).toBeVisible();
  await expect(chapterHint).toContainText('выберите второе слово или выделите фразу');
  await expect(chapterHint).toContainText('Esc — отменить');
  await clickVerseWord(page, 2, 11, 17);
  await expect(chapterHint).toBeHidden();
  await expect(page.locator('.inductive-relation-row')).toHaveCount(1);
  await expect(page.locator('.inductive-relation-status.created'))
    .toContainText('Связь «Причина → следствие» сохранена.');
  await expect(page.locator('.inductive-relation-endpoint')).toHaveCount(2);
  await expect(page.locator('.inductive-mark')).toHaveCount(0);

  const [created] = await chapterRelations(page, app);
  expect(created.targetStartOffset).toBe(11);
  expect(created.targetEndOffset).toBe(17);
  expect(created.targetQuote).toBe('начале');

  const undo = page.locator('.inductive-undo-button');
  const redo = page.locator('.inductive-redo-button');
  await undo.click();
  await expect(page.locator('.inductive-relation-row')).toHaveCount(0);
  await redo.click();
  await expect(page.locator('.inductive-relation-row')).toHaveCount(1);

  await page.locator('.inductive-relation-edit').click();
  let editForm = page.locator('.inductive-relation-form[data-mode="edit"]');
  await editForm.locator('input[name="note"]').fill('первая версия');
  await editForm.getByRole('button', { name:'Сохранить' }).click();
  await expect(page.locator('.inductive-relation-row')).toContainText('первая версия');

  await page.locator('.inductive-relation-edit').click();
  editForm = page.locator('.inductive-relation-form[data-mode="edit"]');
  await editForm.locator('select[name="type"]').selectOption('contrast');
  await editForm.locator('input[name="note"]').fill('вторая версия');
  await editForm.getByRole('button', { name:'Сохранить' }).click();
  await expect(page.locator('.inductive-relation-row')).toContainText('вторая версия');

  await undo.click();
  await expect(page.locator('.inductive-relation-row')).toContainText('первая версия');
  await redo.click();
  await expect(page.locator('.inductive-relation-row')).toContainText('вторая версия');

  await page.locator('.inductive-relation-delete').click();
  await expect(page.locator('.inductive-relation-row')).toHaveCount(0);
  await undo.click();
  await expect(page.locator('.inductive-relation-row')).toContainText('вторая версия');
  await undo.click();
  await expect(page.locator('.inductive-relation-row')).toContainText('первая версия');
  await redo.click();
  await expect(page.locator('.inductive-relation-row')).toContainText('вторая версия');
  await redo.click();
  await expect(page.locator('.inductive-relation-row')).toHaveCount(0);

  expect(await chapterRelations(page, app)).toHaveLength(0);
});

test('@inductive неполное выделение второй фразы расширяется до целых слов и создаёт одну связь', async ({ app, appPage:page }) => {
  await page.goto(`${app.baseUrl}/bible/rst/43/1`);
  await page.locator('.inductive-mode-button').click();

  await selectVerseRange(page, 1, 4, 6);
  await page.locator('.inductive-popover-relation[data-type="comparison"]').click();
  await selectVerseRange(page, 2, 13, 22);

  await expect(page.locator('.inductive-relation-row')).toHaveCount(1);
  const [created] = await chapterRelations(page, app);
  expect(created.sourceStartOffset).toBe(2);
  expect(created.sourceEndOffset).toBe(8);
  expect(created.sourceQuote).toBe('начале');
  expect(created.targetStartOffset).toBe(11);
  expect(created.targetEndOffset).toBe(24);
  expect(created.targetQuote).toBe('начале у Бога');
});

test('@inductive одинаковые стороны связи отклоняются понятной подсказкой без закрытия главы', async ({ app, appPage:page }) => {
  await page.goto(`${app.baseUrl}/bible/rst/43/1`);
  await page.locator('.inductive-mode-button').click();

  await selectVerseRange(page, 1, 4, 6);
  await page.locator('.inductive-popover-relation[data-type="comparison"]').click();
  await clickVerseWord(page, 1, 2, 8);

  await expect(page.locator('.inductive-relation-status.invalid'))
    .toContainText('Этот фрагмент уже выбран как первая сторона связи. Выберите другое слово или фразу.');
  await expect(page.locator('.inductive-relation-row')).toHaveCount(0);
  await expect(page.locator('.error-box')).toHaveCount(0);
  await expect(page.locator('#bible-verse-1-1')).toBeVisible();
  expect(await chapterRelations(page, app)).toHaveLength(0);
});

test('@inductive удаление ранее сохранённой связи записывается в пустую историю', async ({ app, appPage:page }) => {
  const createResponse = await page.request.post(`${app.baseUrl}/api/inductive/relations`, {
    data:relationPayload('comparison')
  });
  expect(createResponse.ok()).toBeTruthy();

  await page.goto(`${app.baseUrl}/bible/rst/43/1`);
  const undo = page.locator('.inductive-undo-button');
  const redo = page.locator('.inductive-redo-button');
  const observationCount = page.locator('.inductive-panel-header span');
  await expect(undo).toBeDisabled();
  await expect(observationCount).toHaveText('1');

  await page.locator('.inductive-relation-delete').click();
  await expect(page.locator('.inductive-relation-row')).toHaveCount(0);
  await expect(observationCount).toHaveText('0');
  await expect(undo).toBeEnabled();
  await expect(undo).toHaveAttribute('title', /в истории: 1/);

  await undo.click();
  await expect(page.locator('.inductive-relation-row')).toHaveCount(1);
  await expect(observationCount).toHaveText('1');
  await expect(redo).toBeEnabled();
  await redo.click();
  await expect(page.locator('.inductive-relation-row')).toHaveCount(0);
  await expect(observationCount).toHaveText('0');
});

test('@inductive экспортированная глава импортируется вместе со стилями, отметками и связями без дублей', async ({ app, appPage:page }) => {
  const styleResponse = await page.request.post(`${app.baseUrl}/api/inductive/styles`, {
    data:{
      name:'Завет для импорта',
      symbol:'◇',
      color:'#245b82',
      backgroundColor:'#dceefa',
      decoration:'box'
    }
  });
  expect(styleResponse.ok()).toBeTruthy();
  const exportedStyle = (await styleResponse.json()).style as Record<string, string>;
  const annotationsResponse = await page.request.post(`${app.baseUrl}/api/inductive/annotations`, {
    data:{ annotations:[
      {
        module:'rst', bookIndex:43, chapter:1, verse:1,
        startOffset:0, endOffset:8, quote:'В начале', styleId:exportedStyle.id
      },
      {
        module:'rst', bookIndex:43, chapter:1, verse:2,
        startOffset:9, endOffset:17, quote:'в начале', styleId:exportedStyle.id
      }
    ] }
  });
  const exportedAnnotations = (await annotationsResponse.json()).annotations as Array<{ id:string }>;
  const relationResponse = await page.request.post(`${app.baseUrl}/api/inductive/relations`, {
    data:relationPayload('comparison', 'связь из файла')
  });
  const exportedRelation = (await relationResponse.json()).relation as { id:string };

  await page.goto(`${app.baseUrl}/bible/rst/43/1`);
  await expect(page.locator('#exportInductiveMarkings')).toBeEnabled();
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#exportInductiveMarkings').evaluate((button:HTMLButtonElement) => button.click());
  const download = await downloadPromise;
  const exportedFile = await download.path();
  expect(exportedFile).toBeTruthy();

  await page.request.patch(`${app.baseUrl}/api/inductive/styles/${exportedStyle.id}`, {
    data:{
      name:'Изменён после экспорта',
      symbol:'!',
      color:'#aa2222',
      backgroundColor:'#ffeeee',
      decoration:'wavy'
    }
  });
  await page.request.delete(`${app.baseUrl}/api/inductive/relations/${exportedRelation.id}`);
  for (const annotation of exportedAnnotations) {
    await page.request.delete(`${app.baseUrl}/api/inductive/annotations/${annotation.id}`);
  }

  const importFile = page.locator('#importInductiveMarkingsFile');
  await importFile.setInputFiles(exportedFile!);
  await expect(page.locator('#importInductiveMarkingsStatus')).toContainText('отметок — 2, связей — 1');
  await expect(page.locator('#bible-verse-1-1 .inductive-mark')).toContainText('В начале');
  await expect(page.locator('.inductive-relation-row')).toContainText('связь из файла');

  await expect(page.locator('#importInductiveMarkings')).toBeEnabled();
  await importFile.setInputFiles(exportedFile!);
  await expect(page.locator('#importInductiveMarkings')).toBeEnabled();

  const annotationsAfterImport = await page.request.get(`${app.baseUrl}/api/inductive/annotations?module=rst&bookIndex=43&chapter=1`);
  expect((await annotationsAfterImport.json()).annotations).toHaveLength(2);
  expect(await chapterRelations(page, app)).toHaveLength(1);
  const stylesAfterImport = await page.request.get(`${app.baseUrl}/api/inductive/styles`);
  const restoredStyle = (await stylesAfterImport.json()).styles.find((style:Record<string, string>) => style.id === exportedStyle.id);
  expect(restoredStyle).toMatchObject({
    name:'Завет для импорта',
    symbol:'◇',
    color:'#245b82',
    backgroundColor:'#dceefa',
    decoration:'box'
  });
});

test('@inductive экспорт и импорт всей Библии переносит разметку разных глав', async ({ app, appPage:page }) => {
  const annotationsResponse = await page.request.post(`${app.baseUrl}/api/inductive/annotations`, {
    data:{ annotations:[
      {
        module:'rst', bookIndex:43, chapter:1, verse:1,
        startOffset:0, endOffset:8, quote:'В начале', styleId:'keyword'
      },
      {
        module:'rst', bookIndex:43, chapter:2, verse:1,
        startOffset:0, endOffset:5, quote:'Слово', styleId:'keyword'
      }
    ] }
  });
  expect(annotationsResponse.ok()).toBeTruthy();
  const annotations = (await annotationsResponse.json()).annotations as Array<{ id:string }>;
  const relationResponse = await page.request.post(`${app.baseUrl}/api/inductive/relations`, {
    data:{
      module:'rst', bookIndex:43, chapter:2,
      source:{ verse:1, startOffset:0, endOffset:5, quote:'Слово' },
      target:{ verse:2, startOffset:6, endOffset:9, quote:'Бог' },
      type:'comparison', note:'между главами экспорта'
    }
  });
  expect(relationResponse.ok()).toBeTruthy();
  const relation = (await relationResponse.json()).relation as { id:string };

  await page.goto(`${app.baseUrl}/bible/rst/43/1`);
  await expect(page.locator('#exportInductiveMarkings')).toHaveText('Экспортировать разметку текущей главы');
  await expect(page.locator('#exportAllInductiveMarkings')).toHaveText('Экспортировать разметку всей Библии');
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#exportAllInductiveMarkings').evaluate((button:HTMLButtonElement) => button.click());
  const download = await downloadPromise;
  const exportedFile = await download.path();
  expect(exportedFile).toBeTruthy();
  await expect(page.locator('#importInductiveMarkingsStatus')).toContainText('Экспортировано: глав — 2, отметок — 2, связей — 1');

  await page.request.delete(`${app.baseUrl}/api/inductive/relations/${relation.id}`);
  for (const annotation of annotations) {
    await page.request.delete(`${app.baseUrl}/api/inductive/annotations/${annotation.id}`);
  }

  await page.locator('#importInductiveMarkingsFile').setInputFiles(exportedFile!);
  await expect(page.locator('#importInductiveMarkingsStatus'))
    .toContainText('Импортирована разметка всей Библии');
  const chapterOne = await page.request.get(`${app.baseUrl}/api/inductive/annotations?module=rst&bookIndex=43&chapter=1`);
  const chapterTwo = await page.request.get(`${app.baseUrl}/api/inductive/annotations?module=rst&bookIndex=43&chapter=2`);
  const chapterTwoRelations = await page.request.get(`${app.baseUrl}/api/inductive/relations?module=rst&bookIndex=43&chapter=2`);
  expect((await chapterOne.json()).annotations).toHaveLength(1);
  expect((await chapterTwo.json()).annotations).toHaveLength(1);
  expect((await chapterTwoRelations.json()).relations).toHaveLength(1);
});
