using BibleNote.Analytics.Contracts.Providers;
using BibleNote.Analytics.Core.Contracts;
using BibleNote.Analytics.Models.Contracts.ParseContext;
using BibleNote.Analytics.Models.VerseParsing.ParseResult;

namespace BibleNote.Analytics.Contracts.VerseParsing
{
    public interface IParagraphParser
    {
        void Init(IDocumentProviderInfo documentProvider, IDocumentParseContext docParseContext);

        ParagraphParseResult ParseParagraph(IXmlNode node, IParagraphParseContextEditor paragraphContextEditor);
    }
}
