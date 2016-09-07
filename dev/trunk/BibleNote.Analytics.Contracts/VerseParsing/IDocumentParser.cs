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
    public interface IDocumentParser: IDisposable
    {
        DocumentParseResult DocumentParseResult { get; }

        void Init(IDocumentProvider documentProvider);                

        ParagraphParseResult ParseParagraph(HtmlNode node);

        IElementParseHandle ParseHierarchyElement(HtmlNode node, ParagraphState paragraphState);
    }
}
