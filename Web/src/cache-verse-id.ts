export function toVerseId(
  bookIndex: number | null | undefined,
  chapter: number | null | undefined,
  verse: number | null | undefined
): number | null {
  if (!Number.isInteger(bookIndex) || !Number.isInteger(chapter) || !Number.isInteger(verse) || !verse) return null;
  return Number(`${String(bookIndex).padStart(2, '0')}${String(chapter).padStart(3, '0')}${String(verse).padStart(3, '0')}`);
}
