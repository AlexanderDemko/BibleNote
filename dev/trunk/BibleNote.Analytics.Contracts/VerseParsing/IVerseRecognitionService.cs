using BibleNote.Analytics.Contracts.VerseParsing.ParseContext;
using BibleNote.Analytics.Models.VerseParsing;

namespace BibleNote.Analytics.Contracts.VerseParsing
{
    public interface IVerseRecognitionService
    {
        bool TryRecognizeVerse(VerseEntryInfo verseEntry, IDocumentParseContext docParseContext);
    }
}
