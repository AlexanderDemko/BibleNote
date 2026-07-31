import * as cheerio from 'cheerio';
import { bibleNoteOneNoteHierarchy, bibleNoteOneNotePageContent } from './biblenote-gateway.js';
import type { Notebook, Page, Section, SectionGroup } from './sync.js';

type XmlNode = any;

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
      orderIndex
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

function renderPageNode($xml: cheerio.CheerioAPI, node: XmlNode): string {
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
    return `<table>${elementChildren(node, 'Row').map(child => renderPageNode($xml, child)).join('')}</table>`;
  }
  if (name === 'Row') {
    return `<tr>${elementChildren(node, 'Cell').map(child => renderPageNode($xml, child)).join('')}</tr>`;
  }
  if (name === 'Cell') {
    return `<td>${elementChildren(node).map(child => renderPageNode($xml, child)).join('')}</td>`;
  }
  if (name === 'OEChildren') {
    return `<div class="onenote-children">${elementChildren(node).map(child => renderPageNode($xml, child)).join('')}</div>`;
  }
  if (name === 'OE') {
    const body = elementChildren(node)
      .filter(child => !['List', 'Meta', 'InkDrawing'].includes(localName(child)))
      .map(child => renderPageNode($xml, child))
      .join('');
    const style = attr(node, 'style');
    return `<div class="onenote-paragraph"${style ? ` style="${escapeHtml(style)}"` : ''}>${body}</div>`;
  }
  if (name === 'Title') {
    return `<h1>${elementChildren(node).map(child => renderPageNode($xml, child)).join('')}</h1>`;
  }
  if (name === 'Outline') {
    return `<section class="onenote-outline">${elementChildren(node)
      .filter(child => !['Position', 'Size'].includes(localName(child)))
      .map(child => renderPageNode($xml, child)).join('')}</section>`;
  }
  if (['Page', 'Notebook', 'Section'].includes(name)) {
    return elementChildren(node).map(child => renderPageNode($xml, child)).join('');
  }
  return '';
}

export function oneNoteComPageXmlToHtml(xml: string): string {
  const $xml = cheerio.load(xml, { xmlMode:true });
  const root = $xml.root().children().first()[0];
  const body = root ? renderPageNode($xml, root) : '';
  return `<!doctype html><html><head><meta charset="utf-8"></head><body class="onenote-com-page">${body}</body></html>`;
}

export async function loadOneNoteComSnapshot(): Promise<OneNoteComSnapshot> {
  return parseOneNoteComHierarchy(await bibleNoteOneNoteHierarchy());
}

export async function loadOneNoteComPageHtml(pageId: string): Promise<string> {
  return oneNoteComPageXmlToHtml(await bibleNoteOneNotePageContent(pageId));
}
