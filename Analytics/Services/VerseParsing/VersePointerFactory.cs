using BibleNote.Analytics.Services.ModulesManager.Contracts;
using BibleNote.Analytics.Services.VerseParsing.Contracts;
using BibleNote.Analytics.Services.VerseParsing.Models;

namespace BibleNote.Analytics.Services.VerseParsing
{
    class VersePointerFactory : IVersePointerFactory
    {
        private readonly IStringParser _stringParser;
        private readonly IApplicationManager _applicationManager;

        public VersePointerFactory(IStringParser stringParser, IApplicationManager applicationManager)
        {
            _stringParser = stringParser;
            _applicationManager = applicationManager;
        }

        public VersePointer CreateVersePointer(string text)
        {
            var verseEntry = _stringParser.TryGetVerse(text, 0);
            if (verseEntry.VersePointerFound
                && (verseEntry.EntryType == VerseEntryType.BookChapter || verseEntry.EntryType == VerseEntryType.BookChapterVerse)
                && verseEntry.StartIndex == 0
                //&& verseEntry.EndIndex == text.Length - 1
                )
            {
                return verseEntry.VersePointer;
            }

            return null;
        }
    }
}
