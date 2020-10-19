using BibleNote.Analytics.Services.VerseParsing.Models;

namespace BibleNote.Analytics.Services.DocumentProvider.Contracts
{
    public interface IVerseLinkService
    {
        string GetVerseLink(VersePointer versePointer);
    }
}
