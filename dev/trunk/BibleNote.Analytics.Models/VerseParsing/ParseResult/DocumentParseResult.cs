using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Models.VerseParsing.ParseResult
{
    public class DocumentParseResult
    {   
        public int DocumentLength { get; set; }

        /// <summary>
        /// Include subverses
        /// </summary>
        public int AllVersesCount { get; set; }     // надо подумать, где это свойство указывать. Надо как-то подцепиться к IParagraphParseContextEditor.SetLatestVerseEntry()

        public HierarchyParseResult RootHierarchyResult { get; internal set; }

        public bool IsValuable { get { return RootHierarchyResult != null; } }

        public IEnumerable<ParagraphParseResult> GetAllParagraphParseResults()
        {
            return RootHierarchyResult.GetAllParagraphParseResults();
        }
    }
}
