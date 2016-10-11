using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Models.VerseParsing.ParseResult
{
    public class HierarchyParseResult
    {
        public HierarchyParseResult ParentHierarchy { get; set; }

        public List<HierarchyParseResult> ChildHierarchies { get; set; }

        public List<ParagraphParseResult> Paragraphs { get; set; }        

        public HierarchyParseResult()
        {
            ChildHierarchies = new List<HierarchyParseResult>();
            Paragraphs = new List<ParagraphParseResult>();            
        }

        /// <summary>
        /// For dev only
        /// </summary>
        /// <returns></returns>
        public IEnumerable<ParagraphParseResult> GetAllParagraphParseResults()
        {
            foreach (var paragraphResult in Paragraphs
                                            .Union(ChildHierarchies.SelectMany(h => h.GetAllParagraphParseResults())))
            {
                yield return paragraphResult;
            }
        }
    }
}
