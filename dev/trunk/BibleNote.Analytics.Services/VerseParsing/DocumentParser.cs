﻿using BibleNote.Analytics.Contracts.VerseParsing;
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

        private DocumentParseContext _documentParseContext;

        public DocumentParser()
        {
            _documentParseContext = new DocumentParseContext();
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

        public IParseContext ParseParagraph(HtmlNode node)
        {
            _paragraphParser.ParseParagraph(node);
            return null;
        }

        public IParseContext ParseTable(HtmlNode node)
        {
            throw new NotImplementedException();
        }

        public void Dispose()
        {
            
        }
    }
}
