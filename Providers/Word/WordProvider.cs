﻿using System;
using System.Threading.Tasks;
using BibleNote.Domain.Enums;
using BibleNote.Providers.Html;
using BibleNote.Providers.Word.Contracts;
using BibleNote.Services.Contracts;
using BibleNote.Services.VerseParsing.Contracts;
using BibleNote.Services.VerseParsing.Contracts.ParseContext;
using BibleNote.Services.VerseParsing.Models;
using BibleNote.Services.VerseParsing.Models.ParseResult;
using DocumentFormat.OpenXml;

namespace BibleNote.Providers.Word
{
    public class WordProvider : IDocumentProvider
    {
        public bool IsReadonly { get { return false; } }

        public FileType[] SupportedFileTypes => new[] { FileType.Word };

        private readonly IDocumentParserFactory documentParserFactory;
        private readonly IWordDocumentConnector wordDocumentConnector;

        public WordProvider(IDocumentParserFactory documentParserFactory, IWordDocumentConnector wordDocumentConnector)
        {
            this.documentParserFactory = documentParserFactory;
            this.wordDocumentConnector = wordDocumentConnector;
        }        

        public string GetVersePointerLink(VersePointer versePointer)
        {
            throw new NotImplementedException(); // todo
        }

        public async Task<DocumentParseResult> ParseDocumentAsync(IDocumentId documentId)
        {
            DocumentParseResult result;
            await using (var docHandler = await wordDocumentConnector.ConnectAsync(documentId))
            {
                using (var docParser = documentParserFactory.Create(this, documentId))
                {
                    ParseNode(docParser, docHandler.WordDocument.MainDocumentPart.Document.Body);
                    result = docParser.DocumentParseResult;
                }

                if (result.IsValuable && !documentId.IsReadonly)
                    docHandler.SetDocumentChanged();
            }

            return result;
        }

        private void ParseNode(IDocumentParser docParser, OpenXmlElement node)
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
                if (!string.IsNullOrEmpty(node.InnerText.Trim()))
                {
                    var htmlNode = new HtmlNodeWrapper(node.InnerText);
                    docParser.ParseParagraph(htmlNode);
                    //node.Value = htmlNode.InnerXml;
                }
            }
        }

        private ElementType GetParagraphType(OpenXmlElement node)
        {
            switch (node.LocalName)
            {
                case "body":
                case "p":
                case "r":
                    return ElementType.HierarchicalBlock;
                case "t":
                    return ElementType.SimpleBlock;
            }


            //switch (node.Name)
            //{
            //    case HtmlTags.Table:
            //        return ElementType.Table;
            //    case HtmlTags.TableRow:
            //        return ElementType.TableRow;
            //    case HtmlTags.Head:
            //        if (node.ParentNode?.Name == HtmlTags.Html)
            //            return ElementType.Title;
            //        break;
            //}

            //if (HtmlTags.BlockElements.Contains(node.Name))
            //    return ElementType.HierarchicalBlock;

            //if (HtmlTags.Lists.Contains(node.Name))
            //    return ElementType.List;

            //if (HtmlTags.ListElements.Contains(node.Name))
            //    return ElementType.ListElement;

            //if (HtmlTags.TableCells.Contains(node.Name))
            //    return ElementType.TableCell;

            //if (HtmlTags.TableBodys.Contains(node.Name))
            //    return ElementType.TableBody;

            return ElementType.SimpleBlock;
        }
    }
}
