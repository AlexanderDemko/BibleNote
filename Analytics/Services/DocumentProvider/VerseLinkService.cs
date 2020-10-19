using BibleNote.Analytics.Services.DocumentProvider.Contracts;
using BibleNote.Analytics.Services.VerseParsing.Models;

namespace BibleNote.Analytics.Services.DocumentProvider
{
    class VerseLinkService : IVerseLinkService
    {
        public string GetVerseLink(VersePointer versePointer)
        {
            return $"bnVerse:{versePointer}";
        }
    }
}
