using System.Collections.Generic;
using System.Linq;
using BibleNote.Services.VerseParsing.Contracts.ParseContext;
using BibleNote.Services.VerseParsing.Contracts.ParseResult;

namespace BibleNote.Services.VerseParsing.Models.ParseResult
{
    public class HierarchyParseResultItem
    {
        public ParagraphParseResult ParagraphResult { get; }

        public HierarchyParseResult HierarchyResult { get; }

        public HierarchyParseResultItem(ParagraphParseResult paragraphResult)
        {
            ParagraphResult = paragraphResult;
        }

        public HierarchyParseResultItem(HierarchyParseResult hierarchyResult)
        {
            HierarchyResult = hierarchyResult;
        }
    }

    public class HierarchyParseResult : ICapacityInfo
    {
        public int TextLength { get; set; }

        /// <summary>
        /// Include subverses
        /// </summary>
        public int VersesCount { get; set; }

        public ElementType ElementType { get; internal set; }

        public HierarchyParseResult ParentHierarchyResults { get; internal set; }

        public List<HierarchyParseResult> ChildHierarchyResults { get; private set; }

        public List<ParagraphParseResult> ParagraphResults { get; private set; }

        /// <summary>
        /// Every paragraph and child hierarchy in source order. Unlike ParagraphResults and
        /// ChildHierarchyResults, this collection also retains content without Bible references.
        /// </summary>
        public List<HierarchyParseResultItem> OrderedItems { get; private set; }

        public HierarchyParseResult(ElementType elementType)
        {
            ElementType = elementType;

            ChildHierarchyResults = new List<HierarchyParseResult>();
            ParagraphResults = new List<ParagraphParseResult>();
            OrderedItems = new List<HierarchyParseResultItem>();
        }

        internal void AddOrderedParagraph(ParagraphParseResult paragraphResult)
        {
            OrderedItems.Add(new HierarchyParseResultItem(paragraphResult));
        }

        internal void AddOrderedHierarchy(HierarchyParseResult hierarchyResult)
        {
            OrderedItems.Add(new HierarchyParseResultItem(hierarchyResult));
        }

        public IEnumerable<ParagraphParseResult> GetSimpleHierarchicalParagraphResults()
        {
            return ParagraphResults
                    .Union(ChildHierarchyResults
                        .Where(ch => ch.ElementType.IsSimpleHierarchical())
                        .SelectMany(ch => ch.GetSimpleHierarchicalParagraphResults()));
        }
        
        public IEnumerable<ParagraphParseResult> GetAllParagraphParseResults()
        {
            return ParagraphResults
                    .Union(ChildHierarchyResults.SelectMany(h => h.GetAllParagraphParseResults()));
        }

        public HierarchyParseResult GetValuableHierarchyResult()
        {
            if (ParagraphResults.Any() || ChildHierarchyResults.Count > 1 || !ElementTypeHelper.CanBeLinear(ElementType))
                return this;

            return ChildHierarchyResults.FirstOrDefault()?.GetValuableHierarchyResult();
        }

        public override string ToString()
        {
            return this.ElementType.ToString();
        }
    }
}
