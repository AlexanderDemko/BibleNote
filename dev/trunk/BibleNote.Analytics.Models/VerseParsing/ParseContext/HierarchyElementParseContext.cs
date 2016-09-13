using BibleNote.Analytics.Core.Extensions;
using BibleNote.Analytics.Models.Verse;
using System.Collections.Generic;
using System.Linq;
using BibleNote.Analytics.Models.Contracts.ParseContext;
using BibleNote.Analytics.Models.Contracts;

namespace BibleNote.Analytics.Models.VerseParsing.ParseContext
{
    public class HierarchyElementParseContext : IHierarchyElementParseContext
    {
        public ParagraphType ParagraphType { get; set; }

        public IHierarchyInfo HierarchyInfo { get; set; }        

        public List<ParagraphParseResult> ParagraphResults { get; private set; }

        public IHierarchyElementParseContext ParentHierarchy { get; private set; }

        public IHierarchyElementParseContext PreviousSibling { get; set; }

        public bool Parsed { get; set; }

        private bool _chapterEntryWasSearched;
        private ChapterEntry _chapterEntry;
        public ChapterEntry ChapterEntry
        {
            get
            {
                if (!Parsed)
                    return null;

                if (!_chapterEntryWasSearched)
                {
                    _chapterEntryWasSearched = true;

                    ChapterPointer singleCp = null;                    
                    var atStartOfParagraph = false;
                    foreach (var chapterEntry in ParagraphResults.Select(pc => pc.ChapterEntry))
                    {
                        if (singleCp != null
                            && (chapterEntry.ChapterPointer.BookIndex != singleCp.BookIndex || chapterEntry.ChapterPointer.Chapter != singleCp.Chapter))
                        {
                            singleCp = null;
                            break;
                        }

                        if (singleCp == null)
                            singleCp = chapterEntry.ChapterPointer;                        

                        if (chapterEntry.AtStartOfParagraph)
                            atStartOfParagraph = true;
                    }

                    if (singleCp != null)
                        _chapterEntry = new ChapterEntry(singleCp) { AtStartOfParagraph = atStartOfParagraph };
                }

                return _chapterEntry;
            }
        }
        public HierarchyElementParseContext(ParagraphType paragraphState, IHierarchyElementParseContext parentHierarchy)
        {
            ParagraphType = paragraphState;
            ParentHierarchy = parentHierarchy;

            ParagraphResults = new List<ParagraphParseResult>();
        }        
        
        public ChapterEntry GetHierarchyChapter()
        {   
            return ChapterEntry ?? CalculateChapterEntry() ?? ParentHierarchy?.GetHierarchyChapter();
        }

        private ChapterEntry CalculateChapterEntry()
        {
            ChapterEntry result = null;

            if (ParagraphType == ParagraphType.TableCell)
            {
                var hierarchyInfo = (TableHierarchyInfo)ParentHierarchy.ParentHierarchy.HierarchyInfo;
                if (hierarchyInfo.CurrentRow > 0)
                    result = hierarchyInfo.FirstRowParseContexts.TryGetAt(hierarchyInfo.CurrentColumn)?.ChapterEntry;

                if (result == null && hierarchyInfo.CurrentColumn > 0)
                    result = hierarchyInfo.FirstColumnParseContexts.TryGetAt(hierarchyInfo.CurrentRow)?.ChapterEntry;
            }

            return result;
        }

        public void AddParagraphResult(ParagraphParseResult paragraphResult)
        {
            ParagraphResults.Add(paragraphResult);
        }
    }
}
