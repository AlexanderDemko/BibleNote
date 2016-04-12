using BibleNote.Analytics.Contracts.Providers;
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
        void ParseTitle(HtmlNode node);
        IElementParseContext ParseParagraph(HtmlNode node);
        IElementParseContext ParseTable(HtmlNode node);        
    }
}
