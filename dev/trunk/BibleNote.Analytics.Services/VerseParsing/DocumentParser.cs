using BibleNote.Analytics.Contracts.VerseParsing;
using System;
using HtmlAgilityPack;
using BibleNote.Analytics.Contracts.Providers;
using BibleNote.Analytics.Models.VerseParsing;

namespace BibleNote.Analytics.Services.VerseParsing
{
    public class DocumentParser : IDocumentParser
    {
        private readonly IParagraphParser _paragraphParser;

        private readonly IDocumentParseContext _documentParseContext;

        private readonly DocumentParseResult _documentParseResult;

        private IDocumentProvider _documentProvider;

        public DocumentParseResult DocumentParseResult
        {
            get
            {
                return _documentParseResult;
            }
        }

        public DocumentParser(IParagraphParser paragraphParser, IDocumentParseContext documentParseContext)
        {            
            _paragraphParser = paragraphParser;
            _documentParseContext = documentParseContext;
            _documentParseResult = new DocumentParseResult();
        }

        public void Init(IDocumentProvider documentProvider)
        {
            _documentProvider = documentProvider;            
            _paragraphParser.Init(documentProvider, _documentParseContext);
        }

        public void ParseTitle(HtmlNode node)
        {
            _documentParseResult.ParagraphParseResults.Add(
                _paragraphParser.ParseParagraph(
                    node, 
                    new ParagraphContext() { ParagraphState = ParagraphState.Title, ParagraphPosition = node.LinePosition }));

            // только если указана одна глава - тогда _documentParseContext.SetTitleVerse();
        }

        public IElementParseContext ParseParagraph(HtmlNode node)
        {
            _documentParseResult.ParagraphParseResults.Add(
                _paragraphParser.ParseParagraph(
                    node,
                    new ParagraphContext() { ParagraphState = ParagraphState.SimpleText, ParagraphPosition = node.LinePosition }));
            return null;
        }

        public IElementParseContext ParseTable(HtmlNode node)
        {
            throw new NotImplementedException();
        }      

        public IElementParseContext ParseList(HtmlNode node)
        {
            throw new NotImplementedException();
        }

        public IElementParseContext ParseListElement(HtmlNode node)
        {
            throw new NotImplementedException();
        }

        public void Dispose()
        {

        }
    }
}
