export type OneNoteLinkedPage = {
  id: string;
  links?: {
    oneNoteClientUrl?: {
      href?: string;
    };
  };
};

export type OneNoteLinkedSection = OneNoteLinkedPage;

function extractOneNoteObjectGuid(value: unknown, parameter: 'page-id' | 'section-id'): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    // A malformed escape sequence does not prevent matching an unescaped object id.
  }

  const escapedParameter = parameter.replace('-', '\\-');
  const parameterMatch = decoded.match(
    new RegExp(`(?:[?&#]|^)${escapedParameter}=\\{?([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})\\}?`, 'i')
  );
  return parameterMatch?.[1].toLowerCase();
}

export function extractOneNotePageGuid(value: unknown): string | undefined {
  const parameterGuid = extractOneNoteObjectGuid(value, 'page-id');
  if (parameterGuid) return parameterGuid;
  if (typeof value !== 'string' || !value.trim()) return undefined;

  const guidMatch = value.match(/\{?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\}?/i);
  return guidMatch?.[1].toLowerCase();
}

export function extractOneNoteSectionGuid(value: unknown): string | undefined {
  return extractOneNoteObjectGuid(value, 'section-id');
}

export function extractOneNotePageTitle(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const fragmentStart = value.indexOf('#');
  if (fragmentStart < 0) return undefined;

  const encodedTitle = value.slice(fragmentStart + 1).split('&', 1)[0].trim();
  if (!encodedTitle) return undefined;
  try {
    return decodeURIComponent(encodedTitle).trim() || undefined;
  } catch {
    return encodedTitle;
  }
}

export function findGraphPageForOneNoteClientPage<T extends OneNoteLinkedPage>(
  pages: T[],
  currentPageId: string | undefined,
  currentClientUrl: string | undefined
): T | undefined {
  const targetGuid = extractOneNotePageGuid(currentClientUrl) ?? extractOneNotePageGuid(currentPageId);
  if (!targetGuid) return undefined;
  return pages.find(page =>
    extractOneNotePageGuid(page.links?.oneNoteClientUrl?.href) === targetGuid
  );
}

export function findGraphSectionForOneNoteClientPage<T extends OneNoteLinkedSection>(
  sections: T[],
  currentClientUrl: string | undefined
): T | undefined {
  const targetGuid = extractOneNoteSectionGuid(currentClientUrl);
  if (!targetGuid) return undefined;
  return sections.find(section =>
    extractOneNoteSectionGuid(section.links?.oneNoteClientUrl?.href) === targetGuid
  );
}
