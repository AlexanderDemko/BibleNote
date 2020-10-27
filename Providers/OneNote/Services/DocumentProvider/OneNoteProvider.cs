using System.Threading.Tasks;
using System.Xml.Linq;
using BibleNote.Domain.Enums;
using BibleNote.Providers.Html;
using BibleNote.Providers.OneNote.Constants;
using BibleNote.Providers.OneNote.Contracts;
using BibleNote.Services.DocumentProvider.Contracts;
using BibleNote.Services.VerseParsing.Contracts;
using BibleNote.Services.VerseParsing.Contracts.ParseContext;
using BibleNote.Services.VerseParsing.Models;
using BibleNote.Services.VerseParsing.Models.ParseResult;

namespace BibleNote.Providers.OneNote.Services.DocumentProvider
{
    public class OneNoteProvider : IDocumentProvider
    {
        private readonly IDocumentParserFactory documentParserFactory;
        private readonly IOneNoteDocumentConnector oneNoteDocumentConnector;
        private readonly IVerseLinkService verseLinkService;

        public bool IsReadonly => false;

        public FileType[] SupportedFileTypes => new[] { FileType.OneNote };

        public OneNoteProvider(
            IDocumentParserFactory documentParserFactory,
            IOneNoteDocumentConnector oneNoteDocumentConnector,
            IVerseLinkService verseLinkService)
        {
            this.documentParserFactory = documentParserFactory;
            this.oneNoteDocumentConnector = oneNoteDocumentConnector;
            this.verseLinkService = verseLinkService;
        }

        public string GetVersePointerLink(VersePointer versePointer)
        {
            var verseLink = verseLinkService.GetVerseLink(versePointer);
            return string.Format($"<a href='{verseLink}'>{versePointer.GetOriginalVerseString()}</a>");
        }

        public async Task<DocumentParseResult> ParseDocumentAsync(IDocumentId documentId)
        {
            DocumentParseResult result;
            using (var docHandler = await oneNoteDocumentConnector.ConnectAsync(documentId))
            {
                using (var docParser = documentParserFactory.Create(this, documentId))
                {
                    ParseNode(docParser, docHandler.Document.Root);
                    result = docParser.DocumentParseResult;
                }

                if (result.IsValuable)
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
                if (!string.IsNullOrEmpty(node.Value.Trim()))
                {
                    var htmlNode = new HtmlNodeWrapper(node.Value);
                    docParser.ParseParagraph(htmlNode);
                    node.Value = htmlNode.InnerXml;
                }
            }
        }

        private ElementType GetParagraphType(XElement node)
        {
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

            if (node.Name.LocalName == OneNoteTags.OeChildren)
            {
                var firstElement = node.FirstElement();
                if (firstElement?.Name.LocalName == OneNoteTags.Oe
                    && firstElement.FirstElement()?.Name.LocalName == OneNoteTags.List)
                    return ElementType.List;
            }

            if (node.Name.LocalName == OneNoteTags.Oe
                && node.FirstElement()?.Name.LocalName == OneNoteTags.List)
                return ElementType.ListElement;

            return ElementType.SimpleBlock;
        }
    }
}
