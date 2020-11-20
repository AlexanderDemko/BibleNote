using BibleNote.Services.VerseParsing.Models;

namespace BibleNote.Services.Contracts
{
    public interface IVerseLinkService
    {
        string GetVerseLink(VersePointer versePointer);
    }
}
