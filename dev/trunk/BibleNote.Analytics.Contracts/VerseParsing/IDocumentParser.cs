using BibleNote.Analytics.Contracts.Providers;
using BibleNote.Analytics.Models.Common;
using BibleNote.Analytics.Models.Contracts.ParseContext;
using BibleNote.Analytics.Models.VerseParsing;
using HtmlAgilityPack;
using System;

namespace BibleNote.Analytics.Contracts.VerseParsing
{
    public interface IDocumentParser: IDisposable
    {
        DocumentParseResult DocumentParseResult { get; }

        void Init(IDocumentProviderInfo documentProvider);                

        ParagraphParseResult ParseParagraph(HtmlNode node);

        DisposeHandler ParseHierarchyElement(ElementType paragraphType);
    }
}
