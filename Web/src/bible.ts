export const bibleParserVersion = 'biblenote-http-v1';

export type BibleReference = {
  originalText?: string;
  normalized?: string;
  bookIndex?: number;
  bookName?: string;
  bookShortName?: string;
  chapter?: number;
  verse?: number;
  topChapter?: number;
  topVerse?: number;
  isChapter?: boolean;
  startIndex?: number;
  endIndex?: number;
  entryType?: string;
  entryOptions?: string;
};

export type BibleNotFoundReference = {
  normalized?: string;
  bookIndex?: number;
  chapter?: number;
  verse?: number;
  topChapter?: number;
  topVerse?: number;
  isChapter?: boolean;
};

export type BibleParsedParagraph = {
  index: number;
  path?: string | null;
  text?: string | null;
  versesCount?: number;
  references?: BibleReference[];
  notFound?: BibleNotFoundReference[];
};

export type BibleParseResult = {
  pageId?: string;
  module?: string;
  useCommaDelimiter?: boolean;
  paragraphs?: BibleParsedParagraph[];
};

export type BibleParseConfig = {
  enabled: boolean;
  apiUrl: string;
  module: string;
  useCommaDelimiter: boolean;
  timeoutMs: number;
};

export type BibleVerseText = {
  module?: string;
  moduleName?: string;
  bookIndex?: number;
  bookName?: string;
  bookShortName?: string;
  chapter?: number;
  verse?: number;
  topChapter?: number | null;
  topVerse?: number | null;
  reference?: string;
  text?: string;
  verses?: Array<{
    chapter: number;
    verse: number;
    topVerse?: number | null;
    reference?: string;
    text?: string;
    isFullVerse?: boolean;
    isPartOfBigVerse?: boolean;
    hasValueEvenIfEmpty?: boolean;
  }>;
};

export function bibleParseConfigFromEnv(overrides: Partial<BibleParseConfig> = {}): BibleParseConfig {
  const timeoutMs = Number(process.env.BIBLENOTE_API_TIMEOUT_MS ?? '30000');
  const config = {
    enabled: process.env.ONENOTE_BIBLE_PARSE_ENABLED === 'true',
    apiUrl: process.env.BIBLENOTE_API_URL ?? 'http://127.0.0.1:5000',
    module: process.env.BIBLENOTE_MODULE ?? 'rst',
    useCommaDelimiter: process.env.BIBLENOTE_USE_COMMA_DELIMITER !== 'false',
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? Math.min(timeoutMs, 300000) : 30000
  };
  return Object.assign(
    config,
    Object.fromEntries(Object.entries(overrides).filter(([, value]) => value !== undefined))
  );
}

export async function parsePageWithBibleNote(options: {
  apiUrl: string;
  pageId: string;
  title?: string | null;
  html?: string | null;
  text?: string | null;
  module: string;
  useCommaDelimiter: boolean;
  timeoutMs: number;
}): Promise<BibleParseResult> {
  if (!options.html && !options.text && !options.title) {
    return { pageId: options.pageId, module: options.module, paragraphs: [] };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    const response = await fetch(`${options.apiUrl.replace(/\/+$/, '')}/api/VerseParsing/ParsePage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pageId: options.pageId,
        title: options.title ?? undefined,
        html: options.html ?? undefined,
        text: options.html ? undefined : options.text ?? undefined,
        module: options.module,
        useCommaDelimiter: options.useCommaDelimiter
      }),
      signal: controller.signal
    });

    const responseText = await response.text();
    if (!response.ok) {
      throw new Error(`BibleNote API returned ${response.status}: ${responseText.slice(0, 2000)}`);
    }

    return responseText ? JSON.parse(responseText) as BibleParseResult : { pageId: options.pageId, module: options.module, paragraphs: [] };
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      throw new Error(`BibleNote API timed out after ${options.timeoutMs} ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function getVerseTextWithBibleNote(options: {
  apiUrl: string;
  module: string;
  bookIndex: number;
  chapter: number;
  verse?: number | null;
  topChapter?: number | null;
  topVerse?: number | null;
  contextVerses?: number | null;
  timeoutMs: number;
}): Promise<BibleVerseText> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    const params = new URLSearchParams({
      module: options.module,
      bookIndex: String(options.bookIndex),
      chapter: String(options.chapter)
    });
    if (options.verse != null) params.set('verse', String(options.verse));
    if (options.topChapter != null) params.set('topChapter', String(options.topChapter));
    if (options.topVerse != null) params.set('topVerse', String(options.topVerse));
    if (options.contextVerses != null) params.set('contextVerses', String(options.contextVerses));

    const response = await fetch(`${options.apiUrl.replace(/\/+$/, '')}/api/VerseParsing/VerseText?${params.toString()}`, {
      signal: controller.signal
    });

    const responseText = await response.text();
    if (!response.ok) {
      throw new Error(`BibleNote API returned ${response.status}: ${responseText.slice(0, 2000)}`);
    }

    return responseText ? JSON.parse(responseText) as BibleVerseText : {};
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      throw new Error(`BibleNote API timed out after ${options.timeoutMs} ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
