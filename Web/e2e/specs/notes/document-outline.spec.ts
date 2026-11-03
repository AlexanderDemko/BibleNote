import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures/app.fixture.js';
import { oneNoteComPageXmlToHtml } from '../../../src/onenote-com.js';

const spacer = '<p style="height:850px">Текст раздела</p>';
const documentHtml = `<h1 id="original-title">Большой документ</h1>${spacer}
  <h2>Первая часть</h2>${spacer}<h4>Повторяющийся заголовок</h4>${spacer}
  <h2>Вторая часть</h2>${spacer}<h3>Повторяющийся заголовок</h3>${spacer}
  <h3>Итоги &amp; выводы</h3>${spacer}<h2 hidden>Скрытый заголовок</h2>
  <div style="display:none"><h2>Другой скрытый заголовок</h2></div><h2> </h2>`;

async function mockDocument(page: Page, html = documentHtml, oneNote = false) {
  await page.route('**/api/page?id=page-grace', route => route.fulfill({
    json:{
      id:'page-grace', title:'Большой документ', text:'Текст Word', hasContent:1, hasHtml:true,
      parentNotebook:{ id:'notebook-1', displayName:'Документы' },
      parentSection:{ id:'section-1', displayName:'Word' },
      links:oneNote ? {} : { folder:{ extension:'.docx', quality:'structured' } }
    }
  }));
  await page.route('**/api/bible/page?**', route => route.fulfill({ json:{ paragraphs:[] } }));
  await page.route('**/api/page-html?**', route => route.fulfill({ json:{ html } }));
}

test('@notes OneNote native heading styles populate the outline without the page title or nested body', async ({ app, appPage: page }) => {
  await page.setViewportSize({ width:1500, height:850 });
  const html = oneNoteComPageXmlToHtml(`<one:Page xmlns:one="http://schemas.microsoft.com/office/onenote/2013/onenote">
    <one:QuickStyleDef index="1" name="h1"/><one:QuickStyleDef index="2" name="h2"/>
    <one:Title><one:OE quickStyleIndex="1"><one:T>Большой документ</one:T></one:OE></one:Title>
    <one:Outline><one:OEChildren>
      <one:OE quickStyleIndex="1"><one:T>Введение</one:T><one:OEChildren>
        <one:OE><one:T><![CDATA[<span style="display:block;height:1200px">Текст раздела</span>]]></one:T></one:OE>
        <one:OE quickStyleIndex="2"><one:T>## Раскрытие темы</one:T></one:OE>
      </one:OEChildren></one:OE>
      <one:OE><one:T><![CDATA[<span style="display:block;height:1200px">Текст после заголовка</span>]]></one:T></one:OE>
    </one:OEChildren></one:Outline>
  </one:Page>`);
  await mockDocument(page, html, true);
  await page.goto(`${app.baseUrl}/page/page-grace`);
  await page.getByRole('button', { name:'Показать HTML', exact:true }).click();
  const panel = page.getByRole('navigation', { name:'Структура документа' });
  await expect(panel.locator('.document-outline-link')).toHaveText(['Введение', 'Раскрытие темы']);
  await expect(panel.locator('ol ol .document-outline-link')).toHaveText(['Раскрытие темы']);
  await panel.getByRole('button', { name:'Раскрытие темы', exact:true }).click();
  const frame = page.frameLocator('#content iframe.html-frame');
  await expect.poll(() => frame.locator('[role="heading"][aria-level="2"]').evaluate(element =>
    Math.abs(element.getBoundingClientRect().top)
  )).toBeLessThan(2);
  await expect(panel.getByRole('button', { name:'Раскрытие темы', exact:true })).toHaveAttribute('aria-current', 'location');
});

test('@notes cached OneNote Markdown headings work without resync and ignore ordinary text and code', async ({ app, appPage: page }) => {
  await page.setViewportSize({ width:1500, height:850 });
  await mockDocument(page, `<body class="onenote-com-page" data-biblenote-renderer="onenote-com-v2">
    <header class="onenote-page-header"><h1>Большой документ</h1></header>
    <div class="onenote-paragraph">## Введение<div class="onenote-children">
      <div class="onenote-paragraph">Текст подраздела</div>
      <div class="onenote-paragraph"><span>### </span><b>Подробности</b><br></div>
    </div></div>${spacer}
    <div class="onenote-paragraph"><span>## Раскрытие </span><a href="#original">темы</a> ##</div>${spacer}
    <p>Слово # внутри абзаца</p><div>#метка</div><p>####### Слишком много решёток</p>
    <p>## Несколько строк<br>Обычный текст</p><p>## </p>
    <pre><div>## Пример кода</div></pre><p hidden>## Скрытый раздел</p>
  </body>`, true);
  await page.goto(`${app.baseUrl}/page/page-grace`);
  await page.getByRole('button', { name:'Показать HTML', exact:true }).click();
  const panel = page.getByRole('navigation', { name:'Структура документа' });
  await expect(panel.locator('.document-outline-link')).toHaveText(['Введение', 'Подробности', 'Раскрытие темы']);
  await expect(panel.locator('ol ol .document-outline-link')).toHaveText(['Подробности']);
  await panel.getByRole('button', { name:'Раскрытие темы', exact:true }).click();
  const frame = page.frameLocator('#content iframe.html-frame');
  await expect.poll(() => frame.locator('.onenote-paragraph').filter({ hasText:'## Раскрытие темы ##' }).evaluate(element =>
    Math.abs(element.getBoundingClientRect().top)
  )).toBeLessThan(2);
  await expect(frame.getByRole('link', { name:'темы', exact:true })).toHaveAttribute('href', '#original');
  await page.getByRole('button', { name:'Открыть страницу «Большой документ» целиком' }).click();
  await page.screenshot({ path:'.tmp/onenote-document-outline.png' });
});

test('@notes OneNote hides a title-only outline even when the panel was enabled for Word', async ({ app, appPage: page }) => {
  await mockDocument(page, '<h1>Большой документ</h1><p>Заметка без разделов.</p>', true);
  await page.evaluate(() => localStorage.setItem('onenote.documentOutlineOpen', 'true'));
  await page.goto(`${app.baseUrl}/page/page-grace`);
  await page.getByRole('button', { name:'Показать HTML', exact:true }).click();
  await expect(page.frameLocator('#content iframe.html-frame').getByText('Заметка без разделов.')).toBeVisible();
  await expect(page.getByRole('button', { name:'Структура документа', exact:true })).toBeHidden();
  await expect(page.getByRole('navigation', { name:'Структура документа' })).toBeHidden();
  await page.getByRole('button', { name:'Открыть страницу «Большой документ» целиком' }).click();
  await expect(page.getByRole('button', { name:'Структура документа', exact:true })).toBeHidden();
  await expect(page.locator('#pageFocusToolbar')).toBeVisible();
  await expect(page.locator('#content iframe.html-frame')).toBeVisible();
});

test('@notes cloud OneNote excludes its title and offers even a single real section', async ({ app, appPage: page }) => {
  await mockDocument(page, '<h1>Большой документ</h1><h2>Единственный раздел</h2><p>Содержимое</p>', true);
  await page.goto(`${app.baseUrl}/page/page-grace`);
  await page.getByRole('button', { name:'Показать HTML', exact:true }).click();
  const panel = page.getByRole('navigation', { name:'Структура документа' });
  await expect(panel).toBeVisible();
  await expect(panel.locator('.document-outline-link')).toHaveText(['Единственный раздел']);
});

test('@notes outline width follows dragging, persists, and adapts to the reader width', async ({ app, appPage: page }) => {
  await page.setViewportSize({ width:1500, height:850 });
  await mockDocument(page);
  await page.goto(`${app.baseUrl}/page/page-grace`);
  await page.getByRole('button', { name:'Показать HTML', exact:true }).click();
  const panel = page.getByRole('navigation', { name:'Структура документа' });
  const resizer = page.getByRole('separator', { name:'Ширина панели структуры' });
  const panelWidth = async () => (await panel.boundingBox())!.width;
  const frame = page.frameLocator('#content iframe.html-frame');
  await expect(resizer).toHaveAttribute('aria-valuenow', '280');
  await frame.locator('body').evaluate(element => { element.dataset.resizeSentinel = 'preserved'; });
  const handle = (await resizer.boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + 120);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2 + 150, handle.y + 120, { steps:8 });
  await page.mouse.up();
  await expect.poll(panelWidth).toBe(430);
  await expect(resizer).toHaveAttribute('aria-valuenow', '430');
  await expect(frame.locator('body')).toHaveAttribute('data-resize-sentinel', 'preserved');
  await expect(page.locator('.document-viewer')).not.toHaveClass(/resizing-outline/);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('onenote.documentOutlineWidth'))).toBe('430');

  const toggle = page.getByRole('button', { name:'Структура документа', exact:true });
  await toggle.click();
  await expect(resizer).toBeHidden();
  await toggle.click();
  await expect.poll(panelWidth).toBe(430);
  await page.reload();
  await page.getByRole('button', { name:'Показать HTML', exact:true }).click();
  await expect.poll(panelWidth).toBe(430);
  await page.getByRole('button', { name:'Открыть страницу «Большой документ» целиком' }).click();
  await expect.poll(panelWidth).toBe(430);
  await resizer.press('ArrowRight');
  await expect.poll(panelWidth).toBe(440);
  await resizer.press('End');
  await expect.poll(panelWidth).toBe(600);
  await page.setViewportSize({ width:720, height:850 });
  await expect.poll(panelWidth).toBe(480);
  expect((await page.locator('#content iframe.html-frame').boundingBox())!.width).toBeGreaterThanOrEqual(240);
  await page.setViewportSize({ width:1500, height:850 });
  await expect.poll(panelWidth).toBe(600);
  await resizer.press('Home');
  await expect.poll(panelWidth).toBe(180);
  await resizer.dblclick();
  await expect.poll(panelWidth).toBe(280);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('onenote.documentOutlineWidth'))).toBeNull();
});

test('@notes narrow outline can be resized without covering the whole document and releases a cancelled drag', async ({ app, appPage: page }) => {
  await page.setViewportSize({ width:850, height:850 });
  await mockDocument(page);
  await page.goto(`${app.baseUrl}/page/page-grace`);
  await page.getByRole('button', { name:'Показать HTML', exact:true }).click();
  const panel = page.getByRole('navigation', { name:'Структура документа' });
  const resizer = page.getByRole('separator', { name:'Ширина панели структуры' });
  await expect(resizer).toBeVisible();
  const available = await page.locator('.document-viewer-body').evaluate(element => element.clientWidth);
  const handle = (await resizer.boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + 120);
  await page.mouse.down();
  await page.mouse.move(handle.x + 400, handle.y + 120, { steps:6 });
  await expect.poll(async () => (await panel.boundingBox())!.width).toBe(Math.floor(available * .85));
  await resizer.dispatchEvent('pointercancel', { pointerId:1 });
  await expect(page.locator('.document-viewer')).not.toHaveClass(/resizing-outline/);
  await page.mouse.up();
  expect(await page.locator('#content iframe.html-frame').evaluate(element => getComputedStyle(element).pointerEvents)).toBe('auto');
  expect((await page.locator('#content iframe.html-frame').boundingBox())!.width).toBeCloseTo(available, 0);
  await panel.getByRole('button', { name:'Вторая часть', exact:true }).click();
  await expect(panel).toBeHidden();
});

test('@notes Word outline follows heading hierarchy, filters, and navigates duplicate titles', async ({ app, appPage: page }) => {
  await page.setViewportSize({ width:1500, height:850 });
  await mockDocument(page);
  await page.goto(`${app.baseUrl}/page/page-grace`);
  await page.getByRole('button', { name:'Показать HTML', exact:true }).click();
  const panel = page.getByRole('navigation', { name:'Структура документа' });
  const frame = page.frameLocator('#content iframe.html-frame');
  const links = panel.locator('.document-outline-link');
  await expect(panel).toBeVisible();
  await expect(links).toHaveText([
    'Большой документ', 'Первая часть', 'Повторяющийся заголовок',
    'Вторая часть', 'Повторяющийся заголовок', 'Итоги & выводы'
  ]);
  await expect(panel.locator('ol > li > ol > li > ol .document-outline-link')).toHaveCount(3);
  await expect(frame.locator('#original-title')).toHaveText('Большой документ');
  await panel.getByRole('button', { name:'Подразделы: Первая часть', exact:true }).click();
  await expect(links.nth(2)).toBeHidden();
  await panel.getByRole('searchbox').fill('повторяющийся');
  await expect(links.nth(2)).toBeVisible();
  await expect(links.nth(4)).toBeVisible();
  await expect(links.nth(5)).toBeHidden();
  await links.nth(4).click();
  await expect.poll(() => frame.locator('h3').first().evaluate(element => Math.abs(element.getBoundingClientRect().top))).toBeLessThan(2);
  await expect(links.nth(4)).toHaveAttribute('aria-current', 'location');
  await panel.getByRole('searchbox').fill('нет такого раздела');
  await expect(panel.getByText('Заголовки не найдены.', { exact:true })).toBeVisible();
  await panel.getByRole('searchbox').fill('');
  await expect(links.nth(2)).toBeHidden();

  await page.locator('.html-zoom input').fill('175');
  await links.nth(3).click();
  await expect.poll(() => frame.locator('h2').nth(1).evaluate(element => Math.abs(element.getBoundingClientRect().top))).toBeLessThan(2);
  await expect(links.nth(3)).toHaveAttribute('aria-current', 'location');
  await frame.locator('h3').last().evaluate(element => element.scrollIntoView());
  await expect(links.nth(5)).toHaveAttribute('aria-current', 'location');

  // Find highlights must not break heading targets or change the outline text.
  await page.keyboard.press('Control+f');
  await page.getByRole('searchbox', { name:'Найти заголовок' }).blur();
  await page.locator('#pageFindInput').fill('Итоги');
  await expect(frame.locator('h3 mark[data-onenote-page-find]')).toHaveText('Итоги');
  await page.getByRole('button', { name:'Закрыть поиск', exact:true }).click();
  await links.nth(5).click();
  await expect(links.nth(5)).toHaveAttribute('aria-current', 'location');

  await page.getByRole('button', { name:'Открыть страницу «Большой документ» целиком' }).click();
  await expect(panel).toBeVisible();
  const toggle = page.getByRole('button', { name:'Структура документа', exact:true });
  await toggle.click();
  await expect(panel).toBeHidden();
  await toggle.click();
  await links.nth(3).click();
  await expect.poll(() => frame.locator('h2').nth(1).evaluate(element => Math.abs(element.getBoundingClientRect().top))).toBeLessThan(2);
  const bounds = await page.locator('#content iframe.html-frame').boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.y).toBe(64);
  expect(bounds!.y + bounds!.height).toBeCloseTo(850, 0);
  await expect(page.locator('#contentScrollbar')).toBeHidden();
  for (const width of [1500, 1100, 1000, 720]) {
    await page.setViewportSize({ width, height:850 });
    const outlineBox = (await toggle.boundingBox())!;
    const zoomBox = (await page.locator('#pageFocusZoom').boundingBox())!;
    const navigationBox = (await page.locator('#pageFocusToolbar').boundingBox())!;
    expect(Math.abs(outlineBox.y + outlineBox.height / 2 - (navigationBox.y + navigationBox.height / 2))).toBeLessThan(1);
    expect(outlineBox.x + outlineBox.width).toBeLessThan(zoomBox.x);
    expect(zoomBox.x + zoomBox.width).toBeLessThan(navigationBox.x);
    expect((await page.locator('#content iframe.html-frame').boundingBox())!.y).toBe(64);
  }
  await page.setViewportSize({ width:1500, height:850 });
  await page.locator('html').evaluate(element => { element.dataset.theme = 'c'; });
  await page.screenshot({ path:'.tmp/document-outline-focus.png' });
  await page.locator('#pageFocusExit').click();
  await page.getByRole('button', { name:'Показать извлечённый текст', exact:true }).click();
  await expect(toggle).toBeHidden();
  await page.getByRole('button', { name:'Показать HTML', exact:true }).click();
  await expect(panel).toBeVisible();

  await links.nth(3).click();
  const savedTop = await frame.locator('html').evaluate(element => element.scrollTop);
  await page.locator('#newWorkspaceTab').click();
  await page.locator('.workspace-tab').filter({ hasText:'Большой документ' }).click();
  await expect(panel).toBeVisible();
  await expect(links.nth(2)).toBeHidden();
  await expect.poll(() => frame.locator('html').evaluate(element => element.scrollTop)).toBeCloseTo(savedTop, 0);
  await links.nth(5).click();
  await expect(links.nth(5)).toHaveAttribute('aria-current', 'location');
});

test('@notes full page HTML keeps Bible matches and Ctrl+F visible alongside the outline', async ({ appPage: page }) => {
  await page.setViewportSize({ width:1200, height:750 });
  await page.locator('#search').fill('Ин 3:16');
  await page.locator('#tree .search-result-row').filter({ hasText:'Благодать и надежда' }).click();
  await page.getByRole('button', { name:'Показать HTML', exact:true }).click();
  const frame = page.frameLocator('#content iframe.html-frame');
  await expect(frame.locator('[data-onenote-target-match]')).toHaveCount(3);
  await page.getByRole('button', { name:'Открыть страницу «Благодать и надежда» целиком' }).click();
  await expect(page.locator('.match-nav')).toBeVisible();
  await expect(page.locator('.match-nav .match-count')).toHaveText('1 / 3');
  await page.getByRole('button', { name:'Следующее совпадение', exact:true }).click();
  await expect(page.locator('.match-nav .match-count')).toHaveText('2 / 3');
  await frame.locator('body').press('Control+f');
  await page.locator('#pageFindInput').fill('надежда');
  await expect(page.locator('#pageFindCount')).not.toHaveText('0 / 0');
  await expect(frame.locator('[data-onenote-page-find]')).not.toHaveCount(0);
  await page.getByRole('button', { name:'Закрыть поиск', exact:true }).click();
  await expect(page.locator('.match-nav .match-count')).toHaveText('2 / 3');
});

test('@notes document without headings explains the empty outline and remembers visibility', async ({ app, appPage: page }) => {
  await mockDocument(page, '<p>Только обычный текст.</p>');
  await page.goto(`${app.baseUrl}/page/page-grace`);
  await page.getByRole('button', { name:'Показать HTML', exact:true }).click();
  const toggle = page.getByRole('button', { name:'Структура документа', exact:true });
  const panel = page.getByRole('navigation', { name:'Структура документа' });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  await expect(panel).toContainText('В документе нет заголовков.');
  await expect(panel.getByRole('searchbox')).toBeHidden();
  await page.reload();
  await page.getByRole('button', { name:'Показать HTML', exact:true }).click();
  await expect(panel).toBeVisible();
  await toggle.click();
  await page.reload();
  await page.getByRole('button', { name:'Показать HTML', exact:true }).click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
});

test('@notes outline ignores messages from another frame and fits a narrow reader', async ({ app, appPage: page }) => {
  await page.setViewportSize({ width:850, height:850 });
  await mockDocument(page);
  await page.goto(`${app.baseUrl}/page/page-grace`);
  await page.getByRole('button', { name:'Показать HTML', exact:true }).click();
  const panel = page.getByRole('navigation', { name:'Структура документа' });
  await expect(panel).toBeVisible();
  await page.evaluate(() => {
    const iframe = document.createElement('iframe');
    iframe.srcdoc = `<script>parent.postMessage({ type:'onenote-outline', headings:[{ text:'Поддельный заголовок', level:1 }] }, '*')</script>`;
    document.body.append(iframe);
  });
  await expect(panel.locator('.document-outline-link')).toHaveCount(6);
  const frame = page.locator('#content iframe.html-frame');
  const width = await frame.evaluate(element => element.getBoundingClientRect().width);
  expect(width).toBeGreaterThan(300);
  await panel.getByRole('button', { name:'Вторая часть', exact:true }).click();
  await expect(panel).toBeHidden();
  await expect.poll(() => page.frameLocator('#content iframe.html-frame').locator('h2').nth(1)
    .evaluate(element => Math.abs(element.getBoundingClientRect().top))).toBeLessThan(2);
});
