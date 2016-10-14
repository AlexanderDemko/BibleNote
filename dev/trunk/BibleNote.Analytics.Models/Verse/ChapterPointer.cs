using BibleNote.Analytics.Models.Modules;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Models.Verse
{
    public class ChapterPointer : VersePointer
    {
        public ChapterPointer(BibleBookInfo bookInfo, string moduleShortName, int chapter)
            : base(bookInfo, moduleShortName, string.Empty, new VerseNumber(chapter))
        {            
        }

        public override bool Equals(object obj)
        {
            var otherObj = obj as ChapterPointer;

            if (otherObj == null)
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
