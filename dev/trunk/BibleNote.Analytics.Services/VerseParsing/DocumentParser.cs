using BibleNote.Analytics.Contracts.VerseParsing;
using System;
using HtmlAgilityPack;
using BibleNote.Analytics.Contracts.Providers;
using BibleNote.Analytics.Models.VerseParsing;
using System.Linq;
using BibleNote.Analytics.Models.Verse;
using BibleNote.Analytics.Models.Common;

namespace BibleNote.Analytics.Services.VerseParsing
{
    public class DocumentParser : IDocumentParser
    {       
        private readonly IParagraphParser _paragraphParser;

        private readonly IDocumentParseContextEditor _documentParseContext;        

        private IDocumentProviderInfo _documentProvider;

        public DocumentParseResult DocumentParseResult { get; private set; }

        public DocumentParser(IParagraphParser paragraphParser, IDocumentParseContextEditor documentParseContext)
        {            
            _paragraphParser = paragraphParser;
            _documentParseContext = documentParseContext;
            DocumentParseResult = new DocumentParseResult();
        }

        public void Init(IDocumentProviderInfo documentProvider)
        {
            _documentProvider = documentProvider;            
            _paragraphParser.Init(documentProvider, _documentParseContext);
        }

        public ParagraphParseResult ParseParagraph(HtmlNode node)
        {
            _documentParseContext.StartParseParagraph();

            var result = _paragraphParser.ParseParagraph(node);

            if (result.IsValuable)
                DocumentParseResult.ParagraphParseResults.Add(result);

            _documentParseContext.EndParseParagraph(result);

            return result;
        }

        public DisposeHandler ParseHierarchyElement(ParagraphState paragraphState)
        {
            _documentParseContext.EnterHierarchyElement(paragraphState);            

            return new DisposeHandler(() => _documentParseContext.ExitHierarchyElement());
        }

        public void Dispose()
        {
            _documentParseContext.ClearContext();
        }
    }
}
