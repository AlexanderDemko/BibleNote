using BibleNote.Analytics.Models.Contracts.ParseContext;
using BibleNote.Analytics.Models.VerseParsing;

namespace BibleNote.Analytics.Contracts.VerseParsing
{
    public interface IVerseRecognitionService
    {
        bool TryRecognizeVerse(VerseEntry verseEntry, IDocumentParseContext docParseContext);
    }
}
