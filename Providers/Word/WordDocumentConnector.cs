using System.Threading.Tasks;
using BibleNote.Providers.Word.Contracts;
using BibleNote.Services.DocumentProvider.Contracts;

namespace BibleNote.Providers.Word
{
    public class WordDocumentConnector : IWordDocumentConnector
    {
        public async Task<IWordDocumentHandler> ConnectAsync(IDocumentId documentId)
        {
            var pageHandler = new WordDocumentHandler(documentId);
            pageHandler.LoadPageContent();
            return pageHandler;
        }
    }
}
