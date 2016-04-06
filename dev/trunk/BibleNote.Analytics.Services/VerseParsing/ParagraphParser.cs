using BibleNote.Analytics.Models.Common;
using HtmlAgilityPack;
using Microsoft.Practices.Unity;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using BibleNote.Analytics.Core.Extensions;
using BibleNote.Analytics.Contracts.VerseParsing;
using BibleNote.Analytics.Contracts.Providers;

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
        public IStringParser StringParser { get; set; }

        [Dependency]
        public IVerseRecognitionService VerseRecognitionService { get; set; }

        public DocumentParseContext DocParseContext { get; private set; }        

        public IDocumentProvider DocumentProvider { get; private set; }
        
        private ParagraphParseResult _result { get; set; }

        public ParagraphParser(IDocumentProvider documentProvider)
        {   
            DocumentProvider = documentProvider;
        }

        public ParagraphParseResult ParseParagraph(HtmlNode node, DocumentParseContext docParseContext)
        {
            DocParseContext = docParseContext;            
            _result = new ParagraphParseResult();

            ParseNode(node);

            return _result;
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

                    if ((childNode.HasChildNodes() || childNode.Name == "br") && nodes.Count > 0)
                    {
                        ParseTextNodesSingleLevelArray(BuildParseString(nodes));
                        nodes.Clear();
                    }

                    if (childNode.HasChildNodes())
                        ParseNode(childNode);
                }

                if (nodes.Count > 0)
                    ParseTextNodesSingleLevelArray(BuildParseString(nodes));
            }           
        }

        private void ParseTextNodesSingleLevelArray(TextNodesString parseString)
        {
            if (string.IsNullOrEmpty(parseString.Value))
                return;

            var paragraphTextPart = new ParagraphTextPart(parseString.Value);
            _result.TextParts.Add(paragraphTextPart); // todo: сейчас мы всё добавляем. Но в будущем надо перед сохранением будет удалять лишние текстПарты. То есть сохранять только те, в которых есть стихи и около их.

            var index = 0;         // чтобы анализировать с первого символа, так как теперь поддерживаем ещё и такие ссылки, как "5:6 - ..."
            var verseEntry = StringParser.TryGetVerse(parseString.Value, index);
            
            var skipNodes = 0;
            while (verseEntry.VersePointerFound)
            {
                verseEntry.VersePointer = VerseRecognitionService.TryRecognizeVerse(verseEntry, DocParseContext);
                if (verseEntry.VersePointer != null)
                {
                    TextNodeEntry verseNode = null;
                    string verseLink = null;
                    verseNode = FindNodeAndMoveVerseTextInOneNodeIfNotReadonly(parseString, verseEntry, ref skipNodes);

                    if (!DocumentProvider.IsReadonly)
                    {                        
                        verseLink = DocumentProvider.GetVersePointerLink(verseEntry.VersePointer);
                        verseNode.Node.InnerHtml = string.Concat(
                            verseNode.Node.InnerHtml.Substring(0, verseNode.StartIndex),
                            verseLink,
                            verseNode.EndIndex + 1 < verseNode.Node.InnerHtml.Length ? verseNode.Node.InnerHtml.Substring(verseNode.EndIndex + 1) : string.Empty);
                    }

                    paragraphTextPart.VerseEntries.Add(verseEntry);                       
                }

                // А уже, наверное, здесь дополним DocumentParseContex. Или лучше научим DocumentParseContex самому себя наполнять найденными стихами.                

                index = verseEntry.EndIndex + 1;
                if (index < parseString.Value.Length - 2)
                    verseEntry = StringParser.TryGetVerse(parseString.Value, index);
                else 
                    break;
            }
        }

        /// <summary>
        /// 
        /// </summary>
        /// <param name="parseString"></param>
        /// <param name="verseEntryInfo"></param>
        /// <param name="skipNodes">Чтобы не проверять строку с начала</param>
        /// <returns></returns>
        private TextNodeEntry FindNodeAndMoveVerseTextInOneNodeIfNotReadonly(TextNodesString parseString, VerseEntryInfo verseEntryInfo, ref int skipNodes)
        {
            var result = new TextNodeEntry();

            if (parseString.NodesInfo.Count > 1)
            {                
                foreach (var nodeEntry in parseString.NodesInfo.Skip(skipNodes))
                {
                    if (result.Node == null)
                    {
                        if (nodeEntry.StartIndex <= verseEntryInfo.StartIndex && verseEntryInfo.StartIndex <= nodeEntry.EndIndex)
                        {
                            result.Node = nodeEntry.Node;
                            result.StartIndex = verseEntryInfo.StartIndex - nodeEntry.StartIndex;
                            result.EndIndex = (nodeEntry.EndIndex >= verseEntryInfo.EndIndex ? verseEntryInfo.EndIndex : nodeEntry.EndIndex) - nodeEntry.StartIndex;

                            if (DocumentProvider.IsReadonly)
                                break;

                            if (nodeEntry.EndIndex >= verseEntryInfo.EndIndex)                            
                                break;
                        }
                    }
                    else
                    {
                        var moveCharsCount = (verseEntryInfo.EndIndex > nodeEntry.EndIndex ? nodeEntry.EndIndex : verseEntryInfo.EndIndex) - nodeEntry.StartIndex + 1;
                        var verseTextPart = nodeEntry.Node.InnerText.Substring(0, moveCharsCount);
                        result.EndIndex += moveCharsCount;
                        nodeEntry.StartIndex += moveCharsCount;     // здесь может быть ситуация, когда Startindex > EndIndex. Когда нода была из одного символа. Похоже, что это нормально. Так как мы больше нигде не используем эти ноды.

#if DEBUG
                        if (result.Node.InnerHtml != result.Node.InnerText)
                            throw new InvalidOperationException("firstVerseNode.InnerHtml != firstVerseNode.InnerText");

                        if (nodeEntry.Node.InnerHtml != nodeEntry.Node.InnerText)
                            throw new InvalidOperationException("nodeEntry.Node.InnerHtml != nodeEntry.Node.InnerText");
#endif

                        result.Node.InnerHtml += verseTextPart;
                        nodeEntry.Node.InnerHtml = nodeEntry.Node.InnerHtml.Remove(0, moveCharsCount);                        

                        if (verseEntryInfo.EndIndex < nodeEntry.EndIndex)
                            break;
                    }
                    skipNodes++;
                }
            }
            else
            {
                result.Node = parseString.NodesInfo.First().Node;
                result.StartIndex = verseEntryInfo.StartIndex;
                result.EndIndex = verseEntryInfo.EndIndex;
            }

            return result;
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
                                            EndIndex = sb.Length + textNode.InnerText.Length - 1
                                        });
                sb.Append(textNode.InnerText);
            }

            result.Value = sb.ToString();
            return result;
        }        
    }
}