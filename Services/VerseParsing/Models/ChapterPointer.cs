﻿using BibleNote.Services.ModulesManager.Models;
using BibleNote.Services.ModulesManager.Scheme.Module;

namespace BibleNote.Services.VerseParsing.Models
{
    public class ChapterPointer : VersePointer
    {
        public ChapterPointer(BibleBookInfo bookInfo, string moduleShortName, int chapter)
            : base(bookInfo, moduleShortName, string.Empty, new VerseNumber(chapter))
        {            
        }

        public override bool Equals(object obj)
        {
            if (!(obj is ChapterPointer otherObj))
                return false;

            return BookIndex == otherObj.BookIndex
                && Chapter == otherObj.Chapter;
        }

        public override int GetHashCode()
        {
            return base.GetHashCode();
        }
    }
}
