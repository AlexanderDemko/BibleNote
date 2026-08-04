using System.Collections.Generic;
using System.Linq;
using BibleNote.Services.VerseParsing.Contracts.ParseContext;
using BibleNote.Services.VerseParsing.Models.ParseResult;

namespace BibleNote.Services.VerseProcessing.Models
{
    public class ParagraphParseResultExt
    {
        public int Depth { get; set; }

        public ParagraphParseResult ParagraphResult { get; set; }

        public IReadOnlyList<HierarchyParseResult> StructuralScopes { get; }

        public ParagraphParseResultExt(
            ParagraphParseResult paragraphResult,
            int depth,
            IReadOnlyList<HierarchyParseResult> structuralScopes)
        {
            ParagraphResult = paragraphResult;
            Depth = depth;
            StructuralScopes = structuralScopes;
        }

        public bool SharesStructuralScopeWith(ParagraphParseResultExt other)
        {
            if (StructuralScopes.Count == 0 && other.StructuralScopes.Count == 0)
                return true;

            return StructuralScopes.Any(scope => other.StructuralScopes.Contains(scope));
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

            AddParagraphsFromHierarchy(
                hierarchyResult,
                result,
                0,
                new List<HierarchyParseResult>());

            return result;
        }

        private static void AddParagraphsFromHierarchy(
            HierarchyParseResult hierarchyResult,
            LinearParseResult result,
            int depth,
            IReadOnlyList<HierarchyParseResult> parentScopes)
        {
            var hasDirectParagraphs = hierarchyResult.OrderedItems.Any(item => item.ParagraphResult != null)
                || hierarchyResult.ParagraphResults.Any();
            var hasChildHierarchies = hierarchyResult.OrderedItems.Any(item => item.HierarchyResult != null)
                || hierarchyResult.ChildHierarchyResults.Any();
            var establishesStructuralScope = hierarchyResult.ElementType == ElementType.ListElement
                || hierarchyResult.ElementType == ElementType.TableCell
                || (hasDirectParagraphs && hasChildHierarchies);
            var scopes = establishesStructuralScope
                ? parentScopes.Concat(new[] { hierarchyResult }).ToList()
                : parentScopes;

            if (hierarchyResult.OrderedItems.Count > 0)
            {
                foreach (var item in hierarchyResult.OrderedItems)
                {
                    if (item.ParagraphResult != null)
                    {
                        result.Paragraphs.AddLast(new ParagraphParseResultExt(
                            item.ParagraphResult,
                            depth,
                            scopes));
                    }
                    else if (item.HierarchyResult != null)
                    {
                        AddParagraphsFromHierarchy(
                            item.HierarchyResult,
                            result,
                            depth + 1,
                            scopes);
                    }
                }

                return;
            }

            // Compatibility for parse results created without source-order structure.
            foreach (var paragraph in hierarchyResult.ParagraphResults)
                result.Paragraphs.AddLast(new ParagraphParseResultExt(paragraph, depth, scopes));

            foreach (var childHierarchy in hierarchyResult.ChildHierarchyResults)
                AddParagraphsFromHierarchy(childHierarchy, result, depth + 1, scopes);
        }
    }
}
