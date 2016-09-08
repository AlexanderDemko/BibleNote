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
    }
}
