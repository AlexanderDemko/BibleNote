using BibleNote.Analytics.Services.VerseParsing.Models.ParseResult;
using System.Collections.Generic;

namespace BibleNote.Analytics.Services.VerseProcessing.Models
{
    public class ParagraphParseResultExt
    {
        public int Depth { get; set; }

        public ParagraphParseResult ParagraphResult { get; set; }        

        public ParagraphParseResultExt(ParagraphParseResult paragraphResult, int depth)
        {
            this.ParagraphResult = paragraphResult;
            this.Depth = depth;
        }        

        public override string ToString()
        {
            return $"{Depth} - {ParagraphResult}";
        }
    }

    public class LinearParseResult
    {
        public LinkedList<ParagraphParseResultExt> Paragraphs { get; set; }

        public LinearParseResult()
        {
            Paragraphs = new LinkedList<ParagraphParseResultExt>();
        }

        public static LinearParseResult FromHierarchyParseResult(HierarchyParseResult hierarchyResult)
        {
            var result = new LinearParseResult();
            
            AddParagraphsFromHierarchy(hierarchyResult, result, 0);

            return result;
        }

        private static void AddParagraphsFromHierarchy(HierarchyParseResult hierarchyResult, LinearParseResult result, int depth)
        {
            foreach (var paragraph in hierarchyResult.ParagraphResults)
                result.Paragraphs.AddLast(new ParagraphParseResultExt(paragraph, depth));

            foreach (var childHierarchy in hierarchyResult.ChildHierarchyResults)
                AddParagraphsFromHierarchy(childHierarchy, result, depth + 1);
        }
    }
}
