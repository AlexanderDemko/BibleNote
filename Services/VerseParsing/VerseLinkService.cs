using BibleNote.Services.Contracts;
using BibleNote.Services.VerseParsing.Models;

namespace BibleNote.Services.VerseParsing
{
    class VerseLinkService : IVerseLinkService
    {
        public string GetVerseLink(VersePointer versePointer)
        {
            var module = string.IsNullOrWhiteSpace(versePointer.ModuleShortName)
                ? "rst"
                : versePointer.ModuleShortName.Trim();
            var machineReference = $"{module}/{versePointer.BookIndex} {versePointer.GetFullVerseNumberString()}".Replace(" ", "%20");
            var displayBookName = versePointer.Book?.Name ?? versePointer.Book?.FriendlyShortName ?? string.Empty;
            var displayReference = $"{displayBookName} {versePointer.GetFullVerseNumberString()}".Trim().Replace(" ", "%20");
            return $"isbtBibleVerse:{machineReference};{displayReference}";
        }
    }
}
