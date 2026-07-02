using System.Collections.Generic;
using BibleNote.Services.VerseParsing.Contracts.ParseResult;

namespace BibleNote.Services.VerseParsing.Models.ParseResult
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
