using BibleNote.Analytics.Contracts.Providers;
using BibleNote.Analytics.Core.Contracts;
using BibleNote.Analytics.Models.Common;
using BibleNote.Analytics.Models.Contracts.ParseContext;
using BibleNote.Analytics.Models.VerseParsing.ParseResult;
using System;

namespace BibleNote.Analytics.Contracts.VerseParsing
{
    public interface IDocumentParser: IDisposable
    {
        DocumentParseResult DocumentParseResult { get; }

        void Init(IDocumentProviderInfo documentProvider);                

        ParagraphParseResult ParseParagraph(IXmlNode node);

        DisposeHandler ParseHierarchyElement(ElementType paragraphType);
    }
}
