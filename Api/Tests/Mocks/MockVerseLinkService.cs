using BibleNote.Services.Contracts;
using BibleNote.Services.VerseParsing.Models;
using System.Text.RegularExpressions;

namespace BibleNote.Tests.Mocks
{
    public class MockVerseLinkService : IVerseLinkService
    {
        public string GetVerseLink(VersePointer versePointer)
        {
            var bookName = NormalizeBookName(versePointer.Book?.Name ?? versePointer.Book?.FriendlyShortName ?? string.Empty);
            return $"bnVerse:{bookName} {versePointer.GetFullVerseNumberString()}".Trim();
        }

        private static string NormalizeBookName(string bookName)
        {
            var normalized = bookName.Trim();
            normalized = Regex.Replace(normalized, @"^(От|К|Ко)\s+", string.Empty);
            normalized = Regex.Replace(normalized, @"^([123])-[ея]\s+", "$1");
            normalized = Regex.Replace(normalized, @"^([123])\s+", "$1");
            return normalized;
        }
    }
}
