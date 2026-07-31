import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e/specs',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  timeout: 30_000,
  expect: { timeout: 7_000 },
  outputDir: './.tmp/e2e-results',
  reporter: process.env.CI
    ? [['line'], ['html', { outputFolder: './.tmp/playwright-report', open: 'never' }]]
    : 'list',
  use: {
    ...devices['Desktop Chrome'],
    channel: process.env.CI ? undefined : 'chrome',
    locale: 'ru-RU',
    timezoneId: 'Europe/Moscow',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off'
  }
});
