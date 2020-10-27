using BibleNote.Services.VerseParsing.Models;

namespace BibleNote.Services.DocumentProvider.Contracts
{
    public interface IVerseLinkService
    {
        string GetVerseLink(VersePointer versePointer);
    }
}
