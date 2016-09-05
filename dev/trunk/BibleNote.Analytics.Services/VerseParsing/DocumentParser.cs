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
            _documentParseResult.ParagraphParseResults.Add(_paragraphParser.ParseParagraph(node));

            // только если указана одна глава - тогда _documentParseContext.SetTitleVerse();
        }

        public IElementParseContext ParseParagraph(HtmlNode node)
        {
            _documentParseResult.ParagraphParseResults.Add(_paragraphParser.ParseParagraph(node));
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
