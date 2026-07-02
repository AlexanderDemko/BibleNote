# OneNote Codex Plugin / MCP Server

This is a local, read-only Codex plugin that exposes OneNote tools through MCP and Microsoft Graph.

Version `0.2.0` adds a local SQLite cache for large OneNote collections. The intended workflow is:

1. Sign in once with Microsoft device-code login.
2. Run a full local sync from the CLI.
3. Let Codex search/read the local cache instead of downloading thousands of pages on every request.

## What is cached

The cache stores:

- notebooks
- sections
- page metadata
- page plain text
- optional raw page HTML
- SQLite FTS5 full-text index over title, page text, notebook, and section

Default cache path:

```text
~/.codex-onenote-mcp/onenote-cache.sqlite
```

For thousands of large pages, keep raw HTML disabled unless you really need it. Plain text is always cached and indexed.

## 1. Register an Azure app

1. Open Microsoft Entra admin center.
2. App registrations → New registration.
3. Supported account types: choose the accounts you need.
   - For personal + work/school accounts, choose the multi-tenant + personal option.
4. Authentication → allow public client / mobile and desktop flows.
5. API permissions → Microsoft Graph → Delegated permissions:
   - `Notes.Read`
   - `User.Read`
   - `offline_access`
6. Copy Application (client) ID.

## 2. Configure locally

```bash
cp .env.example .env
# edit .env and set ONENOTE_CLIENT_ID
npm install
npm run login
npm run build
```

`npm run login` uses Microsoft device-code login and stores the MSAL cache locally.

## 3. First sync

For a small test:

```bash
npm run sync -- --max-pages 50
npm run cache:status
```

For the real first sync:

```bash
npm run sync
```

The first sync can take a long time because Microsoft Graph must download every page body once. The default content concurrency is intentionally low (`2`) to avoid throttling.
All workers share a request-rate limiter. When Graph returns `429`, synchronization honors
`Retry-After`, pauses every worker, and retries with exponential backoff instead of failing
immediately. Repeated throttling also increases the shared request interval automatically; successful
requests gradually relax it again. Throttling has a separate default budget of 100 retries. For
heavily nested notebooks, use concurrency `1` if throttling remains frequent.

Useful options:

```bash
npm run sync -- --metadata-only
npm run sync -- --force-content
npm run sync -- --refresh-older-than-hours 720
npm run sync -- --concurrency 1
npm run sync -- --include-html
npm run sync -- --section-id <section-id>
npm run sync -- --page-id <page-id>
npm run sync -- --notebook-id <notebook-id>
npm run sync -- --db /absolute/path/onenote-cache.sqlite
npm run cache:status
```

Recommended routine:

```bash
# frequent incremental sync, downloads only missing/changed pages
npm run sync

# occasional safety refresh because OneNote lastModifiedDateTime can be imperfect in practice
npm run sync -- --refresh-older-than-hours 720
```

## BibleNote reference parsing

This plugin can optionally send cached OneNote page content to a local BibleNote API and store
paragraph-level Bible references in SQLite. Start BibleNote's ASP.NET application first, then run:

```powershell
npm.cmd run sync -- --parse-bible-refs --biblenote-api-url http://127.0.0.1:5000 --bible-module rst
```

To re-parse already cached pages without forcing a Graph content refresh:

```powershell
npm.cmd run sync -- --parse-bible-refs --force-bible-parse
```

Environment variables:

```text
ONENOTE_BIBLE_PARSE_ENABLED=false
BIBLENOTE_API_URL=http://127.0.0.1:5000
BIBLENOTE_MODULE=rst
BIBLENOTE_USE_COMMA_DELIMITER=true
BIBLENOTE_API_TIMEOUT_MS=30000
```

Parsed references are stored per page and paragraph. The cache also stores BibleNote-style weighted relations between references in the same paragraph and following paragraphs, so parallel reference search can rank related verses by proximity and note structure. MCP tools added for this data:

- `onenote_find_pages_by_bible_ref`
- `onenote_find_parallel_bible_refs`

## Local cache viewer

Start the read-only browser UI:

```powershell
npm.cmd run cache:ui
```

Then open `http://127.0.0.1:4312`. The viewer provides a lazy notebook/section/page tree,
full-text FTS5 search with highlighted matches, cache status, page metadata, cached plain-text
content, notebook selection for display/search/sync, and background synchronization controls with
progress reporting. The notebook selection is saved in the browser.

The separate synchronization settings panel applies to full sync and every targeted notebook,
section, or page sync action. Settings are saved in the browser. To refresh one page with its raw
OneNote HTML, enable `Сохранять HTML` and then use the page's `↻` action; after completion the page
shows `Показать HTML`.

The theme selector in the viewer header offers three persistent themes: `A · Тёплая`,
`B · Светлая`, and `C · Тёмная`.

Notebook rows also provide a pencil action for setting a local display name. The alias is stored in
SQLite, is used throughout the cache viewer, and does not rename the notebook in OneNote or require
Graph write permissions. The dialog can restore the original OneNote name at any time.

Pages synchronized with `--include-html` show a `Показать HTML` button. The cached HTML is loaded
only on demand and rendered in a sandboxed iframe; pages without cached HTML remain text-only.

The `Журнал загрузки` panel reports page-level cache state for the selected notebooks. It can show
pages downloaded during the latest sync, all downloaded pages, pages still missing content, Graph
errors with their messages, or every cached page. Large result sets are paginated.

Section labels distinguish metadata coverage: `пустая` means Graph returned a complete empty page
list, `не загружена` means the section has not been scanned yet, and `N · частично` means page
metadata was truncated by a limit or interruption. A plain numeric count means the section scan
completed.

Notebook synchronization recursively traverses OneNote section groups, including nested groups.
Cached sections retain their group path, which is shown before the section name in the viewer tree.

The tree includes a `↻` action for every notebook, section, and page. These actions reuse the
current synchronization settings but restrict the Graph crawl to the selected item. An opened page
also has a `Синхронизировать страницу` button. Page-only sync never marks its parent section as
fully scanned.

To sync several notebooks from the CLI, repeat the option:

```powershell
npm.cmd run sync -- --notebook-id <first-id> --notebook-id <second-id>
```

Optional parameters:

```powershell
npm.cmd run cache:ui -- --port 4313
npm.cmd run cache:ui -- --db C:\path\to\onenote-cache.sqlite
```

## 4. Run as a local desktop app

The Electron shell starts the OneNote cache UI and a local BibleNote API process, then opens the UI in a desktop window.

Development mode:

```powershell
npm.cmd run electron:dev
```

Build an installed Windows app and a portable executable:

```powershell
npm.cmd run dist:win
```

Build only the NSIS installer:

```powershell
npm.cmd run dist:installer
```

Build only the portable executable:

```powershell
npm.cmd run dist:portable
```

The build command stages the neighboring `..\BibleNote\Application` project into `vendor\BibleNote`, stages the local `node.exe` into `vendor\node`, compiles this TypeScript project, and creates Windows artifacts under `release\`. BibleNote is staged as a self-contained `win-x64` .NET build, so the bundled API does not require a separately installed .NET runtime. The cache UI runs in the bundled Node process while Electron hosts the desktop window; this avoids native SQLite ABI mismatches inside Electron.

Use the installer for normal local use. The portable executable is convenient for copying one file, but it extracts the application on every launch, which is much slower than starting the installed app or `release\win-unpacked\OneNote Bible Explorer.exe`.

## 5. Install as local Codex plugin

Copy this folder to `~/.codex/plugins/onenote-codex-plugin`, then add or update `~/.agents/plugins/marketplace.json`:

```json
{
  "name": "local-personal",
  "plugins": [
    {
      "name": "onenote-codex-plugin",
      "source": {
        "source": "local",
        "path": "/home/YOUR_USER/.codex/plugins/onenote-codex-plugin"
      },
      "policy": {
        "installation": "AVAILABLE",
        "authentication": "ON_INSTALL"
      },
      "category": "Productivity"
    }
  ]
}
```

Restart Codex and enable the plugin.

## 6. MCP server config without plugin marketplace

You can also add the MCP server directly to `~/.codex/config.toml`:

```toml
[mcp_servers.onenote]
command = "node"
args = ["/ABSOLUTE/PATH/onenote-codex-plugin/dist/server.js"]
startup_timeout_sec = 20
tool_timeout_sec = 120
```

## MCP tools

Cached tools for large collections:

- `onenote_cache_status`
- `onenote_sync_cache`
- `onenote_search_cache`
- `onenote_read_cached_page`
- `onenote_list_cached_notebooks`
- `onenote_list_cached_sections`

Direct Graph tools, useful for quick checks:

- `onenote_list_notebooks`
- `onenote_list_sections`
- `onenote_list_recent_pages`
- `onenote_find_pages_by_title`
- `onenote_search_recent_page_content`
- `onenote_read_page`

## Notes on scale

- The sync crawls sections and pages with `$top=100` and follows `@odata.nextLink`.
- Page content is downloaded separately because OneNote page bodies are HTML content endpoints.
- Retry/backoff is implemented for common transient Graph errors and throttling responses.
- The cache marks missing pages as deleted only during a full, uncapped sync. It does not mark deletions when you use `--max-pages` or `--section-id`.
- The server is read-only by default. Add write operations only after you are comfortable with the read-only flow.
