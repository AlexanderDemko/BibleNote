using BibleNote.Analytics.Models.Common;
using BibleNote.Analytics.Models.Verse;
using BibleNote.Analytics.Models.VerseParsing;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Models.Contracts.ParseContext
{
    public interface IDocumentParseContext
    {
        ChapterEntry TitleChapter { get; }

        IParagraphParseContext CurrentParagraph { get; }

        IHierarchyElementParseContext CurrentHierarchy { get; }        
    }   
    
    public interface IDocumentParseContextEditor : IDocumentParseContext
    {
        void SetTitleVerse(ChapterEntry titleChapter);

        DisposeHandler ParseParagraph();

        void EnterHierarchyElement(ElementType paragraphType);

        void ExitHierarchyElement();        
        
        void ClearContext();       
    }
}
