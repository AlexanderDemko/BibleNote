import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures/app.fixture.js';

const html = `<!doctype html><html><head><style>
  body { margin:32px; color:#000; background:white; font:18px/1.6 Georgia; }
  td { border:1px solid #aaa; padding:12px; }
  .blue { color:blue; } .yellow { background:#ffff00; }
</style></head><body>
  <h1>Документ с цветами</h1><p id="normal">Обычный текст для чтения</p>
  <p id="red" style="color:#c00000!important">Красный текст</p>
  <p><a id="blue" class="blue" href="#bottom">Синяя ссылка</a></p>
  <table><tr><td id="yellow" class="yellow"><span id="nested">Жёлтое выделение</span></td>
  <td id="green" style="background:#c6efce;color:#006100">Зелёная ячейка</td></tr></table>
  <p id="already-dark" style="background:#121212;color:#eee">Исходный тёмный блок</p>
  <p id="modern" style="background:color(srgb 1 1 1);color:oklch(30% .15 25)">Современные CSS-цвета</p>
  <img id="photo" width="120" height="60" alt="Иллюстрация" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='60'%3E%3Cpath fill='coral' d='M0 0h120v60H0z'/%3E%3C/svg%3E">
  <p style="height:1600px">Длинный раздел</p><h2 id="bottom">Конец</h2>
</body></html>`;

async function mockDocument(page: Page) {
  await page.route('**/api/page?id=page-grace', route => route.fulfill({ json:{
    id:'page-grace', title:'Документ с цветами', text:'Обычный текст для чтения', hasContent:1, hasHtml:true,
    parentNotebook:{ id:'notebook-1', displayName:'Документы' },
    parentSection:{ id:'section-1', displayName:'Word' },
    links:{ folder:{ extension:'.docx', quality:'structured' } }
  } }));
  await page.route('**/api/bible/page?**', route => route.fulfill({ json:{ paragraphs:[] } }));
  await page.route('**/api/page-html?**', route => route.fulfill({ json:{ html } }));
}

async function setTheme(page: Page, theme: string) {
  await page.locator('#openSettings').click();
  const details = page.locator('#settingsDialog details.view-settings');
  if (!await details.getAttribute('open').then(value => value !== null)) await details.locator('summary').click();
  await page.locator('#themeSelect').selectOption(theme);
  await page.locator('#closeSettings').click();
}

test('@notes @settings dark HTML keeps hues, contrast, scroll and restores original colors', async ({ app, appPage: page }) => {
  await mockDocument(page);
  await page.goto(`${app.baseUrl}/page/page-grace`);
  await page.getByRole('button', { name:'Показать HTML', exact:true }).click();
  const frame = page.frameLocator('#content iframe.html-frame');
  const colors = () => frame.locator('body').evaluate(body => {
    return ['body', '#normal', '#red', '#blue', '#yellow', '#nested', '#green', '#already-dark', '#modern'].map(selector => {
      const element = selector === 'body' ? body : body.querySelector(selector)!;
      const style = getComputedStyle(element);
      return { color:style.color, background:style.backgroundColor, border:style.borderTopColor };
    });
  });
  const original = await colors();
  await frame.locator('body').evaluate(() => { window.scrollTo(0, 450); (window as any).themeSentinel = 'same document'; });
  const scroll = await frame.locator('body').evaluate(() => window.scrollY);
  await setTheme(page, 'c');
  await expect(frame.locator('html')).toHaveAttribute('data-content-theme', 'dark');
  const dark = await colors();
  const rgb = (color: string) => color.match(/[\d.]+/g)!.map(Number);
  const luminance = (color: string) => rgb(color).slice(0, 3).reduce((sum, value, index) => {
    const c = value / 255;
    return sum + (c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4) * [.2126, .7152, .0722][index];
  }, 0);
  for (const index of [0, 4, 6, 7, 8]) expect(luminance(dark[index].background)).toBeLessThan(.08);
  for (let index = 0; index < dark.length; index++) {
    const background = index === 5 ? dark[4].background : [0, 4, 6, 7, 8].includes(index) ? dark[index].background : dark[0].background;
    expect((luminance(dark[index].color) + .05) / (luminance(background) + .05)).toBeGreaterThanOrEqual(4.5);
  }
  expect(rgb(dark[2].color)[0]).toBeGreaterThan(rgb(dark[2].color)[1]);
  expect(rgb(dark[3].color)[2]).toBeGreaterThan(rgb(dark[3].color)[0]);
  expect(rgb(dark[4].background)[0]).toBeGreaterThan(rgb(dark[4].background)[2]);
  expect(rgb(dark[6].background)[1]).toBeGreaterThan(rgb(dark[6].background)[0]);
  await expect(frame.locator('#photo')).toHaveCSS('filter', 'brightness(0.82)');
  expect(await frame.locator('body').evaluate(() => window.scrollY)).toBe(scroll);
  expect(await frame.locator('body').evaluate(() => (window as any).themeSentinel)).toBe('same document');
  await frame.locator('body').evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path:'.tmp/content-theme-dark.png' });

  await setTheme(page, 'b');
  await expect(frame.locator('html')).toHaveAttribute('data-content-theme', 'light');
  expect(await colors()).toEqual(original);
  await expect(frame.locator('#photo')).toHaveCSS('filter', 'none');
  for (const theme of ['c', 'a', 'c', 'b']) await setTheme(page, theme);
  await expect.poll(colors).toEqual(original);
  await page.screenshot({ path:'.tmp/content-theme-light.png' });
});

test('@notes @settings saved dark theme handles new content, search and inactive tabs', async ({ app, appPage: page }) => {
  await mockDocument(page);
  await setTheme(page, 'c');
  await page.goto(`${app.baseUrl}/page/page-grace`);
  await page.getByRole('button', { name:'Показать HTML', exact:true }).click();
  const frame = page.frameLocator('iframe.html-frame').first();
  await expect(frame.locator('html')).toHaveAttribute('data-content-theme', 'dark');
  await expect(frame.locator('html')).not.toHaveAttribute('data-content-theme-pending', '');
  await frame.locator('body').evaluate(body => {
    const paragraph = document.createElement('p');
    paragraph.id = 'dynamic';
    paragraph.style.cssText = 'color:#000;background:white';
    paragraph.textContent = 'Добавленный текст';
    body.prepend(paragraph);
  });
  await expect(frame.locator('#dynamic')).toHaveCSS('color', 'rgb(220, 217, 225)');
  await expect(frame.locator('#dynamic')).toHaveCSS('background-color', 'rgb(31, 30, 36)');
  await page.locator('iframe.html-frame').evaluate((element: HTMLIFrameElement) => {
    element.contentWindow!.postMessage({ type:'onenote-page-find', query:'текст' }, '*');
  });
  const marks = frame.locator('[data-onenote-page-find]');
  await expect(marks).not.toHaveCount(0);
  await expect.poll(() => marks.first().evaluate(element => getComputedStyle(element).backgroundColor)).not.toBe('rgb(245, 215, 110)');
  await page.evaluate(() => (window as any).openBibleTextInReader({ module:'rst', bookIndex:43, chapter:3, verse:16, topChapter:3, topVerse:16 }));
  await expect(page.locator('#content h2')).toHaveText('От Иоанна 3');
  await setTheme(page, 'b');
  await expect(frame.locator('html')).toHaveAttribute('data-content-theme', 'light');
  await expect(frame.locator('#dynamic')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(frame.locator('#dynamic')).toHaveCSS('color', 'rgb(0, 0, 0)');
  await page.locator('.workspace-tab').filter({ hasText:'Документ с цветами' }).click();
  await expect(page.locator('#content h2')).toHaveText('Документ с цветами');
  await expect(frame.locator('#dynamic')).toBeVisible();
});
