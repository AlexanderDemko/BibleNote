using BibleNote.Analytics.Models.VerseParsing;

namespace BibleNote.Analytics.Contracts.VerseParsing
{
    public interface IStringParser
    {
        VerseEntryInfo TryGetVerse(string text, int index);

        VerseEntryInfo TryGetVerse(string text, int startIndex, int leftBoundary, bool useCommaDelimiter);
    }
}
