using System;
using System.Linq;
using BibleNote.Analytics.Contracts.VerseParsing;
using BibleNote.Analytics.Contracts.Providers;
using BibleNote.Analytics.Core.Exceptions;
using BibleNote.Analytics.Core.Helpers;
using BibleNote.Analytics.Contracts.Environment;
using BibleNote.Analytics.Models.VerseParsing;
using BibleNote.Analytics.Models.Contracts.ParseContext;
using BibleNote.Analytics.Core.Contracts;

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

        private IDocumentProviderInfo _documentProvider;

        private IDocumentParseContext _docParseContext;

        private IParagraphParseContextEditor _parseContextEditor;

        private ParagraphParseResult _result { get; set; }        

        public ParagraphParser(IStringParser stringParser, IVerseRecognitionService verseRecognitionService, IConfigurationManager configurationManager)
        {
            _stringParser = stringParser;
            _verseRecognitionService = verseRecognitionService;
            _configurationManager = configurationManager;
        }

        public void Init(IDocumentProviderInfo documentProvider, IDocumentParseContext docParseContext)
        {
            _documentProvider = documentProvider;
            _docParseContext = docParseContext;
        }

        public ParagraphParseResult ParseParagraph(IXmlNode node)
        {
            if (_documentProvider == null)
                throw new NotInitializedException("_documentProvider == null");

            if (_docParseContext == null)
                throw new NotInitializedException("_docParseContext == null");            

            _parseContextEditor = (IParagraphParseContextEditor)_docParseContext.CurrentParagraph;

            _result = new ParagraphParseResult();
            _parseContextEditor.SetParagraphResult(_result);

            var parseString = new HtmlToTextConverter().Convert(node);
            _result.Text = parseString.Value;
            ParseTextNodes(parseString);

            _parseContextEditor.SetParsed();

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
                        if (!NodeIsLink(verseNode.NodeEntry.Node.GetParentNode()))
                            InsertVerseLink(verseNode, verseEntry);
                        else
                            UpdateLinkNode(verseNode.NodeEntry.Node.GetParentNode(), verseEntry);
                    }

                    _result.VerseEntries.Add(verseEntry);
                    _parseContextEditor.SetLatestVerseEntry(verseEntry);
                }

                if (verseEntry.VersePointer.SubVerses.NotFoundVerses.Count > 0)
                {
                    _result.NotFoundVerses.AddRange(verseEntry.VersePointer.SubVerses.NotFoundVerses);
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

        private void UpdateLinkNode(IXmlNode node, VerseEntry verseEntry)
        {
            var hrefAttrName = "href";
            var hrefAttrValue = $"bnVerse:{verseEntry.VersePointer}";           // todo: нужно вынести в сервис, который в том числе будут использовать все провайдеры

            node.SetAttributeValue(hrefAttrName, hrefAttrValue);            
        }

        private bool NodeIsLink(IXmlNode node)
        {
            return node.NodeType == IXmlNodeType.Element && node.Name == "a";
        }

        private void InsertVerseLink(VerseInNodeEntry verseInNodeEntry, VerseEntry verseEntry)
        {
            var verseLink = _documentProvider.GetVersePointerLink(verseEntry.VersePointer);

            var verseInNodeStartIndex = verseInNodeEntry.StartIndex + verseInNodeEntry.NodeEntry.Shift;
            var verseInNodeEndIndex = verseInNodeEntry.EndIndex + verseInNodeEntry.NodeEntry.Shift + 1;

            verseInNodeEntry.NodeEntry.Node.InnerXml = string.Concat(
                verseInNodeEntry.NodeEntry.Node.InnerXml.Substring(0, verseInNodeStartIndex),
                verseLink,
                verseInNodeEndIndex < verseInNodeEntry.NodeEntry.Node.InnerXml.Length
                    ? verseInNodeEntry.NodeEntry.Node.InnerXml.Substring(verseInNodeEndIndex)
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
        private VerseInNodeEntry FindNodeAndMoveVerseTextInOneNodeIfNotReadonly(TextNodesString parseString, VerseEntry verseEntryInfo, ref int skipNodes)
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
                            if (!nodeEntry.WasCleaned)
                                nodeEntry.Clean();  // то есть, если в этой ноде есть стих, тогда мы можем немного её почистить. Чтобы другие ноды не изменять.

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
                        if (!nodeEntry.WasCleaned)
                            nodeEntry.Clean();  

                        var moveCharsCount = (verseEntryInfo.EndIndex > nodeEntry.EndIndex ? nodeEntry.EndIndex : verseEntryInfo.EndIndex) - nodeEntry.StartIndex + 1;
                        var verseTextPart = nodeEntry.Node.InnerXml.Substring(0, moveCharsCount);
                        result.EndIndex += moveCharsCount;
                        nodeEntry.StartIndex += moveCharsCount;     // здесь может быть ситуация, когда Startindex > EndIndex. Когда нода была из одного символа. Похоже, что это нормально. Так как мы больше нигде не используем эти ноды.
                        result.NodeEntry.Node.InnerXml += verseTextPart;
                        nodeEntry.Node.InnerXml = nodeEntry.Node.InnerXml.Remove(0, moveCharsCount);

                        if (verseEntryInfo.EndIndex <= nodeEntry.EndIndex)
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

                if (!result.NodeEntry.WasCleaned)
                    result.NodeEntry.Clean();
            }
            
            return result;
        }
    }
}