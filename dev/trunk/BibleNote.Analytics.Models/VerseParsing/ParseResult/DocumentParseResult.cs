using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Models.VerseParsing.ParseResult
{
    public class DocumentParseResult
    {   
        public HierarchyParseResult RootHierarchyResult { get; internal set; }

        public bool IsValuable { get { return RootHierarchyResult != null; } }

        public IEnumerable<ParagraphParseResult> GetAllParagraphParseResults()
        {
            return RootHierarchyResult.GetAllParagraphParseResults();
        }
    }
}
