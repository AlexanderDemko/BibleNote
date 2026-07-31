import { test, expect } from '../../fixtures/app.fixture.js';

test('@electron @settings UI отображает состояние Electron control bridge', async ({ appPage: page }) => {
  await page.locator('#openSettings').click();

  await expect.poll(() => page.locator('#protocolStatus').textContent()).toContain('BibleNote');
  await expect(page.locator('#oneNoteIntegrationSettings')).not.toHaveAttribute('hidden', '');
  await expect(page.locator('#enableOneNoteRibbon')).toBeDisabled();
});
