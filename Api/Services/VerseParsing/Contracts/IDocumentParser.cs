using System;
using BibleNote.Services.Contracts;
using BibleNote.Services.VerseParsing.Contracts.ParseContext;
using BibleNote.Services.VerseParsing.Models;
using BibleNote.Services.VerseParsing.Models.ParseResult;

namespace BibleNote.Services.VerseParsing.Contracts
{
    public interface IDocumentParser: IDisposable
    {
        DocumentParseResult DocumentParseResult { get; }

        void Init(IDocumentProviderInfo documentProvider, IDocumentId documentId);                

        ParagraphParseResult ParseParagraph(IXmlNode node);

        DisposeHandler ParseHierarchyElement(ElementType paragraphType);
    }
}
