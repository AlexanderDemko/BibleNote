import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import * as cheerio from 'cheerio';
import JSZip from 'jszip';
import { extractFolderFile } from '../src/folder-extract.js';

const picture = (kind = 'anchor', wrap = '<wp:wrapTopAndBottom/>') => `<w:drawing><wp:${kind}>
  <wp:extent cx="3810000" cy="1905000"/>${kind === 'anchor' ? wrap : ''}<wp:docPr id="1" name="Diagram" descr="Diagram"/>
  <a:graphic><a:graphicData><pic:pic><pic:blipFill><a:blip r:embed="rImage"/></pic:blipFill></pic:pic></a:graphicData></a:graphic>
</wp:${kind}></w:drawing>`;
const caption = `<w:p><w:pPr><w:pStyle w:val="Caption"/></w:pPr>
  <w:bookmarkStart w:id="1" w:name="figure11"/><w:r><w:t>Рисунок </w:t></w:r>
  <w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText> SEQ Рисунок </w:instrText></w:r>
  <w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>11</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>
  <w:r><w:t> – Подпись</w:t></w:r><w:bookmarkEnd w:id="1"/>
</w:p>`;
const textBox = (content: string) => `<w:pict><v:shape style="position:absolute"><v:textbox><w:txbxContent>${content}</w:txbxContent></v:textbox></v:shape></w:pict>`;
const modernTextBox = (content: string) => `<w:drawing><wp:anchor><wp:wrapTopAndBottom/><a:graphic><a:graphicData><wps:wsp><wps:txbx><w:txbxContent>${content}</w:txbxContent></wps:txbx></wps:wsp></a:graphicData></a:graphic></wp:anchor></w:drawing>`;

async function extract(body: string) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'biblenote-word-figures-'));
  try {
    const zip = new JSZip();
    zip.file('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/></Types>');
    zip.file('word/document.xml', `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
      xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
      xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
      xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"
      xmlns:v="urn:schemas-microsoft-com:vml" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"
      xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"><w:body>${body}</w:body></w:document>`);
    zip.file('word/styles.xml', '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:styleId="Caption"><w:name w:val="caption"/><w:rPr><w:sz w:val="18"/></w:rPr></w:style></w:styles>');
    zip.file('word/_rels/document.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rImage" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image.png"/></Relationships>');
    zip.file('word/media/image.png', Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aHHsAAAAASUVORK5CYII=', 'base64'));
    const filePath = path.join(directory, 'figures.docx');
    await fs.writeFile(filePath, await zip.generateAsync({ type:'nodebuffer' }));
    return await extractFolderFile(filePath);
  } finally {
    await fs.rm(directory, { recursive:true, force:true });
  }
}

for (const [name, box] of [
  ['VML', textBox(caption)],
  ['DrawingML with VML fallback', `<mc:AlternateContent><mc:Choice Requires="wps">${modernTextBox(caption)}</mc:Choice><mc:Fallback>${textBox(caption)}</mc:Fallback></mc:AlternateContent>`]
]) {
  test(`floating Word image keeps its ${name} caption before the intact body paragraph`, async () => {
    const result = await extract(`<w:p><w:r>${picture()}<w:t>Начало </w:t></w:r><w:r>${box}<w:t>абзаца.</w:t></w:r></w:p><w:p><w:r><w:t>Следующий абзац.</w:t></w:r></w:p>`);
    const $ = cheerio.load(result.html);
    const figure = $('body > figure');
    assert.equal(figure.length, 1);
    assert.equal(figure.find('img').length, 1);
    assert.equal(figure.find('figcaption').text(), 'Рисунок 11 – Подпись');
    assert.equal(figure.find('figcaption [id="figure11"]').length, 1);
    assert.match(figure.attr('style') || '', /width:300pt/);
    assert.match(figure.find('figcaption p').attr('style') || '', /font-size:9pt/);
    assert.equal(figure.next('p').text(), 'Начало абзаца.');
    assert.equal(figure.next('p').find('img').length, 0);
    assert.equal(figure.next('p').next('p').text(), 'Следующий абзац.');
    assert.equal(result.text.match(/Рисунок 11 – Подпись/gu)?.length, 1);
    assert.ok(result.text.indexOf('Рисунок 11 – Подпись') < result.text.indexOf('Начало абзаца.'));
  });
}

test('Word inline images and square-wrapped drawings keep their text and separate ordinary captions', async () => {
  for (const drawing of [picture('inline'), picture('anchor', '<wp:wrapSquare wrapText="bothSides"/>')]) {
    const result = await extract(`<w:p><w:r><w:t>До </w:t>${drawing}<w:t> после.</w:t></w:r></w:p>${caption}`);
    const $ = cheerio.load(result.html);
    assert.equal($('figure').length, 0);
    assert.equal($('body > p').first().find('img').length, 1);
    assert.equal($('body > p').first().text(), 'До  после.');
    assert.equal($('body > p').eq(1).text(), 'Рисунок 11 – Подпись');
  }
});

test('floating Word images without captions stay separate from text without consuming unrelated text boxes', async () => {
  const result = await extract(`<w:p><w:r>${picture()}<w:t>Текст.</w:t>${textBox('<w:p><w:r><w:t>Примечание.</w:t></w:r></w:p>')}</w:r></w:p>`);
  const $ = cheerio.load(result.html);
  assert.equal($('figure img').length, 1);
  assert.equal($('figcaption').length, 0);
  assert.equal($('figure').next('p').text(), 'Текст.');
  assert.equal($('figure').next('p').next('p').text(), 'Примечание.');
});
