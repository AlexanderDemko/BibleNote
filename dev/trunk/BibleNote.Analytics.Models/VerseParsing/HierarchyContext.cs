using BibleNote.Analytics.Core.Extensions;
using BibleNote.Analytics.Models.Verse;
using System.Collections.Generic;
using System.Linq;

namespace BibleNote.Analytics.Models.VerseParsing
{
    public enum ParagraphState
    {
        ListElement,
        Simple,
        Title,
        Table,
        TableRow,
        TableCell,
        List
    }

    public class HierarchyContext
    {
        public ParagraphState ParagraphState { get; set; }

        public IHierarchyInfo HierarchyInfo { get; set; }

        public ChapterPointer ChapterPointer { get; private set; }

        public List<ParagraphParseResult> ParseResults { get; private set; }

        public HierarchyContext ParentHierarchy { get; private set; }

        public void TrySetChapterPointerFromParseResults()
        {
            if (ParseResults.Any(r => r.VerseEntries.Any(v => v.VersePointer.IsMultiVerse > MultiVerse.OneChapter)))
                return;

            VersePointer chapterVp = null;
            foreach (var vp in ParseResults.SelectMany(r => r.VerseEntries.Select(v => v.VersePointer)))
            {
                if (chapterVp == null)
                {
                    chapterVp = vp;
                }
                else if (vp.BookIndex != chapterVp.BookIndex || vp.Chapter != chapterVp.Chapter)
                {
                    chapterVp = null;
                    break;
                }
            }

            if (chapterVp != null)
                ChapterPointer = chapterVp.ToChapterPointer();
        }

        public ChapterPointer GetHierarchyChapterPointer()
        {
            if (ChapterPointer == null)
            {
                if (ParagraphState == ParagraphState.TableCell)
                {
                    var hierarchyInfo = (TableHierarchyInfo)ParentHierarchy.ParentHierarchy.HierarchyInfo;
                    if (hierarchyInfo.CurrentRow > 0)
                        ChapterPointer = hierarchyInfo.FirstRowChapters.TryGetAt(hierarchyInfo.CurrentColumn);

                    if (ChapterPointer == null && hierarchyInfo.CurrentColumn > 0)
                        ChapterPointer = hierarchyInfo.FirstColumnChapters.TryGetAt(hierarchyInfo.CurrentRow);
                }
            }

            return ChapterPointer ?? ParentHierarchy?.GetHierarchyChapterPointer();
        }

        public HierarchyContext(ParagraphState paragraphState, HierarchyContext parentHierarchy)
        {
            ParagraphState = paragraphState;            
            ParentHierarchy = parentHierarchy;

            ParseResults = new List<ParagraphParseResult>();
        }
    }
}
