using BibleNote.Analytics.Contracts.Providers;
using BibleNote.Analytics.Contracts.VerseParsing;
using BibleNote.Analytics.Providers.FileNavigationProvider;
using HtmlAgilityPack;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using BibleNote.Analytics.Core.Extensions;
using BibleNote.Analytics.Models.Verse;
using BibleNote.Analytics.Models.VerseParsing;
using BibleNote.Analytics.Core.Constants;
using BibleNote.Analytics.Contracts.VerseParsing.ParseContext;

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
            var state = GetParagraphState(node);
            if (state > ParagraphState.Inline)
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

        private ParagraphState GetParagraphState(HtmlNode node)
        {
            if (HtmlTags.BlockElements.Contains(node.Name))
                return ParagraphState.Block;

            if (HtmlTags.ListElements.Contains(node.Name))
                return ParagraphState.List;

            switch (node.Name)
            {
                case HtmlTags.Table:
                    return ParagraphState.Table;
                case HtmlTags.TableRow:
                    return ParagraphState.TableRow;
                case HtmlTags.TableCell:
                    return ParagraphState.TableCell;
                case HtmlTags.Head:
                    if (node.ParentNode?.Name == HtmlTags.Html)
                        return ParagraphState.Title;
                    break;
                case HtmlTags.ListElement:
                    return ParagraphState.ListElement;
            }            

            return ParagraphState.Inline;
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
