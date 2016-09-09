using BibleNote.Analytics.Models.Common;

namespace BibleNote.Analytics.Contracts.Providers
{
    public interface IDocumentConnector<T> where T : IDocumentHandler
    {
        T Connect(IDocumentId documentId);
    }
}