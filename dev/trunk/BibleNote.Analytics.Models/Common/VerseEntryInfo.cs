using BibleNote.Analytics.Core.Helpers;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Models.Common
{
    public class BookEntry
    {
        public BibleBookInfo BookInfo { get; set; }
        public string ModuleName { get; set; }
        public int StartIndex { get; set; }
        public int EndIndex { get; set; }
    }

    public class VerseNumberEntry
    {
        public VerseNumber VerseNumber { get; set; }
        public int StartIndex { get; set; }
        public int EndIndex { get; set; }
        public bool IsVerse { get; set; }

        public bool CanBeJustNumber(string text)
        {
            var prevChar = StringUtils.GetChar(text, StartIndex - 1);
            if (prevChar == ':')
            {
                IsVerse = true;
                StartIndex--;
                return true;
            }

            if (prevChar == ',')
            {
                var prevPrevChar = StringUtils.GetChar(text, StartIndex - 2);
                if (char.IsDigit(prevPrevChar))
                    return true;
            }

            return false;
        }
    }

    public enum VerseEntryType
    {
        None = 0,
        BookChapter = 1,
        BookChapterVerse = 2,                
        Chapter = 3,
        ChapterVerse = 4,
        Verse = 5,
        ChapterOrVerse = 6
    }

    public enum VerseEntryOptions
    {
        None = 0,
        ImportantVerse = 1,
        InSquareBrackets = 2
    }

    public class VerseEntryInfo
    {
        public VersePointer VersePointer { get; set; }
        public VerseEntryType EntryType { get; set; }
        public int StartIndex { get; set; }
        public int EndIndex { get; set; }
        public VerseEntryOptions VerseEntryOptions { get; set; }
        //public bool IsExcluded { get; set; }        

        public bool VersePointerFound
        {
            get
            {
                return EntryType != VerseEntryType.None;
            }
        }
    }
}
