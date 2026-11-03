import * as cheerio from 'cheerio';

export function htmlToText(html: string): string {
  const $ = cheerio.load(html);
  $('script,style,noscript').remove();
  $('.onenote-list-number[data-onenote-number]').each((_, element) => {
    const paragraph = $(element);
    const content = paragraph.children('.onenote-paragraph-content').first();
    (content.length ? content : paragraph).prepend(
      $('<span>').text(`${paragraph.attr('data-onenote-number')} `)
    );
  });
  $('br').replaceWith('\n');
  // Both boundaries matter: a nested block can follow its parent's inline text.
  $('p,div,li,h1,h2,h3,h4,h5,h6,table,tr,blockquote,section,article,header,footer,ul,ol,dl,dt,dd,pre,hr')
    .prepend('\n').append('\n');
  return $.text()
    .replace(/\r/g, '')
    .replace(/[\t ]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function hasRenderableHtmlBody(html: string): boolean {
  const $ = cheerio.load(html);
  const body = $('body').first();
  if (!body.length) return false;
  if (body.find('img,svg,canvas,video,audio,object,embed,iframe,table,input,textarea,select,button').length > 0) {
    return true;
  }
  const bodyClone = body.clone();
  bodyClone.find('script,style,noscript').remove();
  return Boolean(bodyClone.text().replace(/\s+/g, ' ').trim());
}

export type PdfHtmlBibleLink = {
  pageNumber: number;
  occurrenceIndex: number;
  text: string;
  matchText?: string;
  href: string;
  title: string;
};

type HtmlTextNode = {
  type?: string;
  name?: string;
  data?: string;
  children?: HtmlTextNode[];
};

type AnchorTextPosition = { start: number; end: number };

function sectionTextWithAnchorPositions(section: unknown): { text: string; positions: Map<object, AnchorTextPosition> } {
  let text = '';
  const positions = new Map<object, AnchorTextPosition>();
  const visit = (node: HtmlTextNode) => {
    if (node.type === 'text') {
      text += node.data || '';
      return;
    }
    const start = text.length;
    for (const child of node.children || []) visit(child);
    if (node.type === 'tag' && node.name === 'a') positions.set(node as object, { start, end:text.length });
  };
  visit(section as HtmlTextNode);
  return { text, positions };
}

function verseHrefScope(href: string): string {
  const match = href.match(/^(.*\s+\d+)\s*[:：,]\s*\d+(?:[\p{L}])?(?:\s*[-‐‑‒–—]\s*(?:\d+\s*[:：,]\s*)?\d+(?:[\p{L}])?)?$/iu);
  return String(match?.[1] || '').toLocaleLowerCase();
}

function contextualBareVerseText(
  anchors: Array<{ node: object; text: string; href: string; position?: AnchorTextPosition }>,
  anchorIndex: number,
  sectionText: string
): string {
  const current = anchors[anchorIndex];
  const currentScope = verseHrefScope(current.href);
  if (!currentScope || !current.position) return '';
  for (let index = anchorIndex - 1; index >= 0; index -= 1) {
    const candidate = anchors[index];
    if (!candidate.position || verseHrefScope(candidate.href) !== currentScope) continue;
    if (!/[\p{L}:：]/u.test(candidate.text)) continue;
    const between = sectionText.slice(candidate.position.end, current.position.start);
    if (!/^(?:\s*,\s*\d+)*\s*,\s*$/u.test(between)) continue;
    const context = sectionText.slice(candidate.position.start, current.position.end)
      .replace(/[\u00ad\u200b]/gu, '')
      .replace(/\s+/gu, ' ')
      .trim();
    return context.length <= 240 ? context : '';
  }
  return '';
}

export function pdfBibleLinksFromHtml(html: string): PdfHtmlBibleLink[] {
  if (!html) return [];
  const $ = cheerio.load(html);
  const links: PdfHtmlBibleLink[] = [];
  const occurrences = new Map<string, number>();
  $('section[data-pdf-page]').each((_, section) => {
    const pageNumber = Number($(section).attr('data-pdf-page'));
    if (!Number.isInteger(pageNumber) || pageNumber < 1) return;
    const sectionAnchors = $(section).find('a[href]').toArray();
    const sectionMap = sectionTextWithAnchorPositions(section);
    const anchorEntries = sectionAnchors.map(anchor => ({
      node:anchor as object,
      text:$(anchor).text().replace(/[\u00ad\u200b]/gu, '').replace(/\s+/gu, ' ').trim(),
      href:String($(anchor).attr('href') || '').trim(),
      position:sectionMap.positions.get(anchor as object)
    }));
    anchorEntries.forEach((entry, anchorIndex) => {
      const anchor = sectionAnchors[anchorIndex];
      const href = entry.href;
      if (!/^(?:bnVerse|isbtBibleVerse):/iu.test(href)) return;
      const text = entry.text;
      // A bare number is too ambiguous for a page-wide PDF text overlay. Verse-only
      // references need either a leading colon (for example, ":17") or an adjacent
      // explicit reference that supplies a unique list context ("3 Kings 8:51, 53").
      const matchText = /^\d+$/u.test(text)
        ? contextualBareVerseText(anchorEntries, anchorIndex, sectionMap.text)
        : '';
      if (!text || (/^\d+$/u.test(text) && !matchText)) return;
      const occurrenceKey = pageNumber + '\u0000' + (matchText || text).toLocaleLowerCase();
      const occurrenceIndex = occurrences.get(occurrenceKey) || 0;
      occurrences.set(occurrenceKey, occurrenceIndex + 1);
      links.push({
        pageNumber,
        occurrenceIndex,
        text,
        ...(matchText ? { matchText } : {}),
        href,
        title:String($(anchor).attr('title') || text).trim() || text
      });
    });
  });
  return links;
}
