using BibleNote.Analytics.Models.Verse;

namespace BibleNote.Analytics.Contracts.VerseParsing
{
    public interface IVerseCorrectionService
    {
        bool CheckAndCorrectVerse(VersePointer versePointer);        
    }
}
