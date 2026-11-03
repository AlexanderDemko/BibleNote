import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import JSZip from 'jszip';
import * as cheerio from 'cheerio';
import { extractFolderFile } from '../src/folder-extract.js';

test('Word extraction preserves inherited, localized, and direct outline levels through level nine', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'biblenote-word-outline-'));
  try {
    const zip = new JSZip();
    zip.file('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>');
    zip.file('word/styles.xml', `<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style>
      <w:style w:type="paragraph" w:styleId="Custom"><w:name w:val="Мой раздел"/><w:basedOn w:val="Heading1"/></w:style>
      <w:style w:type="paragraph" w:styleId="Localized"><w:name w:val="Заголовок 2"/></w:style>
      <w:style w:type="paragraph" w:styleId="Deep"><w:name w:val="heading 9"/></w:style>
      <w:style w:type="paragraph" w:styleId="Outline"><w:name w:val="Часть"/><w:pPr><w:outlineLvl w:val="2"/></w:pPr></w:style>
    </w:styles>`);
    const paragraph = (properties: string, text: string) => `<w:p><w:pPr>${properties}</w:pPr><w:r><w:t>${text}</w:t></w:r></w:p>`;
    zip.file('word/document.xml', `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
      ${paragraph('<w:pStyle w:val="Heading1"/>', 'Стандартный заголовок')}
      ${paragraph('<w:pStyle w:val="Custom"/>', 'Унаследованный уровень')}
      ${paragraph('<w:pStyle w:val="Localized"/>', 'Локализованный заголовок')}
      ${paragraph('<w:pStyle w:val="Outline"/>', 'Уровень из свойств стиля')}
      ${paragraph('<w:outlineLvl w:val="3"/>', 'Уровень из свойств абзаца')}
      ${paragraph('<w:pStyle w:val="Deep"/>', 'Девятый уровень')}
      ${paragraph('<w:pStyle w:val="Heading1"/><w:outlineLvl w:val="9"/>', 'Обычный текст')}
      ${paragraph('', 'Без уровня')}
    </w:body></w:document>`);
    const filePath = path.join(directory, 'outline.docx');
    await fs.writeFile(filePath, await zip.generateAsync({ type:'nodebuffer' }));
    const result = await extractFolderFile(filePath);
    const $ = cheerio.load(result.html);
    assert.deepEqual($('h1,h2,h3,h4,h5,h6,[role="heading"]').toArray().map(element => ({
      text:$(element).text(),
      level:Number($(element).attr('aria-level')) || Number(element.tagName.slice(1))
    })), [
      { text:'Стандартный заголовок', level:1 },
      { text:'Унаследованный уровень', level:1 },
      { text:'Локализованный заголовок', level:2 },
      { text:'Уровень из свойств стиля', level:3 },
      { text:'Уровень из свойств абзаца', level:4 },
      { text:'Девятый уровень', level:9 }
    ]);
    assert.equal($('p:not([role])').filter((_, element) => $(element).text() === 'Обычный текст').length, 1);
  } finally {
    await fs.rm(directory, { recursive:true, force:true });
  }
});
