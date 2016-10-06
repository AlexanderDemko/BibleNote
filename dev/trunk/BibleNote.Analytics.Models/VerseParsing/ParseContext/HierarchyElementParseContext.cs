using BibleNote.Analytics.Core.Extensions;
using BibleNote.Analytics.Models.Verse;
using System.Collections.Generic;
using System.Linq;
using BibleNote.Analytics.Models.Contracts.ParseContext;
using BibleNote.Analytics.Models.Contracts;
using System;

namespace BibleNote.Analytics.Models.VerseParsing.ParseContext
{
    public class HierarchyElementParseContext : IHierarchyElementParseContext
    {
        public ElementType ElementType { get; private set; }

        public IHierarchyInfo HierarchyInfo { get; set; }

        public List<ParagraphParseResult> ParagraphResults { get; private set; }

        public List<IHierarchyElementParseContext> ChildHierarchies { get; private set; }

        public IHierarchyElementParseContext ParentHierarchy { get; private set; }

        public IElementParseContext PreviousSibling { get; private set; }

        public bool Parsed { get; set; }

        private bool _chapterEntryWasSearched;
        private ChapterEntry _chapterEntry;
        public ChapterEntry ChapterEntry
        {
            get
            {
                if (!Parsed)
                    return null;

                return GetChapterEntry();
            }
        }

        public HierarchyElementParseContext(ElementType paragraphState, IElementParseContext previousSibling,
            IHierarchyElementParseContext parentHierarchy)
        {
            ElementType = paragraphState;
            PreviousSibling = previousSibling;
            ParentHierarchy = parentHierarchy;

            ParagraphResults = new List<ParagraphParseResult>();
            ChildHierarchies = new List<IHierarchyElementParseContext>();
        }

        public ChapterEntry GetHierarchyChapterEntry()
        {
            if (ChapterEntry != null && (ChapterEntry.Found || (ChapterEntry.AtStartOfParagraph && ChapterEntry.Invalid)))
                return ChapterEntry;

            var calculatedChapterEntry = GetCalculatedChapterEntry();
            if (calculatedChapterEntry != null && (calculatedChapterEntry.Found || (calculatedChapterEntry.AtStartOfParagraph && calculatedChapterEntry.Invalid)))
                return calculatedChapterEntry;

            return ParentHierarchy?.GetHierarchyChapterEntry();
        }

        public IEnumerable<ParagraphParseResult> GetAllParagraphResults()
        {
            return ParagraphResults
                    .Union(ChildHierarchies
                            .Where(ch => ch.ElementType.IsSimpleHierarchical())
                            .SelectMany(ch => ch.GetAllParagraphResults()));
        }

        private ChapterEntry GetChapterEntry()
        {
            if (!_chapterEntryWasSearched)
            {
                _chapterEntryWasSearched = true;

                _chapterEntry = new ChapterEntry();
                foreach (var entry in GetAllParagraphResults().Select(pr => pr.ChapterEntry))
                {
                    if (entry?.Invalid == true)
                    {
                        _chapterEntry.AtStartOfParagraph = entry.AtStartOfParagraph;
                        _chapterEntry.Invalid = true;
                        break;
                    }

                    if (entry?.ChapterPointer == null
                        || (_chapterEntry.ChapterPointer != null && entry.ChapterPointer?.Equals(_chapterEntry.ChapterPointer) == false))
                    {
                        _chapterEntry = ChapterEntry.Terminator;
                        break;
                    }

                    if (_chapterEntry.ChapterPointer == null)
                        _chapterEntry.ChapterPointer = entry.ChapterPointer;

                    if (entry.Found)
                    {
                        _chapterEntry.CorrectType = true;
                        if (entry.AtStartOfParagraph)
                            _chapterEntry.AtStartOfParagraph = true;
                    }
                }
            }

            return _chapterEntry;
        }

        private ChapterEntry GetCalculatedChapterEntry()
        {
            ChapterEntry result = null;

            if (ElementType == ElementType.TableCell)
            {
                var hierarchyInfo = (TableHierarchyInfo)ParentHierarchy.ParentHierarchy.HierarchyInfo;
                if (hierarchyInfo.CurrentRow > 0)
                    result = hierarchyInfo.FirstRowParseContexts.TryGetAt(hierarchyInfo.CurrentColumn)?.ChapterEntry;

                if (!(result?.Found).GetValueOrDefault() && !(result?.AtStartOfParagraph).GetValueOrDefault() && hierarchyInfo.CurrentColumn > 0)
                    result = hierarchyInfo.FirstColumnParseContexts.TryGetAt(hierarchyInfo.CurrentRow)?.ChapterEntry;
            }
            else if (ElementType.CanBeLinear() || PreviousSibling?.ElementType.CanBeLinear() == true)
            {
                result = GetPreviousSiblingChapterEntry();
            }

            return result;
        }

        public ChapterEntry GetPreviousSiblingChapterEntry()
        {
            if (PreviousSibling?.ElementType.CanBeLinear() == true)    
            {
                if (PreviousSibling?.ChapterEntry != null 
                    && PreviousSibling.ChapterEntry.AtStartOfParagraph 
                    && (PreviousSibling.ChapterEntry.Invalid || PreviousSibling.ChapterEntry.Found))
                        return PreviousSibling.ChapterEntry;
                
                if (PreviousSibling is IHierarchyElementParseContext)
                    return ((IHierarchyElementParseContext)PreviousSibling)?.GetPreviousSiblingChapterEntry();
            }

            return null;
        }

        public void AddParagraphResult(ParagraphParseResult paragraphResult)
        {
            ParagraphResults.Add(paragraphResult);
        }

        public void ChangeElementType(ElementType elementType)
        {
            ElementType = elementType;
        }
    }
}
