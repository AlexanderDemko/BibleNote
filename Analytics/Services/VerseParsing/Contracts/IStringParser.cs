using BibleNote.Analytics.Services.VerseParsing.Models;

namespace BibleNote.Analytics.Services.VerseParsing.Contracts
{
    public interface IStringParser
    {
        VerseEntry TryGetVerse(string text, int index);

        VerseEntry TryGetVerse(string text, int startIndex, int leftBoundary, bool useCommaDelimiter);
    }
}
