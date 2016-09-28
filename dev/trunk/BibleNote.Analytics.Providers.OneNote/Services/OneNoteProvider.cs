using BibleNote.Analytics.Contracts.Providers;
using BibleNote.Analytics.Contracts.VerseParsing;
using BibleNote.Analytics.Models.Verse;
using BibleNote.Analytics.Models.VerseParsing;
using BibleNote.Analytics.Providers.OneNote.Contracts;
using System.Collections.Generic;
using System.Linq;
using BibleNote.Analytics.Core.Extensions;
using BibleNote.Analytics.Models.Contracts.ParseContext;
using BibleNote.Analytics.Providers.OneNote.Constants;
using BibleNote.Analytics.Core.Constants;
using System.Xml.Linq;
using BibleNote.Analytics.Core.Contracts;

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
                    ParseNode(docParser, docHandler.Document.Root);
                    result = docParser.DocumentParseResult;
                }

                if (result.ParagraphParseResults.Any(pr => pr.IsValuable))
                    docHandler.SetDocumentChanged();
            }

            return result;
        }

        private void ParseNode(IDocumentParser docParser, XElement node)
        {
            var state = GetParagraphType(node);
            if (state.IsHierarchical())
            {
                using (docParser.ParseHierarchyElement(state))
                {
                    foreach (var childNode in node.Elements())
                    {
                        ParseNode(docParser, childNode);
                    }
                }
            }
            else
            {
                var nodeWrapper = new XElementWrapper(node);
                if (node.HasElements || nodeWrapper.IsValuableTextNode(IXmlTextNodeMode.Exact))
                    docParser.ParseParagraph(nodeWrapper);
            }
        }

        private ElementType GetParagraphType(XElement node)
        {
            if (node.Name == OneNoteTags.OeChildren
                && node.Elements().First()?.Name.LocalName == OneNoteTags.Oe
                && node.Elements().First().Elements().First()?.Name.LocalName == OneNoteTags.List)
                return ElementType.List;

            if (node.Name == OneNoteTags.Oe 
                && node.Elements().First()?.Name == OneNoteTags.List)
                return ElementType.ListElement;            

            switch (node.Name.LocalName)
            {
                case OneNoteTags.Table:
                    return ElementType.Table;
                case OneNoteTags.TableRow:
                    return ElementType.TableRow;
                case OneNoteTags.TableCell:
                    return ElementType.TableCell;
                case OneNoteTags.Title:
                    if (node.Parent?.Name.LocalName == OneNoteTags.Page)
                        return ElementType.Title;
                    break;
                case OneNoteTags.Page:
                case OneNoteTags.Outline:                
                    return ElementType.Root;
                case OneNoteTags.Oe:
                case OneNoteTags.OeChildren:
                    return ElementType.HierarchicalBlock;
            }

            return ElementType.SimpleBlock;
        }
    }
}
