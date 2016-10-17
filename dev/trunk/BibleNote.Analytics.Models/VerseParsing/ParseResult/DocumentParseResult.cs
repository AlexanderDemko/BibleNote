using BibleNote.Analytics.Models.Contracts.ParseResult;
using System.Collections.Generic;

namespace BibleNote.Analytics.Models.VerseParsing.ParseResult
{
    public class DocumentParseResult : ICapacityInfo
    {
        public bool IsValuable { get { return RootHierarchyResult != null; } }

        public HierarchyParseResult RootHierarchyResult { get; internal set; }

        public int TextLength { get { return RootHierarchyResult?.TextLength ?? 0; } }

        /// <summary>
        /// Include subverses
        /// </summary>
        public int VersesCount { get { return RootHierarchyResult?.VersesCount ?? 0; } }        
        
        public IEnumerable<ParagraphParseResult> GetAllParagraphParseResults()
        {
            return RootHierarchyResult.GetAllParagraphParseResults();
        }
    }
}
