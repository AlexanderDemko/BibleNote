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
- The HTML viewer provides a **Структура** panel with nested, collapsible headings, heading search,
  click-to-scroll navigation, and the current section highlighted while reading. The panel also works
  in full-page mode. Word heading styles and inherited or direct outline levels (1–9) are preserved;
  resync previously cached Word files to pick up custom outline levels.
- OneNote outlines use native heading styles and Markdown-style heading lines such as `## Introduction`.
  The page title is excluded, and the panel is hidden when there are no sections. Resync local OneNote
  pages to recover native heading levels from older cached HTML; Markdown headings work immediately.
- **Settings → Просмотр заметок → C · Тёмная** applies to the application and documents.
  HTML text, paper, table cells and highlights are recolored with their hues preserved;
  images are gently dimmed. PDF pages use a dimmed inversion (including embedded images).
  Switching back restores the original document colors without changing the cache,
  reloading pages, or losing the reading position.
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

Use Node.js 22.12.0 or newer. Electron's artifact downloader requires this runtime.

The `app-builder-lib` override selects `@electron/get` 5.1 or newer within major version 5
to remove the vulnerable `got` / `cacheable-request` / `http-cache-semantics` dependency chain.
It uses native fetch; custom download options follow `FetchDownloaderOptions`. For proxy downloads,
set `ELECTRON_GET_USE_PROXY=1` together with `HTTP_PROXY`, `HTTPS_PROXY`, and/or `NO_PROXY`.
Keep this override until electron-builder adopts the updated downloader upstream.

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

## MyBible module analyzer

The repository includes a read-only diagnostic analyzer for MyBible `.SQLite3` modules. It reports
book/chapter/verse structure, numbering gaps, empty consolidated verses, supported and unknown
markup, footnote integrity, cross-reference integrity, and licensing/source metadata. Verse and
footnote bodies are deliberately excluded from the JSON report.

Analyze a Bible module. A same-name `.commentaries.SQLite3` companion is discovered automatically:

```powershell
npm.cmd run mybible:analyze -- --bible "C:\Modules\RST+.SQLite3" --output ".tmp\rst-plus-report.json"
```

Add a cross-reference module and compare the module structurally with another MyBible Bible:

```powershell
npm.cmd run mybible:analyze -- `
  --bible "C:\Modules\RST+.SQLite3" `
  --cross-references "C:\Modules\RST-x.crossreferences.SQLite3" `
  --compare "C:\Modules\KJV.SQLite3" `
  --output ".tmp\rst-plus-vs-kjv.json"
```

Comparison hints align rows by their ordinal position inside each book and compress consecutive
coordinate shifts into candidate runs. They are diagnostic suggestions only: a mapping must still
be reviewed and validated in both directions before BibleNote assigns neutral VerseIds.

### Editable verse maps

Build an explicit draft map between a current BibleNote module and an imported MyBible module:

```powershell
npm.cmd run mybible:map -- `
  --reference "..\Api\Modules\rst\rst.bnm" `
  --module "C:\Modules\RST+.SQLite3" `
  --output ".tmp\rst-to-rst-plus-map.json"
```

The map contains explicit many-to-many verse rows plus compact review groups. Safe direct
coordinates are confirmed automatically. The generator also auto-detects `manifest.xml` next to
the comparison module, applies a documented numbering run when the imported module's boundary rows
prove that it uses the base numbering, and honors MyBible range markers such as `[20-21]`. It never
pairs unrelated leftovers merely because they have the same row ordinal. Only genuine holes and
ambiguous passages remain candidates for a reviewer. High-confidence evidence also includes unique
normalized-text matches and exact concatenations. The normalized text and copyrighted verse bodies
are never stored in the map.

An intentionally relocated passage, such as a doxology placed in a different chapter, still fails
the monotonic-order check until its reviewed group explicitly sets `"allowNonMonotonic": true`.
This is the editable-map equivalent of the legacy exceptional-check flag.

After editing the review statuses, validate coverage, duplicate assignments, ordering, source
fingerprints, and both lookup directions:

```powershell
npm.cmd run mybible:map -- `
  --validate ".tmp\rst-to-rst-plus-map.json" `
  --output ".tmp\rst-to-rst-plus-validation.json"
```

For safer review, use **Параметры → Модули → Проверка соответствия стихов** in the desktop application.
Choose the generated JSON map and press **Проверить карту**; the loopback-only reviewer opens inside
BibleNote, loads verse text directly from the two source modules, pages large groups, and lets the
reviewer confirm, reject, or return a group to candidate status. The selected path is remembered.

The equivalent command remains available for automation and development:

```powershell
npm.cmd run mybible:review -- --map ".tmp\rst-to-rst-plus-map.json"
```

When using the command, open the tokenized URL it prints. On the first change in a review session, the server
preserves the original map next to it as `map.json.backup-<timestamp>`. Each change re-runs source
fingerprint and two-way consistency validation. The server accepts writes only with its random
session token and from its own browser origin.

Once every intended group has been explicitly confirmed and confirmed-only validation is complete,
compile the editable JSON into a compact lookup database:

```powershell
npm.cmd run mybible:compile-map -- `
  --map ".tmp\rst-to-rst-plus-map.json" `
  --verse-id-registry "bnverse:v1" `
  --coordinate-reference-module "kjv" `
  --reference-differences-manifest "..\Api\Modules\rst\manifest.xml" `
  --output ".tmp\rst-plus-verse-map.sqlite" `
  --direct-mappings-output ".tmp\rst-plus-direct-mappings.xml"
```

`bnverse:v1` is BibleNote's neutral VerseId registry. For example, `bnverse:v1:3:14:55`
identifies the registry unit seeded from book 3, chapter 14, verse 55. It does not identify KJV text
or a KJV module. KJV supplies the initial numbering only and is recorded separately as the
coordinate reference module. Both settings have safe defaults, so the two explicit options above
may normally be omitted.

RST is a convenient same-language comparison bridge while reviewing RST+. Its existing manifest
describes how RST coordinates differ from the KJV-seeded numbering. During compilation those
verified KJV-to-RST relations are composed with the reviewed RST-to-RST+ map. The compiled SQLite
schema stores neutral `verse_ids`, module rows, and many-to-many relations between them. It also
records `verse_id_registry=bnverse:v1` and `coordinate_reference_module=kjv` as separate metadata.

Compilation refuses candidate groups, missing coverage, duplicate assignments, changed source
fingerprints, an omitted bridge manifest, and unapproved non-monotonic transitions. `--force`
replaces an existing compiled database only after preserving it as a timestamped backup.

The optional direct-mappings XML is a ready-to-embed `BibleDirectVerseMappings` element for the
converted module's `manifest.xml`. It contains only exceptions to identity mapping but writes every
relation in a merge, split, or complex group. The API gives an exact direct map priority when its
`ReferenceModule` matches the other translation, in both directions; coordinates absent from the
element retain identity behavior. For two non-KJV modules, the API composes their mappings through
the shared coordinate reference. The XML identifies its neutral registry independently as
`VerseIdRegistry="bnverse:v1"`. This lets references written using RST, RST+, KJV, or another mapped
translation resolve to the same VerseIds while keeping explicit split and merge relations.

### Convert a reviewed MyBible module

Convert the MyBible SQLite Bible and its same-name footnotes companion into an installable
BibleNote package. The reference manifest supplies the established book aliases, but its legacy
RST-to-KJV differences are deliberately removed from the new module: the compiled direct mapping
is the sole authority for imported verse coordinates. MyBible long/short book names are added so
references written in the imported module's language can be parsed as module-qualified references:

```powershell
npm.cmd run mybible:convert -- `
  --bible "C:\Modules\RST+.SQLite3" `
  --short-name "rstplus" `
  --reference-manifest "..\Api\Modules\rst\manifest.xml" `
  --direct-mappings ".tmp\rst-plus-direct-mappings.xml" `
  --coordinate-reference-module "kjv" `
  --verse-id-registry "bnverse:v1" `
  --output ".tmp\rstplus.bnm"
```

A confirmed direct mapping is required for an installable package. For markup and footnote
inspection only, `--allow-unmapped-preview` can create a package whose conversion report marks it
as non-installable. This preview switch must not be used for a production module.

The converter discovers `RST+.commentaries.SQLite3` automatically; use `--footnotes` to override
it or `--no-footnotes` to disable discovery. It converts italic, bold/emphasis, underline,
translator-added text, words of Jesus, superscript/subscript, and paragraph/line breaks to semantic
Zefania elements. MyBible footnote markers become `NOTE` elements, using a unique same-book marker
fallback for the known modules whose companion coordinates differ. Cross-nested MyBible markup is
closed safely so the generated `bible.xml` remains well-formed. Strong-number markers are currently
removed from visible text because BibleNote has no Strong lexicon UI yet; their count and the source
SHA-256 remain in `conversion-report.json` inside the package.

Use `--all-footnotes` to preserve every companion record, including cross references without
inline markers. Such records appear at the end of their source verse (or a verse in the declared
range), while marked notes retain their word position. The package also retains the original
note markup and coordinates in `footnotes-source.json`. Note bodies use plain text to preserve
mixed text order in the legacy reader. Notes and breaks are emitted outside style elements so
they survive XML loading. A partial Bible's manifest lists only the books actually present.

The desktop map-review settings also accept an explicit `*.commentaries.SQLite3` path. A module
built from the review UI is rejected if any `<f>` marker has no matching companion record, so the
success message never represents marker-only placeholders as imported footnotes.

BibleNote's verse-text API projects the semantic Zefania elements as safe offset-based decorations,
breaks, and footnotes. The reader renders those styles alongside inductive markings and shows each
footnote in an expandable block. No module-provided HTML or CSS is injected into the page.

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

The build command stages the neighboring `..\Api\Application` project into `vendor\BibleNote`, stages the local `node.exe` into `vendor\node`, builds the Windows OneNote Ribbon add-ins, compiles this TypeScript project, and creates Windows artifacts under `release\`. BibleNote is staged as a self-contained `win-x64` .NET build, so the bundled API does not require a separately installed .NET runtime. The cache UI runs in the bundled Node process while Electron hosts the desktop window; this avoids native SQLite ABI mismatches inside Electron.

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

## Startup performance

`npm run build` type-checks the project and bundles the Electron main process, cache UI server,
and Ribbon worker with esbuild. Shared and lazy chunks stay in `dist/` so resource paths remain
relative to the same directory. Keep the native SQLite addon, PDF.js worker runtime, Word converters,
and MSAL external. The separate Windows Node runtime cannot read Electron ASAR paths, so packaging
remains unpacked; do not enable ASAR without also changing the child-process/resource layout.

The Electron shell starts the cache server while its loading page renders. The renderer requests
cache initialization after painting; the previous fixed 1.2-second delay is gone. PDF/Word parsers,
MSAL, MyBible review tools, and PDF.js assets load on demand. Office protocol diagnostics and Ribbon
configuration run after the initial view. Restored note tabs do not wait for Bible modules; Bible
tabs share the pending module request before opening their chapter.

Reproduce startup measurements without an installer or a version change:

```powershell
npm.cmd run build
npm.cmd run benchmark:electron -- 5
npm.cmd run benchmark:startup -- 5
```

The Electron benchmark uses isolated profiles under `.tmp/electron-startup` and rotates default,
no-menu, and no-GPU probes. The app benchmark uses a seeded test cache, fake Bible API, and disabled
Ribbon registration under `.tmp/app-startup`; it does not measure production .NET/OneNote startup.
Both print timings from process launch. Compare runs without parallel tests, and distinguish the
first launch from later launches: OS file caches are not flushed. App logs include `mainCodeAt`,
Electron version, and the clock origin. Normal launches use Node's time origin; the benchmark supplies
`BIBLENOTE_STARTUP_LAUNCHED_AT` to include executable loading before Node starts.

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
