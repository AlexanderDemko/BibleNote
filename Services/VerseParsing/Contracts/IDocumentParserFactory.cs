using BibleNote.Services.DocumentProvider.Contracts;

namespace BibleNote.Services.VerseParsing.Contracts
{
    public interface IDocumentParserFactory
    {
        IDocumentParser Create(IDocumentProviderInfo documentProvider, IDocumentId documentId);
    }
}
