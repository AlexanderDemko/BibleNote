using BibleNote.Services.Contracts;

namespace BibleNote.Services.VerseParsing.Contracts
{
    public interface IDocumentParserFactory
    {
        IDocumentParser Create(IDocumentProviderInfo documentProvider, IDocumentId documentId);
    }
}
