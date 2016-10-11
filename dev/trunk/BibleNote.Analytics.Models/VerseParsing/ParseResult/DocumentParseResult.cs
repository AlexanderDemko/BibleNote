using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Models.VerseParsing.ParseResult
{
    public class DocumentParseResult
    {        
        public List<HierarchyParseResult> HierarchyParseResults { get; set; }

        public DocumentParseResult()
        {
            HierarchyParseResults = new List<HierarchyParseResult>();
        }

        /// <summary>
        /// For dev only
        /// </summary>
        /// <returns></returns>
        public IEnumerable<ParagraphParseResult> GetAllParagraphParseResults()
        {
            foreach (var paragraphResult in HierarchyParseResults.SelectMany(h => h.GetAllParagraphParseResults()))
            {
                yield return paragraphResult;
            }
        }
    }
}
