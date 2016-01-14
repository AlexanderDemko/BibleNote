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

    public class ParagraphParser : IParagraphParser
    {
        [Dependency]
        public IVerseRecognitionService VerseRecognitionService { get; set; }

        private DocumentParseContext _docParseContext;
        private ParagraphParseResult _result;

        public ParagraphParser()
        {   
            _result = new ParagraphParseResult();            
        }

        public ParagraphParseResult ParseParagraph(HtmlNode node, DocumentParseContext docParseContext)
        {
            _docParseContext = docParseContext;            

            ParseNode(node);

            return _result;
        }

        public ParagraphParseResult ParseParagraph(string text, DocumentParseContext docParseContext)
        {
            var htmlDoc = new HtmlDocument();
            htmlDoc.LoadHtml(text);

            return ParseParagraph(htmlDoc.DocumentNode, docParseContext);
        }

        private void ParseNode(HtmlNode htmlNode)
        {   
            if (!htmlNode.IsHierarchyNode())
            {
                ParseTextNodesSingleLevelArray(BuildParseString(htmlNode.ChildNodes));
            }
            else
            {
                var nodes = new List<HtmlNode>();

                foreach (var childNode in htmlNode.ChildNodes)
                {
                    if (childNode.IsTextNode())
                    {
                        nodes.Add(childNode);
                        continue;
                    }

                    if (childNode.HasChildNodes())
                    {
                        if (nodes.Count > 0)
                        {                            
                            ParseTextNodesSingleLevelArray(BuildParseString(nodes));
                            nodes.Clear();                            
                        }
                        ParseNode(childNode);
                    }

                    // иначе - это пустая нода, типа <br/>
                }

                if (nodes.Count > 0)
                    ParseTextNodesSingleLevelArray(BuildParseString(nodes));
            }           
        }

        private void ParseTextNodesSingleLevelArray(TextNodesString parseString)
        {
            if (parseString.Value.Length == 0)
                return;

            var index = 0;
            var verseEntryInfo = VerseRecognitionService.TryGetVerse(parseString.Value, index);

            var skipNodes = 0;
            while (verseEntryInfo.VersePointerFound)
            {
                skipNodes = MoveVerseTextInOneNode(parseString, verseEntryInfo, skipNodes);  

                // а потом - проверить (спросить у провайдера), можно ли преобразовать в ссылку. И если да - то преобразовать (сама ссылка своя, но итоговый её вариант должен дать провайдер).

                index = verseEntryInfo.EndIndex + 1;
                if (index < parseString.Value.Length - 2)
                    verseEntryInfo = VerseRecognitionService.TryGetVerse(parseString.Value, index);
                else 
                    break;
            }
        }

        private int MoveVerseTextInOneNode(TextNodesString parseString, VerseEntryInfo verseEntryInfo, int skipNodes)
        {
            if (parseString.NodesInfo.Count > 1)
            {
                HtmlNode firstVerseNode = null;
                foreach (var nodeEntry in parseString.NodesInfo.Skip(skipNodes))
                {
                    if (firstVerseNode == null)
                    {
                        if (nodeEntry.StartIndex >= verseEntryInfo.StartIndex)
                        {
                            if (nodeEntry.EndIndex >= verseEntryInfo.EndIndex)
                                break;

                            firstVerseNode = nodeEntry.Node;
                        }
                    }
                    else
                    {
                        var verseTextPart = nodeEntry.Node.InnerText.Substring(0,
                            (verseEntryInfo.EndIndex > nodeEntry.EndIndex ? nodeEntry.EndIndex : verseEntryInfo.EndIndex) - nodeEntry.StartIndex);
                        firstVerseNode.InnerHtml += verseTextPart;

                        if (verseEntryInfo.EndIndex < nodeEntry.EndIndex)
                            break;
                    }
                    skipNodes++;
                }
            }

            return skipNodes;
        }

        private TextNodesString BuildParseString(IEnumerable<HtmlNode> nodes)
        {
            var result = new TextNodesString();
            var sb = new StringBuilder();

            foreach (var node in nodes)
            {
                var textNode = node.GetTextNode();
                if (string.IsNullOrEmpty(textNode.InnerText))
                    continue;                
                
                result.NodesInfo.Add(new TextNodeEntry() 
                                        { 
                                            Node = textNode, 
                                            StartIndex = sb.Length, 
                                            EndIndex = sb.Length + textNode.InnerText.Length 
                                        });
                sb.Append(textNode.InnerText);
            }

            result.Value = sb.ToString();
            return result;
        }        
    }
}
