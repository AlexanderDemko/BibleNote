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
        public static ChapterEntry Terminator
        {
            get
            {
                return new ChapterEntry() { Invalid = true, AtStartOfParagraph = true };
            }
        }

        public ChapterPointer ChapterPointer { get; set; }        

        public bool Found { get { return ChapterPointer != null && CorrectType && !Invalid; } }

        public bool Invalid { get; set; }

        public bool AtStartOfParagraph { get; set; }

        public bool CorrectType { get; set; }

        public ChapterEntry()
        {

        }

        public ChapterEntry(ChapterPointer chapterPointer)
        {
            ChapterPointer = chapterPointer;               
            CorrectType = true;
        }

        public override string ToString()
        {
            return $"{ChapterPointer}, AtStartOfParagraph is {AtStartOfParagraph}";
        }
    }
}
