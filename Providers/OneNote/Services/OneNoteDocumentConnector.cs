using BibleNote.Analytics.Providers.OneNote.Contracts;
using BibleNote.Analytics.Services.DocumentProvider.Contracts;
using Microsoft.Extensions.Logging;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Providers.OneNote.Services
{
    public class OneNoteDocumentConnector : IOneNoteDocumentConnector
    {
        private readonly ILogger _log;

        public OneNoteDocumentConnector(ILogger<OneNoteDocumentConnector> log)
        {
            _log = log;
        }

        public async Task<IXDocumentHandler> ConnectAsync(IDocumentId documentId)
        {
            var pageHandler = new OneNoteDocumentHandler(documentId, _log);
            await pageHandler.LoadPageContentAsync();
            return pageHandler;
        }
    }
}
