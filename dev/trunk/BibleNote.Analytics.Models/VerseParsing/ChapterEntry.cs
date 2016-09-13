using BibleNote.Analytics.Models.Verse;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Models.VerseParsing
{
    public class ChapterEntry
    {
        public ChapterPointer ChapterPointer { get; set; }

        public bool AtStartOfParagraph { get; set; }        

        public ChapterEntry(ChapterPointer chapterPointer)
        {
            ChapterPointer = chapterPointer;
        }       
    }
}
