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
using BibleNote.Analytics.Core.Exceptions;
using BibleNote.Analytics.Core.Helpers;
using BibleNote.Analytics.Contracts.Environment;

namespace BibleNote.Analytics.Services.VerseParsing
{
    public class ParagraphParser : IParagraphParser
    {
        internal class VerseInNodeEntry
        {
            internal TextNodeEntry NodeEntry { get; set; }

            internal int StartIndex { get; set; }        // границы стиха в рамках Node            

            internal int EndIndex { get; set; }
        }

        private readonly IStringParser _stringParser;

        private readonly IVerseRecognitionService _verseRecognitionService;

        private readonly IConfigurationManager _configurationManager;

        private IDocumentProvider _documentProvider;

        private IDocumentParseContext _docParseContext;

        private ParagraphParseResult _result { get; set; }

        public ParagraphParser(IStringParser stringParser, IVerseRecognitionService verseRecognitionService, IConfigurationManager configurationManager)
        {
            _stringParser = stringParser;
            _verseRecognitionService = verseRecognitionService;
            _configurationManager = configurationManager;
        }

        public void Init(IDocumentProvider documentProvider, IDocumentParseContext docParseContext)
        {
            _documentProvider = documentProvider;
            _docParseContext = docParseContext;
        }

        public ParagraphParseResult ParseParagraph(HtmlNode node)
        {
            if (_documentProvider == null)
                throw new NotInitializedException();

            if (_docParseContext == null)
                throw new NotInitializedException();

            _result = new ParagraphParseResult();
            _docParseContext.SetCurrentParagraph(_result);      // todo: сейчас мы всё добавляем. Но в будущем надо перед сохранением будет удалять лишние параграфы. То есть сохранять только те, в которых есть стихи и около их.

            var parseString = new HtmlToTextConverter().Convert(node);
            _result.Text = parseString.Value;
            ParseTextNodes(parseString);

            return _result;
        }

        private void ParseTextNodes(TextNodesString parseString)
        {
            var index = 0;         // чтобы анализировать с первого символа, так как теперь поддерживаем ещё и такие ссылки, как "5:6 - ..."
            var verseEntry = _stringParser.TryGetVerse(parseString.Value, index);

            var skipNodes = 0;
            while (verseEntry.VersePointerFound)
            {
                var verseWasRecognized = _verseRecognitionService.TryRecognizeVerse(verseEntry, _docParseContext);
                if (!verseWasRecognized && _configurationManager.UseCommaDelimiter
                    && verseEntry.EntryType <= VerseEntryType.ChapterVerse)
                {
                    verseEntry = _stringParser.TryGetVerse(parseString.Value, index, index, false);
                    verseWasRecognized = _verseRecognitionService.TryRecognizeVerse(verseEntry, _docParseContext);
                }

                if (verseWasRecognized)
                {
                    var verseNode = FindNodeAndMoveVerseTextInOneNodeIfNotReadonly(parseString, verseEntry, ref skipNodes);

                    if (!_documentProvider.IsReadonly)
                    {
                        if (!NodeIsLink(verseNode.NodeEntry.Node.ParentNode))
                            InsertVerseLink(verseNode, verseEntry);
                        else
                            UpdateLinkNode(verseNode.NodeEntry.Node.ParentNode, verseEntry);
                    }

                    _result.VerseEntries.Add(verseEntry);
                    _docParseContext.SetLatestVerseEntry(verseEntry);
                }


                var prevIndex = index;
                index = verseEntry.EndIndex + 1;
                if (index < parseString.Value.Length - 1)
                {
                    var leftBoundary = !verseWasRecognized && verseEntry.EntryType > VerseEntryType.ChapterVerse ? prevIndex : index;
                    verseEntry = _stringParser.TryGetVerse(parseString.Value, index, leftBoundary, _configurationManager.UseCommaDelimiter);
                }
                else
                    break;
            }
        }

        private void UpdateLinkNode(HtmlNode node, VerseEntryInfo verseEntry)
        {
            var hrefAttrName = "href";
            var hrefAttrValue = $"bnVerse:{verseEntry.VersePointer}";           // todo: нужно вынести в сервис, который в том числе будут использовать все провайдеры

            var hrefAttr = node.Attributes[hrefAttrName];

            if (hrefAttr != null)
                hrefAttr.Value = hrefAttrValue;
            else
                node.Attributes.Add(hrefAttrName, hrefAttrValue);
        }

        private bool NodeIsLink(HtmlNode node)
        {
            return node.NodeType == HtmlNodeType.Element && node.Name == "a";
        }

        private void InsertVerseLink(VerseInNodeEntry verseInNodeEntry, VerseEntryInfo verseEntry)
        {
            var verseLink = _documentProvider.GetVersePointerLink(verseEntry.VersePointer);

            var verseInNodeStartIndex = verseInNodeEntry.StartIndex + verseInNodeEntry.NodeEntry.Shift;
            var verseInNodeEndIndex = verseInNodeEntry.EndIndex + verseInNodeEntry.NodeEntry.Shift + 1;

            verseInNodeEntry.NodeEntry.Node.InnerHtml = string.Concat(
                verseInNodeEntry.NodeEntry.Node.InnerHtml.Substring(0, verseInNodeStartIndex),
                verseLink,
                verseInNodeEndIndex < verseInNodeEntry.NodeEntry.Node.InnerHtml.Length
                    ? verseInNodeEntry.NodeEntry.Node.InnerHtml.Substring(verseInNodeEndIndex)
                    : string.Empty);

            var shift = verseLink.Length - verseEntry.VersePointer.OriginalVerseName.Length;
            verseInNodeEntry.NodeEntry.Shift += shift;
        }

        /// <summary>
        /// 
        /// </summary>
        /// <param name="parseString"></param>
        /// <param name="verseEntryInfo"></param>
        /// <param name="skipNodes">Чтобы не проверять строку с начала</param>
        /// <returns></returns>
        private VerseInNodeEntry FindNodeAndMoveVerseTextInOneNodeIfNotReadonly(TextNodesString parseString, VerseEntryInfo verseEntryInfo, ref int skipNodes)
        {
            var result = new VerseInNodeEntry();

            if (parseString.NodesInfo.Count > 1)
            {
                foreach (var nodeEntry in parseString.NodesInfo.Skip(skipNodes))
                {
                    if (result.NodeEntry == null)
                    {
                        if (nodeEntry.StartIndex <= verseEntryInfo.StartIndex && verseEntryInfo.StartIndex <= nodeEntry.EndIndex)
                        {
                            result.NodeEntry = nodeEntry;
                            result.StartIndex = verseEntryInfo.StartIndex - nodeEntry.StartIndex;
                            result.EndIndex = (nodeEntry.EndIndex >= verseEntryInfo.EndIndex ? verseEntryInfo.EndIndex : nodeEntry.EndIndex) - nodeEntry.StartIndex;

                            if (_documentProvider.IsReadonly)
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
                        if (result.NodeEntry.Node.InnerHtml != result.NodeEntry.Node.InnerText)
                            throw new InvalidOperationException("firstVerseNode.InnerHtml != firstVerseNode.InnerText");

                        if (nodeEntry.Node.InnerHtml != nodeEntry.Node.InnerText)
                            throw new InvalidOperationException("nodeEntry.Node.InnerHtml != nodeEntry.Node.InnerText");
#endif

                        result.NodeEntry.Node.InnerHtml += verseTextPart;
                        nodeEntry.Node.InnerHtml = nodeEntry.Node.InnerHtml.Remove(0, moveCharsCount);

                        if (verseEntryInfo.EndIndex < nodeEntry.EndIndex)
                            break;
                    }
                    skipNodes++;
                }
            }
            else
            {
                result.NodeEntry = parseString.NodesInfo.First();
                result.StartIndex = verseEntryInfo.StartIndex;
                result.EndIndex = verseEntryInfo.EndIndex;
            }

            return result;
        }
    }
}