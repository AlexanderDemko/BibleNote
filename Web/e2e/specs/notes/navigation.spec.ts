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

test('@notes контекстное меню открывает заметку целиком и показывает сведения', async ({ appPage: page }) => {
  await page.locator('#tree > .source-row').filter({ hasText:'OneNote Cloud' }).click();
  await page.locator('#tree > .tree-row').filter({ hasText:'Учебный блокнот' }).click();
  await page.locator('#tree .section-row').filter({ hasText:'Евангелие от Иоанна' }).click();

  const pageRow = page.locator('#tree .page-row').filter({ hasText:'Благодать и надежда' });
  await pageRow.focus();
  await page.keyboard.press('Shift+F10');
  const menu = page.getByRole('menu', { name:/Действия с заметкой/ });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitem')).toHaveText([
    'Открыть целиком',
    'Синхронизировать заметку',
    'Сведения о заметке'
  ]);

  await menu.getByRole('menuitem', { name:'Сведения о заметке' }).click();
  const info = page.locator('.note-info-dialog');
  await expect(info).toBeVisible();
  await expect(info.getByRole('heading')).toHaveText('Благодать и надежда');
  await expect(info).toContainText('Учебный блокнот');
  await expect(info).toContainText('Евангелие от Иоанна');
  await info.getByRole('button', { name:'Закрыть' }).click();

  await pageRow.click({ button:'right' });
  await page.getByRole('menuitem', { name:'Открыть целиком' }).click();
  await expect(page.locator('html')).toHaveClass(/page-focus-mode/);
  await expect(page.locator('#pageFocusToolbar')).toBeVisible();
  await expect(page.locator('.sidebar')).toBeHidden();
});

test('@notes контекстное меню открывает оригинал OneNote без изменения заметки', async ({ appPage: page }) => {
  const oneNoteUrl = 'onenote:https://example.test/notebook.one#Page&page-id={11111111-1111-1111-1111-111111111111}';
  let openRequest: Record<string, unknown> | undefined;
  await page.route('**/api/page-info?id=page-grace', route => route.fulfill({
    status:200,
    contentType:'application/json',
    body:JSON.stringify({
      id:'page-grace',
      title:'Благодать и надежда',
      parentNotebook:{ id:'notebook-study', displayName:'Учебный блокнот' },
      parentSection:{ id:'section-gospel', displayName:'Евангелие от Иоанна' },
      links:{ oneNoteClientUrl:{ href:oneNoteUrl } }
    })
  }));
  await page.route('**/api/system/open-onenote-page', async route => {
    openRequest = route.request().postDataJSON();
    await route.fulfill({ status:200, contentType:'application/json', body:'{"opened":true}' });
  });
  await page.locator('#tree > .source-row').filter({ hasText:'OneNote Cloud' }).click();
  await page.locator('#tree > .tree-row').filter({ hasText:'Учебный блокнот' }).click();
  await page.locator('#tree .section-row').filter({ hasText:'Евангелие от Иоанна' }).click();

  await page.locator('#tree .page-row').filter({ hasText:'Благодать и надежда' }).click({ button:'right' });
  await page.getByRole('menuitem', { name:'Открыть в OneNote' }).click();
  await expect.poll(() => openRequest).toEqual({ url:oneNoteUrl, pageId:'' });
});

test('@notes контекстное меню последних заметок возвращает заметку в структуру', async ({ appPage: page }) => {
  await page.locator('#notesRecentView').click();
  const recentPage = page.locator('#tree .recent-page-row').filter({ hasText:'Благодать и надежда' });
  await recentPage.click({ button:'right' });
  await page.getByRole('menuitem', { name:'Показать в структуре' }).click();

  await expect(page.locator('#notesStructureView')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#tree .page-row.selected').filter({ hasText:'Благодать и надежда' })).toBeVisible();
});

test('@notes папки и разделы поддерживают контекстные действия и ограниченный поиск', async ({ appPage: page }) => {
  const oneNoteSectionUrl = 'onenote:https://example.test/notebook.one#Section&section-id={22222222-2222-2222-2222-222222222222}';
  let searchUrl = '';
  let syncRequest: Record<string, unknown> | undefined;
  let oneNoteRequest: Record<string, unknown> | undefined;
  await page.route('**/api/sections?**', route => route.fulfill({
    status:200,
    contentType:'application/json',
    body:JSON.stringify([{
      id:'section-menu', displayName:'Раздел меню', parentGroupId:'group-menu',
      groupPath:'Папка меню', pageCount:1, scanComplete:1, orderIndex:0
    }])
  }));
  await page.route('**/api/section-groups?**', route => route.fulfill({
    status:200,
    contentType:'application/json',
    body:JSON.stringify([{
      id:'group-menu', displayName:'Папка меню', parentGroupId:null,
      groupPath:'Папка меню', sectionCount:1, orderIndex:0
    }])
  }));
  await page.route('**/api/pages?**', route => route.fulfill({
    status:200,
    contentType:'application/json',
    body:JSON.stringify([{ id:'page-menu', title:'Заметка меню', pageLevel:0, hasContent:1, fetchError:null }])
  }));
  await page.route('**/api/section-group-info?id=group-menu', route => route.fulfill({
    status:200,
    contentType:'application/json',
    body:JSON.stringify({
      type:'group', id:'group-menu', displayName:'Папка меню', notebookId:'notebook-study',
      notebookName:'Учебный блокнот', sourceType:'graph', groupPath:'Папка меню',
      groupIds:['group-menu'], sectionIds:['section-menu'], childGroupCount:0, sectionCount:1, pageCount:1
    })
  }));
  await page.route('**/api/section-info?id=section-menu', route => route.fulfill({
    status:200,
    contentType:'application/json',
    body:JSON.stringify({
      type:'section', id:'section-menu', displayName:'Раздел меню', notebookId:'notebook-study',
      notebookName:'Учебный блокнот', sourceType:'graph', groupPath:'Папка меню', pageCount:1,
      scanComplete:1, links:{ oneNoteClientUrl:{ href:oneNoteSectionUrl } }
    })
  }));
  await page.route('**/api/search?**', route => {
    searchUrl = route.request().url();
    return route.fulfill({ status:200, contentType:'application/json', body:'[]' });
  });
  await page.route('**/api/sync', async route => {
    if (route.request().method() !== 'POST') return route.continue();
    syncRequest = route.request().postDataJSON();
    await route.fulfill({ status:202, contentType:'application/json', body:'{"status":"running"}' });
  });
  await page.route('**/api/system/open-onenote-page', async route => {
    oneNoteRequest = route.request().postDataJSON();
    await route.fulfill({ status:200, contentType:'application/json', body:'{"opened":true}' });
  });
  await page.reload();
  await page.locator('#tree > .source-row').filter({ hasText:'OneNote Cloud' }).click();
  await page.locator('#tree > .tree-row').filter({ hasText:'Учебный блокнот' }).click();

  const folderRow = page.locator('#tree .tree-row[data-group-id="group-menu"]');
  await folderRow.click({ button:'right' });
  const folderMenu = page.getByRole('menu', { name:/Действия с папкой/ });
  await expect(folderMenu.getByRole('menuitem')).toHaveText([
    'Развернуть всё', 'Свернуть всё', 'Показать только эту папку', 'Искать в этой папке',
    'Синхронизировать содержимое', 'Сведения о папке'
  ]);
  await folderMenu.getByRole('menuitem', { name:'Развернуть всё' }).click();

  const sectionRow = page.locator('#tree .section-row[data-section-id="section-menu"]');
  await expect(sectionRow).toBeVisible();
  await sectionRow.click({ button:'right' });
  const sectionMenu = page.getByRole('menu', { name:/Действия с разделом/ });
  await expect(sectionMenu.getByRole('menuitem')).toHaveText([
    'Свернуть', 'Показать только этот раздел', 'Искать в этом разделе', 'Открыть в OneNote',
    'Синхронизировать раздел', 'Сведения о разделе'
  ]);
  await sectionMenu.getByRole('menuitem', { name:'Сведения о разделе' }).click();
  await expect(page.locator('.note-info-dialog')).toContainText('Раздел меню');
  await page.locator('.note-info-dialog').getByRole('button', { name:'Закрыть' }).click();

  await sectionRow.click({ button:'right' });
  await page.getByRole('menuitem', { name:'Показать только этот раздел' }).click();
  await expect(page.locator('.notes-scope-banner')).toContainText('Раздел: Раздел меню');
  await page.locator('.notes-scope-banner').getByRole('button', { name:'Вся структура' }).click();

  await folderRow.click({ button:'right' });
  await page.getByRole('menuitem', { name:'Показать только эту папку' }).click();
  await expect(page.locator('.notes-scope-banner')).toContainText('Папка: Папка меню');
  await page.locator('.notes-scope-banner').getByRole('button', { name:'Вся структура' }).click();

  await folderRow.click({ button:'right' });
  await page.getByRole('menuitem', { name:'Искать в этой папке' }).click();
  const search = page.locator('#search');
  await expect(search).toBeFocused();
  await expect(search).toHaveAttribute('placeholder', /Поиск в папке «Папка меню»/);
  await search.fill('scopeword');
  await expect.poll(() => searchUrl).toContain('sectionGroupId=group-menu');
  await search.fill('');

  await sectionRow.click({ button:'right' });
  await page.getByRole('menuitem', { name:'Открыть в OneNote' }).click();
  await expect.poll(() => oneNoteRequest).toEqual({ url:oneNoteSectionUrl, pageId:'' });

  await folderRow.click({ button:'right' });
  await page.getByRole('menuitem', { name:'Синхронизировать содержимое' }).click();
  await expect.poll(() => syncRequest?.sectionGroupId).toBe('group-menu');
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
  await page.route('**/api/section-group-info?id=folder%3Agroup%3Acommentary', route => route.fulfill({
    status:200,
    contentType:'application/json',
    body:JSON.stringify({
      type:'group', id:'folder:group:commentary', displayName:'Bible_MakArthur',
      notebookId:'folder:notebook:literature', notebookName:'Доп литература', sourceType:'folder',
      groupPath:'Bible_MakArthur', groupIds:['folder:group:commentary', 'folder:group:old-testament'],
      sectionIds:['folder:section:commentary-files'], childGroupCount:1, sectionCount:1, pageCount:1
    })
  }));
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

  await siblingFolder.click({ button:'right' });
  await page.getByRole('menuitem', { name:'Показать только эту папку' }).click();
  await expect(page.locator('.notes-scope-banner')).toContainText('Папка: Bible_MakArthur');
  await expect(page.locator('#tree .section-row').filter({ hasText:'Файлы' })).toHaveCount(0);
  await expect(page.locator('#tree .page-row').filter({ hasText:'Файл рядом с подпапкой' })).toHaveCount(1);
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
  await expect(recentPage.locator('.recent-page-type-icons .source-type-icon.graph')).toBeVisible();
  await expect(recentPage.locator('.recent-page-type-icons .file-type-icon.onenote')).toBeVisible();
  await expect(recentPage.locator('.recent-page-type-icons .file-type-icon.onenote')).toHaveText('N');
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
