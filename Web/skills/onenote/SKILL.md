---
name: onenote
description: Use cached OneNote notes via Microsoft Graph MCP tools.
---

When the user asks about OneNote notes, prefer the cached tools for large collections:

1. Check `onenote_cache_status`.
2. If the cache is empty or stale, ask the user to run `npm run sync` for a full first sync, or use `onenote_sync_cache` for a smaller/incremental sync.
3. Search with `onenote_search_cache`.
4. Read exact pages with `onenote_read_cached_page` before summarizing.

Use direct Graph tools only for quick checks or when the cache is unavailable. Keep operations read-only unless the user explicitly asks to add write tools later.
