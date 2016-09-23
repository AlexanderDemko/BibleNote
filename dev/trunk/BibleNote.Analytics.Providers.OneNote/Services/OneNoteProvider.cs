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
            var state = GetParagraphType(node);
            if (state > ElementType.SimpleBlock)
            {
                using (docParser.ParseHierarchyElement(state))
                {
                    foreach (var childNode in node.ChildNodes)
                    {
                        ParseNode(docParser, childNode);
                    }
                }
            }
            else
            {
                if (node.HasChildNodes || node.IsValuableTextNode())
                    docParser.ParseParagraph(node);
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
                case OneNoteTags.Outline:
                case OneNoteTags.OeChildren:
                case OneNoteTags.Oe:
                case OneNoteTags.Page:    
                    return ElementType.HierarchicalBlock;
            }

            return ElementType.SimpleBlock;
        }
    }
}
