using BibleNote.Services.Contracts;
using BibleNote.Services.VerseParsing.Contracts.ParseContext;
using BibleNote.Services.VerseParsing.Models.ParseResult;

namespace BibleNote.Services.VerseParsing.Contracts
{
    public interface IParagraphParser
    {
        void Init(IDocumentProviderInfo documentProvider, IDocumentParseContext docParseContext);

        ParagraphParseResult ParseParagraph(IXmlNode node, IParagraphParseContextEditor paragraphContextEditor);
    }
}
