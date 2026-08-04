import { test, expect } from '../../fixtures/app.fixture.js';

test('@notes дерево раскрывает блокнот, раздел и дочернюю страницу', async ({ appPage: page }) => {
  const source = page.locator('#tree > .source-row').filter({ hasText:'OneNote Cloud' });
  await expect(source).toBeVisible();
  await source.click();
  await page.locator('#tree > .tree-row').filter({ hasText: 'Учебный блокнот' }).click();
  await page.locator('#tree .section-row').filter({ hasText: 'Евангелие от Иоанна' }).click();

  const firstPage = page.locator('#tree .page-row').filter({ hasText: 'Благодать и надежда' });
  const secondPage = page.locator('#tree .page-row').filter({ hasText: 'Молитва учеников' });
  await expect(firstPage).toBeVisible();
  await expect(secondPage).toBeVisible();

  await secondPage.click();
  await expect(page.locator('#content h2')).toHaveText('Молитва учеников');
  await expect(page.locator('#content .page-text')).toContainText('сохраняли верность');
  await expect(page).toHaveURL(/\/page\/page-prayer$/);
});

test('@notes совпадающее имя файлового источника и корневой папки не дублируется', async ({ appPage: page }) => {
  await page.route('**/api/data-sources', route => route.fulfill({
    status:200,
    contentType:'application/json',
    body:JSON.stringify([{ id:'source:folder:literature', type:'folder', displayName:'Доп. Литература' }])
  }));
  await page.route('**/api/notebooks', route => route.fulfill({
    status:200,
    contentType:'application/json',
    body:JSON.stringify([
      {
        id:'folder:notebook:literature',
        displayName:'Доп литература',
        sourceId:'source:folder:literature',
        sourceType:'folder',
        sourceDisplayName:'Доп. Литература',
        pageCount:4
      },
      {
        id:'folder:notebook:archive',
        displayName:'Архив',
        sourceId:'source:folder:literature',
        sourceType:'folder',
        sourceDisplayName:'Доп. Литература',
        pageCount:2
      }
    ])
  }));
  await page.route('**/api/sections?**', route => {
    const notebookId = new URL(route.request().url()).searchParams.get('notebookId');
    return route.fulfill({
      status:200,
      contentType:'application/json',
      body:JSON.stringify(notebookId === 'folder:notebook:literature' ? [
        {
          id:'folder:section:literature-root',
          displayName:'Доп литература',
          parentGroupId:null,
          pageCount:1,
          scanComplete:1
        },
        {
          id:'folder:section:commentary-files',
          displayName:'Файлы',
          parentGroupId:'folder:group:commentary',
          pageCount:1,
          scanComplete:1
        }
      ] : [])
    });
  });
  await page.route('**/api/section-groups?**', route => {
    const notebookId = new URL(route.request().url()).searchParams.get('notebookId');
    return route.fulfill({
      status:200,
      contentType:'application/json',
      body:JSON.stringify(notebookId === 'folder:notebook:literature' ? [
        {
          id:'folder:group:commentary',
          displayName:'Bible_MakArthur',
          parentGroupId:null,
          sectionCount:1
        },
        {
          id:'folder:group:old-testament',
          displayName:'Ветхий Завет',
          parentGroupId:'folder:group:commentary',
          sectionCount:1
        }
      ] : [])
    });
  });
  await page.route('**/api/pages?**', route => {
    const sectionId = new URL(route.request().url()).searchParams.get('sectionId');
    const nested = sectionId === 'folder:section:commentary-files';
    return route.fulfill({
      status:200,
      contentType:'application/json',
      body:JSON.stringify([
        {
          id:nested ? 'folder:page:nested-file' : 'folder:page:root-file',
          title:nested ? 'Файл рядом с подпапкой' : 'Файл в корне',
          fileExtension:nested ? '.pdf' : '.docx',
          pageLevel:0,
          hasContent:1,
          fetchError:null
        },
        {
          id:'folder:page:office-lock',
          title:'~$временный файл Word',
          fileExtension:'.docx',
          pageLevel:0,
          hasContent:0,
          fetchError:'locked'
        }
      ])
    });
  });
  await page.reload();

  const source = page.locator('#tree > .source-row').filter({ hasText:'Доп. Литература' });
  await expect(source).toHaveCount(1);
  await source.click();
  await expect(source.locator('.chevron')).toHaveClass(/open/);
  await expect(page.locator('#tree > .tree-row.level-1').filter({ hasText:'Доп литература' })).toHaveCount(0);
  await expect(page.locator('#tree > .tree-row.level-1').filter({ hasText:'Архив' })).toHaveCount(1);
  const rootFile = page.locator('#tree > .page-row.level-1').filter({ hasText:'Файл в корне' });
  const siblingFolder = page.locator('#tree > .tree-row.level-1').filter({ hasText:'Bible_MakArthur' });
  await expect(rootFile).toHaveCount(1);
  await expect(siblingFolder).toHaveCount(1);
  await expect(page.locator('#tree > .page-row').filter({ hasText:'~$временный файл Word' })).toHaveCount(0);
  await expect(rootFile.locator('.file-type-icon.word')).toHaveAttribute('title', 'Word DOCX');
  const labelIndentDifference = await page.evaluate(() => {
    const fileLabel = [...document.querySelectorAll('#tree > .page-row.level-1')]
      .find(row => row.textContent?.includes('Файл в корне'))?.querySelector('.label')?.getBoundingClientRect();
    const folderLabel = [...document.querySelectorAll('#tree > .tree-row.level-1')]
      .find(row => row.textContent?.includes('Bible_MakArthur'))?.querySelector('.label')?.getBoundingClientRect();
    return fileLabel && folderLabel ? Math.abs(fileLabel.left - folderLabel.left) : Number.POSITIVE_INFINITY;
  });
  expect(labelIndentDifference).toBeLessThanOrEqual(1);

  await siblingFolder.click();
  await expect(page.locator('#tree > .section-row').filter({ hasText:'Файлы' })).toHaveCount(0);
  const nestedFile = page.locator('#tree > .page-row.level-2').filter({ hasText:'Файл рядом с подпапкой' });
  const nestedFolder = page.locator('#tree > .tree-row.level-2').filter({ hasText:'Ветхий Завет' });
  await expect(nestedFile).toHaveCount(1);
  await expect(nestedFolder).toHaveCount(1);
  await expect(nestedFile.locator('.file-type-icon.pdf')).toHaveAttribute('title', 'PDF');
  const nestedIndentDifference = await page.evaluate(() => {
    const fileLabel = [...document.querySelectorAll('#tree > .page-row.level-2')]
      .find(row => row.textContent?.includes('Файл рядом с подпапкой'))?.querySelector('.label')?.getBoundingClientRect();
    const folderLabel = [...document.querySelectorAll('#tree > .tree-row.level-2')]
      .find(row => row.textContent?.includes('Ветхий Завет'))?.querySelector('.label')?.getBoundingClientRect();
    return fileLabel && folderLabel ? Math.abs(fileLabel.left - folderLabel.left) : Number.POSITIVE_INFINITY;
  });
  expect(nestedIndentDifference).toBeLessThanOrEqual(1);
});

test('@notes синхронизация строк появляется при наведении и использует общую правую колонку', async ({ appPage: page }) => {
  const source = page.locator('#tree > .source-row').filter({ hasText:'OneNote Cloud' });
  const sourceSync = source.locator('.tree-sync');
  await expect(sourceSync).toHaveCSS('opacity', '0');

  await source.hover();
  await expect(sourceSync).toHaveCSS('opacity', '1');
  await source.click();
  await page.locator('#tree > .tree-row').filter({ hasText:'Учебный блокнот' }).click();
  await page.locator('#tree .section-row').filter({ hasText:'Евангелие от Иоанна' }).click();

  const pageRow = page.locator('#tree .page-row').filter({ hasText:'Благодать и надежда' });
  await expect(pageRow).toBeVisible();
  const pageSync = pageRow.locator('.tree-sync');
  await expect(pageSync).toHaveCSS('opacity', '0');
  await pageRow.hover();
  await expect(pageSync).toHaveCSS('opacity', '1');

  const positions = await page.locator('#tree .tree-sync').evaluateAll(elements => elements.map(element => element.getBoundingClientRect().right));
  expect(Math.max(...positions) - Math.min(...positions)).toBeLessThanOrEqual(1);
  const gapToScrollbar = await page.evaluate(() => {
    const sync = document.querySelector('#tree .page-row:hover .tree-sync');
    const scrollbar = document.querySelector('#treeScrollbar');
    if (!sync || !scrollbar) return -1;
    return scrollbar.getBoundingClientRect().left - sync.getBoundingClientRect().right;
  });
  expect(gapToScrollbar).toBeGreaterThanOrEqual(4);
});

test('@notes нижний отступ дерева сам по себе не включает прокрутку', async ({ appPage: page }) => {
  const tree = page.locator('#tree');
  const fitsWithoutArtificialOverflow = await tree.evaluate(element => {
    const rows = [...element.querySelectorAll(':scope > .tree-row')];
    const rowsHeight = rows.reduce((sum, row) => sum + row.getBoundingClientRect().height, 0);
    element.style.height = `${Math.ceil(rowsHeight) + 10}px`;
    return element.scrollHeight <= element.clientHeight;
  });
  expect(fitsWithoutArtificialOverflow).toBe(true);
});

test('@notes панель выровнена с Библией, а источники имеют одинаковую ширину', async ({ appPage: page }) => {
  await page.route('**/api/data-sources', route => route.fulfill({
    status:200,
    contentType:'application/json',
    body:JSON.stringify([
      { id:'source:graph', type:'graph', displayName:'OneNote Cloud' },
      { id:'source:folder:notes', type:'folder', displayName:'Доп. литература' }
    ])
  }));
  await page.route('**/api/notebooks', route => route.fulfill({
    status:200,
    contentType:'application/json',
    body:JSON.stringify([
      {
        id:'graph:notebook:main',
        displayName:'Основной',
        sourceId:'source:graph',
        sourceType:'graph',
        sourceDisplayName:'OneNote Cloud',
        pageCount:12
      },
      {
        id:'folder:notebook:notes',
        displayName:'Доп литература',
        sourceId:'source:folder:notes',
        sourceType:'folder',
        sourceDisplayName:'Доп. литература',
        pageCount:4
      }
    ])
  }));
  await page.reload();
  await expect(page.locator('#tree > .source-row')).toHaveCount(2);

  const alignment = await page.evaluate(() => {
    const notes = document.querySelector('.notes-panel')?.getBoundingClientRect();
    const bible = document.querySelector('.bible-reader-panel')?.getBoundingClientRect();
    const sourceBounds = [...document.querySelectorAll('#tree > .source-row')]
      .map(row => row.getBoundingClientRect());
    const sourceWidths = sourceBounds.map(bounds => bounds.width);
    const countTextRights = [...document.querySelectorAll('#tree > .source-row .count')].map(count => {
      const range = document.createRange();
      range.selectNodeContents(count);
      return range.getBoundingClientRect().right;
    });
    return {
      leftDifference:notes && bible ? Math.abs(notes.left - bible.left) : Number.POSITIVE_INFINITY,
      rightDifference:notes && bible ? Math.abs(notes.right - bible.right) : Number.POSITIVE_INFINITY,
      sourceRightDifference:notes && sourceBounds.length
        ? Math.max(...sourceBounds.map(bounds => Math.abs(notes.right - bounds.right)))
        : Number.POSITIVE_INFINITY,
      sourceWidthDifference:sourceWidths.length > 1 ? Math.max(...sourceWidths) - Math.min(...sourceWidths) : Number.POSITIVE_INFINITY,
      countRightDifference:countTextRights.length > 1 ? Math.max(...countTextRights) - Math.min(...countTextRights) : Number.POSITIVE_INFINITY
    };
  });
  expect(alignment.leftDifference).toBeLessThanOrEqual(1);
  expect(alignment.rightDifference).toBeLessThanOrEqual(1);
  expect(alignment.sourceRightDifference).toBeLessThanOrEqual(1);
  expect(alignment.sourceWidthDifference).toBeLessThanOrEqual(1);
  expect(alignment.countRightDifference).toBeLessThanOrEqual(1);
});

test('@notes вкладка последних заметок открывает ранее просмотренную страницу', async ({ appPage: page }) => {
  await page.locator('#notesRecentView').click();
  const recentPage = page.locator('#tree .recent-page-row').filter({ hasText: 'Благодать и надежда' });
  await expect(recentPage).toBeVisible();
  await recentPage.click();
  await expect(page.locator('#content h2')).toHaveText('Благодать и надежда');
});

test('@notes раскрытая панель ссылок не дублирует ссылки и навигирует по абзацам', async ({ app, appPage: page }) => {
  await page.goto(`${app.baseUrl}/page/page-grace`);
  const references = page.locator('details.bible-page-refs');
  await expect(references.locator('summary')).toHaveText('Библейские ссылки: 2');
  await references.locator('summary').click();
  await expect(references.locator('.bible-chip')).toHaveText(['Ин 3:14-16', 'Ин 3:16']);

  await references.getByRole('button', { name:'Показать, где в заметке используется Ин 3:16' }).click();
  await expect(page.locator('.match-nav .match-count')).toHaveText('1 / 2');
  await page.getByRole('button', { name:'Следующее совпадение' }).click();
  await expect(page.locator('.match-nav .match-count')).toHaveText('2 / 2');
});

test('@notes повторный клик по активной заметке сохраняет DOM и раскрытые секции', async ({ app, appPage: page }) => {
  await page.goto(`${app.baseUrl}/page/page-grace`);
  const references = page.locator('details.bible-page-refs');
  await references.locator('summary').click();
  await page.evaluate(() => {
    const article = document.querySelector('#content article.page');
    if (article) article.setAttribute('data-e2e-preserved', 'true');
  });

  await page.locator('#notesRecentView').click();
  await page.locator('#tree .recent-page-row').filter({ hasText:'Благодать и надежда' }).click();

  await expect(page.locator('#content article.page')).toHaveAttribute('data-e2e-preserved', 'true');
  await expect(references).toHaveAttribute('open', '');
});

test('@notes текстовый и HTML-режимы используют одинаковую ширину без двойной прокрутки', async ({ app, appPage: page }) => {
  await page.setViewportSize({ width:1100, height:620 });
  await page.goto(`${app.baseUrl}/page/page-grace`);
  const textWidth = await page.locator('#content .page-text').evaluate(element => element.getBoundingClientRect().width);

  await page.getByRole('button', { name:'Показать HTML' }).click();
  const frame = page.locator('#content iframe.html-frame');
  await expect(frame).toBeVisible();
  const htmlWidth = await frame.evaluate(element => element.getBoundingClientRect().width);
  expect(Math.abs(textWidth - htmlWidth)).toBeLessThanOrEqual(2);
  await expect(page.locator('#contentScrollbar')).toBeHidden();

  const references = page.locator('details.bible-page-refs');
  await references.locator('summary').click();
  await expect(page.locator('#contentScrollbar')).toBeVisible();
  await expect.poll(() => page.locator('#content').evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
});
