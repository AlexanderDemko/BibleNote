import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import { once } from 'node:events';

export type FakeService = {
  baseUrl: string;
  close: () => Promise<void>;
};

function json(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  response.end(JSON.stringify(value));
}

async function body(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return chunks.length > 0 ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
}

async function listen(handler: (request: IncomingMessage, response: ServerResponse, url: URL) => Promise<void> | void): Promise<FakeService> {
  const server = http.createServer((request, response) => {
    const url = new URL(request.url || '/', 'http://127.0.0.1');
    Promise.resolve(handler(request, response, url)).catch(error => {
      json(response, 500, { error: error instanceof Error ? error.message : String(error) });
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Fake service did not bind a TCP port.');
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
      server.closeAllConnections();
    })
  };
}

export function startFakeBibleNoteApi(): Promise<FakeService> {
  return listen(async (request, response, url) => {
    if (url.pathname === '/api/VerseParsing/Health') {
      return json(response, 200, { status: 'ok', modulesDirectory: 'e2e-modules' });
    }
    if (url.pathname === '/api/VerseParsing/Modules') {
      return json(response, 200, [
        { shortName: 'rst', displayName: 'Русский синодальный', isCurrent: true },
        { shortName: 'kjv', displayName: 'King James Version', isCurrent: false }
      ]);
    }
    if (url.pathname === '/api/VerseParsing/Books') {
      return json(response, 200, [
        { index: 40, name: 'От Матфея', shortName: 'Мф', chapterCount: 2, chapters: [1, 2] },
        { index: 43, name: 'От Иоанна', shortName: 'Ин', chapterCount: 3, chapters: [1, 2, 3] }
      ]);
    }
    if (url.pathname === '/api/VerseParsing/VerseText') {
      const bookIndex = Number(url.searchParams.get('bookIndex') || '40');
      const chapter = Number(url.searchParams.get('chapter') || '1');
      const isJohn = bookIndex === 43;
      const contextVerses = Number(url.searchParams.get('contextVerses') || '0');
      const verses = contextVerses > 0
        ? Array.from({ length:21 }, (_, index) => ({
            chapter,
            verse:index + 1,
            reference:`${chapter}:${index + 1}`,
            text:`Контекстный стих ${index + 1}. Достаточно длинная строка для проверки прокрутки диалога.`
          }))
        : [
            { chapter, verse:1, reference:`${chapter}:1`, text:'В начале было Слово, и Слово было у Бога.' },
            { chapter, verse:2, reference:`${chapter}:2`, text:'Оно было в начале у Бога.' },
            { chapter, verse:3, reference:`${chapter}:3`, text:'Всё чрез Него начало быть; знак &lt; не должен выглядеть как HTML-сущность.' }
          ];
      return json(response, 200, {
        module: url.searchParams.get('module') || 'rst',
        moduleName: 'Русский синодальный',
        bookIndex,
        bookName: isJohn ? 'От Иоанна' : 'От Матфея',
        bookShortName: isJohn ? 'Ин' : 'Мф',
        chapter,
        reference: `${isJohn ? 'Ин' : 'Мф'} ${chapter}`,
        verses
      });
    }
    if (url.pathname === '/api/VerseParsing/SearchText') {
      const query = String(url.searchParams.get('query') || url.searchParams.get('q') || '').toLocaleLowerCase();
      if (query.includes('матф')) return json(response, 200, [{
        module:url.searchParams.get('module') || 'rst',
        moduleName:'Русский синодальный',
        bookIndex:40,
        bookName:'От Матфея',
        bookShortName:'Мф',
        chapter:9,
        verse:9,
        topVerse:9,
        reference:'Мф 9:9',
        text:'Проходя оттуда, Иисус увидел человека.',
        searchWeight:0.63
      }]);
      if (!query.includes('начале') && !query.includes('слово')) return json(response, 200, []);
      return json(response, 200, [{
        module:url.searchParams.get('module') || 'rst',
        moduleName:'Русский синодальный',
        bookIndex:43,
        bookName:'От Иоанна',
        bookShortName:'Ин',
        chapter:1,
        verse:1,
        topVerse:1,
        reference:'Ин 1:1',
        text:'В начале было Слово, и Слово было у Бога.',
        searchWeight:1
      }]);
    }
    if (url.pathname === '/api/VerseParsing/ParallelVerseText') {
      return json(response, 200, {
        baseModule: url.searchParams.get('baseModule'),
        module: url.searchParams.get('module'),
        moduleName: 'King James Version',
        rows: []
      });
    }
    if (url.pathname === '/api/VerseParsing/ParsePage' && request.method === 'POST') {
      const input = await body(request);
      const referenceText = String(input.text || '');
      const isJohn = /(?:Ин|Иоан)/i.test(referenceText);
      const isMatthew = /(?:Мф|Матф)/i.test(referenceText);
      if (input.pageId === 'external-bible-ref' && (isJohn || isMatthew)) {
        return json(response, 200, {
          pageId:input.pageId,
          module:input.module,
          paragraphs:[{
            index:0,
            text:input.text,
            references:[{
              originalText:input.text,
              normalized:isJohn ? 'Ин 3:16' : 'Мф 19:3-5',
              bookIndex:isJohn ? 43 : 40,
              bookName:isJohn ? 'От Иоанна' : 'От Матфея',
              bookShortName:isJohn ? 'Ин' : 'Мф',
              chapter:isJohn ? 3 : 19,
              verse:isJohn ? 16 : 3,
              topChapter:isJohn ? 3 : 19,
              topVerse:isJohn ? 16 : 5,
              startIndex:0,
              endIndex:referenceText.length
            }]
          }],
          relations:[],
          relationsCapped:false
        });
      }
      return json(response, 200, {
        pageId: input.pageId,
        module: input.module,
        paragraphs: [],
        relations: [],
        relationsCapped: false
      });
    }
    if (url.pathname === '/api/VerseParsing/ParseLink') {
      return json(response, 200, {
        originalText: url.searchParams.get('ref'), normalizedRef: 'Ин 3:16', bookIndex: 43,
        bookName: 'От Иоанна', bookShortName: 'Ин', chapter: 3, verse: 16, topChapter: 3, topVerse: 16
      });
    }
    return json(response, 404, { error: `Unhandled fake BibleNote route: ${url.pathname}` });
  });
}

export function startFakeElectronControl(): Promise<FakeService> {
  return listen((_request, response, url) => {
    if (url.pathname === '/protocol/status' || url.pathname === '/protocol/register') {
      return json(response, 200, { available: true, registered: true });
    }
    if (url.pathname.startsWith('/onenote-integration/')) {
      return json(response, 200, { platform: 'win32', enabled: false, installedPrograms: [] });
    }
    if (url.pathname === '/open-external') return json(response, 200, { opened: true });
    return json(response, 200, { available: true });
  });
}

export function startFakeGraph(): Promise<FakeService> {
  return listen((_request, response, url) => {
    const now = new Date().toISOString();
    if (url.pathname.endsWith('/me/onenote/notebooks')) {
      return json(response, 200, { value: [{ id: 'notebook-study', displayName: 'Учебный блокнот', isDefault: true, lastModifiedDateTime: now }] });
    }
    if (url.pathname.includes('/notebooks/notebook-study/sections')) {
      return json(response, 200, { value: [{
        id: 'section-gospel', displayName: 'Евангелие от Иоанна', lastModifiedDateTime: now,
        pagesUrl: '/me/onenote/sections/section-gospel/pages',
        parentNotebook: { id: 'notebook-study', displayName: 'Учебный блокнот' }
      }] });
    }
    if (url.pathname.includes('/notebooks/notebook-study/sectionGroups')) return json(response, 200, { value: [] });
    if (url.pathname.includes('/sections/section-gospel/pages')) {
      return json(response, 200, { value: [
        {
          id: 'page-grace', title: 'Благодать и надежда', lastModifiedDateTime: now,
          contentUrl: '/me/onenote/pages/page-grace/content',
          parentSection: { id: 'section-gospel', displayName: 'Евангелие от Иоанна' },
          parentNotebook: { id: 'notebook-study', displayName: 'Учебный блокнот' }, order: 0, level: 0
        },
        {
          id: 'page-from-sync', title: 'Новая страница из OneNote', lastModifiedDateTime: now,
          contentUrl: '/me/onenote/pages/page-from-sync/content',
          parentSection: { id: 'section-gospel', displayName: 'Евангелие от Иоанна' },
          parentNotebook: { id: 'notebook-study', displayName: 'Учебный блокнот' }, order: 2, level: 0
        }
      ] });
    }
    if (url.pathname.includes('/pages/page-grace/content')) {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return response.end('<html><body><p>Благодать даёт надежду. Воскресение изменяет всё.</p></body></html>');
    }
    if (url.pathname.includes('/pages/page-from-sync/content')) {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return response.end('<html><body><p>Эта страница загружена детерминированным e2e-тестом.</p></body></html>');
    }
    return json(response, 404, { error: `Unhandled fake Graph route: ${url.pathname}${url.search}` });
  });
}
