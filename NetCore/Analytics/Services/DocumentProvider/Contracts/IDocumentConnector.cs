namespace BibleNote.Analytics.Services.DocumentProvider.Contracts
{
    public interface IDocumentConnector<T> where T : IDocumentHandler
    {
        T Connect(IDocumentId documentId);
    }
}