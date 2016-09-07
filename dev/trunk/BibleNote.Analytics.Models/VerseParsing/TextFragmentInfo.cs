using BibleNote.Analytics.Core.Helpers;
using BibleNote.Analytics.Models.Modules;
using BibleNote.Analytics.Models.Verse;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Models.VerseParsing
{
    public class TextFragmentInfo
    {
        public int IndexOfDigit { get; set; }
        public BookEntry BookEntry { get; set; }
        public VerseNumberEntry VerseNumberEntry { get; set; }
        public VerseNumberEntry TopVerseNumberEntry { get; set; }
        public VerseEntryType EntryType { get; private set; }       

        public string Text { get; set; }
        public bool UseCommaDelimiter { get; set; }

        private Boundaries? _boundaries;
        public Boundaries Boundaries
        {
            get
            {
                if (!_boundaries.HasValue)
                {
                    var startIndex = BookEntry != null ? BookEntry.StartIndex : VerseNumberEntry.StartIndex; ;
                    var endIndex = VerseNumberEntry != null ? (TopVerseNumberEntry ?? VerseNumberEntry).EndIndex : IndexOfDigit;
                    
                    if (StringUtils.GetChar(Text, endIndex + 1) == ')' && StringUtils.GetChar(Text, IndexOfDigit - 1) == '(')
                        endIndex++;

                    _boundaries = new Boundaries(startIndex, endIndex);
                }

                return _boundaries.Value;
            }
        }

        public BibleBookInfo BibleBookInfo
        {
            get
            {
                return BookEntry != null ? BookEntry.BookInfo : null;
            }
        }

        public string ModuleName
        {
            get
            {
                return BookEntry != null ? BookEntry.ModuleName : null;
            }
        }

        public bool IsEmpty
        {
            get
            {
                return VerseNumberEntry.VerseNumber.IsEmpty;
            }
        }

        public VerseNumber VerseNumber
        {
            get
            {
                return VerseNumberEntry.VerseNumber;
            }
        }

        public VerseNumber? TopVerseNumber
        {
            get
            {
                return TopVerseNumberEntry != null ? TopVerseNumberEntry.VerseNumber : (VerseNumber?)null;
            }
        }

        public TextFragmentInfo(
            int indexOfDigit,
            string text,
            BookEntry bookEntry,
            VerseNumberEntry verseNumberEntry,
            VerseNumberEntry topVerseNumberEntry)
        {
            IndexOfDigit = indexOfDigit;
            Text = text;

            BookEntry = bookEntry;
            VerseNumberEntry = verseNumberEntry;
            TopVerseNumberEntry = topVerseNumberEntry;

            EntryType = GetEntryType();
        }       

        private VerseEntryType GetEntryType()
        {
            if (VerseNumberEntry.VerseNumber.IsEmpty)
                return VerseEntryType.None;

            if (BookEntry != null)
                return VerseNumberEntry.VerseNumber.IsChapter ? VerseEntryType.BookChapter : VerseEntryType.BookChapterVerse;

            if (VerseNumberEntry.IsVerse)
                return VerseEntryType.Verse;

            if (VerseNumberEntry.IsChapter)
                return VerseEntryType.Chapter;

            return VerseNumberEntry.VerseNumber.IsChapter ? VerseEntryType.ChapterOrVerse : VerseEntryType.ChapterVerse;
        }

        public bool CanBeJustNumber(string text)
        {
            var result = VerseNumberEntry.CanBeJustNumber(text, TopVerseNumberEntry);       // здесь может измениться IsVerse

            EntryType = GetEntryType();
            if (VerseNumberEntry.IsVerse)       // например, ":5-7"
            {
                VerseNumberEntry.VerseNumber = new VerseNumber(0, VerseNumberEntry.VerseNumber.Chapter);
                if (TopVerseNumberEntry != null)
                    TopVerseNumberEntry.VerseNumber = new VerseNumber(0, TopVerseNumberEntry.VerseNumber.Chapter);
            }

            return result;
        }

        public void SetEmpty()
        {
            VerseNumberEntry.VerseNumber = new VerseNumber();
        }

        public string GetVerseText()
        {
            return Text.Substring(Boundaries.StartIndex, Boundaries.EndIndex - Boundaries.StartIndex + 1);
        }        

        public VerseEntryOptions GetEntryOptions()
        {
            var prevChar = StringUtils.GetChar(Text, Boundaries.StartIndex - 1);
            var nextChar = StringUtils.GetChar(Text, Boundaries.EndIndex + 1);

            if (prevChar == '*' && nextChar == '*')
                return VerseEntryOptions.ImportantVerse;

            if (prevChar == '[' && nextChar == ']')
                return VerseEntryOptions.InSquareBrackets;

            if (prevChar == '{' && nextChar == '}')
                return VerseEntryOptions.IsExcluded;

            return VerseEntryOptions.None;
        }
    }
}
