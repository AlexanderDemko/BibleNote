using BibleNote.Analytics.Contracts.VerseParsing;
using BibleNote.Analytics.Contracts.Providers;
using BibleNote.Analytics.Models.Common;
using BibleNote.Analytics.Models.Contracts.ParseContext;
using BibleNote.Analytics.Core.Contracts;
using BibleNote.Analytics.Models.VerseParsing.ParseResult;

namespace BibleNote.Analytics.Services.VerseParsing
{
    public class DocumentParser : IDocumentParser
    {       
        private readonly IParagraphParser _paragraphParser;

        private readonly IDocumentParseContextEditor _docParseContext;        

        private IDocumentProviderInfo _documentProvider;

        public DocumentParseResult DocumentParseResult { get { return _docParseContext.DocumentParseResult; } }

        public DocumentParser(IParagraphParser paragraphParser, IDocumentParseContextEditor docParseContext)
        {            
            _paragraphParser = paragraphParser;
            _docParseContext = docParseContext;            
        }

        public void Init(IDocumentProviderInfo documentProvider)
        {
            _documentProvider = documentProvider;            
            _paragraphParser.Init(documentProvider, _docParseContext);

            _docParseContext.Init();
            _docParseContext.EnterHierarchyElement(ElementType.Root);
        }

        public ParagraphParseResult ParseParagraph(IXmlNode node)
        {   
            using (_docParseContext.ParseParagraph())
            {
                return _paragraphParser.ParseParagraph(node, _docParseContext.CurrentParagraphEditor);                
            }
        }

        public DisposeHandler ParseHierarchyElement(ElementType paragraphType)
        {
            _docParseContext.EnterHierarchyElement(paragraphType);            

            return new DisposeHandler(() => _docParseContext.ExitHierarchyElement());
        }

        public void Dispose()
        {
            _docParseContext.ExitHierarchyElement();
            _docParseContext.ClearContext();
        }
    }
}
