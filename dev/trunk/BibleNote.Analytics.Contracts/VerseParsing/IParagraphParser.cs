using BibleNote.Analytics.Contracts.Providers;
using BibleNote.Analytics.Models.Contracts.ParseContext;
using BibleNote.Analytics.Models.VerseParsing;
using HtmlAgilityPack;

namespace BibleNote.Analytics.Contracts.VerseParsing
{
    public interface IParagraphParser
    {
        void Init(IDocumentProviderInfo documentProvider, IDocumentParseContext docParseContext);

        ParagraphParseResult ParseParagraph(HtmlNode node);
    }
}
