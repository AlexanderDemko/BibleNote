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
