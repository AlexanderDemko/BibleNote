using System;
using System.Linq;
using BibleNote.Services.Configuration.Contracts;
using BibleNote.Services.DocumentProvider.Contracts;
using BibleNote.Services.VerseParsing.Contracts;
using BibleNote.Services.VerseParsing.Contracts.ParseContext;
using BibleNote.Services.VerseParsing.Models;
using BibleNote.Services.VerseParsing.Models.ParseResult;

namespace BibleNote.Services.VerseParsing
{
    class ParagraphParser : IParagraphParser
    {
        internal class VerseInNodeEntry
        {
            internal TextNodeEntry NodeEntry { get; set; }

            internal int StartIndex { get; set; }        // границы стиха в рамках Node            

            internal int EndIndex { get; set; }
        }

        private readonly IStringParser stringParser;
        private readonly IVerseRecognitionService verseRecognitionService;
        private readonly IConfigurationManager configurationManager;
        private readonly IVerseLinkService verseLinkService;
        private IDocumentProviderInfo documentProvider;
        private IDocumentParseContext docParseContext;
        private IParagraphParseContextEditor paragraphContextEditor;

        public ParagraphParser(
            IStringParser stringParser, 
            IVerseRecognitionService verseRecognitionService, 
            IConfigurationManager configurationManager,
            IVerseLinkService verseLinkService)
        {
            this.stringParser = stringParser;
            this.verseRecognitionService = verseRecognitionService;
            this.configurationManager = configurationManager;
            this.verseLinkService = verseLinkService;
        }

        public void Init(IDocumentProviderInfo documentProvider, IDocumentParseContext docParseContext)
        {
            this.documentProvider = documentProvider;
            this.docParseContext = docParseContext;
        }

        public ParagraphParseResult ParseParagraph(IXmlNode node, IParagraphParseContextEditor paragraphContextEditor)
        {
            if (documentProvider == null)
                throw new ArgumentNullException(nameof(documentProvider));

            if (docParseContext == null)
                throw new ArgumentNullException(nameof(docParseContext));

            this.paragraphContextEditor = paragraphContextEditor;

            var parseString = new HtmlToTextConverter().Convert(node);
            this.paragraphContextEditor.ParseResult.Text = parseString.Value;
            ParseTextNodes(parseString);

            this.paragraphContextEditor.SetParsed();
            return this.paragraphContextEditor.ParseResult;
        }

        private void ParseTextNodes(TextNodesString parseString)
        {
            var index = 0;         // чтобы анализировать с первого символа, так как теперь поддерживаем ещё и такие ссылки, как "5:6 - ..."
            var verseEntry = stringParser.TryGetVerse(parseString.Value, index);

            var skipNodes = 0;
            while (verseEntry.VersePointerFound)
            {
                var verseWasRecognized = verseRecognitionService.TryRecognizeVerse(verseEntry, docParseContext);
                if (!verseWasRecognized && configurationManager.UseCommaDelimiter
                    && verseEntry.EntryType <= VerseEntryType.ChapterVerse)
                {
                    verseEntry = stringParser.TryGetVerse(parseString.Value, index, index, false);
                    verseWasRecognized = verseRecognitionService.TryRecognizeVerse(verseEntry, docParseContext);
                }

                if (verseWasRecognized)
                {                    
                    var verseNode = FindNodeAndMoveVerseTextInOneNodeIfNotReadonly(parseString, verseEntry, ref skipNodes);

                    if (!this.docParseContext.DocumentId.IsReadonly && !parseString.IsReadonly)
                    {
                        if (!NodeIsLink(verseNode.NodeEntry.Node.GetParentNode()))
                            InsertVerseLink(verseNode, verseEntry);
                        else
                            UpdateLinkNode(verseNode.NodeEntry.Node.GetParentNode(), verseEntry);
                    }

                    paragraphContextEditor.ParseResult.VerseEntries.Add(verseEntry);
                    paragraphContextEditor.SetLatestVerseEntry(verseEntry);
                }

                if (verseEntry.VersePointer.SubVerses.NotFoundVerses.Count > 0)
                {
                    paragraphContextEditor.ParseResult.NotFoundVerses.AddRange(verseEntry.VersePointer.SubVerses.NotFoundVerses);
                }

                var prevIndex = index;
                index = verseEntry.EndIndex + 1;
                if (index < parseString.Value.Length - 1)
                {
                    var leftBoundary = !verseWasRecognized && verseEntry.EntryType > VerseEntryType.ChapterVerse ? prevIndex : index;
                    verseEntry = stringParser.TryGetVerse(parseString.Value, index, leftBoundary, configurationManager.UseCommaDelimiter);
                }
                else
                    break;
            }
        }

        private void UpdateLinkNode(IXmlNode node, VerseEntry verseEntry)
        {
            var hrefAttrName = "href";  // todo: а может быть такое, что в провайдере другой атрибут используется для ссылок?
            var hrefAttrValue = this.verseLinkService.GetVerseLink(verseEntry.VersePointer);

            node.SetAttributeValue(hrefAttrName, hrefAttrValue);            
        }

        private bool NodeIsLink(IXmlNode node)
        {
            return node.NodeType == IXmlNodeType.Element && node.Name == "a";
        }

        private void InsertVerseLink(VerseInNodeEntry verseInNodeEntry, VerseEntry verseEntry)
        {
            var verseLink = documentProvider.GetVersePointerLink(verseEntry.VersePointer);

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

                            if (this.docParseContext.DocumentId.IsReadonly || parseString.IsReadonly)
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