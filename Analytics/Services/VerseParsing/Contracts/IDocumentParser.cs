using BibleNote.Analytics.Services.DocumentProvider.Contracts;
using BibleNote.Analytics.Services.VerseParsing.Contracts.ParseContext;
using BibleNote.Analytics.Services.VerseParsing.Models;
using BibleNote.Analytics.Services.VerseParsing.Models.ParseResult;
using System;

namespace BibleNote.Analytics.Services.VerseParsing.Contracts
{
    public interface IDocumentParser: IDisposable
    {
        DocumentParseResult DocumentParseResult { get; }

        void Init(IDocumentProviderInfo documentProvider, IDocumentId documentId);                

        ParagraphParseResult ParseParagraph(IXmlNode node);

        DisposeHandler ParseHierarchyElement(ElementType paragraphType);
    }
}
