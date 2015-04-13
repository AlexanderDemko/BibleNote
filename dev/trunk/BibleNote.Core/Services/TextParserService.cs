using BibleNote.Core.Common;
using BibleNote.Core.Contracts;
using BibleNote.Core.Helpers;
using BibleNote.Core.Services.System;
using HtmlAgilityPack;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Core.Services
{
    public class TextParserService : ITextParserService
    {

        private IVerseRecognitionService _verseRecognitionService;
        private DocumentParseContext _docParseContext;
        private ParagraphParseResult _result;

        public TextParserService()
        {
            _verseRecognitionService = DIContainer.Resolve<VerseRecognitionService>();
            _result = new ParagraphParseResult();            
        }

        public ParagraphParseResult ParseParagraph(string text, DocumentParseContext docParseContext)
        {
            _docParseContext = docParseContext;            

            var htmlDoc = new HtmlDocument();
            htmlDoc.LoadHtml(text);

            ParseNode(htmlDoc.DocumentNode);             

            return _result;
        }

        private void ParseNode(HtmlNode htmlNode)
        {
            if (htmlNode.NodeType == HtmlNodeType.Text)
            {
                ParseTextNode(htmlNode.InnerText);
            }
            else
            {

                foreach (var childNode in htmlNode.ChildNodes)
                    ParseNode(childNode);
            }
        }

        private void ParseTextNode(string text, int index = 0)
        {
            var verseEntryInfo = _verseRecognitionService.TryGetVerse(text, index);

            while (verseEntryInfo.VersePointerFound)
            {

            }

            if (verseEntryInfo.EndOfTextDetected)
            {

            }
        }
    }
}
