using BibleNote.Analytics.Models.VerseParsing;

namespace BibleNote.Analytics.Contracts.VerseParsing
{
    public interface IStringParser
    {
        VerseEntry TryGetVerse(string text, int index);

        VerseEntry TryGetVerse(string text, int startIndex, int leftBoundary, bool useCommaDelimiter);
    }
}
