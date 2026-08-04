import { test, expect } from '../../fixtures/app.fixture.js';

function minimalPdf(): Buffer {
  const commands = 'BT /F1 22 Tf 72 700 Td (BibleNote PDF viewer Deut 17:19) Tj 0 -40 Td (Paul, apostle Christ) Tj 0 -40 Td (Search token and Search token) Tj ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(commands, 'ascii')} >>\nstream\n${commands}\nendstream`
  ];
  let output = '%PDF-1.4\n';
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(output, 'ascii'));
    output += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(output, 'ascii');
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) output += `${String(offset).padStart(10, '0')} 00000 n \n`;
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(output, 'ascii');
}

test('@notes PDF viewer renders an original page with navigation and a text layer', async ({ app, page }) => {
  await page.route('**/api/page-pdf?id=pdf-page', route => route.fulfill({
    status:200,
    contentType:'application/pdf',
    body:minimalPdf()
  }));
  await page.goto(`${app.baseUrl}/ui/pdf-viewer.html?id=pdf-page`);
  await expect(page.locator('#viewer .page[data-page-number="1"] canvas')).toBeVisible({ timeout:15_000 });
  await expect(page.locator('#pageCount')).toHaveText('/ 1');
  await expect(page.locator('#viewer .textLayer')).toContainText('BibleNote PDF viewer Deut 17:19');
  await expect(page.locator('#previousPage')).toBeDisabled();
  await expect(page.locator('#nextPage')).toBeDisabled();

  const zoom = page.locator('#pdfZoom');
  const zoomValue = page.locator('#pdfZoomValue');
  const renderedPage = page.locator('#viewer .page[data-page-number="1"]');
  const initialWidth = await renderedPage.evaluate(element => element.getBoundingClientRect().width);
  await zoom.fill('150');
  await expect(zoomValue).toHaveText('150%');
  const enlargedWidth = await renderedPage.evaluate(element => element.getBoundingClientRect().width);
  expect(enlargedWidth).toBeGreaterThan(initialWidth * 1.4);
  await page.evaluate(() => window.postMessage({ type:'onenote-html-zoom', zoom:0.8 }, '*'));
  await expect(zoom).toHaveValue('80');
  await expect(zoomValue).toHaveText('80%');

  const fitButton = page.locator('#fitWidth');
  await expect(fitButton).toHaveText('По ширине');
  await expect(fitButton).toHaveAttribute('aria-pressed', 'false');
  await fitButton.click();
  await expect(fitButton).toHaveText('Страница целиком');
  await expect(fitButton).toHaveAttribute('aria-pressed', 'true');
  await fitButton.click();
  await expect(fitButton).toHaveText('По ширине');
  await expect(fitButton).toHaveAttribute('aria-pressed', 'false');

  await page.evaluate(() => window.postMessage({
    type:'onenote-main-search',
    source:'BibleNote|Search|viewer',
    flags:'giu',
    queries:['BibleNote', 'Search', 'viewer'],
    entireWord:true,
    index:0,
    scroll:true
  }, '*'));
  await expect(page.locator('.textLayer .highlight')).toHaveCount(4);
  await expect(page.locator('.textLayer .highlight.selected')).toHaveCount(1);

  await page.evaluate(() => window.postMessage({
    type:'onenote-main-search',
    source:'(?<![\\p{L}\\p{N}_])Paul[^\\p{L}\\p{N}_]+apostle[^\\p{L}\\p{N}_]+Christ(?![\\p{L}\\p{N}_])',
    flags:'giu',
    mode:'phrase',
    queries:['Paul apostle Christ'],
    entireWord:false,
    index:0,
    scroll:true
  }, '*'));
  await expect(page.locator('.textLayer .highlight')).toHaveCount(1);
  await expect(page.locator('.textLayer .highlight.selected')).toHaveText('Paul, apostle Christ');

  await page.evaluate(() => window.postMessage({
    type:'onenote-main-search',
    source:'missing[^\\p{L}\\p{N}_]+phrase',
    flags:'giu',
    mode:'phrase',
    queries:['missing phrase'],
    entireWord:false,
    index:0,
    scroll:true
  }, '*'));
  await expect(page.locator('.textLayer .highlight')).toHaveCount(0);
});

test('@notes PDF viewer replays a search posted by its parent while the document is loading', async ({ app, page }) => {
  await page.route('**/api/page-pdf?id=pdf-page', route => route.fulfill({
    status:200,
    contentType:'application/pdf',
    body:minimalPdf()
  }));
  await page.route('**/pdf-parent-test', route => route.fulfill({
    status:200,
    contentType:'text/html',
    body:`<!doctype html><iframe id="pdf" src="/ui/pdf-viewer.html?id=pdf-page"></iframe><script>
      const frame = document.getElementById('pdf');
      const search = () => frame.contentWindow.postMessage({
        type:'onenote-main-search', source:'BibleNote|Search|viewer', flags:'giu',
        queries:['BibleNote', 'Search', 'viewer'], entireWord:true, index:0, scroll:true
      }, '*');
      frame.addEventListener('load', search);
      window.addEventListener('message', event => {
        if (event.source === frame.contentWindow && event.data?.type === 'onenote-html-ready') search();
      });
    </script>`
  }));
  await page.goto(`${app.baseUrl}/pdf-parent-test`);
  const frame = page.frameLocator('#pdf');
  await expect(frame.locator('.textLayer .highlight')).toHaveCount(4, { timeout:15_000 });
  await expect(frame.locator('.textLayer .highlight.selected')).toHaveCount(1);
});

test('@notes PDF viewer navigates main-search matches and adds Bible links to its text layer', async ({ app, page }) => {
  await page.route('**/api/page-pdf?id=pdf-page', route => route.fulfill({
    status:200,
    contentType:'application/pdf',
    body:minimalPdf()
  }));
  await page.goto(`${app.baseUrl}/ui/pdf-viewer.html?id=pdf-page`);
  await expect(page.locator('#viewer .textLayer')).toContainText('Deut 17:19', { timeout:15_000 });

  const firstSearch = await page.evaluate(() => new Promise<{ count:number; index:number }>(resolve => {
    const listener = (event: MessageEvent) => {
      if (event.data?.type !== 'onenote-main-search-result' || event.data?.count !== 2) return;
      window.removeEventListener('message', listener);
      resolve({ count:event.data.count, index:event.data.index });
    };
    window.addEventListener('message', listener);
    window.postMessage({
      type:'onenote-main-search',
      source:'Search',
      flags:'giu',
      queries:['Search'],
      entireWord:true,
      index:0,
      scroll:true
    }, '*');
  }));
  expect(firstSearch).toEqual({ count:2, index:0 });
  await expect(page.locator('.textLayer .highlight')).toHaveCount(2);
  await expect(page.locator('.textLayer .highlight.selected')).toHaveCount(1);

  const nextSearch = await page.evaluate(() => new Promise<{ count:number; index:number }>(resolve => {
    const listener = (event: MessageEvent) => {
      if (event.data?.type !== 'onenote-main-search-result' || event.data?.index !== 1) return;
      window.removeEventListener('message', listener);
      resolve({ count:event.data.count, index:event.data.index });
    };
    window.addEventListener('message', listener);
    window.postMessage({
      type:'onenote-main-search',
      source:'Search',
      flags:'giu',
      queries:['Search'],
      entireWord:true,
      index:1,
      scroll:true
    }, '*');
  }));
  expect(nextSearch).toEqual({ count:2, index:1 });

  await page.evaluate(() => window.postMessage({
    type:'onenote-pdf-context',
    bibleLinks:[{ text:'Deut 17:19', href:'bnVerse:Второзаконие 17:19', title:'Второзаконие 17:19' }],
    targets:[{ paragraphIndex:7, query:'Deut 17:19', highlightText:'Deut 17:19' }]
  }, '*'));
  const bibleLink = page.locator('.pdf-bible-link').first();
  await expect(bibleLink).toHaveAttribute('href', 'bnVerse:Второзаконие 17:19');

  const openedHref = page.evaluate(() => new Promise<string>(resolve => {
    const listener = (event: MessageEvent) => {
      if (event.data?.type !== 'onenote-bible-link') return;
      window.removeEventListener('message', listener);
      resolve(event.data.href);
    };
    window.addEventListener('message', listener);
  }));
  await bibleLink.click();
  await expect(openedHref).resolves.toBe('bnVerse:Второзаконие 17:19');

  await page.evaluate(() => window.postMessage({
    type:'onenote-scroll-target-paragraph',
    paragraphIndex:7,
    targetIndex:0
  }, '*'));
  await expect(page.locator('.textLayer .highlight')).toHaveCount(2);

  await page.evaluate(() => window.postMessage({
    type:'onenote-main-search',
    source:'',
    flags:'',
    queries:[],
    entireWord:false,
    index:0,
    scroll:false
  }, '*'));
  await page.evaluate(() => window.postMessage({
    type:'onenote-scroll-target-paragraph',
    paragraphIndex:7,
    targetIndex:0
  }, '*'));
  await expect(page.locator('.textLayer .highlight').first()).toBeVisible();
});
