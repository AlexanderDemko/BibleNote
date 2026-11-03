import { test, expect } from '../../fixtures/app.fixture.js';

for (const theme of ['b', 'c']) {
  test(`@notes @search ссылки выделяются вместе с абзацами в теме ${theme}`, async ({ appPage: page }) => {
    await page.locator('#openSettings').click();
    const viewSettings = page.locator('#settingsDialog details.view-settings');
    if (await viewSettings.getAttribute('open') === null) await viewSettings.locator('summary').click();
    await page.locator('#themeSelect').selectOption(theme);
    await page.locator('#closeSettings').click();
    await page.locator('#search').fill('Ин 3:16');
    await page.locator('#tree .search-result-row').filter({ hasText:'Благодать и надежда' }).click();
    await expect(page.locator('.match-nav .match-count')).toHaveText('1 / 3');

    const textLinks = page.locator('.page-text .bible-reference-target');
    await expect(textLinks).toHaveText(['Ин 3:14-16', 'Ин 3:16', 'Ин 3:16']);
    await expect(page.locator('.page-text .bible-reference-target.current-match')).toHaveText('Ин 3:14-16');
    await expect(page.locator('.page-text .bible-paragraph-target.current-match')).toHaveCount(1);
    await expect(textLinks.first()).toHaveCSS('outline-width', '2px');
    await expect(textLinks.nth(1)).toHaveCSS('outline-width', '1px');

    await page.getByRole('button', { name:'Показать HTML', exact:true }).click();
    const frame = page.frameLocator('#content iframe.html-frame');
    await expect(frame.locator('html')).toHaveAttribute('data-content-theme', theme === 'c' ? 'dark' : 'light');
    const links = frame.locator('[data-onenote-target-match="true"]');
    const currentLink = frame.locator('[data-onenote-target-match-current="true"]');
    await expect(links).toHaveText(['Ин 3:14-16', 'Ин 3:16', 'Ин 3:16']);
    await expect(currentLink).toHaveText('Ин 3:14-16');
    await expect(links.nth(1)).toHaveCSS('outline-width', '1px');
    await expect(currentLink).toHaveCSS('outline-width', '2px');
    await expect.poll(() => links.nth(1).evaluate(element => getComputedStyle(element).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
    await expect(frame.locator('[data-onenote-target-paragraph-current="true"]')).toHaveCount(1);

    // Two separate occurrences in the same paragraph remain independently selectable.
    await page.getByRole('button', { name:'Следующее совпадение' }).click();
    await expect(currentLink).toHaveAttribute('data-onenote-target-match-index', '1');
    await expect(currentLink).toHaveText('Ин 3:16');
    await expect(links.first()).toHaveCSS('outline-width', '1px');
    await expect(frame.locator('[data-onenote-target-paragraph-current="true"]')).toContainText('В тяжбе');

    // Replacing targets on the loaded page removes the unrelated range highlight.
    const references = page.locator('details.bible-page-refs');
    await references.locator('summary').click();
    await references.getByRole('button', { name:'Показать, где в заметке используется Ин 3:16', exact:true }).click();
    await expect(links).toHaveText(['Ин 3:16', 'Ин 3:16']);
    await expect(textLinks).toHaveText(['Ин 3:16', 'Ин 3:16']);
    const range = frame.getByRole('link', { name:'Ин 3:14-16', exact:true });
    await expect(range).not.toHaveAttribute('data-onenote-target-match');
    await expect.poll(() => range.evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
    await references.locator('summary').click();
    await page.getByRole('button', { name:'Следующее совпадение' }).click();
    await expect(currentLink).toHaveAttribute('data-onenote-target-match-index', '1');
    await expect(frame.locator('[data-onenote-target-paragraph-current="true"]')).toContainText('Воскресение');
    await expect(currentLink).toBeInViewport();
    await page.screenshot({ path:`.tmp/reference-highlight-${theme}.png` });

    await page.getByRole('button', { name:'Закрыть навигацию по совпадениям' }).click();
    await expect(frame.locator('[data-onenote-target-match],[data-onenote-target-paragraph]')).toHaveCount(0);
    await expect(textLinks).toHaveCount(0);
    await expect(page.locator('.page-text .current-match')).toHaveCount(0);
    await expect.poll(() => frame.getByRole('link', { name:'Ин 3:16', exact:true }).last()
      .evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
    await frame.getByRole('link', { name:'Ин 3:16', exact:true }).last().click();
    await expect(page.locator('#bibleTextDialog')).toBeVisible();
  });
}
