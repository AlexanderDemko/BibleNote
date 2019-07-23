using BibleNote.Analytics.Services.VerseParsing.Contracts.ParseContext;
using BibleNote.Analytics.Services.VerseParsing.Models;

namespace BibleNote.Analytics.Services.VerseParsing.Contracts
{
    public interface IVerseRecognitionService
    {
        bool TryRecognizeVerse(VerseEntry verseEntry, IDocumentParseContext docParseContext);
    }
}
