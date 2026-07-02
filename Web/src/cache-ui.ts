import './env.js';
import fs from 'node:fs';
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import path from 'node:path';
import { pathToFileURL, URL } from 'node:url';
import { bibleParseConfigFromEnv, getVerseTextWithBibleNote, parsePageWithBibleNote } from './bible.js';
import { cacheStatus, defaultDbPath, findParallelBibleReferenceNotes, findParallelBibleReferences, getCachedPage, getSyncState, openCacheDb, readCachedPage, searchCache } from './cache.js';
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
  <title>OneNote Cache Explorer</title>
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
    .sidebar { display:flex; flex-direction:column; min-width:0; min-height:0; height:100%; overflow:hidden; background:var(--sidebar); border-right:1px solid var(--line); }
    .app.sidebar-collapsed .sidebar { visibility:hidden; border:0; }
    .sidebar-resizer { position:relative; z-index:9; width:5px; cursor:col-resize; touch-action:none; background:transparent; }
    .sidebar-resizer::after { content:''; position:absolute; inset:0 2px; background:transparent; transition:background .14s; }
    .sidebar-resizer:hover::after, .sidebar-resizer.dragging::after, .sidebar-resizer:focus-visible::after { background:var(--accent); }
    .sidebar-resizer:focus-visible { outline:none; }
    .app.sidebar-collapsed .sidebar-resizer { pointer-events:none; }
    .sidebar-toggle { position:absolute; z-index:12; top:14px; left:calc(var(--sidebar-width) - 14px); display:grid; place-items:center; width:28px; height:28px; padding:0; border:1px solid var(--input-line); border-radius:8px; background:var(--panel); color:var(--summary); box-shadow:0 2px 8px rgba(20,16,26,.12); cursor:pointer; transition:left .16s, background .14s, color .14s; }
    .sidebar-toggle:hover, .sidebar-toggle:focus-visible { color:var(--accent); background:var(--accent-soft); outline:none; }
    .app.sidebar-collapsed .sidebar-toggle { left:10px; }
    .brand { padding:22px 22px 14px; }
    .brand-line { display:flex; align-items:center; justify-content:space-between; gap:12px; }
    .brand h1 { margin:0; font:700 21px/1.2 var(--title-font); letter-spacing:.2px; }
    .brand p { margin:7px 0 0; color:var(--muted); font-size:13px; }
    .theme-select { min-width:112px; padding:6px 8px; border:1px solid var(--input-line); border-radius:7px; background:var(--input-bg); color:var(--ink); font-size:11px; outline:none; cursor:pointer; }
    .theme-select:focus { border-color:var(--accent); box-shadow:0 0 0 2px color-mix(in srgb, var(--accent) 22%, transparent); }
    .brand-actions { display:flex; align-items:center; gap:7px; flex:none; }
    .settings-button { display:grid; place-items:center; width:31px; height:31px; padding:0; border:1px solid var(--input-line); border-radius:7px; background:var(--input-bg); color:var(--summary); cursor:pointer; }
    .settings-button:hover, .settings-button:focus-visible { border-color:var(--accent); color:var(--accent); outline:none; }
    .search-wrap { position:relative; padding:0 16px 14px; }
    .search-control { display:flex; align-items:center; gap:2px; min-width:0; padding:3px 4px 3px 10px; border:1px solid var(--input-line); border-radius:10px; background:var(--input-bg); }
    .search-control:focus-within { border-color:var(--accent); box-shadow:0 0 0 3px color-mix(in srgb, var(--accent) 16%, transparent); }
    .search { min-width:0; flex:1; padding:8px 3px; border:0; background:transparent; color:var(--ink); outline:none; }
    .search-option { display:grid; place-items:center; width:27px; height:27px; padding:0; border:1px solid transparent; border-radius:5px; background:transparent; color:var(--muted); font:600 11px/1 "Segoe UI", sans-serif; cursor:pointer; flex:none; }
    .search-option:hover { background:var(--hover); color:var(--ink); }
    .search-option[aria-pressed="true"] { border-color:var(--accent); background:var(--accent-soft); color:var(--accent); }
    .search-option:focus-visible { outline:1px solid var(--accent); outline-offset:1px; }
    .search-history-menu { position:absolute; z-index:30; left:16px; right:16px; top:43px; max-height:260px; overflow:auto; padding:5px; border:1px solid var(--input-line); border-radius:10px; background:var(--panel); box-shadow:0 12px 34px rgba(20,16,26,.24); }
    .search-history-menu.hidden { display:none; }
    .search-history-empty { padding:9px 10px; color:var(--muted); font-size:12px; }
    .search-history-row { display:flex; align-items:center; gap:7px; width:100%; min-height:31px; padding:6px 8px; border:0; border-radius:7px; background:transparent; color:var(--ink); text-align:left; cursor:pointer; }
    .search-history-row:hover, .search-history-row.active { background:var(--accent-soft); color:var(--selected-ink); }
    .search-history-text { min-width:0; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .search-history-remove { display:grid; place-items:center; width:22px; height:22px; border:0; border-radius:5px; background:transparent; color:var(--muted); cursor:pointer; flex:none; }
    .search-history-remove:hover { background:var(--hover); color:var(--danger); }
    .sync-panel, .settings-panel, .notebook-panel, .bible-panel, .log-panel { margin:0 16px; border:0; border-top:1px solid var(--line); background:transparent; overflow:visible; }
    .log-panel { border-bottom:1px solid var(--line); margin-bottom:10px; }
    .sync-panel summary, .settings-panel summary, .notebook-panel summary, .bible-panel summary, .log-panel summary { display:flex; align-items:center; min-height:42px; padding:10px 3px; cursor:pointer; color:var(--summary); font-weight:650; font-size:11px; letter-spacing:.055em; line-height:1.25; list-style:none; text-transform:uppercase; }
    .sync-panel summary:hover, .settings-panel summary:hover, .notebook-panel summary:hover, .bible-panel summary:hover, .log-panel summary:hover { color:var(--accent); }
    .sync-panel summary:focus-visible, .settings-panel summary:focus-visible, .notebook-panel summary:focus-visible, .bible-panel summary:focus-visible, .log-panel summary:focus-visible { outline:0; box-shadow:inset 2px 0 0 var(--accent); }
    .sync-panel summary::-webkit-details-marker, .settings-panel summary::-webkit-details-marker, .notebook-panel summary::-webkit-details-marker, .bible-panel summary::-webkit-details-marker, .log-panel summary::-webkit-details-marker { display:none; }
    .sync-panel summary::after, .settings-panel summary::after, .notebook-panel summary::after, .bible-panel summary::after, .log-panel summary::after { content:''; width:6px; height:6px; margin-left:auto; margin-right:3px; border-right:1.5px solid currentColor; border-bottom:1.5px solid currentColor; transform:rotate(45deg) translate(-1px, 1px); transition:transform .16s ease; opacity:.65; }
    .sync-panel[open] summary::after, .settings-panel[open] summary::after, .notebook-panel[open] summary::after, .bible-panel[open] summary::after, .log-panel[open] summary::after { transform:rotate(225deg) translate(-1px, 1px); }
    .sync-panel summary::before { content:'↻'; display:inline-block; margin-right:8px; color:var(--accent); }
    .settings-panel summary::before { content:'⚙'; display:inline-block; margin-right:8px; color:var(--accent); }
    .notebook-panel summary::before { content:'▤'; display:inline-block; margin-right:8px; color:var(--accent); }
    .bible-panel summary::before { content:'#'; display:inline-block; margin-right:8px; color:var(--accent); }
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
    .tree-shell { position:relative; flex:1; min-height:0; }
    .tree { height:100%; min-height:0; overflow-x:hidden; overflow-y:scroll; padding:0 20px 18px 10px; scrollbar-width:none; }
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
    .sidebar-footer { display:block; width:100%; border:0; border-top:1px solid var(--line); padding:11px 16px; color:var(--muted); font-size:12px; background:var(--surface-soft); text-align:left; cursor:pointer; }
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
    .page { max-width:920px; margin:0 auto; padding:42px 54px 80px; }
    .breadcrumbs { color:var(--muted); font-size:12px; margin-bottom:14px; }
    .page-heading { display:flex; align-items:flex-start; gap:12px; }
    .page h2 { flex:1; min-width:0; margin:0; font:700 34px/1.15 var(--title-font); }
    .title-sync { display:grid; place-items:center; width:34px; height:34px; margin-top:2px; border:1px solid transparent; border-radius:9px; background:transparent; color:var(--accent); font-size:21px; cursor:pointer; flex:none; }
    .title-sync:hover, .title-sync:focus { border-color:var(--input-line); background:var(--accent-soft); outline:none; }
    .title-sync:disabled { opacity:.45; cursor:wait; }
    .title-sync.syncing { animation:spin .85s linear infinite; }
    .meta { display:flex; flex-wrap:wrap; gap:8px 18px; margin:17px 0 30px; padding-bottom:18px; border-bottom:1px solid var(--line); color:var(--muted); font-size:12px; }
    .page-actions { display:flex; align-items:center; flex-wrap:wrap; gap:8px; margin:-15px 0 24px; }
    .bible-page-refs { margin:-12px 0 26px; padding:0; border-top:1px solid var(--line); border-bottom:1px solid var(--line); }
    .bible-page-refs summary { display:flex; align-items:center; min-height:42px; padding:10px 0; cursor:pointer; color:var(--summary); font-size:13px; font-weight:700; text-transform:uppercase; letter-spacing:.055em; list-style:none; }
    .bible-page-refs summary::-webkit-details-marker { display:none; }
    .bible-page-refs summary::after { content:''; width:7px; height:7px; margin-left:auto; border-right:1.5px solid currentColor; border-bottom:1.5px solid currentColor; transform:rotate(45deg) translate(-1px, 1px); transition:transform .16s ease; opacity:.65; }
    .bible-page-refs[open] summary::after { transform:rotate(225deg) translate(-1px, 1px); }
    .bible-paragraph { display:grid; gap:6px; padding:10px 0; border-top:1px solid color-mix(in srgb, var(--line) 70%, transparent); }
    .bible-paragraph:first-of-type { border-top:0; }
    .bible-ref-row { display:flex; flex-wrap:wrap; gap:6px; }
    .bible-chip { display:inline-flex; align-items:center; max-width:100%; padding:4px 7px; border:1px solid var(--input-line); border-radius:6px; background:var(--accent-soft); color:var(--selected-ink); font-size:12px; line-height:1.25; cursor:pointer; text-decoration:underline; text-underline-offset:2px; }
    .bible-chip:hover, .bible-chip:focus-visible { border-color:var(--accent); outline:none; }
    .bible-inline-ref { padding:1px 3px; border-radius:4px; background:var(--accent-soft); color:var(--selected-ink); font-weight:650; text-decoration:underline; text-decoration-thickness:1px; text-underline-offset:2px; cursor:pointer; }
    .bible-inline-ref:hover, .bible-inline-ref:focus-visible { outline:1px solid var(--accent); outline-offset:1px; }
    .bible-paragraph-target { display:inline; border-radius:5px; background:color-mix(in srgb, var(--accent) 16%, transparent); box-shadow:0 0 0 2px color-mix(in srgb, var(--accent) 55%, transparent); scroll-margin-top:80px; }
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
    .bible-parallel-note-card { display:grid; gap:7px; padding:8px; border:1px solid var(--input-line); border-radius:7px; background:var(--panel); }
    .bible-parallel-fragment { display:grid; gap:3px; width:100%; padding:7px 8px; border:1px solid color-mix(in srgb, var(--input-line) 70%, transparent); border-radius:6px; background:transparent; color:var(--ink); text-align:left; cursor:pointer; }
    .bible-parallel-fragment:hover, .bible-parallel-fragment:focus-visible { border-color:var(--accent); background:var(--accent-soft); outline:none; }
    .match-nav { position:sticky; z-index:7; top:10px; display:flex; align-items:center; gap:3px; width:max-content; margin:-18px 0 20px auto; padding:4px; border:1px solid var(--input-line); border-radius:8px; background:var(--panel); box-shadow:0 4px 16px rgba(20,16,26,.12); }
    .match-count { min-width:54px; padding:0 7px; color:var(--muted); font-size:12px; text-align:center; white-space:nowrap; }
    .match-button { display:grid; place-items:center; width:28px; height:28px; padding:0; border:0; border-radius:5px; background:transparent; color:var(--ink); font-size:17px; cursor:pointer; }
    .match-button:hover, .match-button:focus-visible { background:var(--accent-soft); color:var(--accent); outline:none; }
    .view-button { padding:8px 12px; border:1px solid var(--input-line); border-radius:8px; background:var(--accent-soft); color:var(--selected-ink); font-weight:650; cursor:pointer; }
    .view-button:hover { border-color:var(--accent); }
    .html-zoom { display:flex; align-items:center; gap:8px; padding:6px 10px; border:1px solid var(--input-line); border-radius:8px; background:var(--panel); color:var(--muted); font-size:12px; }
    .html-zoom input { width:130px; accent-color:var(--accent); }
    .html-zoom-value { min-width:42px; color:var(--ink); font-variant-numeric:tabular-nums; text-align:right; }
    .page-text { white-space:pre-wrap; font:16px/1.72 var(--reader-font); word-break:break-word; }
    .html-frame { display:none; width:100%; min-height:70vh; border:1px solid var(--line); border-radius:10px; background:white; }
    .error-box { margin:18px 0; padding:12px 14px; border-left:3px solid var(--danger); background:color-mix(in srgb, var(--danger) 13%, var(--panel)); color:var(--danger); }
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
    .settings-dialog-content { display:grid; gap:14px; min-height:0; overflow:auto; padding:14px 22px 18px; }
    #settingsMovedPanels { display:grid; gap:14px; }
    .settings-dialog-content .sync-panel, .settings-dialog-content .settings-panel, .settings-dialog-content .notebook-panel { margin:0; border:1px solid var(--line); border-radius:8px; background:var(--surface-soft); }
    .settings-dialog-content .sync-panel summary, .settings-dialog-content .settings-panel summary, .settings-dialog-content .notebook-panel summary { padding:11px 12px; }
    .settings-dialog-content .sync-form, .settings-dialog-content .sync-settings, .settings-dialog-content .notebook-controls { padding:2px 12px 13px; }
    .settings-module-section { display:grid; gap:10px; padding:12px; border:1px solid var(--line); border-radius:8px; background:var(--surface-soft); }
    .settings-module-section summary { display:flex; align-items:center; min-height:30px; color:var(--ink); cursor:pointer; font:700 15px/1.25 var(--title-font); list-style:none; }
    .settings-module-section summary::-webkit-details-marker { display:none; }
    .settings-module-section summary::after { content:''; width:7px; height:7px; margin-left:auto; border-right:1.5px solid currentColor; border-bottom:1.5px solid currentColor; transform:rotate(45deg) translate(-1px, 1px); transition:transform .16s ease; opacity:.65; }
    .settings-module-section[open] summary::after { transform:rotate(225deg) translate(-1px, 1px); }
    .settings-module-section[open] { display:grid; }
    .settings-row { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
    .settings-status { color:var(--muted); font-size:12px; line-height:1.45; white-space:pre-wrap; }
    .settings-file { max-width:100%; color:var(--muted); font-size:12px; }
    .settings-module-list { display:grid; gap:6px; max-height:210px; overflow:auto; padding:2px 1px; }
    .settings-module-option { display:flex; align-items:flex-start; gap:8px; padding:8px; border:1px solid var(--line); border-radius:7px; background:var(--panel); cursor:pointer; }
    .settings-module-option input { margin-top:2px; accent-color:var(--accent); }
    .settings-module-name { font-size:12px; font-weight:650; color:var(--ink); }
    .settings-module-meta { margin-top:2px; color:var(--muted); font-size:11px; line-height:1.35; }
    .settings-dialog-footer { padding:12px 22px 18px; border-top:1px solid var(--line); }
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
    .bible-text-body h2 { margin:0; font:700 22px/1.25 var(--title-font); }
    .bible-text-meta { color:var(--muted); font-size:12px; }
    .bible-text-content { max-height:min(56vh, 520px); overflow:auto; padding:12px 14px; border:1px solid var(--line); border-radius:8px; background:var(--surface-soft); font:16px/1.55 var(--reader-font); white-space:pre-wrap; }
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
      <h2 id="bibleTextTitle">Библейская ссылка</h2>
      <div id="bibleTextMeta" class="bible-text-meta"></div>
      <div id="bibleTextContent" class="bible-text-content"></div>
      <div id="bibleTextParallelPanel"></div>
      <button id="showBibleTextContext" class="dialog-button" type="button">Показать в контексте</button>
      <button id="showBibleTextParallel" class="dialog-button" type="button">Параллельные</button>
      <div class="name-dialog-actions">
        <button id="closeBibleText" class="dialog-button primary" type="button">Закрыть</button>
      </div>
    </div>
  </dialog>
  <dialog id="settingsDialog" class="settings-dialog">
    <div class="settings-dialog-body">
      <header class="settings-dialog-header">
        <h2>Параметры</h2>
        <p>Блокноты, синхронизация, BibleNote и обработка внешних библейских ссылок.</p>
      </header>
      <div id="settingsDialogContent" class="settings-dialog-content">
        <details class="settings-module-section">
          <summary>BibleNote</summary>
          <div id="bibleNoteStatus" class="settings-status">Статус BibleNote пока не проверен.</div>
          <label class="field">Основной модуль
            <input id="bibleModuleName" type="text" maxlength="80" placeholder="rst" autocomplete="off">
          </label>
          <div class="settings-row">
            <input id="bibleModuleFile" class="settings-file" type="file" accept=".bnm,.zip" multiple>
            <button id="uploadBibleModule" class="small-button" type="button" disabled>Загрузить модули</button>
          </div>
          <div id="bibleModulesList" class="settings-module-list"></div>
          <div id="bibleModuleStatus" class="settings-status"></div>
        </details>
        <details class="settings-module-section">
          <summary>Ссылки на Библию</summary>
          <div id="protocolStatus" class="settings-status">Статус обработчика ссылок пока не проверен.</div>
          <div class="settings-row">
            <button id="registerBibleProtocol" class="small-button" type="button">Зарегистрировать обработчик</button>
          </div>
        </details>
        <details class="settings-module-section">
          <summary>Просмотр заметок</summary>
          <label class="field">Открывать страницу
            <select id="pageViewMode">
              <option value="text">Текст</option>
              <option value="html">HTML, если загружен</option>
            </select>
          </label>
          <label class="field">Масштаб HTML по умолчанию
            <input id="defaultHtmlZoom" type="number" min="50" max="200" step="10">
          </label>
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
          <h1>OneNote Cache</h1>
          <div class="brand-actions">
          <button id="openSettings" class="settings-button" type="button" aria-label="Параметры" title="Параметры">⚙</button>
          <select id="themeSelect" class="theme-select" aria-label="Тема интерфейса">
            <option value="a">A · Тёплая</option>
            <option value="b">B · Светлая</option>
            <option value="c">C · Тёмная</option>
          </select>
          </div>
        </div>
        <p>Локальный read-only обозреватель</p>
      </header>
      <div class="search-wrap">
        <div class="search-control">
          <input id="search" class="search" type="search" placeholder="Поиск по заголовкам и тексту…" autocomplete="off">
          <button id="searchHistory" class="search-option" type="button" aria-label="История поиска" aria-expanded="false" title="История поиска (↑/↓)">⌄</button>
          <button id="searchCase" class="search-option" type="button" aria-label="Учитывать регистр" aria-pressed="false" title="Учитывать регистр (Aa)">Aa</button>
          <button id="searchPhrase" class="search-option" type="button" aria-label="Искать всю фразу" aria-pressed="false" title="Искать всю фразу">“ ”</button>
          <button id="searchRegex" class="search-option" type="button" aria-label="Использовать регулярное выражение" aria-pressed="false" title="Использовать регулярное выражение (.*)">.*</button>
        </div>
        <div id="searchHistoryMenu" class="search-history-menu hidden" role="listbox" aria-label="История поиска"></div>
      </div>
      <details class="notebook-panel">
        <summary id="notebookSummary">Блокноты</summary>
        <div class="notebook-controls">
          <div class="notebook-actions">
            <button id="selectAllNotebooks" class="small-button" type="button">Выбрать все</button>
            <button id="clearAllNotebooks" class="small-button" type="button">Снять все</button>
          </div>
          <div id="notebookList" class="notebook-list"></div>
        </div>
      </details>
      <details class="bible-panel">
        <summary id="bibleSummary">Библейские ссылки</summary>
        <div class="bible-controls">
          <input id="bibleQuery" class="log-filter" type="search" placeholder="Ин 3:16">
          <button id="bibleSearch" class="small-button" type="button">Найти</button>
        </div>
        <div id="bibleStats" class="sync-state"></div>
        <div id="bibleResults" class="bible-list"></div>
      </details>
      <details class="settings-panel">
        <summary id="syncSettingsSummary">Параметры синхронизации</summary>
        <div class="sync-settings">
          <p id="syncSettingsNote" class="settings-note">Применяются к полной синхронизации и ко всем кнопкам ↻ в дереве.</p>
          <div class="sync-grid">
            <label class="field">Максимум страниц<input id="syncMaxPages" type="number" min="1" placeholder="Все"></label>
            <label class="field">Параллельность<select id="syncConcurrency"><option>1</option><option selected>2</option><option>3</option></select></label>
            <label class="field">Обновить старше, ч.<input id="syncRefreshHours" type="number" min="0" placeholder="Не обновлять"></label>
          </div>
          <label class="check"><input id="syncMetadataOnly" type="checkbox">Только метаданные</label>
          <label class="check"><input id="syncForceContent" type="checkbox">Перезагрузить весь контент</label>
          <label class="check"><input id="syncIncludeHtml" type="checkbox">Сохранять HTML</label>
          <label class="check"><input id="syncParseBibleRefs" type="checkbox">Распознать библейские ссылки</label>
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
      <div class="tree-shell">
        <nav id="tree" class="tree" aria-label="Структура OneNote"></nav>
        <div id="treeScrollbar" class="custom-scrollbar" role="scrollbar" aria-label="Прокрутка дерева OneNote" aria-controls="tree" tabindex="0"><div class="custom-scrollbar-thumb"></div></div>
      </div>
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
    const showBibleTextContextButton = document.getElementById('showBibleTextContext');
    const showBibleTextParallelButton = document.getElementById('showBibleTextParallel');
    const closeBibleTextButton = document.getElementById('closeBibleText');
    const notebookListEl = document.getElementById('notebookList');
    const notebookSummaryEl = document.getElementById('notebookSummary');
    const syncNotebookSelectionEl = document.getElementById('syncNotebookSelection');
    const selectAllNotebooksButton = document.getElementById('selectAllNotebooks');
    const clearAllNotebooksButton = document.getElementById('clearAllNotebooks');
    const bibleSummaryEl = document.getElementById('bibleSummary');
    const bibleQueryEl = document.getElementById('bibleQuery');
    const bibleSearchButton = document.getElementById('bibleSearch');
    const bibleStatsEl = document.getElementById('bibleStats');
    const bibleResultsEl = document.getElementById('bibleResults');
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
    let searchTimer;
    let searchHistoryTimer;

    let activeSearchQuery = '';
    let searchOptions = loadSearchOptions();
    let searchHistory = loadSearchHistory();
    let searchHistoryIndex = -1;
    let searchHistoryDraft = '';
    let syncPollTimer;
    let syncRunning = false;
    let activeSyncContext = null;
    let currentBibleTextRef = null;
    let currentTargetParagraphIndex;
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
      bibleModuleNameInput.value = localStorage.getItem('onenote.bibleModule') || 'rst';
      pageViewModeSelect.value = defaultPageViewMode();
      defaultHtmlZoomInput.value = String(defaultHtmlZoom());
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
      if (!downloadLogDialog.open) downloadLogDialog.showModal();
      loadDownloadLog(false).catch(showError);
    }

    function currentBibleModule() {
      return (bibleModuleNameInput.value || 'rst').trim() || 'rst';
    }

    function saveBibleModuleSetting() {
      localStorage.setItem('onenote.bibleModule', currentBibleModule());
    }

    function defaultPageViewMode() {
      return localStorage.getItem('onenote.pageViewMode') === 'html' ? 'html' : 'text';
    }

    function defaultHtmlZoom() {
      return clampHtmlZoom(localStorage.getItem('onenote.defaultHtmlZoom'));
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

    function openSettingsDialog() {
      if (!settingsDialog.open) settingsDialog.showModal();
      refreshBibleNoteSettings().catch(error => {
        bibleNoteStatusEl.textContent = 'Не удалось проверить BibleNote: ' + error.message;
      });
      refreshProtocolSettings().catch(error => {
        protocolStatusEl.textContent = 'Не удалось проверить обработчик ссылок: ' + error.message;
      });
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
        bibleModulesListEl.textContent = result.error || 'Не удалось получить список модулей.';
        return;
      }
      const modules = Array.isArray(result.modules) ? result.modules : [];
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
        title.textContent = [module.shortName, module.displayName].filter(Boolean).join(' · ') || '(без имени)';
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

    async function uploadBibleModule() {
      const files = [...(bibleModuleFileInput.files || [])];
      if (files.length === 0) {
        bibleModuleStatusEl.textContent = 'Выберите файл модуля .bnm.';
        updateBibleModuleUploadState();
        return;
      }
      uploadBibleModuleButton.disabled = true;
      bibleModuleStatusEl.textContent = 'Загрузка модулей: 0/' + files.length;
      try {
        const installed = [];
        for (let index = 0; index < files.length; index += 1) {
          const file = files[index];
          bibleModuleStatusEl.textContent = 'Загрузка модулей: ' + index + '/' + files.length + ' · ' + file.name;
          const contentBase64 = arrayBufferToBase64(await file.arrayBuffer());
          const result = await api('/api/biblenote/modules/upload', {
            method:'POST',
            headers:{ 'Content-Type':'application/json' },
            body:JSON.stringify({ fileName:file.name, contentBase64 })
          });
          if (result.moduleName) installed.push(result.moduleName);
        }
        if (installed.length > 0) {
          bibleModuleNameInput.value = installed[installed.length - 1];
          saveBibleModuleSetting();
        }
        bibleModuleStatusEl.textContent = 'Загружено модулей: ' + installed.length + '/' + files.length;
        bibleModuleFileInput.value = '';
        await refreshBibleNoteSettings();
      } catch (error) {
        bibleModuleStatusEl.textContent = 'Не удалось загрузить модуль: ' + error.message;
      } finally {
        updateBibleModuleUploadState();
      }
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
    registerBibleProtocolButton.addEventListener('click', () => registerBibleProtocol().catch(showError));
    pageViewModeSelect.addEventListener('change', savePageViewSettings);
    defaultHtmlZoomInput.addEventListener('change', savePageViewSettings);
    statusEl.addEventListener('click', openDownloadLogDialog);
    closeDownloadLogButton.addEventListener('click', () => downloadLogDialog.close());
    downloadLogDialog.addEventListener('cancel', () => downloadLogDialog.close());

    async function api(path, options) {
      const response = await fetch(path, options);
      const body = await response.json();
      if (!response.ok) {
        const error = new Error(body.error || 'Request failed');
        error.status = response.status;
        throw error;
      }
      if (!response.ok) throw new Error(body.error || 'Ошибка запроса');
      return body;
    }

    function pageHtmlFrameSrcdoc(rawHtml) {
      const normalizeBibleHref = href => String(href || '').trim().replace(/^https?:\/\/isbtBibleVerse:/i, 'isbtBibleVerse:');
      const isBibleHref = href => {
        const value = normalizeBibleHref(href);
        if (/^isbtBibleVerse:/i.test(value)) return true;
        try {
          return /^isbtBibleVerse:/i.test(normalizeBibleHref(decodeURIComponent(value)));
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
      const bridgeScript = [
        '<scr' + 'ipt>',
        '(function(){',
        'function decodeSafe(value){try{return decodeURIComponent(value);}catch(error){return value;}}',
        'function normalizeBibleHref(href){return String(href||"").trim().replace(/^https?:\\/\\/isbtBibleVerse:/i,"isbtBibleVerse:");}',
        'function isBibleHref(href){return /^isbtBibleVerse:/i.test(normalizeBibleHref(href))||/^isbtBibleVerse:/i.test(normalizeBibleHref(decodeSafe(href||"")));}',
        'function sendBibleLink(href){parent.postMessage({type:"onenote-bible-link",href:normalizeBibleHref(decodeSafe(href))},"*");}',
        'document.addEventListener("click",function(event){',
        'var target=event.target;',
        'var link=target&&target.closest?target.closest("a[href]"):null;',
        'if(!link)return;',
        'var href=link.getAttribute("data-onenote-bible-href")||link.getAttribute("href")||"";',
        'if(isBibleHref(href)){event.preventDefault();event.stopPropagation();sendBibleLink(href);}',
        '},true);',
        'window.addEventListener("message",function(event){',
        'var data=event.data||{};',
        'if(data.type==="onenote-html-zoom"){document.documentElement.style.zoom=String(data.zoom||1);}',
        '});',
        '}());',
        '</scr' + 'ipt>'
      ].join('');
      doc.body.insertAdjacentHTML('beforeend', bridgeScript);
      return '<!doctype html>\n' + doc.documentElement.outerHTML;
    }

    function postHtmlFrameZoom(frame, percent) {
      const zoom = Math.max(50, Math.min(200, Number(percent) || 100)) / 100;
      frame?.contentWindow?.postMessage({ type:'onenote-html-zoom', zoom }, '*');
    }

    async function openBibleRef(rawRef) {
      const normalizedRef = String(rawRef || '').trim().replace(/^https?:\/\/isbtBibleVerse:/i, 'isbtBibleVerse:');
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
      notebookSummaryEl.textContent = 'Блокноты: ' + selected.length + '/' + notebooksCache.length;
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
          searchBibleRefs().catch(showError);
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

    async function loadBibleStats() {
      const stats = await api('/api/bible/stats');
      bibleSummaryEl.textContent = 'Библейские ссылки: ' + stats.references;
      bibleStatsEl.textContent = stats.paragraphs + ' абзацев · ' + stats.pages + ' страниц · ' + stats.errors + ' ' + pluralRu(stats.errors, 'ошибка', 'ошибки', 'ошибок');
    }

    async function searchBibleRefs() {
      const query = bibleQueryEl.value.trim();
      bibleResultsEl.replaceChildren();
      const selectedIds = selectedNotebookIds();
      if (selectedIds.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'search-heading';
        empty.textContent = 'Не выбраны блокноты';
        bibleResultsEl.append(empty);
        return;
      }
      const params = new URLSearchParams({ limit:'80' });
      if (query) params.set('q', query);
      for (const notebookId of selectedIds) params.append('notebookId', notebookId);
      const result = await api('/api/bible/search?' + params.toString());
      bibleStatsEl.textContent = result.total + ' ' + pluralRu(result.total, 'совпадение', 'совпадения', 'совпадений');
      if (result.rows.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'search-heading';
        empty.textContent = 'Ничего не найдено';
        bibleResultsEl.append(empty);
        return;
      }
      for (const item of result.rows) {
        const block = document.createElement('div');
        block.className = 'log-row';
        block.addEventListener('click', () => openPage(item.pageId, { paragraphIndex:item.paragraphIndex }).catch(showError));
        const title = document.createElement('div');
        title.className = 'log-title';
        const badge = document.createElement('span');
        badge.className = 'log-badge downloaded';
        const link = document.createElement('button');
        link.className = 'bible-chip';
        link.type = 'button';
        link.textContent = item.normalizedRef || item.originalText || '(ссылка)';
        link.title = 'Показать текст стиха';
        link.addEventListener('click', event => {
          event.stopPropagation();
          showBibleText({
            normalizedRef:item.normalizedRef,
            originalText:item.originalText,
            bookIndex:item.bookIndex,
            chapter:item.chapter,
            verse:item.verse
          }).catch(showError);
        });
        title.append(badge, link);
        const path = document.createElement('div');
        path.className = 'log-path';
        path.textContent = [item.notebook, item.section, item.pageTitle, Number.isInteger(item.paragraphIndex) ? 'абзац ' + (item.paragraphIndex + 1) : ''].filter(Boolean).join(' / ');
        const detail = document.createElement('div');
        detail.className = 'log-detail';
        detail.textContent = item.paragraphText || '';
        block.append(title, path, detail);
        bibleResultsEl.append(block);
      }
    }

    bibleSearchButton.addEventListener('click', () => searchBibleRefs().catch(showError));
    bibleQueryEl.addEventListener('keydown', event => {
      if (event.key === 'Enter') searchBibleRefs().catch(showError);
    });

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
        button.onclick = () => openPage(page.id);
        target.append(button);
      }
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
      for (const notebookId of selectedIds) params.append('notebookId', notebookId);
      const results = await api('/api/search?' + params.toString());
      if (!results.length) {
        const empty = document.createElement('div');
        empty.className = 'search-heading';
        empty.textContent = 'Ничего не найдено';
        tree.append(empty);
      }
      for (const page of results) {
        const button = row(page.title, 0, {
          selected:page.id === selectedPageId,
          title:[page.notebook, page.section].filter(Boolean).join(' / '),
          syncLabel:'Синхронизировать страницу «' + page.title + '»',
          onSync:() => startTargetedSync({ pageId:page.id }, 'страницу «' + page.title + '»')
        });
        button.onclick = () => openPage(page.id);
        tree.append(button);
      }
    }

    async function openPage(id, options = {}) {
      selectedPageId = id;
      const targetParagraphIndex = Number.isInteger(options.paragraphIndex) ? options.paragraphIndex : paragraphIndexFromUrl();
      currentTargetParagraphIndex = targetParagraphIndex;
      if (options.updateUrl !== false) updatePageUrl(id, options.replaceUrl === true, targetParagraphIndex);
      const page = await api('/api/page?id=' + encodeURIComponent(id));
      content.replaceChildren();
      content.scrollTop = 0;
      const article = document.createElement('article');
      article.className = 'page';
      const crumbs = document.createElement('div');
      crumbs.className = 'breadcrumbs';
      crumbs.textContent = [page.parentNotebook?.displayName, page.parentSection?.displayName].filter(Boolean).join('  /  ');
      const title = document.createElement('h2');
      const titleMatches = appendHighlightedText(title, page.title || '(без названия)', activeSearchQuery);
      const heading = document.createElement('div');
      heading.className = 'page-heading';
      const syncPageButton = document.createElement('button');
      syncPageButton.className = 'title-sync' + (syncRunning && activeSyncContext?.pageId === page.id ? ' syncing' : '');
      syncPageButton.type = 'button';
      syncPageButton.disabled = syncRunning;
      syncPageButton.textContent = '↻';
      syncPageButton.title = 'Синхронизировать страницу';
      syncPageButton.setAttribute('aria-label', 'Синхронизировать страницу «' + (page.title || 'без названия') + '»');
      syncPageButton.addEventListener('click', () => {
        if (!syncRunning) startTargetedSync({ pageId:page.id }, 'страницу «' + page.title + '»');
      });
      heading.append(title, syncPageButton);
      const meta = document.createElement('div');
      meta.className = 'meta';
      meta.append(metaItem('Изменена', formatDate(page.lastModifiedDateTime)), metaItem('Синхронизирована', formatDate(page.contentSyncedAt)), metaItem('ID', page.id));
      article.append(crumbs, heading, meta);
      if (page.fetchError) {
        const error = document.createElement('div');
        error.className = 'error-box';
        error.textContent = page.fetchError;
        article.append(error);
      }
      const bibleRefs = await api('/api/bible/page?id=' + encodeURIComponent(page.id));
      if (bibleRefs.paragraphs.length > 0) {
        article.append(renderBiblePageRefs(bibleRefs));
      }
      const text = document.createElement('div');
      text.className = 'page-text';
      const matches = [
        ...titleMatches,
        ...appendPageTextWithBibleRefs(text, page.text || 'Текст страницы ещё не загружен.', activeSearchQuery, bibleRefs)
      ];
      let activeMatchIndex = 0;
      let matchCount;
      const goToMatch = (index, smooth = true) => {
        if (matches.length === 0) return;
        matches[activeMatchIndex]?.classList.remove('current-match');
        activeMatchIndex = (index + matches.length) % matches.length;
        const match = matches[activeMatchIndex];
        match.classList.add('current-match');
        matchCount.textContent = (activeMatchIndex + 1) + ' / ' + matches.length;
        match.scrollIntoView({ block:'center', behavior:smooth ? 'smooth' : 'auto' });
      };
      if (matches.length > 0) {
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
      let openDefaultHtmlView;
      if (page.hasHtml) {
        const actions = document.createElement('div');
        actions.className = 'page-actions';
        const htmlButton = document.createElement('button');
        htmlButton.className = 'view-button';
        htmlButton.type = 'button';
        htmlButton.textContent = 'Показать HTML';
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
        let htmlFrame;
        let showingHtml = false;
        zoomRange.addEventListener('input', () => {
          zoomValue.textContent = zoomRange.value + '%';
          postHtmlFrameZoom(htmlFrame, Number(zoomRange.value));
        });
        const setHtmlView = async showHtml => {
          try {
            if (!htmlFrame) {
              htmlButton.disabled = true;
              htmlButton.textContent = 'Загрузка HTML…';
              const result = await api('/api/page-html?id=' + encodeURIComponent(page.id));
              htmlFrame = document.createElement('iframe');
              htmlFrame.className = 'html-frame';
              htmlFrame.title = 'HTML: ' + (page.title || 'страница OneNote');
              htmlFrame.setAttribute('sandbox', 'allow-scripts');
              htmlFrame.referrerPolicy = 'no-referrer';
              htmlFrame.addEventListener('load', () => postHtmlFrameZoom(htmlFrame, Number(zoomRange.value)));
              htmlFrame.srcdoc = pageHtmlFrameSrcdoc(result.html);
              text.after(htmlFrame);
              htmlButton.disabled = false;
            }
            showingHtml = showHtml;
            text.style.display = showingHtml ? 'none' : '';
            htmlFrame.style.display = showingHtml ? 'block' : 'none';
            if (showingHtml) postHtmlFrameZoom(htmlFrame, Number(zoomRange.value));
            htmlButton.textContent = showingHtml ? 'Показать текст' : 'Показать HTML';
          } catch (error) {
            htmlButton.disabled = false;
            htmlButton.textContent = 'Показать HTML';
            showError(error);
          }
        };
        htmlButton.addEventListener('click', () => {
          setHtmlView(!showingHtml).catch(showError);
        });
        openDefaultHtmlView = () => setHtmlView(true);
        actions.append(htmlButton, zoomLabel);
        article.append(actions);
      }
      article.append(text);
      content.append(article);
      if (openDefaultHtmlView && defaultPageViewMode() === 'html') {
        openDefaultHtmlView().catch(showError);
      }
      if (matches.length > 0) requestAnimationFrame(() => goToMatch(0, false));
      if (Number.isInteger(targetParagraphIndex)) {
        requestAnimationFrame(() => {
          document.getElementById('paragraph-' + targetParagraphIndex)?.scrollIntoView({ block:'center', behavior:'smooth' });
        });
      }
      if (searchInput.value.trim()) renderSearch(searchInput.value.trim()); else renderTree();
    }

    function renderBiblePageRefs(data) {
      const section = document.createElement('details');
      section.className = 'bible-page-refs';
      const refsCount = data.paragraphs.reduce((sum, paragraph) => sum + paragraph.references.length, 0);
      const heading = document.createElement('summary');
      heading.textContent = 'Библейские ссылки';
      heading.textContent = 'Библейские ссылки: ' + refsCount;
      section.append(heading);
      for (const paragraph of data.paragraphs) {
        const block = document.createElement('div');
        block.className = 'bible-paragraph';
        const row = document.createElement('div');
        row.className = 'bible-ref-row';
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
        }
        const snippet = document.createElement('div');
        snippet.className = 'bible-snippet';
        snippet.textContent = paragraph.text;
        block.append(row, snippet);
        section.append(block);
      }
      return section;
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
      return '/api/bible/text?' + params.toString();
    }

    async function showBibleText(ref) {
      if (!ref.bookIndex || !ref.chapter) return;
      currentBibleTextRef = ref;
      bibleTextParallelPanel.replaceChildren();
      showBibleTextContextButton.hidden = !ref.verse;
      showBibleTextContextButton.disabled = !ref.verse;
      showBibleTextParallelButton.disabled = false;
      bibleTextTitle.textContent = ref.normalizedRef || ref.originalText || 'Библейская ссылка';
      bibleTextMeta.textContent = 'BibleNote';
      bibleTextContent.textContent = 'Загрузка...';
      if (!bibleTextDialog.open) bibleTextDialog.showModal();

      const result = await api(bibleTextUrl(ref));
      bibleTextTitle.textContent = result.reference || ref.normalizedRef || ref.originalText || 'Библейская ссылка';
      bibleTextMeta.textContent = [result.moduleName || result.module, result.bookName].filter(Boolean).join(' · ');
      bibleTextContent.textContent = result.text || 'Текст не найден.';
    }

    async function showBibleTextContext() {
      if (!currentBibleTextRef?.verse) return;
      showBibleTextContextButton.disabled = true;
      bibleTextContent.textContent = 'Загрузка контекста...';
      const result = await api(bibleTextUrl({ ...currentBibleTextRef, contextVerses:10 }));
      bibleTextTitle.textContent = (result.reference || currentBibleTextRef.normalizedRef || currentBibleTextRef.originalText || 'Библейская ссылка') + ' · контекст';
      bibleTextMeta.textContent = [result.moduleName || result.module, result.bookName, '10 стихов до и после'].filter(Boolean).join(' · ');
      bibleTextContent.textContent = result.text || 'Текст не найден.';
    }

    async function openExternalBibleRefFromUrl() {
      const rawRef = new URLSearchParams(location.search).get('openBibleRef');
      if (!rawRef) return;
      await openBibleRef(rawRef);
      history.replaceState(null, '', selectedPageId ? pageUrl(selectedPageId, currentTargetParagraphIndex) : '/');
    }

    function appendPageTextWithBibleRefs(container, pageText, query, bibleRefs) {
      const ranges = bibleTextRanges(pageText, bibleRefs);
      if (ranges.length === 0) return appendHighlightedText(container, pageText, query);

      const matches = [];
      let cursor = 0;
      for (const range of ranges) {
        if (range.start > cursor) {
          const span = document.createElement('span');
          matches.push(...appendHighlightedText(span, pageText.slice(cursor, range.start), query));
          container.append(span);
        }

        const link = document.createElement('a');
        link.className = 'bible-inline-ref';
        link.href = bibleTextUrl(range.ref);
        link.title = 'Показать текст стиха';
        link.addEventListener('click', event => {
          event.preventDefault();
          showBibleText(range.ref).catch(showError);
        });
        matches.push(...appendHighlightedText(link, pageText.slice(range.start, range.end), query));
        container.append(link);
        cursor = range.end;
      }

      if (cursor < pageText.length) {
        const span = document.createElement('span');
        matches.push(...appendHighlightedText(span, pageText.slice(cursor), query));
        container.append(span);
      }
      return matches;
    }

    function appendPageTextWithBibleRefs(container, pageText, query, bibleRefs) {
      const ranges = bibleTextRanges(pageText, bibleRefs);
      const targetParagraph = bibleParagraphRanges(pageText, bibleRefs).find(item => item.index === currentTargetParagraphIndex);
      if (ranges.length === 0 && !targetParagraph) return appendHighlightedText(container, pageText, query);

      const matches = [];
      const points = new Set([0, pageText.length]);
      for (const range of ranges) {
        points.add(range.start);
        points.add(range.end);
      }
      if (targetParagraph) {
        points.add(targetParagraph.start);
        points.add(targetParagraph.end);
      }

      const sortedPoints = [...points].sort((a, b) => a - b);
      let paragraphWrapper = null;
      for (let pointIndex = 0; pointIndex < sortedPoints.length - 1; pointIndex++) {
        const start = sortedPoints[pointIndex];
        const end = sortedPoints[pointIndex + 1];
        if (start >= end) continue;

        if (targetParagraph && start === targetParagraph.start) {
          paragraphWrapper = document.createElement('span');
          paragraphWrapper.id = 'paragraph-' + targetParagraph.index;
          paragraphWrapper.className = 'bible-paragraph-target';
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

        if (targetParagraph && end === targetParagraph.end && paragraphWrapper) {
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

    async function loadParallelRefsLegacy(ref, block) {
      block.querySelectorAll('.bible-parallel').forEach(item => item.remove());
      if (!ref.bookIndex || !ref.chapter) return;
      const params = new URLSearchParams({
        bookIndex:String(ref.bookIndex),
        chapter:String(ref.chapter),
        limit:'20'
      });
      if (ref.verse) params.set('verse', String(ref.verse));
      const result = await api('/api/bible/parallel?' + params.toString());
      const panel = document.createElement('div');
      panel.className = 'bible-parallel';
      if (result.rows.length === 0) {
        panel.textContent = 'Параллельных ссылок пока нет.';
      } else {
        panel.textContent = result.rows.map(item => {
          const score = Number(item.relationWeight || 0).toFixed(2);
          return item.normalizedRef + ' (вес ' + score + ', связей ' + item.relations + ')';
        }).join(', ');
      }
      block.append(panel);
    }

    function parallelParams(ref) {
      const params = new URLSearchParams({
        bookIndex:String(ref.bookIndex),
        chapter:String(ref.chapter),
        limit:'30'
      });
      if (ref.verse) params.set('verse', String(ref.verse));
      return params;
    }

    function parallelNotesParams(targetRef, relatedRef) {
      const params = new URLSearchParams({
        bookIndex:String(targetRef.bookIndex),
        chapter:String(targetRef.chapter),
        relatedBookIndex:String(relatedRef.bookIndex),
        relatedChapter:String(relatedRef.chapter),
        limit:'50'
      });
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
      for (const note of result.rows) {
        const button = document.createElement('button');
        button.className = 'bible-parallel-note';
        button.type = 'button';
        button.addEventListener('click', () => {
          if (bibleTextDialog.open) bibleTextDialog.close();
          openPage(note.pageId).catch(showError);
        });
        const title = document.createElement('div');
        title.className = 'bible-parallel-note-title';
        title.textContent = note.pageTitle || '(без названия)';
        const meta = document.createElement('div');
        meta.className = 'bible-parallel-note-meta';
        meta.textContent = [note.notebook, note.section, 'индекс ' + Number(note.relationWeight || 0).toFixed(2)].filter(Boolean).join(' · ');
        const text = document.createElement('div');
        text.className = 'bible-parallel-note-text';
        const target = compactText(note.targetParagraphText);
        const related = note.relatedParagraphText === note.targetParagraphText ? '' : compactText(note.relatedParagraphText);
        text.textContent = related ? target + '\n' + related : target;
        button.append(title, meta, text);
        host.append(button);
      }
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

    async function loadParallelRefs(ref, block) {
      block.querySelectorAll('.bible-parallel').forEach(item => item.remove());
      if (!ref.bookIndex || !ref.chapter) return;
      const panel = document.createElement('div');
      panel.className = 'bible-parallel';
      const title = document.createElement('div');
      title.className = 'bible-parallel-title';
      title.textContent = 'Параллельные ссылки для ' + (ref.normalizedRef || ref.originalText);
      panel.append(title);
      const loading = document.createElement('div');
      loading.className = 'bible-parallel-meta';
      loading.textContent = 'Загрузка...';
      panel.append(loading);
      block.append(panel);

      const result = await api('/api/bible/parallel?' + parallelParams(ref).toString());
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
        row.append(head, notes);
        list.append(row);
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
      return {
        maxPages: maxPagesValue ? Number(maxPagesValue) : undefined,
        concurrency: Number(document.getElementById('syncConcurrency').value),
        refreshOlderThanHours: refreshValue ? Number(refreshValue) : undefined,
        metadataOnly: document.getElementById('syncMetadataOnly').checked,
        forceContent: document.getElementById('syncForceContent').checked,
        includeHtml: document.getElementById('syncIncludeHtml').checked,
        parseBibleRefs: document.getElementById('syncParseBibleRefs').checked,
        forceBibleParse: document.getElementById('syncForceBibleParse').checked,
        bibleModule: currentBibleModule()
      };
    }

    function updateSyncSettingsPresentation() {
      const settings = currentSyncSettings();
      for (const id of ['syncMaxPages', 'syncConcurrency', 'syncRefreshHours', 'syncMetadataOnly']) {
        document.getElementById(id).disabled = syncRunning;
      }
      document.getElementById('syncForceContent').disabled = syncRunning || settings.metadataOnly;
      document.getElementById('syncIncludeHtml').disabled = syncRunning || settings.metadataOnly;
      document.getElementById('syncParseBibleRefs').disabled = syncRunning || settings.metadataOnly;
      document.getElementById('syncForceBibleParse').disabled = syncRunning || settings.metadataOnly || !settings.parseBibleRefs;
      syncSettingsSummaryEl.textContent = settings.metadataOnly
        ? 'Параметры синхронизации · только метаданные'
        : settings.parseBibleRefs
          ? 'Параметры синхронизации · BibleNote'
          : settings.includeHtml
            ? 'Параметры синхронизации · с HTML'
            : 'Параметры синхронизации';
      syncSettingsNoteEl.textContent = settings.metadataOnly
        ? 'Контент и HTML не скачиваются. Настройка применяется ко всем вариантам синхронизации.'
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
        const settings = JSON.parse(localStorage.getItem('onenote.syncSettings') || '{}');
        if (Number.isInteger(settings.maxPages) && settings.maxPages > 0) document.getElementById('syncMaxPages').value = String(settings.maxPages);
        if ([1, 2, 3].includes(settings.concurrency)) document.getElementById('syncConcurrency').value = String(settings.concurrency);
        if (Number.isInteger(settings.refreshOlderThanHours) && settings.refreshOlderThanHours >= 0) document.getElementById('syncRefreshHours').value = String(settings.refreshOlderThanHours);
        document.getElementById('syncMetadataOnly').checked = settings.metadataOnly === true;
        document.getElementById('syncForceContent').checked = settings.forceContent === true;
        document.getElementById('syncIncludeHtml').checked = settings.includeHtml === true;
        document.getElementById('syncParseBibleRefs').checked = settings.parseBibleRefs === true;
        document.getElementById('syncForceBibleParse').checked = settings.forceBibleParse === true;
        if (typeof settings.bibleModule === 'string' && settings.bibleModule.trim()) bibleModuleNameInput.value = settings.bibleModule.trim();
      } catch {
        localStorage.removeItem('onenote.syncSettings');
      }
      updateSyncSettingsPresentation();
    }

    for (const id of ['syncMaxPages', 'syncConcurrency', 'syncRefreshHours', 'syncMetadataOnly', 'syncForceContent', 'syncIncludeHtml', 'syncParseBibleRefs', 'syncForceBibleParse']) {
      document.getElementById(id).addEventListener('change', saveSyncSettings);
    }

    async function submitSync(payload, label, context = {}) {
      if (syncRunning) return;
      activeSyncContext = { ...context, label };
      updateSyncControls(true);
      syncStateEl.textContent = 'Запуск: ' + label;
      showActivity('Синхронизация: ' + label + '…', 'running', true);
      try {
        await api('/api/sync', {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify(payload)
        });
        await refreshSyncState();
      } catch (error) {
        updateSyncControls(false);
        activeSyncContext = null;
        syncStateEl.textContent = error.message;
        showActivity('Ошибка синхронизации: ' + error.message, 'error');
      }
    }

    function startTargetedSync(scope, label) {
      const payload = { ...currentSyncSettings(), ...scope };
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
      await submitSync({ ...currentSyncSettings(), notebookIds }, 'выбранные блокноты', { notebookIds });
    });

    async function refreshSyncState() {
      clearTimeout(syncPollTimer);
      const state = await api('/api/sync');
      const running = state.status === 'running';
      updateSyncControls(running);
      syncButton.textContent = running ? 'Синхронизация выполняется…' : 'Запустить синхронизацию';
      if (running) {
        const progress = state.progress || {};
        const parts = [progress.message || progress.phase || 'Подготовка'];
        if (progress.sectionGroups != null) parts.push('групп разделов: ' + progress.sectionGroups);
        if (progress.sections != null) parts.push('разделов: ' + progress.sections);
        if (progress.pages != null) parts.push('страниц: ' + progress.pages);
        if (progress.contentDone != null && progress.contentTotal != null) parts.push('контент: ' + progress.contentDone + '/' + progress.contentTotal);
        if (progress.bibleParseDone != null && progress.bibleParseTotal != null) parts.push('BibleNote: ' + progress.bibleParseDone + '/' + progress.bibleParseTotal);
        if (progress.bibleRefsRecognized != null) parts.push('ссылок: ' + progress.bibleRefsRecognized);
        if (progress.errors) parts.push('ошибок: ' + progress.errors);
        syncStateEl.textContent = parts.join(' · ');
        showActivity(parts.join(' · '), 'running', true);
        await loadDownloadLog(false);
        syncPollTimer = setTimeout(() => refreshSyncState().catch(showError), 700);
      } else if (state.status === 'success') {
        const result = state.result;
        const completedContext = activeSyncContext;
        const successMessage = 'Готово: групп разделов ' + (result.sectionGroups || 0) + ', разделов ' + result.sections + ', ' + result.pages + ' ' + pluralRu(result.pages, 'страница', 'страницы', 'страниц') + ', загружено ' + result.contentDownloaded + ', пропущено ' + result.contentSkipped + ', распознано ссылок ' + (result.bibleRefsRecognized || 0) + ', ошибок ' + result.contentErrors;
        syncStateEl.textContent = successMessage;
        showActivity(successMessage, 'success');
        const status = await api('/api/status');
        statusEl.textContent = cacheStatusText(status);
        await loadNotebookSelector();
        await loadDownloadLog(true);
        await loadBibleStats();
        await searchBibleRefs();
        if (completedContext?.pageId && selectedPageId === completedContext.pageId) {
          await openPage(completedContext.pageId);
        } else if (activeSearchQuery) {
          await renderSearch(activeSearchQuery);
        } else {
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
        const [status] = await Promise.all([api('/api/status'), loadNotebookSelector(), refreshSyncState(), loadBibleStats()]);
        statusEl.textContent = cacheStatusText(status);
        const initialPageId = pageIdFromUrl();
        if (initialPageId) {
          await openPage(initialPageId, { replaceUrl:true });
        } else {
          renderEmptyPage();
          await renderTree();
        }
        await loadDownloadLog(true);
        await searchBibleRefs();
        await openExternalBibleRefFromUrl();
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
  const uploadDir = path.join(process.env.APPDATA || process.cwd(), 'OneNote Bible Explorer', 'BibleNoteModules');
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
  const normalizedRawRef = rawRef.trim().replace(/^https?:\/\/isbtBibleVerse:/i, 'isbtBibleVerse:');
  const isbtReference = /^isbtBibleVerse:/i.test(normalizedRawRef) ? parseIsbtBibleVerse(normalizedRawRef) : undefined;
  if (isbtReference) return isbtReference;

  const text = normalizedRawRef.replace(/^bnVerse:/i, '').trim();
  if (!text) throw new Error('Bible reference is empty.');
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

function optionalInteger(value: unknown, name: string, min: number, max: number): number | undefined {
  if (value == null) return undefined;
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) {
    throw new Error(`${name} must be an integer from ${min} to ${max}.`);
  }
  return value as number;
}

function optionalStringArray(value: unknown, name: string, maxItems: number): string[] | undefined {
  if (value == null) return undefined;
  if (!Array.isArray(value) || value.length === 0 || value.length > maxItems || value.some(item => typeof item !== 'string' || !item)) {
    throw new Error(`${name} must be a non-empty array of at most ${maxItems} strings.`);
  }
  return [...new Set(value)];
}

function optionalString(value: unknown, name: string): string | undefined {
  if (value == null) return undefined;
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} must be a non-empty string.`);
  return value;
}

export function startCacheUi(options: UiOptions): http.Server {
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
      if (request.method === 'GET' && (url.pathname === '/' || url.pathname.startsWith('/page/'))) return page(response);
      if (url.pathname === '/api/sync' && request.method === 'GET') return json(response, 200, syncState);
      if (url.pathname === '/api/startup' && request.method === 'GET') return json(response, dbInitError ? 500 : 200, {
        ready: Boolean(cacheDb),
        starting: dbInitStarted && !cacheDb && !dbInitError,
        error: dbInitError?.message
      });
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
        const body = await readJsonBody(request);
        if (typeof body.fileName !== 'string' || !body.fileName) throw new Error('fileName must be a non-empty string.');
        if (typeof body.contentBase64 !== 'string' || !body.contentBase64) throw new Error('contentBase64 must be a non-empty string.');
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
        const body = await readJsonBody(request);
        const maxPages = optionalInteger(body.maxPages, 'maxPages', 1, 1_000_000);
        const concurrency = optionalInteger(body.concurrency, 'concurrency', 1, 3) ?? 2;
        const refreshOlderThanHours = optionalInteger(body.refreshOlderThanHours, 'refreshOlderThanHours', 0, 1_000_000);
        const notebookIds = optionalStringArray(body.notebookIds, 'notebookIds', 1000);
        const sectionId = optionalString(body.sectionId, 'sectionId');
        const pageId = optionalString(body.pageId, 'pageId');
        const bibleModule = optionalString(body.bibleModule, 'bibleModule');
        const scopeCount = Number(Boolean(notebookIds)) + Number(Boolean(sectionId)) + Number(Boolean(pageId));
        if (scopeCount > 1) throw new Error('Specify only one sync scope: notebookIds, sectionId, or pageId.');
        const startedAt = new Date().toISOString();
        syncState = { status: 'running', startedAt, progress: { phase: 'starting', message: 'Подготовка' } };
        void syncOneNoteCache({
          dbPath: options.dbPath,
          maxPages,
          concurrency,
          refreshOlderThanHours,
          metadataOnly: body.metadataOnly === true,
          forceContent: body.forceContent === true,
          includeHtml: body.includeHtml === true,
          parseBibleRefs: body.parseBibleRefs === true,
          forceBibleParse: body.forceBibleParse === true,
          bibleModule,
          notebookIds,
          sectionId,
          pageId,
          onProgress: progress => {
            syncState = { ...syncState, progress };
          }
        }).then(result => {
          console.log(`Sync completed: pages=${result.pages}, contentDownloaded=${result.contentDownloaded}, bibleRefsRecognized=${result.bibleRefsRecognized}, contentErrors=${result.contentErrors}, bibleParseErrors=${result.bibleRefsParseErrors}`);
          syncState = { status: 'success', startedAt, finishedAt: new Date().toISOString(), result };
        }).catch(error => {
          console.error(`Sync failed: ${(error?.message ?? String(error)).slice(0, 4000)}`);
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
        const body = await readJsonBody(request);
        if (typeof body.notebookId !== 'string' || !body.notebookId) throw new Error('notebookId must be a non-empty string.');
        if (body.displayName != null && typeof body.displayName !== 'string') throw new Error('displayName must be a string or null.');
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
      if (url.pathname === '/' || url.pathname.startsWith('/page/')) return page(response);
      if (url.pathname === '/api/status') return json(response, 200, cacheStatus(db));
      if (url.pathname === '/api/bible/stats') {
        const one = (sql: string) => (db.prepare(sql).get() as any)?.value ?? 0;
        return json(response, 200, {
          pages: one('SELECT COUNT(DISTINCT page_id) AS value FROM paragraph_verse_refs'),
          paragraphs: one('SELECT COUNT(*) AS value FROM page_paragraphs'),
          references: one('SELECT COUNT(*) AS value FROM paragraph_verse_refs'),
          errors: one("SELECT COUNT(*) AS value FROM page_bible_parse_state WHERE parse_error IS NOT NULL")
        });
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
        return json(response, 200, await getVerseTextWithBibleNote({
          apiUrl: bibleConfig.apiUrl,
          module,
          bookIndex,
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
          WHERE pp.page_id = ?
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
        const params: Record<string, unknown> = { limit };
        if (query) {
          filters.push('(r.normalized_ref LIKE @query OR r.original_text LIKE @query OR r.book_name LIKE @query OR pp.text LIKE @query)');
          params.query = `%${query}%`;
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
        return json(response, 200, { rows:findParallelBibleReferences(db, { bookIndex, chapter, verse, limit }) });
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
            limit
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
        const rawResults = mode === 'and' && !caseSensitive
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
        const results = rawResults.map((item: any) => ({
          id: item.id,
          title: item.title,
          notebookId: item.parent_notebook_id,
          notebook: item.parent_notebook_name,
          section: item.parent_section_name,
          snippet: item.snippet
        }));
        return json(response, 200, results);
      }
      if (url.pathname === '/api/page') {
        const cached = readCachedPage(db, required(url, 'id'), false, 2_000_000);
        const row = getCachedPage(db, required(url, 'id'));
        const text = typeof cached.text === 'string'
          ? cached.text.replace(/[\t ]+\n/g, '\n').replace(/\n{3,}/g, '\n\n')
          : cached.text;
        return json(response, 200, { ...cached, text, hasHtml: Boolean(row?.content_html) });
      }
      if (url.pathname === '/api/page-html') {
        const pageId = required(url, 'id');
        const row = getCachedPage(db, pageId);
        if (!row || row.deleted_at) return json(response, 404, { error: 'Page is not in the active cache.' });
        if (!row.content_html) return json(response, 404, { error: 'HTML is not cached for this page.' });
        return json(response, 200, { id: pageId, html: row.content_html });
      }
      return json(response, 404, { error: 'Not found.' });
    } catch (error: any) {
      const statusCode = Number.isInteger(error?.statusCode) ? error.statusCode : 400;
      return json(response, statusCode, { error: error?.message ?? String(error) });
    }
  });

  server.on('close', () => cacheDb?.close());
  server.listen(options.port, '127.0.0.1', () => {
    logStartupTiming(`server listening port=${options.port}`);
    console.log(`OneNote Cache Explorer: http://127.0.0.1:${options.port}`);
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
