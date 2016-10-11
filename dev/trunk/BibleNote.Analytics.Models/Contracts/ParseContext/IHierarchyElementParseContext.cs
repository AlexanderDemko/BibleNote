using BibleNote.Analytics.Models.VerseParsing;
using BibleNote.Analytics.Models.VerseParsing.ParseResult;
using System.Collections.Generic;

namespace BibleNote.Analytics.Models.Contracts.ParseContext
{
    public interface IHierarchyElementParseContext : IElementParseContext
    {
        IHierarchyInfo HierarchyInfo { get; set; }        

        List<ParagraphParseResult> ParagraphResults { get; }

        /// <summary>
        /// Include nested
        /// </summary>
        /// <returns></returns>
        IEnumerable<ParagraphParseResult> GetAllParagraphResults();      

        List<IHierarchyElementParseContext> ChildHierarchies { get; }

        IHierarchyElementParseContext ParentHierarchy { get; }        

        bool Parsed { get; set; }

        void AddParagraphResult(ParagraphParseResult paragraphResult);

        void ChangeElementType(ElementType elementType);

        ChapterEntry GetPreviousSiblingChapterEntry();
    }
}
