import { test, expect } from '../../fixtures/app.fixture.js';

for (const mode of ['html', 'text']) {
  test(`@notes ${mode} focus menu dismisses on outside clicks and Escape`, async ({ app, appPage: page }) => {
    await page.setViewportSize({ width:1536, height:850 });
    await page.goto(`${app.baseUrl}/page/page-grace`);
    if (mode === 'html') await page.getByRole('button', { name:'Показать HTML', exact:true }).click();
    await page.getByRole('button', { name:'Открыть страницу «Благодать и надежда» целиком' }).click();
    const menu = page.locator('#pageFocusMenu');
    const toggle = page.locator('#pageFocusMenuButton');
    const documentText = mode === 'html'
      ? page.frameLocator('#content iframe').locator('body')
      : page.locator('#content .page-text');
    const openMenu = async () => {
      await toggle.click();
      await expect(menu).toBeVisible();
      await expect(menu.getByRole('menuitem')).toHaveCount(2);
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    };
    const expectDismissed = async () => {
      await expect(menu).toBeHidden();
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await expect(page.locator('html')).toHaveClass(/page-focus-mode/);
    };
    await openMenu();
    await menu.click({ position:{ x:2, y:2 } });
    await expect(menu).toBeVisible();
    await toggle.click();
    await expectDismissed();

    await openMenu();
    await page.locator('.page-focus-note-icon').click();
    await expectDismissed();
    await openMenu();
    await documentText.click({ position:{ x:20, y:mode === 'html' ? 100 : 20 } });
    await expectDismissed();

    await openMenu();
    // Focus the document without a pointer event, so Escape exercises the frame bridge.
    await documentText.evaluate(element => { element.tabIndex = -1; element.focus(); });
    await page.keyboard.press('Escape');
    await expectDismissed();
    await expect(toggle).toBeFocused();

    await page.keyboard.press('Control+f');
    await expect(page.locator('#pageFindWidget')).toBeVisible();
    await openMenu();
    await page.keyboard.press('Escape');
    await expectDismissed();
    await expect(page.locator('#pageFindWidget')).toBeVisible();
    await page.locator('#pageFindClose').click();

    if (mode === 'html') {
      await openMenu();
      await page.evaluate(() => {
        window.postMessage({ type:'onenote-page-pointerdown' }, '*');
        window.postMessage({ type:'onenote-page-escape' }, '*');
      });
      // A round trip through the event loop lets the forged messages reach listeners.
      await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 0)));
      await expect(menu).toBeVisible();
      await toggle.click();
    }
    await openMenu();
    await menu.getByRole('menuitem', { name:'Молитва учеников', exact:true }).click();
    await expect(menu).toBeHidden();
    await expect(page.locator('#pageFocusTitle')).toHaveText('Молитва учеников');
  });
}
