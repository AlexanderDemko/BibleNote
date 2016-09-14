using BibleNote.Analytics.Contracts.VerseParsing;
using System;
using HtmlAgilityPack;
using BibleNote.Analytics.Contracts.Providers;
using BibleNote.Analytics.Models.VerseParsing;
using System.Linq;
using BibleNote.Analytics.Models.Verse;
using BibleNote.Analytics.Models.Common;
using BibleNote.Analytics.Models.Contracts.ParseContext;

namespace BibleNote.Analytics.Services.VerseParsing
{
    public class DocumentParser : IDocumentParser
    {       
        private readonly IParagraphParser _paragraphParser;

        private readonly IDocumentParseContextEditor _docParseContext;        

        private IDocumentProviderInfo _documentProvider;

        public DocumentParseResult DocumentParseResult { get; private set; }

        public DocumentParser(IParagraphParser paragraphParser, IDocumentParseContextEditor docParseContext)
        {            
            _paragraphParser = paragraphParser;
            _docParseContext = docParseContext;
            DocumentParseResult = new DocumentParseResult();
        }

        public void Init(IDocumentProviderInfo documentProvider)
        {
            _documentProvider = documentProvider;            
            _paragraphParser.Init(documentProvider, _docParseContext);

            _docParseContext.EnterHierarchyElement(ElementType.Root);
        }

        public ParagraphParseResult ParseParagraph(HtmlNode node)
        {   
            using (_docParseContext.ParseParagraph())
            {
                var result = _paragraphParser.ParseParagraph(node);

                if (result.IsValuable)
                    DocumentParseResult.ParagraphParseResults.Add(result);

                return result;
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
