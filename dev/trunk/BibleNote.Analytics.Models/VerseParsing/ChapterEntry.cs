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

        public bool Valid { get { return ChapterPointer != null; } }

        public bool AtStartOfParagraph { get; set; }

        public ChapterEntry()
        {

        }

        public ChapterEntry(ChapterPointer chapterPointer)
        {
            ChapterPointer = chapterPointer;
        }

        public override string ToString()
        {
            return $"{ChapterPointer}, AtStartOfParagraph is {AtStartOfParagraph}";
        }
    }
}
