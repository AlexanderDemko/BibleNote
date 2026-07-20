export function toVerseId(
  bookIndex: number | null | undefined,
  chapter: number | null | undefined,
  verse: number | null | undefined
): number | null {
  if (!Number.isInteger(bookIndex) || !Number.isInteger(chapter) || !Number.isInteger(verse) || !verse) return null;
  return Number(`${String(bookIndex).padStart(2, '0')}${String(chapter).padStart(3, '0')}${String(verse).padStart(3, '0')}`);
}

export function fromVerseId(verseId: number | null | undefined): {
  bookIndex: number;
  chapter: number;
  verse: number;
} | null {
  if (!Number.isInteger(verseId) || Number(verseId) <= 0) return null;
  const value = Number(verseId);
  return {
    bookIndex:Math.floor(value / 1_000_000),
    chapter:Math.floor(value % 1_000_000 / 1_000),
    verse:value % 1_000
  };
}
