import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as z from 'zod/v4';
import * as cheerio from 'cheerio';
import {
  cacheStatus,
  findParallelBibleReferences,
  searchBibleReferences,
  listCachedNotebooks,
  listCachedSections,
  openCacheDb,
  readCachedPage,
  searchCache
} from './cache.js';
import { graphJson, graphText, GraphCollection, encodeODataValue } from './graph.js';
import { loadNotebookSectionsRecursively, syncOneNoteCache } from './sync.js';

type Notebook = {
  id: string;
  displayName?: string;
  isDefault?: boolean;
  lastModifiedDateTime?: string;
  links?: any;
};

type Section = {
  id: string;
  displayName?: string;
  lastModifiedDateTime?: string;
  pagesUrl?: string;
  parentNotebook?: { id?: string; displayName?: string };
  links?: any;
};

type Page = {
  id: string;
  title?: string;
  createdDateTime?: string;
  lastModifiedDateTime?: string;
  contentUrl?: string;
  parentSection?: { id?: string; displayName?: string };
  parentNotebook?: { id?: string; displayName?: string };
  links?: any;
};

function toolText(value: unknown) {
  return {
    content: [{ type: 'text' as const, text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }]
  };
}

function htmlToText(html: string): string {
  const $ = cheerio.load(html);
  $('script,style,noscript').remove();
  $('br').replaceWith('\n');
  $('p,div,li,h1,h2,h3,h4,h5,h6,table,tr').append('\n');
  return $.text()
    .replace(/\r/g, '')
    .replace(/[\t ]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function getPages(top: number, sectionId?: string): Promise<Page[]> {
  const safeTop = Math.max(1, Math.min(top, 100));
  const base = sectionId
    ? `/me/onenote/sections/${encodeURIComponent(sectionId)}/pages`
    : '/me/onenote/pages';

  const url = `${base}?$top=${safeTop}&$select=id,title,createdDateTime,lastModifiedDateTime,contentUrl,links&$expand=parentSection,parentNotebook&$orderby=lastModifiedDateTime desc`;
  const data = await graphJson<GraphCollection<Page>>(url);
  return data.value;
}

const server = new McpServer(
  { name: 'onenote-mcp', version: '0.2.0' },
  {
    instructions:
      'Use read-only OneNote tools. For large note collections, prefer the local cache tools: run/suggest onenote_sync_cache or ask the user to run npm run sync, then use onenote_search_cache and onenote_read_cached_page.'
  }
);

server.registerTool(
  'onenote_cache_status',
  {
    title: 'OneNote cache status',
    description: 'Shows local SQLite cache counts, database path, and last sync state.',
    inputSchema: z.object({})
  },
  async () => {
    const db = openCacheDb();
    try {
      return toolText(cacheStatus(db));
    } finally {
      db.close();
    }
  }
);

server.registerTool(
  'onenote_sync_cache',
  {
    title: 'Sync OneNote cache',
    description:
      'Synchronizes OneNote notebooks, sections, page metadata, and changed/missing page content into the local SQLite cache. For thousands of pages, prefer running npm run sync outside Codex because it can take a long time.',
    inputSchema: z.object({
      forceContent: z.boolean().default(false),
      metadataOnly: z.boolean().default(false),
      includeHtml: z.boolean().default(false),
      maxPages: z.number().int().min(1).max(100000).optional(),
      concurrency: z.number().int().min(1).max(3).default(2),
      refreshOlderThanHours: z.number().int().min(0).max(100000).default(0),
      sectionId: z.string().optional(),
      pageId: z.string().optional(),
      notebookIds: z.array(z.string().min(1)).min(1).max(1000).optional(),
      parseBibleRefs: z.boolean().default(false),
      forceBibleParse: z.boolean().default(false),
      bibleNoteApiUrl: z.string().url().optional(),
      bibleModule: z.string().default('rst')
    })
  },
  async ({ forceContent, metadataOnly, includeHtml, maxPages, concurrency, refreshOlderThanHours, sectionId, pageId, notebookIds, parseBibleRefs, forceBibleParse, bibleNoteApiUrl, bibleModule }) => {
    const result = await syncOneNoteCache({
      forceContent,
      metadataOnly,
      includeHtml,
      maxPages,
      concurrency,
      refreshOlderThanHours,
      sectionId,
      pageId,
      notebookIds,
      parseBibleRefs,
      forceBibleParse,
      bibleNoteApiUrl,
      bibleModule
    });
    return toolText(result);
  }
);

server.registerTool(
  'onenote_search_cache',
  {
    title: 'Search cached OneNote pages',
    description:
      'Fast full-text search over locally cached OneNote page titles and text content using SQLite FTS5. Run onenote_sync_cache or npm run sync first.',
    inputSchema: z.object({
      query: z.string().min(1),
      limit: z.number().int().min(1).max(100).default(20),
      mode: z.enum(['and', 'or', 'phrase']).default('and'),
      notebookId: z.string().optional(),
      sectionId: z.string().optional()
    })
  },
  async ({ query, limit, mode, notebookId, sectionId }) => {
    const db = openCacheDb();
    try {
      return toolText(searchCache(db, query, { limit, mode, notebookId, sectionId }));
    } finally {
      db.close();
    }
  }
);

server.registerTool(
  'onenote_read_cached_page',
  {
    title: 'Read cached OneNote page',
    description: 'Reads a page from the local cache by ID. Does not call Microsoft Graph.',
    inputSchema: z.object({
      pageId: z.string().min(1),
      includeHtml: z.boolean().default(false),
      maxTextChars: z.number().int().min(500).max(200000).default(30000)
    })
  },
  async ({ pageId, includeHtml, maxTextChars }) => {
    const db = openCacheDb();
    try {
      return toolText(readCachedPage(db, pageId, includeHtml, maxTextChars));
    } finally {
      db.close();
    }
  }
);

server.registerTool(
  'onenote_list_cached_notebooks',
  {
    title: 'List cached OneNote notebooks',
    description: 'Lists notebooks from the local cache.',
    inputSchema: z.object({})
  },
  async () => {
    const db = openCacheDb();
    try {
      return toolText(listCachedNotebooks(db));
    } finally {
      db.close();
    }
  }
);

server.registerTool(
  'onenote_list_cached_sections',
  {
    title: 'List cached OneNote sections',
    description: 'Lists sections from the local cache, optionally under a specific notebook.',
    inputSchema: z.object({
      notebookId: z.string().optional()
    })
  },
  async ({ notebookId }) => {
    const db = openCacheDb();
    try {
      return toolText(listCachedSections(db, notebookId));
    } finally {
      db.close();
    }
  }
);

server.registerTool(
  'onenote_find_pages_by_bible_ref',
  {
    title: 'Find cached OneNote pages by Bible reference',
    description:
      'Searches Bible references parsed from cached OneNote pages. Use normalized for text matching, or bookIndex/chapter/verse for numeric range overlap.',
    inputSchema: z.object({
      normalized: z.string().optional(),
      bookIndex: z.number().int().min(1).max(100).optional(),
      chapter: z.number().int().min(1).max(200).optional(),
      verse: z.number().int().min(1).max(300).optional(),
      limit: z.number().int().min(1).max(200).default(50)
    })
  },
  async ({ normalized, bookIndex, chapter, verse, limit }) => {
    const db = openCacheDb();
    try {
      return toolText(searchBibleReferences(db, { normalized, bookIndex, chapter, verse, limit }));
    } finally {
      db.close();
    }
  }
);

server.registerTool(
  'onenote_find_parallel_bible_refs',
  {
    title: 'Find weighted parallel Bible references in cached OneNote notes',
    description:
      'Finds other Bible references connected to the requested reference by BibleNote-style paragraph and within-paragraph relation weights.',
    inputSchema: z.object({
      bookIndex: z.number().int().min(1).max(100),
      chapter: z.number().int().min(1).max(200),
      verse: z.number().int().min(1).max(300).optional(),
      limit: z.number().int().min(1).max(200).default(50)
    })
  },
  async ({ bookIndex, chapter, verse, limit }) => {
    const db = openCacheDb();
    try {
      return toolText(findParallelBibleReferences(db, { bookIndex, chapter, verse, limit }));
    } finally {
      db.close();
    }
  }
);

server.registerTool(
  'onenote_list_notebooks',
  {
    title: 'List OneNote notebooks from Graph',
    description: 'Lists the signed-in user\'s OneNote notebooks directly from Microsoft Graph. For repeated use, prefer cached tools.',
    inputSchema: z.object({
      top: z.number().int().min(1).max(100).default(50)
    })
  },
  async ({ top }) => {
    const data = await graphJson<GraphCollection<Notebook>>(
      `/me/onenote/notebooks?$top=${top}&$select=id,displayName,isDefault,lastModifiedDateTime,links&$orderby=displayName`
    );
    return toolText(data.value);
  }
);

server.registerTool(
  'onenote_list_sections',
  {
    title: 'List OneNote sections from Graph',
    description: 'Lists OneNote sections directly from Microsoft Graph, optionally under a specific notebook. Notebook-scoped listing recursively includes nested section groups. For repeated use, prefer cached tools.',
    inputSchema: z.object({
      notebookId: z.string().optional(),
      top: z.number().int().min(1).max(100).default(100)
    })
  },
  async ({ notebookId, top }) => {
    if (notebookId) {
      const notebook = await graphJson<Notebook>(
        `/me/onenote/notebooks/${encodeURIComponent(notebookId)}?$select=id,displayName,isDefault,lastModifiedDateTime,links`
      );
      const tree = await loadNotebookSectionsRecursively(notebook, 100);
      return toolText({ sectionGroups: tree.sectionGroups, sections: tree.sections.slice(0, top) });
    }
    const base = notebookId
      ? `/me/onenote/notebooks/${encodeURIComponent(notebookId)}/sections`
      : '/me/onenote/sections';

    const data = await graphJson<GraphCollection<Section>>(
      `${base}?$top=${top}&$select=id,displayName,lastModifiedDateTime,pagesUrl,links&$expand=parentNotebook&$orderby=displayName`
    );
    return toolText(data.value);
  }
);

server.registerTool(
  'onenote_list_recent_pages',
  {
    title: 'List recent OneNote pages from Graph',
    description: 'Lists recent OneNote pages directly from Graph, optionally within a section. For large collections, prefer cached search.',
    inputSchema: z.object({
      sectionId: z.string().optional(),
      top: z.number().int().min(1).max(100).default(20)
    })
  },
  async ({ sectionId, top }) => {
    const pages = await getPages(top, sectionId);
    return toolText(pages);
  }
);

server.registerTool(
  'onenote_find_pages_by_title',
  {
    title: 'Find OneNote pages by title from Graph',
    description: 'Finds pages whose title contains the specified text through Graph. This searches page titles, not full page bodies. Prefer cached search after sync.',
    inputSchema: z.object({
      query: z.string().min(1),
      top: z.number().int().min(1).max(100).default(20)
    })
  },
  async ({ query, top }) => {
    const q = encodeODataValue(query.toLowerCase());
    const filter = encodeURIComponent(`contains(tolower(title),'${q}')`);
    const data = await graphJson<GraphCollection<Page>>(
      `/me/onenote/pages?$top=${top}&$filter=${filter}&$select=id,title,createdDateTime,lastModifiedDateTime,contentUrl,links&$expand=parentSection,parentNotebook&$orderby=lastModifiedDateTime desc`
    );
    return toolText(data.value);
  }
);

server.registerTool(
  'onenote_search_recent_page_content',
  {
    title: 'Search recent OneNote page content from Graph',
    description: 'Downloads up to N recent pages from Graph and searches their HTML text content locally. Prefer onenote_search_cache for large note collections.',
    inputSchema: z.object({
      query: z.string().min(1),
      top: z.number().int().min(1).max(50).default(20)
    })
  },
  async ({ query, top }) => {
    const pages = await getPages(top);
    const needle = query.toLowerCase();
    const matches = [] as Array<Page & { snippet: string }>;

    for (const page of pages) {
      const html = await graphText(`/me/onenote/pages/${encodeURIComponent(page.id)}/content`);
      const text = htmlToText(html);
      const idx = text.toLowerCase().indexOf(needle);
      if (idx >= 0) {
        const start = Math.max(0, idx - 160);
        const end = Math.min(text.length, idx + needle.length + 240);
        matches.push({ ...page, snippet: text.slice(start, end) });
      }
    }

    return toolText(matches);
  }
);

server.registerTool(
  'onenote_read_page',
  {
    title: 'Read OneNote page from Graph',
    description: 'Reads a OneNote page by ID from Graph and returns title/metadata plus plain text and optional HTML. Prefer cached read after sync.',
    inputSchema: z.object({
      pageId: z.string().min(1),
      includeHtml: z.boolean().default(false),
      maxTextChars: z.number().int().min(500).max(50000).default(12000)
    })
  },
  async ({ pageId, includeHtml, maxTextChars }) => {
    const meta = await graphJson<Page>(
      `/me/onenote/pages/${encodeURIComponent(pageId)}?$select=id,title,createdDateTime,lastModifiedDateTime,contentUrl,links&$expand=parentSection,parentNotebook`
    );
    const html = await graphText(`/me/onenote/pages/${encodeURIComponent(pageId)}/content`);
    const text = htmlToText(html).slice(0, maxTextChars);

    return toolText({
      meta,
      text,
      html: includeHtml ? html : undefined
    });
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
