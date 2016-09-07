using BibleNote.Analytics.Contracts.Providers;
using BibleNote.Analytics.Models.VerseParsing;
using HtmlAgilityPack;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Contracts.VerseParsing
{
    public interface IElementParseContext: IDisposable
    {

    }

    public interface IDocumentParser: IDisposable
    {
        void Init(IDocumentProvider documentProvider);

        DocumentParseResult DocumentParseResult { get; }

        void ParseTitle(HtmlNode node);

        IElementParseContext ParseParagraph(HtmlNode node);

        IElementParseContext ParseTable(HtmlNode node);

        IElementParseContext ParseList(HtmlNode node);

        IElementParseContext ParseListElement(HtmlNode node);
    }
}
