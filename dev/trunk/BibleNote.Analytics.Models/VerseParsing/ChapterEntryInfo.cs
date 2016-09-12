using BibleNote.Analytics.Models.Verse;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Models.VerseParsing
{
    public class ChapterEntryInfo
    {
        public ChapterPointer ChapterPointer { get; set; }

        public bool AtStartOfParagraph { get; set; }

        public bool Calculated { get; set; } 

        public ChapterEntryInfo()
        {
        }

        public ChapterEntryInfo(ChapterPointer chapterPointer)
        {
            ChapterPointer = chapterPointer;
        }

        public ChapterEntryInfo CloneAsCalculated()
        {
            return new ChapterEntryInfo()
            {
                ChapterPointer = ChapterPointer,
                AtStartOfParagraph = AtStartOfParagraph,
                Calculated = true
            };
        }        

        public ChapterEntryInfo GetOwnChapterEntry()
        {
            return Calculated ? null : this;
        }
    }
}
