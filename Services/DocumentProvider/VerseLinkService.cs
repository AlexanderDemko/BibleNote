using BibleNote.Services.DocumentProvider.Contracts;
using BibleNote.Services.VerseParsing.Models;

namespace BibleNote.Services.DocumentProvider
{
    class VerseLinkService : IVerseLinkService
    {
        public string GetVerseLink(VersePointer versePointer)
        {
            return $"bnVerse:{versePointer}";
        }
    }
}
