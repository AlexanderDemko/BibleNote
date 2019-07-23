using BibleNote.Analytics.Contracts.Environment;
using BibleNote.Analytics.Contracts.VerseParsing;
using BibleNote.Analytics.Models.Verse;
using BibleNote.Analytics.Models.VerseParsing;

namespace BibleNote.Analytics.Services.VerseParsing
{
    public class VersePointerFactory : IVersePointerFactory
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
