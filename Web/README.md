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
- raw page HTML used to preserve document structure
- SQLite FTS5 full-text index over title, page text, notebook, and section

Default cache path:

```text
~/BibleNote/onenote-cache.sqlite
```

## Data sources

The desktop app can populate the same SQLite cache from:

- `OneNote Cloud` — works without the desktop OneNote client and requires Microsoft sign-in.
- `OneNote Local` — reads the notebooks currently opened in classic OneNote
  through its COM API; Azure registration and Microsoft sign-in are not required.
- `Folder` — recursively reads local `.html`, `.htm`, `.txt`, `.doc`, `.docx`, and `.pdf` files. Each configured
  root folder is shown as a notebook, nested folders are shown as groups, and files are pages.
  PDF is experimental and never invokes OCR. Legacy `.doc` files are converted through Microsoft
  Word COM when Word is installed on Windows. If COM is unavailable (including on macOS), the file
  error and its path are written to the runtime log while the rest of the sync continues.

Add any combination under `Settings → Data sources`: OneNote Cloud, OneNote Local, and named folder
sources. A folder source can contain one or more root folders. The left navigation groups all roots
from that source into one expandable panel under its configured name; Cloud and Local panels contain
notebooks. Removing a source removes only the cached hierarchy belonging to its folders.

The desktop UI stores the list in `BIBLENOTE_DATA_SOURCES`. The legacy
`ONENOTE_DATA_SOURCE=graph` / `ONENOTE_DATA_SOURCE=com` / `ONENOTE_DATA_SOURCE=folder` setting is
still migrated when no source list exists. COM mode is Windows-only and uses the
OneNote hierarchy/page APIs already used by BibleNote v3. Search, Bible-reference parsing, and the
viewer continue to use the shared local cache.

HTML and derived plain text are always cached. HTML preserves paragraph nesting for Bible-reference relation weights; plain text is used for FTS indexing.

### Folder extraction quality

- HTML keeps its native block/list/table structure after unsafe active markup is removed.
- TXT indentation is converted to nested lists.
- DOCX is converted to HTML with paragraphs, headings, lists, and tables through Mammoth.
- DOC is first converted to DOCX by installed Microsoft Word through COM on Windows, then follows
  the same structured extraction path as DOCX.
- PDF text is reconstructed from positioned text items. A page indicator reports `textual`,
  `heuristic`, or `requires OCR`. The last state means the PDF has no useful text layer; OCR remains
  disabled in this version.

## 1. Microsoft sign-in

BibleNote uses its built-in public-client registration. Users do not create an Entra application or
enter a Client ID. The desktop app requests these delegated Microsoft Graph scopes:

- `Notes.Read.All` — read the signed-in user's own and shared OneNote notebooks;
- `User.Read` — identify the signed-in account;
- `offline_access` — keep the local sign-in active between launches.

The registration uses the `common` authority for personal Microsoft accounts and work/school
accounts. It contains no client secret; desktop applications authenticate as public clients.

## 2. Configure locally

```bash
cp .env.example .env
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
npm run sync -- --incremental-metadata
npm run sync -- --replace-all
npm run sync -- --force-content
npm run sync -- --refresh-older-than-hours 720
npm run sync -- --concurrency 1
npm run sync -- --section-id <section-id>
npm run sync -- --page-id <page-id>
npm run sync -- --notebook-id <notebook-id>
npm run sync -- --db /absolute/path/onenote-cache.sqlite
npm run cache:status
```

`--replace-all` is only valid for a full content sync. It drops and recreates all local cache
tables before loading the selected notebooks, including FTS data, Bible parsing results, sync
history, and local notebook aliases. It cannot be combined with `--max-pages`, `--metadata-only`,
`--section-id`, or `--page-id`.

Recommended routine:

```bash
# frequent incremental sync with section-level and rolling safety checks
npm run sync -- --incremental-metadata

# occasional safety refresh because OneNote lastModifiedDateTime can be imperfect in practice
npm run sync -- --refresh-older-than-hours 720
```

OneNote Graph can leave a page's `lastModifiedDateTime` equal to its creation time after body
edits. Incremental sync therefore treats the page timestamp only as a hint. It recursively checks
the selected notebooks' sections and, when a section timestamp changes, downloads every page body
in that section and compares the resulting cached content. The section version stored with each
download makes this work resumable after cancellation or a transient Graph failure.

Each incremental run also refreshes up to 25 recently opened pages whose actual Graph download is
older than 24 hours, plus up to 25 of the oldest cached pages as a rolling safety sweep. Local HTML
link processing does not change `content_synced_at`; that field records only a successful Graph
content download.

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
BIBLENOTE_API_TIMEOUT_MS=120000
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

### Inductive Bible markings

The built-in Bible reader includes a local-first inductive marking mode. Select a word or phrase,
then apply a semantic style such as key word, God, Christ, Holy Spirit, time, place, contrast,
comparison, conclusion, or command. An exact-match action can apply the same style to every
occurrence in the open chapter. The observation panel lists the resulting marks in verse order,
supports navigation and removal, and can export the chapter as JSON. Custom key-word styles can be
added from the same panel.

Markings and palettes are stored separately from the disposable OneNote cache in:

```text
~/BibleNote/biblenote-user.sqlite
```

They therefore survive a full `--replace-all` cache rebuild. Text anchors include the translation
module, canonical Bible location, character offsets, selected quote, and nearby context.

The separate synchronization settings panel applies to full sync and every targeted notebook,
section, or page sync action, except `Перезаписать данные полностью`, which is intentionally used
only by the main full-sync button. Settings are saved in the browser. Every content sync stores the
page HTML; use the page's `↻` action to refresh one page.

The theme selector in the viewer header offers three persistent themes: `A · Тёплая`,
`B · Светлая`, and `C · Тёмная`.

Notebook rows also provide a pencil action for setting a local display name. The alias is stored in
SQLite, is used throughout the cache viewer, and does not rename the notebook in OneNote or require
Graph write permissions. The dialog can restore the original OneNote name at any time.

Synchronized pages show a `Показать HTML` button. The cached HTML is loaded only on demand and
rendered in a sandboxed iframe. Legacy cache entries without HTML are downloaded again during the
next content sync.

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
npm.cmd run cache:ui -- --port 4320
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

The build command stages the neighboring `..\BibleNote\Application` project into `vendor\BibleNote`, stages the local `node.exe` into `vendor\node`, builds the Windows OneNote Ribbon add-ins, compiles this TypeScript project, and creates Windows artifacts under `release\`. BibleNote is staged as a self-contained `win-x64` .NET build, so the bundled API does not require a separately installed .NET runtime. The cache UI runs in the bundled Node process while Electron hosts the desktop window; this avoids native SQLite ABI mismatches inside Electron.

On Windows, Parameters → OneNote Integration lists detected classic desktop OneNote installations. Enabling the checkbox registers the matching Office 2010, 2013, or 2016-compatible add-in for the current user. Restart OneNote after changing the setting. The Ribbon tab provides full current-page synchronization, quick COM-based link analysis, and an Open BibleNote command. The integration section and add-in binaries are not included in macOS builds.

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

## Source layout

- `src/cache.ts` is the stable cache facade and contains cache writes and Bible-reference indexing.
- `src/cache-schema.ts`, `src/cache-search.ts`, and `src/cache-types.ts` isolate SQLite schema, read queries, and data contracts.
- `src/cache-ui.ts` owns the local HTTP routes; `src/biblenote-gateway.ts` owns communication with the BibleNote API/process.
- `ui/` contains the browser application, split by feature area. Keep browser-only code out of the Node server modules.

## End-to-end tests

The Playwright suite starts the real cache UI server with an isolated temporary SQLite database.
Microsoft Graph, the BibleNote HTTP API, and the Electron control bridge are represented by local
deterministic HTTP services, so tests never read or modify the user's OneNote cache or account.

Run all browser scenarios:

```powershell
npm.cmd run e2e:all
```

Run one functional area:

```powershell
npm.cmd run e2e:notes
npm.cmd run e2e:search
npm.cmd run e2e:bible
npm.cmd run e2e:inductive
npm.cmd run e2e:sync
npm.cmd run e2e:settings
npm.cmd run e2e:electron
```

Run the smoke suite plus only areas affected by committed and working-tree changes:

```powershell
npm.cmd run e2e:changed -- --base origin/main
```

The source-to-area rules live in `e2e/areas.mjs`. Shared and unknown production files intentionally
select the full suite. Documentation-only changes select smoke tests. Use `--list` after the base
argument to inspect the selected scenarios without executing them.

Local runs use the installed Google Chrome. CI uses Playwright Chromium; install it once on the CI
runner with:

```powershell
npm.cmd run e2e:install
```

Failed scenarios retain a Playwright trace and screenshot under `Web/.tmp/`.

For a periodic full verification (build, unit/integration tests, and every e2e area), run:

```powershell
npm.cmd run verify:e2e
```
