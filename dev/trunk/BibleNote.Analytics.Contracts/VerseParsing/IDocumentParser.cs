using BibleNote.Analytics.Contracts.Providers;
using HtmlAgilityPack;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Contracts.VerseParsing
{
    public interface IParseContext: IDisposable
    {

    }

    public interface IDocumentParser: IDisposable
    {
        void Init(IDocumentProvider documentProvider);
        void ParseTitle(HtmlNode node);
        IParseContext ParseParagraph(HtmlNode node);
        IParseContext ParseTable(HtmlNode node);        
    }
}
