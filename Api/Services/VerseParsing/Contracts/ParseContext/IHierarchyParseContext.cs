using System.Collections.Generic;
using BibleNote.Services.VerseParsing.Models;
using BibleNote.Services.VerseParsing.Models.ParseResult;

namespace BibleNote.Services.VerseParsing.Contracts.ParseContext
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
