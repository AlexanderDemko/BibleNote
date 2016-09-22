using BibleNote.Analytics.Contracts.Providers;
using BibleNote.Analytics.Contracts.VerseParsing;
using BibleNote.Analytics.Models.Verse;
using BibleNote.Analytics.Models.VerseParsing;
using BibleNote.Analytics.Providers.OneNote.Contracts;
using System.Collections.Generic;
using System.Linq;
using HtmlAgilityPack;
using BibleNote.Analytics.Core.Extensions;
using BibleNote.Analytics.Models.Contracts.ParseContext;
using BibleNote.Analytics.Providers.OneNote.Constants;
using BibleNote.Analytics.Core.Constants;

namespace BibleNote.Analytics.Providers.OneNote.Services
{
    public class OneNoteProvider : IDocumentProvider
    {
        private readonly IDocumentParserFactory _documentParserFactory;

        private readonly IOneNoteDocumentConnector _oneNoteDocumentConnector;

        public bool IsReadonly { get { return false; } }

        public OneNoteProvider(IDocumentParserFactory documentParserFactory, IOneNoteDocumentConnector oneNoteDocumentConnector)
        {
            _documentParserFactory = documentParserFactory;
            _oneNoteDocumentConnector = oneNoteDocumentConnector;
        }

        public string GetVersePointerLink(VersePointer versePointer)
        {
            return string.Format($"<a href='bnVerse:{versePointer}'>{versePointer.GetOriginalVerseString()}</a>");
        }

        public DocumentParseResult ParseDocument(IDocumentId documentId)
        {
            DocumentParseResult result;
            using (var docHandler = _oneNoteDocumentConnector.Connect(documentId))
            {
                using (var docParser = _documentParserFactory.Create(this))
                {
                    ParseNode(docParser, docHandler.HtmlDocument.DocumentNode.Element(OneNoteTags.Page));
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
            if (state > ElementType.Linear)
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

        private ElementType GetParagraphType(HtmlNode node)
        {
            if (node.Name == OneNoteTags.OeChildren
                && node.FirstChild?.Name == OneNoteTags.Oe
                && node.FirstChild.FirstChild?.Name == OneNoteTags.List)
                return ElementType.List;

            if (node.Name == OneNoteTags.Oe 
                && node.FirstChild?.Name == OneNoteTags.List)
                return ElementType.ListElement;            

            switch (node.Name)
            {
                case OneNoteTags.Table:
                    return ElementType.Table;
                case OneNoteTags.TableRow:
                    return ElementType.TableRow;
                case OneNoteTags.TableCell:
                    return ElementType.TableCell;
                case OneNoteTags.Title:
                    if (node.ParentNode?.Name == OneNoteTags.Page)
                        return ElementType.Title;
                    break;
                case OneNoteTags.OeChildren:
                case OneNoteTags.Oe:                
                    return ElementType.Block;
            }

            return ElementType.Linear;
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
