using BibleNote.Analytics.Models.Verse;
using BibleNote.Analytics.Models.VerseParsing;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Models.Contracts.ParseContext
{
    

    public interface IHierarchyElementParseContext : IElementParseContext
    {
        IHierarchyInfo HierarchyInfo { get; set; }        

        List<ParagraphParseResult> ParagraphResults { get; }

        IHierarchyElementParseContext ParentHierarchy { get; }        

        bool Parsed { get; set; }

        void AddParagraphResult(ParagraphParseResult paragraphResult);

        void ChangeElementType(ElementType elementType);

        ChapterEntry GetPreviousSiblingChapterEntry();
    }
}
