import './env.js';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import path from 'node:path';
import { pathToFileURL, URL } from 'node:url';
import * as z from 'zod/v4';
import { bibleParseConfigFromEnv, getVerseTextWithBibleNote, parsePageWithBibleNote } from './bible.js';
import { cacheStatus, defaultDbPath, findParallelBibleReferenceNotes, findParallelBibleReferences, getCachedPage, getSyncState, markPageOpened, openCacheDb, readCachedPage, searchCache, updatePageHtml } from './cache.js';
import { visibleBibleRefSql, visibleBibleScopeSql } from './cache-sql.js';
import { oneNoteImage } from './image-proxy.js';
import { readOneNoteAccessSettings, saveOneNoteAccessSettings } from './onenote-settings.js';
import { configureRuntimeLogging, readRuntimeLoggingSettings, runtimeLog, saveRuntimeLoggingSettings } from './runtime-logging.js';
import { syncOneNoteCache, type SyncProgressEvent, type SyncResult } from './sync.js';

type UiOptions = {
  dbPath: string;
  port: number;
};

type SyncUiState = {
  status: 'idle' | 'running' | 'success' | 'failed';
  startedAt?: string;
  finishedAt?: string;
  progress?: SyncProgressEvent;
  result?: SyncResult;
  error?: string;
};

type CacheDb = ReturnType<typeof openCacheDb>;

const syncRequestSchema = z.object({
  maxPages: z.number().int().min(1).max(1_000_000).optional(),
  concurrency: z.number().int().min(1).max(3).optional(),
  refreshOlderThanHours: z.number().int().min(0).max(1_000_000).optional(),
  notebookIds: z.array(z.string().min(1)).max(1000).optional(),
  sectionId: z.string().min(1).optional(),
  pageId: z.string().min(1).optional(),
  bibleModule: z.string().min(1).optional(),
  metadataOnly: z.boolean().optional(),
  replaceAll: z.boolean().optional(),
  forceContent: z.boolean().optional(),
  includeHtml: z.boolean().optional(),
  parseBibleRefs: z.boolean().optional(),
  forceBibleParse: z.boolean().optional()
});

const uploadBibleNoteModuleRequestSchema = z.object({
  fileName: z.string().min(1),
  contentBase64: z.string().min(1)
});

const notebookDisplayNameRequestSchema = z.object({
  notebookId: z.string().min(1),
  displayName: z.string().nullable().optional()
});

const startupTimingStartedAt = Date.now();
function logStartupTiming(message: string): void {
  if (process.env.ONENOTE_STARTUP_TIMING !== '1') return;
  const line = `[cache-ui startup +${Date.now() - startupTimingStartedAt}ms] ${message}`;
  console.log(line);
  if (process.env.ONENOTE_STARTUP_LOG) {
    try {
      fs.appendFileSync(process.env.ONENOTE_STARTUP_LOG, `${new Date().toISOString()} ${line}\n`, 'utf8');
    } catch {
      // Startup timing must never block the app if the log path is unavailable.
    }
  }
}

function parseArgs(argv: string[]): UiOptions {
  let dbPath = defaultDbPath;
  let port = 4312;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--db') {
      if (!next) throw new Error('--db requires a path.');
      dbPath = path.resolve(next);
      i += 1;
    } else if (arg === '--port') {
      port = Number(next);
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error('--port must be an integer from 1 to 65535.');
      }
      i += 1;
    } else if (arg === '--help' || arg === '-h') {
      console.log('Usage: npm run cache:ui -- [--db <path>] [--port <1..65535>]');
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return { dbPath, port };
}

const pageHtml = String.raw`<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>BibleNote</title>
  <script>
    try {
      const savedTheme = localStorage.getItem('onenote.theme');
      document.documentElement.dataset.theme = ['a', 'b', 'c'].includes(savedTheme) ? savedTheme : 'a';
    } catch { document.documentElement.dataset.theme = 'a'; }
  </script>
  <style>
    :root { color-scheme:light; --bg:#f5f2eb; --sidebar:#ebe6dc; --panel:#fffdf8; --input-bg:#fffdf8; --ink:#27231f; --muted:#746d64; --line:#ddd6cb; --input-line:#cbc2b6; --summary:#5e574f; --accent:#7454a6; --accent-hover:#654492; --accent-soft:#eee7f7; --selected-ink:#4c3074; --hover:rgba(255,255,255,.6); --surface-soft:rgba(255,255,255,.38); --ok:#2f7d53; --danger:#ad3d3d; --pending:#b28a3c; --title-font:Georgia, serif; --reader-font:Georgia, "Times New Roman", serif; --sidebar-width:390px; --row-radius:8px; --mark:#f4df8d; --scroll-track:#e2ddd4; --scroll-thumb:#a99f93; --scroll-thumb-hover:#887d71; }
    :root[data-theme="b"] { color-scheme:light; --bg:#ffffff; --sidebar:#f7f8fa; --panel:#ffffff; --input-bg:#ffffff; --ink:#20242c; --muted:#69717e; --line:#dfe3e8; --input-line:#cfd5dd; --summary:#4e5663; --accent:#5147df; --accent-hover:#4036c7; --accent-soft:#ecebff; --selected-ink:#3730a3; --hover:#eef1f5; --surface-soft:#f1f3f6; --ok:#268a54; --danger:#c24646; --pending:#a67825; --title-font:Inter, "Segoe UI", sans-serif; --reader-font:Inter, "Segoe UI", sans-serif; --sidebar-size:minmax(290px,360px); --row-radius:6px; --mark:#ffe58f; --scroll-track:#edf0f3; --scroll-thumb:#b4bbc5; --scroll-thumb-hover:#89929e; }
    :root[data-theme="c"] { color-scheme:dark; --bg:#18171c; --sidebar:#201e25; --panel:#29262f; --input-bg:#26232b; --ink:#eee9df; --muted:#aaa2ae; --line:#3d3844; --input-line:#4b4552; --summary:#c2bac7; --accent:#ad72e8; --accent-hover:#bd86ef; --accent-soft:#3b2a4d; --selected-ink:#f3e6ff; --hover:#2c2932; --surface-soft:#29262f; --ok:#58ca82; --danger:#ff8080; --pending:#d3a84d; --title-font:Georgia, serif; --reader-font:Georgia, "Times New Roman", serif; --sidebar-size:minmax(300px,390px); --row-radius:6px; --mark:#775c20; --scroll-track:#18171c; --scroll-thumb:#5a5261; --scroll-thumb-hover:#776b80; }
    * { box-sizing: border-box; }
    html, body { height:100%; margin:0; }
    body { font-family: Inter, "Segoe UI", sans-serif; background:var(--bg); color:var(--ink); overflow:hidden; }
    button, input { font:inherit; }
    .app { position:relative; display:grid; grid-template-columns:var(--sidebar-width) 5px minmax(0,1fr); height:100%; }
    .app.sidebar-collapsed { grid-template-columns:0 0 minmax(0,1fr); }
    .sidebar { display:grid; grid-template-rows:auto auto auto auto auto auto minmax(0,1fr) auto; min-width:0; min-height:0; height:100%; overflow:hidden; background:var(--sidebar); border-right:1px solid var(--line); }
    .app.sidebar-collapsed .sidebar { visibility:hidden; border:0; }
    .sidebar-resizer { position:relative; z-index:9; width:5px; cursor:col-resize; touch-action:none; background:transparent; }
    .sidebar-resizer::after { content:''; position:absolute; inset:0 2px; background:transparent; transition:background .14s; }
    .sidebar-resizer:hover::after, .sidebar-resizer.dragging::after, .sidebar-resizer:focus-visible::after { background:var(--accent); }
    .sidebar-resizer:focus-visible { outline:none; }
    .app.sidebar-collapsed .sidebar-resizer { pointer-events:none; }
    .sidebar-toggle { position:absolute; z-index:12; top:14px; left:calc(var(--sidebar-width) - 52px); display:grid; place-items:center; width:40px; height:40px; padding:0; border:1px solid var(--input-line); border-radius:10px; background:var(--input-bg); color:var(--summary); box-shadow:0 2px 8px rgba(20,16,26,.12); cursor:pointer; transition:left .16s, background .14s, color .14s; }
    .sidebar-toggle:hover, .sidebar-toggle:focus-visible { color:var(--accent); background:var(--accent-soft); outline:none; }
    .app.sidebar-collapsed .sidebar-toggle { left:10px; }
    .brand { padding:14px 68px 12px 16px; }
    .brand-line { display:flex; align-items:center; justify-content:space-between; gap:10px; }
    .brand h1 { margin:0; font:700 21px/1.2 var(--title-font); letter-spacing:.2px; }
    .brand p { margin:7px 0 0; color:var(--muted); font-size:13px; }
    .brand-actions { display:flex; align-items:center; gap:7px; flex:none; }
    .settings-button { display:grid; place-items:center; width:40px; height:40px; padding:0; border:1px solid var(--input-line); border-radius:10px; background:var(--input-bg); color:var(--summary); cursor:pointer; flex:none; }
    .settings-button:hover, .settings-button:focus-visible { border-color:var(--accent); color:var(--accent); outline:none; }
    .search-wrap { position:relative; min-width:0; flex:1; padding:0; }
    .search-control { display:flex; align-items:center; gap:2px; min-width:0; height:40px; padding:3px 4px 3px 10px; border:1px solid var(--input-line); border-radius:10px; background:var(--input-bg); }
    .search-control:focus-within { border-color:var(--accent); box-shadow:0 0 0 3px color-mix(in srgb, var(--accent) 16%, transparent); }
    .search { min-width:0; flex:1; padding:8px 3px; border:0; background:transparent; color:var(--ink); outline:none; }
    .search-option { display:grid; place-items:center; width:27px; height:27px; padding:0; border:1px solid transparent; border-radius:5px; background:transparent; color:var(--muted); font:600 11px/1 "Segoe UI", sans-serif; cursor:pointer; flex:none; align-self:center; }
    #searchHistory { font-size:14px; }
    .search-option:hover { background:var(--hover); color:var(--ink); }
    .search-option[aria-pressed="true"] { border-color:var(--accent); background:var(--accent-soft); color:var(--accent); }
    .search-option:focus-visible { outline:1px solid var(--accent); outline-offset:1px; }
    .search-history-menu { position:absolute; z-index:30; left:0; right:0; top:44px; max-height:260px; overflow:auto; padding:5px; border:1px solid var(--input-line); border-radius:10px; background:var(--panel); box-shadow:0 12px 34px rgba(20,16,26,.24); }
    .search-history-menu.hidden { display:none; }
    .search-history-empty { padding:9px 10px; color:var(--muted); font-size:12px; }
    .search-history-row { display:flex; align-items:center; gap:7px; width:100%; min-height:31px; padding:6px 8px; border:0; border-radius:7px; background:transparent; color:var(--ink); text-align:left; cursor:pointer; }
    .search-history-row:hover, .search-history-row.active { background:var(--accent-soft); color:var(--selected-ink); }
    .search-history-text { min-width:0; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .search-history-remove { display:grid; place-items:center; width:22px; height:22px; border:0; border-radius:5px; background:transparent; color:var(--muted); cursor:pointer; flex:none; }
    .search-history-remove:hover { background:var(--hover); color:var(--danger); }
    .sync-panel, .settings-panel, .notebook-panel, .notes-panel, .bible-reader-panel, .log-panel { margin:0 16px; border:0; border-top:1px solid var(--line); background:transparent; overflow:visible; }
    .log-panel { border-bottom:1px solid var(--line); margin-bottom:10px; }
    .sync-panel summary, .settings-panel summary, .notebook-panel summary, .notes-panel summary, .bible-reader-panel summary, .log-panel summary { display:flex; align-items:center; min-height:42px; padding:10px 3px; cursor:pointer; color:var(--summary); font-weight:650; font-size:11px; letter-spacing:.055em; line-height:1.25; list-style:none; text-transform:uppercase; }
    .sync-panel summary:hover, .settings-panel summary:hover, .notebook-panel summary:hover, .notes-panel summary:hover, .bible-reader-panel summary:hover, .log-panel summary:hover { color:var(--accent); }
    .sync-panel summary:focus-visible, .settings-panel summary:focus-visible, .notebook-panel summary:focus-visible, .notes-panel summary:focus-visible, .bible-reader-panel summary:focus-visible, .log-panel summary:focus-visible { outline:0; box-shadow:inset 2px 0 0 var(--accent); }
    .sync-panel summary::-webkit-details-marker, .settings-panel summary::-webkit-details-marker, .notebook-panel summary::-webkit-details-marker, .notes-panel summary::-webkit-details-marker, .bible-reader-panel summary::-webkit-details-marker, .log-panel summary::-webkit-details-marker { display:none; }
    .sync-panel summary::after, .settings-panel summary::after, .notebook-panel summary::after, .notes-panel summary::after, .bible-reader-panel summary::after, .log-panel summary::after { content:''; width:6px; height:6px; margin-left:auto; margin-right:3px; border-right:1.5px solid currentColor; border-bottom:1.5px solid currentColor; transform:rotate(45deg) translate(-1px, 1px); transition:transform .16s ease; opacity:.65; }
    .sync-panel[open] summary::after, .settings-panel[open] summary::after, .notebook-panel[open] summary::after, .notes-panel[open] summary::after, .bible-reader-panel[open] summary::after, .log-panel[open] summary::after { transform:rotate(225deg) translate(-1px, 1px); }
    .sync-panel summary::before { content:'↻'; display:inline-block; margin-right:8px; color:var(--accent); }
    .settings-panel summary::before { content:'⚙'; display:inline-block; margin-right:8px; color:var(--accent); }
    .notebook-panel summary::before { content:'▤'; display:inline-block; margin-right:8px; color:var(--accent); }
    .notes-panel summary::before { content:'☷'; display:inline-block; margin-right:8px; color:var(--accent); }
    .bible-reader-panel summary::before { content:'¶'; display:inline-block; margin-right:8px; color:var(--accent); }
    .log-panel summary::before { content:'☷'; display:inline-block; margin-right:8px; color:var(--accent); }
    .notebook-controls { padding:8px 3px 13px; border-top:0; }
    .notebook-actions { display:flex; gap:7px; margin-bottom:8px; }
    .small-button { padding:5px 8px; border:1px solid var(--input-line); border-radius:6px; background:var(--panel); color:var(--ink); font-size:11px; cursor:pointer; }
    .small-button:hover { border-color:var(--accent); }
    .small-button:disabled { opacity:.5; cursor:not-allowed; border-color:var(--input-line); }
    .notebook-list { display:grid; gap:6px; max-height:180px; overflow:auto; padding-right:3px; }
    .notebook-option { display:flex; align-items:center; gap:5px; min-width:0; font-size:12px; line-height:1.3; }
    .notebook-choice { display:flex; align-items:flex-start; gap:7px; min-width:0; flex:1; cursor:pointer; }
    .notebook-choice input { margin-top:2px; accent-color:var(--accent); }
    .notebook-name { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .notebook-rename { display:grid; place-items:center; width:24px; height:24px; padding:0; border:0; border-radius:6px; background:transparent; color:var(--accent); cursor:pointer; opacity:.58; flex:none; }
    .notebook-rename:hover, .notebook-rename:focus-visible { background:var(--accent-soft); opacity:1; outline:none; }
    .sync-form { display:grid; gap:9px; padding:0 3px 13px; border-top:0; }
    .sync-settings { display:grid; gap:9px; padding:0 3px 13px; }
    .settings-note { margin:0; color:var(--muted); font-size:11px; line-height:1.4; }
    .sync-grid { display:grid; grid-template-columns:1fr 1fr; gap:8px; padding-top:10px; }
    .field { display:grid; gap:4px; color:var(--muted); font-size:11px; }
    .field input, .field select { min-width:0; width:100%; padding:7px 8px; border:1px solid var(--input-line); border-radius:7px; background:var(--input-bg); color:var(--ink); }
    .check { display:flex; align-items:center; gap:7px; color:var(--ink); font-size:12px; }
    .check input { accent-color:var(--accent); }
    .sync-button { padding:9px 12px; border:0; border-radius:8px; background:var(--accent); color:white; font-weight:650; cursor:pointer; }
    .sync-button:hover { background:var(--accent-hover); }
    .sync-button:disabled { opacity:.55; cursor:wait; }
    .sync-state { min-height:16px; color:var(--muted); font-size:11px; line-height:1.35; }
    .log-controls, .bible-controls { display:flex; gap:6px; padding:0 3px 9px; border-top:0; }
    .bible-reader-controls { display:grid; gap:7px; padding:0 3px 11px; border-top:0; }
    .bible-reader-row { display:flex; align-items:center; gap:6px; }
    .bible-reader-select { min-width:0; width:100%; padding:6px 7px; border:1px solid var(--input-line); border-radius:6px; background:var(--input-bg); color:var(--ink); font-size:11px; }
    .bible-reader-select.book { flex:1; }
    .bible-reader-select.chapter { width:78px; flex:none; }
    .notes-panel { grid-row:7; position:relative; min-height:0; height:100%; overflow:hidden; }
    .notes-panel[open] > summary { position:relative; z-index:2; }
    .notes-panel[open] > .tree-shell { position:absolute; left:0; right:0; top:42px; bottom:0; height:auto; }
    .log-filter { min-width:0; flex:1; padding:6px 7px; border:1px solid var(--input-line); border-radius:6px; background:var(--input-bg); color:var(--ink); font-size:11px; }
    .log-list, .bible-list { display:grid; gap:5px; max-height:240px; overflow:auto; padding:0 0 8px; }
    .log-row { width:100%; padding:8px; border:1px solid transparent; border-radius:7px; background:var(--surface-soft); color:inherit; text-align:left; cursor:pointer; }
    .log-row:hover { border-color:var(--input-line); background:var(--panel); }
    .log-title { display:flex; align-items:center; gap:6px; font-size:12px; font-weight:600; }
    .log-path, .log-detail { margin-top:3px; color:var(--muted); font-size:10px; line-height:1.3; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .log-detail.error { color:var(--danger); white-space:normal; }
    .log-badge { width:7px; height:7px; border-radius:50%; background:var(--muted); flex:none; }
    .log-badge.downloaded { background:var(--ok); }
    .log-badge.error { background:var(--danger); }
    .log-badge.missing { background:var(--pending); }
    .log-pager { display:flex; align-items:center; justify-content:space-between; gap:6px; padding:0 3px 11px; color:var(--muted); font-size:10px; }
    .tree-shell { position:relative; min-height:0; height:100%; overflow:hidden; }
    .tree { height:100%; min-height:0; overflow-x:hidden; overflow-y:scroll; padding:0 20px 54px 10px; scrollbar-width:none; overscroll-behavior:contain; }
    .tree::-webkit-scrollbar, .content::-webkit-scrollbar { display:none; width:0; height:0; }
    .tree-row { display:flex; align-items:center; gap:7px; width:100%; min-height:34px; padding:6px 9px 6px calc(9px + var(--tree-level, 0) * 20px); border:0; border-radius:var(--row-radius); background:transparent; color:inherit; text-align:left; cursor:pointer; }
    .tree-row:hover { background:var(--hover); }
    .tree-row.selected { background:var(--accent-soft); color:var(--selected-ink); }
    .tree-row .label { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .tree-row .count { margin-left:auto; color:var(--muted); font-size:11px; }
    .tree-sync, .tree-rename { display:inline-grid; place-items:center; width:24px; height:24px; margin-left:2px; border-radius:6px; color:var(--accent); flex:none; opacity:.58; }
    .tree-row:hover .tree-sync, .tree-sync:focus, .tree-row:hover .tree-rename, .tree-rename:focus { background:var(--accent-soft); opacity:1; outline:none; }
    .tree-sync[aria-disabled="true"] { opacity:.25; cursor:wait; }
    .chevron { width:15px; color:var(--muted); text-align:center; flex:none; }
    .node-icon, .group-icon { position:relative; width:16px; height:14px; flex:none; }
    .group-icon::before, .group-icon::after { content:''; position:absolute; width:11px; height:8px; border:1.5px solid var(--accent); border-radius:2px; }
    .group-icon::before { top:1px; left:3px; opacity:.5; }
    .group-icon::after { top:4px; left:0; background:var(--sidebar); }
    .status-dot { width:7px; height:7px; border-radius:50%; background:var(--muted); flex:none; }
    .status-dot.ok { background:var(--ok); }
    .status-dot.error { background:var(--danger); }
    .status-dot.pending { background:var(--pending); }
    .status-dot.empty { background:var(--muted); }
    .sidebar-footer { grid-row:8; display:block; width:100%; margin-top:0; border:0; border-top:1px solid var(--line); padding:11px 16px; color:var(--muted); font-size:12px; background:var(--surface-soft); text-align:left; cursor:pointer; }
    .sidebar-footer:hover, .sidebar-footer:focus-visible { color:var(--accent); outline:none; }
    .content-shell { position:relative; min-width:0; min-height:0; height:100%; overflow:hidden; background:var(--bg); }
    .content { width:100%; height:100%; min-width:0; min-height:0; overflow-x:hidden; overflow-y:scroll; padding-right:15px; background:var(--bg); scrollbar-width:none; }
    .custom-scrollbar { position:absolute; z-index:8; top:5px; right:3px; bottom:5px; width:10px; border-radius:8px; background:var(--scroll-track); cursor:pointer; opacity:1; }
    .custom-scrollbar-thumb { position:absolute; top:0; left:2px; right:2px; min-height:36px; border-radius:7px; background:var(--scroll-thumb); cursor:grab; transition:background .14s; }
    .custom-scrollbar-thumb:hover, .custom-scrollbar-thumb.dragging { background:var(--scroll-thumb-hover); }
    .custom-scrollbar-thumb.dragging { cursor:grabbing; }
    .custom-scrollbar.inactive { opacity:.42; cursor:default; }
    .custom-scrollbar:focus-visible { outline:2px solid var(--accent); outline-offset:1px; }
    .notebook-list, .log-list { scrollbar-width:auto; scrollbar-color:var(--scroll-thumb) var(--scroll-track); }
    .notebook-list::-webkit-scrollbar, .log-list::-webkit-scrollbar { width:11px; height:11px; }
    .notebook-list::-webkit-scrollbar-button, .log-list::-webkit-scrollbar-button { width:0; height:0; display:none; }
    .notebook-list::-webkit-scrollbar-track, .log-list::-webkit-scrollbar-track { background:var(--scroll-track); }
    .notebook-list::-webkit-scrollbar-thumb, .log-list::-webkit-scrollbar-thumb { min-height:34px; border:3px solid var(--scroll-track); border-radius:10px; background:var(--scroll-thumb); }
    .notebook-list::-webkit-scrollbar-thumb:hover, .log-list::-webkit-scrollbar-thumb:hover { background:var(--scroll-thumb-hover); }
    .empty-state { height:100%; display:grid; place-items:center; padding:40px; color:var(--muted); text-align:center; }
    .empty-mark { display:block; margin:auto auto 14px; width:58px; height:58px; border:2px solid var(--muted); border-radius:18px; transform:rotate(3deg); opacity:.65; }
    .page { max-width:980px; margin:0 auto; padding:30px 42px 32px; }
    .page.html-view-active { padding-bottom:16px; }
    .bible-reader-page { max-width:900px; }
    .bible-reader-toolbar { display:flex; align-items:center; flex-wrap:wrap; gap:8px; margin:14px 0 18px; padding-bottom:14px; border-bottom:1px solid var(--line); }
    .bible-reader-nav-button { display:grid; place-items:center; width:32px; height:32px; padding:0; border:1px solid var(--input-line); border-radius:7px; background:var(--panel); color:var(--accent); cursor:pointer; }
    .bible-reader-nav-button:hover, .bible-reader-nav-button:focus-visible { border-color:var(--accent); background:var(--accent-soft); outline:none; }
    .bible-reader-nav-button:disabled { opacity:.45; cursor:not-allowed; }
    .bible-reader-verses { display:grid; gap:7px; font:17px/1.65 var(--reader-font); }
    .bible-reader-verse-block { display:grid; gap:5px; }
    .bible-reader-verse { display:grid; grid-template-columns:44px minmax(0,1fr) auto; align-items:start; gap:8px; padding:5px 8px; border-radius:7px; cursor:pointer; scroll-margin-top:80px; }
    .bible-reader-verse:hover { background:var(--hover); }
    .bible-reader-verse.selected { background:var(--accent-soft); box-shadow:inset 3px 0 0 var(--accent); color:var(--selected-ink); }
    .bible-reader-verse-number { color:var(--accent); font:650 12px/1.8 Inter, "Segoe UI", sans-serif; text-align:right; user-select:none; }
    .bible-reader-verse-text { min-width:0; }
    .bible-reader-verse-actions { display:flex; align-items:center; gap:4px; opacity:.72; transition:opacity .14s; }
    .bible-reader-verse:hover .bible-reader-verse-actions, .bible-reader-verse:focus-within .bible-reader-verse-actions { opacity:1; }
    .bible-reader-action { display:grid; place-items:center; width:27px; height:27px; padding:0; border:1px solid var(--input-line); border-radius:6px; background:var(--panel); color:var(--accent); font:650 13px/1 Inter, "Segoe UI", sans-serif; cursor:pointer; }
    .bible-reader-action:hover, .bible-reader-action:focus-visible { border-color:var(--accent); background:var(--accent-soft); outline:none; }
    .bible-reader-verse-block > .bible-parallel { margin:2px 8px 8px 52px; }
    .breadcrumbs { color:var(--muted); font-size:12px; margin-bottom:10px; }
    .page-heading { display:flex; align-items:flex-start; gap:12px; }
    .page h2 { flex:1; min-width:0; margin:0; font:700 32px/1.12 var(--title-font); }
    .page-heading-actions { display:flex; align-items:center; gap:6px; margin-top:2px; flex:none; }
    .title-tool { display:grid; place-items:center; width:34px; height:34px; border:1px solid transparent; border-radius:9px; background:transparent; color:var(--accent); font-size:20px; cursor:pointer; flex:none; }
    .title-tool:hover, .title-tool:focus { border-color:var(--input-line); background:var(--accent-soft); outline:none; }
    .title-tool:disabled { opacity:.45; cursor:wait; }
    .title-sync { font-size:21px; }
    .title-sync.syncing { animation:spin .85s linear infinite; }
    .meta { display:flex; align-items:center; flex-wrap:wrap; gap:8px 16px; margin:12px 0 0; padding-bottom:12px; border-bottom:1px solid var(--line); color:var(--muted); font-size:12px; }
    .page-actions { display:flex; align-items:center; flex-wrap:nowrap; gap:8px; margin-left:auto; }
    .bible-page-refs { margin:0 0 14px; padding:0; border-bottom:1px solid var(--line); }
    .bible-page-refs summary { display:flex; align-items:center; min-height:40px; padding:9px 0; cursor:pointer; color:var(--summary); font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:.055em; list-style:none; }
    .bible-page-refs summary::-webkit-details-marker { display:none; }
    .bible-page-refs summary::after { content:''; width:7px; height:7px; margin-left:auto; border-right:1.5px solid currentColor; border-bottom:1.5px solid currentColor; transform:rotate(45deg) translate(-1px, 1px); transition:transform .16s ease; opacity:.65; }
    .bible-page-refs[open] summary::after { transform:rotate(225deg) translate(-1px, 1px); }
    .bible-paragraph { display:grid; gap:7px; padding:10px 0; border-top:1px solid color-mix(in srgb, var(--line) 70%, transparent); }
    .bible-paragraph:first-of-type { border-top:0; }
    .bible-ref-row { display:flex; flex-wrap:wrap; gap:6px; }
    .bible-chip { display:inline-flex; align-items:center; max-width:100%; padding:4px 7px; border:1px solid var(--input-line); border-radius:6px; background:var(--accent-soft); color:var(--selected-ink); font-size:12px; line-height:1.25; cursor:pointer; text-decoration:underline; text-underline-offset:2px; }
    .bible-chip:hover, .bible-chip:focus-visible { border-color:var(--accent); outline:none; }
    .bible-inline-ref { padding:1px 3px; border-radius:4px; background:var(--accent-soft); color:var(--selected-ink); font-weight:650; text-decoration:underline; text-decoration-thickness:1px; text-underline-offset:2px; cursor:pointer; }
    .bible-inline-ref:hover, .bible-inline-ref:focus-visible { outline:1px solid var(--accent); outline-offset:1px; }
    .bible-paragraph-target { display:inline; border-radius:5px; background:color-mix(in srgb, var(--accent) 16%, transparent); box-shadow:0 0 0 2px color-mix(in srgb, var(--accent) 55%, transparent); scroll-margin-top:80px; }
    .bible-paragraph-target.current-match { background:color-mix(in srgb, var(--accent) 26%, transparent); box-shadow:0 0 0 2px var(--accent), inset 4px 0 0 var(--accent); }
    .bible-ref-texts { display:grid; gap:5px; }
    .bible-ref-text { color:var(--muted); font-size:12px; line-height:1.45; white-space:pre-wrap; }
    .bible-ref-text.loading { opacity:.75; }
    .bible-ref-text.error { color:var(--danger); }
    .bible-snippet { color:var(--muted); font-size:12px; line-height:1.45; white-space:pre-wrap; }
    .bible-parallel { margin-top:8px; padding:8px 10px; border-left:3px solid var(--accent); background:var(--surface-soft); color:var(--summary); font-size:12px; line-height:1.5; }
    .bible-parallel-button { display:inline-grid; place-items:center; min-height:27px; padding:4px 7px; border:1px solid var(--input-line); border-radius:6px; background:var(--panel); color:var(--accent); font-size:12px; cursor:pointer; }
    .bible-parallel-button:hover, .bible-parallel-button:focus-visible { border-color:var(--accent); background:var(--accent-soft); outline:none; }
    .bible-parallel-title { margin-bottom:7px; color:var(--ink); font-weight:700; }
    .bible-parallel-list { display:grid; gap:7px; }
    .bible-parallel-row { display:grid; gap:5px; padding:7px 0; border-top:1px solid color-mix(in srgb, var(--line) 65%, transparent); }
    .bible-parallel-row:first-child { border-top:0; padding-top:0; }
    .bible-parallel-head { display:flex; align-items:center; flex-wrap:wrap; gap:6px; }
    .bible-parallel-ref { border:0; padding:0; background:transparent; color:var(--selected-ink); font-weight:700; text-decoration:underline; text-underline-offset:2px; cursor:pointer; }
    .bible-parallel-meta { color:var(--muted); font-size:11px; }
    .bible-parallel-notes { display:grid; gap:6px; margin-top:4px; }
    .bible-parallel-note { display:grid; gap:3px; width:100%; padding:7px 8px; border:1px solid var(--input-line); border-radius:7px; background:var(--panel); color:var(--ink); text-align:left; cursor:pointer; }
    .bible-parallel-note:hover, .bible-parallel-note:focus-visible { border-color:var(--accent); outline:none; }
    .bible-parallel-note-title { font-weight:650; }
    .bible-parallel-note-meta { color:var(--muted); font-size:11px; }
    .bible-parallel-note-text { color:var(--summary); font-size:12px; line-height:1.4; white-space:pre-wrap; }
    .bible-parallel-verse-text { color:var(--ink); }
    .bible-parallel-verse-text.loading { color:var(--muted); }
    .bible-parallel-verse-text.error { color:var(--danger); }
    .bible-parallel-note-card { display:grid; gap:7px; padding:8px; border:1px solid var(--input-line); border-radius:7px; background:var(--panel); }
    .bible-parallel-fragment { display:grid; gap:3px; width:100%; padding:7px 8px; border:1px solid color-mix(in srgb, var(--input-line) 70%, transparent); border-radius:6px; background:transparent; color:var(--ink); text-align:left; cursor:pointer; }
    .bible-parallel-fragment:hover, .bible-parallel-fragment:focus-visible { border-color:var(--accent); background:var(--accent-soft); outline:none; }
    .match-nav { position:sticky; z-index:7; top:10px; display:flex; align-items:center; gap:3px; width:max-content; margin:-18px 0 20px auto; padding:4px; border:1px solid var(--input-line); border-radius:8px; background:var(--panel); box-shadow:0 4px 16px rgba(20,16,26,.12); }
    .match-count { min-width:54px; padding:0 7px; color:var(--muted); font-size:12px; text-align:center; white-space:nowrap; }
    .match-button { display:grid; place-items:center; width:28px; height:28px; padding:0; border:0; border-radius:5px; background:transparent; color:var(--ink); font-size:17px; cursor:pointer; }
    .match-button:hover, .match-button:focus-visible { background:var(--accent-soft); color:var(--accent); outline:none; }
    .view-button { display:grid; place-items:center; width:31px; height:31px; padding:0; border:1px solid transparent; border-radius:7px; background:transparent; color:var(--accent); font-size:18px; font-weight:700; cursor:pointer; }
    .view-button:hover, .view-button:focus-visible { border-color:var(--input-line); background:var(--accent-soft); outline:none; }
    .html-zoom { display:flex; align-items:center; gap:8px; padding:3px 0; border:0; background:transparent; color:var(--muted); font-size:12px; }
    .html-zoom input { width:130px; accent-color:var(--accent); }
    .html-zoom-value { min-width:42px; color:var(--ink); font-variant-numeric:tabular-nums; text-align:right; }
    .page-text { white-space:pre-wrap; font:16px/1.72 var(--reader-font); word-break:break-word; }
    .html-frame { display:none; width:100%; height:calc(100vh - 220px); min-height:520px; border:1px solid var(--line); border-radius:10px; background:white; }
    .error-box { margin:18px 0; padding:12px 14px; border-left:3px solid var(--danger); background:color-mix(in srgb, var(--danger) 13%, var(--panel)); color:var(--danger); }
    .pending-box { margin:18px 0; padding:12px 14px; border-left:3px solid var(--pending); background:color-mix(in srgb, var(--pending) 12%, var(--panel)); color:var(--ink); }
    .search-heading { padding:7px 10px 9px; color:var(--muted); font-size:11px; text-transform:uppercase; letter-spacing:.08em; }
    .activity-toast { position:fixed; z-index:20; top:18px; right:20px; max-width:min(430px, calc(100vw - 40px)); padding:11px 14px; border:1px solid var(--input-line); border-radius:10px; background:var(--panel); color:var(--selected-ink); box-shadow:0 10px 30px rgba(20,16,26,.24); font-size:13px; line-height:1.35; opacity:0; transform:translateY(-8px); pointer-events:none; transition:opacity .18s, transform .18s; }
    .activity-toast.show { opacity:1; transform:translateY(0); }
    .activity-toast.success { border-color:var(--ok); background:color-mix(in srgb, var(--ok) 14%, var(--panel)); color:var(--ok); }
    .activity-toast.error { border-color:var(--danger); background:color-mix(in srgb, var(--danger) 14%, var(--panel)); color:var(--danger); }
    .name-dialog { width:min(460px, calc(100vw - 32px)); padding:0; border:1px solid var(--input-line); border-radius:14px; background:var(--panel); color:var(--ink); box-shadow:0 22px 70px rgba(20,16,26,.38); }
    .name-dialog::backdrop { background:rgba(39,35,31,.32); backdrop-filter:blur(2px); }
    .name-dialog-body { padding:22px; }
    .name-dialog h2 { margin:0 0 6px; font:700 22px/1.25 var(--title-font); }
    .name-dialog-original { margin:0 0 18px; color:var(--muted); font-size:12px; }
    .name-dialog label { display:grid; gap:7px; color:var(--muted); font-size:12px; }
    .name-dialog input { width:100%; padding:10px 11px; border:1px solid var(--input-line); border-radius:8px; background:var(--input-bg); color:var(--ink); outline:none; }
    .name-dialog input:focus { border-color:var(--accent); box-shadow:0 0 0 3px color-mix(in srgb, var(--accent) 16%, transparent); }
    .name-dialog-actions { display:flex; align-items:center; justify-content:flex-end; gap:8px; margin-top:20px; }
    .name-dialog-actions .reset-name { margin-right:auto; }
    .dialog-button { padding:8px 11px; border:1px solid var(--input-line); border-radius:7px; background:var(--panel); color:var(--ink); cursor:pointer; }
    .dialog-button.primary { border-color:var(--accent); background:var(--accent); color:white; font-weight:650; }
    .dialog-button:hover { border-color:var(--accent); }
    .dialog-button:disabled { opacity:.55; cursor:wait; }
    .settings-dialog { width:min(860px, calc(100vw - 32px)); max-height:min(88vh, 820px); padding:0; border:1px solid var(--input-line); border-radius:14px; background:var(--panel); color:var(--ink); box-shadow:0 22px 70px rgba(20,16,26,.38); overflow:hidden; }
    .settings-dialog::backdrop { background:rgba(39,35,31,.32); backdrop-filter:blur(2px); }
    .settings-dialog-body { display:grid; grid-template-rows:auto minmax(0,1fr) auto; max-height:min(88vh, 820px); }
    .settings-dialog-header { padding:20px 22px 12px; border-bottom:1px solid var(--line); }
    .settings-dialog-header h2 { margin:0; font:700 22px/1.25 var(--title-font); }
    .settings-dialog-header p { margin:6px 0 0; color:var(--muted); font-size:12px; line-height:1.45; }
    .settings-dialog-content { display:flex; flex-direction:column; gap:14px; min-height:0; overflow:auto; padding:14px 22px 18px; }
    #settingsMovedPanels { display:flex; flex-direction:column; gap:14px; }
    .settings-dialog-content .sync-panel, .settings-dialog-content .settings-panel, .settings-dialog-content .notebook-panel, .settings-module-section { margin:0; padding:0; border:1px solid var(--line); border-radius:8px; background:var(--surface-soft); overflow:hidden; }
    .settings-dialog-content .sync-panel, .settings-dialog-content .settings-panel, .settings-dialog-content .notebook-panel, .settings-module-section, #settingsMovedPanels { flex:0 0 auto; }
    .settings-dialog-content .sync-panel summary, .settings-dialog-content .settings-panel summary, .settings-dialog-content .notebook-panel summary, .settings-module-section summary { display:flex; align-items:center; min-height:44px; padding:11px 12px; cursor:pointer; color:var(--summary); font:650 11px/1.25 Inter, "Segoe UI", sans-serif; letter-spacing:.055em; list-style:none; text-transform:uppercase; }
    .settings-dialog-content .sync-panel summary:hover, .settings-dialog-content .settings-panel summary:hover, .settings-dialog-content .notebook-panel summary:hover, .settings-module-section summary:hover { color:var(--accent); }
    .settings-dialog-content .sync-panel summary:focus-visible, .settings-dialog-content .settings-panel summary:focus-visible, .settings-dialog-content .notebook-panel summary:focus-visible, .settings-module-section summary:focus-visible { outline:0; box-shadow:inset 2px 0 0 var(--accent); }
    .settings-module-section summary::-webkit-details-marker { display:none; }
    .settings-dialog-content .sync-form, .settings-dialog-content .sync-settings, .settings-dialog-content .notebook-controls, .settings-module-body { display:grid; gap:10px; padding:2px 12px 13px; }
    .settings-module-section summary::before { display:inline-block; min-width:16px; margin-right:8px; color:var(--accent); text-align:center; }
    .settings-module-section.onenote-settings summary::before { content:'@'; }
    .settings-module-section.biblenote-settings summary::before { content:'✚'; }
    .settings-module-section.protocol-settings summary::before { content:'↗'; }
    .settings-module-section.view-settings summary::before { content:'◱'; }
    .settings-module-section.diagnostic-settings summary::before { content:'☷'; }
    .settings-module-section summary::after { content:''; width:6px; height:6px; margin-left:auto; margin-right:3px; border-right:1.5px solid currentColor; border-bottom:1.5px solid currentColor; transform:rotate(45deg) translate(-1px, 1px); transition:transform .16s ease; opacity:.65; }
    .settings-module-section[open] summary::after { transform:rotate(225deg) translate(-1px, 1px); }
    .settings-row { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
    .settings-status { color:var(--muted); font-size:12px; line-height:1.45; white-space:pre-wrap; }
    .settings-file { max-width:100%; color:var(--muted); font-size:12px; }
    .settings-module-list { display:grid; gap:6px; max-height:210px; overflow:auto; padding:2px 1px; }
    .settings-module-option { display:flex; align-items:flex-start; gap:8px; padding:8px; border:1px solid var(--line); border-radius:7px; background:var(--panel); cursor:pointer; }
    .settings-module-option input { margin-top:2px; accent-color:var(--accent); }
    .settings-module-name { font-size:12px; font-weight:650; color:var(--ink); }
    .settings-module-meta { margin-top:2px; color:var(--muted); font-size:11px; line-height:1.35; }
    .settings-dialog-footer { padding:12px 22px 18px; border-top:1px solid var(--line); }
    .setup-wizard-dialog { width:min(640px, calc(100vw - 32px)); padding:0; border:1px solid var(--input-line); border-radius:14px; background:var(--panel); color:var(--ink); box-shadow:0 22px 70px rgba(20,16,26,.38); overflow:hidden; }
    .setup-wizard-dialog::backdrop { background:rgba(39,35,31,.36); backdrop-filter:blur(2px); }
    .setup-wizard-body { display:grid; grid-template-rows:auto minmax(0,1fr) auto; max-height:min(86vh, 720px); }
    .setup-wizard-header { padding:20px 22px 12px; border-bottom:1px solid var(--line); }
    .setup-wizard-header h2 { margin:0; font:700 24px/1.25 var(--title-font); }
    .setup-wizard-header p { margin:7px 0 0; color:var(--muted); font-size:12px; line-height:1.45; }
    .setup-wizard-content { display:grid; gap:14px; min-height:0; overflow:auto; padding:16px 22px 20px; }
    .setup-wizard-progress { display:flex; gap:6px; }
    .setup-wizard-dot { height:4px; flex:1; border-radius:999px; background:var(--line); }
    .setup-wizard-dot.active { background:var(--accent); }
    .setup-wizard-step { display:grid; gap:12px; }
    .setup-wizard-step h3 { margin:0; font:700 18px/1.3 var(--title-font); }
    .setup-wizard-step[hidden] { display:none; }
    .setup-wizard-status { min-height:18px; color:var(--muted); font-size:12px; line-height:1.45; }
    .setup-wizard-status.error { color:var(--danger); }
    .setup-wizard-footer { display:flex; align-items:center; justify-content:flex-end; gap:8px; padding:12px 22px 18px; border-top:1px solid var(--line); }
    .setup-wizard-footer .setup-wizard-later { margin-right:auto; }
    .log-dialog { width:min(840px, calc(100vw - 32px)); max-height:min(86vh, 780px); padding:0; border:1px solid var(--input-line); border-radius:14px; background:var(--panel); color:var(--ink); box-shadow:0 22px 70px rgba(20,16,26,.38); overflow:hidden; }
    .log-dialog::backdrop { background:rgba(39,35,31,.32); backdrop-filter:blur(2px); }
    .log-dialog-body { display:grid; grid-template-rows:auto minmax(0,1fr) auto; max-height:min(86vh, 780px); }
    .log-dialog-header { padding:20px 22px 12px; border-bottom:1px solid var(--line); }
    .log-dialog-header h2 { margin:0; font:700 22px/1.25 var(--title-font); }
    .log-dialog-content { min-height:0; overflow:auto; padding:14px 22px 18px; }
    .log-dialog-content .log-panel { margin:0; border:1px solid var(--line); border-radius:8px; background:var(--surface-soft); }
    .log-dialog-content .log-panel summary { padding:11px 12px; cursor:default; }
    .log-dialog-content .log-panel summary::after { display:none; }
    .log-dialog-content .log-controls, .log-dialog-content .log-list, .log-dialog-content .log-pager { padding-left:12px; padding-right:12px; }
    .log-dialog-footer { padding:12px 22px 18px; border-top:1px solid var(--line); }
    .bible-text-dialog { width:min(620px, calc(100vw - 32px)); padding:0; border:1px solid var(--input-line); border-radius:12px; background:var(--panel); color:var(--ink); box-shadow:0 22px 70px rgba(20,16,26,.38); }
    .bible-text-dialog::backdrop { background:rgba(39,35,31,.32); backdrop-filter:blur(2px); }
    .bible-text-body { display:grid; gap:10px; padding:20px; }
    .bible-text-header { display:flex; align-items:flex-start; gap:10px; }
    .bible-text-body h2 { margin:0; font:700 22px/1.25 var(--title-font); }
    .bible-text-header h2 { flex:1; min-width:0; }
    .bible-text-nav { display:flex; gap:5px; margin-left:auto; flex:none; }
    .bible-text-nav-button { display:grid; place-items:center; width:30px; height:30px; padding:0; border:1px solid var(--input-line); border-radius:7px; background:var(--panel); color:var(--accent); font-size:16px; cursor:pointer; }
    .bible-text-nav-button:hover, .bible-text-nav-button:focus-visible { border-color:var(--accent); background:var(--accent-soft); outline:none; }
    .bible-text-nav-button:disabled { opacity:.38; cursor:not-allowed; }
    .bible-text-meta { color:var(--muted); font-size:12px; }
    .bible-text-content { max-height:min(56vh, 520px); overflow:auto; padding:12px 14px; border:1px solid var(--line); border-radius:8px; background:var(--surface-soft); font:16px/1.55 var(--reader-font); white-space:pre-wrap; }
    .bible-context-line { display:block; margin:1px 0; padding:2px 6px; border-radius:6px; }
    .bible-context-highlight { background:color-mix(in srgb, var(--accent) 18%, transparent); box-shadow:inset 3px 0 0 var(--accent); }
    @keyframes spin { to { transform:rotate(360deg); } }
    mark { padding:0 1px; background:var(--mark); color:inherit; border-radius:2px; }
    mark.current-match { outline:2px solid var(--accent); outline-offset:1px; background:color-mix(in srgb, var(--mark) 58%, var(--accent)); }
    :root[data-theme="b"] .page { max-width:980px; }
    :root[data-theme="b"] .page-text { font-size:15px; line-height:1.65; }
    :root[data-theme="c"] .page { max-width:960px; }
    @media (max-width:760px) { .app { grid-template-columns:1fr; grid-template-rows:42% 58%; } .app.sidebar-collapsed { grid-template-columns:1fr; grid-template-rows:0 100%; } .sidebar { border-right:0; border-bottom:1px solid var(--line); } .sidebar-resizer { display:none; } .content-shell { grid-row:2; } .sidebar-toggle { top:calc(42% - 14px); left:10px; } .app.sidebar-collapsed .sidebar-toggle { top:10px; } .page { padding:28px 24px 60px; } .page h2 { font-size:28px; } }
  </style>
</head>
<body>
  <div id="activityToast" class="activity-toast" role="status" aria-live="polite"></div>
  <dialog id="notebookNameDialog" class="name-dialog">
    <div class="name-dialog-body">
      <h2>Отображаемое имя</h2>
      <p id="notebookNameOriginal" class="name-dialog-original"></p>
      <label>Имя в локальном обозревателе
        <input id="notebookNameInput" type="text" maxlength="120" autocomplete="off">
      </label>
      <div class="name-dialog-actions">
        <button id="resetNotebookName" class="dialog-button reset-name" type="button">Вернуть исходное</button>
        <button id="cancelNotebookName" class="dialog-button" type="button">Отмена</button>
        <button id="saveNotebookName" class="dialog-button primary" type="button">Сохранить</button>
      </div>
    </div>
  </dialog>
  <dialog id="bibleTextDialog" class="bible-text-dialog">
    <div class="bible-text-body">
      <div class="bible-text-header">
        <h2 id="bibleTextTitle">Библейская ссылка</h2>
        <div class="bible-text-nav" aria-label="История библейских ссылок">
          <button id="bibleTextBack" class="bible-text-nav-button" type="button" title="Назад" aria-label="Назад">‹</button>
          <button id="bibleTextForward" class="bible-text-nav-button" type="button" title="Вперед" aria-label="Вперед">›</button>
        </div>
      </div>
      <div id="bibleTextMeta" class="bible-text-meta"></div>
      <div id="bibleTextContent" class="bible-text-content"></div>
      <div id="bibleTextParallelPanel"></div>
      <button id="showBibleTextContext" class="dialog-button" type="button">Показать в контексте</button>
      <button id="showBibleTextParallel" class="dialog-button" type="button">Параллельные</button>
      <button id="showBibleTextInReader" class="dialog-button" type="button">Открыть в Библии</button>
      <div class="name-dialog-actions">
        <button id="closeBibleText" class="dialog-button primary" type="button">Закрыть</button>
      </div>
    </div>
  </dialog>
  <dialog id="settingsDialog" class="settings-dialog">
    <div class="settings-dialog-body">
      <header class="settings-dialog-header">
        <h2>Параметры</h2>
        <p>Записные книжки, синхронизация, модули и обработка внешних библейских ссылок.</p>
      </header>
      <div id="settingsDialogContent" class="settings-dialog-content">
        <details class="settings-module-section onenote-settings">
          <summary>Доступ к OneNote</summary>
          <div class="settings-module-body">
            <div id="oneNoteAccessStatus" class="settings-status">Параметры доступа еще не загружены.</div>
            <label class="field">Azure Client ID
              <input id="oneNoteClientId" type="text" autocomplete="off" spellcheck="false">
            </label>
            <input id="oneNoteTenantId" type="hidden" value="common">
            <input id="oneNoteScopes" type="hidden" value="Notes.Read User.Read offline_access">
            <input id="oneNoteTokenCache" type="hidden">
          </div>
        </details>
        <details class="settings-module-section biblenote-settings">
          <summary>Модули</summary>
          <div class="settings-module-body">
            <div id="bibleNoteStatus" class="settings-status">Статус BibleNote пока не проверен.</div>
            <label class="field">Основной модуль
              <select id="bibleModuleName"></select>
            </label>
            <div class="settings-row">
              <input id="bibleModuleFile" class="settings-file" type="file" accept=".bnm,.zip" multiple>
              <button id="uploadBibleModule" class="small-button" type="button" disabled>Загрузить модули</button>
            </div>
            <div id="bibleModulesList" class="settings-module-list"></div>
            <div id="bibleModuleStatus" class="settings-status"></div>
          </div>
        </details>
        <details class="settings-module-section protocol-settings">
          <summary>Обработка ссылок на Библию</summary>
          <div class="settings-module-body">
            <div id="protocolStatus" class="settings-status">Статус обработчика ссылок пока не проверен.</div>
            <div class="settings-row">
              <button id="registerBibleProtocol" class="small-button" type="button">Зарегистрировать обработчик</button>
            </div>
          </div>
        </details>
        <details class="settings-module-section view-settings">
          <summary>Просмотр заметок</summary>
          <div class="settings-module-body">
            <label class="field">Тема интерфейса
              <select id="themeSelect">
                <option value="a">A · Тёплая</option>
                <option value="b">B · Светлая</option>
                <option value="c">C · Тёмная</option>
              </select>
            </label>
            <label class="field">Открывать страницу
              <select id="pageViewMode">
                <option value="text">Текст</option>
                <option value="html" selected>HTML, если загружен</option>
              </select>
            </label>
            <label class="field">Масштаб HTML по умолчанию
              <input id="defaultHtmlZoom" type="number" min="50" max="200" step="10" value="100">
            </label>
            <label class="check"><input id="showAuxBibleRefs" type="checkbox">Показывать ссылки в [] и {}</label>
          </div>
        </details>
        <details class="settings-module-section diagnostic-settings">
          <summary>Диагностика</summary>
          <div class="settings-module-body">
            <label class="check"><input id="verboseLogging" type="checkbox">Расширенное логирование</label>
            <div id="verboseLoggingStatus" class="settings-status">Расширенное логирование выключено.</div>
          </div>
        </details>
        <div id="settingsMovedPanels"></div>
      </div>
      <footer class="settings-dialog-footer">
        <div class="name-dialog-actions">
          <button id="closeSettings" class="dialog-button primary" type="button">Закрыть</button>
        </div>
      </footer>
    </div>
  </dialog>
  <dialog id="setupWizardDialog" class="setup-wizard-dialog">
    <div class="setup-wizard-body">
      <header class="setup-wizard-header">
        <h2>Первичная настройка</h2>
        <p>Настройте обязательные параметры, чтобы BibleNote мог читать OneNote и показывать тексты библейских ссылок.</p>
      </header>
      <div class="setup-wizard-content">
        <div class="setup-wizard-progress" aria-hidden="true">
          <span class="setup-wizard-dot active"></span>
          <span class="setup-wizard-dot"></span>
          <span class="setup-wizard-dot"></span>
        </div>
        <section class="setup-wizard-step" data-setup-step="0">
          <h3>Доступ к OneNote</h3>
          <label class="field">Azure Client ID
            <input id="setupOneNoteClientId" type="text" autocomplete="off" spellcheck="false">
          </label>
          <p class="settings-note">Это идентификатор приложения Azure, через которое BibleNote получает доступ к Microsoft Graph. Остальные параметры используются со стандартными значениями.</p>
        </section>
        <section class="setup-wizard-step" data-setup-step="1" hidden>
          <h3>Модуль BibleNote</h3>
          <label class="field">Основной модуль
            <select id="setupBibleModule"></select>
          </label>
          <div class="settings-row">
            <input id="setupBibleModuleFile" class="settings-file" type="file" accept=".bnm,.zip" multiple>
            <button id="setupUploadBibleModule" class="small-button" type="button" disabled>Загрузить модули</button>
          </div>
          <div id="setupBibleModuleStatus" class="settings-status"></div>
          <p class="settings-note">Если не менять значение, будет использоваться модуль rst. Можно сразу загрузить модуль .bnm или .zip.</p>
        </section>
        <section class="setup-wizard-step" data-setup-step="2" hidden>
          <h3>Готово к работе</h3>
          <div id="setupWizardSummary" class="settings-status"></div>
        </section>
        <div id="setupWizardStatus" class="setup-wizard-status"></div>
      </div>
      <footer class="setup-wizard-footer">
        <button id="setupWizardBack" class="dialog-button" type="button">Назад</button>
        <button id="setupWizardNext" class="dialog-button primary" type="button">Далее</button>
      </footer>
    </div>
  </dialog>
  <dialog id="downloadLogDialog" class="log-dialog">
    <div class="log-dialog-body">
      <header class="log-dialog-header">
        <h2>Журнал загрузки</h2>
      </header>
      <div id="downloadLogDialogContent" class="log-dialog-content"></div>
      <footer class="log-dialog-footer">
        <div class="name-dialog-actions">
          <button id="closeDownloadLog" class="dialog-button primary" type="button">Закрыть</button>
        </div>
      </footer>
    </div>
  </dialog>
  <div id="app" class="app">
    <button id="sidebarToggle" class="sidebar-toggle" type="button" aria-label="Скрыть левую панель" aria-expanded="true" title="Скрыть левую панель">‹</button>
    <aside id="sidebar" class="sidebar">
      <header class="brand">
        <div class="brand-line">
          <div class="search-wrap">
            <div class="search-control">
              <input id="search" class="search" type="search" placeholder="Поиск по заголовкам, тексту и ссылкам..." autocomplete="off">
              <button id="searchHistory" class="search-option" type="button" aria-label="История поиска" aria-expanded="false" title="История поиска (↑/↓)">▾</button>
              <button id="searchCase" class="search-option" type="button" aria-label="Учитывать регистр" aria-pressed="false" title="Учитывать регистр (Aa)">Aa</button>
              <button id="searchPhrase" class="search-option" type="button" aria-label="Искать всю фразу" aria-pressed="false" title="Искать всю фразу">“ ”</button>
              <button id="searchRegex" class="search-option" type="button" aria-label="Использовать регулярное выражение" aria-pressed="false" title="Использовать регулярное выражение (.*)">.*</button>
            </div>
            <div id="searchHistoryMenu" class="search-history-menu hidden" role="listbox" aria-label="История поиска"></div>
          </div>
          <div class="brand-actions">
          <button id="openSettings" class="settings-button" type="button" aria-label="Параметры" title="Параметры">⚙</button>
          </div>
        </div>
      </header>
      <details class="notebook-panel">
        <summary id="notebookSummary">Записные книжки</summary>
        <div class="notebook-controls">
          <div class="notebook-actions">
            <button id="selectAllNotebooks" class="small-button" type="button">Выбрать все</button>
            <button id="clearAllNotebooks" class="small-button" type="button">Снять все</button>
          </div>
          <div id="notebookList" class="notebook-list"></div>
        </div>
      </details>
      <details class="bible-reader-panel">
        <summary id="bibleReaderSummary">Библия</summary>
        <div class="bible-reader-controls">
          <select id="bibleReaderModule" class="bible-reader-select" title="Модуль"></select>
          <select id="bibleReaderBook" class="bible-reader-select book" title="Книга"></select>
          <div class="bible-reader-row">
            <button id="bibleReaderPrev" class="small-button" type="button" title="Предыдущая глава">←</button>
            <select id="bibleReaderChapter" class="bible-reader-select chapter" title="Глава"></select>
            <button id="bibleReaderNext" class="small-button" type="button" title="Следующая глава">→</button>
          </div>
          <div id="bibleReaderStatus" class="sync-state"></div>
        </div>
      </details>
      <details class="settings-panel">
        <summary id="syncSettingsSummary">Параметры синхронизации</summary>
        <div class="sync-settings">
          <p id="syncSettingsNote" class="settings-note">Применяются к полной синхронизации и ко всем кнопкам ↻ в дереве.</p>
          <div class="sync-grid">
            <label class="field">Максимум страниц<input id="syncMaxPages" type="number" min="1" placeholder="Все"></label>
            <label class="field">Параллельность<select id="syncConcurrency"><option selected>1</option><option>2</option><option>3</option></select></label>
            <label class="field">Обновить старше, ч.<input id="syncRefreshHours" type="number" min="0" placeholder="Не обновлять"></label>
          </div>
          <label class="check"><input id="syncMetadataOnly" type="checkbox">Только метаданные</label>
          <label class="check"><input id="syncReplaceAll" type="checkbox">Перезаписать данные полностью</label>
          <label class="check"><input id="syncForceContent" type="checkbox">Перезагрузить весь контент</label>
          <label class="check"><input id="syncIncludeHtml" type="checkbox" checked>Сохранять HTML</label>
          <label class="check"><input id="syncParseBibleRefs" type="checkbox" checked>Распознать библейские ссылки</label>
          <label class="check"><input id="syncForceBibleParse" type="checkbox">Перепарсить библейские ссылки</label>
        </div>
      </details>
      <details class="sync-panel">
        <summary>Запуск полной синхронизации</summary>
        <div class="sync-form">
          <div id="syncNotebookSelection" class="sync-state"></div>
          <button id="syncButton" class="sync-button" type="button">Запустить синхронизацию</button>
          <div id="syncState" class="sync-state">Синхронизация не запущена</div>
        </div>
      </details>
      <details class="log-panel">
        <summary id="logSummary">Журнал загрузки</summary>
        <div class="log-controls">
          <select id="logFilter" class="log-filter">
            <option value="downloaded-last-sync">Загружены в последней синхронизации</option>
            <option value="downloaded">Все загруженные</option>
            <option value="missing">Не загруженные</option>
            <option value="errors">Ошибки</option>
            <option value="all">Все страницы</option>
          </select>
          <button id="refreshLog" class="small-button" type="button">Обновить</button>
        </div>
        <div id="logList" class="log-list"></div>
        <div class="log-pager">
          <button id="logPrev" class="small-button" type="button">Назад</button>
          <span id="logPage">—</span>
          <button id="logNext" class="small-button" type="button">Далее</button>
        </div>
      </details>
      <details class="notes-panel" open>
        <summary id="notesSummary">Заметки</summary>
        <div class="tree-shell">
        <nav id="tree" class="tree" aria-label="Структура OneNote"></nav>
        <div id="treeScrollbar" class="custom-scrollbar" role="scrollbar" aria-label="Прокрутка дерева OneNote" aria-controls="tree" tabindex="0"><div class="custom-scrollbar-thumb"></div></div>
        </div>
      </details>
      <button id="status" class="sidebar-footer" type="button">Загрузка статуса…</button>
    </aside>
    <div id="sidebarResizer" class="sidebar-resizer" role="separator" aria-label="Изменить ширину левой панели" aria-orientation="vertical" tabindex="0"></div>
    <div class="content-shell">
      <main id="content" class="content"><div class="empty-state"><div><span class="empty-mark"></span>Выберите страницу слева</div></div></main>
      <div id="contentScrollbar" class="custom-scrollbar" role="scrollbar" aria-label="Прокрутка страницы" aria-controls="content" tabindex="0"><div class="custom-scrollbar-thumb"></div></div>
    </div>
  </div>
  <script>
    const app = document.getElementById('app');
    const sidebarToggle = document.getElementById('sidebarToggle');
    const sidebarResizer = document.getElementById('sidebarResizer');
    const tree = document.getElementById('tree');
    const content = document.getElementById('content');
    const treeScrollbar = document.getElementById('treeScrollbar');
    const contentScrollbar = document.getElementById('contentScrollbar');
    const statusEl = document.getElementById('status');
    const searchInput = document.getElementById('search');
    const searchHistoryButton = document.getElementById('searchHistory');
    const searchHistoryMenu = document.getElementById('searchHistoryMenu');
    const searchCaseButton = document.getElementById('searchCase');
    const searchPhraseButton = document.getElementById('searchPhrase');
    const searchRegexButton = document.getElementById('searchRegex');
    const themeSelect = document.getElementById('themeSelect');
    const openSettingsButton = document.getElementById('openSettings');
    const settingsDialog = document.getElementById('settingsDialog');
    const settingsMovedPanels = document.getElementById('settingsMovedPanels');
    const closeSettingsButton = document.getElementById('closeSettings');
    const oneNoteAccessStatusEl = document.getElementById('oneNoteAccessStatus');
    const oneNoteClientIdInput = document.getElementById('oneNoteClientId');
    const oneNoteTenantIdInput = document.getElementById('oneNoteTenantId');
    const oneNoteScopesInput = document.getElementById('oneNoteScopes');
    const oneNoteTokenCacheInput = document.getElementById('oneNoteTokenCache');
    const saveOneNoteAccessButton = document.getElementById('saveOneNoteAccess');
    const setupWizardDialog = document.getElementById('setupWizardDialog');
    const setupOneNoteClientIdInput = document.getElementById('setupOneNoteClientId');
    const setupBibleModuleInput = document.getElementById('setupBibleModule');
    const setupBibleModuleFileInput = document.getElementById('setupBibleModuleFile');
    const setupUploadBibleModuleButton = document.getElementById('setupUploadBibleModule');
    const setupBibleModuleStatusEl = document.getElementById('setupBibleModuleStatus');
    const setupWizardSummaryEl = document.getElementById('setupWizardSummary');
    const setupWizardStatusEl = document.getElementById('setupWizardStatus');
    const setupWizardBackButton = document.getElementById('setupWizardBack');
    const setupWizardNextButton = document.getElementById('setupWizardNext');
    const bibleNoteStatusEl = document.getElementById('bibleNoteStatus');
    const bibleModuleNameInput = document.getElementById('bibleModuleName');
    const bibleModuleFileInput = document.getElementById('bibleModuleFile');
    const uploadBibleModuleButton = document.getElementById('uploadBibleModule');
    const bibleModuleStatusEl = document.getElementById('bibleModuleStatus');
    const bibleModulesListEl = document.getElementById('bibleModulesList');
    const protocolStatusEl = document.getElementById('protocolStatus');
    const registerBibleProtocolButton = document.getElementById('registerBibleProtocol');
    const pageViewModeSelect = document.getElementById('pageViewMode');
    const defaultHtmlZoomInput = document.getElementById('defaultHtmlZoom');
    const showAuxBibleRefsInput = document.getElementById('showAuxBibleRefs');
    const verboseLoggingInput = document.getElementById('verboseLogging');
    const verboseLoggingStatusEl = document.getElementById('verboseLoggingStatus');
    const downloadLogDialog = document.getElementById('downloadLogDialog');
    const downloadLogDialogContent = document.getElementById('downloadLogDialogContent');
    const closeDownloadLogButton = document.getElementById('closeDownloadLog');
    const syncButton = document.getElementById('syncButton');
    const syncStateEl = document.getElementById('syncState');
    const syncSettingsSummaryEl = document.getElementById('syncSettingsSummary');
    const syncSettingsNoteEl = document.getElementById('syncSettingsNote');
    const activityToastEl = document.getElementById('activityToast');
    const notebookNameDialog = document.getElementById('notebookNameDialog');
    const notebookNameOriginalEl = document.getElementById('notebookNameOriginal');
    const notebookNameInput = document.getElementById('notebookNameInput');
    const resetNotebookNameButton = document.getElementById('resetNotebookName');
    const cancelNotebookNameButton = document.getElementById('cancelNotebookName');
    const saveNotebookNameButton = document.getElementById('saveNotebookName');
    const bibleTextDialog = document.getElementById('bibleTextDialog');
    const bibleTextTitle = document.getElementById('bibleTextTitle');
    const bibleTextMeta = document.getElementById('bibleTextMeta');
    const bibleTextContent = document.getElementById('bibleTextContent');
    const bibleTextParallelPanel = document.getElementById('bibleTextParallelPanel');
    const bibleTextBackButton = document.getElementById('bibleTextBack');
    const bibleTextForwardButton = document.getElementById('bibleTextForward');
    const showBibleTextContextButton = document.getElementById('showBibleTextContext');
    const showBibleTextParallelButton = document.getElementById('showBibleTextParallel');
    const showBibleTextInReaderButton = document.getElementById('showBibleTextInReader');
    const closeBibleTextButton = document.getElementById('closeBibleText');
    const notebookListEl = document.getElementById('notebookList');
    const notebookSummaryEl = document.getElementById('notebookSummary');
    const syncNotebookSelectionEl = document.getElementById('syncNotebookSelection');
    const selectAllNotebooksButton = document.getElementById('selectAllNotebooks');
    const clearAllNotebooksButton = document.getElementById('clearAllNotebooks');
    const bibleReaderSummaryEl = document.getElementById('bibleReaderSummary');
    const bibleReaderModuleEl = document.getElementById('bibleReaderModule');
    const bibleReaderBookEl = document.getElementById('bibleReaderBook');
    const bibleReaderChapterEl = document.getElementById('bibleReaderChapter');
    const bibleReaderPrevButton = document.getElementById('bibleReaderPrev');
    const bibleReaderNextButton = document.getElementById('bibleReaderNext');
    const bibleReaderStatusEl = document.getElementById('bibleReaderStatus');
    const logSummaryEl = document.getElementById('logSummary');
    const logFilterEl = document.getElementById('logFilter');
    const logListEl = document.getElementById('logList');
    const refreshLogButton = document.getElementById('refreshLog');
    const logPrevButton = document.getElementById('logPrev');
    const logNextButton = document.getElementById('logNext');
    const logPageEl = document.getElementById('logPage');
    const expanded = new Set();
    const hiddenNotebookIds = new Set(loadHiddenNotebookIds());
    let notebooksCache = [];
    let logOffset = 0;
    const logLimit = 100;
    let selectedPageId = null;
    let pendingPageRefreshToken = 0;
    let searchTimer;
    let searchHistoryTimer;

    let activeSearchQuery = '';
    let searchOptions = loadSearchOptions();
    let searchHistory = loadSearchHistory();
    let searchHistoryIndex = -1;
    let verboseLoggingEnabled = false;
    let searchHistoryDraft = '';
    let syncPollTimer;
    let syncRunning = false;
    let activeSyncContext = null;
    let lastSyncLogRefreshAt = 0;
    let currentBibleTextRef = null;
    let bibleTextHistory = [];
    let bibleTextHistoryIndex = -1;
    let bibleReaderBooks = [];
    let bibleReaderLoading = false;
    let currentTargetParagraphIndex;
    let currentTargetParagraphIndexes = [];
    let viewHistory = [];
    let viewHistoryIndex = -1;
    let navigatingViewHistory = false;
    let setupWizardStep = 0;
    let setupWizardCanClose = false;
    let activityToastTimer;
    let editingNotebookId = null;

    function pageIdFromUrl() {
      const prefix = '/page/';
      if (location.pathname.startsWith(prefix)) {
        try {
          return decodeURIComponent(location.pathname.slice(prefix.length));
        } catch {
          return null;
        }
      }
      return new URLSearchParams(location.search).get('pageId');
    }

    function bibleLocationFromUrl() {
      const prefix = '/bible/';
      if (!location.pathname.startsWith(prefix)) return null;
      const parts = location.pathname.slice(prefix.length).split('/').filter(Boolean);
      if (parts.length < 3) return null;
      const params = new URLSearchParams(location.search);
      try {
        const module = decodeURIComponent(parts[0]);
        const bookIndex = Number(decodeURIComponent(parts[1]));
        const chapter = Number(decodeURIComponent(parts[2]));
        const verse = Number(params.get('verse') || '');
        const topChapter = Number(params.get('topChapter') || '');
        const topVerse = Number(params.get('topVerse') || '');
        if (!module || !Number.isInteger(bookIndex) || !Number.isInteger(chapter)) return null;
        return {
          module,
          bookIndex,
          chapter,
          verse:Number.isInteger(verse) && verse > 0 ? verse : undefined,
          topChapter:Number.isInteger(topChapter) && topChapter > 0 ? topChapter : undefined,
          topVerse:Number.isInteger(topVerse) && topVerse > 0 ? topVerse : undefined
        };
      } catch {
        return null;
      }
    }

    function paragraphIndexFromUrl() {
      const match = location.hash.match(/^#p-(\d+)$/);
      return match ? Number(match[1]) : undefined;
    }

    function pageUrl(pageId, paragraphIndex) {
      const hash = Number.isInteger(paragraphIndex) ? '#p-' + paragraphIndex : '';
      return '/page/' + encodeURIComponent(pageId) + hash;
    }

    function updatePageUrl(pageId, replace = false, paragraphIndex) {
      const nextUrl = pageId ? pageUrl(pageId, paragraphIndex) : '/';
      if (location.pathname + location.search + location.hash === nextUrl) return;
      const method = replace ? 'replaceState' : 'pushState';
      history[method]({ pageId:pageId || null, paragraphIndex:Number.isInteger(paragraphIndex) ? paragraphIndex : null }, '', nextUrl);
    }

    function bibleReaderUrl(readerLocation, ref) {
      const module = encodeURIComponent(readerLocation.module || currentBibleModule());
      const bookIndex = encodeURIComponent(String(readerLocation.bookIndex));
      const chapter = encodeURIComponent(String(readerLocation.chapter));
      const params = new URLSearchParams();
      const verse = Number(ref?.verse || readerLocation.verse || 0);
      const topChapter = Number(ref?.topChapter || readerLocation.topChapter || 0);
      const topVerse = Number(ref?.topVerse || readerLocation.topVerse || 0);
      if (Number.isInteger(verse) && verse > 0) params.set('verse', String(verse));
      if (Number.isInteger(topChapter) && topChapter > 0 && topChapter !== Number(readerLocation.chapter)) params.set('topChapter', String(topChapter));
      if (Number.isInteger(topVerse) && topVerse > 0 && topVerse !== verse) params.set('topVerse', String(topVerse));
      const query = params.toString();
      return '/bible/' + module + '/' + bookIndex + '/' + chapter + (query ? '?' + query : '');
    }

    function updateBibleReaderUrl(readerLocation, replace = false, ref) {
      const nextUrl = bibleReaderUrl(readerLocation, ref);
      if (location.pathname + location.search + location.hash === nextUrl) return;
      const method = replace ? 'replaceState' : 'pushState';
      history[method]({ bible:readerLocation }, '', nextUrl);
    }

    function updateTreeSelection(pageId) {
      tree.querySelectorAll('.tree-row.selected').forEach(item => item.classList.remove('selected'));
      if (!pageId) return;
      const selected = tree.querySelector('.tree-row[data-page-id="' + CSS.escape(String(pageId)) + '"]');
      if (selected) selected.classList.add('selected');
    }

    function scrollTreeSelectionIntoView(behavior = 'smooth') {
      const selected = tree.querySelector('.tree-row.selected');
      if (!selected) return;
      const selectedRect = selected.getBoundingClientRect();
      const treeRect = tree.getBoundingClientRect();
      const bottomPadding = 44;
      if (selectedRect.top >= treeRect.top && selectedRect.bottom <= treeRect.bottom - bottomPadding) return;
      const selectedCenter = selected.offsetTop + selected.offsetHeight / 2;
      tree.scrollTo({
        top:Math.max(0, selectedCenter - tree.clientHeight / 2),
        behavior
      });
    }

    function renderEmptyPage() {
      content.replaceChildren();
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      const inner = document.createElement('div');
      const mark = document.createElement('span');
      mark.className = 'empty-mark';
      inner.append(mark, 'Выберите страницу слева');
      empty.append(inner);
      content.append(empty);
    }

    function loadSearchOptions() {
      try {
        const saved = JSON.parse(localStorage.getItem('onenote.searchOptions') || '{}');
        return { caseSensitive:Boolean(saved.caseSensitive), phrase:Boolean(saved.phrase), regex:Boolean(saved.regex) };
      } catch {
        return { caseSensitive:false, phrase:false, regex:false };
      }
    }

    function loadSearchHistory() {
      try {
        const saved = JSON.parse(localStorage.getItem('onenote.searchHistory') || '[]');
        return Array.isArray(saved) ? saved.filter(value => typeof value === 'string' && value.trim()).slice(0, 50) : [];
      } catch {
        return [];
      }
    }

    function saveSearchHistory() {
      localStorage.setItem('onenote.searchHistory', JSON.stringify(searchHistory.slice(0, 50)));
    }

    function rememberSearch(query) {
      const value = query.trim();
      if (!value) return;
      searchHistory = [value, ...searchHistory.filter(item => item !== value)].slice(0, 50);
      searchHistoryIndex = -1;
      saveSearchHistory();
      renderSearchHistoryMenu();
    }

    function removeSearchHistoryItem(query) {
      searchHistory = searchHistory.filter(item => item !== query);
      searchHistoryIndex = -1;
      saveSearchHistory();
      renderSearchHistoryMenu();
    }

    function renderSearchHistoryMenu() {
      searchHistoryMenu.replaceChildren();
      if (!searchHistory.length) {
        const empty = document.createElement('div');
        empty.className = 'search-history-empty';
        empty.textContent = 'История поиска пуста';
        searchHistoryMenu.append(empty);
        return;
      }
      for (const [index, query] of searchHistory.entries()) {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'search-history-row' + (index === searchHistoryIndex ? ' active' : '');
        row.setAttribute('role', 'option');
        row.setAttribute('aria-selected', String(index === searchHistoryIndex));
        row.title = query;
        const text = document.createElement('span');
        text.className = 'search-history-text';
        text.textContent = query;
        const remove = document.createElement('span');
        remove.className = 'search-history-remove';
        remove.setAttribute('role', 'button');
        remove.setAttribute('aria-label', 'Удалить из истории');
        remove.title = 'Удалить из истории';
        remove.textContent = '×';
        remove.addEventListener('click', event => {
          event.preventDefault();
          event.stopPropagation();
          removeSearchHistoryItem(query);
        });
        row.addEventListener('click', () => {
          useSearchHistoryQuery(query);
          hideSearchHistory();
        });
        row.append(text, remove);
        searchHistoryMenu.append(row);
      }
    }

    function showSearchHistory() {
      renderSearchHistoryMenu();
      searchHistoryMenu.classList.remove('hidden');
      searchHistoryButton.setAttribute('aria-expanded', 'true');
    }

    function hideSearchHistory() {
      searchHistoryMenu.classList.add('hidden');
      searchHistoryButton.setAttribute('aria-expanded', 'false');
    }

    function toggleSearchHistory() {
      if (searchHistoryMenu.classList.contains('hidden')) showSearchHistory(); else hideSearchHistory();
    }

    function useSearchHistoryQuery(query) {
      searchInput.value = query;
      searchInput.focus();
      rememberSearch(query);
      rerunSearch();
    }

    function stepSearchHistory(direction) {
      if (!searchHistory.length) {
        showSearchHistory();
        return;
      }
      if (searchHistoryIndex === -1) searchHistoryDraft = searchInput.value;
      searchHistoryIndex += direction;
      if (searchHistoryIndex < 0) {
        searchHistoryIndex = -1;
        searchInput.value = searchHistoryDraft;
      } else if (searchHistoryIndex >= searchHistory.length) {
        searchHistoryIndex = searchHistory.length - 1;
      } else {
        searchInput.value = searchHistory[searchHistoryIndex];
      }
      showSearchHistory();
      rerunSearch();
    }

    function scheduleSearchHistoryCommit() {
      clearTimeout(searchHistoryTimer);
      const query = searchInput.value.trim();
      if (!query) return;
      searchHistoryTimer = setTimeout(() => {
        if (searchInput.value.trim() === query) rememberSearch(query);
      }, 1200);
    }

    function updateSearchOptionButtons() {
      searchCaseButton.setAttribute('aria-pressed', String(searchOptions.caseSensitive));
      searchPhraseButton.setAttribute('aria-pressed', String(searchOptions.phrase));
      searchRegexButton.setAttribute('aria-pressed', String(searchOptions.regex));
    }

    function saveSearchOptions() {
      localStorage.setItem('onenote.searchOptions', JSON.stringify(searchOptions));
      updateSearchOptionButtons();
    }

    function searchRequest(query) {
      const quoted = !searchOptions.regex && query.length >= 2 && query.startsWith('"') && query.endsWith('"');
      return {
        query:quoted ? query.slice(1, -1) : query,
        mode:searchOptions.regex ? 'regex' : (searchOptions.phrase || quoted ? 'phrase' : 'and'),
        caseSensitive:searchOptions.caseSensitive
      };
    }

    function looksLikeBibleReferenceSearch(query) {
      if (!query) return false;
      const request = searchRequest(query);
      if (request.mode === 'regex') return false;
      return /(?:bnVerse:|isbtBibleVerse:|\d+\s*:\s*\d+)/i.test(request.query)
        && /[\p{L}]/u.test(request.query);
    }

    function pageHighlightQuery(options = {}) {
      if (typeof options.highlightQuery === 'string') return options.highlightQuery;
      return currentTargetParagraphIndexes.length > 0 && looksLikeBibleReferenceSearch(activeSearchQuery)
        ? ''
        : activeSearchQuery;
    }

    function rerunSearch() {
      const query = searchInput.value.trim();
      activeSearchQuery = query;
      if (query) renderSearch(query).catch(showError); else renderTree().catch(showError);
    }

    searchHistoryButton.addEventListener('click', event => {
      event.preventDefault();
      searchHistoryIndex = -1;
      searchHistoryDraft = searchInput.value;
      toggleSearchHistory();
      searchInput.focus();
    });

    searchCaseButton.addEventListener('click', () => {
      searchOptions.caseSensitive = !searchOptions.caseSensitive;
      saveSearchOptions();
      rerunSearch();
    });
    searchPhraseButton.addEventListener('click', () => {
      searchOptions.phrase = !searchOptions.phrase;
      if (searchOptions.phrase) searchOptions.regex = false;
      saveSearchOptions();
      rerunSearch();
    });
    searchRegexButton.addEventListener('click', () => {
      searchOptions.regex = !searchOptions.regex;
      if (searchOptions.regex) searchOptions.phrase = false;
      saveSearchOptions();
      rerunSearch();
    });
    updateSearchOptionButtons();

    const SIDEBAR_MIN_WIDTH = 260;
    let sidebarWidth = Number(localStorage.getItem('onenote.sidebarWidth')) || 390;
    let sidebarCollapsed = localStorage.getItem('onenote.sidebarCollapsed') === 'true';

    function clampSidebarWidth(value) {
      return Math.round(Math.max(SIDEBAR_MIN_WIDTH, Math.min(value, Math.min(650, window.innerWidth * .65))));
    }

    function applySidebarState() {
      sidebarWidth = clampSidebarWidth(sidebarWidth);
      document.documentElement.style.setProperty('--sidebar-width', sidebarWidth + 'px');
      app.classList.toggle('sidebar-collapsed', sidebarCollapsed);
      sidebarToggle.textContent = sidebarCollapsed ? '›' : '‹';
      sidebarToggle.setAttribute('aria-expanded', String(!sidebarCollapsed));
      sidebarToggle.setAttribute('aria-label', sidebarCollapsed ? 'Показать левую панель' : 'Скрыть левую панель');
      sidebarToggle.title = sidebarCollapsed ? 'Показать левую панель' : 'Скрыть левую панель';
      requestAnimationFrame(() => {
        updateTreeScrollbar?.();
        updateContentScrollbar?.();
      });
    }

    sidebarToggle.addEventListener('click', () => {
      sidebarCollapsed = !sidebarCollapsed;
      localStorage.setItem('onenote.sidebarCollapsed', String(sidebarCollapsed));
      applySidebarState();
    });

    let resizingSidebar = false;
    sidebarResizer.addEventListener('pointerdown', event => {
      if (sidebarCollapsed || window.innerWidth <= 760) return;
      resizingSidebar = true;
      sidebarResizer.classList.add('dragging');
      sidebarResizer.setPointerCapture(event.pointerId);
      document.body.style.userSelect = 'none';
    });
    sidebarResizer.addEventListener('pointermove', event => {
      if (!resizingSidebar) return;
      sidebarWidth = clampSidebarWidth(event.clientX);
      document.documentElement.style.setProperty('--sidebar-width', sidebarWidth + 'px');
    });
    const finishSidebarResize = event => {
      if (!resizingSidebar) return;
      resizingSidebar = false;
      sidebarResizer.classList.remove('dragging');
      if (sidebarResizer.hasPointerCapture(event.pointerId)) sidebarResizer.releasePointerCapture(event.pointerId);
      document.body.style.userSelect = '';
      localStorage.setItem('onenote.sidebarWidth', String(sidebarWidth));
    };
    sidebarResizer.addEventListener('pointerup', finishSidebarResize);
    sidebarResizer.addEventListener('pointercancel', finishSidebarResize);
    sidebarResizer.addEventListener('keydown', event => {
      if (sidebarCollapsed) return;
      if (event.key === 'ArrowLeft') sidebarWidth -= 10;
      else if (event.key === 'ArrowRight') sidebarWidth += 10;
      else if (event.key === 'Home') sidebarWidth = SIDEBAR_MIN_WIDTH;
      else if (event.key === 'End') sidebarWidth = Math.min(650, window.innerWidth * .65);
      else return;
      event.preventDefault();
      sidebarWidth = clampSidebarWidth(sidebarWidth);
      localStorage.setItem('onenote.sidebarWidth', String(sidebarWidth));
      applySidebarState();
    });
    window.addEventListener('resize', applySidebarState);

    function setupCustomScrollbar(scroller, rail) {
      const thumb = rail.querySelector('.custom-scrollbar-thumb');
      let dragging = false;
      let dragStartY = 0;
      let dragStartScrollTop = 0;

      function measurements() {
        const railHeight = rail.clientHeight;
        const scrollRange = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
        const thumbHeight = scrollRange === 0
          ? railHeight
          : Math.max(36, Math.round(railHeight * scroller.clientHeight / scroller.scrollHeight));
        return { railHeight, scrollRange, thumbHeight, travel:Math.max(0, railHeight - thumbHeight) };
      }

      function update() {
        const value = measurements();
        const top = value.scrollRange > 0 ? value.travel * scroller.scrollTop / value.scrollRange : 0;
        thumb.style.height = value.thumbHeight + 'px';
        thumb.style.transform = 'translateY(' + Math.round(top) + 'px)';
        rail.classList.toggle('inactive', value.scrollRange === 0);
        rail.setAttribute('aria-valuemin', '0');
        rail.setAttribute('aria-valuemax', String(Math.round(value.scrollRange)));
        rail.setAttribute('aria-valuenow', String(Math.round(scroller.scrollTop)));
      }

      thumb.addEventListener('pointerdown', event => {
        if (rail.classList.contains('inactive')) return;
        event.preventDefault();
        event.stopPropagation();
        dragging = true;
        dragStartY = event.clientY;
        dragStartScrollTop = scroller.scrollTop;
        thumb.classList.add('dragging');
        thumb.setPointerCapture?.(event.pointerId);
      });
      document.addEventListener('pointermove', event => {
        if (!dragging) return;
        event.preventDefault();
        const value = measurements();
        if (value.travel > 0) scroller.scrollTop = dragStartScrollTop + (event.clientY - dragStartY) * value.scrollRange / value.travel;
      });
      document.addEventListener('pointerup', () => {
        if (!dragging) return;
        dragging = false;
        thumb.classList.remove('dragging');
      });
      rail.addEventListener('pointerdown', event => {
        if (event.target === thumb || rail.classList.contains('inactive')) return;
        const value = measurements();
        const rect = rail.getBoundingClientRect();
        const targetTop = Math.max(0, Math.min(value.travel, event.clientY - rect.top - value.thumbHeight / 2));
        scroller.scrollTop = value.travel > 0 ? targetTop * value.scrollRange / value.travel : 0;
      });
      rail.addEventListener('keydown', event => {
        const page = Math.max(40, scroller.clientHeight * .85);
        if (event.key === 'ArrowDown') scroller.scrollBy({ top:40 });
        else if (event.key === 'ArrowUp') scroller.scrollBy({ top:-40 });
        else if (event.key === 'PageDown') scroller.scrollBy({ top:page });
        else if (event.key === 'PageUp') scroller.scrollBy({ top:-page });
        else if (event.key === 'Home') scroller.scrollTo({ top:0 });
        else if (event.key === 'End') scroller.scrollTo({ top:scroller.scrollHeight });
        else return;
        event.preventDefault();
      });
      scroller.addEventListener('scroll', update, { passive:true });
      new ResizeObserver(update).observe(scroller);
      new ResizeObserver(update).observe(rail);
      new MutationObserver(update).observe(scroller, { childList:true, subtree:true });
      requestAnimationFrame(update);
      return update;
    }

    const updateTreeScrollbar = setupCustomScrollbar(tree, treeScrollbar);
    const updateContentScrollbar = setupCustomScrollbar(content, contentScrollbar);
    applySidebarState();

    function setupSettingsDialog() {
      for (const selector of ['.notebook-panel', '.settings-panel', '.sync-panel']) {
        const panel = document.querySelector(selector);
        if (panel) {
          panel.removeAttribute('open');
          settingsMovedPanels.append(panel);
        }
      }
      if (!localStorage.getItem('onenote.defaultHtmlZoom.100Default')) {
        localStorage.setItem('onenote.defaultHtmlZoom', '100');
        localStorage.setItem('onenote.defaultHtmlZoom.100Default', 'true');
      }
      bibleModuleNameInput.value = localStorage.getItem('onenote.bibleModule') || 'rst';
      pageViewModeSelect.value = defaultPageViewMode();
      defaultHtmlZoomInput.value = String(defaultHtmlZoom());
      showAuxBibleRefsInput.checked = showAuxBibleRefs();
      updateBibleModuleUploadState();
    }

    function setupDownloadLogDialog() {
      const logPanel = document.querySelector('.log-panel');
      if (logPanel) {
        logPanel.setAttribute('open', '');
        downloadLogDialogContent.append(logPanel);
      }
    }

    function openDownloadLogDialog() {
      uiLog('ui.openDownloadLog', {});
      if (!downloadLogDialog.open) downloadLogDialog.showModal();
      loadDownloadLog(false).catch(showError);
    }

    function currentBibleModule() {
      return (bibleModuleNameInput.value || 'rst').trim() || 'rst';
    }

    function saveBibleModuleSetting() {
      localStorage.setItem('onenote.bibleModule', currentBibleModule());
    }

    function moduleDisplayName(module) {
      return [module.shortName, module.displayName].filter(Boolean).join(' · ') || '(без имени)';
    }

    function fillBibleModuleSelect(select, modules, selectedModule) {
      select.replaceChildren();
      const selected = String(selectedModule || '').trim();
      for (const module of modules) {
        if (!module.shortName) continue;
        const option = document.createElement('option');
        option.value = module.shortName;
        option.textContent = moduleDisplayName(module);
        option.selected = module.shortName === selected || (!selected && module.isCurrent);
        select.append(option);
      }
      if (select.options.length === 0) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = 'Нет загруженных модулей';
        select.append(option);
      }
      select.disabled = select.options.length === 0 || select.options[0].value === '';
    }

    function defaultPageViewMode() {
      return localStorage.getItem('onenote.pageViewMode') === 'text' ? 'text' : 'html';
    }

    function defaultHtmlZoom() {
      return clampHtmlZoom(localStorage.getItem('onenote.defaultHtmlZoom'));
    }

    function showAuxBibleRefs() {
      return localStorage.getItem('onenote.showAuxBibleRefs') === 'true';
    }

    function addBibleDisplayParams(params = new URLSearchParams()) {
      if (showAuxBibleRefs()) params.set('includeAux', '1');
      return params;
    }

    function clampHtmlZoom(value) {
      const numberValue = Number(value);
      if (!Number.isFinite(numberValue)) return 100;
      return Math.max(50, Math.min(200, Math.round(numberValue / 10) * 10));
    }

    function savePageViewSettings() {
      localStorage.setItem('onenote.pageViewMode', pageViewModeSelect.value === 'html' ? 'html' : 'text');
      const zoom = clampHtmlZoom(defaultHtmlZoomInput.value);
      defaultHtmlZoomInput.value = String(zoom);
      localStorage.setItem('onenote.defaultHtmlZoom', String(zoom));
    }

    function saveBibleDisplaySettings() {
      localStorage.setItem('onenote.showAuxBibleRefs', String(showAuxBibleRefsInput.checked));
      if (activeSearchQuery) renderSearch(activeSearchQuery).catch(showError);
      if (selectedPageId) openPage(selectedPageId, { updateUrl:false, paragraphIndex:currentTargetParagraphIndex }).catch(showError);
    }

    function renderRuntimeSettings(settings) {
      verboseLoggingEnabled = settings.verboseLogging === true;
      verboseLoggingInput.checked = verboseLoggingEnabled;
      verboseLoggingStatusEl.textContent = verboseLoggingEnabled
        ? 'Расширенное логирование включено. Файл: ' + (settings.logPath || '')
        : 'Расширенное логирование выключено. Файл: ' + (settings.logPath || '');
    }

    async function refreshRuntimeSettings() {
      renderRuntimeSettings(await api('/api/runtime-settings'));
    }

    async function saveRuntimeSettings() {
      renderRuntimeSettings(await api('/api/runtime-settings', {
        method:'PUT',
        headers:{ 'Content-Type':'application/json' },
        body:JSON.stringify({ verboseLogging:verboseLoggingInput.checked })
      }));
      uiLog('settings.verboseLoggingChanged', { enabled:verboseLoggingEnabled });
    }

    function openSettingsDialog() {
      uiLog('ui.openSettings', {});
      if (!settingsDialog.open) settingsDialog.showModal();
      refreshRuntimeSettings().catch(error => {
        verboseLoggingStatusEl.textContent = 'Не удалось загрузить параметры диагностики: ' + error.message;
      });
      refreshOneNoteAccessSettings().catch(error => {
        oneNoteAccessStatusEl.textContent = 'Не удалось загрузить параметры OneNote: ' + error.message;
      });
      refreshBibleNoteSettings().catch(error => {
        bibleNoteStatusEl.textContent = 'Не удалось проверить BibleNote: ' + error.message;
      });
      refreshProtocolSettings().catch(error => {
        protocolStatusEl.textContent = 'Не удалось проверить обработчик ссылок: ' + error.message;
      });
    }

    async function refreshOneNoteAccessSettings() {
      const result = await api('/api/onenote/access-settings');
      oneNoteClientIdInput.value = result.clientId || '';
      oneNoteTenantIdInput.value = result.tenantId || 'common';
      oneNoteScopesInput.value = result.scopes || 'Notes.Read User.Read offline_access';
      oneNoteTokenCacheInput.value = result.tokenCache || '';
      oneNoteAccessStatusEl.textContent = oneNoteClientIdConfigured(result.clientId)
        ? 'Доступ к OneNote настроен.'
        : 'Укажите Azure Client ID для доступа к OneNote.';
      return result;
    }

    async function saveOneNoteAccessSettings() {
      if (saveOneNoteAccessButton) saveOneNoteAccessButton.disabled = true;
      oneNoteAccessStatusEl.textContent = 'Сохранение параметров OneNote...';
      try {
        const result = await api('/api/onenote/access-settings', {
          method:'PUT',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({
            clientId:oneNoteClientIdInput.value,
            tenantId:oneNoteTenantIdInput.value,
            scopes:oneNoteScopesInput.value,
            tokenCache:oneNoteTokenCacheInput.value
          })
        });
        oneNoteClientIdInput.value = result.clientId || '';
        oneNoteTenantIdInput.value = result.tenantId || 'common';
        oneNoteScopesInput.value = result.scopes || 'Notes.Read User.Read offline_access';
        oneNoteTokenCacheInput.value = result.tokenCache || '';
        oneNoteAccessStatusEl.textContent = 'Доступ к OneNote сохранен.';
        return result;
      } finally {
        if (saveOneNoteAccessButton) saveOneNoteAccessButton.disabled = false;
      }
    }

    function oneNoteClientIdConfigured(value) {
      const clientId = String(value || '').trim();
      return Boolean(clientId) && clientId !== '00000000-0000-0000-0000-000000000000';
    }

    function setupWizardCompleted() {
      return localStorage.getItem('biblenote.setupWizardDone') === 'true';
    }

    function setupWizardSteps() {
      return [...setupWizardDialog.querySelectorAll('[data-setup-step]')];
    }

    function setupBibleModuleSelected() {
      return Boolean(String(setupBibleModuleInput.value || '').trim());
    }

    function updateSetupWizard() {
      const steps = setupWizardSteps();
      for (const step of steps) step.hidden = Number(step.dataset.setupStep) !== setupWizardStep;
      setupWizardDialog.querySelectorAll('.setup-wizard-dot').forEach((dot, index) => {
        dot.classList.toggle('active', index <= setupWizardStep);
      });
      setupWizardBackButton.disabled = setupWizardStep === 0;
      setupWizardNextButton.textContent = setupWizardStep === steps.length - 1 ? 'Сохранить' : 'Далее';
      setupWizardStatusEl.textContent = '';
      setupWizardStatusEl.classList.remove('error');
      if (setupWizardStep === 2) {
        setupWizardSummaryEl.textContent = [
          'OneNote Client ID: ' + (setupOneNoteClientIdInput.value.trim() || 'не указан'),
          'Модуль BibleNote: ' + ((setupBibleModuleInput.value || 'rst').trim() || 'rst')
        ].join('\n');
      }
    }

    async function openSetupWizardIfNeeded() {
      const settings = await api('/api/onenote/access-settings');
      const shouldOpen = !setupWizardCompleted() || !oneNoteClientIdConfigured(settings.clientId);
      if (!shouldOpen || setupWizardDialog.open) return;
      if (settingsDialog.open) settingsDialog.close();
      setupWizardCanClose = false;
      setupOneNoteClientIdInput.value = settings.clientId || '';
      await refreshBibleNoteSettings().catch(error => {
        setupBibleModuleStatusEl.textContent = 'Не удалось получить список модулей BibleNote: ' + (error?.message || String(error));
      });
      setupWizardStep = 0;
      updateSetupWizard();
      setupWizardDialog.showModal();
      setupOneNoteClientIdInput.focus();
    }

    async function finishSetupWizard() {
      const clientId = setupOneNoteClientIdInput.value.trim();
      if (!oneNoteClientIdConfigured(clientId)) {
        setupWizardStep = 0;
        updateSetupWizard();
        setupWizardStatusEl.textContent = 'Укажите корректный Azure Client ID.';
        setupWizardStatusEl.classList.add('error');
        setupOneNoteClientIdInput.focus();
        return;
      }
      if (!setupBibleModuleSelected()) {
        setupWizardStep = 1;
        updateSetupWizard();
        setupWizardStatusEl.textContent = 'Выберите загруженный модуль BibleNote или сначала загрузите модуль.';
        setupWizardStatusEl.classList.add('error');
        return;
      }
      setupWizardNextButton.disabled = true;
      setupWizardStatusEl.textContent = 'Сохранение параметров...';
      try {
        oneNoteClientIdInput.value = clientId;
        await saveOneNoteAccessSettings();
        bibleModuleNameInput.value = setupBibleModuleInput.value;
        saveBibleModuleSetting();
        localStorage.setItem('biblenote.setupWizardDone', 'true');
        setupWizardCanClose = true;
        setupWizardDialog.close();
        showActivity('Первичная настройка сохранена.', 'success');
        refreshBibleNoteSettings().catch(error => console.warn(error));
      } catch (error) {
        setupWizardStatusEl.textContent = 'Не удалось сохранить настройки: ' + (error?.message || String(error));
        setupWizardStatusEl.classList.add('error');
      } finally {
        setupWizardNextButton.disabled = false;
      }
    }

    function nextSetupWizardStep() {
      if (setupWizardStep === 0 && !oneNoteClientIdConfigured(setupOneNoteClientIdInput.value)) {
        setupWizardStatusEl.textContent = 'Укажите Azure Client ID.';
        setupWizardStatusEl.classList.add('error');
        setupOneNoteClientIdInput.focus();
        return;
      }
      if (setupWizardStep === 1 && !setupBibleModuleSelected()) {
        setupWizardStatusEl.textContent = 'Выберите загруженный модуль BibleNote или сначала загрузите модуль.';
        setupWizardStatusEl.classList.add('error');
        return;
      }
      const lastStep = setupWizardSteps().length - 1;
      if (setupWizardStep >= lastStep) {
        finishSetupWizard().catch(showError);
        return;
      }
      setupWizardStep += 1;
      updateSetupWizard();
    }

    async function refreshBibleNoteSettings() {
      const result = await api('/api/biblenote/health');
      if (!result.available) {
        bibleNoteStatusEl.textContent = 'BibleNote пока недоступен: ' + (result.error || 'нет ответа');
        bibleModulesListEl.replaceChildren();
        return;
      }
      bibleNoteStatusEl.textContent = [
        'Статус: ' + result.status,
        'Модуль: ' + [result.module, result.moduleName].filter(Boolean).join(' · '),
        'Каталог модулей: ' + (result.modulesDirectory || 'не указан')
      ].join('\n');
      await refreshBibleModulesList();
    }

    async function refreshBibleModulesList() {
      const result = await api('/api/biblenote/modules');
      bibleModulesListEl.replaceChildren();
      if (!result.available) {
        fillBibleModuleSelect(bibleModuleNameInput, [], '');
        fillBibleModuleSelect(setupBibleModuleInput, [], '');
        bibleModulesListEl.textContent = result.error || 'Не удалось получить список модулей.';
        return;
      }
      const modules = Array.isArray(result.modules) ? result.modules : [];
      fillBibleModuleSelect(bibleModuleNameInput, modules, localStorage.getItem('onenote.bibleModule') || result.module);
      fillBibleModuleSelect(setupBibleModuleInput, modules, localStorage.getItem('onenote.bibleModule') || result.module);
      if (modules.length === 0) {
        bibleModulesListEl.textContent = 'Установленные модули не найдены.';
        return;
      }
      const currentModule = currentBibleModule();
      for (const module of modules) {
        const option = document.createElement('label');
        option.className = 'settings-module-option';
        const input = document.createElement('input');
        input.type = 'radio';
        input.name = 'bibleModuleChoice';
        input.value = module.shortName || '';
        input.checked = module.shortName === currentModule || (!currentModule && module.isCurrent);
        input.addEventListener('change', () => {
          if (!input.checked) return;
          bibleModuleNameInput.value = module.shortName || '';
          saveBibleModuleSetting();
        });
        const body = document.createElement('div');
        const title = document.createElement('div');
        title.className = 'settings-module-name';
        title.textContent = moduleDisplayName(module);
        const meta = document.createElement('div');
        meta.className = 'settings-module-meta';
        meta.textContent = [module.type, module.locale, module.isCurrent ? 'текущий в BibleNote' : ''].filter(Boolean).join(' · ');
        body.append(title, meta);
        option.append(input, body);
        bibleModulesListEl.append(option);
      }
    }

    function arrayBufferToBase64(buffer) {
      const bytes = new Uint8Array(buffer);
      const chunkSize = 0x8000;
      let binary = '';
      for (let index = 0; index < bytes.length; index += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
      }
      return btoa(binary);
    }

    function updateBibleModuleUploadState() {
      uploadBibleModuleButton.disabled = !bibleModuleFileInput.files || bibleModuleFileInput.files.length === 0;
    }

    function updateSetupBibleModuleUploadState() {
      setupUploadBibleModuleButton.disabled = !setupBibleModuleFileInput.files || setupBibleModuleFileInput.files.length === 0;
    }

    async function uploadBibleModuleFiles(fileInput, uploadButton, statusElement, moduleInput, saveModule) {
      const files = [...(fileInput.files || [])];
      if (files.length === 0) {
        statusElement.textContent = 'Выберите файл модуля .bnm или .zip.';
        uploadButton.disabled = true;
        return;
      }
      uploadButton.disabled = true;
      statusElement.textContent = 'Загрузка модулей: 0/' + files.length;
      try {
        const installed = [];
        for (let index = 0; index < files.length; index += 1) {
          const file = files[index];
          statusElement.textContent = 'Загрузка модулей: ' + index + '/' + files.length + ' · ' + file.name;
          const contentBase64 = arrayBufferToBase64(await file.arrayBuffer());
          const result = await api('/api/biblenote/modules/upload', {
            method:'POST',
            headers:{ 'Content-Type':'application/json' },
            body:JSON.stringify({ fileName:file.name, contentBase64 })
          });
          if (result.moduleName) installed.push(result.moduleName);
        }
        if (installed.length > 0) {
          moduleInput.value = installed[installed.length - 1];
          if (saveModule) saveBibleModuleSetting();
        }
        statusElement.textContent = 'Загружено модулей: ' + installed.length + '/' + files.length;
        fileInput.value = '';
        await refreshBibleNoteSettings();
        if (installed.length > 0) moduleInput.value = installed[installed.length - 1];
      } catch (error) {
        statusElement.textContent = 'Не удалось загрузить модуль: ' + error.message;
      } finally {
        uploadButton.disabled = true;
      }
    }

    async function uploadBibleModule() {
      await uploadBibleModuleFiles(bibleModuleFileInput, uploadBibleModuleButton, bibleModuleStatusEl, bibleModuleNameInput, true);
      updateBibleModuleUploadState();
    }

    async function uploadSetupBibleModule() {
      await uploadBibleModuleFiles(setupBibleModuleFileInput, setupUploadBibleModuleButton, setupBibleModuleStatusEl, setupBibleModuleInput, false);
      updateSetupBibleModuleUploadState();
      updateSetupWizard();
    }

    async function refreshProtocolSettings() {
      const result = await api('/api/system/protocol');
      registerBibleProtocolButton.disabled = result.available && result.registered;
      protocolStatusEl.textContent = result.available
        ? (result.registered ? 'Обработчик isbtBibleVerse зарегистрирован.' : 'Обработчик isbtBibleVerse пока не зарегистрирован.')
        : 'Регистрация доступна только в Electron-сборке.';
    }

    async function registerBibleProtocol() {
      registerBibleProtocolButton.disabled = true;
      protocolStatusEl.textContent = 'Регистрация обработчика isbtBibleVerse...';
      let refreshed = false;
      try {
        const result = await api('/api/system/protocol/register', { method:'POST' });
        protocolStatusEl.textContent = result.registered
          ? 'Обработчик isbtBibleVerse зарегистрирован.'
          : 'Electron не подтвердил регистрацию обработчика.';
        await refreshProtocolSettings();
        refreshed = true;
      } catch (error) {
        protocolStatusEl.textContent = 'Не удалось зарегистрировать обработчик: ' + error.message;
        registerBibleProtocolButton.disabled = false;
      } finally {
        if (!refreshed) registerBibleProtocolButton.disabled = false;
      }
    }

    setupSettingsDialog();
    setupDownloadLogDialog();

    themeSelect.value = document.documentElement.dataset.theme || 'a';
    themeSelect.addEventListener('change', () => {
      const theme = ['a', 'b', 'c'].includes(themeSelect.value) ? themeSelect.value : 'a';
      document.documentElement.dataset.theme = theme;
      localStorage.setItem('onenote.theme', theme);
    });

    openSettingsButton.addEventListener('click', openSettingsDialog);
    closeSettingsButton.addEventListener('click', () => settingsDialog.close());
    if (saveOneNoteAccessButton) saveOneNoteAccessButton.addEventListener('click', () => saveOneNoteAccessSettings().catch(error => {
      oneNoteAccessStatusEl.textContent = 'Не удалось сохранить параметры OneNote: ' + error.message;
      saveOneNoteAccessButton.disabled = false;
    }));
    oneNoteClientIdInput.addEventListener('change', () => saveOneNoteAccessSettings().catch(error => {
      oneNoteAccessStatusEl.textContent = 'Не удалось сохранить параметры OneNote: ' + error.message;
    }));
    oneNoteClientIdInput.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        oneNoteClientIdInput.blur();
      }
    });
    setupWizardBackButton.addEventListener('click', () => {
      setupWizardStep = Math.max(0, setupWizardStep - 1);
      updateSetupWizard();
    });
    setupWizardNextButton.addEventListener('click', nextSetupWizardStep);
    setupWizardDialog.addEventListener('cancel', event => {
      if (!setupWizardCanClose) {
        event.preventDefault();
        setupWizardStatusEl.textContent = 'Сначала завершите первичную настройку.';
        setupWizardStatusEl.classList.add('error');
      }
    });
    setupWizardDialog.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !setupWizardCanClose) {
        event.preventDefault();
        event.stopPropagation();
        setupWizardStatusEl.textContent = 'Сначала завершите первичную настройку.';
        setupWizardStatusEl.classList.add('error');
      }
    }, true);
    setupWizardDialog.addEventListener('close', () => {
      if (setupWizardCanClose) return;
      setTimeout(() => {
        if (!setupWizardDialog.open) setupWizardDialog.showModal();
      }, 0);
    });
    settingsDialog.addEventListener('cancel', event => {
      if (event.target !== settingsDialog) {
        event.stopPropagation();
        return;
      }
      settingsDialog.close();
    });
    bibleModuleNameInput.addEventListener('change', saveBibleModuleSetting);
    bibleModuleFileInput.addEventListener('click', () => {
      bibleModuleFileInput.value = '';
      updateBibleModuleUploadState();
    });
    bibleModuleFileInput.addEventListener('change', updateBibleModuleUploadState);
    uploadBibleModuleButton.addEventListener('click', () => uploadBibleModule().catch(showError));
    setupBibleModuleFileInput.addEventListener('click', () => {
      setupBibleModuleFileInput.value = '';
      updateSetupBibleModuleUploadState();
    });
    setupBibleModuleFileInput.addEventListener('change', updateSetupBibleModuleUploadState);
    setupUploadBibleModuleButton.addEventListener('click', () => uploadSetupBibleModule().catch(showError));
    registerBibleProtocolButton.addEventListener('click', () => registerBibleProtocol().catch(showError));
    pageViewModeSelect.addEventListener('change', savePageViewSettings);
    defaultHtmlZoomInput.addEventListener('change', savePageViewSettings);
    showAuxBibleRefsInput.addEventListener('change', saveBibleDisplaySettings);
    verboseLoggingInput.addEventListener('change', () => saveRuntimeSettings().catch(error => {
      verboseLoggingStatusEl.textContent = 'Не удалось сохранить параметры диагностики: ' + error.message;
    }));
    statusEl.addEventListener('click', openDownloadLogDialog);
    closeDownloadLogButton.addEventListener('click', () => downloadLogDialog.close());
    downloadLogDialog.addEventListener('cancel', () => downloadLogDialog.close());

    function uiLog(action, details) {
      if (!verboseLoggingEnabled || action === 'api.runtime-log') return;
      fetch('/api/runtime-log', {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body:JSON.stringify({ action, details })
      }).catch(() => {});
    }

    async function api(path, options) {
      const timeoutMs = options?.timeoutMs || 45000;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      const fetchOptions = { ...(options || {}), signal:options?.signal || controller.signal };
      delete fetchOptions.timeoutMs;
      const method = fetchOptions.method || 'GET';
      const startedAt = Date.now();
      if (path !== '/api/runtime-log') uiLog('api.request', { method, path, timeoutMs });
      let response;
      let text = '';
      try {
        response = await fetch(path, fetchOptions);
        text = await response.text();
      } catch (error) {
        const message = error?.name === 'AbortError' ? 'Request timed out after ' + timeoutMs + ' ms' : (error?.message || String(error));
        uiLog('api.error', { method, path, durationMs:Date.now() - startedAt, error:message });
        if (error?.name === 'AbortError') throw new Error(message);
        throw error;
      } finally {
        clearTimeout(timeout);
      }
      let body = {};
      try {
        body = text ? JSON.parse(text) : {};
      } catch {
        body = { error:text || 'Invalid JSON response' };
      }
      if (!response.ok) {
        const error = new Error(body.error || 'Request failed');
        error.status = response.status;
        uiLog('api.error', { method, path, status:response.status, durationMs:Date.now() - startedAt, error:error.message });
        throw error;
      }
      if (!response.ok) throw new Error(body.error || 'Ошибка запроса');
      uiLog('api.response', { method, path, status:response.status, durationMs:Date.now() - startedAt });
      return body;
    }

    function decodeHtmlText(value) {
      const textarea = document.createElement('textarea');
      textarea.innerHTML = String(value || '');
      return textarea.value;
    }

    function normalizeParagraphText(value) {
      return decodeHtmlText(value).replace(/\s+/g, ' ').trim();
    }

    function pageHtmlFrameSrcdoc(rawHtml, targetParagraphs) {
      const normalizeBibleHref = href => String(href || '').trim()
        .replace(/^https?:\/\/isbtBibleVerse:/i, 'isbtBibleVerse:')
        .replace(/^https?:\/\/bnVerse:/i, 'bnVerse:');
      const isBibleHref = href => {
        const value = normalizeBibleHref(href);
        if (/^(?:isbtBibleVerse|bnVerse):/i.test(value)) return true;
        try {
          return /^(?:isbtBibleVerse|bnVerse):/i.test(normalizeBibleHref(decodeURIComponent(value)));
        } catch {
          return false;
        }
      };
      const isGraphImageSrc = src => {
        try {
          const value = new URL(String(src || ''), location.href);
          return value.protocol === 'https:' && value.hostname === 'graph.microsoft.com' && value.pathname.startsWith('/v1.0/');
        } catch {
          return false;
        }
      };
      const parser = new DOMParser();
      const doc = parser.parseFromString(rawHtml || '', 'text/html');
      for (const link of doc.querySelectorAll('a[href]')) {
        const href = link.getAttribute('href') || '';
        if (!isBibleHref(href)) continue;
        link.setAttribute('data-onenote-bible-href', href);
        link.setAttribute('href', '#');
        link.setAttribute('target', '_self');
      }
      for (const image of doc.querySelectorAll('img[src]')) {
        const src = image.getAttribute('src') || '';
        if (!isGraphImageSrc(src)) continue;
        const absoluteSrc = new URL(src, location.href).toString();
        image.setAttribute('data-onenote-original-src', absoluteSrc);
        image.setAttribute('src', '/api/onenote-image?src=' + encodeURIComponent(absoluteSrc));
        image.removeAttribute('srcset');
      }
      const targetItems = (Array.isArray(targetParagraphs) ? targetParagraphs : [targetParagraphs])
        .map(item => {
          if (typeof item === 'string') return { text:normalizeParagraphText(item), references:[] };
          return {
            text:normalizeParagraphText(item?.text || ''),
            references:Array.isArray(item?.references) ? item.references : []
          };
        })
        .filter(item => item.text || item.references.length > 0);
      if (targetItems.length > 0) {
        const style = doc.createElement('style');
        style.textContent = '[data-onenote-target-paragraph="true"]{background:rgba(116,84,166,.16)!important;box-shadow:inset 4px 0 0 #7454a6!important;outline:1px solid rgba(116,84,166,.35)!important;scroll-margin:80px!important;}[data-onenote-target-paragraph-current="true"]{background:rgba(116,84,166,.26)!important;outline:2px solid #7454a6!important;}';
        doc.head.append(style);
        const used = new Set();
        const markTargetElement = (element, targetIndex) => {
          used.add(element);
          element.setAttribute('data-onenote-target-paragraph', 'true');
          element.setAttribute('data-onenote-target-paragraph-index', String(targetIndex));
          if (targetIndex === 0) element.setAttribute('data-onenote-target-paragraph-current', 'true');
        };
        const refMatchesTarget = (link, references) => {
          const linkText = normalizeParagraphText(link.textContent);
          const href = normalizeBibleHref(decodeURIComponent(link.getAttribute('data-onenote-bible-href') || link.getAttribute('href') || ''));
          return references.some(ref => {
            const original = normalizeParagraphText(ref?.originalText);
            const normalized = normalizeParagraphText(ref?.normalizedRef);
            if (original && linkText === original) return true;
            if (normalized && linkText === normalized) return true;
            const bookIndex = Number(ref?.bookIndex);
            const chapter = Number(ref?.chapter);
            const verse = Number(ref?.verse);
            if (!Number.isInteger(bookIndex) || !Number.isInteger(chapter) || !Number.isInteger(verse)) return false;
            return href.includes('/' + bookIndex + ' ' + chapter + ':' + verse)
              || href.includes('/' + bookIndex + '%20' + chapter + ':' + verse);
          });
        };
        for (let targetIndex = 0; targetIndex < targetItems.length; targetIndex += 1) {
          const targetText = targetItems[targetIndex].text;
          let best = null;
          if (targetText) {
            for (const element of doc.body.querySelectorAll('p,div,li,td,th,blockquote,h1,h2,h3,h4,h5,h6')) {
              if (used.has(element)) continue;
              const text = normalizeParagraphText(element.textContent);
              if (!text) continue;
              if (!text.includes(targetText)) continue;
              if (!best || text.length < best.text.length) best = { element, text };
            }
          }
          if (best?.element) {
            markTargetElement(best.element, targetIndex);
            continue;
          }
          const links = [...doc.body.querySelectorAll('a[href],a[data-onenote-bible-href]')];
          const link = links.find(item => refMatchesTarget(item, targetItems[targetIndex].references));
          const target = link?.closest('li,p,td,th,blockquote,div') || link;
          if (target && !used.has(target)) {
            markTargetElement(target, targetIndex);
          }
        }
      }
      const bridgeScript = [
        '<scr' + 'ipt>',
        '(function(){',
        'function decodeSafe(value){try{return decodeURIComponent(value);}catch(error){return value;}}',
        'function normalizeBibleHref(href){return String(href||"").trim().replace(/^https?:\\/\\/isbtBibleVerse:/i,"isbtBibleVerse:").replace(/^https?:\\/\\/bnVerse:/i,"bnVerse:");}',
        'function isBibleHref(href){return /^(?:isbtBibleVerse|bnVerse):/i.test(normalizeBibleHref(href))||/^(?:isbtBibleVerse|bnVerse):/i.test(normalizeBibleHref(decodeSafe(href||"")));}',
        'function sendBibleLink(href){parent.postMessage({type:"onenote-bible-link",href:normalizeBibleHref(decodeSafe(href))},"*");}',
        'document.addEventListener("click",function(event){',
        'var target=event.target;',
        'var link=target&&target.closest?target.closest("a[href]"):null;',
        'if(!link)return;',
        'var href=link.getAttribute("data-onenote-bible-href")||link.getAttribute("href")||"";',
        'if(isBibleHref(href)){event.preventDefault();event.stopPropagation();sendBibleLink(href);}',
        '},true);',
        'function scrollTargetParagraph(index){var selector="[data-onenote-target-paragraph=true]";var target=Number.isInteger(index)?document.querySelector("[data-onenote-target-paragraph-index=\\"" + index + "\\"]"):document.querySelector(selector);document.querySelectorAll(selector).forEach(function(item){item.removeAttribute("data-onenote-target-paragraph-current");});if(target){target.setAttribute("data-onenote-target-paragraph-current","true");target.scrollIntoView({block:"center"});}}',
        'window.addEventListener("message",function(event){',
        'var data=event.data||{};',
        'if(data.type==="onenote-html-zoom"){document.documentElement.style.zoom=String(data.zoom||1);}',
        'if(data.type==="onenote-scroll-target-paragraph"){var index=Number.isInteger(data.targetIndex)?data.targetIndex:undefined;scrollTargetParagraph(index);setTimeout(function(){scrollTargetParagraph(index);},80);setTimeout(function(){scrollTargetParagraph(index);},240);}',
        '});',
        'window.addEventListener("load",function(){scrollTargetParagraph();setTimeout(scrollTargetParagraph,80);setTimeout(scrollTargetParagraph,240);});',
        '}());',
        '</scr' + 'ipt>'
      ].join('');
      doc.body.insertAdjacentHTML('beforeend', bridgeScript);
      return '<!doctype html>\n' + doc.documentElement.outerHTML;
    }

    async function loadPageHtmlWithFallback(params) {
      try {
        return { ...(await api('/api/page-html?' + params.toString(), { timeoutMs:15000 })), degraded:false };
      } catch (error) {
        const rawParams = new URLSearchParams(params);
        rawParams.set('raw', '1');
        const raw = await api('/api/page-html?' + rawParams.toString(), { timeoutMs:5000 });
        return {
          ...raw,
          degraded:true,
          warning:'HTML показан из локального кэша без обновления библейских ссылок: ' + (error?.message || String(error))
        };
      }
    }

    function postHtmlFrameZoom(frame, percent) {
      const zoom = Math.max(50, Math.min(200, Number(percent) || 100)) / 100;
      frame?.contentWindow?.postMessage({ type:'onenote-html-zoom', zoom }, '*');
    }

    async function openBibleRef(rawRef) {
      uiLog('ui.openBibleRef', { rawRef });
      const normalizedRef = String(rawRef || '').trim()
        .replace(/^https?:\/\/isbtBibleVerse:/i, 'isbtBibleVerse:')
        .replace(/^https?:\/\/bnVerse:/i, 'bnVerse:');
      const params = new URLSearchParams({ ref:normalizedRef, module:currentBibleModule() });
      const result = await api('/api/bible/parse-link?' + params.toString());
      if (result.reference) await showBibleText(result.reference);
    }

    window.addEventListener('message', event => {
      const data = event.data || {};
      if (data.type !== 'onenote-bible-link' || typeof data.href !== 'string') return;
      openBibleRef(data.href).catch(showError);
    });

    function loadHiddenNotebookIds() {
      try {
        const value = JSON.parse(localStorage.getItem('onenote.hiddenNotebookIds') || '[]');
        return Array.isArray(value) ? value.filter(id => typeof id === 'string') : [];
      } catch {
        return [];
      }
    }

    function selectedNotebookIds() {
      return notebooksCache.filter(notebook => !hiddenNotebookIds.has(notebook.id)).map(notebook => notebook.id);
    }

    function saveNotebookSelection() {
      localStorage.setItem('onenote.hiddenNotebookIds', JSON.stringify([...hiddenNotebookIds]));
      const selected = selectedNotebookIds();
      notebookSummaryEl.textContent = 'Записные книжки: ' + selected.length + '/' + notebooksCache.length;
      syncNotebookSelectionEl.textContent = selected.length
        ? 'Будут синхронизированы выбранные блокноты: ' + selected.length
        : 'Выберите хотя бы один блокнот';
      syncButton.disabled = selected.length === 0;
    }

    async function loadNotebookSelector() {
      notebooksCache = await api('/api/notebooks');
      notebookListEl.replaceChildren();
      for (const notebook of notebooksCache) {
        const item = document.createElement('div');
        item.className = 'notebook-option';
        const choice = document.createElement('label');
        choice.className = 'notebook-choice';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = !hiddenNotebookIds.has(notebook.id);
        checkbox.dataset.notebookId = notebook.id;
        checkbox.addEventListener('change', () => {
          if (checkbox.checked) hiddenNotebookIds.delete(notebook.id); else hiddenNotebookIds.add(notebook.id);
          saveNotebookSelection();
          if (activeSearchQuery) renderSearch(activeSearchQuery).catch(showError); else renderTree().catch(showError);
          loadDownloadLog(true).catch(showError);
        });
        const text = document.createElement('span');
        text.className = 'notebook-name';
        text.textContent = notebook.displayName + ' (' + notebook.pageCount + ')';
        if (notebook.customDisplayName) text.title = 'Исходное имя OneNote: ' + notebook.originalDisplayName;
        const rename = document.createElement('button');
        rename.className = 'notebook-rename';
        rename.type = 'button';
        rename.textContent = '\u270E';
        rename.title = 'Изменить отображаемое имя';
        rename.setAttribute('aria-label', 'Изменить отображаемое имя «' + notebook.displayName + '»');
        rename.addEventListener('click', () => openNotebookNameDialog(notebook));
        choice.append(checkbox, text);
        item.append(choice, rename);
        notebookListEl.append(item);
      }
      saveNotebookSelection();
    }

    function openNotebookNameDialog(notebook) {
      editingNotebookId = notebook.id;
      notebookNameOriginalEl.textContent = 'Исходное имя в OneNote: ' + notebook.originalDisplayName;
      notebookNameInput.value = notebook.customDisplayName || notebook.originalDisplayName || '';
      resetNotebookNameButton.hidden = !notebook.customDisplayName;
      notebookNameDialog.showModal();
      notebookNameInput.focus();
      notebookNameInput.select();
    }

    async function saveNotebookDisplayName(displayName) {
      if (!editingNotebookId) return;
      saveNotebookNameButton.disabled = true;
      resetNotebookNameButton.disabled = true;
      try {
        const result = await api('/api/notebook-display-name', {
          method:'PATCH',
          headers:{ 'Content-Type':'application/json' },
          body:JSON.stringify({ notebookId:editingNotebookId, displayName })
        });
        notebookNameDialog.close();
        editingNotebookId = null;
        await loadNotebookSelector();
        await loadDownloadLog(true);
        if (selectedPageId) await openPage(selectedPageId);
        else if (activeSearchQuery) await renderSearch(activeSearchQuery);
        else await renderTree();
        showActivity('Отображаемое имя сохранено: ' + result.displayName, 'success');
      } catch (error) {
        showActivity('Не удалось сохранить имя: ' + error.message, 'error');
      } finally {
        saveNotebookNameButton.disabled = false;
        resetNotebookNameButton.disabled = false;
      }
    }

    saveNotebookNameButton.addEventListener('click', () => saveNotebookDisplayName(notebookNameInput.value));
    resetNotebookNameButton.addEventListener('click', () => saveNotebookDisplayName(null));
    cancelNotebookNameButton.addEventListener('click', () => {
      notebookNameDialog.close();
      editingNotebookId = null;
    });
    notebookNameDialog.addEventListener('cancel', () => { editingNotebookId = null; });
    closeBibleTextButton.addEventListener('click', () => bibleTextDialog.close());
    bibleTextBackButton.addEventListener('click', () => navigateBibleTextHistory(-1).catch(showError));
    bibleTextForwardButton.addEventListener('click', () => navigateBibleTextHistory(1).catch(showError));
    updateBibleTextHistoryButtons();
    showBibleTextInReaderButton.addEventListener('click', () => openBibleTextInReader().catch(showError));
    showBibleTextContextButton.addEventListener('click', () => showBibleTextContext().catch(showError));
    showBibleTextParallelButton.addEventListener('click', () => {
      if (currentBibleTextRef) loadParallelRefs(currentBibleTextRef, bibleTextParallelPanel).catch(showError);
    });
    notebookNameInput.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        saveNotebookDisplayName(notebookNameInput.value);
      }
    });

    selectAllNotebooksButton.addEventListener('click', () => {
      hiddenNotebookIds.clear();
      loadNotebookSelector().then(async () => {
        await (activeSearchQuery ? renderSearch(activeSearchQuery) : renderTree());
        await loadDownloadLog(true);
      }).catch(showError);
    });

    clearAllNotebooksButton.addEventListener('click', () => {
      for (const notebook of notebooksCache) hiddenNotebookIds.add(notebook.id);
      loadNotebookSelector().then(async () => {
        await (activeSearchQuery ? renderSearch(activeSearchQuery) : renderTree());
        await loadDownloadLog(true);
      }).catch(showError);
    });

    async function loadDownloadLog(resetOffset) {
      if (resetOffset) logOffset = 0;
      const selectedIds = selectedNotebookIds();
      logListEl.replaceChildren();
      if (selectedIds.length === 0) {
        logSummaryEl.textContent = 'Журнал загрузки: нет выбранных блокнотов';
        logPageEl.textContent = '0 из 0';
        logPrevButton.disabled = true;
        logNextButton.disabled = true;
        return;
      }
      const params = new URLSearchParams({
        filter:logFilterEl.value,
        limit:String(logLimit),
        offset:String(logOffset)
      });
      for (const notebookId of selectedIds) params.append('notebookId', notebookId);
      const result = await api('/api/download-log?' + params.toString());
      logSummaryEl.textContent = 'Журнал: ' + result.counts.downloaded + ' загружено · ' + result.counts.missing + ' не загружено · ' + result.counts.errors + ' ' + pluralRu(result.counts.errors, 'ошибка', 'ошибки', 'ошибок');
      for (const item of result.rows) {
        const button = document.createElement('button');
        button.className = 'log-row';
        button.type = 'button';
        button.onclick = () => openPage(item.id);
        const title = document.createElement('div');
        title.className = 'log-title';
        const badge = document.createElement('span');
        badge.className = 'log-badge ' + item.status;
        const label = document.createElement('span');
        label.textContent = item.title || '(без названия)';
        title.append(badge, label);
        const path = document.createElement('div');
        path.className = 'log-path';
        path.textContent = [item.notebook, item.section].filter(Boolean).join(' / ');
        const detail = document.createElement('div');
        detail.className = 'log-detail' + (item.status === 'error' ? ' error' : '');
        detail.textContent = item.error || (item.contentSyncedAt ? 'Загружено: ' + formatDate(item.contentSyncedAt) : 'Контент не загружен');
        button.append(title, path, detail);
        logListEl.append(button);
      }
      if (result.rows.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'sync-state';
        empty.textContent = 'Нет страниц для выбранного фильтра';
        logListEl.append(empty);
      }
      const first = result.total === 0 ? 0 : logOffset + 1;
      const last = Math.min(logOffset + result.rows.length, result.total);
      logPageEl.textContent = first + '–' + last + ' из ' + result.total;
      logPrevButton.disabled = logOffset === 0;
      logNextButton.disabled = logOffset + result.rows.length >= result.total;
    }

    logFilterEl.addEventListener('change', () => loadDownloadLog(true).catch(showError));
    refreshLogButton.addEventListener('click', () => loadDownloadLog(false).catch(showError));
    logPrevButton.addEventListener('click', () => {
      logOffset = Math.max(0, logOffset - logLimit);
      loadDownloadLog(false).catch(showError);
    });
    logNextButton.addEventListener('click', () => {
      logOffset += logLimit;
      loadDownloadLog(false).catch(showError);
    });

    function bibleReaderSavedState() {
      if (!localStorage.getItem('biblenote.reader.emptyChapterDefault')) {
        localStorage.removeItem('biblenote.reader.chapter');
        localStorage.removeItem('biblenote.reader.verse');
        localStorage.setItem('biblenote.reader.emptyChapterDefault', 'true');
      }
      const savedChapter = Number(localStorage.getItem('biblenote.reader.chapter') || '');
      return {
        module:localStorage.getItem('biblenote.reader.module') || currentBibleModule(),
        bookIndex:Number(localStorage.getItem('biblenote.reader.bookIndex') || '40') || 40,
        chapter:Number.isInteger(savedChapter) && savedChapter > 0 ? savedChapter : undefined,
        verse:Number(localStorage.getItem('biblenote.reader.verse') || '0') || undefined
      };
    }

    function saveBibleReaderState(extra = {}) {
      const state = {
        module:bibleReaderModuleEl.value || currentBibleModule(),
        bookIndex:Number(bibleReaderBookEl.value) || undefined,
        chapter:Number(bibleReaderChapterEl.value) || undefined,
        ...extra
      };
      if (state.module) localStorage.setItem('biblenote.reader.module', state.module);
      if (state.bookIndex) localStorage.setItem('biblenote.reader.bookIndex', String(state.bookIndex));
      if (state.chapter) localStorage.setItem('biblenote.reader.chapter', String(state.chapter));
      else localStorage.removeItem('biblenote.reader.chapter');
      if (state.verse) localStorage.setItem('biblenote.reader.verse', String(state.verse));
      else localStorage.removeItem('biblenote.reader.verse');
    }

    function selectedBibleReaderBook() {
      const bookIndex = Number(bibleReaderBookEl.value);
      return bibleReaderBooks.find(book => Number(book.index) === bookIndex);
    }

    function updateBibleReaderNavButtons() {
      const book = selectedBibleReaderBook();
      const chapter = Number(bibleReaderChapterEl.value);
      const chapters = Array.isArray(book?.chapters) ? book.chapters.map(Number) : [];
      const firstChapter = chapters[0] || 1;
      const lastChapter = chapters[chapters.length - 1] || Number(book?.chapterCount || 1);
      const hasBook = Boolean(book);
      bibleReaderPrevButton.disabled = !hasBook || !Number.isInteger(chapter) || chapter <= firstChapter;
      bibleReaderNextButton.disabled = !hasBook || !Number.isInteger(chapter) || chapter >= lastChapter;
    }

    function fillBibleReaderChapters(preferredChapter) {
      const book = selectedBibleReaderBook();
      bibleReaderChapterEl.replaceChildren();
      const preferred = Number(preferredChapter);
      const hasPreferred = Number.isInteger(preferred) && preferred > 0;
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = 'Глава';
      placeholder.selected = !hasPreferred;
      bibleReaderChapterEl.append(placeholder);
      const chapters = Array.isArray(book?.chapters) && book.chapters.length > 0
        ? book.chapters
        : Array.from({ length:Number(book?.chapterCount || 0) }, (_, index) => index + 1);
      for (const chapter of chapters) {
        const option = document.createElement('option');
        option.value = String(chapter);
        option.textContent = String(chapter);
        option.selected = Number(chapter) === preferred;
        bibleReaderChapterEl.append(option);
      }
      bibleReaderChapterEl.disabled = chapters.length === 0;
      updateBibleReaderNavButtons();
    }

    function fillBibleReaderBooks(books, preferredBookIndex, preferredChapter) {
      bibleReaderBooks = books;
      bibleReaderBookEl.replaceChildren();
      for (const book of books) {
        const option = document.createElement('option');
        option.value = String(book.index);
        option.textContent = book.name || book.shortName || String(book.index);
        if (book.shortName && book.name && book.shortName !== book.name) option.title = book.shortName;
        option.selected = Number(book.index) === Number(preferredBookIndex);
        bibleReaderBookEl.append(option);
      }
      bibleReaderBookEl.disabled = bibleReaderBookEl.options.length === 0;
      if (bibleReaderBookEl.options.length > 0 && !bibleReaderBookEl.value) bibleReaderBookEl.selectedIndex = 0;
      fillBibleReaderChapters(preferredChapter);
    }

    function currentBibleReaderLocation() {
      return {
        module:bibleReaderModuleEl.value || currentBibleModule(),
        book:selectedBibleReaderBook(),
        bookIndex:Number(bibleReaderBookEl.value),
        chapter:Number(bibleReaderChapterEl.value)
      };
    }

    async function refreshBibleReaderModules() {
      const state = bibleReaderSavedState();
      bibleReaderStatusEl.textContent = 'Загрузка модулей...';
      const result = await api('/api/biblenote/modules');
      const modules = Array.isArray(result.modules) ? result.modules : [];
      fillBibleModuleSelect(bibleReaderModuleEl, modules, state.module);
      if (bibleReaderModuleEl.disabled) {
        bibleReaderStatusEl.textContent = result.available ? 'Загруженные модули не найдены.' : (result.error || 'BibleNote недоступен.');
        fillBibleReaderBooks([], undefined, undefined);
        return;
      }
      await refreshBibleReaderBooks(state.bookIndex, state.chapter);
    }

    async function refreshBibleReaderBooks(preferredBookIndex, preferredChapter, options = {}) {
      if (!bibleReaderModuleEl.value) return;
      bibleReaderLoading = true;
      bibleReaderStatusEl.textContent = 'Загрузка книг...';
      try {
        const result = await api('/api/bible/books?' + new URLSearchParams({ module:bibleReaderModuleEl.value }).toString(), { timeoutMs:60000 });
        const books = Array.isArray(result.books) ? result.books : [];
        fillBibleReaderBooks(books, preferredBookIndex, preferredChapter);
        bibleReaderStatusEl.textContent = books.length > 0 ? '' : 'В модуле не найдены книги.';
        if (books.length > 0 && options.open === true && Number(bibleReaderChapterEl.value) > 0) await openBibleReaderChapter();
      } finally {
        bibleReaderLoading = false;
      }
    }

    function bibleReaderVerseRef(result, verse) {
      const book = selectedBibleReaderBook();
      const bookName = result.bookName || book?.name;
      const bookShortName = result.bookShortName || book?.shortName;
      const referenceName = bookShortName || bookName || 'Библия';
      const verseReference = String(verse.reference || '').trim();
      const fullReference = /[A-Za-zА-Яа-яЁё]/.test(verseReference)
        ? verseReference
        : referenceName + ' ' + verse.chapter + ':' + verse.verse;
      return {
        normalizedRef:fullReference,
        originalText:fullReference,
        module:result.module || bibleReaderModuleEl.value || currentBibleModule(),
        bookIndex:result.bookIndex || Number(bibleReaderBookEl.value),
        bookName,
        bookShortName,
        chapter:Number(verse.chapter),
        verse:Number(verse.verse),
        topChapter:Number(verse.chapter),
        topVerse:Number(verse.verse)
      };
    }

    async function showBibleReaderVerseNotes(ref) {
      const query = ref.normalizedRef || ref.originalText || '';
      searchInput.value = query;
      activeSearchQuery = query;
      rememberSearch(query);
      const notesPanel = document.querySelector('.notes-panel');
      if (notesPanel) notesPanel.setAttribute('open', '');
      await renderSearch(query);
    }

    function renderBibleReaderChapter(result, highlightRef) {
      content.replaceChildren();
      selectedPageId = null;
      currentTargetParagraphIndex = undefined;
      const article = document.createElement('article');
      article.className = 'page bible-reader-page';
      const crumbs = document.createElement('div');
      crumbs.className = 'breadcrumbs';
      crumbs.textContent = ['Библия', result.moduleName || result.module].filter(Boolean).join(' / ');
      const title = document.createElement('h2');
      title.textContent = [result.bookName || selectedBibleReaderBook()?.name || 'Книга', result.chapter].filter(Boolean).join(' ');
      const heading = document.createElement('div');
      heading.className = 'page-heading';
      const headingActions = document.createElement('div');
      headingActions.className = 'page-heading-actions';
      headingActions.append(createViewHistoryButtons());
      heading.append(title, headingActions);
      const toolbar = document.createElement('div');
      toolbar.className = 'bible-reader-toolbar';
      const previous = document.createElement('button');
      previous.className = 'bible-reader-nav-button';
      previous.type = 'button';
      previous.textContent = '←';
      previous.title = 'Предыдущая глава';
      previous.disabled = bibleReaderPrevButton.disabled;
      previous.addEventListener('click', () => stepBibleReaderChapter(-1).catch(showError));
      const next = document.createElement('button');
      next.className = 'bible-reader-nav-button';
      next.type = 'button';
      next.textContent = '→';
      next.title = 'Следующая глава';
      next.disabled = bibleReaderNextButton.disabled;
      next.addEventListener('click', () => stepBibleReaderChapter(1).catch(showError));
      const meta = document.createElement('div');
      meta.className = 'bible-text-meta';
      meta.textContent = result.reference || '';
      toolbar.append(previous, next, meta);
      const versesEl = document.createElement('div');
      versesEl.className = 'bible-reader-verses';
      let firstHighlighted = null;
      for (const verse of Array.isArray(result.verses) ? result.verses : []) {
        const block = document.createElement('div');
        block.className = 'bible-reader-verse-block';
        const row = document.createElement('div');
        row.className = 'bible-reader-verse';
        row.id = 'bible-verse-' + verse.chapter + '-' + verse.verse;
        row.tabIndex = 0;
        const ref = bibleReaderVerseRef(result, verse);
        const number = document.createElement('span');
        number.className = 'bible-reader-verse-number';
        number.textContent = String(verse.verse);
        const text = document.createElement('span');
        text.className = 'bible-reader-verse-text';
        text.textContent = verse.text || '';
        const actions = document.createElement('span');
        actions.className = 'bible-reader-verse-actions';
        const notesButton = document.createElement('button');
        notesButton.className = 'bible-reader-action';
        notesButton.type = 'button';
        notesButton.textContent = '≡';
        notesButton.title = 'Показать заметки';
        notesButton.setAttribute('aria-label', 'Показать заметки для ' + (ref.normalizedRef || ref.originalText));
        notesButton.addEventListener('click', event => {
          event.stopPropagation();
          showBibleReaderVerseNotes(ref).catch(showError);
        });
        const parallelButton = document.createElement('button');
        parallelButton.className = 'bible-reader-action';
        parallelButton.type = 'button';
        parallelButton.textContent = '⇄';
        parallelButton.title = 'Показать параллельные ссылки';
        parallelButton.setAttribute('aria-label', 'Показать параллельные ссылки для ' + (ref.normalizedRef || ref.originalText));
        parallelButton.addEventListener('click', event => {
          event.stopPropagation();
          loadParallelRefs(ref, block).catch(showError);
        });
        actions.append(notesButton, parallelButton);
        row.append(number, text, actions);
        row.addEventListener('click', () => {
          versesEl.querySelectorAll('.bible-reader-verse.selected').forEach(item => item.classList.remove('selected'));
          row.classList.add('selected');
          saveBibleReaderState({ verse:Number(verse.verse) });
        });
        if (bibleVerseIsInsideReference(verse, highlightRef)) {
          row.classList.add('selected');
          if (!firstHighlighted) firstHighlighted = row;
        }
        block.append(row);
        versesEl.append(block);
      }
      article.append(crumbs, heading, toolbar, versesEl);
      content.append(article);
      if (firstHighlighted) requestAnimationFrame(() => firstHighlighted.scrollIntoView({ block:'center', behavior:'smooth' }));
    }

    async function openBibleReaderChapter(options = {}) {
      const location = currentBibleReaderLocation();
      if (!location.book || !Number.isInteger(location.chapter) || location.chapter <= 0) {
        bibleReaderStatusEl.textContent = 'Выберите модуль, книгу и главу.';
        return;
      }
      saveBibleReaderState({ verse:options.ref?.verse || options.verse });
      bibleReaderStatusEl.textContent = 'Загрузка главы...';
      const params = new URLSearchParams({
        module:location.module,
        bookIndex:String(location.bookIndex),
        chapter:String(location.chapter)
      });
      if (location.book.name) params.set('bookName', location.book.name);
      if (location.book.shortName) params.set('bookShortName', location.book.shortName);
      const result = await api('/api/bible/text?' + params.toString(), { timeoutMs:60000 });
      bibleReaderSummaryEl.textContent = 'Библия: ' + (result.bookShortName || location.book.shortName || location.book.name) + ' ' + location.chapter;
      bibleReaderStatusEl.textContent = '';
      const highlightRef = options.ref || (options.verse ? {
        module:location.module,
        bookIndex:location.bookIndex,
        bookName:location.book.name,
        bookShortName:location.book.shortName,
        chapter:location.chapter,
        verse:Number(options.verse),
        topChapter:location.chapter,
        topVerse:Number(options.verse)
      } : null);
      if (options.updateUrl !== false) updateBibleReaderUrl(location, options.replaceUrl === true, highlightRef);
      if (options.rememberHistory !== false) {
        rememberViewHistory({
          type:'bible',
          module:location.module,
          bookIndex:location.bookIndex,
          chapter:location.chapter,
          verse:highlightRef?.verse,
          topChapter:highlightRef?.topChapter,
          topVerse:highlightRef?.topVerse
        });
      } else {
        updateViewHistoryButtons();
      }
      renderBibleReaderChapter(result, highlightRef);
    }

    async function stepBibleReaderChapter(delta) {
      const book = selectedBibleReaderBook();
      if (!book) return;
      const chapters = Array.isArray(book.chapters) && book.chapters.length > 0
        ? book.chapters.map(Number)
        : Array.from({ length:Number(book.chapterCount || 0) }, (_, index) => index + 1);
      const current = Number(bibleReaderChapterEl.value);
      const currentIndex = chapters.indexOf(current);
      const nextIndex = currentIndex + delta;
      if (nextIndex < 0 || nextIndex >= chapters.length) return;
      bibleReaderChapterEl.value = String(chapters[nextIndex]);
      updateBibleReaderNavButtons();
      await openBibleReaderChapter();
    }

    async function openBibleReaderLocation(location, options = {}) {
      if (!location?.module || !location?.bookIndex || !location?.chapter) return;
      if (bibleReaderModuleEl.value !== location.module) {
        bibleReaderModuleEl.value = location.module;
        localStorage.setItem('biblenote.reader.module', location.module);
        await refreshBibleReaderBooks(Number(location.bookIndex), Number(location.chapter));
      } else if (bibleReaderBookEl.disabled || Number(bibleReaderBookEl.value) !== Number(location.bookIndex)) {
        await refreshBibleReaderBooks(Number(location.bookIndex), Number(location.chapter));
      }
      bibleReaderBookEl.value = String(location.bookIndex);
      fillBibleReaderChapters(Number(location.chapter));
      bibleReaderChapterEl.value = String(location.chapter);
      updateBibleReaderNavButtons();
      await openBibleReaderChapter({
        rememberHistory:options.rememberHistory,
        updateUrl:options.updateUrl,
        replaceUrl:options.replaceUrl,
        ref:location.verse ? {
          module:location.module,
          bookIndex:Number(location.bookIndex),
          chapter:Number(location.chapter),
          verse:Number(location.verse),
          topChapter:Number(location.topChapter || location.chapter),
          topVerse:Number(location.topVerse || location.verse)
        } : undefined
      });
    }

    async function openBibleTextInReader(ref = currentBibleTextRef) {
      if (!ref?.bookIndex || !ref?.chapter) return;
      const moduleName = ref.module || currentBibleModule();
      if (bibleReaderModuleEl.value !== moduleName) {
        bibleReaderModuleEl.value = moduleName;
        localStorage.setItem('biblenote.reader.module', moduleName);
      }
      if (bibleReaderBookEl.disabled || Number(bibleReaderBookEl.value) !== Number(ref.bookIndex)) {
        await refreshBibleReaderBooks(Number(ref.bookIndex), Number(ref.chapter));
      }
      bibleReaderBookEl.value = String(ref.bookIndex);
      fillBibleReaderChapters(Number(ref.chapter));
      bibleReaderChapterEl.value = String(ref.chapter);
      updateBibleReaderNavButtons();
      if (bibleTextDialog.open) bibleTextDialog.close();
      await openBibleReaderChapter({ ref });
    }

    bibleReaderModuleEl.addEventListener('change', () => {
      const state = bibleReaderSavedState();
      localStorage.setItem('biblenote.reader.module', bibleReaderModuleEl.value);
      refreshBibleReaderBooks(state.bookIndex, state.chapter, { open:true }).catch(showError);
    });
    bibleReaderBookEl.addEventListener('change', () => {
      fillBibleReaderChapters(undefined);
      saveBibleReaderState();
    });
    bibleReaderChapterEl.addEventListener('change', () => {
      updateBibleReaderNavButtons();
      saveBibleReaderState();
      if (Number(bibleReaderChapterEl.value) > 0) openBibleReaderChapter().catch(showError);
    });
    bibleReaderPrevButton.addEventListener('click', () => stepBibleReaderChapter(-1).catch(showError));
    bibleReaderNextButton.addEventListener('click', () => stepBibleReaderChapter(1).catch(showError));

    function row(label, level, options = {}) {
      const button = document.createElement('button');
      button.className = 'tree-row level-' + level + (options.selected ? ' selected' : '');
      button.style.setProperty('--tree-level', String(level));
      button.type = 'button';
      if (options.title) button.title = options.title;
      const chev = document.createElement('span');
      chev.className = 'chevron';
      chev.textContent = options.expandable ? (options.open ? '▾' : '▸') : '·';
      button.append(chev);
      if (level > 0) {
        const nodeIcon = document.createElement('span');
        nodeIcon.className = options.folder ? 'group-icon' : 'node-icon';
        nodeIcon.setAttribute('aria-hidden', 'true');
        button.append(nodeIcon);
      }
      if (options.status) {
        const dot = document.createElement('span');
        dot.className = 'status-dot ' + options.status;
        button.append(dot);
      }
      const text = document.createElement('span');
      text.className = 'label';
      text.textContent = label || '(без названия)';
      button.append(text);
      if (options.count != null) {
        const count = document.createElement('span');
        count.className = 'count';
        count.textContent = options.count;
        button.append(count);
      }
      if (options.onRename) {
        const rename = document.createElement('span');
        rename.className = 'tree-rename';
        rename.setAttribute('role', 'button');
        rename.setAttribute('tabindex', '0');
        rename.setAttribute('aria-label', options.renameLabel || 'Изменить отображаемое имя');
        rename.setAttribute('title', options.renameLabel || 'Изменить отображаемое имя');
        rename.textContent = '\u270E';
        const activateRename = event => {
          event.preventDefault();
          event.stopPropagation();
          options.onRename();
        };
        rename.addEventListener('click', activateRename);
        rename.addEventListener('keydown', event => {
          if (event.key === 'Enter' || event.key === ' ') activateRename(event);
        });
        button.append(rename);
      }
      if (options.onSync) {
        const sync = document.createElement('span');
        sync.className = 'tree-sync';
        sync.setAttribute('role', 'button');
        sync.setAttribute('tabindex', '0');
        sync.setAttribute('aria-label', options.syncLabel || 'Синхронизировать');
        sync.setAttribute('title', options.syncLabel || 'Синхронизировать');
        sync.setAttribute('aria-disabled', String(syncRunning));
        sync.textContent = '↻';
        const activate = event => {
          event.preventDefault();
          event.stopPropagation();
          if (!syncRunning) options.onSync();
        };
        sync.addEventListener('click', activate);
        sync.addEventListener('keydown', event => {
          if (event.key === 'Enter' || event.key === ' ') activate(event);
        });
        button.append(sync);
      }
      return button;
    }

    function compareOneNoteOrder(left, right) {
      const leftOrder = Number.isFinite(left.orderIndex) ? left.orderIndex : null;
      const rightOrder = Number.isFinite(right.orderIndex) ? right.orderIndex : null;
      if (leftOrder != null && rightOrder != null && leftOrder !== rightOrder) return leftOrder - rightOrder;
      if (leftOrder != null && rightOrder == null) return -1;
      if (leftOrder == null && rightOrder != null) return 1;
      return String(left.displayName ?? left.title ?? '').localeCompare(
        String(right.displayName ?? right.title ?? ''),
        undefined,
        { numeric:true, sensitivity:'base' }
      );
    }

    function compareOneNotePageOrder(left, right) {
      const leftOrder = Number.isFinite(left.orderIndex) ? left.orderIndex : null;
      const rightOrder = Number.isFinite(right.orderIndex) ? right.orderIndex : null;
      if (leftOrder != null && rightOrder != null && leftOrder !== rightOrder) return rightOrder - leftOrder;
      if (leftOrder != null && rightOrder == null) return -1;
      if (leftOrder == null && rightOrder != null) return 1;
      return String(left.title ?? '').localeCompare(
        String(right.title ?? ''),
        undefined,
        { numeric:true, sensitivity:'base' }
      );
    }

    async function renderTree() {
      const savedScrollTop = tree.scrollTop;
      const fragment = document.createDocumentFragment();
      for (const notebook of notebooksCache.filter(item => !hiddenNotebookIds.has(item.id))) {
        const key = 'n:' + notebook.id;
        const open = expanded.has(key);
        const button = row(notebook.displayName, 0, {
          expandable:true,
          open,
          count:notebook.pageCount,
          renameLabel:'Изменить отображаемое имя «' + notebook.displayName + '»',
          onRename:() => openNotebookNameDialog(notebook),
          syncLabel:'Синхронизировать блокнот «' + notebook.displayName + '»',
          onSync:() => startTargetedSync({ notebookIds:[notebook.id] }, 'блокнот «' + notebook.displayName + '»')
        });
        button.onclick = () => { open ? expanded.delete(key) : expanded.add(key); renderTree(); };
        fragment.append(button);
        if (open) await renderSections(notebook.id, fragment);
      }
      tree.replaceChildren(fragment);
      tree.scrollTop = savedScrollTop;
    }

    async function revealPageInTree(page) {
      const notebookId = page?.parentNotebook?.id;
      const sectionId = page?.parentSection?.id;
      if (!page?.id || !notebookId || !sectionId) {
        showActivity('Не удалось определить положение страницы в дереве.', 'error');
        return;
      }

      hideSearchHistory();
      searchHistoryIndex = -1;
      searchInput.value = '';
      activeSearchQuery = '';

      const notesPanel = document.querySelector('.notes-panel');
      if (notesPanel) notesPanel.setAttribute('open', '');

      if (hiddenNotebookIds.has(notebookId)) {
        hiddenNotebookIds.delete(notebookId);
        saveNotebookSelection();
        const checkbox = notebookListEl.querySelector('input[data-notebook-id="' + CSS.escape(String(notebookId)) + '"]');
        if (checkbox) checkbox.checked = true;
      }

      expanded.add('n:' + notebookId);
      const [sections, groups] = await Promise.all([
        api('/api/sections?notebookId=' + encodeURIComponent(notebookId)),
        api('/api/section-groups?notebookId=' + encodeURIComponent(notebookId))
      ]);
      const section = sections.find(item => item.id === sectionId);
      const groupsById = new Map(groups.map(group => [group.id, group]));
      let groupId = section?.parentGroupId || '';
      const visited = new Set();
      while (groupId && !visited.has(groupId)) {
        visited.add(groupId);
        expanded.add('g:' + groupId);
        groupId = groupsById.get(groupId)?.parentGroupId || '';
      }
      expanded.add('s:' + sectionId);

      await renderTree();
      updateTreeSelection(page.id);
      requestAnimationFrame(() => {
        updateTreeScrollbar();
        scrollTreeSelectionIntoView('smooth');
      });
    }

    async function renderSections(notebookId, target) {
      const sections = await api('/api/sections?notebookId=' + encodeURIComponent(notebookId));
      const groups = await api('/api/section-groups?notebookId=' + encodeURIComponent(notebookId));
      const sectionsByGroup = new Map();
      const groupsByParent = new Map();
      for (const section of sections) {
        const parentId = section.parentGroupId || '';
        if (!sectionsByGroup.has(parentId)) sectionsByGroup.set(parentId, []);
        sectionsByGroup.get(parentId).push(section);
      }
      for (const group of groups) {
        const parentId = group.parentGroupId || '';
        if (!groupsByParent.has(parentId)) groupsByParent.set(parentId, []);
        groupsByParent.get(parentId).push(group);
      }
      for (const items of sectionsByGroup.values()) items.sort(compareOneNoteOrder);
      for (const items of groupsByParent.values()) items.sort(compareOneNoteOrder);

      const renderSection = async (section, level) => {
        const key = 's:' + section.id;
        const open = expanded.has(key);
        const complete = section.scanComplete === 1;
        const countLabel = complete
          ? section.pageCount === 0 ? 'пустая' : section.pageCount
          : section.pageCount === 0 ? 'не загружена' : section.pageCount + ' · частично';
        const sectionStatus = complete ? section.pageCount === 0 ? 'empty' : '' : 'pending';
        const scanTitle = complete
          ? 'Секция полностью просканирована' + (section.scannedAt ? ': ' + formatDate(section.scannedAt) : '')
          : 'Метаданные страниц секции ещё не загружены полностью';
        const button = row(section.displayName, level, {
          expandable:true,
          open,
          count:countLabel,
          status:sectionStatus,
          title:(section.groupPath ? 'Группа: ' + section.groupPath + '\n' : '') + scanTitle,
          syncLabel:'Синхронизировать секцию «' + section.displayName + '»',
          onSync:() => startTargetedSync({ sectionId:section.id }, 'секцию «' + section.displayName + '»')
        });
        button.onclick = () => { open ? expanded.delete(key) : expanded.add(key); renderTree(); };
        target.append(button);
        if (open) await renderPages(section.id, target, level + 1);
      };

      const renderLevel = async (parentGroupId, level) => {
        for (const group of groupsByParent.get(parentGroupId) || []) {
          const key = 'g:' + group.id;
          const open = expanded.has(key);
          const button = row(group.displayName, level, {
            expandable:true,
            open,
            folder:true,
            count:group.sectionCount || null,
            title:'Группа разделов'
          });
          button.onclick = () => { open ? expanded.delete(key) : expanded.add(key); renderTree(); };
          target.append(button);
          if (open) await renderLevel(group.id, level + 1);
        }
        for (const section of sectionsByGroup.get(parentGroupId) || []) {
          await renderSection(section, level);
        }
      };

      await renderLevel('', 1);
    }

    async function renderPages(sectionId, target = tree, level = 2) {
      const pages = await api('/api/pages?sectionId=' + encodeURIComponent(sectionId));
      pages.sort(compareOneNotePageOrder);
      for (const page of pages) {
        const state = page.fetchError ? 'error' : page.hasContent ? 'ok' : '';
        const button = row(page.title, level, {
          status:state,
          selected:page.id === selectedPageId,
          title:page.title,
          syncLabel:'Синхронизировать страницу «' + page.title + '»',
          onSync:() => startTargetedSync({ pageId:page.id }, 'страницу «' + page.title + '»')
        });
        button.dataset.pageId = page.id;
        button.onclick = () => openPage(page.id);
        target.append(button);
      }
    }

    function groupedSearchResults(results) {
      const notebooks = new Map();
      for (const page of results) {
        const notebookKey = page.notebookId || page.notebook || '';
        if (!notebooks.has(notebookKey)) {
          notebooks.set(notebookKey, {
            name:page.notebook || '(без блокнота)',
            count:0,
            sections:new Map()
          });
        }
        const notebook = notebooks.get(notebookKey);
        notebook.count += 1;
        const sectionKey = page.section || '';
        if (!notebook.sections.has(sectionKey)) {
          notebook.sections.set(sectionKey, {
            name:page.section || '(без раздела)',
            pages:[]
          });
        }
        notebook.sections.get(sectionKey).pages.push(page);
      }
      return [...notebooks.values()];
    }

    async function renderSearch(query) {
      activeSearchQuery = query;
      tree.replaceChildren();
      const heading = document.createElement('div');
      heading.className = 'search-heading';
      heading.textContent = 'Результаты поиска';
      tree.append(heading);
      const selectedIds = selectedNotebookIds();
      if (selectedIds.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'search-heading';
        empty.textContent = 'Не выбраны блокноты';
        tree.append(empty);
        return;
      }
      const request = searchRequest(query);
      const params = new URLSearchParams({
        q:request.query,
        mode:request.mode,
        caseSensitive:String(request.caseSensitive)
      });
      addBibleDisplayParams(params);
      for (const notebookId of selectedIds) params.append('notebookId', notebookId);
      const results = await api('/api/search?' + params.toString());
      if (!results.length) {
        const empty = document.createElement('div');
        empty.className = 'search-heading';
        empty.textContent = 'Ничего не найдено';
        tree.append(empty);
      }
      for (const notebook of groupedSearchResults(results)) {
        tree.append(row(notebook.name, 0, {
          expandable:true,
          open:true,
          count:notebook.count,
          title:notebook.name
        }));
        for (const section of notebook.sections.values()) {
          tree.append(row(section.name, 1, {
            expandable:true,
            open:true,
            folder:true,
            count:section.pages.length,
            title:[notebook.name, section.name].filter(Boolean).join(' / ')
          }));
          for (const page of section.pages) {
            const button = row(page.title, 2, {
              selected:page.id === selectedPageId,
              title:[page.notebook, page.section, page.snippet].filter(Boolean).join(' / '),
              syncLabel:'Синхронизировать страницу «' + page.title + '»',
              onSync:() => startTargetedSync({ pageId:page.id }, 'страницу «' + page.title + '»')
            });
            const paragraphIndexes = Array.isArray(page.paragraphIndexes)
              ? page.paragraphIndexes.filter(Number.isInteger)
              : (Number.isInteger(page.paragraphIndex) ? [page.paragraphIndex] : []);
            button.dataset.pageId = page.id;
            button.onclick = () => openPage(page.id, {
              paragraphIndex:paragraphIndexes[0],
              paragraphIndexes,
              highlightQuery:page.bibleRef ? '' : activeSearchQuery
            });
            tree.append(button);
          }
        }
      }
      updateTreeSelection(selectedPageId);
      requestAnimationFrame(() => {
        updateTreeScrollbar();
        scrollTreeSelectionIntoView('auto');
      });
    }

    function scrollToTargetParagraph(paragraphIndex, behavior = 'smooth') {
      if (!Number.isInteger(paragraphIndex)) return;
      let attempts = 0;
      const run = () => {
        const target = document.getElementById('paragraph-' + paragraphIndex);
        if (target && target.getClientRects().length > 0) {
          target.scrollIntoView({ block:'center', behavior });
          const targetRect = target.getBoundingClientRect();
          const contentRect = content.getBoundingClientRect();
          const targetCenter = targetRect.top + targetRect.height / 2;
          const contentCenter = contentRect.top + contentRect.height / 2;
          content.scrollTop += targetCenter - contentCenter;
          return;
        }
        attempts += 1;
        if (attempts <= 10) setTimeout(run, 80);
      };
      requestAnimationFrame(run);
    }

    function scrollHtmlFrameToTargetParagraph(frame, paragraphIndex, targetIndex) {
      if (!Number.isInteger(paragraphIndex) || !frame) return;
      frame.scrollIntoView({ block:'nearest', behavior:'smooth' });
      const post = () => frame.contentWindow?.postMessage({
        type:'onenote-scroll-target-paragraph',
        paragraphIndex,
        targetIndex:Number.isInteger(targetIndex) ? targetIndex : undefined
      }, '*');
      requestAnimationFrame(() => {
        post();
        setTimeout(post, 120);
        setTimeout(post, 360);
      });
    }

    function viewHistoryKey(entry) {
      return JSON.stringify(entry);
    }

    function viewHistoryAvailability() {
      return {
        back:viewHistoryIndex > 0,
        forward:viewHistoryIndex >= 0 && viewHistoryIndex < viewHistory.length - 1
      };
    }

    function setViewHistoryButtonState(button, enabled) {
      button.disabled = !enabled;
      button.setAttribute('aria-disabled', String(!enabled));
    }

    function updateViewHistoryButtons() {
      const state = viewHistoryAvailability();
      document.querySelectorAll('.view-history-back').forEach(button => setViewHistoryButtonState(button, state.back));
      document.querySelectorAll('.view-history-forward').forEach(button => setViewHistoryButtonState(button, state.forward));
    }

    function rememberViewHistory(entry) {
      if (!entry || navigatingViewHistory) {
        updateViewHistoryButtons();
        return;
      }
      if (viewHistoryIndex >= 0 && viewHistoryKey(viewHistory[viewHistoryIndex]) === viewHistoryKey(entry)) {
        updateViewHistoryButtons();
        return;
      }
      viewHistory = viewHistory.slice(0, viewHistoryIndex + 1);
      viewHistory.push(entry);
      if (viewHistory.length > 120) viewHistory.shift();
      viewHistoryIndex = viewHistory.length - 1;
      updateViewHistoryButtons();
    }

    function createViewHistoryButtons() {
      const state = viewHistoryAvailability();
      const back = document.createElement('button');
      back.className = 'title-tool view-history-back';
      back.type = 'button';
      back.textContent = '‹';
      back.title = 'Назад';
      back.setAttribute('aria-label', 'Назад');
      setViewHistoryButtonState(back, state.back);
      back.addEventListener('click', () => navigateViewHistory(-1).catch(showError));
      const forward = document.createElement('button');
      forward.className = 'title-tool view-history-forward';
      forward.type = 'button';
      forward.textContent = '›';
      forward.title = 'Вперёд';
      forward.setAttribute('aria-label', 'Вперёд');
      setViewHistoryButtonState(forward, state.forward);
      forward.addEventListener('click', () => navigateViewHistory(1).catch(showError));
      const fragment = document.createDocumentFragment();
      fragment.append(back, forward);
      return fragment;
    }

    async function navigateViewHistory(step) {
      const nextIndex = viewHistoryIndex + step;
      if (nextIndex < 0 || nextIndex >= viewHistory.length) return;
      viewHistoryIndex = nextIndex;
      updateViewHistoryButtons();
      const entry = viewHistory[viewHistoryIndex];
      navigatingViewHistory = true;
      try {
        if (entry.type === 'page') {
          await openPage(entry.pageId, {
            paragraphIndex:entry.paragraphIndex,
            paragraphIndexes:Array.isArray(entry.paragraphIndexes) ? entry.paragraphIndexes : [],
            rememberHistory:false
          });
        } else if (entry.type === 'bible') {
          await openBibleReaderLocation(entry, { rememberHistory:false });
        }
      } finally {
        navigatingViewHistory = false;
        updateViewHistoryButtons();
      }
    }

    async function openPage(id, options = {}) {
      uiLog('ui.openPage', { id, options });
      const pageRefreshToken = ++pendingPageRefreshToken;
      selectedPageId = id;
      const optionParagraphIndexes = Array.isArray(options.paragraphIndexes)
        ? options.paragraphIndexes.filter(Number.isInteger)
        : [];
      const urlParagraphIndex = paragraphIndexFromUrl();
      const targetParagraphIndex = Number.isInteger(options.paragraphIndex)
        ? options.paragraphIndex
        : (optionParagraphIndexes[0] ?? urlParagraphIndex);
      currentTargetParagraphIndexes = optionParagraphIndexes.length > 0
        ? optionParagraphIndexes
        : (Number.isInteger(targetParagraphIndex) ? [targetParagraphIndex] : []);
      currentTargetParagraphIndex = targetParagraphIndex;
      updateTreeSelection(id);
      if (options.updateUrl !== false) updatePageUrl(id, options.replaceUrl === true, targetParagraphIndex);
      const page = await api('/api/page?id=' + encodeURIComponent(id));
      if (options.rememberHistory !== false) {
        rememberViewHistory({
          type:'page',
          pageId:id,
          paragraphIndex:Number.isInteger(targetParagraphIndex) ? targetParagraphIndex : undefined,
          paragraphIndexes:currentTargetParagraphIndexes
        });
      } else {
        updateViewHistoryButtons();
      }
      content.replaceChildren();
      content.scrollTop = 0;
      const article = document.createElement('article');
      article.className = 'page';
      const crumbs = document.createElement('div');
      crumbs.className = 'breadcrumbs';
      crumbs.textContent = pagePathLabel(page);
      const title = document.createElement('h2');
      const highlightQuery = pageHighlightQuery(options);
      const titleMatches = appendHighlightedText(title, page.title || '(без названия)', highlightQuery);
      const heading = document.createElement('div');
      heading.className = 'page-heading';
      const headingActions = document.createElement('div');
      headingActions.className = 'page-heading-actions';
      const revealPageButton = document.createElement('button');
      revealPageButton.className = 'title-tool title-reveal';
      revealPageButton.type = 'button';
      revealPageButton.textContent = '⌖';
      revealPageButton.title = 'Показать в дереве';
      revealPageButton.setAttribute('aria-label', 'Показать страницу «' + (page.title || 'без названия') + '» в дереве заметок');
      revealPageButton.addEventListener('click', () => {
        revealPageInTree(page).catch(showError);
      });
      const syncPageButton = document.createElement('button');
      syncPageButton.className = 'title-tool title-sync' + (syncRunning && activeSyncContext?.pageId === page.id ? ' syncing' : '');
      syncPageButton.type = 'button';
      syncPageButton.disabled = syncRunning;
      syncPageButton.textContent = '↻';
      syncPageButton.title = 'Синхронизировать страницу';
      syncPageButton.setAttribute('aria-label', 'Синхронизировать страницу «' + (page.title || 'без названия') + '»');
      syncPageButton.addEventListener('click', () => {
        if (!syncRunning) startTargetedSync({ pageId:page.id }, 'страницу «' + page.title + '»');
      });
      headingActions.append(createViewHistoryButtons());
      heading.append(title, headingActions);
      const meta = document.createElement('div');
      meta.className = 'meta';
      meta.append(metaItem('Изменена', formatDate(page.lastModifiedDateTime)), metaItem('Синхронизирована', formatDate(page.contentSyncedAt)));
      const actions = document.createElement('div');
      actions.className = 'page-actions';
      actions.append(revealPageButton, syncPageButton);
      meta.append(actions);
      article.append(crumbs, heading, meta);
      if (!page.hasContent && !page.fetchError) {
        const belongsToActiveSync = !activeSyncContext
          || activeSyncContext.pageId === page.id
          || activeSyncContext.sectionId === page.parentSection?.id
          || (Array.isArray(activeSyncContext.notebookIds)
            && activeSyncContext.notebookIds.includes(page.parentNotebook?.id));
        const willLoadInCurrentSync = syncRunning && belongsToActiveSync;
        const pending = document.createElement('div');
        pending.className = 'pending-box';
        pending.textContent = willLoadInCurrentSync
          ? 'Страница поставлена в начало фоновой очереди. Содержимое появится здесь после загрузки.'
          : syncRunning
            ? 'Эта страница не входит в текущую синхронизацию. После её завершения нажмите ↻ для загрузки.'
          : 'Содержимое страницы ещё не загружено. Запустите синхронизацию или нажмите ↻.';
        article.append(pending);

        if (willLoadInCurrentSync) {
          const pollPendingPage = async () => {
            if (pageRefreshToken !== pendingPageRefreshToken || selectedPageId !== id || !syncRunning) return;
            try {
              const status = await api('/api/page-status?id=' + encodeURIComponent(id), { timeoutMs:10000 });
              if (status.hasContent) {
                await openPage(id, {
                  updateUrl:false,
                  rememberHistory:false,
                  paragraphIndex:targetParagraphIndex,
                  paragraphIndexes:currentTargetParagraphIndexes
                });
                return;
              }
              if (status.fetchError) {
                await openPage(id, { updateUrl:false, rememberHistory:false });
                return;
              }
            } catch (error) {
              console.warn(error);
            }
            if (pageRefreshToken === pendingPageRefreshToken && selectedPageId === id && syncRunning) {
              setTimeout(pollPendingPage, 3000);
            }
          };
          setTimeout(pollPendingPage, 3000);
        }
      }
      if (page.fetchError) {
        const error = document.createElement('div');
        error.className = 'error-box';
        error.textContent = page.fetchError;
        article.append(error);
      }
      const biblePageParams = addBibleDisplayParams(new URLSearchParams({ id:page.id }));
      let bibleRefs = { paragraphs: [] };
      let bibleRefsError;
      try {
        bibleRefs = await api('/api/bible/page?' + biblePageParams.toString(), { timeoutMs:5000 });
      } catch (error) {
        bibleRefsError = error;
      }
      const targetBibleParagraphs = currentTargetParagraphIndexes
        .map(index => bibleRefs.paragraphs.find(paragraph => paragraph.index === index))
        .filter(Boolean);
      const targetBibleParagraph = targetBibleParagraphs[0] || null;
      let bibleRefsSection;
      if (bibleRefs.paragraphs.length > 0) {
        bibleRefsSection = renderBiblePageRefs(bibleRefs);
        article.append(bibleRefsSection);
      } else if (bibleRefsError) {
        const bibleRefsWarning = document.createElement('div');
        bibleRefsWarning.className = 'error-box';
        bibleRefsWarning.textContent = 'Библейские ссылки не загрузились. Заметка показана без них. ' + (bibleRefsError?.message || String(bibleRefsError));
        article.append(bibleRefsWarning);
      }
      const text = document.createElement('div');
      text.className = 'page-text';
      const matches = [
        ...titleMatches,
        ...appendPageTextWithBibleRefs(text, page.text || 'Текст страницы ещё не загружен.', highlightQuery, bibleRefs)
      ];
      const paragraphTargets = [...text.querySelectorAll('.bible-paragraph-target')];
      const virtualParagraphTargets = paragraphTargets.length > 0
        ? []
        : currentTargetParagraphIndexes.filter(Number.isInteger).map(paragraphIndex => {
            const target = document.createElement('span');
            target.className = 'bible-paragraph-target';
            target.dataset.paragraphIndex = String(paragraphIndex);
            return target;
          });
      const navigationTargets = paragraphTargets.length > 0
        ? paragraphTargets
        : (virtualParagraphTargets.length > 0 ? virtualParagraphTargets : matches);
      let htmlFrame;
      let showingHtml = false;
      let activeMatchIndex = 0;
      let matchCount;
      const goToMatch = (index, smooth = true) => {
        if (navigationTargets.length === 0) return;
        navigationTargets[activeMatchIndex]?.classList.remove('current-match');
        activeMatchIndex = (index + navigationTargets.length) % navigationTargets.length;
        const match = navigationTargets[activeMatchIndex];
        match.classList.add('current-match');
        matchCount.textContent = (activeMatchIndex + 1) + ' / ' + navigationTargets.length;
        const paragraphIndex = Number(match.dataset?.paragraphIndex);
        if (Number.isInteger(paragraphIndex)) {
          currentTargetParagraphIndex = paragraphIndex;
          history.replaceState(
            { pageId:id, paragraphIndex },
            '',
            pageUrl(id, paragraphIndex)
          );
          if (showingHtml) scrollHtmlFrameToTargetParagraph(htmlFrame, paragraphIndex, activeMatchIndex);
        }
        if (!showingHtml) match.scrollIntoView({ block:'center', behavior:smooth ? 'smooth' : 'auto' });
      };
      if (navigationTargets.length > 0) {
        const matchNav = document.createElement('div');
        matchNav.className = 'match-nav';
        matchNav.setAttribute('aria-label', 'Совпадения на странице');
        matchCount = document.createElement('span');
        matchCount.className = 'match-count';
        const previousMatch = document.createElement('button');
        previousMatch.className = 'match-button';
        previousMatch.type = 'button';
        previousMatch.textContent = '↑';
        previousMatch.title = 'Предыдущее совпадение';
        previousMatch.setAttribute('aria-label', 'Предыдущее совпадение');
        previousMatch.addEventListener('click', () => goToMatch(activeMatchIndex - 1));
        const nextMatch = document.createElement('button');
        nextMatch.className = 'match-button';
        nextMatch.type = 'button';
        nextMatch.textContent = '↓';
        nextMatch.title = 'Следующее совпадение';
        nextMatch.setAttribute('aria-label', 'Следующее совпадение');
        nextMatch.addEventListener('click', () => goToMatch(activeMatchIndex + 1));
        matchNav.append(matchCount, previousMatch, nextMatch);
        article.append(matchNav);
      }
      const preferHtmlView = page.hasHtml && defaultPageViewMode() === 'html';
      let openDefaultHtmlView;
      if (page.hasHtml) {
        const htmlButton = document.createElement('button');
        htmlButton.className = 'view-button';
        htmlButton.type = 'button';
        htmlButton.textContent = '<>';
        htmlButton.title = 'Показать HTML';
        htmlButton.setAttribute('aria-label', 'Показать HTML');
        const htmlZoom = defaultHtmlZoom();
        const zoomLabel = document.createElement('label');
        zoomLabel.className = 'html-zoom';
        zoomLabel.textContent = 'Масштаб';
        const zoomRange = document.createElement('input');
        zoomRange.type = 'range';
        zoomRange.min = '50';
        zoomRange.max = '200';
        zoomRange.step = '10';
        zoomRange.value = String(htmlZoom);
        const zoomValue = document.createElement('span');
        zoomValue.className = 'html-zoom-value';
        zoomValue.textContent = htmlZoom + '%';
        zoomLabel.append(zoomRange, zoomValue);
        let htmlLoadError;
        zoomRange.addEventListener('input', () => {
          zoomValue.textContent = zoomRange.value + '%';
          postHtmlFrameZoom(htmlFrame, Number(zoomRange.value));
        });
        const setHtmlView = async showHtml => {
          try {
            htmlLoadError?.remove();
            htmlLoadError = undefined;
            if (!htmlFrame) {
              htmlButton.disabled = true;
              htmlButton.textContent = '…';
              htmlButton.title = 'Загрузка HTML';
              htmlButton.setAttribute('aria-label', 'Загрузка HTML');
              const htmlParams = new URLSearchParams({ id:page.id, module:currentBibleModule() });
              const result = await loadPageHtmlWithFallback(htmlParams);
              htmlFrame = document.createElement('iframe');
              htmlFrame.className = 'html-frame';
              htmlFrame.title = 'HTML: ' + (page.title || 'страница OneNote');
              htmlFrame.setAttribute('sandbox', 'allow-scripts');
              htmlFrame.referrerPolicy = 'no-referrer';
              htmlFrame.addEventListener('load', () => postHtmlFrameZoom(htmlFrame, Number(zoomRange.value)));
              htmlFrame.srcdoc = pageHtmlFrameSrcdoc(result.html, targetBibleParagraphs);
              text.after(htmlFrame);
              if (result.degraded) {
                htmlLoadError = document.createElement('div');
                htmlLoadError.className = 'error-box';
                htmlLoadError.textContent = result.warning;
                htmlFrame.before(htmlLoadError);
              }
              htmlButton.disabled = false;
            }
            showingHtml = showHtml;
            article.classList.toggle('html-view-active', showingHtml);
            text.style.display = showingHtml ? 'none' : '';
            htmlFrame.style.display = showingHtml ? 'block' : 'none';
            if (showingHtml) postHtmlFrameZoom(htmlFrame, Number(zoomRange.value));
            if (showingHtml) scrollHtmlFrameToTargetParagraph(htmlFrame, currentTargetParagraphIndex, activeMatchIndex);
            htmlButton.textContent = showingHtml ? '¶' : '<>';
            htmlButton.title = showingHtml ? 'Показать текст' : 'Показать HTML';
            htmlButton.setAttribute('aria-label', showingHtml ? 'Показать текст' : 'Показать HTML');
          } catch (error) {
            htmlButton.disabled = false;
            htmlButton.textContent = '<>';
            htmlButton.title = 'Показать HTML';
            htmlButton.setAttribute('aria-label', 'Показать HTML');
            showingHtml = false;
            article.classList.remove('html-view-active');
            text.style.display = '';
            if (htmlFrame) htmlFrame.style.display = 'none';
            htmlLoadError = document.createElement('div');
            htmlLoadError.className = 'error-box';
            htmlLoadError.textContent = 'Не удалось загрузить HTML. Показана текстовая версия. ' + (error?.message || String(error));
            text.before(htmlLoadError);
          }
        };
        htmlButton.addEventListener('click', () => {
          setHtmlView(!showingHtml).catch(showError);
        });
        openDefaultHtmlView = () => setHtmlView(true);
        actions.append(htmlButton, zoomLabel);
      }
      if (preferHtmlView) text.style.display = 'none';
      article.append(text);
      content.append(article);
      if (openDefaultHtmlView && preferHtmlView) {
        openDefaultHtmlView().catch(error => console.warn(error));
      }
      if (navigationTargets.length > 0) requestAnimationFrame(() => goToMatch(0, false));
      if (Number.isInteger(targetParagraphIndex) && !showingHtml) {
        scrollToTargetParagraph(targetParagraphIndex);
      }
    }

    function pagePathLabel(page) {
      const parts = [];
      const add = value => {
        const text = String(value || '').trim();
        if (text && parts[parts.length - 1] !== text) parts.push(text);
      };
      add(page.parentNotebook?.displayName);
      for (const item of String(page.sectionGroupPath || '').split(/[\\/]+/)) add(item);
      add(page.parentSection?.displayName);
      return parts.join(' / ');
    }

    function renderBiblePageRefs(data) {
      const section = document.createElement('details');
      section.className = 'bible-page-refs';
      const refsCount = data.paragraphs.reduce((sum, paragraph) => sum + paragraph.references.length, 0);
      const heading = document.createElement('summary');
      heading.textContent = 'Библейские ссылки';
      heading.textContent = 'Библейские ссылки: ' + refsCount;
      section.append(heading);
      section.addEventListener('toggle', () => {
        if (section.open) loadBiblePageRefTexts(section).catch(error => console.warn(error));
      });
      for (const paragraph of data.paragraphs) {
        const block = document.createElement('div');
        block.className = 'bible-paragraph';
        const row = document.createElement('div');
        row.className = 'bible-ref-row';
        const refTexts = document.createElement('div');
        refTexts.className = 'bible-ref-texts';
        for (const ref of paragraph.references) {
          const chip = document.createElement('a');
          chip.className = 'bible-chip';
          chip.href = bibleTextUrl(ref);
          chip.textContent = ref.normalizedRef || ref.originalText;
          chip.title = 'Показать текст стиха';
          chip.addEventListener('click', event => {
            event.preventDefault();
            showBibleText(ref).catch(showError);
          });
          const parallelButton = document.createElement('button');
          parallelButton.className = 'bible-parallel-button';
          parallelButton.type = 'button';
          parallelButton.textContent = '⇄';
          parallelButton.title = 'Показать параллельные ссылки';
          parallelButton.setAttribute('aria-label', 'Показать параллельные ссылки для ' + (ref.normalizedRef || ref.originalText));
          parallelButton.addEventListener('click', () => loadParallelRefs(ref, block).catch(showError));
          row.append(chip, parallelButton);
          const refText = document.createElement('div');
          refText.className = 'bible-ref-text loading';
          refText.dataset.bibleTextUrl = bibleTextUrl(ref);
          refText.textContent = 'Загрузка текста...';
          refTexts.append(refText);
        }
        block.append(row, refTexts);
        section.append(block);
      }
      return section;
    }

    async function loadBiblePageRefTexts(section) {
      if (section.dataset.bibleTextsLoaded === 'true' || section.dataset.bibleTextsLoading === 'true') return;
      section.dataset.bibleTextsLoading = 'true';
      const targets = [...section.querySelectorAll('[data-bible-text-url]')];
      let hasErrors = false;
      let cursor = 0;
      const loadOne = async target => {
        try {
          const result = await api(target.dataset.bibleTextUrl);
          const verseText = Array.isArray(result.verses)
            ? result.verses.map(verse => verse.text).filter(Boolean).join('\n')
            : '';
          target.textContent = verseText || result.text || 'Текст не найден.';
          target.classList.remove('loading', 'error');
        } catch (error) {
          hasErrors = true;
          target.textContent = 'Не удалось загрузить текст: ' + (error?.message || String(error));
          target.classList.remove('loading');
          target.classList.add('error');
        }
      };
      const workers = Array.from({ length:Math.min(6, targets.length) }, async () => {
        while (cursor < targets.length) {
          const target = targets[cursor++];
          await loadOne(target);
        }
      });
      await Promise.all(workers);
      section.dataset.bibleTextsLoading = 'false';
      if (!hasErrors) section.dataset.bibleTextsLoaded = 'true';
    }

    function bibleTextUrl(ref) {
      const params = new URLSearchParams();
      params.set('module', ref.module || currentBibleModule());
      if (ref.bookIndex) params.set('bookIndex', String(ref.bookIndex));
      if (ref.chapter) params.set('chapter', String(ref.chapter));
      if (ref.verse) params.set('verse', String(ref.verse));
      if (ref.topChapter) params.set('topChapter', String(ref.topChapter));
      if (ref.topVerse) params.set('topVerse', String(ref.topVerse));
      if (ref.contextVerses) params.set('contextVerses', String(ref.contextVerses));
      if (ref.bookName) params.set('bookName', ref.bookName);
      if (ref.bookShortName) params.set('bookShortName', ref.bookShortName);
      if (ref.originalText) params.set('originalText', ref.originalText);
      return '/api/bible/text?' + params.toString();
    }

    function compareBibleVerse(aChapter, aVerse, bChapter, bVerse) {
      return Number(aChapter) - Number(bChapter) || Number(aVerse) - Number(bVerse);
    }

    function bibleVerseIsInsideReference(verse, ref) {
      if (!verse || !ref?.verse) return false;
      const startChapter = Number(ref.chapter);
      const startVerse = Number(ref.verse);
      const endChapter = Number(ref.topChapter || ref.chapter);
      const endVerse = Number(ref.topVerse || ref.verse);
      const chapter = Number(verse.chapter);
      const verseNumber = Number(verse.verse);
      if (![startChapter, startVerse, endChapter, endVerse, chapter, verseNumber].every(Number.isFinite)) return false;
      return compareBibleVerse(chapter, verseNumber, startChapter, startVerse) >= 0
        && compareBibleVerse(chapter, verseNumber, endChapter, endVerse) <= 0;
    }

    function bibleVerseText(result) {
      if (Array.isArray(result?.verses) && result.verses.length > 0) {
        return result.verses
          .map(verse => [verse.reference, verse.text].filter(Boolean).join(' '))
          .filter(Boolean)
          .join('\n');
      }
      return result?.text || '';
    }

    function cloneBibleTextRef(ref) {
      return {
        normalizedRef:ref.normalizedRef,
        originalText:ref.originalText,
        module:ref.module,
        bookIndex:ref.bookIndex,
        bookName:ref.bookName,
        bookShortName:ref.bookShortName,
        chapter:ref.chapter,
        verse:ref.verse,
        topChapter:ref.topChapter,
        topVerse:ref.topVerse
      };
    }

    function bibleTextHistoryKey(entry) {
      return JSON.stringify({ mode:entry.mode, ref:entry.ref });
    }

    function updateBibleTextHistoryButtons() {
      bibleTextBackButton.disabled = bibleTextHistoryIndex <= 0;
      bibleTextForwardButton.disabled = bibleTextHistoryIndex < 0 || bibleTextHistoryIndex >= bibleTextHistory.length - 1;
    }

    function rememberBibleTextHistory(ref, mode) {
      const entry = { ref:cloneBibleTextRef(ref), mode };
      if (bibleTextHistoryIndex >= 0 && bibleTextHistoryKey(bibleTextHistory[bibleTextHistoryIndex]) === bibleTextHistoryKey(entry)) {
        updateBibleTextHistoryButtons();
        return;
      }
      bibleTextHistory = bibleTextHistory.slice(0, bibleTextHistoryIndex + 1);
      bibleTextHistory.push(entry);
      if (bibleTextHistory.length > 80) bibleTextHistory.shift();
      bibleTextHistoryIndex = bibleTextHistory.length - 1;
      updateBibleTextHistoryButtons();
    }

    async function navigateBibleTextHistory(step) {
      const nextIndex = bibleTextHistoryIndex + step;
      if (nextIndex < 0 || nextIndex >= bibleTextHistory.length) return;
      bibleTextHistoryIndex = nextIndex;
      updateBibleTextHistoryButtons();
      const entry = bibleTextHistory[bibleTextHistoryIndex];
      if (entry.mode === 'context') await showBibleTextContext({ ref:entry.ref, remember:false });
      else await showBibleText(entry.ref, { remember:false });
    }

    function renderBibleContextText(result, highlightRef) {
      bibleTextContent.replaceChildren();
      const verses = Array.isArray(result.verses) ? result.verses : [];
      if (verses.length === 0) {
        bibleTextContent.textContent = result.text || 'Текст не найден.';
        return;
      }

      let firstHighlighted = null;
      for (const verse of verses) {
        const line = document.createElement('div');
        line.className = 'bible-context-line';
        line.textContent = [verse.reference, verse.text].filter(Boolean).join(' ');
        if (bibleVerseIsInsideReference(verse, highlightRef)) {
          line.classList.add('bible-context-highlight');
          if (!firstHighlighted) firstHighlighted = line;
        }
        bibleTextContent.append(line);
      }
      if (firstHighlighted) requestAnimationFrame(() => firstHighlighted.scrollIntoView({ block:'center' }));
    }

    async function showBibleText(ref, options = {}) {
      if (!ref.bookIndex || !ref.chapter) return;
      uiLog('ui.showBibleText', { ref });
      currentBibleTextRef = ref;
      if (options.remember !== false) rememberBibleTextHistory(ref, 'text');
      else updateBibleTextHistoryButtons();
      bibleTextParallelPanel.replaceChildren();
      showBibleTextContextButton.hidden = !ref.verse;
      showBibleTextContextButton.disabled = !ref.verse;
      showBibleTextParallelButton.disabled = false;
      showBibleTextInReaderButton.disabled = !ref.bookIndex || !ref.chapter;
      bibleTextTitle.textContent = ref.normalizedRef || ref.originalText || 'Библейская ссылка';
      bibleTextMeta.textContent = 'BibleNote';
      bibleTextContent.textContent = 'Загрузка...';
      if (!bibleTextDialog.open) bibleTextDialog.showModal();

      try {
        const result = await api(bibleTextUrl(ref));
        bibleTextTitle.textContent = result.reference || ref.normalizedRef || ref.originalText || 'Библейская ссылка';
        bibleTextMeta.textContent = [result.moduleName || result.module, result.bookName].filter(Boolean).join(' · ');
        bibleTextContent.textContent = bibleVerseText(result) || 'Текст не найден.';
      } catch (error) {
        bibleTextMeta.textContent = 'BibleNote';
        bibleTextContent.textContent = 'Не удалось загрузить текст: ' + (error?.message || String(error));
        showBibleTextContextButton.disabled = true;
        showBibleTextParallelButton.disabled = true;
        showBibleTextInReaderButton.disabled = true;
      }
    }

    async function showBibleTextContext(options = {}) {
      const ref = options.ref || currentBibleTextRef;
      if (!ref?.verse) return;
      currentBibleTextRef = ref;
      if (options.remember !== false) rememberBibleTextHistory(ref, 'context');
      else updateBibleTextHistoryButtons();
      showBibleTextContextButton.disabled = true;
      bibleTextContent.textContent = 'Загрузка контекста...';
      try {
        const result = await api(bibleTextUrl({ ...ref, contextVerses:10 }));
        bibleTextTitle.textContent = (result.reference || ref.normalizedRef || ref.originalText || 'Библейская ссылка') + ' · контекст';
        bibleTextMeta.textContent = [result.moduleName || result.module, result.bookName, '10 стихов до и после'].filter(Boolean).join(' · ');
        bibleTextContent.textContent = result.text || 'Текст не найден.';
        renderBibleContextText(result, ref);
      } catch (error) {
        bibleTextContent.textContent = 'Не удалось загрузить контекст: ' + (error?.message || String(error));
        showBibleTextContextButton.disabled = false;
      }
    }

    async function openExternalBibleRefFromUrl() {
      const rawRef = new URLSearchParams(location.search).get('openBibleRef');
      if (!rawRef) return;
      await openBibleRef(rawRef);
      history.replaceState(null, '', selectedPageId ? pageUrl(selectedPageId, currentTargetParagraphIndex) : '/');
    }

    function appendPageTextWithBibleRefs(container, pageText, query, bibleRefs) {
      const ranges = bibleTextRanges(pageText, bibleRefs);
      const targetParagraphIndexSet = new Set(currentTargetParagraphIndexes.filter(Number.isInteger));
      const targetParagraphs = bibleParagraphRanges(pageText, bibleRefs)
        .filter(item => targetParagraphIndexSet.has(item.index));
      if (ranges.length === 0 && targetParagraphs.length === 0) return appendHighlightedText(container, pageText, query);

      const matches = [];
      const points = new Set([0, pageText.length]);
      for (const range of ranges) {
        points.add(range.start);
        points.add(range.end);
      }
      const targetByStart = new Map();
      const targetByEnd = new Map();
      for (const targetParagraph of targetParagraphs) {
        points.add(targetParagraph.start);
        points.add(targetParagraph.end);
        targetByStart.set(targetParagraph.start, targetParagraph);
        targetByEnd.set(targetParagraph.end, targetParagraph);
      }

      const sortedPoints = [...points].sort((a, b) => a - b);
      let paragraphWrapper = null;
      for (let pointIndex = 0; pointIndex < sortedPoints.length - 1; pointIndex++) {
        const start = sortedPoints[pointIndex];
        const end = sortedPoints[pointIndex + 1];
        if (start >= end) continue;

        const startingTargetParagraph = targetByStart.get(start);
        if (startingTargetParagraph) {
          paragraphWrapper = document.createElement('span');
          paragraphWrapper.id = 'paragraph-' + startingTargetParagraph.index;
          paragraphWrapper.className = 'bible-paragraph-target';
          paragraphWrapper.dataset.paragraphIndex = String(startingTargetParagraph.index);
        }

        const target = paragraphWrapper || container;
        const range = ranges.find(item => start >= item.start && end <= item.end);
        if (range) {
          const link = document.createElement('a');
          link.className = 'bible-inline-ref';
          link.href = bibleTextUrl(range.ref);
          link.title = 'Показать текст стиха';
          link.addEventListener('click', event => {
            event.preventDefault();
            showBibleText(range.ref).catch(showError);
          });
          matches.push(...appendHighlightedText(link, pageText.slice(start, end), query));
          target.append(link);
        } else {
          const span = document.createElement('span');
          matches.push(...appendHighlightedText(span, pageText.slice(start, end), query));
          target.append(span);
        }

        if (targetByEnd.has(end) && paragraphWrapper) {
          container.append(paragraphWrapper);
          paragraphWrapper = null;
        }
      }

      return matches;
    }

    function bibleParagraphRanges(pageText, bibleRefs) {
      const ranges = [];
      let paragraphSearchFrom = 0;
      for (const paragraph of bibleRefs.paragraphs || []) {
        const paragraphText = paragraph.text || '';
        if (!paragraphText) continue;

        let paragraphStart = pageText.indexOf(paragraphText, paragraphSearchFrom);
        if (paragraphStart < 0) paragraphStart = pageText.indexOf(paragraphText);
        if (paragraphStart < 0) continue;
        paragraphSearchFrom = paragraphStart + paragraphText.length;
        ranges.push({
          index:paragraph.index,
          start:paragraphStart,
          end:paragraphStart + paragraphText.length
        });
      }
      return ranges;
    }

    function bibleTextRanges(pageText, bibleRefs) {
      const ranges = [];
      let paragraphSearchFrom = 0;
      for (const paragraph of bibleRefs.paragraphs || []) {
        const paragraphText = paragraph.text || '';
        if (!paragraphText) continue;

        let paragraphStart = pageText.indexOf(paragraphText, paragraphSearchFrom);
        if (paragraphStart < 0) paragraphStart = pageText.indexOf(paragraphText);
        if (paragraphStart < 0) continue;
        paragraphSearchFrom = paragraphStart + paragraphText.length;

        for (const ref of paragraph.references || []) {
          if (!Number.isInteger(ref.startIndex) || !Number.isInteger(ref.endIndex)) continue;
          const start = paragraphStart + ref.startIndex;
          const end = paragraphStart + ref.endIndex + 1;
          if (start < paragraphStart || end > paragraphStart + paragraphText.length || start >= end) continue;
          ranges.push({ start, end, ref });
        }
      }

      ranges.sort((a, b) => a.start - b.start || b.end - a.end);
      const result = [];
      let lastEnd = 0;
      for (const range of ranges) {
        if (range.start < lastEnd) continue;
        result.push(range);
        lastEnd = range.end;
      }
      return result;
    }

    function parallelParams(ref) {
      const params = addBibleDisplayParams(new URLSearchParams({
        bookIndex:String(ref.bookIndex),
        chapter:String(ref.chapter),
        limit:'30'
      }));
      if (ref.verse) params.set('verse', String(ref.verse));
      return params;
    }

    function parallelNotesParams(targetRef, relatedRef) {
      const params = addBibleDisplayParams(new URLSearchParams({
        bookIndex:String(targetRef.bookIndex),
        chapter:String(targetRef.chapter),
        relatedBookIndex:String(relatedRef.bookIndex),
        relatedChapter:String(relatedRef.chapter),
        limit:'50'
      }));
      if (targetRef.verse) params.set('verse', String(targetRef.verse));
      if (relatedRef.verse) params.set('relatedVerse', String(relatedRef.verse));
      return params;
    }

    function parallelRefFromRow(row) {
      return {
        normalizedRef:row.normalizedRef,
        originalText:row.sampleOriginalText || row.normalizedRef,
        bookIndex:row.bookIndex,
        bookName:row.bookName,
        chapter:row.chapter,
        verse:row.verse,
        topChapter:row.topChapter,
        topVerse:row.topVerse
      };
    }

    function compactText(value, limit = 260) {
      const text = String(value || '').replace(/\s+/g, ' ').trim();
      return text.length > limit ? text.slice(0, limit - 1) + '…' : text;
    }

    async function loadParallelNotes(targetRef, relatedRef, host) {
      host.replaceChildren();
      const loading = document.createElement('div');
      loading.className = 'bible-parallel-meta';
      loading.textContent = 'Загрузка заметок...';
      host.append(loading);
      const result = await api('/api/bible/parallel/notes?' + parallelNotesParams(targetRef, relatedRef).toString());
      host.replaceChildren();
      if (result.rows.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'bible-parallel-meta';
        empty.textContent = 'Совместных упоминаний не найдено.';
        host.append(empty);
        return;
      }

      const pages = new Map();
      for (const row of result.rows) {
        const page = pages.get(row.pageId) || {
          pageId:row.pageId,
          pageTitle:row.pageTitle,
          notebook:row.notebook,
          section:row.section,
          maxWeight:0,
          rows:[]
        };
        page.maxWeight = Math.max(page.maxWeight, Number(row.relationWeight || 0));
        page.rows.push(row);
        pages.set(row.pageId, page);
      }

      for (const page of pages.values()) {
        const card = document.createElement('div');
        card.className = 'bible-parallel-note-card';
        const title = document.createElement('div');
        title.className = 'bible-parallel-note-title';
        title.textContent = page.pageTitle || '(без названия)';
        const meta = document.createElement('div');
        meta.className = 'bible-parallel-note-meta';
        const fragmentsLabel = page.rows.length === 1 ? '1 фрагмент' : page.rows.length + ' фрагмента';
        meta.textContent = [page.notebook, page.section, 'макс. индекс ' + page.maxWeight.toFixed(2), fragmentsLabel].filter(Boolean).join(' · ');
        card.append(title, meta);

        for (const note of page.rows) {
          const button = document.createElement('button');
          button.className = 'bible-parallel-fragment';
          button.type = 'button';
          const paragraphIndex = Number.isInteger(note.relatedParagraphIndex) ? note.relatedParagraphIndex : note.targetParagraphIndex;
          button.addEventListener('click', () => {
            if (bibleTextDialog.open) bibleTextDialog.close();
            openPage(note.pageId, { paragraphIndex }).catch(showError);
          });
          const fragmentMeta = document.createElement('div');
          fragmentMeta.className = 'bible-parallel-note-meta';
          fragmentMeta.textContent = 'абзац ' + (paragraphIndex + 1) + ' · индекс ' + Number(note.relationWeight || 0).toFixed(2);
          const text = document.createElement('div');
          text.className = 'bible-parallel-note-text';
          const target = compactText(note.targetParagraphText);
          const related = note.relatedParagraphText === note.targetParagraphText ? '' : compactText(note.relatedParagraphText);
          text.textContent = related ? target + '\n' + related : target;
          button.append(fragmentMeta, text);
          card.append(button);
        }
        host.append(card);
      }
    }

    async function loadParallelVerseText(ref, host) {
      host.textContent = 'Загрузка текста...';
      host.classList.add('loading');
      host.classList.remove('error');
      try {
        const result = await api(bibleTextUrl(ref));
        host.textContent = bibleVerseText(result) || 'Текст не найден.';
        host.classList.remove('loading');
      } catch (error) {
        host.textContent = 'Не удалось загрузить текст: ' + (error?.message || String(error));
        host.classList.remove('loading');
        host.classList.add('error');
      }
    }

    async function loadParallelRefs(ref, block) {
      if (!ref.bookIndex || !ref.chapter) return;
      const parallelKey = parallelParams(ref).toString();
      const existing = block.querySelector('.bible-parallel');
      if (existing?.dataset.parallelKey === parallelKey) {
        existing.remove();
        return;
      }
      block.querySelectorAll('.bible-parallel').forEach(item => item.remove());
      const panel = document.createElement('div');
      panel.className = 'bible-parallel';
      panel.dataset.parallelKey = parallelKey;
      const title = document.createElement('div');
      title.className = 'bible-parallel-title';
      title.textContent = 'Параллельные ссылки для ' + (ref.normalizedRef || ref.originalText);
      panel.append(title);
      const loading = document.createElement('div');
      loading.className = 'bible-parallel-meta';
      loading.textContent = 'Загрузка...';
      panel.append(loading);
      block.append(panel);

      const result = await api('/api/bible/parallel?' + parallelKey);
      loading.remove();
      if (result.rows.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'bible-parallel-meta';
        empty.textContent = 'Параллельных ссылок пока нет.';
        panel.append(empty);
        return;
      }

      const list = document.createElement('div');
      list.className = 'bible-parallel-list';
      for (const item of result.rows) {
        const relatedRef = parallelRefFromRow(item);
        const row = document.createElement('div');
        row.className = 'bible-parallel-row';
        const head = document.createElement('div');
        head.className = 'bible-parallel-head';
        const refButton = document.createElement('button');
        refButton.className = 'bible-parallel-ref';
        refButton.type = 'button';
        refButton.textContent = item.normalizedRef || item.sampleOriginalText || 'Ссылка';
        refButton.title = 'Показать текст стиха';
        refButton.addEventListener('click', () => showBibleText(relatedRef).catch(showError));
        const notesButton = document.createElement('button');
        notesButton.className = 'bible-parallel-button';
        notesButton.type = 'button';
        notesButton.textContent = 'Заметки';
        const meta = document.createElement('span');
        meta.className = 'bible-parallel-meta';
        meta.textContent = 'индекс ' + Number(item.relationWeight || 0).toFixed(2)
          + ' · связей ' + (item.relations || 0)
          + ' · заметок ' + (item.pages || 0);
        const verseText = document.createElement('div');
        verseText.className = 'bible-parallel-note-text bible-parallel-verse-text loading';
        const notes = document.createElement('div');
        notes.className = 'bible-parallel-notes';
        notesButton.addEventListener('click', () => {
          if (notes.childNodes.length > 0) {
            notes.replaceChildren();
            return;
          }
          loadParallelNotes(ref, relatedRef, notes).catch(showError);
        });
        head.append(refButton, meta, notesButton);
        row.append(head, verseText, notes);
        list.append(row);
        loadParallelVerseText(relatedRef, verseText).catch(showError);
      }
      panel.append(list);
    }

    function metaItem(label, value) {
      const span = document.createElement('span');
      span.textContent = label + ': ' + (value || '—');
      return span;
    }

    function formatDate(value) {
      if (!value) return null;
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? value : date.toLocaleString('ru-RU');
    }

    function pluralRu(value, one, few, many) {
      const mod100 = Math.abs(value) % 100;
      const mod10 = mod100 % 10;
      if (mod100 >= 11 && mod100 <= 19) return many;
      if (mod10 === 1) return one;
      if (mod10 >= 2 && mod10 <= 4) return few;
      return many;
    }

    function cacheStatusText(status) {
      return status.pages + ' страниц · ' + status.pagesWithContent + ' с текстом · ' + (status.bibleReferences || 0) + ' ссылок · ' + status.pagesWithErrors + ' ' + pluralRu(status.pagesWithErrors, 'ошибка', 'ошибки', 'ошибок');
    }

    function appendHighlightedText(container, text, query) {
      if (!query) {
        container.textContent = text;
        return [];
      }
      const request = searchRequest(query);
      let regex;
      try {
        if (request.mode === 'regex') {
          regex = new RegExp(request.query, 'gu' + (request.caseSensitive ? '' : 'i'));
        } else if (request.mode === 'phrase') {
          const escaped = request.query.replace(/[.*+?^\x24{}()|[\]\\]/g, '\\$&');
          regex = new RegExp(escaped, 'gu' + (request.caseSensitive ? '' : 'i'));
        } else {
          const terms = request.query.match(/[\p{L}\p{N}_-]+/gu) || [];
          const unique = [...new Set(terms.map(term => request.caseSensitive ? term : term.toLocaleLowerCase()))].sort((a, b) => b.length - a.length);
          if (!unique.length) {
            container.textContent = text;
            return [];
          }
          const escaped = unique.map(term => term.replace(/[.*+?^\x24{}()|[\]\\]/g, '\\$&'));
          regex = new RegExp(escaped.join('|'), 'gu' + (request.caseSensitive ? '' : 'i'));
        }
      } catch {
        container.textContent = text;
        return [];
      }

      let cursor = 0;
      const marks = [];
      for (const match of text.matchAll(regex)) {
        const index = match.index ?? 0;
        if (index > cursor) container.append(document.createTextNode(text.slice(cursor, index)));
        if (match[0].length > 0) {
          const mark = document.createElement('mark');
          mark.textContent = match[0];
          container.append(mark);
          marks.push(mark);
          cursor = index + match[0].length;
        }
      }
      if (cursor < text.length) container.append(document.createTextNode(text.slice(cursor)));
      return marks;
    }

    searchInput.addEventListener('input', () => {
      searchHistoryIndex = -1;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        rerunSearch();
        scheduleSearchHistoryCommit();
      }, 220);
    });

    searchInput.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        rememberSearch(searchInput.value);
        hideSearchHistory();
        rerunSearch();
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        stepSearchHistory(1);
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        if (searchHistoryIndex === -1) showSearchHistory(); else stepSearchHistory(-1);
      } else if (event.key === 'Escape' && !searchHistoryMenu.classList.contains('hidden')) {
        event.preventDefault();
        hideSearchHistory();
      }
    });

    document.addEventListener('pointerdown', event => {
      if (searchHistoryMenu.classList.contains('hidden')) return;
      if (event.target === searchInput || event.target === searchHistoryButton || searchHistoryMenu.contains(event.target)) return;
      hideSearchHistory();
    });

    window.addEventListener('popstate', () => {
      const pageId = pageIdFromUrl();
      if (pageId) {
        openPage(pageId, { updateUrl:false }).catch(showError);
        return;
      }
      const bibleLocation = bibleLocationFromUrl();
      if (bibleLocation) {
        openBibleReaderLocation(bibleLocation, { updateUrl:false, rememberHistory:false }).catch(showError);
        return;
      }
      selectedPageId = null;
      renderEmptyPage();
      if (activeSearchQuery) renderSearch(activeSearchQuery).catch(showError); else renderTree().catch(showError);
    });

    function showActivity(message, type = 'running', sticky = false) {
      clearTimeout(activityToastTimer);
      activityToastEl.textContent = message;
      activityToastEl.className = 'activity-toast show' + (type === 'running' ? '' : ' ' + type);
      if (!sticky) {
        activityToastTimer = setTimeout(() => {
          activityToastEl.className = 'activity-toast';
        }, type === 'error' ? 9000 : 5000);
      }
    }

    function updateSyncControls(running) {
      syncRunning = running;
      syncButton.disabled = running || selectedNotebookIds().length === 0;
      updateSyncSettingsPresentation();
      document.querySelectorAll('.tree-sync').forEach(control => control.setAttribute('aria-disabled', String(running)));
      document.querySelectorAll('.title-sync').forEach(control => {
        control.disabled = running;
        control.classList.toggle('syncing', running && activeSyncContext?.pageId === selectedPageId);
      });
    }

    function currentSyncSettings() {
      const maxPagesValue = document.getElementById('syncMaxPages').value;
      const refreshValue = document.getElementById('syncRefreshHours').value;
      const metadataOnly = document.getElementById('syncMetadataOnly').checked;
      const replaceAll = !metadataOnly && document.getElementById('syncReplaceAll').checked;
      return {
        maxPages: !replaceAll && maxPagesValue ? Number(maxPagesValue) : undefined,
        concurrency: Number(document.getElementById('syncConcurrency').value),
        refreshOlderThanHours: !replaceAll && refreshValue ? Number(refreshValue) : undefined,
        metadataOnly,
        replaceAll,
        forceContent: !replaceAll && document.getElementById('syncForceContent').checked,
        includeHtml: document.getElementById('syncIncludeHtml').checked,
        parseBibleRefs: document.getElementById('syncParseBibleRefs').checked,
        forceBibleParse: document.getElementById('syncForceBibleParse').checked,
        bibleModule: currentBibleModule()
      };
    }

    function updateSyncSettingsPresentation() {
      const settings = currentSyncSettings();
      for (const id of ['syncConcurrency', 'syncMetadataOnly']) {
        document.getElementById(id).disabled = syncRunning;
      }
      document.getElementById('syncMaxPages').disabled = syncRunning || settings.replaceAll;
      document.getElementById('syncRefreshHours').disabled = syncRunning || settings.replaceAll;
      document.getElementById('syncReplaceAll').disabled = syncRunning || settings.metadataOnly;
      document.getElementById('syncForceContent').disabled = syncRunning || settings.metadataOnly || settings.replaceAll;
      document.getElementById('syncIncludeHtml').disabled = syncRunning || settings.metadataOnly;
      document.getElementById('syncParseBibleRefs').disabled = syncRunning || settings.metadataOnly;
      document.getElementById('syncForceBibleParse').disabled = syncRunning || settings.metadataOnly || !settings.parseBibleRefs;
      syncSettingsSummaryEl.textContent = settings.metadataOnly
        ? 'Параметры синхронизации · только метаданные'
        : settings.replaceAll
          ? 'Параметры синхронизации · полная перезапись'
        : settings.parseBibleRefs
          ? 'Параметры синхронизации'
          : settings.includeHtml
            ? 'Параметры синхронизации · с HTML'
            : 'Параметры синхронизации';
      syncSettingsNoteEl.textContent = settings.metadataOnly
        ? 'Контент и HTML не скачиваются. Настройка применяется ко всем вариантам синхронизации.'
        : settings.replaceAll
          ? 'Перед полной синхронизацией все таблицы локального кэша будут удалены и созданы заново. Точечные кнопки ↻ эту настройку не используют.'
        : settings.includeHtml
          ? 'HTML будет сохранён при полной и точечной синхронизации. На странице появится кнопка «Показать HTML».'
          : 'Применяются к полной синхронизации и ко всем кнопкам ↻ в дереве.';
    }

    function saveSyncSettings() {
      localStorage.setItem('onenote.syncSettings', JSON.stringify(currentSyncSettings()));
      updateSyncSettingsPresentation();
    }

    function loadSyncSettings() {
      try {
        const rawSettings = localStorage.getItem('onenote.syncSettings');
        const settings = JSON.parse(rawSettings || '{}');
        if (!localStorage.getItem('onenote.syncSettings.defaultBibleParse')) {
          settings.includeHtml = true;
          settings.parseBibleRefs = true;
          settings.forceBibleParse = false;
          localStorage.setItem('onenote.syncSettings.defaultBibleParse', 'true');
        }
        if (!localStorage.getItem('onenote.syncSettings.incrementalBibleParseDefault')) {
          settings.forceBibleParse = false;
          localStorage.setItem('onenote.syncSettings.incrementalBibleParseDefault', 'true');
        }
        if (!localStorage.getItem('onenote.syncSettings.defaultConcurrency1')) {
          settings.concurrency = 1;
          localStorage.setItem('onenote.syncSettings.defaultConcurrency1', 'true');
        }
        if (Number.isInteger(settings.maxPages) && settings.maxPages > 0) document.getElementById('syncMaxPages').value = String(settings.maxPages);
        if ([1, 2, 3].includes(settings.concurrency)) document.getElementById('syncConcurrency').value = String(settings.concurrency);
        if (Number.isInteger(settings.refreshOlderThanHours) && settings.refreshOlderThanHours >= 0) document.getElementById('syncRefreshHours').value = String(settings.refreshOlderThanHours);
        document.getElementById('syncMetadataOnly').checked = settings.metadataOnly === true;
        document.getElementById('syncReplaceAll').checked = settings.replaceAll === true;
        document.getElementById('syncForceContent').checked = settings.forceContent === true;
        document.getElementById('syncIncludeHtml').checked = settings.includeHtml !== false;
        document.getElementById('syncParseBibleRefs').checked = settings.parseBibleRefs !== false;
        document.getElementById('syncForceBibleParse').checked = settings.forceBibleParse === true;
        if (typeof settings.bibleModule === 'string' && settings.bibleModule.trim()) bibleModuleNameInput.value = settings.bibleModule.trim();
      } catch {
        localStorage.removeItem('onenote.syncSettings');
      }
      updateSyncSettingsPresentation();
    }

    for (const id of ['syncMaxPages', 'syncConcurrency', 'syncRefreshHours', 'syncMetadataOnly', 'syncReplaceAll', 'syncForceContent', 'syncIncludeHtml', 'syncParseBibleRefs', 'syncForceBibleParse']) {
      document.getElementById(id).addEventListener('change', saveSyncSettings);
    }

    function errorMessage(error) {
      return error?.message || String(error);
    }

    function handleSyncStartError(error) {
      const message = errorMessage(error);
      updateSyncControls(false);
      activeSyncContext = null;
      syncStateEl.textContent = 'Ошибка синхронизации: ' + message;
      showActivity('Ошибка синхронизации: ' + message, 'error');
    }

    function handleSyncPollError(error) {
      const message = errorMessage(error);
      syncStateEl.textContent = 'Ожидание ответа синхронизации: ' + message;
      showActivity('Ожидание ответа синхронизации: ' + message, 'running', true);
      if (syncRunning || activeSyncContext) {
        clearTimeout(syncPollTimer);
        syncPollTimer = setTimeout(() => refreshSyncState().catch(handleSyncPollError), 3000);
      }
    }

    async function submitSync(payload, label, context = {}) {
      if (syncRunning) return;
      uiLog('ui.submitSync', { label, context, payload });
      activeSyncContext = { ...context, label };
      updateSyncControls(true);
      syncStateEl.textContent = 'Запуск: ' + label;
      showActivity('Синхронизация: ' + label + '…', 'running', true);
      let started = false;
      try {
        await api('/api/sync', {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify(payload),
          timeoutMs:180000
        });
        started = true;
        await refreshSyncState();
      } catch (error) {
        if (started) handleSyncPollError(error);
        else handleSyncStartError(error);
      }
    }

    function startTargetedSync(scope, label) {
      const payload = { ...currentSyncSettings(), ...scope };
      delete payload.replaceAll;
      if (scope.pageId) {
        delete payload.maxPages;
        if (!payload.metadataOnly) payload.forceContent = true;
      }
      return submitSync(payload, label, scope);
    }

    syncButton.addEventListener('click', async () => {
      const notebookIds = selectedNotebookIds();
      if (notebookIds.length === 0) {
        syncStateEl.textContent = 'Выберите хотя бы один блокнот';
        return;
      }
      const settings = currentSyncSettings();
      if (settings.replaceAll && !window.confirm(
        'Все таблицы локального кэша, история синхронизации, результаты разбора и локальные названия блокнотов будут удалены. Продолжить?'
      )) return;
      if (settings.replaceAll) {
        document.getElementById('syncReplaceAll').checked = false;
        saveSyncSettings();
      }
      await submitSync({ ...settings, notebookIds }, 'выбранные блокноты', { notebookIds });
    });

    async function refreshSyncState() {
      clearTimeout(syncPollTimer);
      const state = await api('/api/sync', { timeoutMs:120000 });
      const running = state.status === 'running';
      updateSyncControls(running);
      syncButton.textContent = running ? 'Синхронизация выполняется…' : 'Запустить синхронизацию';
      if (running) {
        const progress = state.progress || {};
        const parts = [progress.message || progress.phase || 'Подготовка'];
        if (progress.sectionGroups != null) parts.push('групп разделов: ' + progress.sectionGroups);
        if (progress.sections != null) parts.push('разделов: ' + (progress.sectionTotal ? progress.sections + '/' + progress.sectionTotal : progress.sections));
        if (progress.pages != null) parts.push('страниц: ' + progress.pages);
        if (progress.contentDone != null && progress.contentTotal != null) parts.push('контент: ' + progress.contentDone + '/' + progress.contentTotal);
        if (progress.bibleParseDone != null && progress.bibleParseTotal != null) parts.push('BibleNote: ' + progress.bibleParseDone + '/' + progress.bibleParseTotal);
        if (progress.bibleRefsRecognized != null) parts.push('ссылок: ' + progress.bibleRefsRecognized);
        if (progress.errors) parts.push('ошибок: ' + progress.errors);
        syncStateEl.textContent = parts.join(' · ');
        showActivity(parts.join(' · '), 'running', true);
        if (Date.now() - lastSyncLogRefreshAt > 15000) {
          lastSyncLogRefreshAt = Date.now();
          loadDownloadLog(false).catch(error => console.warn(error));
        }
        syncPollTimer = setTimeout(() => refreshSyncState().catch(handleSyncPollError), 3000);
      } else if (state.status === 'success') {
        const result = state.result;
        const completedContext = activeSyncContext;
        const successMessage = 'Готово: групп разделов ' + (result.sectionGroups || 0) + ', разделов ' + result.sections + ', ' + result.pages + ' ' + pluralRu(result.pages, 'страница', 'страницы', 'страниц') + ', загружено ' + result.contentDownloaded + ', пропущено ' + result.contentSkipped + ', распознано ссылок ' + (result.bibleRefsRecognized || 0) + ', ошибок ' + result.contentErrors;
        syncStateEl.textContent = successMessage;
        showActivity(successMessage, 'success');
        const status = await api('/api/status');
        statusEl.textContent = cacheStatusText(status);
        if (completedContext?.pageId && selectedPageId === completedContext.pageId) {
          loadDownloadLog(false).catch(error => console.warn(error));
          await openPage(completedContext.pageId, { updateUrl:false, paragraphIndex:currentTargetParagraphIndex });
        } else if (activeSearchQuery) {
          await loadNotebookSelector();
          await loadDownloadLog(true);
          await renderSearch(activeSearchQuery);
        } else {
          await loadNotebookSelector();
          await loadDownloadLog(true);
          await renderTree();
        }
        activeSyncContext = null;
        updateSyncControls(false);
      } else if (state.status === 'failed') {
        syncStateEl.textContent = 'Ошибка: ' + state.error;
        showActivity('Ошибка синхронизации: ' + state.error, 'error');
        activeSyncContext = null;
        updateSyncControls(false);
      } else {
        syncStateEl.textContent = 'Синхронизация не запущена';
      }
    }

    function showError(error) {
      content.innerHTML = '';
      const box = document.createElement('div');
      box.className = 'error-box';
      box.textContent = error.message;
      content.append(box);
    }

    function showStartupWait() {
      content.innerHTML = '';
      const box = document.createElement('div');
      box.className = 'empty-state';
      box.textContent = 'Локальный кэш открывается... Обычно это занимает несколько секунд.';
      content.append(box);
    }

    async function initializeApp() {
      try {
        await refreshRuntimeSettings().catch(error => console.warn(error));
        const [status] = await Promise.all([api('/api/status'), loadNotebookSelector()]);
        refreshSyncState().catch(handleSyncPollError);
        const initialBibleLocation = bibleLocationFromUrl();
        const loadBibleModules = refreshBibleReaderModules().catch(error => {
          console.warn(error);
          bibleReaderStatusEl.textContent = error?.message || String(error);
        });
        if (initialBibleLocation) await loadBibleModules;
        statusEl.textContent = cacheStatusText(status);
        const initialPageId = pageIdFromUrl();
        if (initialPageId) {
          await openPage(initialPageId, { replaceUrl:true });
          if (activeSearchQuery) await renderSearch(activeSearchQuery);
          else await renderTree();
        } else if (initialBibleLocation) {
          await openBibleReaderLocation(initialBibleLocation, { replaceUrl:true, rememberHistory:false });
          await renderTree();
        } else {
          renderEmptyPage();
          await renderTree();
        }
        loadDownloadLog(true).catch(error => console.warn(error));
        await openExternalBibleRefFromUrl();
        openSetupWizardIfNeeded().catch(error => console.warn(error));
      } catch (error) {
        if (error && error.status === 503) {
          showStartupWait();
          setTimeout(() => initializeApp().catch(showError), 500);
          return;
        }
        showError(error);
      }
    }

    loadSyncSettings();
    initializeApp().catch(showError);
  </script>
</body>
</html>`;

function json(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  response.end(JSON.stringify(value));
}

function page(response: ServerResponse): void {
  response.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Security-Policy': "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'",
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY'
  });
  response.end(pageHtml);
}

function required(url: URL, name: string): string {
  const value = url.searchParams.get(name);
  if (!value) throw new Error(`Missing query parameter: ${name}`);
  return value;
}

function includeAuxiliaryBibleRefs(url: URL): boolean {
  return url.searchParams.get('includeAux') === '1' || url.searchParams.get('includeAux') === 'true';
}

async function fetchJson(url: string, init?: RequestInit): Promise<any> {
  const response = await fetch(url, init);
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(body?.error || body?.title || text || `HTTP ${response.status}`);
  }
  return body;
}

async function bibleNoteHealth(): Promise<Record<string, unknown>> {
  const bibleConfig = bibleParseConfigFromEnv();
  return fetchJson(`${bibleConfig.apiUrl.replace(/\/+$/, '')}/api/VerseParsing/Health`);
}

async function bibleNoteModules(): Promise<Array<Record<string, unknown>>> {
  const bibleConfig = bibleParseConfigFromEnv();
  return fetchJson(`${bibleConfig.apiUrl.replace(/\/+$/, '')}/api/VerseParsing/Modules`) as Promise<Array<Record<string, unknown>>>;
}

async function bibleNoteBooks(module: string): Promise<Array<Record<string, unknown>>> {
  const bibleConfig = bibleParseConfigFromEnv();
  const params = new URLSearchParams({ module });
  return fetchJson(`${bibleConfig.apiUrl.replace(/\/+$/, '')}/api/VerseParsing/Books?${params.toString()}`) as Promise<Array<Record<string, unknown>>>;
}

let localBibleNoteProcess: ChildProcess | undefined;
let localBibleNoteEnsurePromise: Promise<void> | undefined;
let bibleNoteHealthyUntil = 0;

function electronControlUrl(pathname: string): string | undefined {
  const base = process.env.ONENOTE_ELECTRON_CONTROL_URL;
  if (!base) return undefined;
  return `${base.replace(/\/+$/, '')}${pathname}`;
}

async function electronControl(pathname: string, method = 'GET'): Promise<Record<string, unknown>> {
  const target = electronControlUrl(pathname);
  if (!target) return { available:false };
  return fetchJson(target, { method }) as Promise<Record<string, unknown>>;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function waitForBibleNoteHealth(timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      await bibleNoteHealth();
      return;
    } catch (error) {
      lastError = error;
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function startLocalBibleNoteProcess(): void {
  const exe = process.env.BIBLENOTE_EXE_PATH;
  if (!exe) throw new Error('BIBLENOTE_EXE_PATH is not set.');
  if (!fs.existsSync(exe)) throw new Error(`BibleNote executable was not found: ${exe}`);
  if (localBibleNoteProcess && !localBibleNoteProcess.killed) return;

  const bibleConfig = bibleParseConfigFromEnv();
  logStartupTiming(`starting local BibleNote API exe=${exe}`);
  localBibleNoteProcess = spawn(exe, ['--urls', bibleConfig.apiUrl], {
    cwd:path.dirname(exe),
    env:{
      ...process.env,
      ASPNETCORE_ENVIRONMENT:process.env.ASPNETCORE_ENVIRONMENT ?? 'Development',
      BIBLENOTE_API_URL:bibleConfig.apiUrl
    },
    windowsHide:true,
    stdio:['ignore', 'pipe', 'pipe']
  });
  localBibleNoteProcess.stdout?.on('data', chunk => logStartupTiming(`[biblenote] ${chunk.toString().trimEnd()}`));
  localBibleNoteProcess.stderr?.on('data', chunk => logStartupTiming(`[biblenote] ${chunk.toString().trimEnd()}`));
  localBibleNoteProcess.on('error', error => logStartupTiming(`local BibleNote API process error: ${error.message}`));
  localBibleNoteProcess.on('exit', (code, signal) => {
    logStartupTiming(`local BibleNote API process exited code=${code ?? 'null'} signal=${signal ?? 'null'}`);
    localBibleNoteProcess = undefined;
  });
}

async function ensureLocalBibleNoteAvailable(): Promise<void> {
  if (!localBibleNoteEnsurePromise) {
    localBibleNoteEnsurePromise = (async () => {
      startLocalBibleNoteProcess();
      await waitForBibleNoteHealth(30000);
      bibleNoteHealthyUntil = Date.now() + 30000;
    })().finally(() => {
      localBibleNoteEnsurePromise = undefined;
    });
  }
  await localBibleNoteEnsurePromise;
}

async function ensureBibleNoteAvailable(): Promise<void> {
  if (Date.now() < bibleNoteHealthyUntil) return;
  try {
    await bibleNoteHealth();
    bibleNoteHealthyUntil = Date.now() + 30000;
    return;
  } catch (firstError) {
    const result = await electronControl('/biblenote/ensure', 'POST').catch(error => ({
      available:false,
      error:messageOf(error)
    }));
    if (result.available) {
      await bibleNoteHealth();
      bibleNoteHealthyUntil = Date.now() + 30000;
      return;
    }
    try {
      await ensureLocalBibleNoteAvailable();
      return;
    } catch (localError) {
      throw new Error(`BibleNote API is unavailable: ${String(result.error || messageOf(firstError))}; local start failed: ${messageOf(localError)}`);
    }
  }
}

process.once('exit', () => {
  if (localBibleNoteProcess && !localBibleNoteProcess.killed) localBibleNoteProcess.kill();
});

function cleanModuleName(fileName: string): string {
  const parsed = path.parse(fileName);
  const base = (parsed.name || 'module').trim();
  const safe = base.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '');
  return safe || 'module';
}

async function uploadBibleNoteModule(fileName: string, contentBase64: string): Promise<Record<string, unknown>> {
  if (!/\.(bnm|zip)$/i.test(fileName)) throw new Error('Module file must have .bnm or .zip extension.');
  if (!/^[a-zA-Z0-9+/=]+$/.test(contentBase64)) throw new Error('Invalid base64 module payload.');
  const bibleConfig = bibleParseConfigFromEnv();
  const apiUrl = bibleConfig.apiUrl.replace(/\/+$/, '');
  const moduleName = cleanModuleName(fileName);
  const uploadDir = path.join(process.env.APPDATA || process.cwd(), 'BibleNote', 'BibleNoteModules');
  fs.mkdirSync(uploadDir, { recursive:true });
  const tempFile = path.join(uploadDir, `${moduleName}${path.extname(fileName).toLowerCase()}`);
  fs.writeFileSync(tempFile, Buffer.from(contentBase64, 'base64'));

  try {
    const result = await fetchJson(`${apiUrl}/api/VerseParsing/UploadModule`, {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body:JSON.stringify({ filePath:tempFile, moduleName })
    });
    return {
      installed:true,
      moduleName:result.shortName || result.module || moduleName,
      message:'Модуль установлен через BibleNote API.'
    };
  } catch (error: any) {
    let modulesPackagePath: string | undefined;
    try {
      const health = await bibleNoteHealth();
      const modulesDirectory = typeof health.modulesDirectory === 'string' ? health.modulesDirectory : undefined;
      if (modulesDirectory) {
        modulesPackagePath = path.join(path.dirname(modulesDirectory), 'ModulesPackages');
        fs.mkdirSync(modulesPackagePath, { recursive:true });
        fs.copyFileSync(tempFile, path.join(modulesPackagePath, path.basename(tempFile)));
      }
    } catch {
      // The saved temporary upload is still useful for manual installation.
    }
    return {
      installed:false,
      moduleName,
      savedPath:tempFile,
      modulesPackagePath,
      message:'Файл модуля сохранен, но текущий BibleNote API не предоставляет endpoint установки модуля. Нужна доработка BibleNote: POST /api/VerseParsing/UploadModule с вызовом ModulesManager.UploadModule.'
    };
  }
}

function parseIsbtBibleVerse(rawRef: string): Record<string, unknown> | undefined {
  const normalizedRawRef = rawRef.trim().replace(/^https?:\/\/isbtBibleVerse:/i, 'isbtBibleVerse:');
  const payload = normalizedRawRef.replace(/^isbtBibleVerse:/i, '').trim();
  if (!payload) return undefined;
  const [machinePart, displayPart] = payload.split(';', 2);
  const machine = decodeURIComponent(machinePart || '').trim();
  const display = decodeURIComponent(displayPart || '').trim();
  const match = machine.match(/^([^/]+)\/(\d+)\s+(\d+)(?::(\d+))?(?:-(?:(\d+):)?(\d+))?$/);
  if (!match) return undefined;
  const [, module, bookIndex, chapter, verse, topChapter, topVerse] = match;
  return {
    module,
    originalText:display || machine,
    normalizedRef:display || machine,
    bookIndex:Number(bookIndex),
    chapter:Number(chapter),
    verse:verse ? Number(verse) : undefined,
    topChapter:topChapter ? Number(topChapter) : undefined,
    topVerse:topVerse ? Number(topVerse) : undefined
  };
}

async function parseExternalBibleRef(rawRef: string, module?: string): Promise<Record<string, unknown>> {
  const normalizedRawRef = rawRef.trim()
    .replace(/^https?:\/\/isbtBibleVerse:/i, 'isbtBibleVerse:')
    .replace(/^https?:\/\/bnVerse:/i, 'bnVerse:');
  const isbtReference = /^isbtBibleVerse:/i.test(normalizedRawRef) ? parseIsbtBibleVerse(normalizedRawRef) : undefined;
  if (isbtReference) return isbtReference;

  const text = normalizedRawRef.replace(/^bnVerse:/i, '').trim();
  if (!text) throw new Error('Bible reference is empty.');
  await ensureBibleNoteAvailable();
  const bibleConfig = bibleParseConfigFromEnv();
  const parsed = await parsePageWithBibleNote({
    apiUrl:bibleConfig.apiUrl,
    pageId:'external-bible-ref',
    text,
    module:module || bibleConfig.module,
    useCommaDelimiter:bibleConfig.useCommaDelimiter,
    timeoutMs:bibleConfig.timeoutMs
  });
  const reference = parsed.paragraphs?.flatMap(paragraph => paragraph.references ?? [])[0];
  if (!reference) throw new Error(`BibleNote did not recognize reference: ${text}`);
  return {
    ...reference,
    normalizedRef:reference.normalized,
    originalText:reference.originalText || text
  };
}

function searchCacheAdvanced(
  db: ReturnType<typeof openCacheDb>,
  query: string,
  options: { mode: 'and' | 'phrase' | 'regex'; caseSensitive: boolean; notebookIds: string[]; limit: number }
): Array<Record<string, unknown>> {
  if (!query) throw new Error('Search query is empty.');
  let regex: RegExp | undefined;
  let terms: string[] = [];
  if (options.mode === 'regex') {
    try {
      regex = new RegExp(query, 'u' + (options.caseSensitive ? '' : 'i'));
    } catch (error: any) {
      throw new Error(`Некорректное регулярное выражение: ${error?.message ?? String(error)}`);
    }
  } else if (options.mode === 'and') {
    terms = query.match(/[\p{L}\p{N}_-]+/gu) ?? [];
    if (terms.length === 0) terms = [query];
  }

  const filters = ['p.deleted_at IS NULL'];
  const params: Record<string, unknown> = {};
  if (options.notebookIds.length > 0) {
    const placeholders = options.notebookIds.map((_, index) => `@notebookId${index}`);
    filters.push(`p.parent_notebook_id IN (${placeholders.join(', ')})`);
    options.notebookIds.forEach((id, index) => { params[`notebookId${index}`] = id; });
  }
  const rows = db.prepare(`
    SELECT
      p.id, p.title, p.content_text AS contentText,
      p.parent_notebook_id AS parentNotebookId,
      COALESCE(n.custom_display_name, p.parent_notebook_name) AS notebook,
      p.parent_section_name AS section,
      p.last_modified_date_time AS lastModifiedDateTime,
      p.content_synced_at AS contentSyncedAt
    FROM pages p
    LEFT JOIN notebooks n ON n.id = p.parent_notebook_id
    WHERE ${filters.join(' AND ')}
  `).all(params) as Array<Record<string, any>>;

  const needle = options.caseSensitive ? query : query.toLocaleLowerCase();
  const normalizedTerms = options.caseSensitive ? terms : terms.map(term => term.toLocaleLowerCase());
  const results: Array<Record<string, unknown>> = [];
  for (const row of rows) {
    const haystack = `${row.title ?? ''}\n${row.contentText ?? ''}`;
    const comparable = options.caseSensitive ? haystack : haystack.toLocaleLowerCase();
    let matchIndex = -1;
    if (regex) {
      const match = regex.exec(haystack);
      regex.lastIndex = 0;
      matchIndex = match?.index ?? -1;
    } else if (options.mode === 'phrase') {
      matchIndex = comparable.indexOf(needle);
    } else if (normalizedTerms.every(term => comparable.includes(term))) {
      matchIndex = comparable.indexOf(normalizedTerms[0] ?? '');
    }
    if (matchIndex < 0) continue;
    const start = Math.max(0, matchIndex - 45);
    const end = Math.min(haystack.length, matchIndex + Math.max(query.length, 12) + 75);
    results.push({
      id:row.id,
      title:row.title,
      parent_notebook_id:row.parentNotebookId,
      parent_notebook_name:row.notebook,
      parent_section_name:row.section,
      last_modified_date_time:row.lastModifiedDateTime,
      content_synced_at:row.contentSyncedAt,
      snippet:(start > 0 ? '…' : '') + haystack.slice(start, end).replace(/\s+/g, ' ') + (end < haystack.length ? '…' : ''),
      score:matchIndex
    });
    if (results.length >= options.limit) break;
  }
  return results;
}

async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 75_000_000) throw new Error('Request body is too large.');
    chunks.push(buffer);
  }
  if (chunks.length === 0) return {};
  const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('JSON object expected.');
  return parsed as Record<string, unknown>;
}

export function startCacheUi(options: UiOptions): http.Server {
  configureRuntimeLogging(path.dirname(options.dbPath));
  let cacheDb: CacheDb | undefined;
  let dbInitStarted = false;
  let dbInitError: Error | undefined;
  let syncState: SyncUiState = { status: 'idle' };

  function startDbInit(): void {
    if (cacheDb || dbInitStarted) return;
    dbInitStarted = true;
    logStartupTiming('db init scheduled');
    setTimeout(() => {
      try {
        logStartupTiming('db init start');
        cacheDb = openCacheDb(options.dbPath);
        logStartupTiming('db init complete');
      } catch (error: any) {
        dbInitError = error instanceof Error ? error : new Error(String(error));
        logStartupTiming(`db init failed: ${dbInitError.message}`);
      }
    }, 1200);
  }

  function requireDb(): CacheDb {
    if (cacheDb) return cacheDb;
    if (dbInitError) {
      const error = new Error(`Local cache failed to start: ${dbInitError.message}`) as Error & { statusCode?: number };
      error.statusCode = 500;
      throw error;
    }
    const error = new Error('Local cache is starting. Try again in a moment.') as Error & { statusCode?: number };
    error.statusCode = 503;
    throw error;
  }

  const server = http.createServer(async (request: IncomingMessage, response: ServerResponse) => {
    try {
      const url = new URL(request.url ?? '/', `http://${request.headers.host ?? '127.0.0.1'}`);
      const requestStartedAt = Date.now();
      response.on('finish', () => {
        if (url.pathname !== '/api/runtime-log') {
          runtimeLog('http', `${request.method ?? 'GET'} ${url.pathname}`, {
            statusCode: response.statusCode,
            durationMs: Date.now() - requestStartedAt,
            query: Object.fromEntries(url.searchParams.entries())
          });
        }
      });
      if (request.method === 'GET' && (url.pathname === '/' || url.pathname.startsWith('/page/') || url.pathname.startsWith('/bible/'))) return page(response);
      if (url.pathname === '/api/onenote-image' && request.method === 'GET') {
        await oneNoteImage(response, required(url, 'src'));
        return;
      }
      if (url.pathname === '/api/sync' && request.method === 'GET') return json(response, 200, syncState);
      if (url.pathname === '/api/startup' && request.method === 'GET') return json(response, dbInitError ? 500 : 200, {
        ready: Boolean(cacheDb),
        starting: dbInitStarted && !cacheDb && !dbInitError,
        error: dbInitError?.message
      });
      if (url.pathname === '/api/runtime-settings' && request.method === 'GET') {
        return json(response, 200, readRuntimeLoggingSettings());
      }
      if (url.pathname === '/api/runtime-settings' && request.method === 'PUT') {
        const ownOrigin = `http://${request.headers.host ?? `127.0.0.1:${options.port}`}`;
        if (request.headers.origin && request.headers.origin !== ownOrigin) {
          return json(response, 403, { error: 'Cross-origin runtime settings requests are not allowed.' });
        }
        return json(response, 200, await saveRuntimeLoggingSettings(await readJsonBody(request)));
      }
      if (url.pathname === '/api/runtime-log' && request.method === 'POST') {
        const ownOrigin = `http://${request.headers.host ?? `127.0.0.1:${options.port}`}`;
        if (request.headers.origin && request.headers.origin !== ownOrigin) {
          return json(response, 403, { error: 'Cross-origin runtime log requests are not allowed.' });
        }
        const body = await readJsonBody(request);
        runtimeLog('ui', typeof body.action === 'string' ? body.action : 'event', body.details);
        return json(response, 200, {});
      }
      if (url.pathname === '/api/onenote/access-settings' && request.method === 'GET') {
        return json(response, 200, readOneNoteAccessSettings());
      }
      if (url.pathname === '/api/onenote/access-settings' && request.method === 'PUT') {
        const ownOrigin = `http://${request.headers.host ?? `127.0.0.1:${options.port}`}`;
        if (request.headers.origin && request.headers.origin !== ownOrigin) {
          return json(response, 403, { error: 'Cross-origin OneNote settings requests are not allowed.' });
        }
        return json(response, 200, await saveOneNoteAccessSettings(await readJsonBody(request)));
      }
      if (url.pathname === '/api/biblenote/health' && request.method === 'GET') {
        try {
          const health = await bibleNoteHealth();
          return json(response, 200, { available:true, ...health });
        } catch (error: any) {
          return json(response, 200, { available:false, error:error?.message ?? String(error) });
        }
      }
      if (url.pathname === '/api/biblenote/modules' && request.method === 'GET') {
        try {
          const modules = await bibleNoteModules();
          return json(response, 200, { available:true, modules });
        } catch (error: any) {
          return json(response, 200, { available:false, error:error?.message ?? String(error), modules:[] });
        }
      }
      if (url.pathname === '/api/system/protocol' && request.method === 'GET') {
        return json(response, 200, await electronControl('/protocol/status'));
      }
      if (url.pathname === '/api/system/protocol/register' && request.method === 'POST') {
        const ownOrigin = `http://${request.headers.host ?? `127.0.0.1:${options.port}`}`;
        if (request.headers.origin && request.headers.origin !== ownOrigin) {
          return json(response, 403, { error: 'Cross-origin protocol requests are not allowed.' });
        }
        return json(response, 200, await electronControl('/protocol/register', 'POST'));
      }
      if (url.pathname === '/api/biblenote/modules/upload' && request.method === 'POST') {
        const ownOrigin = `http://${request.headers.host ?? `127.0.0.1:${options.port}`}`;
        if (request.headers.origin && request.headers.origin !== ownOrigin) {
          return json(response, 403, { error: 'Cross-origin module upload requests are not allowed.' });
        }
        const body = uploadBibleNoteModuleRequestSchema.parse(await readJsonBody(request));
        return json(response, 200, await uploadBibleNoteModule(body.fileName, body.contentBase64));
      }
      if (url.pathname === '/api/bible/parse-link' && request.method === 'GET') {
        const rawRef = required(url, 'ref');
        const module = url.searchParams.get('module')?.trim() || undefined;
        return json(response, 200, { reference:await parseExternalBibleRef(rawRef, module) });
      }
      const db = requireDb();
      if (url.pathname === '/api/sync' && request.method === 'POST') {
        const ownOrigin = `http://${request.headers.host ?? `127.0.0.1:${options.port}`}`;
        if (request.headers.origin && request.headers.origin !== ownOrigin) {
          return json(response, 403, { error: 'Cross-origin sync requests are not allowed.' });
        }
        if (syncState.status === 'running') return json(response, 409, { error: 'Synchronization is already running.' });
        const body = syncRequestSchema.parse(await readJsonBody(request));
        const maxPages = body.maxPages;
        const concurrency = body.concurrency ?? 1;
        const refreshOlderThanHours = body.refreshOlderThanHours;
        const notebookIds = body.notebookIds ? [...new Set(body.notebookIds)] : undefined;
        const sectionId = body.sectionId;
        const pageId = body.pageId;
        const bibleModule = body.bibleModule;
        const scopeCount = Number(Boolean(notebookIds)) + Number(Boolean(sectionId)) + Number(Boolean(pageId));
        if (scopeCount > 1) throw new Error('Specify only one sync scope: notebookIds, sectionId, or pageId.');
        const startedAt = new Date().toISOString();
        syncState = { status: 'running', startedAt, progress: { phase: 'starting', message: 'Подготовка' } };
        runtimeLog('sync', 'Sync started', {
          maxPages,
          concurrency,
          refreshOlderThanHours,
          metadataOnly: body.metadataOnly === true,
          replaceAll: body.replaceAll === true,
          forceContent: body.forceContent === true,
          includeHtml: body.includeHtml === true,
          parseBibleRefs: body.parseBibleRefs === true,
          forceBibleParse: body.forceBibleParse === true,
          bibleModule,
          notebookIds,
          sectionId,
          pageId
        });
        void syncOneNoteCache({
          dbPath: options.dbPath,
          maxPages,
          concurrency,
          refreshOlderThanHours,
          metadataOnly: body.metadataOnly === true,
          replaceAll: body.replaceAll === true,
          forceContent: body.forceContent === true,
          includeHtml: body.includeHtml === true,
          parseBibleRefs: body.parseBibleRefs === true,
          forceBibleParse: body.forceBibleParse === true,
          bibleModule,
          notebookIds,
          sectionId,
          pageId,
          onProgress: progress => {
            runtimeLog('sync-progress', progress.phase || 'progress', progress);
            syncState = { ...syncState, progress };
          }
        }).then(result => {
          console.log(`Sync completed: pages=${result.pages}, contentDownloaded=${result.contentDownloaded}, bibleRefsRecognized=${result.bibleRefsRecognized}, contentErrors=${result.contentErrors}, bibleParseErrors=${result.bibleRefsParseErrors}`);
          runtimeLog('sync', 'Sync completed', result);
          syncState = { status: 'success', startedAt, finishedAt: new Date().toISOString(), result };
        }).catch(error => {
          console.error(`Sync failed: ${(error?.message ?? String(error)).slice(0, 4000)}`);
          runtimeLog('sync', 'Sync failed', { error: error?.stack ?? error?.message ?? String(error) });
          syncState = {
            status: 'failed',
            startedAt,
            finishedAt: new Date().toISOString(),
            error: (error?.message ?? String(error)).slice(0, 4000)
          };
        });
        return json(response, 202, syncState);
      }
      if (url.pathname === '/api/notebook-display-name' && request.method === 'PATCH') {
        const ownOrigin = `http://${request.headers.host ?? `127.0.0.1:${options.port}`}`;
        if (request.headers.origin && request.headers.origin !== ownOrigin) {
          return json(response, 403, { error: 'Cross-origin cache changes are not allowed.' });
        }
        const body = notebookDisplayNameRequestSchema.parse(await readJsonBody(request));
        const customDisplayName = typeof body.displayName === 'string' ? body.displayName.trim() || null : null;
        if (customDisplayName && customDisplayName.length > 120) throw new Error('displayName must not exceed 120 characters.');
        if (customDisplayName && /[\u0000-\u001f\u007f]/.test(customDisplayName)) throw new Error('displayName contains unsupported control characters.');
        const update = db.prepare('UPDATE notebooks SET custom_display_name = ? WHERE id = ?').run(customDisplayName, body.notebookId);
        if (update.changes === 0) return json(response, 404, { error: 'Notebook is not in the local cache.' });
        const notebook = db.prepare(`
          SELECT
            id,
            display_name AS originalDisplayName,
            custom_display_name AS customDisplayName,
            COALESCE(custom_display_name, display_name) AS displayName
          FROM notebooks
          WHERE id = ?
        `).get(body.notebookId);
        return json(response, 200, notebook);
      }
      if (request.method !== 'GET') return json(response, 405, { error: 'Method not allowed.' });
      if (url.pathname === '/' || url.pathname.startsWith('/page/') || url.pathname.startsWith('/bible/')) return page(response);
      if (url.pathname === '/api/status') return json(response, 200, cacheStatus(db));
      if (url.pathname === '/api/bible/stats') {
        const one = (sql: string) => (db.prepare(sql).get() as any)?.value ?? 0;
        const includeAux = includeAuxiliaryBibleRefs(url);
        const refFilter = includeAux ? '1' : visibleBibleRefSql('r');
        const scopeFilter = includeAux ? '1' : visibleBibleScopeSql('p', 's');
        const statsFrom = `paragraph_verse_refs r
          JOIN pages p ON p.id = r.page_id
          LEFT JOIN sections s ON s.id = p.parent_section_id`;
        const statsWhere = `${refFilter} AND ${scopeFilter}`;
        return json(response, 200, {
          pages: one(`SELECT COUNT(DISTINCT r.page_id) AS value FROM ${statsFrom} WHERE ${statsWhere}`),
          paragraphs: one(`SELECT COUNT(DISTINCT r.page_id || ':' || r.paragraph_index) AS value FROM ${statsFrom} WHERE ${statsWhere}`),
          references: one(`SELECT COUNT(*) AS value FROM ${statsFrom} WHERE ${statsWhere}`),
          errors: one("SELECT COUNT(*) AS value FROM page_bible_parse_state WHERE parse_error IS NOT NULL")
        });
      }
      if (url.pathname === '/api/bible/books') {
        const bibleConfig = bibleParseConfigFromEnv();
        const module = url.searchParams.get('module')?.trim() || bibleConfig.module;
        await ensureBibleNoteAvailable();
        return json(response, 200, { module, books:await bibleNoteBooks(module) });
      }
      if (url.pathname === '/api/bible/text') {
        const bookIndex = Number(required(url, 'bookIndex'));
        const chapter = Number(required(url, 'chapter'));
        const verseValue = url.searchParams.get('verse');
        const topChapterValue = url.searchParams.get('topChapter');
        const topVerseValue = url.searchParams.get('topVerse');
        const contextVersesValue = url.searchParams.get('contextVerses');
        const verse = verseValue ? Number(verseValue) : undefined;
        const topChapter = topChapterValue ? Number(topChapterValue) : undefined;
        const topVerse = topVerseValue ? Number(topVerseValue) : undefined;
        const contextVerses = contextVersesValue ? Number(contextVersesValue) : undefined;
        if (!Number.isInteger(bookIndex) || !Number.isInteger(chapter)
          || (verse != null && !Number.isInteger(verse))
          || (topChapter != null && !Number.isInteger(topChapter))
          || (topVerse != null && !Number.isInteger(topVerse))
          || (contextVerses != null && (!Number.isInteger(contextVerses) || contextVerses < 0 || contextVerses > 100))) {
          throw new Error('bookIndex, chapter, verse, topChapter, topVerse, and contextVerses must be integers.');
        }
        const bibleConfig = bibleParseConfigFromEnv();
        const module = url.searchParams.get('module')?.trim() || bibleConfig.module;
        await ensureBibleNoteAvailable();
        return json(response, 200, await getVerseTextWithBibleNote({
          apiUrl: bibleConfig.apiUrl,
          module,
          bookIndex,
          bookName: url.searchParams.get('bookName'),
          bookShortName: url.searchParams.get('bookShortName'),
          originalText: url.searchParams.get('originalText'),
          chapter,
          verse,
          topChapter,
          topVerse,
          contextVerses,
          timeoutMs: bibleConfig.timeoutMs
        }));
      }
      if (url.pathname === '/api/bible/page') {
        const pageId = required(url, 'id');
        const includeAux = includeAuxiliaryBibleRefs(url);
        const refFilter = includeAux ? '1' : visibleBibleRefSql('r', 'pp');
        const scopeFilter = includeAux ? '1' : visibleBibleScopeSql('p', 's');
        const rows = db.prepare(`
          SELECT
            pp.paragraph_index AS paragraphIndex,
            pp.paragraph_path AS paragraphPath,
            pp.text AS paragraphText,
            r.original_text AS originalText,
            r.normalized_ref AS normalizedRef,
            r.book_index AS bookIndex,
            r.book_name AS bookName,
            r.book_short_name AS bookShortName,
            r.chapter,
            r.verse,
            r.top_chapter AS topChapter,
            r.top_verse AS topVerse,
            r.is_chapter AS isChapter,
            r.start_index AS startIndex,
            r.end_index AS endIndex,
            r.entry_type AS entryType,
            r.entry_options AS entryOptions
          FROM page_paragraphs pp
          JOIN paragraph_verse_refs r ON r.page_id = pp.page_id AND r.paragraph_index = pp.paragraph_index
          JOIN pages p ON p.id = r.page_id
          LEFT JOIN sections s ON s.id = p.parent_section_id
          WHERE pp.page_id = ?
            AND ${refFilter}
            AND ${scopeFilter}
          ORDER BY pp.paragraph_index, r.start_index
        `).all(pageId) as Array<Record<string, any>>;
        const paragraphs = new Map<number, any>();
        for (const row of rows) {
          if (!paragraphs.has(row.paragraphIndex)) {
            paragraphs.set(row.paragraphIndex, {
              index: row.paragraphIndex,
              path: row.paragraphPath,
              text: row.paragraphText,
              references: []
            });
          }
          paragraphs.get(row.paragraphIndex).references.push({
            originalText: row.originalText,
            normalizedRef: row.normalizedRef,
            bookIndex: row.bookIndex,
            bookName: row.bookName,
            bookShortName: row.bookShortName,
            chapter: row.chapter,
            verse: row.verse,
            topChapter: row.topChapter,
            topVerse: row.topVerse,
            isChapter: Boolean(row.isChapter),
            startIndex: row.startIndex,
            endIndex: row.endIndex,
            entryType: row.entryType,
            entryOptions: row.entryOptions
          });
        }
        return json(response, 200, { pageId, paragraphs:[...paragraphs.values()] });
      }
      if (url.pathname === '/api/bible/search') {
        const query = (url.searchParams.get('q') ?? '').trim();
        const limit = Math.max(1, Math.min(Number(url.searchParams.get('limit') ?? '80') || 80, 200));
        const notebookIds = [...new Set(url.searchParams.getAll('notebookId').filter(Boolean))];
        const filters = ['p.deleted_at IS NULL'];
        if (!includeAuxiliaryBibleRefs(url)) {
          filters.push(visibleBibleRefSql('r', 'pp'));
          filters.push(visibleBibleScopeSql('p', 's'));
        }
        const params: Record<string, unknown> = { limit };
        if (query) {
          params.query = `%${query}%`;
          const textFilter = '(r.normalized_ref LIKE @query OR r.original_text LIKE @query OR r.book_name LIKE @query OR r.book_short_name LIKE @query OR pp.text LIKE @query)';
          let referenceFilter = '';
          try {
            const parsedRef = await parseExternalBibleRef(query, url.searchParams.get('module')?.trim() || undefined);
            const bookIndex = Number(parsedRef.bookIndex);
            const chapter = Number(parsedRef.chapter);
            const verse = Number(parsedRef.verse);
            if (Number.isInteger(bookIndex) && Number.isInteger(chapter)) {
              params.refBookIndex = bookIndex;
              params.refStartChapter = chapter;
              params.refEndChapter = Number.isInteger(Number(parsedRef.topChapter)) ? Number(parsedRef.topChapter) : chapter;
              if (Number.isInteger(verse)) {
                params.refStartVerse = verse;
                params.refEndVerse = Number.isInteger(Number(parsedRef.topVerse)) ? Number(parsedRef.topVerse) : verse;
                referenceFilter = `
                  (
                    r.book_index = @refBookIndex
                    AND r.chapter = @refStartChapter
                    AND COALESCE(r.verse, 0) = @refStartVerse
                    AND COALESCE(r.top_chapter, r.chapter) = @refEndChapter
                    AND COALESCE(r.top_verse, r.verse, 0) = @refEndVerse
                  )
                `;
              } else {
                referenceFilter = '(r.book_index = @refBookIndex AND r.chapter = @refStartChapter)';
              }
            }
          } catch {
            // Keep text search behavior when BibleNote does not recognize the query as a reference.
          }
          filters.push(referenceFilter ? `(${textFilter} OR ${referenceFilter})` : textFilter);
        }
        if (notebookIds.length > 0) {
          const placeholders = notebookIds.map((_, index) => {
            params[`notebookId${index}`] = notebookIds[index];
            return `@notebookId${index}`;
          });
          filters.push(`p.parent_notebook_id IN (${placeholders.join(', ')})`);
        }
        const whereSql = filters.join(' AND ');
        const total = (db.prepare(`
          SELECT COUNT(*) AS value
          FROM paragraph_verse_refs r
          JOIN pages p ON p.id = r.page_id
          LEFT JOIN sections s ON s.id = p.parent_section_id
          JOIN page_paragraphs pp ON pp.page_id = r.page_id AND pp.paragraph_index = r.paragraph_index
          WHERE ${whereSql}
        `).get(params) as { value: number }).value;
        const rows = db.prepare(`
          SELECT
            r.page_id AS pageId,
            p.title AS pageTitle,
            COALESCE(n.custom_display_name, p.parent_notebook_name) AS notebook,
            p.parent_section_name AS section,
            r.paragraph_index AS paragraphIndex,
            pp.text AS paragraphText,
            r.original_text AS originalText,
            r.normalized_ref AS normalizedRef,
            r.book_index AS bookIndex,
            r.chapter,
            r.verse
          FROM paragraph_verse_refs r
          JOIN pages p ON p.id = r.page_id
          LEFT JOIN sections s ON s.id = p.parent_section_id
          JOIN page_paragraphs pp ON pp.page_id = r.page_id AND pp.paragraph_index = r.paragraph_index
          LEFT JOIN notebooks n ON n.id = p.parent_notebook_id
          WHERE ${whereSql}
          ORDER BY p.last_modified_date_time DESC, r.page_id, r.paragraph_index, r.start_index
          LIMIT @limit
        `).all(params);
        return json(response, 200, { total, rows });
      }
      if (url.pathname === '/api/bible/parallel') {
        const bookIndex = Number(required(url, 'bookIndex'));
        const chapter = Number(required(url, 'chapter'));
        const verseValue = url.searchParams.get('verse');
        const verse = verseValue ? Number(verseValue) : undefined;
        const limit = Math.max(1, Math.min(Number(url.searchParams.get('limit') ?? '20') || 20, 200));
        if (!Number.isInteger(bookIndex) || !Number.isInteger(chapter) || (verse != null && !Number.isInteger(verse))) {
          throw new Error('bookIndex, chapter, and verse must be integers.');
        }
        return json(response, 200, { rows:findParallelBibleReferences(db, {
          bookIndex,
          chapter,
          verse,
          limit,
          includeAuxiliaryRefs:includeAuxiliaryBibleRefs(url)
        }) });
      }
      if (url.pathname === '/api/bible/parallel/notes') {
        const bookIndex = Number(required(url, 'bookIndex'));
        const chapter = Number(required(url, 'chapter'));
        const verseValue = url.searchParams.get('verse');
        const verse = verseValue ? Number(verseValue) : undefined;
        const relatedBookIndex = Number(required(url, 'relatedBookIndex'));
        const relatedChapter = Number(required(url, 'relatedChapter'));
        const relatedVerseValue = url.searchParams.get('relatedVerse');
        const relatedVerse = relatedVerseValue ? Number(relatedVerseValue) : undefined;
        const limit = Math.max(1, Math.min(Number(url.searchParams.get('limit') ?? '50') || 50, 200));
        if (!Number.isInteger(bookIndex) || !Number.isInteger(chapter)
          || (verse != null && !Number.isInteger(verse))
          || !Number.isInteger(relatedBookIndex) || !Number.isInteger(relatedChapter)
          || (relatedVerse != null && !Number.isInteger(relatedVerse))) {
          throw new Error('bookIndex, chapter, verse, relatedBookIndex, relatedChapter, and relatedVerse must be integers.');
        }
        return json(response, 200, {
          rows:findParallelBibleReferenceNotes(db, {
            bookIndex,
            chapter,
            verse,
            relatedBookIndex,
            relatedChapter,
            relatedVerse,
            limit,
            includeAuxiliaryRefs:includeAuxiliaryBibleRefs(url)
          })
        });
      }
      if (url.pathname === '/api/download-log') {
        const allowedFilters = new Set(['downloaded-last-sync', 'downloaded', 'missing', 'errors', 'all']);
        const filter = url.searchParams.get('filter') ?? 'downloaded-last-sync';
        if (!allowedFilters.has(filter)) throw new Error('Unknown download log filter.');
        const limit = Math.max(1, Math.min(Number(url.searchParams.get('limit') ?? '100') || 100, 200));
        const offset = Math.max(0, Number(url.searchParams.get('offset') ?? '0') || 0);
        const notebookIds = [...new Set(url.searchParams.getAll('notebookId').filter(Boolean))];
        const params: Record<string, unknown> = { limit, offset };
        const scopeConditions = ['deleted_at IS NULL'];
        if (notebookIds.length > 0) {
          const placeholders = notebookIds.map((id, index) => {
            params[`notebookId${index}`] = id;
            return `@notebookId${index}`;
          });
          scopeConditions.push(`parent_notebook_id IN (${placeholders.join(', ')})`);
        }
        const lastSyncStartedAt = getSyncState(db, 'last_sync_started_at');
        if (lastSyncStartedAt) params.lastSyncStartedAt = lastSyncStartedAt;
        const filterCondition = filter === 'errors'
          ? 'fetch_error IS NOT NULL'
          : filter === 'missing'
            ? 'content_text IS NULL AND fetch_error IS NULL'
            : filter === 'downloaded'
              ? 'content_text IS NOT NULL AND fetch_error IS NULL'
              : filter === 'downloaded-last-sync'
                ? lastSyncStartedAt
                  ? 'content_synced_at >= @lastSyncStartedAt AND fetch_error IS NULL'
                  : '0'
                : '1';
        const scopeSql = scopeConditions.join(' AND ');
        const counts = db.prepare(`
          SELECT
            SUM(CASE WHEN content_text IS NOT NULL AND fetch_error IS NULL THEN 1 ELSE 0 END) AS downloaded,
            SUM(CASE WHEN content_text IS NULL AND fetch_error IS NULL THEN 1 ELSE 0 END) AS missing,
            SUM(CASE WHEN fetch_error IS NOT NULL THEN 1 ELSE 0 END) AS errors,
            COUNT(*) AS total
          FROM pages
          WHERE ${scopeSql}
        `).get(params) as Record<string, number>;
        const total = (db.prepare(`
          SELECT COUNT(*) AS value FROM pages WHERE ${scopeSql} AND (${filterCondition})
        `).get(params) as { value: number }).value;
        const rows = db.prepare(`
          SELECT
            p.id,
            p.title,
            COALESCE(n.custom_display_name, p.parent_notebook_name) AS notebook,
            p.parent_section_name AS section,
            p.content_synced_at AS contentSyncedAt,
            p.metadata_synced_at AS metadataSyncedAt,
            p.fetch_error AS error,
            CASE
              WHEN fetch_error IS NOT NULL THEN 'error'
              WHEN content_text IS NOT NULL THEN 'downloaded'
              ELSE 'missing'
            END AS status
          FROM pages p
          LEFT JOIN notebooks n ON n.id = p.parent_notebook_id
          WHERE ${scopeSql} AND (${filterCondition})
          ORDER BY
            CASE WHEN fetch_error IS NOT NULL THEN 0 WHEN content_text IS NULL THEN 1 ELSE 2 END,
            COALESCE(content_synced_at, metadata_synced_at) DESC,
            title COLLATE NOCASE
          LIMIT @limit OFFSET @offset
        `).all(params);
        return json(response, 200, { filter, lastSyncStartedAt, counts, total, limit, offset, rows });
      }
      if (url.pathname === '/api/notebooks') {
        const rows = db.prepare(`
          SELECT
            n.id,
            n.display_name AS originalDisplayName,
            n.custom_display_name AS customDisplayName,
            COALESCE(n.custom_display_name, n.display_name) AS displayName,
            COUNT(p.id) AS pageCount
          FROM notebooks n
          LEFT JOIN pages p ON p.parent_notebook_id = n.id AND p.deleted_at IS NULL
          GROUP BY n.id
          ORDER BY COALESCE(n.custom_display_name, n.display_name) COLLATE NOCASE
        `).all();
        return json(response, 200, rows);
      }
      if (url.pathname === '/api/sections') {
        const rows = db.prepare(`
          SELECT
            s.id,
            s.display_name AS displayName,
            s.pages_scan_complete AS scanComplete,
            s.pages_scanned_at AS scannedAt,
            s.pages_seen_count AS pagesSeenCount,
            s.pages_scan_error AS scanError,
            s.section_group_path AS groupPath,
            s.parent_section_group_id AS parentGroupId,
            s.order_index AS orderIndex,
            COUNT(p.id) AS pageCount
          FROM sections s
          LEFT JOIN pages p ON p.parent_section_id = s.id AND p.deleted_at IS NULL
          WHERE s.parent_notebook_id = ?
          GROUP BY s.id
          ORDER BY s.parent_section_group_id, s.order_index IS NULL, s.order_index, s.display_name COLLATE NOCASE
        `).all(required(url, 'notebookId'));
        return json(response, 200, rows);
      }
      if (url.pathname === '/api/section-groups') {
        const rows = db.prepare(`
          SELECT
            g.id,
            g.display_name AS displayName,
            g.parent_section_group_id AS parentGroupId,
            g.section_group_path AS groupPath,
            g.order_index AS orderIndex,
            COUNT(s.id) AS sectionCount
          FROM section_groups g
          LEFT JOIN sections s ON s.parent_section_group_id = g.id
          WHERE g.parent_notebook_id = ?
          GROUP BY g.id
          ORDER BY g.parent_section_group_id, g.order_index IS NULL, g.order_index, g.display_name COLLATE NOCASE
        `).all(required(url, 'notebookId'));
        return json(response, 200, rows);
      }
      if (url.pathname === '/api/pages') {
        const rows = db.prepare(`
          SELECT id, title, order_index AS orderIndex, content_text IS NOT NULL AS hasContent, fetch_error AS fetchError
          FROM pages
          WHERE parent_section_id = ? AND deleted_at IS NULL
          ORDER BY order_index IS NULL, order_index, title COLLATE NOCASE
        `).all(required(url, 'sectionId')) as Array<{ title: string | null }>;
        return json(response, 200, rows);
      }
      if (url.pathname === '/api/search') {
        const notebookIds = url.searchParams.getAll('notebookId').filter(Boolean);
        let query = required(url, 'q');
        let mode = url.searchParams.get('mode') ?? 'and';
        const caseSensitive = url.searchParams.get('caseSensitive') === 'true';
        if (mode === 'and' && query.length >= 2 && query.startsWith('"') && query.endsWith('"')) {
          query = query.slice(1, -1);
          mode = 'phrase';
        }
        if (!['and', 'phrase', 'regex'].includes(mode)) throw new Error(`Unknown search mode: ${mode}`);
        let parsedSearchRef: Awaited<ReturnType<typeof parseExternalBibleRef>> | null = null;
        if (mode !== 'regex' && /(?:\d|:|bnVerse:|isbtBibleVerse:)/i.test(query)) {
          try {
            const parsed = await parseExternalBibleRef(query, url.searchParams.get('module')?.trim() || undefined);
            if (Number.isInteger(Number(parsed.bookIndex)) && Number.isInteger(Number(parsed.chapter))) {
              parsedSearchRef = parsed;
            }
          } catch {
            parsedSearchRef = null;
          }
        }
        const rawResults = parsedSearchRef
          ? []
          : mode === 'and' && !caseSensitive
          ? searchCache(db, query, {
              limit:100,
              mode:'and',
              notebookIds:notebookIds.length > 0 ? notebookIds : undefined
            })
          : searchCacheAdvanced(db, query, {
              limit:100,
              mode:mode as 'and' | 'phrase' | 'regex',
              caseSensitive,
              notebookIds
            });
        const resultsById = new Map<string, Record<string, unknown>>();
        const addResult = (item: Record<string, any>) => {
          const id = String(item.id);
          const paragraphIndex = Number.isInteger(item.paragraphIndex) ? item.paragraphIndex : undefined;
          const existing = resultsById.get(id);
          if (existing) {
            if (existing.paragraphIndex == null && paragraphIndex != null) existing.paragraphIndex = paragraphIndex;
            if (paragraphIndex != null) {
              const paragraphIndexes = Array.isArray(existing.paragraphIndexes) ? existing.paragraphIndexes : [];
              if (!paragraphIndexes.includes(paragraphIndex)) paragraphIndexes.push(paragraphIndex);
              existing.paragraphIndexes = paragraphIndexes;
            }
            if (!existing.snippet && item.snippet) existing.snippet = item.snippet;
            if (!existing.bibleRef && item.bibleRef) existing.bibleRef = item.bibleRef;
            if (item.bibleMatchScore != null) {
              const currentScore = Number(existing.bibleMatchScore ?? Number.POSITIVE_INFINITY);
              const nextScore = Number(item.bibleMatchScore);
              if (Number.isFinite(nextScore) && nextScore < currentScore) existing.bibleMatchScore = nextScore;
            }
            return;
          }
          resultsById.set(id, {
            id:item.id,
            title:item.title,
            notebookId:item.parent_notebook_id,
            notebook:item.parent_notebook_name,
            section:item.parent_section_name,
            snippet:item.snippet,
            paragraphIndex,
            paragraphIndexes:paragraphIndex != null ? [paragraphIndex] : [],
            bibleRef:item.bibleRef,
            bibleMatchScore:item.bibleMatchScore
          });
        };
        rawResults.forEach((item: any) => addResult(item));

        if (parsedSearchRef) {
          try {
            const parsedRef = parsedSearchRef;
            const bookIndex = Number(parsedRef.bookIndex);
            const chapter = Number(parsedRef.chapter);
            const verse = Number(parsedRef.verse);
            if (Number.isInteger(bookIndex) && Number.isInteger(chapter)) {
              const filters = ['p.deleted_at IS NULL'];
              if (!includeAuxiliaryBibleRefs(url)) {
                filters.push(visibleBibleRefSql('r', 'pp'));
                filters.push(visibleBibleScopeSql('p', 's'));
              }
              const bibleParams: Record<string, unknown> = {
                limit:100,
                refBookIndex:bookIndex,
                refStartChapter:chapter,
                refEndChapter:Number.isInteger(Number(parsedRef.topChapter)) ? Number(parsedRef.topChapter) : chapter,
                refStartVerse:null,
                refEndVerse:null
              };
              if (Number.isInteger(verse)) {
                bibleParams.refStartVerse = verse;
                bibleParams.refEndVerse = Number.isInteger(Number(parsedRef.topVerse)) ? Number(parsedRef.topVerse) : verse;
                filters.push(`
                  r.book_index = @refBookIndex
                  AND r.chapter = @refStartChapter
                  AND COALESCE(r.verse, 0) = @refStartVerse
                  AND COALESCE(r.top_chapter, r.chapter) = @refEndChapter
                  AND COALESCE(r.top_verse, r.verse, 0) = @refEndVerse
                `);
              } else {
                filters.push('r.book_index = @refBookIndex AND r.chapter = @refStartChapter');
              }
              if (notebookIds.length > 0) {
                const placeholders = notebookIds.map((_, index) => {
                  bibleParams[`notebookId${index}`] = notebookIds[index];
                  return `@notebookId${index}`;
                });
                filters.push(`p.parent_notebook_id IN (${placeholders.join(', ')})`);
              }
              const bibleRows = db.prepare(`
                SELECT
                  r.page_id AS id,
                  p.title,
                  p.parent_notebook_id,
                  COALESCE(n.custom_display_name, p.parent_notebook_name) AS parent_notebook_name,
                  p.parent_section_name,
                  r.paragraph_index AS paragraphIndex,
                  pp.text AS snippet,
                  COALESCE(r.normalized_ref, r.original_text) AS bibleRef,
                  CASE
                    WHEN @refStartVerse IS NULL THEN 0
                    WHEN r.chapter = @refStartChapter AND COALESCE(r.verse, 0) = @refStartVerse
                      AND COALESCE(r.top_chapter, r.chapter) = @refEndChapter
                      AND COALESCE(r.top_verse, r.verse, 0) = @refEndVerse THEN 0
                    WHEN r.chapter = @refStartChapter AND COALESCE(r.verse, 0) = @refStartVerse THEN 1
                    WHEN COALESCE(r.top_chapter, r.chapter) = @refEndChapter
                      AND COALESCE(r.top_verse, r.verse, 0) = @refEndVerse THEN 2
                    ELSE 10
                  END AS bibleMatchScore
                FROM paragraph_verse_refs r
                JOIN pages p ON p.id = r.page_id
                LEFT JOIN sections s ON s.id = p.parent_section_id
                JOIN page_paragraphs pp ON pp.page_id = r.page_id AND pp.paragraph_index = r.paragraph_index
                LEFT JOIN notebooks n ON n.id = p.parent_notebook_id
                WHERE ${filters.join(' AND ')}
                ORDER BY p.last_modified_date_time DESC, r.page_id, r.paragraph_index, r.start_index
                LIMIT @limit
              `).all(bibleParams) as Array<Record<string, unknown>>;
              bibleRows.forEach(addResult);
            }
          } catch (error) {
            runtimeLog('search', 'Bible reference search skipped', {
              query,
              error:error instanceof Error ? error.message : String(error)
            });
          }
        }
        for (const result of resultsById.values()) {
          if (Array.isArray(result.paragraphIndexes)) {
            const paragraphIndexes = result.paragraphIndexes as unknown[];
            const sortedParagraphIndexes = [...new Set(paragraphIndexes)]
              .filter((value): value is number => Number.isInteger(value))
              .sort((left, right) => left - right);
            result.paragraphIndexes = sortedParagraphIndexes;
            result.paragraphIndex = sortedParagraphIndexes[0] ?? result.paragraphIndex;
          }
        }
        const results = [...resultsById.values()]
          .sort((left, right) => {
            const bibleCompare = Number(Boolean(right.bibleRef)) - Number(Boolean(left.bibleRef));
            if (bibleCompare !== 0) return bibleCompare;
            return Number(left.bibleMatchScore ?? 1000) - Number(right.bibleMatchScore ?? 1000);
          })
          .slice(0, 100);
        return json(response, 200, results);
      }
      if (url.pathname === '/api/page') {
        const pageId = required(url, 'id');
        const cached = readCachedPage(db, pageId, false, 2_000_000);
        const row = getCachedPage(db, pageId);
        markPageOpened(db, pageId);
        const text = typeof cached.text === 'string'
          ? cached.text.replace(/[\t ]+\n/g, '\n').replace(/\n{3,}/g, '\n\n')
          : cached.text;
        return json(response, 200, { ...cached, text, hasHtml: Boolean(row?.content_html) });
      }
      if (url.pathname === '/api/page-status') {
        const pageId = required(url, 'id');
        const row = getCachedPage(db, pageId);
        if (!row || row.deleted_at) return json(response, 404, { error: 'Page is not in the local cache.' });
        markPageOpened(db, pageId);
        return json(response, 200, {
          hasContent: row.content_text != null,
          contentSyncedAt: row.content_synced_at,
          fetchError: row.fetch_error
        });
      }
      if (url.pathname === '/api/page-html') {
        const pageId = required(url, 'id');
        const row = getCachedPage(db, pageId);
        if (!row || row.deleted_at) return json(response, 404, { error: 'Page is not in the active cache.' });
        if (!row.content_html) return json(response, 404, { error: 'HTML is not cached for this page.' });
        if (url.searchParams.get('raw') === '1') return json(response, 200, { id: pageId, html: row.content_html });
        await ensureBibleNoteAvailable();
        const bibleConfig = bibleParseConfigFromEnv();
        const parsed = await parsePageWithBibleNote({
          apiUrl: bibleConfig.apiUrl,
          pageId,
          title: row.title,
          html: row.content_html,
          text: row.content_text,
          module: url.searchParams.get('module') || bibleConfig.module,
          useCommaDelimiter: bibleConfig.useCommaDelimiter,
          timeoutMs: bibleConfig.timeoutMs,
          updateHtml: true
        });
        if (parsed.html && parsed.html !== row.content_html) {
          updatePageHtml(db, pageId, parsed.html);
          runtimeLog('http', 'Updated cached page HTML from page-html request', {
            pageId,
            htmlBytes: parsed.html.length
          });
        }
        return json(response, 200, { id: pageId, html: parsed.html || row.content_html });
      }
      return json(response, 404, { error: 'Not found.' });
    } catch (error: any) {
      const statusCode = Number.isInteger(error?.statusCode) ? error.statusCode : 400;
      runtimeLog('http-error', `${request.method ?? 'GET'} ${request.url ?? ''}`, {
        statusCode,
        error: error?.stack ?? error?.message ?? String(error)
      });
      return json(response, statusCode, { error: error?.message ?? String(error) });
    }
  });

  server.on('close', () => cacheDb?.close());
  server.listen(options.port, '127.0.0.1', () => {
    logStartupTiming(`server listening port=${options.port}`);
    console.log(`BibleNote: http://127.0.0.1:${options.port}`);
    console.log(`Database: ${options.dbPath}`);
    console.log('Press Ctrl+C to stop.');
    startDbInit();
  });
  return server;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const options = parseArgs(process.argv.slice(2));
  const server = startCacheUi(options);
  process.once('SIGINT', () => server.close(() => process.exit(0)));
  process.once('SIGTERM', () => server.close(() => process.exit(0)));
}
