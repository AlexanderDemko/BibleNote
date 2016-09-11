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

        public bool AtStart { get; set; }

        public bool Own { get; set; }       // замена _calculatedChapter
    }
}
