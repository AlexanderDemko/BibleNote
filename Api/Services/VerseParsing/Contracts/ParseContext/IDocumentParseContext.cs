using BibleNote.Services.Contracts;
using BibleNote.Services.VerseParsing.Models;
using BibleNote.Services.VerseParsing.Models.ParseResult;
using BibleNote.Services.ModulesManager.Scheme.Module;

namespace BibleNote.Services.VerseParsing.Contracts.ParseContext
{
    public interface IDocumentParseContext
    {
        IDocumentId DocumentId { get; }

        ChapterEntry TitleChapter { get; }

        BibleBookInfo DefaultBook { get; }

        string DefaultBookModuleName { get; }

        IParagraphParseContext CurrentParagraph { get; }

        IHierarchyParseContext CurrentHierarchy { get; }        
    }   
    
    public interface IDocumentParseContextEditor : IDocumentParseContext
    {
        void Init(IDocumentId documentId);

        DocumentParseResult DocumentParseResult { get; }

        IParagraphParseContextEditor CurrentParagraphEditor { get; }

        void SetTitleVerse(ChapterEntry titleChapter);

        void SetDefaultBook(BibleBookInfo book, string moduleName);

        DisposeHandler ParseParagraph();

        void EnterHierarchyElement(ElementType paragraphType);

        void ExitHierarchyElement();        
        
        void ClearContext();       
    }
}
