using BibleNote.Analytics.Contracts.Providers;
using BibleNote.Analytics.Contracts.VerseParsing.ParseContext;
using BibleNote.Analytics.Models.Common;
using BibleNote.Analytics.Models.VerseParsing;
using HtmlAgilityPack;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Contracts.VerseParsing
{
    public interface IDocumentParser: IDisposable
    {
        DocumentParseResult DocumentParseResult { get; }

        void Init(IDocumentProviderInfo documentProvider);                

        ParagraphParseResult ParseParagraph(HtmlNode node);

        DisposeHandler ParseHierarchyElement(ParagraphState paragraphState);
    }
}
