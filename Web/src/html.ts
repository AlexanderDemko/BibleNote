import * as cheerio from 'cheerio';

export function htmlToText(html: string): string {
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
  href: string;
  title: string;
};

export function pdfBibleLinksFromHtml(html: string): PdfHtmlBibleLink[] {
  if (!html) return [];
  const $ = cheerio.load(html);
  const links: PdfHtmlBibleLink[] = [];
  const occurrences = new Map<string, number>();
  $('section[data-pdf-page]').each((_, section) => {
    const pageNumber = Number($(section).attr('data-pdf-page'));
    if (!Number.isInteger(pageNumber) || pageNumber < 1) return;
    $(section).find('a[href]').each((__, anchor) => {
      const href = String($(anchor).attr('href') || '').trim();
      if (!/^(?:bnVerse|isbtBibleVerse):/iu.test(href)) return;
      const text = $(anchor).text().replace(/[\u00ad\u200b]/gu, '').replace(/\s+/gu, ' ').trim();
      // A bare number is too ambiguous for a page-wide PDF text overlay. Verse-only
      // references must retain their leading colon (for example, ":17").
      if (!text || /^\d+$/u.test(text)) return;
      const occurrenceKey = pageNumber + '\u0000' + text.toLocaleLowerCase();
      const occurrenceIndex = occurrences.get(occurrenceKey) || 0;
      occurrences.set(occurrenceKey, occurrenceIndex + 1);
      links.push({
        pageNumber,
        occurrenceIndex,
        text,
        href,
        title:String($(anchor).attr('title') || text).trim() || text
      });
    });
  });
  return links;
}
