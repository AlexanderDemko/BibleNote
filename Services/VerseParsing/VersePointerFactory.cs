using BibleNote.Services.VerseParsing.Contracts;
using BibleNote.Services.VerseParsing.Models;

namespace BibleNote.Services.VerseParsing
{
    class VersePointerFactory : IVersePointerFactory
    {
        private readonly IStringParser _stringParser;

        public VersePointerFactory(IStringParser stringParser)
        {
            _stringParser = stringParser;
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
