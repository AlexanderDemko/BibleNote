export function normalizedPdfText(value) {
  return String(value || '')
    .replace(/[\u00ad\u200b]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function pdfReferencePattern(value) {
  const text = normalizedPdfText(value);
  if (!text) return undefined;
  let source = '';
  for (const character of text) {
    if (/\s/u.test(character)) {
      source += '\\s*';
    } else if (/[:：,]/u.test(character)) {
      source += '\\s*[:：,]\\s*';
    } else if (/[-‐‑‒–—]/u.test(character)) {
      source += '\\s*[-‐‑‒–—]\\s*';
    } else {
      source += character.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
  }
  if (/^[:：]/u.test(text) || /[\p{L}\p{N}]/u.test(text[0])) source = '(?<![\\p{L}\\p{N}])' + source;
  if (/[\p{L}\p{N}]/u.test(text[text.length - 1])) source += '(?![\\p{L}\\p{N}])';
  try {
    return new RegExp(source, 'giu');
  } catch {
    return undefined;
  }
}

export function pdfLinkMatchesPage(pageNumber, renderedPageNumber) {
  return pageNumber == null
    || !Number.isInteger(Number(pageNumber))
    || Number(pageNumber) === renderedPageNumber;
}

export function preferredPdfLinkMatches(matches, occurrenceIndex) {
  const index = Number(occurrenceIndex);
  if (!Number.isInteger(index) || index < 0 || !matches[index]) {
    return { matches, occurrenceSpecific:false };
  }
  return {
    matches:[matches[index], ...matches.filter((_, matchIndex) => matchIndex !== index)],
    occurrenceSpecific:true
  };
}

export function pdfLinkMatchRange(match, targetText) {
  const matchStart = Number(match?.index);
  const matchedText = String(match?.[0] || '');
  if (!Number.isInteger(matchStart) || !matchedText) return undefined;
  if (!targetText) return { start:matchStart, end:matchStart + matchedText.length };
  const targetPattern = pdfReferencePattern(targetText);
  if (!targetPattern) return undefined;
  const targets = [...matchedText.matchAll(targetPattern)];
  const target = [...targets].reverse().find(candidate =>
    Number(candidate.index) + candidate[0].length === matchedText.length);
  if (!target) return undefined;
  const start = matchStart + Number(target.index);
  return { start, end:start + target[0].length };
}
