using BibleNote.Analytics.Services.DocumentProvider.Contracts;

namespace BibleNote.Analytics.Services.VerseParsing.Contracts
{
    public interface IDocumentParserFactory
    {
        IDocumentParser Create(IDocumentProviderInfo documentProvider);
    }
}
