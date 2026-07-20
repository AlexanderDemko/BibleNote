import { runtimeLog } from './runtime-logging.js';

export const bibleParserVersion = 'biblenote-http-v4';

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

export type BibleRelation = {
  paragraphIndex: number;
  referenceIndex: number;
  verseId: number;
  relativeParagraphIndex: number;
  relativeReferenceIndex: number;
  relativeVerseId: number;
  relationWeight: number;
};

export type BibleParseResult = {
  pageId?: string;
  module?: string;
  useCommaDelimiter?: boolean;
  html?: string | null;
  paragraphs?: BibleParsedParagraph[];
  relations?: BibleRelation[];
  relationsCapped?: boolean;
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
  const timeoutMs = Number(process.env.BIBLENOTE_API_TIMEOUT_MS ?? '120000');
  const config = {
    enabled: process.env.ONENOTE_BIBLE_PARSE_ENABLED === 'true',
    apiUrl: process.env.BIBLENOTE_API_URL ?? 'http://127.0.0.1:5000',
    module: process.env.BIBLENOTE_MODULE ?? 'rst',
    useCommaDelimiter: process.env.BIBLENOTE_USE_COMMA_DELIMITER !== 'false',
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? Math.min(timeoutMs, 300000) : 120000
  };
  return Object.assign(
    config,
    Object.fromEntries(Object.entries(overrides).filter(([, value]) => value !== undefined))
  );
}

function fetchErrorMessage(error: unknown, target: string): string {
  if (!(error instanceof Error)) return String(error);
  const cause = (error as Error & { cause?: unknown }).cause;
  const causeMessage = cause instanceof Error ? `: ${cause.message}` : '';
  return `${error.message}${causeMessage} (${target})`;
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
  updateHtml?: boolean;
}): Promise<BibleParseResult> {
  if (!options.html && !options.text && !options.title) {
    return { pageId: options.pageId, module: options.module, paragraphs: [] };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
  const target = `${options.apiUrl.replace(/\/+$/, '')}/api/VerseParsing/ParsePage`;
  const startedAt = Date.now();
  runtimeLog('biblenote-api', 'ParsePage request', {
    pageId: options.pageId,
    title: options.title,
    module: options.module,
    hasHtml: Boolean(options.html),
    hasText: Boolean(options.text),
    updateHtml: options.updateHtml === true,
    timeoutMs: options.timeoutMs
  });
  try {
    const response = await fetch(target, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pageId: options.pageId,
        title: options.title ?? undefined,
        html: options.html ?? undefined,
        text: options.html ? undefined : options.text ?? undefined,
        module: options.module,
        useCommaDelimiter: options.useCommaDelimiter,
        updateHtml: options.updateHtml === true
      }),
      signal: controller.signal
    });

    const responseText = await response.text();
    if (!response.ok) {
      throw new Error(`BibleNote API returned ${response.status}: ${responseText.slice(0, 2000)}`);
    }

    const parsed = responseText ? JSON.parse(responseText) as BibleParseResult : { pageId: options.pageId, module: options.module, paragraphs: [] };
    runtimeLog('biblenote-api', 'ParsePage response', {
      pageId: options.pageId,
      status: response.status,
      durationMs: Date.now() - startedAt,
      paragraphs: parsed.paragraphs?.length ?? 0,
      references: (parsed.paragraphs ?? []).reduce((sum, paragraph) => sum + (paragraph.references?.length ?? 0), 0),
      relations: parsed.relations?.length ?? 0,
      relationsCapped: parsed.relationsCapped === true,
      hasHtml: Boolean(parsed.html)
    });
    return parsed;
  } catch (error: any) {
    runtimeLog('biblenote-api', 'ParsePage failed', {
      pageId: options.pageId,
      durationMs: Date.now() - startedAt,
      error: error?.stack ?? error?.message ?? String(error)
    });
    if (error?.name === 'AbortError') {
      throw new Error(`BibleNote API timed out after ${options.timeoutMs} ms`);
    }
    throw new Error(`BibleNote API request failed: ${fetchErrorMessage(error, target)}`);
  } finally {
    clearTimeout(timeout);
  }
}

export async function getVerseTextWithBibleNote(options: {
  apiUrl: string;
  module: string;
  bookIndex: number;
  bookName?: string | null;
  bookShortName?: string | null;
  originalText?: string | null;
  chapter: number;
  verse?: number | null;
  topChapter?: number | null;
  topVerse?: number | null;
  contextVerses?: number | null;
  timeoutMs: number;
}): Promise<BibleVerseText> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
  const startedAt = Date.now();
  const maxAttempts = 3;
  try {
    const params = new URLSearchParams({
      module: options.module,
      bookIndex: String(options.bookIndex),
      chapter: String(options.chapter)
    });
    if (options.bookName) params.set('bookName', options.bookName);
    if (options.bookShortName) params.set('bookShortName', options.bookShortName);
    if (options.originalText) params.set('originalText', options.originalText);
    if (options.verse != null) params.set('verse', String(options.verse));
    if (options.topChapter != null) params.set('topChapter', String(options.topChapter));
    if (options.topVerse != null) params.set('topVerse', String(options.topVerse));
    if (options.contextVerses != null) params.set('contextVerses', String(options.contextVerses));

    const target = `${options.apiUrl.replace(/\/+$/, '')}/api/VerseParsing/VerseText?${params.toString()}`;
    runtimeLog('biblenote-api', 'VerseText request', {
      module: options.module,
      bookIndex: options.bookIndex,
      bookName: options.bookName,
      bookShortName: options.bookShortName,
      chapter: options.chapter,
      verse: options.verse,
      topChapter: options.topChapter,
      topVerse: options.topVerse,
      contextVerses: options.contextVerses,
      timeoutMs: options.timeoutMs
    });
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await fetch(target, { signal: controller.signal });
        const responseText = await response.text();
        if (!response.ok) {
          const responseError = new Error(`BibleNote API returned ${response.status}: ${responseText.slice(0, 2000)}`) as Error & { status?: number };
          responseError.status = response.status;
          throw responseError;
        }

        const parsed = responseText ? JSON.parse(responseText) as BibleVerseText : {};
        runtimeLog('biblenote-api', 'VerseText response', {
          status: response.status,
          attempt,
          durationMs: Date.now() - startedAt,
          reference: parsed.reference,
          verses: parsed.verses?.length ?? 0
        });
        return parsed;
      } catch (error: any) {
        if (error?.name === 'AbortError') throw error;
        const status = Number(error?.status);
        const retryable = !Number.isInteger(status)
          || status === 404
          || status === 408
          || status === 429
          || status >= 500;
        if (!retryable || attempt >= maxAttempts) throw error;
        const retryDelayMs = attempt === 1 ? 150 : 450;
        runtimeLog('biblenote-api', 'VerseText retry scheduled', {
          attempt,
          nextAttempt:attempt + 1,
          retryDelayMs,
          status:Number.isInteger(status) ? status : undefined,
          bookIndex:options.bookIndex,
          chapter:options.chapter,
          verse:options.verse,
          error:error?.message ?? String(error)
        });
        await new Promise(resolve => setTimeout(resolve, retryDelayMs));
      }
    }
    throw new Error('BibleNote API verse text retry loop ended unexpectedly.');
  } catch (error: any) {
    runtimeLog('biblenote-api', 'VerseText failed', {
      durationMs: Date.now() - startedAt,
      bookIndex: options.bookIndex,
      chapter: options.chapter,
      verse: options.verse,
      error: error?.stack ?? error?.message ?? String(error)
    });
    if (error?.name === 'AbortError') {
      throw new Error(`BibleNote API timed out after ${options.timeoutMs} ms`);
    }
    throw new Error(`BibleNote API request failed: ${fetchErrorMessage(error, `${options.apiUrl.replace(/\/+$/, '')}/api/VerseParsing/VerseText`)}`);
  } finally {
    clearTimeout(timeout);
  }
}
