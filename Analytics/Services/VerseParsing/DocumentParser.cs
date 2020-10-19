using BibleNote.Analytics.Services.DocumentProvider.Contracts;
using BibleNote.Analytics.Services.VerseParsing.Contracts;
using BibleNote.Analytics.Services.VerseParsing.Contracts.ParseContext;
using BibleNote.Analytics.Services.VerseParsing.Models;
using BibleNote.Analytics.Services.VerseParsing.Models.ParseResult;

namespace BibleNote.Analytics.Services.VerseParsing
{
    class DocumentParser : IDocumentParser
    {       
        private readonly IParagraphParser paragraphParser;
        private readonly IDocumentParseContextEditor docParseContext;        

        public DocumentParseResult DocumentParseResult { get { return docParseContext.DocumentParseResult; } }     

        public DocumentParser(
            IParagraphParser paragraphParser, 
            IDocumentParseContextEditor docParseContext)
        {            
            this.paragraphParser = paragraphParser;
            this.docParseContext = docParseContext;            
        }

        public void Init(IDocumentProviderInfo documentProvider, IDocumentId documentId)
        {            
            paragraphParser.Init(documentProvider, docParseContext);

            docParseContext.Init(documentId);
            docParseContext.EnterHierarchyElement(ElementType.Root);
        }

        public ParagraphParseResult ParseParagraph(IXmlNode node)
        {   
            using (docParseContext.ParseParagraph())
            {
                return paragraphParser.ParseParagraph(node, docParseContext.CurrentParagraphEditor);                
            }
        }

        public DisposeHandler ParseHierarchyElement(ElementType paragraphType)
        {
            docParseContext.EnterHierarchyElement(paragraphType);            

            return new DisposeHandler(() => docParseContext.ExitHierarchyElement());
        }

        public void Dispose()
        {
            docParseContext.ExitHierarchyElement();
            docParseContext.ClearContext();
        }
    }
}
