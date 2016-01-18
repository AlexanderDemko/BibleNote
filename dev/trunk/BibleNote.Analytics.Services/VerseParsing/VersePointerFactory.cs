using BibleNote.Analytics.Contracts.VerseParsing;
using BibleNote.Analytics.Models.Common;
using Microsoft.Practices.Unity;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Services.VerseParsing
{
    public class VersePointerFactory : IVersePointerFactory
    {
        [Dependency]
        public IStringParser StringParser { get; set; }

        public VersePointer CreateVersePointer(string text)
        {
            var verseEntry = StringParser.TryGetVerse(text, 0);
            if (verseEntry.VersePointerFound
                && (verseEntry.EntryType == VerseEntryType.BookChapter || verseEntry.EntryType == VerseEntryType.BookChapterVerse)
                && verseEntry.StartIndex == 0
                && verseEntry.EndIndex == text.Length - 1)
            {
                return verseEntry.VersePointer;
            }

            return null;
        }
    }
}
