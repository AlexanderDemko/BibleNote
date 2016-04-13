using BibleNote.Analytics.Contracts.VerseParsing;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using HtmlAgilityPack;
using BibleNote.Analytics.Models.Common;
using Microsoft.Practices.Unity;
using BibleNote.Analytics.Services.Unity;
using BibleNote.Analytics.Contracts.Providers;

namespace BibleNote.Analytics.Services.VerseParsing
{
    public class DocumentParser : IDocumentParser
    {
        private IParagraphParser _paragraphParser;

        private IDocumentProvider _documentProvider;

        private IDocumentParseContext _documentParseContext;

        public DocumentParser()
        {
            _documentParseContext = DIContainer.Resolve<IDocumentParseContext>();
            _paragraphParser = DIContainer.Resolve<IParagraphParser>();
        }

        public void Init(IDocumentProvider documentProvider)
        {
            _documentProvider = documentProvider;            
            _paragraphParser.Init(documentProvider, _documentParseContext);
        }

        public void ParseTitle(HtmlNode node)
        {
            _paragraphParser.ParseParagraph(node);
        }

        public IElementParseContext ParseParagraph(HtmlNode node)
        {
            _paragraphParser.ParseParagraph(node);
            return null;
        }

        public IElementParseContext ParseTable(HtmlNode node)
        {
            throw new NotImplementedException();
        }

        public void Dispose()
        {
            
        }
    }
}
