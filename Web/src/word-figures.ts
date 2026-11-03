import * as cheerio from 'cheerio';
import JSZip from 'jszip';

// Floating drawings live inside a text paragraph in OOXML even when Word lays
// them out as a separate block. Mammoth otherwise emits them inline and appends
// text boxes after the whole paragraph, separating a drawing from its caption.
export async function normalizeWordFigures(buffer: Buffer): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buffer);
  const source = await zip.file('word/document.xml')?.async('text');
  if (!source) return buffer;
  const $ = cheerio.load(source, { xmlMode:true });
  const styles = cheerio.load(await zip.file('word/styles.xml')?.async('text') || '', { xmlMode:true });
  const captionStyles = new Set(styles('w\\:style').toArray()
    .filter(style => /^(?:caption|название|подпись)$/iu.test(styles(style).children('w\\:name').attr('w:val') || ''))
    .map(style => styles(style).attr('w:styleId')).filter((id): id is string => Boolean(id)));
  let figureId = 0;

  // Treat the modern drawing and its VML fallback as one object.
  const drawingContainer = (element: cheerio.Cheerio<any>): cheerio.Cheerio<any> => {
    const alternate = element.closest('mc\\:AlternateContent');
    return alternate.length ? alternate : element.closest('w\\:drawing,w\\:pict');
  };

  for (const paragraph of $('w\\:p').toArray()) {
    const images = new Map<any, { container: cheerio.Cheerio<any>; anchor: cheerio.Cheerio<any> }>();
    $(paragraph).find('wp\\:anchor').each((_, element) => {
      const anchor = $(element);
      if (anchor.parents('w\\:p').first().get(0) !== paragraph
        || !anchor.children('wp\\:wrapTopAndBottom').length
        || anchor.find('pic\\:pic a\\:blip').length !== 1
        || anchor.find('w\\:txbxContent').length) return;
      const container = drawingContainer(anchor);
      if (container.length) images.set(container.get(0), { container, anchor });
    });
    if (!images.size) continue;

    const captions = new Map<any, { container: cheerio.Cheerio<any>; content: cheerio.Cheerio<any> }>();
    $(paragraph).find('w\\:txbxContent').each((_, element) => {
      const content = $(element);
      if (content.parents('w\\:p').first().get(0) !== paragraph) return;
      const hasCaptionField = content.find('w\\:instrText').toArray()
        .some(field => /^\s*SEQ\s+/iu.test($(field).text()));
      const hasCaptionStyle = content.children('w\\:p').toArray()
        .some(p => captionStyles.has($(p).children('w\\:pPr').children('w\\:pStyle').attr('w:val') || ''));
      if (!hasCaptionField && !hasCaptionStyle) return;
      const container = drawingContainer(content);
      if (container.length && !captions.has(container.get(0))) captions.set(container.get(0), { container, content });
    });

    // Only pair unambiguous captions belonging to this same anchor paragraph.
    // Unrelated text boxes and neighbouring body paragraphs keep their order.
    const caption = images.size === 1 && captions.size === 1 ? [...captions.values()][0] : undefined;
    for (const { container, anchor } of images.values()) {
      const id = String(++figureId);
      const imageParagraph = $('<w:p xmlns:bn="urn:biblenote:word-import" bn:role="image"><w:pPr><w:jc w:val="center"/></w:pPr><w:r/></w:p>');
      imageParagraph.attr('bn:figure', id);
      const width = Number(anchor.children('wp\\:extent').attr('cx')) / 12700;
      if (Number.isFinite(width) && width > 0) imageParagraph.attr('bn:width', String(Math.round(width * 100) / 100));
      imageParagraph.children('w\\:r').append(container);
      $(paragraph).before(imageParagraph);
      if (caption) {
        for (const sourceParagraph of caption.content.children('w\\:p').toArray()) {
          const captionParagraph = $(sourceParagraph).clone();
          captionParagraph.attr('xmlns:bn', 'urn:biblenote:word-import');
          captionParagraph.attr('bn:figure', id).attr('bn:role', 'caption');
          $(paragraph).before(captionParagraph);
        }
        caption.container.remove();
      }
    }
  }
  if (!figureId) return buffer;
  zip.file('word/document.xml', $.xml());
  return zip.generateAsync({ type:'nodebuffer' });
}
