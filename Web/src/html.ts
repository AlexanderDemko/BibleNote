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
