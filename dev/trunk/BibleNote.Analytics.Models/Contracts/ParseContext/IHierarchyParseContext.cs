using BibleNote.Analytics.Models.VerseParsing;
using BibleNote.Analytics.Models.VerseParsing.ParseResult;
using System.Collections.Generic;

namespace BibleNote.Analytics.Models.Contracts.ParseContext
{
    public interface IHierarchyParseContext : IElementParseContext
    {
        IHierarchyInfo HierarchyInfo { get; set; }

        HierarchyParseResult ParseResult { get; }

        List<IHierarchyParseContext> ChildHierarchies { get; }

        IHierarchyParseContext ParentHierarchy { get; }        

        bool Parsed { get; set; }

        void AddParagraphResult(ParagraphParseResult paragraphResult);

        void AddHierarchyResult(HierarchyParseResult hierarchyResult);

        void ChangeElementType(ElementType elementType);

        ChapterEntry GetPreviousSiblingChapterEntry();
    }
}
