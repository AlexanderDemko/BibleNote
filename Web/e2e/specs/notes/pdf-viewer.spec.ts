import { test, expect } from '../../fixtures/app.fixture.js';

function minimalPdf(lines = [
  'BibleNote PDF viewer Deut 17:19',
  'Paul, apostle Christ',
  'Search token and Search token',
  '3 Kings 8:51, 53 and unrelated 53'
], additionalPages: string[][] = []): Buffer {
  const pages = [lines, ...additionalPages];
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pages.map((_, index) => `${4 + index * 2} 0 R`).join(' ')}] /Count ${pages.length} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ];
  for (const [index, pageLines] of pages.entries()) {
    const commands = 'BT /F1 22 Tf 72 700 Td '
      + pageLines.map(line => '(' + line.replace(/[\\()]/g, '\\$&') + ') Tj').join(' 0 -40 Td ') + ' ET';
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + index * 2} 0 R >>`,
      `<< /Length ${Buffer.byteLength(commands, 'ascii')} >>\nstream\n${commands}\nendstream`
    );
  }
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

for (const exactMetadata of [true, false]) {
  test(`@notes PDF repeated reference navigation selects its physical occurrence (metadata: ${exactMetadata})`, async ({ app, appPage: page }) => {
    const lines = ['First Phil. 4:6', 'Second Phil. 4:6', 'Third Phil. 4:6; 1Thess. 5:17'];
    const paragraphs = lines.map((text, index) => ({
      index, text, references:['Phil. 4:6', ...(index === 2 ? ['1Thess. 5:17'] : [])].map(originalText => ({
        originalText, normalizedRef:originalText, entryType:'BookChapterVerse',
        startIndex:text.indexOf(originalText), endIndex:text.indexOf(originalText) + originalText.length - 1
      }))
    }));
    const occurrences = paragraphs.flatMap(paragraph => paragraph.references.map(reference => ({
      paragraphIndex:paragraph.index, startIndex:reference.startIndex, endIndex:reference.endIndex
    })));
    const pdfBibleLinks = [
      { text:'Phil. 4:6', pageNumber:1, occurrenceIndex:0 },
      { text:'Phil. 4:6', pageNumber:2, occurrenceIndex:0 },
      { text:'Phil. 4:6', pageNumber:2, occurrenceIndex:1 },
      { text:'1Thess. 5:17', pageNumber:2, occurrenceIndex:0 }
    ].map(link => ({ ...link, href:'bnVerse:' + link.text }));
    await page.route('**/api/page?id=pdf-repeated-target', route => route.fulfill({ json:{
      id:'pdf-repeated-target', title:'Repeated references', text:lines.join('\n'), hasContent:1, hasHtml:true,
      parentNotebook:{ id:'notebook-pdf', displayName:'Документы' },
      parentSection:{ id:'section-pdf', displayName:'PDF' },
      links:{ folder:{ extension:'.pdf', quality:'textual' } }
    } }));
    await page.route('**/api/bible/page?**', route => route.fulfill({ json:{
      paragraphs, ...(exactMetadata ? { pdfBibleLinks } : {})
    } }));
    await page.route('**/api/page-pdf?id=pdf-repeated-target', route => route.fulfill({
      contentType:'application/pdf', body:minimalPdf([lines[0]], [lines.slice(1), ['No references here']])
    }));
    await page.goto(`${app.baseUrl}/page/pdf-repeated-target`);
    await page.getByRole('button', { name:'Показать PDF', exact:true }).click();
    const frame = page.frameLocator('iframe.pdf-frame');
    await expect(frame.locator('.textLayer').first()).toContainText(lines[0]);
    await frame.locator('#pageNumber').fill('2');
    await frame.locator('#pageNumber').press('Enter');
    const selectOccurrences = async (items: typeof occurrences) => page.evaluate(items => {
      (document.querySelector('#content article') as HTMLElement & { updateSearchMatches:(data:unknown) => void }).updateSearchMatches({
        paragraphIndexes:[...new Set(items.map(item => item.paragraphIndex))], bibleOccurrences:items,
        query:'', bibleResult:true, scrollToFirst:true
      });
    }, items);
    await selectOccurrences(occurrences);
    const selected = frame.locator('.textLayer .highlight.selected');
    const assertOccurrence = async (index:number) => {
      await expect(page.locator('.match-count')).toHaveText(`${index + 1} / 4`);
      await expect(selected).toHaveCount(1);
      await expect(selected).toHaveText(index === 3 ? '1Thess. 5:17' : 'Phil. 4:6');
      await expect.poll(() => selected.evaluate(element => ({
        page:Number(element.closest('.page')?.getAttribute('data-page-number')),
        line:element.parentElement?.textContent
      }))).toEqual({ page:index === 0 ? 1 : 2, line:lines[Math.min(index, 2)] });
      await expect(selected).toBeInViewport();
    };
    await assertOccurrence(0);
    for (const index of [1, 2, 3]) {
      await page.getByRole('button', { name:'Следующее совпадение', exact:true }).click();
      await assertOccurrence(index);
    }
    for (const index of [2, 1, 0]) {
      await page.getByRole('button', { name:'Предыдущее совпадение', exact:true }).click();
      await assertOccurrence(index);
    }
    // A subset must retain its ordinal in the complete PDF.
    await selectOccurrences([occurrences[2]]);
    await expect(page.locator('.match-count')).toHaveText('1 / 1');
    await expect.poll(() => selected.evaluate(element => element.parentElement?.textContent)).toBe(lines[2]);
    await page.getByRole('button', { name:'Закрыть навигацию по совпадениям' }).click();
    await expect(selected).toHaveCount(0);
  });
}

test('@notes @settings запуск восстанавливает прокрутку и масштаб PDF', async ({ app, appPage: page }) => {
  await page.setViewportSize({ width:1100, height:620 });
  await page.evaluate(() => localStorage.setItem('biblenote.tabs.startupMode', 'restore'));
  await page.route('**/api/page?id=pdf-startup-scroll', route => route.fulfill({ json:{
    id:'pdf-startup-scroll', title:'PDF с прокруткой', text:'PDF document', hasContent:1, hasHtml:true,
    parentNotebook:{ id:'notebook-pdf', displayName:'Документы' },
    parentSection:{ id:'section-pdf', displayName:'PDF' },
    links:{ folder:{ extension:'.pdf', quality:'textual' } }
  } }));
  await page.route('**/api/bible/page?**', route => route.fulfill({ json:{ paragraphs:[] } }));
  await page.route('**/api/page-pdf?id=pdf-startup-scroll', route => route.fulfill({
    contentType:'application/pdf', body:minimalPdf()
  }));
  await page.goto(`${app.baseUrl}/page/pdf-startup-scroll`);
  await page.getByRole('button', { name:'Показать PDF', exact:true }).click();
  const frame = page.frameLocator('#content iframe.pdf-frame');
  const viewer = frame.locator('#viewerContainer');
  await expect(frame.locator('#viewer canvas')).toBeVisible();
  await frame.locator('#pdfZoom').fill('200');
  await expect.poll(() => viewer.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
  await viewer.evaluate(element => { element.scrollTop = 400; });
  const scrollTop = await viewer.evaluate(element => element.scrollTop);
  expect(scrollTop).toBeGreaterThan(100);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('biblenote.tabs.session')!).tabs[0].viewState?.frameViewState?.scrollTop)).toBeCloseTo(scrollTop, 0);
  await page.goto(app.baseUrl);
  await expect(frame.locator('#viewer canvas')).toBeVisible();
  await expect(frame.locator('#pdfZoom')).toHaveValue('200');
  await expect.poll(() => viewer.evaluate(element => element.scrollTop)).toBeCloseTo(scrollTop, 0);
});

test('@notes Alt+номер работает из PDF', async ({ app, appPage: page }) => {
  await page.route('**/api/page?id=pdf-tab-shortcut', route => route.fulfill({ json:{
    id:'pdf-tab-shortcut', title:'PDF', text:'PDF document', hasContent:1, hasHtml:true,
    parentNotebook:{ id:'notebook-pdf', displayName:'Документы' },
    parentSection:{ id:'section-pdf', displayName:'PDF' },
    links:{ folder:{ extension:'.pdf', quality:'textual' } }
  } }));
  await page.route('**/api/bible/page?**', route => route.fulfill({ json:{ paragraphs:[] } }));
  await page.route('**/api/page-pdf?id=pdf-tab-shortcut', route => route.fulfill({
    contentType:'application/pdf', body:minimalPdf()
  }));
  await page.goto(`${app.baseUrl}/page/pdf-tab-shortcut`);
  await page.getByRole('button', { name:'Показать PDF', exact:true }).click();
  const frame = page.frameLocator('#content iframe.pdf-frame');
  await expect(frame.locator('.textLayer')).toContainText('BibleNote PDF viewer');
  await page.locator('#newWorkspaceTab').click();
  await page.keyboard.press('Alt+1');
  await frame.locator('.textLayer').click({ position:{ x:5, y:5 } });
  await page.keyboard.press('Alt+2');
  await expect(page.locator('.workspace-tab').nth(1)).toHaveClass(/active/);
  await expect(page.locator('#content')).toBeFocused();
  await page.keyboard.press('Alt+1');
  await expect(frame.locator('.textLayer')).toBeVisible();
});

test('@notes PDF reference target uses the book context of an inherited verse number', async ({ app, appPage: page }) => {
  const lines = ['Phlm. 22 and an unrelated number 122.', 'Ex. 7:11, 22; 8:7.'];
  const text = lines.join('\n');
  const fullStart = text.indexOf('Ex.');
  const verseStart = text.indexOf('22', fullStart);
  await page.route('**/api/page?id=pdf-reference-target', route => route.fulfill({ json:{
    id:'pdf-reference-target', title:'timothy_2', text, hasContent:1, hasHtml:true,
    parentNotebook:{ id:'notebook-pdf', displayName:'Документы' },
    parentSection:{ id:'section-pdf', displayName:'PDF' },
    links:{ folder:{ extension:'.pdf', quality:'textual' } }
  } }));
  await page.route('**/api/bible/page?**', route => route.fulfill({ json:{ paragraphs:[{
    index:0, text, references:[
      {
        originalText:'Ex. 7:11', normalizedRef:'Исход 7:11', bookIndex:2, chapter:7, verse:11,
        entryType:'BookChapterVerse', startIndex:fullStart, endIndex:fullStart + 'Ex. 7:11'.length - 1
      },
      {
        originalText:'22', normalizedRef:'Исход 7:22', bookIndex:2, chapter:7, verse:22,
        entryType:'Verse', startIndex:verseStart, endIndex:verseStart + 1
      }
    ]
  }] } }));
  await page.route('**/api/page-pdf?id=pdf-reference-target', route => route.fulfill({
    contentType:'application/pdf', body:minimalPdf(lines)
  }));
  await page.goto(`${app.baseUrl}/page/pdf-reference-target`);
  await page.getByRole('button', { name:'Показать PDF', exact:true }).click();
  const frame = page.frameLocator('iframe.pdf-frame');
  await expect(frame.locator('.textLayer')).toContainText('Phlm. 22', { timeout:15_000 });
  await page.locator('.bible-page-refs > summary').click();
  await page.getByRole('button', { name:'Показать, где в заметке используется Исход 7:22', exact:true }).click();
  await expect(frame.locator('.textLayer .highlight.selected')).toHaveText('Ex. 7:11, 22');
  await expect(frame.locator('.textLayer .highlight')).toHaveCount(1);
});

test('@notes @settings PDF follows the dark theme without reloading its canvas', async ({ app, appPage: page }) => {
  await page.route('**/api/page?id=pdf-theme', route => route.fulfill({ json:{
    id:'pdf-theme', title:'PDF: тема', text:'PDF document', hasContent:1, hasHtml:true,
    parentNotebook:{ id:'notebook-pdf', displayName:'Документы' },
    parentSection:{ id:'section-pdf', displayName:'PDF' },
    links:{ folder:{ extension:'.pdf', quality:'textual' } }
  } }));
  await page.route('**/api/bible/page?**', route => route.fulfill({ json:{ paragraphs:[] } }));
  await page.route('**/api/page-pdf?id=pdf-theme', route => route.fulfill({
    contentType:'application/pdf', body:minimalPdf()
  }));
  await page.evaluate(() => localStorage.setItem('onenote.theme', 'c'));
  await page.goto(`${app.baseUrl}/page/pdf-theme`);
  await page.getByRole('button', { name:'Показать PDF', exact:true }).click();
  const frame = page.frameLocator('iframe.pdf-frame');
  const canvas = frame.locator('#viewer .page canvas').first();
  await expect(canvas).toBeVisible({ timeout:15_000 });
  await expect(frame.locator('html')).toHaveAttribute('data-content-theme', 'dark');
  await expect(frame.locator('.canvasWrapper').first()).toHaveCSS('filter', 'invert(1) hue-rotate(180deg) brightness(0.82) contrast(0.86)');
  await expect(frame.locator('.textLayer').first()).toHaveCSS('filter', 'none');
  await canvas.evaluate(element => { element.dataset.themeSentinel = 'same canvas'; });
  await frame.locator('#pdfZoom').fill('200');
  const viewer = frame.locator('#viewerContainer');
  await expect.poll(() => viewer.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
  await viewer.evaluate(element => { element.scrollTop = 150; });
  const scroll = await viewer.evaluate(element => element.scrollTop);

  await page.locator('#openSettings').click();
  await page.locator('#settingsDialog details.view-settings > summary').click();
  await page.locator('#themeSelect').selectOption('b');
  await page.locator('#closeSettings').click();
  await expect(frame.locator('html')).toHaveAttribute('data-content-theme', 'light');
  await expect(frame.locator('.canvasWrapper').first()).toHaveCSS('filter', 'none');
  await expect(frame.locator('#pdfZoom')).toHaveValue('200');
  expect(await viewer.evaluate(element => element.scrollTop)).toBe(scroll);
  // Zoom can replace a canvas; mark the currently rendered one before toggling again.
  await canvas.evaluate(element => { element.dataset.themeSentinel = 'same canvas'; });
  await page.locator('#openSettings').click();
  await page.locator('#themeSelect').selectOption('c');
  await page.locator('#closeSettings').click();
  await expect(frame.locator('html')).toHaveAttribute('data-content-theme', 'dark');
  await expect(canvas).toHaveAttribute('data-theme-sentinel', 'same canvas');
  await page.screenshot({ path:'.tmp/content-theme-pdf.png' });
});

test('@notes вкладка сохраняет PDF загруженным и на прежней позиции', async ({ app, page }) => {
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
  await expect(page.locator('.workspace-tab')).toHaveCount(2);

  await page.locator('.workspace-tab').filter({ hasText:'PDF с историей' }).click();
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

test('@notes PDF match navigation stays below zoom beside the parallel drawer and page search', async ({ app, appPage: page }) => {
  const reference = 'John 3:16';
  await page.route('**/api/page?id=page-grace', async route => {
    const response = await route.fetch();
    await route.fulfill({ json:{ ...await response.json(), text:[reference, reference].join('\n'),
      links:{ folder:{ extension:'.pdf', quality:'textual' } }
    } });
  });
  await page.route('**/api/bible/page?**', route => route.fulfill({ json:{
    paragraphs:[0, 1].map(index => ({ index, text:reference, references:[{
      originalText:reference, normalizedRef:'Ин 3:16', bookIndex:43, chapter:3, verse:16,
      topChapter:3, topVerse:16, startIndex:0, endIndex:reference.length - 1
    }] }))
  } }));
  await page.route('**/api/page-pdf?id=page-grace', route => route.fulfill({
    contentType:'application/pdf', body:minimalPdf([reference, reference])
  }));
  await page.route('**/api/bible/parallel?**', route => route.fulfill({ json:{ rows:[] } }));
  await page.goto(`${app.baseUrl}/page/page-grace`);
  await page.locator('.bible-page-refs > summary').click();
  await page.getByRole('button', { name:'Показать, где в заметке используется Ин 3:16', exact:true }).click();
  await page.locator('.bible-page-refs > summary').click();
  await page.getByRole('button', { name:'Показать PDF', exact:true }).click();
  await expect(page.frameLocator('iframe.pdf-frame').locator('#viewer canvas')).toBeVisible();
  await page.getByRole('button', { name:'Открыть страницу «Благодать и надежда» целиком' }).click();
  await page.locator('#pageFocusZoomRange').fill('212');
  await page.evaluate(async () => {
    await (window as typeof window & {
      openBibleParallelPanel:(ref:Record<string, unknown>) => Promise<void>;
    }).openBibleParallelPanel({ module:'rst', bookIndex:43, chapter:3, verse:16 });
  });
  const matches = page.locator('.match-nav');
  for (const width of [1630, 1280, 960, 900, 720]) {
    await page.setViewportSize({ width, height:850 });
    const zoom = (await page.locator('#pageFocusZoom').boundingBox())!;
    const toolbar = (await page.locator('#pageFocusToolbar').boundingBox())!;
    const drawer = (await page.locator('#bibleParallelDrawer').boundingBox())!;
    const box = (await matches.boundingBox())!;
    expect(box.y).toBeGreaterThan(Math.max(zoom.y + zoom.height, toolbar.y + toolbar.height));
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThan(drawer.x);
    for (const button of await matches.getByRole('button').all()) {
      expect(await button.evaluate(element => {
        const bounds = element.getBoundingClientRect();
        return element.contains(document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2));
      })).toBe(true);
    }
    await page.getByRole('button', { name:'Следующее совпадение', exact:true }).click();
    await expect(matches.locator('.match-count')).toHaveText('2 / 2');
    await page.getByRole('button', { name:'Предыдущее совпадение', exact:true }).click();
    await expect(matches.locator('.match-count')).toHaveText('1 / 2');
  }
  await page.keyboard.press('Control+f');
  const find = page.locator('#pageFindWidget');
  await expect(find).toBeVisible();
  const findBox = (await find.boundingBox())!;
  expect((await matches.boundingBox())!.y).toBeGreaterThan(findBox.y + findBox.height);
  await page.getByRole('button', { name:'Закрыть поиск', exact:true }).click();
  await expect(matches).toHaveCSS('top', '72px');
  await page.setViewportSize({ width:1630, height:850 });
  await page.screenshot({ path:'.tmp/match-nav-layout/pdf-focus.png' });
  await page.locator('#closeBibleParallelDrawer').click();
  await expect(page.locator('#bibleParallelDrawer')).toBeHidden();
  await expect(matches).toHaveCSS('right', '16px');
  await page.getByRole('button', { name:'Закрыть навигацию по совпадениям', exact:true }).click();
  await expect(matches).toHaveCount(0);
});

test('@notes PDF focus menu closes from document clicks and Escape', async ({ app, appPage: page }) => {
  await page.setViewportSize({ width:1500, height:850 });
  await page.route('**/api/page?id=page-grace', async route => {
    const response = await route.fetch();
    await route.fulfill({ json:{ ...await response.json(), links:{ folder:{ extension:'.pdf', quality:'textual' } } } });
  });
  await page.route('**/api/page-pdf?id=page-grace', route => route.fulfill({ contentType:'application/pdf', body:minimalPdf() }));
  await page.goto(`${app.baseUrl}/page/page-grace`);
  await page.getByRole('button', { name:'Показать PDF', exact:true }).click();
  const frame = page.frameLocator('#content iframe.pdf-frame');
  await expect(frame.locator('#viewer canvas')).toBeVisible();
  await page.getByRole('button', { name:'Открыть страницу «Благодать и надежда» целиком' }).click();
  const toggle = page.locator('#pageFocusMenuButton');
  const menu = page.locator('#pageFocusMenu');
  await toggle.click();
  await expect(menu).toBeVisible();
  await frame.locator('#viewerContainer').click({ position:{ x:20, y:150 } });
  await expect(menu).toBeHidden();
  await toggle.click();
  await expect(menu).toBeVisible();
  await frame.locator('body').evaluate(element => { element.tabIndex = -1; element.focus(); });
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle).toBeFocused();
  await expect(page.locator('html')).toHaveClass(/page-focus-mode/);
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
    bibleLinks:[
      { text:'Deut 17:19', href:'bnVerse:Второзаконие 17:19', title:'Второзаконие 17:19' },
      { text:'3 Kings 8:51', href:'bnVerse:3Царств 8:51', title:'3 Царств 8:51' },
      { text:'53', matchText:'3 Kings 8:51, 53', href:'bnVerse:3Царств 8:53', title:'3 Царств 8:53' }
    ],
    targets:[{ paragraphIndex:7, query:'Deut 17:19', highlightText:'BibleNote PDF viewer Deut 17:19' }]
  }, '*'));
  const bibleLink = page.locator('.pdf-bible-link[href="bnVerse:Второзаконие 17:19"]');
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

  const inheritedVerseLink = page.locator('.pdf-bible-link[href="bnVerse:3Царств 8:53"]');
  await expect(inheritedVerseLink).toHaveCount(1);
  const openedInheritedHref = page.evaluate(() => new Promise<string>(resolve => {
    const listener = (event: MessageEvent) => {
      if (event.data?.type !== 'onenote-bible-link') return;
      window.removeEventListener('message', listener);
      resolve(event.data.href);
    };
    window.addEventListener('message', listener);
  }));
  await inheritedVerseLink.click();
  await expect(openedInheritedHref).resolves.toBe('bnVerse:3Царств 8:53');

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
