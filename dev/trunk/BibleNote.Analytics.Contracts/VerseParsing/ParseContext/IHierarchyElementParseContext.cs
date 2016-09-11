using BibleNote.Analytics.Models.Verse;
using BibleNote.Analytics.Models.VerseParsing;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Contracts.VerseParsing.ParseContext
{
    public enum ParagraphState
    {
        ListElement,
        Inline,
        Block,
        Title,
        Table,
        TableRow,
        TableCell,
        List
    }

    public interface IHierarchyElementParseContext
    {
        ParagraphState ParagraphState { get; set; }

        IHierarchyInfo HierarchyInfo { get; set; }

        ChapterPointer ChapterPointer { get; }

        List<ParagraphParseResult> ParseResults { get; }

        IHierarchyElementParseContext ParentHierarchy { get; }

        void TrySetChapterPointerFromParseResults();

        ChapterPointer GetHierarchyChapterPointer();
    }
}
