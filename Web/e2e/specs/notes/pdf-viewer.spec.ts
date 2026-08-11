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

test('@notes Назад возвращает PDF на прежнюю позицию', async ({ app, page }) => {
  await page.setViewportSize({ width:1100, height:620 });
  await page.addInitScript(() => {
    localStorage.setItem('biblenote.setupWizardDone', 'true');
    localStorage.setItem('biblenote.microsoftScopeVersion', 'notes-read-all-v1');
    localStorage.setItem('onenote.pageViewMode', 'html');
  });
  await page.route('**/api/page?id=pdf-history', route => route.fulfill({
    status:200,
    contentType:'application/json',
    body:JSON.stringify({
      id:'pdf-history', title:'PDF с историей', text:'PDF document', hasContent:1, hasHtml:true, fetchError:null,
      parentNotebook:{ id:'notebook-pdf', displayName:'Документы' },
      parentSection:{ id:'section-pdf-history', displayName:'PDF' },
      links:{ folder:{ extension:'.pdf', quality:'textual' } }
    })
  }));
  await page.route('**/api/bible/page?**', route => route.fulfill({
    status:200,
    contentType:'application/json',
    body:'{"paragraphs":[]}'
  }));
  await page.route('**/api/page-pdf?id=pdf-history', route => route.fulfill({
    status:200,
    contentType:'application/pdf',
    body:minimalPdf()
  }));

  await page.goto(`${app.baseUrl}/page/pdf-history`);
  const frame = page.frameLocator('iframe.pdf-frame');
  const viewer = frame.locator('#viewerContainer');
  await expect(frame.locator('#viewer .page[data-page-number="1"] canvas')).toBeVisible({ timeout:15_000 });
  await frame.locator('#pdfZoom').fill('300');
  await expect.poll(() => viewer.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
  await viewer.evaluate(element => { element.scrollTop = element.scrollHeight * 0.65; });
  const scrollTop = await viewer.evaluate(element => element.scrollTop);
  expect(scrollTop).toBeGreaterThan(100);

  await page.evaluate(() => (window as typeof window & {
    openBibleTextInReader:(ref: Record<string, unknown>) => Promise<void>;
  }).openBibleTextInReader({ module:'rst', bookIndex:43, chapter:3, verse:16, topChapter:3, topVerse:16 }));
  await expect(page.locator('#content h2')).toHaveText('От Иоанна 3');

  await page.locator('.view-history-back').click();
  await expect(page.locator('#content h2')).toHaveText('PDF с историей');
  await expect(frame.locator('#viewer .page[data-page-number="1"] canvas')).toBeVisible({ timeout:15_000 });
  await expect.poll(async () => viewer.evaluate(element => element.scrollTop)).toBeCloseTo(scrollTop, 0);
});

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
  await expect(zoom).toHaveAttribute('max', '300');
  const renderedPage = page.locator('#viewer .page[data-page-number="1"]');
  const initialWidth = await renderedPage.evaluate(element => element.getBoundingClientRect().width);
  await zoom.fill('150');
  await expect(zoomValue).toHaveText('150%');
  const enlargedWidth = await renderedPage.evaluate(element => element.getBoundingClientRect().width);
  expect(enlargedWidth).toBeGreaterThan(initialWidth * 1.4);

  await zoom.fill('100');
  const pinchStartWidth = await renderedPage.evaluate(element => element.getBoundingClientRect().width);
  const pinchPrevented = await page.locator('#viewerContainer').evaluate(element => {
    const event = new WheelEvent('wheel', { deltaY:-100, ctrlKey:true, bubbles:true, cancelable:true });
    element.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(pinchPrevented).toBe(true);
  await expect.poll(async () => Number(await zoom.inputValue())).toBeGreaterThan(100);
  const pinchWidth = await renderedPage.evaluate(element => element.getBoundingClientRect().width);
  expect(pinchWidth).toBeGreaterThan(pinchStartWidth);

  await page.evaluate(() => window.postMessage({ type:'onenote-html-zoom', zoom:4 }, '*'));
  await expect(zoom).toHaveValue('300');
  await expect(zoomValue).toHaveText('300%');
  await page.evaluate(() => window.postMessage({ type:'onenote-html-zoom', zoom:0.8 }, '*'));
  await expect(zoom).toHaveValue('80');
  await expect(zoomValue).toHaveText('80%');

  await expect(page.locator('#fitWidth')).toHaveCount(0);

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

test('@notes full page PDF uses the shared zoom control to the left of navigation', async ({ app, page }) => {
  await page.setViewportSize({ width:1559, height:603 });
  await page.addInitScript(() => {
    try {
      localStorage.setItem('biblenote.setupWizardDone', 'true');
      localStorage.setItem('biblenote.microsoftScopeVersion', 'notes-read-all-v1');
      localStorage.setItem('onenote.pageViewMode', 'html');
    } catch {}
  });
  await page.route('**/api/page?id=pdf-layout', route => route.fulfill({
    status:200,
    contentType:'application/json',
    body:JSON.stringify({
      id:'pdf-layout',
      title:'Основы веры. Пособие для преподавателя',
      text:'PDF document',
      hasContent:1,
      hasHtml:true,
      fetchError:null,
      parentNotebook:{ id:'notebook-pdf', displayName:'Основы веры' },
      parentSection:{ id:'section-pdf', displayName:'Файлы' },
      links:{ folder:{ extension:'.pdf', quality:'textual' } }
    })
  }));
  await page.route('**/api/bible/page?**', route => route.fulfill({
    status:200,
    contentType:'application/json',
    body:'{"paragraphs":[]}'
  }));
  await page.route('**/api/pages?sectionId=section-pdf', route => route.fulfill({
    status:200,
    contentType:'application/json',
    body:'[{"id":"pdf-layout","title":"Основы веры. Пособие для преподавателя","pageLevel":0}]'
  }));
  await page.route('**/api/page-pdf?id=pdf-layout', route => route.fulfill({
    status:200,
    contentType:'application/pdf',
    body:minimalPdf()
  }));

  await page.goto(`${app.baseUrl}/page/pdf-layout`);
  const pdfFrame = page.frameLocator('iframe.pdf-frame');
  await expect(pdfFrame.locator('#viewer .page[data-page-number="1"] canvas')).toBeVisible({ timeout:15_000 });
  await page.getByRole('button', { name:'Открыть страницу «Основы веры. Пособие для преподавателя» целиком' }).click();
  await expect(page.locator('html')).toHaveClass(/page-focus-mode/);

  const sharedZoom = page.locator('#pageFocusZoom');
  await expect(sharedZoom).toBeVisible();
  await expect(pdfFrame.locator('.pdf-zoom')).toBeHidden();
  const focusToolbar = await page.locator('#pageFocusToolbar').boundingBox();
  const zoomControl = await sharedZoom.boundingBox();
  if (!focusToolbar || !zoomControl) throw new Error('PDF focus toolbar or shared zoom control is not visible.');
  expect(zoomControl.x + zoomControl.width).toBeLessThanOrEqual(focusToolbar.x);

  const renderedPage = pdfFrame.locator('#viewer .page[data-page-number="1"]');
  const initialWidth = await renderedPage.evaluate(element => element.getBoundingClientRect().width);
  const pinchPrevented = await pdfFrame.locator('#viewerContainer').evaluate(element => {
    const event = new WheelEvent('wheel', { deltaY:-100, ctrlKey:true, bubbles:true, cancelable:true });
    element.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(pinchPrevented).toBe(true);
  await expect.poll(async () => Number(await page.locator('#pageFocusZoomRange').inputValue())).toBeGreaterThan(100);
  const enlargedWidth = await renderedPage.evaluate(element => element.getBoundingClientRect().width);
  expect(enlargedWidth).toBeGreaterThan(initialWidth);
});

test('@notes pinch zoom works for Word HTML and extracted text', async ({ app, page }) => {
  await page.setViewportSize({ width:1559, height:603 });
  await page.addInitScript(() => {
    try {
      localStorage.setItem('biblenote.setupWizardDone', 'true');
      localStorage.setItem('biblenote.microsoftScopeVersion', 'notes-read-all-v1');
      localStorage.setItem('onenote.pageViewMode', 'html');
    } catch {}
  });
  await page.route('**/api/page?id=word-layout', route => route.fulfill({
    status:200,
    contentType:'application/json',
    body:JSON.stringify({
      id:'word-layout',
      title:'Документ Word',
      text:'Извлечённый текст Word',
      hasContent:1,
      hasHtml:true,
      fetchError:null,
      parentNotebook:{ id:'notebook-word', displayName:'Документы' },
      parentSection:{ id:'section-word', displayName:'Word' },
      links:{ folder:{ extension:'.docx', quality:'structured' } }
    })
  }));
  await page.route('**/api/bible/page?**', route => route.fulfill({
    status:200,
    contentType:'application/json',
    body:'{"paragraphs":[]}'
  }));
  await page.route('**/api/pages?sectionId=section-word', route => route.fulfill({
    status:200,
    contentType:'application/json',
    body:'[{"id":"word-layout","title":"Документ Word","pageLevel":0}]'
  }));
  await page.route('**/api/page-html?**', route => route.fulfill({
    status:200,
    contentType:'application/json',
    body:JSON.stringify({ html:'<main id="wordContent"><h1>Документ Word</h1><p>Текст из DOCX</p></main>' })
  }));

  await page.goto(`${app.baseUrl}/page/word-layout`);
  const wordFrame = page.frameLocator('iframe.html-frame');
  await expect(wordFrame.locator('#wordContent')).toBeVisible();
  await page.getByRole('button', { name:'Открыть страницу «Документ Word» целиком' }).click();

  const sharedZoom = page.locator('#pageFocusZoom');
  const focusToolbar = page.locator('#pageFocusToolbar');
  await expect(sharedZoom).toBeVisible();
  await expect(page.locator('#pageFocusZoomRange')).toHaveAttribute('max', '300');
  const zoomBox = await sharedZoom.boundingBox();
  const toolbarBox = await focusToolbar.boundingBox();
  if (!zoomBox || !toolbarBox) throw new Error('Word focus toolbar or shared zoom control is not visible.');
  expect(zoomBox.x + zoomBox.width).toBeLessThanOrEqual(toolbarBox.x);

  const htmlPinchPrevented = await wordFrame.locator('body').evaluate(element => {
    const event = new WheelEvent('wheel', { deltaY:-100, ctrlKey:true, bubbles:true, cancelable:true });
    element.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(htmlPinchPrevented).toBe(true);
  await expect.poll(async () => Number(await page.locator('#pageFocusZoomRange').inputValue())).toBeGreaterThan(100);
  await expect.poll(async () => Number(await wordFrame.locator('html').evaluate(element => element.style.zoom))).toBeGreaterThan(1);
  await page.locator('#pageFocusZoomRange').fill('300');
  await expect.poll(async () => Number(await wordFrame.locator('html').evaluate(element => element.style.zoom))).toBe(3);

  await page.locator('#pageFocusExit').click();
  await page.getByRole('button', { name:'Показать извлечённый текст' }).click();
  await page.getByRole('button', { name:'Открыть страницу «Документ Word» целиком' }).click();
  await page.locator('#pageFocusZoomRange').fill('100');
  const textPinchPrevented = await page.locator('.page-text').evaluate(element => {
    const event = new WheelEvent('wheel', { deltaY:-100, ctrlKey:true, bubbles:true, cancelable:true });
    element.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(textPinchPrevented).toBe(true);
  await expect.poll(async () => Number(await page.locator('#pageFocusZoomRange').inputValue())).toBeGreaterThan(100);
  await expect.poll(async () => Number(await page.locator('.page-text').evaluate(element => element.style.zoom))).toBeGreaterThan(1);
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
    targets:[{ paragraphIndex:7, query:'Deut 17:19', highlightText:'BibleNote PDF viewer Deut 17:19' }]
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
    type:'onenote-scroll-target-paragraph',
    paragraphIndex:7,
    targetIndex:0,
    forceTarget:true
  }, '*'));
  await expect(page.locator('.textLayer .highlight')).toHaveCount(1);
  await expect(page.locator('.textLayer .highlight.selected')).toHaveText('Deut 17:19');
});
