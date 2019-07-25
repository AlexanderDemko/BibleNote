using BibleNote.Analytics.Services.VerseParsing.Models;

namespace BibleNote.Analytics.Services.VerseParsing.Contracts
{
    public interface IVerseCorrectionService
    {
        bool CheckAndCorrectVerse(VersePointer versePointer);        
    }
}
