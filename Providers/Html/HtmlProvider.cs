using System.Linq;
using System.Threading.Tasks;
using BibleNote.Domain.Enums;
using BibleNote.Providers.Html.Contracts;
using BibleNote.Services.DocumentProvider.Contracts;
using BibleNote.Services.VerseParsing;
using BibleNote.Services.VerseParsing.Contracts;
using BibleNote.Services.VerseParsing.Contracts.ParseContext;
using BibleNote.Services.VerseParsing.Models;
using BibleNote.Services.VerseParsing.Models.ParseResult;
using HtmlAgilityPack;

namespace BibleNote.Providers.Html
{
    public class HtmlProvider : IDocumentProvider
    {
        public bool IsReadonly { get { return false; } }   // todo: надо дополнительно этот параметр вынести выше - на уровень NavigationProviderInstance        

        public FileType[] SupportedFileTypes => new[] { FileType.Html, FileType.Text };

        private readonly IDocumentParserFactory documentParserFactory;
        private readonly IHtmlDocumentConnector htmlDocumentConnector;
        private readonly IVerseLinkService verseLinkService;

        public HtmlProvider(
            IDocumentParserFactory documentParserFactory, 
            IHtmlDocumentConnector htmlDocumentConnector,
            IVerseLinkService verseLinkService)
        {
            this.documentParserFactory = documentParserFactory;
            this.htmlDocumentConnector = htmlDocumentConnector;
            this.verseLinkService = verseLinkService;
        }        

        public string GetVersePointerLink(VersePointer versePointer)
        {
            var verseLink = this.verseLinkService.GetVerseLink(versePointer);
            return string.Format($"<a href='{verseLink}'>{versePointer.GetOriginalVerseString()}</a>");
        }

        public async Task<DocumentParseResult> ParseDocumentAsync(IDocumentId documentId)
        {
            DocumentParseResult result;
            using (var docHandler = await htmlDocumentConnector.ConnectAsync(documentId))
            {
                using (var docParser = documentParserFactory.Create(this, documentId))
                {
                    ParseNode(docParser, docHandler.HtmlDocument.DocumentNode);
                    result = docParser.DocumentParseResult;
                }

                if (result.IsValuable && !documentId.IsReadonly)
                    docHandler.SetDocumentChanged();
            }

            return result;
        }

        private void ParseNode(IDocumentParser docParser, HtmlNode node, bool isReadonly = false)
        {
            var state = GetParagraphType(node);
            if (state.IsHierarchical())
            {
                using (docParser.ParseHierarchyElement(state))
                {
                    if (IsHerarchy(node))
                    {
                        foreach (var childNode in node.ChildNodes)
                        {
                            ParseNode(docParser, childNode, state == ElementType.Title || isReadonly);
                        }
                    }
                    else
                    {
                        ParseParagraph(docParser, node, state == ElementType.Title || isReadonly);
                    }
                }
            }
            else
            {
                ParseParagraph(docParser, node, isReadonly);
            }
        }

        private static void ParseParagraph(IDocumentParser docParser, HtmlNode node, bool isReadonly)
        {
            var nodeWrapper = new HtmlNodeWrapper(node, isReadonly);
            if (node.HasChildNodes || nodeWrapper.IsValuableTextNode(IXmlTextNodeMode.Exact))
            {
                docParser.ParseParagraph(nodeWrapper);
            }
        }

        private bool IsHerarchy(HtmlNode node)
        {
            var result = node.ChildNodes.Any(n =>
                n.NodeType != HtmlNodeType.Text
                && n.NodeType != HtmlNodeType.Comment
                && n.Name != HtmlTags.A);            

            return result;
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
