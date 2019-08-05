using BibleNote.Analytics.Services.VerseParsing.Models.ParseResult;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;

namespace BibleNote.Analytics.Services.VerseProcessing.Models
{
    public class ParagraphParseResultExt
    {
        public int Depth { get; set; }

        ParagraphParseResult ParagraphParseResult { get; set; }

        public ParagraphParseResultExt(ParagraphParseResult paragraphParseResult, int depth)
        {
            this.ParagraphParseResult = paragraphParseResult;
            this.Depth = depth;
        }

        public override string ToString()
        {
            return $"{Depth} - {ParagraphParseResult}";
        }
    }

    public class LinearParseResult
    {
        public List<ParagraphParseResultExt> Paragraphs { get; set; }

        public LinearParseResult()
        {
            Paragraphs = new List<ParagraphParseResultExt>();
        }

        public static LinearParseResult FromHierarchyParseResult(HierarchyParseResult hierarchyResult)
        {
            var result = new LinearParseResult();
            
            AddParagraphsFromHierarchy(hierarchyResult, result, 0);

            return result;
        }

        private static void AddParagraphsFromHierarchy(HierarchyParseResult hierarchyResult, LinearParseResult result, int depth)
        {
            result.Paragraphs.AddRange(
                hierarchyResult.ParagraphResults.Select(p => new ParagraphParseResultExt(p, depth)));

            foreach (var childHierarchy in hierarchyResult.ChildHierarchyResults)
                AddParagraphsFromHierarchy(childHierarchy, result, depth + 1);
        }
    }
}
