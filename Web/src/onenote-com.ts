import * as cheerio from 'cheerio';
import { bibleNoteOneNoteHierarchy, bibleNoteOneNotePageContent } from './biblenote-gateway.js';
import type { Notebook, Page, Section, SectionGroup } from './sync.js';

type XmlNode = any;

// The desktop OneNote XML page coordinate is half a CSS pixel at 100% zoom.
const oneNoteComLayoutUnitInCssPixels = 2;

export type OneNoteComSnapshot = {
  notebooks: Notebook[];
  sections: Section[];
  sectionGroups: SectionGroup[];
  pages: Page[];
};

function localName(node: XmlNode): string {
  const name = String(node?.name ?? node?.tagName ?? '');
  return name.includes(':') ? name.slice(name.lastIndexOf(':') + 1) : name;
}

function attr(node: XmlNode, name: string): string | undefined {
  const attributes = node?.attribs ?? {};
  const key = Object.keys(attributes).find(candidate => candidate.toLowerCase() === name.toLowerCase());
  const value = key ? attributes[key] : undefined;
  return value == null || value === '' ? undefined : String(value);
}

function elementChildren(node: XmlNode, name?: string): XmlNode[] {
  return (node?.children ?? []).filter((child: XmlNode) =>
    child?.type === 'tag' && (!name || localName(child) === name)
  );
}

function displayName(node: XmlNode): string | undefined {
  return attr(node, 'nickname') ?? attr(node, 'name');
}

function isRecycleBin(node: XmlNode): boolean {
  return attr(node, 'isRecycleBin') === 'true'
    || attr(node, 'isInRecycleBin') === 'true'
    || /^(?:Recycle Bin|Корзина)$/i.test(displayName(node) ?? '');
}

function pageLevel(node: XmlNode): number | undefined {
  const value = Number(attr(node, 'pageLevel'));
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

export function parseOneNoteComHierarchy(xml: string): OneNoteComSnapshot {
  const $ = cheerio.load(xml, { xmlMode:true });
  const root = $.root().children().first()[0];
  const notebooks: Notebook[] = [];
  const sections: Section[] = [];
  const sectionGroups: SectionGroup[] = [];
  const pages: Page[] = [];

  const processSection = (
    node: XmlNode,
    notebook: Notebook,
    parentGroup: SectionGroup | undefined,
    groupPath: string[],
    orderIndex: number
  ) => {
    if (isRecycleBin(node)) return;
    const id = attr(node, 'ID');
    if (!id) return;
    const section: Section = {
      id,
      displayName:displayName(node),
      lastModifiedDateTime:attr(node, 'lastModifiedTime'),
      parentNotebook:{ id:notebook.id, displayName:notebook.displayName },
      parentSectionGroup:parentGroup ? { id:parentGroup.id, displayName:parentGroup.displayName } : undefined,
      sectionGroupPath:groupPath.join(' / '),
      sectionGroupInfoKnown:true,
      orderIndex,
      links:{ oneNoteClientUrl:attr(node, 'path') }
    };
    sections.push(section);
    for (const [pageIndex, pageNode] of elementChildren(node, 'Page').entries()) {
      if (isRecycleBin(pageNode)) continue;
      const pageId = attr(pageNode, 'ID');
      if (!pageId) continue;
      pages.push({
        id:pageId,
        title:displayName(pageNode),
        createdDateTime:attr(pageNode, 'dateTime'),
        lastModifiedDateTime:attr(pageNode, 'lastModifiedTime'),
        parentSection:{ id:section.id, displayName:section.displayName },
        parentNotebook:{ id:notebook.id, displayName:notebook.displayName },
        orderIndex:pageIndex,
        level:pageLevel(pageNode),
        links:{ oneNoteClientUrl:attr(pageNode, 'path') }
      });
    }
  };

  const processGroup = (
    node: XmlNode,
    notebook: Notebook,
    parentGroup: SectionGroup | undefined,
    parentPath: string[],
    orderIndex: number
  ) => {
    if (isRecycleBin(node)) return;
    const id = attr(node, 'ID');
    if (!id) return;
    const name = displayName(node);
    const path = [...parentPath, name ?? ''].filter(Boolean);
    const group: SectionGroup = {
      id,
      displayName:name,
      lastModifiedDateTime:attr(node, 'lastModifiedTime'),
      parentNotebook:{ id:notebook.id, displayName:notebook.displayName },
      parentSectionGroup:parentGroup ? { id:parentGroup.id, displayName:parentGroup.displayName } : undefined,
      sectionGroupPath:path.join(' / '),
      orderIndex
    };
    sectionGroups.push(group);
    for (const [childIndex, child] of elementChildren(node).entries()) {
      if (localName(child) === 'SectionGroup') {
        processGroup(child, notebook, group, path, childIndex);
      } else if (localName(child) === 'Section') {
        processSection(child, notebook, group, path, childIndex);
      }
    }
  };

  const notebookNodes = localName(root) === 'Notebook'
    ? [root]
    : elementChildren(root, 'Notebook');
  for (const notebookNode of notebookNodes) {
    if (isRecycleBin(notebookNode)) continue;
    const id = attr(notebookNode, 'ID');
    if (!id) continue;
    const notebook: Notebook = {
      id,
      displayName:displayName(notebookNode),
      isDefault:attr(notebookNode, 'isCurrentlyViewed') === 'true',
      lastModifiedDateTime:attr(notebookNode, 'lastModifiedTime'),
      links:{ oneNotePath:attr(notebookNode, 'path') }
    };
    notebooks.push(notebook);
    for (const [childIndex, child] of elementChildren(notebookNode).entries()) {
      if (localName(child) === 'SectionGroup') {
        processGroup(child, notebook, undefined, [], childIndex);
      } else if (localName(child) === 'Section') {
        processSection(child, notebook, undefined, [], childIndex);
      }
    }
  }

  return { notebooks, sections, sectionGroups, pages };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function safeInlineHtml(value: string): string {
  const $ = cheerio.load(`<body>${value}</body>`);
  $('script,style,noscript,iframe,object,embed').remove();
  $('*').each((_, element) => {
    const attributes = (element as XmlNode).attribs ?? {};
    for (const name of Object.keys(attributes)) {
      const attributeValue = attributes[name] ?? '';
      if (/^on/i.test(name)
        || ((name === 'href' || name === 'src') && /^\s*javascript:/i.test(attributeValue))) {
        $(element).removeAttr(name);
      }
    }
  });
  return $('body').html() ?? '';
}

function nodeText($xml: cheerio.CheerioAPI, node: XmlNode): string {
  return $xml(node).text().trim();
}

function positiveNumber(value: string | undefined): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 && number <= 100_000 ? number : undefined;
}

function safeCssColor(value: string | undefined): string | undefined {
  const color = value?.trim();
  return color && /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(color) ? color : undefined;
}

function safeCssFont(value: string | undefined): string | undefined {
  const font = value?.trim();
  return font && /^[\p{L}\p{N} .,'"_-]+$/u.test(font) ? font : undefined;
}

function quickStyleCss(node: XmlNode | undefined): string {
  if (!node) return '';
  const declarations: string[] = [];
  const fontColor = attr(node, 'fontColor');
  const highlightColor = attr(node, 'highlightColor');
  const color = safeCssColor(fontColor);
  const backgroundColor = safeCssColor(highlightColor);
  const font = safeCssFont(attr(node, 'font'));
  const fontSize = positiveNumber(attr(node, 'fontSize'));
  if (color) declarations.push(`color:${color}`);
  else if (fontColor === 'automatic') declarations.push('color:initial');
  if (backgroundColor) declarations.push(`background-color:${backgroundColor}`);
  else if (highlightColor === 'automatic') declarations.push('background-color:transparent');
  if (font) declarations.push(`font-family:${font}`);
  if (fontSize) declarations.push(`font-size:${fontSize}pt`);
  declarations.push(`font-weight:${attr(node, 'bold') === 'true' ? 'bold' : 'normal'}`);
  declarations.push(`font-style:${attr(node, 'italic') === 'true' ? 'italic' : 'normal'}`);
  declarations.push(`text-decoration:${attr(node, 'underline') === 'true' ? 'underline' : 'none'}`);
  return declarations.join(';');
}

function renderPageNode(
  $xml: cheerio.CheerioAPI,
  node: XmlNode,
  tableCellTag: 'td' | 'th' = 'td',
  quickStyles = new Map<string, XmlNode>()
): string {
  const name = localName(node);
  if (name === 'T') return safeInlineHtml($xml(node).text());
  if (name === 'Image') {
    const dataNode = elementChildren(node, 'Data')[0];
    const data = dataNode ? nodeText($xml, dataNode).replace(/\s+/g, '') : '';
    const format = (attr(node, 'format') ?? 'png').replace(/[^a-z0-9.+-]/gi, '').toLowerCase();
    const alt = escapeHtml(attr(node, 'alt') ?? 'Изображение OneNote');
    return data
      ? `<img src="data:image/${format};base64,${data}" alt="${alt}">`
      : `<span class="onenote-image-placeholder">[${alt}]</span>`;
  }
  if (name === 'InsertedFile') {
    return `<span class="onenote-file">📎 ${escapeHtml(attr(node, 'preferredName') ?? 'Вложенный файл')}</span>`;
  }
  if (name === 'Table') {
    const columnsNode = elementChildren(node, 'Columns')[0];
    const columnWidths = columnsNode
      ? elementChildren(columnsNode, 'Column').map(column => {
          const width = positiveNumber(attr(column, 'width'));
          return width == null ? undefined : width * oneNoteComLayoutUnitInCssPixels;
        })
      : [];
    const validColumnWidths = columnWidths.filter((width): width is number => width != null);
    const hasFixedColumns = columnWidths.length > 0 && validColumnWidths.length === columnWidths.length;
    const tableWidth = hasFixedColumns
      ? validColumnWidths.reduce((total, width) => total + width, 0)
      : undefined;
    const classes = ['onenote-table'];
    if (hasFixedColumns) classes.push('onenote-table-fixed');
    if (attr(node, 'bordersVisible') === 'true') classes.push('onenote-table-bordered');
    const tableStyle = tableWidth == null ? '' : ` style="width:${tableWidth}px"`;
    const colgroup = hasFixedColumns
      ? `<colgroup>${validColumnWidths.map(width => `<col style="width:${width / tableWidth! * 100}%">`).join('')}</colgroup>`
      : '';
    const rows = elementChildren(node, 'Row');
    const hasHeaderRow = attr(node, 'hasHeaderRow') === 'true' && rows.length > 0;
    const header = hasHeaderRow
      ? `<thead>${renderPageNode($xml, rows[0], 'th', quickStyles)}</thead>`
      : '';
    const bodyRows = hasHeaderRow ? rows.slice(1) : rows;
    return `<table class="${classes.join(' ')}"${tableStyle}>${colgroup}${header}<tbody>${bodyRows
      .map(child => renderPageNode($xml, child, 'td', quickStyles))
      .join('')}</tbody></table>`;
  }
  if (name === 'Row') {
    return `<tr>${elementChildren(node, 'Cell').map(child => renderPageNode($xml, child, tableCellTag, quickStyles)).join('')}</tr>`;
  }
  if (name === 'Cell') {
    const shadingColor = safeCssColor(attr(node, 'shadingColor'));
    const style = shadingColor ? ` style="background-color:${shadingColor}"` : '';
    return `<${tableCellTag}${style}>${elementChildren(node).map(child => renderPageNode($xml, child, 'td', quickStyles)).join('')}</${tableCellTag}>`;
  }
  if (name === 'OEChildren') {
    return `<div class="onenote-children">${elementChildren(node).map(child => renderPageNode($xml, child, 'td', quickStyles)).join('')}</div>`;
  }
  if (name === 'OE') {
    const listNode = elementChildren(node, 'List')[0];
    const bulletNode = listNode ? elementChildren(listNode, 'Bullet')[0] : undefined;
    const numberNode = listNode ? elementChildren(listNode, 'Number')[0] : undefined;
    const body = elementChildren(node)
      .filter(child => !['List', 'Meta', 'InkDrawing'].includes(localName(child)))
      .map(child => renderPageNode($xml, child, 'td', quickStyles))
      .join('');
    const style = [
      quickStyleCss(quickStyles.get(attr(node, 'quickStyleIndex') ?? '')),
      attr(node, 'style')
    ].filter(Boolean).join(';');
    const listClass = bulletNode
      ? ' onenote-list-item onenote-list-bullet'
      : numberNode
        ? ' onenote-list-item onenote-list-number'
        : '';
    const numberAttribute = numberNode
      ? ` data-onenote-number="${escapeHtml(attr(numberNode, 'text') ?? '')}"`
      : '';
    return `<div class="onenote-paragraph${listClass}"${numberAttribute}${style ? ` style="${escapeHtml(style)}"` : ''}>${body}</div>`;
  }
  if (name === 'Title') {
    return `<h1>${elementChildren(node).map(child => renderPageNode($xml, child, 'td', quickStyles)).join('')}</h1>`;
  }
  if (name === 'Outline') {
    return `<section class="onenote-outline">${elementChildren(node)
      .filter(child => !['Position', 'Size'].includes(localName(child)))
      .map(child => renderPageNode($xml, child, 'td', quickStyles)).join('')}</section>`;
  }
  if (['Page', 'Notebook', 'Section'].includes(name)) {
    return elementChildren(node).map(child => renderPageNode($xml, child, 'td', quickStyles)).join('');
  }
  return '';
}

export function oneNoteComPageXmlToHtml(xml: string): string {
  const $xml = cheerio.load(xml, { xmlMode:true });
  const root = $xml.root().children().first()[0];
  const quickStyles = new Map(
    elementChildren(root, 'QuickStyleDef')
      .map(node => [attr(node, 'index') ?? '', node] as const)
      .filter(([index]) => index)
  );
  const body = root ? renderPageNode($xml, root, 'td', quickStyles) : '';
  return `<!doctype html><html><head><meta charset="utf-8"><style>
.onenote-com-page{font-family:Calibri,"Segoe UI",sans-serif;font-size:11pt}
.onenote-com-page .onenote-paragraph:empty{min-height:1em}
.onenote-com-page .onenote-paragraph>.onenote-children{margin-left:1.5em}
.onenote-com-page .onenote-list-item{box-sizing:border-box;position:relative;padding-left:1.25em}
.onenote-com-page .onenote-list-bullet:before{content:"•";position:absolute;left:.25em}
.onenote-com-page .onenote-list-number{padding-left:2.25em}
.onenote-com-page .onenote-list-number:before{content:attr(data-onenote-number);position:absolute;left:0;width:2em;text-align:right;white-space:nowrap}
.onenote-com-page .onenote-table{border-collapse:collapse;max-width:100%;overflow-wrap:anywhere}
.onenote-com-page .onenote-table-fixed{table-layout:fixed}
.onenote-com-page .onenote-table th,.onenote-com-page .onenote-table td{box-sizing:border-box;padding:2px 4px;vertical-align:top}
.onenote-com-page .onenote-table th{font-weight:normal;text-align:left}
.onenote-com-page .onenote-table-bordered th,.onenote-com-page .onenote-table-bordered td{border:1px solid #999}
</style></head><body class="onenote-com-page">${body}</body></html>`;
}

export async function loadOneNoteComSnapshot(): Promise<OneNoteComSnapshot> {
  return parseOneNoteComHierarchy(await bibleNoteOneNoteHierarchy());
}

export async function loadOneNoteComPageHtml(pageId: string): Promise<string> {
  return oneNoteComPageXmlToHtml(await bibleNoteOneNotePageContent(pageId));
}
