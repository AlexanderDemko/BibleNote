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

        private readonly DocumentParseResult _documentParseResult;

        private IDocumentProviderInfo _documentProvider;     

        public DocumentParseResult DocumentParseResult
        {
            get
            {
                return _documentParseResult;
            }
        }

        public DocumentParser(IParagraphParser paragraphParser, IDocumentParseContextEditor documentParseContext)
        {            
            _paragraphParser = paragraphParser;
            _documentParseContext = documentParseContext;
            _documentParseResult = new DocumentParseResult();
        }

        public void Init(IDocumentProviderInfo documentProvider)
        {
            _documentProvider = documentProvider;            
            _paragraphParser.Init(documentProvider, _documentParseContext);
        }

        public ParagraphParseResult ParseParagraph(HtmlNode node)
        {   
            var result = _paragraphParser.ParseParagraph(node);    
            _documentParseResult.ParagraphParseResults.Add(result);
            
            return result;
        }

        public DisposeHandler ParseHierarchyElement(HtmlNode node, ParagraphState paragraphState)
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
