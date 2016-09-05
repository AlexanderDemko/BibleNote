using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Models.Common
{
    public class DocumentParseResult
    {
        public List<ParagraphParseResult> ParagraphParseResults { get; set; }

        public DocumentParseResult()
        {
            ParagraphParseResults = new List<ParagraphParseResult>();
        }
    }
}
