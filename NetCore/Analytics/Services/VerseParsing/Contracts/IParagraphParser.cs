using BibleNote.Analytics.Services.DocumentProvider.Contracts;
using BibleNote.Analytics.Services.VerseParsing.Contracts.ParseContext;
using BibleNote.Analytics.Services.VerseParsing.Models.ParseResult;

namespace BibleNote.Analytics.Services.VerseParsing.Contracts
{
    public interface IParagraphParser
    {
        void Init(IDocumentProviderInfo documentProvider, IDocumentParseContext docParseContext);

        ParagraphParseResult ParseParagraph(IXmlNode node, IParagraphParseContextEditor paragraphContextEditor);
    }
}
