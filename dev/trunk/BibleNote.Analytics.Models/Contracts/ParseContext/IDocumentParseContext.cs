using BibleNote.Analytics.Models.Common;
using BibleNote.Analytics.Models.VerseParsing;
using BibleNote.Analytics.Models.VerseParsing.ParseResult;

namespace BibleNote.Analytics.Models.Contracts.ParseContext
{
    public interface IDocumentParseContext
    {
        ChapterEntry TitleChapter { get; }

        IParagraphParseContext CurrentParagraph { get; }

        IHierarchyParseContext CurrentHierarchy { get; }        
    }   
    
    public interface IDocumentParseContextEditor : IDocumentParseContext
    {
        void Init();

        DocumentParseResult DocumentParseResult { get; }

        IParagraphParseContextEditor CurrentParagraphEditor { get; }

        void SetTitleVerse(ChapterEntry titleChapter);

        DisposeHandler ParseParagraph();

        void EnterHierarchyElement(ElementType paragraphType);

        void ExitHierarchyElement();        
        
        void ClearContext();       
    }
}
