using BibleNote.Analytics.Contracts.Providers;
using BibleNote.Analytics.Models.Common;
using HtmlAgilityPack;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Contracts.VerseParsing
{
    public interface IParagraphParser
    {
        void Init(IDocumentProvider documentProvider, IDocumentParseContext docParseContext);
        ParagraphParseResult ParseParagraph(HtmlNode node);        
    }
}
