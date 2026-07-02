using BibleNote.Services.VerseParsing.Models;

namespace BibleNote.Services.VerseParsing.Contracts
{
    public interface IStringParser
    {
        VerseEntry TryGetVerse(string text, int index);

        VerseEntry TryGetVerse(string text, int startIndex, int leftBoundary, bool useCommaDelimiter);
    }
}
