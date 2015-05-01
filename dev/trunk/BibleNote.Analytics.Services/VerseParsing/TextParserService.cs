using BibleNote.Analytics.Contracts;
using BibleNote.Analytics.Models.Common;
using HtmlAgilityPack;
using Microsoft.Practices.Unity;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Services.VerseParsing
{
    public class TextParserService : ITextParserService
    {
        [Dependency]
        public IVerseRecognitionService VerseRecognitionService { get; set; }

        private DocumentParseContext _docParseContext;
        private ParagraphParseResult _result;

        public TextParserService()
        {   
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
            var verseEntryInfo = VerseRecognitionService.TryGetVerse(text, index);

            while (verseEntryInfo.VersePointerFound)
            {

            }

            if (verseEntryInfo.EndOfTextDetected)
            {

            }
        }
    }
}
