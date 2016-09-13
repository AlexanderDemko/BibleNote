using BibleNote.Analytics.Models.Verse;
using BibleNote.Analytics.Models.VerseParsing;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Models.Contracts.ParseContext
{
    public enum ParagraphType
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
        ParagraphType ParagraphType { get; set; }

        IHierarchyInfo HierarchyInfo { get; set; }

        ChapterEntry ChapterEntry { get; }

        List<ParagraphParseResult> ParagraphResults { get; }

        IHierarchyElementParseContext ParentHierarchy { get; }

        IHierarchyElementParseContext PreviousSibling { get; set; }

        bool Parsed { get; set; }

        void AddParagraphResult(ParagraphParseResult paragraphResult);

        ChapterEntry GetHierarchyChapter();
    }
}
