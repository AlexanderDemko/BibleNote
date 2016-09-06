using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Models.Common
{
    public class ParagraphParseResult
    {
        public string Text { get; set; }

        public ParagraphContext ParagraphContext { get; set; }        

        public List<VerseEntryInfo> VerseEntries { get; set; }

        public List<SimpleVersePointer> NotFoundVerses { get; set; }

        public ParagraphParseResult()
        {
            VerseEntries = new List<VerseEntryInfo>();
            NotFoundVerses = new List<SimpleVersePointer>();
        }
    }
}
