using BibleNote.Services.VerseParsing.Models;

namespace BibleNote.Services.VerseParsing.Contracts
{
    public interface IVerseCorrectionService
    {
        bool CheckAndCorrectVerse(VersePointer versePointer);        
    }
}
