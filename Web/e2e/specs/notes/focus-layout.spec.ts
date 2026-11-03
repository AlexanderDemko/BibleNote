import { test, expect } from '../../fixtures/app.fixture.js';

for (const mode of ['onenote', 'word', 'text']) {
  test(`@notes ${mode} focus header stays accessible beside parallel references`, async ({ app, appPage: page }) => {
    const title = 'Занятие 11. 2-е Тимофею 3:16-17 — Слово Божье';
    await page.setViewportSize({ width:1600, height:850 });
    await page.route('**/api/page?id=page-grace', async route => {
      const response = await route.fetch();
      await route.fulfill({ json:{ ...await response.json(), title,
        links:mode === 'word' ? { folder:{ extension:'.docx', quality:'structured' } } : {}
      } });
    });
    await page.route('**/api/page-html?**', route => route.fulfill({ json:{
      html:`<body${mode === 'onenote' ? ' class="onenote-com-page"' : ''}><h1>${title}</h1>${mode === 'word' ? '<h2>Раздел документа</h2>' : ''}<p>Текст заметки.</p></body>`
    } }));
    await page.route('**/api/bible/parallel?**', route => route.fulfill({ json:{ rows:[] } }));
    await page.goto(`${app.baseUrl}/page/page-grace`);
    await page.locator('.bible-page-refs > summary').click();
    await page.getByRole('button', { name:'Показать, где в заметке используется Ин 3:16', exact:true }).click();
    await page.locator('.bible-page-refs > summary').click();
    if (mode !== 'text') {
      await page.getByRole('button', { name:'Показать HTML', exact:true }).click();
      await expect(page.locator('#content iframe')).toBeVisible();
      if (mode === 'onenote') await expect(page.getByRole('button', { name:'Структура документа', exact:true })).toBeHidden();
    }
    await page.getByRole('button', { name:`Открыть страницу «${title}» целиком` }).click();
    const toolbar = page.locator('#pageFocusToolbar');
    const zoom = page.locator('#pageFocusZoom');
    const drawer = page.locator('#bibleParallelDrawer');
    const openDrawer = () => page.evaluate(async () => {
      await (window as typeof window & {
        openBibleParallelPanel:(ref:Record<string, unknown>) => Promise<void>;
      }).openBibleParallelPanel({ module:'rst', bookIndex:43, chapter:3, verse:16 });
    });
    await openDrawer();
    for (const width of [1600, 1280, 1100, 900, 720]) {
      await page.setViewportSize({ width, height:850 });
      await expect(drawer).toBeVisible();
      const drawerBox = (await drawer.boundingBox())!;
      const toolbarBox = (await toolbar.boundingBox())!;
      const zoomBox = (await zoom.boundingBox())!;
      const matchesBox = (await page.locator('.match-nav').boundingBox())!;
      expect(matchesBox.y).toBeGreaterThan(Math.max(zoomBox.y + zoomBox.height, toolbarBox.y + toolbarBox.height));
      expect(matchesBox.x).toBeGreaterThanOrEqual(0);
      expect(matchesBox.x + matchesBox.width).toBeLessThan(drawerBox.x);
      expect(toolbarBox.x + toolbarBox.width).toBeLessThan(drawerBox.x);
      expect(zoomBox.x).toBeGreaterThanOrEqual(0);
      expect(zoomBox.x + zoomBox.width).toBeLessThan(toolbarBox.x);
      for (const selector of ['#pageFocusMenuButton', '#pageFocusPrevious', '#pageFocusNext', '#pageFocusExit']) {
        const button = page.locator(selector);
        const box = (await button.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(toolbarBox.x);
        expect(box.x + box.width).toBeLessThanOrEqual(toolbarBox.x + toolbarBox.width);
        expect(await button.evaluate(element => {
          const bounds = element.getBoundingClientRect();
          return element.contains(document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2));
        })).toBe(true);
      }
      if (width === 1600) {
        expect(await page.locator('#pageFocusTitle').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
        await page.locator('html').evaluate(element => { element.dataset.theme = 'c'; });
        await page.screenshot({ path:`.tmp/focus-drawer/${mode}.png` });
      }
    }
    await page.locator('#closeBibleParallelDrawer').click();
    await expect(drawer).toBeHidden();
    await page.getByRole('button', { name:'Следующее совпадение', exact:true }).click();
    await expect(page.locator('.match-count')).toHaveText('2 / 2');
    await page.setViewportSize({ width:1600, height:850 });
    const restoredBox = (await toolbar.boundingBox())!;
    expect(restoredBox.x + restoredBox.width).toBeGreaterThan(1550);
    await page.locator('#pageFocusExit').click();
    await expect(toolbar).toBeHidden();
    // Entering focus while the drawer is already open uses the same layout.
    await openDrawer();
    await page.getByRole('button', { name:`Открыть страницу «${title}» целиком` }).click();
    const reopenedBox = (await toolbar.boundingBox())!;
    expect(reopenedBox.x + reopenedBox.width).toBeLessThan((await drawer.boundingBox())!.x);
    await page.locator('#pageFocusExit').click();
    await expect(toolbar).toBeHidden();
  });
}
