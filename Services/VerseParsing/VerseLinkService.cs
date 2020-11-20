using BibleNote.Services.Contracts;
using BibleNote.Services.VerseParsing.Models;

namespace BibleNote.Services.VerseParsing
{
    class VerseLinkService : IVerseLinkService
    {
        public string GetVerseLink(VersePointer versePointer)
        {
            return $"bnVerse:{versePointer}";
        }
    }
}
