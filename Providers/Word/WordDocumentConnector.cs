using BibleNote.Analytics.Providers.Html.Contracts;
using BibleNote.Analytics.Services.DocumentProvider.Contracts;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Providers.Html
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
