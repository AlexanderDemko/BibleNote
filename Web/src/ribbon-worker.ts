import './env.js';
import { pathToFileURL } from 'node:url';
import {
  bibleNoteCurrentOneNotePage,
  bibleNoteQuickAnalyzeCurrentPage,
  type OneNoteCurrentPage
} from './biblenote-gateway.js';
import { defaultDbPath, openCacheDb, recordSyncHistory } from './cache.js';
import { syncOneNoteComCache } from './sync-com.js';
import type { SyncOptions, SyncResult } from './sync.js';

export type AnalyzeCurrentPageDependencies = {
  currentPage: () => Promise<OneNoteCurrentPage>;
  syncPage: (options: SyncOptions) => Promise<SyncResult>;
  quickAnalyze: () => Promise<Record<string, unknown>>;
  saveHistory: (page: OneNoteCurrentPage, result: SyncResult) => void;
};

const defaultDependencies: AnalyzeCurrentPageDependencies = {
  currentPage:bibleNoteCurrentOneNotePage,
  syncPage:syncOneNoteComCache,
  quickAnalyze:bibleNoteQuickAnalyzeCurrentPage,
  saveHistory:(page, result) => {
    const db = openCacheDb(result.dbPath);
    try {
      recordSyncHistory(db, {
        startedAt:result.startedAt,
        finishedAt:result.finishedAt,
        status:result.contentErrors || result.sectionScanErrors || result.bibleRefsParseErrors
          ? 'completed_with_errors'
          : 'success',
        mode:'page',
        scope:page.title?.trim() ? `Страница «${page.title.trim()}»` : 'Одна страница',
        request:{
          concurrency:1,
          pageId:page.pageId,
          forceContent:true,
          parseBibleRefs:true,
          forceBibleParse:true
        },
        result:{
          notebooks:result.notebooks,
          sections:result.sections,
          sectionGroups:result.sectionGroups,
          pages:result.pages,
          contentDownloaded:result.contentDownloaded,
          contentSkipped:result.contentSkipped,
          contentErrors:result.contentErrors,
          sectionScanErrors:result.sectionScanErrors,
          bibleRefsPagesParsed:result.bibleRefsPagesParsed,
          bibleRefsParseSkipped:result.bibleRefsParseSkipped,
          bibleRefsParseErrors:result.bibleRefsParseErrors,
          bibleRefsRecognized:result.bibleRefsRecognized,
          deletedPagesMarked:result.deletedPagesMarked
        },
        error:null
      });
    } finally {
      db.close();
    }
  }
};

export async function analyzeCurrentOneNotePage(
  dbPath = defaultDbPath,
  dependencies: AnalyzeCurrentPageDependencies = defaultDependencies
): Promise<Record<string, unknown>> {
  const currentPage = await dependencies.currentPage();
  const sync = await dependencies.syncPage({
    dbPath,
    pageId:currentPage.pageId,
    forceContent:true,
    parseBibleRefs:true,
    forceBibleParse:true,
    dataSource:'com'
  });
  dependencies.saveHistory(currentPage, sync);
  const comAnalysis = await dependencies.quickAnalyze();
  return {
    currentPage:{
      id:currentPage.pageId,
      title:currentPage.title?.trim() || undefined,
      clientUrl:currentPage.clientUrl
    },
    sync,
    comAnalysis
  };
}

function readOption(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

async function main(argv: string[]): Promise<void> {
  const action = readOption(argv, '--action');
  if (action !== 'analyze-current') throw new Error(`Unsupported Ribbon worker action: ${action || '(missing)'}`);
  const result = await analyzeCurrentOneNotePage(readOption(argv, '--db') || defaultDbPath);
  process.stdout.write(`BIBLENOTE_RIBBON_RESULT=${JSON.stringify(result)}\n`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main(process.argv.slice(2)).catch(error => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
