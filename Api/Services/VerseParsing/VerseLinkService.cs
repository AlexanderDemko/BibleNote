using BibleNote.Services.Configuration.Contracts;
using BibleNote.Services.Contracts;
using BibleNote.Services.VerseParsing.Models;

namespace BibleNote.Services.VerseParsing
{
    class VerseLinkService : IVerseLinkService
    {
        private readonly IConfigurationManager configurationManager;

        public VerseLinkService(IConfigurationManager configurationManager)
        {
            this.configurationManager = configurationManager;
        }

        public string GetVerseLink(VersePointer versePointer)
        {
            var verseNumber = versePointer.GetFullVerseNumberString();
            var bookName = versePointer.Book?.Name
                ?? versePointer.Book?.FriendlyShortName
                ?? string.Empty;
            var moduleShortName = string.IsNullOrWhiteSpace(versePointer.ModuleShortName)
                ? configurationManager.ModuleShortName
                : versePointer.ModuleShortName;
            if (string.IsNullOrWhiteSpace(moduleShortName))
                moduleShortName = "rst";

            return $"bnVerse:{moduleShortName}/{versePointer.BookIndex} {verseNumber};{bookName} {verseNumber}".Trim();
        }
    }
}
