using BibleNote.Analytics.Contracts;
using BibleNote.Analytics.Models.Common;
using HtmlAgilityPack;
using Microsoft.Practices.Unity;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using BibleNote.Analytics.Core.Extensions;

namespace BibleNote.Analytics.Services.VerseParsing
{
    public class TextNodeEntry
    {
        public HtmlNode Node { get; set; }
        public int StartIndex { get; set; }
        public int EndIndex { get; set; }
    }

    public class TextNodesString
    {
        public string Value { get; set; }
        public List<TextNodeEntry> NodesInfo { get; set; }

        public TextNodesString()
        {
            NodesInfo = new List<TextNodeEntry>();
        }        
    }

    public class ParagraphParserService : IParagraphParserService
    {
        [Dependency]
        public IVerseRecognitionService VerseRecognitionService { get; set; }

        private DocumentParseContext _docParseContext;
        private ParagraphParseResult _result;

        public ParagraphParserService()
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
            if (!htmlNode.IsHierarchyNode())
                ParseTextNodesSingleLevelArray(BuildParseString(htmlNode.ChildNodes));
            else
            {
                var nodes = new HtmlNodeCollection(null);

                foreach (var childNode in htmlNode.ChildNodes)
                {
                    if (htmlNode.IsTextNode())
                        nodes.Add(childNode);
                    else
                    {
                        if (nodes.Count > 0)
                        {
                            ParseTextNodesSingleLevelArray(BuildParseString(nodes));
                            nodes = null;
                            nodes = new HtmlNodeCollection(null);
                        }
                        ParseNode(childNode);
                    }
                }
            }           
        }

        private void ParseTextNodesSingleLevelArray(TextNodesString parseString)
        {
            if (parseString.Value.Length == 0)
                return;

            var index = 0;
            var verseEntryInfo = VerseRecognitionService.TryGetVerse(parseString.Value, index);

            while (verseEntryInfo.VersePointerFound)
            {
                // todo: если нашли - надо проверить, не находится ли стих в нескольких HtmlNode. Если так - то надо перенести весь стих в первый HtmlNode.
                // а потом - проверить (спросить у провайдера), можно ли преобразовать в ссылку. И если да - то преобразовать (сама ссылка своя, но итоговый её вариант должен дать провайдер).

                index = verseEntryInfo.EndIndex + 1;
                if (index < parseString.Value.Length - 2)
                    verseEntryInfo = VerseRecognitionService.TryGetVerse(parseString.Value, index);
                else 
                    break;
            }
        }

        private TextNodesString BuildParseString(HtmlNodeCollection nodes)
        {
            var result = new TextNodesString();
            var sb = new StringBuilder();

            foreach (var node in nodes)
            {
                var nodeText = node.GetTextNodeInnerText(); 
                
                result.NodesInfo.Add(new TextNodeEntry() 
                                        { 
                                            Node = node, 
                                            StartIndex = sb.Length, 
                                            EndIndex = sb.Length + nodeText.Length 
                                        });
                sb.Append(nodeText);
            }

            return result;
        }        
    }
}
