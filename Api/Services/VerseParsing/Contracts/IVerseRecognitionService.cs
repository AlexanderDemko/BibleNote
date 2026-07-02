using BibleNote.Services.VerseParsing.Contracts.ParseContext;
using BibleNote.Services.VerseParsing.Models;

namespace BibleNote.Services.VerseParsing.Contracts
{
    public interface IVerseRecognitionService
    {
        bool TryRecognizeVerse(VerseEntry verseEntry, IDocumentParseContext docParseContext);
    }
}
