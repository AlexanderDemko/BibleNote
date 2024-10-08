﻿using BibleNote.Common.Helpers;
using BibleNote.Services.ModulesManager.Models;
using BibleNote.Services.ModulesManager.Scheme.Module;

namespace BibleNote.Services.VerseParsing.Models
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

        public bool IsChapter { get; set; }

        public bool CanBeJustNumber(string text, VerseNumberEntry topVerseNumberEntry)
        {
            var maxSpaces = 2;
            var cursor = StartIndex;
            var prevChar = StringUtils.SearchFirstValuablePrevChar(text, ref cursor, ref maxSpaces);
            var prevIndex = cursor;
            var prevPrevChar = StringUtils.SearchFirstValuablePrevChar(text, ref cursor, ref maxSpaces);

            if (prevChar == ':' && !char.IsDigit(prevPrevChar)) 
            {
                var nextChar = StringUtils.GetChar(text, prevIndex + 1);
                if (nextChar != ' ')
                {
                    IsVerse = true;
                    StartIndex--;
                    return true;
                }
            }

            if (char.IsDigit(prevPrevChar))
            {
                if (prevChar == ';')
                {
                    IsChapter = true;
                    return true;
                }

                if (prevChar == ',')
                    return true;
            }            

            //if (VerseUtils.IsDash(nextChar) && topVerseNumberEntry != null && topVerseNumberEntry.VerseNumber.IsChapter)
            //    return true;            

            return false;
        }
    }

    public enum VerseEntryType
    {
        None = 0,
        BookChapter = 1,
        BookChapterVerse = 2,
        ChapterVerse = 3,
        Chapter = 4,        
        Verse = 5,
        ChapterOrVerse = 6
    }
    
    public enum VerseEntryOptions
    {
        None = 0,
        ImportantVerse = 1,
        IsExcluded = 2,             // ссылка сохраняется как detailedVerse.
        InSquareBrackets = 3        // исключаемая глава. То есть стихи этой главы на данной странице (если глава в заголовке) или в подпунктах (если глава - в parentNode списка) сохраняются как detailedVerse.
    }

    public class VerseEntry
    {
        public VersePointer VersePointer { get; set; }

        public VerseEntryType EntryType { get; set; }

        public int StartIndex { get; set; }         // границы стиха в рамках параграфа

        public int EndIndex { get; set; }

        public VerseEntryOptions EntryOptions { get; set; }        

        public bool VersePointerFound
        {
            get
            {
                return EntryType != VerseEntryType.None;
            }
        }

        public override string ToString()
        {
            return $"{VersePointer} at {StartIndex}-{EndIndex}";
        }
    }
}
