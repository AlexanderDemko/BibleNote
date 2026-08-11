import { promises as fs } from 'node:fs';
import { execFile } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import * as cheerio from 'cheerio';
import JSZip from 'jszip';
import mammoth from 'mammoth';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { htmlToText } from './html.js';

export const folderSourceExtensions = new Set(['.html', '.htm', '.txt', '.doc', '.docx', '.pdf']);
export const pdfExtractionVersion = 4;
export const wordExtractionVersion = 1;

export type FolderExtractionQuality = 'textual' | 'heuristic' | 'requires_ocr';

export type FolderExtractionResult = {
  format: 'html' | 'text' | 'doc' | 'docx' | 'pdf';
  html: string;
  text: string;
  quality: FolderExtractionQuality;
  qualityMessage: string;
  warnings: string[];
};

export type LegacyDocConverter = (sourcePath: string, targetDocxPath: string) => Promise<void>;

export type FolderExtractionOptions = {
  legacyDocConverter?: LegacyDocConverter;
};

export class WordComUnavailableError extends Error {
  readonly code = 'WORD_COM_UNAVAILABLE';

  constructor(message: string) {
    super(message);
    this.name = 'WordComUnavailableError';
  }
}

const wordDocConversionScript = String.raw`
$ErrorActionPreference = 'Stop'
$word = $null
$document = $null
$exitCode = 0
try {
  try {
    $word = New-Object -ComObject Word.Application
  } catch {
    [Console]::Error.WriteLine($_.Exception.Message)
    $exitCode = 41
  }
  if ($exitCode -eq 0) {
    try {
      $word.Visible = $false
      $word.DisplayAlerts = 0
      try { $word.AutomationSecurity = 3 } catch {}
      $document = $word.Documents.Open($env:BIBLENOTE_DOC_INPUT, $false, $true)
      $document.SaveAs2($env:BIBLENOTE_DOC_OUTPUT, 16)
    } catch {
      [Console]::Error.WriteLine($_.Exception.Message)
      $exitCode = 42
    }
  }
} finally {
  if ($null -ne $document) {
    try { $document.Close(0) } catch {}
    try { [Runtime.InteropServices.Marshal]::FinalReleaseComObject($document) | Out-Null } catch {}
  }
  if ($null -ne $word) {
    try { $word.Quit() } catch {}
    try { [Runtime.InteropServices.Marshal]::FinalReleaseComObject($word) | Out-Null } catch {}
  }
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}
exit $exitCode
`;

export async function convertLegacyDocWithWordCom(sourcePath: string, targetDocxPath: string): Promise<void> {
  if (process.platform !== 'win32') {
    throw new WordComUnavailableError(`Microsoft Word COM is available only on Windows; current platform is ${process.platform}.`);
  }
  const encodedCommand = Buffer.from(wordDocConversionScript, 'utf16le').toString('base64');
  await new Promise<void>((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encodedCommand],
      {
        windowsHide:true,
        timeout:120_000,
        maxBuffer:1024 * 1024,
        env:{
          ...process.env,
          BIBLENOTE_DOC_INPUT:path.resolve(sourcePath),
          BIBLENOTE_DOC_OUTPUT:path.resolve(targetDocxPath)
        }
      },
      (error, _stdout, stderr) => {
        if (!error) return resolve();
        const exitCode = (error as { code?: unknown }).code;
        const detail = String(stderr || error.message).trim();
        if (exitCode === 41 || exitCode === 'ENOENT') {
          return reject(new WordComUnavailableError(
            detail
              ? `Microsoft Word is not installed or its COM server is unavailable: ${detail}`
              : 'Microsoft Word is not installed or its COM server is unavailable.'
          ));
        }
        reject(new Error(`Microsoft Word could not convert the .doc file${detail ? `: ${detail}` : '.'}`));
      }
    );
  });
}

type PdfLine = {
  y: number;
  height: number;
  items: Array<{ x: number; width: number; text: string }>;
};

type PdfTextItem = {
  str: string;
  transform: number[];
  width: number;
  height: number;
};

const windows1251Decoder = new TextDecoder('windows-1251');

function repairWindows1251Run(text: string): string {
  const characters = [...text];
  const legacyCyrillicBytes = characters.filter(character => {
    const code = character.codePointAt(0) ?? 0;
    return (code >= 0xc0 && code <= 0xff) || code === 0xa8 || code === 0xb8;
  }).length;
  if (legacyCyrillicBytes < 2) return text;

  const decoded = windows1251Decoder.decode(Uint8Array.from(characters, character => character.codePointAt(0) ?? 0));
  const decodedLetters = decoded.match(/\p{L}/gu)?.length ?? 0;
  const decodedCyrillic = decoded.match(/[\u0400-\u04ff]/gu)?.length ?? 0;
  const originalCyrillic = text.match(/[\u0400-\u04ff]/gu)?.length ?? 0;
  if (decodedCyrillic <= originalCyrillic || decodedCyrillic < Math.ceil(decodedLetters * 0.65)) return text;
  return decoded;
}

export function repairPdfTextEncoding(text: string): string {
  return text.replace(/[\u0000-\u00ff]+/gu, run => repairWindows1251Run(run));
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeDocumentHtml(rawHtml: string, title: string): string {
  const $ = cheerio.load(rawHtml);
  $('script,noscript,iframe,object,embed,form,input,button,textarea,select,base').remove();
  $('meta[http-equiv],link[rel="preload"],link[rel="modulepreload"]').remove();
  $('*').each((_, element) => {
    const attributes = 'attribs' in element ? element.attribs : {};
    for (const attribute of Object.keys(attributes ?? {})) {
      if (/^on/i.test(attribute) || attribute.toLowerCase() === 'srcdoc') $(element).removeAttr(attribute);
    }
    for (const attribute of ['href', 'src', 'action', 'formaction']) {
      const value = $(element).attr(attribute)?.trim();
      if (!value) continue;
      if (/^(?:javascript|vbscript|file):/i.test(value)) $(element).removeAttr(attribute);
      if (/^data:/i.test(value) && !(attribute === 'src' && /^data:image\//i.test(value))) {
        $(element).removeAttr(attribute);
      }
    }
  });
  if (!$('title').length) $('head').append(`<title>${escapeHtml(title)}</title>`);
  return $.html();
}

type WordRunMetadata = {
  text: string;
  color?: string;
};

type WordParagraphLayout = {
  start?: number;
  end?: number;
  firstLine?: number;
  hanging?: number;
  before?: number;
  after?: number;
  alignment?: string;
  fontSize?: number;
  bold?: boolean;
};

type WordParagraphMetadata = {
  text: string;
  styleName: string;
  directNumId?: string;
  layout: WordParagraphLayout;
  runs: WordRunMetadata[];
};

type WordStyleMetadata = {
  basedOn?: string;
  name: string;
  paragraph: WordParagraphLayout;
  run: Pick<WordParagraphLayout, 'fontSize' | 'bold'> & { color?: string };
};

function wordXmlChild($: cheerio.CheerioAPI, element: any, name: string): cheerio.Cheerio<any> {
  return $(element).children(`w\\:${name}`).first();
}

function wordXmlValue(element: cheerio.Cheerio<any>, name = 'w:val'): string | undefined {
  const value = element.attr(name) ?? element.attr(name.replace(/^w:/, ''));
  return value == null || value === '' ? undefined : value;
}

function wordXmlNumber(value: string | undefined): number | undefined {
  if (value == null || !/^-?\d+(?:\.\d+)?$/u.test(value)) return undefined;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

function wordBooleanProperty(element: cheerio.Cheerio<any>): boolean | undefined {
  if (!element.length) return undefined;
  const value = wordXmlValue(element);
  return value == null || !['0', 'false', 'off', 'none'].includes(value.toLocaleLowerCase('en-US'));
}

function mergeDefined<T extends object>(base: T, override: Partial<T>): T {
  const result = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (value !== undefined) (result as Record<string, unknown>)[key] = value;
  }
  return result;
}

function readWordParagraphLayout($: cheerio.CheerioAPI, properties: cheerio.Cheerio<any>): WordParagraphLayout {
  if (!properties.length) return {};
  const indentation = properties.children('w\\:ind').first();
  const spacing = properties.children('w\\:spacing').first();
  const runProperties = properties.children('w\\:rPr').first();
  const fontSize = wordXmlNumber(wordXmlValue(runProperties.children('w\\:sz').first()));
  return {
    start:wordXmlNumber(indentation.attr('w:start') ?? indentation.attr('w:left')),
    end:wordXmlNumber(indentation.attr('w:end') ?? indentation.attr('w:right')),
    firstLine:wordXmlNumber(indentation.attr('w:firstLine')),
    hanging:wordXmlNumber(indentation.attr('w:hanging')),
    before:wordXmlNumber(spacing.attr('w:before')),
    after:wordXmlNumber(spacing.attr('w:after')),
    alignment:wordXmlValue(properties.children('w\\:jc').first()),
    fontSize:fontSize == null ? undefined : fontSize / 2,
    bold:wordBooleanProperty(runProperties.children('w\\:b').first())
  };
}

function readWordRunStyle($: cheerio.CheerioAPI, properties: cheerio.Cheerio<any>): WordStyleMetadata['run'] {
  if (!properties.length) return {};
  const fontSize = wordXmlNumber(wordXmlValue(properties.children('w\\:sz').first()));
  const rawColor = wordXmlValue(properties.children('w\\:color').first());
  const color = rawColor && /^[0-9a-f]{6}$/iu.test(rawColor) ? rawColor.toUpperCase() : undefined;
  return {
    color,
    fontSize:fontSize == null ? undefined : fontSize / 2,
    bold:wordBooleanProperty(properties.children('w\\:b').first())
  };
}

function wordParagraphText($: cheerio.CheerioAPI, paragraph: any): string {
  return $(paragraph).find('w\\:t,w\\:tab,w\\:br').toArray()
    .filter(element => $(element).parents('w\\:p').first().get(0) === paragraph)
    .map(element => {
      const name = String((element as any).tagName || (element as any).name || '').replace(/^.*:/u, '');
      return name === 't' ? $(element).text() : name === 'tab' ? '\t' : '\n';
    }).join('');
}

async function readWordDocumentMetadata(buffer: Buffer): Promise<WordParagraphMetadata[]> {
  const zip = await JSZip.loadAsync(buffer);
  const documentSource = await zip.file('word/document.xml')?.async('text');
  if (!documentSource) return [];
  const stylesSource = await zip.file('word/styles.xml')?.async('text');
  const $document = cheerio.load(documentSource, { xmlMode:true });
  const $styles = cheerio.load(stylesSource || '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"/>', { xmlMode:true });
  const styles = new Map<string, WordStyleMetadata>();
  $styles('w\\:style').each((_, element) => {
    const style = $styles(element);
    const styleId = style.attr('w:styleId') ?? style.attr('styleId');
    if (!styleId) return;
    styles.set(styleId, {
      basedOn:wordXmlValue(style.children('w\\:basedOn').first()),
      name:wordXmlValue(style.children('w\\:name').first()) || '',
      paragraph:readWordParagraphLayout($styles, style.children('w\\:pPr').first()),
      run:readWordRunStyle($styles, style.children('w\\:rPr').first())
    });
  });
  const resolvedStyles = new Map<string, WordStyleMetadata>();
  const resolveStyle = (styleId: string | undefined, active = new Set<string>()): WordStyleMetadata => {
    if (!styleId) return { name:'', paragraph:{}, run:{} };
    const cached = resolvedStyles.get(styleId);
    if (cached) return cached;
    const own = styles.get(styleId);
    if (!own || active.has(styleId)) return own || { name:'', paragraph:{}, run:{} };
    active.add(styleId);
    const parent = resolveStyle(own.basedOn, active);
    active.delete(styleId);
    const resolved = {
      basedOn:own.basedOn,
      name:own.name || parent.name,
      paragraph:mergeDefined(parent.paragraph, own.paragraph),
      run:mergeDefined(parent.run, own.run)
    };
    resolvedStyles.set(styleId, resolved);
    return resolved;
  };
  const docDefaults = readWordRunStyle(
    $styles,
    $styles('w\\:docDefaults').first().find('w\\:rPrDefault > w\\:rPr').first()
  );

  return $document('w\\:p').toArray().map(paragraph => {
    const paragraphProperties = wordXmlChild($document, paragraph, 'pPr');
    const styleId = wordXmlValue(paragraphProperties.children('w\\:pStyle').first());
    const paragraphStyle = resolveStyle(styleId);
    const layout = mergeDefined(paragraphStyle.paragraph, readWordParagraphLayout($document, paragraphProperties));
    const directNumId = wordXmlValue(paragraphProperties.children('w\\:numPr').first().children('w\\:numId').first());
    const runs = $document(paragraph).find('w\\:r').toArray()
      .filter(run => $document(run).parents('w\\:p').first().get(0) === paragraph)
      .map(run => {
        const runProperties = wordXmlChild($document, run, 'rPr');
        const runStyleId = wordXmlValue(runProperties.children('w\\:rStyle').first());
        const inheritedRun = mergeDefined(docDefaults, mergeDefined(paragraphStyle.run, resolveStyle(runStyleId).run));
        const runStyle = mergeDefined(inheritedRun, readWordRunStyle($document, runProperties));
        return {
          text:$document(run).find('w\\:t').toArray().map(textNode => $document(textNode).text()).join(''),
          color:runStyle.color
        };
      });
    return {
      text:wordParagraphText($document, paragraph),
      styleName:paragraphStyle.name,
      directNumId,
      layout:mergeDefined(layout, paragraphStyle.run),
      runs
    };
  });
}

function wordElementText(element: any): string {
  if (element?.type === 'text') return String(element.value || '');
  if (element?.type === 'tab') return '\t';
  return Array.isArray(element?.children) ? element.children.map(wordElementText).join('') : '';
}

function wordPoints(twips: number): string {
  return `${Math.round((twips / 20) * 100) / 100}pt`;
}

function wordParagraphCss(layout: WordParagraphLayout): string {
  const declarations: string[] = [];
  const alignment = { both:'justify', distribute:'justify' }[layout.alignment || ''] || layout.alignment;
  if (['left', 'right', 'center', 'justify'].includes(alignment || '')) declarations.push(`text-align:${alignment}`);
  if (layout.start) declarations.push(`margin-left:${wordPoints(layout.start)}`);
  if (layout.end) declarations.push(`margin-right:${wordPoints(layout.end)}`);
  if (layout.firstLine) declarations.push(`text-indent:${wordPoints(layout.firstLine)}`);
  else if (layout.hanging) declarations.push(`text-indent:-${wordPoints(layout.hanging)}`);
  if (layout.before != null) declarations.push(`margin-top:${wordPoints(layout.before)}`);
  if (layout.after != null) declarations.push(`margin-bottom:${wordPoints(layout.after)}`);
  if (layout.fontSize) declarations.push(`font-size:${layout.fontSize}pt`);
  if (layout.bold) declarations.push('font-weight:700');
  return declarations.join(';');
}

function wordHeadingTag(styleName: string): string {
  const match = /^heading\s+([1-6])$/iu.exec(styleName.trim());
  return match ? `h${match[1]}` : 'p';
}

function wordContinuationPath(level: number): string {
  return Array.from({ length:level + 1 }, () => 'ol|ul > li').join(' > ')
    + ' > p.bn-word-list-continuation:fresh';
}

function createWordDocumentTransform(metadata: WordParagraphMetadata[], styleMap: string[]): (document: any) => any {
  let paragraphIndex = 0;
  const styleRules = new Map<string, string>();
  const listIndents: number[] = [];
  const ensureRule = (key: string, rule: string): string => {
    const existing = styleRules.get(key);
    if (existing) return existing;
    const styleId = `BibleNoteWord${styleRules.size + 1}`;
    styleRules.set(key, styleId);
    styleMap.push(rule.replace('{styleId}', styleId));
    return styleId;
  };
  const transformParagraphChildren = (element: any, paragraph: WordParagraphMetadata): any[] => {
    let runIndex = 0;
    const visit = (child: any): any => {
      if (child?.type === 'run') {
        const runText = wordElementText(child);
        let matchIndex = paragraph.runs.findIndex((run, index) => index >= runIndex && index < runIndex + 8 && run.text === runText);
        if (matchIndex < 0) matchIndex = runIndex;
        const sourceRun = paragraph.runs[matchIndex];
        runIndex = Math.min(paragraph.runs.length, matchIndex + 1);
        const transformed = Array.isArray(child.children)
          ? { ...child, children:child.children.map(visit) }
          : child;
        if (!sourceRun?.color) return transformed;
        const styleId = ensureRule(
          `color:${sourceRun.color}`,
          `r.{styleId} => span[style='color:#${sourceRun.color}']`
        );
        return { ...transformed, styleId };
      }
      return Array.isArray(child?.children) ? { ...child, children:child.children.map(visit) } : child;
    };
    return (element.children || []).map(visit);
  };
  const visit = (element: any): any => {
    if (element?.type === 'paragraph') {
      const elementText = wordElementText(element).replace(/\s+/gu, ' ').trim();
      let matchingIndex = metadata.findIndex((paragraph, index) =>
        index >= paragraphIndex && paragraph.text.replace(/\s+/gu, ' ').trim() === elementText
      );
      if (matchingIndex < 0) matchingIndex = paragraphIndex;
      const paragraph = metadata[matchingIndex] || { text:'', styleName:'', layout:{}, runs:[] };
      paragraphIndex = Math.min(metadata.length, matchingIndex + 1);
      let transformed = { ...element, children:transformParagraphChildren(element, paragraph) };
      const start = Number(paragraph.layout.start);
      if (element.numbering) {
        let level = Number(element.numbering.level) || 0;
        if (Number.isFinite(start) && start > 0) {
          const matchingLevel = listIndents.findIndex(indent => Math.abs(indent - start) <= 20);
          if (matchingLevel >= 0) {
            listIndents.splice(matchingLevel + 1);
            level = matchingLevel;
          } else if (listIndents.length === 0 || start > listIndents[listIndents.length - 1] + 20) {
            listIndents.push(start);
            level = listIndents.length - 1;
          } else {
            while (listIndents.length > 0 && start < listIndents[listIndents.length - 1] - 20) listIndents.pop();
            if (listIndents.length === 0) listIndents.push(start);
            else listIndents[listIndents.length - 1] = start;
            level = listIndents.length - 1;
          }
        }
        transformed = { ...transformed, numbering:{ ...element.numbering, level } };
        return transformed;
      }
      if (paragraph.directNumId === '0' && Number.isFinite(start) && start > 0) {
        const level = listIndents.findIndex(indent => Math.abs(indent - start) <= 20);
        if (level >= 0) {
          const styleId = ensureRule(
            `continuation:${level}`,
            `p.{styleId} => ${wordContinuationPath(level)}`
          );
          return { ...transformed, styleId };
        }
      }
      if (paragraph.text.trim()) listIndents.splice(0);
      const css = wordParagraphCss(paragraph.layout);
      if (!css) return transformed;
      const tag = wordHeadingTag(paragraph.styleName);
      const styleId = ensureRule(
        `paragraph:${tag}:${css}`,
        `p.{styleId} => ${tag}[style='${css}']:fresh`
      );
      return { ...transformed, styleId };
    }
    return Array.isArray(element?.children) ? { ...element, children:element.children.map(visit) } : element;
  };
  return visit;
}

function addWordDocumentStyles(html: string): string {
  const $ = cheerio.load(html);
  $('head').append('<style data-biblenote-word>ol ol{list-style-type:lower-alpha}ol ol ol{list-style-type:lower-roman}.bn-word-list-continuation{margin:.35em 0 .7em}</style>');
  return $.html();
}

async function convertWordDocument(docxPath: string, title: string): Promise<{ html: string; messages: Array<{ message: string }> }> {
  const buffer = await fs.readFile(docxPath);
  const metadata = await readWordDocumentMetadata(buffer);
  const styleMap: string[] = [];
  const result = await mammoth.convertToHtml(
    { buffer },
    { styleMap, transformDocument:createWordDocumentTransform(metadata, styleMap) }
  );
  return {
    html:addWordDocumentStyles(safeDocumentHtml(result.value, title)),
    messages:result.messages
  };
}

type TextTreeNode = { text?: string; children: TextTreeNode[] };

function plainTextToHtml(text: string, title: string): string {
  const root: TextTreeNode = { children: [] };
  const parents: TextTreeNode[] = [root];
  for (const rawLine of text.replace(/\r\n?/g, '\n').split('\n')) {
    if (!rawLine.trim()) continue;
    const indentation = rawLine.match(/^[\t ]*/)?.[0] ?? '';
    const level = Math.min(20, (indentation.match(/\t/g)?.length ?? 0) + Math.floor(indentation.replace(/\t/g, '').length / 2));
    const content = rawLine.trim().replace(/^(?:[-*•]|\d+[.)])\s+/, '');
    const node: TextTreeNode = { text:content, children:[] };
    const parentLevel = Math.min(level, parents.length - 1);
    const parent = parents[parentLevel] ?? root;
    parent.children.push(node);
    parents.splice(parentLevel + 1);
    parents.push(node);
  }

  const renderChildren = (nodes: TextTreeNode[]): string => nodes.length === 0
    ? ''
    : `<ul>${nodes.map(node => `<li><p>${escapeHtml(node.text ?? '')}</p>${renderChildren(node.children)}</li>`).join('')}</ul>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head><body>${renderChildren(root.children)}</body></html>`;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function pdfLines(items: PdfTextItem[]): PdfLine[] {
  const lines: PdfLine[] = [];
  for (const item of items) {
    const text = repairPdfTextEncoding(item.str.replace(/\s+/g, ' ').trim());
    if (!text) continue;
    const x = Number(item.transform[4]) || 0;
    const y = Number(item.transform[5]) || 0;
    const height = Math.max(1, Math.abs(Number(item.height) || Number(item.transform[3]) || 0));
    const tolerance = Math.max(2, height * 0.35);
    let line = lines.find(candidate => Math.abs(candidate.y - y) <= Math.max(tolerance, candidate.height * 0.35));
    if (!line) {
      line = { y, height, items:[] };
      lines.push(line);
    }
    line.height = Math.max(line.height, height);
    line.items.push({ x, width:Math.max(0, Number(item.width) || 0), text });
  }
  return lines.sort((left, right) => right.y - left.y);
}

function pdfLineText(line: PdfLine): string {
  const items = [...line.items].sort((left, right) => left.x - right.x);
  let result = '';
  let previousEnd: number | undefined;
  for (const item of items) {
    const averageCharacterWidth = item.width > 0 && item.text.length > 0
      ? item.width / item.text.length
      : line.height * 0.45;
    const gap = previousEnd == null ? 0 : item.x - previousEnd;
    const startsWithClosingPunctuation = /^[,.;:!?…)\]}]/u.test(item.text);
    if (result && previousEnd != null
      && gap > Math.max(0.25, averageCharacterWidth * 0.12)
      && !startsWithClosingPunctuation) result += ' ';
    result += item.text;
    previousEnd = item.x + item.width;
  }
  return repairPdfTextEncoding(result.trim());
}

function pdfLineBounds(line: PdfLine): { start:number; end:number } {
  return {
    start:Math.min(...line.items.map(item => item.x)),
    end:Math.max(...line.items.map(item => item.x + item.width))
  };
}

function pdfLineCentralGap(line: PdfLine, pageWidth: number, split?: number): { start:number; end:number } | undefined {
  const items = [...line.items].sort((left, right) => left.x - right.x);
  const characterWidths = items
    .filter(item => item.width > 0 && item.text.length > 0)
    .map(item => item.width / item.text.length);
  const minimumGap = Math.max(pageWidth * 0.018, line.height * 1.15, median(characterWidths) * 2.5);
  let best: { start:number; end:number } | undefined;
  for (let index = 1; index < items.length; index++) {
    const start = items[index - 1].x + items[index - 1].width;
    const end = items[index].x;
    if (end - start < minimumGap) continue;
    if (split == null) {
      if (start > pageWidth * 0.62 || end < pageWidth * 0.38) continue;
    } else if (!(start < split && split < end)) {
      continue;
    }
    if (!best || end - start > best.end - best.start) best = { start, end };
  }
  return best;
}

function pdfReadingOrderLines(lines: PdfLine[], pageWidth: number): PdfLine[] {
  const centralGaps = lines
    .map(line => pdfLineCentralGap(line, pageWidth))
    .filter((gap): gap is { start:number; end:number } => Boolean(gap));
  if (centralGaps.length < 2) return lines;

  const split = median(centralGaps.map(gap => (gap.start + gap.end) / 2));
  const edgeTolerance = pageWidth * 0.005;
  const classified = lines.map(line => {
    const gap = pdfLineCentralGap(line, pageWidth, split);
    if (gap) {
      const leftItems = line.items.filter(item => item.x + item.width <= gap.start + 0.5);
      const rightItems = line.items.filter(item => item.x >= gap.end - 0.5);
      if (leftItems.length > 0 && rightItems.length > 0) {
        return [
          { column:'left' as const, line:{ ...line, items:leftItems } },
          { column:'right' as const, line:{ ...line, items:rightItems } }
        ];
      }
    }

    const bounds = pdfLineBounds(line);
    if (bounds.end < split - edgeTolerance) return [{ column:'left' as const, line }];
    if (bounds.start > split + edgeTolerance) return [{ column:'right' as const, line }];
    return [{ column:'full' as const, line }];
  });

  const result: PdfLine[] = [];
  let block: Array<{ column:'left' | 'right'; line:PdfLine }> = [];
  const flushBlock = () => {
    if (block.length === 0) return;
    const hasLeft = block.some(entry => entry.column === 'left');
    const hasRight = block.some(entry => entry.column === 'right');
    if (hasLeft && hasRight) {
      result.push(
        ...block.filter(entry => entry.column === 'left').map(entry => entry.line).sort((left, right) => right.y - left.y),
        ...block.filter(entry => entry.column === 'right').map(entry => entry.line).sort((left, right) => right.y - left.y)
      );
    } else {
      result.push(...block.map(entry => entry.line).sort((left, right) => right.y - left.y));
    }
    block = [];
  };

  for (const entries of classified) {
    const full = entries.find(entry => entry.column === 'full');
    if (full) {
      flushBlock();
      result.push(full.line);
    } else {
      block.push(...entries as Array<{ column:'left' | 'right'; line:PdfLine }>);
    }
  }
  flushBlock();
  return result;
}

function pdfParagraphs(lines: PdfLine[]): string[] {
  if (lines.length === 0) return [];
  const typicalHeight = Math.max(1, median(lines.map(line => line.height)));
  const paragraphIndent = Math.max(3, typicalHeight * 0.55);
  const paragraphs: string[] = [];
  let current = '';
  let previous: PdfLine | undefined;
  for (const line of lines) {
    const text = pdfLineText(line);
    if (!text) continue;
    const verticalGap = previous ? previous.y - line.y : 0;
    const indentation = previous
      ? pdfLineBounds(line).start - pdfLineBounds(previous).start
      : 0;
    const beginsParagraph = Boolean(previous && (
      verticalGap > Math.max(6, typicalHeight * 1.55)
      || line.y - previous.y > Math.max(6, typicalHeight * 1.55)
      || indentation > paragraphIndent
    ));
    if (beginsParagraph && current) {
      paragraphs.push(current.trim());
      current = '';
    }
    if (current && !current.endsWith('-')) {
      current += ' ';
    } else if (current.endsWith('-') && !(/\d-$/.test(current) && /^\d/.test(text))) {
      current = current.slice(0, -1);
    }
    current += text;
    previous = line;
  }
  if (current.trim()) paragraphs.push(current.trim());
  return paragraphs;
}

async function extractPdf(filePath: string, title: string): Promise<FolderExtractionResult> {
  const bytes = new Uint8Array(await fs.readFile(filePath));
  const loadingTask = getDocument({ data:bytes, isEvalSupported:false, useSystemFonts:true });
  const warnings: string[] = [];
  try {
    const document = await loadingTask.promise;
    const pages: string[][] = [];
    let extractedCharacters = 0;
    let pagesWithText = 0;
    let lineCount = 0;
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const textItems: PdfTextItem[] = content.items
        .filter(item => 'str' in item)
        .map(item => {
          const textItem = item as Extract<typeof item, { str: string }>;
          return {
            str:textItem.str,
            transform:[...textItem.transform],
            width:textItem.width,
            height:textItem.height
          };
        });
      const pageWidth = page.getViewport({ scale:1 }).width;
      const lines = pdfReadingOrderLines(pdfLines(textItems), pageWidth);
      const paragraphs = pdfParagraphs(lines);
      const pageCharacters = paragraphs.join(' ').length;
      if (pageCharacters > 0) pagesWithText += 1;
      extractedCharacters += pageCharacters;
      lineCount += lines.length;
      pages.push(paragraphs);
      page.cleanup();
    }

    const minimumUsefulCharacters = Math.max(8, document.numPages * 5);
    let quality: FolderExtractionQuality;
    let qualityMessage: string;
    if (extractedCharacters < minimumUsefulCharacters) {
      quality = 'requires_ocr';
      qualityMessage = 'В PDF практически нет текстового слоя. Для содержимого страниц потребуется OCR.';
      warnings.push('OCR не выполнялся. В кэш добавлен только найденный текстовый слой.');
    } else {
      const textPageRatio = pagesWithText / Math.max(1, document.numPages);
      const averageCharactersPerLine = extractedCharacters / Math.max(1, lineCount);
      if (textPageRatio >= 0.8 && averageCharactersPerLine >= 8) {
        quality = 'textual';
        qualityMessage = 'PDF содержит устойчивый текстовый слой; абзацы восстановлены по строкам и интервалам.';
      } else {
        quality = 'heuristic';
        qualityMessage = 'Текст извлечён, но порядок и границы абзацев восстановлены эвристически.';
      }
    }

    const body = pages.map((paragraphs, index) => [
      `<section data-pdf-page="${index + 1}">`,
      `<h2>Страница ${index + 1}</h2>`,
      ...paragraphs.map(paragraph => `<p>${escapeHtml(paragraph)}</p>`),
      '</section>'
    ].join('')).join('');
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head><body>${body}</body></html>`;
    return { format:'pdf', html, text:htmlToText(html), quality, qualityMessage, warnings };
  } finally {
    await loadingTask.destroy();
  }
}

export async function extractFolderFile(filePath: string, options: FolderExtractionOptions = {}): Promise<FolderExtractionResult> {
  const extension = path.extname(filePath).toLowerCase();
  if (!folderSourceExtensions.has(extension)) throw new Error(`Unsupported folder source file: ${extension || filePath}`);
  const title = path.basename(filePath, extension);
  if (extension === '.pdf') return extractPdf(filePath, title);

  if (extension === '.doc' || extension === '.docx') {
    let docxPath = filePath;
    let temporaryDirectory: string | undefined;
    try {
      if (extension === '.doc') {
        temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'biblenote-word-doc-'));
        docxPath = path.join(temporaryDirectory, `${path.basename(filePath, extension)}.docx`);
        await (options.legacyDocConverter ?? convertLegacyDocWithWordCom)(filePath, docxPath);
      }
      const result = await convertWordDocument(docxPath, title);
      const html = result.html;
      return {
        format:extension === '.doc' ? 'doc' : 'docx',
        html,
        text:htmlToText(html),
        quality:'textual',
        qualityMessage:extension === '.doc'
          ? 'DOC преобразован через Microsoft Word COM в DOCX, затем структура преобразована в HTML.'
          : 'Структура DOCX преобразована в HTML: абзацы, заголовки, списки и таблицы.',
        warnings:result.messages.map(message => message.message)
      };
    } finally {
      if (temporaryDirectory) await fs.rm(temporaryDirectory, { recursive:true, force:true });
    }
  }

  const source = await fs.readFile(filePath, 'utf8');
  if (extension === '.txt') {
    const html = plainTextToHtml(source, title);
    return {
      format:'text',
      html,
      text:htmlToText(html),
      quality:'textual',
      qualityMessage:'Текстовые строки преобразованы в абзацы; отступы сохранены как вложенность.',
      warnings:[]
    };
  }

  const html = safeDocumentHtml(source, title);
  return {
    format:'html',
    html,
    text:htmlToText(html),
    quality:'textual',
    qualityMessage:'Использована исходная HTML-структура документа.',
    warnings:[]
  };
}
