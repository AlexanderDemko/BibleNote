using BibleNote.Analytics.Contracts.VerseParsing;
using System;
using HtmlAgilityPack;
using BibleNote.Analytics.Contracts.Providers;
using BibleNote.Analytics.Models.VerseParsing;
using System.Linq;
using BibleNote.Analytics.Models.Verse;

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

        public ParagraphParseResult ParseParagraph(HtmlNode node)
        {   
            _documentParseContext.SetCurrentParagraph(new ParagraphContext(ParagraphState.Simple, _documentParseContext.CurrentParagraph));
            var result = _paragraphParser.ParseParagraph(node);    
            
            if (_documentParseContext.CurrentParagraph.ParentParagraph?.ParagraphState == ParagraphState.Title)
            {
                if (result.VerseEntries.Count == 1)
                {
                    var titleVerse = result.VerseEntries.First().VersePointer;
                    if (titleVerse.IsMultiVerse <= MultiVerse.OneChapter)
                        _documentParseContext.SetTitleVerse(titleVerse);
                };
            }
                     
            _documentParseResult.ParagraphParseResults.Add(result);
            
            return result;
        }

        public IElementParseHandle ParseHierarchyElement(HtmlNode node, ParagraphState paragraphState)
        {
            _documentParseContext.EnterElement(paragraphState);            

            return new ElementParseHandle(_documentParseContext);
        }

        public void Dispose()
        {

        }
    }
}
