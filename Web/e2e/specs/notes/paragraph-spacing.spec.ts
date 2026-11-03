import fs from 'node:fs';
import { test, expect } from '../../fixtures/app.fixture.js';
import { oneNoteComPageXmlToHtml } from '../../../src/onenote-com.js';
import { htmlToText } from '../../../src/html.js';

const xml = fs.readFileSync(new URL('../../../tests/fixtures/onenote-paragraph-spacing.xml', import.meta.url), 'utf8');
const html = oneNoteComPageXmlToHtml(xml);
const text = htmlToText(html);

test('@notes OneNote preserves paragraph boundaries in text and source spacing in HTML', async ({ app, appPage: page }) => {
  await page.route('**/api/page?id=page-grace', route => route.fulfill({ json:{
    id:'page-grace', title:'Интервалы абзацев', text, hasContent:1, hasHtml:true,
    parentNotebook:{ id:'notebook-1', displayName:'Заметки' },
    parentSection:{ id:'section-1', displayName:'OneNote' }
  } }));
  await page.route('**/api/bible/page?**', route => route.fulfill({ json:{ paragraphs:[] } }));
  await page.route('**/api/page-html?**', route => route.fulfill({ json:{ html } }));
  await page.goto(`${app.baseUrl}/page/page-grace`);
  await expect(page.locator('.page-text')).toHaveText(text);
  expect(await page.locator('.page-text').innerText()).toContain('любви.\n\n1. Божий замысел');
  await page.getByRole('button', { name:'Показать HTML', exact:true }).click();
  const frame = page.frameLocator('#content iframe.html-frame');
  const heading = frame.locator('.onenote-list-number');
  await expect(heading).toBeVisible();
  await expect(heading).toHaveCSS('margin-top', '36px');
  await expect(heading.locator(':scope > .onenote-paragraph-content')).toHaveCSS('margin-bottom', '12px');
  await expect(heading.locator('span')).toHaveCSS('font-weight', '700');
  const positions = await heading.evaluate(element => {
    const parent = element.parentElement!.parentElement!;
    const parentContent = parent.querySelector(':scope > .onenote-paragraph-content')!;
    const headingContent = element.querySelector(':scope > .onenote-paragraph-content')!;
    const following = parent.nextElementSibling!;
    const scale = Number(getComputedStyle(document.documentElement).zoom) || 1;
    return {
      before:(element.getBoundingClientRect().top - parentContent.getBoundingClientRect().bottom) / scale,
      after:(following.getBoundingClientRect().top - headingContent.getBoundingClientRect().bottom) / scale,
      marker:getComputedStyle(element, '::before').content
    };
  });
  expect(positions.before).toBeCloseTo(52, 0); // 12pt after the parent + 27pt before the child.
  expect(positions.after).toBeCloseTo(12, 0);
  expect(positions.marker).toBe('"1."');
});

test('@notes wrapped OneNote paragraphs still expose Markdown headings once in the outline', async ({ app, appPage: page }) => {
  const generated = oneNoteComPageXmlToHtml(`<one:Page xmlns:one="urn:onenote"><one:Outline><one:OEChildren>
    <one:OE spaceAfter="12"><one:T>## Раздел</one:T><one:OEChildren>
      <one:OE><one:T>### Подраздел</one:T></one:OE>
    </one:OEChildren></one:OE>
  </one:OEChildren></one:Outline></one:Page>`);
  await page.route('**/api/page-html?**', route => route.fulfill({ json:{ html:generated } }));
  await page.goto(`${app.baseUrl}/page/page-grace`);
  await page.getByRole('button', { name:'Показать HTML', exact:true }).click();
  await expect(page.getByRole('navigation', { name:'Структура документа' }).locator('.document-outline-link'))
    .toHaveText(['Раздел', 'Подраздел']);
});
