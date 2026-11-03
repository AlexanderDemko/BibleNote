export const DEFAULT_VERSE_ID_REGISTRY = 'bnverse:v1';

export const verseIdRegistryPattern = /^[a-z0-9][a-z0-9._:-]{2,63}$/;

export type VerseIdCoordinate = {
  bookIndex: number;
  chapter: number;
  verse: number;
};

export function formatVerseId(
  coordinate: VerseIdCoordinate,
  registry = DEFAULT_VERSE_ID_REGISTRY
): string {
  if (!verseIdRegistryPattern.test(registry)) throw new Error('VerseId registry identifier is invalid.');
  if (!Number.isInteger(coordinate.bookIndex) || coordinate.bookIndex < 1
      || !Number.isInteger(coordinate.chapter) || coordinate.chapter < 1
      || !Number.isInteger(coordinate.verse) || coordinate.verse < 1) {
    throw new Error('VerseId coordinates must be positive integers.');
  }
  return `${registry}:${coordinate.bookIndex}:${coordinate.chapter}:${coordinate.verse}`;
}
