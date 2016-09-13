using BibleNote.Analytics.Contracts.Providers;
using BibleNote.Analytics.Contracts.VerseParsing;
using HtmlAgilityPack;
using System.Collections.Generic;
using System.Linq;
using BibleNote.Analytics.Core.Extensions;
using BibleNote.Analytics.Models.Verse;
using BibleNote.Analytics.Models.VerseParsing;
using BibleNote.Analytics.Core.Constants;
using BibleNote.Analytics.Models.Contracts.ParseContext;

namespace BibleNote.Analytics.Providers.HtmlProvider
{
    public class HtmlProvider : IDocumentProvider
    {
        private readonly IDocumentParserFactory _documentParserFactory;

        private readonly IHtmlDocumentConnector _htmlDocumentConnector;

        public bool IsReadonly      // наверное, этот параметр надо вынести выше - на уровень NavigationProviderInstance
        {
            get { return false; }  // а почему вообще localHtmlProvider должен отличаться от webHtmlProvider? Локальные html файлы лучше тоже не менять, а преобразовывать при отображении только.
        }

        public string GetVersePointerLink(VersePointer versePointer)
        {
            return string.Format($"<a href='bnVerse:{versePointer}'>{versePointer.GetOriginalVerseString()}</a>");
        }

        public HtmlProvider(IDocumentParserFactory documentParserFactory, IHtmlDocumentConnector htmlDocumentReader)
        {
            _documentParserFactory = documentParserFactory;
            _htmlDocumentConnector = htmlDocumentReader;
        }

        public DocumentParseResult ParseDocument(IDocumentId documentId)
        {
            DocumentParseResult result;
            using (var docHandler = _htmlDocumentConnector.Connect(documentId))
            {
                using (var docParser = _documentParserFactory.Create(this))
                {
                    ParseNode(docParser, docHandler.HtmlDocument.DocumentNode);
                    result = docParser.DocumentParseResult;
                }

                if (result.ParagraphParseResults.Any(pr => pr.IsValuable))
                    docHandler.SetDocumentChanged();
            }

            return result;
        }

        private void ParseNode(IDocumentParser docParser, HtmlNode node)
        {
            if (!node.IsHierarchyNode())
            {
                ParseLinearNodes(docParser, node.ChildNodes);
            }
            else
            {
                var nodes = new List<HtmlNode>();

                foreach (var childNode in node.ChildNodes)
                {
                    if (childNode.IsTextNode())
                    {
                        if (childNode.IsValuableTextNode())
                            nodes.Add(childNode);
                        continue;
                    }

                    if ((childNode.HasChildNodes || childNode.Name == HtmlTags.Br) && nodes.Count > 0)
                    {
                        ParseLinearNodes(docParser, nodes);
                        nodes.Clear();
                    }

                    if (childNode.HasChildNodes)                    
                        ParseHierarchyNode(docParser, childNode);                    
                }

                if (nodes.Count > 0)
                    ParseLinearNodes(docParser, nodes);
            }
        }

        private void ParseHierarchyNode(IDocumentParser docParser, HtmlNode node)
        {
            var state = GetParagraphType(node);
            if (state > ParagraphType.Inline)
            {
                using (docParser.ParseHierarchyElement(state))
                {
                    ParseNode(docParser, node);
                }
            }
            else
            {
                ParseNode(docParser, node);
            }
        }

        private ParagraphType GetParagraphType(HtmlNode node)
        {
            if (HtmlTags.BlockElements.Contains(node.Name))
                return ParagraphType.Block;

            if (HtmlTags.ListElements.Contains(node.Name))
                return ParagraphType.List;

            switch (node.Name)
            {
                case HtmlTags.Table:
                    return ParagraphType.Table;
                case HtmlTags.TableRow:
                    return ParagraphType.TableRow;
                case HtmlTags.TableCell:
                    return ParagraphType.TableCell;
                case HtmlTags.Head:
                    if (node.ParentNode?.Name == HtmlTags.Html)
                        return ParagraphType.Title;
                    break;
                case HtmlTags.ListElement:
                    return ParagraphType.ListElement;
            }            

            return ParagraphType.Inline;
        }

        private void ParseLinearNodes(IDocumentParser docParser, IEnumerable<HtmlNode> nodes)
        {
            foreach (var node in nodes)
            {
                docParser.ParseParagraph(node);
            }
        }
    }
}
