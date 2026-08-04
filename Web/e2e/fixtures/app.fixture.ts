import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { test as base, expect, type Page } from '@playwright/test';
import { startCacheUi } from '../../src/cache-ui.js';
import { seedCache } from './seed-cache.js';
import { startFakeBibleNoteApi, startFakeElectronControl, startFakeGraph } from './fake-services.js';

export type E2EApp = {
  baseUrl: string;
  dbPath: string;
  directory: string;
};

type Fixtures = {
  app: E2EApp;
  appPage: Page;
  browserFailures: void;
};

export const test = base.extend<Fixtures>({
  app: async ({}, use) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'biblenote-e2e-'));
    const dbPath = path.join(directory, 'onenote-cache.sqlite');
    const bibleNote = await startFakeBibleNoteApi();
    const electron = await startFakeElectronControl();
    const graph = await startFakeGraph();
    const previousEnvironment = {
      BIBLENOTE_API_URL: process.env.BIBLENOTE_API_URL,
      BIBLENOTE_E2E: process.env.BIBLENOTE_E2E,
      BIBLENOTE_E2E_GRAPH_ROOT: process.env.BIBLENOTE_E2E_GRAPH_ROOT,
      BIBLENOTE_E2E_GRAPH_ACCESS_TOKEN: process.env.BIBLENOTE_E2E_GRAPH_ACCESS_TOKEN,
      ONENOTE_ELECTRON_CONTROL_URL: process.env.ONENOTE_ELECTRON_CONTROL_URL,
      ONENOTE_ENV_FILE: process.env.ONENOTE_ENV_FILE,
      ONENOTE_DATA_SOURCE: process.env.ONENOTE_DATA_SOURCE,
      BIBLENOTE_DATA_SOURCES: process.env.BIBLENOTE_DATA_SOURCES,
      ONENOTE_TOKEN_CACHE: process.env.ONENOTE_TOKEN_CACHE,
      ONENOTE_BIBLE_PARSE_ENABLED: process.env.ONENOTE_BIBLE_PARSE_ENABLED,
      BIBLENOTE_API_TIMEOUT_MS: process.env.BIBLENOTE_API_TIMEOUT_MS
    };

    process.env.BIBLENOTE_API_URL = bibleNote.baseUrl;
    process.env.BIBLENOTE_E2E = '1';
    process.env.BIBLENOTE_E2E_GRAPH_ROOT = graph.baseUrl;
    process.env.BIBLENOTE_E2E_GRAPH_ACCESS_TOKEN = 'e2e-access-token';
    process.env.ONENOTE_ELECTRON_CONTROL_URL = electron.baseUrl;
    process.env.ONENOTE_ENV_FILE = path.join(directory, '.env');
    process.env.ONENOTE_DATA_SOURCE = 'graph';
    process.env.BIBLENOTE_DATA_SOURCES = Buffer.from(JSON.stringify([
      { type:'graph', id:'source:graph', displayName:'OneNote Cloud' }
    ]), 'utf8').toString('base64url');
    process.env.ONENOTE_TOKEN_CACHE = path.join(directory, 'msal-cache.json');
    process.env.ONENOTE_BIBLE_PARSE_ENABLED = 'false';
    process.env.BIBLENOTE_API_TIMEOUT_MS = '5000';

    seedCache(dbPath);
    const server = startCacheUi({ dbPath, port: 0 });
    if (!server.listening) await once(server, 'listening');
    const address = server.address() as AddressInfo;

    try {
      await use({ baseUrl: `http://127.0.0.1:${address.port}`, dbPath, directory });
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close(error => error ? reject(error) : resolve());
        server.closeAllConnections();
      });
      await Promise.all([bibleNote.close(), electron.close(), graph.close()]);
      for (const [key, value] of Object.entries(previousEnvironment)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      fs.rmSync(directory, { recursive: true, force: true });
    }
  },

  appPage: async ({ app, context, page }, use) => {
    await context.addInitScript(() => {
      if (window.top !== window) return;
      localStorage.setItem('biblenote.setupWizardDone', 'true');
      localStorage.setItem('biblenote.microsoftScopeVersion', 'notes-read-all-v1');
      localStorage.setItem('onenote.pageViewMode', 'text');
      localStorage.setItem('onenote.bibleModule', 'rst');
      localStorage.removeItem('onenote.hiddenNotebookIds');
      localStorage.removeItem('onenote.searchHistory');
    });
    await page.goto(app.baseUrl);
    await expect(page.locator('#status')).not.toContainText('Загрузка', { timeout: 10_000 });
    try {
      await use(page);
    } finally {
      if (!page.isClosed()) await page.close();
    }
  },

  browserFailures: [async ({ page }, use) => {
    const failures: string[] = [];
    page.on('pageerror', error => failures.push(`pageerror: ${error.message}`));
    page.on('console', message => {
      if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) {
        failures.push(`console.error: ${message.text()}`);
      }
    });
    page.on('response', response => {
      if (response.status() < 400 || response.status() === 503) return;
      const pathname = new URL(response.url()).pathname;
      if (pathname === '/favicon.ico') return;
      failures.push(`http ${response.status()}: ${response.url()}`);
    });
    await use();
    expect(failures, failures.join('\n')).toEqual([]);
  }, { auto: true }]
});

export { expect } from '@playwright/test';
