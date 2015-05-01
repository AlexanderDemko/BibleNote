using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Models.Common
{
    public enum VerseEntryType
    {
        None = 0,
        BookChapter = 1,
        BookChapterVerse = 2,        
        Chapter = 3,
        ChapterVerse = 4,
        Verse = 5
    }


    public class VerseEntryInfo
    {
        public VersePointer VersePointer { get; set; }
        public VerseEntryType EntryType { get; set; }
        public int StartIndex { get; set; }
        public int EndIndex { get; set; }
        public bool IsImportantVerse { get; set; }
        public bool IsExcluded { get; set; }
        public bool IsInSquareBrackets { get; set; }

        public bool VersePointerFound
        {
            get
            {
                return EntryType != VerseEntryType.None;
            }
        }
    }
}
