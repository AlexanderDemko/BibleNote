using System.Threading.Tasks;

namespace BibleNote.Services.Contracts
{
    public interface IDocumentConnector<T> where T : IDocumentHandler
    {
        Task<T> ConnectAsync(IDocumentId documentId);
    }
}