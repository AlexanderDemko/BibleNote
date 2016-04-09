using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Models.Common
{
    public class ParagraphParseResult
    {   
        public ParagraphParseResult ParentParagraph { get; set; }

        public string Text { get; set; }

        public List<VerseEntryInfo> VerseEntries { get; set; }

        public ParagraphParseResult()
        {
            VerseEntries = new List<VerseEntryInfo>();
        }
    }
}
