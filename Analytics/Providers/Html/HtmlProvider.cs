using HtmlAgilityPack;
using System.Linq;
using BibleNote.Analytics.Services.VerseParsing.Contracts;
using BibleNote.Analytics.Services.VerseParsing.Contracts.ParseContext;
using BibleNote.Analytics.Services.VerseParsing;
using BibleNote.Analytics.Services.DocumentProvider.Contracts;
using BibleNote.Analytics.Providers.Html.Contracts;
using BibleNote.Analytics.Services.VerseParsing.Models;
using BibleNote.Analytics.Services.VerseParsing.Models.ParseResult;

namespace BibleNote.Analytics.Providers.Html
{
    public class HtmlProvider : IDocumentProvider
    {
        private readonly IDocumentParserFactory _documentParserFactory;

        private readonly IHtmlDocumentConnector _htmlDocumentConnector;

        public bool IsReadonly { get { return false; } }   // todo: надо дополнительно этот параметр вынести выше - на уровень NavigationProviderInstance

        public HtmlProvider(IDocumentParserFactory documentParserFactory, IHtmlDocumentConnector htmlDocumentConnector)
        {
            _documentParserFactory = documentParserFactory;
            _htmlDocumentConnector = htmlDocumentConnector;
        }

        public string GetVersePointerLink(VersePointer versePointer)
        {
            return string.Format($"<a href='bnVerse:{versePointer}'>{versePointer.GetOriginalVerseString()}</a>");
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

                if (result.IsValuable && !documentId.IsReadonly)
                    docHandler.SetDocumentChanged();
            }

            return result;
        }

        private void ParseNode(IDocumentParser docParser, HtmlNode node)
        {
            var state = GetParagraphType(node);
            if (state.IsHierarchical())
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
                var nodeWrapper = new HtmlNodeWrapper(node);
                if (node.HasChildNodes || nodeWrapper.IsValuableTextNode(IXmlTextNodeMode.Exact))
                    docParser.ParseParagraph(nodeWrapper);
            }
        }

        private ElementType GetParagraphType(HtmlNode node)
        {
            switch (node.Name)
            {
                case HtmlTags.Table:
                    return ElementType.Table;
                case HtmlTags.TableRow:
                    return ElementType.TableRow;                
                case HtmlTags.Head:
                    if (node.ParentNode?.Name == HtmlTags.Html)
                        return ElementType.Title;
                    break;                
            }

            if (HtmlTags.BlockElements.Contains(node.Name))
                return ElementType.HierarchicalBlock;

            if (HtmlTags.Lists.Contains(node.Name))
                return ElementType.List;

            if (HtmlTags.ListElements.Contains(node.Name))
                return ElementType.ListElement;

            if (HtmlTags.TableCells.Contains(node.Name))
                return ElementType.TableCell;

            if (HtmlTags.TableBodys.Contains(node.Name))
                return ElementType.TableBody;

            return ElementType.SimpleBlock;
        }
    }
}
